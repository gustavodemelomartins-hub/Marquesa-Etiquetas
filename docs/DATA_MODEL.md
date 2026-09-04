# Modelo de dados

Cloudflare D1 (SQLite). Fonte da verdade: [api/schema.sql](../api/schema.sql).
Este documento explica o **porquê** de cada tabela; o schema explica o **quê**.

> As justificativas de negócio por trás destas escolhas estão em
> [api/REGRAS.md](../api/REGRAS.md). Não duplicá-las aqui é proposital.

## A invariante central

```
produtos.qtd == SUM(movimentos.qtd)     para todo SKU
```

`movimentos` é a razão contábil; `produtos.qtd` é só o saldo materializado
para leitura rápida. `GET /api/estoque/conferir` prova a igualdade a
qualquer momento e devolve as linhas que não fecharem.

Consequência prática: **nunca escreva `produtos.qtd` diretamente.** Todo
caminho passa por `estoque.js › movimentar`, que grava o movimento e ajusta
o saldo no mesmo `db.batch()`.

## Fonte da verdade do físico — TEMPORÁRIA

Enquanto o inventário interno não for controlado definitivamente pelo
sistema (ver [ROADMAP_RECONCILIATION.md](ROADMAP_RECONCILIATION.md)), a
planilha de Estoque Total mantida pela Stéfane é a fonte máxima da verdade
para a **quantidade física total** de cada SKU — não para o resto:

| Pergunta | Responde | Onde |
|---|---|---|
| Quanto existe no total (casa + maletas) de um SKU? | **A planilha da Stéfane**, enquanto isso for verdade | `produtos.qtd`, reconciliado via `planilha_estoque_total` |
| Quanto está em casa × com qual revendedora? | O sistema | `maletas` / `maleta_itens` |
| O que mudou e por quê? | O sistema | `movimentos` (sempre a razão) |
| Quanto está disponível para a Nuvemshop? | O sistema, **derivado** | `total − consignado`, nunca lido direto da planilha |
| Cadastro e variações da loja | A Nuvemshop | `sync.js`, `produto_variacoes` |

A planilha nunca autoriza mexer em maleta: se o total que ela informa é
menor do que já está registrado com revendedoras, isso é uma contradição de
dados (`total_menor_que_consignado`), não uma instrução para redistribuir
ou apagar consignação em silêncio — ver
[RECONCILIATION_ENGINE.md § Fonte da verdade](RECONCILIATION_ENGINE.md).

Esta prioridade é temporária por definição: quando o inventário interno
(hoje já existe como conferência — `inventarios`/`inventario_itens` — mas
não é aplicado automaticamente, §3 de `api/REGRAS.md`) passar a ser
controlado com confiança suficiente, ele poderá substituir a planilha como
fonte da verdade física. Não é uma regra eterna, é o que vale **hoje**.

## Tabelas

### `categorias`
`nome` (PK), `ordem`, `cor`. Configuráveis (§4). Nove entram por
`INSERT OR IGNORE` no schema. `produtos.cat` referencia esta tabela.

### `produtos`
O catálogo. `sku` é a chave primária, sempre em maiúsculas e sem espaço em
volta.

| Coluna | Nota |
|---|---|
| `preco` | `NULL` significa **sem preço**, nunca R$ 0 (§24). Venda é bloqueada |
| `qtd` | Estoque TOTAL, **inclui o consignado**. Saldo materializado |
| `status` | `ativo` \| `inativo` |
| `url_loja`, `estoque_loja`, `visivel`, `nome_loja` | Retrato da loja, reescrito a cada rodada de sincronização |

Um SKU com linha em `kit_componentes` é um kit: `qtd` dele fica sempre 0 e
ele nunca recebe movimento próprio.

### `movimentos`
A razão. Responde "por que o estoque deste SKU mudou?" (§18).

`qtd` é o efeito **assinado** no estoque total:

