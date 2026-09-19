# Design System Marquesa V2

**Estado:** `READY FOR GUSTAVO REVIEW` · **Atualização:** 19/09/2026
**Fonte canônica:** [`prototype/marquesa.css`](../prototype/marquesa.css) (tokens e
componentes) e [`prototype/system.css`](../prototype/system.css) (casco do
aplicativo e normalização das telas escritas antes do sistema).
**Vitrine aplicada:** [`prototype/design-system.html`](../prototype/design-system.html).

O design system deixou de ser uma página que mostra componentes e passou a ser a
folha que as 18 rotas carregam. `marquesa.css` é a primeira folha de estilo de
toda superfície; `system.css` é a última. O que estiver fora dessas duas é
exceção de tela e precisa se justificar.

## Direção

Premium, elegante e operacional — e, acima de tudo, um só programa.

**Bordô é tinta, não preenchimento.** Ele mora no trilho de navegação (presente
em toda tela), na ação primária, na seleção e no número que exige decisão.
Dinheiro e quantidade são escritos em tinta escura; a marca só toma o número
quando há algo a fazer com ele. Fundo branco/off-white quente, linha fina no
lugar de sombra, sombra apenas em sobreposição. Feminina pela tipografia e pela
temperatura da paleta, não por excesso de rosa.

## Tokens

| Grupo | Token | Valor |
|---|---|---|
| Marca | `--mq-wine-050/100/200/300` | `#FFF5F8 · #FBE7EE · #F2CFDB · #E0A6BC` |
| Marca | `--mq-wine-500/600/700/800` | `#B32659 · #9F1748 · #86123C · #6A0E30` |
| Marca | `--mq-wine-900/950` | `#4A0B22 · #320717` (trilho) |
| Texto | `--mq-ink · --mq-ink-2 · --mq-muted · --mq-faint` | `#1E1A1C · #453C40 · #7B6E73 · #A2969A` |
| Superfície | `--mq-paper · --mq-paper-2 · --mq-canvas` | `#FFFFFF · #FFFBFC · #FAF7F6` |
| Linha | `--mq-line · --mq-line-2 · --mq-line-3` | `#E8DDE1 · #F2EAEC · #F8F3F4` |
| Estado | `--mq-ok · --mq-warn · --mq-risk · --mq-info · --mq-gold` | `#2E6B51 · #8A6116 · #A83226 · #455C6B · #96702A` |
| Tipografia | `--mq-serif` | Cormorant Garamond — só título de página e de seção |
| Tipografia | `--mq-sans` | Jost — interface, dado, dinheiro, data, SKU, quantidade |
| Espaço | `--mq-1 … --mq-10` | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 |
| Raio | `--mq-r-xs … --mq-r-pill` | 6 · 8 · 12 · 16 · 20 · 999 |
| Sombra | `--mq-sh-1/2/3` | cartão · dropdown · modal e toast |
| Foco | `--mq-ring` | halo bordô de 3 px, além do `outline` do navegador |
| Grade | `--mq-max · --mq-gutter` | 1420 px · `clamp(16px, 2.6vw, 36px)` |
| Casco | `--mq-rail · --mq-rail-mini · --mq-topbar` | 250 · 76 · 64 px |

Quebras de referência: **320 · 390 · 768 · 1024 · 1440**, verificadas a cada rodada.

## Componentes oficiais

Todos existem como classe `.mq-*` em `marquesa.css` e aparecem na vitrine.

