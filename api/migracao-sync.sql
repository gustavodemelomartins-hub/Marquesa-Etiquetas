ALTER TABLE vendas ADD COLUMN externo_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_externo ON vendas(externo_id) WHERE externo_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sync_execucoes ( id INTEGER PRIMARY KEY AUTOINCREMENT, iniciado_em TEXT, terminado_em TEXT, status TEXT, pedidos_lidos INTEGER, vendas_criadas INTEGER, produtos_enviados INTEGER, detalhe_json TEXT );
