-- ═══════════════════════════════════════════════════════════════════════════
-- §31 — garantia é do ITEM da compra, não do cliente nem do código
--
-- "A Evelyn trouxe o anel para reparo" só tem resposta se o sistema souber
-- QUAL anel — de qual compra, por quanto ela pagou naquele dia. Se a cliente
-- comprou o mesmo SKU três vezes, prender a garantia ao SKU perde a compra
-- de origem, e o valor pago (que pode ter tido desconto) some junto.
--
-- Três tabelas:
--
--   garantias         o caso: item de origem, prazo, status atual
--   garantia_eventos  a linha do tempo. Evento novo NÃO sobrescreve o
--                     anterior — é isso que faz o histórico da cliente
--                     contar a história em vez de mostrar só o fim
--   garantia_trocas   quando não tem conserto: a peça nova, o que ela custa
--                     e a diferença. NUNCA uma segunda venda
--
-- O que a garantia deliberadamente NÃO faz:
--   · não altera a venda original (nem o total, nem os itens);
--   · não devolve a peça defeituosa ao estoque vendável;
--   · não gera faturamento — só a DIFERENÇA da troca, quando paga.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS garantias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- ─── o item de origem, nas duas populações de venda
  -- `operacional` → venda do sistema; a identidade do item é
  --                 (venda_id, sku, variante_id): `venda_itens` não tem
  --                 chave própria, e rowid não é estável entre VACUUMs.
  -- `historico`   → linha da planilha; `vendas_historico_itens.id` é PK real.
  origem_fonte TEXT NOT NULL CHECK (origem_fonte IN ('operacional', 'historico')),
  venda_id           INTEGER REFERENCES vendas(id),
  historico_item_id  INTEGER REFERENCES vendas_historico_itens(id),
  venda_historica_id INTEGER REFERENCES vendas_historicas(id),

  cliente_id        INTEGER REFERENCES clientes(id),
  cliente_nome_norm TEXT,
  cliente_nome      TEXT,

  sku          TEXT NOT NULL,
  variacao     TEXT,
  variante_id  TEXT,
  produto_nome TEXT,
  data_venda   TEXT,                    -- a compra de origem, para a tela
  -- O que ela EFETIVAMENTE pagou por esta peça — com desconto, se houve.
  -- É a base da diferença de troca; usar o preço de tabela cobraria a mais.
  valor_pago_original REAL,

  -- ─── o caso
  data_entrada TEXT NOT NULL,           -- quando a peça entrou para reparo
  prazo_dias_uteis INTEGER NOT NULL DEFAULT 45,
  previsao_retorno TEXT,                -- calculado na abertura, congelado
  motivo       TEXT NOT NULL,           -- o problema relatado
  observacao   TEXT,

  -- em_reparo     na bancada
  -- reparada      pronta, aguardando entrega
  -- devolvida     entregue à cliente
  -- sem_conserto  troca autorizada
  -- concluida     encerrada (a troca terminou, ou o caso morreu)
  -- cancelada     abriu por engano
  status TEXT NOT NULL DEFAULT 'em_reparo'
         CHECK (status IN ('em_reparo', 'reparada', 'devolvida',
                           'sem_conserto', 'concluida', 'cancelada')),
  encerrada_em TEXT,                    -- data em que saiu do Painel

  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT,

  CHECK (origem_fonte <> 'operacional' OR venda_id IS NOT NULL),
  CHECK (origem_fonte <> 'historico'   OR historico_item_id IS NOT NULL),
  CHECK (prazo_dias_uteis > 0)
);

CREATE INDEX IF NOT EXISTS idx_gar_status   ON garantias(status);
CREATE INDEX IF NOT EXISTS idx_gar_cliente  ON garantias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_gar_norm     ON garantias(cliente_nome_norm);
CREATE INDEX IF NOT EXISTS idx_gar_venda    ON garantias(venda_id);
CREATE INDEX IF NOT EXISTS idx_gar_hist     ON garantias(historico_item_id);
CREATE INDEX IF NOT EXISTS idx_gar_entrada  ON garantias(data_entrada);

-- ─── a linha do tempo
CREATE TABLE IF NOT EXISTS garantia_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garantia_id INTEGER NOT NULL REFERENCES garantias(id),
  -- aberta | status | devolvida | troca | diferenca_paga | observacao | cancelada
  tipo        TEXT NOT NULL,
  data        TEXT NOT NULL,
  status_novo TEXT,
  observacao  TEXT,
  dados_json  TEXT NOT NULL DEFAULT '{}',
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gar_ev ON garantia_eventos(garantia_id, id);

-- ─── a troca, quando não tem conserto
CREATE TABLE IF NOT EXISTS garantia_trocas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garantia_id INTEGER NOT NULL REFERENCES garantias(id),
  data        TEXT NOT NULL,

  sku_novo        TEXT NOT NULL REFERENCES produtos(sku),
  variacao_nova   TEXT,
  variante_id_novo TEXT,
  produto_novo_nome TEXT,

  -- valor_original: o que ela pagou na compra de origem (com desconto)
  -- valor_novo:     o preço considerado da peça nova
  -- diferenca:      novo − original. Positiva = ela deve; negativa = crédito
  valor_original REAL NOT NULL,
  valor_novo     REAL NOT NULL,
  diferenca      REAL NOT NULL,

  -- nenhuma         diferença zero: nada a cobrar
  -- a_receber       positiva e em aberto
  -- paga            positiva e recebida — SÓ ELA vira faturamento
  -- pendente_regra  NEGATIVA: crédito/reembolso é regra de negócio que
  --                 ainda não existe. O sistema registra e PARA, em vez de
  --                 inventar um crédito que ninguém definiu.
  diferenca_status TEXT NOT NULL
                   CHECK (diferenca_status IN ('nenhuma', 'a_receber',
                                               'paga', 'pendente_regra')),
  diferenca_paga_em    TEXT,          -- a data que governa o faturamento
  diferenca_valor_pago REAL,

  -- o movimento que baixou a peça NOVA. Tipo `troca`, origem
  -- `troca_garantia` — nunca `venda`.
  movimento_id INTEGER REFERENCES movimentos(id),

  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT,

  CHECK (diferenca_status <> 'paga' OR diferenca_paga_em IS NOT NULL)
);

-- Uma garantia troca no máximo uma vez. Sem isto, dois cliques no botão
-- baixariam duas peças novas do estoque.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gar_troca_unica
  ON garantia_trocas(garantia_id);
CREATE INDEX IF NOT EXISTS idx_gar_troca_dif
  ON garantia_trocas(diferenca_status, diferenca_paga_em);

-- ─── feriados, num lugar só
-- O prazo da garantia é em DIAS ÚTEIS. Sábado e domingo o calendário
-- resolve; feriado, não. Esta tabela existe para o feriado não nascer
-- espalhado em `if` pelo código — vazia, o cálculo usa só fim de semana, e
-- isso é dito na resposta em vez de fingir precisão que não tem.
CREATE TABLE IF NOT EXISTS feriados (
  data      TEXT PRIMARY KEY,           -- YYYY-MM-DD
  nome      TEXT NOT NULL,
  escopo    TEXT NOT NULL DEFAULT 'nacional',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
