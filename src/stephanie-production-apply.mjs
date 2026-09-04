/**
 * Aplicacao unica e retomavel da reconciliacao Stephanie (2026-09-03).
 *
 * Este arquivo escreve no alvo informado em API_URL. Por seguranca, exige
 * duas travas textuais e nunca possui URL nem chave padrao. Antes de cada
 * bloco ele confere o estado atual; uma repeticao preserva decisoes ja
 * aplicadas e cria somente o que ainda falta.
 *
 * Uso no ensaio local:
 *   MARQUESA_TARGET=ENSAIO_LOCAL
 *   MARQUESA_APPLY=APLICAR_STEPHANIE_2026_09_03
 *   API_URL=http://127.0.0.1:8787
 *   API_KEY=...
 *
 * PRODUCAO requer MARQUESA_TARGET=PRODUCAO e autorizacao humana separada.
 */
import * as XLSX from './node_modules/xlsx/xlsx.mjs';
import * as fs from 'node:fs';

XLSX.set_fs(fs);

const API = String(process.env.API_URL || '').replace(/\/$/, '');
const KEY = String(process.env.API_KEY || '');
const ALVO = String(process.env.MARQUESA_TARGET || '');
const TRAVA = String(process.env.MARQUESA_APPLY || '');
/* O caminho da máquina do Gustavo continua sendo o padrão, mas deixa de ser
 * a única possibilidade: sem `MARQUESA_XLSX` este arquivo só roda num Windows
 * específico, e um ensaio que só uma máquina consegue fazer não é um ensaio. */
const ARQUIVO = process.env.MARQUESA_XLSX || 'C:\\Users\\User\\Downloads\\Vendas Marquesa (3).xlsx';

if (!API || !KEY) throw new Error('API_URL e API_KEY sao obrigatorios; nao existe alvo padrao.');
if (!['ENSAIO_LOCAL', 'PRODUCAO'].includes(ALVO)) {
  throw new Error('MARQUESA_TARGET deve ser ENSAIO_LOCAL ou PRODUCAO.');
}
if (TRAVA !== 'APLICAR_STEPHANIE_2026_09_03') {
  throw new Error('Trava ausente: defina MARQUESA_APPLY=APLICAR_STEPHANIE_2026_09_03.');
}

// O erro que as duas travas de cima NAO pegam e o mais facil de cometer:
// dizer PRODUCAO e apontar para o Worker local, ou dizer ENSAIO_LOCAL e
// apontar para a nuvem. As duas variaveis existem, as duas estao
// preenchidas, e mesmo assim o alvo nao e o que a pessoa pensa.
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(API);
if (ALVO === 'PRODUCAO' && LOCAL) {
  throw new Error(`MARQUESA_TARGET=PRODUCAO com API_URL local (${API}). Um dos dois esta errado.`);
}
if (ALVO === 'ENSAIO_LOCAL' && !LOCAL) {
  throw new Error(`MARQUESA_TARGET=ENSAIO_LOCAL com API_URL remoto (${API}). `
    + 'Um ensaio contra a nuvem nao e um ensaio.');
}

const api = async (metodo, caminho, corpo) => {
  const resposta = await fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`${metodo} ${caminho} -> ${resposta.status}: ${JSON.stringify(dados)}`);
  }
  return dados;
};

