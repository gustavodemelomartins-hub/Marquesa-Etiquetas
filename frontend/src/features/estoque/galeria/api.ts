/** Os contratos da galeria da peça e da importação da loja online, como o
 *  backend responde (`api/src/catalogo/galeria.js` e `fotos-da-loja.js`). */
import { chamar, enderecoDaFoto, enviarBytes, type Connection } from '../../../services/client';

export interface FotoDaGaleria {
  id: string;
  sku: string;
  ordem: number;
  principal: boolean;
  /** upload | lote | nuvemshop | adocao */
  origem: string;
  arquivo: string | null;
  estado: string;
  temMiniatura: boolean;
  urlExterna: string | null;
  imagemIdLoja: string | null;
  produtoIdLoja: string | null;
  varianteIdLoja: string | null;
  posicaoLoja: number | null;
  variacao: string | null;
  arquivoR2: string | null;
  tipo: string | null;
  tamanho: number | null;
  largura: number | null;
  altura: number | null;
  erro: string | null;
  criadoEm: string;
  urlGrande?: string;
  urlMiniatura?: string;
}

export interface Galeria {
  ok: boolean;
  sku: string;
  total: number;
  principal: FotoDaGaleria | null;
  fotos: FotoDaGaleria[];
  removidas: number;
  semTabela?: boolean;
}

const cod = (sku: string) => encodeURIComponent(sku);

export async function lerGaleria(conexao: Connection, sku: string, signal?: AbortSignal): Promise<Galeria> {
  const g = await chamar<Galeria>(conexao, 'GET', `/api/produtos/${cod(sku)}/galeria`, undefined, signal ? { signal } : {});
  g.fotos = Array.isArray(g.fotos) ? g.fotos : [];
  for (const f of g.fotos) {
    f.urlGrande = enderecoDaFoto(conexao, f.urlGrande) ?? undefined;
    f.urlMiniatura = enderecoDaFoto(conexao, f.urlMiniatura) ?? undefined;
  }
  return g;
}

export function definirPrincipal(conexao: Connection, sku: string, fotoId: string) {
  return chamar<{ ok: boolean }>(conexao, 'POST', `/api/produtos/${cod(sku)}/galeria/principal`, { fotoId });
}

export function reordenar(conexao: Connection, sku: string, ordem: string[]) {
  return chamar<{ ok: boolean; ordem: string[] }>(conexao, 'POST', `/api/produtos/${cod(sku)}/galeria/ordem`, { ordem });
}

export function removerFoto(conexao: Connection, fotoId: string) {
  return chamar<{ ok: boolean; detalhe?: string }>(conexao, 'DELETE', `/api/galeria/${encodeURIComponent(fotoId)}`);
}

export async function enviarFoto(
  conexao: Connection, sku: string, foto: ImagemPronta,
): Promise<{ ok: boolean; fotoId: string }> {
  const r = await enviarBytes<{ ok: boolean; fotoId: string }>(
    conexao, 'POST', `/api/produtos/${cod(sku)}/galeria`, foto.original, {
      'X-Arquivo': encodeURIComponent(foto.nome),
      ...(foto.largura ? { 'X-Largura': String(foto.largura) } : {}),
      ...(foto.altura ? { 'X-Altura': String(foto.altura) } : {}),
    });
  /* A miniatura é um segundo objeto. Se ela falhar, a foto já está salva —
     a lista só vai baixar a grande para essa peça, e isso não é erro de
     quem enviou. */
  if (foto.miniatura) {
    try {
      await enviarBytes(conexao, 'PUT', `/api/galeria/${encodeURIComponent(r.fotoId)}/miniatura`, foto.miniatura);
    } catch { /* ver acima */ }
  }
  return r;
}

/* ── loja online ──────────────────────────────────────────────────────── */

export interface ItemDoPlano {
  imagemId: string;
  produtoId: string;
  url: string;
  posicao: number;
  sku: string;
  via: 'sku' | 'variacao' | 'vinculo' | 'historico';
  varianteId: string | null;
  variacao: string | null;
  situacao?: 'nova' | 'ja_importada' | 'removida';
}

export interface GrupoParaRevisar {
  produtoId: string;
  produtoNome: string | null;
  codigosNaLoja: string[];
  imagens: number;
  foto: string;
  motivo: string;
  candidatos: { sku: string; desc: string | null; existe: boolean }[];
}

export interface ResumoDoPlano {
  anunciosNaLoja?: number;
  anunciosSemFoto?: number;
  anunciosComFoto: number;
  anunciosComCorrespondencia: number;
  anunciosSemCorrespondencia: number;
  anunciosParaRevisar: number;
  fotosEncontradas: number;
  fotosJaNoR2: number;
  fotosRemovidasAqui: number;
  fotosNovas: number;
  fotosParaRevisar: number;
  fotosSemPeca: number;
  pecasComFotoNova: number;
  pecasComFotoDaLoja: number;
}

