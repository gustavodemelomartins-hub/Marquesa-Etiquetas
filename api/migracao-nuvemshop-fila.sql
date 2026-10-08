-- Marquesa — Estoque online incremental: fila de envio para a Nuvemshop (§61)
-- Data: 2026-10-08
--
-- Migration ADITIVA, Classe C. Duas tabelas novas, três índices e cinco
-- gatilhos. Nenhum DROP, nenhuma coluna alterada, nenhuma linha existente
-- reescrita. Pode rodar duas vezes: tudo é IF NOT EXISTS.
--
-- O QUE ELA EXISTE PARA GUARDAR
--
-- Até aqui, cada venda relia o catálogo inteiro da loja e o daqui para
-- empurrar o estoque de TODOS os códigos, e o freio da rodada ("zeraria 60
-- produtos") barrava o envio inteiro. Nenhuma venda chegava à loja.
--
-- `nuvemshop_fila` é o OUTBOX: uma linha por código que precisa ter o saldo
-- reenviado. Ela é preenchida pelo BANCO, por gatilho, na MESMA transação do
-- movimento de estoque — não por um passo do código que poderia não
-- acontecer se o processo caísse entre a baixa e o pedido de envio. Todo
-- caminho que mexe em estoque passa por `movimentos` (regra 1), então todo
-- caminho entra na fila sem que nenhum precise lembrar.
--
-- `versao` cresce a cada novo pedido do mesmo código; quem processa só marca
-- "sincronizado" se a versão não mudou enquanto trabalhava. `travado_ate` é
-- o arrendamento que impede duas rodadas de pegar o mesmo código.
--
-- `nuvemshop_conferencia` é o retrato da última "Conferir estoque com
-- Nuvemshop": uma linha por variante, com os dois números e a classificação.
-- É leitura; é regravada inteira a cada conferência.
--
-- Rollback: api/migracao-nuvemshop-fila-rollback.sql
CREATE TABLE IF NOT EXISTS nuvemshop_fila (
  sku                 TEXT PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente','sincronizado','erro','revisao','ignorado')),
  motivo              TEXT,              -- o que pediu o envio: tipo do movimento, 'reconciliacao'...
  versao              INTEGER NOT NULL DEFAULT 1,
  pedido_em           TEXT NOT NULL,     -- ISO UTC do último pedido de envio
  tentativas          INTEGER NOT NULL DEFAULT 0,
  proxima_em          TEXT,              -- não tentar antes disto (espera após falha)
  travado_ate         TEXT,              -- arrendamento da rodada que está com o código
  ultima_tentativa_em TEXT,
  sincronizado_em     TEXT,
  ultimo_erro         TEXT,              -- frase para gente; nunca token nem corpo de requisição
  enviado_json        TEXT,              -- [{varianteId, de, para}] do último envio aceito
  resultado_json      TEXT
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_fila_status ON nuvemshop_fila(status, proxima_em);

CREATE TABLE IF NOT EXISTS nuvemshop_conferencia (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  sku                  TEXT,
  produto              TEXT,
  variante             TEXT,
  ns_produto_id        TEXT,
  ns_variante_id       TEXT,
  ns_sku               TEXT,
  em_casa              INTEGER,
  consignado           INTEGER,
  online               INTEGER,           -- o saldo que a loja DEVERIA ter (em casa)
  ns_estoque           INTEGER,           -- o que a loja tinha na leitura
  diferenca            INTEGER,
  status               TEXT NOT NULL,     -- ok | divergente | so_sistema | so_nuvemshop | sem_sku |
                                          -- sku_duplicado | sem_mapeamento | variante_sem_mapeamento |
                                          -- aguardando_preparacao | erro_integracao
  motivo               TEXT,
  publicado            INTEGER,
  ns_tem_descricao     INTEGER,
  ns_tem_seo_titulo    INTEGER,
  ns_tem_seo_descricao INTEGER,
  ns_imagens           INTEGER,
  conferido_em         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_conf_sku ON nuvemshop_conferencia(sku);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_conf_status ON nuvemshop_conferencia(status);

-- Todo movimento de estoque pede o reenvio do código — e dos kits que usam
-- a peça, porque o disponível do kit vem dos componentes.
CREATE TRIGGER IF NOT EXISTS trg_nuvemshop_fila_movimento
AFTER INSERT ON movimentos
BEGIN
  INSERT INTO nuvemshop_fila (sku, status, motivo, versao, pedido_em, tentativas)
  VALUES (NEW.sku, 'pendente', NEW.tipo, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0)
  ON CONFLICT(sku) DO UPDATE SET
    status = 'pendente', motivo = excluded.motivo, versao = nuvemshop_fila.versao + 1,
    pedido_em = excluded.pedido_em, tentativas = 0, proxima_em = NULL;
  INSERT INTO nuvemshop_fila (sku, status, motivo, versao, pedido_em, tentativas)
  SELECT kc.kit_sku, 'pendente', 'kit', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0
    FROM kit_componentes kc WHERE kc.componente_sku = NEW.sku
  ON CONFLICT(sku) DO UPDATE SET
    status = 'pendente', motivo = excluded.motivo, versao = nuvemshop_fila.versao + 1,
    pedido_em = excluded.pedido_em, tentativas = 0, proxima_em = NULL;
END;

-- Dizer QUAL variação saiu na maleta muda o "em casa" daquela variação.
CREATE TRIGGER IF NOT EXISTS trg_nuvemshop_fila_movimento_variacao
AFTER UPDATE OF variacao, variante_id ON movimentos
BEGIN
  INSERT INTO nuvemshop_fila (sku, status, motivo, versao, pedido_em, tentativas)
  VALUES (NEW.sku, 'pendente', 'variacao', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0)
  ON CONFLICT(sku) DO UPDATE SET
    status = 'pendente', motivo = excluded.motivo, versao = nuvemshop_fila.versao + 1,
    pedido_em = excluded.pedido_em, tentativas = 0, proxima_em = NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_nuvemshop_fila_maleta_variacao_ins
AFTER INSERT ON maleta_item_variacoes
BEGIN
  INSERT INTO nuvemshop_fila (sku, status, motivo, versao, pedido_em, tentativas)
  VALUES (NEW.sku, 'pendente', 'maleta_variacao', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0)
  ON CONFLICT(sku) DO UPDATE SET
    status = 'pendente', motivo = excluded.motivo, versao = nuvemshop_fila.versao + 1,
    pedido_em = excluded.pedido_em, tentativas = 0, proxima_em = NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_nuvemshop_fila_maleta_variacao_del
AFTER DELETE ON maleta_item_variacoes
BEGIN
  INSERT INTO nuvemshop_fila (sku, status, motivo, versao, pedido_em, tentativas)
  VALUES (OLD.sku, 'pendente', 'maleta_variacao', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0)
  ON CONFLICT(sku) DO UPDATE SET
    status = 'pendente', motivo = excluded.motivo, versao = nuvemshop_fila.versao + 1,
    pedido_em = excluded.pedido_em, tentativas = 0, proxima_em = NULL;
END;

-- Peça que acabou de ganhar anúncio (publicação, conferência) passa a ter o
-- estoque mantido a partir deste instante.
CREATE TRIGGER IF NOT EXISTS trg_nuvemshop_fila_anuncio
AFTER UPDATE OF produto_id_loja ON produtos
WHEN NEW.produto_id_loja IS NOT NULL
 AND (OLD.produto_id_loja IS NULL OR OLD.produto_id_loja <> NEW.produto_id_loja)
BEGIN
  INSERT INTO nuvemshop_fila (sku, status, motivo, versao, pedido_em, tentativas)
  VALUES (NEW.sku, 'pendente', 'anuncio', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0)
  ON CONFLICT(sku) DO UPDATE SET
    status = 'pendente', motivo = excluded.motivo, versao = nuvemshop_fila.versao + 1,
    pedido_em = excluded.pedido_em, tentativas = 0, proxima_em = NULL;
END;
