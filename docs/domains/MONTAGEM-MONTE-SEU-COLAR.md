# Produtos Montáveis / Monte seu Colar

Decisão humana oficial de **10/09/2026**, com os SKUs confirmados pela
Sthefany. Esta é a fonte de negócio mais recente para o domínio; onde a
documentação antiga divergir, prevalece esta — e o §14 preserva o histórico das
decisões que foram substituídas.

O item 3 da Fase 4 está **liberado**: a última decisão de negócio foi fechada
em 10/09/2026 (§7).

## A regra de ouro

```
CONFIGURAÇÃO          define quantos Meninos/Meninas podem ser escolhidos
VENDA                 registra qual configuração comercial foi vendida
COMPONENTES ESCOLHIDOS  dizem o que fisicamente saiu
VENEZIANA             sai automaticamente em toda montagem

ESTOQUE FINANCEIRO    = somente componentes físicos reais
```

## 1. Os 11 SKUs confirmados

### 6 componentes físicos

Têm saldo, recebem movimento, entram no inventário, podem ter entrada de
compra e podem ir para maleta conforme a operação permitir.

| SKU | Nome oficial (decisão) | Preço | Grupo | Catálogo de produção |
|---|---|---|---|---|
| `263236` | Colar Menina Zircônia Rosa Claro Banho de Ouro 18k | 119 | Menina | existe · `Pingente` · qtd 5 · R$ 119 |
| `273470` | Colar Menina Zircônia Incolor Banho de Ouro 18k | 119 | Menina | existe · `Pingente` · qtd 5 · R$ 119 |
| `251551` | Colar Menino Zircônia Azul Banho de Ouro 18k | 119 | Menino | **AUSENTE** |
| `251552` | Colar Menino Zircônia Incolor Banho de Ouro 18k | 119 | Menino | **AUSENTE** |
| `329494` | Colar Menino Zircônia Verde Banho de Ouro 18k | 119 | Menino | **AUSENTE** |
| `444032` | Colar Veneziana 45cm com Extensor Banho de Ouro 18k | 74 | base fixa | **AUSENTE** |

Dois detalhes registrados sem ação, porque **nada foi associado por semelhança
de nome**:

- os dois que existem estão cadastrados como `Pingente ...`, e a decisão os
  nomeia `Colar ...`. O nome comercial **não muda**; o papel na mecânica é de
  componente físico, e isso já está dito aqui;
- o catálogo tem `455109` "Colar Veneziana 45cm Banho de Ouro 18k", R$ 74, com
  saldo 2 — mesmo preço, **sem extensor** no nome, código diferente. Não é
  `444032`. Os quatro ausentes precisam de cadastro e de saldo informado.

### 5 configurações comerciais

Identidade comercial real, preço próprio, podem ter foto/nome/publicação.
**Sem quantidade física independente, sem patrimônio próprio**, disponibilidade
derivada dos componentes.

| SKU | Nome | Preço | Fixo | Slots | Catálogo de produção |
|---|---|---|---|---|---|
| `326660` | Colar Casal | 129 | 1 × `444032` | 1 Menino + 1 Menina | existe · **qtd 1** · ativo |
| `364945` | Colar Filhas Duas Meninas | 129 | 1 × `444032` | 2 Menina | **AUSENTE** |
| `311066` | Colar Filhos Dois Meninos | 129 | 1 × `444032` | 2 Menino | **AUSENTE** |
| `314161` | Colar Filhos Dois Meninos e Uma Menina | 159 | 1 × `444032` | 2 Menino + 1 Menina | **AUSENTE** |
| `399872` | Colar Filhos Duas Meninas e Um Menino | 159 | 1 × `444032` | 2 Menina + 1 Menino | existe · qtd 0 · inativo |

Preço de venda **não** infere composição nem custo: R$ 119 e R$ 74 são preços
dos produtos físicos nos contextos deles; R$ 129 e R$ 159 são decisão comercial
da configuração. A observação anterior de que "o preço não fecha" está
**resolvida e descartada** como critério.

