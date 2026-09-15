-- ══════════════════════════════════════════════════════════════════════════
-- Fase 5.3c — A VERSÃO DO RECEBÍVEL
--
-- O defeito: `versaoEsperada` já existia no contrato de Contas a Receber,
-- era obrigatória para a fonte `historico` e **aceita e ignorada** para
-- `venda` e `troca`. Duas telas abertas quitavam a mesma venda sem conflito
-- nenhum. A trava `WHERE pago = 0` salvava o dinheiro — não salvava a DATA
-- do pagamento, que é o que decide o mês do faturamento: vencia a última.
--
-- `historico_operacoes` não precisa disto: ela é versionada por construção,
-- cada mudança cria linha nova, e `versao` já é coluna dela. Esta migration
-- dá o equivalente às outras DUAS fontes, sem copiar o mecanismo delas —
-- `vendas` e `garantia_trocas` não são append-only e não vão virar.
--
-- ─────────────────────────────────────────────────── por que TRIGGER, e não
--                                                     incremento explícito
--
-- Onze escritores tocam as colunas financeiras (auditoria em
-- docs/domains/AUDITORIA-5-3-FIN-101-CONTAS-A-RECEBER.md §20.1). Incremento
-- explícito exigiria que os onze lembrassem — e que todo escritor futuro
-- lembrasse também. O defeito B1 desta mesma fase foi exatamente isso: uma
-- consulta esqueceu um filtro que a irmã tinha.
--
-- Pior: o TOTAL do recebível pode mudar por `venda_itens`, e o caminho que
-- faz isso (`venda-correcao.js`) não é um escritor "de pagamento" — ninguém
-- pensaria em incrementar uma versão de recebível ali. Um token que continua
-- válido depois que a dívida mudou de valor é pior que nenhum token.
--
-- O trigger não pode esquecer.
--
-- CORREÇÃO (15/09/2026). A versão anterior deste parágrafo dizia que o
-- trigger "é a ferramenta que este repositório já manda para o D1 em
-- produção" e que `venda_itens_id_ao_inserir` e `venda_itens_id_imutavel`
-- "vivem lá desde `migracao-venda-item-id.sql`". Não vivem: uma cópia real
-- de produção mostrou ZERO triggers, e `migracao-venda-item-id.sql` não
-- tinha sido aplicada — nem parcialmente (0 de 4 partes presentes). O autor
-- supôs que uma migration existir no repositório significava estar aplicada.
--
-- O argumento técnico continua de pé, e agora com evidência de verdade: as
-- duas migrations foram aplicadas sobre uma cópia de produção em
-- 15/09/2026, num sandbox descartável, e os cinco triggers subiram e
-- funcionaram. Ver `state/dev-migrations/2026-09-15/` no Harness.
--
-- ─────────────────────────────────────────────────────── por que não entra
--                                                         em loop
--
-- Cada trigger atualiza a MESMA tabela que o disparou. Em SQLite,
-- `recursive_triggers` é OFF por padrão e isso já bastaria — mas depender de
-- um PRAGMA cujo valor o D1 não documenta seria apostar. Por isso cada
-- `WHEN` exige `NEW.recebivel_versao = OLD.recebivel_versao`: a escrita do
-- próprio trigger MUDA essa coluna, então ela não satisfaz a condição na
-- reentrada. Provado nas duas configurações do PRAGMA em
-- `src/fin-101-5-3c-test.mjs`.
--
-- ────────────────────────────────────────────────── o que NÃO invalida
--
-- Nome da cliente, `cliente_id`, `cliente_nome_norm`, foto, observação e
-- estado da Nuvemshop ficam de fora de propósito. O `backfillNormalizacao`
-- reescreve `cliente_nome_norm` de milhares de vendas de uma vez; se isso
-- bumpasse a versão, toda tela aberta receberia 409 por uma mudança que não
-- alterou um centavo. Versão de recebível é sobre DINHEIRO e COBRABILIDADE,
-- não sobre como o nome é exibido.
--
-- Aditiva e idempotente. Roda contra o banco que existe hoje.
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────── vendas
--
-- DEFAULT 1 e NOT NULL: toda venda que já existe nasce na versão 1, e o
-- backfill é o próprio default — não há estado anterior a reconstruir,
-- porque a versão conta mudanças A PARTIR DE AGORA. Uma tela que leia a
-- lista depois da migration recebe 1 e escreve com 1.
ALTER TABLE vendas ADD COLUMN recebivel_versao INTEGER NOT NULL DEFAULT 1;

