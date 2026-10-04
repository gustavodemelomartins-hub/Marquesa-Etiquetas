-- Foto da cliente (avatar), descoberta a partir do Instagram PÚBLICO.
--
-- Três tabelas NOVAS. Nenhuma coluna de `clientes`, `vendas`, estoque,
-- revendedoras ou financeiro é tocada, e nenhuma linha existente é reescrita:
-- a migration é puramente aditiva.
--
--   cliente_avatar            a foto CONFIRMADA (os bytes ficam no R2, chave
--                             `clientes/<id>/avatar`; aqui só a referência)
--   cliente_avatar_candidato  sugestões aguardando decisão humana
--   cliente_avatar_busca      checkpoint da busca em lote (continua de onde
--                             parou; cliente nova entra na fila sozinha por
--                             NÃO ter linha aqui)
--
-- Só guarda o necessário para identificar a foto: id, username, nome público
-- e o endereço da imagem. Nada de seguidores, posts, stories ou curtidas.
--
-- Idempotente (IF NOT EXISTS). Reversível: migracao-cliente-avatar-rollback.sql.

CREATE TABLE IF NOT EXISTS cliente_avatar (
  cliente_id         INTEGER PRIMARY KEY REFERENCES clientes(id),
  instagram_user_id  TEXT,
  instagram_username TEXT,
  r2_key             TEXT NOT NULL,
  tipo               TEXT,
  tamanho            INTEGER,
  source             TEXT NOT NULL DEFAULT 'instagram',
  confirmed_at       TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cliente_avatar_candidato (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id),
  instagram_user_id TEXT,
  username          TEXT NOT NULL,
  full_name         TEXT,
  profile_pic_url   TEXT,
  score             REAL NOT NULL,
  motivo            TEXT,
  status            TEXT NOT NULL DEFAULT 'pendente',  -- pendente | recusado | confirmado | descartado
  consultado_em     TEXT NOT NULL,
  decidido_em       TEXT,
  UNIQUE (cliente_id, username)
);
CREATE INDEX IF NOT EXISTS idx_cac_cliente ON cliente_avatar_candidato(cliente_id, status);

CREATE TABLE IF NOT EXISTS cliente_avatar_busca (
  cliente_id    INTEGER PRIMARY KEY REFERENCES clientes(id),
  status        TEXT NOT NULL,                         -- feita | sem_resultado | erro | ignorada
  candidatos    INTEGER NOT NULL DEFAULT 0,
  tentativas    INTEGER NOT NULL DEFAULT 1,
  erro          TEXT,
  consultado_em TEXT NOT NULL
);
