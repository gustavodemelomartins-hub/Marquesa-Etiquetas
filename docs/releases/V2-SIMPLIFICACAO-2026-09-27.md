# V2 · Navegação simplificada — 27/09/2026

A Sthefany testou a V2 e achou o sistema confuso de mexer. A auditoria foi
feita usando o sistema como uma pessoa usaria — venda, busca, cadastro,
recebimento, garantia, maleta —, no notebook (1366px) e no celular (390px),
sobre a cópia dos dados reais de produção (26/09 21:10 UTC). Sem escrita
em produção durante a auditoria.

## O que está no ar

| | valor |
|---|---|
| Commit | `3729825` (`develop`) |
| Worker PROD | `marquesa-api` · versão `963cd6dc-657d-4493-aa36-17232e418311` |
| Worker anterior (rollback) | `bcc6840f-4732-4426-9f7c-9a204ed6f89d` |
| Pages PROD | projeto `marquesa` · deployment `06bac417` |
| Pages anterior (rollback) | `03b7d3c8-2c35-4287-a2a2-b98fd5ab3675` |
| Endereço | https://marquesa-9da.pages.dev/v2/ |
| Schema / dados / flags | inalterados · Nuvemshop não tocada |

## O que a auditoria achou

1. **Menu com 13 itens**, três levando a "Em desenvolvimento" (Etiquetas,
   Agenda, Notificações). O sino mostrava "99+" e levava a uma dessas.
2. **Estoque, Catálogo e Nuvemshop misturados.** Duas abas do Estoque
   pulavam para outros módulos e levavam as abas junto; a Nuvemshop tinha
   três níveis de abas.
3. **Visão geral do Estoque interminável:** 78 mil pixels no notebook,
   304 mil no celular — a importação por planilha ficava depois da lista
   das 987 peças.
4. **Nenhuma ficha da peça.** Quantidade numa tela, preço noutra,
   variações noutra. A busca do topo levava à lista inteira.
5. **Três números de "pendências"** (Home 415, Nuvemshop 715, Estoque 355)
   e nenhuma tela que listasse as 415.
6. **Texto de programador** na tela: `POST /api/vendas/:id/pagamento`,
   "decisão D2", "§24", "backend", "invariantes", "Data e hora ISO".
7. **Repetição:** gráficos da Home iguais aos do Financeiro; botões do
   painel de vendas repetindo as abas; "Peças por maleta" em dois lugares.
8. **Clientes parava em 100** (de 353) dizendo "100 clientes"; na venda, o
   notebook mostrava um resultado de busca só.

## O que mudou

- **Menu:** Início, Vendas, Clientes, Financeiro · Peças, Loja online ·
  Revendedoras, Garantias · Configurações. Endereços antigos redirecionam
  (`#/catalogo` → Peças, `#/notificacoes` → Pendências, `#/agenda` →
  Revendedoras, `#/estoque/pendencias` → Loja online).
- **Peças** (estoque + catálogo): lista única com 60 por vez, ficha da
  peça (onde está, cadastro, variações, histórico), abas Resumo / Entrada
  de peças / Inventário. A busca do topo abre a ficha.
- **Início:** quatro ações rápidas (Nova venda, Receber pagamento, A peça
  voltou, Nova maleta) e a **central de pendências**, que o sino abre.
- **Vendas** abre pronta para vender; Vendas feitas e Relatório são abas.
- **Financeiro** abre em A receber; a Conferência das contas foi para
  Configurações › Avançado e só roda quando aberta.
- **Loja online:** Situação da loja · Publicar peças.
- **API:** `GET /api/clientes` aceita `limite` até 2000 (era 100); o padrão
  continua 25 e nenhum chamador existente muda.

## Provas

- 421/421 testes do painel novo; build com typecheck.
- `v2-paridade-e2e` 66/66 (roteiro atualizado para a navegação nova).
- Roteiro de uso humano, notebook e 390px, sobre a cópia real: 67/67 —
  inclui venda registrada nos dois tamanhos com `GET /api/estoque/conferir`
  vazio depois, edição de preço pela ficha e volta ao valor original.
- `v2-revendedoras-historico-smoke`, `v2-smoke-operacional` e
  `v2-cadastro-persistencia` sem falhas sobre a cópia real.
- Pós-deploy: `/api/health` ok; rotas protegidas 401 sem chave; bundle
  publicado contém as telas novas; `v2-publicado-smoke` 6/7 (a sétima é a
  trava de DEV, que não vale para PROD — igual à publicação anterior).

## Testes desatualizados encontrados (não eram desta mudança)

- `v2-smoke-operacional`: os seletores do progresso do inventário e a
  confirmação por `confirm()` estavam desatualizados desde `4399bfe`; o
  roteiro travava antes desta mudança. Corrigidos aqui.
- `vendas-clientes-ui-test` (painel clássico): 3 falhas sobre blocos do
  painel de vendas clássico, que esta mudança não tocou.

## Como voltar

| camada | comando |
|---|---|
| Worker | `cd api && npx wrangler rollback bcc6840f-4732-4426-9f7c-9a204ed6f89d` |
| frontend | painel Pages `marquesa` → deployment `03b7d3c8` → *Rollback* |
| dados | nada a voltar: esta publicação não escreve |

## Fora desta rodada

| o quê | por quê |
|---|---|
| Olhar as telas com a chave em PROD | a chave não é legível pelo agente |
| Resolver pendências de variação/vínculo/venda travada na V2 | a central lista e leva ao painel clássico, que tem os botões de resolver |
| Monte seu Colar, acerto de maleta completo, importação por planilha | não exercitados ponta a ponta nesta rodada |
| Etiquetas na V2 | não há rota de etiquetas no Worker; o botão abre o painel clássico |
