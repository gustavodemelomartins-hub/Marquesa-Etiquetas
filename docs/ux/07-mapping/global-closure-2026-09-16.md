# Fechamento global V2 — 16/09/2026

**FULL V2 UX PROTOTYPE — READY FOR CROSS-REVIEW**
Não é aprovação do produto. Checkpoint local, sem push.

## Abrir

- Hub: `http://192.168.0.106:8766/docs/ux/prototype/index.html`
- Publicação: `http://192.168.0.106:8766/docs/ux/03-screens/nuvemshop/publicar.html`
- Home: `http://192.168.0.106:8766/docs/ux/03-screens/dashboard/master.html`

No computador também funciona `127.0.0.1:8766`. No celular, usar o endereço LAN
na mesma rede com o servidor local ativo. O servidor libera somente o protótipo,
fontes e logotipo; não expõe o repositório inteiro.

## Navegação e telas

Cabeçalho: Home, Vendas, Clientes, Estoque, Revendedoras, Mais, sino e perfil.
Mobile: Home, Vendas, Estoque, Revendedoras e Mais. O menu abre 19 destinos.

Famílias: Home/Agenda; Vendas (normal, colar, saída, painel/histórico); Clientes;
Financeiro; Estoque/Inventário; Catálogo; Revendedoras/Maletas/Acertos;
Garantias/Reparos/Trocas; Etiquetas; Nuvemshop (loja, fila de publicação,
pendências, análise); Notificações; Perfil/Configurações.

Todas as superfícies, entradas e estados estão na
[matriz única](product-screen-inventory-v2.md).

## O que mudou

- Todas as 11 páginas master existentes receberam shell e polish compartilhados.
- Nuvemshop teve revisão estrutural: lista operacional e nova `publicar.html`.
- Vendas: data real do pagamento, revisão e perfil contextual da cliente.
- Financeiro: saldo parcial correto por conta, datas e correção preservando eventos.
- Catálogo: uma única fila de conteúdo/aprovação/publicação.
- Etiquetas: quantidade legível e acionável no mobile.
- Home, Financeiro e Reparos: correções visuais de gráfico, números e status.
- Hub, DS, inventário, navegação, fluxos, handoff, API needs e worklog atualizados.

Arquivos centrais: `prototype/system.css`, `system.js`, `verify-global-closure.mjs`;
`nuvemshop/publicar.html`, `publicar.css`, `publicar.js`; masters HTML dos módulos,
JS de Vendas/Financeiro/Catálogo/Nuvemshop e CSS de Nuvemshop/Etiquetas.

## Estado para revisão

As superfícies visuais existentes e a publicação estão READY FOR GUSTAVO REVIEW.
A edição completa do cadastro da cliente permanece IN PROGRESS, indicada no
protótipo; cadastro rápido e perfil são navegáveis. Tratamento de imagem é FUTURE.
Nenhuma aprovação humana nova foi registrada automaticamente.

## Decisões e contratos

Decisão fechada: a última aprovação autoriza publicação automática, sem uma
segunda confirmação. A interface distingue aprovado, publicando, publicado e falha.

Ainda dependem de Gustavo: regras de crédito/diferença negativa em troca,
permissões de custo e ajustes, fórmulas de indicadores e preferência final pela
posição de Clientes/Financeiro/Catálogo na navegação.

UI NEEDS API: agenda persistente, agregações/feed, custo histórico de saída,
auditoria de recebimentos, maleta atômica, histórico de etiquetas, identidade e
notificações por usuário. Validar os contratos existentes antes de criar qualquer
endpoint; IDs API-001–015 no [handoff](ui-api-handoff-v2.md).

UI NEEDS CONTRACT CHECK: CC-001 data real de pagamento; CC-002 aprovação→publicação
com idempotência/retomada; CC-003 fila/tarefas; CC-004 campos SEO e galeria;
CC-005 flags/R2 e disponibilidade de publicação. Backend não foi alterado.

## Nuvemshop e referência

Sem KPI/gráfico no topo da publicação. Cada produto informa etapa e ação.
Conteúdo, fotos e prévia são revisados no mesmo diálogo; ação final permanece
visível. Mock permite upload múltiplo local, principal, reordenação, revisão,
aprovação/envio, falha e repetição. Ilustrações iniciais são identificadas.
A comparação explícita com a imagem enviada e baselines históricos está no
[README da Nuvemshop](../03-screens/nuvemshop/README.md).

## Design system e evidência

Jost/tabular-nums para números; Cormorant para títulos; SVGs consistentes;
mesmos tokens bordô/rosado, controles, bordas, foco, diálogos e navegação.
Ver [DS aplicado](../04-components/design-system-v2.md).

209 verificações de fechamento global e 111 do hub/DS, além das suites focadas
por módulo. Navegação e links HTTP, entradas diretas, ausência de overflow,
fluxos principais, datas, aprovação e fotos verificados. Inspeção visual desktop
/mobile realizada; aprovação estética permanece com Gustavo.

O estado de cada página é demonstrativo e local à sessão. Não há backend
compartilhado entre os exemplos nem publicação externa. Nenhum arquivo de API,
React ou banco mudou. Nenhum push/deploy foi executado.
