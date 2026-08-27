-- Histórico de vendas (planilha `Vendas Marquesa.xlsx`) + fundação de CRM.
--
-- ─────────────────────────────────────────────────────────────────────────
-- A DECISÃO CENTRAL: por que uma tabela própria, e não linhas em `vendas`
--
-- A planilha tem 1.341 linhas e a coluna `Nº` vai de 1 a 1.341 sem repetir:
-- ela identifica a LINHA, não o pedido. Uma cliente aparece com 36 linhas na
-- mesma data (Jéssica Melim, 13/06/2026), e isso é acerto de maleta, não uma
-- compra de 36 peças. Não existe no arquivo nada que diga onde um pedido
-- começa e termina.
--
-- Escrever essas linhas em `vendas` obrigaria a inventar um `venda_id` por
-- linha — e a partir daí "1.341 vendas" e um ticket médio de R$ 95 entrariam
-- em todo relatório como se fossem fato. Seriam artefato da importação.
--
-- Então o histórico mora aqui, no nível em que ele realmente existe: o item.
-- Faturamento, peças, clientes e produtos saem direto dos itens e são exatos.
-- Contagem de pedidos e ticket médio ficam indisponíveis por construção,
-- até que exista uma regra de agrupamento validada — e quando existir, ela
-- preenche `pedido_chave` sem reescrever nada do que está preservado aqui.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ESTOQUE: esta importação NÃO MOVIMENTA NADA
--
-- Nenhuma tabela criada aqui referencia `movimentos`, e o importador não
-- chama `movimentar()`. O estoque de hoje já incorpora estas vendas: criar
-- movimento para cada linha descontaria a mesma peça duas vezes e empurraria
-- o número errado para a Nuvemshop. A invariante
-- `produtos.qtd == SUM(movimentos.qtd)` continua valendo sem nem ser tocada.
--
-- ALTER TABLE ADD COLUMN não é idempotente no SQLite. "duplicate column
-- name" significa que esta migration já foi aplicada.

-- ══════════════════════════════════════════════════ 1. lotes de importação

-- Um lote por arquivo importado. É o que torna a importação idempotente e
-- auditável: o hash do conteúdo impede o mesmo arquivo de entrar duas vezes,
-- e o lote guarda a prestação de contas linha a linha.
CREATE TABLE IF NOT EXISTS vendas_historico_lotes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo_nome      TEXT NOT NULL,
  arquivo_hash      TEXT NOT NULL,          -- sha-256 do conteúdo normalizado
  linhas_total      INTEGER NOT NULL DEFAULT 0,
  linhas_importadas INTEGER NOT NULL DEFAULT 0,
  linhas_rejeitadas INTEGER NOT NULL DEFAULT 0,
  relatorio_json    TEXT,                   -- reconciliação contra a fonte
  status            TEXT NOT NULL DEFAULT 'importado'
                    CHECK (status IN ('importado', 'revertido')),
  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  revertido_em      TEXT
);

-- Idempotência de verdade: o MESMO arquivo não entra duas vezes enquanto o
-- lote dele estiver de pé. Reverter libera o hash para uma nova tentativa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vh_lotes_hash
  ON vendas_historico_lotes(arquivo_hash) WHERE status = 'importado';

-- ══════════════════════════════════════════════════════ 2. o item histórico

-- Duas metades em cada linha, e a fronteira entre elas é o contrato deste
-- arquivo:
--
--   *_original  → o que estava escrito na célula. Nunca interpretado,
--                 nunca corrigido, nunca apagado.
--   o resto     → a leitura. NULL sempre que não deu para ler com certeza.
--
-- NULL aqui é "não sei", jamais zero: 15 linhas não têm data utilizável e 9
-- não têm valor, e um zero nesses lugares afirmaria que a peça saiu de graça.
CREATE TABLE IF NOT EXISTS vendas_historico_itens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id       INTEGER NOT NULL REFERENCES vendas_historico_lotes(id),
  origem_linha  TEXT NOT NULL,              -- a coluna `Nº`, como TEXTO

  -- ─── cru, preservado
  data_original             TEXT,
  cliente_nome_original     TEXT,
  sku_original              TEXT,
  nome_produto_historico    TEXT,           -- como a peça era chamada NA ÉPOCA
  tipo_original             TEXT,
  preco_unit_original       TEXT,
  desconto_original         TEXT,           -- texto comercial, não número
  valor_total_original      TEXT,
  pagamento_original        TEXT,
  status_pagamento_original TEXT,
  observacao_original       TEXT,           -- a origem comercial, bruta

  -- ─── leitura
  data           TEXT,                      -- YYYY-MM-DD, ou NULL
  cliente_id     INTEGER REFERENCES clientes(id),
  cliente_nome_norm TEXT,
  sku            TEXT,                      -- TEXT: aceita `996055-2`
  sku_base       TEXT,                      -- `996055`, para casar com o catálogo
  tipo           TEXT,
  qtd            INTEGER,
  preco_unit     REAL,
  valor_total    REAL,
  desconto_valor REAL,                      -- só quando escrito explicitamente
  desconto_pct   REAL,
  desconto_rotulo TEXT,
  pagamento_forma TEXT,
  pagamento_parcelas INTEGER,
  pago           INTEGER,                   -- 1 | 0 | NULL (desconhecido)
  canal          TEXT,                      -- Maleta | Site | Mercado Biani | …
  contexto       TEXT,                      -- Feira Franceschini | Consórcio | …
  revendedora_nome TEXT,
  revendedora_id INTEGER REFERENCES revendedoras(id),

  -- ─── prestação de contas
  problemas_json TEXT,                      -- por que a linha não vira número
  pedido_chave   TEXT,                      -- NULL até existir regra validada
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A mesma linha do mesmo lote nunca entra duas vezes, nem sob concorrência.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vh_itens_idem
  ON vendas_historico_itens(lote_id, origem_linha);

