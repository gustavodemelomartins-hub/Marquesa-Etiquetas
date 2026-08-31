-- Marquesa · banco central (Cloudflare D1 / SQLite)
--
-- Estrutura seguindo o documento de contexto da operação:
--   §19  o saldo resulta das movimentações, não de digitação
--   §6.1 a maleta congela o preço do momento do envio
--   §9   peça não devolvida no acerto gera venda de verdade
--   §24  produto sem preço fica "sem preço", não vira R$ 0
--   §28  não apagar histórico — arquivar e cancelar, nunca excluir
--   §4   categorias configuráveis

-- Nota: o D1 já força as chaves estrangeiras em toda query, e não aceita
-- `PRAGMA foreign_keys` — por isso ele não aparece aqui.

-- ---------------------------------------------------------------- categorias
-- §4: configuráveis. A derivação pela descrição continua sendo o palpite
-- inicial na importação, mas o valor final é editável e mora aqui.
CREATE TABLE IF NOT EXISTS categorias (
  nome   TEXT PRIMARY KEY,
  ordem  INTEGER NOT NULL DEFAULT 0,
  cor    TEXT
);

INSERT OR IGNORE INTO categorias (nome, ordem, cor) VALUES
  ('Colar',     1, '#C2426B'),
  ('Brinco',    2, '#C4802A'),
  ('Pulseira',  3, '#0D9382'),
  ('Berloque',  4, '#6A54B5'),
  ('Anel',      5, '#D8646B'),
  ('Argola',    6, '#3D77C4'),
  ('Pingente',  7, '#5C8A34'),
  ('Conjunto',  8, '#A15BA0'),
  ('Outros',    9, '#9E8A90');

