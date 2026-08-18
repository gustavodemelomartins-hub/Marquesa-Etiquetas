-- Motor de reconciliação: prévia, revisão humana e aplicação do aprovado.
--
-- Aditiva: só cria tabelas e índices novos. Não altera nem uma coluna do que
-- já existe, e por isso é segura de rodar num banco em produção. Pode ser
-- rodada duas vezes sem erro (tudo é IF NOT EXISTS).
--
-- O que ela resolve: hoje a sincronização e a importação decidem e aplicam
-- no mesmo ato. A prévia existe (`{"seco": true}`) mas é um desvio, e a
-- importação grava antes de mostrar os avisos. Estas duas tabelas dão à
-- decisão um lugar para morar entre "descobri o que mudaria" e "mudei".

-- Uma rodada de análise. Nasce em 'revisao' e só sai de lá por decisão de
-- alguém: aplicada ou cancelada.
CREATE TABLE IF NOT EXISTS reconciliacao_sessoes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  origem       TEXT NOT NULL,                        -- sync | importacao
  status       TEXT NOT NULL DEFAULT 'revisao',      -- revisao | aplicada | cancelada | erro
  criada_em    TEXT NOT NULL DEFAULT (datetime('now')),
  decidida_em  TEXT,
  aplicada_em  TEXT,
  -- O relato inteiro da análise: contagens por risco, o que não foi
  -- empurrado e por quê, avisos da planilha. É o que a tela mostra em volta
  -- da lista de itens.
  resumo_json  TEXT,
  -- O que a aplicação de fato fez: aplicados, pulados por terem mudado
  -- desde a análise, e os erros. Só existe depois de aplicar.
  relato_json  TEXT,
  erro         TEXT
);

-- Uma linha por mudança proposta. `de` e `para` são TEXT porque o mesmo
-- motor carrega número (estoque), texto (descrição) e nulo (produto sem
-- preço) — a conversão fica em quem lê, junto do `tipo`.
--
-- A chave da identidade é (sku, variacao, tipo): é por ela que a aplicação
-- reconfere se o mundo continua igual ao que a pessoa aprovou.
CREATE TABLE IF NOT EXISTS reconciliacao_itens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id   INTEGER NOT NULL REFERENCES reconciliacao_sessoes(id),
  sku         TEXT NOT NULL,
  variacao    TEXT,                                  -- NULL = o código inteiro
  descricao   TEXT,
  tipo        TEXT NOT NULL,                         -- estoque_loja | produto_novo | ajuste_qtd | campo
  de          TEXT,
  para        TEXT,
  -- trivial: aplica sem drama · confere: grande, mas explicável
  -- perigoso: pode tirar peça do ar ou mexer em preço
  -- desconhecido: o sistema NÃO sabe o que é certo. Nunca em bloco.
  risco       TEXT NOT NULL,
  motivo      TEXT,                                  -- a frase que explica o risco
  decisao     TEXT NOT NULL DEFAULT 'pendente',      -- pendente | aprovado | recusado
  aplicado    INTEGER NOT NULL DEFAULT 0,
  erro        TEXT,                                  -- por que este item não pôde ser aplicado
  -- Carga específica do tipo: varianteId/produtoId/locais para o empurrão,
  -- cat/preco/desc para a importação. Guardada na análise para a aplicação
  -- não precisar redescobrir.
  dados_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_rec_itens_sessao  ON reconciliacao_itens(sessao_id);
CREATE INDEX IF NOT EXISTS idx_rec_itens_decisao ON reconciliacao_itens(sessao_id, decisao);
CREATE INDEX IF NOT EXISTS idx_rec_sessoes_status ON reconciliacao_sessoes(status);
