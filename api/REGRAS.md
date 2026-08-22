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
| §22 | Variação ≠ duplicata | `nuvemshop.js › mapearSkus` |
| §22 | Repartição inicial vem da loja, e só em código virgem | `sync.js › semearVariacoes` |
| §19 | Repartir não muda o total; recusa quando a soma não bate | `index.js › repartirVariacoes` |
| §5.2 | Cada variação vai para a caixinha dela na loja | `sync.js › empurrarEstoque` |
| §19 | Rodar o cron duas vezes não duplica venda | índice único `vendas.externo_id` |
| §22 | Produto que só existe na loja não é tocado | `empurrarEstoque` ignora SKU fora do catálogo |
| §5.2 | Kit: disponível = mínimo entre componentes | `estoque.js › saldosDoKit` |
| §19 | Venda de kit vira movimento nos componentes | `estoque.js › movimentarKit` |
| §22 | Kit exige zerar o saldo antes de virar kit | `index.js › definirKit` recusa com o motivo |
| §22 | Planilha é analisada antes de aplicar; nada em silêncio | `catalogo.js › analisarEstoqueTotal` |
| §22 | Produto novo não é criado pela planilha de estoque | grupo C fica em `produtos_pendentes` |
| §19 | O que se aplica é o alvo, e o delta é recalculado na hora | `catalogo.js › aplicarEstoqueTotal` |
| §22 | Cadastro de peças novas nunca altera cadastro existente | `catalogo.js › cadastrarNovos` devolve `ignorados` |
| §24 | "Sem preço" entra no lote marcado, não vira exceção | `analisarNovos` põe em `alertas`, não em `motivos` |
| §5.1 | Ensaio da sincronização não escreve nada | `sync.js › analisarSincronizacao` |
| §22 | Foto da loja só casa com SKU exato; o resto vai para a fila | `fotos.js › importarFotosDaLoja` → `fotos_orfas` |
| §22 | Fundo branco sem serviço configurado fica pendente | `fotos.js › gerarFundoBranco` não inventa imagem |
| — | Foto: bytes no R2, D1 guarda só chave/tipo/tamanho/estado | `fotos-storage.js`, `migracao-catalogo.sql` |
| — | Link de foto assinado (HMAC), não o Bearer da API | `assinatura.js`, rota GET fora do `checarChave` |
| §24 | Peça sem preço nunca entra em "criar na loja" | `sync.js › analisarSincronizacao` → `bloqueadosSemPreco` |
| §24 | Peça sem preço nunca aparece como "pronta para publicar" | `fotos.js › pendenciasDePublicacao` |

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

Isto valeu enquanto a variação não existia deste lado. Agora existe — ver a
regra 8 — e o empurrão voltou para esses códigos, cada variação na caixinha
dela. Continuam de fora só duas situações: cadastro duplicado (não há como
dividir entre dois anúncios) e código com peça em maleta (a maleta ainda não
sabe qual variação saiu, e descontar da errada tiraria do ar uma peça que
está aqui).

### 8. Repartir entre variações é automático, mas só uma vez — §19 §22

A operação confirmou que o estoque é separado por variação de verdade, que a
ETIQUETA é a mesma nas duas (bipar não distingue), e pediu duas coisas: que
o sistema pergunte a variação **só nos códigos que têm**, e que a repartição
inicial venha pronta da Nuvemshop, sem ninguém confirmar nada.

A variação entrou como COLUNA em `movimentos`, não como tabela paralela de
saldo. Assim `produtos.qtd == SUM(movimentos.qtd)` continua valendo sem
exceção, e o saldo de uma variação é a mesma soma com um filtro a mais. Não
há segunda contabilidade para desencontrar da primeira.

`sync.js › semearVariacoes` reparte sozinho, lendo a caixinha de estoque que
a loja já mantém por variação. Duas regras seguram o que ele pode fazer:

- **Só semeia código virgem.** Se qualquer peça daquele código já foi
  atribuída — por repartição, venda ou contagem — a rodada não encosta nele.
  Sem isso, a sincronização da madrugada desfaria a correção feita à mão na
  véspera: o pior tipo de bug, o que apaga trabalho de alguém enquanto
  ninguém olha.
