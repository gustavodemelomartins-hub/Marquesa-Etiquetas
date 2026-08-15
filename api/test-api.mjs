/** Prova, contra o Worker local, cada regra que o documento de contexto
 *  exige. Cada teste cita a seção correspondente. */
const API = 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (c, m, extra = '') => {
  console.log(`${c ? '  ok  ' : ' FALHA'} ${m}${extra ? '  → ' + extra : ''}`);
  if (!c) falhas++;
};

async function req(met, rota, body) {
  const r = await fetch(API + rota, {
    method: met,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

console.log('=== §22/§24 · importação sinaliza em vez de corrigir em silêncio ===');
let r = await req('POST', '/api/produtos/importar', {
  produtos: [
    { sku: '111111', desc: 'Colar Teste', cat: 'Colar', preco: 100, qtd: 10 },
    { sku: '222222', desc: 'Brinco Prata 925 Teste', cat: 'Brinco', preco: 200, qtd: 10 },
    { sku: '333333', desc: 'Anel Sem Preco', cat: 'Anel', preco: 0, qtd: 4 },
    { sku: '444444', desc: 'Pulseira Categoria Estranha', cat: 'Metaverso', preco: 50, qtd: 2 },
  ],
});
console.log('   ', JSON.stringify(r.body.avisos));
ok(r.body.novos === 4, 'importou os 4 códigos', String(r.body.novos));
ok(r.body.avisos.some(a => a.tipo === 'sem_preco' && a.sku === '333333'), '§24 avisou peça sem preço');
ok(r.body.avisos.some(a => a.tipo === 'categoria_desconhecida'), '§22 avisou categoria desconhecida');

let st = (await req('GET', '/api/state')).body;
const prod = s => st.produtos.find(p => p.sku === s);
ok(prod('333333').preco === null && prod('333333').semPreco === true, '§24 sem preço é null, não R$ 0');
ok(prod('444444').cat === 'Outros', 'categoria desconhecida caiu em Outros, sem inventar');

console.log('\n=== §19 · saldo vem das movimentações ===');
r = await req('PATCH', '/api/produtos/111111', { qtd: 999 });
ok(r.status === 400 && /§19/.test(r.body.erro), 'recusa digitar saldo direto', r.body.erro);

r = await req('POST', '/api/produtos/111111/movimento', { tipo: 'entrada', quantidade: 5, obs: 'compra nova' });
ok(r.body.saldos.qtd === 15, 'entrada de 5 levou o total de 10 para 15', String(r.body.saldos.qtd));

r = await req('GET', '/api/estoque/conferir');
ok(r.body.ok === true, '§19 saldo bate com a soma dos movimentos', JSON.stringify(r.body.divergentes));

console.log('\n=== §5.2/§5.3 · consignação não é venda ===');
r = await req('POST', '/api/revendedoras', { nome: 'Revendedora Teste', tel: '11999999999' });
const revId = r.body.id;
r = await req('POST', '/api/maletas', { revId, abertaEm: '2026-08-01', acertoEm: '2026-09-15' });
const malId = r.body.id;

r = await req('POST', `/api/maletas/${malId}/itens`, { itens: { '111111': 4, '222222': 3 } });
ok(r.body.adicionados === 2, 'montou a maleta com 2 códigos');

r = await req('GET', '/api/estoque/111111/movimentos');
const s111 = r.body.saldos;
ok(s111.qtd === 15 && s111.consignado === 4 && s111.disponivel === 11,
   '§5.3 total continua 15, com 4 consignados e 11 disponíveis',
   `total=${s111.qtd} consig=${s111.consignado} disp=${s111.disponivel}`);

r = await req('POST', `/api/maletas/${malId}/itens`, { itens: { '111111': 99 } });
ok(r.body.recusados.length === 1 && /só tem 11/.test(r.body.recusados[0].motivo),
   '§6.2 impede enviar mais que o disponível', r.body.recusados[0]?.motivo);

console.log('\n=== §6.1 · preço congelado no envio ===');
await req('PATCH', '/api/produtos/111111', { preco: 999 });   // reajuste depois do envio
st = (await req('GET', '/api/state')).body;
const mal = st.maletas.find(m => m.id === malId);
ok(mal.precos['111111'] === 100,
   'a maleta guarda R$ 100 do envio, mesmo com o catálogo agora em R$ 999',
   `maleta=${mal.precos['111111']} catálogo=${prod('111111').preco}`);

console.log('\n=== §24 · peça sem preço bloqueia venda ===');
r = await req('POST', '/api/vendas', { clienteNome: 'Cliente X', itens: [{ sku: '333333', qtd: 1 }] });
ok(r.status === 409 && /sem preço/.test(r.body.erro), 'venda de peça sem preço é recusada', r.body.erro);

console.log('\n=== §9 · venda de balcão e venda de acerto na mesma tabela ===');
r = await req('POST', '/api/vendas', { clienteNome: 'Maria Balcão', itens: [{ sku: '111111', qtd: 2 }] });
ok(r.status === 201, 'venda de balcão registrada', `R$ ${r.body.total}`);

// acerto: das 4 do colar, 1 volta e 3 não; das 3 da prata, 0 voltam
r = await req('POST', `/api/maletas/${malId}/acerto`, {
  devolvidas: { '111111': 1 },
  faltas: [
    { sku: '111111', linhas: [{ qtd: 2, destino: 'vendida' }, { qtd: 1, destino: 'perdida' }] },
    { sku: '222222', linhas: [{ qtd: 3, destino: 'vendida' }] },
  ],
});
const ac = r.body.acerto;
console.log('   ', JSON.stringify(ac));
ok(r.status === 200, 'acerto encerrado');
ok(ac.vendaId != null, '§9 o acerto gerou uma venda de verdade', `venda #${ac.vendaId}`);

console.log('\n=== §11/§12/§32 · faixa pelas banhadas, prata à parte ===');
// vendidas: colar 2 × R$100 (banhada) = 200 ; prata 3 × R$200 = 600
ok(ac.baseBanhada === 200, 'base banhada = R$ 200 (preço congelado)', String(ac.baseBanhada));
ok(ac.basePrata === 600, 'base prata = R$ 600', String(ac.basePrata));
ok(ac.pct === 0, '§32 faixa olha só as banhadas: R$ 200 → 0%', `${ac.pct}%`);
ok(ac.comissaoPrata === 60, '§12 prata tem 10% próprios → R$ 60', String(ac.comissaoPrata));
ok(ac.comissao === 60, 'comissão total = R$ 60 (0 das banhadas + 60 da prata)', String(ac.comissao));
ok(ac.liquido === 740, '§13 líquido = 800 vendidos − 60 = R$ 740', String(ac.liquido));

const vendasHoje = (await req('GET', `/api/vendas?data=${new Date().toISOString().slice(0, 10)}`)).body;
const origens = vendasHoje.map(v => v.origem);
ok(origens.includes('balcao') && origens.includes('acerto'),
   '§9 "vendas do dia" traz balcão E acerto juntos', origens.join(', '));

console.log('\n=== §18 · por que o estoque deste SKU mudou? ===');
r = await req('GET', '/api/estoque/111111/movimentos');
const tipos = r.body.movimentos.map(m => `${m.tipo}${m.qtd >= 0 ? '+' : ''}${m.qtd}`);
console.log('    111111:', tipos.join('  '));
ok(r.body.movimentos.length >= 6, 'a razão conta a história toda', `${r.body.movimentos.length} movimentos`);
const soma = r.body.movimentos.reduce((s, m) => s + m.qtd, 0);
ok(soma === r.body.saldos.qtd, 'soma dos movimentos == saldo', `${soma} == ${r.body.saldos.qtd}`);

console.log('\n=== §28 · não apagar histórico ===');
r = await req('POST', `/api/revendedoras/${revId}/arquivar`);
ok(r.body.ok === true, 'revendedora arquivada (maleta já encerrada)');
st = (await req('GET', '/api/state')).body;
ok(st.revendedoras.find(x => x.id === revId).status === 'inativa', 'status virou inativa');
ok(st.maletas.some(m => m.id === malId && m.status === 'encerrada'),
   'a maleta encerrada continua no histórico');

// maleta nova + cancelamento
r = await req('POST', '/api/maletas', { revId, abertaEm: '2026-08-10' });
const malCancel = r.body.id;
await req('POST', `/api/maletas/${malCancel}/itens`, { itens: { '111111': 2 } });
const antes = (await req('GET', '/api/estoque/111111/movimentos')).body.saldos;
r = await req('POST', `/api/maletas/${malCancel}/cancelar`, { motivo: 'montada por engano' });
const depois = (await req('GET', '/api/estoque/111111/movimentos')).body.saldos;
ok(r.body.ok === true, 'maleta cancelada em vez de apagada');
ok(depois.disponivel === antes.disponivel + 2, 'as peças voltaram a ficar disponíveis',
   `${antes.disponivel} → ${depois.disponivel}`);
ok(depois.qtd === antes.qtd, 'cancelar maleta não mexe no total (§5.3)', String(depois.qtd));

console.log('\n=== §19/§28 · cancelar venda cria movimento inverso ===');
const vendaBalcao = vendasHoje.find(v => v.origem === 'balcao');
const antesV = (await req('GET', '/api/estoque/111111/movimentos')).body.saldos.qtd;
r = await req('POST', `/api/vendas/${vendaBalcao.id}/cancelar`);
const depoisV = (await req('GET', '/api/estoque/111111/movimentos')).body.saldos.qtd;
ok(r.body.ok === true, 'venda cancelada');
ok(depoisV === antesV + 2, 'estorno devolveu as 2 peças ao estoque', `${antesV} → ${depoisV}`);
const vendasDepois = (await req('GET', `/api/vendas?data=${new Date().toISOString().slice(0, 10)}`)).body;
ok(vendasDepois.find(v => v.id === vendaBalcao.id).cancelada === true,
   'a venda continua registrada, marcada como cancelada');

console.log('\n=== conferência final ===');
r = await req('GET', '/api/estoque/conferir');
ok(r.body.ok === true, 'depois de tudo, saldo ainda bate com a razão em todo SKU',
   JSON.stringify(r.body.divergentes));

console.log(`\n${falhas === 0 ? '✓ TODOS OS TESTES PASSARAM' : '✗ ' + falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
