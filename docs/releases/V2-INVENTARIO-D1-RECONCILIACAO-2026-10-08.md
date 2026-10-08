# V2 — inventário no plano gratuito do D1, fechamento sem baixa dupla e correção pós-inventário (08/10/2026)

REGRAS §60. Painel clássico intocado (a rota `/itens` dele não mudou).

## 1. O incidente do D1

Fonte: `wrangler d1 insights` (consultas por hora, por banco) e
`wrangler d1 info`, lidos em 08/10/2026 15h UTC. A cota do plano Free é
**5 milhões de linhas lidas por dia, da CONTA** (os 5 bancos juntos),
renovada às **00:00 UTC = 21h de Brasília**. Só `marquesa-db-prod` lê: DEV e
staging-v2 leram 0 nos últimos 3 dias (staging-v2: 0,24 M em 7 dias).

| dia (UTC) | linhas lidas | consultas |
|---|---:|---:|
| 29/09 | 0,68 M | 2.419 |
| 30/09 | 2,22 M | 15.816 |
| 01/10 | 1,34 M | 3.457 |
| 02/10 | 1,58 M | 11.203 |
| 03/10 | 1,32 M | 3.389 |
| 04/10 | 1,53 M | 3.758 |
| 05/10 | 2,35 M | 6.040 |
| **06/10** | **5,09 M** | 15.983 |
| 07/10 | 3,30 M | 12.660 |
| 08/10 (até 15h UTC) | 1,29 M | 1.988 |

- **06/10 é o único dia acima de 5 M** nos últimos 31. O consumo vai de
  12h a 20h UTC (9h–17h de Brasília) — a maior parte da contagem do
  inventário #1 — e para de vez depois das 19h UTC (~16h de Brasília) até
  02h59 UTC do dia seguinte: a cota acabou nessa hora. O registro só tem
  baldes de 1 hora.
- 07/10 (3,30 M) e 08/10 não chegaram perto da cota.
- **O inventário era o principal consumidor.** Em 7 dias, as duas consultas
  que mais leram vinham do bipe: `SELECT COUNT(*) FROM (catálogo esperado)`
  — 1.999 execuções × 2.962 linhas = **5,9 M** — e `COUNT(DISTINCT sku) FROM
  inventario_contagem` — 2.206 × 420 = 0,93 M. Era a `cobertura` que todo
  bipe recalculava e a tela nunca leu.
- **Balanço e Finalizar não terminavam.** Em 06/10, entre 15h e 16h de
  Brasília, a consulta por código do balanço rodou 185 vezes (~4 tentativas
  de abrir o Balanço, cada uma morrendo na 45ª consulta). O plano Free
  recusa a requisição com mais de 50 consultas ao D1, e o balanço fazia uma
  por código conferido (886 com 821 códigos). Por isso o #1 seguia "aberto"
  no banco: `inventario_resultado` não tinha nenhuma linha.

### Regressão

A recontagem do catálogo a cada leitura (`cobertura`) e a consulta por
código do balanço (`deltaSku`) existem desde `1e00d3a` (10/09, Fase 4.4).
Não mordiam: os inventários eram de teste, e no "bipou e marcha" (02/10)
era um bipe por REFERÊNCIA. `9fece3b` (06/10, inventário V2 reconstruído)
passou a um bipe por UNIDADE — o número de requisições dobrou (1.567
leituras no #1) e cada uma seguiu custando ~3.900 linhas. É esse o commit
que transformou o custo antigo em incidente. O balanço passou do teto de 50
no primeiro inventário real (821 códigos).

### Medição antes × depois

Worker real (`wrangler dev --local`) sobre uma cópia do export de PROD de
08/10, com o cabeçalho `X-D1-Metricas: 1` (o `rows_read` que o próprio D1
devolve). Antes = commit em PROD (`68e5412`); depois = esta rodada.

| Ação | Consultas antes | Linhas antes | Consultas depois | Linhas depois |
|---|---:|---:|---:|---:|
| Abrir Inventário (lista + detalhe + pendências) | 32 | 34.192 | 32 | 33.389 |
| Pesquisar SKU (local, sem API) | 0 | 0 | 0 | 0 |
| Bipar 1 unidade | 11 | 3.923 | 9 | 39 |
| Bipar 10 unidades | 110 | 39.233 | 90 | 386 |
| Reenvio da mesma leitura (rede ruim) | 18 | 7.818 | 14 | 46 |
| Alterar quantidade manual | 8 | 3.893 | 6 | 7 |
| Balanço | **886** | 23.016 | **10** | 18.162 |
| Finalizar (concluir) | 1 lote + 821 | — (não terminava) | 1 lote + 5 | 12.918 |
| Aplicar N diferenças (chamadas ao D1) | 2 + 2N | — | 1 + N, em lotes de 20 | — |

Sessão representativa (`carga.mjs`: abrir, 100 leituras, 3 reenvios, 10
correções manuais, 5 "menos", pausar/continuar 2×, balanço, concluir — 139
requisições): **642.719 → 159.599 linhas (−75%)**; as 100 leituras:
**392.474 → 3.896**. O que sobra é abrir/pausar/continuar (o detalhe do
inventário, ~17 mil linhas, recarregado inteiro) — próximo alvo, não urgente.

**Inventário completo como o #1** (≈1.600 gestos, ~20 aberturas, 2 balanços,
1 fechamento): antes ≈ 1.600 × 3.900 + 20 × 34.000 ≈ **6,9 M** — sozinho
passava da cota. Depois ≈ 1.600 × 40 + 20 × 34.000 + 50.000 ≈ **0,8 M**
(16% da cota diária), mesmo feito num dia só.

