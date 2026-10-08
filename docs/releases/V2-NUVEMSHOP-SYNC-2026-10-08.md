# V2 — estoque online pela fila: Marquesa → Nuvemshop, reconciliação e Preparação (08/10/2026)

REGRAS §61. Produção = Worker `marquesa-api` + D1 `marquesa-db-prod` +
Pages `marquesa` (servido em `marquesa-9da.pages.dev`, que **é** produção).

## 1. Antes

- Cron desligado desde o go-live (22/08). `config` sem `syncCorteEm` nem
  `syncUltimoPedido`; `sync_execucoes` só com rodadas secas.
- Cada venda relia o catálogo inteiro dos dois lados e empurrava todos os
  códigos; o freio barrava ("zeraria 48…63 produtos", vendas 23–30) e nada
  chegava à loja. Último envio real à loja: 05/09/2026.
- Inventário #1 (id 13) concluído às 16:30:57 UTC de 08/10: 2.036 peças,
  1.647 em casa, 389 com revendedoras. Razão fechando.

## 2. O que mudou

Ver §61. Em uma frase: todo movimento põe o código numa fila (gatilho do
banco, mesma transação); a fila manda o saldo ABSOLUTO em casa por variante,
logo depois da operação ou pelo cron (10 min); kill switch em
`config.nuvemshopSyncAtivo`; conferência/reconciliação como reserva;
Preparação para Nuvemshop diz o que falta em cada peça.

## 3. Execução em produção (UTC)

| hora | passo |
|---|---|
| 18:39 | export de backup (scratchpad, 7,2 MB) · bookmark `0000023b-00000000-000050fe-726bd5d77f361a15950968908ad10d7a` |
| 18:49 | bookmark `0000023c-00000000-000050fe-91515400749bf85abcf3f17e228e05e0` · migration `api/migracao-nuvemshop-fila.sql` (2 tabelas, 3 índices, 5 gatilhos) |
| 18:50 | config: `syncCorteEm` = 2026-10-08T16:30:57Z (fim do inventário), `syncUltimoPedido` = 2026-10-06T19:52:12Z (janela a partir do início do inventário), `nuvemshopSyncAtivo` = false, pedido de conferência |
| 18:52 | Worker `48ecf44d` (crons `*/10 * * * *` e `0 9 * * *`) · Pages `e2b26ca3` |
| 19:01 | 1ª conferência real (só leitura): 590 variantes mapeadas, 336 iguais, **254 divergentes** |
| 19:03 | `nuvemshopSyncAtivo` = true (sem reconciliar) |
| 19:10 | cron parou na leitura de pedidos: a loja responde 404 "Last page is 0" para lista vazia → correção `a8f6e26`, Worker `ab7fc531` |
| 19:20 | cron ok: **nenhum pedido no site desde 06/10 13:52** (início do inventário) |
| 19:22 | bookmark `0000023f-00000002-000050fe-93d3d4cc87cbd9eae6d498ab4fa5428e` · pedido de reconciliação |
| 19:31 | **reconciliação: 254 variantes enviadas, 0 erros, 16 chamadas à Nuvemshop** |
| 19:40 | linha de base: 714 códigos confirmados pela fila (336 iguais, 27 revisão, 351 sem anúncio), nenhuma escrita |
| 19:50 | **conferência final: 590/590 iguais, 0 divergentes** |
| 19:5x | Worker `dfcf4b19` (Preparação mostra texto do site faltando) |

Rollback: Worker `f01a3a51` (anterior a tudo) · Pages `bf30f21f` · D1
bookmark `0000023c-…` (antes da migration) ou `api/migracao-nuvemshop-fila-rollback.sql`
· desligar só o envio: `UPDATE config SET valor='false' WHERE chave='nuvemshopSyncAtivo'`.
O estoque da LOJA antes da reconciliação está na tabela do § 5 (coluna
"Nuvemshop antes") — o rollback do banco não desfaz o que a loja recebeu.

## 4. Números

- Loja: 598 produtos, 675 variantes. Marquesa: 984 produtos ativos.
- Mapeados (SKU casado, endereçável): **590 códigos / 590 variantes**.
- Antes: 336 iguais, 254 divergentes (121 com a loja ACIMA do em casa — 113
  deles com peça em maleta: a loja vendia o total; 133 com a loja ABAIXO —
  52 delas em 0). 65 variantes foram a 0. Peças à venda nos 590:
  700 → 766.
- Depois: **590 iguais, 0 divergentes.**
- Razão: `produtos.qtd == SUM(movimentos.qtd)` para todo código (0
  divergências); total 2.036; 27 vendas e 2.868 movimentos, os mesmos de
  antes — a reconciliação só escreveu na loja.
- Fila: 590 sincronizado · 27 revisão · 351 ignorado (sem anúncio).

## 5. Exceções (não reconciliadas automaticamente, por regra)

- **27 códigos (83 variantes) com variação sem endereço seguro**: 19 com
  peça em maleta sem dizer qual variação levou, 8 com estoque daqui não
  repartido entre as variações. Nada foi escrito neles (regra 2: não se
  chuta a variante). Resolve-se em Pendências (identificar a variação da
  maleta) ou repartindo o estoque. Lista: 122809, 132721, 191620, 218178,
  224398, 235290, 256359, 263571, 268352, 268600, 275922, 315220, 316411,
  334079, 346802, 351489, 353022, 377535, 381783, 382662, 392893, 393950,
  635650, 647729, 711591, 717389, 750894.
- **2 SKUs só na Nuvemshop** (inativos no Marquesa, não tocados): 131576,
  349129 (variante nº18).
- **17 códigos só no sistema** (todas as peças em maleta, sem anúncio).
- **334 códigos com peça em casa e sem anúncio** (791 peças): Preparação.
- 0 SKU duplicado entre produtos da loja; 0 variante sem SKU.
- 3 vendas antigas continuam "revisão" (ids 4, 5, 20): os códigos delas
  estão entre os 27 acima.

## 6. Preparação para Nuvemshop (08/10, sobre a cópia pós-reconciliação)

617 publicados (590 estoque sincronizado, 27 estoque em revisão) · 335
aguardando preparação · 0 aguardando revisão · 0 prontos para publicar · 0
com erro. Pendências: descrição 335, SEO 336 (335 sem anúncio + 1
publicado), foto 332, preço 177, variante 27; categoria, nome, SKU e erro: 0.
Publicar na loja continua desligado (`NUVEMSHOP_PUBLICACAO_ENABLED` ausente).

