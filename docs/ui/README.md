# Produto, UI e React — Sistema Marquesa

Esta pasta é a fonte versionada da trilha de produto, UI, UX e React do
**Sistema Marquesa**. Ela registra o estado atual, as referências enviadas por
Gustavo e, quando houver decisão explícita, o alvo aprovado de cada tela.

O nome técnico do repositório continua sendo `Marquesa-Etiquetas`. Esta trilha
não autoriza renomear repositório, pasta, URLs, builds, service worker ou
entrypoints.

## Documentos

- [UI-VISION.md](UI-VISION.md) — princípios, vocabulário e limites da trilha.
- [SCREEN-INVENTORY.md](SCREEN-INVENTORY.md) — destinos existentes e cobertura React.
- [REFERENCE-CATALOG.md](REFERENCE-CATALOG.md) — índice e modelo para prints, mockups e ideias.
- [LEGACY-REACT-PARITY.md](LEGACY-REACT-PARITY.md) — lacunas por fluxo entre legado e React.
- [COMPONENT-INVENTORY.md](COMPONENT-INVENTORY.md) — componentes atuais e potencial de reúso.
- [references/README.md](references/README.md) — convenção para os arquivos visuais.

## Como usar esta pasta

1. Registrar cada referência em `REFERENCE-CATALOG.md`.
2. Guardar o arquivo visual em `references/<dominio>/` somente quando ele existir.
3. Separar sempre `ESTADO ATUAL`, `REFERÊNCIAS / DESEJO` e `ALVO APROVADO`.
4. Atualizar a paridade apenas com evidência de fluxo, não pela existência de um componente.
5. Não converter uma decisão visual em regra de negócio.

## Baseline desta preparação

- branch: `codex/ui-system-marquesa`
- HEAD inicial: `ae81c5b216000704ba7c802c1a77772b63d7e80b`
- captura: 2026-09-09
- fontes: artefatos da Fase 0, Plano Mestre, Graphify Lite, grafo existente e
  código atual de `frontend/src/` e `src/dashboard.tpl.html`

Nenhum mockup foi aprovado nesta preparação inicial. O estado visual atual é
evidência, não alvo automático.
