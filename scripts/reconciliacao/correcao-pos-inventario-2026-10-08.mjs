#!/usr/bin/env node
/** Correção pós-inventário da Sthefany — 08/10/2026 (REGRAS §60).
 *
 *  O inventário #1 (id 13) conferiu 821 códigos. Em 21 deles o "em casa"
 *  do sistema estava acima do físico; ela tirou esses códigos da contagem
 *  ("limpar") e mandou, código a código, o que aconteceu com cada peça.
 *  A investigação em PROD (export de 08/10/2026, bookmark
 *  00000232-00000000-000050fe-ae85c6156ab7d4eea3a3dfb50be3273e) achou, para
 *  cada um, o evento que explica a diferença — e NENHUM precisou ser criado:
 *
 *   · venda do histórico (planilha "Vendas Marquesa") ou brinde já
 *     registrado em Saídas sem faturamento, que por desenho NÃO movimentam
 *     estoque (§21, §36.3) e ficaram fora do saldo (motivo "Saiu sem
 *     lançamento");
 *   · ou, quando a venda dita por ela JÁ tinha baixado estoque (138909,
 *     198939, 307721), o saldo do go-live de 26/09 acima do físico (motivo
 *     "Erro do sistema / contagem anterior").
 *
 *  Nada de venda, brinde, cliente ou faturamento novo. O caminho é o do
 *  próprio inventário, pelas rotas reais do Worker, como a tela faria:
 *
 *    1. retomar o #1 (estava pausado);
 *    2. `definir` a quantidade em casa confirmada por ela nos 21 códigos
 *       (leituraId fixo por código: reenviar não soma — idempotente);
 *    3. balanço: confere que as diferenças são EXATAMENTE as esperadas;
 *    4. concluir (o "Finalizar");
 *    5. aplicar cada diferença com motivo e a observação
 *       "Correção pós-inventário Sthefany — 08/10/2026 · …". `inventario_ajustes`
 *       tem chave primária: a mesma linha nunca é aplicada duas vezes.
 *
 *  Roda contra um Worker LOCAL sobre uma CÓPIA do banco; o resultado chega
 *  a PROD pelo `diferenca-sql.mjs` (precondição + marca de idempotência).
 *
 *    node scripts/reconciliacao/correcao-pos-inventario-2026-10-08.mjs <url-do-worker> <chave> [--so-conferir]
 */
const [base, chave, opcao] = process.argv.slice(2);
if (!base || !chave) { console.error('uso: correcao-pos-inventario-2026-10-08.mjs <url> <chave> [--so-conferir]'); process.exit(2); }
const ID = 13;
const OBS = 'Correção pós-inventário Sthefany — 08/10/2026';
const SAIU = { motivoId: 'saiu_sem_lancar', motivo: 'Saiu sem lançamento' };
const SISTEMA = { motivoId: 'erro_de_contagem', motivo: 'Erro do sistema / contagem anterior' };

/* [sku, em casa confirmado, com revendedora confirmado, diferença esperada, motivo, o que explica] */
export const CORRECOES = [
  ['129561', 0, 1, -1, SAIU, 'brinde Dia das Mães 08/05/2026 (saída sem faturamento #13) e venda Gislene Marques 19/09/2026 (histórico) já registrados; 1 un. nunca baixou estoque'],
  ['562583', 0, 1, -1, SAIU, 'venda Elizama Meira 19/09/2026 (histórico) sem baixa de estoque'],
  ['138909', 3, 1, -1, SISTEMA, 'venda Graciele Marques 23/02/2026 já baixada (mov. 2851); o saldo do go-live de 26/09 ficou 1 acima do físico'],
  ['170308', 1, 1, -3, SAIU, 'vendas Maiara Silva 26/06, Bruna Moreno 17/07 e Nayara Vicente 18/09/2026 (histórico) sem baixa de estoque'],
  ['101665', 1, 1, -1, SAIU, 'venda Elizama Meira 19/09/2026 (histórico) sem baixa de estoque'],
  ['129437', 2, 1, -1, SAIU, 'venda Vanesça Caciano 10/04/2026 (histórico) sem baixa de estoque'],
  ['834925', 0, 1, -1, SAIU, 'vendas Bruna Sousa 09/05 e Kamila Pereira 18/09/2026 (histórico); 1 un. nunca baixou estoque'],
  ['420935', 2, 1, -1, SAIU, 'venda Tatiane Chaves 28/08/2026 (histórico) sem baixa de estoque'],
  ['198939', 3, 1, -1, SISTEMA, 'venda pela revendedora Evelyn Veiga já baixada no acerto da maleta (mov. 2776, 19/09/2026); o saldo do go-live de 26/09 ficou 1 acima do físico'],
  ['241194', 2, 1, -1, SAIU, 'venda Thais Nania 10/03/2026 (histórico) sem baixa de estoque'],
  ['310231', 7, 1, -1, SAIU, 'venda Kamila Pereira 11/07/2026 (histórico) sem baixa de estoque'],
  ['474759', 1, 1, -1, SAIU, 'venda Marcia Andrade 09/11/2025 (histórico) sem baixa de estoque'],
  ['997619', 5, 1, -1, SAIU, 'vendas Camila Bento 03/04 e Gislene Marques 12/05/2026 (histórico); 1 un. nunca baixou estoque'],
  ['504452', 5, 1, -1, SAIU, 'vendas Gislene Marques 19/04, Julia Carolina 16/07, Jessica Scavone 28/07 e Angelica Cardoso 14/08/2026 (histórico); 1 un. nunca baixou estoque'],
  ['307721', 3, 1, -1, SISTEMA, 'venda Kamila Pereira 25/09/2026 já baixada (venda 24); o saldo do go-live de 26/09 ficou 1 acima do físico'],
  ['377105', 1, 1, -1, SAIU, 'brinde "Presente Geisa" entregue a Sthefany Marques 24/12/2025 (saída sem faturamento #15, brinde — não venda) nunca baixou estoque'],
  ['408629', 2, 1, -1, SAIU, 'venda Paloma Almeida 31/07/2026 (histórico) sem baixa de estoque'],
  ['365363', 2, 1, -1, SAIU, 'vendas Thalita Barreto 09/05/2025 e Bruna Alves 18/10/2025 (histórico); 1 un. nunca baixou estoque'],
  ['446425', 1, 1, -1, SAIU, 'venda Elizama Meira 19/09/2026 (histórico) sem baixa de estoque'],
  ['684750', 2, 1, -1, SAIU, 'venda Kamila Pereira 11/03/2026 (histórico) sem baixa de estoque'],
  ['376470', 2, 2, -2, SAIU, 'venda Thalita Barreto 09/05/2025 (histórico) sem baixa de estoque; mais 1 un. do saldo do go-live de 26/09 acima do físico'],
];
/* A única outra diferença do #1: ela procurou e não achou (gesto "nenhuma", 07/10/2026). */
const NAO_ENCONTRADA = ['124111', 0, 0, -1, { motivoId: 'nao_encontrada', motivo: 'Não encontrada na casa' },
  'conferida como "nenhuma" no inventário em 07/10/2026'];