## 2. O que muda em relação à auditoria anterior

A composição é **por slot tipado**, não por SKU fixo. Isso invalida a
recomendação anterior deste documento de usar `kit_componentes`:

> `kit_componentes` tem chave primária `(kit_sku, componente_sku)`. Uma linha
> nomeia **um SKU**. Não existe forma de escrever "1 × qualquer coisa do grupo
> Menino" nela.

`kit_componentes` representa **apenas componente fixo**. Ela serve para a
Veneziana e para nada mais desta família — e, como se vê no §3, usá-la nem
para isso é seguro. **Recomendação: não reaproveitar `kit_componentes` no Monte
seu Colar.** Ela fica como está: mecanismo genérico de composição fixa, vazio,
sem uso e sem expansão.

Motivo concreto: uma linha em `kit_componentes` faz `saldosDoSku` devolver um
kit e `ehKit` devolver `true`. Isso daria a propriedade certa ("sem saldo
próprio") com dois efeitos errados — a disponibilidade seria calculada só sobre
a Veneziana, ignorando os slots, e a venda e o cancelamento passariam por
`movimentarKit`, que movimentaria **só a Veneziana**. São exatamente os
"mecanismos sobrepostos" a evitar.

## 3. Desenho técnico mínimo final

### 3.1 Componente fixo `444032` (pergunta 1)

Na coluna que já existe: `personalizacao_modelos.base_sku_padrao`.

```sql
-- já no schema, api/schema.sql:449
base_sku_padrao TEXT REFERENCES produtos(sku)
```

Quantidade implícita de 1, que é a regra ("uma Veneziana por montagem").
Passa a ser **obrigatória** para configuração montável, e o override
`corpo.baseSku` é **recusado** — a base não é escolha nesta versão.

Não vira tabela de componentes fixos. Se algum dia uma configuração precisar de
dois fixos, ou de 2 × o mesmo fixo, aí sim — e é proposta separada.

### 3.2 Grupos Menino e Menina (pergunta 2)

Na coluna que já existe: `personalizacao_opcoes.grupo`.

```sql
-- já no schema, api/schema.sql:464
modelo_id, componente_sku, variacao, variante_id, rotulo, grupo, ordem, ativo
```

Uma linha por (configuração, SKU elegível), com o grupo. Para o Casal são 5
linhas: 3 Menino e 2 Menina. Para Duas Meninas, 2 linhas.

Fica **por configuração**, não global, porque é o schema que já existe e porque
permite uma configuração futura restringir cores sem mexer nas outras. Custo:
~19 linhas para as cinco configurações.

Uma trava nova: o mesmo SKU não pode aparecer em dois grupos da mesma
configuração — senão o cálculo de disponibilidade do §3.6 deixa de valer.

### 3.3 Quantidade de slots por configuração (pergunta 3)

**É o único gap real.** Nenhuma tabela sabe hoje "2 Menino + 1 Menina".

Tabela nova, três colunas úteis:

```sql
CREATE TABLE personalizacao_slots (
  modelo_id INTEGER NOT NULL REFERENCES personalizacao_modelos(id),
  grupo     TEXT    NOT NULL,
  qtd       INTEGER NOT NULL CHECK (qtd > 0),
  ordem     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (modelo_id, grupo)
);
```

As cinco configurações, inteiras:

```
326660  Menino 1 · Menina 1
364945  Menina 2
311066  Menino 2
314161  Menino 2 · Menina 1
399872  Menina 2 · Menino 1
```

### 3.4 Tabelas reaproveitadas (perguntas 4, 5 e 6)

| Tabela | Papel no desenho final | Muda? |
|---|---|---|
| `personalizacao_modelos` | a configuração: nome, base fixa, preço, ativo | **+1 coluna** `sku_comercial` |
| `personalizacao_opcoes` | cardápio: quais SKUs são elegíveis em cada grupo | não |
| `personalizacao_slots` | quantos slots de cada grupo | **nova** |
| `venda_personalizacoes` | qual configuração foi vendida, e a base usada | não |
| `venda_personalizacao_itens` | quais componentes saíram, com variação e `movimento_id` | não |
| `kit_componentes` | composição fixa genérica — **fora** desta família | não |

A coluna que falta é decisiva para a pergunta 8: hoje o SKU comercial existe
**somente** na constante `MODELOS_CANONICOS` de `personalizacao.js`. Sem ela em
dado, cadastrar configuração nova exige deploy.

```sql
ALTER TABLE personalizacao_modelos ADD COLUMN sku_comercial TEXT REFERENCES produtos(sku);
```

### 3.5 `slotTipos`, `slots_min`, `slots_max` (pergunta 7)

Auditados como pedido. O veredito **não** é "complexidade antiga":
`slots_min`/`slots_max` são **insuficientes**.

```
326660  Casal          slots_min=2  slots_max=2
364945  Duas Meninas   slots_min=2  slots_max=2
```

Duas configurações diferentes, números idênticos. Um contador não distingue
`1 Menino + 1 Menina` de `2 Menina`. É por isso que o código precisou do array
`slotTipos` hard-coded ao lado: a informação que falta no banco está numa
constante `.js`.

`slotTipos` é a **ideia certa no lugar errado** — e é exatamente o que
`personalizacao_slots` passa a ser, em dado.

Proposta:

- `slotTipos` (constante) **sai**; vira linhas de `personalizacao_slots`;
- `slots_min` e `slots_max` **ficam** como colunas, sempre iguais a
  `SUM(personalizacao_slots.qtd)`, com um teste de gate cobrando a igualdade.
  Ficam porque são `NOT NULL` com `CHECK` no schema e porque o código e os
  testes existentes já validam o total de peças por elas — um segundo portão
  barato sobre o mesmo número;
- a **faixa** (`min < max`) deixa de ser usada: ela só existia para a
  composição livre, que sai. Com slots tipados, mín == máx sempre.

Alternativa considerada e descartada: `DROP COLUMN` nas duas. As tabelas estão
vazias, então seria seguro — mas não compra nada, e custa migration.

### 3.6 Disponibilidade (pergunta 10)

Derivada, nunca `produtos.qtd` do SKU comercial. Com a Veneziana como teto
comum:

```
disponível(configuração) = min(
    disponível(444032),
    para cada grupo G com k slots:  capacidade(G, k)
)
```

Os grupos são conjuntos de SKUs **disjuntos**, então a conta por grupo compõe
— é o que a trava do §3.2 garante.

Para `k = 1` (o Casal, em cada grupo) não há ambiguidade:

```
capacidade(G, 1) = Σ disponível(sku)   para sku em G
```

Para `k ≥ 2` vale a mesma fórmula, pela decisão de 10/09/2026 (§7):
**repetir a mesma cor é permitido**.

```
capacidade(G, k) = floor( Σ disponível(sku) / k )   para sku em G
```

Exemplo com Menino = Azul 3, Incolor 0, Verde 1 e Veneziana 10, para
`311066` Dois Meninos:

```
S = 4        floor(4 / 2) = 2
disponivel   min(10, 2)   = 2 colares

Azul + Azul   é venda válida
```

Nenhuma validação de cores distintas entra no código. A regra recusada era
`min(floor(S/2), S − max)`, que daria 1 colar para o mesmo estoque; fica
registrada aqui apenas como a alternativa descartada.

Duas configurações que compartilham um componente caem juntas
automaticamente, porque as duas derivam do mesmo saldo.

### 3.7 A venda (pergunta 9)

Sem mudança de schema e sem mudança de contrato HTTP.

```
venda_itens                       1 linha · sku 326660 · qtd 1 · R$ 129
                                  (identidade comercial)

venda_personalizacoes             sku_comercial 326660 · base_sku 444032
                                  base_variacao · base_variante_id · preco

venda_personalizacao_itens        1 linha por componente escolhido:
                                  componente_sku · variacao · variante_id
                                  · qtd · movimento_id

movimentos                        -1 × 444032   (base, automática)
                                  -1 × 251551   (escolha do slot Menino)
                                  -1 × 263236   (escolha do slot Menina)
                                  NADA em 326660
```

`venda_personalizacao_itens` já cumpre o papel pedido — guarda o SKU exato, a
variação, a variante e o id do movimento que baixou a peça. É o que torna
possível histórico, auditoria, estorno exato, estoque, sincronização e
Central de Pendências.

Validação na venda: a contagem de escolhas por grupo tem de ser **exatamente**
a de `personalizacao_slots`. Nem a mais (não existe quarto pingente), nem a
menos. Um SKU escolhido que não esteja em `personalizacao_opcoes` daquela
configuração, naquele grupo, é recusado.

Três proteções novas, porque a configuração não é peça:

1. vender o SKU comercial como **linha avulsa** é recusado — ele não tem saldo
   para baixar, e aceitar criaria a segunda camada patrimonial;
2. o SKU comercial **não entra em maleta** (mesma regra que já vale para kit);
3. o SKU comercial **fica fora do inventário** (idem) e a importação de
   catálogo não escreve saldo nele.

### 3.8 Cancelamento (pergunta 11)

Estorno exato, a partir de `venda_personalizacao_itens` — nunca "um Menino
qualquer":

```
+1 × 444032   com base_variacao e base_variante_id da venda
+1 × cada componente_sku gravado, com variacao e variante_id dele
```

Idempotência: `if (v.cancelada) return 409`, antes de qualquer movimento —
já é o comportamento de hoje.

**O defeito a corrigir.** A venda baixa a base com variação; o estorno devolve
sem:

```js
// api/src/vendas-comandos.js:532
movimentar(db, { sku: p.baseSku, tipo: 'cancelamento', quantidade: 1, ... })
//                                  ↑ sem variacao, sem varianteId
```

E `personalizacoesDeVendas` nem devolve `base_variante_id`, embora a coluna
exista e esteja gravada. O total fecha; a razão **por variação** não. §42 do
REGRAS.md diz "preservando a variante" — o código não cumpre para a base.
Correção e teste explícito fazem parte do item 3, e não dependem da decisão
pendente.

### 3.9 Cadastro de configuração nova, sem deploy (pergunta 8)

```
1. criar o produto            POST /api/produtos      SKU comercial, nome, preço
2. definir a configuração     POST /api/personalizacao/modelos
                                { skuComercial, baseSkuPadrao: '444032',
                                  slots:  [ { grupo: 'Menino', qtd: 3 } ],
                                  opcoes: [ { componenteSku, grupo, rotulo } ] }
```

"Três Meninos" passa a ser duas chamadas e zero deploy. As constantes
`MODELOS_CANONICOS` e `OPCOES_CANONICAS` deixam de ser regra em tempo de
execução e viram **seed** das cinco configurações confirmadas — dado inicial,
editável depois, não código consultado a cada venda.

Rotas já existem (`POST /api/personalizacao/modelos` é um dos 142 contratos);
o corpo ganha `skuComercial` e `slots`. Nenhum contrato é removido ou alterado
na forma da resposta.

### 3.10 Composição livre — sai (§5 da decisão)

`MONTE-COLAR` e o modelo `livre` saem do caminho de venda: a pessoa escolhe
primeiro uma configuração cadastrada, e ela determina quantos e quais slots.
Preço manual de composição sai com ele. O **produto** `MONTE-COLAR` não é
apagado — ver §4.

## 4. O 12º SKU (pergunta 13)

É **`MONTE-COLAR`**.

```
produtos: MONTE-COLAR · "Monte seu Colar — composição livre"
          qtd 0 · sem preço · INATIVO · 0 movimentos · fora da loja
```

Classificação: **legado / não confirmado nesta decisão.** Era o SKU comercial
interno da composição livre. Não é apagado nem incorporado: o produto fica
como está, inativo, e o caminho de código que o usava é removido.

### Fora do escopo confirmado, registrado sem associação

Encontrados no catálogo de produção, **não** incorporados:

| SKU | Nome | Saldo | Por que está fora |
|---|---|---|---|
| `366066` | Colar Filhos Três Meninos Banho de Ouro 18k | 1 | **é 18k e parece configuração**, mas não está nos 11 confirmados |
| `453324` | Colar Casal Filhos Azul e Rosa Prata 925 | 1 | Prata 925 · publicado na loja com estoque 1 |
| `637629` | Colar Casal Menina Rosa e Menino Azul Prata 925 | 1 | Prata 925 |
| `424442` | Colar Casal de Filhos com Coração Cravejado 45cm Prata 925 | 1 | Prata 925 |
| `458893` | Colar Coração Casal de Filhos Azul e Rosa 18k | 1 | 18k, fora da lista |
| `762844` | Colar Coração e Casal Cravejado Banho de Prata | 1 | prata · 1 un. na maleta 13 |
| `455109` | Colar Veneziana 45cm Banho de Ouro 18k | 2 | **não é** `444032` · sem extensor no nome |

Conjunto separado, a validar em outro momento. Nada de Ouro foi derivado para
Prata nem o contrário.

## 5. Os saldos legados (pergunta 12)

Três configurações confirmadas ainda não existem no catálogo; duas existem, e
uma delas tem saldo:

| SKU | Estado em produção | O que falta |
|---|---|---|
| `326660` | qtd **1** · `entrada +1` de importação · `consignacao 0` para a **maleta 12, ABERTA** | resolver o saldo e a maleta |
| `399872` | qtd 0 · inativo · 0 movimentos | ativar |
| `364945` `311066` `314161` | ausentes | cadastrar |

**Nada destrutivo, e nada sem nova aprovação.** O plano, em ordem:

1. **cadastrar** os 4 componentes físicos ausentes (`444032`, `251551`,
   `251552`, `329494`) com o saldo que a Sthefany informar — entrada por
   movimento, como qualquer peça nova;
2. **cadastrar** as 3 configurações ausentes com `qtd 0`;
3. **definir** as cinco configurações (slots + cardápio), via a rota do §3.9;
4. **resolver a maleta 12 antes de tocar em `326660`.** Existe uma peça física
   com esse código na mão de uma revendedora. Enquanto a maleta estiver aberta,
   o saldo 1 tem contrapartida física e não é erro de cadastro — é item de
   acerto. Duas saídas possíveis, e a escolha é da operação: a peça volta no
   acerto, ou ela é vendida como está;
5. **só então** o saldo de `326660` vai a zero — por **movimento de `ajuste`
   assinado** via `estoque.js › movimentar`, com `obs` dizendo que o código
   passou a ser configuração comercial. Nenhum `UPDATE produtos SET qtd`,
   nenhum movimento apagado, a razão fecha antes e depois;
6. o ajuste do passo 5 é **decisão de inventário** e pertence ao item 4 da
   Fase 4 — ver
   [HISTORICO-INCOMPLETO-E-INVENTARIO.md](HISTORICO-INCOMPLETO-E-INVENTARIO.md).
   Ele não entra no item 3.

Consequência prática: o item 3 entrega o **mecanismo**, com as cinco
configurações cadastráveis e `PERSONALIZACAO_ATIVA` ainda `false`. A limpeza
do saldo de `326660` é um passo operacional posterior, com aprovação própria.

## 6. O que o item 3 vai provar

| Proteção | Teste |
|---|---|
| configuração não soma estoque patrimonial | falha se configuração com slots tiver `qtd != 0` |
| sem saldo físico independente | `saldosDoSku` de configuração ignora `produtos.qtd` |
| disponibilidade deriva dos componentes | §3.6, incluindo a Veneziana como teto |
| venda registra a identidade comercial | uma linha em `venda_itens`, com o SKU da configuração |
| estoque baixa só componentes | nenhum movimento no SKU comercial |
| Veneziana sai em toda montagem | sem ela no catálogo, a venda é recusada |
| slots respeitados exatamente | 4 escolhas numa configuração de 3 é 409 |
| SKU fora do cardápio do grupo | 409, dizendo qual grupo |
| cancelamento restaura o exato | saldo **por variação** antes == depois, base incluída |
| idempotência | cancelar duas vezes não devolve duas vezes |
| concorrência | duas configurações no mesmo carrinho disputando o mesmo pingente |
| configuração não entra em maleta nem em inventário | recusa explícita |
| vender configuração como linha avulsa | recusado |
| nenhuma escrita direta em `produtos.qtd` | [scripts/razao-estoque.test.mjs](../../scripts/razao-estoque.test.mjs) |
| 142 contratos HTTP | [scripts/api-contracts.test.mjs](../../scripts/api-contracts.test.mjs) |
| normalização única de SKU | [scripts/sku-normalizacao.test.mjs](../../scripts/sku-normalizacao.test.mjs) |

## 7. A cor pode repetir — decidido

Decisão humana de **10/09/2026**:

> Numa configuração com dois slots do mesmo grupo — Dois Meninos, Duas
> Meninas, e os dois de três filhos — a Sthefany **pode escolher a mesma cor
> duas vezes**. Azul + Azul é uma venda válida.

Consequências diretas:

- disponibilidade é `floor(Σ disponível do grupo / k)`, sem descontar
  concentração numa cor (§3.6);
- **nenhuma validação de distinção entra na venda**: o que o cardapio do grupo
  permite, dois slots do mesmo grupo também permitem;
- a regra vale para qualquer `k`. Uma configuração futura de três slots no
  mesmo grupo herda a mesma fórmula, sem decisão nova.

O que continua valendo sem depender disto: a contagem por grupo é **exata**
(nem a mais nem a menos), e o SKU escolhido tem de estar no cardápio daquele
grupo naquela configuração.

## 8. Histórico documental das decisões

Preservado como pedido. Nada aqui é regra vigente.

| Data | Decisão | Estado |
|---|---|---|
| 06/09/2026 | base Veneziana 45 cm **com possibilidade de trocar a base** | **revogada** em 10/09 — a base não é escolha nesta versão |
| 06/09/2026 | arquitetura genérica para pulseiras, berloques e outros montáveis | **revogada** em 10/09 — sem motor genérico |
| 06/09/2026 | `PERSONALIZACAO_ATIVA` desligado (`1ca62f6`) antes de fechar SKU × base × componentes | **vigente** — continua `false` |
| 10/09/2026 | configuração comercial teria saldo físico próprio, com `-1 configuração + -1 veneziana` | **substituída** no mesmo dia: configuração não tem saldo |
| 10/09/2026 | auditoria recomendou reaproveitar `kit_componentes` | **substituída** — ver §2: não representa slot |
| 10/09/2026 | autorizada a remoção de `slotTipos`/`slots_min`/`slots_max` | **revogada** — ver §3.5: slot é necessidade real do negócio |
| 10/09/2026 | composição livre (`MONTE-COLAR`) como exceção | **encerrada** — §5 da decisão: não existe "monte qualquer coisa" |

§42 do [api/REGRAS.md](../../api/REGRAS.md) descreve o modelo de 06/09 e fica
desatualizado em dois pontos — base trocável e composição livre. A atualização
dele entra com a implementação do item 3, não antes: REGRAS.md descreve o que o
código faz.
