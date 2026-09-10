# Produtos Montáveis / Monte seu Colar — auditoria final antes do item 3

Auditoria de **10/09/2026**, Fase 4 item 3. **Nada foi implementado.**
Substitui o levantamento anterior deste arquivo: a decisão humana de
10/09/2026 respondeu a pergunta que estava aberta (§6.1 da versão anterior).

## A regra oficial

```
SKU comercial      = o que foi vendido
SKU/componente     = o que realmente existe e saiu da gaveta
Composição         = a regra que conecta os dois

ESTOQUE FINANCEIRO = somente aquilo que fisicamente existe
```

Uma configuração comercial montável **pode** ter SKU, nome, preço, foto,
aparecer na tela e na venda — e **não pode** ter saldo físico próprio nem
somar valor patrimonial. A disponibilidade dela é derivada dos componentes.

## 1. SKUs e configurações documentados

Origem: constantes de [`personalizacao.js`](../../api/src/personalizacao.js) e
§42 do [api/REGRAS.md](../../api/REGRAS.md). A coluna de produção foi medida no
dump de 10/09/2026, somente leitura.

| Papel documentado | SKU | Nome documentado | Catálogo de produção |
|---|---|---|---|
| Base física | `444032` | Colar Veneziana | **AUSENTE** |
| Componente | `263236` | Menina rosa claro | `Pingente`, qtd 5, R$ 119 |
| Componente | `273470` | Menina incolor | `Pingente`, qtd 5, R$ 119 |
| Componente | `251551` | Menino azul | **AUSENTE** |
| Componente | `251552` | Menino incolor | **AUSENTE** |
| Componente | `329494` | Menino verde | **AUSENTE** |
| Configuração | `326660` | Colar Casal | `Colar`, **qtd 1**, R$ 129, ativo |
| Configuração | `364945` | Duas meninas | **AUSENTE** |
| Configuração | `311066` | Dois meninos | **AUSENTE** |
| Configuração | `314161` | 2 meninos + 1 menina | **AUSENTE** |
| Configuração | `399872` | 2 meninas + 1 menino | `Colar`, qtd 0, R$ 129, inativo |
| Composição livre | `MONTE-COLAR` | composição livre | qtd 0, sem preço, inativo |

**7 dos 12 não existem no catálogo de produção.** Conforme a decisão, eles
**não são descartados**: continuam sendo a identidade comercial da família,
esperando o cadastro a ser informado.

## 2. Quais são claramente componentes físicos

Existem, têm saldo, entram no inventário e no valor do estoque:

| SKU | Nome | Saldo | Preço | Papel |
|---|---|---|---|---|
| `263236` | Pingente Menina Zircônia Rosa Claro 18k | 5 | 119 | componente documentado |
| `273470` | Pingente Menina Zircônia Incolor 18k | 5 | 119 | componente documentado |
| `455109` | Colar Veneziana 45cm Banho de Ouro 18k | 2 | 74 | **candidato a base** · publicado na loja · 1 un. na maleta 13 |
| `453578` | Colar Veneziana 0.80 com Bolinhas 18k | 3 | 89 | outra veneziana física |
| `926220` | Pingente Menino Zircônia Incolor 18k | 1 | 74 | **candidato** a `251552` |

Os três componentes menino documentados (azul, incolor e verde da linha
Zircônia) **não existem** com esses códigos. O catálogo tem uma linha
*Cravejado* paralela (`718221` azul, `222908` e `640509` verde, `718220` e
`640508` em prata) que **não** é a mesma linha comercial. Nenhuma associação
foi feita.

**A base `444032` não tem substituto decidido.** `455109` é o único "Colar
Veneziana 45cm" do catálogo e bate com a decisão de 06/09 ("Base Veneziana
45 cm"), mas isso é semelhança de nome, não identidade provada.

## 3. Quais são claramente configurações comerciais

Pelo documento: `326660`, `364945`, `311066`, `314161`, `399872` e
`MONTE-COLAR`.

**Pelos dados de produção, não.** Ver §11 — é a contradição que trava.

O catálogo tem ainda estas, que ninguém mapeou como configuração e que
confirmam que existe **mais de um "Colar Casal"**:

| SKU | Nome | Saldo | Preço | Na loja |
|---|---|---|---|---|
| `453324` | Colar Casal Filhos Azul e Rosa Prata 925 | 1 | 209 | **publicado**, estoque 1 |
| `637629` | Colar Casal Menina Rosa e Menino Azul Prata 925 | 1 | 210 | não |
| `424442` | Colar Casal de Filhos com Coração Cravejado 45cm Prata 925 | 1 | 219 | não |
| `458893` | Colar Coração Casal de Filhos Azul e Rosa 18k | 1 | 169 | não |
| `762844` | Colar Coração e Casal Cravejado Banho de Prata | 1 | 119 | 1 un. na maleta 13 |
| `366066` | Colar Filhos Três Meninos Banho de Ouro 18k | 1 | 159 | não |

