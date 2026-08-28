/** Importação do histórico de vendas — a planilha real, contra o Worker local.
 *
 *  O que precisa ficar provado aqui, em ordem de importância:
 *
 *   1. **a importação NÃO movimenta estoque** — nenhuma linha nova em
 *      `movimentos`, nenhum `produtos.qtd` alterado, a razão continua
 *      fechando. É a regra absoluta: o estoque de hoje já incorpora estas
 *      vendas, e criar movimento descontaria a mesma peça duas vezes;
 *   2. os totais FECHAM com a fonte — faturamento, peças, clientes, SKUs e
 *      período conferidos contra os números lidos do arquivo;
 *   3. rodar o mesmo arquivo duas vezes não duplica nada;
 *   4. o cru é preservado: `-`, `Não lembro` e o texto comercial da coluna
 *      Desconto continuam legíveis depois de importados;
 *   5. `-` vira NULL, nunca zero — a diferença entre "não sei quanto foi" e
 *      "saiu de graça";
 *   6. o ID do produto é TEXTO: `996055-2` não vira 996055;
 *   7. a origem comercial vira canal + contexto sem perder o bruto;
 *   8. contagem de pedidos e ticket médio histórico NÃO são inventados;
 *   9. reverter o lote desfaz tudo o que ele escreveu.
 *
 *  Roda contra a planilha de verdade quando ela está disponível em
 *  `src/__dados__/vendas-historico.json`; senão, contra uma amostra embutida
 *  que reproduz cada caso difícil observado no arquivo real.
 */
import { readFileSync, existsSync } from 'node:fs';

const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

/* ------------------------------------------------------------------ dados */

/** Amostra que reproduz, em 12 linhas, cada caso difícil das 1.341 reais:
 *  sufixo no código, data ilegível, valor `-`, desconto que é texto, tipo
 *  escrito de duas formas, canal com e sem contexto, origem múltipla,
 *  revendedora nomeada, status com espaço sobrando, e quantidade > 1. */
const CABECALHO = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];

const AMOSTRA = [
  CABECALHO,
  [1, '2024-12-18', 'Cleide Gomes', 787123, 'Brinco Pétalas', 'Banhadas', 1, 89, null, 89, 'Pix', 'PAGO', 'Maleta'],
  [2, '2025-03-15', 'Rosangela Maryeli', '996055-2', 'Brinco Argola', 'Banhada', 1, 59, 'Revendedora', 59, 'Cartão de Crédito 3x', 'PAGO ', 'Maleta (Dia do Consumidor)'],
  [3, '-', 'Sthefany Marques', 420492, 'Colar Gota', 'Bruto', 1, '-', null, '-', null, '-', 'Maleta'],
  [4, '2024-11-30', 'Cristiane Cavallaro', 757767, 'Brinco Pérola', 'Prata 925', 2, 64, 'Desconto (R$10)', 128, 'Cartão de Crétido', 'PAGO', 'Maleta (Consórcio)'],
  [5, '2025-06-01', 'Angela Alves', 111111, 'Colar Ponto de Luz', 'Bruto', 1, 100, '5% de desconto', 95, 'Pix', ' PAGO', 'Mercado Biani'],
  [6, '2025-07-10', 'Angela Alves ', 222222, 'Pulseira Elos', 'Banhadas', 1, 120, null, 120, 'Dinheiro', 'PAGO', 'Site'],
  [7, 'Não lembro', 'Thais (Comunidade)', 333333, 'Anel Solitário', 'Aço Inox', 1, 45, null, 45, null, 'PAGO', 'Instagram (Live)'],
  [8, '2026-01-20', 'Beatriz Souza', 444444, 'Berloque Coração', 'Bruto', 1, 70, 'Presente mãe', 70, 'Troca', 'NÃO PAGO', 'Revendedora (Beatriz)'],
  [9, '2026-02-14', 'Leidy Johana', 555555, 'Colar Duplo', 'Banhada', 3, 60, null, 180, 'Pix', 'PAGO', 'Mercado Biani e Maleta'],
  [10, '2026-03-01', 'Glau Pivato', 666666, 'Argola Cravejada', 'Bruto', 1, 79, null, 79, null, 'PAGO', 'Maleta (Feira Franceschini)'],
  [11, '2026-04-02', 'Camila', 777777, 'Brinco Ponto', 'Banhadas', 1, 55, 'Desconto BLACK', 55, 'Pix', 'PAGO', 'PERDIDO'],
  [12, '2026-05-05', 'Evelyn Veiga', 888888, 'Colar Longo', 'Bruto', 1, 150, null, 150, 'Cartão de Débito', 'PAGO', 'Maletra '],
];

