# Regras de negócio — Personalização

A fonte da regra é [api/REGRAS.md](../../../../api/REGRAS.md). Este arquivo só
registra **como esta tela expõe a regra** e onde a tela impõe restrição própria.
Divergência entre os dois: o `REGRAS.md` vence, e a divergência vira linha em
[open-questions.md](open-questions.md).

## Regras herdadas que a tela deve respeitar

| Regra | Fonte | Consequência na tela | Confirmado? |
|---|---|---|---|
| modelo comercial, base física e componentes são identidades diferentes | `api/REGRAS.md` §42 e Canonical Produtos Montáveis | mostrar o modelo ao cliente sem esconder quais peças físicas serão baixadas | sim |
| disponibilidade depende da base e de todos os componentes | `api/REGRAS.md` §42 | mostrar somente composição possível e identificar o componente limitante | sim |
| preço é da composição inteira, não soma de peças avulsas | `api/REGRAS.md` §42 | botão Adicionar à venda usa o preço do modelo; composição livre é caso separado | sim |
| configuração é congelada na venda | `api/REGRAS.md` §42 | detalhe futuro preserva modelo, posições, SKUs e variantes escolhidas | sim |
| baixa base e componentes exatamente uma vez | `api/REGRAS.md` §42 | finalização é atômica e não reutiliza baixa de kit em duplicidade | sim |
| cancelamento devolve toda a composição | `api/REGRAS.md` §42 | estorno precisa inverter base e cada componente, preservando variantes | sim |
| slots do mesmo grupo podem repetir o mesmo SKU/cor | Gustavo, 10/09/2026 | cada posição continua independente; Verde + Verde e Rosa Claro + Rosa Claro são escolhas válidas | sim |
| disponibilidade de SKU repetido considera a quantidade total exigida na composição | Gustavo, 10/09/2026 | se duas posições usam o mesmo SKU, a conclusão exige pelo menos duas unidades elegíveis | sim |

## Restrições próprias da tela

Regra que existe por causa da interface, não do domínio — ordenação padrão,
limite de itens por página, o que não pode ser editado inline.

| # | Restrição | Motivo | Confirmado? |
|---|---|---|---|
| UX-PER-001 | seleção usa passos reais: primeiro modelo, depois cada posição da composição | modelos com mais de uma criança exigem escolhas independentes | conceito confirmado; interação detalhada aberta |
| UX-PER-002 | trocar/cancelar a personalização volta ao rascunho sem apagar os demais dados da venda | evitar perda acidental do trabalho | a confirmar com Gustavo |
| UX-PER-003 | selecionar uma cor em um slot não desabilita essa mesma cor nos demais slots; o bloqueio depende do saldo agregado necessário | repetição é válida quando existe quantidade suficiente | sim · Gustavo, 10/09/2026 |

## Permissões

Quem pode ver e quem pode escrever nesta tela: — ainda não definido —
