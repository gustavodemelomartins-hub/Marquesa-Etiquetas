---
paths:
  - "api/src/**"
  - "frontend/src/**"
  - "src/dashboard.tpl.html"
  - "api/REGRAS.md"
---

# Regras de negócio que valem em qualquer camada

Fonte fundamental: **[api/REGRAS.md](../../api/REGRAS.md)**. Este arquivo não
a substitui — lista só o que costuma ser violado por engano e diz onde já
está implementado, para você não reescrever nada.

## Estoque

- A **planilha de Estoque Total é, temporariamente, a fonte máxima da verdade
  do estoque físico total**. Total = casa + revendedoras (não é só o que está
  na casa). Implementado em `frontend/src/features/estoque-total/` e
  `api/src/catalogo.js`.
- Importar Estoque Total é **reconciliação**: sempre diff/preview antes de
  aplicar. Nunca aplica direto. Procedimento: skill `marquesa-safe-import`.
- **Adicionar Peças Novas** insere SKU novo e **não altera quantidade
  existente**. Se a operação mexeria numa quantidade que já existe, ela não é
  "peça nova" — pare e mostre.
- Nenhuma alteração de estoque sem um movimento que a explique.

## Kits

**Fora do escopo atual.** Não crie automação nova para kit. Corrigir bug
existente, sim; ampliar comportamento, não — sem pedido humano explícito.

## Nuvemshop

- Destino do estoque, **não** fonte da verdade do físico.
- A análise de sincronização separa, em listas distintas: **pendências ·
  itens sem preço · duplicidades · conflitos**. Sem preço bloqueia
  publicação. Nada disso vira número silencioso.
- **Nenhuma sincronização destrutiva sem regra explícita.** Prefira
  `POST /api/sync {"seco": true}` — lê tudo, não escreve na loja.
- `{"forcar": true}` contra a loja real: autorização humana, sempre.

## Dados de DEV

`marquesa-db-dev` roda com os **dados reais destinados ao teste**. Seed
fictício serve para subir o schema, não para validar comportamento — não
mantenha dado inventado quando o teste for de verdade, e nunca conclua nada
sobre estoque real a partir de seed.
