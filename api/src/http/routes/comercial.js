/** Leituras do ciclo comercial: dia de vendas, correções, histórico
 *  importado, contas a receber, perfil e revisão de cliente, saídas sem
 *  faturamento e garantias.
 *
 *  Só transporte: cada handler chama o módulo dono do assunto. `GET
 *  /api/vendas` continua de fora porque a consulta dela ainda mora dentro de
 *  `index.js`; ela migra junto do domínio de vendas. */
import { json } from '../../auth.js';
import { historicoDoDia, lancamentosDoDia } from '../../historico-dia.js';
import { listarCorrecoes } from '../../venda-correcao.js';
import { auditoriaPagamentos } from '../../pagamentos-auditoria.js';
import {
  listarLotes, retratoDoHistorico, analisarHistorico, importarHistorico,
  substituirHistorico, reverterLote,
} from '../../vendas-historico.js';
import {
  estadoReconstrucao, reconstruir, backfillNormalizacao,
} from '../../vendas-historicas.js';
import {
  contasAReceber, definirPrazoDaConta, receberConta,
} from '../../contas-receber.js';
import {
  marcarContaPaga, definirVencimento, aplicarOperacoesHistoricas,
} from '../../historico-operacoes.js';
import { perfilCliente } from '../../analytics.js';
import {
  buscarClientes, criarCliente, atualizarCliente, decidirVinculoCliente,
} from '../../clientes.js';
import { listarSaidas, registrarSaida, estornarSaida } from '../../saidas.js';
import {
  listarGarantias, lerGarantia, garantiasPendentes, abrirGarantia,
  mudarStatusGarantia, registrarTroca, pagarDiferencaTroca, estornarTroca,
  vinculosDeGarantia, reabrirGarantia, corrigirStatusGarantia,
} from '../../garantias.js';
import {
  analisarHistoricoNaoVenda, listarReclassificacoes,
  aplicarReclassificacao, desfazerReclassificacao,
} from '../../auditoria-historico.js';

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
    /* 5.2b — o relatório da migração de identidade: quais garantias ficaram
       sem apontar para a linha da venda, e por quê. Somente leitura; não
       conserta nada. Antes de `/:id` só por organização — o padrão `[0-9]+`
       daquela rota já impede a confusão. */
    metodo: 'GET', caminho: '/api/garantias/vinculos', auth: 'bearer',
    async handler({ db, url }) {
      return json(await vinculosDeGarantia(db, {
        limite: Math.min(+(url.searchParams.get('limite') || 200), 1000),
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
  {
    /* §31 — garantia por ITEM da compra. Nada aqui altera a venda original,
       devolve a peça defeituosa ao estoque vendável ou gera faturamento: a
       única receita é a diferença de uma troca, e ela tem rota própria. */
    metodo: 'POST', caminho: '/api/garantias', auth: 'bearer',
    async handler({ db, request }) {
      const r = await abrirGarantia(db, await request.json().catch(() => ({})));
      return json(r, r.ok ? 201 : (r.statusHttp ?? 400));
    },
  },
  {
    /* 5.4e — a peça voltou depois do caso ter encerrado. NÃO reabre o caso
       antigo: cria um atendimento NOVO ligado a ele, dentro de 7 dias úteis
       e com a etiqueta confirmada por quem olhou a peça. O caso anterior
       permanece encerrado, inteiro. */
    metodo: 'POST', caminho: '/api/garantias/:id/reabrir', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params, request }) {
      const r = await reabrirGarantia(db, +params.id, await request.json().catch(() => ({})));
      return json(r, r.ok ? 201 : (r.statusHttp ?? 400));
    },
  },
  {
    /* 5.4f — o encerramento foi lançado por engano. NÃO é reabertura: a peça
       nunca voltou, e por isso não há prazo de 7 dias nem etiqueta a
       perguntar. O estado atual volta atrás; o histórico não. Recusa quando
       já existe efeito posterior ao encerramento. */
    metodo: 'POST', caminho: '/api/garantias/:id/corrigir-status', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params, request }) {
      const r = await corrigirStatusGarantia(db, +params.id, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
    },
  },
  {
    metodo: 'POST', caminho: '/api/garantias/:id/status', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      const r = await mudarStatusGarantia(db, +params.id, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    metodo: 'POST', caminho: '/api/garantias/:id/troca', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      const r = await registrarTroca(db, +params.id, await request.json().catch(() => ({})));
      return json(r, r.ok ? 201 : (r.statusHttp ?? 409));
    },
  },
  {
    // Liquida APENAS a diferença da troca — nunca a venda original.
    metodo: 'POST', caminho: '/api/garantias/:id/troca/pagar', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      const r = await pagarDiferencaTroca(db, +params.id, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    metodo: 'POST', caminho: '/api/garantias/:id/troca/estornar', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      const r = await estornarTroca(db, +params.id, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    /* §37 — recebível é projeção do que a venda decidiu. Liquidar aqui mexe
       em dinheiro e nunca em estoque. */
    metodo: 'PATCH', caminho: '/api/contas-receber/prazo', auth: 'bearer',
    async handler({ db, request }) {
      const r = await definirPrazoDaConta(db, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    metodo: 'POST', caminho: '/api/contas-receber/receber', auth: 'bearer',
    async handler({ db, request }) {
      const r = await receberConta(db, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    metodo: 'POST', caminho: '/api/contas-receber/:id/marcar-paga', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      const r = await marcarContaPaga(db, +params.id, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    metodo: 'PATCH', caminho: '/api/contas-receber/:id/vencimento', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      const r = await definirVencimento(db, +params.id, await request.json().catch(() => ({})));
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    /* Busca por nome, telefone ou CPF. Nome não é identidade: homônimo não é
       fundido sozinho — quem decide isso é a revisão de vínculo. */
    metodo: 'GET', caminho: '/api/clientes', auth: 'bearer',
    async handler({ db, url }) {
      return await buscarClientes(db, url);
    },
  },
  {
    metodo: 'POST', caminho: '/api/clientes', auth: 'bearer',
    async handler({ db, request }) {
      return await criarCliente(db, request);
    },
  },
  {
    metodo: 'PATCH', caminho: '/api/clientes/:id', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      return await atualizarCliente(db, +params.id, await request.json());
    },
  },
  {
    metodo: 'POST', caminho: '/api/clientes/revisao/:id', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, request, params }) {
      const b = await request.json().catch(() => ({}));
      return await decidirVinculoCliente(db, +params.id, b);
    },
  },
  {
    metodo: 'POST', caminho: '/api/vendas/historico/analisar', auth: 'bearer',
    async handler({ db, request }) {
      const b = await request.json().catch(() => ({}));
      const r = await analisarHistorico(db, { linhas: b.linhas, arquivo: b.arquivo });
      const { _registros, ...limpo } = r;
      return json(limpo, r.ok ? 200 : 400);
    },
  },
  {
    // Idempotente por hash do arquivo: reimportar o mesmo lote nao duplica
    // faturamento -- devolve 409.
    metodo: 'POST', caminho: '/api/vendas/historico/importar', auth: 'bearer',
    async handler({ db, request }) {
      const b = await request.json().catch(() => ({}));
      const r = await importarHistorico(db, { linhas: b.linhas, arquivo: b.arquivo });
      return json(r, r.ok ? 201 : 409);
    },
  },
  {
    /* TROCAR a planilha: reverte o que esta de pe e importa a corrigida,
       numa operacao so. Importar por cima SEM reverter e o caminho que
       duplicaria o faturamento. */
    metodo: 'POST', caminho: '/api/vendas/historico/substituir', auth: 'bearer',
    async handler({ db, request }) {
      const b2 = await request.json().catch(() => ({}));
      const r = await substituirHistorico(db, { linhas: b2.linhas, arquivo: b2.arquivo });
      return json(r, r.ok ? 200 : 409);
    },
  },
  {
    // Reverter nao apaga o bruto: 28.
    metodo: 'POST', caminho: '/api/vendas/historico/lotes/:id/reverter', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      const r = await reverterLote(db, +params.id);
      return json(r, r.ok ? 200 : 400);
    },
  },
  {
    /* Camada DERIVADA: apaga e refaz pela mesma regra deterministica, e o
       bruto (`vendas_historico_itens`) nao e tocado. Nao move estoque --
       agrupar linhas que ja existiam nao cria nem consome peca fisica.
       Reconstruir que invalidaria decisao humana ativa para em 409. */
    metodo: 'POST', caminho: '/api/vendas/historico/reconstruir', auth: 'bearer',
    async handler({ db, request }) {
      const b = await request.json().catch(() => ({}));
      const norm = await backfillNormalizacao(db);
      const r = await reconstruir(db, {
        loteId: b.loteId ?? null,
        aceitarQuebraDeDecisao: b.aceitarQuebraDeDecisao === true,
      });
      return json({ ...r, normalizacao: norm }, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    // `seco: true` devolve o plano e o `planoHash` sem escrever nada;
    // mandar esse hash de volta em `planoEsperado` recusa a escrita se o
    // banco mudou entre revisar e aplicar.
    metodo: 'POST', caminho: '/api/vendas/historico/operacoes', auth: 'bearer',
    async handler({ db, request }) {
      const b3 = await request.json().catch(() => ({}));
      const r = await aplicarOperacoesHistoricas(db, {
        operacoes: b3.operacoes,
        seco: b3.seco === true,
        planoEsperado: b3.planoEsperado ?? null,
      });
      return json(r, r.ok ? 200 : (r.statusHttp ?? 409));
    },
  },
  {
    // 30.5 -- aplica apenas as linhas nomeadas; nao existe aplicar todas.
    metodo: 'POST', caminho: '/api/historico/reclassificar', auth: 'bearer',
    async handler({ db, request }) {
      const b = await request.json().catch(() => ({}));
      const r = await aplicarReclassificacao(db, b);
      return json(r, r.statusHttp ?? (r.ok ? 200 : 400));
    },
  },
  {
    metodo: 'DELETE', caminho: '/api/historico/reclassificar/:id', auth: 'bearer', padroes: { id: '[0-9]+' },
    async handler({ db, params }) {
      const r = await desfazerReclassificacao(db, +params.id);
      return json(r, r.ok ? 200 : (r.statusHttp ?? 404));
    },
  },
];
