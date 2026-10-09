/** §63 — PUBLICAR VÁRIOS: um de cada vez, cada um revalidado na hora dele.
 *
 *  Não existe "publicar 63 numa chamada". O servidor confere cada peça NA
 *  LOJA antes de trocar oculto → visível (`publicarNaLoja`), e o plano Free
 *  do Worker não comporta 63 conferências numa invocação. Então o lote é
 *  uma sequência de publicações individuais, e isso é o que se quer:
 *
 *    - a peça que deixou de estar pronta desde a conferência (o servidor
 *      responde 409 com o que falta) é PULADA, com o motivo;
 *    - uma falha não derruba as outras: o lote não é tudo-ou-nada;
 *    - "Parar" interrompe antes da próxima peça; o que já foi, foi.
 *
 *  Sem React: recebe a função que publica UMA peça e devolve o relato.
 */
import { ApiError } from '../../types/api';
import { ROTULO_DA_PENDENCIA } from './tipos';

export interface ResultadoDoLote {
  publicados: string[];
  /** Não publicados porque mudaram desde a conferência (409). */
  pulados: { sku: string; motivo: string }[];
  /** A loja ou a rede falhou. */
  falhas: { sku: string; motivo: string }[];
  interrompido: boolean;
}

export type PublicarUm = (sku: string) => Promise<{ ok?: boolean; confirmadoPelaLoja?: boolean }>;

function motivoDe(e: unknown): { mudou: boolean; texto: string } {
  if (e instanceof ApiError) {
    const corpo = (e.corpo ?? null) as { faltam?: string[]; erro?: string } | null;
    const faltam = corpo?.faltam?.length
      ? ` Falta: ${corpo.faltam.map((f) => (ROTULO_DA_PENDENCIA[f] ?? f).toLowerCase()).join(', ')}.`
      : '';
    return { mudou: e.status === 409, texto: `${e.message}${faltam}` };
  }
  return { mudou: false, texto: e instanceof Error ? e.message : 'Falha desconhecida.' };
}

export async function publicarEmLote(
  skus: string[],
  publicarUm: PublicarUm,
  {
    aoProgresso = () => undefined,
    deveParar = () => false,
  }: {
    aoProgresso?: (feitos: number, total: number, sku: string) => void;
    deveParar?: () => boolean;
  } = {},
): Promise<ResultadoDoLote> {
  const r: ResultadoDoLote = { publicados: [], pulados: [], falhas: [], interrompido: false };
  for (const [i, sku] of skus.entries()) {
    if (deveParar()) { r.interrompido = true; break; }
    aoProgresso(i, skus.length, sku);
    try {
      const resp = await publicarUm(sku);
      if (resp && resp.ok === false) r.pulados.push({ sku, motivo: 'A loja não confirmou a publicação.' });
      else r.publicados.push(sku);
    } catch (e) {
      const m = motivoDe(e);
      (m.mudou ? r.pulados : r.falhas).push({ sku, motivo: m.texto });
    }
  }
  aoProgresso(r.publicados.length + r.pulados.length + r.falhas.length, skus.length, '');
  return r;
}
