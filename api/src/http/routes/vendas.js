/** A venda como ato: registrar, listar o dia, receber, corrigir a peça,
 *  cancelar e reenviar o estoque para a loja. Mais os modelos de colar
 *  montado, que são o dado de entrada de uma venda personalizada.
 *
 *  Só transporte. Cada regra continua no dono dela — vendas-comandos.js,
 *  venda-correcao.js, personalizacao.js e vendas-estoque-nuvemshop.js — e
 *  nenhuma delas foi reescrita para caber aqui. */
import { json } from '../../auth.js';
import {
  registrarVenda, listarVendas, registrarPagamentoVenda, cancelarVenda,
} from '../../vendas-comandos.js';
import { corrigirItemDeVenda } from '../../venda-correcao.js';
import { atualizarEstoqueDaVenda } from '../../vendas-estoque-nuvemshop.js';
import { listarModelos, salvarModelo, personalizacaoAtiva } from '../../personalizacao.js';

const hoje = () => new Date().toISOString().slice(0, 10);

/** §43 — Monte seu Colar. Os modelos são DADO, não interface: uma página de
 *  produto da Nuvemshop pode ler daqui e postar a composição em
 *  `POST /api/vendas` sem que nada mude, e as duas telas passam a ser duas
 *  vistas da mesma regra em vez de duas regras. */
async function modelosDePersonalizacao({ db, env, url, request, metodo }) {
  /* Desligado no lançamento de 2026-09-06 — ver personalizacaoAtiva(). */
  if (!personalizacaoAtiva(env)) {
    return json({
      erro: 'Produtos Montáveis (Monte seu Colar) está temporariamente desativado.',
      codigo: 'PERSONALIZACAO_DESATIVADA',
    }, 503);
  }
  if (metodo === 'GET') {
    return json(await listarModelos(db, {
      incluirInativos: url.searchParams.get('inativos') === '1',
    }));
  }
  const r = await salvarModelo(db, await request.json().catch(() => ({})));
  return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
}

export const rotas = [
  {
    metodo: 'POST', caminho: '/api/vendas', auth: 'bearer',
    async handler({ db, env, request }) {
      return await registrarVenda(db, env, await request.json());
    },
  },
  {
    metodo: 'GET', caminho: '/api/vendas', auth: 'bearer',
    async handler({ db, url }) {
      return json(await listarVendas(db, url.searchParams.get('data') || hoje()));
    },
  },
  {
    /* §29 — o dinheiro entrou. Registra a data DO PAGAMENTO e não toca na
       data da venda; não mexe em estoque, porque a peça já saiu quando a
       venda foi registrada. */
    metodo: 'POST', caminho: '/api/vendas/:id/pagamento', auth: 'bearer',
    padroes: { id: '[0-9]+' },
    async handler({ db, params, request }) {
      return await registrarPagamentoVenda(db, +params.id, await request.json().catch(() => ({})));
    },
  },
  {
    metodo: 'GET', caminho: '/api/personalizacao/modelos', auth: 'bearer',
    handler: modelosDePersonalizacao,
  },
  {
    metodo: 'POST', caminho: '/api/personalizacao/modelos', auth: 'bearer',
    handler: modelosDePersonalizacao,
  },
  {
    /* §41 — o código da peça estava errado e a venda continua valendo.
       Mantém venda, cliente, data e preço; troca só a identidade da peça,
       devolve uma unidade ao código errado e tira uma do certo (venda do
       sistema) ou não movimenta nada (linha da planilha, cujo estoque já
       estava refletido). Registra a auditoria em `venda_item_correcoes`. */
    metodo: 'POST', caminho: '/api/vendas/corrigir-item', auth: 'bearer',
    async handler({ db, request }) {
      const r = await corrigirItemDeVenda(db, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    metodo: 'POST', caminho: '/api/vendas/:id/cancelar', auth: 'bearer',
    padroes: { id: '[0-9]+' },
    async handler({ db, env, params }) {
      return await cancelarVenda(db, env, +params.id);
    },
  },
  {
    metodo: 'POST', caminho: '/api/vendas/:id/nuvemshop', auth: 'bearer',
    padroes: { id: '[0-9]+' },
    async handler({ db, env, params, request }) {
      const b = await request.json().catch(() => ({}));
      return json(await atualizarEstoqueDaVenda(db, env, +params.id, { forcar: !!b.forcar }));
    },
  },
];
