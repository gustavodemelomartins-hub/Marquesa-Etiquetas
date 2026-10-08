import { checarChave, respostaNaoAutorizada, json, comCors } from './auth.js';
import { criarRoteador } from './http/router.js';
import { respostaDeErro } from './http/erros.js';
import { lerConfig, registrarBloqueios } from './plataforma/config.js';
import { rotas } from './http/routes/index.js';
import { executarCron, processarAposRequisicao } from './nuvemshop-estoque.js';
/* §34 — medição de leitura do D1. Desligada por padrão; ver d1-metrica.js. */
import {
  criarContador, medirD1, carimbarMetrica, metricasLigadas, vigiarRequisicao,
} from './d1-metrica.js';

/* Dois roteadores porque há dois regimes de autorização, e a ordem entre
   eles é a regra: o que não exige Bearer é tentado ANTES da porta da chave,
   exatamente como a corrente de `if` fazia. Separar por `auth` na tabela
   impede o acidente clássico — uma rota nova cair, sem querer, do lado de
   fora da autenticação. */
const despacharPublica = criarRoteador(rotas.filter((r) => r.auth === 'sem-bearer'));
const despacharRota = criarRoteador(rotas.filter((r) => r.auth === 'bearer'));

export default {
  /** O CORS é aplicado uma única vez, na saída — assim nenhuma rota nova
   *  pode esquecer de devolvê-lo. */
  async fetch(request, env, ctx) {
    /* Uma vez por isolate, no primeiro pedido. Um segredo ausente é
       invisível: o Worker sobe, responde, e recusa tudo com 401. Sem esta
       linha, o `wrangler tail` mostra uma API saudável e ninguém descobre
       que falta a chave. Não altera resposta nenhuma. */
    conferirConfig(env);
    if (request.method === 'OPTIONS') return comCors(new Response(null, { status: 204 }), request, env);
    /* §34 — medir antes de otimizar: com a medição ligada, os cabeçalhos
       X-D1-* trazem tudo. Desligada, §60 — a vigia leve: só conta
       consultas e soma o que o D1 já devolve, e registra a requisição
       pesada antes que ela derrube a cota ou o teto de 50 consultas. */
    const contador = metricasLigadas(request, env) ? criarContador() : criarContador({ leve: true });
    const inicio = Date.now();
    const inicioIso = new Date(inicio).toISOString();
    const resposta = await rotear(request, env, contador);
    /* §61 — a operação que mexeu em estoque deixou código na fila (o gatilho
       do banco faz isso na mesma transação). O envio sai em segundo plano,
       depois da resposta: a Sthefany não espera a Nuvemshop, e uma loja fora
       do ar não derruba a operação. Duas consultas quando não há nada. */
    if (ctx && typeof ctx.waitUntil === 'function' && request.method !== 'GET'
      && resposta.status < 400 && env.DB) {
      ctx.waitUntil(processarAposRequisicao(env.DB, env, inicioIso, contador));
    }
    try {
      vigiarRequisicao(contador, {
        metodo: request.method, path: new URL(request.url).pathname,
        ms: Date.now() - inicio, status: resposta.status,
      });
    } catch { /* a vigia nunca derruba a resposta */ }
    return comCors(carimbarMetrica(resposta, contador), request, env);
  },

  /** Cron da Cloudflare. Roda mesmo sem ninguém com o app aberto.
   *
   *  §61 — a cada 10 minutos: puxa os pedidos do site (§5.1, antes de
   *  empurrar) e envia os códigos da fila que estiverem devidos. Uma vez por
   *  dia (`0 9 * * *`, 06:00 de Brasília) também confere a loja inteira.
   *  Fila vazia custa poucas consultas; nada aqui relê o catálogo a cada
   *  rodada. Nunca força o freio do caminho em lote: massa de mudança
   *  espera gente. */
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(executarCron(env.DB, env, { cron: evento && evento.cron }).then((r) => {
      const f = r && r.fila;
      if (f && (f.erros || f.motivo)) console.warn('[nuvemshop-fila] cron:', JSON.stringify({ cron: r.cron, erros: f.erros, motivo: f.motivo }));
      else if (f && f.processados) console.log('[nuvemshop-fila] cron:', JSON.stringify({ cron: r.cron, processados: f.processados, sincronizados: f.sincronizados }));
    }).catch((e) => console.error('[nuvemshop-fila] cron falhou:', String(e && e.message || e))));
  },
};

/** Diagnóstico de configuração, uma vez por isolate. */
let configConferida = false;
function conferirConfig(env) {
  if (configConferida) return;
  configConferida = true;
  registrarBloqueios(lerConfig(env));
}

async function rotear(request, env, contador = null) {
  const url = new URL(request.url);
  const path = url.pathname;
  const met = request.method;

  /* Health, callback OAuth e foto assinada. Cada uma prova autorização de
     outro jeito — ver http/routes/publicas.js. Nenhuma delas recebe o `db`
     medido: elas rodam antes de a medição do D1 fazer sentido. */
  const semChave = await despacharPublica({ request, env, url, path, metodo: met });
  if (semChave) return semChave;

  if (!checarChave(request, env)) return respostaNaoAutorizada();

  /* Corpo declarado JSON que não é JSON é erro de QUEM MANDOU: 400, e não o
     500 "Falha interna" que o `request.json()` do handler produzia. A
     conferência é AQUI, na entrada, e não em http/erros.js: lá um
     `SyntaxError` também pode vir de um JSON quebrado guardado no banco (o
     `config` que derrubou /api/state), e esse precisa continuar sendo 500. */
  if (!['GET', 'HEAD'].includes(met)
    && (request.headers.get('Content-Type') || '').includes('application/json')) {
    const texto = await request.clone().text();
    if (texto.trim()) {
      try { JSON.parse(texto); } catch {
        return json({ erro: 'O corpo do pedido não é um JSON válido.' }, 400);
      }
    }
  }

  const db = medirD1(env.DB, contador);
  try {
    const resposta = await despacharRota({ request, env, url, db, path, metodo: met });
    if (resposta) return resposta;
    return json({ erro: 'Rota não encontrada' }, 404);
  } catch (e) {
    /* Toda a tradução de erro mora em http/erros.js — inclusive o log, que
       é a única coisa que faz a causa aparecer no `wrangler tail`. */
    return respostaDeErro(e, { metodo: met, path });
  }
}
