/** A regra que transforma linhas de planilha em VENDAS históricas.
 *
 *  O que este teste guarda, e por que cada caso existe:
 *
 *   1. MESMO CLIENTE + MESMA DATA = UMA VENDA. Vale para 1 linha e vale
 *      para 36 — o tamanho do grupo não muda a natureza dele. Foi
 *      exatamente a inferência "36 linhas, logo é acerto" que produziu a
 *      leitura errada anterior, e é ela que este teste impede de voltar.
 *   2. datas diferentes separam; clientes diferentes separam.
 *   3. grafia, acento e espaço sobrando NÃO separam — a normalização é uma
 *      só, e "José" e "jose" são a mesma pessoa.
 *   4. o que a planilha marca como não-venda (PERDIDO, ajuste, correção)
 *      sai da contagem de vendas, mesmo caindo no mesmo cliente e dia.
 *   5. pago / não pago / parcial / indefinido têm regra explícita, e NULL
 *      nunca vira zero.
 *   6. linha sem data vira venda própria e fica fora do ticket médio.
 *   7. ticket médio = faturamento elegível / vendas elegíveis, e nada mais.
 *   8. reconstruir duas vezes devolve exatamente o mesmo resultado.
 *
 *  É teste puro: não sobe Worker, não toca banco. A regra é uma função.
 */
import {
  reconstruirVendas, classificarLinha, statusDaVenda,
} from '../api/src/vendas-historicas.js';
import {
  normalizarData, normalizarNomeCliente,
} from '../api/src/vendas-historico-normalizar.js';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (a === b ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));

let proximoId = 1;
/** Uma linha da planilha, já normalizada como o importador a grava. */
function linha({ cliente, data = '2026-06-13', qtd = 1, valor = 100, pago = 1,
  obs = 'Maleta', canal = 'Maleta', contexto = null }) {
  const id = proximoId++;
  return {
    id,
    origem_linha: String(id),
    data,
    cliente_id: null,
    cliente_nome_original: cliente,
    cliente_nome_norm: normalizarNomeCliente(cliente),
    qtd,
    valor_total: valor,
    pago,
    canal,
    contexto,
    observacao_original: obs,
  };
}

console.log('\n── 0. serial de data do Excel não muda de dia por causa do fuso');
eq('21/08/2026 continua 21/08/2026', normalizarData(46255), '2026-08-21');
eq('14/08/2026 continua 14/08/2026', normalizarData(46248), '2026-08-14');

console.log('\n── 1. mesmo cliente + mesma data = uma venda');
{
  const uma = reconstruirVendas([linha({ cliente: 'Thais Nania' })]);
  eq('1 linha vira 1 venda', uma.length, 1);
  eq('com 1 item', uma[0].itens, 1);

  const trinta6 = reconstruirVendas(
    Array.from({ length: 36 }, () => linha({ cliente: 'Jessica Melim', data: '2026-06-13', valor: 65.8 })),
  );
  eq('36 linhas no mesmo dia viram 1 venda', trinta6.length, 1);
  eq('com 36 itens', trinta6[0].itens, 36);
  eq('e 36 peças', trinta6[0].pecas, 36);
  eq('classificada como venda, não como acerto', trinta6[0].classe, 'venda');
  eq('valor somado', trinta6[0].valorTotal, 2368.8);
}

console.log('\n── 2. o que separa vendas');
{
  const datas = reconstruirVendas([
    linha({ cliente: 'Thais Nania', data: '2025-05-10' }),
    linha({ cliente: 'Thais Nania', data: '2025-09-26' }),
  ]);
  eq('mesmo cliente, datas diferentes = 2 vendas', datas.length, 2);

  const gente = reconstruirVendas([
    linha({ cliente: 'Thais Nania', data: '2026-02-27' }),
    linha({ cliente: 'Brenda Vitachi', data: '2026-02-27' }),
  ]);
  eq('clientes diferentes, mesma data = 2 vendas', gente.length, 2);
}

