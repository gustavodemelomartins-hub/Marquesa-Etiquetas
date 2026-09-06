# READY_FOR_REVIEW_DEPLOY

**Revisão operacional 1 — pós-go-live** · 06/09/2026
Branch `claude/marquesa-operational-review-eztpzt` · base `main` em `d3a2740`

Nada foi publicado. Nenhuma migration foi aplicada em produção. Nenhuma
escrita saiu para a Nuvemshop. Tudo abaixo roda contra o Worker local e um
SQLite descartável.

O status é `READY_FOR_REVIEW_DEPLOY` e não `BLOCKED_NEEDS_DECISION` porque
tudo o que o pacote pediu foi implementado e provado. Restam **cinco decisões
de negócio** (§11) que não bloqueiam o deploy — nenhuma delas altera dado
existente, e todas podem ser resolvidas depois de a Sthefany usar.

---

## 1. Resumo das alterações

| # do pacote | O que foi feito | Onde |
|---|---|---|
| **1** Cards de Lançamentos por data | Rota nova que soma **todas** as origens comerciais da data. Card de acerto passa a mostrar o **líquido da Marquesa** (bruto − comissão), com os três números escritos | `api/src/historico-dia.js › lancamentosDoDia` |
| **2** Clique no gráfico "Evolução por mês" | Resumo do mês abre **abaixo do gráfico**, sem trocar de tela: 4 cards, categorias, histórico compacto expansível, e a coerência de datas dita em vez de conciliada | `api/src/analytics.js › resumoDoMes` |
| **3** Garantia / troca | Peça nova nasce como registro comercial valendo a **diferença**; diferença entra no A Receber; botão "Registrar pagamento" no perfil | `api/src/garantias.js`, `api/src/contas-receber.js` |
| **4** UX de data no A Receber | Campo com dois estados, máscara DD/MM/AAAA, calendário ao lado, validação de data impossível, Enter/Escape sem apagar | `src/dashboard.tpl.html › campoData` |
| **5** Perfil: comprado / pago / em aberto | Três números separados; ticket médio e gasto por peça passam a sair do comprado | `api/src/analytics.js › perfilCliente` |
| **6** Corrigir SKU de venda registrada | Rota + modal, com estoque tratado diferente em venda do sistema e linha de planilha; auditoria em tabela própria | `api/src/venda-correcao.js` |
| **7** Monte seu Colar | Base + componentes + configuração por venda, no mesmo carrinho; flag de estoque já refletido | `api/src/personalizacao.js` |
| **8** Central de Pendências / variações | Lista agregada com filtros e ações; resolução pela venda e pela maleta; reconciliação read-only das três fontes | `api/src/pendencias.js`, `api/src/variantes.js` |
| **9** Auditoria de consumo D1 | Instrumento de medição + achado de 298 mil linhas por clique, corrigido | `api/src/d1-metrica.js`, `D1_USAGE_AUDIT.md` |
| **10** Auditoria antes de implementar | Mapa do que já existia, feito antes de escrever qualquer linha | `docs/AUDITORIA_POS_GOLIVE_1.md` |
| **11** Testes | 285 asserções novas em 3 arquivos, cobrindo A–T | `src/pos-golive-1-*.mjs` |

Sete commits, cada um nomeando o defeito que corrige:

```
a16d004  perf: uma consulta lia 298 mil linhas por clique, e a cota do D1 é da conta
6f39c6e  feat: a peça trocada some da ficha, e a diferença de R$ 10 não tinha onde ser cobrada
d56463d  feat: o prazo era um campo de data cru sempre vazio, e a diferença não tinha botão
c6ff1fe  feat: o gráfico tinha 25 barras e nenhuma delas respondia nada
5b9aa09  feat: o código estava errado e as duas saídas óbvias eram as duas erradas
8c28337  feat: o sistema dizia "revisar variação" com precisão e não deixava responder
e7bac41  feat: uma variante por combinação seriam 1.728 cadastros que ninguém mantém
```

---

## 2. Bugs encontrados

Quatro deles não estavam no pacote. Foram achados enquanto o resto era feito,
e todos afetam número que a Sthefany lê.

### B1 — `/api/vendas/dia` descartava itens como se fossem repetição
**Gravidade: alta.** A chave de deduplicação era da VENDA, não do item. Uma
venda de R$ 110 com três peças aparecia como **R$ 50 com uma peça**, e o
resumo do dia dizia `duplicadasRemovidas: 1` sobre uma peça que existia.
Afetava o bloco "Também aconteceu" e qualquer soma derivada dele.
Corrigido em `api/src/historico-dia.js`; provado no cenário A/B.

