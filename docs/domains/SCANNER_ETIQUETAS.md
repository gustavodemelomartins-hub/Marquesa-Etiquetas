# Leitura de etiqueta pela câmera

Como a Marquesa transforma uma etiqueta impressa num SKU, no painel
clássico que está em produção e na V2. Este documento existe porque a
mecânica **já existia** quando a V2 precisou dela, e reescrevê-la teria
jogado fora anos de ajuste medido na operação real.

---

## 1. A etiqueta

O módulo de Etiquetas imprime uma folha Pimaco 7×18. Cada etiqueta tem
quatro coisas: descrição, preço, **o código de barras** e o SKU em texto.

O código de barras é **CODE128 cujo conteúdo é o SKU cru** — sem prefixo,
sem sufixo, sem dígito de aplicação:

```js
// src/dashboard.tpl.html (e index.html, o app autônomo)
JsBarcode(svg, code, { format: 'CODE128', displayValue: false, margin: 0, height: 40, width: 2 });
```

onde `code` é `p.sku`. O mesmo texto é impresso embaixo, em `.l-sku`, para
quem precisar digitar.

Isso tem uma consequência que governa todo o resto: **decodificar já
entrega o SKU**. Não há payload para desembrulhar. O que sobra é resolver
qual peça do catálogo aquele código é — e é aí que mora a complexidade.

CODE128 tem dígito verificador próprio, então ler errado e cair numa peça
diferente por acaso é praticamente impossível. Ainda assim, cada leitura
mostra a descrição da peça na tela: é a confirmação que vale.

---

## 2. Onde está, no painel clássico

Tudo em `src/dashboard.tpl.html`:

| o quê | onde |
|---|---|
| `temCamera()` | ~11509 — só checa `navigator.mediaDevices.getUserMedia` |
| `carregarZXing()` | ~11515 — baixa `vendor/zxing.min.js` sob demanda |
| `montarLeitor()` | ~11528 — devolve `canvas → código \| null` |
| `toggleCamera()` | ~11623 — `getUserMedia`, `<video>`, inicia o laço |
| `pararCamera()` | ~11661 — `getTracks().forEach(stop)` |
| `lerDaCamera()` | ~11672 — o laço de 200 ms e o antirrepique |
| `handleScan(code)` | ~7590 — o consumidor: o que fazer com o código |
| `normSku` / `baseSku` / `findProd` | 2686, 2687, 2715 |
| HTML da câmera | ~1773 (`#camBtn`, `#camWrap`, `#camVideo`, `.cam-alvo`) |
| CSS | 265–274 |
| prova | `src/e2e.mjs` ~455 — decodifica uma etiqueta de verdade |

O leitor é **um só** e serve quatro modos, escolhidos em `openScan(modo)`:
`add` (montar maleta), `acerto` (conferir devolução), `inventario` e
`venda`. `handleScan` despacha por modo. Isso já era a separação entre
"ler" e "o que a leitura significa" — a V2 só a tornou explícita.

---

## 3. Como funciona, decisão por decisão

### Dois decodificadores, e o motivo é o iPhone

O Chrome do Android traz `BarcodeDetector` pronto: rápido e de graça. O
Safari do iPhone não tem — **e é o aparelho que a Sthefany usa**. Então o
app carrega o ZXing (`vendor/zxing.min.js`, 362 KB) sob demanda.

O ZXing fica num arquivo à parte, e não embutido como o SheetJS, por causa
do service worker: o `dashboard.html` é rebaixado da rede a cada abertura,
enquanto os outros arquivos vêm do cache. Embutido, ela pagaria 362 KB toda
vez que abrisse o app no celular.

### A resolução pedida importa mais do que parece

```js
video: { facingMode: {ideal:'environment'}, width:{ideal:1920}, height:{ideal:1080},
         focusMode: {ideal:'continuous'} }
```

Sem pedir, o navegador costuma entregar 640×480, e nessa resolução a
etiqueta de bijuteria ocupa poucos pixels — o código simplesmente não tem
barras suficientes para ser lido. `ideal` em vez de `exact` para nunca
falhar em aparelho que não alcance.

### Quatro tentativas por quadro

1. o quadro inteiro;
2. o quadro girado 90°;
3. o recorte da mira, ampliado 2× (só em quadros alternados);
4. o recorte girado.

