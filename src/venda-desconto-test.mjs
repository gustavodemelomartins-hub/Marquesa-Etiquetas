/** Desconto por peça na venda de balcão — §27.
 *
 *  O defeito que este teste existe para impedir de voltar:
 *
 *    A planilha dela sempre teve coluna Desconto, escrita à mão ("R$10 de
 *    Desconto", "5% de desconto"), e o importador sempre soube ler. A venda
 *    de balcão — a tela feita para SUBSTITUIR a planilha — não sabia:
 *    `registrarVenda` descartava qualquer preço vindo da tela e gravava o do
 *    catálogo. Dar desconto era possível no balcão e impossível no sistema,
 *    então a venda entrava pelo preço cheio e o faturamento nascia acima do
 *    que entrou no caixa.
 *
 *  O que precisa ficar provado:
 *
 *   1. sem mexer no preço, nada muda — o catálogo continua sendo a única
 *      fonte, e a venda de sempre continua igual;
 *   2. com preço editado, o TOTAL é o cobrado, não o de tabela;
 *   3. `preco_tabela` é gravado SEMPRE, com ou sem desconto: sem ele, um
 *      reajuste de catálogo faz o desconto de ontem parecer outro número;
 *   4. preço diferente do de tabela SEM motivo é RECUSADO — é
 *      indistinguível de erro de digitação, e desconto sem rótulo é dinheiro
 *      saindo do faturamento sem deixar rastro;
 *   5. preço negativo é recusado; zero com motivo é aceito (brinde);
 *   6. o preço do CATÁLOGO não muda — desconto é desta venda, não
 *      reprecificação da peça;
 *   7. o ESTOQUE baixa igual, com ou sem desconto: desconto é dinheiro, não
 *      peça. A razão contábil continua fechando.
 *
 *  Roda contra o Worker local, que é onde a regra mora.
 *
 *      api/dev-local.sh && node src/venda-desconto-test.mjs
 */
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

const SKU = 'DESC-001';
const PRECO = 89;

console.log('\n=== 0. uma peça no catálogo, com preço e estoque ===');
{
  const r = await api('POST', '/api/produtos/importar', {
    produtos: [{ sku: SKU, desc: 'Brinco Pétalas', preco: PRECO, cat: 'Outros', qtd: 10 }],
  });
  eq('cadastrou a peça com saldo', r.status, 200);
}

const saldo = async () => {
  const st = await api('GET', '/api/state');
  return Number((st.corpo?.produtos ?? []).find((p) => p.sku === SKU)?.qtd ?? -1);
};
const precoDoCatalogo = async () => {
  const st = await api('GET', '/api/state');
  return (st.corpo?.produtos ?? []).find((p) => p.sku === SKU)?.preco;
};
const itensDaVenda = async (id) => {
  const r = await api('GET', '/api/vendas');
  return (r.corpo ?? []).find((v) => v.id === id)?.itens ?? [];
};

console.log('\n=== 1. sem mexer no preço, a venda é a de sempre ===');
const antes1 = await saldo();
{
  const r = await api('POST', '/api/vendas',
    { clienteNome: 'Cliente Sem Desconto', itens: [{ sku: SKU, qtd: 2 }] });
  eq('registrou', r.status, 201);
  eq('total pelo catálogo', r.corpo?.total, PRECO * 2);
  const itens = await itensDaVenda(r.corpo?.id);
  eq('preço cobrado', itens[0]?.preco, PRECO);
  /* §27 item 3: gravado mesmo sem desconto */
  eq('preco_tabela gravado assim mesmo', itens[0]?.precoTabela, PRECO);
  eq('e sem desconto nenhum', itens[0]?.descontoValor, 'null');
  eq('nem rótulo', itens[0]?.descontoRotulo, 'null');
  eq('estoque baixou 2', await saldo(), antes1 - 2);
}

console.log('\n=== 2. com desconto, o total é o COBRADO ===');
const antes2 = await saldo();
{
  const r = await api('POST', '/api/vendas', {
    clienteNome: 'Cliente Grupo VIP',
    itens: [{ sku: SKU, qtd: 2, preco: 65, descontoRotulo: 'Grupo VIP' }],
  });
  eq('registrou', r.status, 201);
  eq('total é 65 × 2, não 89 × 2', r.corpo?.total, 130);
  const itens = await itensDaVenda(r.corpo?.id);
  eq('preço cobrado', itens[0]?.preco, 65);
  eq('preço de tabela preservado', itens[0]?.precoTabela, PRECO);
  eq('desconto derivado, não digitado', itens[0]?.descontoValor, 24);
  eq('com o motivo', itens[0]?.descontoRotulo, 'Grupo VIP');
  /* §27 item 7 */
  eq('o estoque baixou igual — desconto é dinheiro, não peça', await saldo(), antes2 - 2);
}

