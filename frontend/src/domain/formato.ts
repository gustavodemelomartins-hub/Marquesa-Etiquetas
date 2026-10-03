/** Formatação de números, dinheiro e datas — UM formatador por tipo de
 *  número, usado pelo sistema inteiro. Nenhuma tela formata dinheiro por
 *  conta própria.
 *
 *  Dinheiro sempre com centavos (decisão de 29/09/2026). Antes o centavo
 *  zero era cortado para imitar o painel legado, e o efeito na mesma tela
 *  era "R$ 8.378" ao lado de "R$ 3.140,55" — dois formatos para o mesmo
 *  tipo de número, e a dúvida de qual estava certo. */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** "R$ 8.378,00", "R$ 3.140,55", "-R$ 12,00". O espaço depois de "R$" é
 *  comum (não o inseparável do Intl) para o texto ser o mesmo que se
 *  digita e se procura; a quebra de linha é evitada no CSS (`.mq-money`). */
export function money(v: number | null | undefined): string {
  const n = Number.isFinite(Number(v)) ? Number(v) : 0;
  return BRL.format(Object.is(Math.round(n * 100), -0) ? 0 : n).replace(/\u00a0/g, ' ');
}

/** O número do dinheiro sem o "R$" — para os KPIs que desenham o símbolo
 *  pequeno à parte. Mantém o sinal: "-12,00". */
export function moneyNumero(v: number | null | undefined): string {
  return money(v).replace('R$ ', '').replace('-R$ ', '-');
}

/** Quantidade de peças: inteiro, com separador de milhar, nunca ".00". */
export function qtdTexto(v: number | null | undefined): string {
  const n = Number.isFinite(Number(v)) ? Number(v) : 0;
  return INTEIRO.format(n);
}

/** Percentual: uma casa decimal quando existe ("12,5%"), nenhuma quando é
 *  redondo ("40%"). */
export function pct(v: number | null | undefined): string {
  const n = Number.isFinite(Number(v)) ? Number(v) : 0;
  const r = Math.round(n * 10) / 10;
  return `${r.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function plural(n: number, singular: string, pluralForma: string): string {
  return n === 1 ? singular : pluralForma;
}

/** O fuso em que a operação vive. Um dia é o dia de São Paulo, nunca o de
 *  Greenwich nem o do aparelho de quem abre a tela. */
export const FUSO_OPERACIONAL = 'America/Sao_Paulo';
const DIA_OPERACIONAL = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_OPERACIONAL, day: '2-digit', month: '2-digit', year: 'numeric',
});

/** Um valor com hora é um INSTANTE. O servidor grava instantes em UTC: o
 *  `datetime('now')` do SQLite ("2026-10-03 00:00:00", sem fuso escrito) ou
 *  ISO com "Z". Sem fuso escrito, é UTC — a convenção do banco inteiro. */
function instante(texto: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/.exec(texto);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${m[3] ?? 'Z'}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-08-19" → "19/08/2026". Dia civil (só a data) é mostrado como veio;
 *  instante (data com hora) é mostrado no dia de São Paulo — o inventário
 *  aberto em 02/10 às 21h é gravado "2026-10-03 00:00:00" e é do dia 02.
 *  Vazio vira travessão, nunca "Invalid Date". */
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const texto = String(iso).trim();
  const quando = instante(texto);
  if (quando) return DIA_OPERACIONAL.format(quando);
  const p = texto.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : texto;
}

/** A data como a pessoa DIGITA → ISO curto. Aceita "28/09/2026", "28/9/26",
 *  "28-09-2026" e o próprio "2026-09-28". O que não reconhece volta como
 *  veio (aparado): quem valida é o servidor, e a frase dele aparece na tela.
 *  Existe porque os prompts de data pediam AAAA-MM-DD e recusavam o jeito
 *  brasileiro de escrever — atrito de todo dia no "Recebi". */
export function dataDigitada(texto: string): string {
  const t = String(texto ?? '').trim();
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!br) return t;
  const [, dia = '', mes = '', a = ''] = br;
  const ano = a.length === 2 ? `20${a}` : a;
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
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
