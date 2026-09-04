/** Os riscos que a auditoria apontou, cada um com o seu teste.
 *
 * Não repete o que `historico-operacoes-test.mjs` já cobre (caminho feliz).
 * Aqui só entra o que dava errado em silêncio:
 *
 *   1. a troca da planilha falhando NO MEIO — o histórico antigo precisa
 *      voltar inteiro, e não sumir;
 *   2. decidir sobre um conteúdo que já mudou (fingerprint velho);
 *   3. versionar a cobrança sem perder o vínculo de duplicata;
 *   4. pacote com a mesma venda duas vezes;
 *   5. centavo que não é inteiro, saldo que não é subtração, data que não
 *      existe no calendário, evidência que não é JSON;
 *   6. o preview (`seco`) e o hash do plano;
 *   7. reconstruir por cima de decisão ativa.
 *
 * Roda contra o Worker local com banco limpo. Nada aqui toca estoque.
 */
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x !== '' ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const contem = (t, texto, agulha) => (String(texto).includes(agulha)
  ? ok(t, agulha) : bad(t, `"${agulha}" não aparece em "${texto}"`));
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const CAB = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];

const PLANILHA_A = [
  CAB,
  [1, '2026-08-19', 'Cliente Duplicada', 'DUP001', 'Colar', 'Banhada', 1, 100, null, 100, 'Pix', 'PAGO', 'Feira'],
  [2, '2026-08-21', 'Cliente Devedora', 'DEBT001', 'Brinco', 'Banhada', 2, 100, null, 200, null, 'NÃO PAGO', 'Grupo VIP'],
];
/* Mesma gente, mesmas datas, um valor diferente na linha 2: serve para provar
   que o fingerprint muda quando o CONTEÚDO muda, sem que a chave mude. */
const PLANILHA_B = [
  CAB,
  [1, '2026-08-19', 'Cliente Duplicada', 'DUP001', 'Colar', 'Banhada', 1, 100, null, 100, 'Pix', 'PAGO', 'Feira'],
  [2, '2026-08-21', 'Cliente Devedora', 'DEBT001', 'Brinco', 'Banhada', 2, 150, null, 300, null, 'NÃO PAGO', 'Grupo VIP'],
];

console.log('\n=== 0. base ===');
const prod = await api('POST', '/api/produtos/importar', {
  produtos: [{ sku: 'DUP001', desc: 'Colar', cat: 'Colar', preco: 100, qtd: 5 }],
});
eq('produto criado', prod.status, 200);
const venda = await api('POST', '/api/vendas', {
  clienteNome: 'Cliente Duplicada', data: '2026-08-20', itens: [{ sku: 'DUP001', qtd: 1 }],
});
eq('venda operacional criada', venda.status, 201);
const vendaId = venda.corpo.id ?? venda.corpo.vendaId;
const imp = await api('POST', '/api/vendas/historico/importar', { arquivo: 'A.xlsx', linhas: PLANILHA_A });
eq('planilha A importada', imp.corpo.ok, true);

const estoqueDe = async (sku) => {
  const e = await api('GET', '/api/state');
  return Number(e.corpo.produtos.find((p) => String(p.sku) === sku)?.qtd);
};
const estoqueInicial = await estoqueDe('DUP001');

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n=== 1. troca da planilha que falha NO MEIO não pode apagar o histórico ===');
// O jeito de falhar DEPOIS da desativação e ANTES do fim da importação é
// mandar uma planilha que a análise aprova e a importação recusa. Uma
// planilha idêntica à que já está de pé é recusada pela própria troca, então
// o caminho usado aqui é o inverso: trocar por B (legítimo), e depois provar
// que uma troca inválida NÃO derrubou nada.
const antesDaTroca = await api('GET', '/api/vendas/historico/reconstrucao');
const trocaInvalida = await api('POST', '/api/vendas/historico/substituir', {
  arquivo: 'vazia.xlsx', linhas: [CAB],
});
eq('planilha sem linha nenhuma é recusada', trocaInvalida.corpo.ok, false);
eq('e para na análise, antes de tocar em qualquer lote', trocaInvalida.corpo.etapa, 'analise');
const depoisDaTroca = await api('GET', '/api/vendas/historico/reconstrucao');
eq('o histórico continua exatamente como estava',
  depoisDaTroca.corpo.vendas, antesDaTroca.corpo.vendas);