-- ----------------------------------------------------------------- produtos
-- qtd é saldo MATERIALIZADO do estoque total. A verdade é a tabela
-- movimentos; qtd existe para leitura rápida e é conferível a qualquer
-- momento por /api/estoque/conferir (§19 e §31, que admitem os dois juntos).
CREATE TABLE IF NOT EXISTS produtos (
  sku            TEXT PRIMARY KEY,
  desc           TEXT NOT NULL,
  cat            TEXT NOT NULL REFERENCES categorias(nome),
  preco          REAL,                          -- §24: NULL = sem preço. Nunca 0 por omissão.
  qtd            INTEGER NOT NULL DEFAULT 0,    -- estoque TOTAL (inclui o consignado)
  -- ativo | inativo | arquivado
  -- 'arquivado' é o destino de quem tem histórico e por isso não pode ser
  -- excluído (§28). Não precisou de tratamento especial em lugar nenhum: as
  -- consultas que importam já filtram `status = 'ativo'`, então o arquivado
  -- sai sozinho da sincronização, da fila de fotos e do empurrão de estoque.
  status         TEXT NOT NULL DEFAULT 'ativo',
  url_loja       TEXT,
  estoque_loja   INTEGER,
  visivel        INTEGER,
  nome_loja      TEXT,
  -- Foto em duas versões: a original que a Sthefany tirou e a tratada com
  -- fundo branco, que é a que vai para a loja. Guardar só uma das duas
  -- apagaria a fonte ou obrigaria a refazer o tratamento toda vez.
  --
  -- Os bytes NÃO ficam aqui: moram no bucket R2. Esta tabela guarda só a
  -- referência (a chave do objeto), o tipo, o tamanho e o estado — nunca a
  -- imagem em si. É a chave que muda quando a foto é trocada; o histórico
  -- de quem trocou fica nos logs do R2, não é responsabilidade do D1.
  foto_original_key   TEXT,                      -- chave do objeto no R2
  foto_original_tipo  TEXT,                      -- content-type, ex. image/jpeg
  foto_original_tam   INTEGER,                   -- bytes
  foto_tratada_key    TEXT,
  foto_tratada_tipo   TEXT,
  foto_tratada_tam    INTEGER,
  foto_status         TEXT,                      -- sem_foto | original | fundo_pendente | fundo_gerado | erro
  foto_erro           TEXT,
  foto_origem         TEXT,                      -- nuvemshop | upload
  foto_em             TEXT,
  -- Quando e por que saiu de circulação. Sem isto, "por que esta peça sumiu
  -- da lista?" vira arqueologia nos movimentos.
  arquivado_em        TEXT,
  arquivado_motivo    TEXT,
  -- Endereço da imagem NA LOJA, quando ela existe lá e os bytes ainda não
  -- foram copiados para cá. É referência, não posse: serve para a miniatura
  -- aparecer hoje, e para saber de onde copiar depois. Quando a chave do R2
  -- existir, ela é que vale — ver migracao-foto-url.sql.
  foto_url            TEXT,
  foto_url_em         TEXT,
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------- peças novas na fila
-- A importação de estoque total encontra códigos que ainda não existem
-- aqui. Ela NÃO os cria — isso é trabalho do fluxo "Adicionar peças
-- novas" — mas jogar fora o que encontrou obrigaria a reimportar o mesmo
-- arquivo. Então eles esperam nesta fila até alguém aprovar o lote.
CREATE TABLE IF NOT EXISTS produtos_pendentes (
  sku         TEXT PRIMARY KEY,
  desc        TEXT,
  cat         TEXT,
  preco       REAL,
  qtd         INTEGER NOT NULL DEFAULT 0,
  origem      TEXT,
  motivo      TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------- fotos sem correspondência
-- Imagem que veio da loja e cujo código não bateu com nenhum daqui. Chutar
-- a peça certa é pior que não ter foto: a loja passa a anunciar uma peça
-- mostrando outra. Fica na fila para alguém decidir.
CREATE TABLE IF NOT EXISTS fotos_orfas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  url         TEXT NOT NULL,
  sku_loja    TEXT,
  nome_loja   TEXT,
  produto_id  TEXT,
  visto_em    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------- movimentos
-- §18/§19: responde "por que o estoque deste SKU mudou?".
-- qtd é o efeito ASSINADO sobre o estoque total:
--   entrada/devolução de fornecedor  → positivo
--   venda/perda/quebra/brinde/troca  → negativo
--   consignação e devolução de maleta → 0 (não mudam o total, só onde a peça está)
-- Por isso vale sempre:  produtos.qtd == SUM(movimentos.qtd)
CREATE TABLE IF NOT EXISTS movimentos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sku            TEXT NOT NULL REFERENCES produtos(sku),
  -- Qual variação do código (o aro do anel, o comprimento da corrente).
  -- NULL na imensa maioria: código sem variação se comporta exatamente como
  -- sempre se comportou. Por isso a variação entrou como COLUNA e não como
  -- tabela paralela — assim `produtos.qtd == SUM(movimentos.qtd)` continua
  -- valendo sem exceção, e o saldo de uma variação é a mesma soma com um
  -- filtro a mais. Não existe segunda contabilidade para desencontrar.
  variacao       TEXT,
  -- O id da variante na Nuvemshop correspondente, quando o movimento sabe
  -- dele. NULL em tudo que é histórico e em todo código sem variação — e
  -- isso é honesto: o movimento antigo realmente não sabe qual caixinha da
  -- loja ele era. Quando não sabe, a sincronização NÃO adivinha: ela
  -- bloqueia a escrita daquele código e manda para revisão humana.
  --
  -- Quem fecha a invariante continua sendo `qtd`; esta coluna não entra em
  -- conta nenhuma, só no casamento com a loja.
  variante_id    TEXT,
  tipo           TEXT NOT NULL,   -- entrada|ajuste|consignacao|devolucao|venda|perda|quebra|dano|furto|brinde|troca|nota_credito|venda_conjunto|cancelamento
  qtd            INTEGER NOT NULL,
  origem         TEXT,            -- importacao | manual | maleta | acerto | venda | inventario | cancelamento | kit
  maleta_id      INTEGER,
  revendedora_id INTEGER,
  venda_id       INTEGER,
  obs            TEXT,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  -- NULL na imensa maioria — só existe quando o movimento veio do Apply do
  -- motor de reconciliação (tipo ajuste_qtd). O índice único abaixo garante
  -- que o MESMO item de reconciliação nunca gera dois movimentos, mesmo sob
  -- crash-e-retry ou duas execuções concorrentes: ver RECONCILIATION_ENGINE.md.
  reconciliacao_item_id INTEGER REFERENCES reconciliacao_itens(id)
);

-- Índice único: no máximo UM movimento por item de reconciliação. SQLite
-- trata cada NULL como distinto de todo outro NULL num índice único — os
-- movimentos que não vêm da reconciliação (a imensa maioria, com a coluna
-- NULL) nunca colidem entre si; só dois movimentos com o MESMO
-- reconciliacao_item_id não-nulo seriam recusados, que é exatamente a
-- proteção que falta.
CREATE UNIQUE INDEX IF NOT EXISTS idx_movimentos_reconciliacao_item
  ON movimentos(reconciliacao_item_id);

-- --------------------------------------------------------- revendedoras
-- §28: nunca excluída. Sai de circulação virando status='inativa'.
CREATE TABLE IF NOT EXISTS revendedoras (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  tel        TEXT,
  cidade     TEXT,
  cpf        TEXT,
  endereco   TEXT,
  obs        TEXT,
  status     TEXT NOT NULL DEFAULT 'ativa',   -- ativa | inativa
  criada_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- maletas
-- §6.1: status Aberta | Em acerto | Encerrada | Cancelada.
-- "em_acerto" é estado de verdade no banco, e não só uma tela aberta —
-- assim dá para começar a conferência no celular e terminar no computador.
CREATE TABLE IF NOT EXISTS maletas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  rev_id       INTEGER NOT NULL REFERENCES revendedoras(id),
  status       TEXT NOT NULL DEFAULT 'aberta',  -- aberta | em_acerto | encerrada | cancelada
  aberta_em    TEXT,
  acerto_em    TEXT,                             -- data combinada do acerto
  encerrada_em TEXT,
  obs          TEXT,
  acerto_json  TEXT
);

-- §6.1: preço de referência no momento do envio. Sem isso, reajustar o
-- preço de uma peça mudaria o valor de toda maleta que já saiu.
CREATE TABLE IF NOT EXISTS maleta_itens (
  maleta_id    INTEGER NOT NULL REFERENCES maletas(id),
  sku          TEXT NOT NULL REFERENCES produtos(sku),
  qtd          INTEGER NOT NULL,
  preco_envio  REAL,                 -- congelado; NULL só se a peça não tinha preço
  devolvida    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (maleta_id, sku)
);

-- ----------------------------------------------------------------- config
CREATE TABLE IF NOT EXISTS config (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loja_snapshot (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  lido_em            TEXT,
  produtos_na_loja   INTEGER,
  produtos_casados   INTEGER,
  so_na_loja         INTEGER,
  codigos_casados    INTEGER,
  duplicados_json    TEXT
);

-- -------------------------------------------------------------- variações
-- O mesmo código vendido em mais de uma opção: aro do anel, comprimento da
-- corrente. A peça é fisicamente diferente e o estoque é separado de
-- verdade, mas a ETIQUETA é a mesma — bipar não distingue, então quem
-- distingue é ela, na hora, e só nestes códigos.
--
-- Ninguém digita esta tabela: quem preenche é a sincronização, lendo as
-- variações que a própria Nuvemshop declara. Se um aro deixar de existir
-- lá, some daqui na rodada seguinte.
--
-- Um código COM linhas aqui não perde o saldo próprio (diferente do kit):
-- `produtos.qtd` continua sendo o total do código. O que passa a existir é
-- a repartição desse total entre as variações, que precisa somar de volta.
CREATE TABLE IF NOT EXISTS produto_variacoes (
  sku          TEXT NOT NULL REFERENCES produtos(sku),
  nome         TEXT NOT NULL,      -- "16", "45cm", "Ródio"
  atributo     TEXT,               -- como a loja chama: "Tamanho", "Comprimento"
  variante_id  TEXT,               -- id da variação na Nuvemshop, para empurrar estoque
  produto_id   TEXT,
  estoque_loja INTEGER,            -- quanto a loja mostra nesta variação
  ordem        INTEGER NOT NULL DEFAULT 0,
  -- Os atributos já resolvidos em pares, em JSON, porque quantos e quais
  -- existem muda de produto para produto e presumir "cor e tamanho"
  -- quebraria no primeiro anel vendido por aro:
  --   [{"atributo":"Tamanho","valor":"16"},{"atributo":"Banho","valor":"Ródio"}]
  -- A coluna `atributo` acima continua existindo com os nomes concatenados,
  -- que é o que a tela legada lê.
  valores_json TEXT,
  variante_sku TEXT,               -- o SKU que a loja carrega NA variante
  preco        REAL,
  promocional  REAL,
  imagem_url   TEXT,               -- imagem própria da variante, quando tem
  -- De onde veio esta linha, e quem pode apagá-la:
  --   'loja'  — leu da Nuvemshop. A rodada seguinte reescreve e pode apagar.
  --   'local' — alguém criou aqui, num produto que ainda não está na loja.
  --             A sincronização NÃO encosta.
  -- Sem esta distinção, a rodada da madrugada apagaria a estrutura que
  -- alguém acabou de digitar, e a peça amanheceria sem variação.
  origem       TEXT,
  PRIMARY KEY (sku, nome)
);
CREATE INDEX IF NOT EXISTS idx_variacoes_sku ON produto_variacoes(sku);
-- O casamento com a loja é por `variante_id`, não por nome: nome é dado
-- dela e pode mudar sozinho. Este índice faz o BANCO garantir que duas
-- linhas nunca apontem para a mesma caixinha. NULL não colide com NULL num
-- índice único do SQLite, então linhas sem id convivem em paz.
CREATE UNIQUE INDEX IF NOT EXISTS idx_variacoes_variante
  ON produto_variacoes(variante_id);

-- ------------------------------------------------------------------- kits
-- Peça publicada como mais de um anúncio porque pode ser vendida inteira ou
-- desmontada — o caso real: "Colar Casal de Filhos" (corrente + pingente
-- menino + pingente menina) também vira "Colar Filho(a)" avulso quando a
-- cliente quer só um lado.
--
-- Um SKU com linha aqui é um kit: ele NUNCA tem saldo próprio em
-- produtos.qtd (fica sempre 0, sem movimento nenhum). O disponível dele é
-- CALCULADO na hora — o mínimo, entre os componentes, de quanto cada um
-- permite montar. Dois kits que usam o mesmo componente automaticamente
-- disputam o mesmo estoque: vender um derruba o outro na mesma hora, sem
-- ninguém ter que lembrar de atualizar o outro anúncio.
CREATE TABLE IF NOT EXISTS kit_componentes (
  kit_sku         TEXT NOT NULL REFERENCES produtos(sku),
  componente_sku  TEXT NOT NULL REFERENCES produtos(sku),
  qtd             INTEGER NOT NULL DEFAULT 1,   -- quantas unidades do componente por kit
  PRIMARY KEY (kit_sku, componente_sku)
);

-- ---------------------------------------------------------------- clientes
-- A entidade de CRM. `*_norm` existe para BUSCAR e para PROPOR candidato de
-- vínculo — nunca para unir dois clientes sozinho: nome não é identidade, e
-- duas "Camila" podem ser duas pessoas. Ambiguidade vai para
-- `clientes_vinculo_revisao`.
CREATE TABLE IF NOT EXISTS clientes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  tel           TEXT,
  nome_norm     TEXT,
  tel_norm      TEXT,
  email         TEXT,
  email_norm    TEXT,
  instagram     TEXT,
  cidade        TEXT,
  nascimento    TEXT,
  obs           TEXT,
  origem        TEXT NOT NULL DEFAULT 'manual',   -- manual | historico
  criada_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizada_em TEXT,
  -- CPF é anotação de cadastro, não identidade: sem UNIQUE, sem validação de
  -- dígito. Duas linhas com o mesmo CPF digitado errado não podem virar erro
  -- de escrita no meio de uma venda. `cpf_norm` guarda só os dígitos, para a
  -- busca não depender de quem digitou com ponto.
  -- Últimas de propósito: `migracao-cliente-cpf.sql` as acrescenta com
  -- ALTER TABLE, que sempre põe no fim. Os dois caminhos terminam iguais.
  cpf           TEXT,
  cpf_norm      TEXT
);

-- ------------------------------------------------------------------ vendas
-- §9: venda de balcão e venda vinda do acerto moram na MESMA tabela,
-- diferenciadas por origem. É o que permite pedir "as vendas do dia" e
-- receber tudo, não metade.
CREATE TABLE IF NOT EXISTS vendas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id     INTEGER REFERENCES clientes(id),
  cliente_nome   TEXT,                              -- vazio quando a origem é acerto
  -- Gravado por `normalizarNomeCliente()` em JS — o MESMO normalizador que
  -- a importação histórica usa. Existe para que analytics não precise
  -- normalizar em SQL: `LOWER(TRIM())` dobra caixa mas não acento, e
  -- separava "Vitória" de "vitoria" em duas clientes.
  cliente_nome_norm TEXT,
  revendedora_id INTEGER REFERENCES revendedoras(id),
  maleta_id      INTEGER REFERENCES maletas(id),
  origem         TEXT NOT NULL DEFAULT 'balcao',    -- balcao | acerto | site
  data           TEXT NOT NULL,
  total          REAL NOT NULL,
  cancelada      INTEGER NOT NULL DEFAULT 0,        -- §28: cancela, não apaga
  -- Identidade do pedido lá fora ("nuvemshop:1234"). O índice único abaixo
  -- é o que impede uma rodada repetida da sincronização de cobrar a mesma
  -- venda duas vezes — a trava é do banco, não da lógica que pode falhar.
  externo_id     TEXT,
  -- Estado da publicação do estoque físico após venda/acerto/cancelamento.
  -- A venda física nunca é desfeita quando a rede falha: fica observável e
  -- retomável. `externo_id` só identifica pedido do site ou pedido legado.
  nuvemshop_status TEXT NOT NULL DEFAULT 'nao_enviada',
  nuvemshop_erro   TEXT,
  nuvemshop_em     TEXT,
  criada_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cada rodada da sincronização com a loja, para poder responder "o que o
-- robô fez de madrugada?" sem depender de log de servidor.
CREATE TABLE IF NOT EXISTS sync_execucoes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  iniciado_em       TEXT,
  terminado_em      TEXT,
  status            TEXT,          -- rodando | ok | pausado | erro
  pedidos_lidos     INTEGER,
  vendas_criadas    INTEGER,
  produtos_enviados INTEGER,
  detalhe_json      TEXT,
  -- 1 = rodada seca ({"seco": true}). Marcada no INSERT, não derivada do
  -- relato no fim — continua correta enquanto a linha ainda está 'rodando'.
  -- A saúde operacional (resumoSync) ignora as linhas com seco=1: uma
  -- análise não pode fazer uma falha real desaparecer da tela.
  -- TECH_DEBT.md item 12.
  seco              INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS venda_itens (
  venda_id  INTEGER NOT NULL REFERENCES vendas(id),
  sku       TEXT NOT NULL REFERENCES produtos(sku),
  desc      TEXT NOT NULL,
  qtd       INTEGER NOT NULL,
  preco     REAL NOT NULL,
  motivo    TEXT,                                   -- §8: venda|perda|quebra|brinde|troca|...
  variacao  TEXT,                                   -- nome para leitura/histórico
  variante_id TEXT,                                 -- identidade estável na Nuvemshop
  -- §27: `preco` acima é o que foi COBRADO. Estas três dizem de onde ele veio.
  -- Últimas de propósito: `migracao-venda-desconto.sql` as acrescenta com
  -- ALTER TABLE, que sempre põe no fim. Os dois caminhos terminam iguais.
  preco_tabela    REAL,                             -- catálogo no momento da venda
  desconto_valor  REAL,                             -- preco_tabela - preco
  desconto_rotulo TEXT                              -- "Grupo VIP"
);

-- ------------------------------------------------------------- inventário
-- A conferência física do que está em casa. Fica aberta enquanto ela bipa:
-- é estado de verdade no banco, e não só uma tela aberta, para poder começar
-- no celular no meio da sala e terminar no computador — mesma escolha já
-- feita para a maleta "em_acerto".
--
-- Códigos bipados que não existem no catálogo não entram em inventario_itens
-- (a chave estrangeira os recusaria, e com razão: a razão de estoque não pode
-- citar peça que não existe). Ficam em desconhecidos_json para a tela poder
-- mostrá-los — §22, sinalizar em vez de engolir.
CREATE TABLE IF NOT EXISTS inventarios (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  status             TEXT NOT NULL DEFAULT 'aberto',   -- aberto | concluido | cancelado
  iniciado_em        TEXT NOT NULL DEFAULT (datetime('now')),
  concluido_em       TEXT,
  desconhecidos_json TEXT,
  obs                TEXT
);

-- `esperado` é congelado no fechamento, do mesmo jeito que maleta_itens
-- congela o preço do envio (§6.1). Sem isso, abrir um inventário de três
-- meses atrás mostraria a diferença contra o estoque de HOJE — e um
-- inventário que muda de resultado depois de fechado não serve para nada.
CREATE TABLE IF NOT EXISTS inventario_itens (
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  sku           TEXT NOT NULL REFERENCES produtos(sku),
  contado       INTEGER NOT NULL DEFAULT 0,
  esperado      INTEGER,                            -- NULL enquanto aberto
  ajustado      INTEGER NOT NULL DEFAULT 0,         -- 1 = já virou movimento
  PRIMARY KEY (inventario_id, sku)
);

-- ------------------------------------------------------- reconciliação
-- Prévia, revisão humana e aplicação do aprovado — ver
-- docs/RECONCILIATION_ENGINE.md para o fluxo completo e
-- api/migracao-reconciliacao.sql para as notas por coluna (os dois
-- precisam continuar idênticos).
--
-- Nada aqui guarda saldo. A razão continua sendo `movimentos`, e a
-- aplicação (quando existir) passa por `estoque.js › movimentar` como todo
-- o resto — nenhuma exceção para reconciliação.
CREATE TABLE IF NOT EXISTS reconciliacao_sessoes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  origem       TEXT NOT NULL CHECK (origem IN ('nuvemshop', 'planilha_estoque_total', 'planilha_produtos_novos')),
  -- revisao | aplicando | aplicada | aplicada_parcial | cancelada |
  -- superada | erro — ver o comentário da migration para as transições
  status       TEXT NOT NULL DEFAULT 'revisao' CHECK (status IN (
                 'revisao', 'aplicando', 'aplicada', 'aplicada_parcial',
                 'cancelada', 'superada', 'erro'
               )),
  criada_em    TEXT NOT NULL DEFAULT (datetime('now')),
  decidida_em  TEXT,        -- quando a revisão terminou, não quando aplicou
  aplicada_em  TEXT,
  resumo_json  TEXT,        -- o relato da análise: contagens, o que não foi empurrado, avisos
  relato_json  TEXT,        -- o que a aplicação fez: aplicados, obsoletos, erros
  erro         TEXT         -- falha catastrófica da sessão, não de um item
);

