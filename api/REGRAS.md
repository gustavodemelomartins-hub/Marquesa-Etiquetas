# Onde cada regra do documento vive no código

Referência cruzada entre o documento de contexto da operação
(*Marquesa_Sistema_Contexto_Cloud_Code.md*) e a implementação da API.
Serve para conferir se uma mudança futura quebra alguma regra combinada.

| Documento | Regra | Onde está |
|---|---|---|
| §4 | Categorias configuráveis | tabela `categorias`, `GET/POST /api/categorias` |
| §4 | A categoria sobrevive ao próprio nome | `categorias.id`; `PATCH /api/categorias/:id` |
| §4 | "Sem categoria" não é "Outros" | `categorias.sentinela = 1` |
| §24 | Preço zero não é publicável | `catalogo/completude.js › temPreco` |
| §24 | "Peça completa" tem um dono só | `catalogo/completude.js › faltasDaPeca` |
| §22 | Foto nunca é atribuída por palpite | `catalogo/nome-de-arquivo.js`; ambíguo para |
| §28 | O original da foto nunca é sobrescrito | `produto_fotos.original_key` por foto |
| CAT-06 | Nada publica sem aprovação humana | `publicador.js`; três travas fail-closed |
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
| §28 | Não apagar histórico | revendedora arquiva, maleta cancela, venda estorna, cliente com histórico arquiva (§48) |
| §29 | Receber uma dívida não movimenta estoque | `historico_operacoes.cobranca_status` |
| §19 | Inventário não corrige em silêncio | `concluir` só compara; aplicar a diferença é ato separado, item a item |
| §19 | Não contado nunca é zero | ausência de linha em `inventario_contagem`; zero exige gesto explícito |
| §2 | Contagem de SKU com variação exige identidade | `contarItem` recusa contagem agregada e devolve a régua |
| §5.2 | Inventário cobra só o que está em casa | `inventario.js › SQL_ESPERADO` desconta o consignado |
| §6.1 | Esperado congelado no fechamento | `inventario_resultado`, por variação |
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
| §61 | Loja recebe o saldo EM CASA, absoluto, pela fila | `nuvemshop-estoque.js › processarFila`; gatilhos em `migracao-nuvemshop-fila.sql` |
| §61 | Kill switch do envio de estoque | `config.nuvemshopSyncAtivo` (ausente = desligado) |
| §62 | Peça nasce OCULTA na loja; só o clique publica | `catalogo/nuvemshop-catalogo.js › criarOcultos`, `publicarNaLoja` |
| §62 | Kill switch do catálogo oculto | `config.nuvemshopCatalogoAtivo` (ausente = desligado) |
| §63 | Venda concluída sem variação é histórico, não pendência | `pendencias.js › listarPendencias` → `historico` |
| §63 | Publicar em lote = um por vez, cada um revalidado na loja | `frontend/src/features/publicacao/lote.ts` → `publicarNaLoja` |
| §64 | Categoria e atributo canônicos numa fonte só | `catalogo/taxonomia.js` |
| §64 | Variação daqui que falta na loja é criada com estoque 0 | `catalogo/nuvemshop-catalogo.js › criarVariantesFaltantes` |
| §64 | Repartição só com a prova do inventário | `catalogo/reparticao-inventario.js` → `distribuirVariantes` |

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
compara e CONGELA o resultado; aplicar a diferença é um segundo ato,
explícito, item a item, e nunca "todos".

A razão prática é mais forte que a formal: peça faltando quase nunca sumiu.
Está na bolsa, foi para a maleta sem lançar, ou a etiqueta não leu. Se o
sistema corrigisse sozinho, o erro de contagem viraria a nova verdade sem
deixar rastro.

**Decisão humana de 10/09/2026** — o que a contagem passou a saber.
Desenho completo em `docs/domains/INVENTARIO-4-4.md`.

*A contagem é pausável.* Ela pode durar dias. Cada bipe é gravado na hora,
em `inventario_contagem`, e retomar preserva tudo. Pausar não trava venda
nem maleta: é isso que cria a deriva tratada mais abaixo.

*Não contado nunca é zero.* Existe linha = foi contado. Não existe linha =
não foi contado. Zero é um resultado — "conferi, não tem nenhuma" — e exige
um gesto próprio. Item não conferido **não** entra em correção em lote e
**não** aparece como faltante: sem essa trava, um inventário interrompido
zeraria meio catálogo por movimentação registrada.

*Código com variação cadastrada exige a variação.* A API recusa contagem
agregada e devolve a lista cadastrada dentro do erro. Sem identidade não há
movimento: era exatamente por aqui que o inventário fabricava movimento
incompleto novo (§2 — não se chuta a distribuição de uma variante).
**"Não sei" é resposta válida**: fica registrada, bloqueia a correção
daquele código inteiro e não vira nada.

*A comparação é retroagida.* Contar na segunda, vender duas na quarta e
fechar na sexta não é divergência: o esperado comparável desconta os
movimentos posteriores à contagem, que estão registrados com `criado_em`.
Ler o que está registrado não é adivinhar. Quando o movimento do intervalo
não tem identidade suficiente para provar de qual variação saiu, a linha vai
para `nao_comparavel` com o motivo por extenso — e não vira nada.

*A diferença é uma saída sem faturamento (§30).* Negativa vira
`tipo='perda'`, `sentido='saida'`; positiva vira o **mesmo** mecanismo com
`sentido='entrada'`. As duas ficam presas ao `inventario_id`, com observação
opcional, movimento correspondente e estorno possível. A **origem** do
movimento é `inventario`: o motivo diz que é diferença, a origem diz que o
fato nasceu de uma contagem física. Corrigir um engano é **estornar**, nunca
lançar um ajuste compensatório solto.

*Aplicar duas vezes é recusado pelo banco.* `idx_saida_inventario_unica`
vale sob crash-e-retry e sob duas abas abertas — o que um flag lido e
escrito no mesmo batch não garantia. Depois do estorno, o relançamento volta
a ser permitido, com o valor certo. E a quantidade aplicada vem sempre do
retrato congelado: número enviado pelo cliente é ignorado, porque já foi
decidido no fechamento.

Provado em `src/inventario-4-4-test.mjs` (contra o schema real) e
`scripts/inventario-tri-estado.test.mjs` (as travas no código).

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

### 4b. Pedido anterior ao corte é história, não venda — §22

`vendas.externo_id` impede **repetir** um pedido que já entrou. Ele não diz
nada sobre um pedido que **nunca** entrou: para o banco, ele é novo, e a
rodada o transformaria em venda com baixa de estoque.

Isso deixou de ser hipótese no go-live de 2026-08-22. A operação real passou
a viver num banco novo (`marquesa-db-prod`), e a loja continuou com pedidos
antigos que ali nunca foram vendas — peças que já saíram por outro caminho,
e cujo estoque cairia duas vezes.

A regra: **`config.syncCorteEm` divide o tempo em história e operação.**

- pedido criado **antes** do corte não vira venda, e vai para
  `relato.pedidosAntesDoCorte` com id, número, data, status e motivo;
- pedido criado **a partir** do corte entra sempre — o corte nunca pode
  impedir o registro de uma venda de verdade;
- pedido **sem data legível** é barrado: não dá para provar que é posterior;
- `syncCorteEm` ilegível **derruba a rodada**, em vez de virar "sem corte"
  em silêncio;
- sem `syncCorteEm`, nada muda: é exatamente o comportamento anterior.

Uma **data**, e não uma lista de IDs: lista resolve hoje e mente amanhã. E
não é um ajuste na janela de 6 horas — a janela é uma folga **para trás**,
que existe para não perder pedido atrasado, e alargar ou encurtar ela para
resolver histórico estragaria a função dela.

Escrita por `PUT /api/config`, lida em `sync.js › corteDePedidos`, visível em
`GET /api/state › config.syncCorteEm`. Prova: `src/corte-pedidos-test.mjs`.

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
[docs/domains/RECONCILIATION_ENGINE.md](../docs/domains/RECONCILIATION_ENGINE.md).

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
todas as letras.

Os ciclos são os de `acertosDeMaleta`: acerto do sistema (`acerto_json`) e
acerto documental (histórico de vendas), cada um contado uma vez. O
documental só sabe quantas peças foram enviadas quando a maleta que ele
encerrou está registrada; um acerto anterior ao sistema não diz. Por isso o
**giro só aparece quando TODO ciclo da revendedora tem a maleta** — uma
razão calculada sobre parte dos ciclos seria outro número com o mesmo nome.
Revendedora **inativa continua no ranking e no histórico**: inativa é o
estado do cadastro, não apaga o que ela vendeu (27/09/2026). Ordenar pelo valor da maleta atual mediria quem recebeu a
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
operacional original não estiver no repositório. Ver `docs/architecture/TECH_DEBT.md`
item 15. `printAnexo()` (impressão) continua como estava.

### 21. A venda histórica é reconstruída, e a regra vem escrita junto — §22

**Decisão anterior, superada em 2026-08-28.** Quando a planilha
`Vendas Marquesa.xlsx` foi importada, o sistema recusou contar pedidos e
ticket médio históricos: a coluna `Nº` numera **linhas** (1 a 1.341, sem
repetir), não pedidos, e sem regra de agrupamento validada qualquer ticket
médio seria artefato da importação. A recusa estava certa para o que se
sabia. Junto dela vinha uma inferência: "uma cliente com 36 linhas na mesma
data é acerto de maleta, não uma compra". **Essa inferência estava errada.**

O dono do negócio esclareceu como a operação funcionava. A regra é:

> **Mesmo cliente normalizado + mesma data = UMA venda histórica.**
> As linhas daquele grupo são os itens dela.

Uma cliente que aparece 36 vezes em 13/06/2026 comprou 36 peças numa venda
só — não fez 36 compras, e não é acerto. **O tamanho do grupo não classifica
a operação.** O que não é venda vem **escrito na planilha**, na coluna
`Observação Venda`: `PERDIDO`, `ACHO QUE FOI VENDIDO`, ajuste, correção. Só
isso vira `classe='ajuste'`, e só isso sai do faturamento. Nesta base são
3 linhas, todas do "cliente" `Inventário` — nenhuma delas grande.

**O bruto não é tocado.** As 1.341 linhas continuam em
`vendas_historico_itens`, com os campos `*_original` como estavam na célula.
A venda vive numa camada **derivada** (`vendas_historicas`), descartável por
construção: `reconstruir()` apaga e refaz, e o resultado é idêntico a cada
rodada porque a regra é determinística. Cada venda guarda os `Nº` das linhas
que a formaram e a regra que a agrupou — de qualquer número do painel dá
para chegar de volta às células.

**Duas travas de honestidade:**

- **Linha sem data** não pode ser agrupada por data. Vira venda própria,
  marcada, e **fica fora do ticket médio** — não se sabe se ela era parte de
  outra compra. São 15 linhas em 1.341.
- **Ticket médio** = faturamento das vendas **pagas elegíveis** ÷ número
  dessas vendas. Elegível = paga por inteiro, com data conhecida, sem item
  de valor desconhecido. Venda pendente, parcial, sem data ou ajuste fica de
  fora. Misturar as populações daria um número menor e sem significado.

Nada disso movimenta estoque. Agrupar linhas que já existiam não cria nem
consome peça física; a invariante `produtos.qtd == SUM(movimentos.qtd)` não
é tocada.

Implementado em `api/src/vendas-historicas.js`; provado em
`src/vendas-reconstrucao-test.mjs`.

### 22. Categoria vem do catálogo ou do nome — nunca do material

`vendas_historico_itens.tipo` guarda **material**: `Prata 925`, `Aço Inox`,
`Banhada`, `Bruto`. O painel usava esse campo como categoria quando a peça
não estava mais no catálogo, e a rosca "Distribuição por categoria vendida"
somava `Banhada 445` e `Bruto 227` ao lado de `Brinco 153` — duas dimensões
diferentes no mesmo total, respondendo uma pergunta que ninguém fez.

62% das linhas do histórico (833 de 1.341) são de peças fora do catálogo
atual, então isso não era um caso de borda: era a maior parte do gráfico.

A ordem correta é: **`produtos.cat` quando a peça existe hoje** (é cadastro,
alguém decidiu), e **a primeira palavra do nome histórico quando não existe**
(é leitura, mas é a categoria certa: "Brinco Maxi…", "Colar Cordão…"). Sem
reconhecer a palavra, `Outros` — nunca um chute pela segunda palavra.

A tabela de palavras existe em dois lugares: `api/src/categoria-nome.js`
(fonte da verdade para relatório) e `CAT_MAP` em `src/dashboard.tpl.html`
(classifica planilha no navegador, sem rede). A duplicação é **declarada e
verificada**: `src/categoria-nome-test.mjs` lê as duas e falha se
divergirem.

### 23. O papel pertence à operação, não ao nome da pessoa

A planilha histórica tem uma coluna para quem levou a peça, mas a mesma
pessoa pode ter comprado como cliente e, em outra data, acertado uma maleta.
Evelyn, Andréia e Jéssica são casos reais dessa mudança de papel.

Por isso o cadastro da pessoa não classifica toda a vida dela. A decisão
fica em `historico_operacoes.papel`, por `venda_chave`, com evidência. Sem
decisão explícita, a venda histórica continua cliente; nome, quantidade de
linhas e a palavra “Maleta” nunca promovem a pessoa inteira a revendedora.

O dinheiro não some. O acerto entra uma vez no faturamento pelo líquido da
Marquesa, mas aparece em **Revendedoras › Visão geral**. Compra pessoal entra
em **Vendas › Clientes**. A mesma operação não pode aparecer nos dois lugares.

Venda operacional que já está na planilha não é cancelada, pois seus
movimentos são a saída física verdadeira. O vínculo em
`historico_operacao_vendas` remove somente a segunda representação dos
analytics e impede vincular a mesma `vendas.id` duas vezes.

### 24. Acerto histórico usa o documento da maleta, não estimativa

Quando existe planilha da maleta, ela é a fonte documental do acerto:
`bruto − comissão = líquido`. Os três valores e a quantidade vendida ficam
congelados em `historico_operacoes`, junto ao arquivo e às linhas que os
provam.

Sem documento, a operação fica em `papel='revisao'`; o painel anuncia a
pendência e não inventa comissão. Acerto fechado pelo sistema continua lendo
`maletas.acerto_json`, que já guarda a comissão real. Andréia M2 existe só
nesse caminho operacional; importar o documento da M1 não a duplica.

### 25. Trocar a planilha do histórico é uma operação só — nunca "importar de novo"

A trava de idempotência da importação é o **hash do arquivo**: o mesmo
arquivo não entra duas vezes. Um arquivo **diferente** entra sem reclamar —
e é exatamente o caso de quem corrigiu o sobrenome de uma cliente e
reexportou a planilha. As 695 vendas antigas e as 696 novas se somariam, e o
faturamento dobraria **sem nenhum erro na tela**.

Então trocar não é importar por cima. `POST /api/vendas/historico/substituir`
reverte o que está de pé e importa o novo, com o antes e o depois na mesma
resposta. A ordem é deliberada:

1. **analisa primeiro.** Arquivo ilegível, cabeçalho trocado ou planilha
   vazia param aqui, com o histórico antigo **intacto**;
2. a mesma planilha que já está no ar é **recusada** — não se derruba o
   histórico para recolocar o que já estava lá;
3. só então reverte e importa.

Se a importação falhar depois da reversão, a resposta diz **quais lotes
foram revertidos e de qual arquivo**: reverter libera o hash (o índice único
só vale para lote `importado`), então reimportar a planilha antiga é um
caminho de volta que existe de verdade.

**A reversão preserva o cadastro digitado à mão.** Cliente criada pela
importação e sem nenhum campo preenchido some, como antes; cliente com
telefone, CPF, cidade, email, instagram, nascimento ou observação **fica**.
A linha da planilha volta na importação seguinte; o telefone não volta de
lugar nenhum.

Estoque: nada, dos dois lados. A importação nunca criou movimento, então não
há o que desfazer.

Implementado em `api/src/vendas-historico.js › substituirHistorico`,
`retratoDoHistorico`; provado em `src/trocar-planilha-test.mjs`.

### 26. A venda de balcão abre a ficha da cliente

A venda gravava o **nome** e ia embora. O painel dizia, num comentário, que
"se o nome for novo, o servidor cria" — e o servidor não criava. Duas
consequências:

- vender para alguém pela primeira vez não abria ficha nenhuma, então na
  segunda venda o autocompletar não a encontrava (não havia o que
  encontrar), e não havia onde guardar o telefone dela;
- `vendas.cliente_nome_norm` só nascia no `backfillNormalizacao` que roda
  depois de uma importação de planilha. Até lá a venda do dia ficava com a
  chave de agrupamento nula e o painel a contava em "sem-nome", separada do
  histórico da mesma pessoa.

Agora `registrarVenda` grava a chave normalizada **na venda** e resolve a
ficha, com uma regra que não chuta identidade:

| cadastros com aquele nome normalizado | o que acontece |
|---|---|
| exatamente um | a venda se amarra a ele |
| nenhum | cria, com `origem='manual'` |
| mais de um | **não escolhe** — a venda segue pelo nome, como já seguia |

`origem='manual'`, e não um valor novo, é o que garante que reverter um lote
de planilha (§25) nunca apague uma cliente que nasceu de uma venda de
verdade: a reversão só toca em `origem='historico'`.