console.log('\n=== 3. preço diferente SEM motivo é recusado ===');
const antes3 = await saldo();
{
  const r = await api('POST', '/api/vendas',
    { clienteNome: 'Sem Motivo', itens: [{ sku: SKU, qtd: 1, preco: 65 }] });
  eq('recusou', r.status, 409);
  eq('e disse o que falta', /motivo/i.test(r.corpo?.erro || ''), 'true');
  eq('e não baixou estoque nenhum', await saldo(), antes3);
}

console.log('\n=== 4. preço inválido é recusado ===');
{
  const r = await api('POST', '/api/vendas', {
    clienteNome: 'Negativo', itens: [{ sku: SKU, qtd: 1, preco: -5, descontoRotulo: 'Erro' }],
  });
  eq('negativo recusado', r.status, 400);

  const z = await api('POST', '/api/vendas', {
    clienteNome: 'Brinde', itens: [{ sku: SKU, qtd: 1, preco: 0, descontoRotulo: 'Brinde' }],
  });
  eq('zero COM motivo é aceito — brinde existe', z.status, 201);
  eq('e o total é zero', z.corpo?.total, 0);
}

console.log('\n=== 5. a venda pode ser de um dia anterior ===');
/* §28: `data` era `hoje()` sem alternativa. Quem vendeu no sábado e lançou
   na segunda não tinha caminho: a venda entrava com a data errada ou não
   entrava. */
{
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const r = await api('POST', '/api/vendas',
    { clienteNome: 'Cliente de Sábado', data: ontem, itens: [{ sku: SKU, qtd: 1 }] });
  eq('venda de ontem é aceita', r.status, 201);
  const doDia = await api('GET', '/api/vendas?data=' + ontem);
  eq('e aparece na lista DAQUELE dia',
    (doDia.corpo ?? []).some((v) => v.id === r.corpo?.id), 'true');
  const hojeLista = await api('GET', '/api/vendas');
  eq('e não na de hoje', (hojeLista.corpo ?? []).some((v) => v.id === r.corpo?.id), 'false');

  /* o movimento diz de que dia é a venda — `criado_em` é quando foi
     digitada, e as duas informações são diferentes e verdadeiras */
  const mov = await api('GET', '/api/estoque/' + SKU + '/movimentos');
  const dele = (mov.corpo?.movimentos ?? []).find((m) => /venda de /i.test(m.obs || ''));
  eq('o movimento registra a data da venda', /venda de /i.test(dele?.obs || ''), 'true');
}

console.log('\n=== 5b. data futura é recusada ===');
{
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const r = await api('POST', '/api/vendas',
    { clienteNome: 'Cliente do Futuro', data: amanha, itens: [{ sku: SKU, qtd: 1 }] });
  eq('recusou', r.status, 400);
  eq('e disse por quê', /ainda não chegou/i.test(r.corpo?.erro || ''), 'true');

  const torto = await api('POST', '/api/vendas',
    { clienteNome: 'Data Torta', data: '31/08/2026', itens: [{ sku: SKU, qtd: 1 }] });
  eq('data em formato errado também é recusada', torto.status, 400);
}

console.log('\n=== 5c. venda lançada por engano se cancela, e a peça volta ===');
{
  const antes = await saldo();
  const v = await api('POST', '/api/vendas',
    { clienteNome: 'Engano', itens: [{ sku: SKU, qtd: 3 }] });
  eq('registrou', v.status, 201);
  eq('estoque baixou 3', await saldo(), antes - 3);

  const c = await api('POST', `/api/vendas/${v.corpo.id}/cancelar`);
  eq('cancelou', c.status, 200);
  eq('as peças voltaram', await saldo(), antes);

  /* §28: cancela, não apaga — o histórico não se perde */
  const lista = await api('GET', '/api/vendas');
  const ela = (lista.corpo ?? []).find((x) => x.id === v.corpo.id);
  eq('a venda continua no histórico', !!ela, 'true');
  eq('marcada como cancelada', ela?.cancelada, 'true');

  const denovo = await api('POST', `/api/vendas/${v.corpo.id}/cancelar`);
  eq('cancelar duas vezes não devolve peça duas vezes', denovo.status, 409);
  eq('o estoque continua o mesmo', await saldo(), antes);
}

console.log('\n=== 6. o catálogo não foi reprecificado ===');
{
  eq('a peça continua custando o que custava', await precoDoCatalogo(), PRECO);
}

console.log('\n=== 7. a razão contábil fecha ===');
{
  const c = await api('GET', '/api/estoque/conferir');
  eq('sem divergência', JSON.stringify(c.corpo?.divergentes ?? []), '[]');
}

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
