-- Identidade estável para a linha de venda — Fase 5.2.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE
--
-- `venda_itens` nasceu sem chave própria. A identidade de uma linha era o
-- trio (venda_id, sku, variante_id) — e o próprio schema de `garantias` já
-- registra, por escrito, que isso é uma acomodação e não um desenho:
--
--     "a identidade do item é (venda_id, sku, variante_id): venda_itens não
--      tem chave própria, e rowid não é estável entre VACUUMs."
--
-- Três coisas quebram esse trio:
--
--  1. §27 permite duas linhas do MESMO código na mesma venda com preços
--     diferentes — desconto parcial em quantidade múltipla é exatamente
--     isso. O trio deixa de identificar, e quem usa `LIMIT 1` passa a
--     escolher em silêncio;
--  2. quem precisou de identidade de verdade caiu no `rowid`, que o SQLite
--     pode reatribuir num VACUUM ou num rebuild de tabela. `GET
--     /api/vendas/lista` já devolvia `i.rowid` como `id` da linha, e a
--     Central de Pendências já mandava esse número de volta numa SEGUNDA
--     requisição — o caso que a ressalva acima diz para não fazer;
--  3. ligar qualquer coisa futura ao ITEM (um recebimento, uma correção
--     mais fina que a de código) precisa de um alvo que não se mexa.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE TEXTO GERADO PELA APLICAÇÃO, E NÃO UM INTEIRO
--
-- `ALTER TABLE` do SQLite não sabe acrescentar PRIMARY KEY nem AUTOINCREMENT:
-- um inteiro auto-incrementado exigiria RECONSTRUIR a tabela (criar, copiar,
-- apagar, renomear). Reconstruir é a operação mais cara e menos reversível
-- que existe aqui, e `venda_itens` guarda faturamento.
--
-- `MAX(id) + 1` na aplicação foi descartado: duas vendas simultâneas leem o
-- mesmo máximo e escrevem o mesmo id. Não há sequência no D1 para arbitrar.
--
-- E há um motivo que decide sozinho: `registrarVenda` insere os itens dentro
-- de um `db.batch`, que é tudo-ou-nada e NÃO devolve id por instrução. Com
-- um inteiro do banco, a aplicação só conheceria o id depois de reler a
-- tabela — e reler pelo trio é justamente o que não identifica. Com um id
-- gerado antes da escrita, quem monta a venda já sabe o nome de cada linha.
--
-- ─────────────────────────────────────────────────────────────────────────
-- O QUE ESTE ARQUIVO FAZ
--
--  1. acrescenta a coluna `id TEXT` — aditiva, reversível, sem reconstrução;
--  2. dá um UUID a cada linha que já existe;
--  3. cria o índice único;
--  4. instala dois gatilhos, que são o que faz a coluna ser uma IDENTIDADE
--     e não apenas mais um campo:
--       · uma linha inserida sem id recebe um na hora. O banco garantindo o
--         que o código promete — nenhum caminho de escrita, nem um futuro,
--         consegue criar linha anônima;
--       · um id já atribuído não muda mais. Preencher NULL continua
--         permitido (é o gatilho de cima trabalhando); trocar um id por
--         outro aborta.
--
-- Rodar duas vezes é inofensivo: `ADD COLUMN` repetido devolve "duplicate
-- column name", que o aplicador tolera, e o resto é `IF NOT EXISTS` ou tem
-- `WHERE id IS NULL`.
--
-- ROLLBACK: `DROP TRIGGER venda_itens_id_ao_inserir;`
--           `DROP TRIGGER venda_itens_id_imutavel;`
--           `DROP INDEX idx_venda_itens_id;`
-- A coluna pode ficar — ela é aditiva e ninguém é obrigado a lê-la. Voltar
-- o código para o rowid não exige desfazer nada no banco, que é a diferença
-- prática entre isto e uma reconstrução.

ALTER TABLE venda_itens ADD COLUMN id TEXT;

-- UUID v4 em SQL puro: `randomblob` existe no D1 e é o mesmo gerador que o
-- resto do SQLite usa. O `4` e o dígito de variante são os bits fixos da
-- versão 4 — sem eles seria um hexadecimal aleatório com cara de UUID, e
-- qualquer validação lá na frente recusaria.
UPDATE venda_itens
   SET id = lower(
         hex(randomblob(4)) || '-' ||
         hex(randomblob(2)) || '-4' ||
         substr(hex(randomblob(2)), 2) || '-' ||
         substr('89ab', abs(random()) % 4 + 1, 1) ||
         substr(hex(randomblob(2)), 2) || '-' ||
         hex(randomblob(6))
       )
 WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_venda_itens_id ON venda_itens(id);

-- Linha sem id não nasce. A aplicação normalmente manda o dela — é o que
-- permite conhecer o id antes da escrita —, e este gatilho existe para o
-- caminho que esquecer: importação, correção, um INSERT escrito à mão no
-- console. `AFTER INSERT` porque `BEFORE INSERT` não pode alterar NEW no
-- SQLite.
CREATE TRIGGER IF NOT EXISTS venda_itens_id_ao_inserir
AFTER INSERT ON venda_itens
WHEN NEW.id IS NULL
BEGIN
  UPDATE venda_itens
     SET id = lower(
           hex(randomblob(4)) || '-' ||
           hex(randomblob(2)) || '-4' ||
           substr(hex(randomblob(2)), 2) || '-' ||
           substr('89ab', abs(random()) % 4 + 1, 1) ||
           substr(hex(randomblob(2)), 2) || '-' ||
           hex(randomblob(6))
         )
   WHERE rowid = NEW.rowid;
END;

-- Identidade que muda não é identidade. `OLD.id IS NOT NULL` deixa o gatilho
-- de cima preencher o NULL; depois disso, trocar aborta a escrita inteira.
CREATE TRIGGER IF NOT EXISTS venda_itens_id_imutavel
BEFORE UPDATE OF id ON venda_itens
WHEN OLD.id IS NOT NULL AND NEW.id IS NOT OLD.id
BEGIN
  SELECT RAISE(ABORT, 'venda_itens.id e imutavel: corrigir a linha nao troca a identidade dela');
END;
