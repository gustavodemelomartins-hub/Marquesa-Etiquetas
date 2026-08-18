# Motor de sincronização

[api/src/sync.js](../api/src/sync.js) · 544 linhas · função de entrada
`sincronizar(db, env, { forcar, seco })`.

## O fluxo real

```
Ler loja            loja.produtos()          — todas as páginas
      ↓
Mapear SKUs         mapearSkus()             — SKU → variações, duplicados
      ↓
Puxar pedidos       puxarPedidos()           — pedido do site vira venda daqui
      ↓
Semear variações    semearVariacoes()        — só código virgem, só se a soma bater
      ↓
Calcular estoque    empurrarEstoque()        — "em casa" = total − consignado
      ↓
Freios              limite de mudanças / limite de zerados
      ↓
Escrever ou pausar  PATCH em lotes de 25  |  status 'pausado'
      ↓
Snapshot            gravarRetratoDaLoja()    — sempre, inclusive seco/pausado
```

Cada rodada abre uma linha em `sync_execucoes` com status `rodando` e a
fecha em `ok`, `pausado` ou `erro`, com o relato inteiro em `detalhe_json`.

## A ordem é a decisão mais importante do arquivo

**Puxar antes de empurrar.** Não é preferência de organização: inverter
quebra o sistema.

A Nuvemshop baixa o estoque dela sozinha quando alguém compra, e nós não
ficamos sabendo. Se o empurrão viesse primeiro, mandaria o nosso número
antigo — sem a venda — de volta para a loja, **recolocando à venda uma peça
que já saiu**. Toda venda online seria desfeita na sincronização seguinte.

`src/sync-test.mjs` trava isso: vende no site, sincroniza, e confere que a
loja recebeu o número **novo**.

## 1. Puxar pedidos

Cada pedido vira uma venda com `origem='site'` e
`externo_id = "nuvemshop:<id>"`.

- **Janela**: a partir de `config.syncUltimoPedido` menos **6 horas**.
  Pedido que demora a aparecer na listagem não pode cair no vão entre duas
  rodadas. A marca d'água só avança no fim.
- **Idempotência**: o índice único `vendas.externo_id`. Reler não custa nada
  porque o banco recusa a duplicata — a trava é do banco, não da lógica.
- **Pedido cancelado no site** (`status === 'cancelled'` ou `cancelled_at`)
  nunca vira venda.
- **Item que não casa com o catálogo** vai para `relato.itensIgnorados` e
  aparece na tela (§22: sinalizar, não engolir). Um pedido cujos itens todos
  são desconhecidos não cria venda nenhuma.

Cada linha gera `venda_itens` + `movimentar(tipo:'venda', origem:'site')`,
tudo num `db.batch()` único.

## 2. Semear variações

Reparte sozinho, a partir do que a loja já tem, o estoque dos códigos
vendidos em mais de uma opção. Roda **antes** do empurrão, para um código
recém-repartido já sair no ar na mesma rodada.

Duas regras seguram o que essa automação pode fazer:

**Regra 1 — só semeia código virgem.** Se qualquer peça daquele código já
foi atribuída a uma variação (por repartição, venda ou contagem), a rodada
não encosta nele. Sem isso, a sincronização da madrugada desfaria a correção
feita à mão na véspera — o pior tipo de bug, o que apaga trabalho de alguém
enquanto ninguém olha.

**Regra 2 — a soma da loja é o atestado.** Bateu com o nosso total, a
repartição dela entra inteira. **Não bateu, não se reparte nada**, e o caso
vai para `relato.naoSemeados` com os dois números.

> Servir as variações na ordem até o total acabar parece razoável e é
> péssimo: a loja carrega a herança do bug antigo, que escrevia o total do
> código inteiro na primeira variação. Servir na ordem daria tudo para a
> primeira e **zero** para as outras — reproduzindo o bug e levando o zero
> de volta para a loja. O freio da rodada barrou exatamente esse cenário
> real, com 16 produtos que seriam zerados.