const CAMINHO_REAL = new URL('./__dados__/vendas-historico.json', import.meta.url).pathname;
const usandoReal = existsSync(CAMINHO_REAL);
const LINHAS = usandoReal ? JSON.parse(readFileSync(CAMINHO_REAL, 'utf8')) : AMOSTRA;

console.log(usandoReal
  ? `\n>>> planilha REAL: ${LINHAS.length - 1} linhas`
  : `\n>>> amostra embutida: ${LINHAS.length - 1} linhas (a planilha real não está no repositório)`);

/* Os números da fonte, calculados AQUI, do jeito mais bobo possível — se a
 * conta do backend e esta divergirem, é o backend que está errado. */
const corpo = LINHAS.slice(1);
const col = (n) => CABECALHO.indexOf(n);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const pagoDe = (v) => String(v ?? '').trim().toUpperCase() === 'PAGO';
const FONTE = {
  linhas: corpo.length,
  pecas: corpo.reduce((s, l) => s + (num(l[col('Quantidade Vendida')]) ?? 0), 0),
  faturamentoPago: +corpo.reduce((s, l) =>
    s + (pagoDe(l[col('Status Pagamento')]) ? (num(l[col('Valor Total Venda')]) ?? 0) : 0), 0).toFixed(2),
  faturamentoTodas: +corpo.reduce((s, l) => s + (num(l[col('Valor Total Venda')]) ?? 0), 0).toFixed(2),
};

/* ═════════════════════════════════════════════════════════════════ 0. base */

console.log('\n=== 0. estado do estoque ANTES de qualquer coisa ===');

await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: '787123', desc: 'Brinco Pétalas de Flor', cat: 'Brinco', preco: 89, qtd: 5 },
    { sku: '996055', desc: 'Brinco Argola Coração', cat: 'Brinco', preco: 59, qtd: 3 },
  ],
});

const antes = await api('GET', '/api/estoque/conferir');
eq('a razão fecha antes de importar', JSON.stringify(antes.corpo.divergentes), '[]');

const movsAntes = await api('GET', '/api/estoque/787123/movimentos');
const qtdAntes = movsAntes.corpo.saldos.qtd;
const nMovsAntes = movsAntes.corpo.movimentos.length;
ok('estoque inicial de 787123 anotado', `qtd=${qtdAntes} movimentos=${nMovsAntes}`);

/* ═══════════════════════════════════════════════════════════ 1. análise seca */

console.log('\n=== 1. análise não escreve nada e anuncia impacto ZERO ===');

const an = await api('POST', '/api/vendas/historico/analisar', {
  linhas: LINHAS, arquivo: 'Vendas Marquesa.xlsx',
});
eq('a análise respondeu 200', an.status, 200);
eq('leu todas as linhas', an.corpo.linhas, FONTE.linhas);
eq('impacto declarado sobre estoque: 0 movimentos', an.corpo.impactoEstoque.movimentos, 0);
eq('impacto declarado sobre a Nuvemshop: 0', an.corpo.impactoEstoque.nuvemshop, 0);
eq('nada foi importado ainda', an.corpo.jaImportado, 'null');

const lotesVazio = await api('GET', '/api/vendas/historico/lotes');
eq('nenhum lote existe depois da análise', lotesVazio.corpo.lotes.length, 0);

console.log('\n=== 1b. os números da análise batem com a fonte ===');
eq('peças', an.corpo.pecas, FONTE.pecas);
eq('faturamento pago', an.corpo.faturamentoPago, FONTE.faturamentoPago);
eq('faturamento de todas as linhas', an.corpo.faturamentoTodas, FONTE.faturamentoTodas);

