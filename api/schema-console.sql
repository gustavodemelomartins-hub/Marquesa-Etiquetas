CREATE TABLE IF NOT EXISTS categorias ( nome TEXT PRIMARY KEY, ordem INTEGER NOT NULL DEFAULT 0, cor TEXT );

INSERT OR IGNORE INTO categorias (nome, ordem, cor) VALUES ('Colar', 1, '#C2426B'), ('Brinco', 2, '#C4802A'), ('Pulseira', 3, '#0D9382'), ('Berloque', 4, '#6A54B5'), ('Anel', 5, '#D8646B'), ('Argola', 6, '#3D77C4'), ('Pingente', 7, '#5C8A34'), ('Conjunto', 8, '#A15BA0'), ('Outros', 9, '#9E8A90');

CREATE TABLE IF NOT EXISTS produtos ( sku TEXT PRIMARY KEY, desc TEXT NOT NULL, cat TEXT NOT NULL REFERENCES categorias(nome), preco REAL, qtd INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ativo', url_loja TEXT, estoque_loja INTEGER, visivel INTEGER, nome_loja TEXT, foto_original_key TEXT, foto_original_tipo TEXT, foto_original_tam INTEGER, foto_tratada_key TEXT, foto_tratada_tipo TEXT, foto_tratada_tam INTEGER, foto_status TEXT, foto_erro TEXT, foto_origem TEXT, foto_em TEXT, foto_url TEXT, foto_url_em TEXT, atualizado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS produtos_pendentes ( sku TEXT PRIMARY KEY, desc TEXT, cat TEXT, preco REAL, qtd INTEGER NOT NULL DEFAULT 0, origem TEXT, motivo TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS fotos_orfas ( id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, sku_loja TEXT, nome_loja TEXT, produto_id TEXT, visto_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS movimentos ( id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL REFERENCES produtos(sku), variacao TEXT, variante_id TEXT, tipo TEXT NOT NULL, qtd INTEGER NOT NULL, origem TEXT, maleta_id INTEGER, revendedora_id INTEGER, venda_id INTEGER, obs TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')), reconciliacao_item_id INTEGER REFERENCES reconciliacao_itens(id) );

CREATE UNIQUE INDEX IF NOT EXISTS idx_movimentos_reconciliacao_item ON movimentos(reconciliacao_item_id);