A repartição vira **dois movimentos que se anulam** no total: `+qtd` na
variação, `−qtd` sem variação. O total do código não muda — repartir e
corrigir o total são atos diferentes.

## 3. Calcular estoque

```
em casa = produtos.qtd − consignado em maletas 'aberta' ou 'em_acerto'
```

Kits saem dessa fórmula: `qtd` de um kit é sempre 0, então ela diria
"casa = 0" mesmo com peça de sobra. Cada kit é resolvido por `saldosDoSku`,
que calcula o mínimo entre os componentes.

Para código com mais de uma variação, o alvo é o saldo **por variação** —
`SUM(qtd) GROUP BY sku, variacao`, a mesma soma do total, só mais fina.

Os três impedimentos (`duplicado`, `maleta`, `sem_reparticao`) estão em
[NUVEMSHOP_INTEGRATION.md](NUVEMSHOP_INTEGRATION.md).

## 4. Freios de segurança

Antes de escrever, a rodada compara o tamanho da mudança com dois limites,
ambos em `config` e editáveis:

| Chave | Padrão | Pausa quando |
|---|---|---|
| `syncLimiteMudancas` | 40 | a rodada mudaria mais que isso de produtos |
| `syncLimiteZerar` | 15 | a rodada zeraria mais que isso de produtos na loja |

Mudança em massa quase sempre é dado nosso quebrado — uma importação que
entrou errada, uma maleta lançada em dobro — e não a loja inteira tendo se
esgotado de uma vez. Empurrar apaga o estoque real da loja e ela **para de
vender**.

Pausar não é falhar: a rodada grava `status='pausado'`, o motivo em
`relato.pausado`, o retrato da loja, e espera alguém olhar.

`forcar: true` pula o freio. **O cron nunca força** — um robô de madrugada é
o pior lugar possível para atropelar uma dúvida.

## 5. Escrever ou parar

Rodada seca (`seco: true`) sai aqui: leu tudo, calculou tudo, não escreveu
nada na loja.

A escrita agrupa as mudanças por produto e manda em lotes de 25 via
`PATCH /products/stock-price`. Depois marca `relato.aplicado = true` e grava
`config.syncUltimoEstoque`.

## 6. Gravar o retrato da loja

`gravarRetratoDaLoja` guarda o que a rodada leu: `url_loja`, `estoque_loja`,
`visivel`, `nome_loja`, a tabela `produto_variacoes` inteira e a linha de
`loja_snapshot`.

- **Onde houve empurrão, vale o número empurrado**, não o que foi lido antes
  dele — senão o retrato nasceria velho por uma rodada.
- **Limpa antes de reescrever**: produto tirado do ar na Nuvemshop precisa
  deixar de constar como publicado aqui.
- **Rodada seca e rodada pausada também gravam.** Elas não escreveram na
  loja, mas leram a loja de verdade — e é justamente aí que ver o retrato
  certo mais importa: é a tela em que ela decide se manda aplicar.
- Os códigos não empurrados vão para `config.lojaVariacoes`, e daí para a
  tela. Um código que a sincronização não atualiza e não anuncia é pior do
  que um que ela erra, porque ninguém fica sabendo.

## Como disparar

| Caminho | Efeito |
|---|---|
| Cron `0 9,21 * * *` (UTC) = 06:00 e 18:00 Brasília | Rodada completa, **nunca** com `forcar` |
| `POST /api/sync` `{}` | Rodada completa |
| `POST /api/sync` `{ "seco": true }` | Dry-run: lê e calcula, não escreve na loja |
| `POST /api/sync` `{ "forcar": true }` | Ignora o freio |
| `GET /api/sync` | Histórico das últimas 20 rodadas |

Duas vezes por dia, e não de hora em hora, de propósito: cada rodada lê a
loja inteira, e o ganho de rodar mais vezes não paga o gasto.

## O que o dry-run escreve, e o que não escreve

