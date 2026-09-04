/** Ensaio integral com os arquivos reais enviados pela Stephanie.
 *
 * Requer uma cópia LOCAL do D1 de produção anterior à mudança. Não escreve
 * em DEV remoto nem em produção. Prova a troca da planilha, a classificação
 * por operação, os acertos documentais e a remoção das duplicidades.
 */
import * as XLSX from './node_modules/xlsx/xlsx.mjs';
import * as fs from 'node:fs';

XLSX.set_fs(fs);

const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';
/* O caminho da máquina do Gustavo continua sendo o padrão, mas deixa de ser
 * a única possibilidade: sem `MARQUESA_XLSX` este arquivo só roda num Windows
 * específico, e um ensaio que só uma máquina consegue fazer não é um ensaio. */
const ARQUIVO = process.env.MARQUESA_XLSX || 'C:\\Users\\User\\Downloads\\Vendas Marquesa (3).xlsx';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const wb = XLSX.readFile(ARQUIVO, { raw: true, cellDates: false });
const primeiraAba = wb.SheetNames[0];
const linhas = XLSX.utils.sheet_to_json(wb.Sheets[primeiraAba], {
  header: 1, raw: true, defval: null,
});

console.log('\n=== 1. a fonte nova é analisada antes de trocar ===');
const analise = await api('POST', '/api/vendas/historico/analisar', {
  arquivo: 'Vendas Marquesa (3).xlsx', linhas,
});
eq('análise aceita a planilha', analise.status, 200);
eq('1.375 linhas de dados', analise.corpo.linhas, 1375);
eq('1.394 peças nas linhas', analise.corpo.pecas, 1394);
eq('impacto de estoque continua zero', analise.corpo.impactoEstoque.movimentos, 0);

const razaoAntes = await api('GET', '/api/estoque/conferir');
eq('razão fecha antes da troca', JSON.stringify(razaoAntes.corpo.divergentes), '[]');
const estadoAntes = await api('GET', '/api/state');
const totalEstoqueAntes = estadoAntes.corpo.produtos.reduce((s, p) => s + Number(p.qtd || 0), 0);

console.log('\n=== 2. troca o histórico sem somar a versão anterior ===');
const troca = await api('POST', '/api/vendas/historico/substituir', {
  arquivo: 'Vendas Marquesa (3).xlsx', linhas,
});
eq('troca concluída', troca.status, 200);
eq('o retrato novo tem 1.375 linhas', troca.corpo.depois.linhas, 1375);
eq('as linhas viraram 711 vendas', troca.corpo.depois.vendas, 711);
eq('estoque não participou', troca.corpo.conferencia.estoqueIntocado, true);

let estado = (await api('GET', '/api/state')).corpo;
let jessica = estado.revendedoras.find((r) => r.nome === 'Jessica da Silva Melim');
if (!jessica) {
  const criada = await api('POST', '/api/revendedoras', {
    nome: 'Jessica da Silva Melim', obs: 'Histórico reconstruído das maletas 1 e 2.',
  });
  eq('Jéssica criada como revendedora', criada.status, 201);
  jessica = criada.corpo;
}
const inativar = await api('PATCH', `/api/revendedoras/${jessica.id}`, { status: 'inativa' });
eq('Jéssica fica inativa', inativar.status, 200);

const duplicatas = [
  [4, 'jocasta lima|2026-08-21'],
  [5, 'maria lima|2026-08-21'],
  [6, 'endy michelle|2026-08-21'],
  [7, 'juliana carvalho|2026-08-21'],
  [8, 'eliana nicolau|2026-08-21'],
  [9, 'thais domingos|2026-08-21'],
  [10, 'sandra alcantara|2026-08-21'],
  [11, 'glau pivato|2026-08-21'],
  [12, 'julia tragino|2026-08-21'],
  [13, 'larissa tragino|2026-08-21'],
].map(([vendaId, vendaChave]) => ({
  vendaChave, papel: 'cliente', vendasDuplicadas: [{
    vendaId, confirmado: true, dataDiferenteConfirmada: true,
    ...(vendaId === 10 ? { clienteDiferenteConfirmado: true } : {}),
    evidencia: { decisao: 'Confirmado pelo responsável: lançamento do sistema repete a planilha.' },
  }],
}));

const contas = [
  ['bruna santos|2026-06-24', 4100],
  ['cinthia noronha|2026-07-06', 15900],
  ['cinthia noronha|2026-07-19', 48700],
  ['iris melo|2026-07-19', 32100],
  ['bruna santos|2026-07-24', 7560],
  ['simone teixeira|2026-07-24', 10659],
  ['leandro marques|2026-07-26', 6900],
  ['simone teixeira|2026-08-14', 14900],
  ['vivan almeida|2026-08-30', 11730],
].map(([vendaChave, valorEfetivoCentavos]) => ({
  vendaChave, papel: 'cliente', cobrancaStatus: 'aberta',
  valorEfetivoCentavos, valorRecebidoFonteCentavos: 0,
  evidencia: { fonte: 'Status NÃO PAGO em Vendas Marquesa (3).xlsx' },
}));

