-- Marquesa — Galeria de fotos da peça: miniatura, procedência e remoção
-- Data: 2026-09-29
-- Desenho: docs/domains/GALERIA-FOTOS-PECAS.md
--
-- Migration Classe C, 100% ADITIVA: nove `ADD COLUMN` e dois índices.
-- Nenhuma linha existente muda (em 29/09/2026 `produto_fotos` tem 0 linhas
-- em produção). Rodar duas vezes é inofensivo: os índices são
-- `IF NOT EXISTS` e o `ADD COLUMN` repetido devolve "duplicate column
-- name", que o aplicador ignora (como em `migracao-catalogo-4-5.sql`).
--
-- Rollback: nada a desfazer no dado. As colunas novas ficam NULL e o código
-- anterior não as lê; os dois índices podem ser removidos com
--   DROP INDEX IF EXISTS idx_produto_fotos_imagem_loja;
--   DROP INDEX IF EXISTS idx_produto_fotos_viva;

-- ═══════════════════════════════════════════════ 1. MINIATURA
--
-- A lista de Peças mostra ~60 fotos de 44 px de uma vez, e a galeria em
-- cartões mostra dezenas de 200 px. Servir o original (até 1600 px) para
-- isso é o que faz uma tela travar no 4G. A miniatura é um OBJETO PRÓPRIO
-- no R2 (`produtos/<sku>/<fotoId>/miniatura`), gravado junto com o
-- original — e nunca no lugar dele.
ALTER TABLE produto_fotos ADD COLUMN miniatura_key  TEXT;
ALTER TABLE produto_fotos ADD COLUMN miniatura_tipo TEXT;
ALTER TABLE produto_fotos ADD COLUMN miniatura_tam  INTEGER;
-- Dimensões do original, quando quem enviou soube dizer. Servem para a
-- tela reservar o espaço certo antes de a imagem chegar.
ALTER TABLE produto_fotos ADD COLUMN largura INTEGER;
ALTER TABLE produto_fotos ADD COLUMN altura  INTEGER;

-- ═══════════════════════════════════════════════ 2. PROCEDÊNCIA DA LOJA
--
-- `imagem_id_loja` (Fase 4.5) já diz "esta foto existe na vitrine com este
-- id". Faltavam o produto e a variação de lá, e a posição que ela ocupava:
-- sem eles, "de onde veio esta foto?" só se responde abrindo a Nuvemshop.
ALTER TABLE produto_fotos ADD COLUMN produto_id_loja  TEXT;
ALTER TABLE produto_fotos ADD COLUMN variante_id_loja TEXT;
ALTER TABLE produto_fotos ADD COLUMN posicao_loja     INTEGER;

-- ═══════════════════════════════════════════════ 3. REMOÇÃO COM MEMÓRIA
--
-- Remover uma foto apaga os BYTES do R2 (a chave inclui o id da foto, então
-- nenhum outro código aponta para o mesmo objeto) mas mantém a LINHA, com
-- as chaves zeradas e a data. Por dois motivos:
--   1. a importação da loja é idempotente pelo id da imagem — sem a linha,
--      a próxima importação traria de volta a foto que alguém tirou;
--   2. a auditoria continua podendo responder "havia uma foto aqui, veio
--      da loja, e foi removida em tal dia".
ALTER TABLE produto_fotos ADD COLUMN removida_em TEXT;

-- A IDEMPOTÊNCIA da importação, garantida pelo banco e não pela lógica:
-- a mesma imagem da loja não entra duas vezes no mesmo código. Vale também
-- para as linhas removidas — é isso que impede a foto tirada de voltar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_fotos_imagem_loja
  ON produto_fotos(sku, imagem_id_loja) WHERE imagem_id_loja IS NOT NULL;

-- A galeria viva de um código, que é a consulta de toda tela.
CREATE INDEX IF NOT EXISTS idx_produto_fotos_viva
  ON produto_fotos(sku, removida_em, ordem);