- **A soma da loja é o atestado.** Bateu com o nosso total, a repartição
  dela é confiável e entra inteira. Não bateu, **não se reparte nada**.

  A primeira versão servia as variações na ordem até o total acabar. Parece
  razoável e é péssimo: a loja carrega a herança do bug anterior, que
  escrevia o total do código inteiro dentro da primeira variação. Servir na
  ordem daria tudo para a primeira e **zero** para as outras — reproduzindo
  o bug e ainda levando o zero de volta para a loja, tirando os outros
  tamanhos do ar.

  Não foi hipótese: o freio da rodada barrou o cenário real, com 16 produtos
  que seriam zerados. O desencontro entre as duas somas não diz onde está o
  erro, então a única resposta honesta é não dividir e mostrar os dois
  números.

- **Repartição pela metade não empurra.** Se sobram peças sem variação, as
  caixinhas da loja somadas dariam menos do que existe aqui, e a diferença
  sairia do ar como se a peça não existisse. O código só volta para a
  sincronização quando estiver inteiramente repartido.

Peça "sem variação" **não é anunciada** em variação nenhuma. Deixar de
vender uma é melhor que vender um aro que não existe, e ela volta ao ar
sozinha assim que for atribuída.

`POST /api/produtos/:sku/repartir` é o ajuste à mão. Ele recusa quando a
soma não bate com o estoque e mostra os dois números, em vez de escolher
sozinho quem está certo — repartir e corrigir o total são atos diferentes,
como no inventário. Cada remanejo vira dois movimentos que se anulam no
total: sai de "sem variação", entra na variação.

Código COM variação passa a exigir que se diga qual, inclusive pela API.
Código sem variação não muda em nada: bipa e entra, como sempre. É
exatamente o que foi pedido, e o teste trava os dois lados.

### 8b. O casamento com a loja é por `variant_id`, nunca por nome — §5.2 §22

A regra, sem rodeio:

> Se a Nuvemshop tem mais de uma variante e o sistema não sabe exatamente
> quanto pertence a cada `variant_id`, **não se escreve nada**. O produto
> entra em "precisa de revisão — variações não mapeadas".

Nunca dividir automaticamente, nunca duplicar, nunca atribuir tudo à
primeira, nunca casar por posição, nunca adivinhar.

**Por que o nome não serve.** A versão anterior casava saldo com caixinha
pelo NOME da variação ("16", "Dourado · Zircônia"). Nome é dado da loja: ela
renomeia um valor, troca a ordem dos atributos, e o nome muda sozinho de
madrugada. Quando isso acontecia, o saldo local deixava de encontrar
qualquer variante — e o modo da falha era o pior possível:

- a soma do total continuava fechando, então **nenhum freio disparava**;
- cada variante recebia zero;
- a peça saía do ar, e ninguém ficava sabendo.

Agora o id viaja com o movimento (`movimentos.variante_id`, NULL em tudo que
é histórico, e NULL significa "não sei") e fica persistido em
`produto_variacoes.variante_id`, com índice único. O que não casar por id
não é chutado: bloqueia o código inteiro e aparece na revisão com os dois
números lado a lado.

**O que muda na prática, e é uma mudança de comportamento consciente:** um
código com saldo preso numa variação que a loja não tem mais deixa de ser
empurrado. Antes ele passava — o balde da variação morta continuava contando
para o total e a conta "fechava" por acidente, empurrando o produto com uma
caixinha a menos. Deixar a loja com o número velho é ruim; escrever número
que não se sabe conferir é pior, e foi isso que já bagunçou o estoque de
verdade uma vez.

`POST /api/produtos/:sku/repartir` é o que destrava: ele devolve para "sem
variação" o saldo preso numa variante que sumiu, pela mesma chave em que ele
estava. Sem isso o bloqueio seria um beco sem saída.

### 8d. Quem divide o estoque entre as variações é uma pessoa — §19 §22

A regra 8b diz que o sistema **para** quando não sabe quanto pertence a cada
`variant_id`. Parar sem oferecer saída, porém, é dívida disfarçada de
segurança: a FASE 1 deixou 27 códigos travados em produção, e nenhuma tela
sabia destravá-los.

`Estoque › Pendências` passou a ter a tela que destrava, e ela é desenhada
em torno de uma recusa:

- **Ela não propõe número nenhum.** Mostra os dois totais lado a lado (o
  nosso e o da loja), uma linha por variante REAL, e espera.
- **A soma tem de fechar EXATAMENTE** com `produtos.qtd`. Faltando ou
  sobrando peça, o botão não libera e a rota recusa com 409 dizendo os dois
  números. Repartir e corrigir o total são atos diferentes (§19): quem tenta
  consertar o total por dentro da divisão está prestes a apagar peça de
  verdade.
