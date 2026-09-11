/** Leituras operacionais: pendências, histórico de sincronização, sessão de
 *  reconciliação e inventário.
 *
 *  Note o que NÃO está aqui: nenhuma dessas rotas dispara sincronização,
 *  aplica sessão ou ajusta contagem. Ler o estado de uma operação e executá-la
 *  são coisas diferentes, e só a primeira migrou. */
import { json } from '../../auth.js';
import { listarPendencias } from '../../pendencias.js';
import { historicoSync } from '../../sync.js';
import { detalheSessao } from '../../reconciliacao.js';
import { listarInventarios, detalheInventario } from '../../inventario.js';

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
    metodo: 'GET', caminho: '/api/reconciliacao/:id', auth: 'bearer', padroes: { id: '\\d+' },
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
    metodo: 'GET', caminho: '/api/inventarios/:id', auth: 'bearer', padroes: { id: '\\d+' },
    async handler({ db, params }) {
      return await detalheInventario(db, +params.id);
    },
  },
];