console.log('\n=== 1c. a análise prevê quantas VENDAS as linhas viram ===');
/* Este bloco afirmava o CONTRÁRIO até 2026-08-27: sem regra de agrupamento
   validada, contar pedidos seria invenção. A regra passou a existir — mesmo
   cliente normalizado + mesma data = uma venda — e a prévia usa a MESMA
   função que a reconstrução usa depois de importar. O número que a tela
   mostra antes de aplicar é o que vai existir depois. */
eq('a contagem de vendas está disponível', an.corpo.pedidos.disponivel, true);
eq('e são menos vendas que linhas', an.corpo.pedidos.vendas < an.corpo.linhas, 'true');
ok('linhas → vendas', `${an.corpo.linhas} → ${an.corpo.pedidos.vendas}`);
eq('a regra vem escrita junto do número', /mesmo cliente/i.test(an.corpo.pedidos.regra), 'true');
eq('e o ticket médio previsto existe', an.corpo.pedidos.ticketMedio != null, 'true');
ok('ticket médio previsto', String(an.corpo.pedidos.ticketMedio));
ok('maior venda do arquivo', `${an.corpo.pedidos.maiorVenda} itens numa compra só`);

/* ══════════════════════════════════════════════════════════ 2. importação */

console.log('\n=== 2. importação grava o histórico ===');

const imp = await api('POST', '/api/vendas/historico/importar', {
  linhas: LINHAS, arquivo: 'Vendas Marquesa.xlsx',
});
eq('respondeu 201', imp.status, 201);
eq('o lote foi criado', typeof imp.corpo.loteId === 'number', 'true');
eq('importou todas as linhas', imp.corpo.conferencia.importadas, FONTE.linhas);

console.log('\n=== 2b. a reconciliação contra a fonte fecha ===');
for (const l of imp.corpo.conferencia.linhas) {
  eq(`${l.campo}: fonte ${l.fonte} × banco ${l.banco}`, l.bate, 'true');
}
eq('a conferência inteira fecha', imp.corpo.conferencia.fecha, 'true');

/* ══════════════════════════════ 3. A REGRA ABSOLUTA: estoque não se mexeu */

console.log('\n=== 3. o estoque NÃO foi tocado (a regra absoluta) ===');

eq('nenhum movimento de origem histórica existe', imp.corpo.conferencia.movimentosCriados, 0);
eq('o importador declara estoque intocado', imp.corpo.conferencia.estoqueIntocado, 'true');

const movsDepois = await api('GET', '/api/estoque/787123/movimentos');
eq('a quantidade do SKU não mudou', movsDepois.corpo.saldos.qtd, qtdAntes);
eq('nenhum movimento novo entrou', movsDepois.corpo.movimentos.length, nMovsAntes);

const depois = await api('GET', '/api/estoque/conferir');
eq('a razão continua fechando (§19)', JSON.stringify(depois.corpo.divergentes), '[]');

/* ═══════════════════════════════════════════════════════ 4. idempotência */

console.log('\n=== 4. o mesmo arquivo não entra duas vezes ===');

const imp2 = await api('POST', '/api/vendas/historico/importar', {
  linhas: LINHAS, arquivo: 'Vendas Marquesa.xlsx',
});
eq('a segunda importação é recusada', imp2.status, 409);
eq('e diz qual lote já tinha o arquivo', imp2.corpo.jaImportado.loteId, imp.corpo.loteId);

const lotes = await api('GET', '/api/vendas/historico/lotes');
eq('continua existindo UM lote só', lotes.corpo.lotes.length, 1);

/* O faturamento do painel é o das VENDAS, e o que a planilha marca como
   não-venda (aqui, a linha com observação `PERDIDO`) fica de fora dele — mas
   continua no banco, na camada bruta, contado como ajuste. Por isso a
   comparação desconta essas linhas em vez de somar tudo o que está `PAGO`. */
const AJUSTE = /^(PERDIDO|ACHO QUE FOI VENDIDO)$/i;
/* `Observação Venda ` tem espaço no fim no cabeçalho real — é o dado, não
   um deslize de digitação deste teste. */