### B2 — "entrou no caixa neste dia" nunca via dinheiro de outro dia
**Gravidade: alta.** A função somava as linhas do próprio dia cuja data de
pagamento fosse hoje — e as linhas do dia são, por construção, as vendas com
`data = hoje`. Ou seja: só encontrava a venda feita **e** paga no mesmo dia,
justamente o caso em que vendido e recebido não diferem. A venda de julho
paga em setembro — o caso inteiro de §30 — nunca aparecia, e o rodapé dizia
"R$ 0 entrou no caixa" num dia em que entrou dinheiro.
Corrigido usando a mesma regra de faturamento do painel.

### B3 — `/api/variacoes/revisao` lia 298.032 linhas por chamada
**Gravidade: alta (é a causa provável do estouro de cota).** Subconsulta
correlacionada sobre `maleta_itens`, que não tem índice por `sku`: a tabela
inteira era varrida uma vez por produto ativo. Detalhe e medição em
`D1_USAGE_AUDIT.md` §2.1.

### B4 — venda de balcão não paga não aparecia em lugar nenhum do Painel
**Gravidade: média.** "A receber" lia só `historico_operacoes`. A peça saiu,
a cliente ficou devendo, e o Painel não mostrava — apesar de `vendas.pago` e
`vendas.cobravel` existirem desde §29/§36.4 exatamente para isso.

### B5 — o card do perfil dizia "Gastou" e mostrava o recebido
**Gravidade: média.** É o §5 do pacote, e é bug: quem comprou R$ 1.000 e
pagou R$ 700 aparecia com 700, e a compra fiada sumia da ficha exatamente
enquanto ela ainda devia.

---

## 3. Arquivos alterados

**Backend (novos):**
`api/src/contas-receber.js` · `api/src/d1-metrica.js` · `api/src/pendencias.js` ·
`api/src/personalizacao.js` · `api/src/venda-correcao.js`

**Backend (alterados):**
`api/src/analytics.js` · `api/src/garantias.js` · `api/src/historico-dia.js` ·
`api/src/index.js` · `api/src/sync.js` · `api/src/variantes.js`

**Painel:** `src/dashboard.tpl.html` (+ `dashboard.html`, gerado por
`python src/build.py`)

**Migration:** `api/migracao-pos-golive-1.sql` — **não aplicada em produção**

**Testes:** `src/pos-golive-1-test.mjs` · `src/pos-golive-1-ui-test.mjs` ·
`src/pos-golive-1-variacoes-test.mjs` · `src/d1-uso-audit.mjs` ·
`src/pacote-vendas-test.mjs` (atualizado — ver §11.1)

**Documentação:** `api/REGRAS.md` (§35 a §43) · `docs/TESTING.md` ·
`docs/AUDITORIA_POS_GOLIVE_1.md` · `D1_USAGE_AUDIT.md` · este arquivo

Total: 20 arquivos, +7.625 / −157 linhas (metade é o `dashboard.html` gerado).

---

## 4. Migration criada

Arquivo único: **`api/migracao-pos-golive-1.sql`**.

**Tudo é aditivo.** Cria índice e tabela nova, e acrescenta coluna. Não apaga
linha, não altera coluna existente, não reclassifica dado antigo. Nenhum
`UPDATE` em massa, nenhum `DELETE`, nenhum `DROP`.

| Bloco | O quê | Efeito em dado existente |
|---|---|---|
| 1 | `idx_maleta_itens_sku`, `idx_produtos_desc` | nenhum — só leitura fica barata |
| 2 | tabela `maleta_item_variacoes` | nenhum — nasce vazia |
| 3 | `garantia_trocas.venda_id` + índice único | nenhum — NULL em todas as linhas atuais, e é esse NULL que mantém as trocas antigas faturando pelo caminho antigo |
| 4 | tabela `venda_item_correcoes` | nenhum — nasce vazia |
| 5 | `personalizacao_modelos`, `personalizacao_opcoes`, `venda_personalizacoes`, `venda_personalizacao_itens` | nenhum — nascem vazias |
| 6 | `vendas.vencimento_em` + índice parcial | nenhum — NULL = "sem prazo definido", que é o que a tela já sabe dizer |

**Dois `ALTER TABLE ADD COLUMN`** (`garantia_trocas.venda_id`,
`vendas.vencimento_em`) não são idempotentes no SQLite. Rodar a migration
duas vezes falha com `duplicate column name` — e essa falha significa "já foi
aplicada", não "deu errado". Cada bloco é independente e pode ser retomado do
que faltou.

