# Motor de reconciliação

Schema em [api/migracao-reconciliacao.sql](../api/migracao-reconciliacao.sql)
(espelhado em [api/schema.sql](../api/schema.sql)) · **NÃO aplicado em
nenhum banco ainda** — nem local de desenvolvimento, nem produção. O que
existe hoje é o contrato: tabelas, invariantes e testes. O motor em si
(`api/src/reconciliacao.js`, rotas, tela de revisão) é a próxima fase — ver
[ROADMAP_RECONCILIATION.md](ROADMAP_RECONCILIATION.md).

Este documento explica o fluxo completo, mesmo a parte que ainda não foi
escrita, porque o schema já foi desenhado para ele inteiro — decidir a forma
das tabelas sem saber onde a última etapa (Apply) ia doer teria significado
refazer schema depois.

## Por que existe

Hoje a sincronização e a importação **decidem e aplicam no mesmo ato**. A
prévia existe (`POST /api/sync {"seco": true}`), mas é um desvio de
comportamento, não o caminho principal — e a única proteção contra um erro
em massa é um freio que conta quantos produtos mudariam
([TECH_DEBT.md](TECH_DEBT.md) item 8).

O motor de reconciliação separa "descobri o que mudaria" de "mudei" em duas
etapas com um registro entre elas, para que aprovar deixe de ser instantâneo
com aplicar.

## O fluxo

```
Preview                  a rodada seca de hoje já faz isto:
                          POST /api/sync {"seco": true}
      ↓
Sessão congelada          INSERT reconciliacao_sessoes (status='revisao')
                           INSERT reconciliacao_itens, um por mudança —
                           cada um leva `de`, `para` e `base_json`
      ↓
Revisão                   uma pessoa olha a lista, agrupada por risco
      ↓
Aprovação                 status do item: pendente → aprovado | rejeitado
      ↓
Precondition DESTINO      o valor observado lá fora ainda é `de`?
  +
Precondition ORIGEM       o estado daqui que produziu `para` ainda é
                           `base_json`?
      ↓
Apply                     as DUAS preconditions têm de passar. Uma falhando
                           → status='obsoleto', nunca escreve.
                           Escrita falhando depois de passar nas duas
                           → status='erro'.
                           Escrita certa → status='aplicado', e passa por
                           estoque.js › movimentar como qualquer mudança
      ↓
Validação                  produtos.qtd == SUM(movimentos.qtd) continua
                           valendo — a mesma conferência de sempre
      ↓
Auditoria                  reconciliacao_sessoes.relato_json: quem foi
                           aplicado, quem ficou obsoleto, quem deu erro
```

