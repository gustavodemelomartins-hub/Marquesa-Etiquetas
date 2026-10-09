/** Texto do site para peça NOVA na Nuvemshop: descrição, título SEO e meta
 *  description — §62.
 *
 *  Não é um sistema novo de SEO. É a mesma regra editorial da operação de
 *  08/10/2026 (`scripts/seo-catalog-audit.py` › `intro_for`, `natural_meta`,
 *  `compact_name`, `title_needs_change`; resultado em
 *  docs/seo/full-catalogue-2026-10-08.md), portada para o Worker para que a
 *  peça criada oculta já nasça com o texto no mesmo padrão das 327 revisadas.
 *
 *  A diferença é a fonte. Lá havia a ficha da loja (Material, Banho,
 *  Medidas); aqui, para peça que ainda não tem anúncio, só existe o CADASTRO
 *  daqui. Então o texto usa apenas o nome cadastrado e a família que o nome
 *  declara — nenhum tamanho, medida, pedra, material, banho, peso, garantia
 *  ou propriedade que o nome não diga. Quando nem isso basta, a resposta é
 *  `precisaInformacao` com o motivo, nunca um texto genérico.
 *
 *  Puro: sem banco, sem rede. Quem chama decide o que fazer com a resposta.
 */

export const REGRA_TEXTO = 'seo-2026-10-08/v1';

const LIMITE_TITULO_BYTES = 70;   // limite confirmado na API (bytes UTF-8, com acento)
const META_MIN = 65;
const META_MAX = 160;