| Tipo | Efeito |
|---|---|
| `entrada` | +1 × quantidade |
| `venda`, `perda`, `quebra`, `dano`, `furto`, `brinde`, `troca`, `nota_credito`, `venda_conjunto` | −1 × quantidade |
| `consignacao`, `devolucao` | **0** — a peça mudou de lugar, não de dono (§5.3) |
| `ajuste`, `cancelamento` | o sinal vem no próprio valor informado |

`origem`: `importacao`, `manual`, `maleta`, `acerto`, `venda`, `site`,
`inventario`, `cancelamento`, `kit`, `variacao`.

`variacao` é **coluna**, não tabela paralela de saldo. É o que mantém a
invariante valendo sem exceção: o saldo de uma variação é a mesma soma com
um filtro a mais, e não uma segunda contabilidade que possa desencontrar.
`NULL` na imensa maioria dos movimentos.

### `revendedoras`
Nunca excluída (§28): sai de circulação com `status='inativa'`.

### `maletas` / `maleta_itens`
Consignação. `maletas.status`: `aberta` | `em_acerto` | `encerrada` |
`cancelada`. `em_acerto` é estado no banco, não tela aberta — dá para
começar a conferência no celular e terminar no computador.

`maleta_itens.preco_envio` **congela** o preço do momento do envio (§6.1):
sem isso, reajustar um preço mudaria o valor de toda maleta já enviada.
`devolvida` conta quantas voltaram; `enviada − devolvida = não devolvida`,
e o não devolvido vira venda de verdade com `vendas.origem='acerto'` (§9).

Consignado de um SKU = soma de `qtd − devolvida` nas maletas `aberta` ou
`em_acerto`. É o que separa "total" de "em casa".

### `clientes`
`id`, `nome`, `tel`. Cadastro leve para a venda de balcão.

### `vendas` / `venda_itens`
Balcão, acerto e site na **mesma tabela** (§9), separados por `origem`:
`balcao` | `acerto` | `site`. É o que permite pedir "as vendas do dia" e
receber tudo.

`cancelada` marca em vez de apagar (§28). `externo_id` guarda a identidade
do pedido lá fora (`nuvemshop:1234`); o índice **único**
`idx_vendas_externo` é a trava de idempotência — do banco, não da lógica.
No SQLite vários `NULL` convivem num índice único, então as vendas normais
passam e só o mesmo pedido do site duas vezes é recusado.

`nuvemshop_status`, `nuvemshop_erro` e `nuvemshop_em` tornam a publicação do
estoque observável e retomável. Venda de balcão e acerto começam como
`pendente`; depois ficam `sincronizada`, `revisao` ou `erro`. Venda antiga
recebe `nao_enviada` e é regularizada quando uma publicação absoluta segura
confirma o saldo atual.

`venda_itens.motivo` registra o porquê da saída (§8). `variacao` e
`variante_id` congelam a caixinha exata da Nuvemshop que saiu: um SKU com
mais de uma variação não pode ser enviado sem isso.

No acerto, todos os itens `vendida` pertencem à mesma venda ligada a
`revendedora_id` e `maleta_id`. Nenhum pedido é criado na Nuvemshop: essas
peças já estavam fora do estoque online desde a criação da maleta, portanto
o acerto não pode baixá-las novamente. A publicação apenas envia o saldo
absoluto atual; as devolvidas voltam para o estoque online.
Perda, quebra, dano e brinde continuam movimentos físicos com o motivo real.

**§30 — as duas datas.** `data` é o dia da venda e é imutável: governa o
histórico do dia e a contagem de vendas, peças e clientes. `data_pagamento`
é o dia em que o dinheiro entrou e governa o **faturamento**. `pago` diz se
entrou; `observacao` guarda o texto livre do fechamento ("Maleta", "Feira",
"Grupo VIP").

As três nasceram com o valor que o sistema já assumia — paga, no dia da
venda — para que a migration não movesse faturamento existente de mês.
`idx_vendas_pagamento` e `idx_vendas_pago` existem pelo mesmo motivo que
`idx_vendas_data`: o recorte de período agora consulta as duas colunas.