const eAjuste = (l) => AJUSTE.test(String(l[col('Observação Venda ')] ?? '').trim())
  || String(l[col('Nome do Cliente')] ?? '').trim().toLowerCase() === 'inventário';
const semAjuste = corpo.filter((l) => !eAjuste(l));
const ESPERADO = {
  faturamento: +semAjuste.reduce((s, l) =>
    s + (pagoDe(l[col('Status Pagamento')]) ? (num(l[col('Valor Total Venda')]) ?? 0) : 0), 0).toFixed(2),
  pecas: semAjuste.reduce((s, l) => s + (num(l[col('Quantidade Vendida')]) ?? 0), 0),
  ajustes: corpo.length - semAjuste.length,
};

const kpi = await api('GET', '/api/analytics/vendas');
eq('e o faturamento não dobrou', kpi.corpo.faturamento, ESPERADO.faturamento);
eq('nem as peças', kpi.corpo.pecas, ESPERADO.pecas);
eq('a linha marcada como não-venda ficou fora do faturamento',
  kpi.corpo.composicao.ajustes, ESPERADO.ajustes);
eq('mas continua no banco, na camada bruta',
  kpi.corpo.composicao.linhasBrutas, FONTE.linhas);
eq('e o ticket médio existe', kpi.corpo.ticketMedio.valor != null, 'true');
ok('ticket médio depois de importar', String(kpi.corpo.ticketMedio.valor));

/* ══════════════════════════════════════════ 5. o cru continua legível */

console.log('\n=== 5. o dado original é preservado, não "limpo" ===');

/* a rota tem teto de 1.000 por página de propósito — a planilha real tem
 * 1.341 linhas, então a listagem completa exige paginar */
const itens = [];
for (let off = 0; ; off += 1000) {
  const pag = await api('GET', `/api/vendas/lista?limite=1000&offset=${off}`);
  const pagina = pag.corpo.itens;
  itens.push(...pagina.filter((i) => i.fonte === 'historico'));
  if (pagina.length < 1000) break;
}
eq('a lista traz o histórico inteiro (paginado)', itens.length, FONTE.linhas);

if (!usandoReal) {
  const l3 = itens.find((i) => i.referencia === '3');
  eq('linha sem data: data virou NULL', l3.data, 'null');
  eq('e o valor também é NULL, não zero', l3.valor, 'null');

  const l4 = itens.find((i) => i.referencia === '4');
  eq('quantidade > 1 preservada', l4.qtd, 2);

  const l2 = itens.find((i) => i.referencia === '2');
  eq('o SKU com sufixo continua TEXTO', l2.sku, '996055-2');

  console.log('\n=== 6. origem comercial: canal + contexto, sem perder o bruto ===');
  eq('canal de "Maleta (Consórcio)"', l4.canal, 'Maleta');
  eq('contexto de "Maleta (Consórcio)"', l4.contexto, 'Consórcio');
  eq('o texto original continua lá', l4.observacao, 'Maleta (Consórcio)');

  const l12 = itens.find((i) => i.referencia === '12');
  eq('"Maletra" (erro de digitação) vira Maleta', l12.canal, 'Maleta');
  eq('e o bruto guarda o erro como estava', l12.observacao, 'Maletra');

  const l9 = itens.find((i) => i.referencia === '9');
  eq('origem múltipla não vira um canal só', l9.canal, 'Misto');

  const l11 = itens.find((i) => i.referencia === '11');
  eq('"PERDIDO" não vira canal nenhum', l11.canal, 'null');
  eq('mas a linha foi importada assim mesmo', l11.observacao, 'PERDIDO');
}

/* ═════════════════════════════════════════════════ 7. inteligência comercial */

console.log('\n=== 7. os relatórios respondem ===');

const origem = await api('GET', '/api/analytics/origem');
eq('canais respondem', origem.status, 200);
eq('e o bruto vem junto, para conferir a classificação', origem.corpo.brutos.length > 0, 'true');

const prod = await api('GET', '/api/analytics/produtos?limite=5');
eq('produtos mais vendidos respondem', prod.status, 200);
const casado = prod.corpo.produtos.find((p) => p.sku === '787123');
if (casado) eq('a peça que existe no catálogo aparece com nome atual', casado.noCatalogo, 'true');

