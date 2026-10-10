/** Enriquecimento editorial factual. Puro: sem rede, banco ou efeitos comerciais.
 * A marca, os cuidados e a taxonomia comercial vêm de fontes verificadas pelo
 * chamador. Nenhuma regra daqui determina preço, estoque ou publicação. */
import { gerarTextoDoSite, normalizar, nomeCompacto } from './texto-site.js';

export const REGRA_ENRIQUECIMENTO = 'catalogo-factual-2026-10-09/v1';
// Fonte: snapshot remoto 09/10/2026; marca Marquesa em 595 anúncios antigos.
export const MARCA_CANONICA = 'Marquesa';
// Trecho integral dominante em 472 anúncios, exemplo Nuvemshop 238432990.
// Mantém os três itens aprovados, sem acrescentar instruções de outra classe.
export const CUIDADOS_HTML = '<p><strong>Como preservar suas semijoias:</strong></p>\n<ul>\n<li>Evite o contato com &aacute;gua ao tomar banho, entrar no mar, rio ou piscina com suas pe&ccedil;as.</li>\n<li>Retire suas semijoias antes de dormir, realizar tratamentos est&eacute;ticos ou atividades que gerem transpira&ccedil;&atilde;o intensa.</li>\n<li>Armazene suas pe&ccedil;as individualmente para evitar arranh&otilde;es ou outros danos</li>\n</ul>';
const texto = (v) => typeof v === 'object' && v !== null ? String(v.pt ?? '') : String(v ?? '');
const espacos = (v) => texto(v).replace(/\s+/g, ' ').trim();
const ENTIDADES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', ccedil: 'ç', ordm: 'º', deg: '°', ndash: '–', mdash: '—', ldquo: '“', rdquo: '”' };
const decodificar = (v) => texto(v).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, chave) => {
  if (chave.startsWith('#')) { const n = chave[1].toLowerCase() === 'x' ? parseInt(chave.slice(2), 16) : Number(chave.slice(1)); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : inteira; }
  return ENTIDADES[chave.toLowerCase()] ?? inteira;
});
const htmlTexto = (v) => espacos(decodificar(texto(v).replace(/<[^>]*>/g, ' ')));
const escapar = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bytes = (v) => new TextEncoder().encode(v).length;
const localizado = (antes, pt) => antes && typeof antes === 'object' && !Array.isArray(antes) ? { ...antes, pt } : typeof antes === 'string' ? pt : { pt };
const distintos = (vs) => [...new Map(vs.filter(Boolean).map(v => [normalizar(v), v])).values()];
const inseguro = (v) => /<(?:script|style|iframe|object|embed|form|input)\b|\bon\w+\s*=|(?:javascript|data)\s*:/i.test(v);

/** Retira SOMENTE um rótulo explícito cujo valor exista no campo SKU remoto.
 * Preserva códigos desconhecidos, modelos, medidas e códigos comerciais. */
