/** O roteador HTTP precisa decidir rota exatamente como a corrente de `if`
 *  decidia — senão a extração da Fase 2 muda comportamento sem ninguém ver.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. rota declarada depois roubar caminho de rota declarada antes;
 *   2. método errado virar 200 em vez de cair no 404 do despachante;
 *   3. `:param` engolir barra e casar caminho mais fundo do que devia;
 *   4. caminho com id numérico aceitar letra — as rotas de revendedora e
 *      maleta só casavam com `(\d+)`, e casar texto viraria `NaN` silencioso;
 *   5. o parâmetro chegar decodificado no handler: quem decodifica é o
 *      handler, como no código antigo, e decodificar duas vezes corrompe SKU;
 *   6. rota não encontrada devolver resposta em vez de `null` — é o `null`
 *      que devolve a decisão para a corrente antiga enquanto ela existir.
 */
import assert from 'node:assert/strict';
import { criarRoteador } from '../api/src/http/router.js';

const marca = (nome) => ({ nome });

const despachar = criarRoteador([
  { metodo: 'GET', caminho: '/api/estoque/conferir', auth: 'bearer', handler: () => marca('conferir') },
  { metodo: 'GET', caminho: '/api/estoque/:sku/movimentos', auth: 'bearer', handler: ({ params }) => marca(params.sku) },
  { metodo: 'POST', caminho: '/api/estoque/conferir', auth: 'bearer', handler: () => marca('conferir-post') },
  { metodo: 'PATCH', caminho: '/api/revendedoras/:id', auth: 'bearer', padroes: { id: '\\d+' }, handler: ({ params }) => marca('rev-' + params.id) },
  { metodo: 'ANY', caminho: '/api/health', auth: 'sem-bearer', handler: () => marca('health') },
]);

const chamar = (metodo, path) => despachar({ metodo, path, request: null, env: {}, url: null, db: null });

// 1 e 2 — ordem e método
assert.deepEqual(await chamar('GET', '/api/estoque/conferir'), marca('conferir'));
assert.deepEqual(await chamar('POST', '/api/estoque/conferir'), marca('conferir-post'));
assert.equal(await chamar('DELETE', '/api/estoque/conferir'), null);

// 3 — `:param` não atravessa barra
assert.deepEqual(await chamar('GET', '/api/estoque/ABC/movimentos'), marca('ABC'));
assert.equal(await chamar('GET', '/api/estoque/ABC/DEF/movimentos'), null);
assert.equal(await chamar('GET', '/api/estoque/conferir/extra'), null);

// 4 — id numérico não aceita texto
assert.deepEqual(await chamar('PATCH', '/api/revendedoras/12'), marca('rev-12'));
assert.equal(await chamar('PATCH', '/api/revendedoras/doze'), null);

// 5 — parâmetro chega cru
assert.deepEqual(await chamar('GET', '/api/estoque/TESTE%201/movimentos'), marca('TESTE%201'));

// 6 — ANY casa qualquer método, e o desconhecido volta como null
assert.deepEqual(await chamar('PUT', '/api/health'), marca('health'));
assert.equal(await chamar('GET', '/api/nao-existe'), null);

// Rota incompleta é erro de programação, não 500 em produção.
assert.throws(() => criarRoteador([{ metodo: 'GET', caminho: '/api/x' }]), /rota incompleta/);

console.log('Roteador HTTP: ok — ordem, método, parâmetro e fallback preservados');