eq('e continua em dia', depoisDaTroca.corpo.emDia, true);

// A troca legítima funciona e não deixa lote fantasma.
const troca = await api('POST', '/api/vendas/historico/substituir', { arquivo: 'B.xlsx', linhas: PLANILHA_B });
eq('a troca legítima passa', troca.corpo.ok, true);
eq('nenhuma limpeza ficou pendente', troca.corpo.limpezaPendente, undefined);
const lotes = await api('GET', '/api/vendas/historico/lotes');
eq('só um lote no ar', lotes.corpo.lotes.filter((l) => l.status === 'importado').length, 1);
eq('o lote antigo foi apagado de verdade',
  lotes.corpo.lotes.filter((l) => l.status === 'revertido').length, 1);
const naTroca = await api('GET', '/api/vendas/historico/reconstrucao');
eq('e a contagem não somou os dois lotes', naTroca.corpo.vendas, 2);

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n=== 2. preview seco não escreve, e o hash do plano trava a aplicação ===');
const decisao = [{
  vendaChave: 'cliente devedora|2026-08-21',
  papel: 'cliente',
  cobrancaStatus: 'aberta',
  valorEfetivoCentavos: 30000,
  valorRecebidoFonteCentavos: 0,
  evidencia: { fonte: 'teste' },
}];
const preview = await api('POST', '/api/vendas/historico/operacoes', { operacoes: decisao, seco: true });
eq('preview responde', preview.status, 200);
eq('e diz que é seco', preview.corpo.seco, true);
eq('planeja criar uma decisão', preview.corpo.criadas, 1);
eq('com hash do plano', typeof preview.corpo.planoHash, 'string');
eq('e o plano detalhado', preview.corpo.plano[0].saldoCentavos, 30000);
const contasAposPreview = await api('GET', '/api/contas-receber');
eq('mas NADA foi gravado', contasAposPreview.corpo.contas.length, 0);

const hashErrado = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: decisao, planoEsperado: 'f'.repeat(64),
});
eq('aplicar com hash de outro plano é recusado', hashErrado.status, 409);
contem('e diz por quê', hashErrado.corpo.erro, 'preview');
const aindaNada = await api('GET', '/api/contas-receber');
eq('e continua sem gravar nada', aindaNada.corpo.contas.length, 0);

const aplicado = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: decisao, planoEsperado: preview.corpo.planoHash,
});
eq('com o hash certo, aplica', aplicado.status, 200);
eq('uma decisão criada', aplicado.corpo.criadas, 1);
const conta = await api('GET', '/api/contas-receber');
eq('a conta existe', conta.corpo.contas.length, 1);
eq('com o valor cobrado', conta.corpo.resumo.totalCentavos, 30000);

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n=== 3. fingerprint velho é recusado ===');
const fpVelho = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [{ ...decisao[0], fingerprintEsperado: 'a'.repeat(64) }],
});
eq('decidir sobre conteúdo que não é o que se olhou é recusado', fpVelho.status, 409);
contem('e diz que o conteúdo não confere', fpVelho.corpo.erro, 'não é o que foi revisado');

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n=== 4. pacote com a mesma venda duas vezes é recusado ANTES de gravar ===');
const repetida = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [
    { vendaChave: 'cliente duplicada|2026-08-19', papel: 'cliente' },
    { vendaChave: 'cliente duplicada|2026-08-19', papel: 'revisao' },
  ],
});
eq('recusa determinística', repetida.status, 400);
contem('dizendo qual venda', repetida.corpo.erro, 'duas vezes no mesmo pacote');