### O que roda fora do inventário (não mexido nesta rodada)

Em 7 dias: a consulta de Vendas/Clientes `WITH vd AS (…)` 1,7 M (1.106
execuções × 1.571), `loja_fotos` principal 0,41 M, saldos por variação
0,40 M, `GET /api/pendencias` (sino, a cada carga do app) ~15.600 linhas por
chamada. Ficam medidos aqui para a próxima rodada.

## 2. Bugs sistêmicos corrigidos (código)

1. **Bipe relia o catálogo** (`registrarLeitura`): sem `cobertura`; se a
   releitura do código falhar depois de gravar, a resposta é calculada do
   lote — a leitura gravada nunca volta como erro.
2. **Balanço/Finalizar com uma consulta por código** (`comparar`): movimentos
   posteriores lidos uma vez.
3. **Aplicar com 2 chamadas por diferença** (`aplicarComoAjuste`): o id do
   movimento vem do lote; a tela manda lotes de 20.
4. **Baixa dupla no fechamento** (retroação D10, `comparar`): Ajustar estoque
   depois da contagem substitui a contagem; venda/saída lançada depois com
   data anterior ao dia da contagem não retroage. No #1 teriam sido baixadas
   de novo 27 peças em 15 códigos (599522 iria de 4 para −2). O teto de 50
   consultas, por acaso, impediu.
5. **Retry na cota**: a tela não repete sozinha um 503 de cota; diz o que
   aconteceu e que nada se perde.
6. **"Too many API requests…"** vira 503 com nome
   (`d1-consultas-por-requisicao`).
7. **Observabilidade**: vigia por requisição (`d1-requisicao-pesada`) e
   Workers Logs ligado só para o `console` do código.

`SQL_ESPERADO` (o "em casa" de cada código) passou a somar a consignação uma
vez; resultado idêntico linha a linha (teste 3) e o balanço e o detalhe
reais do #1 saíram **byte a byte iguais** entre o código antigo e o novo
(160 KB e 524 KB), antes do conserto da retroação.

Testes: `src/inventario-d1-leitura-test.mjs` (11 provas; falha no código
antigo), `frontend/src/features/inventario/cota.test.ts`,
`conferencia.test.tsx` (lotes de 20).

## 3. Correção pós-inventário (dados)

Ver `scripts/reconciliacao/correcao-pos-inventario-2026-10-08.mjs`, que traz
a tabela completa (código, em casa, com revendedora, diferença, motivo, o
que explica). Resumo da investigação:

- **A contagem dela estava certa.** Em 06/10 ela bipou nos 21 códigos
  exatamente o número que confirmou depois; entre 07/10 23h54 e 08/10 13h31
  UTC usou "limpar" neles, porque o "em casa" do sistema não batia.
- **Causa da diferença: dado histórico, não código do inventário.**
  - 18 códigos: venda da planilha de histórico ou brinde já registrado em
    Saídas sem faturamento — por desenho nenhum dos dois movimenta estoque
    (§21, §36.3: "a planilha já baixou na importação") — e a peça ficou no
    saldo. Quando ela lista duas ou mais vendas e a diferença é 1, uma
    delas já estava fora do saldo inicial e não dá para dizer qual: a
    observação diz isso, não escolhe.
  - 138909, 198939, 307721: a venda que ela citou JÁ tinha baixado (mov.
    2851, acerto da maleta da Evelyn mov. 2776, venda 24). A unidade a mais
    veio do saldo do go-live de 26/09 (§56, os inconclusivos). Nada de
    segunda venda.
  - 376470: venda da Thalita Barreto de 09/05/2025 sem baixa + 1 unidade do
    go-live.
  - Consignação: em todos os 21, "com revendedora" no sistema já era o que
    ela confirmou (376470: 2 — maletas da Evelyn e da Graciele Muniz).
