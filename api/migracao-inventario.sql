CREATE TABLE IF NOT EXISTS inventarios ( id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'aberto', iniciado_em TEXT NOT NULL DEFAULT (datetime('now')), concluido_em TEXT, desconhecidos_json TEXT, obs TEXT );

CREATE TABLE IF NOT EXISTS inventario_itens ( inventario_id INTEGER NOT NULL REFERENCES inventarios(id), sku TEXT NOT NULL REFERENCES produtos(sku), contado INTEGER NOT NULL DEFAULT 0, esperado INTEGER, ajustado INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (inventario_id, sku) );

CREATE INDEX IF NOT EXISTS idx_inv_status ON inventarios(status);

CREATE INDEX IF NOT EXISTS idx_inv_itens ON inventario_itens(inventario_id);
