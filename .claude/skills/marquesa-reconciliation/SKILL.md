---
name: marquesa-reconciliation
description: Carregue quando a tarefa envolver divergência entre o estoque interno e a Nuvemshop, cadastro duplicado, SKU desconhecido em pedido, variação órfã, conflito de números, ou qualquer situação que precise de revisão humana antes de aplicar. Descreve como investigar hoje e para onde isso vai.
---

# Reconciliação

> **O motor de reconciliação não existe.** Esta skill diz como investigar
> divergências com o que existe hoje, e registra a direção combinada. Não
> construa o motor sem que alguém peça —
> [docs/ROADMAP_RECONCILIATION.md](../../../docs/ROADMAP_RECONCILIATION.md).

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

O fluxo combinado, ainda não implementado:

```
ANALISAR → GERAR DIFF → CLASSIFICAR → SESSÃO DE REVISÃO
        → USUÁRIO APROVAR → APLICAR → VALIDAR → AUDITAR
```

Os sete problemas já identificados que ele resolve estão em
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
