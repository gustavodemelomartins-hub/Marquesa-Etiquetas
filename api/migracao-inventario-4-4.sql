-- Marquesa — Inventário pausável, por variação, com diferença rastreável
-- Fase 4, item 4.  Data: 2026-09-10
-- Desenho canônico: docs/domains/INVENTARIO-4-4.md
--
-- Migration ADITIVA, Classe C. Três `CREATE TABLE`, duas `ADD COLUMN`, três
-- índices. Nenhum `DROP`, nenhuma tabela reconstruída, nenhum backfill e
-- nenhuma linha existente reescrita — em particular, os 78 movimentos
-- historicamente incompletos continuam exatamente como estão (§3 do desenho).
--
-- Rollback = descartar as três tabelas novas e os índices
-- (`api/migracao-inventario-4-4-rollback.sql`). As duas colunas ficam: coluna
-- aditiva com default NULL não muda leitura nenhuma, e derrubá-la em SQLite
-- exigiria a reconstrução de tabela que esta migration existe para evitar.
--
-- Depois do rollback, `inventario_itens` continua legível e o inventário
-- volta ao comportamento anterior.

-- ──────────────────────── 0. pré-condição, verificada e não presumida
--
-- O baseline da Fase 0 NÃO prova que `migracao-inventario.sql` está aplicada
-- em produção (§10 do desenho). Estas duas linhas são cópia literal dela: num
-- banco que já a rodou não fazem nada, e num que não rodou impedem que as
-- chaves estrangeiras abaixo apontem para o vazio.
CREATE TABLE IF NOT EXISTS inventarios ( id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'aberto', iniciado_em TEXT NOT NULL DEFAULT (datetime('now')), concluido_em TEXT, desconhecidos_json TEXT, obs TEXT );
CREATE TABLE IF NOT EXISTS inventario_itens ( inventario_id INTEGER NOT NULL REFERENCES inventarios(id), sku TEXT NOT NULL REFERENCES produtos(sku), contado INTEGER NOT NULL DEFAULT 0, esperado INTEGER, ajustado INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (inventario_id, sku) );

-- ──────────────────────────────────────────── 1. a contagem VIVA (D1, D2)
--
-- Existe linha = foi contado. Não existe linha = NÃO foi contado. É esta
-- ausência que implementa D2: o silêncio nunca é lido como zero, nem no
-- fechamento, nem no relatório, nem na aplicação.
--
-- Por que uma tabela nova em vez de acrescentar `variacao` a
-- `inventario_itens`: a chave primária de lá é (inventario_id, sku), e mudar
-- chave primária em SQLite exige RECONSTRUIR a tabela — a mesma operação
-- sensível que mantém a P11 parada. `inventario_itens` passa a ser leitura de
-- inventário histórico e para de receber escrita.
CREATE TABLE IF NOT EXISTS inventario_contagem (
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  sku           TEXT    NOT NULL REFERENCES produtos(sku),
  -- '' é o SKU sem variação. NOT NULL com default '' porque a coluna entra na
  -- chave primária, e NULL em chave primária não compara com NULL.
  variacao      TEXT    NOT NULL DEFAULT '',
  variante_id   TEXT,
  -- 0 é legítimo e significativo: "conferi, não tem nenhuma" (D2).
  contado       INTEGER NOT NULL CHECK (contado >= 0),
  -- A hora da contagem é o que torna a comparação retroagida possível (D10):
  -- é contra ela que os movimentos posteriores são lidos.
  contado_em    TEXT    NOT NULL DEFAULT (datetime('now')),
  origem        TEXT,                                   -- bipagem | digitado
  PRIMARY KEY (inventario_id, sku, variacao)
);

-- ────────────────────────────────────────────── 2. "não sei qual é" (D5)
--
-- A quantidade que ela viu e não soube dizer de qual variação era. Nunca vira
-- movimento. Aparece no relatório e BLOQUEIA o SKU inteiro, dizendo por quê.
-- É a regra 2 do CLAUDE.md com um lugar para morar: não sabe qual aro saiu,
-- não escreve.
CREATE TABLE IF NOT EXISTS inventario_nao_identificado (
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  sku           TEXT    NOT NULL REFERENCES produtos(sku),
  qtd           INTEGER NOT NULL CHECK (qtd > 0),
  contado_em    TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (inventario_id, sku)
);

-- ─────────────────────────────── 3. o retrato CONGELADO do fechamento
--
-- Mesmo motivo do §6.1 do REGRAS.md, agora por variação: um inventário que
-- muda de resultado depois de fechado não prova nada. A aplicação da
-- diferença relê daqui e IGNORA qualquer quantidade enviada pelo cliente.
CREATE TABLE IF NOT EXISTS inventario_resultado (
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  sku           TEXT    NOT NULL REFERENCES produtos(sku),
  variacao      TEXT    NOT NULL DEFAULT '',
  variante_id   TEXT,
  contado       INTEGER,                       -- NULL = não conferido (D3)
  esperado      INTEGER NOT NULL,              -- o saldo comparável, já retroagido
  delta_pos     INTEGER NOT NULL DEFAULT 0,    -- movimentos entre contar e fechar
  dif           INTEGER,                       -- NULL quando não comparável
  -- conferido | faltando | sobrando | nao_conferido | nao_comparavel
  situacao      TEXT    NOT NULL,
  motivo        TEXT,                          -- por extenso quando nao_comparavel
  aplicado_em   TEXT,
  saida_id      INTEGER REFERENCES saidas_sem_faturamento(id),
  PRIMARY KEY (inventario_id, sku, variacao)
);

-- ───────────────────────────────────── 4. o vínculo estrutural (D8, D9)
--
-- A diferença deixa de ser uma FRASE no `obs` e passa a ser uma coluna. É ela
-- que sustenta o índice único de baixo, o relatório por inventário e o
-- caminho de estorno.
--
-- `duplicate column name` aqui significa "já foi aplicada". Pode ignorar.
ALTER TABLE saidas_sem_faturamento ADD COLUMN inventario_id INTEGER REFERENCES inventarios(id);

-- D1 — pausar é explícito e não muda mais nada: a contagem já está no banco
-- desde o primeiro bipe. `status` continua 'aberto' enquanto pausado, de
-- propósito: é o que mantém o dashboard legado retomando a contagem sem
-- nenhuma alteração, e o que impede abrir um segundo inventário por cima.
ALTER TABLE inventarios ADD COLUMN pausado_em TEXT;

-- ──────────────────────── 5. a idempotência passa a ser do BANCO
--
-- O flag `inventario_itens.ajustado` era lido e escrito no mesmo batch, sem
-- índice: duas abas abertas duplicavam o ajuste. Este índice é a mesma
-- proteção que `movimentos.reconciliacao_item_id` já tem, e vale sob
-- crash-e-retry e sob concorrência.
--
-- `estornada = 0` é deliberado: uma diferença estornada PODE ser lançada de
-- novo, com o valor certo (D12).
CREATE UNIQUE INDEX IF NOT EXISTS idx_saida_inventario_unica
  ON saidas_sem_faturamento (inventario_id, sku, COALESCE(variacao, ''))
  WHERE inventario_id IS NOT NULL AND estornada = 0;

CREATE INDEX IF NOT EXISTS idx_inv_contagem ON inventario_contagem(inventario_id);
CREATE INDEX IF NOT EXISTS idx_inv_resultado ON inventario_resultado(inventario_id);
