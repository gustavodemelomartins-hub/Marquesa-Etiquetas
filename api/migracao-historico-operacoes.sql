-- Papéis históricos, duplicidades e contas a receber.
--
-- A planilha bruta e `vendas_historicas` continuam imutável/derivada.
-- Esta camada guarda somente decisões humanas duráveis sobre uma operação:
-- cliente x acerto, valor documental, vínculo de duplicata e pagamento.
-- Nenhuma tabela de estoque é tocada por esta migration.

CREATE TABLE IF NOT EXISTS historico_operacoes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id            INTEGER NOT NULL REFERENCES vendas_historico_lotes(id),
  venda_chave        TEXT NOT NULL,
  fingerprint        TEXT NOT NULL,
  papel              TEXT NOT NULL DEFAULT 'cliente'
                     CHECK (papel IN ('cliente', 'acerto', 'revisao')),
  cliente_id         INTEGER REFERENCES clientes(id),
  cliente_nome_norm  TEXT,
  revendedora_id     INTEGER REFERENCES revendedoras(id),
  pecas              INTEGER,
  bruto_centavos     INTEGER,
  comissao_centavos  INTEGER,
  liquido_centavos   INTEGER,
  linhas_excluidas_json TEXT NOT NULL DEFAULT '[]',

  cobranca_status    TEXT NOT NULL DEFAULT 'nenhuma'
                     CHECK (cobranca_status IN ('nenhuma', 'aberta', 'paga', 'revisao')),
  valor_efetivo_centavos       INTEGER,
  valor_recebido_fonte_centavos INTEGER,
  valor_recebido_centavos       INTEGER,
  saldo_centavos               INTEGER,
  vencimento_em       TEXT,
  vencimento_origem   TEXT,
  paga_em             TEXT,

  canal              TEXT,
  contexto           TEXT,
  observacao         TEXT,
  evidencia_json     TEXT NOT NULL DEFAULT '{}',
  versao             INTEGER NOT NULL DEFAULT 1,
  status_registro    TEXT NOT NULL DEFAULT 'ativa'
                     CHECK (status_registro IN ('ativa', 'substituida')),
  substitui_id       INTEGER REFERENCES historico_operacoes(id),
  criado_em          TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em      TEXT,

  CHECK (versao >= 1),
  CHECK (pecas IS NULL OR pecas >= 0),
  CHECK (bruto_centavos IS NULL OR bruto_centavos >= 0),
  CHECK (comissao_centavos IS NULL OR comissao_centavos >= 0),
  CHECK (liquido_centavos IS NULL OR liquido_centavos >= 0),
  CHECK (valor_efetivo_centavos IS NULL OR valor_efetivo_centavos >= 0),
  CHECK (valor_recebido_fonte_centavos IS NULL OR valor_recebido_fonte_centavos >= 0),
  CHECK (valor_recebido_centavos IS NULL OR valor_recebido_centavos >= 0),
  CHECK (saldo_centavos IS NULL OR saldo_centavos >= 0),
  CHECK (papel = 'cliente' OR cobranca_status IN ('nenhuma', 'revisao')),
  CHECK (papel <> 'acerto' OR revendedora_id IS NOT NULL),
  CHECK (papel <> 'acerto' OR bruto_centavos = comissao_centavos + liquido_centavos),
  CHECK (cobranca_status NOT IN ('aberta', 'paga') OR valor_efetivo_centavos IS NOT NULL),
  CHECK (cobranca_status <> 'aberta' OR saldo_centavos > 0),
  CHECK (cobranca_status <> 'paga' OR saldo_centavos = 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_op_lote_chave_versao
  ON historico_operacoes(lote_id, venda_chave, versao);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_op_ativa_chave
  ON historico_operacoes(venda_chave) WHERE status_registro = 'ativa';
CREATE INDEX IF NOT EXISTS idx_hist_op_revendedora
  ON historico_operacoes(revendedora_id, papel, status_registro);
CREATE INDEX IF NOT EXISTS idx_hist_op_cliente
  ON historico_operacoes(cliente_id, cliente_nome_norm, papel, status_registro);
CREATE INDEX IF NOT EXISTS idx_hist_op_cobranca
  ON historico_operacoes(cobranca_status, vencimento_em, status_registro);

CREATE TABLE IF NOT EXISTS historico_operacao_vendas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  operacao_id     INTEGER NOT NULL REFERENCES historico_operacoes(id),
  venda_id        INTEGER NOT NULL REFERENCES vendas(id),
  relacao         TEXT NOT NULL DEFAULT 'duplicata'
                  CHECK (relacao = 'duplicata'),
  evidencia_json  TEXT NOT NULL DEFAULT '{}',
  status_registro TEXT NOT NULL DEFAULT 'ativa'
                  CHECK (status_registro IN ('ativa', 'substituida')),
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  substituida_em  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_op_venda_ativa
  ON historico_operacao_vendas(venda_id) WHERE status_registro = 'ativa';
CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_op_relacao_ativa
  ON historico_operacao_vendas(operacao_id, venda_id)
  WHERE status_registro = 'ativa';
CREATE INDEX IF NOT EXISTS idx_hist_op_vendas_operacao
  ON historico_operacao_vendas(operacao_id, status_registro);
