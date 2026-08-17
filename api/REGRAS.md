# Onde cada regra do documento vive no código

Referência cruzada entre o documento de contexto da operação
(*Marquesa_Sistema_Contexto_Cloud_Code.md*) e a implementação da API.
Serve para conferir se uma mudança futura quebra alguma regra combinada.

| Documento | Regra | Onde está |
|---|---|---|
| §4 | Categorias configuráveis | tabela `categorias`, `GET/POST /api/categorias` |
| §5.2 | Três saldos: total, consignado, disponível | `estoque.js › saldosDoSku` |
| §5.3 | Consignação **não** é venda | movimento `consignacao` tem efeito 0 no total |
| §6.1 | Maleta congela o preço do envio | `maleta_itens.preco_envio` |
| §6.1 | Status Aberta/Em acerto/Encerrada/Cancelada | `maletas.status` |
| §6.2 | Não enviar mais que o disponível | `adicionarItens` recusa e explica |
| §7 | `enviada − devolvida = não devolvida`, por SKU | `encerrarAcerto` |
| §8 | Motivo da saída | `venda_itens.motivo` |
| §9 | Peça não devolvida gera venda de verdade | `vendas.origem = 'acerto'` |
| §11 | Faixas de comissão | `config.faixas`, editável |
| §12 §32 | Faixa pelas **banhadas**; Prata 925 com 10% à parte | `comissao.js › calcComissao` |
| §13 | `vendido − comissão = a receber` | `acerto.liquido` |
| §18 | "Por que o estoque deste SKU mudou?" | `GET /api/estoque/:sku/movimentos` |
| §19 | Saldo resulta das movimentações | `estoque.js › movimentar`; `PATCH` com `qtd` é recusado |
| §19 | Conferência do saldo | `GET /api/estoque/conferir` prova `qtd == SUM(movimentos.qtd)` |
| §22 | Importação sinaliza, não corrige em silêncio | `importarProdutos` devolve `avisos[]` |
| §24 | Produto sem preço não vira R$ 0 | `produtos.preco` é `NULL`; venda é bloqueada |
| §28 | Não apagar histórico | revendedora arquiva, maleta cancela, venda estorna |
| §19 | Inventário não corrige em silêncio | `concluir` só compara; `ajustar` exige confirmação por código |
| §5.2 | Inventário cobra só o que está em casa | `inventario.js › SQL_ESPERADO` desconta o consignado |
| §6.1 | Esperado congelado no fechamento | `inventario_itens.esperado` |
| §22 | Código bipado fora do catálogo é anunciado | `inventarios.desconhecidos_json` |
| §8 §9 | Venda de balcão, acerto e site na mesma tabela | `vendas.origem = 'balcao' \| 'acerto' \| 'site'` |
| §5.1 | Puxar pedidos antes de empurrar estoque | `sync.js › sincronizar` |
| §22 | O retrato da loja vem da última rodada, não do último CSV | `sync.js › gravarRetratoDaLoja` |
| §22 | Variação ≠ duplicata; código com variação não é empurrado | `nuvemshop.js › mapearSkus`, `sync.js › empurrarEstoque` |
| §19 | Rodar o cron duas vezes não duplica venda | índice único `vendas.externo_id` |
| §22 | Produto que só existe na loja não é tocado | `empurrarEstoque` ignora SKU fora do catálogo |
| §5.2 | Kit: disponível = mínimo entre componentes | `estoque.js › saldosDoKit` |
| §19 | Venda de kit vira movimento nos componentes | `estoque.js › movimentarKit` |
| §22 | Kit exige zerar o saldo antes de virar kit | `index.js › definirKit` recusa com o motivo |

## Duas divergências conscientes

### 1. SKU com sufixo — §3, §21 e princípio nº 2

O documento afirma que `486476` e `486476-2` são **códigos diferentes** e que
o SKU nunca deve ser normalizado.

**A operação diz o contrário.** O `-2` marca a mesma peça comprada numa
compra posterior. Foi conferido nos dados reais:

- dos 14 códigos com sufixo na planilha de estoque, **nenhum** tem descrição
  diferente da sua base;
- **10 deles** têm o código-base ausente da planilha mas presente na loja;
- o relatório de sincronização com a Nuvemshop já consolidava.

Seguir o documento à risca recriaria estoque negativo fantasma em `120029`,
`150164`, `486476` e `818325` — a maleta sai pelo código-base, que não
existiria no catálogo.