O autocompletar do campo, do outro lado, passou a **consultar o servidor
enquanto se digita** (`GET /api/clientes?busca=`). Ele carregava as 50
primeiras clientes em ordem alfabética, uma vez ao abrir o modal, e nunca
mais perguntava nada: com 338 clientes cadastradas, quem vem depois do "C"
não existia para a tela.

Provado em `src/e2e.mjs`, no fluxo de venda de verdade.

### 27. O preço da peça na venda é o COBRADO — e o desconto diz por quê

A planilha dela sempre teve uma coluna Desconto, preenchida à mão: "R$10 de
Desconto", "5% de desconto". O importador lê isso desde sempre e guarda em
`vendas_historico_itens.desconto_valor / _pct / _rotulo`.

A venda de balcão — a tela feita para SUBSTITUIR a planilha — não sabia nada
disso. `registrarVenda` descartava qualquer preço vindo da tela e gravava o
do catálogo:

```js
linhas.push({ sku, qtd, preco: s.preco, ... });   // s.preco = catálogo
```

Efeito: dar desconto era possível no balcão e impossível no sistema. A venda
entrava pelo preço cheio e o faturamento nascia acima do que entrou no caixa,
sem erro na tela e sem rastro no banco.

**A regra agora:**

| | |
|---|---|
| `preco` | o que foi **cobrado**. É o que soma o total, como sempre foi |
| `preco_tabela` | o catálogo **no momento da venda**. Gravado SEMPRE |
| `desconto_valor` | `preco_tabela - preco`. NULL quando não houve alteração |
| `desconto_rotulo` | o motivo, como ela escreve: "Grupo VIP" |

**Ela digita o preço final, não o abatimento.** É como ela fala no balcão
("vou fazer por 65"). O desconto é derivado, então não existe o estado em que
os dois números se contradizem.

**O motivo é obrigatório quando o preço muda**, e não é burocracia: preço
diferente sem motivo é indistinguível de erro de digitação, e sem ele o
dinheiro sai do faturamento sem deixar rastro de quanto, para quem, por quê.
A tela recusa antes de mandar; o servidor recusa de novo, com 409. Zero COM
motivo é aceito — brinde existe.

**`preco_tabela` é gravado mesmo sem desconto.** Sem ele, um reajuste de
catálogo no mês que vem faria o desconto de hoje parecer outro número.

**O catálogo NÃO é reprecificado.** O desconto é desta venda. Editar o
cadastro a partir da tela de venda mudaria, em silêncio, o preço de toda
venda futura da peça.

**O estoque não muda.** Desconto é dinheiro, não peça — §1 continua valendo
inteiro, e o teste prova que a baixa é a mesma com e sem desconto.

**O passado não é reescrito.** Venda registrada antes desta regra fica com
`preco_tabela` NULL, e é assim que se lê "esta venda é anterior à regra". Não
dá para saber hoje quanto de desconto ela deu numa venda que o sistema gravou
pelo preço cheio, e inventar o número seria pior que admitir que não se sabe.

