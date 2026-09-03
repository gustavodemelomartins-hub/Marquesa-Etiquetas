/** Normalização das linhas da planilha histórica `Vendas Marquesa.xlsx`.
 *
 *  Módulo PURO de propósito: não conhece D1, não escreve nada, não importa
 *  nada. Recebe a linha como ela veio do SheetJS e devolve o par
 *  (cru, derivado). É o que permite provar a classificação contra as 1.341
 *  linhas reais sem subir Worker nenhum.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  A REGRA QUE GOVERNA ESTE ARQUIVO INTEIRO
 *
 *  O cru nunca é jogado fora. Toda função aqui devolve `null` quando não
 *  sabe, e `null` significa "não sei", nunca zero e nunca "vazio". A planilha
 *  tem 15 linhas sem data utilizável, 9 sem valor e 272 com um texto
 *  comercial na coluna Desconto — apagar qualquer um desses para "limpar o
 *  dado" destruiria o histórico que a importação existe para preservar.
 *
 *  Por isso `-`, `Não lembro` e célula vazia viram NULL, e o texto original
 *  fica guardado ao lado, sempre.
 */

/* ------------------------------------------------------------------ texto */

/** Marca as células que a planilha usa para dizer "não sei / não se aplica".
 *  `-` aparece em data, preço, total, pagamento e observação. */
const VAZIO = new Set(['', '-', '--', 'n/a', 'na', 'nao lembro', 'não lembro', '?']);

export function limpar(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s;
}

/** Devolve null para as grafias de "sem informação". O cru continua sendo
 *  guardado pelo chamador — isto é só a leitura semântica. */
export function limparSemantico(v) {
  const s = limpar(v);
  if (s === null) return null;
  return VAZIO.has(s.toLowerCase()) ? null : s;
}

/** Sem acento, sem caixa, sem espaço duplicado. Serve para BUSCAR e para
 *  propor candidatos — nunca para unir dois clientes sozinho. */
export function normalizarTexto(v) {
  const s = limpar(v);
  if (s === null) return null;
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* ---------------------------------------------------------------- cliente */

export function normalizarNomeCliente(v) {
  return normalizarTexto(v);
}

/* ------------------------------------------------------------------- SKU */

/** O identificador do produto é TEXTO, sempre.
 *
 *  60 das 1.341 linhas trazem sufixo (`996055-2`, `214299-6`). Guardar como
 *  INTEGER perderia o sufixo silenciosamente e faria duas peças diferentes
 *  virarem a mesma — e o sufixo é justamente o que distingue variações da
 *  mesma peça no controle antigo. */
export function normalizarSku(v) {
  const s = limpar(v);
  if (s === null) return null;
  return s.toUpperCase().replace(/\s+/g, '');
}

/** O código-base, sem o sufixo de variação. É por ele que o histórico casa
 *  com o catálogo de hoje quando o SKU cheio não existe mais. */
export function skuBase(v) {
  const s = normalizarSku(v);
  if (s === null) return null;
  const m = s.match(/^(\d{4,})-\d+$/);
  return m ? m[1] : s;
}

/* ------------------------------------------------------------------ datas */

/** Aceita o Date que o SheetJS já converteu, o serial do Excel, e as
 *  grafias brasileiras. Devolve `YYYY-MM-DD` ou null.
 *
 *  Nunca inventa: `-` e `Não lembro` devolvem null, e a linha entra no
 *  histórico com data desconhecida em vez de ficar de fora. */
export function normalizarData(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date && !isNaN(v)) return isoDeData(v);

  if (typeof v === 'number' && isFinite(v)) {
    /* serial do Excel: dia 1 é 1900-01-01, com o bug do 1900 bissexto */
    if (v < 1 || v > 80000) return null;
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    /* O serial não tem fuso. `ms` aponta para meia-noite UTC; ler com
     * getFullYear/getMonth/getDate em Brasília recuava todas as datas um dia.
     * Neste ramo, portanto, os componentes precisam continuar em UTC. */
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }

  const s = limparSemantico(v);
  if (s === null) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const dia = +m[1], mes = +m[2];
    let ano = +m[3];
    if (ano < 100) ano += 2000;
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return null;
}

