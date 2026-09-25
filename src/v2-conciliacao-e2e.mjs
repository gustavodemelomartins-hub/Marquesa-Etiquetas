/* A CONCILIAÇÃO CONTRA O BANCO DE VERDADE.
 *
 *      MQ_KEY=<chave do staging-v2> node src/v2-conciliacao-e2e.mjs
 *
 *  `src/inventario-conciliacao-test.mjs` prova a regra contra o schema em
 *  memória. `src/v2-conciliacao-ui.mjs` prova a tela publicada. Falta o
 *  meio: o Worker publicado, o D1 publicado, e a razão de verdade.
 *
 *  ┌─ O QUE ELE ESCREVE, e o que devolve ───────────────────────────────┐
 *  │ Abre UM inventário no staging-v2, conta duas peças, DECLARA a       │
 *  │ contagem completa e resolve UMA diferença com motivo — o que cria   │
 *  │ um movimento de verdade. No fim ESTORNA essa resolução, que devolve │
 *  │ a peça ao estoque.                                                  │
 *  │                                                                     │
 *  │ Resíduo: um inventário concluído, que não se desfaz (concluir       │
 *  │ congela o retrato, e não existe "desconcluir" — de propósito). A    │
 *  │ RAZÃO volta exatamente como estava, e isso é conferido no fim.      │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  Alvo: staging-v2, e só ele. O endereço está fixo abaixo e o roteiro
 *  recusa rodar contra qualquer outro — um `MQ_API` apontando para
 *  produção abriria um inventário na loja da Sthefany.
 */
const API = 'https://marquesa-api-staging-v2.marquesaasemijoias.workers.dev';
const KEY = process.env.MQ_KEY;

if (!KEY) {
  console.error('Falta MQ_KEY. Este roteiro escreve no staging e não roda às cegas.');
  process.exit(2);
}

let falhas = 0;
const prova = (ok, texto) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
  if (!ok) { falhas += 1; process.exitCode = 1; }
};