**O que foi feito:** as quantidades somam no código-base, mas a consolidação
é **anunciada** (lista quais códigos somaram) e **recusa juntar em silêncio**
quando as descrições divergem. Isso honra o §22 ("não corrigir
silenciosamente") sem herdar a premissa errada.

Se um dia um sufixo passar a significar um produto realmente diferente, o
aviso de descrição divergente é o gatilho para rever esta decisão.

### 2. Categoria a partir da descrição — §4

O documento avisa para "não assumir que a descrição é sempre suficiente".
Está certo como princípio, e por isso a categoria é **editável** e as
categorias são configuráveis.

Mas, como palpite inicial na importação, derivar da descrição é o método
mais preciso disponível: deixa **5 peças em 1.459** na categoria "Outros",
contra **162** se usar o campo `Categorias` do export da Nuvemshop, onde se
misturam coleção ("Coleções > Promessas"), material e público-alvo, e 89
produtos vêm em branco.

### 3. Inventário sugere, mas não aplica — §19

O §19 diz que o saldo resulta das movimentações, nunca de digitação. Um
inventário que sobrescrevesse o saldo com o número contado violaria isso
mesmo estando "certo": o número passaria a valer por autoridade, não por
uma razão registrada.

Por isso a contagem e a correção são dois atos separados. `concluir` só
compara e devolve a diferença; `ajustar` grava um movimento `ajuste` com
origem `inventario` e a frase do motivo ("contado 7, sistema dizia 9"),
um código por vez, e recusa ajustar duas vezes o mesmo código.

A razão prática é mais forte que a formal: peça faltando quase nunca sumiu.
Está na bolsa, foi para a maleta sem lançar, ou a etiqueta não leu. Se o
sistema corrigisse sozinho, o erro de contagem viraria a nova verdade sem
deixar rastro.

### 5. Kit não tem saldo próprio — o disponível vem sempre dos componentes

Peça publicada como mais de um anúncio porque pode ser vendida inteira ou
desmontada: o caso real é o "Colar Casal de Filhos" (corrente + pingente
menino + pingente menina) que também vende como "Colar Filho(a)" avulso.

Um SKU com linha em `kit_componentes` é um kit. Ele nunca recebe movimento
próprio — `produtos.qtd` dele fica sempre 0. O disponível é calculado na
hora: o mínimo, entre os componentes, de quanto cada um permite montar.

É esse mínimo COMPARTILHADO que resolve o problema de verdade: dois kits
que usam o mesmo componente disputam o mesmo número. Vender um derruba o
outro na mesma hora, sem ninguém lembrar de atualizar o segundo anúncio —
testado em `src/kits-test.mjs`, que prova que vender o casal zera também o
"só o menino", mesmo os dois tendo sido publicados com disponível 1.

Vender um kit vira movimento nos COMPONENTES (`estoque.js › movimentarKit`),
não nele. O carrinho de uma venda de balcão precisa validar isso considerando
o que OUTRAS linhas do mesmo carrinho já reservaram — validar cada linha só
contra o banco deixaria vender o mesmo componente duas vezes num carrinho
com dois kits que o compartilham, porque o banco só muda depois, no batch.

Dois limites de escopo, deliberados: kit não entra em maleta (a consignação
tem efeito 0 no saldo, e reservar um componente sem mexer no saldo dele
exigiria um mecanismo à parte que ainda não existe) e kit fica de fora do
inventário (ele não é coisa para bipar — quem tem saldo real para contar são
os componentes).

### 6. Quem lê a loja é quem grava o retrato dela — §22

A aba Loja descreve a loja: quantos produtos existem, quais códigos estão
publicados, quanto cada um mostra de estoque, o que está oculto. Esses
números vinham todos de `importarLoja` — o CSV exportado da Nuvemshop e
subido à mão.

Enquanto a atualização era por arquivo, isso fechava: importar o CSV era o
mesmo ato de olhar a loja. Com a sincronização automática deixou de fechar.
A rodada lê a loja inteira (`loja.produtos()`), empurra o estoque e
**descartava** o que tinha lido. O retrato continuava congelado no dia da
última importação.

O efeito não era cosmético. A tela seguia acusando "estoque errado no site"
em produtos que a própria rodada das 6h já tinha acertado, e oferecia como
solução gerar um CSV — o fluxo manual, agora capaz de subir números velhos
por cima dos certos. O mesmo valia para "falta subir": peça cadastrada na
Nuvemshop depois do último CSV continuava contada como ausente.

Agora `gravarRetratoDaLoja` grava o que a rodada leu: `url_loja`,
`estoque_loja`, `visivel`, `nome_loja` e a `loja_snapshot` inteira. Onde
houve empurrão, vale o número empurrado, não o que foi lido antes dele —
senão o retrato nasceria velho por uma rodada.

Rodada pausada pelo freio e rodada seca também gravam. Elas não escreveram
na loja, mas leram a loja de verdade, e é justamente aí que ver o retrato
certo mais importa: é a tela em que ela vai decidir se manda aplicar.

Uma coisa a sincronização continua não resolvendo, e a tela agora diz isso
com todas as letras: ela **não cria produto** na Nuvemshop. Código sem
anúncio lá permanece em "falta subir" para sempre, porque `empurrarEstoque`
só toca em quem existe nos dois lados (§22). Cadastrar é um passo manual, e
some da lista sozinho na rodada seguinte.

### 7. Variação não é cadastro duplicado — §22

O mesmo código pode aparecer em mais de uma variação da loja por dois
motivos que não têm nada a ver um com o outro:

- **variações do MESMO produto** — tamanho, cor, comprimento, material. É o
  normal nesta loja: 56 dos códigos são assim. Não há o que unificar.

  Qual dimensão varia **não é lista fixa nossa**: cada produto da Nuvemshop
  declara os seus atributos, e é esse nome que a tela mostra. Presumir
  "tamanho ou cor" quebraria no primeiro produto vendido por comprimento —
  o teste usa justamente um desses.
- **o mesmo código em produtos DIFERENTES** — aí sim é cadastro duplicado: o
  estoque fica dividido entre dois anúncios e a conta nunca fecha. São 2.

`mapearSkus` tratava os dois como duplicata e a tela acusava 56 numa loja
que tem 2. Pior que o número errado era o que vinha junto: ao encontrar o
código repetido, a versão anterior fazia `continue` e **descartava a
variação**. Sobrava só a primeira — e era nela que a sincronização escrevia
o estoque inteiro do código, deixando os outros tamanhos com o número velho.
Na prática, anunciava todo o estoque num tamanho só.

Agora as duas coisas são separadas, e todas as variações ficam guardadas.

**A sincronização não empurra estoque de código com mais de uma variação, e
isso é deliberado.** Aqui existe um número por código; lá existe uma caixinha
por variação. Não dá para saber quanto vai em cada uma, e chutar é anunciar
peça que não existe. Esses códigos ficam listados na aba (filtro "Variações",
com o estoque de cada uma e o nome do atributo que a loja usa) e fora da
lista de "estoque errado" — cobrar correção sem oferecer botão seria só
barulho.

O `estoque_loja` desses códigos é a **soma** das variações, que é o único
número comparável com o nosso e é como a importação por arquivo sempre
contou.

Isto é um degrau, não o destino. A operação confirmou que o estoque é
separado por variação de verdade, e o certo é a variação existir deste lado
também — com escolha na hora da venda e da bipagem. Enquanto isso não
existe, não escrever nada é a única opção que não inventa dado.

### 4. A sincronização tem duas mãos, nesta ordem — §5.1

Puxar os pedidos do site **antes** de empurrar o estoque não é preferência
de organização: inverter quebra o sistema.

A Nuvemshop baixa o estoque dela sozinha quando alguém compra. Nós não
ficamos sabendo. Se o empurrão viesse primeiro, ele mandaria o nosso número
antigo — sem a venda — de volta para a loja, recolocando à venda uma peça
que já saiu. Toda venda online seria desfeita na sincronização seguinte.

Por isso `sync.js` faz `puxarPedidos()` e só então `empurrarEstoque()`, e o
teste em `src/sync-test.mjs` prova a ordem: vende no site, sincroniza, e
confere que a loja recebeu o número **novo**, não o anterior.

O mesmo motivo torna a idempotência obrigatória: um cron pode rodar duas
vezes, e a janela de leitura de pedidos olha 6 horas para trás de propósito
para não perder pedido atrasado. A trava contra cobrar a mesma venda duas
vezes é o índice único em `vendas.externo_id` — do banco, não da lógica.

## Regra que precisa de confirmação no contrato

§11 e §12 definem a faixa pelo total de **banhadas**, com a Prata 925 a 10%
fixos e fora dessa conta. É o que está implementado.

Nas quatro maletas atuais isso não muda nada — todas caem em 35% de qualquer
forma. Mas perto das fronteiras muda: com R$ 5.900 em banhadas e R$ 500 em
prata, a diferença entre calcular a faixa pelo total geral ou só pelas
banhadas é de **R$ 295** na comissão.

Vale conferir contra o contrato assinado antes de usar o valor do acerto
para cobrar.
