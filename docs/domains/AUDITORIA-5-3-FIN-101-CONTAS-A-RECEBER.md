# Fase 5.3 — FIN-101 / Contas a Receber

**§1–§18: auditoria e arquitetura. §19: a Fase 5.3a, executada.**

| | |
|---|---|
| Branch | `claude/refactor-sistema-marquesa` |
| Auditoria | 12/09/2026, sobre `a989cc0` |
| Fase 5.3a | 12/09/2026 — B1 e B5 corrigidos (§19) |
| PROD | **não consultada**, não escrita. Congelada. |
| Codex | consultado somente leitura (`docs/ux/03-screens/`) |

A auditoria não afirmou defeito por leitura: escreveu um teste que os **prova
rodando**. Cinco foram caracterizados; dois deles (B1 e B5) já foram
corrigidos em 5.3a e viraram rede de regressão.

```
node src/fin-101-5-3a-test.mjs   # B1 e B5, e a invariante KPI ≡ série
node src/fin-101-5-3b-test.mjs   # B2, B3 e B4, e a convergência das três portas
```

Os dois rodam nos gates `domain` e `release`. O teste de caracterização que
provou os cinco defeitos foi **aposentado em 5.3b**, quando o último deles
deixou de existir: um defeito consertado não fica caracterizado em lugar
nenhum — ou vira regra testada, ou não é nada. Ele continua no histórico do
Git, no commit da 5.3a.

---

## 1. Arquitetura atual do FIN-101

Contas a Receber **não é uma tabela**. É uma *projeção de leitura* montada em
tempo de consulta por `api/src/contas-receber.js › contasAReceber`, que une três
populações que nunca se encontram no banco.

```
GET /api/contas-receber?status=aberta
        │
        ├── historico_operacoes (papel='cliente', cobranca_status<>'nenhuma')
        │     via historico-operacoes.js › listarContasReceber
        │     chave: historico:<id>      · dinheiro em CENTAVOS INTEIROS
        │
        ├── vendas (cancelada=0, pago=0, cobravel=1, origem<>'acerto',
        │           revendedora_id IS NULL, sem duplicata ativa)
        │     via contas-receber.js › vendasEmAberto
        │     chave: venda:<id>          · dinheiro em REAL
        │
        └── garantia_trocas (diferenca_status='a_receber', venda_id IS NULL,
                             estornada=0)
              via contas-receber.js › trocasEmAberto
              chave: troca:<garantia_id> · dinheiro em REAL
```

A `chave` é a identidade pública e o despachante das ações. `partes()` só aceita
`^(historico|venda|troca):(\d+)$` — não existe "conta genérica" cujo tipo se
descubra pelo formato do id. **Isso está certo e deve ser preservado.**

O que a projeção não faz, e é a limitação estrutural do desenho: `status=paga`
devolve só a metade histórica. Venda e troca quitadas saem da lista e só
existem no histórico da cliente. Não há "extrato de recebíveis" fechado.

---

## 2. As três fontes, campo a campo

| | `historico` | `venda` | `troca` |
|---|---|---|---|
| Tabela | `historico_operacoes` | `vendas` | `garantia_trocas` |
| Identidade pública | `historico:<ho.id>` | `venda:<v.id>` | `troca:<garantia_id>` |
| Identidade estável real | `venda_chave` (o `id` muda a cada versão) | `vendas.id` | `garantia_trocas.id` |
| Valor | `valor_efetivo_centavos` | `total` (REAL) | `diferenca` (REAL) |
| Recebido | `valor_recebido_centavos` | `valor_recebido` (REAL, NULL = tudo ou nada) | sempre `0` |
| Saldo | `saldo_centavos` (coluna, `CHECK > 0` quando aberta) | `max(0, total − recebido)` calculado em JS | `= diferenca` |
| Vencimento | `vencimento_em` + `vencimento_origem` | `vencimento_em` (**sem** `origem`) | **não existe** |
| Vencida | `aberta AND vencimento_em < hoje()` | idem | sempre `false` |
| Status | `cobranca_status` ∈ nenhuma/aberta/paga/revisao | derivado de `pago`/`cobravel` | `diferenca_status` ∈ nenhuma/a_receber/paga/pendente_regra |
| Data de pagamento | `paga_em` (**timestamp ISO completo**) | `data_pagamento` (**date `YYYY-MM-DD`**) | `diferenca_paga_em` (date) |
| Procedência do pagamento | implícita (versão + `evidencia_json`) | `pagamento_origem` (11 carimbos) | não existe |
| Versão / concorrência | `versao` + `versaoEsperada` **obrigatório** | **nenhuma** | **nenhuma** |
| Cancelamento | `status_registro='substituida'` | `vendas.cancelada` | `estornada` |
| Histórico | versionamento append-only completo | nenhum (UPDATE destrutivo) | colunas de estorno |
| Idempotência da quitação | sim (`jaEstavaPaga`) | sim (`jaEstavaPaga` + `WHERE pago=0`) | **não** (409 na segunda) |
| Definir prazo | sim | sim | **não** (`podeDefinirPrazo:false`) |
| Autoria | **não existe** | **não existe** | **não existe** |

Três modelos de dados diferentes para a mesma pergunta. A lista os concilia na
saída; o banco não os concilia em lugar nenhum.

### O que é deliberadamente excluído (e está certo)

| Excluído | Por quê |
|---|---|
| acerto de revendedora | `papel='acerto'`, `origem='acerto'`, `revendedora_id` — não é dívida de cliente (§29) |
| `cobravel = 0` | reembolso, anulação, abandono, parcial indeterminado (§36.4) |
| venda cancelada | §28 |
| venda com duplicata ativa em `historico_operacao_vendas` | senão a mesma compra seria cobrada duas vezes |
| diferença negativa | `pendente_regra` — é o objeto desta fase |
| troca com `venda_id` | já está na lista **como venda** (§36) |

### Não duplicação — provado

O teste novo assevera que uma troca com `venda_id` aparece **uma vez só**
(`contas.filter(tipo === 'troca').length === 0` com a venda presente).

---

## 3. APIs existentes