### `saidas_sem_faturamento`
§31. Brinde, uso próprio e diferença de inventário. Elas **não** estão em
`vendas`, e isso é a regra, não a organização: a linha que não está em
`vendas` é invisível por construção para toda soma de venda. Pendurá-las
numa venda obrigaria cada consulta de faturamento a lembrar de excluí-las.

`tipo` é `brinde | uso_proprio | perda`; `sentido` é `saida` por padrão e só
`perda` pode ser `entrada` (a sobra de uma contagem). `movimento_id` amarra
a linha ao movimento que baixou o estoque — a razão contábil continua
fechando sem exceção.

Corrigir é **estornar**: `estornada`, `estorno_em`, `estorno_motivo` e
`estorno_movimento_id`. A linha nunca é apagada.

`historico_item_id` com índice único parcial é a trava que impede a auditoria
histórica de baixar o mesmo estoque duas vezes se rodar de novo.

### `historico_reclassificacao`
§35. Diz que uma linha da planilha **não é venda**, sem apagá-la (§7). As
somas comerciais passam a ignorá-la pelo mesmo mecanismo que já ignoravam a
linha excluída por uma operação histórica. `status` é `proposta | aplicada |
recusada`; `confianca` e `motivo` viajam junto para a decisão ser auditável
depois. Índice único por `historico_item_id`: uma linha tem uma decisão.

### `garantias` / `garantia_eventos` / `garantia_trocas` / `feriados`
§32. A garantia pertence ao **item** da compra. A identidade é
`(venda_id, sku, variante_id)` do lado operacional — `venda_itens` não tem
chave própria, e `rowid` não sobrevive a um VACUUM — e
`vendas_historico_itens.id` do lado da planilha. `valor_pago_original` é o
que ela **pagou**, não o de tabela: é a base da diferença de uma troca.

`garantia_eventos` é a linha do tempo, e evento novo **não** sobrescreve o
anterior. `garantia_trocas` tem índice único por `garantia_id`: dois cliques
no botão não baixam duas peças novas.

`diferenca_status` vale `nenhuma | a_receber | paga | pendente_regra`. O
último é a diferença **negativa** — peça nova mais barata: crédito ou
reembolso nunca foi definido como regra, então o sistema registra e para.

`feriados` existe para o feriado não nascer espalhado em `if` pelo código.
Vazia, o cálculo de dias úteis usa só sábado e domingo — e diz isso em
`consideraFeriados: false` em vez de fingir precisão.

### `historico_operacoes` / `historico_operacao_vendas`

`vendas_historicas` é uma projeção descartável da planilha. Estas duas
tabelas guardam o que não pode ser reconstruído por texto: o papel daquela
operação (`cliente`, `acerto` ou `revisao`), os valores documentais do acerto,
o estado atual da cobrança e quais vendas operacionais são somente outra
representação da mesma venda histórica.

Cada mudança de cobrança cria uma nova `versao` e substitui a anterior. O
índice parcial mantém uma única versão ativa por `venda_chave`; outro índice
impede que a mesma `vendas.id` seja ocultada como duplicata duas vezes.
Pagamento e prazo são financeiros e nunca escrevem em `produtos` ou
`movimentos`.

### `produto_variacoes`
O aro do anel, o comprimento da corrente. Ninguém digita esta tabela: quem
preenche é a sincronização, lendo o que a Nuvemshop declara — e ela é
**apagada e regravada inteira** a cada rodada, porque a loja é a fonte da
verdade sobre quais variações existem. Nenhum histórico se perde nisso: o
saldo mora em `movimentos`.

PK `(sku, nome)`, mas a IDENTIDADE é `variante_id`, garantida pelo índice
único `idx_variacoes_variante`. A diferença importa: `nome` ("16",
"Dourado · Zircônia") é dado da loja e muda quando ela renomeia um valor ou
troca a ordem dos atributos. O id não muda. Casar por nome fechava a conta
do total e escrevia zero em cada caixinha — ver
[SYNC_ENGINE.md](SYNC_ENGINE.md) § 3.

`valores_json` guarda os atributos **já resolvidos em pares**, e é o que
permite atributo dinâmico:

```json
[{"atributo":"Banho","valor":"Ródio"},{"atributo":"Pedra","valor":"Zircônia"}]
```

