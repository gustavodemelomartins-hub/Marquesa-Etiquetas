import { checarChave, respostaNaoAutorizada, json, comCors } from './auth.js';
import { criarRoteador } from './http/router.js';
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
    const msg = String((e && e.message) || e);
    /* `wrangler tail` imprime o OUTCOME da invocação, e uma exceção que
       este catch trata sai como "Ok" — foi por isso que uma queda total do
       painel apareceu no tail como duas requisições saudáveis. O log
       abaixo é a única coisa que faz a causa chegar até quem está olhando.
       Rota e método não são segredo; a chave viaja no cabeçalho e não é
       impressa aqui. */
    console.error('[api] ' + met + ' ' + path + ' → ' + msg, (e && e.stack) || '');
    /* Banco que ainda não recebeu a migracao-catalogo.sql responde
       "no such column: p.foto_original", que não diz a ninguém o que
       fazer. Aqui esse erro vira a instrução — o mesmo tratamento que os
       erros da Nuvemshop já recebem. */
    /* Mesmo tratamento das fotos, para a coluna nova da ficha de cliente:
       "no such column: cpf" não diz a ninguém o que fazer. */
    if (/no such column/i.test(msg) && /\bcpf(_norm)?\b/i.test(msg)) {
      return json({
        erro: 'A ficha de cliente com CPF precisa de uma migração que este banco ainda não recebeu.',
        detalhe: 'Rode api/migracao-cliente-cpf.sql no D1 — o passo está no api/DEPLOY.md. '
               + 'O resto do painel funciona normalmente sem ela.',
        migracao: 'cliente-cpf',
      }, 503);
    }
    /* Idem para o desconto por peça (§27). Sem a migração, VENDER quebra —
       é o caminho mais crítico do painel — então a mensagem tem de dizer o
       que rodar, e não devolver um erro de SQL para quem está no balcão. */
    if (/no such column/i.test(msg) && /\b(preco_tabela|desconto_valor|desconto_rotulo)\b/i.test(msg)) {
      return json({
        erro: 'O desconto por peça precisa de uma migração que este banco ainda não recebeu.',
        detalhe: 'Rode api/migracao-venda-desconto.sql no D1 — o passo está no api/DEPLOY.md. '
               + 'Até lá, venda sem alterar preço continua funcionando.',
        migracao: 'venda-desconto',
      }, 503);
    }
    if (/no such (table|column)/i.test(msg) && /foto|produtos_pendentes|fotos_orfas/i.test(msg)) {
      /* TRÊS migrações mexem em foto, e mandar rodar a errada faz a pessoa
         perder a tarde. O que faltou é quem decide, e a ordem do teste
         importa: `loja_fotos` contém "foto_" e casaria com a regra de
         `foto_url` se viesse depois.

           loja_fotos  → a galeria do catálogo da loja
           foto_url    → o endereço da imagem na peça (vincular)
           o resto     → as colunas de foto do catálogo */
      const galeria = /loja_fotos/i.test(msg);
      const url = !galeria && /foto_url/i.test(msg);
      const qual = galeria ? 'fotos-loja' : (url ? 'foto-url' : 'catalogo');
      return json({
        erro: galeria
          ? 'As fotos do catálogo da loja precisam de uma migração que este banco ainda não recebeu.'
          : url
            ? 'Vincular fotos da loja precisa de uma migração que este banco ainda não recebeu.'
            : 'Esta parte precisa da migração do catálogo, que este banco ainda não recebeu.',
        detalhe: `Rode api/migracao-${qual}.sql no D1 — `
               + 'o passo está no api/DEPLOY.md. O resto do painel funciona normalmente sem ela.',
        migracao: qual,
      }, 503);
    }
    /* Limite de leitura do D1. Não é falha de código nem de dado, e
       chamá-lo de "Falha interna" mandou procurar no lugar errado — numa
       revendedora recém-cadastrada, num payload quebrado, no banco de
       produção. A cota é DIÁRIA e da CONTA Cloudflare, não do banco: por
       isso DEV e produção param no mesmo instante, embora tenham D1
       separados. E só as rotas que LEEM o banco caem: `/api/health` não
       toca no D1 e continua respondendo 200, o que faz o Worker parecer
       saudável enquanto o painel inteiro está fora do ar. */
    if (/exceeded/i.test(msg) && /(daily|limit)/i.test(msg) && /(D1|row read|rows read)/i.test(msg)) {
      return json({
        erro: 'O limite diário de leitura do banco (D1) foi atingido nesta conta Cloudflare.',
        detalhe: 'Não é erro de cadastro nem de venda: a cota é da CONTA, e por isso o DEV para junto. '
               + 'Ela se renova à meia-noite UTC (21h de Brasília). Para deixar de depender disso, o '
               + 'plano Workers Paid eleva o limite. Mensagem do banco: ' + msg,
        limite: 'd1-leitura-diaria',
      }, 503);
    }
    return json({ erro: 'Falha interna', detalhe: msg }, 500);
  }
}