- **A chave de cada quantidade é o `variant_id`.** A tela escreve "Rosa ·
  n° 17" porque é isso que se lê numa peça; o id viaja no `data-` e não
  aparece em lugar nenhum da interface. A loja pode renomear o valor amanhã
  sem quebrar nada — e isso é testado.
- **"Usar quantidades atuais da loja" só PREENCHE o formulário.** Não grava,
  e a tela diz isso na hora. O botão existe porque redigitar dez números que
  já estão certos convida ao erro de digitação, não porque a loja seja fonte
  da verdade do físico (regra 4 do CLAUDE.md).

Cada remanejo vira **dois movimentos que se anulam no total** — sai de "sem
variação", entra na variação — para `produtos.qtd == SUM(movimentos.qtd)`
continuar valendo e o histórico mostrar a repartição em vez de um número que
mudou sozinho.

Rota: `POST /api/produtos/:sku/variacoes/distribuir`. Saldo preso numa
variante que a loja não tem mais volta para "sem variação" **antes** de as
novas serem servidas, e a resposta anuncia isso — senão o delta partiria de
um número que inclui peça que ninguém vai reencontrar.

Os outros motivos de bloqueio (`maleta`, `duplicado`,
`variacao_nao_mapeada`) aparecem na mesma tela **sem formulário**, com a
explicação do que os trava. Oferecer um campo que não resolve o problema
seria pior que não oferecer nada.

### 8c. A estrutura da loja é importada inteira, e é só leitura

`POST /api/loja/variantes/importar` percorre o catálogo REAL da Nuvemshop e
guarda, por variante: `product_id`, `variant_id`, SKU, atributos **e seus
valores**, estoque, preço, imagem própria e o produto pai. Vai para
`loja_variantes`, que é espelho — não manda em estoque, preço nem cadastro.

Saber o que a loja tem e decidir o que fazer com isso são atos separados de
propósito. Juntá-los é como o estoque foi bagunçado da outra vez.

**Os atributos são dinâmicos.** A Nuvemshop entrega `product.attributes` e
`variant.values` como duas listas paralelas, e o par é montado pela posição
com o nome que o próprio produto declara. Não existe lista fixa de "cor e
tamanho" em lugar nenhum do sistema: a loja real varia por Aro,
Comprimento, Banho, Pedra, Material, Numeração e o que mais ela inventar.
Presumir duas dimensões quebraria no primeiro produto vendido por outra.

### 17. SKU é único de fato, e o gerado tem a cara do catálogo — §3 §22

`produtos.sku` sempre foi PRIMARY KEY, então o mesmo código idêntico duas
vezes nunca passou. O que passava era o quase-igual: `br1234` ao lado de
`BR1234`, ou ` BR1234 ` com espaço. O importador de planilha só fazia
`.trim()`, enquanto o resto do sistema compara em maiúsculas e sem espaço —
duas linhas, dois estoques, e só uma delas casando com a loja.

Três camadas, de propósito:

1. **tela** — avisa enquanto a pessoa digita (`GET /api/produtos/sku/checar`);
2. **backend** — recusa de novo, porque frontend é conveniência, não trava;
3. **banco** — `idx_produtos_sku_norm`, índice único sobre a forma
   normalizada. É ele que pega dois requests no mesmo instante.

A recusa diz **onde** o código já está sendo usado. Bloquear sem explicar
obriga a caçar o duplicado à mão no meio de centenas de peças.

**Estar na loja NÃO impede cadastrar.** É o contrário: cadastrar aqui o
código que a Nuvemshop já tem é exatamente como os dois lados se casam, e
bloquear isso travaria a importação inteira do catálogo. Vira aviso, com o
produto e a variante nomeados. O mesmo vale para a fila de peças novas, que
existe justamente para virar produto. Só `produtos` bloqueia.

**O código gerado: seis dígitos sorteados. Decidido pela auditoria.**

A pergunta "qual código o sistema deve gerar?" não tinha resposta de
escritório, e por um tempo o gerador devolveu `MQ` + 5 dígitos anunciando-se
como provisório. `GET /api/produtos/sku/auditoria` rodou contra o catálogo
real e mediu: **776 códigos, 776 deles com exatamente seis dígitos**, forma
`9×6` em 100%, nenhum prefixo, nenhum sufixo, zero colisões, zero fora do
padrão, de `100633` a `997620` — e **densidade 0,001** na faixa.

Os dois números decidem coisas diferentes, e é a distinção que importa:

