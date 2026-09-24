-- Rollback de api/migracao-catalogo-4-5.sql e -publicacao.sql
--
-- Descarta as cinco tabelas novas e os índices novos. NÃO derruba as dez
-- colunas aditivas de `categorias` e `produtos`: coluna com default NULL não
-- muda leitura nenhuma, e removê-la em SQLite exigiria reconstruir as duas
-- tabelas — a operação que a migration existe justamente para evitar.
--
-- Antes de rodar em banco com dado real, o que se perde e o que fica:
--
--   PERDE   a galeria própria (`produto_fotos`) e, com ela, a referência
--           dos bytes que estiverem no R2. Os objetos NÃO são apagados do
--           bucket por este arquivo — eles ficam órfãos, e reconstruir a
--           referência depois exigiria listar o bucket. Se houver foto
--           própria de verdade, exporte `produto_fotos` antes.
--   PERDE   os lotes de foto e as tarefas de preparação em aberto.
--   FICA    `produtos.foto_*`, `produtos.foto_url`, `loja_fotos`,
--           `fotos_orfas` e `movimentos` — nada do estoque nem do espelho da
--           loja depende do que está sendo derrubado aqui.
--   FICA    a linha sentinela 'Sem categoria'. Apagá-la quebraria a FK de
--           qualquer produto que já esteja nela; a volta ao comportamento
--           antigo é mover esses produtos para 'Outros' primeiro, à mão, e
--           isso é decisão de quem opera, não deste arquivo.
--
-- A publicação NÃO volta sozinha ao CHECK antigo. Reconstruir a tabela de
-- volta é uma segunda migration, e ela só vale a pena se houver rascunho
-- para preservar — com 0 linhas em produção (medido em 10/09/2026), o
-- caminho honesto é deixar a tabela nova como está: ela aceita tudo que a
-- antiga aceitava.

DROP INDEX IF EXISTS idx_preparacao_aberta;
DROP INDEX IF EXISTS idx_preparacao_estado;
DROP TABLE IF EXISTS preparacao_tarefas;

DROP INDEX IF EXISTS idx_fotos_lote_itens_sit;
DROP TABLE IF EXISTS fotos_lote_itens;
DROP TABLE IF EXISTS fotos_lotes;

DROP INDEX IF EXISTS idx_produto_fotos_conteudo;
DROP INDEX IF EXISTS idx_produto_fotos_principal;
DROP INDEX IF EXISTS idx_produto_fotos_sku;
DROP TABLE IF EXISTS produto_fotos;

DROP INDEX IF EXISTS idx_produtos_produto_loja;
DROP INDEX IF EXISTS idx_categorias_nome_viva;
DROP INDEX IF EXISTS idx_categorias_id_viva;
