# Mapa backend

Estado em **10/09/2026**. Provisório — ver [README.md](README.md).

A Fase 2 do Master Plan terminou com os **142 contratos** da API na tabela de
rotas (`api/src/http/`), na trilha de refatoração. A Fase 3 (plataforma e
adapters) e as fases de domínio ainda vão mover código; por isso a coluna
"módulo" abaixo é **onde a rota está hoje**, não onde o domínio vai morar.

| Tela (docs/ux) | Módulo de rota hoje | Domínio | Fase que estabiliza |
|---|---|---|---|
| Dashboard | `analytics.js`, `operacao.js` | analytics / operação | fase 8 |
| Vendas | `vendas.js` | vendas | fase 5 |
| Clientes | `comercial.js` | clientes | fase 5 |
| Revendedoras | `maletas.js`, `comercial.js` | revendedoras, maletas | fase 6 |
| Estoque | `estoque.js`, `catalogo.js`, `catalogo-comandos.js`, `catalogo-importacao.js`, `fotos.js` | estoque e catálogo | fase 4 |
| Catálogo, Mídia e Publicação | nomes finais dos módulos não visíveis nesta branch; famílias de rota documentadas em `CONTRATO-UX-API-4-5.md` | catálogo, categorias, mídia, preparação, publicação e Nuvemshop | fase 4.5 — implementada/provada na branch paralela, sem deploy |
| Etiquetas | sem módulo de rota próprio; fila e impressão atuais operam em `index.html` | composição e impressão de etiquetas | — indefinido — |
| Reparos | não existe | — | — |
| Personalização | `vendas.js` (modelos de Monte seu Colar) | personalização | — indefinido — |

Transversais, sem tela própria: `sincronizacao.js` (Nuvemshop e reconciliação,
fase 7), `plataforma.js` (configuração), `publicas.js` (as três rotas sem
Bearer).

Fonte do contrato: `docs/architecture/API-ROUTES-BASELINE.md` e
`api-contracts.json`, na trilha de refatoração. O gate
`scripts/api-contracts.test.mjs` reprova qualquer mudança de método, caminho ou
exigência de chave — inclusive uma "melhoria" proposta a partir de um material
desta pasta.

Para Catálogo 4.5, a fonte específica é
`docs/domains/CONTRATO-UX-API-4-5.md`. Como ela ainda não está nesta branch, o
mapa de UX usa o espelho integral aprovado e não inventa nomes de módulo.
