# V2 — catálogo oculto na Nuvemshop, auditoria das variações e Preparação (09/10/2026)

REGRAS §62. Produção = Worker `marquesa-api` + D1 `marquesa-db-prod` +
Pages `marquesa` (servido em `marquesa-9da.pages.dev`, que **é** produção).

## 1. Antes

- Estoque online pela fila (§61) em produção desde 08/10: 590/590 variantes
  mapeadas iguais. Conferência fresca de 09/10 04:31 UTC: loja com 598
  produtos / 675 variantes — idêntica à de 08/10 (nenhuma variante nova
  criada no painel da Nuvemshop desde então).
- O sistema não criava produto na loja. 334 códigos com peça em casa e sem
  anúncio; 17 só com peça em maleta.
- 40 variações criadas AQUI (Peças › Variações, origem `local`) em 32 códigos,
  nenhuma com id da loja.

## 2. O que mudou

Ver §62. Em uma frase: peça com estrutura segura nasce na Nuvemshop como
`hidden` (id, variantes, SKU, estoque, texto, SEO, categoria de mesmo nome),
recebe estoque pela fila de §61, e só fica `visible` pelo clique em
"Publicar na Nuvemshop", que confere tudo na própria loja antes.

- `api/src/catalogo/nuvemshop-catalogo.js` — classificar, criar oculto
  (lote, reserva, adoção, conferência de `hidden`), variante faltante em
  anúncio existente, foto que entra depois, publicar, estado pela leitura.
- `api/src/catalogo/texto-site.js` — a regra editorial de 08/10 aplicada ao
  nome cadastrado; "Precisa de informação" em vez de texto genérico.
- `api/src/sync.js` — variante única na loja + estoque repartido aqui: manda
  só o saldo da variação equivalente (o 391471 ia com 2 para o aro 18 que tem 1).
- `api/src/variantes.js` — movimento com id `local:…` conta pelo nome.
- `api/src/nuvemshop-estoque.js` — conferência grava visibilidade e nº de
  categorias; cron aceita `catalogo`, `catalogo_variantes`, `catalogo_fotos`
  em `config.nuvemshopPedidoAdmin` e, com o catálogo ligado e a fila ociosa,
  cria até 5 ocultos (ou sobe 2 fotos) por rodada.
- Preparação para Nuvemshop: abas Não cadastrados · Ocultos em preparação ·
  Prontos para publicar · Publicados · Com erro; chips por pendência; card com
  ✓ ✕ ⚠; "Publicar na Nuvemshop" com confirmação; detalhe técnico recolhido.
- Migration `api/migracao-nuvemshop-catalogo.sql` (tabela
  `nuvemshop_catalogo`, `produtos.visibilidade_loja`,
  `nuvemshop_conferencia.ns_categorias`).

## 3. Travas e rollback

- Kill switch do catálogo: `UPDATE config SET valor='false' WHERE chave='nuvemshopCatalogoAtivo'`
  (ou `PUT /api/nuvemshop/catalogo/automatico {"ativo": false}`). O estoque de
  §61 não depende dele.
- Produto criado oculto que precise sair: ele já não aparece; apagar na loja é
  decisão humana (Classe D) — a lista está em `nuvemshop_catalogo` (`origem = 'criado'`).
- Rollback de código: Worker e Pages anteriores (ver § 4). Rollback do banco:
  `api/migracao-nuvemshop-catalogo-rollback.sql` (não apaga nada na loja).

## 4. Execução em produção (UTC, 09/10/2026)

| hora | passo |
|---|---|
| 04:27 | export de auditoria (scratchpad) · conferência fresca só de leitura: loja igual a 08/10 (598 / 675) |
| 05:17 | export de backup antes da migration (2.868 movimentos) · bookmark `00000286-00000000-000050ff-8f541bf969b287224defd6a76d3ff23a` |
| 05:18 | migration `api/migracao-nuvemshop-catalogo.sql` (64 tabelas) |
| 05:18 | Worker `353a22aa` · Pages `c7ac41a9` |
| 05:21 | 1ª conferência com o Worker novo: 590 mapeadas, 589 iguais + **391471 divergente (loja 2, certo 1)**; API devolve `visibility`: 97 hidden, 520 visible, 0 unlisted |
| 05:31 | `nuvemshopCatalogoAtivo` = true · **canário** 100633 → produto 373141783 `hidden`; vitrine `/produtos/brinco-curvado-zirconias-banho-de-ouro-18k-16p8h/` = **404**; fora da busca; estoque 1 |
| 05:51 | rodada normal: 37 códigos, 36 já iguais, **391471 enviado 2 → 1** |
| 05:42–08:04 | 7 lotes de 35 (alternando com rodadas normais de estoque): 280 criados, 0 erros, ~40 chamadas à loja por lote |
| 08:20 | lote 8 morreu por **`exceededCpu`** (ler a loja inteira, já com ~850 produtos) depois de criar os produtos e antes de gravar |
| 08:38 | Worker `abfcba49`: dedup por SKU antes de cada POST, sem ler a loja inteira |
| 08:41 / 09:00 / 09:11 | 25 **adotados** (os do lote que morreu — nenhum duplicado) + 22 criados; CPU 50–152 ms, `ok` |
| 09:01 | conferência diária: 911 iguais, 0 divergentes |
| 09:20 | 8 variantes criadas em 7 anéis (estoque 0, grafia das irmãs), 0 erros |
| 09:51 | **conferência final: 926 produtos / 1.011 variantes; 918 iguais, 0 divergentes** |

