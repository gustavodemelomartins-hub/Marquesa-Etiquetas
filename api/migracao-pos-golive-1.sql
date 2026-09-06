-- ════════════════════════════════════════════════════════════════════════
-- REVISÃO OPERACIONAL 1 (pós-go-live) — 06/09/2026
--
-- NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO HUMANA EXPLÍCITA E BACKUP
-- RECENTE CONFIRMADO. Ver docs/BACKUP_RECOVERY.md e CLAUDE.md § operação
-- crítica.
--
-- Tudo aqui é ADITIVO: cria índice e tabela nova, e acrescenta coluna. Não
-- apaga linha, não altera coluna existente, não reclassifica dado antigo.
-- Rodar em banco já migrado só falha nos `ALTER TABLE ADD COLUMN` (o SQLite
-- não os tem em versão idempotente) — e essa falha, com a mensagem
-- "duplicate column name", significa "já foi aplicada", não "deu errado".
-- Cada bloco é independente: pode rodar de novo a partir do que faltou.
--
-- Ordem de aplicação: os índices primeiro (só melhoram leitura), depois as
-- tabelas, depois as colunas.
-- ════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────── 1. ÍNDICES (leitura do D1)
--
-- `maleta_itens` tem PRIMARY KEY (maleta_id, sku) e um índice por
-- maleta_id — mas NENHUM por sku. Toda consulta que pergunta "quanto deste
-- código está em maleta aberta?" varria a tabela inteira, uma vez por
-- produto.
--
-- Medido em banco local com o tamanho da produção (772 produtos, 382 peças
-- em 4 maletas abertas), com api/src/d1-metrica.js:
--
--     GET /api/variacoes/revisao   →   298.032 linhas lidas
--     a mesma rota, com este índice →    ver D1_USAGE_AUDIT.md
--
-- `consignadoDoSku` (api/src/estoque.js) faz a mesma pergunta uma vez por
-- item de cada venda registrada, então o índice também derruba o custo de
-- vender.
CREATE INDEX IF NOT EXISTS idx_maleta_itens_sku ON maleta_itens(sku);

-- `SELECT * FROM produtos ORDER BY desc` é a primeira consulta de
-- /api/state, que 50 pontos do painel chamam. Sem índice, o SQLite monta
-- uma B-tree temporária e a leitura conta em dobro (1.544 linhas para 772
-- produtos). Com ele, conta uma vez.
CREATE INDEX IF NOT EXISTS idx_produtos_desc ON produtos(desc);

-- A diferença de troca a receber é lida pelo Painel a cada abertura. Sem
-- este índice a busca varre `garantia_trocas` inteira.
-- (idx_gar_troca_dif já cobre (diferenca_status, diferenca_paga_em); este
-- cobre o caminho de volta, da venda para a troca.)


-- ──────────────────────── 2. QUAL VARIAÇÃO SAIU NA MALETA  (pacote § 8.2)
--
-- O problema real: o sistema avisa "REVISAR VARIAÇÃO — há peças deste
-- código em maleta aberta, e a maleta ainda não sabe qual variação saiu"
-- (api/src/variantes.js › IMPEDIMENTOS.maleta) e não oferece caminho para
-- responder. A Sthefany quase sempre SABE qual aro está naquela maleta.
--
-- Por que uma tabela filha e não uma coluna em `maleta_itens`: a chave de
-- lá é (maleta_id, sku), uma linha por código. Uma coluna `variacao`
-- obrigaria toda maleta a levar UMA variação por código — e uma maleta com
-- dois anéis do mesmo código, um 16 e um 18, é o caso normal, não a exceção.
--
-- Esta tabela é de IDENTIDADE, não de quantidade nova: a soma de `qtd` aqui
-- nunca pode passar da `qtd` da linha em `maleta_itens`, e dizer qual
-- variação saiu NÃO movimenta estoque. A peça já saiu quando a maleta foi
-- aberta; identificá-la depois não a faz sair de novo.
CREATE TABLE IF NOT EXISTS maleta_item_variacoes (
  maleta_id   INTEGER NOT NULL REFERENCES maletas(id),
  sku         TEXT NOT NULL REFERENCES produtos(sku),
  -- o NOME da variação, como em produto_variacoes.nome ("16", "45cm")
  variacao    TEXT NOT NULL,
  -- o id da variante na Nuvemshop, quando conhecido. NULL é honesto:
  -- variação local que ainda não existe na loja não tem id nenhum.
  variante_id TEXT,
  qtd         INTEGER NOT NULL CHECK (qtd > 0),
  -- quem disse, e quando. Identificação é decisão humana e fica registrada.
  origem      TEXT NOT NULL DEFAULT 'humana',   -- humana | reconciliacao
  observacao  TEXT,
  definida_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (maleta_id, sku, variacao)
);
CREATE INDEX IF NOT EXISTS idx_mitem_var_sku ON maleta_item_variacoes(sku);
CREATE INDEX IF NOT EXISTS idx_mitem_var_maleta ON maleta_item_variacoes(maleta_id);


