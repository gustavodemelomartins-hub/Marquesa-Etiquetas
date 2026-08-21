-- FASE 2 — variação criada AQUI sobrevive à sincronização, e produto com
-- histórico é arquivado em vez de apagado.
--
-- TUDO ADITIVO. Nenhuma tabela recriada, nenhuma coluna removida, nenhum
-- índice derrubado.
--
-- Os ALTER TABLE abaixo NÃO são idempotentes: falham com "duplicate column
-- name" se já foram aplicados, e esse erro significa exatamente "já foi" —
-- pode ignorar e seguir.

-- ------------------------------------------------- de onde veio a variação
-- `sync.js › gravarRetratoDaLoja` apaga `produto_variacoes` inteira e
-- regrava a cada rodada, porque a loja é a fonte da verdade sobre quais
-- variações EXISTEM. Isso estava certo enquanto ninguém digitava a tabela.
--
-- A partir do cadastro com variações, alguém digita: um produto criado aqui,
-- que ainda não está na Nuvemshop, tem tamanho e cor sem `variant_id` nenhum.
-- Sem esta coluna, a sincronização da madrugada apagaria essa estrutura e a
-- peça amanheceria sem variação — o pior tipo de bug, o que desfaz trabalho
-- de alguém enquanto ninguém olha.
--
--   'loja'  — veio da Nuvemshop. A rodada seguinte pode reescrever e apagar.
--   'local' — foi criada aqui. A sincronização NÃO encosta.
--
-- Uma variação local que depois aparece na loja com o mesmo nome passa a
-- 'loja' pelo ON CONFLICT — e isso é o certo: ela deixou de ser só nossa.
ALTER TABLE produto_variacoes ADD COLUMN origem TEXT;

-- Tudo que existe hoje foi escrito pela sincronização, sem exceção: a
-- tabela nunca teve outro escritor. O backfill diz isso explicitamente em
-- vez de deixar NULL querer dizer duas coisas.
UPDATE produto_variacoes SET origem = 'loja' WHERE origem IS NULL;

-- ------------------------------------------------------ produto arquivado
-- §28: não apagar histórico. Produto que já vendeu, já saiu em maleta ou já
-- foi contado num inventário não pode ser excluído — apagá-lo levaria junto
-- o passado que explica números que continuam valendo.
--
-- `produtos.status` já existia com 'ativo' | 'inativo'. 'arquivado' entra
-- como um terceiro valor, e não precisa de coluna nova para funcionar: as
-- consultas que importam já filtram `status = 'ativo'`, então o arquivado
-- sai sozinho da sincronização, da fila de fotos e do empurrão de estoque,
-- sem que nenhuma delas precise saber que ele existe.
--
-- O que falta é o CONTEXTO: quando e por quê. Sem isso, "por que esta peça
-- sumiu da lista?" vira arqueologia nos movimentos.
ALTER TABLE produtos ADD COLUMN arquivado_em TEXT;
ALTER TABLE produtos ADD COLUMN arquivado_motivo TEXT;