- **o formato é inequívoco** → o gerado tem de ter a cara dos outros: seis
  números, sem letra. `MQ00001` inventava um segundo formato num catálogo
  que só tem um, e um código com letra é um código que a operação lê como
  estranho;
- **a sequência não existe** → nada de `max + 1`. Número crescente não é
  sequência: o que a auditoria mede é a DENSIDADE, quantos códigos existem
  dividido pelo tamanho da faixa que ocupam. Perto de 1, os códigos
  nasceram aqui, um depois do outro. 0,001 são 776 códigos espalhados por
  897 mil lugares — códigos do fornecedor. `max + 1` ali escolheria um
  número que o fornecedor ainda pode usar amanhã, e a colisão só apareceria
  meses depois, numa etiqueta impressa.

Daí a regra em vigor: **sortear** entre `100000` e `999999`, com a fonte
aleatória do runtime (`crypto.getRandomValues`), e **provar no banco** que o
sorteado está livre antes de a tela ver o número. O sorteio que cai em cima
de um código já usado — em `produtos`, na fila, na loja ou numa reserva de
outra pessoa — é descartado, e ele sorteia outro. Esgotadas as tentativas, a
resposta **diz** que não conseguiu, em vez de devolver um código não
conferido.

A geração **reserva** o código em `sku_reservas` antes de responder. Sem a
reserva, duas pessoas clicando ao mesmo tempo poderiam sortear o mesmo
número e só a segunda descobriria, no fim do formulário. Quem decide o
empate é a chave primária da tabela; o perdedor sorteia outro.

O código que sai de `POST /api/produtos/sku/gerar` é **definitivo**. O aviso
de "formato provisório" saiu da tela junto com o motivo dele.

**O código digitado à mão** segue a mesma regra: seis números, entre
`100000` e `999999`, único no mesmo universo do gerador. Recusa com recado
de gente — "O código deve ter 6 números." — e a trava é do backend
(`origem: 'manual'` nas rotas de peças novas), não da tela.

Essa regra vale para o que se digita **aqui**. Planilha e catálogo da loja
continuam entrando com o código que o fornecedor escreveu: cobrar formato na
importação derrubaria o arquivo inteiro, e o código de lá não é nosso para
recusar.

**Nenhum código existente é alterado por nada disso.** A regra vale para o
que nasce daqui para a frente.

A auditoria continua existindo e continua medindo — inclusive
`conclusao.regraInequivoca`, que segue `false` porque sequência realmente
não há. A decisão não contradiz a medida: ela nasce dela.

### 18. Peça se apaga ou se arquiva — quem decide é o banco — §28

A lixeira no fim da linha, em `Estoque › Peças cadastradas`, não apaga nada
direto. Ela abre uma janela que primeiro **pergunta ao banco**
(`GET /api/produtos/:sku/dependencias`): existe alguma linha em outro lugar
que só faz sentido por causa desta peça?

- **Não existe** → apaga de vez, e a janela lista o que vai junto
  (movimentos, variações, linha na fila de peças novas). É o caso da peça de
  teste que entulha a lista: apagá-la não perde informação de coisa alguma.
- **Existe** → recusa, nomeia o que impede (venda, saída em maleta, contagem
  de inventário, kit, item de reconciliação) e oferece **Arquivar produto**.
  Arquivar tira a peça de circulação e da sincronização, e preserva tudo
  (§28).

`movimentos` **não** entra nos bloqueios, e é a decisão mais delicada daqui:
todo produto tem ao menos um movimento (a entrada do saldo inicial), então
contá-los como histórico tornaria a exclusão impossível para qualquer peça —
inclusive a que este fluxo existe para limpar. O movimento de uma peça só
descreve o estoque DELA; apagando os dois juntos, §19 continua fechando.

Duas coisas que a janela diz em voz alta:

1. **Arquivar não dá baixa.** Se a peça ainda tem saldo, ele continua
   existindo — só sai de circulação. Zerar por conta própria seria inventar
   um ajuste que ninguém pediu.
2. **Nada disso encosta na Nuvemshop.** São dois catálogos. Sumir com o
   anúncio de alguém como efeito colateral de uma faxina local é o tipo de
   estrago que só aparece quando uma cliente reclama.

Rotas: `DELETE /api/produtos/:sku`, `POST /api/produtos/:sku/arquivar`,
`POST /api/produtos/:sku/desarquivar`.