| Componente | Classe | Regra que o define |
|---|---|---|
| Page header | `.mq-pagehead` | sobrancelha, título editorial, uma frase, ações à direita |
| Card | `.mq-card` (`__head`, `__body`, `__foot`) | uma pergunta por cartão; linha fina, sem sombra |
| KPI | `.mq-kpi` / `.mq-kpis` | número em tinta; `--accent`, `--risk` e `--ok` só quando há decisão |
| Botão | `.mq-btn` | `--primary`, `--secondary`, `--ghost`, `--link`, `--danger`; uma primária por superfície |
| Campo | `.mq-field` + `.mq-input` / `.mq-select` / `.mq-textarea` | rótulo sempre visível, 40 px (44 no telefone) |
| Busca | `.mq-search` | ícone dentro do campo, nunca acima |
| Dinheiro | `.mq-money`, `.mq-money-input` | `R$` menor e em cinza; valor tabular; `--risk` quando vencido |
| Data | `.mq-date` | data em pt-BR e, abaixo, o que ela significa |
| Quantidade / SKU | `.mq-qty`, `.mq-sku` | número em destaque, unidade em cinza |
| Filtro | `.mq-filters` + `.mq-chipset` | chip para recorte curto; contagem à direita |
| Tabs | `.mq-tabs`, `.mq-tabs--pill` | irmãos dentro do módulo; sublinhado bordô; rolagem segura |
| Chip | `.mq-chip` | atributo (categoria, material). Nunca comunica sucesso ou erro |
| Badge | `.mq-badge` | contagem |
| Status | `.mq-status` | **ponto + texto**; cor nunca é o único sinal |
| Tabela | `.mq-table` / `.mq-tr` / `.mq-cell` | linha inteira abre o detalhe; vira cartão abaixo de 860 px |
| Lista | `.mq-list` / `.mq-item` | ícone, assunto, apoio, situação e ação |
| Timeline | `.mq-timeline` | fato por fato, com data e origem |
| Stepper | `.mq-steps` / `.mq-step` | concluído · atual · futuro · falhou |
| Medidor | `.mq-meter`, `.mq-bars` | proporção com o número ao lado |
| Gráfico | `.mq-chart`, `.mq-donut` | barra clara, destaque no pico, leitura textual obrigatória |
| Modal | `.mq-modal` | decisão curta; vira folha inferior no telefone |
| Drawer | `.mq-drawer` | detalhe lateral sem perder a lista |
| Toast | `.mq-toast` | confirmação transitória; nunca é a única prova |
| Dropdown | `.mq-menu` | ações secundárias; destrutiva separada e nomeada |
| Tooltip | `.mq-tip` | apoio, nunca informação essencial |
| Paginação | `.mq-pagination` | total + página; filtro não muda sozinho |
| Skeleton | `.mq-skel` | preserva a forma da tela, com `aria-busy` |
| Empty / Error | `.mq-state`, `.mq-state--error` | explica a causa, preserva filtro e oferece saída |
| Nota | `.mq-note` | regra de negócio, aviso, falha, sucesso e informação |
| Confirmação | `.mq-confirm` | o efeito em dinheiro ou peça, em número, antes do sim |
| Navegação | `.mq-rail`, `.mq-topbar`, `.mq-bottomnav` | ver [arquitetura de navegação](../07-mapping/navigation-architecture-v2.md) |

## Iconografia

Dicionário único servido por `MarquesaUI.icon(nome)` em
[`prototype/system.js`](../prototype/system.js): traço 1.6, grade 24×24, sem
emoji. Cobre o domínio da Marquesa — `pix`, `card`, `cash`, `credit`, `receipt`,
`person`, `people`, `sale`, `box`, `inventory`, `bag`, `shield`, `repair`,
`swap`, `label`, `tag`, `cloud`, `settings`, `bell`, `calendar`, `clock` — além
do vocabulário de interface. A vitrine lista todos com o nome do token.

## Densidade e responsividade

- **1440** — trilho aberto (250 px), conteúdo até 1420 px, comparação lado a lado.
- **1024** — trilho reduzido a ícones (76 px) com monograma; tabelas mantêm colunas.
- **768** — indicadores em duas colunas; tabelas ainda são tabelas.
- **390 / 320** — trilho vira gaveta, navegação inferior de cinco destinos,
  tabela vira cartão com rótulo por campo, alvo de toque de 44 px, campo com
  16 px para não haver zoom automático no iOS.
- Nenhuma informação depende de `hover`. `prefers-reduced-motion` remove animação.

## Estados obrigatórios

Toda tela implementável especifica carregando, vazio, erro, permissão
insuficiente, resultado parcial e sucesso. No protótipo, `?state=loading`,
`?state=error`, `?state=empty` e `?state=partial` demonstram os quatro primeiros
em qualquer módulo. Comando financeiro, de estoque ou de integração exige ainda
confirmação com o efeito em número, tentativa idempotente e retorno autoritativo
do servidor — a interface nunca presume sucesso.

## Uso de dados demonstrativos

Protótipos mostram exemplos para validar hierarquia. Dado não confirmado é
rotulado `dados demonstrativos`, `UI NEEDS API`, `UI NEEDS BUSINESS DECISION` ou
`FUTURE IDEA`. O design system não transforma exemplo em contrato.
