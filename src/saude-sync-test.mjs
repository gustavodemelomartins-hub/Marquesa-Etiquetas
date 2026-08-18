/** TECH_DEBT.md item 12 — prova de que uma rodada seca nunca esconde o
 *  estado real da sincronização.
 *
 *  O bug original: `resumoSync` lia sempre a ÚLTIMA linha de
 *  `sync_execucoes`, sem olhar se ela era seca. Uma sincronização real que
 *  falhasse no PATCH, seguida de uma análise (`{"seco": true}`) bem
 *  sucedida, fazia a tela voltar a dizer "tudo bem" — uma falha real
 *  escondida atrás de uma leitura.
 *
 *  A correção: `sync_execucoes.seco` é gravado no INSERT, e `resumoSync`
 *  filtra por `seco = 0` para decidir `ultimoStatus`/`ultimaEm`/`pausada`/
 *  `erro`. Este teste prova os três cenários pedidos, mais o caso simétrico
 *  (uma análise que FALHA também não pode contaminar uma sincronização real
 *  saudável).
 *
 *  `loja.estado.falhar = true` faz a loja de mentira responder 500 em
 *  qualquer chamada — é o que transforma uma rodada em falha de verdade.
 */
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

const sync = async () => (await api('GET', '/api/state')).sync;

const loja = await subirLojaFalsa();
console.log('loja falsa em ' + loja.url);

await api('POST', '/api/produtos/importar', {
  produtos: [{ sku: 'H1', desc: 'Colar H1', cat: 'Colar', preco: 100, qtd: 10 }],
});
loja.estado.produtos = [produtoFalso(1, [{ id: 11, sku: 'H1', estoque: 10 }])];

console.log('\n=== 1. sync real falha → dry-run passa → saúde continua ERRO ===');

loja.estado.falhar = true;
const real1 = await api('POST', '/api/sync', {});
loja.estado.falhar = false;
eq('a rodada real falhou de verdade', real1.ok, 'false');

let s = await sync();
eq('o resumo já mostra erro logo após a real', s.ultimoStatus, 'erro');

const seco1 = await api('POST', '/api/sync', { seco: true });
eq('a rodada seca terminou bem', seco1.ok, 'true');

s = await sync();
eq('a saúde CONTINUA erro depois da análise', s.ultimoStatus, 'erro');
eq('a mensagem de erro continua presente', !!s.erro, 'true');
eq('ultimaId ainda aponta para a execução REAL, não para a seca', s.ultimaId, real1.id);
eq('ultimaAnaliseEm existe e é diferente de ultimaEm (a análise rodou depois)',
   s.ultimaAnaliseEm !== s.ultimaEm, 'true');

console.log('\n=== 2. sync real ok → dry-run ok → saúde baseada na real (sem mudança) ===');

const real2 = await api('POST', '/api/sync', { forcar: true });
eq('a rodada real terminou bem desta vez', real2.ok, 'true');

s = await sync();
eq('a saúde é ok', s.ultimoStatus, 'ok');
eq('sem erro', s.erro, 'null');
const idApósReal2 = s.ultimaId;

const seco2 = await api('POST', '/api/sync', { seco: true });
eq('a análise também terminou bem', seco2.ok, 'true');

s = await sync();
eq('a saúde continua ok — nada mudou por causa da análise', s.ultimoStatus, 'ok');
eq('ultimaId não avançou: a análise não é a "última execução" operacional',
   s.ultimaId, idApósReal2);

console.log('\n=== 3. sync real pausada → dry-run passa → saúde continua PAUSADA ===');

/* O freio: mais de 40 produtos mudando de uma vez. Reaproveita o padrão de
   src/dry-run-test.mjs. */
await api('POST', '/api/produtos/importar', {
  produtos: Array.from({ length: 45 }, (_, i) => ({
    sku: `P${i}`, desc: `Peça P${i}`, cat: 'Outros', preco: 10, qtd: 0,
  })),
});
loja.estado.produtos.push(...Array.from({ length: 45 }, (_, i) =>
  produtoFalso(200 + i, [{ id: 2000 + i, sku: `P${i}`, estoque: 3 }])));

const real3 = await api('POST', '/api/sync', {});
eq('a rodada real pausou no freio', !!real3.pausado, 'true');

s = await sync();
eq('o resumo mostra pausada', s.ultimoStatus, 'pausado');
eq('com o motivo do freio', !!s.pausada, 'true');
const idApósReal3 = s.ultimaId;

const seco3 = await api('POST', '/api/sync', { seco: true });
eq('a análise pausou também (mesmo freio, checado antes do `if (seco)`)',
   !!seco3.pausado, 'true');

s = await sync();
eq('a saúde CONTINUA pausada depois da análise', s.ultimoStatus, 'pausado');
eq('ultimaId ainda é a execução real que pausou', s.ultimaId, idApósReal3);

console.log('\n=== 4. o caso simétrico: uma análise que FALHA não contamina uma real saudável ===');

/* Volta ao estado saudável primeiro. */
loja.estado.produtos = loja.estado.produtos.slice(0, 1);
await api('POST', '/api/produtos/importar', { produtos: [] });
const real4 = await api('POST', '/api/sync', { forcar: true });
eq('rodada real saudável de novo', real4.ok, 'true');
s = await sync();
eq('saúde ok antes do teste 4', s.ultimoStatus, 'ok');
const idApósReal4 = s.ultimaId;

loja.estado.falhar = true;
const secoQueFalha = await api('POST', '/api/sync', { seco: true });
loja.estado.falhar = false;
eq('a análise em si falhou', secoQueFalha.ok, 'false');

s = await sync();
eq('a saúde CONTINUA ok: uma análise que falha não é uma sincronização que falha',
   s.ultimoStatus, 'ok');
eq('sem erro', s.erro, 'null');
eq('ultimaId não mudou', s.ultimaId, idApósReal4);

await loja.fechar();

console.log(`\n${falhas === 0 ? 'TUDO CERTO' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