async function api(caminho, metodo = 'GET', corpo) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(corpo ? { 'content-type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  let dados;
  try { dados = JSON.parse(texto); } catch { dados = { erro: texto.slice(0, 200) }; }
  return { status: r.status, dados };
}

const razaoFecha = async () => {
  const { dados } = await api('/api/estoque/conferir');
  return Array.isArray(dados.divergentes) && dados.divergentes.length === 0;
};

/* ── 0. o estado de partida. */
prova(await razaoFecha(), 'a razão do staging fecha ANTES de qualquer coisa');

const abertos = (await api('/api/inventarios')).dados
  .filter((i) => i.status === 'aberto' || i.status === 'pausado');
if (abertos.length) {
  console.error(`Já existe inventário em andamento (#${abertos[0].id}). `
    + 'Este roteiro não passa por cima do trabalho de ninguém.');
  process.exit(2);
}

const aberto = await api('/api/inventarios', 'POST', {});
prova(aberto.status === 201, `abriu o inventário #${aberto.dados.id}`);
const ID = aberto.dados.id;

/* ── 1. escolher duas peças CONTÁVEIS e sem variação cadastrada.
   As com variação exigem dizer qual (D4), e o que se prova aqui é a
   declaração — não a régua de variações, que já tem teste próprio. */
const detalhe = (await api(`/api/inventarios/${ID}`)).dados;
const candidatos = detalhe.esperados.filter((e) => e.esperado > 0);
prova(candidatos.length > 5, `o staging tem ${candidatos.length} códigos contáveis`);

const escolhidos = [];
for (const c of candidatos) {
  if (escolhidos.length === 2) break;
  /* Conta o esperado INTEIRO no primeiro e um a MENOS no segundo: o
     primeiro bate, o segundo vira falta parcial. */
  const alvo = escolhidos.length === 0 ? c.esperado : c.esperado - 1;
  if (alvo < 0) continue;
  const r = await api(`/api/inventarios/${ID}/itens`, 'POST', { sku: c.sku, contado: alvo });
  /* 409 com `variacoes` é o servidor se recusando a chutar o aro. Resposta
     legítima: seguimos para o próximo código. */
  if (r.status === 409) continue;
  if (r.status !== 200) {
    console.error(`  (${c.sku} recusado: ${r.dados.erro})`);
    continue;
  }
  escolhidos.push({ ...c, contado: alvo });
}
prova(escolhidos.length === 2, 'contou duas peças de verdade, pela rota de produção');

const naoContados = candidatos.length - 2;
prova(naoContados > 0, `sobraram ${naoContados} códigos sem bipe — o caso que interessa`);

/* ── 2. encerrar SEM declarar seria o comportamento de sempre. Aqui a
   declaração é explícita, e é ela que se está provando. */
const concluido = await api(`/api/inventarios/${ID}/concluir`, 'POST', { contagemCompleta: true });
prova(concluido.status === 200, 'concluiu declarando a contagem completa');
prova(concluido.dados.contagemCompleta === true,
  'o relatório devolve a declaração, e não a esquece no caminho');

/* ── 3. o que a declaração fez com quem ninguém bipou. */
const rel = (await api(`/api/inventarios/${ID}/resultado`)).dados;

const bateu = rel.conferidosItens.find((l) => l.sku === escolhidos[0].sku);
prova(!!bateu, 'a peça que bateu entrou no resumo, e não pede decisão nenhuma');

const parcial = rel.faltando.find((l) => l.sku === escolhidos[1].sku);
prova(parcial && parcial.dif === -1,
  'a falta parcial resolve UMA unidade, não o saldo inteiro');
prova(parcial && parcial.declarado === false,
  'a falta bipada NÃO é marcada como declarada');

const declaradas = rel.faltando.filter((l) => l.declarado);
prova(declaradas.length > 0,
  `${declaradas.length} códigos que ninguém bipou viraram diferença candidata`);
prova(declaradas.every((l) => l.contado === 0 && l.dif === -l.esperado),
  'cada falta declarada é exatamente o que o sistema dizia ter');
prova(declaradas.every((l) => !!l.motivo),
  'e cada uma explica que o zero veio da declaração, não de um bipe');

prova(Array.isArray(rel.motivos) && rel.motivos.length >= 6,
  'o servidor manda a lista de motivos junto com o retrato');
prova(rel.conciliacao.pendentes === rel.conciliacao.divergencias
  && rel.conciliacao.resolvidas === 0 && rel.conciliacao.conciliado === false,
  'a conciliação começa com tudo pendente');

/* A DECLARAÇÃO NÃO MOVIMENTA. É o ponto mais importante do roteiro. */
prova(await razaoFecha(), 'a razão continua fechada depois de declarar — nada foi movimentado');

/* ── 4. resolver UMA diferença, com motivo, e ver o motivo chegar. */
const semMotivo = await api(`/api/inventarios/${ID}/aplicar`, 'POST', {
  itens: [{ sku: parcial.sku }],
});
prova(semMotivo.status === 409, 'aplicar sem motivo é recusado pelo servidor publicado');
prova(Array.isArray(semMotivo.dados.motivos),
  'e a recusa traz a lista de motivos dentro dela');

const aplicado = await api(`/api/inventarios/${ID}/aplicar`, 'POST', {
  itens: [{ sku: parcial.sku, motivo: 'Não encontrada na casa' }],
});
prova(aplicado.status === 200 && aplicado.dados.ok,
  `resolveu a diferença de ${parcial.sku} com motivo`);
prova(aplicado.dados.aplicados[0].motivo === 'Não encontrada na casa',
  'o motivo escolhido é o que ficou gravado na saída');
prova(await razaoFecha(), 'a razão fecha depois de aplicar a diferença');

const saidaId = aplicado.dados.aplicados[0].saidaId;
const relDepois = (await api(`/api/inventarios/${ID}/resultado`)).dados;
prova(relDepois.conciliacao.resolvidas === 1,
  'a conciliação andou: 1 resolvida');
prova(relDepois.faltando.find((l) => l.sku === parcial.sku)?.motivoAplicado
  === 'Não encontrada na casa',
  'e o retrato relido sabe COM QUE motivo ela foi resolvida');

/* O motivo no HISTÓRICO da peça — a razão, que é onde ele precisa estar. */
const hist = (await api(`/api/estoque/${encodeURIComponent(parcial.sku)}/movimentos`)).dados;
const linhas = JSON.stringify(hist);
prova(/Não encontrada na casa/.test(linhas),
  'o motivo aparece no histórico da peça');
prova(new RegExp(`inventário #${ID}`).test(linhas),
  'e o histórico diz de qual inventário a diferença nasceu');

/* ── 5. devolver o staging ao estado anterior. */
const estorno = await api(`/api/saidas/${saidaId}/estornar`, 'POST', {
  motivo: 'roteiro de validação — devolvendo a peça',
});
prova(estorno.status === 200 && estorno.dados.ok, 'estornou a resolução');
prova(await razaoFecha(), 'a razão fecha depois do estorno');

const relFinal = (await api(`/api/inventarios/${ID}/resultado`)).dados;
prova(relFinal.conciliacao.resolvidas === 0,
  'e a divergência volta a PENDENTE — o estorno desfaz a resolução');

console.log(falhas
  ? `\n${falhas} falha(s) contra o staging-v2.`
  : `\nConciliação provada contra o D1 publicado. Resíduo: o inventário #${ID}, `
    + 'concluído e com as diferenças em aberto. A razão voltou como estava.');