-- As oito colunas que mudam o recebível de uma venda:
--   pago, data_pagamento, valor_recebido  o dinheiro e quando ele entrou
--   cobravel, pagamento_origem            se alguém deve, e quem disse
--   vencimento_em                         o prazo combinado
--   total                                 quanto é a dívida
--   cancelada                             §28 — cancelar tira do A Receber
--
-- `IS NOT` e não `<>`: metade destas colunas é anulável, e `NULL <> NULL`
-- não é verdadeiro nem falso em SQL — seria um bump perdido toda vez que uma
-- data saísse de nula para preenchida.
CREATE TRIGGER IF NOT EXISTS vendas_recebivel_versao
AFTER UPDATE ON vendas
WHEN (NEW.pago             IS NOT OLD.pago
   OR NEW.data_pagamento   IS NOT OLD.data_pagamento
   OR NEW.pagamento_origem IS NOT OLD.pagamento_origem
   OR NEW.valor_recebido   IS NOT OLD.valor_recebido
   OR NEW.cobravel         IS NOT OLD.cobravel
   OR NEW.vencimento_em    IS NOT OLD.vencimento_em
   OR NEW.total            IS NOT OLD.total
   OR NEW.cancelada        IS NOT OLD.cancelada)
  AND NEW.recebivel_versao = OLD.recebivel_versao
BEGIN
  UPDATE vendas SET recebivel_versao = OLD.recebivel_versao + 1 WHERE id = NEW.id;
END;

-- O item mudou de valor, então a DÍVIDA mudou de valor.
--
-- Hoje `venda-correcao.js` atualiza `vendas.total` no mesmo batch em que
-- corrige o item, e o trigger de cima já pegaria. Este aqui existe para o
-- dia em que alguém escrever um caminho novo que mexe no item e esquece o
-- total: a versão cai de qualquer jeito, e o token velho para de valer.
-- Quando os dois disparam, a versão sobe duas vezes — monotônica não é
-- sequencial, e pular um número não custa nada.
--
-- Só `qtd` e `preco`: corrigir o SKU ou a descrição de uma linha não muda um
-- centavo do que a cliente deve (§40), e não pode gerar conflito à toa.
-- Sem INSERT: os itens nascem junto com a venda, e bumpar ali seria ruído na
-- criação. Sem DELETE: §28 — linha de venda não é apagada em lugar nenhum
-- deste código.
CREATE TRIGGER IF NOT EXISTS venda_itens_recebivel_versao
AFTER UPDATE OF qtd, preco ON venda_itens
WHEN NEW.qtd IS NOT OLD.qtd OR NEW.preco IS NOT OLD.preco
BEGIN
  UPDATE vendas SET recebivel_versao = recebivel_versao + 1 WHERE id = NEW.venda_id;
END;

-- ───────────────────────────────────────────────────────── garantia_trocas
--
-- A troca é recebível PRÓPRIO só enquanto não tem venda ligada — depois de
-- §36 a diferença nasce como venda e é a versão DELA que vale. A coluna
-- existe nas duas situações mesmo assim: `venda_id` pode ser preenchido
-- depois, e uma coluna que aparece e some conforme o estado da linha seria
-- pior de explicar que uma que está sempre lá.
ALTER TABLE garantia_trocas ADD COLUMN recebivel_versao INTEGER NOT NULL DEFAULT 1;

-- `venda_id` entra na lista porque ganhar uma venda ligada MUDA quem é o
-- recebível: a linha deixa de ser cobrável por si e passa a ser representada
-- pela venda. Uma tela segurando o token antigo precisa recarregar.
CREATE TRIGGER IF NOT EXISTS garantia_trocas_recebivel_versao
AFTER UPDATE ON garantia_trocas
WHEN (NEW.diferenca            IS NOT OLD.diferenca
   OR NEW.diferenca_status     IS NOT OLD.diferenca_status
   OR NEW.diferenca_paga_em    IS NOT OLD.diferenca_paga_em
   OR NEW.diferenca_valor_pago IS NOT OLD.diferenca_valor_pago
   OR NEW.estornada            IS NOT OLD.estornada
   OR NEW.venda_id             IS NOT OLD.venda_id)
  AND NEW.recebivel_versao = OLD.recebivel_versao
BEGIN
  UPDATE garantia_trocas SET recebivel_versao = OLD.recebivel_versao + 1 WHERE id = NEW.id;
END;

-- A lista do A Receber filtra por estado e ordena por prazo; a versão viaja
-- junto de cada linha. Nenhum índice novo é necessário para isso — a coluna
-- nunca é critério de busca, só de comparação na hora de escrever.
