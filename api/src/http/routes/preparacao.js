/** Tarefas de preparação de conteúdo (Fase 4.5).
 *
 *  A fila que um executor externo lê e devolve. O ERP não sabe quem é o
 *  executor — `executor` é rótulo livre — e nenhuma rota daqui escreve na
 *  Nuvemshop. Concluir uma tarefa leva a peça a "aguardando aprovação" e
 *  para ali: a aprovação humana é invariante do domínio.
 */
import { json } from '../../auth.js';
import {
  abrirTarefas, listarTarefas, entregarTarefa, concluirTarefa,
  falharTarefa, cancelarTarefa,
} from '../../catalogo/preparacao.js';

const id = (params) => decodeURIComponent(params.id);
const codigo = (r, padrao = 200) => (r.ok ? padrao : (r.statusHttp ?? 400));

export const rotas = [
  {
    /* "Prepare todos os produtos novos de hoje" — sem `skus`, abre tarefa
       para toda peça que o juiz de completude considera pronta. */
    metodo: 'POST', caminho: '/api/catalogo/preparacao/tarefas', auth: 'bearer',
    async handler({ db, env, request }) {
      const r = await abrirTarefas(db, env, await request.json().catch(() => ({})));
      return json(r, codigo(r, 201));
    },
  },
  {
    metodo: 'GET', caminho: '/api/catalogo/preparacao/tarefas', auth: 'bearer',
    async handler({ db, url }) {
      return json(await listarTarefas(db, {
        estado: url.searchParams.get('estado') || null,
        limite: Number(url.searchParams.get('limite') || 200),
      }));
    },
  },
  {
    metodo: 'POST', caminho: '/api/catalogo/preparacao/tarefas/:id/entregar', auth: 'bearer',
    async handler({ db, request, params }) {
      const r = await entregarTarefa(db, id(params), await request.json().catch(() => ({})));
      return json(r, codigo(r));
    },
  },
  {
    /* O resultado do executor. Vira rascunho e para em "aguardando
       aprovação" — nunca publica. */
    metodo: 'POST', caminho: '/api/catalogo/preparacao/tarefas/:id/resultado', auth: 'bearer',
    async handler({ db, env, request, params }) {
      const r = await concluirTarefa(db, env, id(params), await request.json().catch(() => ({})));
      return json(r, codigo(r));
    },
  },
  {
    metodo: 'POST', caminho: '/api/catalogo/preparacao/tarefas/:id/falhou', auth: 'bearer',
    async handler({ db, request, params }) {
      const r = await falharTarefa(db, id(params), await request.json().catch(() => ({})));
      return json(r, codigo(r));
    },
  },
  {
    metodo: 'POST', caminho: '/api/catalogo/preparacao/tarefas/:id/cancelar', auth: 'bearer',
    async handler({ db, params }) {
      const r = await cancelarTarefa(db, id(params));
      return json(r, codigo(r));
    },
  },
];
