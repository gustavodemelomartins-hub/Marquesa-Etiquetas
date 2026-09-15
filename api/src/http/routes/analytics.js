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
  painel, crm, acertosDeMaleta, resumoDoMes, validarIntervalo,
} from '../../analytics.js';

const periodoDe = (url) => url.searchParams.get('periodo') || 'tudo';

/** 5.6 · A7 — o recorte da requisição, validado ANTES de virar consulta.
 *
 *  `faixaDePeriodo` sempre caiu em `tudo` diante de valor desconhecido, e
 *  para preset isso é razoável: só a tela escreve preset. Data vem de gente.
 *  Cair em `tudo` diante de `de=2026-13-01` devolveria o faturamento inteiro
 *  da loja com aparência de recorte pedido — e ninguém desconfia de um número
 *  plausível. Intervalo inválido vira 400 com o motivo, aqui na porta. */
function recorteDaUrl(url) {
  const de = url.searchParams.get('de');
  const ate = url.searchParams.get('ate');
  const v = validarIntervalo({ de, ate });
  if (!v.ok) return { ok: false, erro: v.erro };
  return { ok: true, periodo: periodoDe(url), de: v.de, ate: v.ate };
}
const recusa = (r) => json({ ok: false, erro: r.erro }, 400);

export const rotas = [
  {
    metodo: 'GET', caminho: '/api/analytics/painel', auth: 'bearer',
    async handler({ db, url }) {
      const r = recorteDaUrl(url);
      if (!r.ok) return recusa(r);
      return json(await painel(db, r));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/crm', auth: 'bearer',
    async handler({ db, url }) {
      const r = recorteDaUrl(url);
      if (!r.ok) return recusa(r);
      return json(await crm(db, r));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/revendedoras', auth: 'bearer',
    async handler({ db, url }) {
      const r = recorteDaUrl(url);
      if (!r.ok) return recusa(r);
      return json(await acertosDeMaleta(db, r));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/vendas', auth: 'bearer',
    async handler({ db, url }) {
      const r = recorteDaUrl(url);
      if (!r.ok) return recusa(r);
      return json(await visaoGeral(db, r));
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
      const r = recorteDaUrl(url);
      if (!r.ok) return recusa(r);
      return json(await evolucao(db, {
        ...r, granularidade: url.searchParams.get('granularidade') || 'mes',
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/produtos', auth: 'bearer',
    async handler({ db, url }) {
      const r = recorteDaUrl(url);
      if (!r.ok) return recusa(r);
      return json(await produtosMaisVendidos(db, {
        ...r,
        por: url.searchParams.get('por') || 'faturamento',
        limite: Math.min(+(url.searchParams.get('limite') || 20), 200),
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/categorias', auth: 'bearer',
    async handler({ db, url }) {
      const r = recorteDaUrl(url);
      if (!r.ok) return recusa(r);
      return json(await categoriasMaisVendidas(db, r));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/origem', auth: 'bearer',
    async handler({ db, url }) {
      const r = recorteDaUrl(url);
      if (!r.ok) return recusa(r);
      return json(await porOrigem(db, r));
    },
  },
  {
    metodo: 'GET', caminho: '/api/analytics/clientes', auth: 'bearer',
    async handler({ db, url }) {
      const r = recorteDaUrl(url);
      if (!r.ok) return recusa(r);
      return json(await clientesRanking(db, {
        ...r,
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
