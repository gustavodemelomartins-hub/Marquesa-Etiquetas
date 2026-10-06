# V2 — variações do estoque físico sem depender da loja (06/10/2026)

## O defeito

Peças → ficha → Estoque → Variações do código **391471** ("Anel Coração
Vazado Cravejado Banho de Ouro 18k", total 2). A Sthefany pôs nº24 = 1 e
nº18 = 1; salvar respondeu
"A variante 1509838878 não existe na loja para 391471."

- `391471` é o código da peça (SKU), não um id da Nuvemshop.
- `1509838878` é a variante ÚNICA que a Nuvemshop tem do anel (produto
  `339112478`, "Banho de Ouro 18K · n°18", estoque 2). Ela existe hoje na
  vitrine pública; não foi apagada nem recriada. A frase era falsa.
- `nº24` e `nº18` foram criadas aqui (`local:…`) no inventário, porque a
  importação da loja não grava estrutura de produto de variante única.
- Causa: `distribuirVariantes` conferia contra UMA fonte — a loja, ou o
  cadastro daqui quando a loja tinha menos de duas variantes. A tela
  mostrava as duas e mandava as três linhas; o id da loja não estava na
  fonte escolhida.

## A correção (commit `3f54895`)

REGRAS §58. Distribuição parcial valida contra a união loja + daqui; a
variante da loja que é o mesmo aro de uma daqui (par único, sem saldo nem
maleta) vira só "loja online: N" na visão `?visao=estoque`; nenhum vínculo
gravado, nada publicado; mensagens sem id. Painel clássico intocado.

## Auditoria de PROD (só leitura)

24 códigos com variação daqui ao lado de variante da loja — salvar era
recusado em todos: 17 com loja de variante única (159593, 230076, 253852,
275818, 283680, 313860, 317294, 327653, 333717, 352008, 391471, 398483,
408061, 443929, 568444, 582669, 843659 — todos com par único) e 7 com loja
de 2+ variantes vinculadas e um aro novo daqui (218178, 235290, 256359,
275922, 315220, 377535, 381783). Nenhum id da loja obsoleto, nenhum saldo
preso em variante inexistente, nenhum nome duplicado no cadastro daqui.
Nenhuma escrita no banco.

## Provas

- `src/v2-variacoes-locais-test.mjs` — 16 provas; o payload exato do print
  dá `400` com a frase do print em `ced083c` e `200` agora.
- `frontend` — 578 testes (inclui `PainelDeVariacoes.test.tsx`), build ok.
- Suítes do gate iguais a PROD (`ced083c`): sync 72, variações 59, kits 21,
  import-total 14, migração 112, pós-golive variações 27, editar-peça 40,
  inventário V2 25; e2e 93/7, fase2-telas 3, sku-auditoria 8 falhas e
  test-api 1 falha idênticas antes e depois (pré-existentes).
- `src/v2-variacoes-locais-qa.mjs` contra o bundle publicado
  (`MQ_ROTEAR`), 1366 px e 390 px: 19 ok.

## Publicação

| | agora | rollback |
|---|---|---|
| Worker `marquesa-api` | `2dce067e` | `9d213d30` |
| Pages `marquesa` | `836bf4c1` | `d19bdb05` |
| Worker DEV `staging-v2` | `458d6713` | — |
| D1 | sem migration; bookmark antes `000001e7-0000007c-000050fc-ea929b0fa378ed202ae5a63b001330eb` | |

Em PROD o 391471 continua total 2 em "não informada": salvar nº24 = 1 e
nº18 = 1 é da Sthefany, na tela.
