/** Leitura de planilha (Estoque Total / Produtos Novos) — a mesma semântica
 *  de `importarCatalogo` em `src/dashboard.tpl.html` (linhas 3334-3426),
 *  portada e não reinventada: detecção de cabeçalho, apelidos de coluna,
 *  consolidação de sufixo de remessa, categorização automática, parsing de
 *  número em formato brasileiro.
 *
 *  Este módulo só LÊ e NORMALIZA. Nunca chama a API — quem decide analisar
 *  é a pessoa, clicando em "Analisar planilha" (ver EstoqueTotalPage). */
import * as XLSX from 'xlsx';
import { baseSku, normSku } from './normalizarSku';
import type { ProdutoPlanilha } from './tipos';

const ALIASES_SKU = ['id produto marquesa', 'id produto', 'sku', 'código', 'codigo'];
const ALIASES_DESC = ['nome produto', 'descrição', 'descricao', 'nome'];
const ALIASES_QTD = ['estoque atual', 'estoque', 'quantidade', 'qtd'];
const ALIASES_PRECO = ['valor de venda', 'valor', 'preço', 'preco'];

/* A mesma tabela de src/dashboard.tpl.html (linhas 803-816), conferida
 *  contra a planilha real — não duplicar a lógica de negócio aqui, só a
 *  categorização automática que a importação já faz hoje. */
const CAT_MAP: Record<string, string> = {
  colar: 'Colar', colares: 'Colar', corrente: 'Colar', cordão: 'Colar', cordao: 'Colar',
  choker: 'Colar', gargantilha: 'Colar', escapulário: 'Colar', escapulario: 'Colar',
  brinco: 'Brinco', brincos: 'Brinco', binco: 'Brinco', bincos: 'Brinco', trio: 'Brinco',
  duo: 'Brinco', dupla: 'Brinco', piercing: 'Brinco', piecing: 'Brinco',
  argola: 'Argola', argolas: 'Argola',
  pulseira: 'Pulseira', pulseiras: 'Pulseira', bracelete: 'Pulseira', tornozeleira: 'Pulseira',
  berloque: 'Berloque', separador: 'Berloque',
  anel: 'Anel', aneis: 'Anel', anéis: 'Anel', aparador: 'Anel',
  pingente: 'Pingente',
  conjunto: 'Conjunto', conjuntos: 'Conjunto',
};

function catOf(desc: string): string {
  const w = (
    String(desc || '')
      .trim()
      .toLowerCase()
      .split(/[\s,-]+/)[0] ?? ''
  ).replace(/[^a-zà-ú]/gi, '');
  return CAT_MAP[w] || 'Outros';
}

/** "R$ 135.407,00" → 135407. Formato brasileiro: ponto separa milhar,
 *  vírgula separa decimal. */