CREATE INDEX IF NOT EXISTS idx_vh_itens_data    ON vendas_historico_itens(data);
CREATE INDEX IF NOT EXISTS idx_vh_itens_sku     ON vendas_historico_itens(sku_base);
CREATE INDEX IF NOT EXISTS idx_vh_itens_cliente ON vendas_historico_itens(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vh_itens_norm    ON vendas_historico_itens(cliente_nome_norm);
CREATE INDEX IF NOT EXISTS idx_vh_itens_canal   ON vendas_historico_itens(canal);

-- ══════════════════════════════════════════════════════ 3. clientes / CRM

-- `clientes` tinha 4 colunas (id, nome, tel, criada_em). Vira a entidade de
-- CRM sem perder nada: tudo abaixo é aditivo e entra NULO nas linhas que já
-- existem.
--
-- `*_norm` existe para BUSCAR e para PROPOR candidato de vínculo — nunca para
-- unir dois clientes sozinho. A planilha não tem telefone nem e-mail, então
-- a única chave disponível no histórico é o nome, e nome não é identidade:
-- duas "Camila" podem ser duas pessoas. Ambiguidade vai para revisão humana.
ALTER TABLE clientes ADD COLUMN nome_norm     TEXT;
ALTER TABLE clientes ADD COLUMN tel_norm      TEXT;
ALTER TABLE clientes ADD COLUMN email         TEXT;
ALTER TABLE clientes ADD COLUMN email_norm    TEXT;
ALTER TABLE clientes ADD COLUMN instagram     TEXT;
ALTER TABLE clientes ADD COLUMN cidade        TEXT;
ALTER TABLE clientes ADD COLUMN nascimento    TEXT;
ALTER TABLE clientes ADD COLUMN obs           TEXT;
ALTER TABLE clientes ADD COLUMN origem        TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE clientes ADD COLUMN atualizada_em TEXT;

CREATE INDEX IF NOT EXISTS idx_clientes_nome_norm ON clientes(nome_norm);
CREATE INDEX IF NOT EXISTS idx_clientes_tel_norm  ON clientes(tel_norm);

-- Preenche a normalização do que já está lá, sem tocar no nome original.
UPDATE clientes SET nome_norm = lower(trim(nome)) WHERE nome_norm IS NULL;

-- ══════════════════════════════════════════ 4. vínculos que pedem revisão

-- O histórico traz 348 nomes distintos e nenhum telefone. Quando o nome do
-- arquivo se parece com um cliente já cadastrado mas não é prova, o vínculo
-- NÃO é feito: vira uma linha aqui, para alguém decidir.
--
-- Enquanto pendente, o item histórico fica com `cliente_id` nulo e continua
-- contando pelo nome normalizado — nenhum número se perde esperando decisão.
CREATE TABLE IF NOT EXISTS clientes_vinculo_revisao (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id       INTEGER REFERENCES vendas_historico_lotes(id),
  nome_original TEXT NOT NULL,
  nome_norm     TEXT NOT NULL,
  candidato_id  INTEGER REFERENCES clientes(id),
  candidato_nome TEXT,
  motivo        TEXT NOT NULL,
  linhas        INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'vinculado', 'separado')),
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  decidido_em   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cvr_unico
  ON clientes_vinculo_revisao(nome_norm, status) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_cvr_status ON clientes_vinculo_revisao(status);