`POST /api/sync {"seco": true}` **não** é "zero escrita absoluta", e tratá-lo
como se fosse é o erro que o motor de reconciliação herdaria. Ele não escreve
nada que represente peça física; escreve metadado de leitura.

Cada linha desta tabela é provada por `src/dry-run-test.mjs`, que fotografa
as tabelas direto do SQLite antes e depois — não pergunta à API o que ela
acha que fez.

| Recurso | Dry-run altera? | Motivo |
|---|---|---|
| `produtos.qtd` | **Não** | `movimentar` nunca é chamado. É a invariante do §19 |
| `movimentos` | **Não** | A razão contábil não recebe uma linha sequer |
| `vendas` | **Não** | `puxarPedidos` conta a venda no relato e sai antes do INSERT |
| `venda_itens` | **Não** | Idem — o INSERT está depois do mesmo `if (seco)` |
| `config.syncUltimoPedido` | **Não** | Avançar faria a rodada REAL seguinte pular pedidos nunca lidos: venda perdida em silêncio |
| `config.syncUltimoEstoque` | **Não** | Fica depois do `return` do empurrão |
| **Nuvemshop (PATCH)** | **Não** | `if (seco) return` vem antes de `atualizarEstoque` |
| `produtos.estoque_loja`, `url_loja`, `visivel`, `nome_loja` | **Sim** | Colunas-espelho: são o retrato do que a LOJA tem, relido a cada rodada. Nenhuma delas é saldo |
| `produto_variacoes` | **Sim** | Apagada e regravada do zero: a loja é a fonte da verdade sobre quais variações existem. O saldo não mora aqui, mora em `movimentos` |
| `config.lojaVariacoes` | **Sim** | A lista do que a rodada decidiu não empurrar. Existe para a tela poder anunciar (§9) |
| `loja_snapshot` | **Sim** | O retrato da leitura: quantos produtos, quantos casaram, quais duplicados |
| `sync_execucoes` | **Sim** | Uma linha por rodada, inclusive seca. A coluna `seco` diz qual foi |

O critério que separa as duas metades: **a coluna representa peça física ou
representa o que acabou de ser lido da loja?** Espelho de leitura pode ser
atualizado por quem leu. Saldo, não.

### `sync_execucoes.seco` — a análise não é a sincronização

`resumoSync` responde a saúde operacional (`ultimaEm`, `ultimoStatus`,
`pausada`, `erro`) olhando **só as execuções com `seco = 0`**:

```sql
SELECT * FROM sync_execucoes WHERE seco = 0 ORDER BY id DESC LIMIT 1
```

Sem esse filtro, uma rodada real que falhasse no PATCH, seguida de um
dry-run que passasse, deixaria o resumo dizendo "tudo bem" — uma falha real
escondida atrás de uma leitura, contrariando a regra 9 do `CLAUDE.md`.
Corrigido em 2026-08-18 ([TECH_DEBT.md](TECH_DEBT.md) item 12, RESOLVIDO):
`seco` é gravado no **INSERT**, não derivado do relato no fim, então o
filtro funciona mesmo enquanto a linha ainda está `'rodando'`.

Uma análise continua gravada e auditável — `ultimaAnaliseEm` expõe quando a
última rodou, **separado** de propósito da saúde operacional. Ver
`diagnosticarSync` em `frontend/src/features/nuvemshop/saude.ts` e
[FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md). Provado por
`src/saude-sync-test.mjs`.

## Invariantes que qualquer mudança precisa preservar

1. Puxar **antes** de empurrar.
2. `vendas.externo_id` único — sem ele, cron repetido cobra venda duas vezes.
3. Semeadura só em código virgem, e só quando a soma da loja bate.
4. Nenhum caminho escreve `produtos.qtd` fora de `movimentar`.
5. O freio existe e o cron não o ignora.
6. O que a rodada decidiu não fazer é **anunciado**, não engolido.
7. A rodada seca não toca em estoque, razão contábil, vendas nem na loja —
   a tabela acima é a fronteira, e `src/dry-run-test.mjs` a defende.