const exigir = (condicao, mensagem) => {
  if (!condicao) throw new Error(`Conferencia recusou a operacao: ${mensagem}`);
};
const centavos = (valor) => Math.round(Number(valor || 0) * 100);
const totalEstoque = (estado) => estado.produtos.reduce((s, p) => s + Number(p.qtd || 0), 0);
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const novosDoEstoque = [
  ['697789', 'Pulseira Elos Oval Banho de Ouro 18k', 'Pulseira', 5, 159],
  ['599522', 'Pulseira Cartier Oval Banho de Ouro 18k', 'Pulseira', 10, 109],
  ['670215', 'Pulseira Masculina Elo Oval Banho de Ouro 18k', 'Pulseira', 5, 169],
  ['529589', 'Pingente Cadeado Banho de Ouro 18k', 'Pingente', 1, 39],
  ['527523', 'Pingente Sao Jose Banho de Ouro 18k', 'Pingente', 1, 39],
  ['513566', 'Pingente Nossa Senhora de Guadalupe Banho de Ouro 18k', 'Pingente', 2, 39],
  ['520270', 'Pingente Nossa Senhora de Fatima Banho de Ouro 18k', 'Pingente', 4, 39],
  ['574680', 'Pingente Nossa Senhora Aparecida Banho de Ouro 18k', 'Pingente', 2, 39],
  ['563054', 'Pingente Sao Miguel Arcanjo Banho de Ouro 18k', 'Pingente', 3, 39],
  ['481514', 'Pulseira Cadeia de Consagracao Medalha e Cadeado Banho de Ouro 18k', 'Pulseira', 1, 194],
  ['484220', 'Pulseira Cadeia de Consagracao Medalha Banho de Ouro 18k', 'Pulseira', 1, 179],
  ['454953', 'Pulseira Cadeia de Consagracao Medalha e Cadeado Banho de Ouro 18k', 'Pulseira', 1, 159],
  ['483454', 'Pulseira Cadeia de Consagracao Medalha Banho de Ouro 18k', 'Pulseira', 1, 139],
  ['457541', 'Pulseira Cadeia de Consagracao Masculina Medalha Banho de Ouro 18k', 'Pulseira', 1, 209],
  ['420020', 'Pulseira Cadeia de Consagracao Masculina Duas Medalha Banho de Ouro 18k', 'Pulseira', 1, 189],
];

const vendidosEsgotados = [
  ['508952', 'Pingente Nossa Senhora das Gracas Banho de Ouro 18k', 'Pingente', 0, 39],
  ['399872', 'Colar Filhos Duas Meninas e Um Menino Banho de Ouro 18k', 'Colar', 0, 129],
];

const alvosExistentes = new Map([
  ['420935', 1], ['233280', 2], ['171241', 3], ['190359', 1], ['466730', 3],
  ['327653', 1], ['647729', 7], ['317225', 1], ['252668', 1], ['229297', 1],
  ['263236', 5], ['584162', 1], ['350039', 1], ['155148', 5], ['123184', 4],
  ['126826', 0], ['153244', 0], ['158154', 0], ['163505', 0], ['165683', 0],
  ['316382', 0], ['384665', 0], ['420967', 0], ['789166', 0], ['838474', 0],
]);

const duplicatas = [
  [4, 'jocasta lima|2026-08-21'], [5, 'maria lima|2026-08-21'],
  [6, 'endy michelle|2026-08-21'], [7, 'juliana carvalho|2026-08-21'],
  [8, 'eliana nicolau|2026-08-21'], [9, 'thais domingos|2026-08-21'],
  [10, 'sandra alcantara|2026-08-21'], [11, 'glau pivato|2026-08-21'],
  [12, 'julia tragino|2026-08-21'], [13, 'larissa tragino|2026-08-21'],
].map(([vendaId, vendaChave]) => ({
  vendaChave,
  papel: 'cliente',
  vendasDuplicadas: [{
    vendaId,
    confirmado: true,
    dataDiferenteConfirmada: true,
    ...(vendaId === 10 ? { clienteDiferenteConfirmado: true } : {}),
    evidencia: { decisao: 'Confirmado pelo responsavel: lancamento do sistema repete a planilha.' },
  }],
}));

const contas = [
  ['bruna santos|2026-06-24', 4100], ['cinthia noronha|2026-07-06', 15900],
  ['cinthia noronha|2026-07-19', 48700], ['iris melo|2026-07-19', 32100],
  ['bruna santos|2026-07-24', 7560], ['simone teixeira|2026-07-24', 10659],
  ['leandro marques|2026-07-26', 6900], ['simone teixeira|2026-08-14', 14900],
  ['vivan almeida|2026-08-30', 11730],
].map(([vendaChave, valorEfetivoCentavos]) => ({
  vendaChave,
  papel: 'cliente',
  cobrancaStatus: 'aberta',
  valorEfetivoCentavos,
  valorRecebidoFonteCentavos: 0,
  evidencia: { fonte: 'Status NAO PAGO em Vendas Marquesa (3).xlsx' },
}));

async function aprovarEAplicar(sessao) {
  for (const item of sessao.itens) {
    await api('POST', `/api/reconciliacao/${sessao.id}/itens/${item.id}/aprovar`);
  }
  const resultado = await api('POST', `/api/reconciliacao/${sessao.id}/aplicar`);
  exigir(resultado.status === 'aplicada', `sessao ${sessao.id} terminou como ${resultado.status}`);
  return resultado;
}