**Etiquetas é outra coisa, e a tela não confunde as duas.** A exclusão
múltipla em `Etiquetas › Peças cadastradas` reusa a MESMA marcação da
impressão (uma caixinha só, não duas), e apaga apenas o cadastro de etiqueta
— que vive no `localStorage` do navegador, não no D1. A confirmação diz o
número, lista as peças e afirma o que ela não faz: estoque, vendas e maletas
não são tocados.

### 19. Variação criada aqui sobrevive à sincronização — §22

`produto_variacoes` era reescrita inteira a cada rodada, porque a loja é a
fonte da verdade sobre quais variações EXISTEM. Isso estava certo enquanto
ninguém digitava a tabela.

A partir do cadastro com variações, alguém digita: uma peça criada aqui, que
ainda não está na Nuvemshop, tem cor e tamanho sem `variant_id` nenhum. Sem
distinguir a origem, a sincronização da madrugada apagaria essa estrutura e a
peça amanheceria sem variação — o pior tipo de bug, o que desfaz trabalho de
alguém enquanto ninguém olha.

`produto_variacoes.origem` resolve:

- `'loja'` — veio da Nuvemshop. A rodada seguinte pode reescrever e apagar.
- `'local'` — foi criada aqui. A sincronização **não** encosta.

Uma variação local que depois aparece na loja com o mesmo nome passa a
`'loja'` pelo `ON CONFLICT`, e isso é o certo: ela deixou de ser só nossa.

**Variação local também tem id.** `local:<uuid>`, porque nome não é
identidade nem quando é o único nome que existe — alguém corrige "Dourdo"
para "Dourado" e o saldo não pode ir junto para o lixo. O id de quem já
existia é preservado em toda edição (`PUT /api/produtos/:sku/variacoes`), e
uma mudança que desfaria o vínculo de variação que existe na loja é recusada
com 409 + `precisaConfirmar: 'desvincular'` — a pessoa lê quais perderiam o
vínculo e decide.

**No cadastro, quantidade e variação não são dois campos.** Com variações
ligadas, a "Quantidade inicial" deixa de ser digitável e passa a ser a soma
das combinações. Os dois ao mesmo tempo produziriam a pergunta que ninguém
sabe responder — "quantidade inicial 6, soma 4, qual vale?" — e a resposta
errada some com duas peças de verdade.

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

## Regra de negócio recém-formalizada — fonte da verdade do físico

Formalizada em 2026-08-18, ainda sem número de seção no documento de
contexto original (*Marquesa_Sistema_Contexto_Cloud_Code.md*) — por isso
fora da tabela de referência cruzada do topo deste arquivo. Confira contra
esse documento quando ele for atualizado, e mova para a tabela com o §
certo nessa hora.

**Enquanto o inventário interno não for controlado com confiança
suficiente pelo sistema, a planilha de Estoque Total da Stéfane é a fonte
máxima da verdade para a quantidade FÍSICA TOTAL de cada SKU** — casa mais
o que está com revendedoras. Corresponde a `produtos.qtd`, nunca ao
disponível para a Nuvemshop (que continua sendo `total − consignado`,
calculado pelo sistema).

Duas consequências que o motor de reconciliação (`origem =
'planilha_estoque_total'`) já aplica:

1. A planilha nunca autoriza mexer em maleta. Se o total que ela informa é
   menor do que já está registrado com revendedoras, é uma contradição de
   dados — o sistema genuinamente não sabe qual dos dois números confiar
   — e vira conflito explícito (`total_menor_que_consignado`), nunca um
   ajuste automático de consignação.
