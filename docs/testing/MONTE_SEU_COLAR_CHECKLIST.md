# Monte seu Colar — checklist de validação manual (DEV)

Para Gustavo e Sthefany testarem no painel publicado em DEV, comparando
com os vídeos de referência. Cada item diz **o que o código faz hoje** —
nada aqui foi inventado; onde a implementação não cobre algo, está dito
explicitamente como "NÃO IMPLEMENTADO" ou "GAP".

Onde testar: aba **Vendas → + Colar personalizado**
(`src/dashboard.tpl.html`, função `novaVendaPersonalizada()`).

---

## 1. Escolha do modelo

- [ ] A lista de modelos carrega (`GET /api/personalizacao/modelos`).
- [ ] Cada modelo mostra nome (ex.: "Colar personalizado — 3 filhos").
- [ ] Trocar de modelo troca as opções de componente disponíveis.
- [ ] Modelo inativo (`ativo=0`) não aparece na lista.

## 2. A base não é escolha

Atualizado em 10/09/2026: a troca de base foi **revogada**.

- [ ] A base da configuração (`baseSkuPadrao`) aparece travada, só como
      informação — não é um campo escolhível.
- [ ] Um pedido que mande outra base é recusado (409), dizendo qual é a base
      da configuração.
- [ ] Base com saldo zerado zera a disponibilidade da configuração inteira:
      sem corrente não há montagem, por mais pingente que exista.

## 3. Quantidade de posições

- [ ] O modelo define `slots_min`/`slots_max` (ex.: modelo "3 filhos" pede
      exatamente 3 posições).
- [ ] Escolher **menos** posições que `slots_min` é recusado (HTTP 409) na
      hora de confirmar.
- [ ] Escolher **mais** posições que `slots_max` também é recusado (409) —
      já coberto por teste automático (`pos-golive-1-test.mjs`, cenário N).

## 4. Menino / menina

- [ ] As opções de componente têm um `grupo` (ex.: "Menino", "Menina") que
      a tela usa para agrupar visualmente.
- [ ] É possível montar um colar só com meninos, só com meninas, ou misto —
      não há trava de "tem que ter dos dois".

## 5. Cores

- [ ] Cada opção tem um `rótulo` (ex.: "Menino Verde", "Menina Rosa") que é
      exatamente o texto mostrado na tela e gravado no histórico.
- [ ] Repetir a mesma cor duas vezes na mesma composição é aceito (ex.:
      dois "Menino Verde") — já coberto por teste automático.

## 6. Disponibilidade

- [ ] Componente sem estoque suficiente aparece desabilitado no dropdown
      (`disponivel<=0` → `disabled`).
- [ ] Tentar confirmar mesmo assim é recusado (409) com a mensagem exata
      dizendo quantas peças existem e quantas a composição pede — nunca um
      erro genérico.
- [ ] Componente fora do catálogo aparece como "peça fora do catálogo",
      não como opção selecionável.

## 7. Preço

- [ ] O preço é **da composição inteira**, não a soma da base + componentes
      (ex.: modelo de R$ 149 cobra R$ 149, mesmo que a soma das peças avulsas
      desse outro valor).
- [ ] Se o modelo tem `preco_sugerido`, ele vem pré-preenchido.
- [ ] Atualizado em 10/09/2026: um valor **diferente** do da configuração é
      recusado (409) dizendo quanto ela custa. O preço é decisão comercial da
      configuração, e não desconto de venda.
- [ ] Configuração sem preço cadastrado não vende (409) — a tela não inventa
      um padrão nem pergunta o valor.

## 8. Carrinho

- [ ] A composição entra no carrinho como **uma linha só** (não uma linha
      por componente).
