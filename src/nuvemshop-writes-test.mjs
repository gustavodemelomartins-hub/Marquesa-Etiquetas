/** Prova a trava de escrita de api/src/nuvemshop.js › Nuvemshop.chamar.
 *
 *  Fail-closed: ausente, "false" ou qualquer outra coisa bloqueia; só a
 *  string exata "true" libera. A trava fica DENTRO do cliente — vale para
 *  produtos()/pedidos() (GET, sempre liberado) e para atualizarEstoque()
 *  (PATCH, o único write que existe hoje), e para qualquer método futuro
 *  que passe por chamar(), sem precisar de mudança nova.
 *
 *  Não sobe Worker nenhum: `Nuvemshop` não depende de D1/R2/bindings, só de
 *  fetch — então o teste chama a classe direto contra a loja falsa, do
 *  jeito mais barato que prova a mesma coisa.
 */
import { Nuvemshop, NuvemshopEscritaDesativada } from '../api/src/nuvemshop.js';
import { subirLojaFalsa } from './loja-falsa.mjs';

let ok = 0, falhas = 0;
function t(nome, cond) {
  if (cond) { ok++; }
  else { falhas++; console.error(`FALHA: ${nome}`); }
}

async function esperaFalhar(promessa) {
  try { await promessa; return null; }
  catch (e) { return e; }
}

const loja = await subirLojaFalsa(8799);

// Ambiente base: aponta para a loja falsa, que está de pé e respondendo.
const envBase = { NUVEMSHOP_STORE_ID: '999999', NUVEMSHOP_TOKEN: 'token-de-mentira', NUVEMSHOP_BASE: loja.url };

// Endereço sem NADA escutando: se a trava falhar e o fetch sair mesmo
// assim, o erro capturado é de conexão recusada, não NUVEMSHOP_WRITE_DISABLED
// — é o que prova que o bloqueio acontece ANTES do Worker tentar a rede,
// e não é só "a loja falsa recusou". Porta 1 é privilegiada/não escutada.
const envInalcancavel = { ...envBase, NUVEMSHOP_BASE: 'http://127.0.0.1:1' };

console.log('1. leitura (GET) nunca é bloqueada pela flag de escrita');
{
  const semFlag = new Nuvemshop(envBase);
  const produtos = await semFlag.chamar('/products');
  t('GET passa com a flag ausente', Array.isArray(produtos));

  const flagFalse = new Nuvemshop({ ...envBase, NUVEMSHOP_WRITES_ENABLED: 'false' });
  const produtos2 = await flagFalse.chamar('/products');
  t('GET passa com a flag "false"', Array.isArray(produtos2));
}

console.log('2. escrita bloqueada quando a flag está ausente — antes do fetch sair do Worker');
{
  const semFlag = new Nuvemshop(envInalcancavel);
  for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const e = await esperaFalhar(semFlag.chamar('/qualquer-coisa', { method: metodo, body: '{}' }));
    t(`${metodo} lança erro com flag ausente`, e instanceof NuvemshopEscritaDesativada);
    t(`${metodo} lança o código NUVEMSHOP_WRITE_DISABLED (não erro de rede)`, e && e.codigo === 'NUVEMSHOP_WRITE_DISABLED');
  }
}

console.log('3. escrita bloqueada quando a flag é "false" — mesmo teste, flag explícita');
{
  const flagFalse = new Nuvemshop({ ...envInalcancavel, NUVEMSHOP_WRITES_ENABLED: 'false' });
  const e = await esperaFalhar(flagFalse.chamar('/products/stock-price', { method: 'PATCH', body: '[]' }));
  t('PATCH bloqueado com flag "false"', e instanceof NuvemshopEscritaDesativada);
  t('mensagem é legível, sem token nem credencial', /desativadas neste ambiente/.test(e.message) && !/token-de-mentira/.test(e.message));
}

