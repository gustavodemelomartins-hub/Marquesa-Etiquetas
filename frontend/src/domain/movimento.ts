/** UM MOVIMENTO DE ESTOQUE, em palavras de gente.
 *
 *  O histórico da peça mostrava o tipo como ele mora no banco — "ajuste",
 *  "consignacao", "uso_proprio" — e a observação técnica inteira. A
 *  Sthefany precisa ler "Ajuste de inventário −1 · Contado fisicamente: 4 ·
 *  Sistema esperava: 5 · Motivo: Contagem física", não um enum.
 */

const ROTULOS: Record<string, string> = {
  entrada: 'Entrada',
  venda: 'Venda',
  venda_conjunto: 'Venda (conjunto)',
  consignacao: 'Enviada em maleta',
  devolucao: 'Voltou da maleta',
  perda: 'Perda',
  quebra: 'Quebra',
  dano: 'Dano',
  furto: 'Furto',
  brinde: 'Brinde',
  sorteio: 'Sorteio',
  uso_proprio: 'Uso próprio',
  troca: 'Troca',
  nota_credito: 'Crédito de cliente',
  cancelamento: 'Cancelamento',
};

/** O nome do movimento. `ajuste` diz de onde veio: inventário, ajuste de
 *  estoque, variações. */
export function rotuloDoMovimento(tipo: string, origem: string | null | undefined): string {
  if (tipo === 'ajuste') {
    if (origem === 'inventario') return 'Ajuste de inventário';
    if (origem === 'variacao') return 'Variações da peça';
    if (origem === 'estorno') return 'Estorno';
    return 'Ajuste de estoque';
  }
  return ROTULOS[tipo] ?? (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1).replace(/_/g, ' ') : 'Movimento');
}

/** A observação de um ajuste de inventário, desmontada:
 *  "Ajuste de inventário #1 · Contagem física · contado 4, sistema dizia 5 (05/10/2026)". */
export function detalheDoMovimento(obs: string | null | undefined): string | null {
  const t = String(obs ?? '').trim();
  if (!t) return null;
  const m = /^Ajuste de inventário #(\d+)(?: · (.+?))? · contado (\d+), sistema dizia (-?\d+)(?: \((\d{2}\/\d{2}\/\d{4})\))?(?: · (.+))?$/.exec(t);
  if (m) {
    const [, numero, motivo, contado, esperado, , obsLivre] = m;
    return [
      `Inventário #${numero}`,
      `Contado fisicamente: ${contado}`,
      `Sistema esperava: ${esperado}`,
      motivo ? `Motivo: ${motivo}` : null,
      obsLivre || null,
    ].filter(Boolean).join(' · ');
  }
  /* A contrapartida de uma repartição de variações é contabilidade interna:
     a linha da variação já diz tudo. */
  if (/: contrapartida de "/.test(t)) return 'Ajuste entre variações (o total não muda)';
  return t;
}