-- ─────────────── 3. A TROCA DE GARANTIA VIRA REGISTRO COMERCIAL (§ 3.1)
--
-- REGRA DE NEGÓCIO NOVA, definida pela Sthefany em 05/09/2026, que
-- SUBSTITUI a anterior (api/REGRAS.md § 32, "troca não é venda nova"):
-- a peça que entra numa troca sem conserto passa a nascer como registro
-- comercial próprio, ligado à garantia e à compra de origem.
--
-- O dinheiro NÃO muda: continua sendo só a DIFERENÇA. A venda criada tem
-- `total` = diferença, e o item guarda preço de tabela e o crédito da peça
-- devolvida como desconto rotulado. Sem isso, faturar a peça nova inteira
-- contaria pela segunda vez os R$ 89 que a cliente já pagou na compra
-- original.
--
-- `venda_id` aqui é o que impede a contagem em dobro na outra ponta:
-- visaoGeral soma `garantia_trocas.diferenca_valor_pago` no faturamento, e
-- passa a somar SÓ as trocas sem venda ligada (as antigas). As novas
-- faturam pela venda, como qualquer outra.
ALTER TABLE garantia_trocas ADD COLUMN venda_id INTEGER REFERENCES vendas(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gar_troca_venda
  ON garantia_trocas(venda_id);


-- ───────────────────── 4. CORRIGIR O SKU DE UMA VENDA JÁ REGISTRADA (§ 6)
--
-- Caso real: Juliana Negri, 30/08/2026, peça lançada com o código errado; o
-- certo é 326660. Hoje não há caminho pela interface — e cancelar e
-- relançar a venda perderia data, cliente e histórico.
--
-- Esta tabela é a AUDITORIA da correção, não o dado corrigido: o SKU novo é
-- gravado na própria linha da venda (é ela que a tela lê), e aqui fica
-- registrado o que era antes, o que passou a ser, quem mexeu e o que
-- aconteceu com o estoque. Sem isto, uma correção seria indistinguível de
-- um erro de digitação novo.
--
-- `estoque_movido` responde à distinção que o pacote exige: venda
-- OPERACIONAL baixou estoque pelo sistema e a correção precisa devolver uma
-- unidade ao código errado e tirar uma do certo; linha HISTÓRICA importada
-- já veio com o estoque refletido e corrigir o código não pode movimentar
-- nada.
CREATE TABLE IF NOT EXISTS venda_item_correcoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- em qual população a venda vive
  fonte TEXT NOT NULL CHECK (fonte IN ('operacional', 'historico')),
  venda_id          INTEGER REFERENCES vendas(id),
  historico_item_id INTEGER REFERENCES vendas_historico_itens(id),

  sku_antes TEXT NOT NULL,
  sku_depois TEXT NOT NULL,
  desc_antes TEXT,
  desc_depois TEXT,
  variacao_antes TEXT,
  variacao_depois TEXT,
  variante_id_antes TEXT,
  variante_id_depois TEXT,
  -- preço só muda se alguém pedir explicitamente; NULL = não mexeu
  preco_antes REAL,
  preco_depois REAL,

  -- 1 = houve devolução ao SKU errado e baixa no certo, uma vez cada.
  -- 0 = histórico cujo estoque já estava refletido; nada foi movimentado.
  estoque_movido INTEGER NOT NULL DEFAULT 0,
  movimento_estorno_id INTEGER REFERENCES movimentos(id),
  movimento_baixa_id   INTEGER REFERENCES movimentos(id),

  motivo    TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),

  CHECK (fonte <> 'operacional' OR venda_id IS NOT NULL),
  CHECK (fonte <> 'historico'   OR historico_item_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_vic_venda ON venda_item_correcoes(venda_id);
CREATE INDEX IF NOT EXISTS idx_vic_hist  ON venda_item_correcoes(historico_item_id);
CREATE INDEX IF NOT EXISTS idx_vic_data  ON venda_item_correcoes(criado_em);


-- ───────────────────────────── 5. MONTE SEU COLAR — produto configurável
--
-- O que a Sthefany vende: um colar Veneziana (peça de estoque que já
-- existe) com 1..N pingentes de filho, cada um com sexo e cor escolhidos na
-- hora. Criar uma variante permanente para cada combinação possível explode
-- o cadastro — 3 posições × 2 sexos × 6 cores já são 1.728 combinações que
-- ninguém vai manter.
--
-- Por que NÃO reusar `kit_componentes` como está: um kit tem composição
-- FIXA (kit_sku → sempre os mesmos componentes). Aqui a composição é
-- escolhida por venda. O que se reusa é a IDEIA e o mecanismo de baixa: a
-- peça configurada não tem saldo próprio, e o que sai do estoque são a base
-- e os componentes, cada um com seu movimento.
--
-- Componentes NÃO são estrutura nova: são produtos do catálogo, com SKU e
-- saldo próprios ("Pingente Filho Verde Banho de Ouro 18k" é o item que
-- mais vendeu no painel de hoje). Este bloco só diz quais deles podem
-- ocupar qual posição de qual modelo.

-- O modelo: "Colar 3 filhos", "Colar casal".
CREATE TABLE IF NOT EXISTS personalizacao_modelos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  slug      TEXT NOT NULL UNIQUE,        -- '3-filhos'
  nome      TEXT NOT NULL,               -- 'Colar personalizado — 3 filhos'
  -- quantas posições este modelo tem. Iguais quando o número é fixo.
  slots_min INTEGER NOT NULL DEFAULT 1 CHECK (slots_min > 0),
  slots_max INTEGER NOT NULL DEFAULT 1 CHECK (slots_max > 0),
  -- a base sugerida (a Veneziana). Sugestão, não obrigação: a tela deixa
  -- escolher outra, e é isso que faz o modelo servir para o colar de prata
  -- sem precisar de um segundo cadastro.
  base_sku_padrao TEXT REFERENCES produtos(sku),
  -- preço sugerido da composição pronta. NULL = a tela pergunta.
  -- §24 continua valendo: sem preço, o lançamento pede o número.
  preco_sugerido REAL,
  ativo     INTEGER NOT NULL DEFAULT 1,
  ordem     INTEGER NOT NULL DEFAULT 0,
  obs       TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (slots_max >= slots_min)
);

