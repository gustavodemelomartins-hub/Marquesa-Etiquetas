import { checarChave, respostaNaoAutorizada, json, comCors } from './auth.js';
import { criarRoteador } from './http/router.js';
import { respostaDeErro } from './http/erros.js';
import { lerConfig, registrarBloqueios } from './plataforma/config.js';
import { rotas } from './http/routes/index.js';
import { sincronizar } from './sync.js';
/* §34 — medição de leitura do D1. Desligada por padrão; ver d1-metrica.js. */
import {
  criarContador, medirD1, carimbarMetrica, metricasLigadas,
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
  async fetch(request, env) {
    /* Uma vez por isolate, no primeiro pedido. Um segredo ausente é
       invisível: o Worker sobe, responde, e recusa tudo com 401. Sem esta
       linha, o `wrangler tail` mostra uma API saudável e ninguém descobre
       que falta a chave. Não altera resposta nenhuma. */
    conferirConfig(env);
    if (request.method === 'OPTIONS') return comCors(new Response(null, { status: 204 }), request, env);
    /* §34 — medir antes de otimizar. Desligado, `contador` é null e o
       binding do D1 segue direto, sem envelope nenhum: a medição não pode
       custar nada quando não está sendo usada. */
    const contador = metricasLigadas(request, env) ? criarContador() : null;
    const resposta = await rotear(request, env, contador);
    return comCors(carimbarMetrica(resposta, contador), request, env);
  },

  /** Cron da Cloudflare. Roda mesmo sem ninguém com o app aberto — é o que
   *  faz a loja ficar em dia sozinha.
   *
   *  Nunca força: se a rodada bater no freio de segurança, ela para e fica
   *  registrada como pausada, esperando alguém olhar. Um robô que roda de
   *  madrugada é o pior lugar possível para atropelar uma dúvida. */
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(sincronizar(env.DB, env).then(r => {
      if (!r.ok) console.error('sync falhou:', r.erro);
      else if (r.pausado) console.warn('sync pausada:', r.pausado.motivo);
    }));
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