O giro existe porque etiqueta de bijuteria quase sempre cai **deitada** no
quadro com o celular em pé, e o leitor lê código de barras na horizontal.

**A ordem não é a intuitiva, e isso está comentado no código:** o quadro
inteiro vem primeiro e a mira é o reforço. Recortar antes parece esperto e
quebra o caso mais comum — com a peça perto do celular a etiqueta preenche
o quadro, e o recorte corta as marcas de início e fim do código. Some o
código inteiro.

A mira recorta **76% da largura e 36% da altura**, no centro: exatamente a
região desenhada na tela. Mudar uma sem a outra faz o leitor procurar onde
a pessoa não está apontando.

### As `hints` vão em toda chamada

O `decode` do ZXing é assim por dentro:

```js
decode(imagem, hints){ this.hints !== hints && this.setHints(hints); ... }
```

Chamar `decode(imagem)` sem o segundo argumento passa `undefined` e
**redefine** as configurações para o padrão. Era o que acontecia antes da
correção: o leitor voltava a tentar QR, Aztec, PDF417 e Data Matrix a cada
quadro, e perdia o `TRY_HARDER` — que é o que lê a etiqueta girada.

### O antirrepique

```js
if (código && (código !== cam.ultimo || agora - cam.quando > 1800)) { ... }
```

A câmera enxerga o mesmo código dezenas de vezes por segundo: sem a janela,
uma peça parada na frente da lente vira dez peças contadas. Código
**diferente** passa na hora — bipar duas peças em sequência rápida é o caso
normal.

1800 ms é mais que o tempo de trocar a peça e menos que a paciência de quem
está contando.

### Cinco quadros por segundo

`setTimeout(lerDaCamera, 200)`. Mais que isso esquenta o telefone sem ler
mais rápido: o gargalo é a decodificação, não a captura.

### O desligamento

`cam.stream.getTracks().forEach(t => t.stop())`. É isso que apaga a luz da
câmera; soltar só a referência deixa a lente ligada até o navegador
recolher — e no telefone isso é visível.

### A entrada manual

`#scanInput` com um `keydown` de Enter chamando o **mesmo** `handleScan`.
Ela cobre três casos reais: o leitor USB (que "digita" o código e dá Enter
sozinho), a etiqueta rasgada, e o aparelho sem câmera. O foco volta sozinho
quando escapa, porque o leitor USB digita rápido demais para esperar.

### O som

880 Hz senoidal para aceito, 220 Hz quadrado para recusado. Quem conta cem
peças aprende o som e para de olhar a tela.

### Como o código vira peça — e o buraco que isso tem

`findProd` tenta três coisas, **independentes**:

```js
idx.has(c)                          // o código como veio
idx.has(baseSku(c))                 // sem o sufixo de variação: 230076-17 → 230076
idx.has(c.replace(/^0+/, ''))       // sem zeros à esquerda: 0230076 → 230076
```

> **Problema estrutural, registrado e não corrigido no clássico.**
> As três transformações nunca se combinam. Uma etiqueta antiga de peça com
> aro — `0230076-17`, que tem os dois defeitos ao mesmo tempo — não resolve
> por nenhum dos três caminhos, e **hoje, em produção, ela não é
> encontrada**.
>
> A V2 acrescentou um quarto candidato (`codigoBase(semZeros)`), que entra
> por último e por isso não pode mudar nenhuma resolução que já funciona —
> ele só alcança leituras que antes não achavam peça nenhuma. Ver
> `frontend/src/components/scanner/codigoDaEtiqueta.ts`.
>
> **O painel clássico continua com o buraco.** Corrigi-lo lá é mexer em
> módulo legado estável em produção, e não era o escopo da rodada que
> descobriu isto. Quando alguém for mexer, a correção é de uma linha e o
> teste já existe.

### Múltiplas unidades do mesmo SKU

No clássico, cada leitura faz `scan.itens[sku] = (scan.itens[sku]||0) + 1`.
Não há limite no inventário, e isso é deliberado — o comentário do código
diz por quê:

> Se o app recusasse a peça que "não deveria" existir, ele estaria mandando
> a contagem obedecer ao sistema — que é exatamente o contrário de
> conferir.