## 7. Custo

- Venda de 1 código com envio: 22 chamadas ao D1 na requisição inteira
  (teste), 1 GET de produto + 1 PATCH na loja; nenhuma página do catálogo.
- Cron ocioso: 11 chamadas ao D1, 1 GET de pedidos, nenhuma leitura do catálogo.
- Conferência (catálogo inteiro): 13 chamadas ao D1, 4 GETs. Reconciliação
  de 254: 21 chamadas ao D1 (ensaio), 16 chamadas à loja; em produção CPU
  38–52 ms, ~15 s de parede.
- `d1-metrica` ganhou `chamadas` (o teto do Free conta batch como 1).

## 8. Testes

- `src/nuvemshop-fila-test.mjs` — 49 provas (os 10 cenários pedidos + corte,
  cautela, kill switch, freio, consignado identificado, conferência,
  reconciliação, pedido administrativo, lista vazia de pedidos, Preparação).
- Suítes HTTP (38) e in-process (60): iguais ao commit de produção, exceto
  `vendas-nuvemshop-test` (agora 43/43; antes não rodava) e
  `catalogo-test` (passa do ponto onde quebrava; as falhas seguintes são da
  seção de fotos, que nunca rodava antes).
- Frontend: 624 testes, build ok. QA Playwright 1280/390 px sem erro de JS.
- Ensaio completo sobre cópia do export de produção antes da escrita real.

## 9. Pendências conhecidas

- Teste ponta a ponta com venda real pela tela: depende de uma operação
  feita com a chave da API (o agente não a tem). O vigia de movimentos fica
  como prova quando ela acontecer.
- Pedido cancelado no site depois de importado não devolve estoque aqui
  (comportamento anterior, inalterado).

## Anexo A — os 254 divergentes (antes → depois)

Depois = coluna "Marquesa" (conferência final: todos iguais).

