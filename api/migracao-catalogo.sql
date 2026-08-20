-- Catálogo mestre: foto da peça, fila de peças novas e fotos sem dono.
--
-- As tabelas são seguras de rodar duas vezes. Os ALTER TABLE abaixo NÃO
-- são: cada um falha se a coluna já existir, e esse erro significa "já foi
-- aplicada" — pode ignorar.

-- ---------------------------------------------------------------- fotos
-- A foto vive em duas versões, e as duas importam:
--   original  — o que a Sthefany fotografou, ou o que a loja já tinha
--   tratada   — a mesma peça com fundo branco, que é a que vai para a loja
-- Guardar só a tratada apagaria a fonte; guardar só a original obrigaria a
-- refazer o tratamento toda vez.
ALTER TABLE produtos ADD COLUMN foto_original TEXT;
ALTER TABLE produtos ADD COLUMN foto_tratada  TEXT;
-- sem_foto | original | fundo_pendente | fundo_gerado | erro
ALTER TABLE produtos ADD COLUMN foto_status   TEXT;
ALTER TABLE produtos ADD COLUMN foto_erro     TEXT;
ALTER TABLE produtos ADD COLUMN foto_origem   TEXT;   -- nuvemshop | upload
ALTER TABLE produtos ADD COLUMN foto_em       TEXT;

-- ------------------------------------------------- peças novas na fila
-- A importação de estoque total encontra códigos que ainda não existem
-- aqui. Ela NÃO os cria (isso é trabalho do fluxo "Adicionar peças novas"),
-- mas jogar fora o que encontrou obrigaria a reimportar o mesmo arquivo.
-- Então eles esperam nesta fila até alguém aprovar o lote.
CREATE TABLE IF NOT EXISTS produtos_pendentes (
  sku         TEXT PRIMARY KEY,
  desc        TEXT,
  cat         TEXT,
  preco       REAL,
  qtd         INTEGER NOT NULL DEFAULT 0,
  origem      TEXT,                                  -- de onde veio (planilha, loja)
  motivo      TEXT,                                  -- por que está esperando
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------- fotos sem correspondência
-- Imagem que veio da loja e cujo código não bateu com nenhum daqui. Chutar
-- a peça certa é pior que não ter foto: a etiqueta erra e a loja anuncia
-- uma peça mostrando outra. Fica na fila para alguém decidir.
CREATE TABLE IF NOT EXISTS fotos_orfas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  url         TEXT NOT NULL,
  sku_loja    TEXT,
  nome_loja   TEXT,
  produto_id  TEXT,
  visto_em    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fotos_orfas_sku ON fotos_orfas(sku_loja);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fotos_orfas_url ON fotos_orfas(url);