A coluna `atributo` continua existindo com os nomes concatenados porque é o
que a tela legada lê. `preco`, `promocional`, `variante_sku` e `imagem_url`
são o resto do que a loja declara por variante.

Diferente do kit, um código com variações **mantém saldo próprio**:
`produtos.qtd` continua sendo o total do código, e as variações repartem
esse total.

### `loja_variantes`
O espelho COMPLETO do catálogo da Nuvemshop: uma linha por variante,
inclusive as de produto que não existe aqui e inclusive produto de variante
única. Preenchida por `POST /api/loja/variantes/importar`, que só faz GET na
loja e só escreve nesta tabela.

Não confundir com `produto_variacoes`. São camadas diferentes de propósito:

| | `loja_variantes` | `produto_variacoes` |
|---|---|---|
| o que é | fato da loja | decisão nossa |
| chave | `variante_id` | `(sku, nome)` + único em `variante_id` |
| FK para `produtos` | **não tem** — precisa caber o que não é nosso | tem |
| cobre | catálogo inteiro | só código nosso com 2+ variações |

Sem FK de propósito: variante cujo SKU não é nosso é justamente o que a
revisão humana precisa enxergar. A tabela não é esvaziada antes de recarregar
— cada linha leva o carimbo `lido_em` da rodada e some no fim o que não foi
visto, para o espelho nunca ficar vazio no meio do caminho.

### `sku_reservas`
Um código gerado por `POST /api/produtos/sku/gerar` fica reservado aqui até
virar produto ou até `expira_em` passar. É a chave primária desta tabela que
decide o empate quando duas pessoas geram ao mesmo tempo: sem ela as duas
chamadas leriam o mesmo "maior código atual" e devolveriam o mesmo número.

### `kit_componentes`
Peça publicada como mais de um anúncio: "Colar Casal de Filhos"
(corrente + dois pingentes) que também vende como "Colar Filho(a)" avulso.

PK `(kit_sku, componente_sku)`, com `qtd` = unidades do componente por kit.

```
disponivel(kit) = min sobre os componentes de
                  floor(disponível do componente / qtd necessária)
```

Esse mínimo é **compartilhado**: dois kits que usam a mesma peça disputam o
mesmo número, e vender um derruba o outro na mesma hora. Kit não entra em
maleta e fica fora do inventário — limites de escopo deliberados.

### `inventarios` / `inventario_itens`
A conferência física do que está **em casa** (o consignado é descontado do
esperado). Status: `aberto` | `concluido` | `cancelado`.

Contar e corrigir são **dois atos separados** (§19): `concluir` só compara e
devolve a diferença; `ajustar` grava um movimento `ajuste` com origem
`inventario` e a frase do motivo, um código por vez, e recusa ajustar duas
vezes o mesmo código (`ajustado = 1`).

`inventario_itens.esperado` é congelado no fechamento, pelo mesmo motivo do
`preco_envio`: um inventário que mudasse de resultado depois de fechado não
serviria para nada.

Código bipado fora do catálogo não cabe em `inventario_itens` (a chave
estrangeira o recusaria, e com razão). Fica em
`inventarios.desconhecidos_json`, para a tela poder mostrá-lo (§22).

### `config`
`chave` (PK) → `valor` como JSON em texto. Guarda tanto parâmetro de negócio
quanto estado do robô:

| Chave | Para quê |
|---|---|
| `faixas` | Faixas de comissão |
| `prazoDias`, `prataPct`, `inventarioDias` | Parâmetros do acerto e do inventário |
| `syncUltimoPedido` | Marca d'água da leitura de pedidos (com 6 h de folga para trás) |
| `syncUltimoEstoque` | Quando o último empurrão foi aplicado |
| `syncLimiteMudancas` (40), `syncLimiteZerar` (15) | Os freios de segurança |
| `lojaVariacoes` | Códigos que a rodada decidiu não empurrar, e por quê |

