# V2 — Maleta: variação não informada aguarda o retorno (§67)

Data: 10/10/2026 · Regra: `api/REGRAS.md` §67 · Commit: `cd0cec1`

## Versões

| | Nova | Rollback |
|---|---|---|
| Worker `marquesa-api` | `3099a322` | `82ce9e35` (§66) |
| Pages `marquesa` (`marquesa-9da.pages.dev`) | `86a2e59e` | `9b140d66` |
| D1 `marquesa-db-prod` | sem migration | bookmark `0000032f-00000000-00005100-b9e7da64a097cbff249c170babfd8f6b` |

Nada escrito em PROD pelo deploy: preço, quantidade, vendas (31), itens de
maleta e variações de maleta iguais; razão fechada; 521 visíveis.

## Antes → depois

| | Antes (§66) | Depois |
|---|---|---|
| Central de Pendências (total e sino) | 56 (12 · 10 · **34 maleta**) | **22** (12 sem anúncio · 10 gêmeos ocultos) |
| "Aguardando retorno de maleta" | — | **34 itens · 22 códigos · 34 peças** |
| "Precisam de atenção" | 22 | 22 (a maleta já não contava: a loja estava provada pelo §66) |
| Variação de maleta gravada sozinha | 0 | 0 |

Os 34 itens de maleta deixaram de ser pendência imediata: todos foram para
"Aguardando retorno de maleta", com "Variação: Não informada · Aguardando
conferência no retorno", visíveis na Central (seção própria, fechada, sem
"Resolver") e na ficha da revendedora.

## O que muda no acerto

A V2 pergunta a variação das peças que **voltaram** quando a maleta tem peça
daquele código sem variação informada, e não deixa revisar o acerto sem a
soma fechar. O servidor valida, grava a devolução com a variação, move o
saldo "sem variação" para a variação conferida e a loja recebe o número
novo. O que não voltou continua sem variação. O painel clássico encerra
como antes.

## Testes

- `src/maleta-aguardando-retorno-test.mjs` — 9 provas.
- Atualizadas para a regra nova: `loja-online-test` (maleta fora da lista),
  `loja-online-duplicidade-test` (Central), `vendas-nuvemshop-test`.
- **Achado:** `vendas-nuvemshop-test` falhava desde o §66 (já em PROD): o
  caso "SKU ambíguo na maleta" tinha 0 em casa, e o §66 corretamente manda 0
  à loja. O teste passou a deixar 1 peça em casa, para continuar provando o
  bloqueio. Comportamento de PROD correto; a falha era do teste, que não foi
  rodado no §66.
- Suítes em memória (9) e clássicas no harness: as mesmas falhas
  pré-existentes de antes do §66 em `revendedoras-test` (3), `e2e` (6) e
  `fase2-telas-test` (timeout), comparadas rodando `c85ad64` e `c9c4cf8`.
- Frontend 643 (vitest), `tsc` e build ok. Gate `fast` 9/11 (as 2 do Codex).
- Site publicado, 1366 e 390 px, sobre o export pós-deploy: Central com 22,
  seção "Aguardando retorno" com os 34, sem grupo Maletas, sem rolagem
  lateral, sem erro de JS; Loja online ok.