Rollback: Worker `15f0cb8d` (anterior a tudo) ou `353a22aa` (antes da dedup por
SKU) · Pages `e2b26ca3` · D1 bookmark `00000286-…` ou
`api/migracao-nuvemshop-catalogo-rollback.sql`. O rollback do banco não apaga
nada na loja: os 328 ocultos criados estão listados em `nuvemshop_catalogo`
(`origem = 'criado'`) e não aparecem nem são compráveis.

## 5. Números

### 5.1 Variações

- Códigos com variação: **52** (27 com 2+ variantes na loja; 32 com variação
  criada aqui; alguns nos dois). Variações no Marquesa: 40 criadas aqui + as
  83 variantes da loja dos 27 códigos. Na loja: 675 variantes antes, 1.011
  depois (328 produtos novos + 8 variantes novas).
- Já certas: as 590 variantes mapeadas de 08/10 continuam iguais (o 391471
  passou a receber o número certo, 1).
- Das 40 variações criadas aqui:
  - **21 já existiam na loja** com outro nome ("nº18" × "Banho de Ouro 18k ·
    n°18") — o sistema as pareia por equivalência (§58), nada a gravar; 1
    delas é **duplicada** (256359 nº23 × N°23 da loja);
  - **8 criadas hoje na loja** (anéis 218178, 235290 ×2, 275922, 315220,
    377535, 381783 ×2), estoque 0, e a variação daqui ganhou o id de lá;
  - **11 continuam só no Marquesa** (lista abaixo).
- Intervenção ainda necessária: os 27 códigos de 08/10 (19 com peça em maleta
  sem dizer a variação, 8 com estoque não repartido) + as 11 abaixo.

**Todas as variações criadas pela Sthefany estão na Nuvemshop? NÃO.** Faltam 11:

| Código | Peça | Variação daqui | Por que não subiu |
|---|---|---|---|
| 162190 | Brinco Infantil Zircônia e Coração | Azul, Cristal, Vermelho | cor gravada no atributo "Tamanho"; produto não cadastrado |
| 194149 | Brinco Coração Pendurado Colorido Infantil | Vermelho | anúncio de variante única (Cristal); estoque não repartido |
| 198242 | Brinco Coração Pendurado Chapa Infantil | Pink | anúncio de variante única (Cristal); estoque não repartido |
| 391471 | Anel Coração Vazado Cravejado | nº24 | anúncio de variante única (n°18); saldo já repartido — falta criar a opção lá |
| 408061 | Anel Aparador de Aliança | nº19 | anúncio de variante única (n°21); estoque não repartido |
| 334078 | Anel Solitário Coroa 5mm … nº27 | nº27 | é o aro 27 do 334079, que a loja já tem — decidir |
| 519177 | Aparador de Aliança | nº19 | mesmo modelo de 408061/283680 — decidir |
| 318522 | Brinco Ponto de Luz Roxo | Roxo | cor no atributo "Tamanho"; produto não cadastrado |
| 318524 | Brinco Ponto de Luz Verde | Verde | a loja tem "Verde Esmeralda" — confirmar se é a mesma |

Os 27 códigos de 08/10, separando (A) de (B), e as tabelas de anéis e
brincos infantis estão nos Anexos A e B.

### 5.2 Catálogo oculto

- Ocultos que já existiam: **97** (nenhum "não listado").
- Criados ocultos: **328** (inclui os 17 que só tinham peça em maleta: nascem
  com estoque 0). 311 com estoque > 0, 724 peças; 164 sem preço (criados SEM
  preço, "falta preço"); 0 com variação (os 4 candidatos com variação ficaram
  bloqueados, ver acima).
- Adotados (já estavam na loja): 25 — todos do lote que morreu às 08:20.
- Atualizados: 0 (nenhum anúncio que já existia foi alterado; só 8 variantes
  adicionadas nos anéis).
- Continuam só no Marquesa: **24**, nenhum por falha — 21 "pode ser o mesmo
  modelo já anunciado sob outro código" (decisão humana: juntar ao anúncio
  existente ou criar outro), 2 cor no atributo "Tamanho" (162190, 318522),
  1 kit (314161). Lista no Anexo C.
- Categoria: só a de mesmo nome na loja (Anel, Brinco, Colar, Pulseira,
  Berloque). Argola 31, Pingente 16, Conjunto 2, Outros 1 ficaram sem
  categoria lá ("falta categoria").

### 5.3 Preparação para Nuvemshop (estado final de PROD)

| Não cadastrados | Ocultos em preparação | Prontos para publicar | Publicados | Com erro |
|---:|---:|---:|---:|---:|
| 24 | 362 | 63 | 520 | 0 |

Pendências (por peça; uma peça pode ter várias): foto 351 · preço 177 ·
categoria 58 · sem peça em casa 52 · conferir estoque da variação 27 ·
SEO 26 · descrição 25 · revisar variação 7.

Os 63 prontos são ocultos que já existiam na loja (com foto, texto, SEO,
preço, categoria, estoque em dia e peça em casa) — publicar continua sendo o
clique. Nenhum dos 328 criados hoje está pronto: todos estão sem foto, menos
o 187604.

### 5.4 Descrições e SEO

