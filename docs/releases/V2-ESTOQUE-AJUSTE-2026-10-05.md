# V2 — Ajustar estoque, inventário sem "perda" automática, excluir inventário (05/10/2026)

Feedback real da Sthefany. V2 apenas; o painel clássico não mudou de tela
(só ganhou, por ser backend compartilhado, o `/ajustar` sem motivo como
ajuste e não perda).

## Publicado

| | Novo | Rollback |
|---|---|---|
| Commit (`develop`) | `bf4f322` | `ac66dd7` |
| Worker `marquesa-api` | `69be6f4d-b320-4031-a98f-d010f4a8c8d6` | `0e15b5ac-c92a-463f-a679-af35dbbf9f3c` |
| Pages `marquesa` | `45def4ec` | `240a9695` |
| D1 `marquesa-db-prod` bookmark antes | `000001c0-00000000-000050fb-5dfce03816c0ae228eb3d13ab2f93e90` | — |
| Migration | `api/migracao-inventario-ajuste.sql` (aditiva) | `migracao-inventario-ajuste-rollback.sql` (só com as tabelas vazias) |
| Correção de dados | `docs/migracao-nao-venda/correcao-contagem-dupla-2026-10-05.sql` | Time Travel no bookmark acima, ou 87 ajustes de volta |

DEV (staging-v2): migrations `clientes-arquivo`, `custo`, `saida-valor`,
`inventario-conferencia` e `inventario-ajuste` aplicadas (bookmark antes
`00000064-00000000-000050fb-b12bb697ba344ffe15b0fad2ded50235`); Worker
`c009602e` (rollback `041b8eb9`) e Pages `marquesa-dev` `4218f05d`
(rollback `9a966ffe`), ambos da branch `dev/integracao-2026-10-05`
(avatar `0fab997` + esta entrega).

## 1. O anel 256359 tinha 8, ela comprou 7

Razão: entrada 7 (21/08) + `ajuste +1` do go-live (26/09, "planilha diz 8,
sistema tinha 7"). Nenhuma outra entrada, venda nem perda; as maletas
#8, #12 e #13 devolveram a peça; 1 está com a Luciana (maleta #15, desde
01/09). O 8 do go-live foi `planilha 7 + Anexos I 0 + maleta da Luciana 1` —
mas a coluna "Estoque atual" da `Estoque (1).xlsx` era o **total** (já com a
peça da Luciana), não o que estava em casa. A peça foi somada duas vezes.

Certo: **7 no total = 6 em casa + 1 com a Luciana**. Corrigido em PROD com
um movimento `ajuste −1` ("Ajuste de estoque · Correção de cadastro · de 8
para 7 · Contagem dupla do go-live…"). O `+1` antigo continua no histórico.

## 2. A família inteira (auditoria de todos os códigos do go-live)

`scripts/reconciliacao/correcao-contagem-dupla-2026-10-05.mjs`; planilha
completa em `docs/migracao-nao-venda/auditoria-golive-2026-10-05.csv`.

| Classe | Códigos | Ação |
|---|---|---|
| comprovadamente errada | 87 (143 peças) | corrigida em PROD |
| provável erro | 3 (446425, 492835, 493975) | inventário |
| inconclusivo | 65 (22 com maleta, 43 sem) | inventário |
| correto | 379 | — |

Prova por código (as três juntas): planilha == total do sistema antes do
go-live; ajuste do go-live == peças em maleta (#15 + #16–18); excesso que
sobrou > 0. Na população, 86 de 90 códigos da maleta #15 e 422 de 460
códigos sem maleta têm planilha == total anterior: a planilha era o total.
A correção de 28/09 só pegou ajuste == maletas #16–18; ficaram 43 códigos
só com a #15, 43 com #15 + #16–18 e o 127513 (estava contado no inventário
#6, hoje apagado; a Sthefany confirmou 3 no físico).

PROD: total 2231 → **2088**, movimentos 2733 → 2820, razão fechada.

## 3. O que mudou na V2

- **Ajustar estoque** (§54) — ficha da peça: cabeçalho, aba Estoque e dentro
  de "Editar dados".
- **Inventário** (§55) — diferença vira "ajuste de inventário"; perda só com
  "Perda confirmada" ou "Quebrada ou danificada".
- **Excluir inventário** (§53) — só o que não mexeu em estoque.
- **"Falha interna" em Clientes (DEV)** — D1 do staging-v2 sem
  `migracao-clientes-arquivo.sql`; a lista filtra por `arquivada_em`. O
  avatar não era a causa (já é opcional). O erro agora vira 503 dizendo a
  migração.

## Provas

- `src/estoque-ajuste-inventario-test.mjs` 13; `inventario-4-4` 23;
  `inventario-conciliacao` 17; `inventario-tri-estado` 9; frontend 557 +
  build; baseline release 26/27 (a falha é `fin-101-5-3a-test`, dependente
  da data, idêntica sem esta mudança).
- Seis suítes clássicas: sync, variações, kits, import-total verdes;
  fase2-telas e e2e com as mesmas 5 falhas do commit de PROD — e o e2e
  passou a provar "o ajuste virou movimentação com origem inventário", onde
  o código antigo quebrava.
- `src/v2-estoque-ajuste-qa.mjs` no site de PROD publicado, Worker
  publicado, cópia pós-release: 33 provas, 0 falhas (1280 e 390px).

## Fica para depois

- 3 prováveis e 65 inconclusivos: o inventário decide (nunca por dedução).
- "Na loja online" do 256359 continua 7 — a loja é destino; a sincronização
  não roda em PROD desde o go-live.
- Instagram real do avatar: falta sessão/credenciais locais.