export interface Analise {
  ok: boolean;
  erro?: string;
  resumo: ResumoDoPlano;
  revisar: GrupoParaRevisar[];
  semPeca: GrupoParaRevisar[];
  amostra: ItemDoPlano[];
  skusParaRevisar: string[];
}

export interface Plano extends Omit<Analise, 'amostra'> {
  ultimaAnalise: (ResumoDoPlano & { em: string }) | null;
}

export interface Lote {
  ok: boolean;
  erro?: string;
  importadas: number;
  jaExistiam: number;
  duplicadas: number;
  falharam: number;
  falhas: { imagemId: string; sku: string; url: string; motivo: string }[];
  restantes: number;
  total: number;
}

export function analisarLoja(conexao: Connection) {
  return chamar<Analise>(conexao, 'POST', '/api/fotos/loja/analisar');
}

export function lerPlano(conexao: Connection, signal?: AbortSignal) {
  return chamar<Plano>(conexao, 'GET', '/api/fotos/loja/plano', undefined, signal ? { signal } : {});
}

export function importarLote(conexao: Connection, limite: number, ignorar: string[]) {
  return chamar<Lote>(conexao, 'POST', '/api/fotos/loja/importar', { limite, ignorar });
}

export interface ResultadoDaPeca {
  ok: boolean;
  erro?: string;
  encontrado: boolean;
  seco?: boolean;
  detalhe?: string;
  anuncios: { id: string; nome: string; fotos: number; url: string | null }[];
  fotos: ItemDoPlano[];
  revisar: GrupoParaRevisar[];
  avisos: string[];
  resumo?: { novas: number; jaImportadas: number; removidas: number; paraRevisar: number };
  importacao?: Lote;
}

export function buscarNaLoja(conexao: Connection, sku: string, seco: boolean, ignorar: string[] = []) {
  return chamar<ResultadoDaPeca>(conexao, 'POST', `/api/produtos/${cod(sku)}/galeria/importar-da-loja`, { seco, ignorar });
}

/* ── preparar a imagem no aparelho ────────────────────────────────────── */

export interface ImagemPronta {
  nome: string;
  original: Blob;
  miniatura: Blob | null;
  largura: number | null;
  altura: number | null;
}

/** Lado maior da foto guardada. Foto de celular sai com 4000 px e 3–6 MB;
 *  1600 px é mais do que a loja e a etiqueta usam, e cabe folgado no
 *  limite de 8 MB do servidor. */
export const LADO_ORIGINAL = 1600;
/** Lado maior da miniatura: a lista mostra 46 px e o cartão ~220 px; 400 px
 *  cobre tela de alta densidade sem pesar. */
export const LADO_MINIATURA = 400;

async function redimensionar(bitmap: ImageBitmap, lado: number, qualidade: number): Promise<Blob | null> {
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  /* Fundo branco: um PNG com transparência viraria fundo PRETO no JPEG. */
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualidade));
}

/** Reduz no próprio aparelho antes de enviar, e faz a miniatura junto. Se
 *  o navegador não conseguir decodificar (formato raro), manda o arquivo
 *  como veio e o servidor diz se aceita — nunca some com a foto em silêncio. */
export async function prepararImagem(arquivo: File): Promise<ImagemPronta> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const [original, miniatura] = await Promise.all([
      redimensionar(bitmap, LADO_ORIGINAL, 0.86),
      redimensionar(bitmap, LADO_MINIATURA, 0.8),
    ]);
    const escala = Math.min(1, LADO_ORIGINAL / Math.max(bitmap.width, bitmap.height));
    return {
      nome: arquivo.name,
      original: original ?? arquivo,
      miniatura,
      largura: original ? Math.round(bitmap.width * escala) : null,
      altura: original ? Math.round(bitmap.height * escala) : null,
    };
  } catch {
    return { nome: arquivo.name, original: arquivo, miniatura: null, largura: null, altura: null };
  }
}

/** Mover um item de posição numa lista — a mesma regra para arrastar e para
 *  os botões "para frente / para trás / para o início". */
export function mover<T>(lista: T[], de: number, para: number): T[] {
  if (de === para || de < 0 || de >= lista.length) return lista;
  const alvo = Math.max(0, Math.min(lista.length - 1, para));
  const nova = lista.slice();
  const [item] = nova.splice(de, 1) as [T];
  nova.splice(alvo, 0, item);
  return nova;
}

export const ORIGEM: Record<string, string> = {
  nuvemshop: 'Loja online (Nuvemshop)',
  upload: 'Enviada aqui',
  lote: 'Lote de fotos',
  adocao: 'Adotada da loja',
};
