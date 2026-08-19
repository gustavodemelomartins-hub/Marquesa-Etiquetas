-- Motor de reconciliação: prévia, revisão humana e aplicação do aprovado.
--
-- Aditiva: só cria tabelas e índices novos. Não altera nem uma coluna do que
-- já existe, e por isso é segura de rodar num banco em produção. As duas
-- CREATE TABLE e os cinco CREATE INDEX são idempotentes (IF NOT EXISTS) —
-- pode rodar duas vezes sem erro.
--
-- Revisada em 2026-08-18, ainda ANTES da primeira aplicação em qualquer
-- banco: por isso os ajustes de invariante (base_json, unicidade real,
-- máquina de estados) entraram nesta mesma migration, e não numa segunda.
-- Ver docs/RECONCILIATION_ENGINE.md para o fluxo completo e
-- docs/ROADMAP_RECONCILIATION.md §"Revisão do schema" para o raciocínio.
--
-- O que ela resolve: hoje a sincronização e a importação decidem e aplicam
-- no mesmo ato. A prévia existe (`{"seco": true}`) mas é um desvio, e a
-- importação grava antes de mostrar os avisos. Estas duas tabelas dão à
-- decisão um lugar para morar entre "descobri o que mudaria" e "mudei".
--
-- Nada aqui guarda saldo. A razão continua sendo `movimentos`, e a
-- aplicação (quando existir) passa por `estoque.js › movimentar` como todo
-- o resto — nenhuma exceção para reconciliação.

-- Uma rodada de análise: o lugar onde a decisão mora entre "descobri o que
-- mudaria" e "mudei".
--
-- Máquina de estados (7):
--   revisao          nasce aqui — esperando decisão humana sobre os itens
--   aplicando        o Apply está em andamento (transitório)
--   aplicada         todo item aprovado foi escrito com sucesso
--   aplicada_parcial pelo menos um item aprovado ficou obsoleto ou deu erro
--   cancelada        encerrada sem aplicar nada, por decisão humana
--   superada         uma sessão mais nova da MESMA origem nasceu enquanto
--                    esta ainda estava em revisão — nunca mais aprovável
--   erro             o Apply foi interrompido por falha catastrófica antes
--                    de terminar de contabilizar o que conseguiu fazer
--
-- Transições permitidas:
--   revisao   → aplicando | cancelada | superada
--   aplicando → aplicada | aplicada_parcial | erro
--   (aplicada, aplicada_parcial, cancelada, superada, erro são terminais)
CREATE TABLE IF NOT EXISTS reconciliacao_sessoes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  -- nuvemshop: preview do POST /api/sync {"seco":true} · planilha_estoque_total:
  -- retrato completo da Stéfane (produtos.qtd) · planilha_produtos_novos: só
  -- cria SKU que ainda não existe, nunca mexe no que já existe.
  origem       TEXT NOT NULL CHECK (origem IN ('nuvemshop', 'planilha_estoque_total', 'planilha_produtos_novos')),
  status       TEXT NOT NULL DEFAULT 'revisao' CHECK (status IN (
                 'revisao', 'aplicando', 'aplicada', 'aplicada_parcial',
                 'cancelada', 'superada', 'erro'
               )),
  criada_em    TEXT NOT NULL DEFAULT (datetime('now')),
  -- quando a revisão terminou (aprovou/recusou os itens) — não quando o
  -- Apply terminou, que é `aplicada_em`
  decidida_em  TEXT,
  aplicada_em  TEXT,
  -- o relato da análise: contagens por risco, o que não foi empurrado, avisos
  resumo_json  TEXT,
  -- o que a aplicação fez: aplicados, obsoletos, erros — só existe depois
  -- de aplicar
  relato_json  TEXT,
  -- detalhe de uma falha catastrófica (status = 'erro'); não confundir com
  -- os `erro` por item, que são falhas pontuais e não derrubam a sessão
  erro         TEXT
);

-- No máximo UMA sessão em revisão por origem, garantido pelo banco — não
-- pelo código. "Uma prévia antiga nunca pode sobrescrever a realidade só
-- porque alguém voltou nela depois": a sessão nova marca a antiga como
-- `superada` no MESMO lote (`db.batch`) que se cria, e este índice recusa
-- qualquer tentativa que pule esse passo (ex.: duas abas criando sessão ao
-- mesmo tempo). Não cobre `aplicando`: duas aplicações concorrentes são
-- resolvidas item a item pelas preconditions abaixo, não por lock de sessão.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_sessoes_revisao_unica
  ON reconciliacao_sessoes(origem) WHERE status = 'revisao';

