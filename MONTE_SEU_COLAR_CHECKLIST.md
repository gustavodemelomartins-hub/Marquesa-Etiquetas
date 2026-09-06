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

## 2. Escolha da base

- [ ] A base sugerida do modelo (`base_sku_padrao`) vem pré-selecionada,
      mas pode ser trocada por outra peça do catálogo.
- [ ] Base com saldo zerado é sinalizada (não impede escolher, mas avisa).

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
- [ ] Vender por um valor diferente do sugerido é permitido, e a diferença
      é tratada como desconto (mesma regra §27 do restante do sistema).
- [ ] Sem preço nenhum, a tela recusa e pede o valor — não inventa um
      padrão.

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

## 14. Edição / cancelamento — ⚠️ GAP ENCONTRADO

- [ ] **NÃO existe edição** de uma venda com colar já registrada — só dá
      para cancelar e lançar de novo.
- [ ] **Cancelamento existe**, mas **valide com atenção**: o cancelamento
      de uma venda (`POST /api/vendas/{id}/cancelar`) hoje estorna pelo
      `sku` gravado em `venda_itens` (a **base**), e não percorre
      `venda_personalizacao_itens` (os componentes). Ou seja: **é possível
      que cancelar um colar personalizado devolva ao estoque só a base, e
      NÃO devolva os pingentes/componentes que saíram junto.**
  - [ ] Teste manualmente: monte um colar, confirme a venda, anote o saldo
        de cada componente, cancele a venda, confira se cada componente
        voltou ao estoque (esperado) ou só a base voltou (bug confirmado).
  - Não há teste automático cobrindo isso — se o comportamento for
    confirmado como incorreto, é uma correção separada, fora do escopo
    desta revisão.

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
já cobrem, com asserção: cadastro de modelo, disponibilidade agregada,
preço da composição, baixa de base + cada componente, recibo em uma linha,
configuração preservada, peça insuficiente recusada, mais posições que o
modelo recusado, venda retroativa sem baixa, flag gravada, mistura recusada,
razão fechando em todos os casos. Rodados nesta revisão em banco local
limpo: **todos passaram**.

## O que este checklist cobre e o automático não

Cancelamento estornando componente por componente (seção 14) e o
comportamento de "sem fila de espera" (seção 15) — são os dois pontos sem
prova automatizada, por isso pedem o olho humano de vocês dois.
