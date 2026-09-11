/** Estado agregado do painel. É read model transversal, não domínio: ele lê
 *  de todo mundo e não escreve em ninguém. */
import { json } from '../../auth.js';
import { montarState } from '../../state.js';

export const rotas = [
  {
    metodo: 'GET', caminho: '/api/state', auth: 'bearer',
    async handler({ db, env }) {
      return json(await montarState(db, env));
    },
  },
];
