/** Comandos que sincronizam com a loja e que reconciliam divergência.
 *
 *  As duas coisas moram juntas porque são o mesmo par de gestos: LER o que a
 *  loja diz, comparar com o que o estoque diz, e só então decidir. Por isso
 *  cada uma tem um irmão que não escreve — `{"seco": true}` na sincronização,
 *  `/analisar` na planilha — e a tela mostra o resultado antes de perguntar.
 *
 *  O que NÃO está aqui: as leituras (`GET /api/sync`, `GET
 *  /api/reconciliacao/:id`) ficam em operacao.js, e nenhuma decisão de
 *  negócio mora neste arquivo — ela está em sync.js e reconciliacao.js. */
import { json } from '../../auth.js';
import { sincronizar, analisarSincronizacao } from '../../sync.js';
import {
  abrirSessao, aprovarItem, rejeitarItem, cancelarSessao, aplicarSessao,
  analisarPlanilhaEstoqueTotal, analisarPlanilhaProdutosNovos,
} from '../../reconciliacao.js';

export const rotas = [
  {
    metodo: 'POST', caminho: '/api/sync', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      return json(await sincronizar(db, env, { forcar: !!b.forcar, seco: !!b.seco }));
    },
  },
  {
    /* Dry-run de leitura pura: não abre execução, não puxa pedido, não grava
       retrato e não escreve na loja. É o que a tela mostra antes de pedir a
       confirmação. */
    metodo: 'POST', caminho: '/api/sync/analisar', auth: 'bearer',
    async handler({ db, env }) {
      return json(await analisarSincronizacao(db, env));
    },
  },
  {
    metodo: 'POST', caminho: '/api/reconciliacao', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      return await abrirSessao(db, env, b.origem || 'nuvemshop');
    },
  },
  {
    /* Planilha da Stéfane — Estoque Total: compara com produtos.qtd, nunca
       escreve direto (docs/domains/RECONCILIATION_ENGINE.md § Fonte da
       verdade). `produtos` chega no mesmo formato que
       POST /api/produtos/importar sempre aceitou. */
    metodo: 'POST', caminho: '/api/reconciliacao/planilha/estoque-total/analisar', auth: 'bearer',
    async handler({ db, request }) {
      const b = await request.json().catch(() => ({}));
      return await analisarPlanilhaEstoqueTotal(db, b.produtos);
    },
  },
  {
    /* Planilha da Stéfane — Produtos Novos: só cria SKU inexistente, nunca
       toca em SKU que já existe. */
    metodo: 'POST', caminho: '/api/reconciliacao/planilha/produtos-novos/analisar', auth: 'bearer',
    async handler({ db, request }) {
      const b = await request.json().catch(() => ({}));
      return await analisarPlanilhaProdutosNovos(db, b.produtos);
    },
  },
  {
    metodo: 'POST', caminho: '/api/reconciliacao/:id/itens/:item/aprovar', auth: 'bearer',
    padroes: { id: '[0-9]+', item: '[0-9]+' },
    async handler({ db, params }) {
      return await aprovarItem(db, +params.id, +params.item);
    },
  },
  {
    metodo: 'POST', caminho: '/api/reconciliacao/:id/itens/:item/rejeitar', auth: 'bearer',
    padroes: { id: '[0-9]+', item: '[0-9]+' },
    async handler({ db, params }) {
      return await rejeitarItem(db, +params.id, +params.item);
    },
  },
  {
    metodo: 'POST', caminho: '/api/reconciliacao/:id/cancelar', auth: 'bearer',
    padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      return await cancelarSessao(db, +params.id);
    },
  },
  {
    metodo: 'POST', caminho: '/api/reconciliacao/:id/aplicar', auth: 'bearer',
    padroes: { id: '[0-9]+' },
    async handler({ db, env, params }) {
      return await aplicarSessao(db, env, +params.id);
    },
  },
];