console.log(`\nAlvo confirmado: ${ALVO} (${API})`);
console.log('1/5 Conferindo razao e planilha de vendas...');
let razao = await api('GET', '/api/estoque/conferir');
exigir(Array.isArray(razao.divergentes) && razao.divergentes.length === 0, 'razao de estoque ja estava divergente');

const wb = XLSX.readFile(ARQUIVO, { raw: true, cellDates: false });
const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
const analise = await api('POST', '/api/vendas/historico/analisar', { arquivo: 'Vendas Marquesa (3).xlsx', linhas });
exigir(analise.linhas === 1375 && analise.pecas === 1394, `planilha inesperada: ${analise.linhas} linhas/${analise.pecas} pecas`);
if (!analise.jaImportado) {
  const troca = await api('POST', '/api/vendas/historico/substituir', { arquivo: 'Vendas Marquesa (3).xlsx', linhas });
  exigir(troca.depois?.linhas === 1375 && troca.depois?.vendas === 711, 'troca do historico nao fechou em 1375/711');
  exigir(troca.conferencia?.estoqueIntocado === true, 'troca do historico tocou estoque');
  console.log('  historico substituido');
} else {
  console.log(`  historico correto ja estava ativo (lote ${analise.jaImportado.loteId})`);
}

console.log('2/5 Resolvendo papeis, duplicatas, acertos e contas a receber...');
let estado = await api('GET', '/api/state');
const acharRevendedora = (nome) => estado.revendedoras.find((r) => normalizar(r.nome) === normalizar(nome));
let jessica = acharRevendedora('Jessica da Silva Melim');
if (!jessica) {
  jessica = await api('POST', '/api/revendedoras', {
    nome: 'Jessica da Silva Melim',
    obs: 'Historico reconstruido das maletas 1 e 2.',
  });
  estado = await api('GET', '/api/state');
  jessica = acharRevendedora('Jessica da Silva Melim');
}
const andreia = acharRevendedora('Andreia Souza');
const evelyn = acharRevendedora('Evelyn Veiga');
exigir(andreia && evelyn && jessica, 'nao localizei Andreia, Evelyn e Jessica como revendedoras');
if (jessica.status !== 'inativa') await api('PATCH', `/api/revendedoras/${jessica.id}`, { status: 'inativa' });

const acertos = [
  {
    vendaChave: 'andreia souza|2026-06-19', papel: 'acerto', revendedoraId: andreia.id,
    pecas: 10, brutoCentavos: 80000, comissaoCentavos: 12000, liquidoCentavos: 68000,
    evidencia: { arquivo: 'Andreia Souza - Maleta 1.xlsx', tipo: 'acerto documental' },
  },
  {
    vendaChave: 'evelyn veiga|2026-08-05', papel: 'acerto', revendedoraId: evelyn.id,
    pecas: 26, brutoCentavos: 207900, comissaoCentavos: 60590, liquidoCentavos: 147310,
    linhasExcluidas: ['1303'],
    evidencia: { arquivo: 'Evelyn Veiga - Maleta 1.xlsx', linha1303: 'troca de R$ 10, nao venda' },
  },
  {
    vendaChave: 'jessica melim|2026-06-13', papel: 'acerto', revendedoraId: jessica.id,
    pecas: 36, brutoCentavos: 343100, comissaoCentavos: 106220, liquidoCentavos: 236880,
    evidencia: { arquivo: 'Jessica da Silva Melim - Maleta 1.xlsx', conflito: 'documento supera precos historicos em R$ 47' },
  },
  {
    vendaChave: 'jessica melim|2026-07-18', papel: 'acerto', revendedoraId: jessica.id,
    pecas: 8, brutoCentavos: 81700, comissaoCentavos: 12255, liquidoCentavos: 69445,
    evidencia: { arquivo: 'Jessica da Silva Melim - Maleta 2.xlsx', tipo: 'acerto documental' },
  },
];
// Uma retomada nao pode reabrir uma conta que a Stephanie ja marcou como
// paga, nem apagar um prazo que ela definiu depois da carga. So enviamos a
// decisao-base quando a compra ainda nao possui decisao financeira. Se ja
// possui, conferimos o valor e preservamos a versao mais nova.
const contasAindaSemDecisao = [];
for (const conta of contas) {
  const [nomeNorm, data] = conta.vendaChave.split('|');
  const perfil = await api('GET', `/api/clientes/perfil?norm=${encodeURIComponent(nomeNorm)}`);
  const compra = perfil.vendas.find((v) => v.fonte === 'historico' && v.data === data);
  exigir(compra, `compra de ${conta.vendaChave} nao aparece no perfil`);
  if (['aberta', 'paga'].includes(compra.cobrancaStatus)) {
    const efetivoAtual = centavos(compra.valor);
    exigir(efetivoAtual === conta.valorEfetivoCentavos, `valor financeiro de ${conta.vendaChave} mudou`);
  } else {
    contasAindaSemDecisao.push(conta);
  }
}
const pacoteDecisoes = [...duplicatas, ...contasAindaSemDecisao, ...acertos];

