/** Razão de estoque: leituras e os comandos que escrevem nela.
 *
 *  Transporte apenas. Quem sabe o que é saldo continua sendo `estoque.js`, e
 *  quem decide um movimento, uma repartição ou o desfazimento de uma
 *  semeadura é `estoque-comandos.js`. Nenhuma rota daqui toca `produtos.qtd`:
 *  toda escrita passa por `movimentar`, e `produtos.qtd == SUM(movimentos.qtd)`
 *  continua valendo depois de cada uma. */
import { json } from '../../auth.js';
import { conferirEstoque, saldosDoSku } from '../../estoque.js';
import { lancarMovimento, repartirVariacoes, desfazerSemeadura } from '../../estoque-comandos.js';
import { distribuirVariantes } from '../../variantes.js';

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
  {
    // §19: entrada de mercadoria e ajuste são MOVIMENTOS, não digitação de saldo
    metodo: 'POST', caminho: '/api/produtos/:sku/movimento', auth: 'bearer',
    async handler({ db, request, params }) {
      return await lancarMovimento(db, decodeURIComponent(params.sku), await request.json());
    },
  },
  {
    // repartir o estoque de um código entre as opções em que ele é vendido
    metodo: 'POST', caminho: '/api/produtos/:sku/repartir', auth: 'bearer',
    async handler({ db, request, params }) {
      return await repartirVariacoes(db, decodeURIComponent(params.sku), await request.json());
    },
  },
  {
    // desfazer a repartição que a sincronização fez sozinha
    metodo: 'POST', caminho: '/api/variacoes/desfazer-semeadura', auth: 'bearer',
    async handler({ db }) {
      return await desfazerSemeadura(db);
    },
  },
  {
    /* A chave de cada quantidade é o `variant_id`, nunca o nome — ver
       api/REGRAS.md § 8b. A soma tem de fechar exatamente com o estoque
       do produto, e a rota recusa em vez de escolher sozinha quem está
       certo (§19: repartir e corrigir o total são atos diferentes). */
    metodo: 'POST', caminho: '/api/produtos/:sku/variacoes/distribuir', auth: 'bearer',
    async handler({ db, request, params }) {
      const r = await distribuirVariantes(db, decodeURIComponent(params.sku), await request.json());
      return json(r, r.status || (r.erro ? 400 : 200));
    },
  },
];