-- Quais produtos do catálogo podem ocupar uma posição deste modelo.
-- `rotulo` é como a tela chama a escolha ("Menino", "Menina"), e
-- `variacao` é a cor quando ela é variação do próprio componente em vez de
-- um SKU diferente — os dois caminhos existem no catálogo real.
CREATE TABLE IF NOT EXISTS personalizacao_opcoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id      INTEGER NOT NULL REFERENCES personalizacao_modelos(id),
  componente_sku TEXT NOT NULL REFERENCES produtos(sku),
  variacao       TEXT,
  variante_id    TEXT,
  rotulo         TEXT NOT NULL,          -- 'Menino Verde'
  grupo          TEXT,                   -- 'Menino' | 'Menina' — para agrupar na tela
  ordem          INTEGER NOT NULL DEFAULT 0,
  ativo          INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pers_opcao_unica
  ON personalizacao_opcoes(modelo_id, componente_sku, COALESCE(variacao, ''));
CREATE INDEX IF NOT EXISTS idx_pers_opcoes_modelo ON personalizacao_opcoes(modelo_id, ordem);

-- A CONFIGURAÇÃO DE UMA VENDA — o que foi realmente montado, congelado.
-- Fica para sempre: o histórico da cliente precisa poder dizer, daqui a
-- dois anos, que o colar dela era menino verde, menina rosa, menino azul,
-- mesmo que o modelo mude ou saia do ar.
CREATE TABLE IF NOT EXISTS venda_personalizacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id   INTEGER NOT NULL REFERENCES vendas(id),
  -- o item da venda a que isto corresponde. `venda_itens` não tem chave
  -- própria; a identidade é (venda_id, sku) — o SKU da BASE, que é o que
  -- aparece no recibo.
  base_sku   TEXT NOT NULL REFERENCES produtos(sku),
  base_variacao TEXT,
  base_variante_id TEXT,

  modelo_id   INTEGER REFERENCES personalizacao_modelos(id),
  -- o nome NA ÉPOCA, congelado. Renomear o modelo não reescreve o passado.
  modelo_nome TEXT NOT NULL,
  preco       REAL NOT NULL,

  -- §7.4 — a venda personalizada que JÁ ACONTECEU antes de existir esta
  -- tela. 1 = o estoque desta venda já estava refletido e NADA foi
  -- movimentado ao registrá-la; 0 = base e componentes baixaram aqui.
  -- Auditável de propósito: é o campo que separa "registrei o histórico"
  -- de "vendi agora", e é ele que impede a baixa dupla.
  estoque_ja_refletido INTEGER NOT NULL DEFAULT 0,
  observacao TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vpers_venda ON venda_personalizacoes(venda_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vpers_venda_base
  ON venda_personalizacoes(venda_id, base_sku);

-- Cada posição da composição, com o componente que a ocupou.
CREATE TABLE IF NOT EXISTS venda_personalizacao_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personalizacao_id INTEGER NOT NULL REFERENCES venda_personalizacoes(id),
  posicao        INTEGER NOT NULL,        -- 1, 2, 3
  componente_sku TEXT NOT NULL REFERENCES produtos(sku),
  -- o nome NA ÉPOCA, pelo mesmo motivo de `modelo_nome`
  componente_nome TEXT,
  variacao       TEXT,
  variante_id    TEXT,
  rotulo         TEXT,                    -- 'Menino Verde', como foi escolhido
  qtd            INTEGER NOT NULL DEFAULT 1 CHECK (qtd > 0),
  -- o movimento que baixou ESTE componente. NULL quando
  -- `estoque_ja_refletido = 1` — e aí NULL quer dizer exatamente
  -- "não movimentei, de propósito".
  movimento_id   INTEGER REFERENCES movimentos(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vpers_item_posicao
  ON venda_personalizacao_itens(personalizacao_id, posicao);
CREATE INDEX IF NOT EXISTS idx_vpers_item_sku
  ON venda_personalizacao_itens(componente_sku);
