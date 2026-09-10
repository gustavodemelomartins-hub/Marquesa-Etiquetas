/** Operação: pendências, histórico de sincronização, sessão de reconciliação
 *  e o ciclo de inventário.
 *
 *  Note o que NÃO está aqui: nenhuma rota daqui dispara sincronização nem
 *  aplica sessão de reconciliação. E, dentro do inventário, contar e concluir
 *  não mexem em saldo: §19 — ajustar é ato separado, idempotente por item, e
 *  é a única rota do grupo que cria movimento. */
import { json } from '../../auth.js';
import {
  listarPendencias, resolverVariacaoDaVenda, resolverVariacaoDaMaleta,
} from '../../pendencias.js';
import { historicoSync } from '../../sync.js';
import { detalheSessao } from '../../reconciliacao.js';
import {
  listarInventarios, detalheInventario, abrirInventario, salvarContagem,
  concluirInventario, ajustarInventario, cancelarInventario,
  contarItem, descontarItem, registrarNaoIdentificado,
  pausarInventario, retomarInventario, resultadoInventario, aplicarInventario,
} from '../../inventario.js';

export const rotas = [
  {
    /* §42 — a CENTRAL DE PENDÊNCIAS. Todos os casos em aberto de todas as
       fontes numa lista só, cada um com o caminho para resolver. É leitura
       derivada do estado: não há tabela de pendências, e resolver o caso o
       faz sumir sozinho. */
    metodo: 'GET', caminho: '/api/pendencias', auth: 'bearer',
    async handler({ db, url }) {
      return json(await listarPendencias(db, {
        tipo: url.searchParams.get('tipo') || null,
        incluirAdiadas: url.searchParams.get('adiadas') === '1',
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/sync', auth: 'bearer',
    async handler({ db }) {
      return json(await historicoSync(db));
    },
  },
  {
    metodo: 'GET', caminho: '/api/reconciliacao/:id', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      return await detalheSessao(db, +params.id);
    },
  },
  {
    metodo: 'GET', caminho: '/api/inventarios', auth: 'bearer',
    async handler({ db }) {
      return await listarInventarios(db);
    },
  },
  {
    metodo: 'GET', caminho: '/api/inventarios/:id', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      return await detalheInventario(db, +params.id);
    },
  },
  {
    metodo: 'POST', caminho: '/api/inventarios', auth: 'bearer',
    async handler({ db }) {
      return await abrirInventario(db);
    },
  },
  {
    metodo: 'PUT', caminho: '/api/inventarios/:id/contagem', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      return await salvarContagem(db, +params.id, await request.json());
    },
  },
  {
    metodo: 'POST', caminho: '/api/inventarios/:id/concluir', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      return await concluirInventario(db, +params.id);
    },
  },
  {
    // §19 — o único ato do inventário que toca a razão, e uma vez por item.
    metodo: 'POST', caminho: '/api/inventarios/:id/ajustar', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      return await ajustarInventario(db, +params.id, await request.json());
    },
  },
  {
    metodo: 'POST', caminho: '/api/inventarios/:id/cancelar', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      return await cancelarInventario(db, +params.id);
    },
  },
  {
    /* §4.4/D2 — conta UMA linha. O corpo traz `contado`, e `contado: 0` é
       "conferi, não tem nenhuma": um resultado, não a ausência de um. Quem
       não contou simplesmente não manda nada, e não existe linha. */
    metodo: 'POST', caminho: '/api/inventarios/:id/itens', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      return await contarItem(db, +params.id, await request.json().catch(() => ({})));
    },
  },
  {
    /* Volta a linha para "não contado" — que não é zero. Desfazer um engano
       tem de ter caminho próprio, senão o único jeito de corrigir seria
       afirmar um zero que ela não conferiu. */
    metodo: 'DELETE', caminho: '/api/inventarios/:id/itens/:sku', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params, url }) {
      return await descontarItem(db, +params.id, decodeURIComponent(params.sku),
        url.searchParams.get('variacao') || '');
    },
  },
  {
    /* §4.4/D5 — "não sei qual variação é" é resposta válida. Não vira
       movimento nenhum e bloqueia o código inteiro até alguém resolver. */
    metodo: 'POST', caminho: '/api/inventarios/:id/nao-identificado', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      return await registrarNaoIdentificado(db, +params.id, await request.json().catch(() => ({})));
    },
  },
  {
    metodo: 'POST', caminho: '/api/inventarios/:id/pausar', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      return await pausarInventario(db, +params.id);
    },
  },
  {
    metodo: 'POST', caminho: '/api/inventarios/:id/retomar', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      return await retomarInventario(db, +params.id);
    },
  },
  {
    /* O retrato CONGELADO, por variação. É a mesma fonte que `/aplicar` lê:
       o número já foi decidido no fechamento e não se recalcula. */
    metodo: 'GET', caminho: '/api/inventarios/:id/resultado', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      return await resultadoInventario(db, +params.id);
    },
  },
  {
    /* §19 — junto com `/ajustar`, o único ato do inventário que toca a
       razão. A quantidade NÃO vem no corpo: vem do retrato congelado. */
    metodo: 'POST', caminho: '/api/inventarios/:id/aplicar', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      return await aplicarInventario(db, +params.id, await request.json().catch(() => ({})));
    },
  },
  {
    /* §42 — resolver uma variação é dizer QUAL peça saiu: identidade, nunca
       uma segunda baixa de estoque. */
    metodo: 'POST', caminho: '/api/pendencias/variacao/venda', auth: 'bearer',
    async handler({ db, request }) {
      const r = await resolverVariacaoDaVenda(db, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    metodo: 'POST', caminho: '/api/pendencias/variacao/maleta', auth: 'bearer',
    async handler({ db, request }) {
      const r = await resolverVariacaoDaMaleta(db, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
];
