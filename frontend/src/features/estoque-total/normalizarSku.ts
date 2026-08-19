/** Normalização de SKU — portada de `src/dashboard.tpl.html` (`normSku`,
 *  `baseSku`, linhas 861-862 do legado), NÃO reinventada.
 *
 *  `baseSku` existe porque, na planilha da Marquesa, um sufixo numérico
 *  (`"120029-2"`) marca a MESMA peça comprada numa remessa posterior — não
 *  um código diferente. Para estoque, as quantidades de todos os sufixos
 *  somam no código base. Mudar esta regra é uma decisão de negócio, não
 *  técnica — não altere sem confirmar com quem mantém a planilha.
 */

/** Trim + remove espaços internos + maiúsculas. É a forma canônica de um
 *  SKU em todo o sistema. */
export function normSku(s: unknown): string {
  return String(s == null ? '' : s)
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

/** `normSku` sem o sufixo de remessa (`-2`, `-3`, …). Dois SKUs têm o
 *  mesmo `baseSku` quando são a mesma peça física. */
export function baseSku(s: unknown): string {
  return normSku(s).replace(/-\d+$/, '');
}
