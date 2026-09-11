/** Comandos de catálogo e de pendência que não tocam a razão de estoque nem a
 *  Nuvemshop: categoria, fila de peças novas, ciclo de vida da ficha, adiar
 *  ou retomar uma pendência e a publicação INTERNA do catálogo.
 *
 *  Arquivar não apaga: §28 manda arquivar quem tem histórico. Adiar uma
 *  pendência é decisão de agenda, não de estoque — nenhuma rota daqui cria
 *  movimento. E preparar ou aprovar publicação é ato interno: aprovação aqui
 *  não concede escrita na loja (§CAT-06). */
import { json } from '../../auth.js';
import { enfileirarPendentes, limparPendentes } from '../../catalogo.js';
import { arquivarProduto, desarquivarProduto } from '../../produtos.js';
import { adiarPendencia, retomarPendencia } from '../../pendencias.js';
import { salvarCategoria, renomearCategoria, arquivarCategoria } from '../../catalogo/categorias.js';
import {
  prepararPublicacao, salvarPreviaPublicacao, aprovarPublicacao,
  reabrirPublicacao, repetirPublicacao,
} from '../../publicacao-catalogo.js';

const sku = (params) => decodeURIComponent(params.sku);

export const rotas = [
  {
    /* O mesmo contrato de antes, com a normalização que faltava: um nome que
       colapsa para uma categoria existente ATUALIZA aquela em vez de criar
       uma quase-igual ao lado. */
    metodo: 'POST', caminho: '/api/categorias', auth: 'bearer',
    async handler({ db, request }) {
      const r = await salvarCategoria(db, await request.json().catch(() => ({})));
      return json(r, r.ok ? (r.criada ? 201 : 200) : (r.statusHttp ?? 400));
    },
  },
  {
    /* Renomear — o ato que a API não tinha, e não tinha porque o nome era a
       chave primária. `categorias.id` é o que permite: a categoria continua
       sendo a mesma coisa depois de mudar de nome. */
    metodo: 'PATCH', caminho: '/api/categorias/:id', auth: 'bearer',
    async handler({ db, request, params }) {
      const r = await renomearCategoria(db, decodeURIComponent(params.id),
        await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
    },
  },
  {
    /* Arquivar, nunca excluir (§28) — e só quando não há peça nenhuma. */
    metodo: 'POST', caminho: '/api/categorias/:id/arquivar', auth: 'bearer',
    async handler({ db, params }) {
      const r = await arquivarCategoria(db, decodeURIComponent(params.id));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
    },
  },
  {
    metodo: 'POST', caminho: '/api/produtos/pendentes', auth: 'bearer',
    async handler({ db, request }) {
      return json(await enfileirarPendentes(db, await request.json()));
    },
  },
  {
    metodo: 'DELETE', caminho: '/api/produtos/pendentes', auth: 'bearer',
    async handler({ db, request }) {
      const b = await request.json().catch(() => ({}));
      return json(await limparPendentes(db, b.skus));
    },
  },
  {
    // §28 — inativa sem apagar. Quem tem histórico nunca é excluído.
    metodo: 'POST', caminho: '/api/produtos/:sku/arquivar', auth: 'bearer',
    async handler({ db, request, params }) {
      const b = await request.json().catch(() => ({}));
      const r = await arquivarProduto(db, sku(params), b);
      return json(r, r.status || (r.erro ? 400 : 200));
    },
  },
  {
    metodo: 'POST', caminho: '/api/produtos/:sku/desarquivar', auth: 'bearer',
    async handler({ db, params }) {
      const r = await desarquivarProduto(db, sku(params));
      return json(r, r.status || (r.erro ? 400 : 200));
    },
  },
  {
    metodo: 'POST', caminho: '/api/pendencias/adiar', auth: 'bearer',
    async handler({ db, request }) {
      const r = await adiarPendencia(db, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
    },
  },
  {
    metodo: 'POST', caminho: '/api/pendencias/retomar', auth: 'bearer',
    async handler({ db, request }) {
      const r = await retomarPendencia(db, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
    },
  },
  {
    // o que o agente de catálogo enxerga: pronto para publicar × o que falta
    metodo: 'POST', caminho: '/api/catalogo/publicacao/:sku/preparar', auth: 'bearer',
    async handler({ db, env, request, params }) {
      const r = await prepararPublicacao(db, env, sku(params), await request.json().catch(() => ({})));
      return json(r, r.statusHttp || 200);
    },
  },
  {
    metodo: 'POST', caminho: '/api/catalogo/publicacao/:sku/previa', auth: 'bearer',
    async handler({ db, request, params }) {
      const r = await salvarPreviaPublicacao(db, sku(params), await request.json().catch(() => ({})));
      return json(r, r.statusHttp || 200);
    },
  },
  {
    metodo: 'POST', caminho: '/api/catalogo/publicacao/:sku/aprovar', auth: 'bearer',
    async handler({ db, request, params }) {
      const r = await aprovarPublicacao(db, sku(params), await request.json().catch(() => ({})));
      return json(r, r.statusHttp || 200);
    },
  },
  {
    metodo: 'POST', caminho: '/api/catalogo/publicacao/:sku/reabrir', auth: 'bearer',
    async handler({ db, params }) {
      const r = await reabrirPublicacao(db, sku(params));
      return json(r, r.statusHttp || 200);
    },
  },
  {
    metodo: 'POST', caminho: '/api/catalogo/publicacao/:sku/repetir', auth: 'bearer',
    async handler({ db, params }) {
      const r = await repetirPublicacao(db, sku(params));
      return json(r, r.statusHttp || 200);
    },
  },
];