| SKU | Produto | Variante | Marquesa (em casa) | Nuvemshop antes | Diferença |
|---|---|---|---:|---:|---:|
| 100868 | Brinco Estrela Texturizada Banho de Ouro 18k | Banho de Ouro 18k | 4 | 1 | +3 |
| 101633 | Brinco Argola Lisa Prata 925 | Prata 925 | 1 | 0 | +1 |
| 101665 | Brinco Pérola Bolas Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 102367 | Brinco Orgânico Pequeno Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 102370 | Brinco Argola Aberta Aros Cravejado Banhado em Ouro 18K | Banho de Ouro 18k | 0 | 1 | -1 |
| 102528 | Brinco Oval Vazado com Zircônia Banho de Ouro 18k | Banho de Ouro 18K | 1 | 3 | -2 |
| 103147 | Brinco Ponto de Luz Pequeno Banho de Ouro 18k | Banho de Ouro 18k | 2 | 3 | -1 |
| 103503 | Argolas Cravejadas Grande Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 104650 | Brinco Ponto de Luz Rosa Prata 925 | Prata 925 | 1 | 0 | +1 |
| 105988 | Trio Coração, Esfera e Ponto de Luz Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 108683 | Brinco Gota com Detalhes Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 109994 | Argola Quadrada com Zircônias Banho de Ouro | Banho de Ouro 18K | 0 | 1 | -1 |
| 110196 | Brinco Cruz  Zircônias Incolor Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 110417 | Brinco Coração Cravejado Zirconias Incolores Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 110763 | Brinco Pizza Cravejado Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 111725 | Brinco Retangular Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 114998 | Brinco Curvado Liso Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 115888 | Brinco Esfera e Ninho Liso Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 116876 | Brinco Ponto de Luz Grande Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 117144 | Binco Coração com Franjas Lisas Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 117564 | Brinco Coração Abaulado Liso Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 119099 | Brincos Pontos de Luz Grande Verde Banho de Ouro | Banho de Ouro 18K · Verde | 0 | 1 | -1 |
| 119458 | Argolas Finas 15mm Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 119556 | Brinco Rosa Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 121043 | Brinco Coração Texturizado Vazado Banho de Ouro 18k | Banho de Ouro 18K | 0 | 2 | -2 |
| 121115 | Argola Triângulo Cravejada Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 122060 | Brinco Ponto de Luz Médio Banho de Ouro 18k | Banho de Ouro 18k | 3 | 1 | +2 |
| 122294 | Argola Flor Pequena Cravejada Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 122375 | Brinco Gota Incolor Cravação Inglesa Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 122660 | Argola Média Detalhes Cravejada Incolor Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 124111 | Argola Pingente Gota Cravejado Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 125443 | Brinco Argola Dois Fios Banho de Ouro 18k | Banho de Ouro 18K | 1 | 3 | -2 |
| 126711 | Brinco Coração Metade Liso e Metade Cravejado Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 126745 | Argola Pingente Coração Cravejado Banho de Ouro 18k | Banho de Ouro 18K | 2 | 3 | -1 |
| 127513 | Brinco Palito Ponta de Esfera Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 127759 | Argola Orgânica Pequena Banho de Ouro 18k | Banho de Ouro 18k | 3 | 2 | +1 |
| 128366 | Dupla de Argolas Hexagonal Lisa Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 129437 | Brinco Quadrado com Zircônia Central Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 130541 | Brinco Quadrado Detalhes Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 132944 | Argola Média Cravejada Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 133530 | Brinco Aspiral Chapa Banho de Ouro 18k | Banho de Ouro 18K | 3 | 2 | +1 |
| 133876 | Brinco Pendurado Gota Vazada Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 136011 | Argola Coração Cristal P Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 137091 | Brinco Pequeno Flor Vazada Prata 925 | Prata 925 | 1 | 0 | +1 |
| 138909 | Argola Pequena com Zircônia Pendurada Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 139985 | Trio de Esferas Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 140527 | Argola Média Lisa com Coração Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 142295 | Brinco Bola Lisa Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 142889 | Argola Triangular Lisa Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 143902 | Brinco Ear Cuff Folha Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 147632 | Brinco Morango Zircônia Banho de Ouro 18k | Banho de Ouro 18K | 6 | 4 | +2 |
| 147803 | Argola Triangular Cravejada Zircônias Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 148565 | Brinco Coração Madrepérola Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 150163 | Brincos Pontos de Luz Grande Rosa Banho de Ouro | Pink | 1 | 2 | -1 |
| 150164 | Brincos Pontos de Luz Grande Incolor Banho de Ouro | Incolor | 3 | 2 | +1 |
| 152261 | Brinco Coração Vazado com Pérola Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 157685 | Trio Gotinha de Pérola, Esfera e Ponto de Luz Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 158154 | Brinco Folha Oval Cravejada Banho de Ouro 18k | Banho de Ouro 18K | 3 | 0 | +3 |
| 159593 | Anel Solitario Cravejado Banho de Ouro 18k | Banho de Ouro 18k · n°18 | 1 | 0 | +1 |
| 161116 | Brinco Coração Turmalina G Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 161672 | Trio Coração, Estrela e Ponto de Luz Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 161731 | Brinco Gota Vazada Cravejada Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 162564 | Brinco Esfera Lisa e Vazada Texturizada Banho de Ouro 18k e Prata | Banho de Ouro 18K | 0 | 1 | -1 |
| 162565 | Brinco Esfera Lisa e Vazada Texturizada Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 162655 | Brinco Três Zircônias Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 162839 | Brinco Gota com Placa Retangular Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 163504 | Brinco Duas Esferas Grandes Banho de Ouro 18k e Prata | Banho de Ouro 18K | 1 | 0 | +1 |
| 163505 | Brinco Duas Esferas Grandes Banho de Ouro 18k | Banho de Ouro 18k | 2 | 0 | +2 |
| 164205 | Brinco Infantil Corações Banho de Ouro 18k | Banho de Ouro 18K | 3 | 4 | -1 |
| 164224 | Brinco Circulo Texturizado Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 164834 | Brinco Fio Passante com Coração Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 166634 | Argola Space Lisa Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 170308 | Brinco Ponto de Luz 10mm Banho de Ouro 18k | Banho de Ouro 18K | 1 | 3 | -2 |
| 171241 | Brincos Pontos de Luz Incolor Banho de Ouro | Banho de Ouro 18K | 2 | 1 | +1 |
| 172647 | Brinco Gota Cristal G Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 175799 | Argola Click Fina Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 178299 | Brinco Ponto de Luz Coração Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 179050 | Brinco Cinco Linhas Lisas Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 179468 | Brinco Coração Colorido Infantil Banho de Ouro 18k | Banho de Ouro 18k · Cristal | 0 | 1 | -1 |
| 181279 | Brinco Pequeno Borboleta Cravejada Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 183454 | Brinco Organico Liso Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 184977 | Argola Coração Cravejado Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 185127 | Brinco Borboleta Madrepérola Banho de Ouro 18k | Banho de Ouro 18k | 2 | 0 | +2 |
| 185190 | Brinco Ponto de Luz Cravação Inglesa Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 185245 | Brincos Pontos de Luz Coração Pink Banho de Ouro 18k | Pink | 0 | 1 | -1 |
| 191910 | Brinco Gota Dupla Grande Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 192668 | Argola Abaulada Lisa Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 192896 | Argola Média Triangular Lisa Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 192897 | Argola Grande Triangular Lisa Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 192920 | Brinco Coração Zircônias Coloridas Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 193176 | Brinco Esfera 6mm Lisa Banho de Ouro 18k | Banho de Ouro 18K | 3 | 4 | -1 |
| 193685 | Brinco Chapa Oval Liso Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 194149 | Brinco Coração Pendurado Colorido Infantil Banho de Ouro 18k | Banho de Ouro 18k · Cristal | 3 | 2 | +1 |
| 195384 | Brinco Gota Pequena Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 197702 | Brinco Coração Grande Vazado Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 198174 | Dupla Argola Lisa e Argola Zig Zag Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 198242 | Brinco Coração Pendurado Chapa Infantil Banho de Ouro | Banho de Ouro 18k · Cristal | 2 | 3 | -1 |
| 198939 | Brinco Texturizado Oval Banho de Ouro 18k | Banho de Ouro 18K | 3 | 2 | +1 |
| 210396 | Anel Aparador Cravejado Regulável Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 212138 | Pulseiras Bola Lisa Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 213649 | Berloque Pet Border Collie Banho de Prata | Banho de Prata | 0 | 1 | -1 |
| 215199 | Anel Infantil Coração e Zircônia Banho de Ouro 18k | Banho de Ouro 18K | 2 | 3 | -1 |
| 215328 | Piercing Texturizado Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 216029 | Colar Cordão Baiano 3mm Banho de Ouro 28k | Banho de Ouro 18K | 2 | 3 | -1 |
| 230609 | Berloque Pet Shih Tzu Banho de Prata | Banho de Prata | 0 | 1 | -1 |
| 234635 | Pulseira Pequenos Elos Banho de Ródio Branco | Banho de Ródio Branco | 0 | 1 | -1 |
| 241194 | Colar Esfera Oval Texturizada Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 243482 | Pulseira Elos Maxi Banho de Ouro 18k | Banho de Ouro 18k | 2 | 3 | -1 |
| 250475 | Colar Ponto de Luz Cravação Inglesa Banho de Ouro 18k | Banho de Ouro 18K | 5 | 2 | +3 |
| 257124 | Berloque Coração Coreano Banho de Prata | Banho de Prata | 0 | 1 | -1 |
| 257258 | Anel Infinito Liso e Zircônias Banho de Ouro 18k | Banho de Ouro 18K · n°22 | 0 | 1 | -1 |
| 261582 | Pulseira Trevo de Zircônias Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 265375 | Pulseira Elos Zircônias Incolor Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 265992 | Berloque Batata Frita Resinada Banho de Prata | Banho de Prata | 0 | 1 | -1 |
| 268267 | Berloque Separador Zircônias Cravejadas Banho de Prata | Banho de Prata | 0 | 1 | -1 |
| 269030 | Colar Coração Metade Liso e Metade Cravejado Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 271371 | Pulseira Coração e Medalha Seja Luz Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 272017 | Pulseira Trevo Madrepérola Prata 925 | Prata 925 | 1 | 0 | +1 |
| 273457 | Colar Choker Corações Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 273971 | Pingente e Separador Menina Zircônia Incolor Banho de Ouro 18k | Incolor | 3 | 4 | -1 |
| 273972 | Pingente e Separador Menino Zircônia Verde Banho de Prata | Verde | 0 | 1 | -1 |
| 273975 | Pingente e Separador Menino Zircônia Incolor Banho de Ouro 18k | Incolor | 4 | 5 | -1 |
| 276193 | Pulseira Dupla com Cruz Banho de Ouro 18k | Banho de Ouro 18K | 3 | 2 | +1 |
| 277069 | Berloque Separador Minnie e Mickey Banho de Prata | Banho de Prata | 0 | 1 | -1 |
| 287052 | Pulseira Gotas Trabalhadas Banho de Ouro 18k | Banho de Ouro 18k | 2 | 0 | +2 |
| 290290 | Colar Choker Fita Laminada Banho de Ouro 18k | Banho de Ouro 18K | 0 | 2 | -2 |
| 290346 | Berloque Casquinha de Sorvete Banho de Prata | Banho de Prata | 0 | 1 | -1 |
| 292234 | Berloque Borboleta Cristal Banho de Prata | Banho de Prata | 0 | 1 | -1 |
| 307721 | Escapulário N. S. Aparecida e Sag. Coração de Jesus Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 310231 | Colar Gota Incolor Cravação Inglesa Banho de Ouro 18k | Banho de Ouro 18K | 7 | 2 | +5 |
| 311208 | Colar Cordão Baiano 2mm Banho de Ouro 18k | Banho de Ouro 18K | 3 | 2 | +1 |
| 313860 | Anel Duplo Solitário e Aparador Zircônias Cravejadas Banho de Ouro 18k | Banho de Ouro 18k · n°18 | 1 | 0 | +1 |
| 317154 | Pulseira Elos Retangulares Banho de Ouro 18k | Banho de Ouro 18K | 4 | 2 | +2 |
| 321094 | Pulseira Corrente Cristal 4mm Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 321101 | Colar Gargatilha Quatro Bolas Banho de Prata | Banho de Prata | 1 | 0 | +1 |
| 321102 | Colar Gargatilha Quatro Bolas Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 322557 | Anel Pai Nosso e Cruz Cravejada Banho de Ouro 18k | Banho de Ouro 18K · n°19 | 6 | 2 | +4 |
| 324092 | Pulseira Esfera Quadrada Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 326458 | Colar Coração Texturizado Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 326603 | Pulseira Trabalhada Grande Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 331486 | Pulseira Veneziana Bola e Nossa Senhora Banho de Ouro 18k | Banho de Ouro 18k | 2 | 3 | -1 |
| 334343 | Colar Piastrine Banho de Ouro 18k | Banho de Ouro 18K | 4 | 5 | -1 |
| 340373 | Pulseira Coração Esticadinho Cravejado Banho de Ouro 18k | Banho de Ouro 18k | 1 | 3 | -2 |
| 344122 | Conjunto Redondo com Zircônias Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 346352 | Anel Cobra Cravejada Banho de Ouro 18k | Banho de Ouro 18K · n°22 | 0 | 1 | -1 |
| 346625 | Colar Mini Corações Banho de Prata | Banho de Prata | 1 | 0 | +1 |
| 347249 | Pulseira Borboleta Preta Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 352547 | Colar Masculino Elos Banho de Ouro 18k | Banho de Ouro 18k | 3 | 2 | +1 |
| 359219 | Pulseira Fita Torcida 2mm Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 359321 | Anel Quadrado Duplo Zircônias Cravejadas Banho de Ouro 18k | Banho de Ouro 18k · n°14 | 0 | 1 | -1 |
| 362747 | Colar Elos Longo Trabalhado Banho de Ouro 18k | Banho de Ouro 18K | 2 | 3 | -1 |
| 362820 | Pulseira Osso Pet Cravejado Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 362827 | Colar Choker Zircônias Pretas Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 365363 | Pulseira Esfera Oval Texturizada Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 370371 | Pulseira Coração Cravejado Pendurado Banho de Ouro 18k | Banho de Ouro 18k | 4 | 2 | +2 |
| 371010 | Colar Canutilho e Esfera Banho de Ouro 18k | Banho de Ouro 18k | 3 | 1 | +2 |
| 374979 | Colar Coração Cravejado Rosa Prata 925 | Prata 925 | 0 | 1 | -1 |
| 375786 | Pulseira Coração Zircônia Cristal Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 376199 | Colar Borboleta Preto Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 379282 | Pulseira Baguete Zircônias Incolor Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 381718 | Colar Nossa Senhora Gota Cravejada Banho de Ouro 18k | Banho de ouro 18k | 3 | 2 | +1 |
| 386928 | Pulseira Bota Country com Estrela Banho de Ouro 18k | Banho de Ouro 18k | 1 | 2 | -1 |
| 387095 | Anel Corações Liso Banho de Ouro 18k e Ródio Branco | Banho de Ouro 18k · n°12 | 0 | 1 | -1 |
| 387480 | Pulseira Esfera Oval Lisa Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 387876 | Anel Solitário com Pedra de Zircônia Prata 925 | Prata 925 · n°18 | 0 | 1 | -1 |
| 397684 | Colar Sol Liso Banho de Ouro 18k | Banho de Ouro 18K | 3 | 2 | +1 |
| 397728 | Pulseira Fita e Zircônias Banho de Ouro 18k | Banho de Ouro 18k | 4 | 3 | +1 |
| 399293 | Pulseira Masculina Infantil Grume Banho de Prata | Banho de Prata | 0 | 1 | -1 |
| 402393 | Colar Borboleta Zircônia Lilás Banho de Ouro 18k | Banho de Ouro 18K | 4 | 3 | +1 |
| 404197 | Pulseira Barrinhas Lisas Prata 925 | Prata 925 | 1 | 0 | +1 |
| 408629 | Pulseira Elos Hexagonal Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 412119 | Colar Coração Vazado Cravejado Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 416368 | Pulseira Esfera Maior e Menor Banho de Ouro 18k | Banho de Ouro 18k | 1 | 2 | -1 |
| 417528 | Anel Onda Regulavél Banho de Ouro 18k | Banho de Ouro 18K | 4 | 0 | +4 |
| 417615 | Pulseira Corações Chapa 6mm Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 420935 | Colar Choker Cubos e Pérolas Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 421089 | Anel Regulável Aro Duplo Liso Banho de Ouro 18K | Banho de Ouro 18K | 1 | 2 | -1 |
| 421683 | Colar Trevo Zircônia Incolor Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 422148 | Pulseira Bolinhas Lisa Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 425135 | Colar Arredondado com Cavalo e Ferradura Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 426579 | Tornozeleira Bolinhas Banho de Ouro 18k | Banho de Ouro 18k | 1 | 2 | -1 |
| 426964 | Colar Trevo Zircônia Rosa Claro Banho de Prata | Banho de Prata | 0 | 1 | -1 |
| 426965 | Colar Trevo Zircônia Rosa Claro Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 431806 | Colar Choker Snake Banho de Ouro 18k | Banho de Ouro 18K | 3 | 2 | +1 |
| 433062 | Colar Trevo Zircônia Verde Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 433595 | Anel Regulável Folhagem Cravejado Banho de Ouro 18K | Banho de Ouro 18K | 2 | 0 | +2 |
| 434324 | Colar Choker Zircônias Incolor Finas Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 435028 | Pulseira Corações Banho de Ouro 18k | Banho de Ouro 18k | 3 | 2 | +1 |
| 436815 | Anel Zigzag com Folhas Prata 925 | Prata 925 · n°19 | 0 | 1 | -1 |
| 453578 | Colar Veneziana 0.80 com Bolinhas Banho de Ouro 18k | Banho de Ouro 18k | 1 | 2 | -1 |
| 464293 | Colar Oval Rubi Cravejado Prata 925 | Prata 925 | 0 | 1 | -1 |
| 467183 | Anel Minimalista Cruz Prata 925 | Prata 925 · n°19 | 0 | 1 | -1 |
| 473505 | Colar Borboleta Zircônia Rosa Claro Banho de Ouro 18k | Banho de Ouro 18K | 3 | 2 | +1 |
| 474759 | Colar Gotas Trabalhadas Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 481867 | Colar Choker Riviera Colorida Lilás Banho de Ouro 18k | Roxo | 2 | 1 | +1 |
| 481868 | Colar Choker Riviera Colorida Azul Banho de Ouro 18k | Azul claro | 0 | 1 | -1 |
| 486476 | Pulseira Fina Fita Laminada Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 487423 | Pulseira Elo Portugues 6mm Banho de Ouro 18k | Banho de Ouro 18k | 3 | 1 | +2 |
| 490579 | Colar Trevo Cristal Prata 925 | Prata 925 | 1 | 0 | +1 |
| 496581 | Colar Flor Cravejada Zircônias Prata 925 | Prata 925 | 0 | 1 | -1 |
| 504452 | Conjunto Quadrado Liso e Cravejado Banho de Ouro 18k | Banho de Ouro 18K | 5 | 0 | +5 |
| 508946 | Pulseira Dupla Flor Incolor Banho de Ouro 18k | Banho de Ouro 18K | 4 | 2 | +2 |
| 512369 | Colar Pizza Cravejado Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 514825 | Colar Mini Medalhas 45 cm Banho de Ouro 18k | Banho de Ouro 18k | 2 | 3 | -1 |
| 520638 | Pulseira Mini Corações Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 520642 | Conjunto Circulo e Zircônia Banho de Ouro 18k | Banho de Ouro 18K | 1 | 2 | -1 |
| 530920 | Anel Quadrado Liso Banho de Ouro 18k | Banho de Ouro 18K · n°22 | 0 | 1 | -1 |
| 561106 | Pulseira Infinito com Borboleta Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 561638 | Colar Nossa Senhora Aparecida Banho de Ouro 18k | Banho de Ouro 18K | 2 | 0 | +2 |
| 563440 | Tornozeleira Corações Vazados Banho de Ouro 18k | Banho de Ouro 18k | 3 | 4 | -1 |
| 565583 | Anel Cravejado Borboletas Micro Zirconia Banho de Ouro 18k | Banho de Ouro 18K | 4 | 2 | +2 |
| 566355 | Colar Chave Coração Cravejada Banho de Ouro 18k | Banho de Ouro 18k | 1 | 2 | -1 |
| 570328 | Colar Cruz Zircônias Coloridas Banho de Prata | Banho de Prata | 1 | 0 | +1 |
| 582667 | Anel Zircônia Baguetes Pink Banho de Ouro 18k | Pink · n°17 | 0 | 1 | -1 |
| 583117 | Pulseira Elos Masculino Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 586903 | Colar Peixe Banho de Ouro 18k | Banho de Ouro 18K | 2 | 3 | -1 |
| 596742 | Colar Cruz Zircônias Lilás Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 615255 | Pulseira Pedra Color 4mm Banho de Ouro 18k | Banho de Ouro 18k | 3 | 2 | +1 |
| 623778 | Colar Masculino Cartie Longa 60cm Banho de Prata | Banho de Prata | 2 | 1 | +1 |
| 626317 | Pulseira Malha Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 629372 | Pulseira de Mão Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 630947 | Pulseira Infantil Mini Corações Entrelaçados Banho de Ouro 18k | Banho de Ouro 18k | 3 | 4 | -1 |
| 634041 | Piercing Fake Formato em V Banho de Ouro 18K | Banho de Ouro 18K | 0 | 1 | -1 |
| 637620 | Pulseira Snake Banho de Ouro 18k | Banho de Ouro 18K | 4 | 2 | +2 |
| 637628 | Colar Snake 50cm Banho de Ouro 18k | Banho de Ouro 18k | 2 | 3 | -1 |
| 641414 | Colar Florzinha Cravejada Prata 925 | Prata 925 | 1 | 0 | +1 |
| 653552 | Pulseira Cruz Lisa Banho de Ouro 18k | Banho de Ouro 18k | 1 | 3 | -2 |
| 661663 | Pulseira Elos Cartier Banho de Ouro 18k | Banho de Ouro 18K | 6 | 5 | +1 |
| 672049 | Pulseira Fita com Zircônias Coloridas Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 680894 | Pulseira Dupla Fio Laminado com Esfera Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 682250 | Colar Piastrine 50cm Banho de Ouro 18k | Banho de Ouro 18k | 11 | 3 | +8 |
| 684750 | Pulseira Três Quadrado Banho de Ouro 18k | Banho de Ouro 18k | 2 | 1 | +1 |
| 684919 | Colar Borboleta Zircônias Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 719239 | Pulseira Elo Oval Laminado Banho de Ouro 18k | Banho de Ouro 18k | 1 | 2 | -1 |
| 720540 | Conjunto Nossa Senhora Aparecida Zircônia Azul Prata 925 | Prata 925 | 1 | 0 | +1 |
| 734381 | Colar Borboleta Cravejado Banho de Ouro 18k | Banho de Ouro 18k | 1 | 0 | +1 |
| 737010 | Pulseira Folhas Duplas Texturizadas Banho de Ouro 18k | Banho de Ouro 18K | 3 | 1 | +2 |
| 740464 | Pulseira Masculina Cartie Diamantada Banho de Prata | Banho de Prata | 2 | 1 | +1 |
| 749482 | Pulseira Canutilhos com Esferas Banho de Ouro 18k | Banho de Ouro 18K | 4 | 1 | +3 |
| 771144 | Colar Espirito Santo Cravejado Prata 925 | Prata 925 | 1 | 0 | +1 |
| 789166 | Choker Penduricalhos Mini Corações Banho de Ouro 18k | Banho de Ouro 18K | 1 | 0 | +1 |
| 795008 | Colar Relicario de Coração  Banho de Ouro 18k | Banho de Ouro 18K | 2 | 3 | -1 |
| 811117 | Colar Masculino Elos Longo Fecho Gaveta Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 834925 | Colar Nossa Senhora Oval Cravejado Banho de Ouro 18k | Banho de Ouro 18K | 0 | 1 | -1 |
| 853432 | Choker Elos Grandes Banho de Ouro 18k | Banho de Ouro 18K | 4 | 1 | +3 |
| 888316 | Pulseira Fio Alemão 2,4mm Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 889171 | Pulseira Zircônias Baguete Coloridas Banho de Ouro 18k | Banho de Ouro 18k | 1 | 2 | -1 |
| 917690 | Anel Grande Orgânico Liso Vazado Banho de Ouro 18k | Banho de Ouro 18k | 0 | 1 | -1 |
| 925252 | Pulseira Dupla Coração Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 958365 | Colar Nossa Senhora Dupla Face Banho de Ouro 18k | Banho de Ouro 18K | 2 | 1 | +1 |
| 958989 | Pulseira Infantil Borboleta e Pedra Quadrada Colorida Banho de Ouro 18k | Banho de Ouro 18k | 2 | 3 | -1 |
| 966973 | Choker Elos e Pérolas Banho de Ouro 18k | Banho de Ouro 18K | 2 | 0 | +2 |
| 997619 | Conjunto Coração Cravejado Banho de Ouro 18k | Banho de Ouro 18K | 5 | 1 | +4 |
| 997620 | Conjunto Coração Cravejado Banho de Prata | Banho de Prata | 2 | 0 | +2 |

