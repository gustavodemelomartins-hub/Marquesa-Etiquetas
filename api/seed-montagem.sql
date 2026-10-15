-- Marquesa — as cinco configurações confirmadas do Monte seu Colar
-- Data: 2026-09-10  ·  fonte: decisão humana da Sthefany, 10/09/2026
--
-- Isto é CADASTRO, não migration: são os mesmos dados que
-- `POST /api/personalizacao/modelos` grava, escritos em SQL para a carga
-- inicial não depender de digitar cinco vezes a mesma coisa. Uma
-- configuração nova, depois desta, entra pela rota — sem deploy e sem
-- arquivo.
--
-- ─── PRÉ-REQUISITO, e ele é de verdade
--
-- Os seis componentes físicos precisam existir em `produtos` ANTES, com o
-- saldo real informado pela operação. Quatro deles ainda não estão no
-- catálogo de produção (444032, 251551, 251552, 329494), e as chaves
-- estrangeiras abaixo falham alto se faltarem — que é o comportamento
-- desejado. Semear configuração sem componente criaria uma montagem que o
-- motor recusa vender.
--
--   444032  Colar Veneziana 45cm com Extensor Banho de Ouro 18k   R$ 74
--   263236  Colar Menina Zircônia Rosa Claro Banho de Ouro 18k    R$ 119
--   273470  Colar Menina Zircônia Incolor Banho de Ouro 18k       R$ 119
--   251551  Colar Menino Zircônia Azul Banho de Ouro 18k          R$ 119
--   251552  Colar Menino Zircônia Incolor Banho de Ouro 18k       R$ 119
--   329494  Colar Menino Zircônia Verde Banho de Ouro 18k         R$ 119
--
-- Os três SKUs comerciais ausentes (364945, 311066, 314161) também precisam
-- existir como produto — com `qtd 0`, porque configuração não tem saldo.
--
-- ─── SOBRE 326660
--
-- Ele tem `qtd 1` em produção e está numa maleta ABERTA. Este arquivo NÃO
-- mexe nesse saldo: a peça física existe e está com uma revendedora. A
-- reconciliação é por movimento de ajuste, depois do acerto da maleta, com
-- aprovação própria. Ver docs/domains/MONTAGEM-MONTE-SEU-COLAR.md §5.
--
-- Idempotente: rodar duas vezes deixa o mesmo estado.

-- ────────────────────────────────────────────────────── as configurações
INSERT OR IGNORE INTO personalizacao_modelos
  (slug, nome, sku_comercial, slots_min, slots_max, base_sku_padrao, preco_sugerido, ativo, ordem)
VALUES
  ('casal',                   'Colar Casal Banho de Ouro 18k',                            '326660', 2, 2, '444032', 129, 1, 0),
  ('duas-meninas',            'Colar Filhas Duas Meninas Banho de Ouro 18k',              '364945', 2, 2, '444032', 129, 1, 1),
  ('dois-meninos',            'Colar Filhos Dois Meninos Banho de Ouro 18k',              '311066', 2, 2, '444032', 129, 1, 2),
  ('dois-meninos-uma-menina', 'Colar Filhos Dois Meninos e Uma Menina Banho de Ouro 18k', '314161', 3, 3, '444032', 159, 1, 3),
  ('duas-meninas-um-menino',  'Colar Filhos Duas Meninas e Um Menino Banho de Ouro 18k',  '399872', 3, 3, '444032', 159, 1, 4);

-- ─────────────────────────────────────────────────────────────── os slots
-- Quantas peças de cada grupo. É o que distingue o Casal (1 + 1) de Duas
-- Meninas (2), que `slots_min`/`slots_max` não conseguem dizer.
DELETE FROM personalizacao_slots
 WHERE modelo_id IN (SELECT id FROM personalizacao_modelos
                      WHERE slug IN ('casal','duas-meninas','dois-meninos',
                                     'dois-meninos-uma-menina','duas-meninas-um-menino'));

INSERT INTO personalizacao_slots (modelo_id, grupo, qtd, ordem)
SELECT m.id, s.grupo, s.qtd, s.ordem FROM personalizacao_modelos m
  JOIN (
    SELECT 'casal' AS slug, 'Menino' AS grupo, 1 AS qtd, 0 AS ordem
    UNION ALL SELECT 'casal',                   'Menina', 1, 1
    UNION ALL SELECT 'duas-meninas',            'Menina', 2, 0
    UNION ALL SELECT 'dois-meninos',            'Menino', 2, 0
    UNION ALL SELECT 'dois-meninos-uma-menina', 'Menino', 2, 0
    UNION ALL SELECT 'dois-meninos-uma-menina', 'Menina', 1, 1
    UNION ALL SELECT 'duas-meninas-um-menino',  'Menina', 2, 0
    UNION ALL SELECT 'duas-meninas-um-menino',  'Menino', 1, 1
  ) s ON s.slug = m.slug;

-- ────────────────────────────────────────────────────────── o cardápio
-- Quais peças podem ocupar cada grupo, por configuração. As cinco cores
-- valem para todas as configurações que têm o grupo correspondente:
-- repetir a mesma cor em dois slots do mesmo grupo é permitido.
DELETE FROM personalizacao_opcoes
 WHERE modelo_id IN (SELECT id FROM personalizacao_modelos
                      WHERE slug IN ('casal','duas-meninas','dois-meninos',
                                     'dois-meninos-uma-menina','duas-meninas-um-menino'));

INSERT INTO personalizacao_opcoes (modelo_id, componente_sku, rotulo, grupo, ordem, ativo)
SELECT m.id, o.sku, o.rotulo, o.grupo, o.ordem, 1
  FROM personalizacao_modelos m
  JOIN (
    SELECT '251551' AS sku, 'Menino Azul'      AS rotulo, 'Menino' AS grupo, 0 AS ordem
    UNION ALL SELECT '251552', 'Menino Incolor',    'Menino', 1
    UNION ALL SELECT '329494', 'Menino Verde',      'Menino', 2
    UNION ALL SELECT '263236', 'Menina Rosa Claro', 'Menina', 0
    UNION ALL SELECT '273470', 'Menina Incolor',    'Menina', 1
  ) o
    ON EXISTS (SELECT 1 FROM personalizacao_slots s
                WHERE s.modelo_id = m.id AND s.grupo = o.grupo)
 WHERE m.slug IN ('casal','duas-meninas','dois-meninos',
                  'dois-meninos-uma-menina','duas-meninas-um-menino');

-- ──────────────────────────────────────────────────────────── conferência
-- Depois de aplicar, estes três números têm de bater:
--   5   SELECT COUNT(*) FROM personalizacao_modelos WHERE sku_comercial IS NOT NULL;
--   8   SELECT COUNT(*) FROM personalizacao_slots;
--  20   SELECT COUNT(*) FROM personalizacao_opcoes;  (5+2+3+5+5)
-- E `slots_min` de cada configuração tem de ser igual à soma dos slots dela.