-- No máximo UMA sessão em revisão por origem — o banco garante, não o
-- código. Ver api/migracao-reconciliacao.sql para o raciocínio completo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_sessoes_revisao_unica
  ON reconciliacao_sessoes(origem) WHERE status = 'revisao';

-- Uma linha por mudança proposta. `de` e `para` são TEXT porque o mesmo
-- motor carrega número (estoque), texto (descrição) e nulo (sem preço, §24);
-- quem lê converte, olhando o `tipo`.
--
-- `de` é o valor OBSERVADO NO DESTINO na análise. `base_json` é o estado
-- interno mínimo que produziu `para` — só existe quando esse estado pode
-- mudar sozinho (estoque_loja); para os tipos vindos de planilha a origem é
-- `dados_json`, congelada, e por isso `base_json` fica NULL de propósito.
-- Documentado por tipo em docs/RECONCILIATION_ENGINE.md.
CREATE TABLE IF NOT EXISTS reconciliacao_itens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id   INTEGER NOT NULL REFERENCES reconciliacao_sessoes(id),
  sku         TEXT NOT NULL,
  variacao    TEXT,                                  -- NULL = o código inteiro
  -- Só para a unicidade abaixo: SQLite nunca considera dois NULL iguais num
  -- índice único. `variacao` continua NULL de verdade.
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
  motivo      TEXT,
  -- pendente | aprovado | rejeitado | aplicado | obsoleto | erro — ver o
  -- comentário da migration para as transições e a distinção
  -- obsoleto (concorrência) × erro (falha técnica)
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
                'pendente', 'aprovado', 'rejeitado', 'aplicado', 'obsoleto', 'erro'
              )),
  erro        TEXT,                                  -- a frase que explica 'obsoleto' ou 'erro'
  dados_json  TEXT          -- varianteId/produtoId/locais, ou cat/preco/desc da planilha
);