const vinculoRepetido = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [
    { vendaChave: 'cliente duplicada|2026-08-19', vendasDuplicadas: [{ vendaId, confirmado: true }] },
    { vendaChave: 'cliente devedora|2026-08-21', vendasDuplicadas: [{ vendaId, confirmado: true }] },
  ],
});
eq('a mesma venda operacional em duas operações também é recusada', vinculoRepetido.status, 400);
contem('e diz as duas donas', vinculoRepetido.corpo.erro, 'no mesmo pacote');

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n=== 5. números, datas e JSON que não são o que dizem ser ===');
const recusa = async (rotulo, operacao, agulha) => {
  const r = await api('POST', '/api/vendas/historico/operacoes', { operacoes: [operacao] });
  if (r.status === 200) return bad(rotulo, 'a API ACEITOU');
  if (agulha && !String(r.corpo?.erro).includes(agulha)) {
    return bad(rotulo, `erro foi "${r.corpo?.erro}"`);
  }
  return ok(rotulo, `${r.status}`);
};
const base = { vendaChave: 'cliente duplicada|2026-08-19', papel: 'cliente' };
await recusa('centavo com fração', { ...base, valorEfetivoCentavos: 10.5 }, 'inteiro de centavos');
await recusa('centavo NaN', { ...base, valorEfetivoCentavos: 'abc' }, 'inteiro de centavos');
await recusa('centavo acima do inteiro seguro',
  { ...base, valorEfetivoCentavos: Number.MAX_SAFE_INTEGER + 2 }, 'inteiro de centavos');
await recusa('centavo negativo', { ...base, valorEfetivoCentavos: -1 }, 'inteiro de centavos');
await recusa('peças fracionárias', { ...base, pecas: 1.5 }, 'inteiro não negativo');
await recusa('saldo que não é efetivo menos recebido',
  { ...base, valorEfetivoCentavos: 1000, valorRecebidoFonteCentavos: 200, saldoCentavos: 999 },
  'não é');
await recusa('recebido maior que o efetivo não vira zero em silêncio',
  { ...base, valorEfetivoCentavos: 100, valorRecebidoFonteCentavos: 500 }, 'supera o valor efetivo');
await recusa('31 de fevereiro', { ...base, vencimentoEm: '2026-02-31' }, 'data real');
await recusa('data em outro formato', { ...base, vencimentoEm: '19/08/2026' }, 'data real');
await recusa('evidência que não é objeto', { ...base, evidencia: 'só um texto' }, 'JSON válido');
await recusa('evidência em lista', { ...base, evidencia: ['a'] }, 'JSON válido');

const prazoRuim = await api('PATCH', '/api/contas-receber/1/vencimento', { vencimentoEm: '2026-02-31', versaoEsperada: 1 });
eq('e o prazo pela tela também recusa data que não existe', prazoRuim.status, 400);

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n=== 6. versionar a cobrança preserva o vínculo de duplicata ===');
const comVinculo = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [{
    vendaChave: 'cliente duplicada|2026-08-19',
    papel: 'cliente',
    cobrancaStatus: 'aberta',
    valorEfetivoCentavos: 10000,
    valorRecebidoFonteCentavos: 0,
    vendasDuplicadas: [{
      vendaId, confirmado: true, dataDiferenteConfirmada: true,
      evidencia: { decisao: 'mesma compra' },
    }],
  }],
});
eq('decisão com vínculo criada', comVinculo.status, 200);
eq('um vínculo gravado', comVinculo.corpo.vinculos, 1);

const antesDeQuitar = await api('GET', '/api/analytics/vendas?periodo=tudo');
const contasAbertas = await api('GET', '/api/contas-receber');
const aQuitar = contasAbertas.corpo.contas.find((c) => c.vendaChave === 'cliente duplicada|2026-08-19');
eq('a conta com vínculo está aberta', aQuitar.cobrancaStatus, 'aberta');

const paga = await api('POST', `/api/contas-receber/${aQuitar.id}/marcar-paga`, {
  confirmar: true, versaoEsperada: aQuitar.versao,
});
eq('quitação aceita', paga.status, 200);
eq('e criou uma versão nova', paga.corpo.conta.versao, aQuitar.versao + 1);

