/** REVISÃO OPERACIONAL 1 — cenário T e o freio da maleta.
 *
 *  O defeito: "REVISAR VARIAÇÃO — há peças deste código em maleta aberta, e
 *  a maleta ainda não sabe qual variação saiu" era um beco sem saída. O
 *  código ficava fora da sincronização para sempre, porque a única coisa que
 *  destravaria — dizer qual aro está na maleta — não tinha onde ser dita.
 *
 *  O que fica provado aqui:
 *
 *   1. peça em maleta aberta trava a sincronização daquele código, e continua
 *      travando enquanto ninguém disser qual variação saiu (é o freio certo:
 *      escrever ali colocaria a variação errada à venda);
 *   2. dizer qual variação está na maleta destrava — e NÃO movimenta estoque;
 *   3. a reconciliação READ-ONLY classifica os três casos e não escreve em
 *      lugar nenhum, nem no banco, nem na loja (cenário T).
 *
 *      api/dev-local.sh && node src/pos-golive-1-variacoes-test.mjs
 */
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const verdade = (t, x, x2 = '') => (x ? ok(t, x2) : bad(t, x2));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const prod = async (sku) => ((await api('GET', '/api/state')).corpo.produtos ?? [])
  .find((p) => p.sku === sku);
const razaoFecha = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  const d = r.corpo?.divergentes ?? [];
  return Array.isArray(d) && d.length === 0;
};

const loja = await subirLojaFalsa();

console.log('\n=== 0. catálogo e loja de mentira ===');
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'ARO647729', desc: 'Anel Solitário Coroa Cravejado Cristal', cat: 'Anel', preco: 109, qtd: 6 },
    { sku: 'SEMVAR', desc: 'Colar simples, sem variação', cat: 'Colar', preco: 80, qtd: 4 },
  ],
});
loja.estado.produtos = [
  {
    id: 90,
    name: { pt: 'Anel Solitário Coroa' },
    handle: { pt: 'anel-coroa' },
    published: true,
    attributes: [{ pt: 'Aro' }],
    variants: [
      { id: 901, sku: 'ARO647729', values: [{ pt: '16' }], inventory_levels: [{ location_id: 'L1', stock: 3 }] },
      { id: 902, sku: 'ARO647729', values: [{ pt: '18' }], inventory_levels: [{ location_id: 'L1', stock: 3 }] },
    ],
  },
  produtoFalso(91, [{ id: 911, sku: 'SEMVAR', estoque: 4 }]),
];

let r = await api('POST', '/api/sync', { forcar: true });
eq('a sincronização rodou', r.status, 200);
const anel = await prod('ARO647729');
eq('o anel ganhou as duas variações da loja', (anel.variacoes || []).length, 2);
eq('e o estoque foi repartido pela própria loja',
  (anel.variacoes || []).map((v) => `${v.nome}:${v.qtd}`).join(' '), '16:3 18:3');
verdade('a razão fecha', await razaoFecha());

