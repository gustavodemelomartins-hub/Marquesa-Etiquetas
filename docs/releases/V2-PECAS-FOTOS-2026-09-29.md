# V2 — Peças + fotos + R2, em produção (29/09/2026)

## O que mudou para quem usa

- Tocar numa peça abre a **ficha em página própria**: cabeçalho (foto, nome, SKU,
  categoria, situação, preço, total/em casa/revendedoras/loja) e abas Visão geral,
  **Fotos**, Estoque, Histórico, Loja online.
- **Fotos**: todas as fotos da peça, ampliar, definir principal, arrastar para ordenar
  (e botões Para o início / Antes / Depois no celular), adicionar várias de uma vez,
  remover, "De onde veio esta foto", e **Buscar fotos na loja online**.
- **Peças › Importar fotos da Nuvemshop** (topo, ao lado de "Novo produto"): lê a loja,
  mostra as contas antes, e importa em lotes com barra de progresso.
- Lista com a foto principal real, selo de quantas fotos, **Lista | Galeria**, e filtros
  de foto; "Cadastro incompleto" mostra e filtra "Sem foto / Sem categoria / Sem preço".
- A tela antiga "Procurar fotos na loja online" (Início › Pendências) virou atalho para a
  importação nova.
- **Correção:** Vendas feitas mostrava "a receber" 100× maior (R$ 504,00 → R$ 50.400,00):
  o número vem em centavos e era lido como reais.
- **Correção:** diálogos largos (Novo produto, Importar fotos) ficavam por baixo do menu
  lateral no computador.

Desenho: `docs/domains/GALERIA-FOTOS-PECAS.md`.

## Publicação

| | Novo | Rollback |
|---|---|---|
| Commits (`develop`) | `4fe7702` fix(vendas) · `5d274fd` feat(pecas) | `726393e` |
| Worker `marquesa-api` | `61af653a-2c91-4711-95df-8bf7fdaa220b` | `6a7b4f3b-5f7d-40db-9ce9-6e8f98213956` |
| Pages `marquesa` | `a3367515` | `085b5130` |
| D1 `marquesa-db-prod` | `migracao-galeria-fotos.sql` aplicada | bookmark `00000152-00000000-000050f6-1099926967d694d8f4d8c198e46ef937` |

Migration aditiva (9 colunas em `produto_fotos`, 2 índices). Antes e depois: 987 produtos,
2.721 movimentos, 19 vendas, 0 fotos, razão com 0 divergências. Cron continua `[]`;
nenhuma variável ou segredo novo. CORS passou a aceitar `X-Arquivo, X-Largura, X-Altura,
X-Principal` (sem isso o navegador barrava o upload).

Smoke publicado (sem chave): `/api/health` ok; preflight devolve os cabeçalhos novos;
`/api/galeria/:id/:versao` sem assinatura → 401; rotas novas sem chave → 401;
`v2-publicado-smoke.mjs` 6/7 (a 7ª acusa, por desenho, que o endereço sugerido é o de
produção — correto aqui).

## Provas locais

galeria-fotos-test 29 · catalogo-4-5 26 · frontend 473 · v2-galeria-e2e 58 (1280/390 px) ·
v2-paridade-e2e 66 · gates `fast` 11/11 · `domain` 6/6 · contratos 191 (4 sem Bearer).

## Pré-análise da migração de fotos (só contagens do espelho de 06/09)

610 anúncios · 593 com um código que casa · 15 juntam vários códigos (sem vínculo
gravado: fotos presas a variação casam, as soltas vão para "Precisa revisar") · 2 sem
correspondência · 0 códigos em dois anúncios · 629 peças com foto da CDN anotada.

## O que falta — ação humana

A importação real exige o token da Nuvemshop, que só o Worker publicado tem, e a
`API_KEY`, que o agente não tem. Em Peças › **Importar fotos da Nuvemshop**: ler a
análise (é o dry-run), conferir "Precisa revisar", e tocar em **Iniciar importação**.
