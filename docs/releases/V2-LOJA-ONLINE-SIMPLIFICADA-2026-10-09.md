# V2 — Loja online simplificada, pendências que são de gente, publicar em lote (§63)

Data: 09/10/2026 · Regra: `api/REGRAS.md` §63 · Commit: `ed69614`

## Versões

| | Nova | Rollback |
|---|---|---|
| Worker `marquesa-api` | `758763ac-8502-45a4-8b1c-0e16514fba8e` | `4d185e84` (§62) |
| Pages `marquesa` (PROD, `marquesa-9da.pages.dev`) | `dafec82d` | `b4772b74` |
| D1 `marquesa-db-prod` | sem migration | bookmark `000002c1-00000000-000050ff-fa59af0a8488d61542e5c4441584a9eb` |

Nenhuma escrita no banco nem na loja fez parte desta release. Nenhum produto
foi publicado: os prontos esperam o clique de quem aprova.

## Antes

- "Situação da loja": painel de estoque online aberto (conferir, reconciliar,
  sincronizar, interruptor), quatro métricas do panorama antigo ("590
  publicados" do retrato legado ao lado de "520" da Preparação), lista de
  "diferenças" com centenas de "Produto fora do ar com peça disponível" —
  as peças ocultas DE PROPÓSITO desde o §62 — e "Analisar sincronização"
  convivendo com "Conferir e reconciliar".
- Central de Pendências: 91 abertas, das quais 25 não pediam ação: 3 vendas
  de 22/08 sem variação (346802, 647729, 334079) pedindo "Resolver", 3 vendas
  em `revisao` pedindo "Reenviar" (espelho do código) e 19 códigos em maleta
  repetidos (uma vez pelo código, outra pela maleta).

## Depois

- **Visão geral**: estado da sincronização numa linha; quatro números —
  Publicados na loja **520**, Ocultos em preparação **363**, Prontos para
  publicar **62**, Precisam de atenção **51** (8 conferir estoque por
  variação, 19 peças em maleta sem variação, 24 peças esperando decisão para
  ir à loja); cada item diz o que aconteceu, por que importa e o que fazer,
  com um botão. "Conferir agora" só lê; "Corrigir automaticamente o que é
  seguro" escreve e pede confirmação. O técnico fica em "Ver detalhes da
  sincronização". 918 códigos sincronizados, 0 erros.
- **Preparação**: miniatura real (62/62 prontos com a foto da loja por SKU
  exato), checklist de oito itens, filtros (tipo, foto, preço, variação,
  precisa de ação), seleção, "Publicar", "Publicar selecionados" e
  "Publicar todos os prontos" com resumo; cada peça é revalidada na loja na
  hora dela e a que mudou é pulada com o motivo. Detalhe da peça com o
  anúncio lido da loja (`GET /api/nuvemshop/catalogo/:sku/anuncio`, só
  leitura).
- **Central de Pendências**: 66 abertas (8 conferir estoque por variação,
  34 maleta × código, 24 catálogo). As 3 vendas antigas ficam em
  `historico` da resposta, fora do total e do sino.

Os números são do export de PROD logo após a publicação (uma venda real
de hoje tirou uma peça dos prontos: 63 → 62).

## Testes

- `src/loja-online-test.mjs` — 15 provas (Worker real + loja falsa).
- Frontend: 633 testes (inclui `visaoGeral.test.ts` 9, `LojaOnline.test.tsx` 8,
  `lote.test.ts` 10); build ok.
- `nuvemshop-catalogo` 30, `nuvemshop-fila` 49, `venda-item-id`,
  `v2-variacoes-locais`, `sync`, `variacoes`, `kits` 21, `import-total` 14,
  `vendas-nuvemshop`: verdes. `e2e` 93/7, `fase2-telas` e `pos-golive-1`
  (2 falhas) com as MESMAS linhas de falha do commit de PROD anterior.
- Gate `fast` 11/11 (o `schema-migration-coerencia`, que falhava desde o
  §62, passa: a migration do catálogo entrou na lista).
- `src/v2-loja-online-qa.mjs` no site publicado (`marquesa-9da.pages.dev/v2`),
  1366 e 390 px, API do bundle roteada para o Worker real sobre o export de
  PROD, sem credencial da loja: tudo ok, inclusive o "Publicar" de ponta a
  ponta (o servidor revalida e recusa sem credencial; a tela diz "1 não
  publicado").

## O que não foi provado aqui

- Publicação real na Nuvemshop pelo botão novo: o agente não tem a
  `API_KEY` e publicar é decisão de quem aprova. O caminho do servidor é o
  mesmo `publicarNaLoja` do §62 (provado na loja falsa e no canário de 09/10).
- A prévia do anúncio contra a loja real (mesmo motivo); provada na loja falsa.
