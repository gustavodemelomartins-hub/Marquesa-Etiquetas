# Rumo: motor de reconciliação

**Nada disto está implementado.** Este documento registra a direção
combinada para a fase seguinte, para que ela não precise ser redescoberta —
e para que nenhuma mudança feita antes dela vá no sentido contrário.

O motor atual de sincronização continua como está. Ver
[SYNC_ENGINE.md](SYNC_ENGINE.md).

---

## O fluxo pretendido

```
ANALISAR
   ↓            lê os dois lados, não escreve nada
GERAR DIFF
   ↓            o que mudaria, item a item, com o número de antes e o de depois
CLASSIFICAR
   ↓            por risco: trivial · confere · perigoso · desconhecido
CRIAR SESSÃO DE REVISÃO
   ↓            estado persistido, retomável em outro aparelho
USUÁRIO APROVAR
   ↓            item a item ou em bloco, mas sempre um ato humano explícito
APLICAR
   ↓            só o que foi aprovado
VALIDAR
   ↓            a razão fecha? o resultado é o que a prévia prometeu?
AUDITAR
                o que foi decidido, por quem, contra que números
```

A ideia central é separar **informação** de **ação**. Hoje as duas chegam
juntas: a tela mostra o problema e o botão que o resolve, e a decisão
acontece no mesmo clique da execução.

## Por que agora não, e por que depois sim

Este sistema já acerta a parte difícil: `movimentos` é razão contábil, o
freio de segurança existe, o dry-run existe, a semeadura recusa quando a
soma não bate. O que falta não é cuidado — é **um lugar onde o cuidado seja
visível e retomável**.

Um motor de reconciliação prematuro seria pior que o que existe: mais
código, mais estado, mais superfície de erro, para um fluxo que hoje uma
pessoa consegue conferir olhando.

Ele passa a valer a pena quando qualquer destes acontecer:

- os pedidos com SKU desconhecido deixarem de ser exceção;
- houver mais de uma pessoa mexendo no estoque;
- uma importação errada custar mais de uma tarde para desfazer.

---

## Problemas já identificados que este motor precisa resolver

### 1. Dry-run não é o fluxo principal da interface

`POST /api/sync {"seco": true}` faz exatamente o que promete: lê tudo,
calcula tudo, grava o retrato da loja e não escreve na Nuvemshop. Mas o
caminho natural da tela é aplicar; a prévia é um desvio, não o padrão.

**Direção:** prévia primeiro, aplicação como consequência de uma aprovação.

### 2. A importação grava antes de mostrar prévia

`index.js › importarProdutos` monta os statements, roda o `db.batch()` e
**depois** devolve `avisos[]`. Os avisos são honestos (§22: sinalizar, não
corrigir em silêncio), mas chegam quando o dado já entrou.

Uma planilha com uma coluna trocada vira dezenas de movimentos de `ajuste`
antes de qualquer pessoa ver o que ia acontecer. Nada se perde — a razão
guarda tudo e cada ajuste é rastreável — mas desfazer é trabalho.

**Direção:** `analisar → diff → aprovar → aplicar`, com o mesmo formato de
diff da sincronização. A skill `marquesa-safe-import` já registra a
sequência para quando alguém for mexer no importador.

### 3. `forcar: true` ignora a proteção inteira

Uma única flag desliga os dois freios de uma vez. Ela é necessária — o freio
tem falso positivo, e quem opera precisa poder dizer "eu vi, pode aplicar" —
mas hoje é tudo ou nada, e não fica registrado o que ela viu antes de
forçar.

**Direção:** aprovar o **conjunto específico** de mudanças que a prévia
mostrou, em vez de desligar a verificação. Se a loja mudar entre a prévia e
a aplicação, o conjunto não bate mais e a aplicação para sozinha.

### 4. Pedido com SKU desconhecido precisa de revisão, não de lista

`relato.itensIgnorados` anuncia o item que não casou, e um pedido cujos
itens são todos desconhecidos não vira venda nenhuma. Está certo em não
adivinhar. Mas o item fica numa lista que não leva a lugar nenhum: não há
"criar este produto", "casar com este SKU", "ignorar sempre".

Enquanto isso, houve uma venda de verdade que o sistema não registrou.

