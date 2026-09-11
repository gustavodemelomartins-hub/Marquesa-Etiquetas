-- Marquesa — Publicação do catálogo: o CHECK deixa de mentir
-- Fase 4, item 5.  Data: 2026-09-10
-- Desenho canônico: docs/domains/CATALOGO-MIDIA-PUBLICACAO-4-5.md
-- Roda DEPOIS de `api/migracao-catalogo-4-5.sql`.
--
-- ⚠️  ESTA MIGRATION RODA UMA VEZ. Não é idempotente: uma segunda execução
--    recopiaria a tabela já migrada por uma lista de colunas antiga e perderia
--    `publicando_em`, `despublicado_em`, `despublicado_por` e
--    `produto_id_loja`. Dizer isso é melhor que fingir um `IF NOT EXISTS` que
--    não protege nada.
--
-- Antes de rodar, a pré-condição que decide se ela já rodou:
--
--    SELECT COUNT(*) FROM pragma_table_info('catalogo_publicacoes')
--     WHERE name = 'publicando_em';
--
--    0 → pode rodar.   1 → já rodou, NÃO rode de novo.
--
-- Por que reconstruir, num projeto que prefere migration aditiva: a tabela
-- declarava cinco estados no CHECK e o código escrevia três. `publicado` e
-- `falhou_ao_publicar` estavam lá e NENHUM caminho os gravava — quem lesse o
-- schema concluiria que a publicação funcionava. SQLite não altera CHECK sem
-- reconstruir, então ou a tabela muda ou o schema continua mentindo.
--
-- O risco real é baixo e foi MEDIDO, não presumido: em 10/09/2026
-- `catalogo_publicacoes` tem **0 linhas** em produção. O `INSERT ... SELECT`
-- abaixo copia assim mesmo, para a migration valer num banco que já tenha
-- rascunho.
--
-- O que muda no domínio: entram `em_preparacao`, `preparado`, `publicando` e
-- `despublicado`; sai `falta_informacao`, que nunca foi persistido e agora é
-- explicitamente calculado — o juíz de completude decide, não a tabela.

CREATE TABLE IF NOT EXISTS catalogo_publicacoes_4_5 (
  sku TEXT PRIMARY KEY REFERENCES produtos(sku),
  estado TEXT NOT NULL DEFAULT 'em_preparacao'
    CHECK (estado IN ('em_preparacao','preparado','aguardando_aprovacao',
                      'aprovado_para_publicar','publicando','publicado',
                      'falhou_ao_publicar','despublicado')),
  nome_site TEXT,
  descricao_site TEXT,
  seo_titulo TEXT,
  seo_descricao TEXT,
  dados_assinatura TEXT,
  preparo_erro TEXT,
  publicacao_erro TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  preparado_em TEXT,
  aprovado_em TEXT,
  aprovado_por TEXT,
  publicado_em TEXT,
  -- Novas: o que o writer de publicação precisa para ser idempotente e para
  -- que "despublicado" seja um ato registrado, não a ausência de url_loja.
  publicando_em    TEXT,
  despublicado_em  TEXT,
  despublicado_por TEXT,
  produto_id_loja  TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A tradução dos estados antigos. `em_preparacao_agente` perde o "_agente"
-- porque o agente deixou de ser parte do nome do estado — quem prepara é
-- decisão de fora, e o estado é do catálogo.
INSERT OR IGNORE INTO catalogo_publicacoes_4_5
  (sku, estado, nome_site, descricao_site, seo_titulo, seo_descricao,
   dados_assinatura, preparo_erro, publicacao_erro, tentativas,
   preparado_em, aprovado_em, aprovado_por, publicado_em, atualizado_em)
SELECT sku,
       CASE estado WHEN 'em_preparacao_agente' THEN 'em_preparacao' ELSE estado END,
       nome_site, descricao_site, seo_titulo, seo_descricao,
       dados_assinatura, preparo_erro, publicacao_erro, tentativas,
       preparado_em, aprovado_em, aprovado_por, publicado_em, atualizado_em
  FROM catalogo_publicacoes;

DROP TABLE catalogo_publicacoes;
ALTER TABLE catalogo_publicacoes_4_5 RENAME TO catalogo_publicacoes;
CREATE INDEX IF NOT EXISTS idx_catalogo_publicacoes_estado ON catalogo_publicacoes(estado);