function isoDeData(d) {
  /* o SheetJS entrega meia-noite local; usar getUTC* deslocaria o dia */
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------- números */

/** Devolve number ou null. Nunca 0 por engano.
 *
 *  `-` em Preço/Total significa "não sei quanto foi", e zero afirmaria que
 *  a peça saiu de graça. São coisas diferentes e o faturamento sente. */
export function normalizarNumero(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  const s = limparSemantico(v);
  if (s === null) return null;

  const limpo = s.replace(/r\$/i, '').replace(/\s/g, '');
  /* 1.234,56 (br) vs 1234.56 */
  const br = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(limpo);
  const n = Number(br ? limpo.replace(/\./g, '').replace(',', '.') : limpo.replace(',', '.'));
  return isFinite(n) ? n : null;
}

/* -------------------------------------------------------------- desconto */

/** A coluna Desconto NÃO é numérica: das 272 linhas preenchidas, a maioria é
 *  um motivo comercial ("Revendedora", "Desconto BLACK", "Presente mãe").
 *
 *  Então ela é preservada como texto, sempre, e o valor numérico só é
 *  extraído quando aparece explicitamente escrito — `Desconto (R$69)`,
 *  `R$10 de Desconto`, `5% de desconto`. Percentual devolve `pct`, e a
 *  conversão para reais fica a cargo de quem conhece o valor da linha.
 *
 *  Não devolve nada por inferência: "Não bateu meta" não vira desconto. */
export function interpretarDesconto(v, { valorBase = null } = {}) {
  const original = limpar(v);
  if (original === null) return { original: null, valor: null, pct: null, rotulo: null };

  const s = original.replace(',', '.');

  const reais = s.match(/r\$\s*(\d+(?:\.\d+)?)/i);
  if (reais) {
    return { original, valor: Number(reais[1]), pct: null, rotulo: rotuloDesconto(original) };
  }

  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) {
    const p = Number(pct[1]);
    const valor = valorBase !== null && isFinite(valorBase) ? +(valorBase * p / 100).toFixed(2) : null;
    return { original, valor, pct: p, rotulo: rotuloDesconto(original) };
  }

  /* "Desconto(5%)" e "Desconto de 3%" já caem no regex acima; o que sobra é
   * motivo puro, sem número — e motivo não é valor. */
  return { original, valor: null, pct: null, rotulo: rotuloDesconto(original) };
}

/** Agrupa o motivo em famílias legíveis, para virar dimensão de análise sem
 *  perder o texto que a gerou. */
function rotuloDesconto(s) {
  const n = normalizarTexto(s);
  if (n === null) return null;
  if (/revendedor/.test(n)) return 'revendedora';
  if (/presente|brinde|eu que dei/.test(n)) return 'presente';
  if (/troca|permuta/.test(n)) return 'troca';
  if (/promo|black|consumidor|copa|aniversario|vip|banho de prata|rodio/.test(n)) return 'promocao';
  if (/vale|rifa|sorteio/.test(n)) return 'vale';
  if (/em aberto|nao bateu meta/.test(n)) return 'pendencia';
  if (/desconto/.test(n)) return 'desconto';
  return 'outro';
}

/* ------------------------------------------------------------------ tipo */

const TIPOS = [
  [/prata\s*925|prata/, 'Prata 925'],
  [/aco\s*inox|inox/, 'Aço Inox'],
  [/banhad/, 'Banhada'],
  [/brinde/, 'Brinde'],
  [/bruto/, 'Bruto'],
];

/** `Banhada` e `Banhadas` são a mesma coisa escrita duas vezes; o original
 *  continua guardado porque a grafia é o dado de origem. */
export function normalizarTipo(v) {
  const n = normalizarTexto(v);
  if (n === null) return null;
  if (/bruto\s*\/\s*banhad/.test(n)) return 'Misto';
  for (const [re, nome] of TIPOS) if (re.test(n)) return nome;
  return 'Outro';
}

/* ------------------------------------------------------------- pagamento */

/** Devolve { forma, parcelas } — 37 grafias distintas na planilha, incluindo
 *  `Cartão de Crétido` e `Cartão Debito`. O texto original é preservado pelo
 *  chamador; aqui só sai a família. */
export function normalizarPagamento(v) {
  const original = limpar(v);
  const n = normalizarTexto(limparSemantico(v));
  if (n === null) return { original, forma: null, parcelas: null };

  const misto = /\/|\+|\be\b|50%/.test(n) && /(pix|cartao|credito|debito|dinheiro)/.test(n);
  const parc = n.match(/(\d+)\s*x/);
  const parcelas = parc ? +parc[1] : null;

  let forma;
  if (/presente|brinde|troca/.test(n)) forma = 'Cortesia/Troca';
  else if (misto) forma = 'Misto';
  else if (/pix/.test(n)) forma = 'Pix';
  else if (/deb[ií]to|debito/.test(n)) forma = 'Cartão de Débito';
  else if (/cr[eé]dito|cretido|credito|cartao/.test(n)) forma = 'Cartão de Crédito';
  else if (/dinheiro/.test(n)) forma = 'Dinheiro';
  else forma = 'Outro';

  return { original, forma, parcelas: forma === 'Cartão de Crédito' ? parcelas : null };
}