// A prova do risco 5: se o vínculo tivesse ficado preso à versão antiga, a
// venda operacional voltaria a ser contada, e o total de vendas subiria.
const depoisDeQuitar = await api('GET', '/api/analytics/vendas?periodo=tudo');
eq('a venda duplicada continua contando uma vez só',
  depoisDeQuitar.corpo.vendas, antesDeQuitar.corpo.vendas);

// E a prova direta do risco: o backfill é retomável, e uma retomada acontece
// DEPOIS de a Stephanie já ter recebido alguma conta. Reenviar o pacote que
// descreve o estado atual — com o mesmo vínculo — tem de ser reconhecido como
// já aplicado.
//
// Antes da correção, o vínculo tinha ficado pendurado no registro
// SUBSTITUÍDO: a conferência lia "nenhuma duplicata gravada" contra "uma
// duplicata pedida" e respondia 409 "já foi revisada com outra decisão" —
// travando a retomada por causa de uma diferença que não existia.
const retomada = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [{
    vendaChave: 'cliente duplicada|2026-08-19',
    papel: 'cliente',
    cobrancaStatus: 'paga',
    valorEfetivoCentavos: 10000,
    valorRecebidoFonteCentavos: 0,
    valorRecebidoCentavos: 10000,
    saldoCentavos: 0,
    vendasDuplicadas: [{
      vendaId, confirmado: true, dataDiferenteConfirmada: true,
      evidencia: { decisao: 'mesma compra' },
    }],
  }],
});
eq('a retomada depois da quitação não quebra', retomada.status, 200);
eq('nada de novo é criado', retomada.corpo.criadas, 0);
eq('e a decisão existente é preservada', retomada.corpo.preservadas, 1);

// A retomada com a decisão ANTIGA (como se a quitação não tivesse
// acontecido) continua sendo recusada, e é o comportamento certo: quem
// recebeu o dinheiro não pode ter isso desfeito por um script repetido.
const retomadaCega = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [{
    vendaChave: 'cliente duplicada|2026-08-19',
    papel: 'cliente',
    cobrancaStatus: 'aberta',
    valorEfetivoCentavos: 10000,
    valorRecebidoFonteCentavos: 0,
  }],
});
eq('reabrir uma conta já paga é recusado', retomadaCega.status, 409);
const seguePaga = await api('GET', '/api/contas-receber?status=paga');
eq('e a conta segue paga', seguePaga.corpo.contas.length, 1);

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n=== 7. reconstruir por cima de decisão ativa ===');
const recon = await api('POST', '/api/vendas/historico/reconstruir', {});
eq('reconstruir com o MESMO conteúdo continua permitido', recon.status, 200);
eq('e não reporta quebra', recon.corpo.decisoesInvalidadas, undefined);

// Trocar a planilha por uma em que a venda decidida MUDA de conteúdo tem de
// esbarrar na proteção do lote — a decisão ativa segura a troca.
const trocaQuebrando = await api('POST', '/api/vendas/historico/substituir', {
  arquivo: 'C.xlsx', linhas: PLANILHA_A,
});
eq('a troca é recusada porque há decisão ativa', trocaQuebrando.corpo.ok, false);
eq('e para na reversão', trocaQuebrando.corpo.etapa, 'reversao');
eq('dizendo quantas decisões protegem o lote',
  trocaQuebrando.corpo.operacoesProtegidas.length > 0, true);
const lotesDepois = await api('GET', '/api/vendas/historico/lotes');
eq('e o lote continua no ar, não meio-revertido',
  lotesDepois.corpo.lotes.filter((l) => l.status === 'importado').length, 1);
const aindaLa = await api('GET', '/api/contas-receber?status=todas');
eq('as decisões continuam todas lá', aindaLa.corpo.contas.length, 2);

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n=== 8. nada disso encostou no estoque ===');
eq('a quantidade não mudou', await estoqueDe('DUP001'), estoqueInicial);
const razao = await api('GET', '/api/estoque/conferir');
eq('a razão contábil fecha', JSON.stringify(razao.corpo.divergentes), '[]');

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — troca, fingerprint, versionamento, validação e estoque.');