**Só a venda de balcão — e agora se sabe por quê.** A pendência que este
parágrafo registrava ("o desconto no acerto muda a base da comissão, e isso é
decisão de negócio a combinar") **fechou em 11/09/2026**: no acerto de maleta
não existe desconto de revendedora a aplicar, porque o acerto é sempre pelo
preço cheio. Ver **§45**. O acerto continua como está — e agora por regra, não
por falta de resposta.

Migration: `api/migracao-venda-desconto.sql`. Provado em
`src/venda-desconto-test.mjs` (a regra) e em `src/e2e.mjs` (o lápis na tela,
do clique até o banco).

### 28. A venda pode ser de ontem — nunca de amanhã

`registrarVenda` fazia `const data = hoje()`, sem alternativa. Quem vendeu no
sábado e só foi lançar na segunda não tinha caminho nenhum: a venda entrava
com a data errada ou não entrava. E, como a lista de vendas é filtrada por
dia, ela também não reaparecia onde a pessoa foi procurar.

**A data agora vem no pedido**, com duas travas:

| | |
|---|---|
| ausente | vale hoje, como sempre valeu |
| formato ≠ `AAAA-MM-DD` | 400 |
| **futura** | 400 — venda que ainda não aconteceu é erro de digitação, e aceitá-la contaminaria o faturamento do mês que vem |
| passada | livre. É o caso de uso |

A tela põe `max` no campo e diz por extenso quando não é hoje ("Venda de
sábado, 30/08/2026 — não é hoje"). A trava da tela é conveniência; a
garantia é o servidor.

**`movimentos.criado_em` continua sendo AGORA, e isso é o correto.** A venda
aconteceu no sábado; o sistema soube na segunda. As duas datas são
verdadeiras e dizem coisas diferentes — quem audita a peça precisa das duas.
O movimento carrega `· venda de AAAA-MM-DD` na observação quando as duas não
coincidem.

**Depois de registrar, a tela vai para o dia da venda.** Registrar a venda de
sábado e cair na lista de hoje faz a venda parecer não ter entrado — e é
exatamente ali que ela procuraria o botão de cancelar se tivesse errado.

**Cancelar já existia e continua igual** (§28 de sempre: cancela, não apaga).
As peças voltam por um movimento de `cancelamento`, a venda fica marcada e o
histórico não se perde. Cancelar duas vezes devolve 409 — a peça não volta
duas vezes.

Provado em `src/venda-desconto-test.mjs` (a regra, incluindo o cancelamento
idempotente) e em `src/e2e.mjs` (a venda de ontem pela tela, a lista indo
para o dia certo, e o cancelamento devolvendo a peça).

### 29. Conta a receber é dinheiro pendente, não peça pendente

Venda histórica não paga mostra o **valor efetivamente cobrado**, inclusive
desconto, e não `valor_pago = 0`. O saldo inicial é `valor_total − valor_pago`
da fonte. Canal, contexto e observação permanecem visíveis; prazo ausente é
“sem prazo definido”, nunca uma data inventada.

Marcar “PAGO” exige confirmação e cria nova versão da decisão financeira em
`historico_operacoes`. Retry é inofensivo e versão concorrente devolve 409.
Essa ação não chama `movimentar`, não altera `produtos.qtd` e não rebaixa a
venda: receber o dinheiro não faz a peça sair de novo.

Somente `papel='cliente'` gera conta a receber. Acerto de revendedora, troca
excluída do documento, ajuste e operação em revisão não viram dívida de
cliente. O painel soma apenas cobranças abertas e deixa cada nome navegar
para a ficha da cliente.

### 30. A data da venda e a data do pagamento são duas datas diferentes

Uma venda tem duas datas verdadeiras, e elas respondem perguntas diferentes:

- **`data`** — o dia em que a venda aconteceu. É **imutável**. Governa o
  histórico do dia, a contagem de vendas, peças e clientes.
- **`data_pagamento`** — o dia em que o dinheiro entrou. Governa o
  **faturamento**.

Vender em 15/07 e receber em 04/09 significa: a venda continua sendo de
julho, e os R$ 100 entram no faturamento de **setembro**. Antes de §30 isso
não tinha como ser dito — `vendas` só tinha `data`, e toda venda operacional
era contada como paga no dia da venda.

`pago` nasce **1** e `data_pagamento` nasce igual a `data` em toda venda que
já existia: é o que o sistema assumia, e um default diferente teria movido
faturamento real de mês na migration.

Marcar como paga:

- grava `data_pagamento`, **não** altera `data`;
- **não** chama `movimentar` e **não** altera `produtos.qtd` — a peça saiu
  quando a venda foi registrada, e baixar de novo seria a segunda baixa da
  mesma peça;
- é recusada na segunda vez (409), então o retry do clique não dobra receita.

Pagamento anterior à venda é recusado: receber antes de vender é erro de
digitação, e inverteria os dois números em qualquer relatório mensal.

Do lado histórico, `paga_em` só governa o faturamento quando a cobrança
nasceu **aberta** e foi paga depois. A venda que a planilha já trouxe paga
não tem essa data e continua faturando no dia da venda, onde sempre esteve.

O recorte de período passou a ser duplo: a linha entra quando a venda **ou**
o pagamento cai na faixa, e cada número escolhe qual data o governa. Com
`periodo=tudo` os dois predicados viram `1` e nenhum número muda — que é o
que garante que a separação não reescreveu o passado.

Provado em `src/pacote-vendas-test.mjs`, cenários A e B.

### 31. Peça que sai do estoque nem sempre é venda

Cinco saídas, e só a primeira é venda:

| Saída | Estoque | Venda | Cliente | Faturamento |
|---|---|---|---|---|
| Venda | baixa | sim | sim | quando paga, na data do pagamento |
| Brinde | baixa | **não** | **não** | **não** |
| Uso próprio | baixa | **não** | **não** | **não** |
| Diferença de inventário / perda | ajusta | **não** | **não** | **não** |
| Sorteio | baixa | **não** | **não** | **não** |

Brinde, uso próprio, diferença de inventário/perda e sorteio moram em
`saidas_sem_faturamento`, **não** em `vendas`. Não é preferência de
organização: a linha que não está em `vendas` é invisível por construção
para toda soma de venda. Pendurá-las numa venda obrigaria cada consulta de
faturamento a lembrar de excluí-las, e a que esquecesse voltaria a
contaminar o número — que é exatamente como "Brinde dia das mães" virou uma
cliente no ranking.

Nenhuma delas cria cliente fictício. O estoque sai por `estoque.js ›
movimentar` como qualquer outro movimento, e `movimento_id` amarra a linha
ao movimento que a explica.

Só a diferença de inventário pode **somar** peça (`sentido='entrada'`):
brinde, uso próprio e sorteio sempre saem. Saída sem motivo nem observação é recusada
— saída sem explicação não se audita seis meses depois, a mesma regra do
desconto em §27.

**Corrigir é estornar, nunca apagar.** O estorno cria um segundo movimento
que devolve a peça e mantém a linha no histórico, com data e motivo.
Estornar duas vezes é recusado.

Provado em `src/pacote-vendas-test.mjs`, cenários D, E, E.2, F e K.

### 32. Garantia é do ITEM da compra — e troca não é venda nova

> ⚠️ **A segunda metade deste título deixou de valer em 05/09/2026.** A
> Sthefany definiu que a peça que entra numa troca sem conserto PASSA a ter
> registro comercial próprio. O texto abaixo continua descrevendo tudo o que
> não mudou — e o que mudou está em **§37**, logo depois. O dinheiro é o
> mesmo nos dois: entra a diferença, nunca o preço cheio.


A garantia pertence à **linha da compra**, não ao cliente e não ao código. Se
a mesma cliente comprou o mesmo anel três vezes, prender a garantia ao SKU
perde qual compra a originou — e perde junto o **valor efetivamente pago**,
que é a base da diferença de uma troca. Usar o preço de tabela cobraria a
mais de quem comprou com desconto.

A identidade do item é `venda_itens.id` no lado operacional e
`vendas_historico_itens.id` no lado da planilha. Até a Fase 5.2 `venda_itens`
não tinha chave própria e a identidade era o trio
`(venda_id, sku, variante_id)`; a Fase 5.2b migrou o ponteiro da garantia. O
trio permanece gravado como prova de como a garantia foi aberta, mas **não é
mais identidade**: §27 permite duas linhas do mesmo código na mesma venda, e
§41 reescreve o código do item.

A garantia que o backfill não conseguiu apontar com certeza ficou marcada
`ambiguo` ou `sem_match` em `venda_item_vinculo`, sem ponteiro — o sistema
não escolheu entre duas peças possíveis. `GET /api/garantias/vinculos` lista
esses casos com as candidatas ao lado.

**A garantia é por UNIDADE FÍSICA** (decisão de 12/09/2026). Duas unidades do
mesmo código na mesma compra têm `venda_itens.id` diferentes e podem ter
garantias abertas ao mesmo tempo: são duas peças, e cada uma quebra por
conta própria. A mesma unidade continua não abrindo duas vezes. A garantia
antiga **sem ponteiro confiável** trava o código inteiro daquela compra, como
antes da 5.2b — ela pode ser de qualquer uma das unidades, e adivinhar qual
seria o chute que §2 proíbe.

O que a garantia **não** faz, em nenhum estado:

- não altera a venda original — nem total, nem itens, nem data;
- não devolve a peça defeituosa ao estoque vendável: ela está quebrada, e
  somá-la ao disponível a colocaria à venda de novo;
- não gera faturamento. Nem a abertura, nem a devolução, nem a troca.

Prazo: **45 dias úteis**. Sábado e domingo nunca contam. Feriado conta
quando cadastrado em `feriados` — e quando a tabela está vazia a resposta diz
`consideraFeriados: false` em vez de fingir precisão que não tem. Nenhum
feriado é escrito no código.

**O relógio para quando o caso encerra.** Enquanto a garantia está aberta o
atraso é real e continua contando; a partir do encerramento o que vale é
quanto o caso demorou, medido até o dia em que terminou. Sem isso uma peça
entregue dentro do prazo aparecia "atrasada 134 dias úteis" meses depois, com
o número crescendo sozinho na ficha da cliente. A resposta diz qual régua
usou, em `contadoAte` e `relogioParado`.

**A troca.** Sem conserto, sai uma peça nova do estoque — com movimento de
tipo `troca` e origem `troca_garantia`, nunca `venda`. Trocar um anel de
R$ 89 por um de R$ 99:

- a peça nova baixa 1 do estoque;
- **nada** entra no faturamento naquele momento;
- a diferença de **R$ 10** fica a receber;
- quando paga, entram **R$ 10** — pela data do pagamento (§30), nunca os
  R$ 99, e sem contar como uma segunda compra da cliente.

### A peça nova mais barata vira CRÉDITO da cliente

Decisão da Sthefany, **12/09/2026**. Trocar uma peça de R$ 100 por uma de
R$ 80 deixa **R$ 20 de crédito para a cliente**. Esse valor:

- **não se perde**;
- **não volta em dinheiro**.

A regra está fechada. O **mecanismo não existe**: o sistema não tem carteira,
saldo de cliente nem qualquer lugar onde um crédito possa viver e ser
consumido numa compra seguinte. `clientes` não tem coluna de saldo, e A
Receber é de mão única — representa o que a cliente deve, nunca o contrário.

Até a arquitetura financeira existir, a troca guarda o valor
(`garantia_trocas.diferenca`, negativa) e a leitura o diz em voz alta em
`creditoAoCliente`. `diferenca_status` continua `pendente_regra`, mas o que
está pendente mudou de natureza: **era a regra, agora é a arquitetura**.

**Nada é simulado.** Crédito não vira desconto, pagamento negativo, preço
negativo nem ajuste de estoque. Inventar um lugar errado para o dinheiro é
pior do que ainda não ter o lugar certo.

### O novo atendimento: 7 dias úteis e a etiqueta

Decisão da Sthefany, **12/09/2026**. Uma nova troca da mesma peça só acontece:

- dentro de **7 DIAS ÚTEIS** contados da entrega da peça (o `encerrada_em` do
  atendimento anterior) — sábado, domingo e feriado cadastrado não contam,
  pela mesma régua do prazo de reparo. **Não são dias corridos**;
- com a **ETIQUETA ainda na peça**.

O atendimento anterior **permanece encerrado**. Reabrir não é mexer no caso
antigo: é abrir um caso NOVO, apontando para a mesma unidade física e ligado
ao anterior por `garantias.garantia_anterior_id`. Cada ciclo guarda o próprio
prazo, os próprios eventos e a própria troca. O caso antigo ganha o evento
`reaberta_em_novo_caso`, de modo que a ligação é legível dos dois lados.

O sistema **não tem como saber** se a etiqueta está na peça — isso é alguém
olhando a peça no balcão. `etiqueta_preservada` não inventa o dado: ela guarda
a **confirmação** de quem olhou. Sem confirmação explícita a reabertura é
recusada, e "ninguém perguntou" tem resposta diferente de "perguntaram e a
etiqueta não estava".

### Estados: o mínimo que já é seguro afirmar

Seis estados. Três são **terminais**: `devolvida`, `concluida`, `cancelada`.

| de \ para | em_reparo | reparada | sem_conserto | devolvida | concluida | cancelada |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **em_reparo** | — | sim | sim | sim | sim | sim |
| **reparada** | sim | — | sim | sim | sim | sim |
| **sem_conserto** | sim¹ | sim | — | sim | sim | sim¹ |
| **devolvida** | não | não | não | — | não | não |
| **concluida** | não | não | não | não | — | não |
| **cancelada** | não | não | não | não | não | — |

¹ bloqueado enquanto houver troca viva registrada: a peça nova já saiu do
estoque, e reabrir deixaria a troca órfã. Estorne a troca antes.

**De estado terminal não se sai por mudança de status.** Se a peça voltou, o
caminho é o novo atendimento acima. Isto é deliberadamente o mínimo: as
transições entre os estados PENDENTES seguem livres, porque ninguém demonstrou
ainda que alguma delas seja errada no balcão.

### Corrigir um status lançado errado não é reabrir

São duas operações, e a diferença não é técnica — é de significado:

| | o que aconteceu | regra dos 7 dias / etiqueta | resultado |
|---|---|---|---|
| **reabertura** | a peça VOLTOU | sim | caso novo, ligado ao anterior |
| **correção** | a peça nunca voltou; alguém clicou errado | **não** | o mesmo caso volta ao estado anterior |

Se fossem a mesma porta, todo engano de digitação viraria um atendimento a
mais na ficha da cliente, e toda peça que voltou de verdade poderia ser
disfarçada de engano para escapar dos 7 dias.

A correção exige **motivo**, registra data e hora, e **não apaga nada**: o
evento do encerramento errado permanece, com a data em que foi lançado, e por
cima dele entra um evento `status_corrigido` dizendo o que foi desfeito e por
quê. O histórico mostra os três fatos em ordem — o encerramento, a correção,
o estado restaurado.

**Estado atual ≠ histórico imútavel.** `encerrada_em` volta a `NULL` porque o
caso nunca foi encerrado; que o encerramento chegou a ser lançado continua
escrito nos eventos, e é lá que essa verdade mora.

**Autoria:** o sistema não tem autenticação por pessoa — o Bearer é um
segredo compartilhado. O evento guarda `autorInformado`, que é o que quem
chamou DISSE ser, sem verificação. O nome diz isso de propósito, para
ninguém ler como identidade provada. Quando houver autenticação por pessoa,
este é o lugar.

**O bloqueio.** Corrigir só é seguro enquanto nada tiver acontecido DEPOIS do
encerramento errado. A regra é uma só, e por isso não tem buraco: o evento do
encerramento tem de ser o **último da linha do tempo**. Qualquer coisa depois
dele — uma troca, um pagamento, um estorno, um novo atendimento — dependeu
daquele estado, e desfazer o estado por baixo deixaria o efeito sem chão. O
sistema recusa e **nomeia o que encontrou**, em vez de fazer rollback
silencioso. A correção simples serve para erro operacional recente; cadeia
posterior exige compensação pelo fluxo de cada fato.

E o sistema **não adivinha para onde voltar**: se o evento do encerramento
não registrou de qual estado o caso veio, a correção para (§2).

### Mudar status registra um fato JÁ OCORRIDO

Nada de data futura, pela mesma razão que a abertura, a troca e o pagamento
já a recusavam. Agendamento é outro conceito e, se um dia for preciso, terá
campo e fluxo próprios.

A origem do dinheiro é declarada em
`composicao.faturamentoDeDiferencaTroca`, separada do faturamento de vendas.

**Peça nova mais barata que a original: regra de negócio PENDENTE.** Crédito
ou reembolso nunca foi definido. A troca é registrada com
`diferenca_status='pendente_regra'`, nada é lançado, e o sistema anuncia isso
(§9) em vez de inventar um crédito.

Provado em `src/pacote-vendas-test.mjs`, cenários G, H e H.2.

### 33. O histórico de um dia tem mais de uma origem

Escolher uma data em Vendas mostra **tudo** o que aconteceu comercialmente
nela, de todas as origens: venda de balcão, linha da planilha, acerto de
revendedora, maleta que saiu, saída sem faturamento e troca de garantia.
Cada linha diz de onde veio, e nenhuma aparece duas vezes — a deduplicação
usa os mesmos filtros que o painel usa para não contar em dobro.

É o dia da **movimentação**, não o do pagamento. A venda feita em 28/08 e
paga em setembro aparece no histórico de 28/08 **e** no faturamento de
setembro; a linha carrega as duas datas para a tela não ter que escolher.

Nem tudo ali é venda, e a linha diz isso em `ehVenda`. Consignação de maleta,
brinde e troca de garantia aconteceram no dia e pertencem ao histórico;
nenhuma delas é dinheiro que entrou, e todas saem com valor nulo — um zero
somaria silenciosamente numa média de ticket.

Para o acerto de revendedora vale a data em que o acerto foi **registrado**,
não a data em que a maleta saiu.

Provado em `src/pacote-vendas-test.mjs`, cenário J.

### 34. Renomear uma cliente não pode desligar o histórico dela

O cadastro é editável e a edição **nunca** cria cliente novo: `cliente_id` é
a identidade, e ele não muda. Compras, valores, ticket médio, frequência,
contas a receber e garantias continuam onde estavam.

O defeito que isto corrige: a ficha é montada por `cliente_nome_norm`, porque
a imensa maioria das linhas veio da planilha e a planilha só tem nome.
Renomear mudava `clientes.nome_norm` e deixava as compras carimbadas com o
norm **antigo** — as compras sumiam, o valor gasto zerava, e quem viu isso
concluiu, com razão, que a edição não tinha salvado.

A correção tem dois lados:

- **servidor** — escrever a identidade real *antes* de mexer no nome: as
  linhas que casam pelo norm antigo passam a apontar para o `cliente_id`. É
  escrita **aditiva**: só preenche um `cliente_id` que estava nulo, não apaga
  nem altera nada, e rodar de novo não faz efeito;
- **tela** — voltar para a ficha pelo norm NOVO que o servidor devolve. Antes
  ela voltava para a lista, e reabrir pelo caminho antigo mostrava um perfil
  vazio.

**Quando o nome era ambíguo, o amarre não acontece.** Se havia outro cadastro
com o mesmo nome normalizado, as compras registradas só pelo nome podem ser
de qualquer uma das duas, e apontá-las para a que está sendo editada seria
escolher a dona do dinheiro por conta própria (§2). Nesse caso a edição do
cadastro segue normal, nada é amarrado, e o sistema **diz** o que deixou de
fazer.

CPF, telefone, e-mail e cidade podem ficar vazios. Nome vazio é recusado.

Provado em `src/pacote-vendas-test.mjs`, cenários I e I.2, e em
`src/pacote-vendas-ui-test.mjs` § 8.

### 35. Reclassificar histórico propõe — nunca decide sozinho

A planilha trouxe, misturadas com as compras, linhas que nunca foram venda:
"Brinde dia das mães", "Brinde festa junina", retiradas pessoais e diferenças
de inventário ("PERDIDO", "ACHO QUE FOI VENDIDO").

`GET /api/historico/auditoria` é **seco**: lê tudo, propõe e não escreve uma
linha. Cada candidato vem com classificação proposta, **nível de confiança** e
o motivo por extenso — "porque o nome começa com Brinde" é auditável, um
número de confiança não é.

Só `confianca: 'alta'` é aplicável sozinho, e mesmo ela precisa de uma
decisão que nomeie a linha: não existe "aplicar todas" no servidor. A frase
"ACHO QUE FOI VENDIDO", isoladamente, continua sendo evidência de dúvida e
não autoriza classificação automática.

**Decisão humana de 09/09/2026.** Quando uma diferença negativa encontrada
durante Inventário for confirmada como perda ou peça ausente, o fato é uma
saída sem faturamento de tipo `perda`, relacionada ao inventário. "ACHO QUE
FOI VENDIDO" não é tipo nem motivo estrutural: permanece como observação do
registro. A confirmação humana resolve o caso; o texto sozinho não resolve.

“Sorteio” é diferente: quando o texto afirma que a peça foi destinada a
sorteio, a classe é `sorteio`. Isso não muda a regra de “ACHO...”, que continua
uma observação de dúvida e nunca uma categoria.

Uso próprio depende de um NOME de pessoa, e nome não é identidade (§2): a
lista de nomes vem na chamada. Vazia, nenhuma linha é proposta como uso
próprio.

Aplicar **não apaga** a linha da planilha (§7) e **não mexe em estoque** — a
linha histórica não movimentou peça, e criar um movimento agora seria uma
segunda baixa. Aplicar apenas marca a linha como não-venda, e as somas
comerciais passam a ignorá-la. `DELETE` desfaz.

O valor de custo de uma saída histórica pode precisar de correção posterior.
Essa correção deve preservar valor anterior, valor novo, motivo, autor e data;
`preco_unit` e `valor_total` da planilha são valores comerciais e não podem ser
reutilizados silenciosamente como custo. O modelo para essa correção ainda
não existe e não é inferido nesta regra.

Provado em `src/pacote-vendas-test.mjs`, cenário L.

---

## §36 — a data do pagamento tem procedência, e "sem dono" é durável

Duas correções de identidade, das quais nenhuma muda um número de
faturamento existente.

### §36.1 — `vendas.pagamento_origem`: fato não se confunde com aproximação

`data_pagamento` (§30) resolveu **quando** o dinheiro entrou. Faltava dizer
**como o sistema sabe disso** — e sem essa distinção, o backfill da migration
transformaria toda venda antiga em "pagamento conhecido".

O backfill de `migracao-vendas-pagamento.sql` classifica cada venda pela
evidência que **já existe** no banco:

| Carimbo | Quando | O que a migration escreve |
|---|---|---|
| `informado` | um humano disse a data na tela | `pago=1`, a data que ele escolheu |
| `historico_paga` | há cobrança histórica paga, com `paga_em` | `pago=1`, a data REAL do recebimento |
| `historico_aberto` | há cobrança histórica **aberta** | `pago=0`, **sem** data |
| `nuvemshop_*` | a loja declarou o estado do pagamento | ver a tabela de §36.4 |
| `indeterminado_site` | pedido da loja sem `payment_status` legível | comportamento antigo preservado, e a linha vai para conferência humana |
| `legado_data_venda` | nenhuma evidência existiu jamais | data da venda como **aproximação declarada** |

A regra em uma linha: **uma conta a receber real nunca vira pagamento por
causa de uma migration.**

### §36.4 — faturamento e A Receber NÃO são complementares

Duas frases, e elas não são a mesma:

> **FATURAMENTO** = dinheiro efetivamente recebido.
> **A RECEBER** = dinheiro que o cliente **realmente** ainda deve.

O primeiro defeito era tratar todo pedido não cancelado como pago. O
segundo — mais sutil e mais caro — seria corrigi-lo jogando tudo o que não é
`paid` em "A Receber". Um pedido **reembolsado** não é nem um nem outro:
ninguém deve nada. Um pedido **pago pela metade** é os dois, em partes.
Traduzir status técnico direto para dívida inventa débito de quem não deve.

| `payment_status` | Pago | Cobrável | Carimbo | Regra |
|---|---|---|---|---|
| `paid` (com `paid_at`) | sim | — | `nuvemshop_pago` | faturamento pela data **real** do recebimento |
| `paid` (sem `paid_at`) | sim | — | `nuvemshop_pago_sem_data` | data do pedido como fallback **declarado** no relatório |
| `pending` + pedido ativo | não | **sim** | `nuvemshop_pendente` | A Receber pelo valor inteiro |
| `pending` + pedido cancelado | não | não | `nuvemshop_cancelado` | não há o que cobrar |
| `authorized` + pedido ativo | não | **sim** | `nuvemshop_autorizado` | cartão **reservado**, não capturado — não é dinheiro |
| `authorized` + cancelado | não | não | `nuvemshop_cancelado` | idem |
| `partially_paid` **com valor** | não | **sim** | `nuvemshop_parcial` | entra o recebido; o **saldo** fica a receber |
| `partially_paid` **sem valor** | não | não | `pagamento_parcial_indeterminado` | **nada** é contabilizado até alguém conferir |
| `refunded` | não | **não** | `nuvemshop_reembolsado` | não é faturamento e **não é dívida** — exige política |
| `voided` + pedido cancelado | não | não | `nuvemshop_anulado` | não há o que cobrar |
| `voided` + pedido **ativo** | não | **sim** | `nuvemshop_pendente_apos_anulacao` | a peça saiu e o cliente ainda deve |
| `abandoned` | não | não | `nuvemshop_abandonado` | carrinho nunca virou compra |
| desconhecido | não | não | `nuvemshop_estado_desconhecido` | vira pergunta, não número |
| ausente | não | **não** | `indeterminado_site` | sem evidência de recebimento não há faturamento; sem evidência de dívida não há cobrança |

Três colunas sustentam isso em `vendas`: `pago` (entrou tudo),
`valor_recebido` (entrou **isto**; `NULL` = ou tudo, ou nada) e `cobravel`
(o cliente **realmente** ainda deve).

**Ausência de informação permanece ausência de informação.** Sem
`payment_status` não existe evidência suficiente de recebimento — e a mera
existência do pedido nunca foi evidência. A linha fica com faturamento 0 e
A Receber 0 (`valor_recebido = 0`, `cobravel = 0`), e continua aparecendo
como **pendência de conferência financeira**. Não vira pago, não vira
pendente, não vira faturamento e não vira cobrança automaticamente.

**Nenhum campo é adivinhado.** O valor parcial só é lido de estrutura
autodescritiva — uma lista de transações em que cada entrada diz o próprio
estado e o próprio valor. Sem ela, a resposta é "não sei", que é diferente
de zero. Até 2026-09-05 **nenhum payload real da loja foi observado**
(produção nunca importou pedido de site: `externo_id` total = 0), então o
caminho **provado** é o indeterminado.

**O estoque não olha para nada disso.** Ele segue o PEDIDO: a peça saiu da
gaveta quando o pedido foi feito, e isso não depende de o dinheiro ter
entrado — nem muda quando o pagamento muda. Mudar `payment_status` não cria
nem desfaz movimento nenhum.

**O caminho de volta existe.** Um pedido que entra `pending` e depois é pago
tem o pagamento atualizado na rodada seguinte — antes, o `externo_id` já
conhecido fazia a sincronização pular o pedido inteiro, e o PIX que caía
nunca virava faturamento. A atualização escreve **só** pagamento: nunca
estoque, item, total ou data da venda.

**Duas coisas a sincronização se recusa a fazer sozinha:**

- desfazer um pagamento já contado (`paid` → `refunded`/`voided`): isso apaga
  faturamento de um mês fechado, e é decisão humana. Ela **anuncia** em
  `pedidosExigindoPolitica`;
- sobrescrever pagamento que uma **pessoa** registrou (`informado`).

`payment_status` e `paid_at` já vinham no **mesmo** payload de `/orders` que
a sincronização sempre leu — nenhuma requisição a mais, nenhum escopo novo
(`read_orders` já cobre), nenhuma mudança de contrato com a loja.

Provado em `src/pagamento-nuvemshop-test.mjs` (puro, cenários A–M) e
`src/sync-pagamento-test.mjs` (ponta a ponta, contra a loja de mentira).

As vendas do site que já estão no banco continuam `indeterminado_site`: o
`payment_status` delas existe **na loja**, não aqui, e resolvê-las é uma
conferência contra a Nuvemshop, não um chute da migration.

`GET /api/vendas/pagamento/auditoria` é **seco** e roda **antes** do
backfill: ele usa a mesma classificação e nenhuma coluna nova.

Provado em `src/migracao-pagamento-test.mjs`, que executa o arquivo SQL de
verdade sobre a forma anterior de `vendas`.

### §36.2 — `vendas.cliente_ambiguo`: a recusa de escolher fica escrita

Vender para um nome que tem **dois** cadastros já era tratado direito na
escrita: o sistema se recusa a escolher e a venda fica sem `cliente_id`,
porque nome não é identidade (§2).

O defeito estava no **depois**. "Sem dono" era indistinguível de "ainda não
amarrada": no dia em que uma das homônimas fosse renomeada, o nome passava a
apontar para uma pessoa só, e a venda que ninguém nunca atribuiu entrava
inteira na ficha da que sobrou.

`cliente_ambiguo = 1` quer dizer **"o sistema olhou e se recusou a
escolher"** — e isso não deixa de ser verdade porque a população de
cadastros mudou depois. A ficha da cliente casa por `cliente_id`; o nome só
alcança a linha que não tem dono **e** cujo nome identifica uma pessoa só
**e** em que a recusa não foi registrada.

O perfil devolve `clienteId`, `homonimos` e `nomeAmbiguo`, e a tela endereça
a ficha por `cli:#<id>` — nome é rótulo e busca, nunca endereço.

### §36.3 — `saidas_sem_faturamento.estoque_refletido`: uma baixa, uma vez

A linha da planilha reclassificada como brinde **já baixou** a peça na
importação. Registrá-la como saída não pode baixar de novo — e, o simétrico
que faltava, **estorná-la não pode devolver**: devolveria ao estoque uma
unidade que nunca saiu por causa dela.

`estoque_refletido = 0` marca a linha como **classificatória**: ela não cria
movimento ao nascer, não pode apontar para movimento nenhum (é CHECK de
banco), e o estorno dela desfaz a classificação sem tocar em saldo. Desfazer
uma reclassificação histórica segue a mesma regra e declara
`estoqueAlterado: false`.

Provado em `src/revisao-pre-golive-test.mjs`, seções 4 a 6.


---

## Revisão operacional 1 — pós-go-live (06/09/2026)

As regras abaixo nasceram do pacote de revisão de 05/09/2026, com a operação
real já rodando. Cada uma diz o defeito que a originou, porque é o defeito —
não a regra — que explica por que ela existe.

### 35. Os cartões de um dia somam TODAS as origens daquele dia

**O defeito.** Escolher 05/08/2026 em Vendas → Lançamentos mostrava `R$ 0`
nos três cartões com a lista cheia logo abaixo. A data era respeitada; o
recorte é que era pobre — os cartões eram somados no navegador a partir de
`GET /api/vendas`, que lê só a tabela `vendas`. Linha de planilha, acerto de
revendedora e troca de garantia daquele dia não estão nela.

`GET /api/vendas/lancamentos?data=` calcula os três no servidor, a partir da
mesma leitura que a lista de baixo usa — número de cima e linha de baixo não
podem divergir sem que ninguém saiba qual está certo.

As três definições, escritas para poderem ser testadas:

- **BALCÃO** — venda direta para cliente naquele dia, venha ela da tabela
  `vendas` ou da planilha. Valor, número de vendas e número de peças.
- **ACERTO** — o que a revendedora efetivamente VENDEU e confirmou no acerto
  daquele dia. O número principal é o **LÍQUIDO DA MARQUESA**: bruto menos
  comissão. Peça que ainda está na maleta **não é venda** — o texto anterior
  do cartão ("peças que a revendedora não devolveu") contava outra coisa.
- **VENDIDO NO DIA** = balcão + **líquido** dos acertos.

Comissão **nunca é estimada** (§11): sai do documento da maleta
(`historico_operacoes`) ou do acerto fechado no sistema
(`maletas.acerto_json`). Havendo acerto no dia sem nenhuma das duas fontes, o
cartão declara o BRUTO conhecido, marca `exato: false` e deixa aqueles
valores **fora** do líquido e do total — em vez de aplicar uma faixa de hoje
sobre uma venda de ontem.

**Dois defeitos achados no mesmo caminho e corrigidos:**

1. `GET /api/vendas/dia` deduplicava pela VENDA, não pelo item: do segundo
   item em diante cada linha era descartada como repetição, e uma venda de
   R$ 110 com três peças aparecia como R$ 50 com uma;
2. "entrou no caixa neste dia" só encontrava a venda feita **e** paga no
   mesmo dia — justamente o caso em que vendido e recebido não diferem. A
   venda de julho paga em setembro nunca aparecia. Agora a pergunta vai ao
   banco com a mesma regra de faturamento do painel (`cteVendas`).

Provado em `src/pos-golive-1-test.mjs`, cenários A e B.

### 36. Um mês é dois recortes que não coincidem — e isso é dito

`GET /api/analytics/mes?mes=AAAA-MM` responde por UMA barra do gráfico
"Evolução por mês", para ser desenhada logo abaixo dele.

- **FATURAMENTO** — dinheiro que ENTROU no mês. Recorte pela data do
  **pagamento**.
- **VENDAS, PEÇAS e CLIENTES ATENDIDAS** — o que SAIU no mês. Recorte pela
  data da **venda**.
- **CLIENTES ATENDIDAS** conta **gente, não compra**: quem comprou quatro
  vezes em maio é uma cliente atendida.

Os dois recortes não fecham entre si, e a resposta **não inventa um terceiro
número que os concilie**. Cada compra paga em outro mês leva
`faturaEmOutroMes`; a que não foi paga leva `aindaNaoPaga`; e o bloco
`faturamentoDeOutrosMeses` diz quanto do faturamento do mês veio de compras
anteriores. Sem isso, "vendido em julho, pago em setembro" pareceria a mesma
peça vendida duas vezes.

Provado em `src/pos-golive-1-test.mjs`, cenários C a F.

#### Painel analítico: período e mês corrente

O Painel usa a mesma regra nas três leituras agregadas. Em `Tudo`, `12 meses`,
`90 dias` e `30 dias`, cada ponto da Evolução aplica o filtro outra vez na
data que governa a métrica: `data` para vendas e peças;
`data_faturamento` para dinheiro. Assim, uma venda de julho paga hoje pode
contribuir para o faturamento de 30 dias, mas não desenha uma barra de julho
fora desse recorte nem vira venda atual.

Os KPIs fixos do mês corrente seguem a mesma separação: faturamento pela data
do pagamento; vendas e peças pela data da venda. `A receber deste mês` é a
soma das contas abertas com `vencimento_em` dentro do mês corrente. Contas
sem prazo continuam no total geral e na lista operacional, sem serem
atribuídas silenciosamente a um mês.

Provado em `src/pacote3-test.mjs` e `src/pacote3-ui-test.mjs`.

### 37. A troca de garantia tem registro comercial — e continua valendo a diferença

**Regra nova, definida pela Sthefany em 05/09/2026. Substitui a segunda
metade de §32.**

**O defeito.** O caso da Evelyn Veiga: troca 393950 (R$ 89) por 313860
(R$ 99), diferença R$ 10 "a receber" — e nenhuma ação para receber, nada no
A Receber, e a peça nova invisível no histórico dela.

A troca sem conserto passa a criar uma linha em `vendas`, ligada por
`garantia_trocas.venda_id`. A peça nova aparece no histórico, nas
preferências e na contagem de peças.

**O que NÃO muda, e é o ponto inteiro:**

- a venda vale a **DIFERENÇA**, nunca o preço da peça nova. Os R$ 89 já
  entraram no faturamento no dia deles; faturar R$ 99 agora os contaria pela
  segunda vez. O item guarda `preco_tabela = 99` e `preco = 10`, com o
  abatimento rotulado `Crédito de garantia · <sku original>`;
- o **estoque** sai uma vez só, no movimento de tipo `troca` e origem
  `troca_garantia` que já existia. A venda não gera segundo movimento;
- diferença **negativa** continua `pendente_regra`: crédito ou reembolso
  nunca foi definido, e o sistema registra e para.

**Três guardas impedem contagem em dobro**, cada uma na ponta onde o risco
mora: `visaoGeral` soma `diferenca_valor_pago` só das trocas **sem**
`venda_id`; `recebidoNoDia` idem; e a linha de troca em `historicoDoDia`
deixa de carregar o valor quando a venda o carrega.

Provado em `src/pos-golive-1-test.mjs`, cenários G e H, e em
`src/pacote-vendas-test.mjs`, cenário H (atualizado).

### 38. "A receber" soma as três fontes de dívida de cliente

**O defeito.** A lista lia só `historico_operacoes`. Ficavam de fora a venda
de balcão lançada como NÃO PAGA — a peça saiu, a cliente ficou devendo, e o
Painel não mostrava — e a diferença de troca de garantia.

As três fontes numa lista só, cada linha com uma `chave` que diz de onde veio
e para onde a ação vai: `historico:<id>`, `venda:<id>`, `troca:<garantia>`.

**O que não entra, e por quê:** acerto de revendedora (não é dívida de
cliente, §29); `cobravel = 0` (reembolso, anulação, abandono — §36.4); venda
cancelada (§28); venda operacional que já é duplicata de operação histórica;
diferença negativa (regra inexistente); troca que já está na lista como venda.

Venda operacional não paga ganhou `vendas.vencimento_em` — sem prazo padrão
inventado: uma data que ninguém combinou vira cobrança vencida sozinha.

### 39. COMPROU, PAGO e EM ABERTO são três números, não um

**O defeito.** O card "GASTOU" do perfil somava `faturamento`, que é o
dinheiro **recebido**. Quem comprou R$ 1.000 e pagou R$ 700 aparecia com 700
— a compra fiada sumia da ficha exatamente enquanto ela ainda devia.

- **COMPROU** — total comercial das compras dela. Não diminui porque parte
  ainda não foi paga.
- **PAGO** — o que efetivamente entrou.
- **EM ABERTO** — o que falta.

Eles **não são complementares por construção** (§36.4): um pedido
reembolsado não é nem pago nem a receber, então `comprou` pode ser maior que
`pago + emAberto`. Forçar a igualdade esconderia justamente o caso que
precisa ser visto.

Ticket médio e gasto por peça do PERFIL passaram a sair do **comprado** —
saindo do recebido, contradiziam o card de cima. O ticket médio do PAINEL é
outro número, com outra regra (só venda paga elegível), e continua como
estava.

### 40. Corrigir o código de uma peça vendida é identidade, não venda nova

**O defeito.** Juliana Negri, 30/08/2026: peça lançada com o código errado, o
certo é 326660, e nenhum caminho pela interface. Cancelar e relançar perderia
data, cliente, desconto e histórico; editar direto deixaria a correção
indistinguível de um erro de digitação novo.

`POST /api/vendas/corrigir-item` troca o código NA LINHA e mantém venda,
cliente, data, preço e faturamento. Preço só muda se pedirem, e a mudança
fica registrada ao lado.

**Estoque — duas populações, duas respostas:**

- venda **OPERACIONAL** baixou estoque pelo sistema: a correção devolve uma
  unidade ao código errado e tira uma do certo, **exatamente uma vez cada**.
  A devolução é movimento novo, não apagamento do antigo (§28): a razão
  continua contando a história inteira e `produtos.qtd == SUM(movimentos.qtd)`
  vale nos dois códigos. Sem peça disponível no código certo, a correção
  **para** e diz o número — nunca deixa saldo negativo em silêncio;
- linha da **PLANILHA** já teve o estoque refletido no saldo inicial: não
  movimenta nada, e forçar é recusado com o motivo. As colunas `*_original`
  não são reescritas — o que muda é a leitura delas, e o nome novo é
  resolvido pela correção registrada, na exibição.

A auditoria fica em `venda_item_correcoes` e aparece na ficha da cliente:
"SKU corrigido de XXXXX para 326660 em DD/MM/AAAA."

Provado em `src/pos-golive-1-test.mjs`, cenários K, L e M.

### 41. Resolver uma variação é dizer QUAL peça saiu — nunca uma segunda baixa

**O defeito.** "REVISAR VARIAÇÃO — há peças deste código em maleta aberta, e
a maleta ainda não sabe qual variação saiu" era um beco sem saída: o sistema
identificava o caso com precisão e não oferecia caminho para responder.

Duas formas de resolver, e **nenhuma movimenta estoque**. A peça saiu quando
a venda foi registrada ou quando a maleta foi aberta; movimentar de novo
seria a segunda baixa da mesma peça. O que muda é `variacao` /`variante_id`
do movimento que já existe — `qtd` não é tocado, e a razão fecha igual antes
e depois.

- **pela VENDA** (`/api/pendencias/variacao/venda`): grava nos dois lugares
  que importam — a linha da venda e o movimento. É o movimento que a
  sincronização lê para saber qual caixinha da loja diminuir; deixar um dos
  dois para trás faria a venda parecer resolvida e a loja continuar sem saber.
- **pela MALETA** (`/api/pendencias/variacao/maleta`): aceita a distribuição
  inteira, porque uma maleta leva dois anéis do mesmo código, um 16 e um 18,
  e isso é o caso normal — é por isso que `maleta_item_variacoes` é tabela
  filha e não uma coluna em `maleta_itens`. Dizer mais do que saiu é recusado
  com os dois números: inventaria peça.

O freio da maleta em `resolverVariantes` deixou de ser absoluto. Ele continua
segurando enquanto ninguém disser qual variação está fora — e a recusa passa
a dizer **quanto já foi identificado e quanto falta**. Identificado tudo, o
código volta a sincronizar.

A escolha é sempre entre variações **já cadastradas**. A Sthefany afirma que
cadastrou todas as que possui; oferecer "criar variação" primeiro responderia
outra pergunta.

**A Central de Pendências não é tabela.** Cada caso é derivável do estado, e
uma cópia seria um segundo lugar para a mesma verdade divergir — justamente
quando alguém resolvesse o caso e a lista continuasse mostrando. A única
coisa gravada é "revisar depois", que não é fato de negócio, mora em `config`
e **exige data**: adiar sem data é esquecer.

`GET /api/variacoes/reconciliacao` compara as três fontes — nós, as variações
cadastradas e o espelho da loja — e classifica em `RESOLVIDO`,
`PENDENTE_HUMANO` e `DIVERGENCIA_REAL`. **Leitura pura**: não escreve no
banco nem na Nuvemshop. `PENDENTE_HUMANO` é falta de informação e nunca vira
escrita; `DIVERGENCIA_REAL` só sai daqui por `POST /api/sync`, com
autorização.

Provado em `src/pos-golive-1-test.mjs` (P–S) e
`src/pos-golive-1-variacoes-test.mjs` (T).

### 42. Monte seu Colar: configuração comercial, componentes físicos, composição

**O problema.** Uma variante permanente por combinação explode o cadastro e
faz o saldo comercial divergir das peças que realmente saíram.

**As duas identidades**, que são a regra inteira:

```
SKU comercial      = o que foi vendido       (Colar Casal, 326660)
componente físico  = o que existe na gaveta  (Veneziana 444032, os pingentes)
composição         = a regra que liga os dois

ESTOQUE FINANCEIRO = somente aquilo que fisicamente existe
```

Uma **configuração** tem SKU, nome, preço, foto e linha de venda. Ela **não
tem saldo físico próprio** e **não soma patrimônio**: contá-la ao lado das
peças que consome contaria as mesmas peças duas vezes. `produtos.qtd` dela é
ignorado de propósito — em produção ele nem sempre é zero, e ler esse número
venderia um colar que só existe como nome.

**A composição é por SLOT TIPADO**, não por SKU fixo. A configuração fixa uma
base e declara quantas peças de cada grupo ela leva; a cor de cada uma é
escolhida na venda, entre as do cardápio daquele grupo:

```
326660  Colar Casal    fixo: 1 × Veneziana 444032
                       slots: 1 Menino · 1 Menina
314161  2M + 1F        fixo: 1 × Veneziana 444032
                       slots: 2 Menino · 1 Menina
```

Por isso **não é um kit**: `kit_componentes` nomeia um SKU por linha, e não
tem como dizer "uma peça do grupo Menino". Reaproveitá-la faria a venda passar
por `movimentarKit`, que baixaria só a Veneziana.

**Repetir a mesma cor dentro de um grupo é permitido** (decisão de
10/09/2026): "Dois Meninos" aceita Azul + Azul. O que a configuração fixa é
quantas peças de cada grupo, não quais.

**A base não é escolha.** A Veneziana sai automaticamente em toda montagem, e
um pedido que mande outra base é recusado. A decisão de 06/09/2026, que previa
troca de base, está revogada.

**Composição livre não existe.** A pessoa escolhe primeiro uma configuração
cadastrada, e ela determina quantos e quais slots. Uma combinação nova exige
**cadastrar** uma configuração — produto com SKU próprio mais a composição —,
o que é dado e não deploy: `POST /api/personalizacao/modelos`. O SKU
`MONTE-COLAR` continua no catálogo, inativo, como registro do modelo antigo.

**A disponibilidade é derivada**, nunca guardada:

```
disponível(configuração) = min(
    disponível(base),
    para cada grupo G com k slots:  floor( Σ disponível(G) / k )
)
```

A soma dentro do grupo, e não o mínimo, porque repetir a cor vale. Duas
configurações que compartilham um pingente caem juntas sozinhas.

**A venda separa as duas coisas:**

```
venda_itens                 UMA linha, o SKU comercial, o preço da configuração
venda_personalizacoes       qual configuração foi vendida, e a base
venda_personalizacao_itens  o que fisicamente saiu, com variação e movimento_id
movimentos                  -1 base  ·  -1 de cada peça escolhida  ·  NADA no comercial
```

O preço é da **configuração**, não a soma das peças: R$ 119 e R$ 74 são preços
dos produtos físicos nos contextos deles, e R$ 129 é decisão comercial.
Vender a configuração como linha avulsa é recusado.

**A baixa é onde mora o risco:** a composição consome a base e cada componente
**exatamente uma vez**. Nem a base duas vezes, nem o componente pelo caminho do
kit e de novo pelo da configuração.

`venda_personalizacoes.estoque_ja_refletido` registra a venda que **já
aconteceu**: entra como histórico comercial, não movimenta nada, e a flag fica
gravada e auditável — é ela que separa "registrei o passado" de "vendi agora" e
que impede a baixa dupla.

**Cancelar faz o inverso exato:** devolve a base e cada componente pelo SKU
gravado, preservando variação e variante dos dois — devolver "um menino
qualquer" fecha o total e faz a razão por variação mentir. Repetir o
cancelamento não devolve duas vezes. Venda com `estoque_ja_refletido = 1`
continua sem baixa e sem devolução.

**Configuração fica fora do inventário e da maleta**, como o kit: contá-la
somaria peças já contadas, e consigná-la reservaria peças que continuariam
disponíveis.

Modelo e opções são **dado, não interface**: uma página de produto da
Nuvemshop lê `GET /api/personalizacao/modelos` e posta a composição em
`POST /api/vendas` sem que nada mude aqui.

Provado em `src/montagem-saldo-test.mjs` (saldo derivado, sem dupla contagem),
`src/montagem-venda-test.mjs` (slots exatos, base fixa, cardápio, preço),
`src/montagem-estorno-test.mjs` (estorno exato com variação) e no gate
`scripts/montagem-dupla-contagem.test.mjs`. O desenho e as decisões estão em
`docs/domains/MONTAGEM-MONTE-SEU-COLAR.md`.

### 43. Medir antes de otimizar (leitura do D1)

A cota do D1 é da **conta**, e ela bateu no limite. `api/src/d1-metrica.js`
soma o `rows_read` que o próprio D1 devolve, por requisição — desligado por
padrão, ligado por `D1_METRICAS=true` ou pelo cabeçalho `X-D1-Metricas: 1`.

O achado: `GET /api/variacoes/revisao` lia **298.032 linhas** por chamada, e
a causa era uma subconsulta correlacionada sobre `maleta_itens`, que não tem
índice por `sku`. Corrigido por dois caminhos independentes — a reescrita da
consulta (vale sem migration) e o índice.

Números, método e o que ficou de fora: [docs/operations/D1_USAGE_AUDIT.md](../docs/operations/D1_USAGE_AUDIT.md).

**A regra que governa qualquer otimização futura:** nada troca consistência
de estoque ou de dinheiro por leitura. A memorização do painel é do CLIENTE,
some a qualquer escrita, e nunca cobre `/api/state` nem rota de escrita.

### 44. O produto nasce aqui — e a loja é canal, não fonte

Decisão de Gustavo, **10/09/2026**. Muda a direção de autoridade do catálogo:
o cadastro comercial nasce no Sistema Marquesa e a Nuvemshop passa a ser um
canal externo de publicação e venda. Isso não remove importação nem
reconciliação; remove a ambiguidade sobre quem manda.

O desenho, as medições de produção e as decisões que ficaram pendentes estão
em [docs/domains/CATALOGO-MIDIA-PUBLICACAO-4-5.md](../docs/domains/CATALOGO-MIDIA-PUBLICACAO-4-5.md).
O que vale como regra:

**Origem ≠ autoridade.** `produtos.origem_cadastro` é fato histórico e não se
reescreve; `produtos.autoridade` é decisão e pode migrar. Sem a separação,
"veio da loja" acabava sendo lido como "a loja manda nele". As 790 peças que
já existiam ficam com `NULL` nos dois, que é o valor honesto para "não
sabemos" — inventar procedência seria pior que não ter.

**"Peça completa" tem um dono só.** `api/src/catalogo/completude.js`. Existiam
quatro definições que discordavam, e a mesma peça aparecia pronta numa tela e
incompleta na outra. A regra, agora única: falta `nome` quando `desc` repete
o código; falta `categoria` quando ela é a sentinela; falta `preco` quando é
`NULL` **ou `<= 0`**; falta `quantidade` quando `casa <= 0`; falta `foto`
quando não há imagem em lugar nenhum.

**Preço zero existe e não é publicável.** A peça pode ser cadastrada com
preço 0 — rascunho, peça incompleta — e nunca é considerada pronta para
venda ou publicação. Antes, três das quatro cópias liam só `preco == null` e
uma peça de R$ 0 passava.

**`'Outros'` é categoria de verdade.** Ela era, ao mesmo tempo, categoria
semeada e código para "sem categoria" em três lugares — e uma peça
legitimamente "Outros" ficava marcada como incompleta para sempre. A ausência
passa a ter nome próprio: a linha sentinela `Sem categoria`
(`categorias.sentinela = 1`), que existe porque `produtos.cat` é `NOT NULL`.

**A categoria sobrevive ao próprio nome.** `categorias.id` é a identidade
estável; o nome é atributo. Renomear é um ato atômico de quatro passos dentro
de um `db.batch` — arquiva a antiga, insere a nova com o mesmo id, move os
produtos, apaga a antiga. `nome_norm` com índice único parcial impede que
`"Colar "`, `"colar"` e `"Colar"` virem três categorias. Plural **não** é
normalizado: `"Colares"` continua sendo outra coisa.

**A galeria é nossa, e o original não se perde.** A foto deixa de ser coluna
de `produtos` e vira linha em `produto_fotos`. A chave do R2 inclui o id da
foto, então trocar a imagem cria outra linha em vez de sobrescrever o objeto.
Uma principal por peça é garantida pelo **banco**
(`idx_produto_fotos_principal`), não pela disciplina de quem escreve o
próximo UPDATE. Registrar a versão preparada nunca encosta em
`original_key`.

**Foto não é atribuída por palpite.** O casamento por nome de arquivo procura
do candidato mais específico para o menos e deixa o catálogo responder. Nada
de sufixo é removido por regra: a convenção `212223-2` = segunda compra
pertence ao importador de histórico (§ SKU-SUFIXO-DE-COMPRA), e o hífen é
legítimo em códigos reais (`MONTE-COLAR`). Dois candidatos existindo como
produto ⇒ `nome_ambiguo`, e o arquivo **para**.

**O ERP não sabe quem prepara o conteúdo.** `preparacao_tarefas` é uma fila;
`executor` é rótulo livre. Nenhuma coluna, CHECK ou consulta deste banco
menciona fornecedor. Concluir uma tarefa grava o rascunho e leva a peça a
`aguardando_aprovacao` — **nunca publica**.

**Aprovação humana é invariante.** Nada preparado por agente chega à
Nuvemshop sem alguém ter olhado. A trava é a assinatura dos dados
(`dados_assinatura`): mudou nome, categoria, preço, quantidade em casa ou a
foto aprovada, a aprovação anterior é invalidada sozinha.

**Publicar é ato próprio, e nasce desligado.** (Desde 09/10/2026 o caminho
vivo é §62: cadastrar OCULTO é do sistema, tornar visível é o clique. O que
segue descreve o publicador da Fase 4.5, que continua desligado.) `catalogo/publicador.js` dá
writer real aos estados que o CHECK declarava e ninguém escrevia. Três travas
em série, todas fail-closed: `NUVEMSHOP_WRITES_ENABLED` (já existia, e
produção precisa dela ligada para o estoque), `NUVEMSHOP_PUBLICACAO_ENABLED`
(nova, **não declarada em ambiente nenhum**) e `seco` por padrão. Criar um
produto na loja nunca o deixa visível no mesmo passo.

**"Publicado" é decisão nossa; `url_loja` é observação.** Os dois convivem e
a resposta diz qual é qual (`estado` × `presencaNaLoja`). Enquanto uma peça
não tiver estado gravado — o caso das 627 que já estavam na loja — a
observação vale como estado e vem marcada com `estadoObservado`.

**Despublicar existe.** Arquivar aqui continua **não** tirando a peça do ar:
fazer isso automaticamente é decisão comercial ainda pendente.

**Preço divergente é medido, não julgado.** `GET /api/catalogo/precos/divergentes`
conta e mostra. Promoção legítima, preço específico da loja e divergência
acidental produzem o mesmo número, e declarar "diferente = erro" seria tomar
sozinho uma decisão de negócio cujo custo de errar é mexer no preço de venda
de uma peça real. A política está registrada como pendente.

Provas: [src/catalogo-4-5-test.mjs](../src/catalogo-4-5-test.mjs), 26 provas
contra o schema real.

### 45. Desconto da revendedora é negociação dela — o acerto é pelo preço cheio

Decisão da Sthefany, **11/09/2026**. Fecha `P2`/`DR-015`, que era a última
pergunta de comissão em aberto.

> **A revendedora não deve vender com desconto.** Se ela decidir dar desconto
> para a cliente dela, isso é negociação **particular** entre a revendedora e a
> cliente dela. Para a Marquesa, **a revendedora acerta pelo valor normal**.

| | |
|---|---|
| Preço Marquesa | R$ 100 |
| A revendedora vende para a cliente dela por | R$ 90 |
| A revendedora deve à Marquesa, no acerto | **R$ 100** |
| Base de cálculo da comissão | **R$ 100** |

Os R$ 10 saem do bolso da revendedora, não do faturamento da Marquesa. O
desconto particular **não** reduz o valor devido, **não** reduz a base
operacional do acerto e, por consequência, **não** reduz a base da comissão de
§11–§13.

**A trava que isto cria.** O sistema nunca pode interpretar desconto concedido
pela revendedora como desconto concedido pela Marquesa. Não existe caminho no
acerto que leia um preço abaixo do enviado (`maleta_itens.preco_envio`) e
diminua o que a revendedora deve. Quem quiser implementar redução de base
precisa de um campo de origem explícito — não de uma inferência a partir do
valor que a revendedora informou ter cobrado.

**Desconto autorizado pela Marquesa é outro caso, e ainda não existe.** Se um
dia a Sthefany autorizar desconto diretamente — promoção, campanha, condição
especial —, ele é **caso distinto e explícito**, com origem própria e registro
de quem autorizou, na mesma lógica de §27 ("preço diferente sem motivo é
indistinguível de erro"). O que está proibido é ele nascer como comportamento
implícito de revendedora.

**Nada muda no código hoje.** Esta seção é regra de negócio confirmada, não
implementação: o acerto já calcula sobre o valor enviado, e §27 já restringe o
desconto à venda de balcão. O efeito prático é que a Fase 6 deixa de precisar
caracterizar um comportamento indefinido — e que nenhuma extração futura pode
"descobrir" desconto de revendedora no caminho do acerto.

O histórico não depende desta resposta: `maletas.acerto_json` guarda a comissão
real dos acertos já fechados (§24).

### 46. Custo da peça é digitado — e corrigir não apaga o que ele era

**O problema.** "Saiu sem faturar" contava peças — 5 brindes, 3 perdas — e
nunca dinheiro. O sistema não guardava custo em lugar nenhum; o único valor da
peça era o preço de VENDA, que não é custo e não pode fazer as vezes dele
(§35).

**A regra (27/09/2026).**

- `produtos.custo` é o **custo de referência** da peça, digitado pela
  Sthefany (ficha da peça, ou direto na linha de "Saiu sem faturar").
  `NULL` = não informado, nunca `0` por omissão (§24).
- Toda mudança grava `produtos_custo_historico` (anterior, novo, quando,
  de onde — `ficha`, `saida` ou `planilha` — e motivo). Salvar o mesmo
  valor não grava nada.
- "Saiu sem faturar" mostra, ao lado das peças, **quanto se perdeu a preço de
  custo** e **quanto se deixou de vender** a preço de venda. Linha sem custo
  **não entra como zero**: é contada à parte e a tela diz que o total está
  incompleto.
- **O valor fica gravado na saída (29/09/2026, decisão do Gustavo).** Ao
  registrar, a saída guarda o preço de venda e o custo unitários DAQUELE
  momento (`saidas_sem_faturamento.preco_unit`/`custo_unit`, com a fonte:
  `lancamento`, `planilha` ou `manual`). Mudar o preço ou o custo da peça
  depois não muda uma saída passada. Sem preço (ou preço 0) e sem custo, fica
  NULL — "não informado" —, nunca 0.
- **O histórico antigo só recebe valor com evidência.** As saídas que vieram
  da planilha de vendas ganharam o preço unitário que a própria planilha
  registrou (`migracao-saida-valor.sql`); linha cuja planilha diz 0 fica sem
  valor. Custo antigo não tem fonte e não é inventado.
- **Completar depois é auditado.** `PATCH /api/saidas/:id/valor` preenche ou
  corrige preço e/ou custo de uma saída, com motivo obrigatório; cada mudança
  grava o anterior e o novo em `saidas_valor_historico`. Opcionalmente
  (`tambemNaPeca`) o custo vira também o custo de referência da peça, com
  `produtos_custo_historico` origem `saida`. Não mexe em estoque.
- A planilha de compras, a tela de fornecedores e a margem líquida real
  (roadmap de 27/09/2026) vão ALIMENTAR `produtos.custo`, não substituí-lo.
- Custo é atributo de cadastro: não cria movimento, não muda
  `produtos.qtd == SUM(movimentos.qtd)`.

### 47. Monte seu Colar: o modelo nasce na venda

**O que mudou (27/09/2026, decisão da Sthefany).** Até aqui (§42 e a decisão
de 10/09/2026) só se vendiam configurações cadastradas antes — e nenhuma
estava cadastrada, então o Monte seu Colar nunca funcionou. Agora o modelo
**não precisa existir antes**: na venda, a pessoa escolhe os pingentes; se a
combinação (quantos de cada grupo) já tem modelo, é ele; se não tem, a tela
cadastra o modelo ali mesmo — código comercial, nome e preço — e a venda
segue.

**O que NÃO mudou**, e é o que protege o estoque:

- os **pingentes são só os do cardápio** — os "Colar Menino/Menina" de
  zircônia confirmados em 10/09/2026 e reconfirmados pelo Gustavo em
  29/09/2026 (Menino: 251551, 251552, 329494; Menina: 263236, 273470). No
  catálogo os meninos se chamam "Colar Menino…" e as meninas "Pingente
  Menina…" — é o mesmo tipo de peça, e a tela mostra todos como pingente. A
  linha **Cravejado** (640509, 718221, 222908, 649597) é outra linha, vendida
  avulsa, e **não** é componente; 311233 e 125745 não existem. "Qualquer
  peça" foi cogitado e descartado. O cardápio é dado
  (`config.montagem_componentes`), não deploy;
- a **corrente** (444032) sai sozinha em toda montagem, e sem corrente em
  estoque a venda é recusada;
- o modelo **não tem estoque próprio**: a venda baixa a corrente e cada
  pingente uma vez (§42), pelo mesmo `prepararPersonalizacoes`;
- a mesma combinação não pode ter dois modelos (a venda não saberia qual
  usar), e um código comercial não serve a dois modelos;
- o código comercial é um produto que já existe (os "Colar Casal/Filhos/
  Filhas" do catálogo, oferecidos como **sugestão** — nome parecido não é
  prova, §2) ou um código novo gerado na hora, com estoque 0.

**As configurações oficiais (29/09/2026, decisão do Gustavo).** Cinco
combinações têm código e preço fixos, e o servidor os impõe — nome parecido
não escolhe código (a adivinhação pelo nome casava "Dois Meninos" com o
314161, de três pingentes):

| Código | Nome | Preço | Composição (+ 1 × 444032) |
|---|---|---|---|
| 326660 | Colar Casal | R$ 129,00 | 1 Menino + 1 Menina |
| 311066 | Colar Filhos Dois Meninos | R$ 129,00 | 2 Meninos |
| 364945 | Colar Filhas Duas Meninas | R$ 129,00 | 2 Meninas |
| 314161 | Colar Filhos Dois Meninos e Uma Menina | R$ 159,00 | 2 Meninos + 1 Menina |
| 399872 | Colar Filhas Duas Meninas e Um Menino | R$ 159,00 | 2 Meninas + 1 Menino |

O código oficial que ainda não está no catálogo (311066) é cadastrado na
primeira venda com estoque 0. Um código oficial não serve a outra
combinação, e a combinação oficial não aceita código novo nem outro preço.
Combinações fora da tabela (três meninos, por exemplo) seguem o fluxo livre
acima. A lista mora em `COMPONENTES_PADRAO.configuracoes`
(`api/src/personalizacao.js`).

**O que fica em aberto, e é anunciado.** Os códigos comerciais que já existiam
com `qtd 1` (326660, 364945, 314161, 378852, 366066, 399872) continuam com esse
saldo no cadastro. Quando viram modelo, a venda passa a ignorá-lo (§42), mas o
patrimônio ainda o soma. Zerar é decisão de inventário, com movimento de
ajuste assinado — MONTAGEM-MONTE-SEU-COLAR §5.4 — e não foi feito aqui.

### 48. Cliente se exclui ou se arquiva — quem decide é o banco — §28

O mesmo desenho da peça (§18), aplicado ao cadastro de cliente. Na ficha, as
ações de cadastro ficam atrás de "•••" (Editar dados · Arquivar · Excluir, ou
Reativar quando arquivada), e "Excluir" primeiro **pergunta ao banco**
(`GET /api/clientes/:id/dependencias`):

- **sem nada** → exclui de verdade. Observação digitada não é histórico;
- **com qualquer coisa** — venda, linha da planilha (por `cliente_id` OU pelo
  nome, porque parte do histórico só casa pelo nome), venda da planilha,
  cobrança registrada, garantia, crédito, revisão de vínculo → recusa com 409
  e oferece **Arquivar**.

Arquivar (`arquivada_em`, `arquivada_motivo`) tira o cadastro da lista padrão,
da busca, do seletor da venda e de "Para chamar de volta". A ficha e todo o
histórico continuam; as compras dela continuam contando no histórico, porque
aconteceram. Reativar devolve tudo.

**Cadastro operacional não é cliente.** A planilha antiga lançou ocasiões e
ajustes como "cliente" ("Brinde dia das mães", "Brinde festa junina",
"Inventário"). As linhas deles viram saída sem faturamento pela
reclassificação (§30.5, `POST /api/historico/reclassificar`, sem movimento de
estoque) e o cadastro é arquivado — não apagado, porque as linhas da planilha
apontam para ele. Nunca por nome: "Brinde Souza" pode ser uma pessoa, e a
Sthefany Marques é dona e também cliente — só a linha que não registra
dinheiro sai, a compra paga continua dela.

**Linha reclassificada não é venda em lugar nenhum** (02/10/2026). Com
`historico_reclassificacao.status = 'aplicada'` ela fica preservada na
planilha, aparece em Saídas sem faturamento e sai de: Vendas feitas, busca
global, lista item a item (`SQL_ITENS_DE_VENDA`), faturamento, número de
vendas, ticket médio, Top, recorrência e "Para chamar de volta"
(`FILTRO_ITEM_HISTORICO`). O critério é a reclassificação oficial, nunca o
nome da cliente. Todas as linhas da Sthefany Marques foram reclassificadas
por confirmação do responsável em 02/10/2026 (presente → brinde; sem texto →
uso próprio); o cadastro dela continua ativo.

Rotas: `GET /api/clientes/:id/dependencias`, `DELETE /api/clientes/:id`,
`POST /api/clientes/:id/arquivar`, `POST /api/clientes/:id/reativar`,
`GET /api/clientes?arquivadas=sim`.

### 49. Inventário "bipou e marcha" — o sistema já sabe quanto deveria ter — §19

> **Na V2, substituído pelo §57 (06/10/2026)**: um bipe passou a ser uma
> unidade. O texto abaixo vale para a rota antiga `/itens` (painel clássico).

O jeito da Sthefany (vídeos de 02/10/2026), que é o jeito do Excel dela:

- **um bipe = a referência conferida**, nunca "+1 unidade". O servidor lê o
  esperado em casa NA HORA do bipe (total − maletas abertas) e grava
  `contado = esperado − faltando`, com `esperado_na_hora` e `faltando` na
  linha (`POST /api/inventarios/:id/itens {sku, faltando}`);
- **só a falta é digitada**, e só quanto falta (campo Faltando, ou "2 + Enter"
  no próprio leitor: número de 1 a 3 dígitos não é etiqueta). Sem falta, ela
  não toca em nada e bipa a próxima;
- **bipar de novo a mesma referência não soma** — "Já conferido";
- **não conferido não é falta.** Só o que ela disse vira diferença; o resto
  continua pendente, e só a declaração explícita no encerramento muda isso;
- peça com esperado **zero** em casa (tudo nas maletas) entra como 1
  encontrada — é sobra, e a tela diz;
- o esperado em casa diz **com quem está o resto**, por revendedora
  ("Evelyn 1 · Luciana 1"). A conta é a de sempre; ela só ganha nome.

**Variação.** A etiqueta do anel é a mesma para todos os aros, então o bipe
comum confere o **código inteiro** (`codigoInteiro: true`). Bate → conferido,
sem nada a atribuir a aro nenhum. Não bate → registrado e **não comparável**:
a falta não diz de qual aro é, e não vira movimento (regra 2). Escolher um aro
troca a conferência do código pela do aro; o esperado por aro só existe quando
a razão do código tem identidade inteira — sem ela o servidor pede quantas ela
achou (`precisaContado`). Em 02/10/2026 nenhum dos 27 códigos com variação tem
a razão identificada por aro. "+ Adicionar variação" na própria leitura usa a
mesma `definirVariacoes` de Peças (estrutura, nunca estoque) e fica registrada
em `inventario_eventos` (`POST /api/inventarios/:id/variacoes`).

Pausar e descartar não mexem em estoque; concluir congela o retrato; só a
diferença confirmada, com motivo, vira ajuste pela razão. Leitura que não
chegou ao servidor fica "não salva" na tela e **trava o encerramento**.

### 50. A classe de uma saída se corrige, com trilha — a fonte humana vence a regra — §30

Uma linha já reclassificada pode ter a CLASSE corrigida
(`POST /api/historico/reclassificar/:itemId/corrigir {classe, fonte, motivo,
observacao, custo}`). A decisão anterior vai para
`historico_reclassificacao_correcoes` (classe e motivo de antes, a nova, a
fonte, quando); a saída classificatória troca de tipo e o rótulo vira a
observação da fonte; o custo informado entra com histórico de valor. **Nunca
estoque**: saída com baixa é recusada (a classe está no movimento da razão —
lá é estorno e novo lançamento). Repetir a mesma correção não escreve nada.

Em 02/10/2026 a planilha "Saiu sem faturar.xlsx" da Sthefany (9 uso próprio,
26 brinde, 3 inventário) venceu a classificação automática para os códigos
que contém: 13 uso próprio → brinde e 1 sorteio → brinde. Custo 0 ou de
fórmula quebrada é "não informado". Saídas fora da planilha não mudam.

**Saiu sem faturar navega pelo motivo.** A tela principal mostra só os motivos
(somando saídas e registros antigos); clicar abre as peças daquele motivo.

### 51. A situação de um acerto de maleta vem do próprio acerto

Pago quando o recebido cobre o **líquido do acerto** (vendido − comissão);
parcial quando cobre só uma parte; a receber quando nada. Não do status da
venda inteira da planilha naquela data, que soma linhas que o acerto exclui
(`linhas_excluidas_json`). O caso: o acerto de 05/08/2026 da Evelyn Veiga, 26
peças, R$ 1.473,10 recebidos = líquido — "Parcial" vinha da linha 1303,
"Troca (anel de cruz)", R$ 10 NÃO PAGO, que o acerto exclui e que já é uma
conta própria em A receber ("Diferença de troca/garantia").

### 52. O dia é o de São Paulo — instante em UTC, data em America/Sao_Paulo

O banco grava instantes em UTC (`datetime('now')`: "2026-10-03 00:00:00",
sem fuso escrito; ou ISO com "Z"). Dia civil (`vendas.data`,
`maletas.aberta_em`, vencimentos) é só a data e não tem fuso. **O dia de um
instante é o de America/Sao_Paulo**, calculado pelo `Intl` — nunca cortando
os dez primeiros caracteres (dia de Greenwich), nunca somando ou subtraindo
horas à mão. Frontend: `fmtData` (`frontend/src/domain/formato.ts`);
servidor: `diaOperacional` (`api/src/fuso.js`). O caso: inventário aberto em
02/10/2026 às 21h aparecia como 03/10.

### 53. Histórico de inventários: todos os anteriores a 03/10/2026 eram teste

> **06/10/2026 (§57)**: a tela mostra o NÚMERO (`inventarios.numero`), não o
> id. O inventário real de PROD (id 12) é o Inventário #1.

Por decisão do dono (03/10/2026), os inventários #1–#7 — todos `cancelado`,
sem resultado, ajuste, saída, evento nem movimento — eram teste e foram
apagados com as 4 linhas de contagem, por SQL revisado e com precondição
(`docs/migracao-nao-venda/rodada-inventario-2026-10-02.sql`). O próximo que a
Sthefany abrir é o **primeiro inventário real**. "Inventário #N" é o `id`
técnico (AUTOINCREMENT): o contador NÃO foi reiniciado, para que nenhum id
volte a ser usado — o próximo aparece como **#8**.

**Excluir inventário (05/10/2026, pedido da Sthefany).** Existe
`DELETE /api/inventarios/:id`, e a V2 mostra "Excluir" só onde ele vale: o
inventário **não está em andamento** (descarte antes) e **não mexeu em
estoque** — nenhuma linha aplicada, nenhuma saída de perda (nem estornada),
nenhum ajuste de inventário, nenhum movimento que o cite. O que já alterou o
estoque é recusado com a lista do que ele alterou (§28: a razão continua
explicando o saldo). A exclusão apaga as leituras e deixa uma linha em
`inventarios_excluidos` (situação, datas, leituras, peças e as variações
criadas durante a contagem — que continuam no cadastro, porque são
estrutura, não estoque). O id não volta a ser usado.

**Saúde do estoque** (card do Inventário): verde só com inventário
concluído dentro do prazo (`config.inventarioDias`, padrão 45); nos últimos
7 dias do prazo (ou ¼ dele, se for curto), atenção; no prazo ou depois,
"Conferência vencida" em risco — nunca verde. Sem nenhum inventário real
concluído é **"Primeira conferência pendente"** (atenção): ausência de
divergência registrada não é estoque saudável. Cancelado não conta.

### 54. Ajustar estoque: a quantidade certa e o motivo, nunca o saldo digitado — §19

Pedido da Sthefany (05/10/2026): "preciso conseguir mexer na quantidade das
peças". A V2 tem **Ajustar estoque** na ficha da peça (cabeçalho, aba Estoque
e dentro de "Editar dados", que é onde ela procurou). Não é um campo que
sobrescreve o saldo: ela vê a quantidade atual (total, em casa, com
revendedoras), digita a **quantidade correta (total)**, escolhe o motivo —
Correção de cadastro · Contagem física · Erro de entrada · Ajuste
administrativo · Outro (com observação obrigatória) — e vê a diferença e o
"em casa antes → depois" antes de confirmar.

`POST /api/produtos/:sku/ajustar-estoque {quantidadeAtual, quantidadeCorreta,
motivo, observacao?, variacao?, seco?}` grava UM movimento `ajuste`, origem
`ajuste`, obs `Ajuste de estoque · <motivo> · de X para Y · <observação>`.
Recusa, sem escrever: `quantidadeAtual` diferente do saldo de agora (tela
velha); total abaixo do que está com revendedoras (a peça da maleta existe —
o caminho é o acerto); kit/montagem; diferença zero; motivo fora da lista.
**Variação (regra 2):** se a razão do código separa por aro (algum aro com
saldo), o ajuste exige o aro; se não separa — o caso dos 27 anéis de
02/10 —, o ajuste vale para o código inteiro e um aro informado é recusado.

### 55. Diferença de inventário é AJUSTE; perda é escolha explícita — §19 §30

Até 05/10/2026 toda diferença aplicada pela revisão virava saída `perda`
(até a sobra). Errado: inventário reconcilia o sistema com o físico, e a
diferença pode ser erro histórico, entrada duplicada, cadastro errado ou
movimento não lançado. Agora cada motivo tem uma **classe**:

- `ajuste` (padrão): Erro do sistema / contagem anterior · Entrada
  duplicada ou cadastro errado · Não encontrada na casa · Saiu sem
  lançamento · Entrou sem lançamento · Devolução não lançada · Outro. Vira
  movimento `ajuste`, origem `inventario`, obs `Ajuste de inventário #N ·
  <motivo> · contado C, sistema dizia E`, e uma linha em
  `inventario_ajustes` (a chave primária impede aplicar a mesma linha duas
  vezes; o INSERT anda no mesmo batch do movimento). **Não** entra em
  "Saiu sem faturar".
- `perda`: só **Perda confirmada** e **Quebrada ou danificada** — escolhidas
  por ela. Vão por `saidas_sem_faturamento` `tipo='perda'`, como antes, com
  estorno. Sobra nunca é perda (recusado).

O `/ajustar` do painel clássico (sem motivo) também vira ajuste. A V2 manda
`motivoId`; texto sem id é classificado pelo rótulo, e texto livre é ajuste.

### 56. Contagem dupla do go-live: a planilha "Estoque atual" era o TOTAL

A `Estoque (1).xlsx` do go-live (26/09/2026) foi lida como "o que está em
casa", e o total virou `planilha + Anexos I + maleta da Luciana`. Mas a
coluna "Estoque atual" já era o total, com as peças das maletas dentro. A
correção de 28/09 tirou o excesso só onde ele era exatamente a maleta nova
(#16–18). Em 05/10/2026, a pedido da Sthefany (anel 256359: ela comprou 7,
o sistema dizia 8), a auditoria de todos os códigos do go-live corrigiu em
PROD os 87 em que a prova é completa — planilha == total anterior, ajuste
== peças em maleta, excesso > 0 — com um movimento "Ajuste de estoque ·
Correção de cadastro" cada (143 peças; total 2231 → 2088). Os 3 prováveis
e os 65 inconclusivos ficam para o inventário: não se deduz saldo.
Auditoria: `docs/migracao-nao-venda/auditoria-golive-2026-10-05.csv`.

### 57. Inventário V2: um bipe é UMA unidade; a diferença é do código; variação não se inventa — §19 §49

Pedido da Sthefany (06/10/2026), depois de largar no meio o primeiro
inventário real (o id 12): a tela tem de ser a planilha dela — **código,
descrição, estoque total, com revendedoras, em casa (físico), conferido,
faltando**. Substitui o "bipou e marcha" (§49) na V2; a rota antiga
`/itens` continua para o painel clássico.

- **Um bipe = uma unidade conferida** (`POST /api/inventarios/:id/leituras`,
  gestos `bipe | mais | menos | definir | todas | nenhuma | mover | limpar`).
  O antigo "um bipe confere a referência inteira" aparecia como "✓ 6 em
  casa" depois de um bipe só, e ela entendeu que tinham sido contadas
  várias. "Estão todas aqui" continua existindo como UM toque explícito.
- **Leitura repetida**: cada leitura leva o id gerado pela tela
  (`inventario_leituras`, chave única); reenviar (rede ruim, aba
  recarregada) não soma. A fila do que não chegou fica guardada no
  aparelho e é reenviada ao abrir de novo.
- **Bipe acidental** (desde 06/10/2026 sem prazo — ver §59): o mesmo código lido de novo em menos de 4 s, sem
  outro código no meio, NÃO soma — a tela pergunta ("Essa peça acabou de
  ser lida" · Contar outra unidade · Foi engano). A câmera ainda descarta a
  mesma etiqueta por 1,8 s em silêncio.
- **Variação não é unidade única**: conta-se por variação (nº23 → 2). Bipe
  num código com variação entra em "variação não informada" até ela tocar
  na variação certa (`mover`). Nada é atribuído a um aro sem ela dizer.
- **Criar variação no inventário** (`POST /api/inventarios/:id/variacoes
  {valor, quantidade}`) cria a variação OFICIAL (a mesma `adicionarVariacao`
  de Peças: cadastro, vendas, maletas, próximos inventários). As peças já
  bipadas sem variação passam para ela antes de somar — o bipe e a criação
  não contam o mesmo anel duas vezes.
- **Nome de variação**: "23", "nº23", "nº 23", "N23", "n°23" e "Aro 23"
  são a mesma (`variacao-nome.js › chaveDaVariacao`). A que já existe é
  devolvida (`jaExiste`, `existente`), nunca duplicada. A grafia nova segue
  a das irmãs do atributo; sem irmã numérica, número puro vira "nº19".
- **A diferença é do CÓDIGO** (conferido − em casa), e o retrato congela
  em qual variação cada peça dela entra (`inventario_resultado.partes_json`):
  - `codigo` — a razão não separa por variação (todo o saldo "sem
    variação", os anéis do go-live): ajuste no código inteiro, sem
    variação (mesmo critério do §54);
  - `porVariacao` — a razão separa e TODA peça de casa foi contada numa
    variação: cada variação recebe a diferença que ela contou;
  - `escolher` — a razão separa mas houve peça contada sem variação: a
    diferença aparece, e só vira movimento quando ela diz de qual variação
    é (`destino`); sem isso fica pendente, e o resto do inventário segue.
  O antigo "não comparável" deixa de nascer em inventário novo.
- **Peça com revendedora de variação desconhecida** fica "variação não
  informada" — no inventário, na ficha e na distribuição. "Identificar
  variação" (na ficha da peça em conferência) grava a variação da maleta
  quando a informação aparecer (`/api/pendencias/variacao/maleta`).
- **Distribuição parcial** (`/variacoes/distribuir {parcial: true}` e
  `POST /api/inventarios/:id/variacoes/guardar`): a soma das variações
  pode ficar ABAIXO do total — o resto é "variação ainda não informada".
  Acima do total é recusado (é Ajustar estoque). Nenhuma variação fica
  abaixo do que a maleta tem dela, e a peça da maleta sem variação conhecida
  continua em "não informada". Repartição: o total nunca muda.
- **Balanço antes de finalizar** (`GET /api/inventarios/:id/balanco`,
  nada escrito): unidades esperadas em casa, conferidas, peças não
  conferidas, com falta, com sobra, e o impacto ("3 peças terão o estoque
  reduzido"). Não conferida continua como está — nunca vira falta sozinha.
  Motivo padrão "Contagem física" (ajuste de inventário); perda só se ela
  escolher (§55); sobra nunca é perda.
- **Número visível** (`inventarios.numero`): começa em 1, segue a ordem de
  abertura e é o que a tela e o histórico da peça mostram ("Ajuste de
  inventário #1 · Contagem física · contado 4, sistema dizia 5"). O id é
  técnico e não volta; o número de um inventário excluído (que por regra
  não mexeu em estoque) pode ser reaproveitado. Em PROD o id 12 virou o #1.
- **Nada técnico na tela**: nem id de variação, nem id do inventário, nem
  enum, nem nome de rota, nem "painel clássico".

### 58. Variação do estoque físico não depende da loja online — regra 4, §57

Origem: 06/10/2026, código 391471. A Nuvemshop vende o anel com UMA
variante ("Banho de Ouro 18K · n°18", loja online: 2); a importação da loja
não grava estrutura de produto com variante única, e no inventário a
Sthefany criou "nº24" e "nº18" aqui. Salvar nº24 = 1 e nº18 = 1 na ficha
era recusado com "A variante 1509838878 não existe na loja para 391471": a
distribuição conferia contra UMA fonte (a loja, ou o cadastro daqui se a
loja tivesse menos de duas variantes), e a tela mandava as duas.

- **Distribuição parcial** (V2 e inventário) aceita a UNIÃO: variante da
  loja e variação criada aqui são ambas destino legítimo de peça física.
  Salvar não fala com a Nuvemshop, não publica, não cria vínculo, e
  funciona com a loja fora do ar ou a sincronização desligada.
- **Mesmo aro, dois lados**: a variante da loja cujas outras partes são
  constantes no produto ("Banho de Ouro 18K" em todas as variantes) é o
  mesmo aro da variação daqui de mesma chave (§ "nº18 = n°18 = Aro 18").
  Na visão de estoque (`GET /api/produtos/:sku/variacoes?visao=estoque`)
  ela deixa de ser uma segunda linha e vira só "loja online: N" na linha
  daqui. Só vale par único dos dois lados, e só se a variante da loja não
  tem saldo nem peça em maleta — com saldo, as duas continuam visíveis e
  ninguém escolhe por ela (regra 2). Anel em Dourado e Prata não tem par.
- **Nenhum vínculo inventado**: a variação daqui continua com o id dela;
  ligar à variante da loja (e com isso passar a mandar estoque para lá) é
  outro ato, explícito. Na mistura loja + daqui, as linhas da loja não são
  copiadas para `produto_variacoes` (recombinaria a estrutura).
- **Separação na tela**: "loja online: N" e "ainda não está na loja
  online" são informação; o número que manda é o do sistema.
- **Mensagem humana**: id da Nuvemshop, id interno, UUID e texto de servidor
  não aparecem; no lugar, o que fazer ("Feche e abra as variações de novo —
  nada foi salvo"). O painel clássico mantém as mensagens e a resposta de
  sempre.
- Auditoria de PROD em 06/10/2026: 24 códigos tinham variação criada aqui
  ao lado de variante da loja, e salvar era recusado em todos — 17 com a
  loja de variante única (todos com par único, inclusive a ordem "n°17 ·
  Banho"), 7 com a loja de 2+ variantes já vinculadas e um aro novo criado
  aqui. Nenhum id da loja obsoleto, nenhum saldo preso em variante
  inexistente, nenhum nome duplicado dentro do cadastro daqui. Nada
  precisou ser reescrito no banco.


### 59. Inventário V2: a mesma peça nunca é contada duas vezes em silêncio — §57, regra 9

Origem: 06/10/2026, primeiro uso do inventário novo em PROD. A Sthefany
bipava a peça, olhava a ficha e bipava de novo a MESMA peça passados mais
de 4 s — e a segunda leitura somava. Depois copiava as quantidades da
planilha antiga dela por cima do que já tinha bipado; numa peça com
variação, os bipes ficavam em "não informada" e o número digitado no aro
somava a eles (2 bipados + 5 no nº23 = 7).

- **Scanner — o mesmo código de novo, sem outro no meio, numa peça já
  conferida, NÃO soma**: a tela pergunta "Essa peça já foi conferida." com
  a peça e a "Quantidade já conferida", e só soma no toque em **Contar
  outra unidade**; **Foi engano** não muda nada. Não há prazo — 2 s ou
  20 s depois é a mesma pergunta; os 4 s só mudam a frase ("o leitor pode
  ter lido a mesma etiqueta duas vezes"). Cada repetição pergunta de novo.
  A → B → A conta normal. Peça desfeita ou em zero conta no primeiro bipe.
- **Enquanto pergunta, nada soa como sucesso** (tom de atenção, sem "✓") e
  a câmera fica pausada. Com o aviso aberto, outro código bipado fecha o
  aviso SEM contar o repetido e conta o novo. O foco nunca fica num botão
  que grava (o Enter do leitor USB não confirma nada).
- **A última leitura fica guardada no aparelho** (por inventário):
  recarregar a página não transforma o próximo bipe da mesma peça em
  "primeiro bipe".
- **Número digitado = QUANTIDADE TOTAL CONFERIDA da linha**, nunca "mais
  X" (`definir`, já absoluto no servidor). Sobre uma contagem existente a
  tela pergunta "Substituir a quantidade conferida?" com `2 → 5` —
  **Substituir por 5** / **Cancelar** (Cancelar volta o campo ao que
  estava). O mesmo número não grava nada (nem evento: o servidor responde
  `inalterada`). Número menor é correção legítima: pergunta, não bloqueia.
  Linha ainda não conferida: define direto.
- **Variação com bipes "não informada"**: digitar no aro pergunta se as
  peças bipadas sem variação são daquele aro — **Sim** (elas passam para o
  aro: 2 bipadas + "5 no nº23" = nº23 5, total 5), **Não, são de outra
  variação** (ficam à parte: total 7, dito por ela) ou **Cancelar**. A
  tela mostra o total de cada saída. Nunca escolhe sozinha (regra 2). No
  servidor é `definir` com `naoInformadas: true`: no mesmo lote, até o que
  cabe no número dito sai de "não informada" e entra no aro.
- **Idempotência intacta**: a mesma leitura (mesmo `leituraId`, retry,
  rede ruim, aba recarregada) nunca soma; "Contar outra unidade" é uma
  leitura nova. O servidor não distingue duas peças iguais de uma lida
  duas vezes — essa trava é da tela, antes de enviar.
- Nada disso mexe em estoque nem no painel clássico (congelado; a rota
  `/itens` dele não mudou).

### 60. Inventário V2 cabe no plano gratuito do D1, e o fechamento nunca baixa a mesma peça duas vezes — §43, §57, §59, regra 9

Origem: 08/10/2026, inventário #1 de produção (id 13). A cota diária de
leitura do D1 (5 milhões de linhas, da CONTA, renova 00:00 UTC = 21h de
Brasília) acabou em 06/10/2026 por volta das 16h de Brasília, no dia em que
a Sthefany fez a maior parte da contagem: 5,09 milhões de linhas lidas, quase
tudo do inventário. Cada bipe lia ~3.900 linhas — o catálogo inteiro, para
devolver uma "cobertura" que a tela nem usava. E o Balanço e o Finalizar
faziam UMA consulta por código conferido (886 com 821 códigos): o plano Free
do Workers recusa a requisição que passa de 50 consultas ao D1, então o
inventário não conseguia ser finalizado em produção.

- **Bipe**: responde só as linhas do código (sem `cobertura`), ~40 linhas e
  9 consultas, que não crescem com o catálogo. A leitura já gravada nunca
  vira erro na resposta: se reler o código falhar, a resposta é calculada do
  lote que entrou.
- **Balanço e fechamento**: os movimentos posteriores às contagens são lidos
  UMA vez; 10 consultas com qualquer número de códigos. **Aplicar** usa uma
  chamada ao D1 por diferença (o id do movimento vem do próprio lote), e a
  tela manda as diferenças em lotes de 20. Cada diferença continua aplicada
  uma vez só (`inventario_ajustes`).
- **O que é "depois da contagem"** (retroação, D10): só o fato físico
  posterior. Dois casos NÃO retroagem, porque somá-los baixava a mesma peça
  duas vezes no fechamento (no #1: 15 códigos, 27 peças):
  - **Ajustar estoque (§54) feito depois de contar** é a palavra mais nova
    sobre o total: a linha fica conferida, diferença zero, com o aviso
    "Estoque ajustado depois da contagem (…). Vale o ajuste; o inventário
    não mexe de novo.";
  - **venda ou saída sem faturamento lançada depois, com a data do fato
    ANTERIOR ao dia da contagem** (brinde de 27/09 lançado em 07/10): a peça
    já estava fora quando ela contou. O aviso diz isso. No MESMO dia da
    contagem não dá para saber a ordem: segue sendo posterior, como antes.
- **Cota esgotada**: a tela não repete sozinha a leitura que voltou com
  `limite: 'd1-leitura-diaria'` (repetir só gasta a cota do dia seguinte);
  diz que o banco volta às 21h, que o que foi salvo continua salvo e que a
  leitura pendente está guardada no aparelho até ela tocar em "Tentar de
  novo". Reenviar nunca soma (§57).
- **Teto de 50 consultas**: "Too many API requests by single worker
  invocation" vira 503 com `limite: 'd1-consultas-por-requisicao'` e uma
  frase humana, em vez de "Falha interna".
- **Vigia**: toda requisição conta as consultas e as linhas que o D1 já
  devolve; a pesada (≥ 35 consultas, ≥ 20.000 linhas conhecidas ou ≥ 5 s)
  vira UMA linha `{"evento":"d1-requisicao-pesada",…}` no log — rota sem
  query string, sem corpo, sem dado pessoal. O Workers Logs guarda só o que
  o código escreve (`invocation_logs = false`).
- **Correção pós-inventário (08/10/2026)**: os 21 códigos que a Sthefany
  conferiu à mão e o 124111 (procurou e não achou) entraram pelo próprio
  inventário #1 — contagem dela, concluir, ajuste de inventário com motivo e
  a observação "Correção pós-inventário Sthefany — 08/10/2026 · …". Nenhuma
  venda, brinde, cliente ou faturamento foi criado: os eventos já existiam
  (histórico de vendas e Saídas sem faturamento não movimentam estoque —
  §21, §36.3). Script: `scripts/reconciliacao/correcao-pos-inventario-2026-10-08.mjs`.

Provado em `src/inventario-d1-leitura-test.mjs` (servidor) e
`frontend/src/features/inventario/cota.test.ts` + `conferencia.test.tsx`
(tela). Medição e números: `docs/releases/V2-INVENTARIO-D1-RECONCILIACAO-2026-10-08.md`.

### 61. Estoque online: a loja recebe o saldo em casa, código por código, pela fila — §5.1, §5.2, §60, regras 1, 5 e 9

Origem: 08/10/2026, depois do inventário #1 conciliado (§60). Até aqui a
loja não acompanhava o Marquesa: o cron estava desligado desde o go-live
(22/08), e cada venda relia o catálogo inteiro dos dois lados para empurrar
TODOS os códigos — a soma das diferenças antigas batia no freio ("zeraria 60
produtos") e o envio inteiro parava. Nenhuma venda chegava à loja.

- **O número**: a loja recebe o estoque **EM CASA** (`produtos.qtd` menos o
  que está em maleta aberta/em acerto), nunca o total. Peça com revendedora
  não está à venda online. Código com variação: o saldo de cada variante é o
  da variação **menos** o que a maleta já disse ter levado daquela variação
  (antes a peça identificada continuava à venda na loja). Kit e Monte seu
  Colar: o disponível calculado das peças.
- **Saldo absoluto, nunca delta**: o PATCH leva `stock = N`. Mandar duas
  vezes dá o mesmo número; nenhuma tentativa repetida baixa de novo.
- **A fila (outbox)**: `nuvemshop_fila`, uma linha por código. Quem enche é o
  BANCO — gatilho em `movimentos` (inserção e troca de variação),
  `maleta_item_variacoes` e `produtos.produto_id_loja` — na mesma transação
  do movimento. Não existe caminho de estoque que esqueça de pedir o envio,
  nem processo que caia entre a baixa e o pedido.
- **Quando sai**: logo depois da operação (venda, cancelamento e maleta na
  própria requisição; todo o resto — brinde, ajuste, inventário, garantia —
  em segundo plano pela mesma requisição, `ctx.waitUntil`) e, de reserva, no
  cron a cada 10 minutos. A operação local nunca depende da loja: se ela
  cair, a venda vale, o código fica `erro` com a próxima tentativa marcada
  (1, 5, 15, 30, 60, 180, 360, 720 min) e, depois da 8ª, para e espera
  "Tentar novamente".
- **Incremental**: o envio de uma venda lê UM produto da loja (`GET
  /products/{id}`) e só as linhas daquele código aqui. O catálogo inteiro só
  é lido quando a fila acumula mais de 12 códigos (caminho em lote) e na
  conferência. Venda de um código com envio: ~22 chamadas ao D1 no total.
- **Duas rodadas, um código**: `travado_ate` (arrendamento por UPDATE
  atômico) — quem não pegou, não mexe. `versao` cresce a cada novo pedido:
  rodada que mandou o número velho enquanto o código mudou NÃO marca
  sincronizado, e a seguinte manda o novo.
- **Pedidos do site antes de empurrar (§5.1)**: o cron puxa os pedidos desde
  `config.syncCorteEm` (obrigatório: sem corte, nada sai) antes de processar
  a fila. A requisição não puxa; por isso tem **cautela**: se a loja tem
  menos do que o último saldo enviado e o nosso número é maior que o dela,
  pode haver venda do site ainda não importada — o código fica para o cron.
  A baixa do pedido do site guarda a variante vendida (`variant_id`).
- **Freio**: vale para o caminho em lote sem gente (mais de
  `syncLimiteMudancas` códigos ou `syncLimiteZerar` variantes zeradas): o
  cron para, anuncia em `config.nuvemshopFreio` e não escreve. "Sincronizar
  pendências" (gesto humano) passa. A venda de um código não passa pelo
  freio — era isso que travava tudo.
- **Kill switch**: `config.nuvemshopSyncAtivo` (ausente = DESLIGADO). Desligado,
  nada sai e a fila continua guardando; religar entrega o que ficou parado.
  Tela Nuvemshop › Conferir e reconciliar, ou `PUT /api/nuvemshop/estoque/automatico`.
- **Revisão, não chute**: código que o sistema não sabe endereçar (variante
  sem id, SKU em dois produtos, peça na maleta sem dizer o aro, repartição
  pela metade) vira `revisao` com a explicação e os dois números. Peça sem
  anúncio fica `ignorado` e mora na Preparação.
- **Conferir e reconciliar** (reserva do automático): conferir lê a loja
  inteira, NÃO escreve nela e grava `nuvemshop_conferencia` (uma linha por
  variante: ok, divergente, só no sistema, só na Nuvemshop, sem SKU, SKU
  duplicado, sem mapeamento, variante sem mapeamento, aguardando preparação,
  erro de integração). Reconciliar põe os divergentes na fila e manda o
  saldo calculado NA HORA do envio. Uma conferência diária (06:00) refaz o
  retrato; divergência pequena volta para a fila sozinha, em massa espera
  gente.
- **O que esta regra NÃO faz**: não cria produto, não publica, não muda
  preço, nome, URL, descrição, SEO, imagem ou categoria na loja (criar oculto
  e publicar com clique são §62). Produto com
  estoque zero continua publicado com `stock = 0` (a loja mostra
  "esgotado"); a URL não muda.
- **Preparação para Nuvemshop**: cada peça diz o que falta (foto, nome,
  descrição, SEO, categoria, preço, SKU, variante, erro) e em que situação
  está (aguardando preparação, aguardando revisão, pronta para publicar,
  publicada, com erro). Para o que já está na loja, descrição/SEO/imagens vêm
  da última conferência — nada é sobrescrito, só apontado.

Provado em `src/nuvemshop-fila-test.mjs` (49 provas: venda, idempotência,
loja fora, brinde, consignação, retorno, variante, ajuste, produto
incompleto, corrida, corte, cautela, kill switch, freio, conferência) e
`src/vendas-nuvemshop-test.mjs`. Release:
`docs/releases/V2-NUVEMSHOP-SYNC-2026-10-08.md`.

### 62. Cadastrar na Nuvemshop ≠ tornar visível: a peça nasce OCULTA, e só o clique publica — §44, §58, §61, regras 2, 4 e 9

Origem: pedido de Gustavo, **09/10/2026**. Até aqui o produto só ia para a
loja quando foto, texto, SEO e preço estavam prontos juntos — e ninguém o
criava: 334 códigos com peça em casa esperavam em "falta subir". Esta regra
separa os dois atos e substitui, para este caminho, a trava de publicação da
Fase 4.5 (DR-004: `NUVEMSHOP_PUBLICACAO_ENABLED` continua ausente e o
publicador antigo continua morto).

- **Cadastrar é do sistema.** Peça ativa, com nome comercial, peças (qtd > 0)
  e sem anúncio nasce na Nuvemshop com `visibility = hidden`: tem id,
  variantes, SKU, estoque, descrição, SEO e categoria (só a de MESMO nome na
  loja, categoria raiz; nunca por semelhança). Hidden não aparece, não é
  comprável e a URL responde 404. **Nunca `unlisted`**: ele some da vitrine
  mas é comprável pelo link direto.
- **Tornar visível é da pessoa.** Só `POST /api/nuvemshop/catalogo/:sku/publicar`
  (o botão "Publicar na Nuvemshop") troca hidden → visible, e só depois de
  reler o produto NA LOJA e conferir foto, nome, SKU em toda variante, preço
  > 0 em toda variante, estoque controlado, descrição, título e meta de SEO,
  categoria, estoque sincronizado pela fila (§61) e nenhuma pendência de
  variação aqui. Ok só quando a releitura diz `visible`. Foto chegando,
  texto pronto, nada disso publica sozinho.
- **Travas**: `NUVEMSHOP_WRITES_ENABLED` e o kill switch
  `config.nuvemshopCatalogoAtivo` (ausente = desligado: nada é criado, nenhuma
  foto ou texto sobe, ninguém publica; o estoque de §61 segue igual). A
  resposta da criação é CONFERIDA: se a loja não disser `hidden`, o produto é
  escondido na hora (`visibility`, e `published:false` de reserva), a rodada
  para e o kill switch desliga — alguém precisa olhar antes de religar.
- **Nada é inventado.** Sem preço válido a variante vai SEM preço (oculto,
  "falta preço"; não publica). O texto do site é a regra editorial de
  08/10/2026 (`catalogo/texto-site.js`, a mesma de `seo-catalog-audit.py`)
  aplicada ao NOME cadastrado: família, desenho escrito no nome e uso — nenhum
  tamanho, medida, pedra, material, banho, peso ou garantia que o nome não
  diga. Nome repetido, nome sem família, nome longo demais ou com promessa
  (garantia, hipoalergênico...) → "Precisa de informação", sem texto. O
  rascunho escrito por gente (`catalogo_publicacoes`) vence o gerado.
- **Nunca dois anúncios do mesmo código.** Imediatamente antes de cada POST
  a loja é consultada pelo SKU (`GET /products/sku/{sku}`); SKU que já está
  lá é ADOTADO (vínculo gravado), não criado. A consulta prova que funciona
  antes da rodada (um código sabidamente na loja tem de ser achado), senão
  nada é criado. A loja inteira NÃO é lida: com ~850 produtos isso estourou
  a CPU da invocação (09/10 08:20) — e os produtos que aquela rodada criou
  antes de morrer foram adotados na seguinte, sem duplicar. A reserva (`nuvemshop_catalogo.estado = 'criando'`, arrendamento de
  10 min) é gravada ANTES do POST; Worker que morre entre o POST e a gravação
  é resolvido pela leitura da rodada seguinte. Falha de API vira `erro` com
  tentativa contada (máx. 5); 401/403/5xx param a rodada.
- **Mesmo modelo, outro código, não cria.** Nome igual (sem o aro "nºNN" e sem
  a família) a um produto que a loja já tem → bloqueado, "pode ser o mesmo
  modelo já anunciado sob X": decisão humana (o 334078 é o aro 27 do 334079).
  Kit e Monte seu Colar também não entram por aqui.
- **Variação (regra 2).** Variações criadas aqui sobem com o atributo e os
  valores exatamente como gravados. Estoque por variação só quando conhecido
  (uma variação só = todas as peças; ou o código inteiro repartido e toda peça
  de maleta identificada). Senão cada variante nasce com 0 e a peça fica
  "Variação aguardando conferência de estoque" — não publica. Cor gravada no
  atributo "Tamanho" não sobe: "Revisar variação". Variação daqui que falta
  num anúncio que JÁ existe só é criada lá quando o anúncio tem 2+ variantes,
  o código já está em revisão na fila (não sincroniza hoje — nada regride),
  os atributos são os mesmos e as irmãs têm um preço comum; nasce com 0, na
  grafia das irmãs ("nº17" → "n°17"), e a variação daqui ganha o id de lá.
  Anúncio de variante única fica para intervenção.
- **Estoque repartido aqui × variante única lá** (o 391471): a variante da loja
  recebe só o saldo da variação equivalente (par único, §58), nunca o total.
  Repartição pela metade ou maleta sem variação → revisão. Movimento com id
  `local:…` é endereçado pelo NOME da variação (o id local não existe lá).
- **Oculto participa do estoque.** Gravar `produtos.produto_id_loja` dispara o
  gatilho de §61; o oculto recebe o saldo em casa pela fila como qualquer
  anúncio, e chega à publicação com o número certo.
- **Preparação para Nuvemshop** responde por peça: não cadastrado · oculto em
  preparação · pronto para publicar · publicado · com erro, com o que falta
  (foto, descrição, SEO, preço, categoria, revisar variação, conferir estoque
  da variação) e o detalhe técnico (id, visibilidade, origem). A visibilidade
  vem da conferência (`produtos.visibilidade_loja`) e, para o que este
  caminho criou, de `nuvemshop_catalogo`.
- **O que esta regra NÃO faz**: não muda nome, URL, preço, imagem, texto, SEO
  ou categoria de anúncio que já existia; não despublica; não reparte estoque;
  não publica sem clique.

Provado em `src/nuvemshop-catalogo-test.mjs` (27 provas, os 14 casos do pedido
e mais: API que ignora `visibility`, kill switch, cron, 391471). Ensaio sobre
cópia de PROD: 590 mapeados continuam mapeados (589 iguais + o 391471, que
passa de 2 para 1). Release: `docs/releases/V2-NUVEMSHOP-CATALOGO-OCULTO-2026-10-09.md`.

### 63. Histórico não é pendência; oculto em preparação não é problema; publicar vários é publicar um de cada vez — §42, §61, §62, regras 2, 3 e 9

Origem: pedido de Gustavo, **09/10/2026**. A "Loja online" mostrava dez
números de universos diferentes e centenas de "problemas" que não pediam
ação; a Central de Pendências pedia "Resolver" para vendas que já tinham
acontecido.

- **Venda concluída sem a variação registrada é HISTÓRICO.** A peça saiu, o
  estoque foi baixado, o fato está na venda (`venda_itens.variacao` nulo é o
  registro honesto de "não se sabe"). Não vira pendência, não pede para
  escolher aro depois, não cria movimento e não reescreve a venda.
  `GET /api/pendencias` a devolve só em `historico` (fora de `total`, do sino
  e da lista). `resolverVariacaoDaVenda` continua existindo para quem quiser
  registrar o aro por iniciativa própria — só deixou de ser cobrado.
- **O estoque de HOJE sem divisão por variação continua pendência**
  ("Conferir estoque por variação"), porque decide o que vai para a loja. O
  texto fala da contagem a fazer, nunca da venda que deixou o saldo incerto.
  Regra 2 intacta: nada é repartido por palpite (§64: a divisão que a
  contagem do inventário PROVOU é gravada pelo sistema).
- **Venda com `nuvemshop_status = 'revisao'` sai da Central.** Desde §61 a
  loja recebe o saldo do código pela fila; a venda em revisão só espelha "o
  código está em revisão" e `regularizarVendasStmt` a fecha sozinha. A
  pendência é a do código. Venda com `erro`, `estoque_divergente` ou
  `cancelamento_pendente` continua.
- **Peça em maleta sem variação aparece uma vez**, pela maleta (que tem a
  resposta: maleta, revendedora, quantidade). A do código só aparece quando
  não houver a da maleta.
- **Oculto que nunca foi publicado é preparação (§62), não alerta.** "Saiu do
  ar" só vale para o que foi publicado POR AQUI (`nuvemshop_catalogo.publicado_em`)
  e deixou de estar visível.
- **Conferir só lê; corrigir escreve, e diz antes.** "Conferir agora" compara
  e não muda nada na Nuvemshop. "Corrigir automaticamente o que é seguro"
  manda o saldo daqui às variantes divergentes, com confirmação; código sem
  divisão segura fica de fora, como sempre.
- **Publicar vários é publicar um de cada vez.** "Publicar selecionados" e
  "Publicar todos os prontos" mostram o resumo (produtos, peças, preço,
  imagem, pendências críticas) e então chamam `publicarNaLoja` peça por peça;
  cada uma é relida NA LOJA na hora dela. A que mudou desde a lista é pulada
  com o motivo (409); falha de rede não derruba as outras; nada é
  tudo-ou-nada. `publicarNaLoja` lê do D1 só aquele código
  (`lerBase(db, { skus })`) — o lote não multiplica a leitura do catálogo.
- **Os números têm um universo cada.** Publicados na loja = códigos com
  anúncio visível; ocultos em preparação = cadastrados ocultos com algo a
  completar; prontos = ocultos completos; precisam de atenção = códigos com
  algo que só uma pessoa resolve; códigos sincronizados = estoque em dia na
  fila (visíveis e ocultos).
- **Miniatura da Preparação**: a imagem que a Nuvemshop já tem do código,
  depois a foto daqui do MESMO código, depois o losango. SKU exato, nunca
  "parecido".

Prova: `src/loja-online-test.mjs` (backend, loja falsa),
`frontend/src/features/nuvemshop/visaoGeral.test.ts`, `LojaOnline.test.tsx`,
`frontend/src/features/publicacao/lote.test.ts`, `src/v2-loja-online-qa.mjs`
(1366 e 390 px).

### 64. O que os dados provam, o sistema resolve; pendência é só decisão de gente — §58, §61, §62, §63, regras 2, 3 e 9

Origem: pedido de Gustavo, **09/10/2026** (tarde). "Uma pendência só deve
aparecer quando existir uma decisão humana real, necessária e impossível de
determinar com segurança pelos dados existentes."

- **Estoque zero é ESTADO.** Oculto sem peça em casa ganha a situação
  `sem_estoque`: fica cadastrado, fora de "ocultos em preparação", de
  "prontos", de "precisam de atenção" e da fila de trabalho, numa aba própria
  ("Sem peça em casa"). Entrou peça, volta sozinho. A chave de pendência
  `sem_estoque` deixou de existir. Publicado com estoque zero é "esgotado",
  como sempre — a fila manda 0.
- **Categoria óbvia é aplicada** (`taxonomia.js › categoriaCanonica`).
  A categoria daqui manda; "Outros"/"Sem categoria" caem na primeira palavra
  do nome. A árvore da loja (09/10) não tem "Argola" nem "Pingente": Argola →
  Brinco; Pingente Menino/Menina → Raizes (onde estão todos os publicados);
  Conjunto de prata 925 → Prata 925 › Conjuntos. Pingente avulso, conjunto
  banhado a ouro e "Outros" sem pista no nome continuam pergunta. A loja só
  recebe categoria em anúncio que está SEM nenhuma (`preencherCategorias`,
  releitura antes e depois); nada que já tenha categoria é trocado.
- **Taxonomia de atributos da loja** (auditada em 09/10): "Cor" carrega o
  banho em ~640 variantes (convenção da loja, base dos filtros), "Tamanho"
  carrega aro e comprimento, "Cores" a pedra quando "Cor" já é o banho. Não
  se cria um terceiro atributo "Acabamento". ERRO é o valor contradizer o
  atributo: "Tamanho = Azul" vira "Cor", "Cor = nº19" vira "Tamanho" — só
  quando TODOS os valores do atributo contradizem e o nome certo está livre;
  valor desconhecido não é tocado. Corrige-se na entrada (`definirVariacoes`,
  `adicionarVariacao` não usa mais "Tamanho" como padrão para cor) e no
  cadastro existente (`normalizarAtributosLocais`, só origem local). O NOME da
  variação — o que movimentos e maletas guardam — nunca muda.
  Renomear atributo de anúncio que JÁ existe na loja não é feito: a API não
  documenta, e 3 anúncios com "Cores = Banho de Ouro 18k" ficam registrados
  como decisão, não como pendência.
- **Variação que existe aqui e falta na Nuvemshop é criada**
  (`criarVariantesFaltantes`), também em anúncio de variante única.
  Identidade e quantidade são separadas: a variante nasce com estoque **0**
  (nunca `null`, que lá é infinito) e o saldo vai pela fila quando é
  conhecido; sem divisão, o código fica em revisão e a única pergunta é
  "quantas de cada?". A variante é montada na estrutura do anúncio: o valor
  daqui do mesmo tipo (aro com aro, cor com cor), com a grafia das irmãs
  ("nº24" → "n°24"); o valor que todas as irmãs têm igual (o banho) é
  copiado; o que não dá para montar para com o motivo. Preço: o comum das
  irmãs, senão o daqui; sem nenhum, não cria. Equivalências antes de criar:
  nº19, n°19, Nº 19, 19 e Aro 19 são o mesmo; **nº19 nunca é n°21**. As
  variações daqui equivalentes às da loja são LIGADAS no mesmo ato (sem isso o
  anúncio de variante única viraria multivariante e o saldo da equivalente
  perderia o endereço). Releitura antes (pode ter sido criada à mão) e depois
  (cada valor UMA vez, todas com o SKU do código; senão, erro anunciado).
- **Par por unicidade** (`equivalenciasLojaLocal`): uma variante só na loja e
  uma variação só aqui são a mesma peça quando um valor está contido no outro
  palavra por palavra e os números são iguais ("Verde" ≡ "Verde Esmeralda";
  "nº19" ≠ "n°21"; "Verde" ≠ "Azul").
- **A divisão por variação que o INVENTÁRIO provou é gravada**
  (`reparticao-inventario.js`). A bipagem do inventário registra a variação de
  cada peça; quando o código fechou conferido, nenhuma peça foi bipada sem
  variação, nada se moveu depois do fim do inventário (venda, entrada, maleta)
  e contado + maleta identificada = total, a repartição é gravada pelo mesmo
  caminho da tela (`distribuirVariantes`, parcial), com a origem escrita no
  movimento. Peça em maleta sem variação identificada impede — essa pergunta
  é real e continua da pessoa; respondida, a rodada seguinte reparte o resto
  sozinha. Anúncio de variante única que não corresponde a nenhuma variação
  contada também impede (repartir não pode tirar o código da sincronização).
  Regra 2 intacta: nada é repartido por palpite; o que se usa é a contagem.
- **"Mesmo modelo já anunciado" exige a mesma família** (`chaveDoModelo`):
  "Colar Ponto de Luz Rosa" não é "Brinco Ponto de Luz Rosa". Nome sem
  família usa a categoria daqui; do lado da loja, sem família casa com
  qualquer uma (na dúvida, pergunta).
- **Kit não é pendência** (`naoSeAplica: 'kit'`): não vira anúncio por este
  caminho e não há o que alguém faça. Some da Central e de "decidir".
- **A Central só recebe a peça sem anúncio que espera DECISÃO** (mesmo modelo
  de outro código). A que o sistema cria sozinha vai para a Preparação, onde
  foto e preço se completam.
- **Nada de código interno na tela operacional.** `sem_preparador`, `sem_r2`,
  `linha_de_base`, `variante_criada` ficam no diagnóstico técnico. O checklist
  da Preparação tem duas partes: CADASTRO (Cadastro, Descrição, SEO,
  Categoria, Preço, Variações, Foto — ✓, ✕, ! ou ↻ "o sistema está
  resolvendo") e DISPONIBILIDADE ("Estoque em casa: 0 — fora da fila até
  entrar estoque", sem ✕).
- **Tudo isso é regra permanente, não limpeza.** O cron (`*/10`, com a fila
  ociosa e `config.nuvemshopCatalogoAtivo` ligado) faz uma tarefa por rodada,
  em rodízio pela hora: :00 atributos + repartição pelo inventário; :10 e :50
  ocultos novos; :20 variações que faltam; :30 fotos; :40 categorias. Cada uma
  também pode ser pedida por `config.nuvemshopPedidoAdmin`
  (`normalizar_atributos`, `reparticao_inventario`, `catalogo_variantes`,
  `catalogo_categorias`, `catalogo`), seca por padrão. Nenhuma publica nada:
  visível continua sendo só o clique.

Prova: `src/loja-online-automacao-test.mjs` (18 provas, Worker real + loja
falsa), `src/nuvemshop-catalogo-test.mjs`, `src/loja-online-test.mjs`,
`frontend/src/features/nuvemshop/LojaOnline.test.tsx`,
`frontend/src/features/publicacao/lote.test.ts`.

### 65. Cadastro oculto recebe enriquecimento factual completo; conteúdo não publica nem inventa dado — §62, §61, §58 e regras 2, 4, 9

Origem: missão de Gustavo, **09/10/2026**, com divisão explícita de
responsabilidade: conteúdo/enriquecimento nesta frente; interface, pendências
visuais e correções operacionais históricas na outra frente. Amplia conteúdo
e classificação de §62 com aliases comerciais comprovados. Mantém publicação
humana, estoque e ledger de §61. Convive com a Loja online de §63 e a
automação operacional de §64 incorporadas da produção Cloud, ampliando
somente o conteúdo editorial.

- **Nasce oculto e enriquecido.** `catalogo/enriquecimento.js` produz descrição,
  SEO, marca, tags e categoria a partir de nome, categoria explícita, ficha
  específica e atributos reais. §62 aplica o helper antes do POST. Argola pode
  usar Brincos; Colar com Pingente continua Colar; Prata 925 exige evidência
  literal. Taxonomia sem correspondência segura permanece inconclusiva.
- **Sem dado inventado.** Helper não escreve preço, estoque, variante, foto,
  visibilidade, gênero, idade, peso ou dimensão. Foto exige identidade exata.
  Histórico de preço não vira automaticamente preço atual. Frequência de
  embalagem antiga não prova regra logística. Divisão comprovável de estoque
  é encaminhada à frente operacional, sem reescrever movimentos nesta missão.
- **SKU confirmado sai da copy.** Remove rótulo `Cód:`, `Código:` ou `SKU:`
  somente se o valor coincide exatamente com SKU remoto real, inclusive zeros
  iniciais. SKU/variante e códigos com outro significado são preservados.
  Código nunca fabrica título SEO distinto.
- **Preserva editorial aprovado.** Título/meta não vazios vencem a geração;
  texto humano não é substituído. Descrição v1 só é melhorada quando ainda
  coincide com o texto comprovadamente enviado. Título respeita 70 bytes
  UTF-8; resumo factual e redações comerciais diferentes não inventam diferença
  física. Consulta inconclusiva de colisões SEO falha fechada.
- **Marca/cuidados com fonte.** Marquesa comprovada em 595 anúncios: corrige
  ausência, grafia equivalente e o erro histórico `Mrquesa`, preservando outra
  marca legítima. `CUIDADOS_HTML` reproduz três itens do bloco aprovado em
  472 anúncios, referência 238432990. Instruções específicas, embalagens e
  observações permanecem ao padronizar Como preservar suas semijoias.
- **Tags idempotentes.** Novos recebem tipo/fatos; antigos só correções
  lexicais seguras e deduplicação. Ordem/caixa/acentos normalizados pela API
  não causam PUT repetido; multiset mantém multiplicidade e detecta perda/tag
  duplicada. Ouro sem evidência de banho não vira acabamento.
- **Google na categoria real.** `google_shopping_category` da categoria:
  Pingentes → 192; Conjuntos → 6463, categorias novas ocultas. Não inventa
  campo Google no produto, gênero/faixa etária ou material para sanar aviso
  Merchant. PUT preserva hierarquia/tradução/SEO e confirma readback.
- **Writer e concorrência.** `enriquecimento-fluxo.js › aplicarEnriquecimento`
  permite somente marca, tags, descrição, título/meta e categorias. Lê,
  guarda estado/hash, persiste journal, relê antes do PUT e valida depois.
  Nome, URL, visibilidade, idiomas, imagens, variantes, preço e saldo ficam
  íntegros. API pode limpar tradução omitida: campos traduzíveis preservados
  passam completos. Categoria extra só quando ancestral comprovado da escolhida.
  Divergência impede sucesso.
- **Automático limitado.** `enriquecerOcultos` considera só origem criado,
  cadastro ativo, estado/visibilidade hidden. Cron ocioso integra até duas
  peças de enriquecimento ao rodízio operacional de §64. Cursor e
  `fonte_hash` de `produtos.desc`, categoria, nomes/atributos/opções reais das
  variantes locais e versão da regra evitam reescrita validada; ignoram IDs,
  ordem das linhas, preço e saldo. Fonte local diferente permite reavaliar.
  Alteração exclusivamente remota precisa de reavaliação explícita/gatilho
  comprovado. Saneamento dos
  antigos desta rodada não amplia o escopo do cron.
- **Travas/journal.** Exige `NUVEMSHOP_WRITES_ENABLED` e
  `config.nuvemshopCatalogoAtivo`. Tabela aditiva `nuvemshop_enriquecimento`:
  preparado/validado/erro, antes/patch/depois, hashes, fonte, regra, SKU/produto
  e erro sem segredos. Falha de journal impede PUT; escrita não validada
  desliga catálogo. Estoque §61 permanece independente. Rollback de Worker
  mantém tabela e não desfaz conteúdo remoto nem apaga auditoria.
- **Publicação humana.** Texto, SEO, categoria ou foto não tornam visível.
  Só clique e validação integral de §62 autorizam hidden → visible. Esta
  regra editorial não altera frontend.

Implementação: `catalogo/enriquecimento.js`, `catalogo/enriquecimento-fluxo.js`,
criação §62, cron existente e `api/migracao-catalogo-enriquecimento.sql`.
Provas: `scripts/test-catalog-enrichment.mjs`,
`src/catalogo-enriquecimento-fluxo-test.mjs`, catálogo/fila/bloqueios de escrita
e writer SEO anterior. Apuração e versão final publicada ainda pendentes.
Release: `docs/releases/RC-CATALOGO-ENRIQUECIMENTO-2026-10-09.md`.