/* ---------------------------------------------------------------- status */

/** `PAGO`, `PAGO ` e ` PAGO` são a mesma coisa. `-` não é "não pago": é
 *  desconhecido, e devolve null. */
export function normalizarStatusPagamento(v) {
  const n = normalizarTexto(limparSemantico(v));
  if (n === null) return { original: limpar(v), pago: null };
  if (/^nao pago/.test(n)) return { original: limpar(v), pago: 0 };
  if (/^pago/.test(n)) return { original: limpar(v), pago: 1 };
  return { original: limpar(v), pago: null };
}

/* ------------------------------------------------------- origem comercial */

/** Grafias erradas que são a MESMA origem, mapeadas explicitamente.
 *  Um por um, auditável — nada de distância de edição decidindo sozinha o
 *  canal de uma venda. */
const ALIAS_CANAL = new Map([
  ['maletra', 'Maleta'],
  ['maleta', 'Maleta'],
  ['mercado biani', 'Mercado Biani'],
  ['grupo vip', 'Grupo VIP'],
  ['site', 'Site'],
  ['instagram', 'Instagram'],
  ['encomendas', 'Encomendas'],
  ['encomenda', 'Encomendas'],
  ['revendedora', 'Revendedora'],
  ['sorteio', 'Sorteio'],
]);

/** `Observação Venda` carrega a informação comercial mais rica da planilha, e
 *  ela tem forma: `Canal` ou `Canal (Contexto)`.
 *
 *  Devolve { canal, contexto, revendedora, raw, revisar }.
 *
 *  `revisar: true` marca o que NÃO deve virar número sem alguém olhar —
 *  origem múltipla (`Mercado Biani e Maleta`) e as duas linhas de dúvida
 *  literal (`PERDIDO`, `ACHO QUE FOI VENDIDO`). Elas continuam importadas,
 *  com o texto intacto; só não são contadas como canal.
 *
 *  O bruto vai junto, sempre: a análise por `raw` tem que continuar possível
 *  para conferir a classificação. */
