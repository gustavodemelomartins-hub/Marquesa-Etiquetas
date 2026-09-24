/** Estado local da conferência física da maleta.
 *
 * Um bip só afirma que uma unidade foi encontrada. Ele não decide se a peça
 * voltou, foi vendida ou teve outro destino e, por isso, nunca entra no
 * DocumentoAcerto enviado ao servidor. */
export type ConferidosPorSku = Record<string, number>;

export type ResultadoConferenciaFisica =
  | { tipo: 'conferida'; sku: string; quantidade: number; enviadas: number; conferidos: ConferidosPorSku }
  | { tipo: 'completa'; sku: string; quantidade: number; enviadas: number; conferidos: ConferidosPorSku }
  | { tipo: 'fora_da_maleta'; sku: string; conferidos: ConferidosPorSku };

/** Recebe o SKU já resolvido pela camada compartilhada de leitura.
 *
 * O mesmo SKU pode entrar várias vezes porque duas unidades físicas iguais
 * precisam de dois bipes. A supressão temporal da mesma imagem pertence ao
 * scanner compartilhado; aqui o único limite é o que foi enviado na maleta. */
export function registrarConferenciaFisica(
  itensDaMaleta: Record<string, number>,
  atual: ConferidosPorSku,
  sku: string,
): ResultadoConferenciaFisica {
  const enviadas = itensDaMaleta[sku];
  if (typeof enviadas !== 'number' || !Number.isInteger(enviadas) || enviadas <= 0) {
    return { tipo: 'fora_da_maleta', sku, conferidos: atual };
  }

  const quantidade = atual[sku] ?? 0;
  if (quantidade >= enviadas) {
    return { tipo: 'completa', sku, quantidade, enviadas, conferidos: atual };
  }

  const proxima = quantidade + 1;
  return {
    tipo: 'conferida',
    sku,
    quantidade: proxima,
    enviadas,
    conferidos: { ...atual, [sku]: proxima },
  };
}