-- ------------------------------------------------- espelho da loja inteira
-- Retrato COMPLETO do catálogo real da Nuvemshop: uma linha por variante,
-- inclusive as de produto que não existe aqui. É leitura pura — nada nesta
-- tabela manda em estoque, preço ou cadastro. Ela existe para o sistema
-- saber o que a loja tem ANTES de decidir qualquer coisa, e para a revisão
-- humana poder olhar o que não casou.
--
-- Não confundir com `produto_variacoes`: lá mora a REPARTIÇÃO do nosso
-- estoque entre as variações de um código nosso — decisão nossa. Aqui mora
-- o que a loja declara — fato de lá. Misturar as duas foi o que fez a
-- sincronização escrever número chutado na loja.
--
-- Sem FK para `produtos` de propósito: variante cujo SKU não é nosso
-- precisa caber aqui, porque é justamente o caso que interessa ver.
CREATE TABLE IF NOT EXISTS loja_variantes (
  variante_id   TEXT PRIMARY KEY,   -- id da variante na Nuvemshop: a identidade estável
  produto_id    TEXT NOT NULL,
  sku           TEXT,               -- o SKU que a loja carrega NA VARIANTE (lá pode ser NULL)
  sku_norm      TEXT,               -- o mesmo, na forma canônica daqui (maiúsculas, sem espaço)
  -- Atributos DINÂMICOS, não lista fixa de "cor" e "tamanho". A Nuvemshop
  -- entrega `product.attributes` e `variant.values` como duas listas
  -- paralelas — attributes[i] é o nome, values[i] é o valor desta variante.
  -- Guardamos o par já resolvido, porque quantos e quais existem muda de
  -- produto para produto:
  --   [{"atributo":"Tamanho","valor":"16"},{"atributo":"Banho","valor":"Ródio"}]
  valores_json  TEXT NOT NULL DEFAULT '[]',
  nome          TEXT,               -- os valores juntos ("16", "Dourado · 16"), para gente ler
  estoque       INTEGER,
  preco         REAL,
  promocional   REAL,
  imagem_url    TEXT,               -- imagem PRÓPRIA da variante, quando ela tem
  locais_json   TEXT,               -- location_ids do multi-estoque, quando a loja usa
  produto_nome  TEXT,
  produto_url   TEXT,
  produto_visivel INTEGER,
  posicao       INTEGER NOT NULL DEFAULT 0,
  lido_em       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================ FOTOS DA LOJA
-- O catálogo INTEIRO de imagens da Nuvemshop, lido e guardado aqui.
--
-- Antes disto existia uma coluna só: `produtos.foto_url`, uma imagem por
-- código, preenchida por um botão que alguém tinha de apertar. Três coisas
-- se perdiam nesse formato, e as três importam:
--
--   1. a GALERIA. Um produto tem várias fotos, e a segunda e a terceira
--      simplesmente não existiam aqui — para reencontrá-las era preciso
--      abrir a loja.
--   2. a IDENTIDADE. Não dava para saber de qual `product_id` a imagem
--      veio, nem se ela era a foto própria de uma variante ou a do produto.
--   3. a ORDEM. "Qual é a principal?" era uma suposição de quem exibia, não
--      um dado.
--
-- Esta tabela é o ESPELHO das imagens da loja, no mesmo espírito de
-- `loja_variantes`: fato de lá, não decisão nossa. A rodada de sincronização
-- reescreve as linhas dos produtos que leu — se uma foto sumiu de lá, some
-- daqui. Ela NÃO guarda bytes (isso é R2) e NÃO substitui `produtos.foto_url`
-- nem as chaves do R2: quando a foto é nossa, é a nossa que vale.
CREATE TABLE IF NOT EXISTS loja_fotos (
  -- id da imagem na Nuvemshop: a identidade estável, igual ao variante_id
  -- em loja_variantes. Nunca a posição, nunca o nome do arquivo.
  imagem_id   TEXT PRIMARY KEY,
  produto_id  TEXT NOT NULL,
  url         TEXT NOT NULL,
  posicao     INTEGER NOT NULL DEFAULT 0,
  -- 1 = é a que a vitrine mostra. Vem da posição declarada pela loja, e é
  -- gravada porque "a primeira da lista" depende de como a lista foi lida.
  principal   INTEGER NOT NULL DEFAULT 0,
  -- O código DAQUI a que esta imagem pertence, quando dá para saber. Fica
  -- NULL quando o produto da loja carrega mais de um código nas variantes e
  -- a imagem não está amarrada a nenhuma delas — adivinhar ali faria a loja
  -- anunciar uma peça mostrando outra.
  sku_norm    TEXT,
  -- Preenchido só quando a imagem é PRÓPRIA de uma variante (o anel dourado
  -- e o prateado). A amarração é pelo image_id que a variante declara.
  variante_id TEXT,
  lido_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loja_fotos_sku     ON loja_fotos(sku_norm);
CREATE INDEX IF NOT EXISTS idx_loja_fotos_produto ON loja_fotos(produto_id);
CREATE INDEX IF NOT EXISTS idx_loja_fotos_var     ON loja_fotos(variante_id);

-- ------------------------------------------------------ reserva de SKU
-- "Gerar SKU" precisa devolver um código GARANTIDAMENTE disponível, e duas
-- pessoas clicando ao mesmo tempo não podem receber o mesmo. Sem uma marca
-- no banco isso é impossível: as duas chamadas leriam o mesmo "maior código
-- atual" e devolveriam o mesmo número.
--
-- A reserva é a marca. Quem gera INSERE aqui, e a chave primária decide o
-- empate — o perdedor tenta o próximo. A reserva morre sozinha (`expira_em`)
-- para um código gerado e nunca usado não ficar preso, e some quando o
-- produto é criado de verdade.
CREATE TABLE IF NOT EXISTS sku_reservas (
  sku        TEXT PRIMARY KEY,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em  TEXT NOT NULL,
  origem     TEXT
);

CREATE INDEX IF NOT EXISTS idx_mov_sku        ON movimentos(sku);
CREATE INDEX IF NOT EXISTS idx_mov_maleta     ON movimentos(maleta_id);
CREATE INDEX IF NOT EXISTS idx_mov_criado     ON movimentos(criado_em);
CREATE INDEX IF NOT EXISTS idx_maleta_itens   ON maleta_itens(maleta_id);
CREATE INDEX IF NOT EXISTS idx_maletas_rev    ON maletas(rev_id);
CREATE INDEX IF NOT EXISTS idx_vendas_data    ON vendas(data);
CREATE INDEX IF NOT EXISTS idx_vendas_origem  ON vendas(origem);
CREATE INDEX IF NOT EXISTS idx_venda_itens_v  ON venda_itens(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_itens_s  ON venda_itens(sku);
CREATE INDEX IF NOT EXISTS idx_venda_itens_variante ON venda_itens(variante_id);
CREATE INDEX IF NOT EXISTS idx_inv_status     ON inventarios(status);
CREATE INDEX IF NOT EXISTS idx_inv_itens      ON inventario_itens(inventario_id);
-- Sem cláusula WHERE de propósito: no SQLite vários NULL convivem num índice
-- único (NULL nunca é igual a NULL), então um índice simples já deixa passar
-- todas as vendas normais e recusa só o mesmo pedido do site duas vezes.
-- Índice parcial faria o mesmo com mais sintaxe para dar errado.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_externo ON vendas(externo_id);
CREATE INDEX IF NOT EXISTS idx_kit_componentes ON kit_componentes(kit_sku);
CREATE INDEX IF NOT EXISTS idx_rec_itens_sessao   ON reconciliacao_itens(sessao_id);
CREATE INDEX IF NOT EXISTS idx_rec_itens_status   ON reconciliacao_itens(sessao_id, status);
CREATE INDEX IF NOT EXISTS idx_rec_sessoes_status ON reconciliacao_sessoes(status);
-- A identidade real de um item DENTRO de uma sessão — impede a mesma
-- proposta duas vezes (razão contábil em risco no caso de ajuste_qtd).
CREATE UNIQUE INDEX IF NOT EXISTS idx_rec_itens_unico
  ON reconciliacao_itens(sessao_id, sku, variacao_chave, tipo);
CREATE INDEX IF NOT EXISTS idx_fotos_orfas_sku ON fotos_orfas(sku_loja);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fotos_orfas_url ON fotos_orfas(url);
CREATE INDEX IF NOT EXISTS idx_mov_variante  ON movimentos(variante_id);
CREATE INDEX IF NOT EXISTS idx_loja_var_sku     ON loja_variantes(sku_norm);
CREATE INDEX IF NOT EXISTS idx_loja_var_produto ON loja_variantes(produto_id);
CREATE INDEX IF NOT EXISTS idx_sku_reservas_exp ON sku_reservas(expira_em);
-- SKU único DE FATO. `produtos.sku` já é PRIMARY KEY, então "BR1234" duas
-- vezes nunca passou; o que passava era "br1234" ao lado de "BR1234", ou
-- " BR1234" — o importador de planilha só fazia `.trim()`, enquanto o resto
-- do sistema compara em maiúsculas e sem espaço. Duas linhas, dois estoques,
-- e só uma casando com a loja. O índice abaixo faz o banco recusar isso.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_sku_norm
  ON produtos(UPPER(REPLACE(REPLACE(REPLACE(sku, ' ', ''), CHAR(9), ''), CHAR(160), '')));

-- ══════════════════════════════════════════════ histórico de vendas (CRM)
-- Espelho de `migracao-vendas-historico.sql`. Os dois caminhos — banco novo
-- pelo schema, banco existente pela migration — precisam chegar ao MESMO
-- lugar; `src/migracao-variantes-test.mjs` compara os dois e falha se
-- divergirem.
--
-- Por que o histórico não mora em `vendas`: a coluna `Nº` da planilha vai de
-- 1 a 1.341 sem repetir — ela identifica a LINHA, não o pedido. Uma cliente
-- aparece com 36 linhas na mesma data, e isso é acerto de maleta, não uma
-- compra de 36 peças. Escrever isso em `vendas` obrigaria a inventar um
-- `venda_id` por linha, e "1.341 vendas" entraria em todo relatório como se
-- fosse fato. Faturamento, peças, clientes e produtos saem exatos do item;
-- contagem de pedidos e ticket médio ficam indisponíveis por construção.
--
-- Nada aqui referencia `movimentos`: importar histórico NÃO movimenta estoque.
-- ══════════════════════════════════════════════════ 1. lotes de importação

-- Um lote por arquivo importado. É o que torna a importação idempotente e
-- auditável: o hash do conteúdo impede o mesmo arquivo de entrar duas vezes,
-- e o lote guarda a prestação de contas linha a linha.
CREATE TABLE IF NOT EXISTS vendas_historico_lotes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo_nome      TEXT NOT NULL,
  arquivo_hash      TEXT NOT NULL,          -- sha-256 do conteúdo normalizado
  linhas_total      INTEGER NOT NULL DEFAULT 0,
  linhas_importadas INTEGER NOT NULL DEFAULT 0,
  linhas_rejeitadas INTEGER NOT NULL DEFAULT 0,
  relatorio_json    TEXT,                   -- reconciliação contra a fonte
  status            TEXT NOT NULL DEFAULT 'importado'
                    CHECK (status IN ('importado', 'revertido')),
  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  revertido_em      TEXT
);

-- Idempotência de verdade: o MESMO arquivo não entra duas vezes enquanto o
-- lote dele estiver de pé. Reverter libera o hash para uma nova tentativa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vh_lotes_hash
  ON vendas_historico_lotes(arquivo_hash) WHERE status = 'importado';

-- ══════════════════════════════════════════════════════ 2. o item histórico

-- Duas metades em cada linha, e a fronteira entre elas é o contrato deste
-- arquivo:
--
--   *_original  → o que estava escrito na célula. Nunca interpretado,
--                 nunca corrigido, nunca apagado.
--   o resto     → a leitura. NULL sempre que não deu para ler com certeza.
--
-- NULL aqui é "não sei", jamais zero: 15 linhas não têm data utilizável e 9
-- não têm valor, e um zero nesses lugares afirmaria que a peça saiu de graça.
CREATE TABLE IF NOT EXISTS vendas_historico_itens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id       INTEGER NOT NULL REFERENCES vendas_historico_lotes(id),
  origem_linha  TEXT NOT NULL,              -- a coluna `Nº`, como TEXTO

  -- ─── cru, preservado
  data_original             TEXT,
  cliente_nome_original     TEXT,
  sku_original              TEXT,
  nome_produto_historico    TEXT,           -- como a peça era chamada NA ÉPOCA
  tipo_original             TEXT,
  preco_unit_original       TEXT,
  desconto_original         TEXT,           -- texto comercial, não número
  valor_total_original      TEXT,
  pagamento_original        TEXT,
  status_pagamento_original TEXT,
  observacao_original       TEXT,           -- a origem comercial, bruta

  -- ─── leitura
  data           TEXT,                      -- YYYY-MM-DD, ou NULL
  cliente_id     INTEGER REFERENCES clientes(id),
  cliente_nome_norm TEXT,
  sku            TEXT,                      -- TEXT: aceita `996055-2`
  sku_base       TEXT,                      -- `996055`, para casar com o catálogo
  tipo           TEXT,
  qtd            INTEGER,
  preco_unit     REAL,
  valor_total    REAL,
  desconto_valor REAL,                      -- só quando escrito explicitamente
  desconto_pct   REAL,
  desconto_rotulo TEXT,
  pagamento_forma TEXT,
  pagamento_parcelas INTEGER,
  pago           INTEGER,                   -- 1 | 0 | NULL (desconhecido)
  canal          TEXT,                      -- Maleta | Site | Mercado Biani | …
  contexto       TEXT,                      -- Feira Franceschini | Consórcio | …
  revendedora_nome TEXT,
  revendedora_id INTEGER REFERENCES revendedoras(id),

  -- ─── prestação de contas
  problemas_json TEXT,                      -- por que a linha não vira número
  pedido_chave   TEXT,                      -- a chave do agrupamento, legível
  venda_historica_id INTEGER REFERENCES vendas_historicas(id),
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A mesma linha do mesmo lote nunca entra duas vezes, nem sob concorrência.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vh_itens_idem
  ON vendas_historico_itens(lote_id, origem_linha);

CREATE INDEX IF NOT EXISTS idx_vh_itens_data    ON vendas_historico_itens(data);
CREATE INDEX IF NOT EXISTS idx_vh_itens_sku     ON vendas_historico_itens(sku_base);
CREATE INDEX IF NOT EXISTS idx_vh_itens_cliente ON vendas_historico_itens(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vh_itens_norm    ON vendas_historico_itens(cliente_nome_norm);
CREATE INDEX IF NOT EXISTS idx_vh_itens_canal   ON vendas_historico_itens(canal);
CREATE INDEX IF NOT EXISTS idx_vh_itens_venda   ON vendas_historico_itens(venda_historica_id);


-- ══════════════════════════════════════════ 4. vínculos que pedem revisão

-- O histórico traz 348 nomes distintos e nenhum telefone. Quando o nome do
-- arquivo se parece com um cliente já cadastrado mas não é prova, o vínculo
-- NÃO é feito: vira uma linha aqui, para alguém decidir.
--
-- Enquanto pendente, o item histórico fica com `cliente_id` nulo e continua
-- contando pelo nome normalizado — nenhum número se perde esperando decisão.
CREATE TABLE IF NOT EXISTS clientes_vinculo_revisao (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id       INTEGER REFERENCES vendas_historico_lotes(id),
  nome_original TEXT NOT NULL,
  nome_norm     TEXT NOT NULL,
  candidato_id  INTEGER REFERENCES clientes(id),
  candidato_nome TEXT,
  motivo        TEXT NOT NULL,
  linhas        INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'vinculado', 'separado')),
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  decidido_em   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cvr_unico
  ON clientes_vinculo_revisao(nome_norm, status) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_cvr_status ON clientes_vinculo_revisao(status);

-- Busca de cliente por nome/telefone normalizados. Não são únicos de
-- propósito: nome não é identidade, e duas "Camila" podem ser duas pessoas.
CREATE INDEX IF NOT EXISTS idx_clientes_nome_norm ON clientes(nome_norm);
CREATE INDEX IF NOT EXISTS idx_clientes_tel_norm  ON clientes(tel_norm);
CREATE INDEX IF NOT EXISTS idx_clientes_cpf_norm  ON clientes(cpf_norm);

-- ══════════════════════════════════════ vendas históricas RECONSTRUÍDAS

-- A camada DERIVADA do histórico: a venda, montada a partir das linhas da
-- planilha pela regra "mesmo cliente normalizado + mesma data = uma venda"
-- (`api/src/vendas-historicas.js`). O bruto continua em
-- `vendas_historico_itens`, intocado e auditável.
--
-- Esta tabela é descartável por construção: some inteira e é reconstruída
-- com o mesmo resultado, porque a regra é determinística. É por isso que ela
-- pode ser apagada e refeita sem cerimônia — e por isso que nada aqui é
-- fonte da verdade de coisa nenhuma.
--
-- Ela NÃO move estoque. Agrupar linhas que já existiam não cria nem consome
-- peça física; nenhuma coluna aqui referencia `movimentos`.
CREATE TABLE IF NOT EXISTS vendas_historicas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id   INTEGER NOT NULL REFERENCES vendas_historico_lotes(id),
  chave     TEXT NOT NULL,             -- `<nome normalizado>|<data>`

  -- 'venda' | 'ajuste'. Ajuste é o que a PLANILHA marca como não-venda
  -- (PERDIDO, ACHO QUE FOI VENDIDO, correção). Nunca se deduz do tamanho do
  -- grupo: 36 linhas no mesmo dia é uma compra de 36 peças, não um acerto.
  classe    TEXT NOT NULL DEFAULT 'venda' CHECK (classe IN ('venda', 'ajuste')),
  regra     TEXT NOT NULL,             -- qual regra formou este grupo, por extenso

  cliente_nome      TEXT,
  cliente_nome_norm TEXT,
  cliente_id        INTEGER REFERENCES clientes(id),
  data              TEXT,              -- YYYY-MM-DD, ou NULL

  itens       INTEGER NOT NULL DEFAULT 0,
  pecas       INTEGER NOT NULL DEFAULT 0,
  valor_total REAL,                    -- NULL se algum item não tem valor
  valor_pago  REAL NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'indefinida'
         CHECK (status IN ('paga', 'nao_paga', 'parcial', 'indefinida')),

  -- A definição de "pode entrar no ticket médio", numa coluna em vez de um
  -- WHERE repetido: paga por inteiro, com data, sem item de valor ignorado.
  elegivel_ticket INTEGER NOT NULL DEFAULT 0,

  canal    TEXT,
  contexto TEXT,
  observacao_original TEXT,
  origem_linhas TEXT NOT NULL DEFAULT '[]',   -- os `Nº` da planilha, em JSON

  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vh_vendas_chave
  ON vendas_historicas(lote_id, chave);
CREATE INDEX IF NOT EXISTS idx_vh_vendas_data    ON vendas_historicas(data);
CREATE INDEX IF NOT EXISTS idx_vh_vendas_norm    ON vendas_historicas(cliente_nome_norm);
CREATE INDEX IF NOT EXISTS idx_vh_vendas_cliente ON vendas_historicas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vh_vendas_canal   ON vendas_historicas(canal);
CREATE INDEX IF NOT EXISTS idx_vh_vendas_classe  ON vendas_historicas(classe, elegivel_ticket);
CREATE INDEX IF NOT EXISTS idx_vh_vendas_periodo ON vendas_historicas(classe, data, elegivel_ticket);

CREATE INDEX IF NOT EXISTS idx_vendas_cliente_norm ON vendas(cliente_nome_norm);