export function removerCodigoConfirmado(descricao, skus = []) {
  const validos = new Set(skus.map(espacos).filter(Boolean));
  const removidos = [];
  const rotulo = /\b(?:c(?:[oó]|&oacute;|&#243;|&#xf3;)d(?:igo)?\.?|sku)\s*:\s*([\w.-]+)/gi;
  let html = texto(descricao).replace(/<(p|div|li)\b[^>]*>[\s\S]*?<\/\1>/gi, bloco => {
    const simples = htmlTexto(bloco);
    const exato = simples.match(/^(?:c[oó]d(?:igo)?\.?|sku)\s*:\s*([\w.-]+)\s*\.?$/i);
    if (exato && validos.has(exato[1])) { removidos.push(exato[1]); return ''; }
    return bloco;
  });
  html = html.replace(rotulo, (match, sku) => {
    if (!validos.has(sku)) return match;
    removidos.push(sku); return '';
  });
  if (removidos.length) html = html.replace(/<p\b[^>]*>\s*<\/p>/gi, '').trim();
  return { descricao: html, removidos };
}

/** Não apaga tags desconhecidas: a normalização muda apenas equivalências
 * lexicais conhecidas e elimina repetições semânticas dessas equivalências. */
export function normalizarTags(brutas, adicionais = []) {
  const originais = Array.isArray(brutas) ? brutas : texto(brutas).split(',');
  const canonica = (tag) => {
    const t = espacos(tag), n = normalizar(t);
    if (/^banho\s*(?:de\s*)?ouro\s*18\s*k$/.test(n)) return 'Banho de Ouro 18k';
    if (/^banho (?:de )?rodio(?: branco)?$/.test(n)) return n.endsWith('branco') ? 'Banho de Ródio Branco' : 'Banho de Ródio';
    if (/^banho (?:de )?prata$/.test(n)) return 'Banho de Prata';
    if (/^zirconias?$/.test(n)) return 'Zircônia';
    return t;
  };
  return distintos([...originais, ...adicionais].map(canonica)).join(', ');
}

/** A API ordena tags e remove acentos. Essas diferenças de armazenamento
 * não justificam PUT repetido. Mantém a multiplicidade: duplicatas reais
 * ainda precisam ser eliminadas, assim como aliases lexicalmente distintos. */
export function tagsEquivalentes(antes, depois) {
  const tokens = (valor) => (Array.isArray(valor) ? valor : texto(valor).split(','))
    .map(normalizar).filter(Boolean).sort();
  return JSON.stringify(tokens(antes)) === JSON.stringify(tokens(depois));
}

const TIPOS = [
  ['conjunto', /\bconjuntos?\b/, ['Conjuntos', 'Conjunto'], 6463],
  ['chaveiro', /\bchaveiros?\b/, ['Chaveiros', 'Chaveiro'], null],
  ['berloque', /\bberloques?\b/, ['Berloques', 'Berloque'], 192],
  ['tornozeleira', /\btornozeleiras?\b/, ['Tornozeleiras', 'Tornozeleira'], 189],
  ['pulseira', /\bpulseiras?\b|\bbraceletes?\b|\bhand chain\b/, ['Pulseiras', 'Pulseira'], 191],
  ['piercing', /\bpiercings?\b|\bpiecing\b/, ['Piercings', 'Piercing'], 190],
  ['brinco', /\bbrincos?\b|\bargolas?\b/, ['Brincos', 'Brinco'], 194],
  ['anel', /\bane(?:l|is)\b|\baliancas?\b|\baparadores?\b/, ['Anéis', 'Anel'], 200],
  ['pingente', /\bpingentes?\b/, ['Pingentes', 'Pingente'], 192],
  ['colar', /\bcolar(?:es)?\b|\bgargantilhas?\b|\bcordao\b|\bchokers?\b|\bescapularios?\b/, ['Colares', 'Colar'], 196],
];
const ROTULOS = { conjunto: 'Conjunto', chaveiro: 'Chaveiro', berloque: 'Berloque', tornozeleira: 'Tornozeleira', pulseira: 'Pulseira', piercing: 'Piercing', brinco: 'Brinco', anel: 'Anel', pingente: 'Pingente', colar: 'Colar' };

function fichaEspecifica(html) {
  // Só texto anterior ao bloco de cuidados pode provar atributos da peça.
  const semCuidados = texto(html).split(/Como preservar suas semijoias/i)[0];
  return htmlTexto(semCuidados);
}
function campoDaFicha(html, rotulo) {
  const linhas = decodificar(texto(html).split(/Como preservar suas semijoias/i)[0]
    .replace(/<\/(?:p|div|li|tr|h\d)>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ')).split('\n');
  for (const linha of linhas) {
    const m = linha.trim().match(new RegExp(`^${rotulo}\\s*:\\s*(.+)$`, 'i'));
    if (m) {
      const valor = espacos(m[1]).split(/\s+(?:Banho|Cor(?:es)?|Medidas?|Tamanho|Peso|Pedra|Garantia|Semijoia|Cód(?:igo)?)\s*:/i)[0];
      return valor.length <= 100 && !/garanti|hipoalerg|antialerg/i.test(valor) ? valor : '';
    }
  }
  return '';
}
function tipoDoNome(nome) {
  const n = normalizar(nome);
  // O primeiro tipo nomeado define a peça; "colar com pingente" continua colar.
  const encontrados = TIPOS.map(t => ({ t, indice: n.search(t[1]) })).filter(v => v.indice >= 0).sort((a, b) => a.indice - b.indice);
  return encontrados[0]?.t;
}

function acabamentoLiteral(valor) {
  const limpo = espacos(valor).replace(/[.]$/, '');
  const canonico = normalizarTags([limpo]);
  return /^banho (?:de )?(?:ouro\s*18\s*k|rodio(?: branco)?|prata)$/i.test(normalizar(canonico)) ? canonico : null;
}

/** Corrige apenas rótulos de cor em TEXTO GERADO com origem já comprovada.
 * Quem chama deve validar o journal/regra e a igualdade do estado atual.
 * Não autoriza reescrever descrição humana nem inferir uma cor de um banho. */
export function normalizarCoresDoTextoGerado(descricao) {
  let corrigidos = 0;
  const original = texto(descricao);
  const resultado = original.replace(/\bCores?\s*:\s*([^<.]+)([.]?)/gi, (trecho, lista, ponto) => {
    const valores = lista.split(',').map(espacos).filter(Boolean);
    const acabamentos = distintos(valores.map(acabamentoLiteral).filter(Boolean));
    if (!acabamentos.length) return trecho;
    const cores = valores.filter(v => !acabamentoLiteral(v));
    corrigidos++;
    if (cores.length) {
      const foraDoCampo = normalizar(htmlTexto(original.replace(trecho, ''))).replace(/\bbanho de\b/g, 'banho');
      const ausentes = acabamentos.filter(a => !foraDoCampo.includes(normalizar(a).replace(/\bbanho de\b/g, 'banho')));
      const prefixo = ausentes.length ? 'Acabamento: ' + ausentes.join(' ou ') + '. ' : '';
      return prefixo + 'Cores: ' + cores.join(', ') + ponto;
    }
    // A informação de banho continua na copy, mas nunca sob o rótulo Cor.
    return 'Acabamento: ' + acabamentos.join(' ou ') + ponto;
  });
  return { descricao: resultado, corrigidos };
}

export function fatosDoProduto(produto, cadastro = {}, categorias = []) {
  const nome = espacos(produto.name) || espacos(cadastro.desc ?? cadastro.nome);
  const ficha = fichaEspecifica(produto.description);
  const nomes = distintos([nome, espacos(cadastro.desc ?? cadastro.nome)]);
  // Nome é fonte de identidade; categoria "Outros" não define um tipo.
  let tipo = nomes.map(tipoDoNome).find(Boolean);
  if (!tipo) {
    const declaradas = distintos([espacos(cadastro.cat), ...(produto.categories ?? []).map(c => espacos(typeof c === 'object' ? c.name ?? c.nome : categorias.find(v => String(v.id) === String(c))?.name))]);
    const tiposDeclarados = TIPOS.filter(([, , aliases]) => declaradas.some(c => aliases.some(a => normalizar(a) === normalizar(c))));
    if (tiposDeclarados.length === 1) tipo = tiposDeclarados[0];
  }
  const fonte = normalizar(`${nomes.join(' ')} ${ficha}`);
  const acabamentos = [];
  const banhoFicha = normalizar(campoDaFicha(produto.description, 'Banho'));
  if (/banho (?:de )?ouro\s*18\s*k/.test(fonte) || /^ouro\s*18\s*k$/.test(banhoFicha)) acabamentos.push('Banho de Ouro 18k');
  if (/banho (?:de )?rodio branco/.test(fonte) || banhoFicha === 'rodio branco') acabamentos.push('Banho de Ródio Branco');
  else if (/banho (?:de )?rodio\b/.test(fonte) || banhoFicha === 'rodio') acabamentos.push('Banho de Ródio');
  if (/banho (?:de )?prata\b/.test(fonte) || banhoFicha === 'prata') acabamentos.push('Banho de Prata');
  const materialExplicito = espacos(cadastro.material) || campoDaFicha(produto.description, 'Material');
  const materiais = materialExplicito ? [materialExplicito] : [];
  if (!materialExplicito && /\bprata\s*925\b/.test(normalizar(nomes.join(' ')))) materiais.push('Prata 925');
  if (!materialExplicito && /\baco inox(?:idavel)?\b/.test(normalizar(nomes.join(' ')))) materiais.push('Aço Inox');
  const pedras = [];
  if (/\bzirconias?\b/.test(fonte)) pedras.push('Zircônia');
  if (/\bperolas?\b/.test(fonte)) pedras.push('Pérola');
  // Não reduz verde-esmeralda a verde, nem interpreta "Cristal" como material.
  const cores = [];
  const corNome = normalizar(nomes.join(' '));
  const padraoCor = /\b(verde esmeralda|rosa pink|azul|vermelho|roxo|verde|pink|rosa|preto|preta|branco|branca|dourado|prateado)\b/g;
  const nomesCores = { 'verde esmeralda': 'Verde Esmeralda', 'rosa pink': 'Rosa Pink', azul: 'Azul', vermelho: 'Vermelho', roxo: 'Roxo', verde: 'Verde', pink: 'Pink', rosa: 'Rosa', preto: 'Preto', preta: 'Preto', branco: 'Branco', branca: 'Branco', dourado: 'Dourado', prateado: 'Prateado' };
  for (const m of corNome.matchAll(padraoCor)) {
    // Ródio Branco é acabamento, não declara a cor da peça inteira.
    if (m[1] === 'branco' && /rodio\s*$/.test(corNome.slice(0, m.index))) continue;
    cores.push(nomesCores[m[1]]);
  }
  const corExplicita = espacos(cadastro.cor);
  if (corExplicita) cores.push(corExplicita);
  const atributos = produto.attributes ?? [];
  for (let i = 0; i < atributos.length; i++) {
    if (!['cor', 'cores'].includes(normalizar(texto(atributos[i])))) continue;
    for (const variante of produto.variants ?? []) {
      const valor = espacos(variante.values?.[i]);
      // Convenção comprovada da loja (§64): "Cor" também armazena banho.
      // Um acabamento literal não se transforma em cor na copy comercial.
      const acabamento = acabamentoLiteral(valor);
      if (acabamento) acabamentos.push(acabamento);
      else if (!/^banho\b/i.test(normalizar(valor))) cores.push(valor);
    }
  }
  const corFicha = campoDaFicha(produto.description, 'Cores?');
  if (corFicha) for (const valor of corFicha.split(',').map(espacos)) {
    const acabamento = acabamentoLiteral(valor);
    if (acabamento) acabamentos.push(acabamento);
    else if (valor && !/^banho\b/i.test(normalizar(valor))) cores.push(valor.replace(/[.]$/, ''));
  }
  return {
    nome, tipo: tipo?.[0] ?? null, categoriasPossiveis: tipo?.[2] ?? [],
    googleProductCategory: tipo?.[3] ?? null,
    acabamentos: distintos(acabamentos), materiais: distintos(materiais),
    pedras: distintos(pedras), cores: distintos(cores), ficha,
  };
}

export function categoriaComprovada(fatos, categorias) {
  const possibilidades = new Set(fatos.categoriasPossiveis.map(normalizar));
  const porId = new Map(categorias.map(c => [String(c.id), c]));
  const pais = (c) => { const resultado = [], vistos = new Set(); let atual = c; while (atual?.parent && !vistos.has(String(atual.parent))) { vistos.add(String(atual.parent)); atual = porId.get(String(atual.parent)); if (atual) resultado.push(atual); } return resultado; };
  const prata = /\bprata\s*925\b/.test(normalizar(`${fatos.nome} ${fatos.materiais.join(' ')} ${fatos.ficha}`));
  let correspondentes = categorias.filter(c => possibilidades.has(normalizar(texto(c.name ?? c.nome))) && !c.arquivada_em && (!pais(c).some(p => normalizar(texto(p.name ?? p.nome)) === 'prata 925') || prata));
  if (prata) {
    const ramoPrata = correspondentes.filter(c => pais(c).some(p => normalizar(texto(p.name ?? p.nome)) === 'prata 925'));
    if (ramoPrata.length) correspondentes = ramoPrata;
  }
  // Brinco > Brincos é uma hierarquia comprovada, não duas categorias rivais.
  correspondentes = correspondentes.filter(c => !correspondentes.some(outro => pais(outro).some(p => String(p.id) === String(c.id))));
  return correspondentes.length === 1 ? correspondentes[0] : null;
}

function tituloSeguro(nome, marca) {
  let titulo = nomeCompacto(nome);
  for (const [padrao, troca] of [[/\bCravejad[oa] (?:em|com) Zircônias\b/gi, 'com Zircônias'], [/\bBanho de Ouro\b/gi, 'Banho Ouro'], [/\bBanho de Ródio\b/gi, 'Banho Ródio']]) {
    if (bytes(titulo) > 70) titulo = titulo.replace(padrao, troca);
  }
  if (bytes(titulo) > 70) titulo = titulo.replace(/\b(de|em|com)\s+/gi, '').replace(/\s+/g, ' ').trim();
  // O título pode resumir, mas a descrição mantém o nome e todos os fatos.
  if (bytes(titulo) > 70) titulo = titulo.replace(/\s*Banho\s+(?:Ouro|Ródio|Prata)(?:\s+18\s*k|\s+Branco)?\s*$/i, '').trim();
  if (marca && bytes(`${titulo} | ${marca}`) <= 70) titulo += ` | ${marca}`;
  return bytes(titulo) <= 70 ? titulo : null;
}

/** Retorna patch já no formato dos campos Nuvemshop, mantendo outros idiomas.
 * `substituirTextoGerado` só deve ser true quando o chamador provar origem v1.
 * Cuidados existentes são preservados; substituição exata opcional exige que
 * `cuidadosHtmlAnterior` seja um trecho integral conhecido do cadastro atual. */
export function enriquecerProduto(produto, {
  cadastro = {}, marcaCanonica = '', cuidadosHtml = '', cuidadosHtmlAnterior = '',
  categorias = [], novo = false, substituirTextoGerado = false, nomesIguais = 0,
  seoTitulosOcupados = [], seoDescricoesOcupadas = [],
} = {}) {
  const patch = {}, evidencias = [], pendencias = [];
  const registrar = (campo, fonte, valor) => evidencias.push({ campo, fonte, valor });
  const fatos = fatosDoProduto(produto, cadastro, categorias);
  const skus = [produto.sku, ...(produto.variants ?? []).map(v => v.sku)].filter(Boolean);
  const limpo = removerCodigoConfirmado(produto.description, skus);
  let descricao = limpo.descricao;
  if (novo && substituirTextoGerado) {
    const coresCorrigidas = normalizarCoresDoTextoGerado(descricao);
    if (coresCorrigidas.corrigidos) registrar('description', 'Origem gerada comprovada e valor literal de acabamento sob rótulo Cor', coresCorrigidas.corrigidos);
    descricao = coresCorrigidas.descricao;
  }
  if (limpo.removidos.length) registrar('description', 'SKU exato do produto/variante remoto', limpo.removidos);

  const nomeSemCodigo = removerCodigoConfirmado(fatos.nome, skus).descricao;
  const nomeComercial = fatos.tipo && !tipoDoNome(nomeSemCodigo) && !skus.some(s => normalizar(s) === normalizar(nomeSemCodigo)) ? `${ROTULOS[fatos.tipo]} ${nomeSemCodigo}` : nomeSemCodigo;
  // Nome repetido não impede copy verdadeira. A identidade de duas peças não
  // é decidida por este helper; colisões SEO são resolvidas por textos factuais.
  let gerado = gerarTextoDoSite({ nome: nomeComercial, sku: skus[0], nomesIguais: 0 });
  const promessa = /garant|dur[aá]vel|durabilidade|duradour|hipoalerg|antial[eé]rg|sorte|boas energias|ajuste perfeito|qualquer dedo|[àa] prova|eleg[aâ]n|sofistica|glamour|exclusiv/i;
  if (!gerado.ok && fatos.tipo && nomeComercial && !skus.some(s => normalizar(s) === normalizar(nomeComercial)) && !promessa.test(nomeComercial)) {
    const titulo = tituloSeguro(nomeComercial, '');
    if (titulo) {
      let meta = `${titulo}. Consulte os detalhes e as opções disponíveis desta peça na Marquesa.`;
      if (meta.length > 160) meta = `${titulo}. Veja os detalhes da peça na Marquesa.`;
      gerado = { ok: true, descricao: `<p>${escapar(nomeComercial)}. Conheça as características e as opções da peça.</p>`, seoTitulo: titulo, seoDescricao: meta };
    }
  }
  if ((!htmlTexto(descricao) || (novo && substituirTextoGerado)) && gerado.ok) {
    const partes = [gerado.descricao];
    // Mantém integralmente a ficha factual que o texto gerado não tinha.
    if (novo && substituirTextoGerado && descricao && descricao !== gerado.descricao) {
      const fichaTemRotulos = /\b(?:Material|Banho|Medidas|Cor|Pedra|Tamanho|Peso)\s*:/i.test(fatos.ficha);
      if (fichaTemRotulos) partes.push(descricao);
    }
    const detalhes = [];
    if (fatos.acabamentos.length) detalhes.push(`Acabamento: ${fatos.acabamentos.join(' ou ')}.`);
    if (fatos.materiais.length) detalhes.push(`Material: ${fatos.materiais.join(' ou ')}.`);
    if (fatos.cores.length) detalhes.push(`Cores: ${fatos.cores.join(', ')}.`);
    if (fatos.pedras.length && !normalizar(fatos.nome).includes('zircon') && !normalizar(fatos.nome).includes('perola')) detalhes.push(`Detalhes da peça: ${fatos.pedras.join(', ')}.`);
    if (detalhes.length && !/\b(?:Material|Banho|Medidas|Cor|Pedra|Tamanho|Peso)\s*:/i.test(fatos.ficha)) partes.push(`<p>${escapar(detalhes.join(' '))}</p>`);
    descricao = partes.join('\n');
    registrar('description', 'Nome comercial, ficha específica e atributos do cadastro', fatos);
  } else if (!htmlTexto(descricao)) pendencias.push({ campo: 'description', motivo: gerado.motivo ?? 'Não há identidade comercial comprovada.' });

  if (cuidadosHtml && !inseguro(cuidadosHtml) && htmlTexto(descricao)) {
    if (cuidadosHtmlAnterior && descricao.includes(cuidadosHtmlAnterior)) {
      descricao = descricao.replace(cuidadosHtmlAnterior, cuidadosHtml);
      registrar('description', 'Bloco anterior integral e padrão de cuidados aprovado fornecidos pelo chamador', 'cuidados');
    } else if (!/como preservar suas semijoias/i.test(htmlTexto(descricao))) {
      descricao += `\n${cuidadosHtml}`;
      registrar('description', 'Padrão de cuidados aprovado fornecido pelo chamador', 'cuidados');
    }
  }
  if (descricao !== texto(produto.description) && descricao && !inseguro(descricao)) patch.description = localizado(produto.description, descricao);
  else if (inseguro(descricao)) pendencias.push({ campo: 'description', motivo: 'HTML requer revisão de segurança antes de escrita.' });

  // SEO não vazio é preservado inclusive para novos: a origem v1 da descrição
  // não autoriza apagar títulos e metas aprovados em outra frente.
  if (!espacos(produto.seo_title) && gerado.ok) {
    const tituloBase = tituloSeguro(nomeComercial, '');
    const marca = espacos(marcaCanonica);
    // "Pulseira Cadeia de Consagração" admite "Pulseira de Consagração"
    // como resumo comercial. A cadeia e o acabamento seguem na descrição;
    // a alternativa não afirma diferença física entre peças com mesmo nome.
    const nomeResumido = fatos.tipo === 'pulseira' ? nomeComercial.replace(/\bPulseira\s+(?:de\s+)?Cadeia(?:\s+de)?\s+/i, 'Pulseira de ') : nomeComercial;
    const tituloResumido = nomeResumido !== nomeComercial ? tituloSeguro(nomeResumido, marca) : null;
    const candidatos = [tituloSeguro(nomeComercial, marca), marca && `${marca}: ${tituloBase}`, marca && `${tituloBase} na ${marca}`, tituloBase && `Conheça ${tituloBase}`, tituloBase && `${tituloBase}: detalhes da peça`, tituloResumido];
    const ocupados = new Set([...seoTitulosOcupados].map(normalizar));
    const titulo = candidatos.find(t => t && bytes(t) <= 70 && !ocupados.has(normalizar(t)));
    if (titulo) { patch.seo_title = localizado(produto.seo_title, titulo); registrar('seo_title', 'Nome comercial comprovado; máximo 70 bytes UTF-8; colisões fornecidas pelo chamador', titulo); }
    else pendencias.push({ campo: 'seo_title', motivo: 'Não há título distinto comprovado dentro de 70 bytes.' });
  }
  if (!espacos(produto.seo_description) && gerado.ok) {
    const base = tituloSeguro(nomeComercial, '');
    const ocupadas = new Set([...seoDescricoesOcupadas].map(normalizar));
    const candidatas = [gerado.seoDescricao, `${base}. Conheça as características e as opções disponíveis desta peça na Marquesa.`, `Confira ${base}. Veja as características e as opções disponíveis na Marquesa.`];
    const meta = candidatas.find(m => m && m.length >= 65 && m.length <= 160 && !ocupadas.has(normalizar(m)));
    if (meta) { patch.seo_description = localizado(produto.seo_description, meta); registrar('seo_description', 'Nome comercial e finalidade da peça; colisões fornecidas pelo chamador', meta); }
    else pendencias.push({ campo: 'seo_description', motivo: 'Não há meta description distinta comprovada dentro dos limites.' });
  }
  if (!gerado.ok && (!espacos(produto.seo_title) || !espacos(produto.seo_description))) pendencias.push({ campo: 'seo', motivo: gerado.motivo });

  if (marcaCanonica && espacos(produto.brand) !== espacos(marcaCanonica)) {
    // Uma marca diferente legítima não é substituída pela marca da loja.
    const grafiaHistoricaConfirmada = normalizar(marcaCanonica) === 'marquesa' && normalizar(produto.brand) === 'mrquesa';
    if (!espacos(produto.brand) || normalizar(produto.brand) === normalizar(marcaCanonica) || grafiaHistoricaConfirmada) {
      patch.brand = espacos(marcaCanonica); registrar('brand', 'Marca canônica verificada fornecida pelo chamador', patch.brand);
    } else pendencias.push({ campo: 'brand', motivo: 'Marca atual difere semanticamente da marca canônica.' });
  }
  const tags = normalizarTags(produto.tags, novo ? [ROTULOS[fatos.tipo], ...fatos.acabamentos, ...fatos.pedras, ...fatos.cores, ...fatos.materiais] : []);
  if (tags && !tagsEquivalentes(tags, produto.tags)) { patch.tags = tags; registrar('tags', 'Equivalências lexicais e atributos explícitos da peça', tags); }
  if (!(produto.categories ?? []).length) {
    const categoria = categoriaComprovada(fatos, categorias);
    if (categoria?.id != null) { patch.categories = [categoria.id]; registrar('categories', 'Tipo declarado e categoria comercial existente única', { tipo: fatos.tipo, id: categoria.id }); }
    else pendencias.push({ campo: 'categories', motivo: 'A taxonomia fornecida não contém categoria comercial única para o tipo comprovado.' });
  }
  return { patch, evidencias, pendencias, fatos, regra: REGRA_ENRIQUECIMENTO };
}
