/* Conferência do DEV depois do reset — pela API, do jeito que o dashboard
 * a enxerga, e não por SQL. Se estes números fecham, a tela abre.
 *
 *   API_URL=https://marquesa-api.SEU-SUBDOMINIO.workers.dev \
 *   API_KEY=a-chave-do-DEV \
 *   REV_ESPERADAS=7 \
 *   node tools/checar-pos-reset.mjs
 *
 * REV_ESPERADAS é o número de revendedoras contado ANTES do reset (está no
 * cartão do backup). Sem ele o script confere tudo, menos essa igualdade.
 *
 * Só faz GET. Não escreve nada e não importa planilha nenhuma — a
 * importação é da Sthefany, pela tela.
 */
const URL_BASE = (process.env.API_URL || '').replace(/\/$/, '');
const CHAVE = process.env.API_KEY || '';
const REV_ESPERADAS = process.env.REV_ESPERADAS ? Number(process.env.REV_ESPERADAS) : null;

if (!URL_BASE || !CHAVE) {
  console.error('Faltou API_URL ou API_KEY no ambiente.');
  process.exit(2);
}

let falhas = 0;
const ok = (b, msg, extra = '') => {
  console.log(`${b ? '✓' : '✗'} ${msg}${extra ? '  — ' + extra : ''}`);
  if (!b) falhas++;
};

const get = async rota => {
  const r = await fetch(URL_BASE + rota, { headers: { Authorization: `Bearer ${CHAVE}` } });
  return { status: r.status, corpo: r.ok ? await r.json() : await r.text() };
};

const saude = await fetch(URL_BASE + '/api/health').then(r => r.json()).catch(() => null);
ok(saude?.ok === true, '/api/health responde', saude ? `hoje=${saude.hoje}` : 'sem resposta');

const semChave = await fetch(URL_BASE + '/api/state');
ok(semChave.status === 401, 'rota protegida recusa quem não tem a chave', `HTTP ${semChave.status}`);

const st = await get('/api/state');
ok(st.status === 200, '/api/state responde 200', `HTTP ${st.status}`);
if (st.status !== 200) { console.error(st.corpo); process.exit(1); }
const s = st.corpo;

/* O dashboard inteiro é montado a partir destas chaves. Faltando qualquer
   uma, a tela não abre — e o erro apareceria só quando ela abrisse. */
for (const k of ['produtos', 'revendedoras', 'maletas', 'config', 'categorias', 'sync'])
  ok(s[k] !== undefined, `/api/state traz "${k}" — a tela tem o que ler`);

// ---------------------------------------------------------------- estoque
const produtos = s.produtos || [];
ok(produtos.length === 0, 'catálogo vazio: nenhuma peça antiga, nenhuma seed',
   `${produtos.length} produto(s)`);
ok(!produtos.some(p => p.qtd || p.consignado), 'nenhum saldo remanescente');
ok((s.maletas || []).length === 0, 'nenhuma maleta antiga', `${(s.maletas || []).length}`);
ok(!(s.inventario && s.inventario.abertoId), 'nenhum inventário aberto pendente',
   s.inventario ? `abertoId=${s.inventario.abertoId}` : '');

// ----------------------------------------------------------- revendedoras
const revs = s.revendedoras || [];
ok(revs.length > 0, 'revendedoras continuam listadas', `${revs.length} cadastrada(s)`);
if (REV_ESPERADAS !== null)
  ok(revs.length === REV_ESPERADAS, 'número de revendedoras idêntico ao de antes do reset',
     `antes ${REV_ESPERADAS}, depois ${revs.length}`);
else
  console.log('· REV_ESPERADAS não informado — não dá para comparar antes/depois');
ok(revs.every(r => r.nome && r.status), 'cadastro de cada revendedora chegou inteiro');
console.log('  revendedoras:', revs.map(r => `${r.id}:${r.nome}(${r.status})`).join(', ') || '—');

// -------------------------------------------------------------- estrutura
ok((s.categorias || []).length > 0,
   'categorias preservadas — a importação tem contra o que classificar',
   `${(s.categorias || []).length}`);
ok(s.config && s.config.prazoDias != null && s.config.prataPct != null,
   'configurações preservadas',
   s.config ? `prazoDias=${s.config.prazoDias} prataPct=${s.config.prataPct}` : '');

// -------------------------------------------------------------- Nuvemshop
/* `conectada` sai de os Secrets NUVEMSHOP_TOKEN e NUVEMSHOP_STORE_ID
   existirem no Worker. É a prova de que o reset do D1 não desconectou a
   loja: o banco não guarda credencial nenhuma. */
const sync = s.sync || {};
ok(sync.conectada === true, 'loja continua conectada — os Secrets sobreviveram ao reset');
ok(sync.ultimaEm == null,
   'histórico de sincronização zerado (esperado: sync_execucoes foi limpa)',
   `ultimaEm=${sync.ultimaEm}`);
ok(sync.erro == null, 'nenhum erro de sincronização pendente');

// A razão do estoque (§19): com o catálogo vazio ela precisa fechar em zero.
const conf = await get('/api/estoque/conferir');
ok(conf.status === 200, '/api/estoque/conferir responde', `HTTP ${conf.status}`);
if (conf.status === 200)
  ok(conf.corpo.ok === true && (conf.corpo.divergentes || []).length === 0,
     'razão do estoque fecha (§19): saldo == soma dos movimentos',
     `${(conf.corpo.divergentes || []).length} divergência(s)`);

console.log(falhas
  ? `\n${falhas} checagem(ns) falharam.`
  : '\nTudo certo — o DEV está pronto para a Sthefany importar pela tela.');
process.exit(falhas ? 1 : 0);
