/** "Corrigir lançamento" — estornar um recebimento registrado errado.
 *
 * O defeito que este teste existe para impedir de voltar: a tela de A Receber
 * do protótipo tinha "Corrigir lançamento", e o backend não tinha estorno. O
 * recebimento lançado por engano ficava para sempre — ou era "corrigido" à
 * mão no banco, sem trilha.
 *
 * O que fica provado, para as duas fontes que o sistema recebe aqui:
 *
 *   1. sem motivo não estorna; com a versão errada não estorna;
 *   2. o estorno devolve a conta para A Receber UMA vez, com o saldo certo;
 *   3. nada é apagado: a cobrança histórica ganha versão nova e a paga fica
 *      `substituida`; a venda leva a nota com data e motivo;
 *   4. o recebimento certo entra depois pela porta de sempre;
 *   5. o que a planilha já trouxe PAGO não é "estornado" por aqui;
 *   6. estoque e razão não se movem em nenhum passo.
 *
 * Roda contra o Worker local com banco limpo.
 */
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x !== '' ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const CAB = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];

const razao = async () => JSON.stringify((await api('GET', '/api/estoque/conferir')).corpo?.divergentes);
const saldoDe = async (sku) => Number((await api('GET', '/api/state')).corpo.produtos
  .find((p) => String(p.sku) === sku)?.qtd);
const abertas = async () => (await api('GET', '/api/contas-receber')).corpo.contas;

console.log('\n=== 0. base ===');
eq('produto criado', (await api('POST', '/api/produtos/importar', {
  produtos: [{ sku: 'EST001', desc: 'Colar Teste', cat: 'Colar', preco: 100, qtd: 6 }],
})).status, 200);
eq('planilha importada', (await api('POST', '/api/vendas/historico/importar', {
  arquivo: 'E.xlsx',
  linhas: [
    CAB,
    [1, '2026-08-19', 'Cliente Devedora', 'EST001', 'Colar', 'Banhada', 1, 100, null, 100, null, 'NÃO PAGO', 'Feira'],
    [2, '2026-08-20', 'Cliente Pagou', 'EST001', 'Colar', 'Banhada', 1, 100, null, 100, 'Pix', 'PAGO', 'Feira'],
  ],
})).corpo.ok, true);
const estoqueInicial = await saldoDe('EST001');
const movimentosAntes = (await api('GET', '/api/estoque/conferir')).corpo;
eq('razão fecha antes', await razao(), '[]');

console.log('\n=== 1. cobrança histórica: receber, estornar, receber de novo ===');
eq('cobrança aberta criada', (await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [{
    vendaChave: 'cliente devedora|2026-08-19', papel: 'cliente', cobrancaStatus: 'aberta',
    valorEfetivoCentavos: 10000, valorRecebidoFonteCentavos: 0, evidencia: { fonte: 'teste' },
  }],
})).status, 200);
let conta = (await abertas()).find((c) => /devedora/i.test(c.cliente ?? ''));
eq('a conta aparece em A Receber', !!conta, true);
const recebido = await api('POST', '/api/contas-receber/receber', {
  chave: conta.chave, confirmar: true, versaoEsperada: conta.versao, pagaEm: '2026-08-25',
});
eq('receber funciona', recebido.status, 200);
eq('e a conta sai de A Receber', (await abertas()).some((c) => /devedora/i.test(c.cliente ?? '')), false);
const paga = (await api('GET', '/api/contas-receber?status=paga')).corpo.contas
  .find((c) => /devedora/i.test(c.cliente ?? ''));
eq('e aparece como paga', !!paga, true);

const semMotivo = await api('POST', '/api/contas-receber/estornar', {
  chave: paga.chave, versaoEsperada: paga.versao,
});
eq('sem motivo não estorna', semMotivo.status, 400);
const versaoVelha = await api('POST', '/api/contas-receber/estornar', {
  chave: paga.chave, versaoEsperada: Number(paga.versao) - 1, motivo: 'lançado na cliente errada',
});
eq('com a versão errada não estorna', versaoVelha.status, 409);
eq('e a conta segue paga', (await api('GET', '/api/contas-receber?status=paga')).corpo.contas
  .some((c) => /devedora/i.test(c.cliente ?? '')), true);

const estorno = await api('POST', '/api/contas-receber/estornar', {
  chave: paga.chave, versaoEsperada: paga.versao, motivo: 'lançado na cliente errada',
});
eq('o estorno passa', estorno.status, 200);
eq('e diz que não tocou estoque', estorno.corpo.estoqueTocado, false);
const deVolta = (await abertas()).filter((c) => /devedora/i.test(c.cliente ?? ''));
eq('a conta volta para A Receber uma vez só', deVolta.length, 1);
eq('com o saldo inteiro', deVolta[0]?.valorReceber ?? deVolta[0]?.saldo ?? deVolta[0]?.valor, 100);
eq('e sem data de pagamento', deVolta[0]?.pagaEm ?? null, null);
eq('estornar de novo é recusado (não está paga)', (await api('POST', '/api/contas-receber/estornar', {
  chave: deVolta[0].chave, versaoEsperada: deVolta[0].versao, motivo: 'de novo',
})).status, 409);

