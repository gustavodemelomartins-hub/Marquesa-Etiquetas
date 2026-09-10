/** Comandos de catálogo e de pendência que não tocam a razão de estoque nem a
 *  Nuvemshop: categoria, fila de peças novas, ciclo de vida da ficha e adiar
 *  ou retomar uma pendência.
 *
 *  Arquivar não apaga: §28 manda arquivar quem tem histórico. Adiar uma
 *  pendência é decisão de agenda, não de estoque — nenhuma rota daqui cria
 *  movimento. */
import { json } from '../../auth.js';
import { enfileirarPendentes, limparPendentes } from '../../catalogo.js';
import { arquivarProduto, desarquivarProduto } from '../../produtos.js';
import { adiarPendencia, retomarPendencia } from '../../pendencias.js';

const sku = (params) => decodeURIComponent(params.sku);

export const rotas = [
  {
    metodo: 'POST', caminho: '/api/categorias', auth: 'bearer',
    async handler({ db, request }) {
      const { nome, ordem, cor } = await request.json();
      if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
      await db.prepare(
        `INSERT INTO categorias (nome, ordem, cor) VALUES (?, ?, ?)
         ON CONFLICT(nome) DO UPDATE SET ordem = excluded.ordem, cor = excluded.cor`,
      ).bind(nome.trim(), ordem ?? 99, cor || null).run();
      return json({ ok: true }, 201);
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
];