### `loja_snapshot`
Uma linha só (`CHECK (id = 1)`). O retrato da loja da **última rodada**:
quantos produtos existem lá, quantos casaram com o catálogo, quantos só
existem lá, e a lista de duplicados. Escrito por
`sync.js › gravarRetratoDaLoja`, inclusive em rodada seca ou pausada.

### `sync_execucoes`
Histórico de cada rodada: `status` (`rodando` | `ok` | `pausado` | `erro`),
contadores e o relato inteiro em `detalhe_json`. É o que responde "o que o
robô fez de madrugada?" sem depender de log de servidor.

`seco` (INTEGER, 1 = rodada seca) é gravado no INSERT, não derivado do
relato — funciona mesmo enquanto a linha ainda é `'rodando'`. `resumoSync`
filtra por `seco = 0` para responder a saúde operacional: uma análise
bem-sucedida não pode fazer uma falha real desaparecer da tela
([TECH_DEBT.md](TECH_DEBT.md) item 12).

### `reconciliacao_sessoes` / `reconciliacao_itens`

**Ainda não aplicadas em banco nenhum** — nem local, nem produção. O schema
existe e está fechado (migration em
[api/migracao-reconciliacao.sql](../api/migracao-reconciliacao.sql)), mas a
aplicação (Apply) que vai escrever nelas de verdade ainda não foi
construída. Explicação completa, com a máquina de estados das duas tabelas
e o que cada campo guarda, em
[RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md) — não repetida aqui
para as duas versões não desencontrarem.

Resumo: `reconciliacao_sessoes` é uma rodada de análise; `reconciliacao_itens`
é uma linha por mudança proposta, com `de` (valor observado no destino),
`para` (valor proposto) e `base_json` (o estado interno que produziu
`para` — a peça que faltava para detectar uma prévia ficando obsoleta pelos
dois lados, não só um).

## Índices que importam

| Índice | Por quê |
|---|---|
| `idx_vendas_externo` (**UNIQUE**) | Idempotência dos pedidos do site. Remover isto quebra a integração |
| `idx_mov_sku`, `idx_mov_criado` | Histórico de um SKU e leitura por período |
| `idx_variacoes_sku`, `idx_kit_componentes` | Montagem do state |
| `idx_variacoes_variante` (**UNIQUE**) | Uma variante da loja tem no máximo um dono aqui. É o que torna o casamento por `variant_id` garantia do banco, e não boa intenção do código |
| `idx_produtos_sku_norm` (**UNIQUE**, expressão) | SKU único **de fato**: `produtos.sku` já era PK, mas `br1234` entrava ao lado de `BR1234`. A expressão do índice tem de ser repetida caractere por caractere na consulta (`sku.js › SQL_NORM`), senão o SQLite não o usa |
| `idx_rec_sessoes_revisao_unica` (**UNIQUE**, parcial) | No máximo uma sessão `revisao` por origem |
| `idx_rec_itens_unico` (**UNIQUE**) | Identidade de um item dentro da sessão — inclusive com `variacao IS NULL` |

## Diagrama de referências

```
categorias ──< produtos ──< movimentos
                  │  ├──< maleta_itens >── maletas >── revendedoras
                  │  ├──< venda_itens  >── vendas   >── clientes
                  │  ├──< inventario_itens >── inventarios
                  │  ├──< produto_variacoes
                  │  └──< kit_componentes (kit_sku e componente_sku)
config                    (avulsa)
loja_snapshot             (avulsa, 1 linha)
loja_variantes            (avulsa — espelho da loja, SEM FK de propósito)
sku_reservas              (avulsa)
sync_execucoes            (avulsa)
reconciliacao_sessoes ──< reconciliacao_itens     (schema pronto, não aplicado)
vendas_historico_lotes ──< historico_operacoes ──< historico_operacao_vendas
produtos ──< saidas_sem_faturamento >── movimentos   (§31, saída que não é venda)
vendas_historico_itens ──< historico_reclassificacao (§35, "isto não era venda")
vendas ──< garantias ──< garantia_eventos            (§32, por ITEM da compra)
garantias ──< garantia_trocas >── produtos           (a peça NOVA da troca)
feriados                  (avulsa — o prazo em dias úteis)
```
