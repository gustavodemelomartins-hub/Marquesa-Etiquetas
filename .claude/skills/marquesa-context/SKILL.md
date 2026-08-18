---
name: marquesa-context
description: Carregue quando a tarefa depender de entender uma REGRA DE NEGÓCIO da Marquesa — estoque, razão contábil, maleta, consignação, acerto, comissão, revendedora, inventário, kit, variação, categoria, preço. Aponta para a fonte certa em vez de repetir o conteúdo dela.
---

# Contexto de negócio da Marquesa

Esta skill **não contém** as regras. Ela diz onde elas moram e o que não
pode ser quebrado, para você carregar só o pedaço necessário.

## A fonte fundamental

**[api/REGRAS.md](../../../api/REGRAS.md)** — decisões de negócio com as
justificativas históricas. Tem duas partes:

1. uma **tabela de referência cruzada** ligando cada regra ao lugar do
   código que a implementa;
2. as **divergências conscientes** — onde a implementação se afasta do
   documento original de contexto, e por quê. É a parte mais valiosa: cada
   uma existe porque seguir a regra à risca causaria um problema real,
   medido nos dados de verdade.

Leia a tabela primeiro. Ela geralmente já diz qual arquivo abrir, e evita
carregar as 289 linhas inteiras.

Índice das divergências, para você saltar direto:

| Assunto | Seção do REGRAS.md |
|---|---|
| SKU com sufixo (`486476-2`) consolida no código-base | 1 |
| Categoria derivada da descrição | 2 |
| Inventário sugere, não aplica | 3 |
| A sincronização tem duas mãos, nesta ordem | 4 |
| Kit não tem saldo próprio | 5 |
| Quem lê a loja é quem grava o retrato dela | 6 |
| Variação não é cadastro duplicado | 7 |
| Repartir entre variações é automático, mas só uma vez | 8 |
| Faixa de comissão pelas banhadas — **pendente de conferência no contrato** | fim do arquivo |

## As cinco coisas que nunca podem ser quebradas

1. **`produtos.qtd == SUM(movimentos.qtd)`**, para todo SKU, sempre.
   Todo caminho passa por `estoque.js › movimentar`. Nunca escreva
   `produtos.qtd` direto. `GET /api/estoque/conferir` prova a igualdade.
2. **Consignação não é venda.** Movimento `consignacao` e `devolucao` têm
   efeito **0** no total: a peça mudou de lugar, não de dono.
3. **Nada é apagado.** Revendedora arquiva, maleta cancela, venda estorna.
4. **Produto sem preço é `NULL`, nunca R$ 0.** Venda é bloqueada.
5. **Sinalizar em vez de corrigir em silêncio.** Importação devolve
   `avisos[]`; inventário compara e só ajusta com confirmação; a
   sincronização anuncia o que decidiu não fazer.

## Vocabulário

O código é em português. Traduções que evitam busca errada:

| Termo | O que é |
|---|---|
| **movimento** | Uma linha da razão contábil. Tem tipo, quantidade assinada, origem |
| **saldo total** | `produtos.qtd`. Inclui o que está em maleta |
| **consignado** | O que está em maleta `aberta` ou `em_acerto` |
| **disponível** | total − consignado. Para kit, é calculado dos componentes |
| **em casa** | O mesmo que disponível, no vocabulário da sincronização |
| **maleta** | Uma remessa consignada a uma revendedora |
| **acerto** | O fechamento da maleta. O não devolvido vira venda |
| **variação** | Aro do anel, comprimento da corrente. Mesma etiqueta, estoque separado |
| **kit** | SKU montado de outros. Nunca tem saldo próprio |
| **repartir** | Distribuir o total de um código entre as variações dele |
| **semear** | Repartir automaticamente, a partir do que a loja informa |
| **freio** | O limite que pausa uma sincronização grande demais |
| **seco** | Dry-run |

## Onde procurar depois

| Pergunta | Documento |
|---|---|
| Que tabelas existem e por quê | [docs/DATA_MODEL.md](../../../docs/DATA_MODEL.md) |
| Como as peças se encaixam | [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) |
| Nuvemshop | skill `marquesa-sync` |
| O que cada teste prova | [docs/TESTING.md](../../../docs/TESTING.md) |

## Como trabalhar com estas regras

1. **Antes de mudar comportamento, ache a regra.** Se a tabela do
   `REGRAS.md` cita o arquivo que você vai mexer, leia a linha dela.
2. **Se a mudança contraria uma regra, pare e diga qual.** As divergências
   conscientes existem porque alguém já mediu o custo de fazer diferente.
3. **Se a regra não existe, também diga.** Uma decisão nova de negócio é da
   pessoa, não sua.
4. **Não copie o `REGRAS.md`** para outro documento. Uma regra, uma fonte.
5. **Toda mudança de estoque termina com a razão fechando.** Se o seu teste
   não confere `/api/estoque/conferir`, ele não terminou.