export function classificarOrigem(v) {
  const raw = limpar(v);
  const semantico = limparSemantico(v);
  if (semantico === null) {
    return { canal: null, contexto: null, revendedora: null, raw, revisar: false };
  }

  const n = normalizarTexto(semantico);

  /* dúvida declarada pela própria planilha */
  if (/^perdido$|^acho que foi vendido$/.test(n)) {
    return { canal: null, contexto: null, revendedora: null, raw, revisar: true };
  }

  /* origem múltipla: "A / B", "A e B" — não vira um canal só por escolha nossa */
  const partes = semantico.split(/\s*(?:\/|\se\s)\s*/i).filter(Boolean);
  if (partes.length > 1) {
    const canais = [...new Set(partes.map((p) => canalDe(p)).filter(Boolean))];
    if (canais.length > 1) {
      return { canal: 'Misto', contexto: null, revendedora: null, raw, revisar: true };
    }
  }

  const m = semantico.match(/^([^(]+?)\s*\((.+)\)\s*$/);
  const cabeca = m ? m[1] : semantico;
  const dentro = m ? limpar(m[2]) : null;

  const canal = canalDe(cabeca);
  if (canal === null) {
    return { canal: null, contexto: null, revendedora: null, raw, revisar: true };
  }

  /* `Revendedora (Beatriz)` nomeia a pessoa; `Maleta (Feira X)` nomeia o
   * lugar. O parêntese só vira nome de revendedora quando o canal é o de
   * revendedora — em Maleta ele é contexto, mesmo quando parece um nome. */
  if (canal === 'Revendedora') {
    return { canal, contexto: null, revendedora: dentro, raw, revisar: false };
  }
  return { canal, contexto: normalizarContexto(dentro), revendedora: null, raw, revisar: false };
}

/** Contextos que são o MESMO lugar escrito de duas formas. Explícito e
 *  auditável, um por um — nada de similaridade unindo dois eventos. */
const ALIAS_CONTEXTO = new Map([
  ['franceschini', 'Feira Franceschini'],
]);

function normalizarContexto(v) {
  const s = limpar(v);
  if (s === null) return null;
  const n = normalizarTexto(s);
  return ALIAS_CONTEXTO.get(n) ?? s;
}

function canalDe(texto) {
  const n = normalizarTexto(texto);
  if (n === null) return null;
  if (ALIAS_CANAL.has(n)) return ALIAS_CANAL.get(n);
  for (const [chave, valor] of ALIAS_CANAL) {
    if (n === chave || n.startsWith(chave + ' ')) return valor;
  }
  return null;
}

/* ------------------------------------------------------------ linha inteira */

/** Nomes de coluna da planilha real, tolerantes a espaço sobrando no
 *  cabeçalho (`Tipo `, `Desconto `, `Observação Venda `). */
export const COLUNAS = {
  numero: ['nº', 'n°', 'no', 'n', 'numero'],
  data: ['data de venda', 'data'],
  cliente: ['nome do cliente', 'cliente'],
  sku: ['id produto marquesa', 'id produto', 'sku', 'codigo'],
  produto: ['nome produto', 'produto'],
  tipo: ['tipo'],
  qtd: ['quantidade vendida', 'quantidade', 'qtd'],
  precoUnit: ['preco unit. venda', 'preco unitario', 'preco unit', 'preco'],
  desconto: ['desconto'],
  total: ['valor total venda', 'valor total', 'total'],
  pagamento: ['forma de pagamento', 'pagamento'],
  status: ['status pagamento', 'status'],
  observacao: ['observacao venda', 'observacao', 'obs'],
};

/** Casa o cabeçalho real com as colunas conhecidas. Devolve
 *  { indices, faltando } — quem decide o que fazer com o que falta é o
 *  chamador, porque planilha sem `ID Produto` é outra conversa de planilha
 *  sem `Desconto`. */
export function mapearColunas(cabecalho) {
  const norm = cabecalho.map((c) => normalizarTexto(c) ?? '');
  const indices = {};
  const faltando = [];
  for (const [campo, nomes] of Object.entries(COLUNAS)) {
    const i = norm.findIndex((c) => nomes.includes(c));
    if (i >= 0) indices[campo] = i;
    else faltando.push(campo);
  }
  return { indices, faltando };
}

/** Converte UMA linha da planilha no registro que vai para o banco.
 *
 *  Devolve sempre os dois lados: `*_original` é o que estava escrito, sem
 *  interpretação, e o resto é a leitura — com null onde não deu para ler.
 *  `problemas` lista o que impede a linha de virar número, sem impedir que
 *  ela seja importada. */
export function normalizarLinha(linha, indices, { origemLinhaFallback = null } = {}) {
  const em = (campo) => (indices[campo] === undefined ? null : linha[indices[campo]]);

  const qtdCrua = normalizarNumero(em('qtd'));
  const precoUnit = normalizarNumero(em('precoUnit'));
  const total = normalizarNumero(em('total'));
  const data = normalizarData(em('data'));
  const pagamento = normalizarPagamento(em('pagamento'));
  const status = normalizarStatusPagamento(em('status'));
  const origem = classificarOrigem(em('observacao'));
  const desconto = interpretarDesconto(em('desconto'), { valorBase: total });

  const numero = limpar(em('numero'));
  const clienteOriginal = limpar(em('cliente'));
  const skuOriginal = limpar(em('sku'));

  const problemas = [];
  if (data === null) problemas.push('sem_data');
  if (total === null) problemas.push('sem_valor');
  if (skuOriginal === null) problemas.push('sem_sku');
  if (clienteOriginal === null) problemas.push('sem_cliente');
  if (qtdCrua === null || qtdCrua <= 0) problemas.push('sem_quantidade');
  if (origem.revisar) problemas.push('origem_a_revisar');

  return {
    origem_linha: numero ?? origemLinhaFallback,

    data_original: em('data') instanceof Date ? isoDeData(em('data')) : limpar(em('data')),
    cliente_nome_original: clienteOriginal,
    sku_original: skuOriginal,
    nome_produto_historico: limpar(em('produto')),
    tipo_original: limpar(em('tipo')),
    preco_unit_original: limpar(em('precoUnit')),
    desconto_original: desconto.original,
    valor_total_original: limpar(em('total')),
    pagamento_original: pagamento.original,
    status_pagamento_original: status.original,
    observacao_original: origem.raw,

    data,
    cliente_nome_norm: normalizarNomeCliente(clienteOriginal),
    sku: normalizarSku(skuOriginal),
    sku_base: skuBase(skuOriginal),
    tipo: normalizarTipo(em('tipo')),
    qtd: qtdCrua === null ? null : Math.trunc(qtdCrua),
    preco_unit: precoUnit,
    valor_total: total,
    desconto_valor: desconto.valor,
    desconto_pct: desconto.pct,
    desconto_rotulo: desconto.rotulo,
    pagamento_forma: pagamento.forma,
    pagamento_parcelas: pagamento.parcelas,
    pago: status.pago,
    canal: origem.canal,
    contexto: origem.contexto,
    revendedora_nome: origem.revendedora,

    problemas,
  };
}
