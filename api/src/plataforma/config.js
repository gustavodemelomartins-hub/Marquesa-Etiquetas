/** Configuração tipada e fail-closed — Fase 3.
 *
 *  Hoje cada módulo lê `env` do seu jeito: um faz `String(x || '').trim()`,
 *  outro tira a barra do fim, outro tira o BOM que o `wrangler secret put`
 *  grava no Windows. Quando uma dessas normalizações falta, o sintoma não é
 *  um erro — é a coisa parecer configurada e não estar. Um segredo com um
 *  byte invisível na frente nunca bate, e o erro aparece como "chave
 *  errada".
 *
 *  Este módulo é o único lugar que decide o que cada variável significa.
 *  Ele NÃO abre conexão, NÃO chama a Nuvemshop e NÃO decide regra de
 *  negócio: lê `env`, normaliza e diz o que falta.
 *
 *  Fail-closed é a regra: variável ausente, vazia ou ilegível vale como
 *  DESLIGADA, nunca como permissiva. `NUVEMSHOP_WRITES_ENABLED` é o caso
 *  extremo — ausente significa "não escreva na loja", e essa leitura
 *  precisa continuar sendo exatamente `=== 'true'`, porque qualquer
 *  interpretação mais generosa ("1", "yes", "on") empurraria estoque real
 *  para a loja por causa de um typo. */

/** `wrangler secret put` rodado no Windows às vezes grava o segredo com um
 *  BOM (U+FEFF) na frente — artefato de como o Wrangler lê o stdin nesse
 *  ambiente, não do valor que a pessoa digitou. */
function semBom(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

const texto = (v) => semBom(String(v == null ? '' : v)).trim();
const semBarraFinal = (v) => texto(v).replace(/\/+$/, '');
const lista = (v) => texto(v).split(',').map((s) => s.trim()).filter(Boolean);
/** Só a palavra exata liga. Ver o comentário do cabeçalho. */
const ligado = (v) => texto(v) === 'true';

/** Lê `env` inteiro de uma vez. O resultado é congelado: quem recebe a
 *  configuração não pode alterá-la para outro trecho do código. */
export function lerConfig(env = {}) {
  const config = {
    api: {
      chave: semBom(String(env.API_KEY || '')),
    },
    cors: {
      /* Sem lista, libera geral — aceitável apenas em desenvolvimento
         local, e por isso o diagnóstico avisa. */
      origensPermitidas: lista(env.ORIGENS_PERMITIDAS),
    },
    nuvemshop: {
      loja: texto(env.NUVEMSHOP_STORE_ID),
      token: texto(env.NUVEMSHOP_TOKEN),
      base: semBarraFinal(env.NUVEMSHOP_BASE) || 'https://api.nuvemshop.com.br',
      authBase: semBarraFinal(env.NUVEMSHOP_AUTH_BASE) || 'https://www.tiendanube.com',
      clientId: texto(env.NUVEMSHOP_CLIENT_ID),
      clientSecret: texto(env.NUVEMSHOP_CLIENT_SECRET),
      escritaHabilitada: ligado(env.NUVEMSHOP_WRITES_ENABLED),
      /* A SEGUNDA trava, específica da publicação de catálogo (Fase 4.5).
         `NUVEMSHOP_WRITES_ENABLED` está "true" em produção porque o
         empurrão de estoque depende dela — e empurrar estoque para um
         produto que já existe é muito diferente de CRIAR um produto na
         loja. Uma trava só não consegue separar as duas coisas.

         Não está declarada em `wrangler.toml` de propósito: ausente vale
         como desligada, e é assim em todo ambiente até alguém decidir o
         contrário por release. */
      publicacaoHabilitada: ligado(env.NUVEMSHOP_PUBLICACAO_ENABLED),
    },
    fotos: {
      /* Binding do R2, não texto: presente ou ausente. Ausente é estado
         normal em produção desde o go-live — leitura por URL externa
         continua funcionando, upload recusa com mensagem clara. */
      temR2: Boolean(env.FOTOS),
      fundoUrl: texto(env.FOTO_FUNDO_URL),
      fundoToken: texto(env.FOTO_FUNDO_TOKEN),
    },
    catalogo: {
      preparadorUrl: texto(env.PREPARADOR_CATALOGO_URL),
      preparadorToken: texto(env.PREPARADOR_CATALOGO_TOKEN),
    },
    banco: {
      presente: Boolean(env.DB),
    },
  };
  Object.values(config).forEach((secao) => Object.freeze(secao));
  return Object.freeze(config);
}

/** O que está faltando, e o que isso desliga.
 *
 *  `bloqueio` = a API não consegue cumprir o papel dela. `aviso` = uma
 *  capacidade está desligada, mas o resto funciona — é o estado normal de
 *  várias coisas aqui, e chamar isso de erro treinaria todo mundo a
 *  ignorar o diagnóstico. */
export function diagnosticar(config) {
  const p = [];
  const add = (gravidade, chave, efeito) => p.push({ gravidade, chave, efeito });

  if (!config.banco.presente) {
    add('bloqueio', 'DB', 'Sem o binding do D1 nenhuma rota que lê ou escreve responde.');
  }
  if (!config.api.chave) {
    add('bloqueio', 'API_KEY',
      'Sem a chave no servidor, TODA requisição autenticada é recusada com 401 — '
      + 'inclusive as corretas. O sintoma parece "chave errada" no painel.');
  }
  if (!config.cors.origensPermitidas.length) {
    add('aviso', 'ORIGENS_PERMITIDAS',
      'Sem lista, o CORS libera qualquer origem. Aceitável só em desenvolvimento local.');
  }
  if (!config.nuvemshop.token || !config.nuvemshop.loja) {
    add('aviso', 'NUVEMSHOP_TOKEN/STORE_ID',
      'A sincronização com a loja não roda. O estoque interno continua correto.');
  } else if (!config.nuvemshop.escritaHabilitada) {
    add('aviso', 'NUVEMSHOP_WRITES_ENABLED',
      'A sincronização lê a loja mas não escreve nela. É o padrão seguro: '
      + 'produção precisa desta variável em "true" para empurrar estoque.');
  }
  if (config.nuvemshop.token && config.nuvemshop.loja && !config.nuvemshop.publicacaoHabilitada) {
    add('aviso', 'NUVEMSHOP_PUBLICACAO_ENABLED',
      'Criar, atualizar, publicar e despublicar produto na loja está desligado. '
      + 'Preparar e aprovar continuam funcionando; a escrita externa é o único passo travado.');
  }
  if (!config.fotos.temR2) {
    add('aviso', 'FOTOS',
      'Sem R2. Foto por URL externa continua funcionando; upload recusa com mensagem clara.');
  }
  return p;
}

/** Só o que impede a API de funcionar. */
export function bloqueios(config) {
  return diagnosticar(config).filter((x) => x.gravidade === 'bloqueio');
}

/** Uma linha por bloqueio, no log — e nada de valor de segredo, só o nome
 *  da variável e o efeito. Um segredo ausente é invisível em `wrangler
 *  tail`: o Worker sobe, responde, e recusa tudo. */
export function registrarBloqueios(config, { console: saida = console } = {}) {
  const lista_ = bloqueios(config);
  for (const b of lista_) saida.error('[config] ' + b.chave + ' ausente — ' + b.efeito);
  return lista_.length;
}
