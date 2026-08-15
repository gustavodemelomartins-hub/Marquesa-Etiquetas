CREATE TABLE IF NOT EXISTS categorias ( nome TEXT PRIMARY KEY, ordem INTEGER NOT NULL DEFAULT 0, cor TEXT );

INSERT OR IGNORE INTO categorias (nome, ordem, cor) VALUES ('Colar', 1, '#C2426B'), ('Brinco', 2, '#C4802A'), ('Pulseira', 3, '#0D9382'), ('Berloque', 4, '#6A54B5'), ('Anel', 5, '#D8646B'), ('Argola', 6, '#3D77C4'), ('Pingente', 7, '#5C8A34'), ('Conjunto', 8, '#A15BA0'), ('Outros', 9, '#9E8A90');

CREATE TABLE IF NOT EXISTS produtos ( sku TEXT PRIMARY KEY, desc TEXT NOT NULL, cat TEXT NOT NULL REFERENCES categorias(nome), preco REAL, qtd INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ativo', url_loja TEXT, estoque_loja INTEGER, visivel INTEGER, nome_loja TEXT, atualizado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS movimentos ( id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL REFERENCES produtos(sku), tipo TEXT NOT NULL, qtd INTEGER NOT NULL, origem TEXT, maleta_id INTEGER, revendedora_id INTEGER, venda_id INTEGER, obs TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS revendedoras ( id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, tel TEXT, cidade TEXT, cpf TEXT, endereco TEXT, obs TEXT, status TEXT NOT NULL DEFAULT 'ativa', criada_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS maletas ( id INTEGER PRIMARY KEY AUTOINCREMENT, rev_id INTEGER NOT NULL REFERENCES revendedoras(id), status TEXT NOT NULL DEFAULT 'aberta', aberta_em TEXT, acerto_em TEXT, encerrada_em TEXT, obs TEXT, acerto_json TEXT );

CREATE TABLE IF NOT EXISTS maleta_itens ( maleta_id INTEGER NOT NULL REFERENCES maletas(id), sku TEXT NOT NULL REFERENCES produtos(sku), qtd INTEGER NOT NULL, preco_envio REAL, devolvida INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (maleta_id, sku) );

CREATE TABLE IF NOT EXISTS config ( chave TEXT PRIMARY KEY, valor TEXT NOT NULL );

CREATE TABLE IF NOT EXISTS loja_snapshot ( id INTEGER PRIMARY KEY CHECK (id = 1), lido_em TEXT, produtos_na_loja INTEGER, produtos_casados INTEGER, so_na_loja INTEGER, codigos_casados INTEGER, duplicados_json TEXT );

CREATE TABLE IF NOT EXISTS clientes ( id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, tel TEXT, criada_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS vendas ( id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER REFERENCES clientes(id), cliente_nome TEXT, revendedora_id INTEGER REFERENCES revendedoras(id), maleta_id INTEGER REFERENCES maletas(id), origem TEXT NOT NULL DEFAULT 'balcao', data TEXT NOT NULL, total REAL NOT NULL, cancelada INTEGER NOT NULL DEFAULT 0, criada_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS venda_itens ( venda_id INTEGER NOT NULL REFERENCES vendas(id), sku TEXT NOT NULL REFERENCES produtos(sku), desc TEXT NOT NULL, qtd INTEGER NOT NULL, preco REAL NOT NULL, motivo TEXT );

CREATE INDEX IF NOT EXISTS idx_mov_sku ON movimentos(sku);

CREATE INDEX IF NOT EXISTS idx_mov_maleta ON movimentos(maleta_id);

CREATE INDEX IF NOT EXISTS idx_mov_criado ON movimentos(criado_em);

CREATE INDEX IF NOT EXISTS idx_maleta_itens ON maleta_itens(maleta_id);

CREATE INDEX IF NOT EXISTS idx_maletas_rev ON maletas(rev_id);

CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data);

CREATE INDEX IF NOT EXISTS idx_vendas_origem ON vendas(origem);

CREATE INDEX IF NOT EXISTS idx_venda_itens_v ON venda_itens(venda_id);

CREATE INDEX IF NOT EXISTS idx_venda_itens_s ON venda_itens(sku);