const H = { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
async function api(metodo, caminho, corpo) {
  const r = await fetch(base + caminho, { method: metodo, headers: H, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, corpo: j };
}
class Parou extends Error {}
const falha = (m) => { throw new Parou(m); };
process.on('uncaughtException', (e) => { console.error(e instanceof Parou ? 'PAROU: ' + e.message : e); process.exitCode = 1; });

const inv = (await api('GET', `/api/inventarios/${ID}`)).corpo;
if (!inv || !['aberto', 'pausado'].includes(inv.status)) falha(`inventário ${ID} não está aberto (${inv?.status})`);
const esp = new Map((inv.esperados ?? []).map((e) => [e.sku, e]));
for (const [sku, casa, rev, dif] of CORRECOES) {
  const e = esp.get(sku);
  if (!e) falha(`${sku} fora do inventário`);
  if (Number(e.consignado) !== rev) falha(`${sku}: com revendedora ${e.consignado}, ela confirmou ${rev}`);
  if (Number(e.esperado) - casa !== -dif) falha(`${sku}: em casa ${e.esperado}, ela confirmou ${casa} (diferença ${-dif} esperada)`);
}
console.log(`ok   21 códigos: com revendedora e em casa batem com o que a investigação esperava`);
if (opcao === '--so-conferir') throw Object.assign(new Parou('só conferência — nada foi escrito'), {});

if (inv.pausadoEm) {
  const r = await api('POST', `/api/inventarios/${ID}/retomar`);
  if (r.status !== 200) falha('retomar: ' + JSON.stringify(r.corpo));
}
for (const [sku, casa] of CORRECOES) {
  const r = await api('POST', `/api/inventarios/${ID}/leituras`,
    { sku, gesto: 'definir', quantidade: casa, leituraId: `correcao-pos-inventario-2026-10-08-${sku}` });
  if (r.status !== 200) falha(`${sku} definir: ${JSON.stringify(r.corpo)}`);
  const total = (r.corpo.linhas ?? []).reduce((s, l) => s + l.contado, 0);
  if (total !== casa) falha(`${sku}: contagem ficou ${total}, não ${casa}`);
}
console.log('ok   contagem definida nos 21 códigos');

const bal = (await api('GET', `/api/inventarios/${ID}/balanco`)).corpo;
const esperadas = [...CORRECOES, NAO_ENCONTRADA].map(([sku, , , dif]) => `${sku}:${dif}`).sort();
const vistas = [...bal.faltando, ...bal.sobrando].map((l) => `${l.sku}:${l.dif}`).sort();
if (JSON.stringify(esperadas) !== JSON.stringify(vistas)) falha(`balanço diferente do esperado:\n  esperado ${esperadas}\n  veio     ${vistas}`);
if (bal.impacto.naoConferidos !== 0) falha(`${bal.impacto.naoConferidos} códigos ainda não conferidos`);
console.log(`ok   balanço: exatamente ${vistas.length} diferenças (${-bal.impacto.pecasAMenos} peças), nenhum código sem conferir`);

const c = await api('POST', `/api/inventarios/${ID}/concluir`, {});
if (c.status !== 200) falha('concluir: ' + JSON.stringify(c.corpo));
console.log('ok   inventário concluído');

const itens = [...CORRECOES, NAO_ENCONTRADA].map(([sku, , , , m, texto]) => ({
  sku, motivoId: m.motivoId, motivo: m.motivo, observacao: `${OBS} · ${texto}`,
}));
for (let i = 0; i < itens.length; i += 20) {
  const r = await api('POST', `/api/inventarios/${ID}/aplicar`, { itens: itens.slice(i, i + 20) });
  if (r.status !== 200) falha('aplicar: ' + JSON.stringify(r.corpo));
}
console.log(`ok   ${itens.length} diferenças aplicadas como ajuste de inventário #1`);