Nada disto existe como rota ainda — hoje só a linha do meio ("Sessão
congelada") pode ser simulada, lendo o resultado de uma rodada seca comum.

## `de`, `para`, `base_json` — o que cada um responde

Confundir os três é o erro mais fácil de cometer lendo este schema, porque
os três parecem a mesma coisa ("um valor relacionado à mudança"). Não são.

| Coluna | Responde | Exemplo (estoque_loja) |
|---|---|---|
| `de` | O que o **destino** mostrava na hora da análise | "a Nuvemshop dizia 10" |
| `para` | O que a proposta quer escrever | "deveria dizer 8" |
| `base_json` | O que, **daqui**, produziu esse `para` | `{"qtd_total": 8, "consignado": 0, "casa": 8}` |

`de` e `para` sozinhos respondem "o que muda". `base_json` responde uma
pergunta diferente: **"o `para` continua certo?"** — porque o `para` de
`estoque_loja` não é um número fixo, é o RESULTADO de uma conta feita com
dado nosso, que pode ter mudado desde a análise (uma venda, uma maleta
aberta, um kit que perdeu peça).

### Por tipo

| `tipo` | `base_json` | Por quê |
|---|---|---|
| `estoque_loja`, código sem variação | `{"qtd_total": N, "consignado": N, "casa": N}` | `qtd_total = produtos.qtd`; `consignado` = soma de `maleta_itens` em maletas abertas/em_acerto; `casa = qtd_total − consignado` (o valor antes do `max(0, …)` de `empurrarEstoque`) |
| `estoque_loja`, é KIT | `{"disponivel_kit": N}` | `saldosDoSku(kit).disponivel` — o mínimo entre componentes, já calculado. Um kit nunca tem saldo próprio |
| `estoque_loja`, uma variação | `{"saldo_variacao": N}` | `SUM(movimentos.qtd) WHERE sku=X AND variacao=Y` |
| `produto_novo` | `NULL` | A origem é a linha da planilha, congelada em `dados_json`. Nada externo pode deixá-la obsoleta sozinha |
| `ajuste_qtd` | `NULL` | Mesma razão. `de` (via precondition A) já cobre a deriva possível: se `produtos.qtd` mudou desde a análise, a precondition A pega |
| `campo` | `NULL` | Idem — descrição/categoria/preço vêm do arquivo, não de um cálculo volátil |

`estoque_loja` é o único tipo com `base_json` não-nulo porque é o único caso
em que **duas fontes independentes** determinam a proposta: a loja (externa,
é o `de`) e o nosso saldo (interno, é o `base_json`). Os outros três tipos
têm uma fonte só — o arquivo importado — e ela não muda sozinha.

## As duas preconditions

```
Precondition A (destino)    valor ATUAL no destino  ==  de
Precondition B (origem)     estado ATUAL que produziria `para`  ==  base_json
```

**As duas.** Uma sozinha não basta — é o cenário do pedido original:

```
prévia:     a loja mostra 10, temos 8 em casa.   de=10  para=8
no meio:    vendem-se 5 peças. em casa passa a ter 3.
aplicação:  confere `de` → a loja continua com 10. Bate. Aplica.
resultado:  a loja anuncia 8. Existem 3.
```

A precondition A sozinha passa porque ninguém mexeu na Nuvemshop entre a
análise e a aplicação. O que mudou foi o lado de CÁ — e é exatamente o que a
precondition B pega: `base_json.casa` era 8, o `casa` recalculado na hora do
Apply já não é.

Se **qualquer uma** das duas não bater, o item vira `status = 'obsoleto'` e
**não escreve nada**. Não tenta recalcular e aplicar por aproximação — volta
para revisão humana numa sessão nova. É a regra 2 do `CLAUDE.md` ("não sabe
qual aro saiu? não escreva") estendida para a aplicação em massa.

## Máquina de estados

### Sessão (`reconciliacao_sessoes.status`)

```
revisao   ──┬──► aplicando ──┬──► aplicada
            │                ├──► aplicada_parcial
            │                └──► erro
            ├──► cancelada
            └──► superada
```

| Estado | Significa |
|---|---|
| `revisao` | Nasce aqui. Esperando decisão humana sobre os itens |
| `aplicando` | O Apply está em andamento (transitório) |
| `aplicada` | Todo item aprovado foi escrito com sucesso |
| `aplicada_parcial` | Pelo menos um item aprovado ficou `obsoleto` ou deu `erro` |
| `cancelada` | Encerrada sem aplicar nada, por decisão humana |
| `superada` | Uma sessão mais nova da MESMA origem nasceu antes desta ser decidida |
| `erro` | O Apply foi interrompido por falha catastrófica, antes de terminar de contabilizar o que conseguiu fazer |

`aplicada_parcial` existe porque `aplicada` sozinho não distingue "tudo
certo" de "metade ficou obsoleta" — a mesma ambiguidade que o `TODO` de
`vendas.cancelada` já resolve com um campo dedicado em vez de sobrecarregar
`status`.

### Item (`reconciliacao_itens.status`)

```
pendente ──┬──► aprovado ──┬──► aplicado
           │                ├──► obsoleto
           │                └──► erro
           └──► rejeitado
```

`obsoleto` × `erro` é a distinção que protege peça física, pedida
explicitamente na revisão deste schema:

| | `obsoleto` | `erro` |
|---|---|---|
| O que houve | O mundo mudou desde a análise — a precondition A OU B não bateu | As duas preconditions bateram, mas a ESCRITA em si falhou (rede, Nuvemshop fora do ar, D1 indisponível) |
| É concorrência? | Sim | Não |
| A proposta continuava válida? | Não — o `para` já não é o certo | Sim — só a tentativa de escrever falhou |
| Reaplica sozinho? | **Nunca.** Só numa sessão nova, com um `para` recalculado | Pode ser retentado com o MESMO `para` — nada mudou |

Misturar os dois no mesmo status faria a tela tratar "a loja caiu por 2
segundos" e "alguém vendeu a peça enquanto você revisava" como o mesmo tipo
de problema, quando as respostas certas são opostas: um pede retentar, o
outro pede olhar de novo.

## Unicidade — `(sessao_id, sku, variacao, tipo)`

Sem isso, a mesma proposta duas vezes na mesma sessão é possível: inofensivo
para `estoque_loja` (o PATCH manda valor absoluto — aplicar duas vezes dá o
mesmo resultado), mas para `ajuste_qtd` seria um **movimento contado duas
vezes** — a razão contábil quebrando por uma corrida de inserção, não por
erro de cálculo.

`variacao IS NULL` (o código inteiro, sem variação) precisa de cuidado
extra: o SQLite nunca considera dois `NULL` iguais dentro de um índice único
— cada `NULL` é distinto até de si mesmo. Um índice comum sobre `variacao`
deixaria passar dois itens do mesmo `sku`+`tipo`, os dois com `variacao
NULL`, como se fossem diferentes.

A solução, provada em `src/reconciliacao-schema-test.mjs`:

```sql
variacao_chave TEXT GENERATED ALWAYS AS (COALESCE(variacao, '')) STORED,
...
CREATE UNIQUE INDEX idx_rec_itens_unico
  ON reconciliacao_itens(sessao_id, sku, variacao_chave, tipo);
```

Uma coluna gerada só para a comparação, trocando `NULL` por `''`. A coluna
`variacao` continua `NULL` de verdade — o resto do sistema (`movimentos`,
`produto_variacoes`) já usa esse mesmo vocabulário, e mudar isso só para
esta tabela criaria uma segunda convenção.

`pragma_table_info` **não lista** colunas `GENERATED` — só
`pragma_table_xinfo` (com `hidden = 3`). Quem for inspecionar o schema por
código precisa saber disso; o teste de schema já usa a versão certa.

## Sessões concorrentes

**No máximo uma sessão `revisao` por origem, e o banco garante — não o
código:**

```sql
CREATE UNIQUE INDEX idx_rec_sessoes_revisao_unica
  ON reconciliacao_sessoes(origem) WHERE status = 'revisao';
```

Uma sessão nova marca a antiga como `superada` no MESMO `db.batch()` em que
se cria — atômico, sem lock distribuído. Duas abas tentando criar sessão ao
mesmo tempo: uma cria, a outra recebe erro de UNIQUE e tenta de novo (ou a
tela mostra "alguém já abriu uma revisão, veja essa").

**Por que não travar `aplicando` também:** duas aplicações concorrentes
poderiam, em teoria, mirar o mesmo SKU a partir de sessões diferentes. Mas a
defesa contra isso já existe e é melhor que um lock de sessão — são as
**preconditions por item**. Elas protegem no grão certo (o SKU específico
que está sendo escrito), não no grão da sessão inteira, que travaria itens
sem nenhuma relação entre si só porque nasceram na mesma revisão.

## Idempotência do Apply

O Apply completo ainda não existe, mas o contrato já decide onde a garantia
mora — para não descobrir depois que faltou uma peça.

**Escritas internas** (`ajuste_qtd`, `produto_novo`, `campo` — tudo que
grava só no nosso D1): a troca de status do item e o movimento resultante
entram no **mesmo `db.batch()`**, com a atualização de status usando
compare-and-swap:

```sql
UPDATE reconciliacao_itens SET status = 'aplicado'
 WHERE id = ? AND status = 'aprovado';
```

Se essa `UPDATE` afeta 0 linhas, alguém (uma rodada anterior, uma aba
duplicada) já aplicou este item — e a escrita real nem é tentada. Atômico:
não existe instante em que o item mudou de status mas o movimento não foi
gravado, ou vice-versa. É o D1 garantindo, não um retry na aplicação.

**Escritas externas** (`estoque_loja` → PATCH na Nuvemshop): o PATCH não
pode entrar no mesmo `db.batch()` — é uma chamada HTTP, não uma instrução
SQL. Mas a operação em si já é **idempotente pela natureza dela**: o PATCH
manda um valor ABSOLUTO (`stock: 8`), não um incremento. Reenviar o mesmo
PATCH duas vezes — porque a resposta da primeira se perdeu, ou o Worker
morreu entre o PATCH e a `UPDATE` de status — dá o mesmo resultado. A CAS
ainda atualiza o status, mas para fins de contabilidade e da tela, não como
mecanismo de segurança contra duplicidade.

Esta é a mesma lógica que já protege `vendas.externo_id`: o dedup mora na
identidade da operação (aqui, o CAS do `status`), não dentro de
`estoque.js › movimentar`, que continua confiando em quem o chama — do
mesmo jeito que hoje já confia no chamador da sincronização.

**O que fica de fora de propósito:** nenhuma coluna nova em `movimentos`
para referenciar de volta o item de reconciliação. `movimentos.origem` já é
um campo texto livre (`'importacao'`, `'venda'`, `'variacao'`, …); um
movimento vindo da reconciliação usa `origem = 'reconciliacao'` e `obs`
carrega o id da sessão e do item em texto — o mesmo padrão que
`sync.js › puxarPedidos` já usa (`obs: 'Pedido ${numero} da loja'`). Uma FK
dedicada acoplaria a razão contábil a um conceito específico de uma
feature, e `movimentos` foi desenhada para nunca depender de quem a chama.

## Backup — pré-condição de produção

O backup de `backups/d1/2026-08-18_06-22/` foi validado e reconferido nesta
mesma fase (carregado num banco limpo: 16 tabelas, razão em 0 divergências).
Isso prova que o MECANISMO de backup funciona — não substitui um backup
tirado na hora.

**Antes de aplicar `api/migracao-reconciliacao.sql` (ou
`api/migracao-sync-seco.sql`) em produção: gerar um backup novo,
imediatamente antes da operação.** A loja escreve o dia inteiro; um backup
de horas atrás não cobre o que aconteceu depois. Ver
[BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).

## Estado real desta fase

| | |
|---|---|
| Schema | Fechado — duas tabelas, cinco índices, dois `CHECK` |
| Migration aplicada em produção | **Não** |
| Migration aplicada em dev local | **Não** — só dentro dos testes, numa pasta descartável |
| Rota de API | Não existe |
| Tela de aprovação real | Não existe (a tela atual é só leitura da rodada seca) |
| Apply | Não existe |
| Testes de schema | `src/reconciliacao-schema-test.mjs` — 65 asserções, banco local descartável |
| Testes da correção do TECH_DEBT 12 | `src/saude-sync-test.mjs` — 25 asserções |

Ver [ROADMAP_RECONCILIATION.md](ROADMAP_RECONCILIATION.md) para o que vem
depois.