- [ ] A linha mostra o nome do modelo e os rótulos escolhidos (ex.: "Colar
      personalizado — 3 filhos — Menino Verde, Menina Rosa, Menino Azul").
- [ ] O checkbox "estoque já refletido" aparece — ver seção 13.
- [ ] Dá para remover a composição do carrinho antes de confirmar a venda.

## 9. Venda

- [ ] Confirmar a venda soma o preço da composição ao total normalmente.
- [ ] O recibo mostra uma linha (não quatro peças soltas).

## 10. Histórico

- [ ] A ficha da cliente mostra a composição com o nome do modelo e os
      rótulos escolhidos, mesmo que o modelo seja editado ou desativado
      depois (nomes ficam congelados no momento da venda).
- [ ] A lista de vendas do dia mostra a composição como uma linha.

## 11. Baixa da base

- [ ] Confirmar a venda baixa **1 unidade da base** escolhida.

## 12. Baixa de cada componente

- [ ] Cada componente escolhido baixa a quantidade certa (1 unidade por
      posição; 2 se a mesma peça foi escolhida em duas posições).
- [ ] `GET /api/estoque/conferir` continua vazio depois da venda.

## 13. Proteção contra baixa dupla

- [ ] Registrar uma venda **retroativa** (`estoqueJaRefletido: true` — peça
      que já saiu antes, sendo só documentada agora) **não baixa estoque
      nenhum** — nem base, nem componentes.
- [ ] Misturar, na mesma venda, uma peça avulsa normal com uma composição
      marcada como "já refletida" é recusado (409) — não dá para esconder
      uma baixa dentro da outra.
- [ ] A composição retroativa fica marcada como tal no histórico, e
      **nada é empurrado para a Nuvemshop** para ela (`nao_aplicavel`).

## 14. Edição / cancelamento — GAP FECHADO

O gap registrado aqui em 06/09/2026 — o estorno devolvia a base e podia não
devolver os componentes — **está corrigido e coberto por teste automático**
(`src/montagem-estorno-test.mjs`). Um segundo defeito, descoberto em
10/09/2026, também foi corrigido: a base voltava **sem a variação** com que
saiu, o que fechava o total e fazia a razão por variação mentir.

- [ ] **NÃO existe edição** de uma venda com colar já registrada — só dá
      para cancelar e lançar de novo.
- [ ] Cancelar devolve **a base e cada componente**, pelo SKU exato que saiu.
- [ ] A variação e a variante de cada peça voltam iguais às da venda —
      inclusive as da base.
- [ ] Cancelar **duas vezes** é recusado (409) e não devolve estoque de novo.
- [ ] `GET /api/estoque/conferir` continua vazio depois do estorno.

## 15. Componente fica sem estoque durante a montagem

- [ ] Ao esgotar um componente no meio do atendimento, a opção correspondente
      passa a aparecer desabilitada no dropdown na próxima vez que a tela
      recarregar a disponibilidade.
- [ ] Se mesmo assim a venda for tentada com mais do que existe, a resposta
      é recusada com os dois números (disponível vs. pedido) — nunca uma
      venda "no vermelho" em silêncio.
- [ ] **NÃO existe** fila de espera / aviso de "avisar quando voltar" — se
      isso for esperado pelo negócio, é funcionalidade nova, não bug.

---

## O que já está provado por teste automático (não precisa reconferir)

`src/pos-golive-1-test.mjs` (cenários N/O) e `src/pos-golive-1-ui-test.mjs`
cobrem o caminho pelo Worker: cadastro, disponibilidade agregada, preço da
composição, baixa de base + cada componente, recibo em uma linha,
configuração preservada, peça insuficiente recusada, venda retroativa sem
baixa, flag gravada, mistura recusada, razão fechando.

Desde 10/09/2026, quatro provas **sem Worker**, que rodam no gate rápido:

| Arquivo | O que prova |
|---|---|
| `src/montagem-saldo-test.mjs` | configuração com `qtd 0`, disponível derivado, Veneziana como teto, cor repetida valendo |
| `src/montagem-venda-test.mjs` | slots exatos, cardápio do grupo, base fixa, preço da configuração, carrinho disputando a mesma peça |
| `src/montagem-estorno-test.mjs` | estorno exato, com variação, inclusive a da base |
| `scripts/montagem-dupla-contagem.test.mjs` | as quatro travas contra dupla contagem continuam no código |

## O que este checklist cobre e o automático não

O comportamento de "sem fila de espera" (seção 15) e a **tela**: rótulos,
agrupamento visual, campo de base travado, dropdown desabilitado. São os
pontos que pedem o olho humano de vocês dois.
