/** O dicionário de ícones do Sistema Marquesa.
 *
 *  Um traço só (1.6), grade de 24, `currentColor`, sem preenchimento e sem
 *  emoji. Emoji muda de desenho conforme o sistema operacional de quem olha,
 *  e um produto que fala de dinheiro não pode ter o símbolo de "pago" com
 *  cara diferente no telefone e no computador da mesma pessoa.
 *
 *  É o MESMO dicionário publicado pelo casco do protótipo
 *  (`docs/ux/prototype/system.js`, `window.MarquesaUI.icon`) — o produto tem
 *  um jogo de ícones, não um por superfície. Nome que não existe cai em
 *  `box`, de propósito: é melhor uma caixa do que um buraco na interface.
 */

export const ICONES = {
  home: <path d="M3 10.2 12 3.5l9 6.7V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />,
  sale: <><path d="M4 20V4m0 16h16" /><path d="m7 15 3.5-4.2L14 13l5.5-6.5" /><circle cx="19.5" cy="6.5" r="1.2" /></>,
  person: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  people: <><circle cx="9.5" cy="8.5" r="3.2" /><path d="M3 20.3a6.5 6.5 0 0 1 13 0" /><path d="M16.2 5.6a3.2 3.2 0 0 1 0 6" /><path d="M18 14.6a6.5 6.5 0 0 1 3 5.7" /></>,
  money: <><rect x="2.5" y="5.5" width="19" height="13" rx="2.2" /><circle cx="12" cy="12" r="2.8" /><path d="M6 9.4v5.2M18 9.4v5.2" /></>,
  card: <><rect x="2.5" y="4.8" width="19" height="14.4" rx="2.4" /><path d="M2.5 9.6h19M6 15.2h3.6" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.4" /><path d="M5.8 12h.01M18.2 12h.01" /></>,
  pix: <><path d="M12 3.4 8.6 6.8h1.6a2.6 2.6 0 0 1 1.8.8l2.4 2.4a1.4 1.4 0 0 0 2 0" /><path d="m3.4 12 3.4-3.4v1.6c0 .7.3 1.3.8 1.8l2.4 2.4a1.4 1.4 0 0 1 0 2" /><rect x="7.4" y="7.4" width="9.2" height="9.2" rx="2.2" transform="rotate(45 12 12)" /></>,
  credit: <><circle cx="12" cy="12" r="8.6" /><path d="M15 9.2a3.6 3.6 0 1 0 0 5.6" /></>,
  receipt: <><path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4Z" /><path d="M9 8.5h6M9 12.5h6" /></>,
  box: <><path d="M12 3.2 20.5 7v10L12 20.8 3.5 17V7Z" /><path d="M3.5 7 12 11l8.5-4M12 11v9.8" /></>,
  inventory: <><rect x="3.2" y="4.2" width="17.6" height="15.6" rx="2" /><path d="M7 8.2v7.6M10.4 8.2v7.6M13.8 8.2v7.6M17.2 8.2v4" /></>,
  tag: <><path d="M3.5 3.5h7.6l9.4 9.4-7.6 7.6L3.5 11.1Z" /><circle cx="8.2" cy="8.2" r="1.3" /></>,
  label: <><path d="M3.5 6.5h13l4 5.5-4 5.5h-13Z" /><path d="M7 10.4h6M7 13.6h4" /></>,
  cloud: <><path d="M7.4 18.5a4.6 4.6 0 0 1-.6-9.2 6.2 6.2 0 0 1 11.8 1.5 3.9 3.9 0 0 1-.6 7.7Z" /><path d="M12 21.2v-7m-2.6 2.4L12 14l2.6 2.6" /></>,
  shield: <><path d="M12 3 19 5.8v5.5c0 4.5-3 7.6-7 9.7-4-2.1-7-5.2-7-9.7V5.8Z" /><path d="m9 12 2.2 2.2L15.4 10" /></>,
  repair: <><path d="M14.8 6.2a3.8 3.8 0 0 0 4.9 4.9l-8 8a2.4 2.4 0 0 1-3.4-3.4Z" /><path d="m5.5 5.5 3 3" /></>,
  swap: <path d="M4 8.5h13l-3-3M20 15.5H7l3 3" />,
  bag: <><path d="M4.5 8h15l-1 11.5a1.5 1.5 0 0 1-1.5 1.3H7a1.5 1.5 0 0 1-1.5-1.3Z" /><path d="M8.6 8V6.2A3.4 3.4 0 0 1 12 2.8a3.4 3.4 0 0 1 3.4 3.4V8" /><path d="M4.5 12.6h15" /></>,
  bell: <><path d="M18 9.2a6 6 0 0 0-12 0c0 5.6-2.6 6.6-2.6 8.4h17.2c0-1.8-2.6-2.8-2.6-8.4" /><path d="M10 20.6h4" /></>,
  clock: <><circle cx="12" cy="12" r="8.6" /><path d="M12 7.2V12l3.2 1.9" /></>,
  calendar: <><rect x="3.4" y="5" width="17.2" height="15.6" rx="2" /><path d="M3.4 9.8h17.2M8 3.4v3.2M16 3.4v3.2" /></>,
  settings: <><path d="M4 7.5h16M4 16.5h16" /><circle cx="9" cy="7.5" r="2.6" /><circle cx="15" cy="16.5" r="2.6" /></>,
  search: <><circle cx="10.6" cy="10.6" r="6.4" /><path d="m15.4 15.4 4.4 4.4" /></>,
  check: <path d="m5 12.4 4.6 4.6L19 7.6" />,
  close: <path d="m5.6 5.6 12.8 12.8M18.4 5.6 5.6 18.4" />,
  menu: <path d="M3.6 7h16.8M3.6 12h16.8M3.6 17h16.8" />,
  arrow: <path d="M4.5 12h15m-6-6 6 6-6 6" />,
  chevron: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  alert: <><path d="M12 4.2 21 19.5H3Z" /><path d="M12 10v4" /><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" /></>,
  image: <><rect x="3.4" y="4.4" width="17.2" height="15.2" rx="2" /><circle cx="8.6" cy="9.4" r="1.8" /><path d="m4 17.6 5-4.6 3.4 3 3-2.6 4.6 4.2" /></>,
  upload: <><path d="M12 16.4V3.8m-4.6 4.6L12 3.8l4.6 4.6" /><path d="M4 14.4v5.8h16v-5.8" /></>,
  doc: <><path d="M6 3.4h8l4 4v13.2H6Z" /><path d="M14 3.4v4h4M9 12.4h6M9 16h4" /></>,
  filter: <path d="M4 6h16l-6.2 7.2v5.4l-3.6 1.8v-7.2Z" />,
  star: <path d="m12 4 2.4 5 5.4.7-4 3.7 1.1 5.3L12 16.1 7.1 18.7l1.1-5.3-4-3.7 5.4-.7Z" />,
  link: <><path d="M14 4.2h5.8V10M19.8 4.2 10.6 13.4" /><path d="M10 5.6H4.2v14.2h14.2V14" /></>,
} as const;

export type NomeIcone = keyof typeof ICONES;

interface Props {
  nome: NomeIcone;
  /** Só quando o ícone é o ÚNICO conteúdo de um controle. Ao lado de um
   *  rótulo ele é decoração, e um leitor de tela que anuncia os dois lê a
   *  mesma coisa duas vezes. */
  titulo?: string;
  className?: string;
}

export function Icone({ nome, titulo, className }: Props) {
  return (
    <svg
      className={className ?? 'mq-ico'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      {ICONES[nome] ?? ICONES.box}
    </svg>
  );
}