| Rota | Módulo | Fontes que atende | Observação |
|---|---|---|---|
| `GET /api/contas-receber?status=` | `contas-receber.js` | 3 | `status=paga` devolve só `historico` |
| `PATCH /api/contas-receber/prazo` | `contas-receber.js` | 3 (recusa `troca`) | despacha por `chave` |
| `POST /api/contas-receber/receber` | `contas-receber.js` | 3 | despacha por `chave` |
| `POST /api/contas-receber/:id/marcar-paga` | `historico-operacoes.js` | só `historico` | rota antiga, ainda usada pelo legado (`:9676`) |
| `PATCH /api/contas-receber/:id/vencimento` | `historico-operacoes.js` | só `historico` | rota antiga, **sem call site** |
| `POST /api/vendas/:id/pagamento` | `vendas-comandos.js` | só `venda` | **porta paralela — origem de 3 dos 5 defeitos** |
| `POST /api/garantias/:id/troca/pagar` | `garantias.js` | só `troca` | |
| `GET /api/vendas/lista` | `analytics.js › listarVendasUnificado` | leitura | expõe `pago` booleano e **nada mais de financeiro** |
| `GET /api/analytics/*` | `analytics.js` | leitura | `visaoGeral`, `evolucao`, `painel`, `resumoDoMes`, `perfilCliente` |
| `GET /api/auditoria/pagamentos` | `pagamentos-auditoria.js` | leitura, não escreve | classificação de procedência |

**Há quatro portas de escrita para "o dinheiro entrou", e elas não concordam.**

---

## 4. Tabelas envolvidas

| Tabela | Papel no FIN-101 | Dinheiro |
|---|---|---|
| `vendas` | fonte 2; `pago`, `data_pagamento`, `pagamento_origem`, `valor_recebido`, `cobravel`, `vencimento_em`, `cancelada`, `cliente_ambiguo` | **REAL** |
| `venda_itens` | valor da linha; `preco`, `preco_tabela`, `desconto_valor` | **REAL** |
| `historico_operacoes` | fonte 1; versionada, 10 `CHECK`, 5 índices | **centavos INTEGER** |
| `historico_operacao_vendas` | vínculo de duplicata — o que tira a venda da fonte 2 | — |
| `vendas_historicas` / `vendas_historico_lotes` / `vendas_historico_itens` | o conteúdo que a operação decide | REAL |
| `garantia_trocas` | fonte 3; `diferenca`, `diferenca_status`, `diferenca_paga_em`, `diferenca_valor_pago`, `venda_id`, `estornada` | **REAL** |
| `garantias` / `garantia_eventos` | linha do tempo do caso | REAL |
| `clientes` | nome exibido; **não tem nenhuma coluna financeira** | — |
| `movimentos` | citada só para dizer que **nada aqui a toca** | — |

Nenhuma tabela de recebimento, forma de pagamento, parcela ou crédito existe.

---

## 5. Modelo atual de pago / parcial / recebimentos

### `vendas.pago` é booleano e é **escrito**, não derivado

Nasce `DEFAULT 1` — a migration não podia apagar faturamento existente. Hoje
uma venda tem **um** estado e **uma** data.

### Quem consegue produzir PARCIAL hoje

| Produtor | Como | Resultado |
|---|---|---|
| `sync.js › pagamentoDoPedido` | `payment_status='partially_paid'` **com** valor utilizável (`0 < recebido < total`) | `pago=0, cobravel=1, valor_recebido=<n>`, carimbo `nuvemshop_parcial` |
| importação histórica | `valor_recebido_fonte_centavos` / `valorRecebidoCentavos` na entrada administrativa | `cobranca_status='aberta'` com `saldo < efetivo` |
| `vendas-historicas.js › statusDaVenda` | itens da planilha com `pago` misto | `status='parcial'` — **rótulo de leitura, não recebível** |

**Nenhuma rota de UI produz PARCIAL.** Não há como uma pessoa dizer "recebi
metade". Parcial é sempre importado de fora.

### Valor recebido é estruturado?

Meio. Existe **um** número (`valor_recebido` / `valor_recebido_centavos`), não
uma coleção. Não há data do parcial, forma, autor nem evento. `data_pagamento`
de um parcial guarda o `paid_at` da loja com `pago=0` — uma data de pagamento
numa venda não paga.

### Marcar paga destrói informação sobre recebimentos anteriores?

**Sim, e de duas maneiras diferentes conforme a porta** — provado, D3 e D4:

| | `POST /api/vendas/:id/pagamento` | `POST /api/contas-receber/receber` |
|---|---|---|
| `pago` | 1 | 1 |
| `valor_recebido` (era 40) | **`NULL` — os 40 somem** | **`40` — permanece** |
| `pagamento_origem` (era `nuvemshop_parcial`) | sobrescrito por `informado` | sobrescrito por `informado` |
| `cobravel` | 0 | 0 |
| `garantia_trocas` | **não toca** | fecha no mesmo batch |

Depois de qualquer uma, `pagamento_origem='informado'` faz
`atualizarPagamentoDaVenda` **recusar para sempre** qualquer correção vinda da
loja. Um clique errado é irreversível pelo lado do sync.

---

## 6. Bugs encontrados

Todos foram provados rodando, num teste de caracterização escrito antes de
qualquer correção. À medida que cada defeito foi consertado, a prova dele
migrou para a suíte de regressão da subfase correspondente (§19, §20).

### B1 · `evolucao()` conta a diferença de troca duas vezes — **monetário** · `CORRIGIDO EM 5.3a`

