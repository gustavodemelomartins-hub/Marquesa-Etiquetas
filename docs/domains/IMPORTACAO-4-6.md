# Importações relacionadas — Fase 4.6

Documento canônico da Fase 4, item 6 do
[Master Plan](../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md) § 30.
Fecha a Fase 4 (Estoque e Catálogo). Auditoria e correção em **11/09/2026**.

---

## 1. O que este item audita

Toda importação de planilha que ajusta ou cria produto, confrontada contra
os modelos que a Fase 4.1–4.5 consolidou: razão de estoque, SKU
normalizado, kits, inventário, categorias estáveis, galeria de fotos e
configurações montáveis (Monte seu Colar, §42).

Três caminhos fazem esse trabalho hoje, e a auditoria olhou os três:

| Caminho | Onde mora | Quem chama |
|---|---|---|
| `POST /api/produtos/importar` | `api/src/catalogo-comandos.js › importarProdutos` | dashboard legado (acerto de maleta com código desconhecido) |
| `POST /api/estoque-total/analisar\|aplicar` + `POST /api/produtos/novos/analisar\|cadastrar` | `api/src/catalogo.js` | rotas de compatibilidade; não chamadas pelo painel novo |
| `POST /api/reconciliacao/planilha/estoque-total/analisar` + `.../produtos-novos/analisar` | `api/src/reconciliacao.js` | **`frontend/src/features/estoque-total/api.ts`** — o caminho real do painel React |

Preservada em todos: a sequência **analisar → comparar → gerar diff →
validar → aplicar** (skill `marquesa-safe-import`), nunca escrita direta em
`produtos.qtd`, nunca inferência de SKU por semelhança, nunca destino
Nuvemshop.

## 2. O defeito encontrado — o mesmo, em três lugares

Nenhum dos três caminhos sabia que existiam **kits** (CAT-04) e
**configurações montáveis** (§42, Fase 4.3) desde antes da 4.5. Uma
configuração montável é uma linha comum em `produtos`, mas o `qtd` dela é
residual e deliberadamente ignorado pela leitura
(`estoque.js › saldosDaConfiguracao`) — o disponível dela vem sempre dos
componentes, nunca da coluna.

A escrita não sabia disso. Uma planilha de Estoque Total que citasse o SKU
comercial de uma configuração — ou um kit — comparava o número da planilha
contra esse resíduo e gravava um `ajuste` de verdade em cima dele, pela
mesma `estoque.js › movimentar` que qualquer peça real usa. Nenhuma regra
fundamental foi quebrada (o ajuste sempre passou pelo razão, nunca por
`UPDATE` direto), mas o resíduo de uma configuração — que a leitura promete
ignorar — deixava de ser estável.

**Isto não é hipotético.** `montagem-saldo-test.mjs` já documentava o
efeito observado em produção: o SKU `326660` (Colar Casal) tem `1` no
`qtd`, herdado de uma importação antiga. A correção da 4.6 impede que essa
mesma importação — ou qualquer nova — volte a escrever ali.

`catalogo-comandos.js` nem tinha exclusão de **kit**; a proteção existente
era só para o caminho de `catalogo.js`, e mesmo essa nunca soube de
configuração montável.

`api/src/catalogo.js` e `api/src/reconciliacao.js` tinham um segundo
defeito, independente: categoria ausente ou desconhecida na planilha caía
em `'Outros'` — a semântica de **antes** da Fase 4.5, quando `'Outros'`
ainda era o código para ausência. Desde a 4.5, `'Outros'` é categoria real
(§5 de [CATALOGO-MIDIA-PUBLICACAO-4-5.md](CATALOGO-MIDIA-PUBLICACAO-4-5.md))
e a ausência tem nome próprio: a sentinela `Sem categoria`. Empilhar peça
não classificada em `'Outros'` poluiria a única categoria que alguém usa de
verdade para "isso é outra coisa mesmo". Nenhum dos dois caminhos casava
categoria pela forma canônica (`nome_norm`) nem filtrava categoria
arquivada — `"colar"` e `"Colar"` eram tratadas como categorias diferentes.