// PREVIEW antes de escrever. A rodada seca analisa o pacote inteiro contra o
// banco de verdade e devolve o plano com o hash dele, sem gravar nada. O
// plano e conferido aqui; so entao o mesmo hash volta em `planoEsperado`, e
// a escrita e recusada se qualquer coisa tiver mudado entre olhar e aplicar.
// Sem isso, o apply escrevia direto sobre um banco que ninguem tinha acabado
// de ver.
const previa = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: pacoteDecisoes, seco: true,
});
exigir(previa.seco === true, 'a rodada seca nao respondeu como seca');
exigir(previa.plano.length === pacoteDecisoes.length, 'o plano nao cobre todas as operacoes');
exigir(previa.criadas + previa.preservadas === pacoteDecisoes.length, 'nem todas as decisoes foram reconhecidas');
const acertosNoPlano = previa.plano.filter((p) => p.papel === 'acerto');
exigir(acertosNoPlano.length === 4, `esperava 4 acertos no plano, vieram ${acertosNoPlano.length}`);
for (const p of acertosNoPlano) {
  exigir(p.brutoCentavos === p.comissaoCentavos + p.liquidoCentavos,
    `acerto ${p.vendaChave} nao fecha bruto = comissao + liquido`);
}
const vinculosNoPlano = previa.plano.reduce((s, p) => s + p.vinculos.length, 0);
exigir(vinculosNoPlano === duplicatas.length, `esperava ${duplicatas.length} vinculos, o plano tem ${vinculosNoPlano}`);
for (const p of previa.plano) {
  exigir(p.saldoCentavos == null || p.saldoCentavos >= 0, `saldo negativo em ${p.vendaChave}`);
}
console.log(`  plano conferido: ${previa.criadas} a criar, ${previa.preservadas} preservadas, hash ${previa.planoHash.slice(0, 12)}`);

const decisoes = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: pacoteDecisoes, planoEsperado: previa.planoHash,
});
exigir(decisoes.criadas + decisoes.preservadas === pacoteDecisoes.length, 'nem todas as decisoes foram reconhecidas');

console.log('3/5 Cadastrando apenas codigos ainda ausentes...');
estado = await api('GET', '/api/state');
const porSku = new Map(estado.produtos.map((p) => [String(p.sku), p]));
const todosNovos = [...novosDoEstoque, ...vendidosEsgotados];
const ausentes = todosNovos.filter(([sku]) => !porSku.has(sku));
if (ausentes.length) {
  const sessao = await api('POST', '/api/reconciliacao/planilha/produtos-novos/analisar', {
    produtos: ausentes.map(([sku, desc, cat, qtd, preco]) => ({ sku, desc, cat, qtd, preco })),
  });
  exigir(sessao.itens.length === ausentes.length, `esperava ${ausentes.length} novos, analisou ${sessao.itens.length}`);
  await aprovarEAplicar(sessao);
  console.log(`  ${ausentes.length} codigos cadastrados`);
} else {
  console.log('  todos os 17 codigos ja estavam cadastrados');
}
for (const [sku] of vendidosEsgotados) {
  estado = await api('GET', '/api/state');
  const produto = estado.produtos.find((p) => String(p.sku) === sku);
  exigir(produto, `produto historico ${sku} nao existe`);
  if (produto.status !== 'inativo') await api('PATCH', `/api/produtos/${sku}`, { status: 'inativo' });
}

console.log('4/5 Aplicando somente saldos fisicos ainda diferentes...');
estado = await api('GET', '/api/state');
const ajustes = [...alvosExistentes].filter(([sku, qtd]) => {
  const produto = estado.produtos.find((p) => String(p.sku) === sku);
  exigir(produto, `SKU alvo ${sku} nao existe`);
  return Number(produto.qtd) !== qtd;
});
if (ajustes.length) {
  const sessao = await api('POST', '/api/reconciliacao/planilha/estoque-total/analisar', {
    produtos: ajustes.map(([sku, qtd]) => ({ sku, qtd })),
  });
  exigir(sessao.itens.length === ajustes.length, `esperava ${ajustes.length} ajustes, analisou ${sessao.itens.length}`);
  exigir(!sessao.itens.some((i) => i.risco === 'desconhecido'), 'existe conflito com quantidade consignada');
  await aprovarEAplicar(sessao);
  console.log(`  ${ajustes.length} movimentos explicativos aplicados`);
} else {
  console.log('  todos os 25 saldos ja estavam corretos');
}

