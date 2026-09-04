-- ═══════════════════════════════════════════════════════════════════════════
-- §30 — peça que sai do estoque nem sempre é venda
--
-- O sistema assumia "saiu do estoque = venda". Brinde do Dia das Mães,
-- retirada pessoal e diferença de inventário entravam como CLIENTE e como
-- VENDA — inflando faturamento, ticket médio, peças vendidas e o ranking de
-- clientes com dinheiro que nunca entrou.
--
-- Esta tabela é o lugar próprio dessas saídas. Ela NÃO cria cliente e NÃO
-- cria venda: só um movimento de estoque com origem declarada.
--
-- Por que uma tabela e não um `motivo` em `venda_itens`: a saída sem
-- faturamento não tem cliente, não tem preço cobrado e não tem contas a
-- receber. Pendurá-la numa venda obrigaria toda consulta de faturamento a
-- lembrar de excluí-la — e a que esquecesse voltaria a contaminar o número.
-- Aqui ela é invisível por construção para quem soma venda.
--
-- O estoque continua saindo por `estoque.js › movimentar`: `movimento_id`
-- amarra a linha ao movimento que a explica, e a razão contábil
-- (`produtos.qtd == SUM(movimentos.qtd)`) continua fechando sem exceção.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saidas_sem_faturamento (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,

  -- brinde       Dia das Mães, festa junina, ação promocional
  -- uso_proprio  retirada pessoal (a própria Sthefany)
  -- perda        diferença de inventário, peça perdida, quebra sem venda
  tipo      TEXT NOT NULL CHECK (tipo IN ('brinde', 'uso_proprio', 'perda')),

  -- Diferença de inventário pode ser para os DOIS lados. `saida` baixa,
  -- `entrada` devolve — e a segunda só existe para `perda`, porque brinde
  -- e uso próprio nunca somam peça. A trava está no CHECK lá embaixo.
  sentido   TEXT NOT NULL DEFAULT 'saida' CHECK (sentido IN ('saida', 'entrada')),

  data      TEXT NOT NULL,                       -- YYYY-MM-DD, o dia do fato
  sku       TEXT NOT NULL REFERENCES produtos(sku),
  variacao  TEXT,                                -- o aro, quando se sabe
  variante_id TEXT,                              -- a caixinha da loja, quando se sabe
  qtd       INTEGER NOT NULL CHECK (qtd > 0),

  motivo    TEXT,                                -- rótulo curto e agrupável
  observacao TEXT,                               -- "PERDIDO", texto livre

  -- Rastreabilidade: a linha aponta para o movimento que mexeu no estoque.
  movimento_id INTEGER REFERENCES movimentos(id),
  origem_usuario TEXT,                           -- quem lançou, quando se sabe

  -- ─── estorno: corrigir sem apagar
  -- Uma saída errada não some. Ela é ESTORNADA: um segundo movimento
  -- devolve a peça e a linha continua no histórico dizendo o que houve.
  estornada    INTEGER NOT NULL DEFAULT 0 CHECK (estornada IN (0, 1)),
  estorno_em   TEXT,
  estorno_motivo TEXT,
  estorno_movimento_id INTEGER REFERENCES movimentos(id),

  -- ─── de onde a linha veio
  -- manual              lançada na tela
  -- migracao_historico  reclassificada a partir de uma linha da planilha
  origem_registro TEXT NOT NULL DEFAULT 'manual'
                  CHECK (origem_registro IN ('manual', 'migracao_historico')),
  historico_item_id INTEGER REFERENCES vendas_historico_itens(id),

  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT,

  CHECK (sentido = 'saida' OR tipo = 'perda'),
  CHECK (estornada = 0 OR estorno_em IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ssf_data  ON saidas_sem_faturamento(data);
CREATE INDEX IF NOT EXISTS idx_ssf_tipo  ON saidas_sem_faturamento(tipo, estornada);
CREATE INDEX IF NOT EXISTS idx_ssf_sku   ON saidas_sem_faturamento(sku);
-- Uma linha da planilha vira no máximo UMA saída: a trava que impede a
-- auditoria histórica de baixar o mesmo estoque duas vezes se rodar de novo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ssf_historico
  ON saidas_sem_faturamento(historico_item_id)
  WHERE historico_item_id IS NOT NULL;

-- ─── as linhas históricas que foram reclassificadas
-- Reclassificar NÃO apaga a linha da planilha (§7: o dado de origem se
-- preserva). Esta tabela diz "esta linha não é venda", e as consultas de
-- faturamento passam a pulá-la — do mesmo jeito que já pulam a linha
-- excluída por uma operação histórica.
CREATE TABLE IF NOT EXISTS historico_reclassificacao (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  historico_item_id INTEGER NOT NULL REFERENCES vendas_historico_itens(id),
  classe_nova   TEXT NOT NULL CHECK (classe_nova IN ('brinde', 'uso_proprio', 'perda')),
  confianca     TEXT NOT NULL CHECK (confianca IN ('alta', 'media', 'baixa')),
  motivo        TEXT NOT NULL,             -- por extenso, o que decidiu
  saida_id      INTEGER REFERENCES saidas_sem_faturamento(id),
  -- proposta   o relatório sugeriu e ninguém confirmou ainda
  -- aplicada   um humano aprovou; as métricas já a ignoram
  -- recusada   um humano disse que é venda mesmo
  status        TEXT NOT NULL DEFAULT 'proposta'
                CHECK (status IN ('proposta', 'aplicada', 'recusada')),
  decidido_em   TEXT,
  decidido_por  TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hrec_item
  ON historico_reclassificacao(historico_item_id);
CREATE INDEX IF NOT EXISTS idx_hrec_status ON historico_reclassificacao(status);
