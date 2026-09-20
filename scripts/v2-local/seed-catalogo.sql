-- Catálogo de teste. Só peça e razão de estoque: cliente, venda, pagamento,
-- garantia e crédito entram depois PELA API REAL, para que os dados da tela
-- tenham nascido das mesmas regras que os de produção.
-- A invariante é respeitada aqui: produtos.qtd == SUM(movimentos.qtd).
INSERT OR IGNORE INTO categorias (nome, ordem) VALUES
  ('Colar', 1), ('Brinco', 2), ('Anel', 3), ('Pulseira', 4);

INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
  ('100101', 'Colar Lua Cheia', 'Colar', 189.0, 40),
  ('100102', 'Colar Ponto de Luz', 'Colar', 149.0, 35),
  ('100201', 'Brinco Gota Zircônia', 'Brinco', 119.0, 60),
  ('100202', 'Brinco Argola Pequena', 'Brinco', 89.0, 55),
  ('100301', 'Anel Solitário', 'Anel', 159.0, 30),
  ('100302', 'Anel Aparador Trio', 'Anel', 129.0, 25),
  ('100401', 'Pulseira Elos Finos', 'Pulseira', 139.0, 28),
  ('100402', 'Pulseira Berloque Coração', 'Pulseira', 99.0, 32);

INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES
  ('100101', 'entrada', 40, 'importacao', 'carga inicial do ambiente local'),
  ('100102', 'entrada', 35, 'importacao', 'carga inicial do ambiente local'),
  ('100201', 'entrada', 60, 'importacao', 'carga inicial do ambiente local'),
  ('100202', 'entrada', 55, 'importacao', 'carga inicial do ambiente local'),
  ('100301', 'entrada', 30, 'importacao', 'carga inicial do ambiente local'),
  ('100302', 'entrada', 25, 'importacao', 'carga inicial do ambiente local'),
  ('100401', 'entrada', 28, 'importacao', 'carga inicial do ambiente local'),
  ('100402', 'entrada', 32, 'importacao', 'carga inicial do ambiente local');
