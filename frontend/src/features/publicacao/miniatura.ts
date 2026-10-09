import type { ComFoto } from '../../domain/foto';
import type { Product } from '../../types/api';

/** A miniatura da Preparação (§63), nesta ordem:
 *
 *    1. a imagem que a NUVEMSHOP já tem deste código — é a que vai aparecer
 *       na loja quando publicar;
 *    2. a foto daqui (R2/galeria) do MESMO código;
 *    3. o losango da marca.
 *
 *  As duas fontes são casadas por SKU exato (`loja_fotos.sku_norm`,
 *  `produto_fotos.sku`). Nunca a foto de outro produto "parecido". */
export function fotoDaPreparacao(p: Product | undefined): ComFoto | null {
  if (!p) return null;
  if (p.fotoLojaUrl) return { fotoLojaUrl: p.fotoLojaUrl };
  return {
    fotoGaleriaUrl: p.fotoGaleriaUrl, fotoMiniUrl: p.fotoMiniUrl,
    fotoTratadaUrl: p.fotoTratadaUrl, fotoOriginalUrl: p.fotoOriginalUrl, fotoUrl: p.fotoUrl,
  };
}
