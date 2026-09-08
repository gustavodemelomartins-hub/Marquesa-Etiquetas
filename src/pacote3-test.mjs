/** Pacote 3 — coerência do Painel analítico de Vendas.
 *
 * Rode contra um D1 local limpo. A prova usa datas relativas para manter os
 * filtros 30d/90d/12m válidos sem depender do dia em que a suíte é executada.
 */
const API = process.env.API_URL || process.argv[2] || 'http://127.0.0.1:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x !== '' ? `  → ${x}` : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? `  → ${x}` : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));
const verdade = (t, x, d = '') => (x ? ok(t, d) : bad(t, d));
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const iso = (dias = 0) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};
const hoje = iso();
const mes = hoje.slice(0, 7);
const vencimentoMes = `${mes}-28`;

async function venda({ cliente, dias, sku, pagarEm = null }) {
  const r = await api('POST', '/api/vendas', {
    clienteNome: cliente, data: iso(dias), pago: false, itens: [{ sku, qtd: 1 }],
  });
  eq(`venda ${cliente}`, r.status, 201);
  if (pagarEm !== null) {
    const p = await api('POST', `/api/vendas/${r.corpo.id}/pagamento`, { dataPagamento: iso(pagarEm) });
    eq(`pagamento ${cliente}`, p.status, 200);
  }
  return r.corpo;
}

console.log('\n=== 1. cenário controlado ===');
eq('catálogo', (await api('POST', '/api/produtos/importar', { produtos: [
  { sku: '333301', desc: 'Brinco Analítico', cat: 'Brinco', preco: 100, qtd: 30 },
  { sku: '333302', desc: 'Colar Analítico', cat: 'Colar', preco: 80, qtd: 30 },
] })).status, 200);

await venda({ cliente: 'P3 Fora de 12 meses', dias: -400, sku: '333301', pagarEm: -400 });
await venda({ cliente: 'P3 Venda antiga paga agora', dias: -60, sku: '333302', pagarEm: 0 });
await venda({ cliente: 'P3 Dentro de 30 dias', dias: -20, sku: '333301', pagarEm: -20 });
const comPrazo = await venda({ cliente: 'P3 A receber no mes', dias: 0, sku: '333301' });
await venda({ cliente: 'P3 A receber sem prazo', dias: 0, sku: '333301' });
eq('prazo no mês', (await api('PATCH', '/api/contas-receber/prazo', {
  chave: `venda:${comPrazo.id}`, vencimentoEm: vencimentoMes,
})).status, 200);

console.log('\n=== 2. filtros aninhados e duas datas ===');
const periodos = {};
for (const periodo of ['tudo', '12m', '90d', '30d']) {
  const [painel, geral, evolucao] = await Promise.all([
    api('GET', `/api/analytics/painel?periodo=${periodo}`),
    api('GET', `/api/analytics/vendas?periodo=${periodo}`),
    api('GET', `/api/analytics/evolucao?periodo=${periodo}&granularidade=mes`),
  ]);
  eq(`painel ${periodo}`, painel.status, 200);
  eq(`visão geral ${periodo}`, geral.status, 200);
  eq(`evolução ${periodo}`, evolucao.status, 200);
  eq(`mesmo faturamento em ${periodo}`, painel.corpo.geral.faturamento, geral.corpo.faturamento);
  eq(`mesmas vendas em ${periodo}`, painel.corpo.geral.vendas, geral.corpo.vendas);
  eq(`mesma série em ${periodo}`,
    JSON.stringify(painel.corpo.evolucao.pontos), JSON.stringify(evolucao.corpo.pontos));
  eq(`payload identifica ${periodo}`, painel.corpo.periodo.periodo, periodo);
  periodos[periodo] = painel.corpo;
}

eq('30 dias contam três vendas', periodos['30d'].geral.vendas, 3);
eq('90 dias contam quatro vendas', periodos['90d'].geral.vendas, 4);
eq('12 meses contam quatro vendas', periodos['12m'].geral.vendas, 4);
eq('Tudo conta cinco vendas', periodos.tudo.geral.vendas, 5);
eq('venda de 60d paga hoje entra no faturamento de 30d', periodos['30d'].geral.faturamento, 180);
eq('mas não vira venda de 30d', periodos['30d'].geral.vendas, 3);
eq('e não desenha julho fora do filtro de 30d',
  periodos['30d'].evolucao.pontos.some((p) => p.chave === iso(-60).slice(0, 7)), false);
eq('Tudo inclui também os R$ 100 antigos', periodos.tudo.geral.faturamento, 280);
verdade('as contagens crescem com o período',
  periodos['30d'].geral.vendas <= periodos['90d'].geral.vendas
  && periodos['90d'].geral.vendas <= periodos['12m'].geral.vendas
  && periodos['12m'].geral.vendas <= periodos.tudo.geral.vendas);

console.log('\n=== 3. KPI mensal de cobrança ===');
eq('faturamento do mês segue pagamento', periodos.tudo.mesAtual.faturamento, 80);
eq('vendas do mês seguem data da venda', periodos.tudo.mesAtual.vendas, 2);
eq('peças do mês seguem data da venda', periodos.tudo.mesAtual.pecas, 2);
for (const periodo of ['tudo', '12m', '90d', '30d']) {
  eq(`mês corrente não muda com filtro ${periodo}`, periodos[periodo].mesAtual.mes, mes);
  eq(`a receber do mês não muda com filtro ${periodo}`, periodos[periodo].mesAtual.aReceber, 100);
  eq(`uma conta com vencimento no mês em ${periodo}`, periodos[periodo].mesAtual.contasAReceber, 1);
}
eq('total aberto preserva também a conta sem prazo', periodos.tudo.contasReceber.resumo.total, 200);
eq('duas contas continuam auditáveis', periodos.tudo.contasReceber.resumo.quantidade, 2);

console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
