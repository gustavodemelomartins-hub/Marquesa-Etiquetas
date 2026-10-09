-- Marquesa — Catálogo oculto na Nuvemshop (§62)
-- Data: 2026-10-09
--
-- Migration ADITIVA, Classe C. Uma tabela nova, um índice e uma coluna nova
-- em `produtos`. Nenhum DROP, nenhuma linha existente reescrita.
--
-- A tabela pode rodar duas vezes (IF NOT EXISTS). O `ALTER TABLE ... ADD
-- COLUMN` NÃO: rodar de novo falha com "duplicate column name" — e, como o
-- `wrangler d1 execute --file` é atômico, nada do arquivo é aplicado nessa
-- segunda vez. É o comportamento certo.
--
-- O QUE ELA EXISTE PARA GUARDAR
--
-- Até aqui "cadastrar na Nuvemshop" e "tornar visível" eram o mesmo passo, e
-- nenhum dos dois existia: 334 códigos com peça em casa esperavam foto,
-- texto, SEO e preço juntos para só então alguém criar o anúncio à mão.
--
-- `nuvemshop_catalogo` é o estado de cada código no CATÁLOGO da loja — não
-- no estoque (isso é `nuvemshop_fila`, §61). Uma linha por código que o
-- sistema criou ou adotou lá:
--
--   criando     a criação foi pedida e ainda não se confirmou. Se o Worker
--               morrer aqui, a próxima rodada procura o SKU na loja ANTES de
--               criar de novo — nunca dois anúncios do mesmo código;
--   oculto      existe na loja com visibility = hidden: tem id, variantes,
--               SKU, estoque, texto; não aparece e não é comprável;
--   publicando  a pessoa aprovou e a troca hidden → visible está em curso;
--   visivel     a loja confirmou visibility = visible pela leitura;
--   erro        a última tentativa falhou; `ultimo_erro` diz por quê.
--
-- `produtos.visibilidade_loja` é o FATO lido da loja (hidden | unlisted |
-- visible) para qualquer produto que ela tenha, criado aqui ou não. O campo
-- antigo `visivel` (published) não separa hidden de unlisted, e unlisted é
-- comprável pelo link direto.
--
-- Rollback: api/migracao-nuvemshop-catalogo-rollback.sql
CREATE TABLE IF NOT EXISTS nuvemshop_catalogo (
  sku                  TEXT PRIMARY KEY,
  estado               TEXT NOT NULL
                       CHECK (estado IN ('criando','oculto','publicando','visivel','erro')),
  origem               TEXT,              -- criado (nós criamos) | adotado (já existia lá com o SKU)
  produto_id           TEXT,              -- id do produto na Nuvemshop
  visibilidade         TEXT,              -- como a loja respondeu na última leitura
  variantes_json       TEXT,              -- [{nome, varianteId, valores}] criadas ou vinculadas
  conteudo_json        TEXT,              -- {descricao, seoTitulo, seoDescricao, regra} enviado
  conteudo_enviado_em  TEXT,
  foto_enviada_em      TEXT,
  foto_id_loja         TEXT,
  tentativas           INTEGER NOT NULL DEFAULT 0,
  ultimo_erro          TEXT,              -- frase para gente; nunca token nem corpo de requisição
  travado_ate          TEXT,              -- arrendamento da rodada que está com o código
  pedido_em            TEXT,              -- quando a criação foi pedida (criando)
  criado_em            TEXT,
  publicado_em         TEXT,
  publicado_por        TEXT,
  atualizado_em        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_catalogo_estado ON nuvemshop_catalogo(estado);

ALTER TABLE produtos ADD COLUMN visibilidade_loja TEXT;

-- Quantas categorias o anúncio tem na loja (a conferência anota, como já
-- anota descrição, SEO e imagens). Publicar exige pelo menos uma.
ALTER TABLE nuvemshop_conferencia ADD COLUMN ns_categorias INTEGER;