const acertos = [
  {
    vendaChave: 'andreia souza|2026-06-19', papel: 'acerto', revendedoraId: 3,
    pecas: 10, brutoCentavos: 80000, comissaoCentavos: 12000, liquidoCentavos: 68000,
    evidencia: { arquivo: 'Andreia Souza - Maleta 1.xlsx', tipo: 'acerto documental' },
  },
  {
    vendaChave: 'evelyn veiga|2026-08-05', papel: 'acerto', revendedoraId: 5,
    pecas: 26, brutoCentavos: 207900, comissaoCentavos: 60590, liquidoCentavos: 147310,
    linhasExcluidas: ['1303'],
    evidencia: { arquivo: 'Evelyn Veiga - Maleta 1.xlsx', linha1303: 'troca de R$ 10, não venda' },
  },
  {
    vendaChave: 'jessica melim|2026-06-13', papel: 'acerto', revendedoraId: jessica.id,
    pecas: 36, brutoCentavos: 343100, comissaoCentavos: 106220, liquidoCentavos: 236880,
    evidencia: { arquivo: 'Jessica da Silva Melim - Maleta 1.xlsx', conflito: 'bruto do documento supera preços históricos em R$ 47' },
  },
  {
    vendaChave: 'jessica melim|2026-07-18', papel: 'acerto', revendedoraId: jessica.id,
    pecas: 8, brutoCentavos: 81700, comissaoCentavos: 12255, liquidoCentavos: 69445,
    evidencia: { arquivo: 'Jessica da Silva Melim - Maleta 2.xlsx', tipo: 'acerto documental' },
  },
];

console.log('\n=== 3. classifica duplicatas, dívidas e maletas ===');
const aplicar = await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [...duplicatas, ...contas, ...acertos],
});
if (aplicar.status !== 200) console.log('  detalhe da recusa:', JSON.stringify(aplicar.corpo));
eq('23 decisões aplicadas', aplicar.status, 200);
eq('23 novas operações', aplicar.corpo.criadas, 23);
eq('10 vendas operacionais vinculadas', aplicar.corpo.vinculos, 10);
if (aplicar.status !== 200) process.exit(1);

console.log('\n=== 4. Vendas contém somente compras de clientes ===');
const vendas = await api('GET', '/api/analytics/vendas?periodo=tudo');
eq('707 compras, não linhas nem acertos', vendas.corpo.vendas, 707);
eq('1.310 peças de clientes', vendas.corpo.pecas, 1310);
eq('faturamento recebido de clientes', vendas.corpo.faturamento, 123564.36);
eq('nenhuma cópia operacional somada', vendas.corpo.composicao.vendasSistema, 0);

console.log('\n=== 5. Revendedoras recebe os cinco acertos exatos ===');
const revs = await api('GET', '/api/analytics/revendedoras?periodo=tudo');
eq('cinco acertos: quatro documentais + Andréia M2 do sistema', revs.corpo.totais.acertos, 5);
eq('84 peças vendidas por revendedoras', revs.corpo.totais.pecas, 84);
eq('vendido exato', revs.corpo.totais.vendido, 7413);
eq('comissão exata', revs.corpo.totais.comissao, 1910.65);
eq('líquido exato', revs.corpo.totais.liquido, 5502.35);
const porNome = new Map(revs.corpo.revendedoras.map((r) => [r.nome, r]));
eq('Andréia tem dois acertos sem duplicar M2', porNome.get('Andreia Souza').acertos, 2);
eq('Evelyn M1 tem comissão correta', porNome.get('Evelyn Veiga').comissao, 605.9);
eq('Jéssica tem duas maletas', porNome.get('Jessica da Silva Melim').acertos, 2);

console.log('\n=== 6. contas a receber e papéis temporais ===');
const receber = await api('GET', '/api/contas-receber');
eq('nove compras abertas', receber.corpo.resumo.quantidade, 9);
eq('R$ 1.525,49 em aberto', receber.corpo.resumo.total, 1525.49);
eq('nenhum prazo inventado', receber.corpo.resumo.semPrazo, 9);
const evelyn = await api('GET', '/api/clientes/perfil?norm=evelyn%20veiga');
eq('Evelyn conserva a compra pessoal anterior', evelyn.corpo.vendas.length, 1);
eq('e o acerto não entra no perfil de cliente', evelyn.corpo.vendas[0].data, '2026-03-14');
const perfilJessica = await api('GET', '/api/clientes/perfil?norm=jessica%20melim');
eq('Jéssica conserva só a compra pessoal', perfilJessica.corpo.vendas.length, 1);
eq('compra pessoal de Jéssica é 27/03', perfilJessica.corpo.vendas[0].data, '2026-03-27');

estado = (await api('GET', '/api/state')).corpo;
eq('Andréia continua inativa', estado.revendedoras.find((r) => r.id === 3).status, 'inativa');
eq('Jéssica está inativa', estado.revendedoras.find((r) => r.id === jessica.id).status, 'inativa');
eq('Evelyn continua ativa', estado.revendedoras.find((r) => r.id === 5).status, 'ativa');

console.log('\n=== 7. nenhuma classificação tocou estoque ===');
const estadoDepois = await api('GET', '/api/state');
const totalEstoqueDepois = estadoDepois.corpo.produtos.reduce((s, p) => s + Number(p.qtd || 0), 0);
eq('total físico preservado nesta etapa', totalEstoqueDepois, totalEstoqueAntes);
const razaoDepois = await api('GET', '/api/estoque/conferir');
eq('razão contábil continua fechando', JSON.stringify(razaoDepois.corpo.divergentes), '[]');

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — o pacote real de vendas e revendedoras fechou na cópia local.');
