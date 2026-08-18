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

## Invariantes que a fase seguinte não pode quebrar

Vale repetir aqui, porque um motor novo é exatamente onde elas correm risco:

1. `produtos.qtd == SUM(movimentos.qtd)`, sempre, sem exceção.
2. Puxar pedidos **antes** de empurrar estoque.
3. `vendas.externo_id` único — idempotência garantida pelo banco.
4. Nunca chutar a distribuição de uma variante.
5. A Nuvemshop é **destino** do estoque, não fonte da verdade do físico.
6. O que o sistema decidiu não fazer é **anunciado**, nunca engolido.
7. Nenhum caminho escreve `produtos.qtd` fora de `estoque.js › movimentar`.

## O que fazer antes de começar

1. Backup do D1 conferido — [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).
2. Migrations sob controle — [TECH_DEBT.md](TECH_DEBT.md) item 1.
3. `e2e` rodando na máquina de desenvolvimento — item 3.
4. Baseline atualizado, para medir a mudança contra ele —
   [BASELINE.md](BASELINE.md).
