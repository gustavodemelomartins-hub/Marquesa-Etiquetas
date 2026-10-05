/** Foto da cliente (avatar do Instagram público) — só transporte.
 *
 *  A fila e o recebimento de candidatos são chamados pelo script auxiliar
 *  (scripts/instagram-avatares/); a sugestão e a decisão, pela ficha da
 *  cliente. Toda regra mora em ../../cliente-avatar.js. A imagem em si é
 *  servida por link assinado em publicas.js (um <img> não manda Bearer). */
import { json } from '../../auth.js';
import {
  filaDeBusca, registrarCandidatos, sugestaoDaCliente, decidirCandidato,
  removerAvatar, resumoAvatares, pedirBusca,
} from '../../cliente-avatar.js';

const ID = { id: '[0-9]+' };

export const rotas = [
  {
    metodo: 'GET', caminho: '/api/clientes/avatar/fila', auth: 'bearer',
    async handler({ db, url }) {
      return json(await filaDeBusca(db, {
        limite: url.searchParams.get('limite'), refazer: url.searchParams.get('refazer') === '1',
        clienteId: url.searchParams.get('cliente'), seco: url.searchParams.get('seco') === '1',
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/clientes/avatar/resumo', auth: 'bearer',
    async handler({ db }) {
      return json(await resumoAvatares(db));
    },
  },
  {
    metodo: 'POST', caminho: '/api/clientes/avatar/candidatos', auth: 'bearer',
    async handler({ db, request }) {
      const r = await registrarCandidatos(db, await request.json().catch(() => ({})));
      return json(r.corpo, r.status);
    },
  },
  {
    metodo: 'GET', caminho: '/api/clientes/:id/avatar/sugestao', auth: 'bearer', padroes: ID,
    async handler({ db, url, params }) {
      return json(await sugestaoDaCliente(db, +params.id, { depoisDe: url.searchParams.get('depoisDe') }));
    },
  },
  {
    /* "Buscar foto" da ficha: põe a cliente no começo da fila do script.
       O Worker continua sem falar com o Instagram. */
    metodo: 'POST', caminho: '/api/clientes/:id/avatar/buscar', auth: 'bearer', padroes: ID,
    async handler({ db, params }) {
      const r = await pedirBusca(db, +params.id);
      return json(r.corpo, r.status);
    },
  },
  {
    metodo: 'POST', caminho: '/api/clientes/:id/avatar/decidir', auth: 'bearer', padroes: ID,
    async handler({ db, env, request, params }) {
      const r = await decidirCandidato(db, env, +params.id, await request.json().catch(() => ({})));
      return json(r.corpo, r.status);
    },
  },
  {
    metodo: 'DELETE', caminho: '/api/clientes/:id/avatar', auth: 'bearer', padroes: ID,
    async handler({ db, env, params }) {
      const r = await removerAvatar(db, env, +params.id);
      return json(r.corpo, r.status);
    },
  },
];