console.log('\n── 3. grafia não separa a mesma pessoa');
{
  const g = reconstruirVendas([
    linha({ cliente: 'José Silva' }),
    linha({ cliente: 'jose silva' }),
    linha({ cliente: '  JOSE   SILVA  ' }),
  ]);
  eq('acento, caixa e espaço sobrando = 1 venda', g.length, 1);
  eq('com os 3 itens', g[0].itens, 3);

  const v = reconstruirVendas([
    linha({ cliente: 'Vitória' }),
    linha({ cliente: 'vitoria' }),
  ]);
  eq('Vitória e vitoria são a mesma cliente', v.length, 1);
}

console.log('\n── 4. operação explicitamente marcada como não-venda');
{
  eq('PERDIDO é ajuste', classificarLinha({ observacao_original: 'PERDIDO', cliente_nome_norm: 'x' }).classe, 'ajuste');
  eq('ACHO QUE FOI VENDIDO é ajuste', classificarLinha({ observacao_original: 'ACHO QUE FOI VENDIDO', cliente_nome_norm: 'x' }).classe, 'ajuste');
  eq('Ajuste de estoque é ajuste', classificarLinha({ observacao_original: 'Ajuste de estoque', cliente_nome_norm: 'x' }).classe, 'ajuste');
  eq('Correção é ajuste', classificarLinha({ observacao_original: 'Correção', cliente_nome_norm: 'x' }).classe, 'ajuste');
  eq('cliente "Inventário" é ajuste', classificarLinha({ observacao_original: '-', cliente_nome_norm: 'inventario' }).classe, 'ajuste');

  /* o ponto central: MUITAS LINHAS NÃO É ACERTO */
  eq('"Maleta" com 36 linhas continua venda',
    classificarLinha({ observacao_original: 'Maleta', cliente_nome_norm: 'jessica melim' }).classe, 'venda');
  eq('"Maleta (Feira Franceschini)" é venda',
    classificarLinha({ observacao_original: 'Maleta (Feira Franceschini)', cliente_nome_norm: 'x' }).classe, 'venda');

  const misto = reconstruirVendas([
    linha({ cliente: 'Inventário', data: '2026-08-06', valor: 0, pago: null, obs: 'PERDIDO' }),
    linha({ cliente: 'Inventário', data: '2026-08-06', valor: 0, pago: null, obs: 'ACHO QUE FOI VENDIDO' }),
    linha({ cliente: 'Thais Nania', data: '2026-08-06', valor: 90 }),
  ]);
  eq('ajuste não se mistura com venda no mesmo dia',
    misto.filter((v) => v.classe === 'venda').length, 1);
  eq('e cada ajuste fica isolado', misto.filter((v) => v.classe === 'ajuste').length, 2);
  eq('nenhum ajuste é elegível a ticket', misto.filter((v) => v.classe === 'ajuste' && v.elegivelTicket).length, 0);
}

console.log('\n── 5. status de pagamento');
{
  eq('todos pagos = paga', statusDaVenda([{ pago: 1 }, { pago: 1 }]), 'paga');
  eq('nenhum pago = nao_paga', statusDaVenda([{ pago: 0 }, { pago: 0 }]), 'nao_paga');
  eq('metade paga = parcial', statusDaVenda([{ pago: 1 }, { pago: 0 }]), 'parcial');
  eq('tudo desconhecido = indefinida', statusDaVenda([{ pago: null }, { pago: null }]), 'indefinida');
  eq('pago + desconhecido = parcial, não paga', statusDaVenda([{ pago: 1 }, { pago: null }]), 'parcial');

  const v = reconstruirVendas([
    linha({ cliente: 'Ana', valor: 100, pago: 1 }),
    linha({ cliente: 'Ana', valor: 50, pago: 0 }),
  ]);
  eq('valor_pago conta só o que está PAGO', v[0].valorPago, 100);
  eq('valor_total soma tudo', v[0].valorTotal, 150);
  eq('parcial não é elegível a ticket', v[0].elegivelTicket, false);
}

console.log('\n── 6. linha sem data');
{
  const v = reconstruirVendas([
    linha({ cliente: 'Angela Lopes', data: null, valor: 49 }),
    linha({ cliente: 'Angela Lopes', data: null, valor: 39 }),
  ]);
  eq('duas linhas sem data NÃO se agrupam entre si', v.length, 2);
  eq('e ficam fora do ticket médio', v.filter((x) => x.elegivelTicket).length, 0);
  eq('mas o faturamento delas é preservado', v.reduce((s, x) => s + x.valorTotal, 0), 88);
  eq('a regra fica escrita na venda', /sem data/.test(v[0].regra), true);
}