- Gerados pela regra de 08/10 (`texto-site.js`) e gravados na loja:
  **313 descrições, 313 títulos SEO, 313 meta descriptions** (288 registradas
  aqui + 25 dos adotados, conferidas pela leitura da loja). 0 títulos e 0
  metas repetidos.
- Não gerados por falta de dados: **15** — nome repetido em outro produto
  (sem dado cadastrado que os diferencie), nome sem família (ex.: "Trio Gota
  Cristal", "Escapulário…"), nome longo demais para o título. Ficam
  "Precisa de informação".
- Anúncios que já existiam: nenhum texto tocado.

### 5.5 Segurança

- Nenhum produto incompleto ficou visível: 520 visíveis antes e depois; 0 dos
  328 criados com visibilidade diferente de `hidden`; vitrine 404 conferida.
- Nenhum produto duplicado: 0 SKU em dois produtos no espelho da loja; o lote
  que morreu foi adotado, não recriado.
- Nenhum preço inventado: 164 sem preço foram sem preço; 0 divergências entre
  o preço criado e o do Marquesa. Variantes novas dos anéis: preço comum das
  irmãs.
- Nenhuma variação inventada: só subiram valores gravados aqui; 8 variantes,
  todas de aro registrado pela Sthefany.
- Nenhum estoque repartido: variantes novas com 0; nenhum movimento escrito
  (2.868 movimentos e 27 vendas, iguais a antes); razão fechando (0
  divergências).
- Nenhum SEO aprovado destruído: 0 PUT em anúncio existente.
- Os 590 mapeamentos de 08/10 continuam iguais (918 = 590 + 328), e o envio
  automático de estoque continua ativo (`nuvemshopSyncAtivo` = true; fila 918
  sincronizados, 27 revisão, 27 sem anúncio, 0 erro).

## 6. O que fica para gente

1. Foto: 351 peças (é o que segura a maioria dos 328 ocultos).
2. Preço: 177 (164 ocultos criados sem preço).
3. As 24 não cadastradas (21 "mesmo modelo?", 2 atributo, 1 kit).
4. Os 27 códigos de variação (maleta e repartição) e as 11 variações só aqui.
5. Categoria na loja para Argola, Pingente, Conjunto, Outros.
6. 15 textos "Precisa de informação".
7. Publicar: os 63 prontos são decisão de quem aprova.

## 7. Testes

- `src/nuvemshop-catalogo-test.mjs` — 30 provas (os 14 casos pedidos + kill
  switch, API que ignora `visibility`, cron, 391471, sem leitura do catálogo,
  dedup quebrada não cria).
- `src/nuvemshop-fila-test.mjs` 49, `vendas-nuvemshop`, `sync`, `variacoes`,
  `kits` 21, `import-total` 14, `v2-variacoes-locais`, `catalogo-4-5`: verdes;
  `e2e` 93/7 e `fase2-telas` iguais ao commit de PROD (pré-existentes).
- Frontend 626, build ok; contratos 224; docs-links, phase0, razão, SKU ok.
- `src/v2-preparacao-nuvemshop-qa.mjs` no bundle publicado, 1366 e 390 px:
  abas, checklist, texto do site, "Publicar" com confirmação, sem rolagem
  lateral, sem erro de JS.
- Ensaio sobre cópia de PROD antes da escrita real.

## Anexo A — os 27 códigos de 08/10: (A) a variante existe? (B) o saldo é conhecido?

A variante existe na loja em todos; o que falta é o saldo por variante. Por
isso nenhum deles sincroniza — e nenhum número foi chutado.

| Código | Peça | Variantes na loja | (A) Variante existe? | (B) Saldo por variante conhecido? | Por quê | Criadas hoje na loja |
|---|---|---:|---|---|---|---|
| 122809 | Brinco Infantil Quadrado Colorido Banho de Ouro 18k | 5 | sim | não | peça em maleta sem variação (1 de 1) | — |
| 132721 | Brinco Infantil Libélula e Zircônia Colorida Banho de Ouro 18k | 4 | sim | não | peça em maleta sem variação (1 de 1) | — |
| 191620 | Brinco Corações Pendurado Colorido Infantil Banho de Ouro 18k | 2 | sim | não | estoque daqui não repartido (3 de 3) | — |
| 218178 | Anel Micro Zirconia Banho de Ouro 18k | 3 | sim | não | peça em maleta sem variação (3 de 3) | n°18 |
| 224398 | Anel Regulavel Triângulo Zircônias Banho de Ouro 18k | 3 | sim | não | peça em maleta sem variação (2 de 2) | — |
| 235290 | Anel Oval Vazado Banho de Ouro 18k | 5 | sim | não | peça em maleta sem variação (4 de 4) | n°17, n°15 |
| 256359 | Anel Inspiração Cartier Banho de Ouro 18k | 5 | sim | não | peça em maleta sem variação (1 de 1) | — |
| 263571 | Anel Topo Reto Cravejado Banho de Ouro 18k | 3 | sim | não | peça em maleta sem variação (2 de 2) | — |
| 268352 | Anel Base Reta com Zircônia Banho de Ouro 18k | 2 | sim | não | peça em maleta sem variação (1 de 1) | — |
| 268600 | Anel Nossa Senhora Incolor Banho de Prata | 3 | sim | não | peça em maleta sem variação (2 de 2) | — |
| 275922 | Anel Duplo Elos e Zircônias Banho de Ouro 18k | 5 | sim | não | peça em maleta sem variação (1 de 1) | n°22 |
| 315220 | Anel Coração Cravejado Banho de Ouro 18k | 5 | sim | não | peça em maleta sem variação (2 de 2) | n°17 |
| 316411 | Anel Solitário Zircônia 9mm Banho de Ouro 18k | 6 | sim | não | peça em maleta sem variação (2 de 2) | — |
| 334079 | Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | 5 | sim | não | estoque daqui não repartido (5 de 5) | — |
| 346802 | Anel Design Infinito Banho de Ouro 18k e Ródio Branco | 2 | sim | não | peça em maleta sem variação (1 de 1) | — |
| 351489 | Anel Solitário com Pedra de Zirconia Banho de Ouro 18k | 2 | sim | não | estoque daqui não repartido (2 de 2) | — |
| 353022 | Anel Quadrado Duplo Micro Zircônias Banho de Ouro 18k | 3 | sim | não | peça em maleta sem variação (1 de 1) | — |
| 377535 | Anel Linhas e X Cravejado Banho de Ouro 18k | 4 | sim | não | peça em maleta sem variação (1 de 1) | n°22 |
| 381783 | Anel Solitário Aro Duplo Zircônias Cravejadas Banho de Ouro 18k | 4 | sim | não | peça em maleta sem variação (2 de 2) | n°22, n°16 |
| 382662 | Anel Lateral Vazada com Detalhes Zircônias Banho de Ouro 18k | 3 | sim | não | peça em maleta sem variação (1 de 1) | — |
| 392893 | Anel Nossa Senhora Zircônia Azul Banho de Prata | 4 | sim | não | peça em maleta sem variação (2 de 2) | — |
| 393950 | Anel Minimalista Cruz Banho de Ouro 18k e Ródio Branco | 2 | sim | não | estoque daqui não repartido (2 de 2) | — |
| 635650 | Anel Solitario com Linhas Cravejadas Banho de Ouro 18k | 2 | sim | não | estoque daqui não repartido (2 de 2) | — |
| 647729 | Anel Solitário Coroa 6mm Cravejado Cristal Banho de Ouro 18k | 3 | sim | não | estoque daqui não repartido (1 de 6) | — |
| 711591 | Anel Solitário Zircônias 8mm Incolor Banho de Ouro 18k | 2 | sim | não | estoque daqui não repartido (2 de 2) | — |
| 717389 | Anel Solitário Zircônias 6mm Incolor Banho de Ouro 18k | 2 | sim | não | estoque daqui não repartido (2 de 2) | — |
| 750894 | Anel Liso Topo Reto Banho de Ouro 18k | 2 | sim | não | peça em maleta sem variação (1 de 1) | — |

## Anexo B — anéis e brincos infantis, variação por variação

"Existe Nuvemshop? sim (equivalente)" = a variação daqui e a da loja são o
mesmo aro/cor escrito de outro jeito; o sistema já as trata como uma (§58).
"Estoque seguro?" = dá para dizer quanto é desta variante sem chutar.

### ANÉIS

| Produto | Tipo | Variação Marquesa | SKU | Existe Nuvemshop? | Variant ID | Estoque seguro? | Ação |
|---|---|---|---|---|---|---|---|
| Anel Solitario Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°18 | 159593 | sim | 1320427026 | sim | — |
| Anel Solitario Cravejado Banho de Ouro 18k | criada aqui | nº18 | 159593 | sim (equivalente) | 1320427026 | sim (única) | Mesma variante (par único, §58) |
| Anel Micro Zirconia Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°20 | 218178 | sim | 1320426729 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Micro Zirconia Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°17 | 218178 | sim | 1320426737 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Micro Zirconia Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°18 | 218178 | sim | 1615462592 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Regulavel Triângulo Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°14 | 224398 | sim | 1320426010 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Regulavel Triângulo Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°17 | 224398 | sim | 1559595478 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Regulavel Triângulo Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°19 | 224398 | sim | 1572998000 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Abaulado Círculos Zircônias Incolor Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°20 | 230076 | sim | 1559751984 | sim | — |
| Anel Abaulado Círculos Zircônias Incolor Banho de Ouro 18k | criada aqui | nº20 | 230076 | sim (equivalente) | 1559751984 | sim (única) | Mesma variante (par único, §58) |
| Anel Oval Vazado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°22 | 235290 | sim | 1570674445 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Oval Vazado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°19 | 235290 | sim | 1570674447 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Oval Vazado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°23 | 235290 | sim | 1570674450 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Oval Vazado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°17 | 235290 | sim | 1615462593 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Oval Vazado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°15 | 235290 | sim | 1615462594 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitario Infantil Banho de Ouro 18k nº12 | variante da loja | Banho de Ouro 18K · n°12 | 253852 | sim | 1559752269 | sim | — |
| Anel Solitario Infantil Banho de Ouro 18k nº12 | criada aqui | nº12 | 253852 | sim (equivalente) | 1559752269 | sim (única) | Mesma variante (par único, §58) |
| Anel Inspiração Cartier Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°17 | 256359 | sim | 1570651681 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Inspiração Cartier Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°24 | 256359 | sim | 1570651682 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Inspiração Cartier Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°21 | 256359 | sim | 1570651683 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Inspiração Cartier Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°15 | 256359 | sim | 1572988547 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Inspiração Cartier Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · N°23 | 256359 | sim | 1612443787 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Inspiração Cartier Banho de Ouro 18k | criada aqui | Banho de Ouro 18K · nº23 | 256359 | sim (equivalente) | 1612443787 | não | VARIAÇÃO DUPLICADA: a loja já tem N°23 (1612443787); apagar a nº23 daqui (saldo 0) |
| Anel Topo Reto Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°21 | 263571 | sim | 1570647372 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Topo Reto Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°24 | 263571 | sim | 1570647374 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Topo Reto Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°18 | 263571 | sim | 1570647375 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Base Reta com Zircônia Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°17 | 268352 | sim | 1572981997 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Base Reta com Zircônia Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°18 | 268352 | sim | 1572981998 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Nossa Senhora Incolor Banho de Prata | variante da loja | Banho de Ouro 18K · n°18 | 268600 | sim | 1570802791 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Nossa Senhora Incolor Banho de Prata | variante da loja | Banho de Ouro 18K · n°16 | 268600 | sim | 1570802792 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Nossa Senhora Incolor Banho de Prata | variante da loja | Banho de Ouro 18K · n°23 | 268600 | sim | 1570802794 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Prego Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°17 | 275818 | sim | 1570806644 | sim | — |
| Anel Prego Cravejado Banho de Ouro 18k | criada aqui | nº17 | 275818 | sim (equivalente) | 1570806644 | sim (única) | Mesma variante (par único, §58) |
| Anel Duplo Elos e Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°20 | 275922 | sim | 1570679003 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Duplo Elos e Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°24 | 275922 | sim | 1570679004 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Duplo Elos e Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°17 | 275922 | sim | 1570679005 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Duplo Elos e Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°15 | 275922 | sim | 1570679006 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Duplo Elos e Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°22 | 275922 | sim | 1615462595 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Aparador de Aliança Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°24 | 283680 | sim | 1320421909 | sim | — |
| Anel Aparador de Aliança Cravejado Banho de Ouro 18k | criada aqui | nº24 | 283680 | sim (equivalente) | 1320421909 | sim (única) | Mesma variante (par único, §58) |
| Anel Duplo Solitário e Aparador Zircônias Cravejadas Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°18 | 313860 | sim | 1320406290 | sim | — |
| Anel Duplo Solitário e Aparador Zircônias Cravejadas Banho de Ouro 18k | criada aqui | nº18 | 313860 | sim (equivalente) | 1320406290 | sim (única) | Mesma variante (par único, §58) |
| Anel Coração Cravejado Banho de Ouro 18k | variante da loja | n°21 | 315220 | sim | 1367348996 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Coração Cravejado Banho de Ouro 18k | variante da loja | n°14 | 315220 | sim | 1367349000 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Coração Cravejado Banho de Ouro 18k | variante da loja | n°23 | 315220 | sim | 1555020491 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Coração Cravejado Banho de Ouro 18k | variante da loja | n°22 | 315220 | sim | 1572996855 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Coração Cravejado Banho de Ouro 18k | variante da loja | n°17 | 315220 | sim | 1615462598 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário Zircônia 9mm Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°18 | 316411 | sim | 1570654387 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário Zircônia 9mm Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°24 | 316411 | sim | 1570654388 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário Zircônia 9mm Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°21 | 316411 | sim | 1570654389 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário Zircônia 9mm Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°20 | 316411 | sim | 1570654390 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário Zircônia 9mm Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°16 | 316411 | sim | 1570654391 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário Zircônia 9mm Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°22 | 316411 | sim | 1572983298 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Coração Vermelho Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°16 | 317294 | sim | 1570790717 | sim | — |
| Anel Coração Vermelho Cravejado Banho de Ouro 18k | criada aqui | nº16 | 317294 | sim (equivalente) | 1570790717 | sim (única) | Mesma variante (par único, §58) |
| Anel Triplo Organic Banho em Ouro 18k | variante da loja | Banho de Ouro 18k · n°14 | 327653 | sim | 1320429189 | sim | — |
| Anel Triplo Organic Banho em Ouro 18k | criada aqui | nº14 | 327653 | sim (equivalente) | 1320429189 | sim (única) | Mesma variante (par único, §58) |
| Anel em V Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°17 | 333717 | sim | 1509925861 | sim | — |
| Anel em V Cravejado Banho de Ouro 18k | criada aqui | nº17 | 333717 | sim (equivalente) | 1509925861 | sim (única) | Mesma variante (par único, §58) |
| Anel Solitário Coroa 5mm Cravejado Cristal  nº27 Banho de Ouro 18k | criada aqui | nº27 | 334078 | não | — | sim (única) | Decidir: é o aro nº27 do 334079, que a loja já tem como variante — não criar 2º anúncio |
| Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°19 | 334079 | sim | 1570614499 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°17 | 334079 | sim | 1570614501 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°18 | 334079 | sim | 1570614503 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°14 | 334079 | sim | 1570614507 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°27 | 334079 | sim | 1570614509 | não | Peças › Variações: repartir o estoque |
| Anel Design Infinito Banho de Ouro 18k e Ródio Branco | variante da loja | Banho de Ouro 18k · n°16 | 346802 | sim | 1320415513 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Design Infinito Banho de Ouro 18k e Ródio Branco | variante da loja | Banho de Ouro 18k · n°21 | 346802 | sim | 1320415519 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário com Pedra de Zirconia Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°14 | 351489 | sim | 1320412353 | não | Peças › Variações: repartir o estoque |
| Anel Solitário com Pedra de Zirconia Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°18 | 351489 | sim | 1320412368 | não | Peças › Variações: repartir o estoque |
| Anel Duas Linhas Cravejadas Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°18 | 352008 | sim | 1570825739 | sim | — |
| Anel Duas Linhas Cravejadas Banho de Ouro 18k | criada aqui | nº18 | 352008 | sim (equivalente) | 1570825739 | sim (única) | Mesma variante (par único, §58) |
| Anel Quadrado Duplo Micro Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°17 | 353022 | sim | 1320420694 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Quadrado Duplo Micro Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°15 | 353022 | sim | 1320420698 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Quadrado Duplo Micro Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°21 | 353022 | sim | 1559743369 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Linhas e X Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°14 | 377535 | sim | 1570797927 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Linhas e X Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°18 | 377535 | sim | 1570797928 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Linhas e X Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°19 | 377535 | sim | 1570797930 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Linhas e X Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°22 | 377535 | sim | 1615462604 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário Aro Duplo Zircônias Cravejadas Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°19 | 381783 | sim | 1320408539 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário Aro Duplo Zircônias Cravejadas Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°15 | 381783 | sim | 1320408545 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário Aro Duplo Zircônias Cravejadas Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°22 | 381783 | sim | 1615462606 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Solitário Aro Duplo Zircônias Cravejadas Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°16 | 381783 | sim | 1615462607 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Lateral Vazada com Detalhes Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°14 | 382662 | sim | 1320413815 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Lateral Vazada com Detalhes Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°18 | 382662 | sim | 1559743613 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Lateral Vazada com Detalhes Zircônias Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°24 | 382662 | sim | 1572976683 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Coração Vazado Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°18 | 391471 | sim | 1509838878 | sim | — |
| Anel Coração Vazado Cravejado Banho de Ouro 18k | criada aqui | nº24 | 391471 | não | — | sim | Saldo repartido (nº18=1, nº24=1): a loja agora recebe 1 no aro 18; nº24 falta na loja (anúncio de variante única) |
| Anel Coração Vazado Cravejado Banho de Ouro 18k | criada aqui | nº18 | 391471 | sim (equivalente) | 1509838878 | sim | Saldo repartido (nº18=1, nº24=1): a loja agora recebe 1 no aro 18; nº24 falta na loja (anúncio de variante única) |
| Anel Nossa Senhora Zircônia Azul Banho de Prata | variante da loja | Banho de Ouro 18K · n°19 | 392893 | sim | 1570809896 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Nossa Senhora Zircônia Azul Banho de Prata | variante da loja | Banho de Ouro 18K · n°15 | 392893 | sim | 1570809897 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Nossa Senhora Zircônia Azul Banho de Prata | variante da loja | Banho de Ouro 18K · n°17 | 392893 | sim | 1570809898 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Nossa Senhora Zircônia Azul Banho de Prata | variante da loja | Banho de Ouro 18K · n°21 | 392893 | sim | 1570809899 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Minimalista Cruz Banho de Ouro 18k e Ródio Branco | variante da loja | Banho de Ouro 18k · n°12 | 393950 | sim | 1320414731 | não | Peças › Variações: repartir o estoque |
| Anel Minimalista Cruz Banho de Ouro 18k e Ródio Branco | variante da loja | Banho de Ouro 18k · n°14 | 393950 | sim | 1320414736 | não | Peças › Variações: repartir o estoque |
| Anel Quadrado Topo Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°20 | 398483 | sim | 1570815101 | sim | — |
| Anel Quadrado Topo Cravejado Banho de Ouro 18k | criada aqui | nº20 | 398483 | sim (equivalente) | 1570815101 | sim (única) | Mesma variante (par único, §58) |
| Anel Aparador de Aliança Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°21 | 408061 | sim | 1572992720 | sim | — |
| Anel Aparador de Aliança Banho de Ouro 18k | criada aqui | nº21 | 408061 | sim (equivalente) | 1572992720 | não | Repartir nº21/nº19 e criar nº19 na loja (anúncio de variante única) |
| Anel Aparador de Aliança Banho de Ouro 18k | criada aqui | nº19 | 408061 | não | — | não | Repartir nº21/nº19 e criar nº19 na loja (anúncio de variante única) |
| Anel Coração Croissant Detalhes em Ródio Banho de Ouro 18K | variante da loja | n°17 · Banho de Ouro 18K | 443929 | sim | 1097528446 | sim | — |
| Anel Coração Croissant Detalhes em Ródio Banho de Ouro 18K | criada aqui | nº17 | 443929 | sim (equivalente) | 1097528446 | sim (única) | Mesma variante (par único, §58) |
| Aparador de Aliança Banho de Ouro 18k | criada aqui | nº19 | 519177 | não | — | sim (única) | Decidir: mesmo nome de modelo já anunciado (408061/283680) — não criar 2º anúncio |
| Anel Oval Vazado Cravejado Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°20 | 568444 | sim | 1320424162 | sim | — |
| Anel Oval Vazado Cravejado Banho de Ouro 18k | criada aqui | nº20 | 568444 | sim (equivalente) | 1320424162 | sim (única) | Mesma variante (par único, §58) |
| Anel Zircônia Baguetes Verde Esmeralda Banho de Ouro 18k | variante da loja | Verde Esmeralda · n°17 | 582669 | sim | 1390693445 | sim | — |
| Anel Zircônia Baguetes Verde Esmeralda Banho de Ouro 18k | criada aqui | nº17 | 582669 | sim (equivalente) | 1390693445 | sim (única) | Mesma variante (par único, §58) |
| Anel Solitario com Linhas Cravejadas Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°19 | 635650 | sim | 1320419893 | não | Peças › Variações: repartir o estoque |
| Anel Solitario com Linhas Cravejadas Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°21 | 635650 | sim | 1572985671 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Coroa 6mm Cravejado Cristal Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°16 | 647729 | sim | 1570618509 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Coroa 6mm Cravejado Cristal Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°19 | 647729 | sim | 1570618511 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Coroa 6mm Cravejado Cristal Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°22 | 647729 | sim | 1570618513 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Zircônias 8mm Incolor Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°13 | 711591 | sim | 1390473775 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Zircônias 8mm Incolor Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°15 | 711591 | sim | 1390473781 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Zircônias 6mm Incolor Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°25 | 717389 | sim | 1431688892 | não | Peças › Variações: repartir o estoque |
| Anel Solitário Zircônias 6mm Incolor Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°18 | 717389 | sim | 1554996715 | não | Peças › Variações: repartir o estoque |
| Anel Liso Topo Reto Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°22 | 750894 | sim | 1390479749 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Liso Topo Reto Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · n°16 | 750894 | sim | 1390479755 | não | Pendências: dizer qual variação a revendedora levou |
| Anel Cravejado Cristal Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · n°20 | 843659 | sim | 1320427943 | sim | — |
| Anel Cravejado Cristal Banho de Ouro 18k | criada aqui | nº20 | 843659 | sim (equivalente) | 1320427943 | sim (única) | Mesma variante (par único, §58) |

### BRINCOS INFANTIS

| Produto | Tipo | Variação Marquesa | SKU | Existe Nuvemshop? | Variant ID | Estoque seguro? | Ação |
|---|---|---|---|---|---|---|---|
| Brinco Infantil Quadrado Colorido Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · Cristal | 122809 | sim | 1572455844 | não | Pendências: dizer qual variação a revendedora levou |
| Brinco Infantil Quadrado Colorido Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · Rosa | 122809 | sim | 1572455845 | não | Pendências: dizer qual variação a revendedora levou |
| Brinco Infantil Quadrado Colorido Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · Verde | 122809 | sim | 1572455846 | não | Pendências: dizer qual variação a revendedora levou |
| Brinco Infantil Quadrado Colorido Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · Vermelho | 122809 | sim | 1572455847 | não | Pendências: dizer qual variação a revendedora levou |
| Brinco Infantil Quadrado Colorido Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · Azul | 122809 | sim | 1572455848 | não | Pendências: dizer qual variação a revendedora levou |
| Brinco Infantil Libélula e Zircônia Colorida Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · Cristal | 132721 | sim | 1572457904 | não | Pendências: dizer qual variação a revendedora levou |
| Brinco Infantil Libélula e Zircônia Colorida Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · Pink | 132721 | sim | 1572457905 | não | Pendências: dizer qual variação a revendedora levou |
| Brinco Infantil Libélula e Zircônia Colorida Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · Vermelho | 132721 | sim | 1572457907 | não | Pendências: dizer qual variação a revendedora levou |
| Brinco Infantil Libélula e Zircônia Colorida Banho de Ouro 18k | variante da loja | Banho de Ouro 18K · Verde | 132721 | sim | 1572457908 | não | Pendências: dizer qual variação a revendedora levou |
| Brinco Infantil Zircônia e Coração Banho de Ouro 18k | criada aqui | Azul | 162190 | não | — | não | Revisar o atributo ("Tamanho" com cores) — produto ainda não cadastrado na loja |
| Brinco Infantil Zircônia e Coração Banho de Ouro 18k | criada aqui | Cristal | 162190 | não | — | não | Revisar o atributo ("Tamanho" com cores) — produto ainda não cadastrado na loja |
| Brinco Infantil Zircônia e Coração Banho de Ouro 18k | criada aqui | Vermelho | 162190 | não | — | não | Revisar o atributo ("Tamanho" com cores) — produto ainda não cadastrado na loja |
| Brinco Corações Pendurado Colorido Infantil Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · Cristal | 191620 | sim | 1259096830 | não | Peças › Variações: repartir o estoque |
| Brinco Corações Pendurado Colorido Infantil Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · Verde | 191620 | sim | 1259096834 | não | Peças › Variações: repartir o estoque |
| Brinco Coração Pendurado Colorido Infantil Banho de Ouro 18k | variante da loja | Banho de Ouro 18k · Cristal | 194149 | sim | 1259095252 | sim | — |
| Brinco Coração Pendurado Colorido Infantil Banho de Ouro 18k | criada aqui | Cristal | 194149 | sim (equivalente) | 1259095252 | não | Mesma variante (par único, §58) |
| Brinco Coração Pendurado Colorido Infantil Banho de Ouro 18k | criada aqui | Vermelho | 194149 | não | — | não | Criar na loja depois de repartir o estoque (anúncio de variante única) |
| Brinco Coração Pendurado Chapa Infantil Banho de Ouro | variante da loja | Banho de Ouro 18k · Cristal | 198242 | sim | 1259068349 | sim | — |
| Brinco Coração Pendurado Chapa Infantil Banho de Ouro | criada aqui | Cristal | 198242 | sim (equivalente) | 1259068349 | não | Mesma variante (par único, §58) |
| Brinco Coração Pendurado Chapa Infantil Banho de Ouro | criada aqui | Pink | 198242 | não | — | não | Criar na loja depois de repartir o estoque (anúncio de variante única) |

## Anexo C — as 24 peças com estoque que não foram cadastradas

| Código | Peça | Em casa | Motivo |
|---|---|---:|---|
| 102311 | Brinco Curvado Liso Banho de Ouro 18k | 1 | Pode ser o mesmo modelo já anunciado sob 114998. Confirme antes de criar outro anúncio. |
| 162190 | Brinco Infantil Zircônia e Coração Banho de Ouro 18k | 3 | Variação com cor gravada no atributo "Tamanho". Confirme o atributo certo (ex.: Cor) antes de criar na loja. |
| 196333 | Argola Média Cravejada Banho de Ouro 18k | 1 | Pode ser o mesmo modelo já anunciado sob 132944. Confirme antes de criar outro anúncio. |
| 272073 | Berloque Separador Liso Banho de Ouro 18k | 6 | Pode ser o mesmo modelo já anunciado sob 227655. Confirme antes de criar outro anúncio. |
| 318522 | Brinco Ponto de Luz Roxo Banho de Ouro 18k | 1 | Variação com cor gravada no atributo "Tamanho". Confirme o atributo certo (ex.: Cor) antes de criar na loja. |
| 334078 | Anel Solitário Coroa 5mm Cravejado Cristal  nº27 Banho de Ouro 18k | 1 | Pode ser o mesmo modelo já anunciado sob 334079. Confirme antes de criar outro anúncio. |
| 350077 | Colar Ponto de Luz Rosa Banho de Ouro 18k | 1 | Pode ser o mesmo modelo já anunciado sob 110250. Confirme antes de criar outro anúncio. |
| 419054 | Colar Ponto de Luz Azul Banho de Ouro 18k | 2 | Pode ser o mesmo modelo já anunciado sob 131009. Confirme antes de criar outro anúncio. |
| 519177 | Aparador de Aliança Banho de Ouro 18k | 1 | Pode ser o mesmo modelo já anunciado sob 408061, 283680. Confirme antes de criar outro anúncio. |
| 109435 | Brinco Fita Torcida Banho de Ouro 18k | 3 | Pode ser o mesmo modelo já anunciado sob 359219. Confirme antes de criar outro anúncio. |
| 131650 | Brinco Orgânico Vazado Banho de Ouro 18k | 3 | Pode ser o mesmo modelo já anunciado sob 917690. Confirme antes de criar outro anúncio. |
| 132961 | Brinco Coração Texturizado Banho de Ouro 18k | 4 | Pode ser o mesmo modelo já anunciado sob 194786, 326458. Confirme antes de criar outro anúncio. |
| 187550 | Brinco Orgânico Pequeno Banho de Ouro 18k | 2 | Pode ser o mesmo modelo já anunciado sob 102367. Confirme antes de criar outro anúncio. |
| 314161 | Colar Filhos Dois Meninos e Uma Menina Banho de Ouro 18k | 1 | Kit e Monte seu Colar não viram anúncio por este caminho: o disponível deles é calculado das peças. |
| 352831 | Colar Infantil Minnie Banho de Ouro 18k | 2 | Pode ser o mesmo modelo já anunciado sob 166772. Confirme antes de criar outro anúncio. |
| 387128 | Colar Coração Cravejado Banho de Ouro 18k | 1 | Pode ser o mesmo modelo já anunciado sob 619940, 315220. Confirme antes de criar outro anúncio. |
| 410321 | Anel Liso Topo Reto Banho de Ouro 18k | 6 | Pode ser o mesmo modelo já anunciado sob 750894. Confirme antes de criar outro anúncio. |
| 440096 | Pulseira Elos Cadeado Banho de Ouro 18k | 3 | Pode ser o mesmo modelo já anunciado sob 361239. Confirme antes de criar outro anúncio. |
| 450320 | Anel Micro Zircônias Banho de Ouro 18k | 5 | Pode ser o mesmo modelo já anunciado sob 838474. Confirme antes de criar outro anúncio. |
| 466732 | Colar Orgânico Oval  Madrepérola Banho de Ouro 18k | 2 | Pode ser o mesmo modelo já anunciado sob 166732. Confirme antes de criar outro anúncio. |
| 489565 | Colar Ponto de Luz Banho de Ouro 18k | 4 | Pode ser o mesmo modelo já anunciado sob 174404, 170308. Confirme antes de criar outro anúncio. |
| 492818 | Anel Coração Orgânico Vazado Banho de Ouro 18k | 4 | Pode ser o mesmo modelo já anunciado sob 151937. Confirme antes de criar outro anúncio. |
| 493074 | Piercing Fake Riviera Coloridos Banho de Ouro 18k | 9 | Pode ser o mesmo modelo já anunciado sob 466730. Confirme antes de criar outro anúncio. |
| 561637 | Colar Nossa Senhora Aparecida Banho de Ouro 18k | 2 | Pode ser o mesmo modelo já anunciado sob 561638. Confirme antes de criar outro anúncio. |
