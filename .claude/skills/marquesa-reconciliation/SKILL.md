---
name: marquesa-reconciliation
description: Carregue quando a tarefa envolver divergência entre o estoque interno e a Nuvemshop, cadastro duplicado, SKU desconhecido em pedido, variação órfã, conflito de números, ou qualquer situação que precise de revisão humana antes de aplicar. Descreve como investigar hoje e para onde isso vai.
---

# Reconciliação

> **O motor de reconciliação não existe — só o schema.** As tabelas
> (`reconciliacao_sessoes`, `reconciliacao_itens`) estão desenhadas e
> testadas, mas nunca foram aplicadas em banco nenhum, e não há rota nem
> Apply. Esta skill diz como investigar divergências com o que existe hoje,
> e registra a direção combinada. Não construa o Apply sem que alguém peça —
> [docs/RECONCILIATION_ENGINE.md](../../../docs/RECONCILIATION_ENGINE.md)
> tem o fluxo completo; [docs/ROADMAP_RECONCILIATION.md](../../../docs/ROADMAP_RECONCILIATION.md)
> tem o histórico da decisão.

## Princípio

> Nunca adivinhe quando um conflito de dados puder representar peça física.

Diante de dois números que não batem, a resposta certa quase nunca é
escolher um. É **mostrar os dois e parar** — porque o desencontro não diz
onde está o erro, e a peça existe ou não existe independentemente do que o
sistema decidir.

O sistema já faz isso em três lugares, e vale imitá-los:

| Onde | O que faz em vez de adivinhar |
|---|---|
| `semearVariacoes` | soma da loja não bate → não reparte nada, e reporta os dois números |
| `POST /produtos/:sku/repartir` | soma não bate com o estoque → recusa e mostra os dois |
| Inventário | `concluir` só compara; `ajustar` exige confirmação por código |

## Como investigar hoje

**Primeiro comando, sempre:**

```
POST /api/sync {"seco": true}
```

Lê a loja inteira, calcula tudo, grava o retrato e o histórico, não escreve
nada na loja.

Depois, onde cada tipo de divergência aparece:

| Divergência | Onde ver |
|---|---|
| A razão não fecha | `GET /api/estoque/conferir` — devolve os SKUs em que `qtd ≠ SUM(movimentos.qtd)` |
| Por que este SKU mudou | `GET /api/estoque/:sku/movimentos` |
| Estoque nosso × estoque da loja | `relato.mudancas` da rodada seca |
| Código que não foi empurrado, e por quê | `relato.semEmpurrar` e `config.lojaVariacoes` (`duplicado` / `maleta` / `sem_reparticao`) |
| Cadastro duplicado na loja | `loja_snapshot.duplicados_json` |
| Variação que a loja tem e nós não repartimos | `relato.naoSemeados` — traz o total nosso e a soma da loja |
| Item de pedido sem par no catálogo | `relato.itensIgnorados` |
| O que o robô fez de madrugada | `GET /api/sync` — as últimas 20 rodadas com `detalhe_json` |

## Os tipos de conflito, e o que cada um significa

| Tipo | O que é | Adivinhar custa |
|---|---|---|
| **Duplicado** | Mesmo SKU em dois produtos da loja | Escrever o estoque inteiro num anúncio e zerar o outro |
| **Variação sem repartição** | O código tem variações, mas nem toda peça foi atribuída | Anunciar menos do que existe, ou anunciar aro que não existe |
| **Soma da loja ≠ nosso total** | A repartição da loja não é confiável | Reproduzir o bug antigo, que punha o total do código na primeira variação |
| **SKU desconhecido em pedido** | Houve venda de verdade que não virou movimento | Criar produto errado, ou perder a venda em silêncio |
| **Peça em maleta com variação** | A maleta não sabe qual variação saiu | Tirar do ar uma peça que está aqui |
| **Razão não fecha** | `qtd ≠ SUM(movimentos)` | **Nada aqui é normal.** É bug, e precisa da causa antes de qualquer correção |

O último é diferente dos outros: os cinco primeiros são o sistema sendo
honesto sobre o que não sabe. O sexto significa que algo escreveu
`produtos.qtd` fora de `movimentar`, ou que um batch entrou pela metade.
Ache a causa antes de corrigir o número.

## Como corrigir, quando for o caso

Sempre um ato humano, um código por vez, com a razão registrada:

| Correção | Rota | Recusa quando |
|---|---|---|
| Repartir entre variações | `POST /api/produtos/:sku/repartir` | a soma não bate com o estoque |
| Desfazer semeadura automática indevida | `POST /api/variacoes/desfazer-semeadura` | — |
| Ajustar contagem | `POST /api/inventarios/:id/ajustar` | o código já foi ajustado nesse inventário |
| Aplicar sincronização barrada pelo freio | `POST /api/sync {"forcar": true}` | — **Classe C**, exige autorização |

Nenhuma dessas rotas escreve `produtos.qtd`: todas passam por `movimentar`,
e a repartição gera dois movimentos que se anulam no total.

## Para onde isto vai

O fluxo combinado, com schema pronto mas **Apply ainda não implementado**:

```
ANALISAR → SESSÃO CONGELADA → REVISÃO → APROVAÇÃO
        → PRECONDITION DESTINO + PRECONDITION ORIGEM → APLICAR → VALIDAR → AUDITAR
```

As duas preconditions (destino: o valor lá fora ainda é o que a análise
viu? origem: o estado daqui que gerou a proposta ainda é o mesmo?) são o que
impede uma prévia velha de escrever sobre uma peça que já mudou de mão. Item
que não passa nas duas **não aplica** — vira `status = 'obsoleto'`, nunca
uma escrita por aproximação.

Detalhe completo do schema, das duas máquinas de estado e da idempotência em
[docs/RECONCILIATION_ENGINE.md](../../../docs/RECONCILIATION_ENGINE.md). Os
problemas que motivaram o desenho, e o histórico da decisão, em
[docs/ROADMAP_RECONCILIATION.md](../../../docs/ROADMAP_RECONCILIATION.md).
Se você for mexer em qualquer coisa desta área, leia antes: várias mudanças
"óbvias" andam na direção contrária.

## O que não fazer

- Não escreva `produtos.qtd` para "acertar" a divergência.
- Não escolha um dos dois números sozinho.
- Não apague `movimentos` para fazer a conta fechar.
- Não force uma sincronização para "resolver" um conflito que ninguém
  entendeu.
- Não trate a loja como fonte da verdade do estoque físico.
