/* Importa a estrutura de variantes da Nuvemshop para o D1 do DEV.
 *
 *   API_URL=https://marquesa-api-staging.marquesaasemijoias.workers.dev \
 *   API_KEY=a-chave-do-staging \
 *   node tools/importar-variantes-dev.mjs
 *
 * O que ele faz, nesta ordem:
 *
 *   1. ENSAIO — lê o catálogo inteiro da loja e NÃO grava nada, nem aqui
 *      nem lá. Mostra os números para conferir antes de qualquer escrita.
 *   2. IMPORTAÇÃO — grava a estrutura lida em `loja_variantes`, no D1 do
 *      DEV. Só isso: não toca estoque, preço nem cadastro.
 *   3. REVISÃO — lê o que a sincronização decidiu NÃO escrever na loja.
 *
 * NADA aqui escreve na Nuvemshop. As duas rotas usadas fazem só `GET` lá,
 * e a trava estrutural (`NUVEMSHOP_WRITES_ENABLED=false` em staging,
 * api/src/nuvemshop.js › chamar) recusaria qualquer POST/PUT/PATCH/DELETE
 * antes do fetch sair do Worker, mesmo que alguém tentasse.
 *
 * `--seco` para no passo 1, sem gravar nada em lugar nenhum.
 */
const URL_BASE = (process.env.API_URL || '').replace(/\/$/, '');
const CHAVE = process.env.API_KEY || '';
const SO_ENSAIO = process.argv.includes('--seco');

if (!URL_BASE || !CHAVE) { console.error('Faltou API_URL ou API_KEY no ambiente.'); process.exit(2); }

/* A importação GRAVA no banco do ambiente que a URL apontar. Contra
   produção ela não estragaria estoque (só escreve em `loja_variantes`),
   mas escrever em produção não é o que esta ferramenta existe para fazer,
   e "não estragaria" não é motivo para deixar acontecer sem querer. */
if (/marquesa-api\.[^-]/.test(URL_BASE) || !/staging|localhost|127\.0\.0\.1/.test(URL_BASE)) {
  console.error(`✗ API_URL não parece o staging: ${URL_BASE}`);
  console.error('  Esperado marquesa-api-staging.… (ou localhost, no teste local).');
  process.exit(2);
}

const chamar = async (metodo, rota, corpo) => {
  const r = await fetch(URL_BASE + rota, {
    method: metodo,
    headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch (e) { /* deixa cru abaixo */ }
  if (!r.ok || !json) {
    console.error(`✗ ${metodo} ${rota} → ${r.status}`);
    console.error('  ' + texto.slice(0, 400));
    process.exit(1);
  }
  return json;
};

const n = v => (v == null ? '—' : String(v));
const linha = (rotulo, valor) => console.log(`  ${rotulo.padEnd(34, '.')} ${n(valor)}`);

console.log(`\nAlvo: ${URL_BASE}`);
const saude = await chamar('GET', '/api/health');
console.log(`API no ar (${saude.hoje})`);

/* ------------------------------------------------------------- 1. ENSAIO */
console.log('\n=== 1. ENSAIO — lê a loja inteira, não grava nada ===');
const ensaio = await chamar('POST', '/api/loja/variantes/importar', { seco: true });
if (!ensaio.ok) { console.error('✗ ' + (ensaio.erro || 'a leitura falhou')); process.exit(1); }

linha('produtos na loja', ensaio.produtosNaLoja);
linha('variantes lidas', ensaio.variantes);
linha('produtos multi-variante', ensaio.produtosComVariacao);
linha('produtos de variante única', ensaio.produtosVarianteUnica);
linha('variantes com SKU', ensaio.comSku);
linha('variantes SEM SKU', ensaio.semSku);
linha('casadas com o catálogo daqui', ensaio.casadas);
linha('só na loja (SKU não é nosso)', ensaio.soNaLoja);
console.log('  atributos encontrados (o vocabulário real da loja):');
const atributos = Object.entries(ensaio.atributos || {}).sort((a, b) => b[1] - a[1]);
if (!atributos.length) console.log('    (nenhum — nenhum produto da loja declara atributo)');
for (const [nome, quantas] of atributos) console.log(`    ${nome.padEnd(24, ' ')} ${quantas} variantes`);
console.log(`  gravou alguma coisa? ${ensaio.aplicado ? 'SIM (ERRADO)' : 'não'}`);

if (SO_ENSAIO) { console.log('\n--seco: parando aqui, nada foi gravado.'); process.exit(0); }

/* --------------------------------------------------------- 2. IMPORTAÇÃO */
console.log('\n=== 2. IMPORTAÇÃO — grava a estrutura em loja_variantes ===');
const real = await chamar('POST', '/api/loja/variantes/importar', {});
if (!real.ok) { console.error('✗ ' + (real.erro || 'a importação falhou')); process.exit(1); }
linha('gravou', real.aplicado ? 'sim' : 'NÃO (errado)');
linha('variantes gravadas', real.variantes);
linha('variantes removidas (sumiram de lá)', real.removidas);
linha('carimbo da leitura', real.lidoEm);

if (real.variantes !== ensaio.variantes) {
  console.log(`  ! o ensaio viu ${ensaio.variantes} e a gravação ${real.variantes} —`);
  console.log('    a loja mudou entre as duas leituras, ou algo está errado.');
}

/* ------------------------------------------------------------- 3. REVISÃO */
console.log('\n=== 3. REVISÃO — o que a sincronização NÃO vai escrever ===');
const revisao = await chamar('GET', '/api/variacoes/revisao');
linha('produtos em revisão', revisao.total);
for (const [motivo, quantos] of Object.entries(revisao.porMotivo || {})) {
  console.log(`    ${motivo.padEnd(24, ' ')} ${quantos}`);
}

const mostrar = (revisao.itens || []).slice(0, 15);
if (mostrar.length) {
  console.log('\n  os primeiros, com os dois números lado a lado:');
  for (const it of mostrar) {
    console.log(`    ${it.sku}  nosso=${it.total}  loja=${it.somaLoja}  ${it.motivo}`);
    console.log(`      ${it.desc}`);
    for (const v of it.variantes) console.log(`      · ${v.nome || '(sem nome)'} [${v.varianteId}] loja=${v.estoque}`);
  }
  if (revisao.total > mostrar.length) console.log(`    … e mais ${revisao.total - mostrar.length}`);
}

/* -------------------------------------------- 4. o que a rodada faria hoje
   Rodada SECA: lê a loja, calcula tudo e não escreve nada. É o retrato mais
   honesto de "o que aconteceria se sincronizasse agora". */
console.log('\n=== 4. o que uma sincronização faria agora (rodada seca) ===');
const seco = await chamar('POST', '/api/sync', { seco: true });
if (!seco.ok) {
  console.log('  a rodada não completou: ' + (seco.erro || '(sem motivo)'));
} else {
  linha('mudanças de estoque que sairiam', (seco.mudancas || []).length);
  linha('produtos segurados (semEmpurrar)', (seco.semEmpurrar || []).length);
  linha('escreveu na loja?', seco.aplicado ? 'SIM (ERRADO — era seca)' : 'não');
  const porMotivo = {};
  for (const s of seco.semEmpurrar || []) porMotivo[s.motivo] = (porMotivo[s.motivo] || 0) + 1;
  for (const [m, q] of Object.entries(porMotivo)) console.log(`    ${m.padEnd(24, ' ')} ${q}`);
}

console.log('\nPronto. Nada foi escrito na Nuvemshop.');