`366066` é exatamente a combinação "três meninos" citada como exemplo de
configuração nova — e ela **já existe como produto com saldo**. Mesmo caso de
`326660`. Estes são os SKUs "Prata 925" que a decisão de 06/09 mencionava;
nenhum deles aparece em `personalizacao.js`.

## 4. Composição já conhecida de cada configuração

| Configuração | Composição declarada em código | Grau |
|---|---|---|
| `326660` casal | 1 base + 1 slot Menino + 1 slot Menina | **tipo**, não SKU |
| `364945` duas meninas | 1 base + 2 slots Menina | tipo |
| `311066` dois meninos | 1 base + 2 slots Menino | tipo |
| `314161` 2M+1F | 1 base + Menino, Menino, Menina | tipo |
| `399872` 2F+1M | 1 base + Menina, Menina, Menino | tipo |
| `MONTE-COLAR` | 1 base + 1 a 12 slots livres | arbitrário |

**Nenhuma configuração tem composição fechada em SKU.** O que existe é
`slotTipos`, uma lista de **grupos** (`'Menino'`, `'Menina'`) preenchida pela
vendedora **no momento da venda**, escolhendo entre as cinco opções canônicas.
Não existe em lugar nenhum a linha "casal = `444032` + `251551` + `263236`".

Isso importa: o modelo oficial — composição cadastrada, disponível derivado
dela — precisa da relação exata SKU→SKUs, e ela **não existe hoje**, nem em
código nem em dado.

## 5. Composição incompleta ou ambígua — **pendente**

1. **Toda configuração**, pelo motivo do §4: falta a relação exata.
2. **A base**: `444032` ausente; qual SKU físico ocupa esse papel.
3. **Os três componentes menino**: ausentes; se voltam com o código antigo ou
   com outro.
4. **As seis configurações do §3** que não estão em `personalizacao.js`: são
   configurações montáveis ou peças prontas compradas do fornecedor?
5. **O preço não fecha.** O casal custa R$ 129 e cada pingente componente
   custa R$ 119, com a veneziana a R$ 74 — a configuração é vendida por menos
   da metade da soma das peças que consumiria. Ou os pingentes de R$ 119 não
   são os componentes do casal de R$ 129, ou o preço da configuração não é
   comparável com o das peças. Não interpretei.
6. **Ouro 18k × Prata 925**: as configurações documentadas são todas 18k; as
   do §3 são quase todas Prata 925. Se a mesma configuração existe nos dois
   acabamentos, são SKUs diferentes com composições diferentes.

## 6. Papel atual das quatro tabelas vazias

Todas com **0 linhas** em produção, confirmado no dump.

| Tabela | Papel | Sob a regra oficial |
|---|---|---|
| `personalizacao_modelos` | um modelo: slots mín/máx, base padrão, preço sugerido, ativo | **quase**: é o lugar da configuração, mas guarda *quantos* slots, não *quais* SKUs |
| `personalizacao_opcoes` | quais SKUs podem ocupar um slot, com rótulo e grupo | é **cardápio**, não composição — diz o que *pode* entrar, não o que entra |
| `venda_personalizacoes` | a composição escolhida, congelada por venda | **mantém**: é o registro da identidade comercial vendida |
| `venda_personalizacao_itens` | cada peça daquela composição, com `movimento_id` | **mantém**: é o que liga a venda ao movimento e permite o estorno exato |

Existe uma quinta tabela relevante, também vazia: **`kit_componentes`**
(`kit_sku`, `componente_sku`, `qtd`). É a única do sistema que já representa
composição fixa em SKU.

## 7. Quais mecanismos manter

**Manter `kit_componentes`.** Ele já é, literalmente, o modelo descrito na
decisão — e não por coincidência: §5 do REGRAS.md cita o "Colar Casal de
Filhos" como o caso real que o motivou.

| Regra oficial | O que `kit_componentes` já faz | Onde |
|---|---|---|
| configuração sem saldo próprio | `produtos.qtd` do kit fica sempre 0 | REGRAS §5 |
| disponível deriva dos componentes | `min(floor(disponível / qtd))` | `estoque.js › saldosDoKit` |
| venda baixa só os componentes | `movimentarKit` | `estoque.js:141` |
| cancelamento devolve os componentes | `movimentarKit('cancelamento')` | `vendas-comandos.js:553` |
| falta de componente bloqueia | o mínimo cai a 0 | `saldosDoKit` |
| não duplicar estoque financeiro | kit fora do inventário e da maleta | `inventario.js:31`, `maletas-comandos.js:69` |
| não virar saldo por acidente | `definirKit` **recusa** transformar em kit um produto com saldo ou consignado | `catalogo-comandos.js:117` |

