-- Migration: o catálogo de imagens da Nuvemshop passa a ser guardado aqui.
--
-- Roda sozinha e é idempotente (tudo IF NOT EXISTS). Não apaga nada, não
-- mexe em produtos, não toca no R2.
--
--   wrangler d1 execute marquesa-db-dev --remote --file=api/migracao-fotos-loja.sql

-- ============================================================ FOTOS DA LOJA
-- O catálogo INTEIRO de imagens da Nuvemshop, lido e guardado aqui.
--
-- Antes disto existia uma coluna só: `produtos.foto_url`, uma imagem por
-- código, preenchida por um botão que alguém tinha de apertar. Três coisas
-- se perdiam nesse formato, e as três importam:
--
--   1. a GALERIA. Um produto tem várias fotos, e a segunda e a terceira
--      simplesmente não existiam aqui — para reencontrá-las era preciso
--      abrir a loja.
--   2. a IDENTIDADE. Não dava para saber de qual `product_id` a imagem
--      veio, nem se ela era a foto própria de uma variante ou a do produto.
--   3. a ORDEM. "Qual é a principal?" era uma suposição de quem exibia, não
--      um dado.
--
-- Esta tabela é o ESPELHO das imagens da loja, no mesmo espírito de
-- `loja_variantes`: fato de lá, não decisão nossa. A rodada de sincronização
-- reescreve as linhas dos produtos que leu — se uma foto sumiu de lá, some
-- daqui. Ela NÃO guarda bytes (isso é R2) e NÃO substitui `produtos.foto_url`
-- nem as chaves do R2: quando a foto é nossa, é a nossa que vale.
CREATE TABLE IF NOT EXISTS loja_fotos (
  -- id da imagem na Nuvemshop: a identidade estável, igual ao variante_id
  -- em loja_variantes. Nunca a posição, nunca o nome do arquivo.
  imagem_id   TEXT PRIMARY KEY,
  produto_id  TEXT NOT NULL,
  url         TEXT NOT NULL,
  posicao     INTEGER NOT NULL DEFAULT 0,
  -- 1 = é a que a vitrine mostra. Vem da posição declarada pela loja, e é
  -- gravada porque "a primeira da lista" depende de como a lista foi lida.
  principal   INTEGER NOT NULL DEFAULT 0,
  -- O código DAQUI a que esta imagem pertence, quando dá para saber. Fica
  -- NULL quando o produto da loja carrega mais de um código nas variantes e
  -- a imagem não está amarrada a nenhuma delas — adivinhar ali faria a loja
  -- anunciar uma peça mostrando outra.
  sku_norm    TEXT,
  -- Preenchido só quando a imagem é PRÓPRIA de uma variante (o anel dourado
  -- e o prateado). A amarração é pelo image_id que a variante declara.
  variante_id TEXT,
  lido_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loja_fotos_sku     ON loja_fotos(sku_norm);
CREATE INDEX IF NOT EXISTS idx_loja_fotos_produto ON loja_fotos(produto_id);
CREATE INDEX IF NOT EXISTS idx_loja_fotos_var     ON loja_fotos(variante_id);
