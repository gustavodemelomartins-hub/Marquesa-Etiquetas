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
| §8 §9 | Venda de balcão e de acerto na mesma tabela | `vendas.origem = 'balcao' \| 'acerto'` |

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

## Regra que precisa de confirmação no contrato

§11 e §12 definem a faixa pelo total de **banhadas**, com a Prata 925 a 10%
fixos e fora dessa conta. É o que está implementado.

Nas quatro maletas atuais isso não muda nada — todas caem em 35% de qualquer
forma. Mas perto das fronteiras muda: com R$ 5.900 em banhadas e R$ 500 em
prata, a diferença entre calcular a faixa pelo total geral ou só pelas
banhadas é de **R$ 295** na comissão.

Vale conferir contra o contrato assinado antes de usar o valor do acerto
para cobrar.