## Anexo B — exceções, linha a linha

| Classe | SKU | Produto | Variante | Nuvemshop (prod./var.) | Loja | Em casa | Motivo |
|---|---|---|---|---|---:|---:|---|
| so_nuvemshop | 131576 | Brinco Médio Elos Liso Banho de Ouro 18k | Banho de Ouro 18k | 288496457/1291107622 | 1 | — | SKU existe na loja e não existe no catálogo do Marquesa (ou está inativo): não é tocado. |
| so_nuvemshop | 349129 | Anel Losangos Cravejados Banho de Ouro 18k | Banho de Ouro 18K · n°18 | 305408398/1367340185 | 1 | — | SKU existe na loja e não existe no catálogo do Marquesa (ou está inativo): não é tocado. |
| so_sistema | 129561 | Argola Click Orgânica Banho de Ouro 18k | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 136013 | Argola Coração Cristal G Banho de Ouro 18k | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 143901 | Brinco Ear Cuff Folha Banho de Prata | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 147965 | Argola Lisa Banho de Ouro 18k | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 148019 | Dupla de Argolas Ovais Banho de Ouro 18k | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 152186 | Dupla de Argolas Três Linhas Cravejadas Banho de Prata | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 154906 | Brinco Redondo Perolado Banho de Prata | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 155548 | Brinco Borboletas Cravejado Banho de Prata | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 155602 | Brinco Circulo Cravejado Banho de Ouro 18k | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 156980 | Brincos Pontos de Luz Grande Azul Banho de Ouro | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 172648 | Trio Gota Cristal Banho de Ouro 18k | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 215246 | Colar Coração com Choker Duplo Três Corações Banho de Ouro 18k | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 276395 | Pulseira Coração Cravejado Prata 925 | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 341266 | Colar Gargantilha Gota Cravejado Vazado de Prata 925 (45cm) | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 347415 | Colar Ponto de Luz Círculo Cristal Prata 925 (45cm) | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 377284 | Colar Gargantilha Circulo Cravejado Prata 925 (45cm) | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| so_sistema | 562583 | Colar Coração Esmeralda com Zircônias Banho de Ouro 18k | — | —/— | — | 0 | Só existe no Marquesa (peças em maleta, nenhuma em casa). |
| variante_sem_mapeamento | 122809 | Brinco Infantil Quadrado Colorido Banho de Ouro 18k | Banho de Ouro 18K · Cristal | 359281258/1572455844 | 2 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 122809 | Brinco Infantil Quadrado Colorido Banho de Ouro 18k | Banho de Ouro 18K · Rosa | 359281258/1572455845 | 1 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 122809 | Brinco Infantil Quadrado Colorido Banho de Ouro 18k | Banho de Ouro 18K · Verde | 359281258/1572455846 | 1 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 122809 | Brinco Infantil Quadrado Colorido Banho de Ouro 18k | Banho de Ouro 18K · Vermelho | 359281258/1572455847 | 1 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 122809 | Brinco Infantil Quadrado Colorido Banho de Ouro 18k | Banho de Ouro 18K · Azul | 359281258/1572455848 | 1 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 132721 | Brinco Infantil Libélula e Zircônia Colorida Banho de Ouro 18k | Banho de Ouro 18K · Cristal | 359281268/1572457904 | 4 | 3 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 132721 | Brinco Infantil Libélula e Zircônia Colorida Banho de Ouro 18k | Banho de Ouro 18K · Pink | 359281268/1572457905 | 1 | 3 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 132721 | Brinco Infantil Libélula e Zircônia Colorida Banho de Ouro 18k | Banho de Ouro 18K · Vermelho | 359281268/1572457907 | 1 | 3 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 132721 | Brinco Infantil Libélula e Zircônia Colorida Banho de Ouro 18k | Banho de Ouro 18K · Verde | 359281268/1572457908 | 1 | 3 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 191620 | Brinco Corações Pendurado Colorido Infantil Banho de Ouro 18k | Banho de Ouro 18k · Cristal | 281074221/1259096830 | 1 | 3 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 191620 | Brinco Corações Pendurado Colorido Infantil Banho de Ouro 18k | Banho de Ouro 18k · Verde | 281074221/1259096834 | 1 | 3 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 218178 | Anel Micro Zirconia Banho de Ouro 18k | Banho de Ouro 18k · n°20 | 288496735/1320426729 | 3 | 1 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 218178 | Anel Micro Zirconia Banho de Ouro 18k | Banho de Ouro 18k · n°17 | 288496735/1320426737 | 1 | 1 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 224398 | Anel Regulavel Triângulo Zircônias Banho de Ouro 18k | Banho de Ouro 18k · n°14 | 288496636/1320426010 | 3 | 1 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 224398 | Anel Regulavel Triângulo Zircônias Banho de Ouro 18k | Banho de Ouro 18k · n°17 | 288496636/1559595478 | 1 | 1 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 224398 | Anel Regulavel Triângulo Zircônias Banho de Ouro 18k | Banho de Ouro 18k · n°19 | 288496636/1572998000 | 1 | 1 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 235290 | Anel Oval Vazado Banho de Ouro 18k | Banho de Ouro 18K · n°22 | 359126358/1570674445 | 8 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 235290 | Anel Oval Vazado Banho de Ouro 18k | Banho de Ouro 18K · n°19 | 359126358/1570674447 | 3 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 235290 | Anel Oval Vazado Banho de Ouro 18k | Banho de Ouro 18K · n°23 | 359126358/1570674450 | 2 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 256359 | Anel Inspiração Cartier Banho de Ouro 18k | Banho de Ouro 18K · n°17 | 359126242/1570651681 | 1 | 6 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 256359 | Anel Inspiração Cartier Banho de Ouro 18k | Banho de Ouro 18K · n°24 | 359126242/1570651682 | 1 | 6 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 256359 | Anel Inspiração Cartier Banho de Ouro 18k | Banho de Ouro 18K · n°21 | 359126242/1570651683 | 1 | 6 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 256359 | Anel Inspiração Cartier Banho de Ouro 18k | Banho de Ouro 18K · n°15 | 359126242/1572988547 | 1 | 6 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 256359 | Anel Inspiração Cartier Banho de Ouro 18k | Banho de Ouro 18K · N°23 | 359126242/1612443787 | 2 | 6 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 263571 | Anel Topo Reto Cravejado Banho de Ouro 18k | Banho de Ouro 18K · n°21 | 359126126/1570647372 | 4 | 3 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 263571 | Anel Topo Reto Cravejado Banho de Ouro 18k | Banho de Ouro 18K · n°24 | 359126126/1570647374 | 2 | 3 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 263571 | Anel Topo Reto Cravejado Banho de Ouro 18k | Banho de Ouro 18K · n°18 | 359126126/1570647375 | 1 | 3 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 268352 | Anel Base Reta com Zircônia Banho de Ouro 18k | Banho de Ouro 18K · n°17 | 359126319/1572981997 | 3 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 268352 | Anel Base Reta com Zircônia Banho de Ouro 18k | Banho de Ouro 18K · n°18 | 359126319/1572981998 | 1 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 268600 | Anel Nossa Senhora Incolor Banho de Prata | Banho de Ouro 18K · n°18 | 359126603/1570802791 | 3 | 3 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 268600 | Anel Nossa Senhora Incolor Banho de Prata | Banho de Ouro 18K · n°16 | 359126603/1570802792 | 1 | 3 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 268600 | Anel Nossa Senhora Incolor Banho de Prata | Banho de Ouro 18K · n°23 | 359126603/1570802794 | 1 | 3 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 275922 | Anel Duplo Elos e Zircônias Banho de Ouro 18k | Banho de Ouro 18K · n°20 | 359126497/1570679003 | 4 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 275922 | Anel Duplo Elos e Zircônias Banho de Ouro 18k | Banho de Ouro 18K · n°24 | 359126497/1570679004 | 1 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 275922 | Anel Duplo Elos e Zircônias Banho de Ouro 18k | Banho de Ouro 18K · n°17 | 359126497/1570679005 | 1 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 275922 | Anel Duplo Elos e Zircônias Banho de Ouro 18k | Banho de Ouro 18K · n°15 | 359126497/1570679006 | 1 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 315220 | Anel Coração Cravejado Banho de Ouro 18k | n°21 | 305408402/1367348996 | 6 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 315220 | Anel Coração Cravejado Banho de Ouro 18k | n°14 | 305408402/1367349000 | 2 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 315220 | Anel Coração Cravejado Banho de Ouro 18k | n°23 | 305408402/1555020491 | 1 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 315220 | Anel Coração Cravejado Banho de Ouro 18k | n°22 | 305408402/1572996855 | 1 | 5 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 316411 | Anel Solitário Zircônia 9mm Banho de Ouro 18k | Banho de Ouro 18K · n°18 | 359126269/1570654387 | 7 | 8 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 316411 | Anel Solitário Zircônia 9mm Banho de Ouro 18k | Banho de Ouro 18K · n°24 | 359126269/1570654388 | 1 | 8 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 316411 | Anel Solitário Zircônia 9mm Banho de Ouro 18k | Banho de Ouro 18K · n°21 | 359126269/1570654389 | 1 | 8 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 316411 | Anel Solitário Zircônia 9mm Banho de Ouro 18k | Banho de Ouro 18K · n°20 | 359126269/1570654390 | 2 | 8 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 316411 | Anel Solitário Zircônia 9mm Banho de Ouro 18k | Banho de Ouro 18K · n°16 | 359126269/1570654391 | 1 | 8 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 316411 | Anel Solitário Zircônia 9mm Banho de Ouro 18k | Banho de Ouro 18K · n°22 | 359126269/1572983298 | 1 | 8 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 334079 | Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | Banho de Ouro 18K · n°19 | 359125970/1570614499 | 5 | 5 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 334079 | Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | Banho de Ouro 18K · n°17 | 359125970/1570614501 | 1 | 5 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 334079 | Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | Banho de Ouro 18K · n°18 | 359125970/1570614503 | 1 | 5 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 334079 | Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | Banho de Ouro 18K · n°14 | 359125970/1570614507 | 1 | 5 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 334079 | Anel Solitário Coroa 5mm Cravejado Cristal Banho de Ouro 18k | Banho de Ouro 18K · n°27 | 359125970/1570614509 | 1 | 5 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 346802 | Anel Design Infinito Banho de Ouro 18k e Ródio Branco | Banho de Ouro 18k · n°16 | 288496587/1320415513 | 3 | 1 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 346802 | Anel Design Infinito Banho de Ouro 18k e Ródio Branco | Banho de Ouro 18k · n°21 | 288496587/1320415519 | 1 | 1 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 351489 | Anel Solitário com Pedra de Zirconia Banho de Ouro 18k | Banho de Ouro 18k · n°14 | 288496605/1320412353 | 2 | 2 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 351489 | Anel Solitário com Pedra de Zirconia Banho de Ouro 18k | Banho de Ouro 18k · n°18 | 288496605/1320412368 | 1 | 2 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 353022 | Anel Quadrado Duplo Micro Zircônias Banho de Ouro 18k | Banho de Ouro 18k · n°17 | 288496609/1320420694 | 5 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 353022 | Anel Quadrado Duplo Micro Zircônias Banho de Ouro 18k | Banho de Ouro 18k · n°15 | 288496609/1320420698 | 1 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 353022 | Anel Quadrado Duplo Micro Zircônias Banho de Ouro 18k | Banho de Ouro 18k · n°21 | 288496609/1559743369 | 2 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 377535 | Anel Linhas e X Cravejado Banho de Ouro 18k | Banho de Ouro 18K · n°14 | 359126581/1570797927 | 4 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 377535 | Anel Linhas e X Cravejado Banho de Ouro 18k | Banho de Ouro 18K · n°18 | 359126581/1570797928 | 2 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 377535 | Anel Linhas e X Cravejado Banho de Ouro 18k | Banho de Ouro 18K · n°19 | 359126581/1570797930 | 1 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 381783 | Anel Solitário Aro Duplo Zircônias Cravejadas Banho de Ouro 18k | Banho de Ouro 18k · n°19 | 288496620/1320408539 | 3 | 2 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 381783 | Anel Solitário Aro Duplo Zircônias Cravejadas Banho de Ouro 18k | Banho de Ouro 18k · n°15 | 288496620/1320408545 | 2 | 2 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 382662 | Anel Lateral Vazada com Detalhes Zircônias Banho de Ouro 18k | Banho de Ouro 18k · n°14 | 288496606/1320413815 | 3 | 2 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 382662 | Anel Lateral Vazada com Detalhes Zircônias Banho de Ouro 18k | Banho de Ouro 18k · n°18 | 288496606/1559743613 | 1 | 2 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 382662 | Anel Lateral Vazada com Detalhes Zircônias Banho de Ouro 18k | Banho de Ouro 18k · n°24 | 288496606/1572976683 | 1 | 2 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 392893 | Anel Nossa Senhora Zircônia Azul Banho de Prata | Banho de Ouro 18K · n°19 | 359126697/1570809896 | 4 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 392893 | Anel Nossa Senhora Zircônia Azul Banho de Prata | Banho de Ouro 18K · n°15 | 359126697/1570809897 | 1 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 392893 | Anel Nossa Senhora Zircônia Azul Banho de Prata | Banho de Ouro 18K · n°17 | 359126697/1570809898 | 1 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 392893 | Anel Nossa Senhora Zircônia Azul Banho de Prata | Banho de Ouro 18K · n°21 | 359126697/1570809899 | 1 | 4 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 393950 | Anel Minimalista Cruz Banho de Ouro 18k e Ródio Branco | Banho de Ouro 18k · n°12 | 288496594/1320414731 | 2 | 2 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 393950 | Anel Minimalista Cruz Banho de Ouro 18k e Ródio Branco | Banho de Ouro 18k · n°14 | 288496594/1320414736 | 1 | 2 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 635650 | Anel Solitario com Linhas Cravejadas Banho de Ouro 18k | Banho de Ouro 18k · n°19 | 288496301/1320419893 | 2 | 1 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 635650 | Anel Solitario com Linhas Cravejadas Banho de Ouro 18k | Banho de Ouro 18k · n°21 | 288496301/1572985671 | 1 | 1 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 647729 | Anel Solitário Coroa 6mm Cravejado Cristal Banho de Ouro 18k | Banho de Ouro 18K · n°16 | 359126078/1570618509 | 1 | 6 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 647729 | Anel Solitário Coroa 6mm Cravejado Cristal Banho de Ouro 18k | Banho de Ouro 18K · n°19 | 359126078/1570618511 | 2 | 6 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 647729 | Anel Solitário Coroa 6mm Cravejado Cristal Banho de Ouro 18k | Banho de Ouro 18K · n°22 | 359126078/1570618513 | 2 | 6 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 711591 | Anel Solitário Zircônias 8mm Incolor Banho de Ouro 18k | Banho de Ouro 18K · n°13 | 313808636/1390473775 | 2 | 2 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 711591 | Anel Solitário Zircônias 8mm Incolor Banho de Ouro 18k | Banho de Ouro 18K · n°15 | 313808636/1390473781 | 1 | 2 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 717389 | Anel Solitário Zircônias 6mm Incolor Banho de Ouro 18k | Banho de Ouro 18K · n°25 | 313808603/1431688892 | 2 | 1 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 717389 | Anel Solitário Zircônias 6mm Incolor Banho de Ouro 18k | Banho de Ouro 18K · n°18 | 313808603/1554996715 | 1 | 1 | O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma. (sem_reparticao) |
| variante_sem_mapeamento | 750894 | Anel Liso Topo Reto Banho de Ouro 18k | Banho de Ouro 18K · n°22 | 313808652/1390479749 | 2 | 1 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
| variante_sem_mapeamento | 750894 | Anel Liso Topo Reto Banho de Ouro 18k | Banho de Ouro 18K · n°16 | 313808652/1390479755 | 1 | 1 | Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu. (maleta) |
