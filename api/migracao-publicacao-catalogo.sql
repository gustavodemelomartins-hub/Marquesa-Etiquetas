-- Pacote 4 — fluxo interno de preparação e aprovação do catálogo.
--
-- Esta tabela NÃO publica na Nuvemshop e NÃO movimenta estoque. Ela guarda
-- somente o rascunho preparado e a decisão humana. Os gates continuam sendo
-- recalculados a partir de `produtos` e `movimentos` antes de aprovar.
-- Compatível com rollback: veja migracao-publicacao-catalogo-rollback.sql.

CREATE TABLE IF NOT EXISTS catalogo_publicacoes (
  sku                 TEXT PRIMARY KEY REFERENCES produtos(sku),
  estado              TEXT NOT NULL DEFAULT 'em_preparacao_agente'
                       CHECK (estado IN (
                         'em_preparacao_agente',
                         'aguardando_aprovacao',
                         'aprovado_para_publicar',
                         'publicado',
                         'falhou_ao_publicar'
                       )),
  nome_site           TEXT,
  descricao_site      TEXT,
  seo_titulo          TEXT,
  seo_descricao       TEXT,
  dados_assinatura    TEXT,
  preparo_erro        TEXT,
  publicacao_erro     TEXT,
  tentativas          INTEGER NOT NULL DEFAULT 0,
  preparado_em        TEXT,
  aprovado_em         TEXT,
  aprovado_por        TEXT,
  publicado_em        TEXT,
  atualizado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_catalogo_publicacoes_estado
  ON catalogo_publicacoes(estado);
