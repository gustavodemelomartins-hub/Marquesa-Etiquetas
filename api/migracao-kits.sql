CREATE TABLE IF NOT EXISTS kit_componentes (kit_sku TEXT NOT NULL REFERENCES produtos(sku), componente_sku TEXT NOT NULL REFERENCES produtos(sku), qtd INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (kit_sku, componente_sku));
CREATE INDEX IF NOT EXISTS idx_kit_componentes ON kit_componentes(kit_sku);
