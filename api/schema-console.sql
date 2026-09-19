CREATE TABLE IF NOT EXISTS categorias ( nome TEXT PRIMARY KEY, ordem INTEGER NOT NULL DEFAULT 0, cor TEXT );

INSERT OR IGNORE INTO categorias (nome, ordem, cor) VALUES ('Colar', 1, '#C2426B'), ('Brinco', 2, '#C4802A'), ('Pulseira', 3, '#0D9382'), ('Berloque', 4, '#6A54B5'), ('Anel', 5, '#D8646B'), ('Argola', 6, '#3D77C4'), ('Pingente', 7, '#5C8A34'), ('Conjunto', 8, '#A15BA0'), ('Outros', 9, '#9E8A90');

CREATE TABLE IF NOT EXISTS produtos ( sku TEXT PRIMARY KEY, desc TEXT NOT NULL, cat TEXT NOT NULL REFERENCES categorias(nome), preco REAL, qtd INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ativo', url_loja TEXT, estoque_loja INTEGER, visivel INTEGER, nome_loja TEXT, foto_original_key TEXT, foto_original_tipo TEXT, foto_original_tam INTEGER, foto_tratada_key TEXT, foto_tratada_tipo TEXT, foto_tratada_tam INTEGER, foto_status TEXT, foto_erro TEXT, foto_origem TEXT, foto_em TEXT, arquivado_em TEXT, arquivado_motivo TEXT, foto_url TEXT, foto_url_em TEXT, atualizado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS catalogo_publicacoes ( sku TEXT PRIMARY KEY REFERENCES produtos(sku), estado TEXT NOT NULL DEFAULT 'em_preparacao_agente' CHECK (estado IN ('em_preparacao_agente','aguardando_aprovacao','aprovado_para_publicar','publicado','falhou_ao_publicar')), nome_site TEXT, descricao_site TEXT, seo_titulo TEXT, seo_descricao TEXT, dados_assinatura TEXT, preparo_erro TEXT, publicacao_erro TEXT, tentativas INTEGER NOT NULL DEFAULT 0, preparado_em TEXT, aprovado_em TEXT, aprovado_por TEXT, publicado_em TEXT, atualizado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE INDEX IF NOT EXISTS idx_catalogo_publicacoes_estado ON catalogo_publicacoes(estado);

CREATE TABLE IF NOT EXISTS produtos_pendentes ( sku TEXT PRIMARY KEY, desc TEXT, cat TEXT, preco REAL, qtd INTEGER NOT NULL DEFAULT 0, origem TEXT, motivo TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS fotos_orfas ( id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, sku_loja TEXT, nome_loja TEXT, produto_id TEXT, visto_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS movimentos ( id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL REFERENCES produtos(sku), variacao TEXT, variante_id TEXT, tipo TEXT NOT NULL, qtd INTEGER NOT NULL, origem TEXT, maleta_id INTEGER, revendedora_id INTEGER, venda_id INTEGER, obs TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')), reconciliacao_item_id INTEGER REFERENCES reconciliacao_itens(id) );

CREATE UNIQUE INDEX IF NOT EXISTS idx_movimentos_reconciliacao_item ON movimentos(reconciliacao_item_id);

CREATE TABLE IF NOT EXISTS revendedoras ( id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, tel TEXT, cidade TEXT, cpf TEXT, endereco TEXT, obs TEXT, status TEXT NOT NULL DEFAULT 'ativa', criada_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS maletas ( id INTEGER PRIMARY KEY AUTOINCREMENT, rev_id INTEGER NOT NULL REFERENCES revendedoras(id), status TEXT NOT NULL DEFAULT 'aberta', aberta_em TEXT, acerto_em TEXT, encerrada_em TEXT, obs TEXT, acerto_json TEXT );

CREATE TABLE IF NOT EXISTS maleta_itens ( maleta_id INTEGER NOT NULL REFERENCES maletas(id), sku TEXT NOT NULL REFERENCES produtos(sku), qtd INTEGER NOT NULL, preco_envio REAL, devolvida INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (maleta_id, sku) );

CREATE TABLE IF NOT EXISTS config ( chave TEXT PRIMARY KEY, valor TEXT NOT NULL );

CREATE TABLE IF NOT EXISTS loja_snapshot ( id INTEGER PRIMARY KEY CHECK (id = 1), lido_em TEXT, produtos_na_loja INTEGER, produtos_casados INTEGER, so_na_loja INTEGER, codigos_casados INTEGER, duplicados_json TEXT );

CREATE TABLE IF NOT EXISTS produto_variacoes ( sku TEXT NOT NULL REFERENCES produtos(sku), nome TEXT NOT NULL, atributo TEXT, variante_id TEXT, produto_id TEXT, estoque_loja INTEGER, ordem INTEGER NOT NULL DEFAULT 0, valores_json TEXT, variante_sku TEXT, preco REAL, promocional REAL, imagem_url TEXT, origem TEXT, PRIMARY KEY (sku, nome) );

CREATE INDEX IF NOT EXISTS idx_variacoes_sku ON produto_variacoes(sku);

CREATE UNIQUE INDEX IF NOT EXISTS idx_variacoes_variante ON produto_variacoes(variante_id);

CREATE TABLE IF NOT EXISTS kit_componentes ( kit_sku TEXT NOT NULL REFERENCES produtos(sku), componente_sku TEXT NOT NULL REFERENCES produtos(sku), qtd INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (kit_sku, componente_sku) );

CREATE TABLE IF NOT EXISTS clientes ( id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, tel TEXT, nome_norm TEXT, tel_norm TEXT, email TEXT, email_norm TEXT, instagram TEXT, cidade TEXT, nascimento TEXT, obs TEXT, origem TEXT NOT NULL DEFAULT 'manual', criada_em TEXT NOT NULL DEFAULT (datetime('now')), atualizada_em TEXT, cpf TEXT, cpf_norm TEXT );

CREATE TABLE IF NOT EXISTS vendas ( id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER REFERENCES clientes(id), cliente_nome TEXT, cliente_nome_norm TEXT, revendedora_id INTEGER REFERENCES revendedoras(id), maleta_id INTEGER REFERENCES maletas(id), origem TEXT NOT NULL DEFAULT 'balcao', data TEXT NOT NULL, total REAL NOT NULL, cancelada INTEGER NOT NULL DEFAULT 0, externo_id TEXT, nuvemshop_status TEXT NOT NULL DEFAULT 'nao_enviada', nuvemshop_erro TEXT, nuvemshop_em TEXT, criada_em TEXT NOT NULL DEFAULT (datetime('now')), pago INTEGER NOT NULL DEFAULT 1, data_pagamento TEXT, observacao TEXT, pagamento_origem TEXT, valor_recebido REAL, cobravel INTEGER NOT NULL DEFAULT 1, cliente_ambiguo INTEGER NOT NULL DEFAULT 0, vencimento_em TEXT );

CREATE TABLE IF NOT EXISTS sync_execucoes ( id INTEGER PRIMARY KEY AUTOINCREMENT, iniciado_em TEXT, terminado_em TEXT, status TEXT, pedidos_lidos INTEGER, vendas_criadas INTEGER, produtos_enviados INTEGER, detalhe_json TEXT, seco INTEGER NOT NULL DEFAULT 0 );

CREATE TABLE IF NOT EXISTS venda_itens ( venda_id INTEGER NOT NULL REFERENCES vendas(id), sku TEXT NOT NULL REFERENCES produtos(sku), desc TEXT NOT NULL, qtd INTEGER NOT NULL, preco REAL NOT NULL, motivo TEXT, variacao TEXT, variante_id TEXT, preco_tabela REAL, desconto_valor REAL, desconto_rotulo TEXT , id TEXT );

CREATE TABLE IF NOT EXISTS personalizacao_modelos ( id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, sku_comercial TEXT REFERENCES produtos(sku), slots_min INTEGER NOT NULL DEFAULT 1 CHECK (slots_min > 0), slots_max INTEGER NOT NULL DEFAULT 1 CHECK (slots_max > 0), base_sku_padrao TEXT REFERENCES produtos(sku), preco_sugerido REAL, ativo INTEGER NOT NULL DEFAULT 1, ordem INTEGER NOT NULL DEFAULT 0, obs TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')), CHECK (slots_max >= slots_min) );

CREATE TABLE IF NOT EXISTS personalizacao_slots ( modelo_id INTEGER NOT NULL REFERENCES personalizacao_modelos(id), grupo TEXT NOT NULL, qtd INTEGER NOT NULL CHECK (qtd > 0), ordem INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (modelo_id, grupo) );

CREATE INDEX IF NOT EXISTS idx_pers_slots_modelo ON personalizacao_slots(modelo_id);

CREATE TABLE IF NOT EXISTS personalizacao_opcoes ( id INTEGER PRIMARY KEY AUTOINCREMENT, modelo_id INTEGER NOT NULL REFERENCES personalizacao_modelos(id), componente_sku TEXT NOT NULL REFERENCES produtos(sku), variacao TEXT, variante_id TEXT, rotulo TEXT NOT NULL, grupo TEXT, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1 );

CREATE TABLE IF NOT EXISTS venda_personalizacoes ( id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER NOT NULL REFERENCES vendas(id), sku_comercial TEXT REFERENCES produtos(sku), base_sku TEXT NOT NULL REFERENCES produtos(sku), base_variacao TEXT, base_variante_id TEXT, modelo_id INTEGER REFERENCES personalizacao_modelos(id), modelo_nome TEXT NOT NULL, preco REAL NOT NULL, estoque_ja_refletido INTEGER NOT NULL DEFAULT 0, observacao TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS venda_personalizacao_itens ( id INTEGER PRIMARY KEY AUTOINCREMENT, personalizacao_id INTEGER NOT NULL REFERENCES venda_personalizacoes(id), posicao INTEGER NOT NULL, componente_sku TEXT NOT NULL REFERENCES produtos(sku), componente_nome TEXT, variacao TEXT, variante_id TEXT, rotulo TEXT, qtd INTEGER NOT NULL DEFAULT 1 CHECK (qtd > 0), movimento_id INTEGER REFERENCES movimentos(id) );

INSERT OR IGNORE INTO produtos (sku, desc, cat, preco, qtd, status) VALUES ('MONTE-COLAR', 'Monte seu Colar — composição livre', 'Colar', NULL, 0, 'inativo');

CREATE TABLE IF NOT EXISTS inventarios ( id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'aberto', iniciado_em TEXT NOT NULL DEFAULT (datetime('now')), concluido_em TEXT, desconhecidos_json TEXT, obs TEXT, pausado_em TEXT );

/* HISTÓRICA a partir da Fase 4.4: nada escreve mais aqui. A chave (inventario_id, sku) não comporta variação, e mudá-la exigiria reconstruir a tabela. Os inventários já fechados continuam sendo lidos daqui. */ CREATE TABLE IF NOT EXISTS inventario_itens ( inventario_id INTEGER NOT NULL REFERENCES inventarios(id), sku TEXT NOT NULL REFERENCES produtos(sku), contado INTEGER NOT NULL DEFAULT 0, esperado INTEGER, ajustado INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (inventario_id, sku) );

/* Fase 4.4 — a contagem VIVA, por variação. Existe linha = foi contado; não existe = NÃO foi contado. É essa ausência que implementa "não contado nunca é zero"; zero exige gesto explícito e vira `contado = 0`. Notas por coluna em api/migracao-inventario-4-4.sql. */ CREATE TABLE IF NOT EXISTS inventario_contagem ( inventario_id INTEGER NOT NULL REFERENCES inventarios(id), sku TEXT NOT NULL REFERENCES produtos(sku), variacao TEXT NOT NULL DEFAULT '', variante_id TEXT, contado INTEGER NOT NULL CHECK (contado >= 0), contado_em TEXT NOT NULL DEFAULT (datetime('now')), origem TEXT, PRIMARY KEY (inventario_id, sku, variacao) );

/* "Não sei qual variação é" é resposta válida: nunca vira movimento, e bloqueia o código inteiro na aplicação. */ CREATE TABLE IF NOT EXISTS inventario_nao_identificado ( inventario_id INTEGER NOT NULL REFERENCES inventarios(id), sku TEXT NOT NULL REFERENCES produtos(sku), qtd INTEGER NOT NULL CHECK (qtd > 0), contado_em TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (inventario_id, sku) );

/* O retrato CONGELADO do fechamento, por variação — a aplicação da diferença relê daqui e ignora qualquer quantidade enviada pelo cliente. */ CREATE TABLE IF NOT EXISTS inventario_resultado ( inventario_id INTEGER NOT NULL REFERENCES inventarios(id), sku TEXT NOT NULL REFERENCES produtos(sku), variacao TEXT NOT NULL DEFAULT '', variante_id TEXT, contado INTEGER, esperado INTEGER NOT NULL, delta_pos INTEGER NOT NULL DEFAULT 0, dif INTEGER, situacao TEXT NOT NULL, motivo TEXT, aplicado_em TEXT, saida_id INTEGER REFERENCES saidas_sem_faturamento(id), PRIMARY KEY (inventario_id, sku, variacao) );

CREATE INDEX IF NOT EXISTS idx_inv_contagem ON inventario_contagem(inventario_id);

CREATE INDEX IF NOT EXISTS idx_inv_resultado ON inventario_resultado(inventario_id);

CREATE TABLE IF NOT EXISTS reconciliacao_sessoes ( id INTEGER PRIMARY KEY AUTOINCREMENT, origem TEXT NOT NULL CHECK (origem IN ('nuvemshop', 'planilha_estoque_total', 'planilha_produtos_novos')), status TEXT NOT NULL DEFAULT 'revisao' CHECK (status IN ( 'revisao', 'aplicando', 'aplicada', 'aplicada_parcial', 'cancelada', 'superada', 'erro' )), criada_em TEXT NOT NULL DEFAULT (datetime('now')), decidida_em TEXT, aplicada_em TEXT, resumo_json TEXT, relato_json TEXT, erro TEXT );

CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_sessoes_revisao_unica ON reconciliacao_sessoes(origem) WHERE status = 'revisao';

CREATE TABLE IF NOT EXISTS reconciliacao_itens ( id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_id INTEGER NOT NULL REFERENCES reconciliacao_sessoes(id), sku TEXT NOT NULL, variacao TEXT, variacao_chave TEXT GENERATED ALWAYS AS (COALESCE(variacao, '')) STORED, descricao TEXT, tipo TEXT NOT NULL CHECK (tipo IN ( 'estoque_loja', 'produto_novo', 'ajuste_qtd', 'campo' )), de TEXT, para TEXT, base_json TEXT, risco TEXT NOT NULL CHECK (risco IN ( 'trivial', 'confere', 'perigoso', 'desconhecido' )), motivo TEXT, status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ( 'pendente', 'aprovado', 'rejeitado', 'aplicado', 'obsoleto', 'erro' )), erro TEXT, dados_json TEXT );

CREATE TABLE IF NOT EXISTS loja_variantes ( variante_id TEXT PRIMARY KEY, produto_id TEXT NOT NULL, sku TEXT, sku_norm TEXT, valores_json TEXT NOT NULL DEFAULT '[]', nome TEXT, estoque INTEGER, preco REAL, promocional REAL, imagem_url TEXT, locais_json TEXT, produto_nome TEXT, produto_url TEXT, produto_visivel INTEGER, posicao INTEGER NOT NULL DEFAULT 0, lido_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE TABLE IF NOT EXISTS loja_fotos ( imagem_id TEXT PRIMARY KEY, produto_id TEXT NOT NULL, url TEXT NOT NULL, posicao INTEGER NOT NULL DEFAULT 0, principal INTEGER NOT NULL DEFAULT 0, sku_norm TEXT, variante_id TEXT, lido_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE INDEX IF NOT EXISTS idx_loja_fotos_sku ON loja_fotos(sku_norm);

CREATE INDEX IF NOT EXISTS idx_loja_fotos_produto ON loja_fotos(produto_id);

CREATE INDEX IF NOT EXISTS idx_loja_fotos_var ON loja_fotos(variante_id);

CREATE TABLE IF NOT EXISTS sku_reservas ( sku TEXT PRIMARY KEY, criado_em TEXT NOT NULL DEFAULT (datetime('now')), expira_em TEXT NOT NULL, origem TEXT );

CREATE INDEX IF NOT EXISTS idx_mov_sku ON movimentos(sku);

CREATE INDEX IF NOT EXISTS idx_mov_maleta ON movimentos(maleta_id);

CREATE INDEX IF NOT EXISTS idx_mov_criado ON movimentos(criado_em);

CREATE INDEX IF NOT EXISTS idx_maleta_itens ON maleta_itens(maleta_id);

CREATE INDEX IF NOT EXISTS idx_maletas_rev ON maletas(rev_id);

CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data);

CREATE INDEX IF NOT EXISTS idx_vendas_origem ON vendas(origem);

CREATE INDEX IF NOT EXISTS idx_vendas_pagamento ON vendas(data_pagamento);

CREATE INDEX IF NOT EXISTS idx_vendas_pago ON vendas(pago, data);

CREATE INDEX IF NOT EXISTS idx_vendas_pgorigem ON vendas(pagamento_origem);

CREATE INDEX IF NOT EXISTS idx_vendas_cobravel ON vendas(cobravel, pago);

CREATE INDEX IF NOT EXISTS idx_vendas_ambiguo ON vendas(cliente_ambiguo, cliente_nome_norm);

CREATE INDEX IF NOT EXISTS idx_vendas_vencimento ON vendas(vencimento_em) WHERE pago = 0;

CREATE INDEX IF NOT EXISTS idx_venda_itens_v ON venda_itens(venda_id);

CREATE INDEX IF NOT EXISTS idx_venda_itens_s ON venda_itens(sku);

CREATE INDEX IF NOT EXISTS idx_venda_itens_variante ON venda_itens(variante_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_venda_itens_id ON venda_itens(id);

CREATE INDEX IF NOT EXISTS idx_inv_status ON inventarios(status);

CREATE INDEX IF NOT EXISTS idx_inv_itens ON inventario_itens(inventario_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_externo ON vendas(externo_id);

CREATE INDEX IF NOT EXISTS idx_kit_componentes ON kit_componentes(kit_sku);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pers_opcao_unica ON personalizacao_opcoes(modelo_id, componente_sku, COALESCE(variacao, ''));

CREATE INDEX IF NOT EXISTS idx_pers_opcoes_modelo ON personalizacao_opcoes(modelo_id, ordem);

CREATE INDEX IF NOT EXISTS idx_vpers_venda ON venda_personalizacoes(venda_id);

CREATE INDEX IF NOT EXISTS idx_vpers_venda_base ON venda_personalizacoes(venda_id, base_sku);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vpers_item_posicao ON venda_personalizacao_itens(personalizacao_id, posicao);

CREATE INDEX IF NOT EXISTS idx_vpers_item_sku ON venda_personalizacao_itens(componente_sku);

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

CREATE TABLE IF NOT EXISTS vendas_historico_lotes ( id INTEGER PRIMARY KEY AUTOINCREMENT, arquivo_nome TEXT NOT NULL, arquivo_hash TEXT NOT NULL, linhas_total INTEGER NOT NULL DEFAULT 0, linhas_importadas INTEGER NOT NULL DEFAULT 0, linhas_rejeitadas INTEGER NOT NULL DEFAULT 0, relatorio_json TEXT, status TEXT NOT NULL DEFAULT 'importado' CHECK (status IN ('importado', 'revertido')), criado_em TEXT NOT NULL DEFAULT (datetime('now')), revertido_em TEXT );

CREATE UNIQUE INDEX IF NOT EXISTS idx_vh_lotes_hash ON vendas_historico_lotes(arquivo_hash) WHERE status = 'importado';

CREATE TABLE IF NOT EXISTS vendas_historico_itens ( id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL REFERENCES vendas_historico_lotes(id), origem_linha TEXT NOT NULL, data_original TEXT, cliente_nome_original TEXT, sku_original TEXT, nome_produto_historico TEXT, tipo_original TEXT, preco_unit_original TEXT, desconto_original TEXT, valor_total_original TEXT, pagamento_original TEXT, status_pagamento_original TEXT, observacao_original TEXT, data TEXT, cliente_id INTEGER REFERENCES clientes(id), cliente_nome_norm TEXT, sku TEXT, sku_base TEXT, tipo TEXT, qtd INTEGER, preco_unit REAL, valor_total REAL, desconto_valor REAL, desconto_pct REAL, desconto_rotulo TEXT, pagamento_forma TEXT, pagamento_parcelas INTEGER, pago INTEGER, canal TEXT, contexto TEXT, revendedora_nome TEXT, revendedora_id INTEGER REFERENCES revendedoras(id), problemas_json TEXT, pedido_chave TEXT, venda_historica_id INTEGER REFERENCES vendas_historicas(id), criado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE UNIQUE INDEX IF NOT EXISTS idx_vh_itens_idem ON vendas_historico_itens(lote_id, origem_linha);

CREATE INDEX IF NOT EXISTS idx_vh_itens_data ON vendas_historico_itens(data);

CREATE INDEX IF NOT EXISTS idx_vh_itens_sku ON vendas_historico_itens(sku_base);

CREATE INDEX IF NOT EXISTS idx_vh_itens_cliente ON vendas_historico_itens(cliente_id);

CREATE INDEX IF NOT EXISTS idx_vh_itens_norm ON vendas_historico_itens(cliente_nome_norm);

CREATE INDEX IF NOT EXISTS idx_vh_itens_canal ON vendas_historico_itens(canal);

CREATE INDEX IF NOT EXISTS idx_vh_itens_venda ON vendas_historico_itens(venda_historica_id);

CREATE TABLE IF NOT EXISTS clientes_vinculo_revisao ( id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER REFERENCES vendas_historico_lotes(id), nome_original TEXT NOT NULL, nome_norm TEXT NOT NULL, candidato_id INTEGER REFERENCES clientes(id), candidato_nome TEXT, motivo TEXT NOT NULL, linhas INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'vinculado', 'separado')), criado_em TEXT NOT NULL DEFAULT (datetime('now')), decidido_em TEXT );

CREATE UNIQUE INDEX IF NOT EXISTS idx_cvr_unico ON clientes_vinculo_revisao(nome_norm, status) WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_cvr_status ON clientes_vinculo_revisao(status);

CREATE INDEX IF NOT EXISTS idx_clientes_nome_norm ON clientes(nome_norm);

CREATE INDEX IF NOT EXISTS idx_clientes_tel_norm ON clientes(tel_norm);

CREATE INDEX IF NOT EXISTS idx_clientes_cpf_norm ON clientes(cpf_norm);

CREATE TABLE IF NOT EXISTS vendas_historicas ( id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL REFERENCES vendas_historico_lotes(id), chave TEXT NOT NULL, classe TEXT NOT NULL DEFAULT 'venda' CHECK (classe IN ('venda', 'ajuste')), regra TEXT NOT NULL, cliente_nome TEXT, cliente_nome_norm TEXT, cliente_id INTEGER REFERENCES clientes(id), data TEXT, itens INTEGER NOT NULL DEFAULT 0, pecas INTEGER NOT NULL DEFAULT 0, valor_total REAL, valor_pago REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'indefinida' CHECK (status IN ('paga', 'nao_paga', 'parcial', 'indefinida')), elegivel_ticket INTEGER NOT NULL DEFAULT 0, canal TEXT, contexto TEXT, observacao_original TEXT, origem_linhas TEXT NOT NULL DEFAULT '[]', criado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE UNIQUE INDEX IF NOT EXISTS idx_vh_vendas_chave ON vendas_historicas(lote_id, chave);

CREATE INDEX IF NOT EXISTS idx_vh_vendas_data ON vendas_historicas(data);

CREATE INDEX IF NOT EXISTS idx_vh_vendas_norm ON vendas_historicas(cliente_nome_norm);

CREATE INDEX IF NOT EXISTS idx_vh_vendas_cliente ON vendas_historicas(cliente_id);

CREATE INDEX IF NOT EXISTS idx_vh_vendas_canal ON vendas_historicas(canal);

CREATE INDEX IF NOT EXISTS idx_vh_vendas_classe ON vendas_historicas(classe, elegivel_ticket);

CREATE INDEX IF NOT EXISTS idx_vh_vendas_periodo ON vendas_historicas(classe, data, elegivel_ticket);

CREATE INDEX IF NOT EXISTS idx_vendas_cliente_norm ON vendas(cliente_nome_norm);

CREATE TABLE IF NOT EXISTS historico_operacoes ( id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id INTEGER NOT NULL REFERENCES vendas_historico_lotes(id), venda_chave TEXT NOT NULL, fingerprint TEXT NOT NULL, papel TEXT NOT NULL DEFAULT 'cliente' CHECK (papel IN ('cliente', 'acerto', 'revisao')), cliente_id INTEGER REFERENCES clientes(id), cliente_nome_norm TEXT, revendedora_id INTEGER REFERENCES revendedoras(id), pecas INTEGER, bruto_centavos INTEGER, comissao_centavos INTEGER, liquido_centavos INTEGER, linhas_excluidas_json TEXT NOT NULL DEFAULT '[]', cobranca_status TEXT NOT NULL DEFAULT 'nenhuma' CHECK (cobranca_status IN ('nenhuma', 'aberta', 'paga', 'revisao')), valor_efetivo_centavos INTEGER, valor_recebido_fonte_centavos INTEGER, valor_recebido_centavos INTEGER, saldo_centavos INTEGER, vencimento_em TEXT, vencimento_origem TEXT, paga_em TEXT, canal TEXT, contexto TEXT, observacao TEXT, evidencia_json TEXT NOT NULL DEFAULT '{}', versao INTEGER NOT NULL DEFAULT 1, status_registro TEXT NOT NULL DEFAULT 'ativa' CHECK (status_registro IN ('ativa', 'substituida')), substitui_id INTEGER REFERENCES historico_operacoes(id), criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT, CHECK (versao >= 1), CHECK (pecas IS NULL OR pecas >= 0), CHECK (bruto_centavos IS NULL OR bruto_centavos >= 0), CHECK (comissao_centavos IS NULL OR comissao_centavos >= 0), CHECK (liquido_centavos IS NULL OR liquido_centavos >= 0), CHECK (valor_efetivo_centavos IS NULL OR valor_efetivo_centavos >= 0), CHECK (valor_recebido_fonte_centavos IS NULL OR valor_recebido_fonte_centavos >= 0), CHECK (valor_recebido_centavos IS NULL OR valor_recebido_centavos >= 0), CHECK (saldo_centavos IS NULL OR saldo_centavos >= 0), CHECK (papel = 'cliente' OR cobranca_status IN ('nenhuma', 'revisao')), CHECK (papel <> 'acerto' OR revendedora_id IS NOT NULL), CHECK (papel <> 'acerto' OR bruto_centavos = comissao_centavos + liquido_centavos), CHECK (cobranca_status NOT IN ('aberta', 'paga') OR valor_efetivo_centavos IS NOT NULL), CHECK (cobranca_status <> 'aberta' OR saldo_centavos > 0), CHECK (cobranca_status <> 'paga' OR saldo_centavos = 0) );

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_op_lote_chave_versao ON historico_operacoes(lote_id, venda_chave, versao);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_op_ativa_chave ON historico_operacoes(venda_chave) WHERE status_registro = 'ativa';

CREATE INDEX IF NOT EXISTS idx_hist_op_revendedora ON historico_operacoes(revendedora_id, papel, status_registro);

CREATE INDEX IF NOT EXISTS idx_hist_op_cliente ON historico_operacoes(cliente_id, cliente_nome_norm, papel, status_registro);

CREATE INDEX IF NOT EXISTS idx_hist_op_cobranca ON historico_operacoes(cobranca_status, vencimento_em, status_registro);

CREATE TABLE IF NOT EXISTS historico_operacao_vendas ( id INTEGER PRIMARY KEY AUTOINCREMENT, operacao_id INTEGER NOT NULL REFERENCES historico_operacoes(id), venda_id INTEGER NOT NULL REFERENCES vendas(id), relacao TEXT NOT NULL DEFAULT 'duplicata' CHECK (relacao = 'duplicata'), evidencia_json TEXT NOT NULL DEFAULT '{}', status_registro TEXT NOT NULL DEFAULT 'ativa' CHECK (status_registro IN ('ativa', 'substituida')), criado_em TEXT NOT NULL DEFAULT (datetime('now')), substituida_em TEXT );

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_op_venda_ativa ON historico_operacao_vendas(venda_id) WHERE status_registro = 'ativa';

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_op_relacao_ativa ON historico_operacao_vendas(operacao_id, venda_id) WHERE status_registro = 'ativa';

CREATE INDEX IF NOT EXISTS idx_hist_op_vendas_operacao ON historico_operacao_vendas(operacao_id, status_registro);

/* ═══════════════════════════════════════════ §30 — saída sem faturamento Peça que sai do estoque nem sempre é venda. Brinde, uso próprio e diferença de inventário moram AQUI, e não em `vendas`: não têm cliente, não têm preço cobrado e não geram contas a receber. Pendurá-las numa venda obrigaria toda consulta de faturamento a lembrar de excluí-las — e a que esquecesse voltaria a contaminar o número. Aqui elas são invisíveis por construção para quem soma venda. O estoque continua saindo por `estoque.js › movimentar`;

`movimento_id` amarra a linha ao movimento que a explica. Detalhe e motivação completos em `api/migracao-saidas-sem-faturamento.sql`. */ CREATE TABLE IF NOT EXISTS saidas_sem_faturamento ( id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL CHECK (tipo IN ('brinde', 'uso_proprio', 'perda', 'sorteio')), sentido TEXT NOT NULL DEFAULT 'saida' CHECK (sentido IN ('saida', 'entrada')), data TEXT NOT NULL, sku TEXT NOT NULL REFERENCES produtos(sku), variacao TEXT, variante_id TEXT, qtd INTEGER NOT NULL CHECK (qtd > 0), motivo TEXT, observacao TEXT, movimento_id INTEGER REFERENCES movimentos(id), estoque_refletido INTEGER NOT NULL DEFAULT 1 CHECK (estoque_refletido IN (0, 1)), origem_usuario TEXT, estornada INTEGER NOT NULL DEFAULT 0 CHECK (estornada IN (0, 1)), estorno_em TEXT, estorno_motivo TEXT, estorno_movimento_id INTEGER REFERENCES movimentos(id), origem_registro TEXT NOT NULL DEFAULT 'manual' CHECK (origem_registro IN ('manual', 'migracao_historico')), historico_item_id INTEGER REFERENCES vendas_historico_itens(id), inventario_id INTEGER REFERENCES inventarios(id), criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT, CHECK (sentido = 'saida' OR tipo = 'perda'), CHECK (estornada = 0 OR estorno_em IS NOT NULL), CHECK (estoque_refletido = 1 OR movimento_id IS NULL), CHECK (estoque_refletido = 1 OR estorno_movimento_id IS NULL) );

CREATE INDEX IF NOT EXISTS idx_ssf_data ON saidas_sem_faturamento(data);

CREATE INDEX IF NOT EXISTS idx_ssf_tipo ON saidas_sem_faturamento(tipo, estornada);

CREATE INDEX IF NOT EXISTS idx_ssf_sku ON saidas_sem_faturamento(sku);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ssf_historico ON saidas_sem_faturamento(historico_item_id) WHERE historico_item_id IS NOT NULL;

/* Fase 4.4 — a mesma diferença de inventário entra uma vez só, e a trava é do BANCO: vale sob crash-e-retry e sob duas abas abertas. `estornada = 0` é deliberado: diferença estornada PODE ser relançada com o valor certo. */ CREATE UNIQUE INDEX IF NOT EXISTS idx_saida_inventario_unica ON saidas_sem_faturamento (inventario_id, sku, COALESCE(variacao, '')) WHERE inventario_id IS NOT NULL AND estornada = 0;

CREATE TABLE IF NOT EXISTS historico_reclassificacao ( id INTEGER PRIMARY KEY AUTOINCREMENT, historico_item_id INTEGER NOT NULL REFERENCES vendas_historico_itens(id), classe_nova TEXT NOT NULL CHECK (classe_nova IN ('brinde', 'uso_proprio', 'perda', 'sorteio')), confianca TEXT NOT NULL CHECK (confianca IN ('alta', 'media', 'baixa')), motivo TEXT NOT NULL, saida_id INTEGER REFERENCES saidas_sem_faturamento(id), status TEXT NOT NULL DEFAULT 'proposta' CHECK (status IN ('proposta', 'aplicada', 'recusada')), decidido_em TEXT, decidido_por TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE UNIQUE INDEX IF NOT EXISTS idx_hrec_item ON historico_reclassificacao(historico_item_id);

CREATE INDEX IF NOT EXISTS idx_hrec_status ON historico_reclassificacao(status);

/* ═══════════════════════════════════════════════ §31 — garantia e reparo A garantia pertence ao ITEM da compra, não ao cliente nem ao código: se a mesma cliente comprou o mesmo SKU três vezes, prender ao SKU perde a compra de origem e o valor efetivamente pago junto com ela. Nada aqui altera a venda original, devolve a peça defeituosa ao estoque vendável ou gera faturamento. Só a DIFERENÇA de uma troca, quando paga, vira receita. Detalhe completo em `api/migracao-garantias.sql`. */ CREATE TABLE IF NOT EXISTS garantias ( id INTEGER PRIMARY KEY AUTOINCREMENT, origem_fonte TEXT NOT NULL CHECK (origem_fonte IN ('operacional', 'historico')), venda_id INTEGER REFERENCES vendas(id), historico_item_id INTEGER REFERENCES vendas_historico_itens(id), venda_historica_id INTEGER REFERENCES vendas_historicas(id), cliente_id INTEGER REFERENCES clientes(id), cliente_nome_norm TEXT, cliente_nome TEXT, sku TEXT NOT NULL, variacao TEXT, variante_id TEXT, produto_nome TEXT, data_venda TEXT, valor_pago_original REAL, data_entrada TEXT NOT NULL, prazo_dias_uteis INTEGER NOT NULL DEFAULT 45, previsao_retorno TEXT, motivo TEXT NOT NULL, observacao TEXT, status TEXT NOT NULL DEFAULT 'em_reparo' CHECK (status IN ('em_reparo', 'reparada', 'devolvida', 'sem_conserto', 'concluida', 'cancelada')), encerrada_em TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT, CHECK (origem_fonte <> 'operacional' OR venda_id IS NOT NULL), CHECK (origem_fonte <> 'historico' OR historico_item_id IS NOT NULL), CHECK (prazo_dias_uteis > 0) );

CREATE INDEX IF NOT EXISTS idx_gar_status ON garantias(status);

CREATE INDEX IF NOT EXISTS idx_gar_cliente ON garantias(cliente_id);

CREATE INDEX IF NOT EXISTS idx_gar_norm ON garantias(cliente_nome_norm);

CREATE INDEX IF NOT EXISTS idx_gar_venda ON garantias(venda_id);

CREATE INDEX IF NOT EXISTS idx_gar_hist ON garantias(historico_item_id);

CREATE INDEX IF NOT EXISTS idx_gar_entrada ON garantias(data_entrada);

CREATE TABLE IF NOT EXISTS garantia_eventos ( id INTEGER PRIMARY KEY AUTOINCREMENT, garantia_id INTEGER NOT NULL REFERENCES garantias(id), tipo TEXT NOT NULL, data TEXT NOT NULL, status_novo TEXT, observacao TEXT, dados_json TEXT NOT NULL DEFAULT '{}', criado_em TEXT NOT NULL DEFAULT (datetime('now')) );

CREATE INDEX IF NOT EXISTS idx_gar_ev ON garantia_eventos(garantia_id, id);

CREATE TABLE IF NOT EXISTS garantia_trocas ( id INTEGER PRIMARY KEY AUTOINCREMENT, garantia_id INTEGER NOT NULL REFERENCES garantias(id), data TEXT NOT NULL, sku_novo TEXT NOT NULL REFERENCES produtos(sku), variacao_nova TEXT, variante_id_novo TEXT, produto_novo_nome TEXT, valor_original REAL NOT NULL, valor_novo REAL NOT NULL, diferenca REAL NOT NULL, diferenca_status TEXT NOT NULL CHECK (diferenca_status IN ('nenhuma', 'a_receber', 'paga', 'pendente_regra')), diferenca_paga_em TEXT, diferenca_valor_pago REAL, movimento_id INTEGER REFERENCES movimentos(id), criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT, venda_id INTEGER REFERENCES vendas(id), CHECK (diferenca_status <> 'paga' OR diferenca_paga_em IS NOT NULL) );

CREATE UNIQUE INDEX IF NOT EXISTS idx_gar_troca_unica ON garantia_trocas(garantia_id);

CREATE INDEX IF NOT EXISTS idx_gar_troca_dif ON garantia_trocas(diferenca_status, diferenca_paga_em);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gar_troca_venda ON garantia_trocas(venda_id);

CREATE TABLE IF NOT EXISTS feriados ( data TEXT PRIMARY KEY, nome TEXT NOT NULL, escopo TEXT NOT NULL DEFAULT 'nacional', criado_em TEXT NOT NULL DEFAULT (datetime('now')) );
