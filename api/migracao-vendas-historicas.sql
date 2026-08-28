-- Camada derivada: a VENDA histórica, reconstruída a partir dos itens.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE ESTA TABELA EXISTE — e o que ela revoga
--
-- `migracao-vendas-historico.sql` decidiu, em 2026-08-27, que contagem de
-- pedidos e ticket médio histórico ficariam INDISPONÍVEIS por construção: a
-- planilha numera linhas, não pedidos, e agrupar sem regra validada seria
-- invenção. A decisão estava certa para o que se sabia na época.
--
-- Em 2026-08-28 o dono do negócio esclareceu como a operação funcionava, e
-- a regra passou a existir:
--
--     MESMO CLIENTE NORMALIZADO + MESMA DATA = UMA VENDA HISTÓRICA.
--
-- As linhas daquele grupo são os ITENS daquela venda. Uma cliente que
-- aparece 36 vezes em 13/06/2026 comprou 36 peças numa venda só — não fez
-- 36 compras. E o que NÃO é venda (acerto, ajuste, perda) vem escrito na
-- própria planilha, na coluna `Observação Venda`; não se deduz do tamanho
-- do grupo. A leitura anterior — "36 linhas, logo é acerto de maleta" — era
-- inferência por volume, e está revogada.
--
-- ─────────────────────────────────────────────────────────────────────────
-- O BRUTO CONTINUA INTOCADO
--
-- Nenhuma linha de `vendas_historico_itens` é reescrita, apagada ou
-- reinterpretada aqui. As 1.341 linhas originais continuam auditáveis, com
-- os campos `*_original` exatamente como estavam na célula. Esta tabela é
-- DERIVADA: some inteira e é reconstruída pela mesma regra, a qualquer
-- momento, com o mesmo resultado (`api/src/vendas-historicas.js`).
--
-- A única coluna que muda em `vendas_historico_itens` é `venda_historica_id`,
-- que é o ponteiro do item para a venda que ele compõe — e é justamente o
-- lugar que a migration anterior deixou reservado (`pedido_chave`, que
-- continua sendo preenchido com a chave textual, para auditoria).
--
-- ─────────────────────────────────────────────────────────────────────────
-- ESTOQUE: continua sem mover nada
--
-- Nenhuma tabela aqui referencia `movimentos`, e a reconstrução não chama
-- `movimentar()`. Agrupar linhas que já existiam não cria nem destrói peça
-- física. A invariante `produtos.qtd == SUM(movimentos.qtd)` não é tocada.
--
-- ALTER TABLE ADD COLUMN não é idempotente no SQLite: "duplicate column
-- name" significa que esta migration já foi aplicada.

-- ═══════════════════════════════════════════════════════ 1. a venda derivada

CREATE TABLE IF NOT EXISTS vendas_historicas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id   INTEGER NOT NULL REFERENCES vendas_historico_lotes(id),

  -- A chave do agrupamento, legível: `<nome normalizado>|<data>`. Quando a
  -- linha não tem data utilizável ela vira `<nome>|sd:<id do item>` — sem
  -- data não há como saber se ela pertence a outra venda do mesmo dia, então
  -- ela fica sozinha e declarada, em vez de ser encaixada por palpite.
  chave     TEXT NOT NULL,

  -- 'venda'  → operação comercial
  -- 'ajuste' → o que a planilha marca explicitamente como não-venda
  --            (PERDIDO, ACHO QUE FOI VENDIDO). Preservado e contado à
  --            parte; nunca somado a faturamento nem a ticket médio.
  classe    TEXT NOT NULL DEFAULT 'venda' CHECK (classe IN ('venda', 'ajuste')),

  -- Qual regra formou este grupo. Escrita por extenso porque um número que
  -- ninguém consegue explicar não serve para decidir nada.
  regra     TEXT NOT NULL,

  cliente_nome      TEXT,
  cliente_nome_norm TEXT,
  cliente_id        INTEGER REFERENCES clientes(id),
  data              TEXT,                 -- YYYY-MM-DD, ou NULL

  itens       INTEGER NOT NULL DEFAULT 0, -- quantas linhas da planilha
  pecas       INTEGER NOT NULL DEFAULT 0, -- soma de `qtd`
  valor_total REAL,                       -- NULL se algum item não tem valor
  valor_pago  REAL NOT NULL DEFAULT 0,    -- só o que está marcado PAGO

  -- paga | nao_paga | parcial | indefinida — derivado do `pago` dos itens,
  -- nunca inventado: item com `pago IS NULL` é desconhecido, não é zero.
  status TEXT NOT NULL DEFAULT 'indefinida'
         CHECK (status IN ('paga', 'nao_paga', 'parcial', 'indefinida')),

  -- 1 só quando a venda pode entrar no ticket médio: é 'venda', está paga
  -- por inteiro, tem data e nenhum item sem valor. Uma coluna em vez de um
  -- WHERE repetido em cada consulta — a definição mora num lugar só.
  elegivel_ticket INTEGER NOT NULL DEFAULT 0,

  canal    TEXT,                           -- Maleta | Site | Grupo VIP | …
  contexto TEXT,                           -- Feira Franceschini | Consórcio | …
  observacao_original TEXT,                -- o texto bruto, preservado

  -- Os `Nº` da planilha que formaram esta venda, em JSON. É o caminho de
  -- volta ao bruto: de qualquer número do painel dá para chegar às células.
  origem_linhas TEXT NOT NULL DEFAULT '[]',

  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A mesma venda não entra duas vezes no mesmo lote, nem sob concorrência.