console.log('\n── 7. item sem valor derruba a elegibilidade, não o grupo');
{
  const v = reconstruirVendas([
    linha({ cliente: 'Regina Souza', valor: 100 }),
    linha({ cliente: 'Regina Souza', valor: null }),
  ]);
  eq('continua 1 venda', v.length, 1);
  eq('valor_total é NULL — não se soma o que não se sabe', v[0].valorTotal, null);
  eq('fora do ticket médio', v[0].elegivelTicket, false);
}

console.log('\n── 8. ticket médio sai só do elegível');
{
  const linhas = [
    linha({ cliente: 'A', data: '2026-01-10', valor: 200 }),
    linha({ cliente: 'B', data: '2026-01-10', valor: 100 }),
    linha({ cliente: 'B', data: '2026-01-10', valor: 100 }),
    linha({ cliente: 'C', data: '2026-01-11', valor: 500, pago: 0 }),
    linha({ cliente: 'D', data: null, valor: 900 }),
    linha({ cliente: 'Inventário', data: '2026-01-12', valor: 0, pago: null, obs: 'PERDIDO' }),
  ];
  const v = reconstruirVendas(linhas);
  const el = v.filter((x) => x.elegivelTicket);
  eq('vendas elegíveis', el.length, 2);
  eq('faturamento elegível', el.reduce((s, x) => s + x.valorTotal, 0), 400);
  eq('ticket médio', el.reduce((s, x) => s + x.valorTotal, 0) / el.length, 200);

  const vendas = v.filter((x) => x.classe === 'venda');
  eq('vendas totais (inclui não paga e sem data)', vendas.length, 4);
  eq('e o ticket NÃO é faturamento/linhas', (200 + 100 + 100 + 500 + 900) / 5 !== 200, true);
}

console.log('\n── 9. canal e contexto do grupo');
{
  const um = reconstruirVendas([
    linha({ cliente: 'Kamila', canal: 'Maleta', contexto: 'Feira Franceschini' }),
    linha({ cliente: 'Kamila', canal: 'Maleta', contexto: 'Feira Franceschini' }),
  ]);
  eq('canal do grupo quando todos concordam', um[0].canal, 'Maleta');
  eq('contexto preservado', um[0].contexto, 'Feira Franceschini');

  const dois = reconstruirVendas([
    linha({ cliente: 'Kamila', canal: 'Maleta' }),
    linha({ cliente: 'Kamila', canal: 'Site' }),
  ]);
  eq('canais divergentes viram Misto, não um escolhido a esmo', dois[0].canal, 'Misto');
}

console.log('\n── 10. idempotência: a mesma entrada dá a mesma saída');
{
  const linhas = [
    linha({ cliente: 'Thais Nania', data: '2025-05-10' }),
    linha({ cliente: 'Brenda Vitachi', data: '2026-02-27' }),
    linha({ cliente: 'Thais Nania', data: '2025-05-10' }),
    linha({ cliente: 'Inventário', data: '2026-08-06', obs: 'PERDIDO', valor: 0, pago: null }),
  ];
  const a = JSON.stringify(reconstruirVendas(linhas));
  const b = JSON.stringify(reconstruirVendas(linhas));
  eq('duas reconstruções são idênticas', a === b, true);

  const embaralhado = [linhas[3], linhas[1], linhas[2], linhas[0]];
  const c = reconstruirVendas(embaralhado);
  eq('a ordem de entrada não muda o número de vendas', c.length, JSON.parse(a).length);
  eq('nem as chaves', JSON.stringify(c.map((x) => x.chave)),
    JSON.stringify(JSON.parse(a).map((x) => x.chave)));
}

console.log('\n── 11. rastreabilidade até a planilha');
{
  const v = reconstruirVendas([
    linha({ cliente: 'Evelyn Veiga', data: '2026-08-05' }),
    linha({ cliente: 'Evelyn Veiga', data: '2026-08-05' }),
  ]);
  eq('a venda guarda os Nº das linhas de origem', v[0].origemLinhas.length, 2);
  eq('e a regra que a formou', v[0].regra, 'mesmo cliente normalizado + mesma data');
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