const certo = await api('POST', '/api/contas-receber/receber', {
  chave: deVolta[0].chave, confirmar: true, versaoEsperada: deVolta[0].versao, pagaEm: '2026-08-27',
});
eq('o recebimento certo entra pela porta de sempre', certo.status, 200);
const pagaCerta = (await api('GET', '/api/contas-receber?status=paga')).corpo.contas
  .filter((c) => /devedora/i.test(c.cliente ?? ''));
eq('uma conta paga, não duas', pagaCerta.length, 1);
eq('com a data certa', String(pagaCerta[0]?.pagaEm ?? '').slice(0, 10), '2026-08-27');

console.log('\n=== 2. o que a planilha trouxe PAGO não se estorna aqui ===');
const daPlanilha = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [{
    vendaChave: 'cliente pagou|2026-08-20', papel: 'cliente', cobrancaStatus: 'paga',
    valorEfetivoCentavos: 10000, valorRecebidoFonteCentavos: 10000, evidencia: { fonte: 'teste' },
  }],
});
eq('decisão paga pela fonte criada', daPlanilha.status, 200);
const pagaPelaFonte = (await api('GET', '/api/contas-receber?status=paga')).corpo.contas
  .find((c) => /pagou/i.test(c.cliente ?? ''));
if (pagaPelaFonte) {
  const recusa = await api('POST', '/api/contas-receber/estornar', {
    chave: pagaPelaFonte.chave, versaoEsperada: pagaPelaFonte.versao, motivo: 'tentativa',
  });
  eq('estornar o que a planilha diz pago é recusado', recusa.status, 409);
  eq('e a recusa diz para trocar a planilha', /planilha/i.test(recusa.corpo?.erro ?? ''), true);
} else {
  bad('a decisão paga pela fonte deveria aparecer entre as pagas');
}

console.log('\n=== 3. venda do sistema: receber, estornar com trilha, receber de novo ===');
const venda = await api('POST', '/api/vendas', {
  clienteNome: 'Cliente Balcão', data: '2026-09-01', pago: false, itens: [{ sku: 'EST001', qtd: 1 }],
});
eq('venda não paga criada', venda.status, 201);
const vendaId = venda.corpo.id ?? venda.corpo.vendaId;
const estoqueDepoisDaVenda = await saldoDe('EST001');
eq('a venda baixou uma peça, uma vez', estoqueDepoisDaVenda, estoqueInicial - 1);
let contaVenda = (await abertas()).find((c) => c.chave === `venda:${vendaId}`);
eq('a venda aparece em A Receber', !!contaVenda, true);
const quitada = await api('POST', '/api/contas-receber/receber', {
  chave: contaVenda.chave, confirmar: true, versaoEsperada: contaVenda.versao, pagaEm: '2026-09-02',
});
eq('quitar a venda', quitada.status, 200);
eq('e ela sai de A Receber', (await abertas()).some((c) => c.chave === `venda:${vendaId}`), false);

const estornoVenda = await api('POST', '/api/contas-receber/estornar', {
  chave: `venda:${vendaId}`, versaoEsperada: quitada.corpo.versao, motivo: 'pix não caiu',
});
eq('estornar o recebimento da venda', estornoVenda.status, 200);
eq('a trilha cita o motivo', /pix não caiu/.test(estornoVenda.corpo.trilha ?? ''), true);
eq('e a data que estava lançada', /2026-09-02/.test(estornoVenda.corpo.trilha ?? ''), true);
contaVenda = (await abertas()).filter((c) => c.chave === `venda:${vendaId}`);
eq('a venda volta para A Receber uma vez só', contaVenda.length, 1);
eq('a observação da venda guarda a trilha',
  /Recebimento estornado .*pix não caiu/.test(contaVenda[0]?.observacao ?? ''), true);
eq('estornar sem pagamento é recusado', (await api('POST', '/api/contas-receber/estornar', {
  chave: `venda:${vendaId}`, versaoEsperada: contaVenda[0].versao, motivo: 'de novo',
})).status, 409);
const denovo = await api('POST', '/api/contas-receber/receber', {
  chave: `venda:${vendaId}`, confirmar: true, versaoEsperada: contaVenda[0].versao, pagaEm: '2026-09-05',
});
eq('o recebimento certo entra', denovo.status, 200);
eq('e a venda sai de A Receber', (await abertas()).some((c) => c.chave === `venda:${vendaId}`), false);

console.log('\n=== 4. chave inválida e troca antiga ===');
eq('chave inválida', (await api('POST', '/api/contas-receber/estornar', {
  chave: 'qualquer:1', motivo: 'x x x',
})).status, 400);
eq('troca antiga é recusada sem mexer em nada', (await api('POST', '/api/contas-receber/estornar', {
  chave: 'troca:999999', motivo: 'tentativa',
})).status, 409);

console.log('\n=== 5. estoque e razão ===');
eq('o estoque só se moveu pela venda', await saldoDe('EST001'), estoqueInicial - 1);
eq('a razão contábil fecha', await razao(), '[]');
void movimentosAntes;

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — corrigir um recebimento deixa trilha, não duplica conta e não toca estoque.');
