# V2 — Vendas feitas por venda, Clientes com Visão geral, telas sem notas técnicas (01/10/2026)

> **Situação: EM PRODUÇÃO desde 02/10/2026**, junto com "Descartar
> inventário" (commit `6f81e3b`). Registro da publicação no fim deste
> documento.

## O que muda para quem usa

- **Vendas › Vendas feitas: uma linha é uma venda.** A compra da Elizama Meira
  em 19/09/2026 (5 peças, R$ 504,00) aparecia como cinco vendas de R$ 504,00.
  Agora aparece uma vez — "5 peças · ver itens" —, e tocar na linha abre o
  detalhe: peça, código, quantidade, preço, desconto, subtotal, total,
  recebido, a receber, e o que dá para fazer (receber, cancelar, ir para A
  receber).
- **Clientes** abre na **Visão geral**: compraram no período, novas, voltaram
  a comprar, ticket médio, Top clientes, Para chamar de volta (sumindo /
  paradas) e Clientes recorrentes. **Todos os clientes** é a lista de antes,
  agora com última compra e total comprado.
- **Ficha da cliente**: quatro abas em vez de seis; "Falta receber" é a
  primeira coisa do Resumo, e a linha do tempo inteira abre ali.
- **Fora da tela:** "Três datas, três significados", "Entram: compra histórica
  em aberto…", "Como estes números são feitos", "LEGACY_RECONCILIATION_REQUIRED",
  "o chute que a regra 2 proíbe", "Não existe custo no sistema" (falso desde
  29/09) e outras ~60 frases de documentação ou jargão. As regras continuam no
  código e em `api/REGRAS.md`.
- **Números que discordavam:** "Falta receber" do Início somava só o período
  ao lado da contagem de todas as contas — agora é o total do A receber. Três
  vendas da planilha pagas em 29–30/09 pelo Financeiro apareciam "não paga" em
  Vendas feitas.

## A duplicidade dos R$ 504 — causa

O banco nunca esteve duplicado. Em PROD:

- `vendas_historicas` id 2144, chave `elizama meira|2026-09-19`, 5 itens,
  `valor_total` 504, `status` nao_paga;
- 5 linhas em `vendas_historico_itens` (planilha Nº 1404–1408: 105 + 62 + 89 +
  119 + 129) apontando para ela;
- um só lote de pé (3); a importação 1 e 2 estão revertidas.

A multiplicação acontecia na leitura. A tela lia `/api/vendas/lista` — a
leitura de AUDITORIA, item a item — e agrupava pela `referencia`, que do lado
da planilha é o **Nº da linha**. Cada peça virava uma "venda" com o total
inteiro da compra. A busca global fazia o mesmo.

Correção na origem: `GET /api/vendas/feitas` devolve vendas (página de
vendas, itens dentro); `/api/vendas/lista` ganhou `venda_chave` e continua
item a item.

## Tamanho do problema (PROD, leitura de 01/10/2026)

| | Antes (tela) | Depois |
|---|---|---|
| Linhas em Vendas feitas | 1.326 | **729 vendas** (727 da planilha + 2 do sistema) |
| Soma do que a tela mostrava | R$ 375.562,97 | **R$ 128.518,61** |
| Linhas de compras com mais de uma peça | 912 | — |
| Vendas da planilha com mais de uma peça | 323 de 732 | — |

Totais do Financeiro, A receber, ranking e ticket médio **não mudam**: eles já
liam a venda em `vendas_historicas`. Nenhuma linha do banco é alterada.

Duplicidade real procurada e não encontrada: nenhuma venda do sistema
repetida (cliente + data + total); as 17 vendas do sistema que também estão na
planilha já estão ligadas por `historico_operacao_vendas`. Um único par
suspeito — duas linhas iguais (código 640509, R$ 48,30) na compra de 36 peças
de 13/06/2026 — é coerente com duas unidades e **não** foi tocado.

## Importador

Terceira trava em `importarHistorico`: com uma planilha de pé, importar outra
(conteúdo diferente) é recusado com "use Trocar planilha". Antes, a planilha
atualizada entrava como segundo lote e cada venda antiga passava a existir duas
vezes. Não aconteceu em PROD (um lote só); a porta estava aberta.

Regra de agrupamento da planilha **inalterada** (cliente normalizado + data =
uma venda — decisão do dono, `vendas-historicas.js`). A planilha não tem nº de
pedido; duas compras da mesma cliente no mesmo dia continuam uma venda só, e o
teste fixa isso em vez de fingir que dá para separar.

