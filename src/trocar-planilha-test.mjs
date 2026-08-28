/** Trocar a planilha do histórico por uma corrigida.
 *
 *  O defeito que este teste existe para impedir:
 *
 *    A dona do negócio corrigiu sobrenomes na planilha de vendas — a mesma
 *    cliente aparecia como "Cynthia Noronha" e "Cynthia Nogueira" — e
 *    perguntou se dava para "subir de novo". Com a importação sozinha,
 *    subir de novo SOMA: a trava de idempotência é o hash do arquivo, e
 *    arquivo corrigido tem hash novo. O painel passaria a mostrar o dobro
 *    do faturamento, sem nenhum erro na tela.
 *
 *  O que precisa ficar provado:
 *
 *   1. trocar NÃO duplica: linhas, vendas, peças e faturamento ficam nos
 *      números da planilha NOVA, não na soma das duas;
 *   2. o lote antigo fica marcado como revertido, e só um lote fica de pé;
 *   3. a resposta traz o antes, o depois e o delta — o operador vê o que a
 *      troca fez, não só o resultado;
 *   4. cliente com dado digitado à mão (telefone, CPF, cidade) SOBREVIVE à
 *      troca. A linha da planilha volta na importação; o telefone não volta
 *      de lugar nenhum;
 *   5. subir a MESMA planilha que já está no ar é recusado antes de
 *      reverter qualquer coisa — o histórico não é derrubado para ser
 *      recolocado igual;
 *   6. arquivo ilegível para na análise, com o histórico antigo intacto;
 *   7. o ESTOQUE não é tocado em nenhum momento — nem na reversão, nem na
 *      importação. É a regra absoluta do projeto.
 *
 *  Roda contra o Worker local, com a planilha real quando ela está
 *  disponível em `src/__dados__/vendas-historico.json`; senão, contra uma
 *  amostra embutida que reproduz a mesma forma.
 *
 *      api/dev-local.sh && node src/trocar-planilha-test.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

/* ------------------------------------------------------------------ dados */

const CABECALHO = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];

const AMOSTRA = [
  CABECALHO,
  [1, '2026-06-13T00:00:00', 'Cynthia Noronha', 787123, 'Brinco Pétalas', 'Banhadas', 1, 89, null, 89, 'Pix', 'PAGO', 'Maleta'],
  [2, '2026-06-13T00:00:00', 'Cynthia Nogueira', 632066, 'Colar Pérola', 'Banhadas', 1, 59, null, 59, 'Pix', 'PAGO', 'Maleta'],
  [3, '2026-05-02T00:00:00', 'Thais Nania', 420492, 'Argola Coração', 'Prata 925', 2, 75, null, 150, 'Pix', 'PAGO', 'Maleta'],
  [4, '2026-04-11T00:00:00', 'Angela Alves', 757767, 'Pulseira Elos', 'Bruto', 1, 64, null, 64, 'Pix', 'PAGO', 'Site'],
];

const CAMINHO_REAL = new URL('./__dados__/vendas-historico.json', import.meta.url).pathname;
const CAMINHO_TMP = process.env.PLANILHA_JSON;

function carregar() {
  for (const c of [CAMINHO_TMP, CAMINHO_REAL]) {
    if (c && existsSync(c)) {
      const l = JSON.parse(readFileSync(c, 'utf8'));
      if (Array.isArray(l) && l.length > 1) return { linhas: l, real: true };
    }
  }
  return { linhas: AMOSTRA, real: false };
}

const { linhas: ORIGINAL, real } = carregar();
console.log(`\nplanilha: ${real ? 'a real' : 'amostra embutida'} · ${ORIGINAL.length - 1} linhas\n`);

/** A "correção" que a dona do negócio faria: unificar o sobrenome de uma
 *  cliente. Muda o conteúdo — logo o hash — sem mexer em nenhum valor. */
function corrigida(linhas) {
  const nomes = linhas.slice(1).map((l) => String(l[2] ?? '').trim()).filter(Boolean);
  const alvo = nomes.find((n) => /nogueira/i.test(n))
    ?? [...new Set(nomes)].sort((a, b) => nomes.filter((x) => x === b).length - nomes.filter((x) => x === a).length)[1]
    ?? nomes[0];
  const substituto = `${String(alvo).split(' ')[0]} Corrigida`;
  const nova = linhas.map((l, i) => (i === 0 ? l
    : (String(l[2] ?? '').trim() === alvo ? l.map((c, j) => (j === 2 ? substituto : c)) : l)));
  return { linhas: nova, alvo, substituto };
}

/* ------------------------------------------------------------- o cenário */

const estoqueAntes = await api('GET', '/api/estoque/conferir');

console.log('=== 1. a planilha original entra ===');
const um = await api('POST', '/api/vendas/historico/importar',
  { linhas: ORIGINAL, arquivo: 'Vendas Marquesa.xlsx' });
