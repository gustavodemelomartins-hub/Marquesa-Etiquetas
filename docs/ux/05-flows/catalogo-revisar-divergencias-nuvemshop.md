# Fluxo: Revisar divergências entre Marquesa e Nuvemshop

**Quem:** perfil autorizado de catálogo/sincronização  
**Começa em:** Catálogo → Divergências Nuvemshop  
**Termina em:** diagnóstico entendido, sem correção automática inventada

## Passos

| # | Ação | Contrato | Resultado | Escreve? |
|---:|---|---|---|---|
| 1 | analisar próxima sincronização | `POST /api/sync/analisar` | mudanças previstas, produtos só na loja e candidatos | segue a semântica seca do contrato |
| 2 | revisar decisões de não empurrar | `semEmpurrar[]` | motivo por peça | não |
| 3 | consultar preço local × loja | `GET /api/catalogo/precos/divergentes` | lista de divergências | não |
| 4 | abrir produto local relacionado | navegação da UX | contexto para decisão humana | não |

## Onde pode parar

| Situação | Tratamento |
|---|---|
| produto só na loja | mostrar como candidato; não oferecer criação sem contrato |
| item em `semEmpurrar[]` | explicar o que o sistema decidiu não fazer |
| preço divergente | mostrar os dois valores; não escolher nem corrigir automaticamente |
| publicado observado | usar “Está na loja” quando `estadoObservado: true` |

## Invariantes

- presença na loja é fato observado, não aprovação;
- preço divergente não é corrigido automaticamente;
- produto candidato não ganha CTA sem rota autorizada;
- análise não é publicação.

