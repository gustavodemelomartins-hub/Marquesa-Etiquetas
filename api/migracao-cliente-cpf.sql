-- CPF da cliente — o campo que a ficha de revendedora sempre teve e a de
-- cliente não.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE
--
-- A tela de Clientes passa a mostrar o cadastro, não só a leitura comercial:
-- nome, telefone, CPF, cidade e última compra. `revendedoras` já guarda CPF
-- desde o schema original; `clientes` nasceu com nome e telefone e foi
-- ganhando email, instagram, cidade e nascimento pelo caminho. O CPF é o que
-- faltava para as duas fichas dizerem a mesma coisa.
--
-- ─────────────────────────────────────────────────────────────────────────
-- O QUE ELA NÃO FAZ
--
-- Não valida dígito verificador, não deduplica por CPF e não torna o campo
-- obrigatório. CPF aqui é anotação de cadastro, não identidade: quem decide
-- que duas linhas são a mesma pessoa continua sendo gente, em
-- `clientes_vinculo_revisao`. Um índice único aqui transformaria dois
-- cadastros com o mesmo CPF digitado errado num erro de escrita, no meio de
-- uma venda.
--
-- `cpf_norm` guarda só os dígitos, para a busca não depender de quem digitou
-- com ponto e quem digitou sem. Fica NULL quando `cpf` é NULL — §24: campo
-- ausente entra como NULL, nunca como string vazia disfarçada de valor.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ESTOQUE: nada
--
-- Nenhuma tabela aqui referencia `movimentos` ou `produtos`. A razão
-- contábil não é tocada.
--
-- Aditiva. Rodar duas vezes devolve "duplicate column name", que é como
-- `ALTER TABLE ADD COLUMN` diz "já foi aplicada" — mesmo comportamento de
-- `migracao-sync-seco.sql` e `migracao-variacoes.sql`.

ALTER TABLE clientes ADD COLUMN cpf      TEXT;
ALTER TABLE clientes ADD COLUMN cpf_norm TEXT;

CREATE INDEX IF NOT EXISTS idx_clientes_cpf_norm ON clientes(cpf_norm);
