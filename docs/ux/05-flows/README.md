# Fluxos

Percurso do usuário **entre** telas. Uma tela isolada não mostra onde o
trabalho começa e termina; o fluxo mostra.

Um arquivo por fluxo: `<nome-do-fluxo>.md`. Imagens do fluxo ficam nesta pasta,
nome `AAAA-MM-DD_fluxo-<nome>_<sequencia>.<ext>`.

## Fluxos registrados

| Fluxo | Arquivo | Telas envolvidas | Estado |
|---|---|---|---|
| | | | |

## Modelo de arquivo de fluxo

```markdown
# Fluxo: <nome>

**Quem:** <perfil>
**Começa em:** <tela / evento>
**Termina em:** <resultado observável>

## Passos
| # | Onde | Ação | Resultado | Escreve no banco? |
|---|---|---|---|---|

## Onde pode falhar
| Ponto | Falha | O que o usuário vê | Recuperação |
|---|---|---|---|

## Decisões abertas
```

A coluna **"escreve no banco?"** é obrigatória. Fluxo que move estoque ou
dinheiro tem regra de idempotência e razão contábil a respeitar
([api/REGRAS.md](../../../api/REGRAS.md)); marcar o passo agora evita descobrir
isso só na implementação.

Candidatos óbvios, ainda não escritos: venda no balcão, saída de maleta e
acerto, entrada de peça nova, pedido chegando da Nuvemshop, reparo, peça
personalizada.
