/** Formatação de números, dinheiro e datas.
 *
 *  As regras vêm do painel legado (`src/dashboard.tpl.html`), não de uma
 *  convenção nova: os dois frontends mostram os mesmos números para a
 *  mesma pessoa, e um "R$ 135.407,00" de um lado com "R$ 135.407" do outro
 *  faz duvidar de qual está certo. */

/** Centavo que é sempre zero é ruído: "R$ 135.407,00" vira "R$ 135.407".
 *  Quando existe centavo de verdade ele aparece, então nada se perde. */
export function money(v: number | null | undefined): string {
  const n = Number.isFinite(Number(v)) ? Number(v) : 0;
  const partes = n.toFixed(2).split('.');
  const inteiro = (partes[0] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = partes[1] ?? '00';
  return 'R$ ' + inteiro + (centavos === '00' ? '' : ',' + centavos);
}

export function plural(n: number, singular: string, pluralForma: string): string {
  return n === 1 ? singular : pluralForma;
}

/** "2026-08-19" → "19/08/2026". Vazio vira travessão, nunca "Invalid Date". */
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}

/** "0%" para uma fatia que tem peças é mentira; abaixo de 1% mostra "<1%". */
export function pctTexto(qtd: number, total: number): string {
  if (!total) return '0%';
  const p = (qtd / total) * 100;
  return p > 0 && p < 1 ? '<1%' : Math.round(p) + '%';
}

/** Hoje em ISO curto, no fuso do aparelho — a mesma conta do painel legado. */
export function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Soma dias a uma data ISO curta. */
export function addDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Nome curto para uma aba: só o primeiro nome, mas sem virar uma letra
 *  solta quando a primeira palavra é curta ("A identificar" fica inteiro). */
export function nomeCurto(nome: string): string {
  const partes = String(nome || '').trim().split(/\s+/);
  let curto = partes[0] || '';
  if (curto.length <= 3 && partes[1]) curto += ' ' + partes[1];
  return curto.length > 16 ? curto.slice(0, 15) + '…' : curto;
}