**Direção:** fila de revisão com identidade e estado — pendente, casado,
ignorado — e a venda entrando quando a decisão for tomada.

### 5. A identidade das variantes merece revisão

`produto_variacoes` é apagada e regravada inteira a cada rodada, e a chave é
`(sku, nome)`. Enquanto o nome da variação for estável na loja, funciona. No
dia em que "45cm" virar "45 cm", a variação some e outra nasce — e os
movimentos históricos continuam apontando para um nome que não existe mais.

O saldo total do código não se perde (a razão está em `movimentos`), mas a
repartição entre variações fica órfã, e a regra do "código virgem" para de
proteger o que devia.

**Direção:** ancorar a identidade em `variante_id` da Nuvemshop, com o nome
como rótulo mutável — e uma migração que reconcilie o histórico existente.
Não é mudança pequena: `movimentos.variacao` guarda o **nome**.

### 6. Conflitos precisam de classificação por risco

Hoje o freio conta: 40 mudanças, 15 zerados. Um número não distingue
"acertar 30 estoques em 1 unidade" de "zerar 14 produtos que estavam
vendendo".

**Direção:** classificar cada mudança antes de somar —

| Classe | Exemplo | Tratamento |
|---|---|---|
| trivial | diferença de 1 para mais | aplica direto |
| confere | diferença grande, mas com movimento que a explica | mostra a explicação |
| perigoso | zerar produto visível e com estoque na loja | exige aprovação item a item |
| desconhecido | SKU sem par, soma que não bate | nunca aplica sozinho |

### 7. A interface precisa separar informação de ação humana

Consequência das seis anteriores. A aba Loja hoje mistura três coisas
diferentes: o retrato da loja (informação), os problemas encontrados
(diagnóstico) e os botões (ação).

**Direção:** o diagnóstico leva a uma **sessão de revisão** com estado
próprio no banco — retomável, auditável, com o que foi aprovado e o que foi
recusado, e por quais números.

---

## Revisão do schema já escrito (2026-08-18)

As duas tabelas existem no branch `feature/motor-reconciliacao`
(commit `23f9962`), **nunca aplicadas em banco nenhum** — produção segue com
16 tabelas. `api/schema.sql` no branch tem **0 linhas removidas**: é
puramente aditivo. A migration (`api/migracao-reconciliacao.sql`) e o
`schema.sql` declaram as mesmas 9 e 14 colunas e os mesmos 3 índices —
conferido coluna a coluna.

### `reconciliacao_sessoes`

**Finalidade.** Uma rodada de análise inteira: o lugar onde a decisão mora
entre "descobri o que mudaria" e "mudei".

| | |
|---|---|
| PK | `id INTEGER AUTOINCREMENT` |
| FKs | nenhuma (é a raiz) |
| Índice | `idx_rec_sessoes_status` em `(status)` |
| Estados | `revisao` → `aplicada` \| `cancelada` \| `erro` |
| Timestamps | `criada_em` (default `datetime('now')`), `decidida_em`, `aplicada_em` |
| Carga | `resumo_json` (a análise), `relato_json` (o que a aplicação fez), `erro` |

**O que está certo.** Três timestamps em vez de um: "quando alguém decidiu"
e "quando o sistema aplicou" são perguntas diferentes, e no dia em que
aplicar demorar ou falhar pela metade, ter os dois é o que permite
reconstruir a ordem dos fatos. `relato_json` separado de `resumo_json` pela
mesma razão — o que se propôs e o que se fez não podem morar no mesmo campo.

**Riscos.**

1. **`status = 'aplicada'` não distingue aplicação total de parcial.** Os
   itens têm `aplicado` e `erro` individuais, e `relato_json` traz o resumo,
   então o dado existe — mas o nome do estado mente para quem lê só a sessão.
   Sugestão: `aplicada_parcial`, ou um campo `aplicados`/`pulados`.
2. **Nada impede duas sessões abertas ao mesmo tempo.** Duas abas, duas
   sessões, as duas aprovadas. A defesa por item (abaixo) evita o dano, mas
   a segunda aplicação vira uma lista de itens pulados sem explicação óbvia.
   Um índice parcial resolveria: `CREATE UNIQUE INDEX ... ON
   reconciliacao_sessoes(origem) WHERE status = 'revisao'`.
