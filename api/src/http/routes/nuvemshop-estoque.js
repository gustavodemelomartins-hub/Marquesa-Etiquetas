/** §61 — Estoque online: a saúde do envio para a Nuvemshop e as ferramentas
 *  administrativas que existem como reserva do automático.
 *
 *  Nenhuma decisão de negócio mora aqui — ela está em
 *  `nuvemshop-estoque.js`. A ordem dos gestos é a de sempre: CONFERIR
 *  (lê a loja, não escreve nela) → olhar → RECONCILIAR (manda o saldo do
 *  Marquesa). Sincronizar pendências e tentar de novo usam a mesma fila do
 *  automático; nenhuma rota escreve na loja por um caminho próprio. */
import { json } from '../../auth.js';
import {
  resumoEstoqueOnline, conferirLoja, reconciliarDivergencias, processarFila,
  tentarDeNovo, ligarSync,
} from '../../nuvemshop-estoque.js';

export const rotas = [
  {
    metodo: 'GET', caminho: '/api/nuvemshop/estoque', auth: 'bearer',
    async handler({ db, env }) {
      return json(await resumoEstoqueOnline(db, env));
    },
  },
  {
    /* "Conferir estoque com Nuvemshop": lê a loja inteira e grava o retrato
       da comparação. Nenhuma escrita na loja. */
    metodo: 'POST', caminho: '/api/nuvemshop/estoque/conferir', auth: 'bearer',
    async handler({ db, env }) {
      const c = await conferirLoja(db, env, { gravar: true });
      if (!c.ok) return json(c, 409);
      return json({ ok: true, resumo: c.resumo });
    },
  },
  {
    /* "Reconciliar divergências": a última conferência diz quem diverge, e o
       saldo do Marquesa vai para a loja. `{"seco": true}` só conta. */
    metodo: 'POST', caminho: '/api/nuvemshop/estoque/reconciliar', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      return json(await reconciliarDivergencias(db, env, { seco: !!b.seco, origem: 'manual' }));
    },
  },
  {
    /* "Sincronizar pendências": a fila parada, agora. É o gesto humano que
       autoriza passar do freio do caminho em lote. */
    metodo: 'POST', caminho: '/api/nuvemshop/estoque/sincronizar', auth: 'bearer',
    async handler({ db, env }) {
      return json(await processarFila(db, env, {
        puxar: true, forcar: true, ignorarEspera: true, origem: 'manual',
      }));
    },
  },
  {
    metodo: 'POST', caminho: '/api/nuvemshop/estoque/:sku/tentar', auth: 'bearer',
    async handler({ db, env, params }) {
      return json(await tentarDeNovo(db, env, decodeURIComponent(params.sku)));
    },
  },
  {
    /* Kill switch. Desligado, nada sai para a loja — e a fila continua
       guardando o que mudou, para ser entregue quando religar. */
    metodo: 'PUT', caminho: '/api/nuvemshop/estoque/automatico', auth: 'bearer',
    async handler({ db, request }) {
      const b = await request.json().catch(() => ({}));
      if (typeof b.ativo !== 'boolean') return json({ erro: 'Informe {"ativo": true} ou {"ativo": false}.' }, 400);
      return json(await ligarSync(db, b.ativo));
    },
  },
];