-- É o que torna a reconstrução repetível sem duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vh_vendas_chave
  ON vendas_historicas(lote_id, chave);

CREATE INDEX IF NOT EXISTS idx_vh_vendas_data    ON vendas_historicas(data);
CREATE INDEX IF NOT EXISTS idx_vh_vendas_norm    ON vendas_historicas(cliente_nome_norm);
CREATE INDEX IF NOT EXISTS idx_vh_vendas_cliente ON vendas_historicas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vh_vendas_canal   ON vendas_historicas(canal);
CREATE INDEX IF NOT EXISTS idx_vh_vendas_classe  ON vendas_historicas(classe, elegivel_ticket);

-- Consulta mais quente do painel: "vendas do período, por mês". Sem este
-- índice ela varre a tabela inteira a cada troca de filtro.
CREATE INDEX IF NOT EXISTS idx_vh_vendas_periodo
  ON vendas_historicas(classe, data, elegivel_ticket);

-- ═══════════════════════════════════════ 2. o ponteiro do item para a venda

-- O item passa a saber de qual venda ele faz parte. `pedido_chave` (criada
-- pela migration anterior e até agora sempre NULA) recebe a chave textual,
-- e esta coluna recebe o id — a chave serve para ler, o id para juntar.
ALTER TABLE vendas_historico_itens ADD COLUMN venda_historica_id INTEGER
  REFERENCES vendas_historicas(id);

CREATE INDEX IF NOT EXISTS idx_vh_itens_venda
  ON vendas_historico_itens(venda_historica_id);

-- ═══════════════════════════ 3. UMA normalização de cliente, não duas

-- A dívida: `analytics.js` comparava cliente operacional com cliente
-- histórico usando `LOWER(TRIM(...))` em SQL, enquanto a importação usava
-- `normalizarNomeCliente()` em JS — que faz NFD e remove o diacrítico.
--
-- As duas discordam exatamente onde dói: "José" e "jose" viram clientes
-- diferentes, "Vitória" e "vitoria" também. O painel mostraria a mesma
-- pessoa duas vezes, com metade do gasto em cada.
--
-- A correção NÃO é reimplementar o NFD em SQL — seriam 46 `replace()`
-- aninhados, e a segunda implementação divergiria de novo na primeira
-- mudança. A correção é a venda operacional GUARDAR o nome já normalizado
-- pelo mesmo JS que normaliza o histórico, e o SQL só ler a coluna.
--
-- Fica NULA nas vendas que já existem, de propósito: quem lê cai de volta
-- no normalizador em JS (`backfillNormalizacao`, chamado pela reconstrução)
-- e grava o valor no caminho. Nunca houve, e não passa a haver, uma segunda
-- regra.
ALTER TABLE vendas ADD COLUMN cliente_nome_norm TEXT;

CREATE INDEX IF NOT EXISTS idx_vendas_cliente_norm ON vendas(cliente_nome_norm);