-- Uma linha por mudança proposta.
--
-- `de` e `para` são TEXT porque o mesmo motor carrega número (estoque),
-- texto (descrição) e nulo (produto sem preço, §24) — quem lê converte,
-- olhando o `tipo`.
--
-- `de`         valor OBSERVADO NO DESTINO na hora da análise (a loja, para
--              estoque_loja; o produto em si, para campo).
-- `para`       valor proposto.
-- `base_json`  o estado interno MÍNIMO que produziu `para` — os
--              determinantes, não um retrato inteiro do sistema. Só existe
--              quando esse estado pode mudar sozinho (estoque_loja: nosso
--              saldo é volátil). Para produto_novo/ajuste_qtd/campo a
--              origem é o arquivo importado, congelado em `dados_json`, e
--              por isso `base_json` fica NULL de propósito — não há nada
--              volátil para conferir além do que `de` já cobre.
--              Documentado por `tipo` em docs/RECONCILIATION_ENGINE.md.
--
-- Máquina de estados do item (6):
--   pendente   aguardando decisão humana
--   aprovado   decidido, esperando o Apply
--   rejeitado  decidido, nunca será aplicado
--   aplicado   escrito com sucesso
--   obsoleto   o mundo mudou desde a análise — falhou a precondition A OU B.
--              NÃO é falha técnica, é concorrência: volta para revisão numa
--              sessão NOVA, nunca se reaplica sozinho
--   erro       passou nas duas preconditions, mas a escrita em si falhou
--              (rede, Nuvemshop fora do ar, D1 indisponível) — diferente de
--              `obsoleto` porque aqui a proposta continuava válida
--
-- Transições permitidas:
--   pendente → aprovado | rejeitado
--   aprovado → aplicado | obsoleto | erro
--   (rejeitado, aplicado, obsoleto, erro são terminais NESTA sessão; um
--    item obsoleto ou com erro só volta a existir numa sessão nova)
CREATE TABLE IF NOT EXISTS reconciliacao_itens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id   INTEGER NOT NULL REFERENCES reconciliacao_sessoes(id),
  sku         TEXT NOT NULL,
  variacao    TEXT,                                  -- NULL = o código inteiro
  -- Coluna gerada só para a unicidade abaixo. SQLite nunca considera dois
  -- NULL iguais num índice único (cada NULL é distinto de si mesmo), então
  -- dois itens do MESMO sku+tipo com variacao NULL passariam despercebidos
  -- por um índice comum. Aqui ela troca NULL por '' só para a comparação —
  -- a coluna `variacao` continua NULL de verdade, do mesmo jeito que em
  -- `movimentos` e no resto do sistema. Provado em src/reconciliacao-schema-test.mjs.
  variacao_chave TEXT GENERATED ALWAYS AS (COALESCE(variacao, '')) STORED,
  descricao   TEXT,
  tipo        TEXT NOT NULL CHECK (tipo IN (
                'estoque_loja', 'produto_novo', 'ajuste_qtd', 'campo'
              )),
  de          TEXT,
  para        TEXT,
  base_json   TEXT,
  -- trivial: aplica sem drama · confere: grande, mas explicável
  -- perigoso: pode tirar peça do ar, ou mexe em preço
  -- desconhecido: o sistema NÃO sabe o que é certo. Nunca em bloco.
  risco       TEXT NOT NULL CHECK (risco IN (
                'trivial', 'confere', 'perigoso', 'desconhecido'
              )),
  motivo      TEXT,                                  -- a frase que explica o risco
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
                'pendente', 'aprovado', 'rejeitado', 'aplicado', 'obsoleto', 'erro'
              )),
  erro        TEXT,                                  -- a frase que explica 'obsoleto' ou 'erro'
  -- Carga específica do tipo: varianteId/produtoId/locais para o empurrão,
  -- cat/preco/desc para a importação. Guardada na análise para a aplicação
  -- não precisar redescobrir.
  dados_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_rec_itens_sessao  ON reconciliacao_itens(sessao_id);
CREATE INDEX IF NOT EXISTS idx_rec_itens_status  ON reconciliacao_itens(sessao_id, status);
CREATE INDEX IF NOT EXISTS idx_rec_sessoes_status ON reconciliacao_sessoes(status);

-- A identidade real de um item DENTRO de uma sessão. Sem isto, a mesma
-- proposta duas vezes na mesma sessão é possível: inofensivo para
-- estoque_loja (o PATCH manda valor absoluto, repetir dá o mesmo resultado),
-- mas para ajuste_qtd seria um movimento contado duas vezes — a razão
-- contábil quebrando por uma corrida de inserção, não por erro de cálculo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_itens_unico
  ON reconciliacao_itens(sessao_id, sku, variacao_chave, tipo);
