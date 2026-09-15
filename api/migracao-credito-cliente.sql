-- ══════════════════════════════════════════════════════════════════════════
-- Fase 5.3e — CRÉDITO DA CLIENTE: a razão, e o estado que faltava na troca
--
-- A regra é da Sthefany (12/09/2026): troca com peça nova mais barata vira
-- CRÉDITO da cliente. Não volta em dinheiro. O sistema já registrava e
-- PARAVA — `diferenca_status = 'pendente_regra'`, `creditoAoCliente`
-- anunciado na resposta, nada lançado. O que faltava não era a regra: era o
-- lugar onde um crédito pudesse viver, ser consumido e ser explicado.
--
-- Decisões fechadas em 13/09/2026, e cada uma vira trava aqui:
--   1. o crédito NÃO EXPIRA          → nenhuma coluna de validade
--   2. crédito é de CLIENTE IDENTIFICADA → `cliente_id NOT NULL`
--   3. o saldo é PROJEÇÃO, nunca fonte → não existe `clientes.saldo_credito`
--   4. legado sem cliente confiável é PENDÊNCIA, não crédito → a emissão
--      recusa e anuncia, em vez de inventar dona
--
-- Detalhe em docs/domains/AUDITORIA-5-3-FIN-101-CONTAS-A-RECEBER.md §11.
--
-- ─────────────────────────────────────────────────── ATENÇÃO: DESTRUTIVA NO
--                                                     SCHEMA (parte 2)
--
-- A parte 1 é aditiva: cria uma tabela nova e dois índices.
--
-- A parte 2 RECONSTRÓI `garantia_trocas` para acrescentar `credito_emitido`
-- ao CHECK de `diferenca_status` — SQLite não altera CHECK, e este
-- repositório já tratou o mesmo caso assim em
-- `migracao-sorteio-saida-sem-faturamento.sql`. Ela copia todas as linhas e
-- todas as colunas antes da troca, e recria os quatro índices e o trigger.
--
-- **Não executar automaticamente.** Em qualquer ambiente que alguém use,
-- exige backup conferido, bookmark de Time Travel, contagem antes/depois e
-- aprovação humana explícita. Este arquivo é escrito e testado localmente;
-- aplicá-lo é decisão do Gustavo.
--
-- Pré-condições: `migracao-garantia-troca-estorno.sql`,
-- `migracao-garantia-reabertura.sql` e `migracao-recebivel-versao.sql` já
-- aplicadas — a parte 2 copia as colunas que as três acrescentaram.
-- ══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════ PARTE 1 · a razão de crédito
--
-- Mesma forma de `movimentos`: o saldo é SUM, nunca coluna. Um número no
-- cadastro não sabe de onde veio, e duas requisições concorrentes num
-- `UPDATE saldo = saldo - ?` perdem uma. É a Regra Fundamental nº 1, a mesma
-- que proíbe `produtos.qtd` sem razão por trás.
CREATE TABLE IF NOT EXISTS credito_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- NOT NULL, e é a trava número 1: crédito sem dona é dinheiro perdido.
  -- `garantias.cliente_id` é anulável; a emissão RECUSA e anuncia, em vez de
  -- gravar NULL aqui e criar um crédito que ninguém reclama.
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),

  -- credito  a cliente ganhou saldo        (+)
  -- consumo  usou o saldo numa compra      (−)
  -- estorno  contrapartida de uma linha    (sinal oposto ao que desfaz)
  -- ajuste   correção manual com motivo    (+ ou −)
  tipo TEXT NOT NULL CHECK (tipo IN ('credito', 'consumo', 'estorno', 'ajuste')),

  -- CENTAVOS INTEIROS desde o nascimento. Tabela nova não tem legado: nascer
  -- em REAL seria criar dívida de 5.7 de propósito. `<> 0` porque linha de
  -- valor zero não é movimento, é ruído.
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos <> 0),

  -- De onde veio, por extenso, e a identidade da coisa que o gerou:
  -- ('troca_garantia', 'troca:7') · ('ajuste_manual', 'ajuste:2026-09-14T…')
  origem    TEXT NOT NULL,
  origem_id TEXT NOT NULL,

  -- Preenchido no consumo: amarra o gasto à venda que o usou. O consumo é
  -- SEMPRE explícito — o sistema não desconta crédito sozinho (trava 3).
  venda_id INTEGER REFERENCES vendas(id),

  motivo    TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A idempotência, no banco e não na lógica que pode falhar: `troca:7` emite
