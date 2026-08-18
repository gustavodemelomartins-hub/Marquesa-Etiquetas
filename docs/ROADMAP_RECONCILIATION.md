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

## Revisão do schema — histórico e estado atual

O schema passou por DUAS rodadas de trabalho, e vale registrar as duas: a
primeira encontrou os riscos, a segunda os resolveu.

**2026-08-18, primeira rodada** — auditoria do schema herdado do branch
`feature/motor-reconciliacao` (commit `23f9962`, nunca aplicado em banco
nenhum). Encontrou quatro riscos reais:

1. `reconciliacao_sessoes.status = 'aplicada'` não distinguia aplicação
   total de parcial.
2. Nada impedia duas sessões `revisao` abertas ao mesmo tempo.
3. `(sessao_id, sku, variacao, tipo)` era identidade só em comentário, não
   imposta pelo banco.
4. **O risco principal**: o schema só guardava `de` (o valor observado no
   DESTINO). Para `estoque_loja`, a proposta depende de DOIS mundos — a
   loja e o nosso saldo — e só um deles tinha uma precondição. Uma venda
   registrada entre a análise e a aplicação passaria pela conferência sem
   ser pega, e a loja ficaria anunciando peça que não existe mais.

Nada foi implementado nessa rodada — só diagnosticado, com a recomendação
explícita de resolver ANTES da migration rodar em qualquer lugar (ela
continuava não aplicada, então cada ajuste custava uma linha, não uma
segunda migration).

**2026-08-18, segunda rodada, mesmo dia** — os quatro riscos foram
resolvidos, e a resposta de cada um virou uma decisão registrada em
[RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md):

| Risco | Resolução |
|---|---|
| Estado de sessão ambíguo | Máquina de 7 estados, com `aplicada_parcial` e `superada` |
| Sessões concorrentes | Índice único parcial: no máximo uma `revisao` por origem |
| Identidade não imposta | `idx_rec_itens_unico`, com coluna gerada para o caso `variacao IS NULL` |
| Precondição só do destino | Coluna `base_json` — a precondição de ORIGEM, documentada por `tipo` |

Provado por `src/reconciliacao-schema-test.mjs` (65 asserções: migration
sobre o schema real de antes desta fase, unicidade incluindo `NULL`, os dois
`CHECK`, idempotência, e nenhum dado nem tabela anterior perdido).

O detalhe técnico completo — o que `de`/`para`/`base_json` significam, as
duas máquinas de estado, a decisão sobre concorrência, a idempotência do
Apply — mora em [RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md) e não
é repetido aqui, para as duas versões não desencontrarem.

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
6. Decidir sobre a coluna `base_json`. **Feito em 2026-08-18** — existe,
   documentada por `tipo` em [RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md),
   antes de a migration ter rodado em qualquer lugar.
7. Decidir sobre [TECH_DEBT.md](TECH_DEBT.md) item 12 — uma rodada seca
   apagando o rastro de uma rodada real que falhou. **Feito em
   2026-08-18** — `sync_execucoes.seco`, `resumoSync` filtrando por ela,
   provado em `src/saude-sync-test.mjs`. O motor vai gravar muito mais
   análises secas que o sistema de hoje, e cada uma delas agora é inofensiva
   para a leitura de saúde.
8. Fechar a unicidade de `reconciliacao_itens` e a máquina de estados das
   duas tabelas. **Feito em 2026-08-18** — ver
   [RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md).
9. Decidir o mecanismo de sessões concorrentes. **Feito em 2026-08-18** —
   índice único parcial (`origem` + `status='revisao'`), preconditions por
   item cobrindo o resto. Sem lock distribuído.