Aplicada e exercitada no banco local em todas as execuções da suíte.

---

## 5. Testes

### 5.1 Os cenários A–T do pacote

| | Cenário | Onde |
|---|---|---|
| A | Data histórica em Lançamentos → cards mudam | `pos-golive-1-test` A/B |
| B | Acerto → bruto, comissão e líquido | `pos-golive-1-test` A/B + UI |
| C | Clique em mês → 4 cards | `pos-golive-1-test` C–F + UI |
| D | Cliente repetido no mês → conta uma vez | `pos-golive-1-test` C–F |
| E | Categorias mensal → soma bate com as peças | `pos-golive-1-test` C–F + UI |
| F | Histórico mensal expansível | `pos-golive-1-test` C–F + UI |
| G | Troca Evelyn → R$ 10 no A Receber | `pos-golive-1-test` G/H |
| H | Pagar a diferença → pendência fecha | `pos-golive-1-test` G/H |
| I | Prazo DD/MM/AAAA salva e recarrega | `pos-golive-1-test` I + UI |
| J | Comprou 1000, pagou 700, deve 300 | `pos-golive-1-test` J |
| K | Juliana Negri → corrigir SKU, histórico preservado | `pos-golive-1-test` K/L |
| L | Correção operacional → +1 no errado, −1 no certo, uma vez | `pos-golive-1-test` K/L + UI |
| M | Correção histórica → não movimenta estoque | `pos-golive-1-test` M |
| N | Monte seu colar → consome base + componentes | `pos-golive-1-test` N/O + UI |
| O | Venda personalizada já refletida → não baixa | `pos-golive-1-test` N/O |
| P | Resolver variação pela venda → pendência fecha | `pos-golive-1-test` P–S + UI |
| Q | Resolver variação pela maleta → pendência fecha | `pos-golive-1-test` P–S |
| R | Resolver variação → não baixa estoque de novo | `pos-golive-1-test` P–S + UI |
| S | Conflito de variação → usuária recebe explicação | `pos-golive-1-test` P–S |
| T | Reconciliação Nuvemshop → READ-ONLY e relatório | `pos-golive-1-variacoes-test` |

### 5.2 Resultado da suíte

Cada teste em banco **limpo**, com a migration aplicada.

```
── pos-golive-1-test.mjs             ok (189 asserções)
── pos-golive-1-variacoes-test.mjs   ok  (27 asserções)
── pos-golive-1-ui-test.mjs          ok  (69 asserções)
── pacote-vendas-test.mjs            ok (184 asserções)
── variacoes-test.mjs                ok  (58 asserções)
── kits-test.mjs                     ok  (20 asserções)
── vendas-historico-test.mjs         ok  (80 asserções)
── historico-operacoes-test.mjs      ok  (40 asserções)
── venda-desconto-test.mjs           ok  (38 asserções)
── sync-test.mjs                     ok  (71 asserções)
── reconciliacao-test.mjs            ok  (54 asserções)
── fase2-telas-test.mjs              ok
```

**`GET /api/estoque/conferir` volta vazio** depois de toda a suíte, e
`SELECT COUNT(*) FROM produtos WHERE qtd < 0` devolve **0**.

### 5.3 O que NÃO passou — e por quê

