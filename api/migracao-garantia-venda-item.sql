-- ═══════════════════════════════════════════════════════════════════════
--  Fase 5.2b — a garantia passa a apontar para a LINHA da venda
-- ═══════════════════════════════════════════════════════════════════════
--
--  O QUE ESTAVA ERRADO
--
--  `garantias` guardava a origem operacional como (venda_id, sku,
--  variante_id) porque, quando ela foi escrita, `venda_itens` não tinha
--  chave própria. O comentário do schema afirmava que o trio identificava
--  a linha "sem ambiguidade". Duas coisas desmentiram isso depois:
--
--    §27  o preço cobrado é POR ITEM. Duas unidades do mesmo código, na
--         mesma venda, com preços diferentes, são duas linhas — e o trio
--         casa as duas.
--    §41  corrigir o código de um item reescreve `venda_itens.sku` e
--         `variante_id`. O ponteiro da garantia fica apontando para uma
--         combinação que não existe mais, em silêncio.
--
--  A Fase 5.2 deu a `venda_itens` um `id` estável. Esta migration troca o
--  ponteiro — sem apagar o antigo, que continua sendo a prova de como a
--  garantia foi aberta.
--
--  A REGRA DO BACKFILL: NÃO ADIVINHAR
--
--  Uma garantia antiga só recebe `venda_item_id` quando existe UMA linha
--  possível. Quando existem duas, ela fica sem ponteiro e é marcada
--  `ambiguo`; quando não existe nenhuma, `sem_match`. Nos dois casos o
--  trio antigo permanece intacto e a pendência fica registrada na própria
--  linha, legível por consulta — nada de `LIMIT 1` escolhendo por conta
--  própria qual peça da cliente voltou.
--
--  ROLLBACK
--
--    UPDATE garantias SET venda_item_id = NULL, venda_item_vinculo = NULL;
--
--  As colunas podem ficar: são aditivas e nulável. Nenhuma coluna antiga
--  foi removida, então o código anterior a esta migration continua lendo
--  a tabela inteira sem saber que elas existem.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. o ponteiro novo, e o registro de como ele foi obtido
--
-- Sem CHECK: `ALTER TABLE` do SQLite não acrescenta restrição de tabela, e
-- um CHECK que só existisse no banco criado do zero faria os dois caminhos
-- divergirem em silêncio — exatamente o que o gate de coerência existe
-- para pegar. A validação do vocabulário fica na aplicação.
--
--   direto                  a aplicação informou a linha (garantia nova)
--   backfill_unico          o trio antigo casou UMA linha só
--   backfill_unico_valor    o trio casou várias, mas só uma foi vendida
--                           pelo valor que a garantia registrou ter sido pago
--   ambiguo                 duas ou mais linhas possíveis — NÃO escolhido
--   sem_match               nenhuma linha encontrada — NÃO inventado
--   nao_se_aplica           origem histórica: `historico_item_id` já é PK real
ALTER TABLE garantias ADD COLUMN venda_item_id TEXT REFERENCES venda_itens(id);
ALTER TABLE garantias ADD COLUMN venda_item_vinculo TEXT;

CREATE INDEX IF NOT EXISTS idx_gar_venda_item ON garantias(venda_item_id);
CREATE INDEX IF NOT EXISTS idx_gar_vinculo    ON garantias(venda_item_vinculo);

-- ─── 2. backfill, passo 1: o trio casa exatamente UMA linha
--
-- `IS` e não `=` para o variante_id: em SQLite, NULL = NULL é NULL, e a
-- garantia de uma peça sem variação ficaria de fora da própria contagem.
UPDATE garantias
   SET venda_item_id = (SELECT i.id FROM venda_itens i
                         WHERE i.venda_id = garantias.venda_id
                           AND i.sku = garantias.sku
                           AND i.variante_id IS garantias.variante_id),
       venda_item_vinculo = 'backfill_unico'
 WHERE origem_fonte = 'operacional'
   AND venda_item_id IS NULL
   AND (SELECT COUNT(*) FROM venda_itens i
         WHERE i.venda_id = garantias.venda_id
           AND i.sku = garantias.sku
           AND i.variante_id IS garantias.variante_id) = 1;

-- ─── 3. backfill, passo 2: o trio casa várias, mas o VALOR PAGO desempata
--
-- Isto não é chute: `valor_pago_original` foi copiado de `venda_itens.preco`
-- na abertura da garantia. Se entre as linhas candidatas exatamente uma foi
-- cobrada por aquele valor, ela é a linha — com uma chave mais forte que o
-- trio, não com uma preferência arbitrária. ROUND porque os dois lados são
-- REAL e centavo comparado por igualdade binária erra.
UPDATE garantias
   SET venda_item_id = (SELECT i.id FROM venda_itens i
                         WHERE i.venda_id = garantias.venda_id
                           AND i.sku = garantias.sku
                           AND i.variante_id IS garantias.variante_id
                           AND ROUND(i.preco, 2) = ROUND(garantias.valor_pago_original, 2)),
       venda_item_vinculo = 'backfill_unico_valor'
 WHERE origem_fonte = 'operacional'
   AND venda_item_id IS NULL
   AND garantias.valor_pago_original IS NOT NULL
   AND (SELECT COUNT(*) FROM venda_itens i
         WHERE i.venda_id = garantias.venda_id
           AND i.sku = garantias.sku
           AND i.variante_id IS garantias.variante_id
           AND ROUND(i.preco, 2) = ROUND(garantias.valor_pago_original, 2)) = 1;

-- ─── 4. o que sobrou com MAIS DE UMA linha possível: ambíguo, e fica assim
UPDATE garantias
   SET venda_item_vinculo = 'ambiguo'
 WHERE origem_fonte = 'operacional'
   AND venda_item_id IS NULL
   AND venda_item_vinculo IS NULL
   AND (SELECT COUNT(*) FROM venda_itens i
         WHERE i.venda_id = garantias.venda_id
           AND i.sku = garantias.sku
           AND i.variante_id IS garantias.variante_id) > 1;

-- ─── 5. o que sobrou SEM linha nenhuma: registrado, não inventado
--
-- O caso típico é §41: o código do item foi corrigido depois da abertura da
-- garantia, e o trio virou uma combinação que não existe mais na venda.
UPDATE garantias
   SET venda_item_vinculo = 'sem_match'
 WHERE origem_fonte = 'operacional'
   AND venda_item_id IS NULL
   AND venda_item_vinculo IS NULL;

-- ─── 6. origem histórica: a pergunta não se aplica
UPDATE garantias
   SET venda_item_vinculo = 'nao_se_aplica'
 WHERE origem_fonte = 'historico'
   AND venda_item_vinculo IS NULL;