CREATE TABLE IF NOT EXISTS revendedoras ( id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, tel TEXT, cidade TEXT, cpf TEXT, endereco TEXT, obs TEXT, status TEXT NOT NULL DEFAULT 'ativa', criada_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS maletas ( id INTEGER PRIMARY KEY AUTOINCREMENT, rev_id INTEGER NOT NULL REFERENCES revendedoras(id), status TEXT NOT NULL DEFAULT 'aberta', aberta_em TEXT, acerto_em TEXT, encerrada_em TEXT, obs TEXT, acerto_json TEXT );

CREATE TABLE IF NOT EXISTS maleta_itens ( maleta_id INTEGER NOT NULL REFERENCES maletas(id), sku TEXT NOT NULL REFERENCES produtos(sku), qtd INTEGER NOT NULL, preco_envio REAL, devolvida INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (maleta_id, sku) );

CREATE TABLE IF NOT EXISTS config ( chave TEXT PRIMARY KEY, valor TEXT NOT NULL );

CREATE TABLE IF NOT EXISTS loja_snapshot ( id INTEGER PRIMARY KEY CHECK (id = 1), lido_em TEXT, produtos_na_loja INTEGER, produtos_casados INTEGER, so_na_loja INTEGER, codigos_casados INTEGER, duplicados_json TEXT );

CREATE TABLE IF NOT EXISTS produto_variacoes ( sku TEXT NOT NULL REFERENCES produtos(sku), nome TEXT NOT NULL, atributo TEXT, variante_id TEXT, produto_id TEXT, estoque_loja INTEGER, ordem INTEGER NOT NULL DEFAULT 0, valores_json TEXT, variante_sku TEXT, preco REAL, promocional REAL, imagem_url TEXT, PRIMARY KEY (sku, nome) );

CREATE INDEX IF NOT EXISTS idx_variacoes_sku ON produto_variacoes(sku);

CREATE UNIQUE INDEX IF NOT EXISTS idx_variacoes_variante ON produto_variacoes(variante_id);

CREATE TABLE IF NOT EXISTS kit_componentes ( kit_sku TEXT NOT NULL REFERENCES produtos(sku), componente_sku TEXT NOT NULL REFERENCES produtos(sku), qtd INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (kit_sku, componente_sku) );

CREATE TABLE IF NOT EXISTS clientes ( id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, tel TEXT, criada_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS vendas ( id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER REFERENCES clientes(id), cliente_nome TEXT, revendedora_id INTEGER REFERENCES revendedoras(id), maleta_id INTEGER REFERENCES maletas(id), origem TEXT NOT NULL DEFAULT 'balcao', data TEXT NOT NULL, total REAL NOT NULL, cancelada INTEGER NOT NULL DEFAULT 0, externo_id TEXT, criada_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS sync_execucoes ( id INTEGER PRIMARY KEY AUTOINCREMENT, iniciado_em TEXT, terminado_em TEXT, status TEXT, pedidos_lidos INTEGER, vendas_criadas INTEGER, produtos_enviados INTEGER, detalhe_json TEXT, seco INTEGER NOT NULL DEFAULT 0 );

CREATE TABLE IF NOT EXISTS venda_itens ( venda_id INTEGER NOT NULL REFERENCES vendas(id), sku TEXT NOT NULL REFERENCES produtos(sku), desc TEXT NOT NULL, qtd INTEGER NOT NULL, preco REAL NOT NULL, motivo TEXT );

CREATE TABLE IF NOT EXISTS inventarios ( id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'aberto', iniciado_em TEXT NOT NULL DEFAULT (datetime('now')), concluido_em TEXT, desconhecidos_json TEXT, obs TEXT );

CREATE TABLE IF NOT EXISTS inventario_itens ( inventario_id INTEGER NOT NULL REFERENCES inventarios(id), sku TEXT NOT NULL REFERENCES produtos(sku), contado INTEGER NOT NULL DEFAULT 0, esperado INTEGER, ajustado INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (inventario_id, sku) );

CREATE TABLE IF NOT EXISTS reconciliacao_sessoes ( id INTEGER PRIMARY KEY AUTOINCREMENT, origem TEXT NOT NULL CHECK (origem IN ('nuvemshop', 'planilha_estoque_total', 'planilha_produtos_novos')), status TEXT NOT NULL DEFAULT 'revisao' CHECK (status IN ( 'revisao', 'aplicando', 'aplicada', 'aplicada_parcial', 'cancelada', 'superada', 'erro' )), criada_em TEXT NOT NULL DEFAULT (datetime('now')), decidida_em TEXT, aplicada_em TEXT, resumo_json TEXT, relato_json TEXT, erro TEXT );

CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_sessoes_revisao_unica ON reconciliacao_sessoes(origem) WHERE status = 'revisao';

CREATE TABLE IF NOT EXISTS reconciliacao_itens ( id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_id INTEGER NOT NULL REFERENCES reconciliacao_sessoes(id), sku TEXT NOT NULL, variacao TEXT, variacao_chave TEXT GENERATED ALWAYS AS (COALESCE(variacao, '')) STORED, descricao TEXT, tipo TEXT NOT NULL CHECK (tipo IN ( 'estoque_loja', 'produto_novo', 'ajuste_qtd', 'campo' )), de TEXT, para TEXT, base_json TEXT, risco TEXT NOT NULL CHECK (risco IN ( 'trivial', 'confere', 'perigoso', 'desconhecido' )), motivo TEXT, status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ( 'pendente', 'aprovado', 'rejeitado', 'aplicado', 'obsoleto', 'erro' )), erro TEXT, dados_json TEXT );

CREATE TABLE IF NOT EXISTS loja_variantes ( variante_id TEXT PRIMARY KEY, produto_id TEXT NOT NULL, sku TEXT, sku_norm TEXT, valores_json TEXT NOT NULL DEFAULT '[]', nome TEXT, estoque INTEGER, preco REAL, promocional REAL, imagem_url TEXT, locais_json TEXT, produto_nome TEXT, produto_url TEXT, produto_visivel INTEGER, posicao INTEGER NOT NULL DEFAULT 0, lido_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS sku_reservas ( sku TEXT PRIMARY KEY, criado_em TEXT NOT NULL DEFAULT (datetime('now')), expira_em TEXT NOT NULL, origem TEXT );

CREATE INDEX IF NOT EXISTS idx_mov_sku ON movimentos(sku);

CREATE INDEX IF NOT EXISTS idx_mov_maleta ON movimentos(maleta_id);

CREATE INDEX IF NOT EXISTS idx_mov_criado ON movimentos(criado_em);

CREATE INDEX IF NOT EXISTS idx_maleta_itens ON maleta_itens(maleta_id);

CREATE INDEX IF NOT EXISTS idx_maletas_rev ON maletas(rev_id);

CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data);

CREATE INDEX IF NOT EXISTS idx_vendas_origem ON vendas(origem);

CREATE INDEX IF NOT EXISTS idx_venda_itens_v ON venda_itens(venda_id);

CREATE INDEX IF NOT EXISTS idx_venda_itens_s ON venda_itens(sku);

CREATE INDEX IF NOT EXISTS idx_inv_status ON inventarios(status);

CREATE INDEX IF NOT EXISTS idx_inv_itens ON inventario_itens(inventario_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_externo ON vendas(externo_id);

CREATE INDEX IF NOT EXISTS idx_kit_componentes ON kit_componentes(kit_sku);

CREATE INDEX IF NOT EXISTS idx_rec_itens_sessao ON reconciliacao_itens(sessao_id);

CREATE INDEX IF NOT EXISTS idx_rec_itens_status ON reconciliacao_itens(sessao_id, status);

CREATE INDEX IF NOT EXISTS idx_rec_sessoes_status ON reconciliacao_sessoes(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_itens_unico ON reconciliacao_itens(sessao_id, sku, variacao_chave, tipo);

CREATE INDEX IF NOT EXISTS idx_fotos_orfas_sku ON fotos_orfas(sku_loja);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fotos_orfas_url ON fotos_orfas(url);

CREATE INDEX IF NOT EXISTS idx_mov_variante ON movimentos(variante_id);

CREATE INDEX IF NOT EXISTS idx_loja_var_sku ON loja_variantes(sku_norm);

CREATE INDEX IF NOT EXISTS idx_loja_var_produto ON loja_variantes(produto_id);

CREATE INDEX IF NOT EXISTS idx_sku_reservas_exp ON sku_reservas(expira_em);

CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_sku_norm ON produtos(UPPER(REPLACE(REPLACE(REPLACE(sku, ' ', ''), CHAR(9), ''), CHAR(160), '')));
