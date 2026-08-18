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

`venda_itens.motivo` registra o porquê da saída (§8).

### `produto_variacoes`
O aro do anel, o comprimento da corrente. Ninguém digita esta tabela: quem
preenche é a sincronização, lendo o que a Nuvemshop declara — e ela é
**apagada e regravada inteira** a cada rodada, porque a loja é a fonte da
verdade sobre quais variações existem. Nenhum histórico se perde nisso: o
saldo mora em `movimentos`.

PK `(sku, nome)`. `variante_id` e `produto_id` são os ids da Nuvemshop,
necessários para endereçar a caixinha certa no empurrão de estoque.

Diferente do kit, um código com variações **mantém saldo próprio**:
`produtos.qtd` continua sendo o total do código, e as variações repartem
esse total.

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

## Índices que importam

| Índice | Por quê |
|---|---|
| `idx_vendas_externo` (**UNIQUE**) | Idempotência dos pedidos do site. Remover isto quebra a integração |
| `idx_mov_sku`, `idx_mov_criado` | Histórico de um SKU e leitura por período |
| `idx_variacoes_sku`, `idx_kit_componentes` | Montagem do state |

## Diagrama de referências

```
categorias ──< produtos ──< movimentos
                  │  ├──< maleta_itens >── maletas >── revendedoras
                  │  ├──< venda_itens  >── vendas   >── clientes
                  │  ├──< inventario_itens >── inventarios
                  │  ├──< produto_variacoes
                  │  └──< kit_componentes (kit_sku e componente_sku)
config          (avulsa)
loja_snapshot   (avulsa, 1 linha)
sync_execucoes  (avulsa)
```