- **365363 × 376470**: a planilha de histórico tem duas linhas da Thalita
  Barreto em 09/05/2025 — item 2979 no 365363 e item 2980 no 376470 — e o
  376470 tem exatamente 2 peças em maletas abertas. Os dados confirmam o que
  a Sthefany disse: o segundo bloco era do 376470.
- **Brindes** (129561 Dia das Mães, 377105 "Presente Geisa"): já estavam em
  Saídas sem faturamento como brinde, sem faturamento. Não foi criada
  segunda saída; a baixa física entrou como ajuste do inventário citando a
  saída.
- **124111**: ela procurou e não achou ("nenhuma", 07/10). Ajuste "Não
  encontrada na casa" (não é perda).
- **Os 14 "Ajustar estoque" que ela fez durante o inventário** (07/10 23h20
  → 08/10 13h25) foram preservados e, com o conserto 4, não geram nova
  diferença.

Ensaio sobre a cópia (rotas reais): 21/21 códigos no alvo; 22 movimentos
`ajuste/inventario` (−25 peças); vendas (27), itens (45), faturamento
(R$ 3.688,02), saídas (18), clientes, histórico e maletas inalterados; razão
fechada; nenhum estoque ou "em casa" negativo. Segunda execução: recusada
("não está aberto") — 0 correções novas.

## 4. Publicação

| | antes (rollback) | depois |
|---|---|---|
| Worker PROD `marquesa-api` | `2803f2d0` | `f01a3a51` |
| Pages PROD `marquesa` | `e86ce998` | `bf30f21f` |
| Worker DEV `marquesa-api-staging-v2` | — | `91c95efe` |
| Pages DEV `marquesa-dev` | — | `cdd1d807` |
| D1 `marquesa-db-prod` (Time Travel) | `00000233-00000000-000050fe-7769db6378b84fa3cb4fbf6edbdca4de` | `00000236-00000000-000050fe-baa8cee04b4afec7ba465e638478d515` |

Commits `285cd6d` (código e testes) e `1fc8709` (regra, registro, script)
em `origin/develop`. Sem migration. O CI do DEV segue falhando no 7403
(token do GitHub sem D1) — o DEV foi publicado à mão do mesmo commit.

- **Gates**: 55 suítes do servidor (as 53 que existem no commit anterior
  verdes nos dois; nenhuma regressão), 4 clássicas (sync, variações, kits
  verdes; `import-total` falha igual no commit anterior), estruturais,
  frontend 611 testes + build. QA de navegador do inventário (reconstrução
  103 + contagem dupla 62 verificações) no bundle PUBLICADO do DEV e de
  PROD, com a API desviada para o Worker real local.
- **Dados**: SQL gerado pelas rotas reais sobre o export de 16h30 UTC
  (`diferenca-sql.mjs`, marca `reconciliacao:correcao-pos-inventario-2026-10-08`,
  10 precondições), aplicado com `d1 execute --remote --file`: 954
  mudanças. Reaplicar o mesmo arquivo: recusado pela marca, nada escrito.
- **Depois, em PROD** (export pós-correção + rotas reais): 21/21 códigos no
  alvo; `/api/estoque/conferir` vazio; inventário #1 concluído e
  conciliado (22 diferenças, 22 resolvidas, 0 pendentes, 0 não
  conferidos); total 2.061 → 2.036, com revendedoras 389 → 389, em casa
  1.672 → 1.647; movimentos 2.846 → 2.868 (22 ajustes de inventário);
  vendas, itens, faturamento, saídas, clientes, histórico e maletas iguais.

Rollback: `wrangler rollback 2803f2d0`, Pages `e86ce998` pelo painel ou
`pages deploy` do commit `68e5412`; dados: `wrangler d1 time-travel restore
marquesa-db-prod --bookmark=00000233-00000000-000050fe-7769db6378b84fa3cb4fbf6edbdca4de`
(desfaz tudo o que for escrito depois do bookmark — só com decisão humana).

## 5. Workers Paid

US$ 5/mês por conta: D1 com 25 bilhões de linhas lidas/mês incluídas (a
Marquesa usa ~50 M/mês), US$ 0,001 por milhão a mais, e teto de 1.000
consultas por requisição. Tira o risco de cota de uma vez, mas não é o
conserto: com o código antigo um inventário inteiro lia ~7 M num dia, e o
balanço fazia 886 consultas. Decisão de infraestrutura do dono.