function num(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

function intParse(v: unknown): number {
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function colDe(head: string[], nomes: string[]): number {
  const h = head.map((c) => String(c ?? '').trim().toLowerCase());
  for (const n of nomes) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  for (const n of nomes) {
    const i = h.findIndex((x) => x.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

function acharCabecalho(linhas: unknown[][]): number {
  return linhas.findIndex((l) =>
    l.some((c) => /id produto|^sku$|^c[oó]digo$/i.test(String(c ?? '').trim())),
  );
}

/** Um SKU com sufixo diferente ("-2") somado a um SKU base cuja descrição
 *  discorda — avisado, mas somado assim mesmo (mesma regra do legado: não
 *  bloquear a importação por uma descrição digitada diferente). */
export interface ConflitoDescricao {
  sku: string;
  descricaoBase: string;
  descricaoLinha: string;
  bruto: string;
}

export interface ResultadoParse {
  nomeArquivo: string;
  /** Linhas de dado (sem contar cabeçalho) que tinham algo em alguma coluna. */
  linhasLidas: number;
  produtos: ProdutoPlanilha[];
  /** SKUs brutos com sufixo que foram somados no código base. */
  sufixosSomados: string[];
  conflitosDescricao: ConflitoDescricao[];
  /** `true` quando nenhuma coluna reconhecível de SKU/código foi encontrada
   *  — o arquivo não é um formato que este fluxo entende. */
  semColunaSku: boolean;
}

function linhaVazia(l: unknown[]): boolean {
  return !l.some((c) => c != null);
}

/** Lê as linhas cruas da primeira aba do arquivo, como matriz de células —
 *  o mesmo `header:1` do legado, sem interpretar nada ainda. */
export function linhasDoArquivo(buf: ArrayBuffer, nomeArquivo: string): unknown[][] {
  const isCsv = /\.csv$/i.test(nomeArquivo);
  let wb: XLSX.WorkBook;
  if (isCsv) {
    const bytes = new Uint8Array(buf);
    /* O export da Nuvemshop vem em latin-1 e separado por ponto e vírgula.
       Decodificar como UTF-8 quebra os acentos ("�"); se acontecer, tenta
       de novo em ISO-8859-1 — mesma regra do legado. */
    let txt = new TextDecoder('utf-8').decode(bytes);
    if (txt.indexOf('�') >= 0) txt = new TextDecoder('iso-8859-1').decode(bytes);
    const primeira = txt.split('\n')[0] ?? '';
    const sep =
      (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
    wb = XLSX.read(txt, { type: 'string', FS: sep, raw: true });
  } else {
    wb = XLSX.read(buf, { type: 'array' });
  }
  const nomeAba = wb.SheetNames[0];
  const aba = nomeAba ? wb.Sheets[nomeAba] : undefined;
  if (!aba) return [];
  return XLSX.utils.sheet_to_json(aba, {
    header: 1,
    defval: null,
    blankrows: false,
  }) as unknown[][];
}

/** A parte pura: dada a matriz de linhas já lida, produz a lista
 *  `{sku,desc,cat,preco,qtd}[]` — separada de `linhasDoArquivo` para poder
 *  testar sem depender de leitura de arquivo de verdade. */
export function parseLinhas(linhas: unknown[][], nomeArquivo: string): ResultadoParse {
  const vazio = (semColunaSku: boolean): ResultadoParse => ({
    nomeArquivo,
    linhasLidas: 0,
    produtos: [],
    sufixosSomados: [],
    conflitosDescricao: [],
    semColunaSku,
  });

  const hi = acharCabecalho(linhas);
  if (hi < 0) return vazio(true);

  const head = (linhas[hi] ?? []).map((c) => String(c ?? ''));
  const cSku = colDe(head, ALIASES_SKU);
  const cDesc = colDe(head, ALIASES_DESC);
  const cQtd = colDe(head, ALIASES_QTD);
  const cPreco = colDe(head, ALIASES_PRECO);
  if (cSku < 0) return vazio(true);

  const brutas = linhas.slice(hi + 1);

  type LinhaNormalizada = { bruto: string; sku: string; desc: string; qtd: number; preco: number };
  const normalizadas: LinhaNormalizada[] = [];
  for (const l of brutas) {
    const bruto = normSku(l[cSku]);
    if (!bruto) continue;
    normalizadas.push({
      bruto,
      sku: baseSku(bruto),
      desc: cDesc >= 0 ? String(l[cDesc] ?? '').trim() : '',
      qtd: cQtd >= 0 ? intParse(l[cQtd]) : 0,
      preco: cPreco >= 0 ? num(l[cPreco]) : 0,
    });
  }

  const juntos = new Map<string, LinhaNormalizada>();
  const sufixosSomados: string[] = [];
  const conflitosDescricao: ConflitoDescricao[] = [];
  for (const l of normalizadas) {
    const ex = juntos.get(l.sku);
    if (!ex) {
      juntos.set(l.sku, { ...l });
      continue;
    }
    /* só marca conflito quando as duas descrições existem e discordam;
       soma de qualquer forma (mesma regra do legado). */
    const a = ex.desc.trim().toLowerCase();
    const b = l.desc.trim().toLowerCase();
    if (a && b && a !== b) {
      conflitosDescricao.push({ sku: l.sku, descricaoBase: ex.desc, descricaoLinha: l.desc, bruto: l.bruto });
    }
    ex.qtd += l.qtd;
    if (!ex.preco && l.preco) ex.preco = l.preco;
    if (l.bruto !== l.sku) sufixosSomados.push(l.bruto);
  }

  const produtos: ProdutoPlanilha[] = [...juntos.values()].map((l) => ({
    sku: l.sku,
    desc: l.desc || l.sku,
    cat: catOf(l.desc),
    preco: l.preco,
    qtd: l.qtd,
  }));

  return {
    nomeArquivo,
    linhasLidas: brutas.filter((l) => !linhaVazia(l)).length,
    produtos,
    sufixosSomados,
    conflitosDescricao,
    semColunaSku: false,
  };
}

/** Ponto de entrada usado pela tela: lê o `File` escolhido e devolve o
 *  resultado já normalizado. Não escreve nada — só parsing. */
export async function parsePlanilha(file: File): Promise<ResultadoParse> {
  const buf = await file.arrayBuffer();
  const linhas = linhasDoArquivo(buf, file.name);
  return parseLinhas(linhas, file.name);
}
