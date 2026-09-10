/** Leituras do razão de estoque. Transporte apenas: quem sabe o que é saldo
 *  continua sendo `estoque.js`. */
import { json } from '../../auth.js';
import { conferirEstoque, saldosDoSku } from '../../estoque.js';

export const rotas = [
  {
    // §19 — prova de que o saldo bate com a razão
    metodo: 'GET', caminho: '/api/estoque/conferir', auth: 'bearer',
    async handler({ db }) {
      const divergentes = await conferirEstoque(db);
      return json({ ok: divergentes.length === 0, divergentes });
    },
  },
  {
    // §18 — "por que o estoque deste SKU mudou?"
    metodo: 'GET', caminho: '/api/estoque/:sku/movimentos', auth: 'bearer',
    async handler({ db, params }) {
      const sku = decodeURIComponent(params.sku);
      const r = await db.prepare(
        `SELECT * FROM movimentos WHERE sku = ? ORDER BY id`).bind(sku).all();
      const saldos = await saldosDoSku(db, sku);
      return json({ sku, saldos, movimentos: r.results });
    },
  },
];