console.log('4. valores que não são exatamente "true" continuam bloqueando (fail-closed)');
{
  // Espaço em volta é tolerado (trim) — resta de copiar/colar num secret não
  // deveria travar quem quis ligar de propósito. Qualquer OUTRA variação —
  // maiúscula, "1", palavra diferente — continua bloqueando, sem exceção.
  for (const valor of ['1', 'TRUE', 'sim', 'True', 'true.', ' true extra']) {
    const c = new Nuvemshop({ ...envInalcancavel, NUVEMSHOP_WRITES_ENABLED: valor });
    const e = await esperaFalhar(c.chamar('/products/stock-price', { method: 'PATCH', body: '[]' }));
    t(`"${valor}" não libera escrita`, e instanceof NuvemshopEscritaDesativada);
  }
}

console.log('5. nenhuma requisição externa de escrita acontece quando bloqueada');
{
  const antes = loja.estado.totalRequisicoes;
  const antesEscritas = loja.estado.escritas.length;
  const flagFalse = new Nuvemshop({ ...envBase, NUVEMSHOP_WRITES_ENABLED: 'false' });
  await esperaFalhar(flagFalse.chamar('/products/stock-price', { method: 'PATCH', body: '[{"id":1}]' }));
  t('a loja falsa não recebeu request nenhum a mais', loja.estado.totalRequisicoes === antes);
  t('nada foi gravado em estado.escritas', loja.estado.escritas.length === antesEscritas);
}

console.log('6. flag "true" permite escrita de verdade');
{
  const flagTrue = new Nuvemshop({ ...envBase, NUVEMSHOP_WRITES_ENABLED: 'true' });
  const antes = loja.estado.escritas.length;
  const resp = await flagTrue.atualizarEstoque([{ id: 1, variants: [{ id: 10, stock: 5 }] }]);
  t('PATCH com flag "true" não lança', Array.isArray(resp));
  t('a loja falsa registrou a escrita', loja.estado.escritas.length === antes + 1);
}

console.log('7. espaço em volta de "true" é tolerado (resto de copiar/colar num secret)');
{
  const comEspaco = new Nuvemshop({ ...envBase, NUVEMSHOP_WRITES_ENABLED: ' true \n' });
  const antes = loja.estado.escritas.length;
  const resp = await comEspaco.atualizarEstoque([{ id: 1, variants: [{ id: 10, stock: 6 }] }]);
  t('PATCH com " true \\n" não lança', Array.isArray(resp));
  t('a loja falsa registrou a escrita', loja.estado.escritas.length === antes + 1);
}

console.log('8. última página cheia: o 404 "Last page is N" da página seguinte é fim da lista');
{
  // PROD, 29/09/2026: 600 produtos = 3 páginas cheias; a página 4 voltou 404
  // e a importação de fotos parou com "A Nuvemshop não encontrou /products".
  const guardados = loja.estado.produtos;
  const leitor = new Nuvemshop(envBase);

  loja.estado.produtos = Array.from({ length: 600 }, (_, i) => ({ id: i + 1, variants: [] }));
  const e = await esperaFalhar(leitor.chamar('/products?page=4&per_page=200'));
  t('loja falsa imita a real: página além da última é 404', e && e.status === 404);
  const todos = await leitor.produtos().catch(err => err);
  t('600 produtos (3 páginas cheias) lidos sem erro', Array.isArray(todos) && todos.length === 600);

  loja.estado.produtos = Array.from({ length: 610 }, (_, i) => ({ id: i + 1, variants: [] }));
  const parcial = await leitor.produtos().catch(err => err);
  t('610 produtos (última página parcial) continuam lidos', Array.isArray(parcial) && parcial.length === 610);

  const e404 = await esperaFalhar(leitor.listarTudo('/rota-inexistente'));
  t('404 na página 1 continua erro (rota errada não vira lista vazia)', e404 && e404.status === 404);
  loja.estado.produtos = guardados;
}

await loja.fechar();

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