3. **Nenhuma sessão expira.** Uma prévia de três semanas atrás pode ser
   aprovada hoje. Ver a seção de corrida, adiante.

### `reconciliacao_itens`

**Finalidade.** Uma linha por mudança proposta.

| | |
|---|---|
| PK | `id INTEGER AUTOINCREMENT` |
| FK | `sessao_id → reconciliacao_sessoes(id)` |
| Índices | `idx_rec_itens_sessao (sessao_id)`, `idx_rec_itens_decisao (sessao_id, decisao)` |
| Identidade | `(sku, variacao, tipo)` — declarada em comentário, **não** no banco |
| Tipos | `estoque_loja` \| `produto_novo` \| `ajuste_qtd` \| `campo` |
| Risco | `trivial` \| `confere` \| `perigoso` \| `desconhecido` |
| Decisão | `pendente` → `aprovado` \| `recusado` |
| Resultado | `aplicado` (0/1), `erro` |
| Carga | `de`, `para` (TEXT), `dados_json` |

**O que está certo.** `de` e `para` como TEXT: o mesmo motor carrega número
(estoque), texto (descrição) e nulo (§24, produto sem preço), e um `INTEGER`
forçaria o `null` a virar 0 em algum lugar. `variacao NULL` significando "o
código inteiro" casa com o resto do sistema, onde `movimentos.variacao` já
funciona assim. E `risco` incluir `desconhecido` — um valor que existe para
o sistema poder dizer "não sei" — é a decisão mais importante da tabela.

**Riscos.**

1. **A identidade `(sessao_id, sku, variacao, tipo)` não é imposta pelo
   banco.** Duplicar um item numa sessão é possível. Para `estoque_loja` seria
   inofensivo (o PATCH manda valor absoluto, aplicar duas vezes dá o mesmo
   resultado); para `ajuste_qtd` seria um movimento contado duas vezes — ou
   seja, a razão contábil. Recomendação: `CREATE UNIQUE INDEX
   idx_rec_itens_id ON reconciliacao_itens(sessao_id, sku, variacao, tipo)`.
   Cuidado com `variacao NULL`: em SQLite dois NULLs não colidem num índice
   único, então o código inteiro precisa gravar `''` em vez de `NULL`, ou o
   índice usar `COALESCE(variacao, '')`.
2. **Não há coluna de precondição do lado de CÁ.** É a falha principal — a
   seção seguinte é inteira sobre ela.

## Preview obsoleto: o que o schema detecta e o que não detecta

O cenário:

```
prévia calculada
↓
o estoque muda
↓
alguém aprova a prévia antiga
↓
aplicação
```

**O que o schema detecta hoje.** A coluna `de` guarda o valor que o mundo
tinha na hora da análise, e o comentário da tabela diz explicitamente que é
por ela que "a aplicação reconfere se o mundo continua igual ao que a pessoa
aprovou". Isso é o padrão *expected value*, e funciona — para um dos dois
lados.

**O que ele não detecta.** Para `tipo = 'estoque_loja'`, a mudança proposta
é "empurrar `para` para a Nuvemshop". Esse `para` não vem da loja: vem
**daqui**, de `max(0, produtos.qtd − consignado)`. A proposta depende de dois
mundos, e `de` só fotografa o de lá.

```
prévia:     S1 — a loja mostra 10, temos 8 em casa.   de=10  para=8
no meio:    alguém registra a venda de 5 peças de S1. em casa passa a ter 3.
aplicação:  confere `de` → a loja continua com 10. Bate. Aplica.
resultado:  a loja volta a anunciar 8 peças. Existem 3.
```

A conferência passa e a loja fica anunciando cinco peças que não existem.
É exatamente a classe de erro que o sistema inteiro foi construído para não
cometer: escrever sobre peça física sem entender a origem.

O mesmo vale para `ajuste_qtd`, onde `para` sai de uma contagem, e para
`campo`, onde alguém pode ter editado o produto no painel no meio do
caminho.

### A menor alteração que resolve

**Uma coluna, na migration que ainda não foi aplicada em lugar nenhum** —
logo, sem precisar de um segundo `ALTER` empilhado depois:

```sql
-- O estado do lado de CÁ que produziu `para`. `de` guarda o do destino;
-- esta guarda o da origem. Sem as duas, a conferência só olha metade do
-- mundo — e a metade que ela deixa de olhar é a que tem peça física.
base_json   TEXT
```

Para `estoque_loja`, `base_json` guarda `{"qtd": 8, "consignado": 0}`.
Na aplicação, cada item passa por **duas** portas antes de virar escrita:

| Porta | Confere | Se não bater |
|---|---|---|
| destino | valor atual na loja `==` `de` | pula o item, grava o motivo em `erro` |
| origem | estado atual daqui `==` `base_json` | pula o item, grava o motivo em `erro` |

E nunca aproxima: item que não passa nas duas portas **não é aplicado**, e
aparece no `relato_json` como pulado, com a frase que explica. É a regra 2
do `CLAUDE.md` aplicada à aplicação em massa — não sabe, não escreve.

Uma coluna, nulável, aditiva. Para `produto_novo` ela pode ser `NULL`: a
origem é a planilha, que não muda sozinha (a precondição ali é outra — o SKU
continuar não existindo).

### O que fica de fora, e por quê

Um **fingerprint da sessão inteira** (hash do estado no momento da análise)
seria útil, mas resolve outro problema: permite dizer "esta prévia está
velha, rode de novo" **antes** de alguém gastar meia hora revisando 200
itens. É ganho de experiência, não de segurança — a porta por item é o que
protege peça. Fica recomendado, não obrigatório.

Uma **validade** (`expira_em`) tampouco substitui a conferência: uma prévia
de dois minutos atrás pode estar obsoleta, e uma de dois dias pode estar
perfeita se ninguém mexeu em nada. Tempo é um palpite; comparação é uma
resposta.

### Situação

**Nada disso foi implementado.** A recomendação é editar
`api/migracao-reconciliacao.sql` e `api/schema.sql` **no branch**, antes de
qualquer código de aplicação existir — a migration nunca rodou, então
acrescentar a coluna agora custa uma linha, e depois custaria uma segunda
migration.

## Invariantes que a fase seguinte não pode quebrar

Vale repetir aqui, porque um motor novo é exatamente onde elas correm risco:

1. `produtos.qtd == SUM(movimentos.qtd)`, sempre, sem exceção.
2. Puxar pedidos **antes** de empurrar estoque.
3. `vendas.externo_id` único — idempotência garantida pelo banco.
4. Nunca chutar a distribuição de uma variante.
5. A Nuvemshop é **destino** do estoque, não fonte da verdade do físico.
6. O que o sistema decidiu não fazer é **anunciado**, nunca engolido.
7. Nenhum caminho escreve `produtos.qtd` fora de `estoque.js › movimentar`.
8. Item aprovado só vira escrita se o mundo dos **dois** lados continuar
   igual ao que a pessoa aprovou. Não bateu, não aplica — e diz por quê.

## O que fazer antes de começar

1. Backup do D1 conferido — [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).
   **Feito**: `backups/d1/2026-08-18_06-22/`, reconferido em 2026-08-18
   carregando o dump num banco limpo — 16 tabelas, 782 produtos, razão com
   0 divergências, nenhum `externo_id` repetido. Vale como comprovação de
   que o backup funciona; **antes da migration de produção, tirar outro**,
   porque a loja escreve o dia inteiro.
2. Migrations sob controle — [TECH_DEBT.md](TECH_DEBT.md) item 1.
3. `e2e` rodando na máquina de desenvolvimento — item 3.
4. Baseline atualizado, para medir a mudança contra ele —
   [BASELINE.md](BASELINE.md).
5. Comportamento do dry-run provado, não presumido — `src/dry-run-test.mjs`
   e a tabela em [SYNC_ENGINE.md](SYNC_ENGINE.md). **Feito.** O motor será
   construído em cima dessa rodada; herdar uma suposição errada sobre ela
   seria herdar o problema inteiro.
6. Decidir sobre a coluna `base_json` acima. Depois que a migration rodar em
   produção, ela custa uma segunda migration.
7. Decidir sobre [TECH_DEBT.md](TECH_DEBT.md) item 12 — uma rodada seca
   apagando o rastro de uma rodada real que falhou. O motor vai gravar muito
   mais análises secas que o sistema de hoje.