const cli = await api('GET', '/api/analytics/clientes?limite=5');
eq('ranking de clientes responde', cli.status, 200);
/* O campo se chamava `datasComCompra` porque "duas compras no mesmo dia
   contam uma vez" era o melhor que dava para afirmar sem regra de
   agrupamento. Agora a venda existe, e o campo se chama pelo que ele é. */
eq('o cliente traz o número de VENDAS',
  Object.hasOwn(cli.corpo.clientes[0] ?? {}, 'vendas'), 'true');
eq('e o ticket médio dele', Object.hasOwn(cli.corpo.clientes[0] ?? {}, 'ticketMedio'), 'true');

console.log('\n=== 7b. o ticket médio histórico agora EXISTE ===');
/* Este bloco checava o contrário até 2026-08-27. A regra de agrupamento
   passou a existir; o número saiu de "indisponível de propósito" para
   calculado, com a regra publicada junto dele. */
eq('o ticket médio é um número', typeof kpi.corpo.ticketMedio.valor, 'number');
eq('e vem com a quantidade de vendas elegíveis',
  kpi.corpo.ticketMedio.vendasElegiveis > 0, 'true');
eq('e com a regra por escrito', /elegív|elegiv/i.test(kpi.corpo.ticketMedio.regra), 'true');
eq('o denominador NÃO são as linhas da planilha',
  kpi.corpo.ticketMedio.vendasElegiveis < FONTE.linhas, 'true');

if (!usandoReal) {
  console.log('\n=== 8. cliente: mesmo nome com grafias diferentes conta junto ===');
  const angela = cli.corpo.clientes.find((c) => c.norm === 'angela alves');
  eq('"Angela Alves" e "Angela Alves " são a mesma pessoa', angela?.pecas, 2);

  const perfil = await api('GET', '/api/clientes/perfil?norm=angela%20alves');
  eq('o perfil responde pelo nome normalizado', perfil.status, 200);
  eq('com as duas compras', perfil.corpo.resumo.pecas, 2);
  eq('e um estado de relacionamento derivado', typeof perfil.corpo.resumo.estado, 'string');
  /* datas diferentes = vendas diferentes: as duas linhas da Angela são
     2025-06-01 e 2025-07-10, então são duas compras, não uma */
  eq('duas datas viraram duas vendas', perfil.corpo.resumo.vendas, 2);
  eq('a linha do tempo tem uma entrada por venda', perfil.corpo.vendas.length, 2);
}

/* ═══════════════════════════════════════════════════════════ 9. reverter */

console.log('\n=== 9. reverter desfaz o lote inteiro ===');

const rev = await api('POST', `/api/vendas/historico/lotes/${imp.corpo.loteId}/reverter`);
eq('reverteu', rev.status, 200);
eq('removeu todos os itens', rev.corpo.itensRemovidos, FONTE.linhas);

const kpiZero = await api('GET', '/api/analytics/vendas');
eq('o histórico sumiu dos números', kpiZero.corpo.composicao.linhasBrutas, 0);
eq('e as vendas reconstruídas foram junto', kpiZero.corpo.composicao.vendasHistoricas, 0);
/* a camada derivada é filha do item: reverter tem de levar as duas, e nesta
   ordem — o item aponta para a venda, então ele sai primeiro */
const derivadasZero = await api('GET', '/api/vendas/historico/reconstrucao');
eq('nenhuma venda derivada ficou órfã', derivadasZero.corpo.vendas, 0);

const finalConf = await api('GET', '/api/estoque/conferir');
eq('e a razão continua fechando depois de reverter', JSON.stringify(finalConf.corpo.divergentes), '[]');

const movsFinal = await api('GET', '/api/estoque/787123/movimentos');
eq('o estoque nunca foi tocado, do começo ao fim', movsFinal.corpo.saldos.qtd, qtdAntes);

console.log(`\n${falhas ? '✗ ' + falhas + ' FALHA(S)' : '✓ TUDO PASSOU'}`);
process.exit(falhas ? 1 : 0);