A última é notável: a proteção contra dupla contagem **já existe** e já
recusaria, hoje, transformar `326660` em configuração — porque ele tem 1 no
saldo e está numa maleta aberta.

**Manter também** `venda_personalizacoes` + `venda_personalizacao_itens`: o
kit sozinho não registra *qual* variação de cada componente saiu, e a regra 2
do CLAUDE.md exige essa identidade.

## 8. Quais remover ou consolidar

| O quê | Por quê | Ação proposta |
|---|---|---|
| **Composição livre `MONTE-COLAR`** | §7 da decisão: nada de composição arbitrária em tempo de venda | remover o modelo `livre` e o caminho de preço manual |
| **Troca de base (`corpo.baseSku`)** | §6: a Veneziana não é escolha na versão atual | recusar override; a base vem da composição |
| **`slotTipos` / `slots_min` / `slots_max`** | são "escolha na hora", o oposto de composição cadastrada | substituídos pela composição em SKU |
| **`MODELOS_CANONICOS` e `OPCOES_CANONICAS` no código** | §7: a Sthefany precisa poder cadastrar configuração nova, e constante em `.js` só muda com deploy | migrar para dado |
| `personalizacao_opcoes` | vira cardápio de um motor que deixa de existir | consolidar na composição |

Nada disso tem efeito operacional hoje: a feature está desligada
(`PERSONALIZACAO_ATIVA = "false"` desde 06/09, `1ca62f6`) e as tabelas estão
vazias.

## 9. Desenho de dados mínimo recomendado

**Sem tabela nova.** A composição vai para `kit_componentes`, que já existe,
já está vazia e já tem exatamente as três colunas necessárias:

```
produtos('326660')      configuração comercial · qtd SEMPRE 0 · preço 129
produtos('455109')      veneziana · componente físico · qtd real
produtos('263236')      pingente  · componente físico · qtd real

kit_componentes
  kit_sku    componente_sku   qtd
  326660     455109           1     ← a base entra como componente comum
  326660     <menino>         1
  326660     <menina>         1
```

A base deixa de ser um campo especial (`base_sku_padrao`) e vira **um
componente como os outros**, com `qtd 1`. O conceito de "base trocável"
desaparece sem precisar de trava: não existe campo para trocar.

Duas configurações que compartilham um pingente disputam o mesmo número — o
efeito descrito na decisão, e o que `saldosDoKit` já calcula.

**Muda de nome?** `kit_componentes` carrega a palavra "kit", que a decisão não
quer como conceito comercial. Recomendo renomear a *linguagem* (a UI e as
mensagens falam "configuração" e "composição") e **não** a tabela: renomear
schema é migration com risco, para ganho de vocabulário. Se for para renomear,
é proposta separada com `safe-d1-change`.

O que continua em `venda_personalizacoes` / `venda_personalizacao_itens`: qual
configuração foi vendida, qual **variação** de cada componente saiu, e o
`movimento_id` de cada baixa — que é o que torna o estorno exato.

Escopo do item 3, então:

1. a composição das configurações passa a viver em `kit_componentes` (dado);
2. `personalizacao.js` deixa de escolher slots e passa a **ler a composição**;
3. remove composição livre e troca de base;
4. cadastrar configuração nova = criar produto + gravar composição, sem deploy;
5. testes das nove proteções obrigatórias;
6. `PERSONALIZACAO_ATIVA` continua `false`.

## 10. Impacto esperado

**Venda.** Sem mudança de contrato: a linha de `venda_itens` continua sendo o
SKU comercial, uma linha, preço da configuração. O que muda é de onde vêm os
movimentos — da composição cadastrada, não da escolha da tela. Faturamento não
muda: os componentes nunca tiveram linha de venda, então nunca somaram receita.

**Cancelamento.** Já estorna base + componentes hoje
([`vendas-comandos.js:528-547`](../../api/src/vendas-comandos.js)) — o GAP do
[checklist item 14](../testing/MONTE_SEU_COLAR_CHECKLIST.md) **foi fechado, e o
checklist está desatualizado**. A idempotência vem de `if (v.cancelada) return
409`, antes de qualquer movimento.

Resta **um defeito real**: o estorno da base não devolve a variação.

```js
// vendas-comandos.js:532 — o componente preserva a variante; a base não
movimentar(db, { sku: p.baseSku, tipo: 'cancelamento', quantidade: 1, ... })
//                                  ↑ sem variacao, sem varianteId
```

A venda baixou a base com `baseVariacao`; o estorno devolve com `NULL`. O total
fecha, a razão por variação não. `personalizacoesDeVendas` também não devolve
`baseVarianteId`. §42 do REGRAS.md diz "preservando a variante" — o código não
cumpre isso para a base. No desenho do §9 o defeito **desaparece por
construção**: a base vira componente comum e passa pelo mesmo caminho.

