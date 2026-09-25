/** Quantidades devolvidas ainda locais ao acerto.
 *
 * Um bip marca uma unidade fisicamente devolvida na conferência em andamento.
 * Nada é persistido antes da revisão e confirmação do DocumentoAcerto. */
export type DevolvidasPorSku = Record<string, number>;

export type ResultadoConferenciaFisica =
  | { tipo: 'conferida'; sku: string; quantidade: number; enviadas: number; devolvidas: DevolvidasPorSku }
  | { tipo: 'completa'; sku: string; quantidade: number; enviadas: number; devolvidas: DevolvidasPorSku }
  | { tipo: 'fora_da_maleta'; sku: string; devolvidas: DevolvidasPorSku };

/** Recebe o SKU já resolvido pela camada compartilhada de leitura.
 *
 * O mesmo SKU pode entrar várias vezes porque duas unidades físicas devolvidas
 * precisam de dois bipes. A supressão temporal da mesma imagem pertence ao
 * scanner compartilhado; aqui o único limite é o que foi enviado na maleta. */
export function registrarConferenciaFisica(
  itensDaMaleta: Record<string, number>,
  atual: DevolvidasPorSku,
  sku: string,
): ResultadoConferenciaFisica {
  const enviadas = itensDaMaleta[sku];
  if (typeof enviadas !== 'number' || !Number.isInteger(enviadas) || enviadas <= 0) {
    return { tipo: 'fora_da_maleta', sku, devolvidas: atual };
  }

  const quantidade = atual[sku] ?? 0;
  if (quantidade >= enviadas) {
    return { tipo: 'completa', sku, quantidade, enviadas, devolvidas: atual };
  }

  const proxima = quantidade + 1;
  return {
    tipo: 'conferida',
    sku,
    quantidade: proxima,
    enviadas,
    devolvidas: { ...atual, [sku]: proxima },
  };
}