**`src/revendedoras-test.mjs` — 4 asserções falham.** Verificado em `main`
(`d3a2740`), **antes de qualquer mudança minha**: falha exatamente igual, nas
mesmas quatro asserções ("Bia entrou no Top", valor vendido, giro, "Ana
continua fora"). É **falha pré-existente**, não regressão desta rodada.

Não foi investigada a fundo porque está fora do escopo do pacote e mexer nela
sem pedido seria ampliar a rodada. Fica registrada como pendência: a seção
"Top Revendedoras" pode estar mostrando menos do que devia em produção.

**Testes de navegador** exigem `PW_CHROMIUM` apontando para o Chromium do
ambiente. Rodando dois testes com loja falsa em sequência sem intervalo, o
primeiro pode falhar com erro de socket (porta ainda ocupada) — é ambiente,
não produto; rodar de novo passa.

---

## 6. Impacto esperado em dados

### 6.1 O que muda em número já existente: **nada**

Verificado item a item:

| Mudança | Por que não move número antigo |
|---|---|
| Troca vira venda | Só vale para trocas **novas**. As existentes ficam com `venda_id` NULL e continuam faturando pelo caminho de antes — a guarda `venda_id IS NULL` em `visaoGeral` e em `recebidoNoDia` é exatamente isso |
| A Receber com três fontes | As vendas operacionais não pagas **já existiam** com `pago=0, cobravel=1`; elas passam a **aparecer**. O total em aberto do Painel vai subir — não porque alguém passou a dever, mas porque a dívida deixou de ser invisível |
| Comprou / pago / em aberto | `faturamento` continua existindo com o mesmo significado e o mesmo valor. O que mudou é existir `comprou` ao lado |
| Ticket médio do PERFIL | **Muda de base**: passa do recebido para o comprado. Numa cliente com tudo pago, é o mesmo número; numa com compra fiada, sobe. O ticket médio do PAINEL não mudou |
| Dedup de `/api/vendas/dia` (B1) | Números do dia que estavam **errados para menos** passam a estar certos. Nenhum dado foi alterado — a leitura é que estava perdendo linha |
| "Entrou no caixa" (B2) | Idem: passa a mostrar dinheiro que sempre entrou |
| Índices e memorização | Zero efeito em valor |

### 6.2 O que passa a ser possível escrever

Nada disso acontece sozinho — todos exigem uma ação humana:

- resolver variação: escreve `variacao`/`variante_id` em `venda_itens` e em
  `movimentos`. **`movimentos.qtd` não é tocado** em nenhum caminho;
- corrigir SKU (venda do sistema): dois movimentos de `ajuste` que se anulam
  no total geral e movem uma unidade entre dois códigos;
- venda personalizada: movimentos de venda na base e nos componentes;
- registrar pagamento: só `vendas.pago`/`data_pagamento` e
  `garantia_trocas`. **Nunca estoque.**

### 6.3 A invariante

`produtos.qtd == SUM(movimentos.qtd)` é conferida depois de **cada** operação
que toca estoque nos testes desta rodada: correção de SKU, resolução de
variação, venda personalizada, troca de garantia. Fecha em todas.

---

## 7. Auditoria D1

Documento completo: **[D1_USAGE_AUDIT.md](D1_USAGE_AUDIT.md)**.

O essencial:

| | Antes | Depois |
|---|---:|---:|
| `GET /api/variacoes/revisao` | 298.032 linhas | **5.047** |
| `GET /api/state` | 3.142 | **2.370** |
| Uma passada por todas as rotas | 435.032 | **141.273** |

A correção principal **não depende da migration**: a reescrita da consulta
sozinha leva de 298 mil para 5,4 mil, e vale no próximo deploy. O índice
`idx_maleta_itens_sku` melhora um pouco mais e barateia `consignadoDoSku`,
que roda em toda venda.

A memorização do painel no cliente elimina o repique de 69,7 mil linhas por
volta à aba, com invalidação em qualquer escrita e teto de 60 segundos.

O que **não** foi otimizado, com o número e o motivo, está em §4 do
documento — incluindo uma consulta de 13.752 linhas que alimenta um único
indicador e cuja remoção é decisão da Sthefany, não minha.

---

## 8. Pendências de variações — o estado hoje

Não é possível dizer quantas existem em produção: nada aqui leu o banco de
produção, e não deve.

O que **passou a existir** para responder isso:

```
GET /api/pendencias                     todas as pendências, de todas as origens
GET /api/pendencias?tipo=variacao       só as de variação
GET /api/variacoes/reconciliacao        as três fontes, READ-ONLY, classificadas
```

A reconciliação classifica cada código em:

- **RESOLVIDO** — sabemos qual variação é qual e o número da loja já é o
  nosso. Nada a fazer;
- **PENDENTE_HUMANO** — falta informação (peça em maleta sem variação
  identificada, estoque não repartido, variação que a loja não conhece). Cada
  um vem com o **caminho para resolver** escrito por extenso;
- **DIVERGENCIA_REAL** — sabemos qual é qual e o número está diferente. Isto
  sim é para empurrar, e o empurrão é `POST /api/sync`, com autorização.

O caso do print (SKU 647729, `motivo: 'maleta'`) agora tem caminho: a Central
de Pendências oferece a distribuição por variação, e identificar destrava a
sincronização daquele código sem movimentar peça nenhuma.

**Ordem sugerida para a Sthefany, depois do deploy:**

1. abrir Pendências › Central e resolver o que for de variação;
2. rodar `GET /api/variacoes/reconciliacao` e ler o resumo;
3. só então `POST /api/sync {"seco": true}` e conferir o relatório;
4. autorizar a escrita, se o relatório estiver limpo.

---

## 9. Arquitetura do Monte seu Colar

```
personalizacao_modelos      "Colar 3 filhos": slots_min, slots_max,
                            base sugerida, preço sugerido
        │
        └── personalizacao_opcoes    quais PEÇAS DO CATÁLOGO podem ocupar
                                     uma posição, com rótulo e grupo
                                     ("Menino Verde", grupo "Menino")

                    ↓ na hora da venda

venda_personalizacoes        a composição escolhida: modelo, base, preço,
                             estoque_ja_refletido
        │
        └── venda_personalizacao_itens   uma linha por posição, com o nome da
                                         peça CONGELADO e o movimento que a
                                         baixou (NULL = não movimentei, de
                                         propósito)
```

**Por que não uma variante por combinação:** 3 posições × 2 sexos × 6 cores =
1.728 variantes, cada uma com saldo próprio para desencontrar do físico.

**O que se reusa de `kit_componentes`:** a ideia e o mecanismo de baixa — um
SKU sem saldo próprio cujo disponível é o mínimo entre os componentes. O que
não servia é a composição **fixa**; aqui ela muda a cada venda, e por isso
mora no lado da venda.

**A baixa:** base e cada componente saem **exatamente uma vez**. Os
movimentos vêm de uma lista só, montada em `prepararPersonalizacoes` — nem a
base duas vezes (ela é o item do recibo e uma peça física), nem o componente
pelo caminho do kit e de novo pelo da personalização.

**Nuvemshop (§7.5):** modelo e opções são **dado, não interface**. Uma página
de produto lê `GET /api/personalizacao/modelos` (com disponibilidade) e posta
a composição em `POST /api/vendas`, campo `personalizacoes`. Nada aqui muda —
o configurador do site e o do balcão passam a ser duas telas sobre a mesma
regra, e não duas regras.

**Ressalva honesta:** os dois vídeos enviados **não puderam ser lidos neste
ambiente** — o ffmpeg disponível é o build de gravação do Playwright, sem
demuxer de MP4. A implementação segue o §7 escrito, que é detalhado.
Conferir a tela contra os vídeos é item de revisão antes do deploy.

---

## 10. Riscos

| # | Risco | Probabilidade | Mitigação |
|---|---|---|---|
| R1 | **O total do "A receber" vai subir visivelmente** ao incluir vendas fiadas que antes não apareciam | alta (é o objetivo) | Avisar a Sthefany antes: não é dívida nova, é dívida que deixou de ser invisível. O resumo separa por tipo |
| R2 | **Ticket médio do perfil muda de base** (recebido → comprado) | alta | Documentado em §39 do REGRAS.md. O ticket médio do Painel não mudou |
| R3 | Memorização de 60 s pode mostrar número velho se **outro aparelho** escrever | baixa | Teto de 60 s + invalidação em qualquer escrita local. Nunca cobre `/api/state` |
| R4 | Correção de SKU aplicada por engano | baixa | Modal exige VER a peça antes de confirmar; auditoria guarda o antes; estoque recusa se não houver peça |
| R5 | Venda personalizada registrada duas vezes | baixa | `estoque_ja_refletido` é explícita e auditável; misturar peça avulsa com a flag é recusado |
| R6 | Resolver variação com saldo insuficiente | média | A resolução prossegue (a peça física já saiu) mas devolve `conflito` com os números — §8.5 do pacote |
| R7 | Migration falhar no meio (2 `ALTER TABLE` não idempotentes) | média se rodada duas vezes | Cada bloco é independente; `duplicate column name` significa "já aplicada". Backup antes, sempre |
| R8 | `revendedoras-test` continua falhando | certa | Pré-existente, verificada em `main`. Não bloqueia — mas a seção "Top Revendedoras" merece investigação própria |

---

## 11. Decisões de negócio ainda necessárias

Nenhuma bloqueia o deploy. Todas mudam apenas o que aparece daqui para a
frente.

### D1 — Ticket médio do perfil: comprado ou recebido?
Foi mudado para o **comprado**, para não contradizer o card "COMPROU" logo
acima. Se a Sthefany quiser o recebido, o número já está no payload como
`ticketMedioRecebido` — é uma linha de tela.

### D2 — Peça nova mais barata que a original numa troca
Continua **`pendente_regra`**: crédito ou reembolso nunca foi definido. O
sistema registra e para. Precisa de decisão: vira crédito para a próxima
compra? Vira devolução em dinheiro? Vira nada?

### D3 — A composição personalizada conta em qual categoria?
Hoje a venda personalizada entra no catálogo pela categoria da **base** (o
Colar Veneziana). Se "Colar personalizado" deve ser uma categoria própria nos
relatórios, é cadastro, não código.

### D4 — Nome da peça em linha de planilha corrigida
Ao corrigir o SKU de uma linha histórica, `nome_produto_historico` **não é
reescrito**: ele é o que a planilha dizia, e as colunas `*_original` são o
único registro da fonte. A tela mostra o nome novo resolvendo pela correção
registrada. Se a Sthefany preferir reescrever a célula, é decisão dela — e
custa perder o original.

### D5 — O indicador "códigos distintos vendidos" vale 20% do custo do Painel
Uma consulta de 13.752 linhas alimenta esse único número
(`D1_USAGE_AUDIT.md` §4.1). Tirá-lo do payload padrão economiza isso por
abertura. É um número na tela; a decisão é dela.

---

## 12. Checklist de go-live

Nada aqui foi executado. É o roteiro para quem for publicar.

**Antes**

- [ ] `git fetch && git log main..claude/marquesa-operational-review-eztpzt` — conferir os 7 commits
- [ ] `python src/build.py` e `git diff --stat --ignore-cr-at-eol dashboard.html` — o gerado bate com o template
- [ ] `api/dev-local.sh` + a suíte de §5.2 em banco limpo
- [ ] `GET /api/estoque/conferir` vazio
- [ ] **Backup de `marquesa-db-prod` confirmado** — `docs/BACKUP_RECOVERY.md`
- [ ] Ler §10 (riscos) e §11 (decisões) com a Sthefany, em especial R1 e R2

**DEV primeiro**

- [ ] `git push origin develop` → deploy automático de `marquesa-api-staging`
- [ ] Aplicar `api/migracao-pos-golive-1.sql` em **`marquesa-db-dev`**
- [ ] Smoke em `marquesa-dev.pages.dev`: escolher uma data em Lançamentos,
      clicar numa barra do gráfico, abrir Pendências › Central, abrir uma ficha
- [ ] `GET /api/estoque/conferir` no DEV, vazio
- [ ] `GET /api/variacoes/reconciliacao` no DEV — ler o resumo
- [ ] Sthefany usar o DEV por pelo menos um dia de operação

**Produção — cada passo com autorização humana explícita**

- [ ] Autorização para o merge em `main`
- [ ] Autorização + backup recente para a migration em `marquesa-db-prod`
- [ ] Aplicar a migration **antes** do deploy do Worker (o código funciona sem
      ela — só mais devagar e sem as telas novas — mas não o contrário)
- [ ] Autorização para `wrangler deploy` (Worker) e para a publicação do painel
- [ ] Depois: `GET /api/estoque/conferir` em produção, vazio
- [ ] Depois: conferir que o "A receber" subiu pelo motivo esperado (R1)
- [ ] **Não** rodar `POST /api/sync` com escrita antes de ler a reconciliação

---

## 13. Rollback

**Painel (`dashboard.html`)** — reverter o arquivo e republicar. Independente
do backend: o painel antigo funciona contra a API nova (as rotas velhas todas
continuam existindo).

**Worker** — `git revert` dos 7 commits, ou publicar a partir de `main` em
`d3a2740`. O código antigo funciona contra o banco migrado: tudo o que a
migration acrescenta é ignorado por quem não sabe dele.

**Banco** — a parte importante: **a migration não precisa ser desfeita.**

| O que | Como desfazer | Precisa? |
|---|---|---|
| Índices | `DROP INDEX` | não — só melhoram leitura |
| Tabelas novas | `DROP TABLE` | não — o código antigo não as consulta |
| `garantia_trocas.venda_id` | SQLite não remove coluna sem recriar a tabela | **não** — NULL em toda linha antiga, e é isso que o código antigo espera |
| `vendas.vencimento_em` | idem | **não** — mesma razão |

Ou seja: **rollback de código é suficiente**, e não há passo destrutivo de
banco. Se ainda assim for preciso voltar o banco inteiro,
`wrangler d1 time-travel restore` — que é operação de autorização humana
explícita, com o procedimento em `docs/BACKUP_RECOVERY.md`.

**Dado criado depois do deploy que se perderia num restore de banco:**
resoluções de variação, correções de SKU, prazos definidos, composições
personalizadas e pagamentos de diferença. Nenhum deles é reconstruível a
partir de outra fonte — é o motivo para preferir rollback de código.