**Disponibilidade.** Passa a existir um número por configuração, que hoje não
existe: `listarModelos` devolve o disponível de cada opção separadamente, e
nunca "quantos casais dá para montar". `saldosDoSku` já entrega isso de graça
para quem tem linha em `kit_componentes`.

**Financeiro.** Medido: **não existe nenhuma soma patrimonial de estoque no
sistema** — nenhum `SUM(qtd * preco)` sobre `produtos`, em lugar nenhum do
backend nem dos dois painéis. Todos os `qtd * preco` são sobre `venda_itens`.
A dupla contagem temida **ainda não pode acontecer**, e a proteção a criar é
preventiva: um teste que falhe se uma configuração com composição tiver
`qtd != 0`, e a garantia de que inventário e maleta continuem excluindo-a.

## 11. Contradição encontrada — precisa de decisão

Sob a regra oficial, `326660` é configuração comercial e **não pode ter saldo
físico**. Na produção de hoje:

```
produtos.sku = '326660'   qtd = 1   ativo   R$ 129

movimentos:
  2026-08-21 13:34  entrada      +1  importacao  "Saldo inicial do cadastro de peças novas"
  2026-08-21 14:21  consignacao   0  maleta      "1 un. para a maleta 12"

maleta_itens: maleta 12 · qtd 1 · devolvida 0 · status ABERTA
```

**Existe uma peça física chamada "Colar Casal Banho de Ouro 18k" na mão de uma
revendedora agora.** Ela foi contada, entrou por importação e saiu em maleta.

O mesmo vale, com saldo 1 cada, para as seis do §3 — e `453324` está
**publicada na loja com estoque 1**, vendendo como peça pronta.

Duas leituras possíveis, que levam a sistemas diferentes:

- **(a) São peças prontas de fornecedor.** A Marquesa compra o "Colar Casal
  Prata 925" já montado. Então elas são **componentes físicos** no vocabulário
  oficial (§1A), mantêm saldo, e "Monte seu Colar" é um produto **diferente**
  que por acaso tem nomes parecidos — e precisa dos seus próprios SKUs
  comerciais, os sete ausentes;
- **(b) São configurações cadastradas erradas como peça física.** Então esses
  saldos são dupla contagem já existente, e corrigir significa zerar o saldo de
  `326660` — **uma peça que está fisicamente numa maleta aberta**.

Não foi escolhido. A regra 2 do [CLAUDE.md](../../CLAUDE.md) — nunca decidir
sozinho quando o conflito pode representar peça física — vale exatamente aqui,
e a leitura (b) é destrutiva se estiver errada.

## 12. Decisões pendentes

1. **§11: (a) ou (b)?** — trava o item 3. Pergunta prática: a Sthefany comprou
   esse "Colar Casal" já montado do fornecedor, ou ela o montou com peças que
   também estão contadas separadamente?
2. **Qual SKU é a Veneziana** (`444032` ausente; `455109` é candidato).
3. **Quais SKUs são os componentes menino** (três ausentes; `926220` é
   candidato para um deles).
4. **A composição exata de cada configuração** — a relação SKU→SKUs. Sem ela
   nada pode ser cadastrado. Será informada.
5. **Ouro 18k × Prata 925**: configurações separadas, com composição própria?
6. **As seis configurações do §3** entram na família montável, ou ficam como
   peça pronta?
7. **Renomear `kit_componentes`?** (§9 — recomendação: não).

## 13. O que fica provado quando o item 3 for feito

Cada proteção obrigatória com o teste que a prova:

| Proteção | Como provar |
|---|---|
| configuração não soma estoque financeiro | o teste falha se configuração com composição tiver `qtd != 0` |
| sem saldo físico independente | `saldosDoSku` de configuração ignora `produtos.qtd` |
| disponibilidade deriva dos componentes | `min(floor(saldo / qtd))`, incluindo a base |
| venda registra a identidade comercial | `venda_itens` tem uma linha, com o SKU da configuração |
| estoque baixa só componentes | nenhum movimento no SKU comercial |
| cancelamento restaura o consumido | saldo por **variação** antes == depois |
| falta de componente bloqueia | 409, e a mensagem diz qual componente |
| concorrência | duas configurações no mesmo carrinho disputando o mesmo pingente |
| idempotência | cancelar duas vezes não devolve duas vezes |
| nenhuma escrita direta em `produtos.qtd` | [scripts/razao-estoque.test.mjs](../../scripts/razao-estoque.test.mjs), já verde |
| 142 contratos HTTP | [scripts/api-contracts.test.mjs](../../scripts/api-contracts.test.mjs) |