Nos outros modos há limite: em `add` e `venda`, o que há em casa; em
`acerto`, o que saiu naquela maleta.

### Código fora do catálogo

No inventário é **achado, não erro**: existe uma peça de verdade na mão
dela. Vai para `scan.fora` e aparece no relatório (§22). Nos outros modos é
recusa.

---

## 4. O que a V2 reaproveitou

| parte | o que aconteceu |
|---|---|
| decodificação (BarcodeDetector + ZXing, hints, mira, giro) | **portada 1:1**, com os comentários |
| `vendor/zxing.min.js` | **o mesmo arquivo**, servido em `/vendor/` |
| antirrepique de 1800 ms | portado |
| laço de 200 ms | portado |
| proporções da mira (76% × 36%) | portadas, código e CSS juntos |
| som de 880/220 Hz | portado |
| resolução do código | portada + o quarto candidato |
| entrada manual pelo mesmo caminho | portada |
| `getTracks().forEach(stop)` | portado |

## 5. O que precisou mudar, e por quê

**O consumidor.** O clássico acumulava a contagem em memória
(`scan.itens[sku]++`) e mandava o retrato inteiro no fim, por
`PUT /api/inventarios/:id/contagem`. A V2 grava **cada leitura na hora**,
por `POST /api/inventarios/:id/itens`, que é a mesma rota do `+` da lista.

Isso não foi preferência. São duas diferenças de contrato:

1. **`POST /itens` grava valor ABSOLUTO.** Quem bipa precisa ler o contado
   atual e mandar o próximo. Mandar sempre `1` transformaria dez peças
   iguais em uma.
2. **`POST /itens` conhece variação; `PUT /contagem` não.** A rota em lote
   grava `variacao: ''` para tudo.

> **Segundo problema estrutural, e este é um risco ativo.**
> `PUT /api/inventarios/:id/contagem` começa com
> `DELETE FROM inventario_contagem WHERE inventario_id = ?` e reescreve
> tudo com `variacao: ''`. Se o painel clássico salvar sobre um inventário
> que a V2 contou por variação, **a contagem por variação é apagada**.
>
> Enquanto os dois painéis existirem, **um inventário aberto pertence a um
> painel só**. A V2 não chama essa rota em lugar nenhum, e há uma prova que
> falha se alguém a introduzir
> (`frontend/src/features/inventario/bipagem.test.tsx`).

**Código fora do catálogo.** A V2 **não tem onde anotá-lo**:
`desconhecidos_json` só é escrito por `PUT /contagem`, e
`POST /nao-identificado` recusa SKU que não existe (409) — ele serve para
"não sei qual variação", não para "não sei que peça é esta". Então a V2
mostra a recusa do servidor, não bloqueia a contagem, e **não anota**. É
uma perda em relação ao clássico, e está aqui em vez de escondida. Fechar
isso é uma rota nova, e rota nova não era o escopo.

**O componente.** Virou React com uma fronteira explícita
(`aoLer(codigo) → {ok, texto}`) para Revendedoras consumir o mesmo leitor.
Ver `frontend/src/components/scanner/README.md`.

**Serialização.** Novidade da V2: enquanto o consumidor não responde,
nenhum quadro novo é lido. O clássico não precisava disso porque gravava em
memória; a V2 fala com o servidor a cada bipada, e sem isso uma peça viraria
uma fila de gravações concorrentes sobre a mesma linha.

---

## 6. Comportamento por aparelho

| | |
|---|---|
| **Android / Chrome** | `BarcodeDetector` nativo. O ZXing nem é baixado |
| **iPhone / Safari** | sem `BarcodeDetector` → ZXing. `playsinline` + `muted` no `<video>`, senão o Safari abre em tela cheia |
| **qualquer um** | exige HTTPS. `marquesa-dev.pages.dev` e o Pages de produção servem HTTPS |
| **sem câmera** | o botão não aparece (`temCamera()`), e a digitação continua |
| **permissão negada** | frase explícita mandando liberar nos ajustes, e a digitação continua |

A prova de que o caminho do iPhone funciona está em `src/e2e.mjs`: ele
**apaga** `window.BarcodeDetector`, força o ZXing e decodifica uma etiqueta
gerada pelo próprio app — reta, em pé, de cabeça para baixo e de longe.
