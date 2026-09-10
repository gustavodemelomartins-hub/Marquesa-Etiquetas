/** Leituras do ciclo comercial: dia de vendas, correções, histórico
 *  importado, contas a receber, perfil e revisão de cliente, saídas sem
 *  faturamento e garantias.
 *
 *  Só leitura, e só transporte: cada handler chama o módulo dono do assunto.
 *  Ficaram de fora, de propósito, as leituras cuja consulta ainda mora dentro
 *  de `index.js` (`GET /api/vendas` e `GET /api/clientes`): mover a rota sem
 *  mover a regra criaria uma dependência circular entre o despachante e a
 *  tabela. Elas migram quando o domínio delas sair. */
import { json } from '../../auth.js';
import { historicoDoDia, lancamentosDoDia } from '../../historico-dia.js';
import { listarCorrecoes } from '../../venda-correcao.js';
import { auditoriaPagamentos } from '../../pagamentos-auditoria.js';
import { listarLotes, retratoDoHistorico } from '../../vendas-historico.js';
import { estadoReconstrucao } from '../../vendas-historicas.js';
import { contasAReceber } from '../../contas-receber.js';
import { perfilCliente } from '../../analytics.js';
import { listarSaidas, registrarSaida, estornarSaida } from '../../saidas.js';
import { listarGarantias, lerGarantia, garantiasPendentes } from '../../garantias.js';
import { analisarHistoricoNaoVenda, listarReclassificacoes } from '../../auditoria-historico.js';

const hoje = () => new Date().toISOString().slice(0, 10);

export const rotas = [
  {
    /* §32 — tudo o que aconteceu comercialmente numa data, de todas as
       origens e sem duplicidade. É o que a lista por dia mostrava pela
       metade: venda de balcão, linha de planilha, acerto de revendedora,
       maleta que saiu, brinde e troca de garantia. */
    metodo: 'GET', caminho: '/api/vendas/dia', auth: 'bearer',
    async handler({ db, url }) {
      const r = await historicoDoDia(db, url.searchParams.get('data') || hoje());
      return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
    },
  },
  {
    /* §35 — os três cartões de Lançamentos, calculados no servidor a partir
       de TODAS as origens comerciais da data escolhida. O cartão de acerto
       mostra o LÍQUIDO da Marquesa (bruto − comissão): peça em maleta não é
       venda. */
    metodo: 'GET', caminho: '/api/vendas/lancamentos', auth: 'bearer',
    async handler({ db, url }) {
      const r = await lancamentosDoDia(db, url.searchParams.get('data') || hoje());
      return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
    },
  },
  {
    metodo: 'GET', caminho: '/api/vendas/correcoes', auth: 'bearer',
    async handler({ db, url }) {
      return json(await listarCorrecoes(db, {
        limite: Math.min(+(url.searchParams.get('limite') || 200), 1000),
        offset: +(url.searchParams.get('offset') || 0),
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/vendas/pagamento/auditoria', auth: 'bearer',
    async handler({ db }) {
      return json(await auditoriaPagamentos(db));
    },
  },
  {
    metodo: 'GET', caminho: '/api/vendas/historico/lotes', auth: 'bearer',
    async handler({ db }) {
      return json(await listarLotes(db));
    },
  },
  {
    /* O retrato do que está no ar: quantas vendas, quanto faturamento, de
       qual arquivo. É o que a tela mostra ANTES de propor a troca — trocar
       sem saber o que está sendo trocado é o mesmo que não perguntar. */
    metodo: 'GET', caminho: '/api/vendas/historico/retrato', auth: 'bearer',
    async handler({ db }) {
      return json(await retratoDoHistorico(db));
    },
  },
  {
    metodo: 'GET', caminho: '/api/vendas/historico/reconstrucao', auth: 'bearer',
    async handler({ db }) {
      return json(await estadoReconstrucao(db));
    },
  },
  {
    metodo: 'GET', caminho: '/api/contas-receber', auth: 'bearer',
    async handler({ db, url }) {
      const r = await contasAReceber(db, { status: url.searchParams.get('status') || 'aberta' });
      return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
    },
  },
  {
    metodo: 'GET', caminho: '/api/clientes/perfil', auth: 'bearer',
    async handler({ db, url }) {
      const id = url.searchParams.get('id');
      const r = await perfilCliente(db, {
        clienteId: id ? +id : null, norm: url.searchParams.get('norm'),
      });
      return json(r, r.ok ? 200 : 400);
    },
  },
  {
    metodo: 'GET', caminho: '/api/clientes/revisao', auth: 'bearer',
    async handler({ db }) {
      const { results } = await db.prepare(
        `SELECT * FROM clientes_vinculo_revisao WHERE status = 'pendente' ORDER BY linhas DESC`,
      ).all();
      return json({ revisoes: results ?? [] });
    },
  },
  {
    metodo: 'GET', caminho: '/api/saidas', auth: 'bearer',
    async handler({ db, url }) {
      return json(await listarSaidas(db, {
        de: url.searchParams.get('de'), ate: url.searchParams.get('ate'),
        tipo: url.searchParams.get('tipo'),
        incluirEstornadas: url.searchParams.get('estornadas') !== 'nao',
        limite: Math.min(+(url.searchParams.get('limite') || 200), 1000),
        offset: +(url.searchParams.get('offset') || 0),
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/garantias', auth: 'bearer',
    async handler({ db, url }) {
      return json(await listarGarantias(db, {
        status: url.searchParams.get('status'),
        limite: Math.min(+(url.searchParams.get('limite') || 200), 1000),
        offset: +(url.searchParams.get('offset') || 0),
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/garantias/pendentes', auth: 'bearer',
    async handler({ db, url }) {
      return json(await garantiasPendentes(db, {
        limite: Math.min(+(url.searchParams.get('limite') || 50), 200),
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/garantias/:id', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      const g = await lerGarantia(db, +params.id);
      return json(g ?? { erro: 'Garantia não encontrada' }, g ? 200 : 404);
    },
  },
  {
    // §30.5 — `analisar` é SECO: lê tudo, propõe e não escreve. Aplicar
    // recebe a lista nomeada; não existe "aplicar todas" no servidor.
    metodo: 'GET', caminho: '/api/historico/auditoria', auth: 'bearer',
    async handler({ db, url }) {
      const nomes = (url.searchParams.get('usoProprio') || '')
        .split(',').map((x) => x.trim()).filter(Boolean);
      return json(await analisarHistoricoNaoVenda(db, { nomesUsoProprio: nomes }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/historico/reclassificar', auth: 'bearer',
    async handler({ db, url }) {
      return json(await listarReclassificacoes(db, { status: url.searchParams.get('status') }));
    },
  },
  {
    /* §30 — brinde, uso próprio, perda/diferença de inventário e sorteio.
       Saem do estoque pela razão e não são venda: nenhuma cria cliente,
       venda ou faturamento. */
    metodo: 'POST', caminho: '/api/saidas', auth: 'bearer',
    async handler({ db, request }) {
      const r = await registrarSaida(db, await request.json().catch(() => ({})));
      return json(r, r.ok ? 201 : (r.statusHttp ?? 400));
    },
  },
  {
    // §28 — estorno lança contrapartida; nada é apagado.
    metodo: 'POST', caminho: '/api/saidas/:id/estornar', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      const r = await estornarSaida(db, +params.id, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
];
