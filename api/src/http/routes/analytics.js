/** Inteligência comercial: read models e nada mais.
 *
 *  As duas rotas AGREGADAS: cada tela pede uma vez e recebe todos os blocos
 *  dela do mesmo recorte — assim nenhum cartão pode discordar do gráfico ao
 *  lado, e o filtro de período não dispara seis requisições.
 *
 *  Nenhuma rota daqui escreve. Analytics lê de todo domínio e não manda em
 *  nenhum: quem corrige número é o dono do dado, não o painel. */
import { json } from '../../auth.js';
import {
  visaoGeral, evolucao, produtosMaisVendidos, categoriasMaisVendidas,
  porOrigem, clientesRanking, listarVendasUnificado,
  painel, crm, acertosDeMaleta, resumoDoMes,
} from '../../analytics.js';

const periodoDe = (url) => url.searchParams.get('periodo') || 'tudo';

export const rotas = [
  {
    metodo: 'GET', caminho: '/api/analytics/painel', auth: 'bearer',
    async handler({ db, url }) {
      return json(await painel(db, { periodo: periodoDe(url) }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/crm', auth: 'bearer',
    async handler({ db, url }) {
      return json(await crm(db, { periodo: periodoDe(url) }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/revendedoras', auth: 'bearer',
    async handler({ db, url }) {
      return json(await acertosDeMaleta(db, { periodo: periodoDe(url) }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/vendas', auth: 'bearer',
    async handler({ db, url }) {
      return json(await visaoGeral(db, { periodo: periodoDe(url) }));
    },
  },
  {
    /* §40 — o resumo de UMA barra do gráfico "Evolução por mês".
       Quatro cartões, categorias do mês e o histórico compacto, para
       desenhar logo abaixo do gráfico sem trocar de tela. Faturamento é
       recortado pela data do pagamento; vendas, peças e clientes, pela
       data da venda — e a diferença entre os dois é dita, não conciliada. */
    metodo: 'GET', caminho: '/api/analytics/mes', auth: 'bearer',
    async handler({ db, url }) {
      const r = await resumoDoMes(db, { mes: url.searchParams.get('mes') });
      return json(r, r.ok ? 200 : (r.statusHttp ?? 400));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/evolucao', auth: 'bearer',
    async handler({ db, url }) {
      return json(await evolucao(db, {
        periodo: periodoDe(url),
        granularidade: url.searchParams.get('granularidade') || 'mes',
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/produtos', auth: 'bearer',
    async handler({ db, url }) {
      return json(await produtosMaisVendidos(db, {
        periodo: periodoDe(url),
        por: url.searchParams.get('por') || 'faturamento',
        limite: Math.min(+(url.searchParams.get('limite') || 20), 200),
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/categorias', auth: 'bearer',
    async handler({ db, url }) {
      return json(await categoriasMaisVendidas(db, { periodo: periodoDe(url) }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/origem', auth: 'bearer',
    async handler({ db, url }) {
      return json(await porOrigem(db, { periodo: periodoDe(url) }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/clientes', auth: 'bearer',
    async handler({ db, url }) {
      return json(await clientesRanking(db, {
        periodo: periodoDe(url),
        ordem: url.searchParams.get('ordem') || 'faturamento',
        limite: Math.min(+(url.searchParams.get('limite') || 50), 500),
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/vendas/lista', auth: 'bearer',
    async handler({ db, url }) {
      return json(await listarVendasUnificado(db, {
        de: url.searchParams.get('de'), ate: url.searchParams.get('ate'),
        busca: url.searchParams.get('busca'), canal: url.searchParams.get('canal'),
        /* `canal` continua sendo o texto de cada população; `origem` é o
           vocabulário comum (`balcao|acerto|site`). Os dois convivem porque
           são perguntas diferentes — ver o comentário em analytics.js. */
        origem: url.searchParams.get('origem'),
        /* Mesma porta de `/api/saidas?estornadas=nao`: o padrão mostra a
           venda cancelada, marcada; quem quer o recorte elegível pede. */
        incluirCanceladas: url.searchParams.get('canceladas') !== 'nao',
        limite: Math.min(+(url.searchParams.get('limite') || 200), 1000),
        offset: +(url.searchParams.get('offset') || 0),
      }));
    },
  },
];