2. SKU do catálogo ausente da planilha **não é apagado nem zerado**
   (mesma regra já valia para `importarProdutos`, "Duas divergências
   conscientes" nº 1 acima) — só anunciado. A planilha pode legitimamente
   não cobrir todo código (kit, item técnico, linha descontinuada pela
   própria Stéfane), e tratar ausência como "zero" destruiria essa
   diferença.

Regra irmã, objetivo oposto: `origem = 'planilha_produtos_novos'` só cria
SKU que ainda não existe — SKU já cadastrado é ignorado por completo,
estruturalmente, mesmo que quantidade/descrição/preço da planilha
divirjam do catálogo. Detalhe completo em
[docs/RECONCILIATION_ENGINE.md](../docs/RECONCILIATION_ENGINE.md).

Esta prioridade da planilha sobre o sistema é **temporária por
definição**: quando o inventário interno passar a ser controlado com
confiança suficiente, ele poderá substituir a planilha como fonte da
verdade física. Não é regra eterna.

### 9. Importar é analisar e depois aplicar — §19 §22

A importação de estoque total parava inteira quando a planilha trazia um
código que não existe aqui. Numa planilha de 700 linhas, dez códigos novos
não podem impedir que as outras 690 quantidades entrem.

Agora ela é lida, **classificada** e só então aplicada, com a lista que a
análise aprovou. Cada linha cai em um de cinco grupos:

| | | o que acontece |
|---|---|---|
| A | existe e está igual | nada |
| B | existe e a quantidade mudou | pronto para aplicar |
| C | não existe aqui | **não é criado**; espera em `produtos_pendentes` |
| D | existe aqui e não veio na planilha | aviso, e só |
| E | problema de verdade | sai da conta sozinho |

O grupo E é o ponto todo: um item problemático **não derruba nenhum outro**.
Quantidade escrita como "a definir", código repetido com descrições
diferentes, total menor do que já está com revendedora — cada um sai da
lista e os demais seguem.

O grupo D não zera nada. Sumir da planilha não é prova de que a peça acabou,
e apagar estoque por omissão é o tipo de erro que ninguém percebe até faltar
peça na maleta.

O grupo C é a separação que faltava: **planilha de estoque ajusta
quantidade, não cria peça.** Criar é o outro fluxo, que aprova em lote. Os
códigos novos ficam na fila com os dados que a planilha trouxe, para não
obrigar a reimportar o mesmo arquivo só por causa deles.

**O que a tela manda para aplicar é o alvo, nunca o delta.** Entre a análise
e o clique pode ter entrado uma venda de balcão; um delta calculado lá atrás
cobraria essa venda duas vezes. O alvo é estável, o delta não —
`src/catalogo-test.mjs` força exatamente esse cenário.

### 10. Revisão por exceção, nunca por item — §22 §24

Se 782 linhas estão certas, elas entram de uma vez. Só vai para revisão o
que é exceção de verdade: código vazio ou com caracteres estranhos, código
repetido com dados conflitantes, quantidade ou preço escritos como texto,
descrição ausente, categoria que não existe.

**Peça sem preço não é exceção.** O §24 já trata "sem preço" como um estado
legítimo e conhecido — diferente de R$ 0 — e a venda dela já fica bloqueada
por isso. Mandá-la para revisão seria cobrar um clique por peça justamente
no fluxo que existe para acabar com isso. Ela entra marcada, e a tela diz
quantas são.

### 11. Nenhuma sincronização sem confirmação — §5.1

`POST /api/sync/analisar` é o ensaio: abre a loja, compara com o catálogo e
**não escreve nada** — não abre execução, não puxa pedido, não grava retrato
e não manda PATCH. Ele passa pelo mesmo `empurrarEstoque` da rodada real, e
não por uma segunda regra que pode divergir da primeira.

Todos os caminhos da tela que antes sincronizavam direto passam agora pela
confirmação, que diz quantos estoques mudam, quantos sairiam do ar e quantos
não mudam por precisarem de revisão. O veredito do freio aparece **antes** do
clique, não depois.

### 12. O sistema não adivinha de quem é a foto — §22

A carga inicial de fotos vem da Nuvemshop casando por SKU exato. O que não
bate vai para `fotos_orfas` e espera alguém dizer de quem é.

Chutar seria pior que não ter foto: a loja passaria a anunciar uma peça
mostrando outra, e ninguém percebe isso olhando o painel. Pelo mesmo motivo,
a importação não sobrescreve foto que já existe aqui — a de cá é a mais nova
das duas, e substituí-la desfaria trabalho de gente.

O fundo branco é uma chamada HTTP a um serviço de fora (`FOTO_FUNDO_URL`).
Sem ele configurado, a peça fica `fundo_pendente` e **nenhuma imagem é
inventada**: uma foto que o sistema diz ter e não tem é pior que uma
faltando, porque a publicação em lote confiaria nela.

### 12b. A foto do catálogo chega sozinha, e existe UM resolvedor

**Ingestão.** As imagens da Nuvemshop são lidas e guardadas a cada rodada de
sincronização, com o mesmo catálogo que ela já leu — nenhuma segunda chamada
à loja, nenhum botão para apertar. O espelho é `loja_fotos`, e ele guarda o
que a coluna única `produtos.foto_url` perdia: `product_id`, `variant_id`,
SKU, posição, URL e qual é a **principal**.

A amarração de uma imagem a um código é por identidade, nunca por posição:
a variante declara `image_id`, e é isso que casa (é como o anel dourado e o
prateado ficam cada um com a foto certa). Quando o produto da loja junta
mais de um código nosso e a imagem não está amarrada a variante nenhuma,
`sku_norm` fica **NULL** — a recusa de adivinhar, § 12 acima.

O espelho é reescrito por produto: foto apagada na loja some daqui na rodada
seguinte. Espelho que só cresce mente.

`loja_fotos` **não** substitui o R2 nem `produtos.foto_url`. São três coisas
diferentes e o state as entrega separadas: `fotoTratadaUrl`/`fotoOriginalUrl`
(bytes nossos), `fotoUrl` (endereço que alguém gravou na peça, com origem e
data) e `fotoLojaUrl` (o que a vitrine publica hoje). Misturá-las apagaria a
diferença entre "a loja tem foto" e "nós anotamos qual é".

**Resolução.** Uma pergunta — "qual imagem representa esta peça?" — com um
lugar só para respondê-la (`resolveFotoPrincipal` / `fotoImg`), nesta ordem:

1. foto tratada (fundo branco) nossa;
2. foto original nossa;
3. endereço gravado na peça;
4. foto da vitrine, lida do catálogo;
5. placeholder — **nunca** o ícone de imagem quebrada do navegador.

Tabela de Estoque, Editar peça e os cartões de Pendências pedem ao mesmo
lugar. Cada tela montando a sua foi o que fez a mesma peça aparecer num
lugar e quebrar no outro.

O link do R2 vem do servidor como caminho relativo e é resolvido contra o
endereço da API antes de virar `src`: o painel (Pages) não mora na origem da
API (Worker), e caminho relativo ali resolve contra a página — toda foto
nossa virava imagem quebrada enquanto a da loja aparecia.

**Tratamento não mora no Estoque.** Estoque cadastra, organiza, associa e
edita dados da peça. Gerar o fundo branco é preparação para publicar, e fica
em Pendências, ao lado de preço, categoria e descrição.

### 13. O agente prepara; quem publica é a tela — §22

`GET /api/catalogo/publicacao` é a leitura que o agente de catálogo usa: o
que está pronto para subir e, em quem não está, o que exatamente falta —
foto, fundo branco, descrição, categoria, preço.

É uma leitura de propósito. O agente pode preparar tudo, mas a publicação e
a sincronização continuam passando pela aprovação explícita no painel.

### 14. Bytes no R2, referência no D1 — arquitetura

O D1 nunca guarda a imagem em si. `produtos` tem `foto_original_key` e
`foto_tratada_key` — a chave de um objeto no bucket R2 (binding `FOTOS`) —
mais tipo, tamanho e estado. Quem lê e escreve o bucket é só
`fotos-storage.js`; o resto do sistema não sabe como o R2 funciona, só que
existe uma chave ou não existe.

A chave é determinística por SKU e versão (`produtos/<sku>/original` ou
`.../tratada`, sem timestamp): trocar a foto sobrescreve o mesmo objeto, em
vez de acumular lixo órfão a cada re-upload. Trocar a ORIGINAL apaga a
tratada — do R2 e do D1 — pelo mesmo motivo de sempre: o fundo branco é
daquela foto, não da nova, e uma tratada desencontrada mandaria a peça
errada para a loja sem ninguém perceber.

A importação de fotos da Nuvemshop e a adoção de uma foto órfã não gravam
mais a URL externa como se fosse a foto: elas BAIXAM os bytes e copiam para
o R2 na hora. A partir daí a peça é dona da própria imagem — a Nuvemshop
pode reorganizar o catálogo dela sem que uma foto nossa suma. Uma imagem
que não baixa não trava as outras 400 do mesmo lote (`falhas` no retorno
diz quais).

### 15. O navegador não manda a chave da API — link assinado

Uma tag `<img src>` não consegue mandar `Authorization: Bearer`. As duas
rotas de leitura de foto (`GET /api/produtos/:sku/foto/original|tratada`)
por isso não passam pelo `checarChave` comum — igual o callback de OAuth da
Nuvemshop já não passa, e pelo mesmo motivo: quem chama não é o painel
autenticado, é outra coisa que precisa de outra prova.

A prova aqui é uma assinatura HMAC com prazo curto (`assinatura.js`),
calculada com a própria `API_KEY` e embutida no link que `montarState`
gera. Sem a chave não dá para forjar um link; um link que vazou expira
sozinho; e como o `state` é recarregado com frequência, o link se renova
sem ninguém perceber que existia um prazo.

### 16. Peça sem preço pode ser cadastrada — nunca publicada — §24

O §24 já bloqueava a *venda* de peça sem preço. Cadastrar continua livre —
uma peça pode entrar no catálogo sem preço definido, e o aviso
`sem_preco` avisa sem impedir (`catalogo.js › cadastrarNovos`,
`analisarNovos`).

Publicação é outra história, e agora é bloqueada nos dois lugares que
decidem o que subir:

- `pendenciasDePublicacao` nunca põe peça sem preço em `prontos` — mesmo
  com foto, fundo branco, descrição e categoria perfeitos, ela cai em
  `semPreco` e fica lá.
- `analisarSincronizacao` nunca põe peça sem preço em `criarNaLoja` — ela
  vai para `bloqueadosSemPreco`, separada, e não é contada como candidata
  pronta nem escondida da pessoa.

Faltar preço não é uma pendência igual às outras (foto, descrição,
categoria): é a única que bloqueia de verdade, porque publicar sem preço
não é uma opção que só falta confirmar — Nuvemshop nenhuma vende peça sem
preço, e fingir que está pronta seria mentir sobre o que aconteceria ao
confirmar.

### 18. Quantas maletas cabem — a conta e os dois números que a decidem

Duas chaves em `config`, ambas em PEÇAS, absolutas e globais:

- `maletaAlvoPecas` — quantas peças uma maleta costuma levar (padrão 100);
- `reservaMinima` — quantas peças ficam em casa, no total (padrão 300).

A conta é declarada na própria tela, e não escondida:

```
em casa − reserva mínima = utilizável
utilizável ÷ peças por maleta = maletas que cabem
```

"Em casa" é `disponivel` — o total menos o que já está consignado. Não é o
estoque do catálogo: peça que está com revendedora não pode ser montada
de novo em outra maleta.

**A reserva não é enfeite.** Sem peça em casa não há venda de balcão, não há
reposição de maleta que voltou furada e não há atendimento para a cliente
que aparece. Um algoritmo que responde "dá para montar 11 maletas" zerando a
casa está com a conta certa e a decisão errada — a reserva é o que separa as
duas coisas.

É estimativa por QUANTIDADE. Montar a maleta continua sendo escolha de peça,
na aba da revendedora — a conta diz se cabe, não o que vai dentro.

### 19. Desempenho de revendedora sai do histórico, nunca da maleta de hoje

`maletas.acerto_json` já guardava o acerto inteiro — enviadas, devolvidas,
vendidas, total vendido, comissão, líquido, dias. O painel lia menos da
metade disso, e não existia nenhuma leitura de desempenho.

O Top Revendedoras agrega os ciclos ENCERRADOS de cada pessoa:

- **vendido** — soma de `totalVendido`;
- **peças vendidas** — soma de `vendidas`;
- **giro** — vendidas ÷ enviadas. É a medida que compara pessoas de
  tamanhos diferentes sem premiar quem simplesmente leva mais;
- **ticket** — vendido ÷ peças vendidas;
- **ciclos** e **último acerto**.

Quem não tem ciclo encerrado **não entra no ranking**, e a tela diz isso com
todas as letras. Ordenar pelo valor da maleta atual mediria quem recebeu a
maleta maior, não quem vende — e um ranking assim é pior que nenhum, porque
parece informação.

### 20. Importar Anexo I é analisar e depois confirmar — §19 §22

A importação de maleta era o último caminho que ainda aplicava direto: lia o
arquivo, criava os códigos que faltavam e movimentava as peças no mesmo
clique. Uma planilha errada virava consignação errada, e desfazer
consignação é movimento contra movimento.

Agora são dois atos, como a importação de estoque total já era:

1. **ler** (`lerMaleta`) — devolve o laudo: quantas peças, quantos códigos,
   para quem, se vai para a maleta aberta ou cria uma nova, quais códigos o
   catálogo não conhece, onde o preço do documento briga com o nosso, e a
   data que o Anexo declara. **Nada é gravado.**
2. **aplicar** (`aplicarMaleta`) — recebe o laudo, não o arquivo. O que
   entra é exatamente o que a pessoa viu na tela.

Nenhuma das duas resolve divergência sozinha: o preço do catálogo continua
mandando (o documento não muda cadastro), e o código desconhecido é criado
com 0 — a tela avisa que a peça vai sair de um saldo que ainda não existe,
e oferece cancelar.

**Exportar o Anexo I em arquivo está BLOQUEADO** enquanto o modelo
operacional original não estiver no repositório. Ver `docs/TECH_DEBT.md`
item 15. `printAnexo()` (impressão) continua como estava.
