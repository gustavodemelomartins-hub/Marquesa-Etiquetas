---
name: marquesa-safe-import
description: Carregue para tarefas de importação — CSV, planilha, XLSX, catálogo, estoque, importarProdutos, importarLoja, saldo inicial. Estabelece a sequência analisar → comparar → diff → validar → aplicar que qualquer mudança futura no importador deve seguir.
---

# Importação segura

> **Esta skill é instrução, não implementação.** O fluxo de prévia descrito
> aqui **ainda não existe**. Ele é o alvo de quem for mexer no importador, e
> não deve ser construído sem que alguém peça.

## Como está hoje

`index.js › importarProdutos`:

```
recebe produtos[]
  → monta os statements
  → db.batch()                     ← GRAVA
  → devolve { novos, ajustados, avisos[] }
```

Os avisos são honestos (§22: sinalizar, não corrigir em silêncio) — mas
chegam **depois** de o dado entrar. Uma planilha com uma coluna trocada vira
dezenas de movimentos de `ajuste` antes de qualquer pessoa ver.

Nada se perde: cada ajuste é um movimento rastreável, com a frase
`"Importação: planilha diz X, sistema tinha Y"`. Mas desfazer é trabalho.

`importarLoja` faz o equivalente para o CSV exportado da Nuvemshop. Desde a
sincronização automática, o retrato da loja é gravado pela própria rodada
(`sync.js › gravarRetratoDaLoja`) — o caminho por CSV existe, e é capaz de
subir números velhos por cima dos certos.

## A sequência que qualquer mudança futura deve seguir

```
ANALISAR   ler a planilha inteira sem tocar no banco
    ↓
COMPARAR   confrontar linha a linha com o catálogo atual
    ↓
DIFF       o que muda, item a item, com o número de antes e o de depois
    ↓
VALIDAR    classificar por risco; barrar o que não pode entrar sozinho
    ↓
APLICAR    só o que foi aprovado, num batch, com a razão registrada
```

Cada etapa só começa quando a anterior terminou. A prévia não é uma tela a
mais: é o que separa "sinalizar" de "sinalizar tarde demais".

## O que a análise precisa detectar antes de gravar

| Situação | Já tratada hoje | Como |
|---|---|---|
| SKU vazio | sim | aviso `sku_vazio`, linha pulada |
| Sem preço | sim | aviso `sem_preco`, `preco = NULL` (§24) |
| Categoria desconhecida | sim | aviso `categoria_desconhecida`, cai em "Outros" |
| SKU com sufixo (`486476-2`) | sim, na consolidação | soma no código-base **e anuncia**; recusa juntar quando as descrições divergem |
| Números são total ou só o que está em casa? | sim, pela tela | é o que `src/import-casa-test.mjs` prova |
| Ajuste grande de quantidade | **não** | hoje entra direto, só vira aviso depois |
| Planilha que zera muitos códigos | **não** | não existe freio na importação, diferente da sincronização |
| Produto que sumiu da planilha | **não** | não é tocado — e isso está certo |

As três lacunas são o motivo de a sequência acima existir.

## Regras que a importação nunca pode quebrar

1. **A quantidade da planilha é um saldo-alvo, e a diferença vira
   `movimento` de `ajuste`** com origem `importacao` e a frase explicando os
   dois números. Nunca um `UPDATE` direto em `produtos.qtd`.
2. **Sem preço é `NULL`, nunca 0.**
3. **Consolidação de sufixo é anunciada**, e recusada quando as descrições
   divergem.
4. **Produto que não está na planilha não é apagado nem zerado.** Ausência
   não é informação.
5. **Se a planilha contou só a prateleira**, comparar contra o total corta a
   peça que está em maleta. A tela pergunta qual dos dois é — e o teste
   `import-casa-test.mjs` existe exatamente para isso.
6. **A razão fecha no fim.** `GET /api/estoque/conferir` vazio.

## Antes de mexer no importador

1. Leia a regra 1 do [api/REGRAS.md](../../../api/REGRAS.md) — SKU com
   sufixo. É a decisão mais sutil desta área.
2. Leia `index.js › importarProdutos` inteira (é curta).
3. Rode `src/import-casa-test.mjs` se estiver num ambiente que suporta
   Playwright — hoje o Windows não suporta, ver
   [docs/TESTING.md](../../../docs/TESTING.md).
4. Se for construir a prévia: o formato de diff da sincronização
   (`relato.mudancas` com `{sku, desc, de, para, zera}`) já existe e já é
   exibido pela tela. Reaproveite em vez de inventar um segundo.

## Importação real em produção é Classe C

Escreve em massa. Exige backup do D1 antes — ver
[docs/BACKUP_RECOVERY.md](../../../docs/BACKUP_RECOVERY.md) — e autorização
humana explícita: [docs/SECURITY.md](../../../docs/SECURITY.md).

## Para onde isto vai

[docs/ROADMAP_RECONCILIATION.md](../../../docs/ROADMAP_RECONCILIATION.md),
item 2. A prévia da importação e a prévia da sincronização são o mesmo
problema e merecem o mesmo motor.