console.log('5/5 Conferencia final independente...');
estado = await api('GET', '/api/state');
const finalPorSku = new Map(estado.produtos.map((p) => [String(p.sku), p]));
exigir(totalEstoque(estado) === 1496, `estoque total terminou em ${totalEstoque(estado)}, nao 1496`);
for (const [sku, qtd] of alvosExistentes) exigir(Number(finalPorSku.get(sku)?.qtd) === qtd, `${sku} nao terminou em ${qtd}`);
for (const [sku, , , qtd] of novosDoEstoque) exigir(Number(finalPorSku.get(sku)?.qtd) === qtd, `${sku} nao terminou em ${qtd}`);
for (const [sku] of vendidosEsgotados) {
  exigir(Number(finalPorSku.get(sku)?.qtd) === 0 && finalPorSku.get(sku)?.status === 'inativo', `${sku} nao terminou esgotado/inativo`);
}
for (const [sku, qtd] of [['181279', 1], ['141572', 0], ['309637', 0], ['136012', 2]]) {
  exigir(Number(finalPorSku.get(sku)?.qtd) === qtd, `Andreia M2: ${sku} deveria permanecer em ${qtd}`);
}

const vendas = await api('GET', '/api/analytics/vendas?periodo=tudo');
const revs = await api('GET', '/api/analytics/revendedoras?periodo=tudo');
const receber = await api('GET', '/api/contas-receber');
exigir(vendas.vendas === 707 && vendas.pecas === 1310, 'quantidade do painel de vendas nao fechou');
exigir(revs.totais.acertos === 5 && revs.totais.pecas === 84, 'quantidade de acertos/pecas nao fechou');
exigir(centavos(revs.totais.vendido) === 741300 && centavos(revs.totais.comissao) === 191065 && centavos(revs.totais.liquido) === 550235, 'valores de revendedoras nao fecharam');
// Uma retomada pode acontecer depois de a Stephanie receber alguma conta.
// Nesse caso o valor apenas migra de "a receber" para faturamento; a soma
// economica das nove compras continua igual.
exigir(centavos(Number(vendas.faturamento) + Number(receber.resumo.total)) === 12508985, 'faturamento + contas a receber nao fechou');
exigir(receber.resumo.quantidade >= 0 && receber.resumo.quantidade <= 9, 'quantidade de contas abertas ultrapassou as nove importadas');
exigir(receber.resumo.semPrazo <= receber.resumo.quantidade, 'resumo de prazos ficou inconsistente');
const perfilEvelyn = await api('GET', '/api/clientes/perfil?norm=evelyn%20veiga');
const perfilJessica = await api('GET', '/api/clientes/perfil?norm=jessica%20melim');
const perfilSandra = await api('GET', '/api/clientes/perfil?norm=sandra%20alcantara');
exigir(perfilEvelyn.vendas.length === 1 && perfilEvelyn.vendas[0].data === '2026-03-14', 'papel temporal da Evelyn nao fechou');
exigir(perfilJessica.vendas.length === 1 && perfilJessica.vendas[0].data === '2026-03-27', 'papel temporal da Jessica nao fechou');
exigir(perfilSandra.vendas.length === 1, 'Sandra Alcantara nao ficou como cliente canonica');
razao = await api('GET', '/api/estoque/conferir');
exigir(Array.isArray(razao.divergentes) && razao.divergentes.length === 0, 'razao de estoque terminou divergente');

console.log('\nRECONCILIACAO CONCLUIDA E CONFERIDA');
console.log(JSON.stringify({
  alvo: ALVO,
  estoque: totalEstoque(estado),
  vendas: vendas.vendas,
  pecasClientes: vendas.pecas,
  faturamentoClientes: vendas.faturamento,
  acertos: revs.totais,
  contasAReceber: receber.resumo,
  novasDecisoes: decisoes.criadas,
  decisoesPreservadas: decisoes.preservadas,
  razaoDivergente: razao.divergentes.length,
}, null, 2));