/* ═════════════════════════════════════════════════════════ 1. o freio */
console.log('\n=== 1. peça em maleta aberta trava o código ===');
{
  const rev = await api('POST', '/api/revendedoras', { nome: 'Revendedora T' });
  const revId = rev.corpo.id;
  const mal = await api('POST', '/api/maletas', { revId, abertaEm: '2026-09-01' });
  const maletaId = mal.corpo.id;
  const mi = await api('POST', `/api/maletas/${maletaId}/itens`, { itens: { ARO647729: 2 } });
  eq('2 peças foram para a maleta', mi.status, 200);
  verdade('e a razão continua fechando — consignação não é venda', await razaoFecha());

  const rec = await api('GET', '/api/variacoes/reconciliacao');
  eq('a reconciliação responde', rec.status, 200);
  eq('e declara que é só leitura', rec.corpo.somenteLeitura, 'true');
  const pend = (rec.corpo.pendenteHumano ?? []).find((x) => x.sku === 'ARO647729');
  verdade('o código está em PENDENTE_HUMANO', !!pend,
    pend ? pend.motivo : JSON.stringify(rec.corpo.resumo));
  eq('pelo motivo da maleta', pend && pend.motivo, 'maleta');
  verdade('e a recusa diz quanto falta identificar',
    pend && pend.detalhe && pend.detalhe.faltaIdentificar === 2,
    JSON.stringify(pend && pend.detalhe));
  verdade('o caminho para resolver vem escrito',
    pend && /Central/.test(pend.caminho || ''), pend && pend.caminho);

  /* a sincronização também não escreve este código */
  const seco = await api('POST', '/api/sync', { seco: true });
  const barrado = (seco.corpo?.empurrar?.revisao ?? seco.corpo?.semEmpurrar ?? [])
    .some?.((x) => x.sku === 'ARO647729');
  verdade('a rodada seca também deixa o código de fora',
    barrado !== false, String(barrado));

  /* ─── 2. dizer qual variação está na maleta destrava */
  console.log('\n=== 2. dizer qual variação está na maleta destrava ===');
  const antes = (await prod('ARO647729')).qtd;
  const rm = await api('POST', '/api/pendencias/variacao/maleta', {
    maletaId, sku: 'ARO647729',
    distribuicao: [{ variacao: '16', qtd: 1 }, { variacao: '18', qtd: 1 }],
  });
  eq('a distribuição foi aceita', rm.status, 200);
  eq('e não movimentou estoque', rm.corpo.estoqueMovimentado, 'false');
  eq('o total do código não mudou', (await prod('ARO647729')).qtd, antes);
  verdade('a razão continua fechando', await razaoFecha());

  const rec2 = await api('GET', '/api/variacoes/reconciliacao');
  const aindaPendente = (rec2.corpo.pendenteHumano ?? []).some((x) => x.sku === 'ARO647729');
  verdade('o código saiu de PENDENTE_HUMANO', !aindaPendente,
    JSON.stringify(rec2.corpo.resumo));
  const agora = [...(rec2.corpo.resolvidos ?? []), ...(rec2.corpo.divergenciaReal ?? [])]
    .find((x) => x.sku === 'ARO647729');
  verdade('e passou a ser RESOLVIDO ou DIVERGENCIA_REAL', !!agora, agora && agora.classe);

  const rev2 = await api('GET', '/api/variacoes/revisao');
  const naRevisao = (rev2.corpo.itens ?? []).some((x) => x.sku === 'ARO647729');
  verdade('a lista de revisão de variações também o liberou', !naRevisao);
}

/* ══════════════════════════════════════════════ 3. CENÁRIO T: read-only */
console.log('\n=== 3. cenário T: a reconciliação não escreve em lugar nenhum ===');
{
  const estoqueLojaAntes = JSON.stringify(loja.estado.produtos);
  const stAntes = await api('GET', '/api/state');
  const movAntes = await api('GET', '/api/produtos/ARO647729/movimentos');

  const rec = await api('GET', '/api/variacoes/reconciliacao');
  eq('rodou', rec.status, 200);
  verdade('as três classes existem na resposta',
    ['resolvidos', 'pendenteHumano', 'divergenciaReal'].every((k) => Array.isArray(rec.corpo[k])));
  verdade('e a regra vem junto do número', /Leitura pura/.test(rec.corpo.regra || ''));

  eq('a loja não foi tocada', JSON.stringify(loja.estado.produtos), estoqueLojaAntes);
  const stDepois = await api('GET', '/api/state');
  eq('nenhum saldo mudou',
    JSON.stringify((stDepois.corpo.produtos ?? []).map((p) => [p.sku, p.qtd])),
    JSON.stringify((stAntes.corpo.produtos ?? []).map((p) => [p.sku, p.qtd])));
  const movDepois = await api('GET', '/api/produtos/ARO647729/movimentos');
  eq('e nenhum movimento novo entrou',
    (movDepois.corpo?.movimentos ?? []).length, (movAntes.corpo?.movimentos ?? []).length);
  verdade('a razão fecha no fim de tudo', await razaoFecha());
}

await loja.parar?.();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