-- no máximo UMA linha de crédito, rode a emissão quantas vezes rodar. É a
-- mesma ideia do índice único que impede a sincronização de cobrar o mesmo
-- pedido duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credito_origem
  ON credito_movimentos(tipo, origem, origem_id);

-- O extrato de uma cliente, em ordem.
CREATE INDEX IF NOT EXISTS idx_credito_cliente
  ON credito_movimentos(cliente_id, criado_em);

-- Nenhum CHECK agregado existe em SQLite, então a invariante "saldo nunca
-- negativo" não cabe no schema: ela vira `GET /api/credito/conferir`, irmã
-- de `GET /api/estoque/conferir`. Uma trava que o banco não pode aplicar é
-- melhor declarada como prova consultável do que fingida como constraint.

-- ═════════════════════════════════════ PARTE 2 · `credito_emitido` na troca
--
-- `pendente_regra` significava "a regra de crédito ainda não existe". Ela
-- existe desde 12/09/2026, e desde esta migration tem onde morar. O estado
-- novo diz outra coisa, e a diferença importa para quem for ler daqui a um
-- ano: `pendente_regra` é diferença negativa SEM crédito lançado (o legado
-- anterior a 5.3e, e o caso da trava 1 — cliente não identificada);
-- `credito_emitido` é diferença negativa COM linha na razão.
--
-- DROP TABLE abaixo. Ver o aviso do cabeçalho.

CREATE TABLE garantia_trocas_credito_nova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garantia_id INTEGER NOT NULL REFERENCES garantias(id),
  data        TEXT NOT NULL,

  sku_novo        TEXT NOT NULL REFERENCES produtos(sku),
  variacao_nova   TEXT,
  variante_id_novo TEXT,
  produto_novo_nome TEXT,

  valor_original REAL NOT NULL,
  valor_novo     REAL NOT NULL,
  diferenca      REAL NOT NULL,

  -- nenhuma         diferença zero: nada a cobrar
  -- a_receber       positiva e em aberto
  -- paga            positiva e recebida — SÓ ELA vira faturamento
  -- pendente_regra  NEGATIVA sem crédito lançado: legado anterior a 5.3e, ou
  --                 cliente não identificada (a emissão recusa em vez de
  --                 inventar dona)
  -- credito_emitido NEGATIVA com linha em `credito_movimentos` (5.3e)
  diferenca_status TEXT NOT NULL
                   CHECK (diferenca_status IN ('nenhuma', 'a_receber', 'paga',
                                               'pendente_regra', 'credito_emitido')),
  diferenca_paga_em    TEXT,
  diferenca_valor_pago REAL,

  movimento_id INTEGER REFERENCES movimentos(id),

  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT,

  venda_id INTEGER REFERENCES vendas(id),

  estornada INTEGER NOT NULL DEFAULT 0,
  estorno_em TEXT,
  estorno_motivo TEXT,
  estorno_movimento_id INTEGER REFERENCES movimentos(id),

  recebivel_versao INTEGER NOT NULL DEFAULT 1,

  CHECK (diferenca_status <> 'paga' OR diferenca_paga_em IS NOT NULL)
);

INSERT INTO garantia_trocas_credito_nova (
  id, garantia_id, data, sku_novo, variacao_nova, variante_id_novo,
  produto_novo_nome, valor_original, valor_novo, diferenca, diferenca_status,
  diferenca_paga_em, diferenca_valor_pago, movimento_id, criado_em,
  atualizado_em, venda_id, estornada, estorno_em, estorno_motivo,
  estorno_movimento_id, recebivel_versao
)
SELECT
  id, garantia_id, data, sku_novo, variacao_nova, variante_id_novo,
  produto_novo_nome, valor_original, valor_novo, diferenca, diferenca_status,
  diferenca_paga_em, diferenca_valor_pago, movimento_id, criado_em,
  atualizado_em, venda_id, estornada, estorno_em, estorno_motivo,
  estorno_movimento_id, recebivel_versao
FROM garantia_trocas;

DROP TABLE garantia_trocas;
ALTER TABLE garantia_trocas_credito_nova RENAME TO garantia_trocas;

-- Os quatro índices e o trigger voltam exatamente como eram. O DROP levou
-- todos: recriar é parte da migration, não detalhe de arrumação.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gar_troca_unica
  ON garantia_trocas(garantia_id) WHERE estornada = 0;
CREATE INDEX IF NOT EXISTS idx_gar_troca_estornada ON garantia_trocas(estornada);
CREATE INDEX IF NOT EXISTS idx_gar_troca_dif
  ON garantia_trocas(diferenca_status, diferenca_paga_em);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gar_troca_venda
  ON garantia_trocas(venda_id);

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