const bytes = (s) => new TextEncoder().encode(s).length;
const espacos = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const normalizar = (s) => espacos(s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Promessas que a regra de 08/10 recusa em qualquer campo: não são fato
 *  do cadastro e algumas são afirmação de saúde ou garantia. */
const PROIBIDO = /garant|dur[aá]vel|durabilidade|duradour|hipoalerg|antial[eé]rg|sorte|boas energias|ajuste perfeito|qualquer dedo|[àa] prova|eleg[aâ]n|sofistica|glamour|exclusiv/i;

/** "Banho de Ouro" vira "Banho Ouro" só quando o nome passa de 60 letras —
 *  a mesma compressão do título revisado em 08/10. */
export function nomeCompacto(nome) {
  let n = espacos(nome);
  const trocas = [
    [/\bBanho de Ouro\b/i, 'Banho Ouro'], [/\bBanho de Ródio\b/i, 'Banho Ródio'],
    [/\bBanho de Prata\b/i, 'Banho Prata'], [/\bCravejado em Zircônias\b/i, 'com Zircônias'],
    [/\bCravejada em Zircônias\b/i, 'com Zircônias'],
  ];
  for (const [de, para] of trocas) if (n.length > 60) n = n.replace(de, para);
  return n;
}

/** A família da peça pelo nome — o "para quê" da introdução. `null` quando
 *  o nome não declara família conhecida: aí não há o que dizer sem inventar. */
function usoDaFamilia(n) {
  if (n.includes('chaveiro')) return 'acompanhar as chaves ou complementar um presente';
  if (n.includes('berloque')) return 'personalizar a composição da sua pulseira';
  if (n.includes('tornozel')) return 'compor o visual com destaque no tornozelo';
  if (n.includes('hand chain') || n.includes('pulseira de mao')) return 'compor um acessório entre o pulso e a mão';
  if (n.includes('choker')) return 'compor o visual próximo ao pescoço ou combinar com colares de outros comprimentos';
  if (n.includes('colar') || n.includes('gargantilha') || n.includes('cordao')) return 'compor o colo e combinar com os acessórios do seu visual';
  if (/\banel\b|alianca|aparador/.test(n)) return 'compor um mix de anéis ou usar como destaque nas mãos';
  if (n.includes('piercing') || n.includes('piecing')) return 'complementar a composição de acessórios na orelha';
  if (n.includes('brinco') || n.includes('argola')) return 'dar destaque à composição de acessórios junto ao rosto';
  if (n.includes('pulseira') || n.includes('bracelete')) return 'compor o pulso com outros acessórios ou usar como destaque';
  if (n.includes('conjunto')) return 'combinar as peças em uma mesma composição de acessórios';
  if (n.includes('pingente')) return 'personalizar um colar com o desenho da peça';
  return null;
}

/** Só quando o DESENHO está escrito no nome comercial. */
const DESENHOS = [
  [/\bcora[cç]([aã]o|oes|ões)\b/, 'O desenho de coração destaca o tema afetivo da peça.'],
  [/\bflor(es|zinha)?\b/, 'O motivo de flor acrescenta uma referência floral à composição.'],
  [/\bcruz\b/, 'O desenho de cruz permite destacar esse símbolo no visual.'],
  [/\btrevos?\b/, 'O formato de trevo traz um motivo reconhecível à composição.'],
  [/\bestrelas?\b/, 'O motivo de estrela destaca o desenho da peça.'],
  [/\bargolas?\b/, 'O formato de argola pode ser combinado com outros acessórios da mesma proposta.'],
  [/\bpontos? de luz\b/, 'O ponto de luz serve como detalhe focal na composição de acessórios.'],
  [/\belos?\b/, 'O desenho de elos destaca a estrutura da peça.'],
  [/\bperolas?\b/, 'O detalhe de pérola permite combinar a peça com outros acessórios de pérolas.'],
  [/\bpet\b/, 'O motivo pet permite destacar esse tema na composição.'],
];

function fechamento(n, uso) {
  if (n.includes('aparador')) return 'Use junto à aliança ou a um anel solitário para compor as mãos.';
  if (n.includes('chaveiro')) return 'Um acessório para reunir as chaves e presentear com o tema da peça.';
  if (n.includes('berloque')) return 'Escolha este motivo para personalizar sua pulseira de berloques.';
  if (n.includes('choker')) return 'Use próximo ao pescoço ou em uma composição com colares de outros comprimentos.';
  if (n.includes('hand chain') || n.includes('pulseira de mao')) return 'A proposta hand chain conecta a composição do pulso à mão.';
  if (n.includes('regulavel')) return 'O modelo regulável permite compor um mix de acessórios.';
  if (n.includes('argola')) return 'Combine com brincos ou piercings para criar uma composição na orelha.';
  if (/\banel\b/.test(n)) return 'Use sozinho ou junto a outros anéis para destacar esse desenho nas mãos.';
  if (n.includes('colar') || n.includes('cordao')) return 'Combine com outros comprimentos de colar ou deixe o desenho em destaque no colo.';
  if (n.includes('pulseira') || n.includes('bracelete')) return 'Use no pulso como destaque ou combine com outras pulseiras.';
  if (n.includes('brinco') || n.includes('piercing')) return 'Combine com outros acessórios da orelha para destacar o desenho da peça.';
  if (n.includes('conjunto')) return 'As peças do conjunto podem ser usadas juntas em uma mesma composição.';
  return uso ? `Para ${uso}.` : null;
}

/** O detalhe de uso que a meta acrescenta ao nome. */
function detalheDaMeta(n) {
  if (n.includes('choker')) return ' Para usar próximo ao pescoço ou em mix de colares.';
  if (n.includes('aparador')) return ' Para combinar com sua aliança ou anel solitário.';
  if (n.includes('berloque')) return ' Personalize a composição da sua pulseira.';
  if (n.includes('hand chain')) return ' Um detalhe para compor o pulso e a mão.';
  if (n.includes('argola')) return ' Combine com seus brincos e piercings.';
  if (n.includes('conjunto')) return ' Use as peças juntas na mesma composição.';
  if (/\banel\b/.test(n)) return ' Use sozinho ou em um mix de anéis.';
  if (n.includes('pulseira')) return ' Combine no pulso com outros acessórios.';
  if (n.includes('brinco')) return ' Destaque o desenho junto ao rosto.';
  if (n.includes('colar') || n.includes('cordao')) return ' Destaque o desenho no colo.';
  if (n.includes('pingente')) return ' Personalize seu colar com o desenho da peça.';
  return '';
}

const escaparHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Gera os três textos de UMA peça.
 *
 *  `nome` é o nome cadastrado (`produtos.desc`). `nomesIguais` diz quantos
 *  OUTROS produtos (daqui ou da loja) têm exatamente o mesmo nome: com nome
 *  repetido, o título e a meta seriam duplicados, e a regra de 08/10 recusa
 *  inventar diferença (nunca o SKU como "diferencial").
 *
 *  Devolve `{ ok: true, descricao, seoTitulo, seoDescricao, regra }` ou
 *  `{ ok: false, precisaInformacao: true, motivo }`. */
export function gerarTextoDoSite({ nome, sku, nomesIguais = 0 } = {}) {
  const limpo = espacos(nome);
  if (!limpo || normalizar(limpo) === normalizar(sku)) {
    return { ok: false, precisaInformacao: true, motivo: 'O nome da peça é só o código: falta o nome comercial.' };
  }
  if (nomesIguais > 0) {
    return {
      ok: false, precisaInformacao: true,
      motivo: 'Outro produto tem exatamente o mesmo nome. Sem um dado cadastrado que diferencie as duas peças, o texto sairia duplicado.',
    };
  }
  const n = normalizar(limpo);
  const uso = usoDaFamilia(n);
  if (!uso) {
    return {
      ok: false, precisaInformacao: true,
      motivo: 'O nome não diz que tipo de peça é (anel, brinco, colar...). Sem isso o texto seria genérico.',
    };
  }

  const frases = [`${limpo}.`];
  const desenho = DESENHOS.find(([padrao]) => padrao.test(n));
  if (desenho) frases.push(desenho[1]);
  const fim = fechamento(n, uso);
  if (fim) frases.push(fim);
  const descricao = `<p>${escaparHtml(frases.join(' '))}</p>`;

  let seoTitulo = nomeCompacto(limpo);
  if (bytes(`${seoTitulo} | Marquesa`) <= LIMITE_TITULO_BYTES) seoTitulo += ' | Marquesa';
  if (bytes(seoTitulo) > LIMITE_TITULO_BYTES) {
    return {
      ok: false, precisaInformacao: true,
      motivo: `O nome passa de ${LIMITE_TITULO_BYTES} caracteres mesmo abreviado: o título SEO precisa ser escrito por alguém.`,
    };
  }

  const base = nomeCompacto(limpo);
  let seoDescricao = `${base}.${detalheDaMeta(n)} Confira os detalhes.`;
  if (seoDescricao.length > META_MAX) seoDescricao = `${base}. Veja os detalhes e opções disponíveis na Marquesa.`;
  if (seoDescricao.length > META_MAX) seoDescricao = `${base}. Confira os detalhes.`;
  if (seoDescricao.length < META_MIN) seoDescricao = `${base}.${detalheDaMeta(n)} Veja os detalhes e opções disponíveis na Marquesa.`;
  if (seoDescricao.length > META_MAX || seoDescricao.length < META_MIN) {
    return {
      ok: false, precisaInformacao: true,
      motivo: 'Não coube uma meta description factual entre 65 e 160 caracteres com o nome cadastrado.',
    };
  }

  for (const t of [descricao, seoTitulo, seoDescricao]) {
    /* Defesa: o nome cadastrado poderia trazer uma promessa (ex.: "Anel
       Hipoalergênico"). Repetir isso no site é afirmar o que ninguém
       verificou — então o texto não sai. */
    if (PROIBIDO.test(t)) {
      return {
        ok: false, precisaInformacao: true,
        motivo: 'O nome traz uma promessa (garantia, durabilidade, alergia...) que o texto do site não pode repetir sem confirmação.',
      };
    }
  }
  return { ok: true, descricao, seoTitulo, seoDescricao, regra: REGRA_TEXTO };
}
