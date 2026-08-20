---
name: inventory
description: Carregue para tarefas de ESTOQUE e CATÁLOGO — cadastro de produto, adicionar peças novas, quantidades, saldo, foto da peça, planilha de Estoque Total, contagem/inventário físico. Diz a sequência e onde cada peça do fluxo mora. Para o mecanismo do importador em si, use marquesa-safe-import.
---

# Estoque e catálogo

Esta skill é o **roteiro**. As regras estão em
[api/REGRAS.md](../../../api/REGRAS.md) e em
`.claude/rules/business-rules.md` — não as reescreva aqui.

## Onde as coisas moram

```
api/src/estoque.js      movimentar (único caminho que muda saldo), saldos, conferir
api/src/catalogo.js     cadastro, peças novas, importação de catálogo
api/src/inventario.js   contagem física
api/src/fotos.js        metadados da foto · fotos-storage.js  bytes no R2
frontend/src/features/estoque/         tela de estoque
frontend/src/features/estoque-total/   importação da planilha, preview e diff
```

## Sequência obrigatória

1. **Ler antes de escrever.** Qual é o saldo hoje? Que movimentos explicam?
2. **Classificar a operação** antes de tocar em qualquer número:

   | Intenção | Efeito permitido |
   |---|---|
   | Adicionar Peças Novas | insere SKU novo · **não** mexe em quantidade existente |
   | Importar Estoque Total | reconcilia total (casa + revendedoras) · exige diff/preview |
   | Movimento operacional | passa por `movimentar`, com origem declarada |

   Se a operação não cabe numa dessas, ela não está pronta para rodar.
3. **Diff antes de aplicar.** Quantos SKUs entram, quantos mudam, quantos
   somem. Número que muda sem explicação é bug, não resultado.
4. **Aplicar** só depois do diff visto.
5. **Conferir a razão**: `GET /api/estoque/conferir` tem que voltar vazio.

## Foto

A foto é o **primeiro item/coluna** de qualquer listagem de estoque. Bytes
vão para o R2 (`marquesa-fotos-dev` no DEV); o D1 guarda só a chave.

## Pare e pergunte quando

- a distribuição entre variações do mesmo código for ambígua;
- a planilha trouxer SKU que já existe com quantidade diferente e a operação
  for "peças novas";
- houver peça física em jogo e mais de uma leitura possível dos dados.
