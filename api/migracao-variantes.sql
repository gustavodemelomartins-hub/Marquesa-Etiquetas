-- FASE 1 — variações por variant_id, catálogo completo da loja e SKU único.
--
-- TUDO AQUI É ADITIVO. Nenhuma tabela é recriada, nenhuma coluna sai,
-- nenhum índice existente é removido. Rodar duas vezes é inofensivo, com a
-- ressalva do ALTER TABLE registrada mais abaixo.
--
-- Por que ela existe, em uma frase: o sistema casava variação por NOME
-- ("16", "Dourado · 16"), e nome é dado da loja que pode mudar sozinho —
-- quando muda, o saldo local deixa de encontrar a caixinha e a rodada
-- empurraria zero para uma variante que tem peça. O casamento passa a ser
-- por `variante_id`, que é estável, e o que não casar não é escrito: é
-- anunciado como "precisa de revisão".

-- ------------------------------------------------- espelho da loja inteira
-- Retrato COMPLETO do catálogo real da Nuvemshop, uma linha por variante,
-- inclusive as de produto que não existe aqui. É leitura pura: nada nesta
-- tabela manda em estoque, preço ou cadastro — ela existe para que o
-- sistema saiba o que a loja tem ANTES de decidir qualquer coisa.
--
-- Não tem FK para `produtos` de propósito. Variante cujo SKU não é nosso
-- precisa caber aqui: é exatamente o caso que a revisão humana quer ver.
--
-- Não confundir com `produto_variacoes`, que é outra coisa e continua
-- sendo: lá mora a REPARTIÇÃO do nosso estoque entre as variações de um
-- código nosso. Aqui mora o que a loja declara. Uma é decisão nossa, a
-- outra é fato de lá.
CREATE TABLE IF NOT EXISTS loja_variantes (
  variante_id   TEXT PRIMARY KEY,   -- id da variante na Nuvemshop: a identidade estável
  produto_id    TEXT NOT NULL,
  sku           TEXT,               -- o SKU que a loja carrega NA VARIANTE (pode ser NULL lá)
  sku_norm      TEXT,               -- o mesmo, na forma canônica daqui (maiúsculas, sem espaço)
  -- Atributos DINÂMICOS, não uma lista fixa de "cor" e "tamanho". A
  -- Nuvemshop entrega `product.attributes` e `variant.values` como duas
  -- listas paralelas: attributes[i] é o nome, values[i] é o valor desta
  -- variante. Guardamos o par já resolvido, em JSON, porque quantos e quais
  -- são muda de produto para produto:
  --   [{"atributo":"Tamanho","valor":"16"},{"atributo":"Banho","valor":"Ródio"}]
  valores_json  TEXT NOT NULL DEFAULT '[]',
  nome          TEXT,               -- os valores juntos ("16", "Dourado · 16") — para gente ler
  estoque       INTEGER,            -- o que a loja mostra nesta variante
  preco         REAL,
  promocional   REAL,
  imagem_url    TEXT,               -- imagem PRÓPRIA da variante quando ela tem
  locais_json   TEXT,               -- location_ids do multi-estoque, quando a loja usa
  produto_nome  TEXT,
  produto_url   TEXT,
  produto_visivel INTEGER,
  posicao       INTEGER NOT NULL DEFAULT 0,
  lido_em       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loja_var_sku     ON loja_variantes(sku_norm);
CREATE INDEX IF NOT EXISTS idx_loja_var_produto ON loja_variantes(produto_id);

-- --------------------------------------------- produto_variacoes evoluída
-- A tabela existente ganha o que faltava, sem perder o que tinha. A chave
-- primária continua (sku, nome) — mudá-la exigiria recriar a tabela, que é
-- migration destrutiva e não se faz sem alguém mandar. O que entra no lugar
-- é um índice ÚNICO em variante_id: é ele que torna o casamento por
-- variant_id uma garantia do banco, e não uma boa intenção do código.
--
-- Os ALTER TABLE abaixo NÃO são idempotentes: falham com
-- "duplicate column name" se já foram aplicados, e esse erro significa
-- exatamente "já foi" — pode ignorar e seguir.
ALTER TABLE produto_variacoes ADD COLUMN valores_json TEXT;
ALTER TABLE produto_variacoes ADD COLUMN variante_sku TEXT;
ALTER TABLE produto_variacoes ADD COLUMN preco REAL;
ALTER TABLE produto_variacoes ADD COLUMN promocional REAL;
ALTER TABLE produto_variacoes ADD COLUMN imagem_url TEXT;

-- SQLite trata cada NULL como distinto de todo outro NULL num índice único,
-- então linhas antigas sem variante_id não colidem entre si. Duas linhas
-- apontando para a MESMA variante da loja, essas sim, passam a ser
-- recusadas pelo banco — que é a proteção que faltava.
CREATE UNIQUE INDEX IF NOT EXISTS idx_variacoes_variante
  ON produto_variacoes(variante_id);

-- ------------------------------------------------ variante na razão contábil
-- `movimentos.variacao` (o NOME) continua sendo a coluna que fecha a
-- invariante `produtos.qtd == SUM(movimentos.qtd)`. Nada disso muda.
--
-- O que entra é o id da variante ao lado do nome, para o movimento saber
-- de qual caixinha da loja ele falava NA HORA em que foi lançado. NULL em
-- tudo que é histórico, e isso é honesto: o movimento antigo realmente não
-- sabe. Quando não sabe, o sistema não adivinha — ele bloqueia a escrita
-- e manda para revisão.
ALTER TABLE movimentos ADD COLUMN variante_id TEXT;
CREATE INDEX IF NOT EXISTS idx_mov_variante ON movimentos(variante_id);

-- ------------------------------------------------------ reserva de SKU
-- "Gerar SKU" precisa devolver um código GARANTIDAMENTE disponível, e duas
-- pessoas clicando ao mesmo tempo não podem receber o mesmo. Sem uma marca
-- no banco isso é impossível: o gerador leria o mesmo "maior código atual"
-- nas duas chamadas e devolveria o mesmo número.
--
-- A reserva é a marca. Quem gera INSERE aqui; a chave primária é o que
-- decide o empate, e o perdedor tenta o próximo. A reserva morre sozinha
-- (`expira_em`) para um código gerado e nunca usado não ficar preso para
-- sempre, e é apagada quando o produto é criado de verdade.
CREATE TABLE IF NOT EXISTS sku_reservas (
  sku        TEXT PRIMARY KEY,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em  TEXT NOT NULL,
  origem     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sku_reservas_exp ON sku_reservas(expira_em);

-- -------------------------------------------------------- SKU único de fato
-- `produtos.sku` já é PRIMARY KEY, então "BR1234" duas vezes nunca passou.
-- O que passava era "br1234" ao lado de "BR1234", ou " BR1234": o
-- importador da planilha só fazia `.trim()`, enquanto o resto do sistema
-- (catalogo.js › normSku, nuvemshop.js › mapearSkus) compara em maiúsculas
-- e sem espaço. Duas linhas, dois estoques, e só uma casando com a loja.
--
-- O índice abaixo faz o banco recusar isso. Conferido antes de escrever:
-- 0 colisões em marquesa-db-dev (773 produtos).
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_sku_norm
  ON produtos(UPPER(REPLACE(REPLACE(REPLACE(sku, ' ', ''), CHAR(9), ''), CHAR(160), '')));
