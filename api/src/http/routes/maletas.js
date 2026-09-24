/** Revendedoras e maletas: cadastro, ficha, arquivamento e o ciclo da
 *  consignação — abrir, consignar peças, acertar e cancelar.
 *
 *  Transporte apenas. As regras continuam em `maletas-comandos.js`, e são
 *  elas que não podem mudar por refatoração: consignar e devolver têm efeito
 *  ZERO no estoque total (EST-03), preço é congelado no envio (§6.1), não se
 *  envia mais do que o disponível (§6.2), o acerto gera venda com comissão
 *  por faixa e cancelar lança contrapartida em vez de apagar (§28).
 *
 *  Fechar e cancelar maleta NÃO passam pelo PATCH: são atos próprios, com
 *  rota própria, e o PATCH recusa esses dois status de propósito. */
import {
  criarRevendedora, atualizarRevendedora, arquivarRevendedora,
  criarMaleta, atualizarMaleta, adicionarItens, encerrarAcerto, cancelarMaleta,
} from '../../maletas-comandos.js';

export const rotas = [
  {
    metodo: 'POST', caminho: '/api/revendedoras', auth: 'bearer',
    async handler({ db, request }) {
      return await criarRevendedora(db, request);
    },
  },
  {
    metodo: 'PATCH', caminho: '/api/revendedoras/:id', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      return await atualizarRevendedora(db, +params.id, request);
    },
  },
  {
    // §28: arquivar, nunca excluir — o histórico de maletas fica de pé.
    metodo: 'POST', caminho: '/api/revendedoras/:id/arquivar', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      return await arquivarRevendedora(db, +params.id);
    },
  },
  {
    metodo: 'POST', caminho: '/api/maletas', auth: 'bearer',
    async handler({ db, request }) {
      return await criarMaleta(db, request);
    },
  },
  {
    metodo: 'PATCH', caminho: '/api/maletas/:id', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      return await atualizarMaleta(db, +params.id, request);
    },
  },
  {
    metodo: 'POST', caminho: '/api/maletas/:id/itens', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, env, request, params }) {
      return await adicionarItens(db, env, +params.id, await request.json());
    },
  },
  {
    metodo: 'POST', caminho: '/api/maletas/:id/acerto', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, env, request, params }) {
      return await encerrarAcerto(db, env, +params.id, await request.json());
    },
  },
  {
    // §6.1 + §28: maleta criada por engano é cancelada, não apagada.
    metodo: 'POST', caminho: '/api/maletas/:id/cancelar', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, env, request, params }) {
      return await cancelarMaleta(db, env, +params.id, await request.json().catch(() => ({})));
    },
  },
];
