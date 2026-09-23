#!/usr/bin/env node
/** FASE 2 — aplica as decisões do manifesto pela rota OFICIAL da API.
 *
 *  Não escreve SQL. Não toca no D1 direto. Não cria movimento de estoque.
 *  Tudo passa por `POST /api/historico/reclassificar`, que é onde as regras
 *  do §30 já moram — inclusive a recusa de item já decidido, que é o que
 *  torna rodar duas vezes inofensivo.
 *
 *  ┌─ por que NÃO baixa estoque ────────────────────────────────────────┐
 *  │ A FASE 1 provou, contra o dump de produção, que a importação       │
 *  │ histórica não gerou movimento nenhum: 1428 movimentos, nenhum de   │
 *  │ origem histórica, e produtos.qtd == SUM(movimentos.qtd) == 1487.   │
 *  │ As 37 peças nunca saíram por causa destas linhas. Criar baixa      │
 *  │ agora inventaria 37 unidades que ninguém tirou da gaveta.          │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 *  USO
 *    node docs/migracao-nao-venda/migrar-nao-venda.mjs --api URL --chave K
 *        (seco por padrão: mostra o que faria e sai)
 *    ... --aplicar                grava as decisões de confiança alta
 *    ... --aplicar --incluir-duvidosos    também as de média/baixa (NÃO faça
 *                                          sem decisão humana escrita)
 *    ... --desfazer               rollback: DELETE em cada item do manifesto
 *    ... --listar                 mostra o que já está gravado
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d = null) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? (process.argv[i + 1] ?? true) : d;
};
const tem = (n) => process.argv.includes(n);

const API = arg('--api', process.env.MARQUESA_API);
const CHAVE = arg('--chave', process.env.MARQUESA_API_KEY);
const USUARIO = arg('--usuario', 'migracao-nao-venda');
const MANIFESTO = arg('--manifesto', path.join(AQUI, 'manifesto-nao-venda.json'));

if (!API || !CHAVE) {
  console.error('Faltou --api <url> e --chave <API_KEY> (ou MARQUESA_API / MARQUESA_API_KEY).');
  process.exit(2);
}

const man = JSON.parse(readFileSync(MANIFESTO, 'utf8'));

async function chamar(metodo, rota, corpo) {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-api-key': CHAVE },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const txt = await r.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = { erroBruto: txt.slice(0, 400) }; }
  return { status: r.status, json };
}

/* ── o recorte: por padrão só o que o texto não deixa margem para discutir */
const duvidosos = man.itens.filter((i) => i.precisaDecisaoHumana);
const seguros = man.itens.filter((i) => !i.precisaDecisaoHumana);
const escolhidos = tem('--incluir-duvidosos') ? man.itens : seguros;

function resumir(lista) {
  const por = {};
  let pecas = 0;
  let valor = 0;
  for (const i of lista) {
    por[i.classeProposta] = (por[i.classeProposta] ?? 0) + 1;
    pecas += i.qtd ?? 0;
    if (!i.jaForaDoFaturamento) valor += Number(i.valorTotal ?? 0);
  }
  return { linhas: lista.length, por, pecas, valorLancado: +valor.toFixed(2) };
}

if (tem('--listar')) {
  const r = await chamar('GET', '/api/historico/reclassificar');
  const l = r.json?.reclassificacoes ?? [];
  console.log(`gravadas: ${l.length}`);
  for (const x of l) {
    console.log(`  #${x.id} item=${x.historico_item_id} ${x.classe_nova} `
      + `${x.status} (${x.confianca}) ${x.decidido_em ?? ''}`);
  }
  process.exit(0);
}

if (tem('--desfazer')) {
  if (!tem('--confirmo')) {
    console.log('Rollback de %d itens. Repita com --confirmo.', man.itens.length);
    process.exit(0);
  }
  let ok = 0; let faltou = 0;
  for (const i of man.itens) {
    const r = await chamar('DELETE', `/api/historico/reclassificar/${i.historicoItemId}`);
    if (r.status === 200) ok++;
    else { faltou++; console.log(`  item ${i.historicoItemId}: ${r.status} ${JSON.stringify(r.json)}`); }
  }
  console.log(`\ndesfeitas: ${ok} · não encontradas: ${faltou}`);
  console.log('estoque: NÃO alterado (nenhuma peça volta — nenhuma saiu por causa destas linhas)');
  process.exit(0);
}

console.log('manifesto:', MANIFESTO);
console.log('itens no manifesto :', JSON.stringify(resumir(man.itens)));
console.log('vão ser aplicados  :', JSON.stringify(resumir(escolhidos)));
console.log('faturamento que sai: R$', man.faturamento_que_sai);
if (duvidosos.length && !tem('--incluir-duvidosos')) {
  console.log(`\nFICAM DE FORA (${duvidosos.length}) — precisam de decisão humana:`);
  for (const i of duvidosos) {
    console.log(`  h#${i.historicoItemId} ${i.data} ${i.clienteNome} R$ ${i.valorTotal} `
      + `— ${i.precisaDecisaoHumana}`);
    console.log(`      obs original: "${i.observacao}"`);
  }
}

if (!tem('--aplicar')) {
  console.log('\nSECO. Nada foi escrito. Repita com --aplicar para gravar.');
  process.exit(0);
}

/* Antes de escrever, prova que o alvo é o que se pensa que é. */
const antes = await chamar('GET', '/api/historico/reclassificar');
const jaGravadas = (antes.json?.reclassificacoes ?? []).length;
console.log(`\ndecisões já gravadas no destino: ${jaGravadas}`);

const decisoes = escolhidos.map((i) => ({
  historicoItemId: i.historicoItemId,
  classe: i.classeProposta,
  decisao: 'aplicar',
  confianca: i.confianca,
  motivo: `${i.motivo} [migração histórica ${man.hash_manifesto ?? ''}]`,
}));

const r = await chamar('POST', '/api/historico/reclassificar', { decisoes, usuario: USUARIO });
console.log('\nHTTP', r.status);
console.log(JSON.stringify(r.json, null, 2));

/* 207 com problemas "já decidida" é o resultado ESPERADO da segunda rodada:
   é a idempotência funcionando, não uma falha. */
const problemas = r.json?.problemas ?? [];
const soJaDecididas = problemas.length > 0
  && problemas.every((p) => String(p.erro ?? '').includes('já decidida'));
if (soJaDecididas) {
  console.log('\nTodos os problemas são "já decidida" — rodada repetida, nada mudou. OK.');
}
console.log('\nestoque alterado:', r.json?.impacto?.estoqueAlterado ?? '(campo ausente)');
console.log('linhas apagadas :', r.json?.impacto?.linhasApagadas ?? '(campo ausente)');
console.log('\nAgora rode docs/migracao-nao-venda/conferencia.sql e compare com o ANTES.');