eq('importou', um.status, 201);
const loteUm = um.corpo?.loteId;

const r0 = await api('GET', '/api/vendas/historico/retrato');
eq('o retrato responde', r0.status, 200);
const antes = r0.corpo;
ok('linhas no ar', String(antes.linhas));
ok('vendas no ar', String(antes.vendas));
ok('faturamento no ar', String(antes.faturamento));
eq('um lote de pé', antes.lotes.length, 1);

console.log('\n=== 2. uma cliente ganha telefone e CPF, digitados à mão ===');
/* Ela precisa ter vindo da PLANILHA — é o caso perigoso: cliente de origem
   'historico' é exatamente quem a reversão apaga. */
const busca = await api('GET', `/api/clientes?busca=${encodeURIComponent(String(ORIGINAL[1][2]).split(' ')[0])}`);
const cli = (busca.corpo || [])[0];
eq('achei uma cliente criada pela importação', !!cli, 'true');
const pat = await api('PATCH', `/api/clientes/${cli.id}`,
  { tel: '11987654321', cpf: '12345678909', cidade: 'Curitiba' });
eq('gravei o contato dela', pat.status, 200);

console.log('\n=== 3. subir a MESMA planilha é recusado antes de derrubar nada ===');
const igual = await api('POST', '/api/vendas/historico/substituir',
  { linhas: ORIGINAL, arquivo: 'Vendas Marquesa.xlsx' });
eq('recusou', igual.status, 409);
eq('e disse por quê', /JÁ é a que está no ar/i.test(igual.corpo?.erro || ''), 'true');
eq('parou na análise', igual.corpo?.etapa, 'analise');
const conferindo = await api('GET', '/api/vendas/historico/retrato');
eq('o histórico continua de pé', conferindo.corpo.vendas, antes.vendas);

console.log('\n=== 4. arquivo ilegível também para antes de reverter ===');
const lixo = await api('POST', '/api/vendas/historico/substituir',
  { linhas: [['coluna', 'que', 'não', 'existe'], [1, 2, 3, 4]], arquivo: 'errado.xlsx' });
eq('recusou', lixo.status, 409);
eq('parou na análise', lixo.corpo?.etapa, 'analise');
const conferindo2 = await api('GET', '/api/vendas/historico/retrato');
eq('e o histórico continua intacto', conferindo2.corpo.vendas, antes.vendas);

console.log('\n=== 5. a troca de verdade ===');
const { linhas: NOVA, alvo, substituto } = corrigida(ORIGINAL);
ok('corrigindo', `"${alvo}" → "${substituto}"`);
const troca = await api('POST', '/api/vendas/historico/substituir',
  { linhas: NOVA, arquivo: 'Vendas Marquesa (corrigida).xlsx' });
eq('trocou', troca.status, 200);
const t = troca.corpo;

eq('o lote antigo foi revertido', t.revertidos?.[0]?.id, loteUm);
eq('e um lote novo entrou', t.loteId !== loteUm, 'true');

console.log('\n=== 6. NÃO duplicou ===');
const depois = t.depois;
eq('linhas continuam as da planilha, não o dobro', depois.linhas, ORIGINAL.length - 1);
eq('vendas idem', depois.vendas, antes.vendas);
eq('peças idem', depois.pecas, antes.pecas);
eq('faturamento idem', depois.faturamento, antes.faturamento);
eq('o delta de linhas é zero', t.delta.linhas, 0);
eq('e o de faturamento também', t.delta.faturamento, 0);

const lotes = await api('GET', '/api/vendas/historico/lotes');
const dePe = (lotes.corpo.lotes || []).filter((l) => l.status === 'importado');
eq('só um lote continua de pé', dePe.length, 1);
eq('e é o novo', dePe[0].id, t.loteId);

console.log('\n=== 7. o cadastro digitado à mão sobreviveu ===');
const perfil = await api('GET', `/api/clientes/perfil?id=${cli.id}`);
eq('a cliente continua existindo', perfil.status, 200);
eq('com o telefone', perfil.corpo?.cadastro?.tel, '11987654321');
eq('com o CPF', perfil.corpo?.cadastro?.cpf, '12345678909');
eq('e com a cidade', perfil.corpo?.cadastro?.cidade, 'Curitiba');

console.log('\n=== 8. o estoque nunca foi tocado ===');
const estoqueDepois = await api('GET', '/api/estoque/conferir');
eq('a razão continua fechando', JSON.stringify(estoqueDepois.corpo),
  JSON.stringify(estoqueAntes.corpo));

const mov = await api('GET', '/api/analytics/painel?periodo=tudo');
eq('o painel responde depois da troca', mov.status, 200);
eq('e mostra as vendas da planilha nova', mov.corpo?.geral?.vendas > 0, 'true');

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