`visaoGeral` soma `garantia_trocas` com `AND venda_id IS NULL`
([analytics.js:368](../../api/src/analytics.js#L368)) — desde §36 a diferença já
entra pela venda. `historico-dia.js:74` tem o mesmo filtro. **A série mensal
não tem** ([analytics.js:464](../../api/src/analytics.js#L464)).

Prova: KPI `110`, gráfico `120`, mesmo mês, mesmos dados. O gráfico de Evolução
está maior que o cartão de Faturamento para todo mês com troca paga. Uma linha
de SQL. Nenhum teste cruzava as duas leituras.

### B2 · `POST /api/vendas/:id/pagamento` não fecha o lado da garantia

`receberConta` fecha `vendas` **e** `garantia_trocas` no mesmo `db.batch`, com
o comentário dizendo por quê. A outra porta fecha só a venda. O legado a chama
no perfil da cliente pelo botão **NÃO PAGO**
([dashboard.tpl.html:10680](../../src/dashboard.tpl.html#L10680)) para
*qualquer* venda operacional em aberto — inclusive a venda de troca.

Resultado: venda paga, `diferenca_status` em `a_receber` para sempre, nenhum
evento `registrarPagamentoDaDiferenca` no caso, e o convite a uma segunda
quitação que dispara B1.

### B3 · Quitar apaga o único recebimento estruturado que existe

`valor_recebido = NULL` no UPDATE de `registrarPagamentoVenda`. Os R$ 40 que a
Nuvemshop informou deixam de existir. Não há tabela onde eles tenham sobrado.

### B4 · As duas portas deixam o banco em estados diferentes

Mesma conta, mesmo dia, mesmo valor: uma deixa `valor_recebido=NULL`, a outra
`valor_recebido=40`. `pago=1` com `valor_recebido=40` afirma duas coisas
incompatíveis — e é o estado que a porta "certa" produz.

### B5 · Desfazer pagamento inventa dívida onde ninguém devia · `CORRIGIDO EM 5.3a`

`pago:false` faz `cobravel = 1` incondicionalmente. Um pedido reembolsado
(`cobravel=0` por §36.4) desmarcado por engano **entra no A Receber por R$ 250**
e vira cobrança da cliente. Provado.

### B6 · Saldo negativo é escondido numa fonte e recusado na outra

`historico-operacoes.js:519` recusa explicitamente (*"Não invento saldo negativo
nem arredondo para zero"*). `contas-receber.js` faz `Math.max(0, …)` — uma venda
com `valor_recebido > total` vira saldo zero em silêncio. `vendas` não tem
`CHECK` nenhum; `historico_operacoes` tem dez.

### B7 · `versaoEsperada` só existe para uma das três fontes

`definirPrazoDaConta` e `receberConta` aceitam `versaoEsperada` e **o ignoram**
para `venda` e `troca`. Duas telas abertas quitam a mesma venda sem conflito.
A idempotência salva o dinheiro (`WHERE pago = 0`); a data do pagamento, não —
vence a última.

### B8 · A tela "A receber" do legado não tem ação de receber

`blocoContasReceber` ([dashboard.tpl.html:9612](../../src/dashboard.tpl.html#L9612))
só define prazo. Receber só é possível pelo **perfil da cliente**. É paridade
que o React precisa **corrigir**, não copiar.

### B9 · Rotas órfãs

`PATCH /api/contas-receber/:id/vencimento` não tem call site. `POST
/api/contas-receber/:id/marcar-paga` é chamada pelo legado (`:9676`) para
`historico` apenas, duplicando `/receber` com `chave: historico:<id>`.

### B10 · `pagarDiferencaTroca` não é idempotente

Segunda chamada → `409 'Esta diferença já foi marcada como paga.'`. As outras
duas portas devolvem `{ ok: true, jaEstavaPaga: true }`. Retry após timeout de
rede vira erro na tela.

---

## 7. Risco monetário — REAL × centavos

### Onde está cada um

| REAL (ponto flutuante) | centavos INTEGER |
|---|---|
| `vendas.total`, `vendas.valor_recebido` | `historico_operacoes.bruto_centavos` |
| `venda_itens.preco`, `preco_tabela`, `desconto_valor` | `comissao_centavos`, `liquido_centavos` |
| `garantia_trocas.valor_original`, `valor_novo`, `diferenca`, `diferenca_valor_pago` | `valor_efetivo_centavos`, `valor_recebido_fonte_centavos` |
| `garantias.valor_pago_original` | `valor_recebido_centavos`, `saldo_centavos` |
| `vendas_historicas.valor_total`, `valor_pago` | |

### Onde os dois se encontram

1. **`contasAReceber`** — converte os centavos do histórico para reais
   (`reais()`), soma tudo em ponto flutuante e só então volta:
   `totalCentavos = Math.round(somar(abertas) * 100)`. **A precisão exata do
   histórico é descartada na fronteira.** O erro é < 1 centavo em centenas de
   linhas hoje; a arquitetura é que está invertida.
2. **`cteVendas`** — `historico` divide por `100.0`, `operacional` multiplica
   por `100`, e as duas metades viram uma `UNION ALL`.
3. **`pagarDiferencaTroca`** — comparação de igualdade estrita
   `valor !== dinheiro(troca.diferenca)` entre dois REAL.

### Onde o arredondamento pode alterar PAGO/PARCIAL

Hoje **não pode**, porque `pago` é escrito, não comparado. O risco nasce em
5.8: no instante em que `PAGO` virar `SUM(recebimentos) >= total` sobre REAL,
`0.1 + 0.2 >= 0.3` é `false`, e a venda fica eternamente parcial por um
centavo que não existe. É exatamente o que a especificação do Codex
(API-VEN-013/015) descreve.

### Contratos externos que dependem do formato

| Consumidor | Depende de |
|---|---|
| `src/dashboard.tpl.html` | `money(c.valorReceber)` — reais com 2 casas |
| `GET /api/contas-receber` | `resumo.total` (reais) **e** `resumo.totalCentavos` — os dois já saem |
| `GET /api/analytics/*` | reais `.toFixed(2)` em todo lugar |
| Nuvemshop | **nenhuma** — a loja é destino de estoque, não de dinheiro |
| `docs/ux` API-VEN-015 | pede `valorVenda`/`valorRecebido`/`valorAReceber` **em centavos inteiros** |

### Recomendação arquitetural (não executar em 5.3)

1. **Toda coluna de dinheiro NOVA nasce `INTEGER` em centavos.** Vale
   imediatamente para o ledger de crédito. Isso reduz o trabalho de 5.7 em vez
   de aumentá-lo.
2. **A fronteira de conversão desce para a borda HTTP.** Hoje ela está no meio
   do agregador. `contasAReceber` deve somar em centavos e converter uma vez,
   na serialização.
3. **`resumo.totalCentavos` vira a autoridade**, `total` vira a cortesia. Já
   existem os dois — só falta inverter quem é derivado de quem.
4. **5.7 converte `vendas`/`venda_itens`/`garantia_trocas` com coluna nova ao
   lado, backfill verificado, leitura dupla, e só depois o descarte.** Não é
   escopo de 5.3.

---

## 8. Testes existentes

| Arquivo | O que cobre de financeiro |
|---|---|
| `src/pos-golive-1-test.mjs` | **a suíte central do §37** — três fontes, não duplicação, receber por `chave`, prazo válido/inválido/limpo, troca antiga sem prazo |
| `src/historico-operacoes-test.mjs` | versionamento, `marcarContaPaga`, `definirVencimento` |
| `src/historico-operacoes-riscos-test.mjs` | `versaoEsperada`, conflito 409, saldo negativo recusado, retry por `venda_chave` |
| `src/garantias-ciclo-test.mjs` | ciclo da garantia, diferença +/0/−, **pagamento pelas duas portas**, "faturamento não conta duas vezes" (§7, mas só no KPI) |
| `src/pacote3-test.mjs` | `contasReceber.resumo` estável entre recortes de período |
| `src/pacote-vendas-test.mjs` | `evolucao` — **sem cruzar com o KPI** |
| `src/migracao-pagamento-test.mjs` | backfill `pago`/`data_pagamento` |
| `src/sync-pagamento-test.mjs` · `src/pagamento-nuvemshop-test.mjs` | `pagamentoDoPedido`, carimbos, parcial, `atualizarPagamentoDaVenda` |
| `src/revisao-pre-golive-test.mjs` | `auditoriaPagamentos` |
| `src/fin-101-5-3a-test.mjs` · `src/fin-101-5-3b-test.mjs` | as regressões que nasceram daquelas caracterizações |

A cobertura por fonte é boa. A cobertura **entre** fontes e **entre leituras**
é o que não existe.

---

## 9. Gaps de testes

| # | Gap | Severidade |
|---|---|---|
| G1 | nenhum teste cruza `visaoGeral.faturamento` com `evolucao.pontos[].faturamento` | **causou B1** |
| G2 | nenhum teste compara o estado do banco depois das duas portas de quitação | **causou B2/B4** |
| G3 | nenhum teste cobre uma venda PARCIAL sendo quitada | **causou B3** |
| G4 | nenhum teste cobre `pago:false` sobre `cobravel=0` | **causou B5** |
| G5 | `versaoEsperada` não é testado para `venda`/`troca` (porque não é implementado) | alta |
| G6 | nenhum teste de `status=paga` provando que a resposta é parcial e **diz** que é | média |
| G7 | nenhum teste de arredondamento: `valor_recebido > total`, centavo fracionado, soma de 100+ contas | alta antes de 5.7 |
| G8 | nenhum teste de idempotência comparada entre as três portas (B10) | média |
| G9 | nenhum teste do A Receber com `cliente_ambiguo = 1` (§2) — a conta existe e não tem dona | média |
| G10 | nenhuma invariante executável do tipo `GET /api/estoque/conferir` para dinheiro | alta |

**G10 é o gap estrutural.** Estoque tem razão contábil verificável; recebíveis
não têm nada equivalente.

---

## 10. Paridade com o legado

| Capacidade do legado | Linha | Backend | React | Veredito |
|---|---|---|---|---|
| listar A Receber com resumo | `:9612` | `GET /api/contas-receber` | nada | `AUSENTE NO REACT` |
| definir/limpar prazo | `:9661` | `PATCH .../prazo` | nada | `AUSENTE NO REACT` |
| marcar paga (histórico) | `:9676` | `POST .../:id/marcar-paga` | nada | `AUSENTE NO REACT` · rota duplicada |
| marcar venda paga (perfil) | `:11179` | `POST /api/vendas/:id/pagamento` | nada | `AUSENTE NO REACT` · **B2/B3/B5** |
| receber diferença de troca | `:11198` | `POST /api/contas-receber/receber` | nada | `AUSENTE NO REACT` |
| marcar venda paga (dia) | `:8738` | `POST /api/vendas/:id/pagamento` | nada | `AUSENTE NO REACT` |
| badges vencida/próxima/sem prazo | `:9638` | `vencida`, `vencimentoEm` | nada | `AUSENTE NO REACT` |
| A receber do mês / do dia | `:9447`, `:8829` | `painel`, `historico-dia` | nada | `AUSENTE NO REACT` |
| **receber a partir da lista A Receber** | — | existe | — | **`ERRADO NO LEGADO`** (B8) |

`frontend/src/` não contém a palavra "receber". `docs/ux/03-screens/` não tem
pasta `financeiro`. `FIN-001` continua aberto e `DR-014` o mantém prioritário.

| Classificação | Itens |
|---|---|
| **completo** | as três fontes, a chave, a exclusão de acerto/cancelada/`cobravel=0`/duplicata; prazo; recebimento por `chave`; versionamento do histórico |
| **parcial** | pago/parcial (booleano + um número); `status=paga`; `/api/vendas/lista` sem campos financeiros; concorrência só numa fonte |
| **errado** | B1–B8 |
| **sem teste** | G1–G10 |
| **depende da UX** | ação de receber na lista, layout, filtros, exportação, extrato |
| **depende de 5.7** | unificação REAL → centavos |
| **depende de 5.8** | recebimentos múltiplos, formas, parcelamento, `pago` derivado |

---

## 11. Proposta para o crédito da cliente

### A regra (Sthefany, 12/09/2026)

Troca com peça nova mais barata → a diferença vira **crédito da cliente**. Não
volta em dinheiro. Hoje o sistema registra e **para**: `diferenca_status =
'pendente_regra'`, `creditoAoCliente` anunciado na resposta, nada lançado
([garantias.js:889-970](../../api/src/garantias.js#L889)). O que falta não é a
regra — é o lugar onde um crédito possa viver e ser consumido.

### Recomendação: **opção C — razão de crédito por eventos**

Uma tabela nova, `credito_movimentos`, com a **mesma forma** de `movimentos`.
O saldo é `SUM`, nunca coluna.

```sql
CREATE TABLE credito_movimentos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id   INTEGER NOT NULL REFERENCES clientes(id),
  tipo         TEXT NOT NULL CHECK (tipo IN ('credito','consumo','estorno','ajuste')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos <> 0),  -- + entra, − sai
  origem       TEXT NOT NULL,   -- troca_garantia | venda | ajuste_manual | estorno
  origem_id    TEXT NOT NULL,   -- 'troca:7', 'venda:45'
  venda_id     INTEGER REFERENCES vendas(id),   -- preenchido no consumo
  motivo       TEXT NOT NULL,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_credito_origem ON credito_movimentos(tipo, origem, origem_id);
CREATE INDEX idx_credito_cliente ON credito_movimentos(cliente_id, criado_em);
```

### Como cada critério é atendido

| Critério | Como |
|---|---|
| auditável | cada real tem uma linha, um motivo e uma origem nomeada |
| não perder histórico | append-only. Estorno é **contrapartida**, nunca `DELETE` (§19/§28) |
| crédito parcial | consumo é uma linha de valor livre; o saldo é o que sobrou |
| consumo em compra futura | `venda_id` amarra o consumo à venda que o usou |
| estorno | `tipo='estorno'` com o sinal oposto e `origem_id` da linha que desfaz |
| impedir saldo incorreto | `UNIQUE(tipo, origem, origem_id)` + validação de aplicação `SUM ≥ 0`. SQLite não tem `CHECK` agregado: a invariante vira **`GET /api/credito/conferir`**, irmã de `/api/estoque/conferir` |
| idempotência | o índice único. `troca:7` emite no máximo uma linha de crédito, rode o que rodar |
| autoria futura | uma coluna `autor` quando a autoria existir — sem migração de conceito |
| integração com vendas | `venda_id`, e o consumo é **explícito**, nunca automático |
| compatível com FIN-101 | crédito **não entra** em `contasAReceber`. São eixos opostos: um é dívida da cliente, outro é dívida da loja |
| compatível com 5.8 | um recebimento futuro com `forma='credito'` grava um consumo. Nenhum retrabalho |

### Três travas que a proposta impõe

1. **`cliente_id NOT NULL`.** Crédito sem dona é dinheiro perdido. Troca de
   cliente ambígua (§2) ou sem cadastro → o sistema **recusa e anuncia**, em vez
   de emitir um crédito que ninguém reclama. `garantias.cliente_id` é nulável
   hoje — isto precisa ser uma recusa explícita, não um `NULL` no ledger.
2. **Centavos inteiros desde o nascimento.** Tabela nova não tem legado; nascer
   em REAL seria criar dívida de 5.7 de propósito.
3. **Consumo nunca é automático.** O sistema não desconta crédito sozinho numa
   venda. Quem decide é a tela, e a tela é do Codex.

### O que 5.3 entrega, e o que fica de fora

| Entrega em 5.3e | Fica fora |
|---|---|
| migration da tabela | consumo pela tela de venda (`AGUARDANDO HANDOFF CODEX`) |
| emissão a partir da troca negativa (`pendente_regra` → `credito_emitido`) | validade/expiração do crédito (**decisão de negócio — perguntar à Sthefany**) |
| `GET /api/clientes/:id/credito` — saldo derivado + extrato | crédito transferível entre clientes (não pedido) |
| `GET /api/credito/conferir` — a invariante | crédito como forma de pagamento (5.8) |
| `POST /api/credito/ajuste` com motivo obrigatório | UI (`AGUARDANDO HANDOFF CODEX`) |

---

## 12. Opções descartadas, e por quê

### A · coluna `saldo_credito` em `clientes` — **descartada**

Um número sem explicação. Não diz de onde veio, quando, nem quem mexeu. Duas
requisições concorrentes num `UPDATE ... SET saldo = saldo - ?` sem versão
perdem uma. Sem idempotência: um retry desconta duas vezes. E contradiz a
preferência declarada — o saldo tem que ser **derivável**, não afirmado. É o
mesmo defeito que a Regra Fundamental nº 1 proíbe para `produtos.qtd`.

### B · tabela de saldo atual (uma linha por cliente) — **descartada**

Melhora o travamento e nada mais. Continua sendo um número sem história. Se
divergir do que aconteceu, não existe segunda fonte para arbitrar. É o
`produtos.qtd` sem `movimentos`.

### D1 · reusar `historico_operacoes` — **descartada**

Parece atraente (é versionada, é em centavos, já tem `cobranca_status`), mas a
identidade dela é `(lote_id, venda_chave)` — uma linha de planilha importada.
Um crédito nascido de uma troca de 2026 não tem lote nem chave histórica.
`CHECK (saldo_centavos >= 0)` e `papel IN ('cliente','acerto','revisao')`
teriam de ser afrouxados, enfraquecendo as travas do histórico para acomodar um
domínio que não é o dele.

### D2 · venda de total negativo / pagamento negativo / desconto fictício — **descartada**

Vetado pelo pedido, e com razão. Um `vendas.total` negativo contamina
`faturamento`, `ticketMedio`, `pecas`, ranking de clientes e a série mensal —
sete consultas que hoje somam `vendas` sem imaginar um valor negativo. Cria
dinheiro fora do lugar.

### D3 · conta a receber negativa — **descartada**

`CHECK (cobranca_status <> 'aberta' OR saldo_centavos > 0)` proíbe no banco, e
está certo: "a cliente deve −20" não é uma frase com significado operacional.
Misturaria os dois eixos que esta fase existe para separar.

### D4 · ajuste de estoque — **descartada**

Regra Fundamental nº 1. Crédito não é peça. Movimento sem peça física
quebraria `produtos.qtd == SUM(movimentos.qtd)`.

### D5 · deixar em `garantia_trocas.diferenca` e ler de lá — **descartada**

É o registro **do fato**, não um saldo consumível. Não sabe somar dois créditos,
não sabe abater um consumo parcial, e amarra o conceito "crédito da cliente" à
garantia — quando ele vai precisar existir também por cortesia, erro de
cobrança e devolução.

---

## 13. Dependências do Codex — `AGUARDANDO HANDOFF CODEX`

Registradas em `docs/ux/03-screens/vendas/api-needs.md`, lidas somente leitura.

| Item | Referência do Codex |
|---|---|
| formas de pagamento (catálogo extensível) | API-VEN-016 · `VEN-Q031`, `VEN-Q035` |
| coleção de recebimentos por venda | API-VEN-013 · `VEN-Q029`, `VEN-Q033` |
| parcelamento | `VEN-Q032` |
| layout do financeiro, cards, tabela, recibo | API-VEN-015 |
| ações da tela A Receber (**incluindo receber a partir da lista**, hoje ausente — B8) | sem referência |
| filtros de histórico por estado de pagamento | API-VEN-006 |
| fluxo visual do crédito: onde aparece, como é oferecido, como é consumido | **sem referência nenhuma no Codex** |
| autoria por operação | API-VEN-010 |

**O crédito da cliente não existe em nenhum documento de UX.** A arquitetura é
decisão desta fase; a interação é handoff.

---

## 14. Dependências de 5.7 / 5.8

| Fase | O que ela deve | O que 5.3 faz enquanto isso |
|---|---|---|
| **5.7** REAL → centavos | `vendas`, `venda_itens`, `garantia_trocas`, `vendas_historicas` | não converte nada. Nasce o ledger de crédito já em centavos e a fronteira de conversão desce para a borda HTTP |
| **5.8** recebimentos múltiplos | tabela de recebimentos; `pago` derivado de `SUM`; formas; parcelas; idempotência por recebimento (API-VEN-018) | não cria recebimento nenhum. **Preserva o parcial existente** em vez de apagá-lo (B3), para que 5.8 tenha o que migrar |

Uma decisão de 5.3 que 5.8 herda: **quem é a autoridade sobre `pago`**. Hoje é a
coluna. Em 5.8 será a soma. 5.3 deve reduzir o número de escritores de `pago`
de quatro para um — senão 5.8 terá quatro migrações em vez de uma.

---

## 15. Subfases propostas para 5.3

| Subfase | Escopo | Depende de |
|---|---|---|
| ~~**5.3a**~~ | **FEITA.** B1 e B5 corrigidos, com a invariante KPI ≡ série virando teste. Ver §19 | — |
| ~~**5.3b**~~ | **FEITA.** Um núcleo, três portas. B2, B3 e B4 fechados, e a semântica de `valor_recebido` definida. Ver §20 | — |
| **5.3c** | paridade de concorrência e idempotência: `versaoEsperada` para `venda` e `troca`; `pagarDiferencaTroca` idempotente (B7, B10). `versao` da venda = `(pago, data_pagamento, valor_recebido, vencimento_em)` ou coluna própria — decidir em 5.3c | 5.3b |
| **5.3d** | contrato de leitura do FIN-101: `valorVenda`/`valorRecebido`/`valorAReceber`/`statusPagamento` **em centavos** no `GET /api/vendas/lista` (API-VEN-015, sem inventar recebimentos); `status=paga` completo nas três fontes ou recusa explícita; aposentar as rotas órfãs (B9) | 5.3c |
| **5.3e** | **crédito da cliente.** Migration do ledger, emissão pela troca negativa, `GET /api/clientes/:id/credito`, `GET /api/credito/conferir`, `POST /api/credito/ajuste`. Sem consumo, sem UI | 5.3a |
| **5.3f** | fechar G1–G10, especialmente G7 (arredondamento) e G10 (a invariante do dinheiro) | todas |

**Fora de 5.3:** recebimentos múltiplos, formas, parcelamento, conversão para
centavos das tabelas legadas, consumo de crédito, qualquer tela.

---

## 16. Ordem recomendada

```
5.3a  ─ dois bugs de uma linha, correção mais barata do repositório
  │     e o gráfico volta a concordar com o cartão
  ▼
5.3b  ─ a porta única. Maior redução de risco por linha escrita:
  │     de quatro escritores de `pago` para um
  ▼
5.3c  ─ concorrência paritária. Depois de 5.3b há um lugar só onde pôr
  │     a trava, em vez de quatro
  ▼
5.3d  ─ o contrato que o React vai consumir, já estabilizado por baixo
  │     (o Codex pode desenhar em cima com o backend parado)
  ▼
5.3e  ─ o crédito. Independente de a–d; pode andar em paralelo a partir
  │     de 5.3a. Deixado por último porque é o único que cria estrutura
  ▼
5.3f  ─ a rede que impede a regressão de tudo acima
```

**Por que 5.3b antes de 5.3c:** travar concorrência em quatro portas que
discordam é travar o desacordo. Unificar primeiro deixa uma superfície só.

**Por que 5.3d antes de 5.3e:** FIN-101 é paridade obrigatória por `DR-014`. O
crédito é regra nova. Paridade primeiro.

**Por que 5.3e pode andar em paralelo:** o ledger não toca nenhuma tabela
existente. A única costura é a troca negativa deixar de parar em
`pendente_regra`, e isso é uma transição de status com nome próprio.

---

## 17. O que esta rodada NÃO fez

- não consultou nem escreveu PROD, D1 remoto, Nuvemshop;
- nenhuma migration, nenhum deploy, nenhum `wrangler`;
- não corrigiu nenhum dos dez defeitos — só os provou;
- não criou tabela, coluna, rota nem UI;
- não alterou UX nem leu além do necessário do checkpoint do Codex;
- não converteu dinheiro para centavos;
- não decidiu nada que o handoff do Codex tem de decidir.

## 18. Pendências que dependem de fora

| Pendência | Natureza |
|---|---|
| o crédito da cliente expira? tem validade? | **decisão de negócio — perguntar à Sthefany** |
| troca de cliente sem cadastro ou ambígua gera crédito de quem? | **decisão de negócio** — a proposta recusa e anuncia |
| quantas vendas reais estão hoje com `valor_recebido` preenchido, e quantas trocas em `pendente_regra` | `PRECISA DE AUDITORIA READ-ONLY FUTURA EM PROD` |
| quantos meses de faturamento o B1 já distorceu no gráfico | `PRECISA DE AUDITORIA READ-ONLY FUTURA EM PROD` |
| formas de pagamento, parcelamento, recebimentos múltiplos, layout, fluxo visual do crédito | `AGUARDANDO HANDOFF CODEX` |

---

## 19. Fase 5.3a — executada

Duas correções pequenas e independentes do modelo financeiro futuro. Nenhuma
migration, nenhum schema, nenhuma rota nova, nenhum status financeiro novo.

### B1 — o mesmo fato econômico, contado uma vez

`api/src/analytics.js › evolucao()`, um predicado:

```diff
               WHERE diferenca_status = 'paga' AND diferenca_paga_em IS NOT NULL
                 AND estornada = 0
+                AND venda_id IS NULL
```

| | antes | depois |
|---|---|---|
| `visaoGeral.faturamento` | 335 | 335 |
| `Σ evolucao.pontos[].faturamento` | **345** | **335** |
| ponto de 2026-09 | 245 | 235 |

O que o teste passou a cobrar é mais forte que a linha: para **todo** período
(`tudo`, `12m`, `90d`, `30d`) e **toda** granularidade (`mes`, `dia`),

```
visaoGeral(p).faturamento  ==  Σ evolucao(p).pontos[].faturamento
```

Duas consultas que respondem à mesma pergunta não voltam a divergir em
silêncio.

### B5 — desfazer o pagamento não inventa dívida

`api/src/vendas-comandos.js › registrarPagamentoVenda`, caminho `pago: false`.

**A regra, dita em uma frase: desfazer nunca ELEVA `cobravel`.**

Ele volta a 1 quando o pagamento desfeito tinha sido declarado por uma PESSOA
daqui (`pagamento_origem = 'informado'`) — a mesma autoridade que declarou é a
que agora se corrige. Declarado pela LOJA, não: `cobravel` é preservado.

| Cenário | `pagamento_origem` | antes | depois |
|---|---|---|---|
| balcão paga por engano | `informado` | `cobravel = 1` ✅ | `cobravel = 1` ✅ |
| venda criada já paga | `informado` | `cobravel = 1` ✅ | `cobravel = 1` ✅ |
| legado / histórico | `legado_data_venda`, `historico_paga` | `cobravel = 1` ✅ | `cobravel = 1` ✅ (já era 1) |
| **pedido pago na loja e reembolsado** | `nuvemshop_pago` | `cobravel = 1` ❌ **dívida de R$ 250** | `cobravel = 0` ✅ |

Nenhum status novo foi inventado. A regra reusa três fatos que já existiam:

1. **`cobravel`** — a coluna que §36.4 criou justamente para dizer "o cliente
   REALMENTE ainda deve isto", e cujo comentário de schema já dizia *"status
   técnico da loja não vira dívida de ninguém"*;
2. **`pagamento_origem`** — a coluna que existe para que uma procedência
   herdada ou deduzida nunca seja lida como fato declarado. `informado` é o
   único carimbo que significa "uma pessoa daqui disse";
3. **a recusa que já estava escrita** em `sync.js ›
   atualizarPagamentoDaVenda`: a sincronização se nega a levar um pedido de
   pago para não pago porque *"isso removeria faturamento já contado, e a
   política contábil para esse caso não existe"*. A rota manual não pode
   escrever sozinha, por acidente, a metade cobrável dessa política ausente.

O resultado para o pedido reembolsado é `pago = 0, cobravel = 0`: fora do
faturamento **e** fora do A Receber. É a mesma forma de `indeterminado_site` —
ausência de informação vira ausência de número dos dois lados.

§9: a resposta **anuncia**. Passou a devolver `cobravel` e `porque`, para
nenhuma tela precisar deduzir por que o valor saiu de um lado sem aparecer no
outro.

### O que 5.3a deliberadamente NÃO fez

- não mexeu na regra de cancelamento nem na de reembolso;
- não criou status, coluna, tabela, migration ou rota;
- não unificou as portas de pagamento (**B2**) — 5.3b;
- não preservou o parcial na quitação (**B3/B4**) — 5.3b;
- não tocou `versaoEsperada`, `Math.max` do saldo, rotas órfãs nem a
  idempotência de `pagarDiferencaTroca`;
- não implementou o ledger de crédito (**5.3e**), que segue bloqueado nas duas
  perguntas comerciais de §18;
- não consultou PROD.

O caminho de `pago: false` continua zerando `valor_recebido` — isso é B3, e
sai junto com ele em 5.3b, na porta única.

### Onde os defeitos moram agora

| Arquivo | Papel |
|---|---|
| `src/fin-101-5-3a-test.mjs` | **rede de regressão** de B1 e B5 — 11 provas |
| `src/fin-101-5-3b-test.mjs` | **rede de regressão** de B2, B3 e B4 — 11 provas |

Um defeito consertado não fica caracterizado em lugar nenhum: ou vira regra
testada, ou não é nada. Os dois arquivos entraram em `domain-pure`, então
rodam nos gates `domain` e `release` — o domínio do dinheiro deixa de ter
prova que não é executada.

---

## 20. Fase 5.3b — executada

O objetivo não era "corrigir três bugs". Era acabar com a condição que os
produziu: **"a venda foi paga" era um fato com três escritores, cada um com o
seu SQL.** Eles concordavam só enquanto alguém lembrasse de copiar a regra nos
três — e B2, B3 e B4 são exatamente as três vezes em que ninguém lembrou.

### 20.1 O inventário completo dos escritores financeiros

Colunas rastreadas: `vendas.pago`, `data_pagamento`, `pagamento_origem`,
`valor_recebido`, `cobravel`; `garantia_trocas.diferenca_status`,
`diferenca_paga_em`, `diferenca_valor_pago`.

A auditoria de §3 dizia "quatro portas". São **onze escritores**, e um deles
escreve sem citar nenhuma das colunas.

| # | Escritor | Rota / gatilho | Escreve | Depois de 5.3b |
|---|---|---|---|---|
| 1 | `vendas-comandos.js › registrarVenda` | `POST /api/vendas` | INSERT: `pago`, `data_pagamento`, `pagamento_origem`, `cobravel` | inalterado — é o nascimento da venda, não a quitação |
| 2 | `vendas-comandos.js › registrarPagamentoVenda` (quitar) | `POST /api/vendas/:id/pagamento` | `pago`, `data_pagamento`, `pagamento_origem`, `valor_recebido`, `cobravel` | **delega** a `quitarVenda` |
| 3 | `vendas-comandos.js › registrarPagamentoVenda` (desfazer) | mesma rota, `{pago:false}` | as mesmas | **delega** a `desfazerPagamentoVenda` |
| 4 | `contas-receber.js › receberConta` | `POST /api/contas-receber/receber` com `venda:N` | `vendas` + `garantia_trocas` | **delega** a `quitarVenda` |
| 5 | `garantias.js › pagarDiferencaTroca` | `POST /api/garantias/:id/troca/pagar` | `garantia_trocas` + `vendas` | **delega** a `quitarVenda` quando há `venda_id`; sem venda ligada, continua sendo o dono |
| 6 | `garantias.js › registrarVendaDaTroca` | `POST /api/garantias/:id/troca` | INSERT: `pago`, `data_pagamento`, `pagamento_origem`, `cobravel` | inalterado — nascimento |
| 7 | `garantias.js › trocarPeca` | idem | INSERT `diferenca_status` | inalterado — nascimento |
| 8 | `garantias.js › estornarTroca` | `POST /api/garantias/:id/troca/estornar` | `cobravel = 0` junto com `cancelada = 1` | inalterado — é cancelamento, não pagamento |
| 9 | `sync.js › puxarPedidos` | cron · `POST /api/sync` | INSERT: as cinco colunas de `vendas` | inalterado — ver 20.2 |
| 10 | `sync.js › atualizarPagamentoDaVenda` | cron · `POST /api/sync` | `pago`, `data_pagamento`, `pagamento_origem`, `valor_recebido`, `cobravel` | inalterado — ver 20.2 |
| 11 | `maletas-comandos.js` (acerto) | `POST /api/maletas/:id/acerto` | INSERT **sem citar** `pago`/`cobravel` — cai nos defaults `1` e `1` | inalterado — ver 20.6 |

Não são escritores financeiros, apesar do nome: `vendas-nuvemshop.js` (só
colunas `nuvemshop_*`), `venda-correcao.js` (`total` e item), `cancelarVenda`
(só `cancelada`), `definirPrazoDaConta` (só `vencimento_em`).

### 20.2 Por que a sincronização NÃO delega

Ela é o canal da LOJA, não de uma pessoa, e as duas semânticas são diferentes
de propósito: `quitarVenda` carimba `informado`, e a loja nunca deve carimbar
isso — é justamente esse carimbo que faz `atualizarPagamentoDaVenda` se
recusar a sobrescrever o que um humano decidiu.

E ela não consegue produzir a inconsistência que 5.3b existe para eliminar:
`atualizarPagamentoDaVenda` só alcança vendas casadas por `externo_id`, e a
venda que representa uma diferença de troca nasce com `origem = 'troca'`,
`nuvemshop_status = 'nao_aplicavel'` e **sem `externo_id`**. A loja não a vê.

### 20.3 A autoridade única

Módulo novo: **`api/src/pagamento-venda.js`**, com `quitarVenda` e
`desfazerPagamentoVenda`. Ele não importa `garantias.js`, `contas-receber.js`
nem `vendas-comandos.js` — todos são chamadores dele.

Para que isso fosse possível sem ciclo, `evento` e
`registrarPagamentoDaDiferenca` saíram de `garantias.js` para um módulo folha,
**`api/src/garantia-eventos.js`**. O grafo ficou numa direção só:

```
garantia-eventos.js  ←  pagamento-venda.js  ←  garantias.js
                                             ←  contas-receber.js
                                             ←  vendas-comandos.js
```

Três portas, um núcleo. **Cada porta manteve o seu contrato HTTP**; o estado
que elas deixam no banco é, por construção, o mesmo — e o teste compara os
retratos de `vendas`, `garantia_trocas` e `garantia_eventos` para provar.

A única divergência que sobrou é deliberada, e é de HTTP, não de banco: no
segundo clique, `receberConta` devolve `200` com `jaEstavaPaga` (é uma lista
que pode ser reprocessada) e `/api/vendas/:id/pagamento` devolve `409` com a
data (quem apertou um botão merece saber que o fato já estava gravado).
**Nenhum dos dois escreve.**

### 20.4 B2 — antes e depois

| | antes | depois |
|---|---|---|
| `receberConta` fecha a troca | sim | sim |
| `/api/vendas/:id/pagamento` fecha a troca | **não** | sim |
| `pagarDiferencaTroca` fecha a venda | sim, com SQL próprio | sim, pelo núcleo |
| evento `diferenca_paga` na linha do tempo | só por duas portas | pelas três |
| desfazer o pagamento reabre a diferença | **não — `vendas` dizia "não paga" e `garantia_trocas` dizia "paga"** | sim, com evento `diferenca_pagamento_desfeito` (§28: não apaga, desfaz) |

O caminho de volta era o espelho de B2, e não estava no diagnóstico: nenhuma
das portas reabria a diferença. Agora reabre, e o evento novo entra no
vocabulário de `garantia_eventos`.

### 20.5 B3 e B4 — o que foi feito, e o que explicitamente NÃO foi

Antes de decidir, auditei se já existia infraestrutura canônica para preservar
o valor anterior. **Não existe:**

| Candidata | Por que não serve |
|---|---|
| `historico_operacoes` | versionada e em centavos, mas a identidade dela é `(lote_id, venda_chave)` — uma linha de planilha importada. Venda operacional não tem lote nem chave histórica |
| `venda_item_correcoes` | audita SKU, descrição, variação e preço de um ITEM. A forma inteira é sobre correção de código de peça |
| `garantia_eventos` | pertence ao caso de garantia |
| `movimentos` | estoque. Regra Fundamental nº 1 |

Então **nenhuma tabela foi criada.** O que 5.3b fez:

1. **Estado corrente correto.** `valor_recebido` vai ao total na quitação. A
   invariante nova — `pago = 1` nunca coexiste com `valor_recebido < total` —
   elimina B4, que era exatamente essa coexistência.
2. **A evidência não é apagada.** Onde havia parcial conhecido, a quitação
   escreve em `observacao` uma nota com valor, total, data e carimbo de
   origem — do mesmo modo que `estornarTroca` já anota o estorno. É legível
   por uma pessoa e **não é histórico estruturado**, e a própria nota diz
   isso: "Registro de parcelas só existe a partir da 5.8."
3. **A resposta anuncia.** `parcialAnteriorPreservadoEmObservacao` volta nas
   duas portas, para nenhuma tela precisar deduzir.

**O que NÃO foi resolvido, e é honesto dizer:** a HISTÓRIA dos recebimentos.
"Entraram 40 no dia 2 e 60 no dia 10" continua sem lugar estruturado. Isso é
5.8 — a coleção de recebimentos (API-VEN-013). Até lá o sistema tem **estado
corrente**, não **extrato**, e não afirma o contrário em lugar nenhum.

### 20.6 A semântica de `valor_recebido`, definida

> **`valor_recebido` é o TOTAL JÁ RECEBIDO que o sistema conhece.**
> `NULL` significa "não há parcial conhecido" — e aí quem responde é `pago`:
> `pago = 1` quer dizer recebido igual ao `total`; `pago = 0`, recebido zero.

É a opção A do pedido, com uma precisão que ela não trazia: a quitação **só
escreve número onde já havia número**. Se `valor_recebido` era `NULL`,
continua `NULL` — "o sistema nunca soube um número aqui" e "o número é o
total" são fatos diferentes, e os dois satisfazem a invariante. Isso também
evita reescrever a forma de toda venda paga que já existe.

Regras que decorrem, todas testadas:

- `pago = 1` implica `valor_recebido` `NULL` ou igual ao `total`;
- desfazer devolve `valor_recebido` a `NULL` — **não inventa** um parcial
  anterior que o sistema não consegue provar;
- o A Receber continua cobrando o saldo (`total` menos recebido) enquanto a
  conta está aberta.

Caso conhecido e não tratado (20.1, linha 11): o acerto de maleta insere sem
citar as colunas e cai em `pago = 1, cobravel = 1`, um par que se contradiz.
Hoje é inofensivo — acerto é excluído do A Receber por `origem` e
`revendedora_id` —, mas é uma linha esperando para confundir alguém.
Registrado, não corrigido: mexer no acerto não é 5.3b.

### 20.7 Desfazer, definido

| Garantia | Como |
|---|---|
| cobrabilidade preservada | `cobravel` só volta a 1 quando o pagamento desfeito era `informado` (5.3a, agora dentro do núcleo) |
| troca relacionada preservada | a diferença **reabre** para `a_receber`, no mesmo batch, com evento |
| nenhum recebível inventado | pedido não-cobrável desfeito não aparece no A Receber |
| nenhum parcial inventado | `valor_recebido` volta a `NULL` |
| idempotência | `WHERE id = ? AND pago = 1`; e `registrarPagamentoDaDiferencaDesfeito` só escreve se o último evento da troca for um pagamento |

Um efeito de 5.3b que merece nome: a idempotência do evento da diferença
deixou de ser "existe algum `diferenca_paga`?" e passou a ser "o ÚLTIMO evento
desta troca é um pagamento?". Sem isso, pagar, desfazer e pagar de novo
ficaria mudo na terceira etapa — idempotência viraria amnésia.

### 20.8 `versaoEsperada` — auditado, adiado

A porta única tornou a pergunta respondível, e a resposta é **não é
mecânico**:

- `historico_operacoes` tem `versao` porque é versionada por construção —
  cada mudança cria linha nova. `vendas` não tem coluna de versão e não é
  append-only;
- daria para derivar uma versão do quarteto
  `(pago, data_pagamento, valor_recebido, vencimento_em)`, mas isso é escolher
  uma definição de "mudou" que hoje não existe, e ela precisaria valer também
  para `definirPrazoDaConta`;
- `garantia_trocas` tem o mesmo problema.

O risco real já está contido: `quitarVenda` grava sob `WHERE id = ? AND
pago = 0`, então duas telas não pagam duas vezes. O que ainda se perde num
empate é a DATA do pagamento — vence a última. **Fica para 5.3c**, como
planejado, e não entrou neste commit.

### 20.9 O que 5.3b deliberadamente não fez

- não criou tabela, coluna, migration nem rota;
- não implementou recebimentos múltiplos, parcelas ou formas de pagamento;
- não implementou o ledger de crédito nem o consumo dele;
- não converteu nada para centavos;
- não tocou o `Math.max` do saldo, as rotas órfãs, nem a UX;
- não alterou a regra de cancelamento, de reembolso ou do acerto de maleta;
- não mudou nenhum contrato HTTP;
- não consultou PROD.