`api/src/catalogo-comandos.js › importarProdutos` já usava a sentinela
corretamente desde a 4.5; só faltava o casamento normalizado e o filtro de
categoria viva, que este item também fechou.

## 3. O que foi corrigido

Em `api/src/catalogo.js`, `api/src/catalogo-comandos.js` e
`api/src/reconciliacao.js`:

- kit (`kit_componentes`) e configuração montável
  (`personalizacao_modelos.sku_comercial`) passam a ser reconhecidos antes
  de qualquer ajuste de quantidade. Encontrados, o item nunca é gerado —
  vira revisão (`catalogo.js`), aviso `sem_saldo_proprio`
  (`catalogo-comandos.js`) ou entra em uma lista própria
  `semSaldoProprio`/`skusSemSaldoProprio` no resumo da sessão
  (`reconciliacao.js`). A ficha (`desc`/`cat`/`preco`) continua
  atualizável — só a quantidade é protegida;
- em `reconciliacao.js`, uma segunda trava (defesa em profundidade) foi
  adicionada em `checarPreconditionsInternas`: se um SKU virar kit ou
  configuração **depois** da análise mas **antes** do Apply — sessão
  aprovada, janela entre um clique e outro — o item vira `obsoleto` em vez
  de aplicado;
- categoria não informada ou não reconhecida cai na sentinela
  `SEM_CATEGORIA` (`'Sem categoria'`), nunca em `'Outros'`;
- o casamento de categoria passa a ser pela forma canônica
  (`categorias.nome_norm`, o mesmo índice que a Fase 4.5 criou), e só entre
  categoria viva (`arquivada_em IS NULL`). `"colar"`, `"Colar"` e
  `"Colar "` passam a reconhecer a mesma categoria.

Nenhuma regra de negócio nova. Nenhuma migration. Nenhuma mudança de
contrato HTTP — mesmos métodos, mesmos caminhos, mesmos campos de entrada;
só a classificação interna mudou.

## 4. O que este item NÃO faz

- não mexe no motor de sincronização com a Nuvemshop (`sync.js`) nem na
  reconciliação de origem `nuvemshop` — o kit já tem exclusão parcial ali
  (`lerBaseEstoqueLoja › ehKit`), mas configuração montável não. É risco
  real, mas é Fase 7 (Nuvemshop, sync e reconciliação), não Fase 4.6, e
  fica anunciado aqui em vez de resolvido por conta própria;
- não decide semântica nova de kit ou de "giro" — proibido por
  `.claude/rules/business-rules.md`;
- não altera `dados.cat` de peça já cadastrada — só o cadastro de peça
  nova passa a resolver categoria corretamente;
- não aplica nada em produção, não roda migration, não publica.

## 5. Provas

- `src/catalogo-test.mjs` §13–14 (18 provas novas): kit e configuração
  montável nunca viram `ajuste_qtd`/`ajuste` via `/api/estoque-total/*` nem
  via `/api/produtos/importar`; ficha atualiza, saldo não; categoria
  sentinela e casamento normalizado;
- `src/reconciliacao-test.mjs` §26–27 (14 provas novas): o mesmo, contra o
  motor `/api/reconciliacao/planilha/*` — o caminho que o painel React
  chama de verdade. Prova inclusive a coluna crua de `produtos.qtd` (não só
  a leitura, que já mascarava o resíduo por outro motivo) e a ausência de
  qualquer novo movimento de `ajuste`;
- `src/kits-test.mjs`, `src/catalogo-4-5-test.mjs`, `src/variacoes-test.mjs`,
  `src/montagem-saldo-test.mjs`, `src/montagem-integracao-test.mjs`,
  `scripts/razao-estoque.test.mjs` — sem regressão.

## 6. Pendências

Nenhuma decisão humana nova. A única dívida anunciada é a exclusão de
configuração montável no motor de sincronização Nuvemshop (§4 acima),
registrada aqui para a Fase 7 achar sem precisar reaudit-ar.
