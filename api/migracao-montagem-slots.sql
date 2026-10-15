-- Marquesa — Monte seu Colar: a composição vira dado
-- Data: 2026-09-10
--
-- Migration ADITIVA. Nenhuma linha é apagada, nenhum tipo muda, nenhum índice
-- único some. As duas tabelas envolvidas estão VAZIAS em produção, conferido
-- no export de 10/09/2026.
--
-- Não executa em produção automaticamente. Aplicar pelo processo de release,
-- depois de backup conferido e bookmark de Time Travel anotado.
--
-- O que ela resolve, em uma frase: hoje uma configuração comercial do Monte
-- seu Colar existe metade em dado e metade em constante `.js`, e por isso
-- cadastrar uma configuração nova exige deploy.

-- ─────────────────────────────────────────────── 1. a identidade comercial
--
-- `personalizacao_modelos` sabia o nome, os slots e a base, mas NÃO sabia o
-- SKU comercial da configuração — ele vivia só em MODELOS_CANONICOS, no
-- código. É o que impedia a Sthefany de criar "Três Meninos" sem deploy.
--
-- `duplicate column name` aqui significa "já foi aplicada". Pode ignorar.
ALTER TABLE personalizacao_modelos
  ADD COLUMN sku_comercial TEXT REFERENCES produtos(sku);

-- ──────────────────────────────────────────────── 2. quantos slots, de quê
--
-- `slots_min`/`slots_max` contam POSIÇÕES e não sabem de que tipo elas são:
-- o Casal (1 Menino + 1 Menina) e Duas Meninas (2 Menina) são ambos "2".
-- Por isso o código carregava um array `slotTipos` hard-coded ao lado do
-- banco — a informação que faltava aqui.
--
-- Uma linha por (configuração, grupo). O cardápio de quais SKUs podem
-- ocupar cada grupo continua em `personalizacao_opcoes`, que já tem `grupo`.
--
-- Por que a chave é (modelo_id, grupo) e não uma linha por posição: as
-- posições do mesmo grupo são intercambiáveis — decisão de 10/09/2026, que
-- permite repetir a mesma cor —, então "2 Menino" é a informação inteira, e
-- duas linhas iguais não diriam nada a mais.
CREATE TABLE IF NOT EXISTS personalizacao_slots (
  modelo_id INTEGER NOT NULL REFERENCES personalizacao_modelos(id),
  grupo     TEXT    NOT NULL,             -- 'Menino' | 'Menina'
  qtd       INTEGER NOT NULL CHECK (qtd > 0),
  ordem     INTEGER NOT NULL DEFAULT 0,   -- em que ordem a tela pergunta
  PRIMARY KEY (modelo_id, grupo)
);

-- A configuração é lida inteira a cada abertura da tela de venda e a cada
-- cálculo de disponibilidade (§34: medir antes de otimizar — este é o
-- caminho quente).
CREATE INDEX IF NOT EXISTS idx_pers_slots_modelo
  ON personalizacao_slots(modelo_id);

-- Nenhum INSERT aqui. As cinco configurações confirmadas são cadastro, não
-- migration: elas dependem de quatro componentes físicos que ainda não estão
-- no catálogo (444032, 251551, 251552, 329494) e cujo saldo real será
-- informado pela operação. Semear configuração sem componente criaria uma
-- montagem que o motor recusa vender, e um cadastro que ninguém pediu.
-- Ver docs/domains/MONTAGEM-MONTE-SEU-COLAR.md §5.