## Provas

- `src/vendas-feitas-test.mjs` — casos A–F + Elizama, 60 provas.
- `src/v2-vendas-clientes-qa.mjs` — navegador em 1280px e 390px, 100 provas,
  14 telas varridas atrás de 21 frases técnicas.
- frontend: 49 arquivos, 488 testes. `v2-paridade-e2e.mjs`: 66/66.
- Baseline (sync, variações, kits, import-total, fase2-telas, e2e): resultado
  idêntico ao de `97f074a` — as falhas de fase2-telas/e2e são as mesmas nas duas.
- SQL novo executado (só leitura) contra `marquesa-db-prod`.

## Publicação — planejada em 01/10

| | Novo | Rollback |
|---|---|---|
| Commits (`develop`) | `805d205` · `f589841` · `0fc1d6c` · `bc7b592` + este registro | `97f074a` |
| Worker `marquesa-api` | — | `390311e3-9d65-4dd8-85c9-3bc9857d0d74` |
| Pages `marquesa` | — | `16c995a0` |
| D1 bookmark (antes) | `00000175-00000000-000050f7-9ea2da2a99b6ea52659687d789b9dc0c` | |

Sem migration. Sem segredo novo. Ordem: Worker primeiro (a rota é aditiva),
depois o Pages pelo `deploy-prod.yml` (botão, `develop`).

## Descartar inventário (02/10/2026, commit `6f81e3b`)

Um inventário pausado bloqueia abrir outro, e a V2 não tinha como descartá-lo.
O cartão do inventário em andamento agora é "Inventário #N · Pausado ·
iniciado em DD/MM" com **Continuar**, **Concluir** e **Descartar**. Descartar
pede confirmação (Voltar / Descartar inventário) e usa a rota que já existia,
`POST /api/inventarios/:id/cancelar`: o inventário vira `cancelado`, fica no
histórico com a contagem guardada, e nada chega ao estoque. Sem mudança de
API nem de banco.

O inventário pausado da Sthefany (#6, aberto 28/09, pausado 30/09) **já estava
cancelado** quando esta publicação saiu — `status = cancelado` desde
2026-10-01 01:27:54 UTC, pelo botão de cancelar do painel clássico. Nada foi
cancelado por esta release. Em PROD não há inventário em andamento.

Provas: `src/inventario-descartar-test.mjs` (8), `descartar.test.tsx` (8),
`src/v2-inventario-descartar-qa.mjs` (40, 1280 e 390px), frontend 496/496,
paridade 66/66, Vendas/Clientes QA 104 ok, `vendas-feitas-test` 60 ok.

## Publicação — feita em 02/10/2026

| | Novo | Rollback |
|---|---|---|
| Commit (`develop`) | `6f81e3b` | `97f074a` |
| Worker `marquesa-api` | `d52ba1b3-249a-4a0d-ba9a-575e9684bc02` | `390311e3-9d65-4dd8-85c9-3bc9857d0d74` |
| Pages `marquesa` (main) | `8060f779` | `16c995a0` |
| D1 bookmark (antes) | `00000178-00000000-000050f8-c86533e4e758923f34768124ad1aa496` | sem migration |

Publicado de uma worktree limpa no commit exato, com os passos do
`deploy-prod.yml` (testes, build com `VITE_API_URL` de produção,
`migracao-variantes-test`, `build.py`, `pages deploy --branch main`).

QA com os dados reais: o frontend publicado, com o código do Worker publicado,
sobre um export de `marquesa-db-prod` de 02/10 08:36 — as chamadas à API foram
respondidas em processo, sem chave e sem escrita em PROD. Elizama = 1 venda,
5 peças, R$ 504,00, "ver itens" com 105 + 62 + 89 + 119 + 129; Clientes com
Visão geral, Top, Para chamar de volta, Recorrentes e ficha de 4 abas; 9 telas
sem texto técnico e sem rolagem lateral; #6 no histórico como Cancelado, sem
Descartar; inventário pausado (na cópia) com Continuar/Concluir/Descartar e a
confirmação fechada por Voltar sem escrever nada. Em 1280 e 390px.

Voltar: `wrangler rollback 390311e3-9d65-4dd8-85c9-3bc9857d0d74` e, no Pages,
"Rollback" no deployment `16c995a0`.
