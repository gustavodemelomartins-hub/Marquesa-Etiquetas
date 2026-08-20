# Código-fonte do dashboard

O `dashboard.html` da raiz é **montado**, não editado à mão. Ele tem quase
400 KB porque carrega o CSS e a biblioteca de planilhas embutidos — o que faz
o app funcionar offline, mas o torna péssimo de editar.

**Edite `dashboard.tpl.html`** e rode o build:

```bash
python3 src/build.py
```

O script pega o CSS e o SheetJS de dentro do `index.html` (o app de etiquetas)
e injeta no template, nos lugares marcados por `/*__BASE_CSS__*/` e
`<!--__SHEETJS__-->`. É por isso que os dois apps têm exatamente a mesma cara:
existe uma folha de estilo só, e ela mora no `index.html`.

As fronteiras dos blocos são achadas por conteúdo, não por número de linha, e
o script confere o tamanho do que extraiu — então mexer no `index.html` não
quebra a montagem em silêncio.

## O leitor de código de barras da câmera

`vendor/zxing.min.js` é o build UMD oficial do
[ZXing for JS](https://github.com/zxing-js/library), sem alteração. Ele lê a
etiqueta pela câmera nos aparelhos cujo navegador não sabe fazer isso sozinho
— **o Safari do iPhone**, principalmente, que não tem `BarcodeDetector`.

Ele mora num arquivo separado, e não embutido como o SheetJS, por causa do
service worker: o `dashboard.html` é rebaixado da rede a cada abertura, e os
demais arquivos vêm do cache. Embutir os 356 KB ali dentro cobraria esse
download toda vez que ela abrisse o app no celular.

O app só o carrega quando ela toca em "usar a câmera". Onde o navegador tem
leitor próprio (Chrome do Android), o arquivo nem chega a ser baixado.

Para atualizar a versão, troque o arquivo mantendo o cabeçalho de origem e
licença, e suba o número do `CACHE` no `sw.js`.

## Testar

```bash
src/reset-e-testar.sh
```

Para subir só a API local, sem rodar teste nenhum:

```bash
api/dev-local.sh                 # zera o banco de teste e sobe (config padrão)
api/dev-local.sh --manter        # sobe sem zerar
api/dev-local.sh --env staging   # usa o ambiente [env.staging] do wrangler.toml —
                                  # Worker, D1 e R2 com nome de DEV, ainda
                                  # 100% local (o --local nunca olha para os
                                  # IDs de verdade da Cloudflare)
```

Ele derruba o que estiver de pé antes. Matar só o runtime não resolve: o
wrangler que ficou vivo sobe outro na hora, e o novo encontra a porta
ocupada pelo antigo.

A maioria dos testes roda igual nos dois modos — a diferença só importa
para quem está mexendo especificamente no isolamento do ambiente `dev` ou
no bucket R2 do catálogo.

Todos os testes abaixo **precisam do banco limpo** — rode `api/dev-local.sh`
antes de cada um. Rodar dois seguidos sem zerar faz o segundo falhar em
contagens que dependem do estado inicial, e a falha não se parece nada com o
que é.

Zera o banco local, sobe o Worker em `localhost:8787`, serve o dashboard em
`localhost:8000` e roda o `e2e.mjs` — que abre um navegador de verdade e
percorre o caminho inteiro: conectar, importar catálogo, montar maleta
bipando, fazer o acerto, conferir que a razão fecha (§19).

Nada disso toca a nuvem: o `--local` do wrangler usa um SQLite dentro de
`api/.wrangler`, e a chave de teste sai do `api/.dev.vars`.

Precisa de `playwright` e `xlsx` instalados (`npm install` dentro de `src/`)
e do navegador baixado (`npx playwright install chromium`). O binário sai do
próprio Playwright; para apontar para outro, defina `PW_CHROMIUM`. Precisa
também de `ORIGENS_PERMITIDAS=http://localhost:8000` no `api/.dev.vars` —
sem essa linha o navegador é barrado pelo CORS e o painel diz *"não
encontrei a API neste endereço"*, que parece erro de digitação no endereço
e não é. O `.dev.vars.example` já traz a linha pronta.

> **O script só roda em Linux e macOS** — ele usa `setsid` e um `pkill` que
> não alcançam o Wrangler no Windows. Lá o ciclo é feito à mão, e está
> escrito passo a passo em [docs/TESTING.md](../docs/TESTING.md).

### Catálogo: importar em lote sem travar

```bash
node src/catalogo-test.mjs
```

Prova o que a importação passou a garantir: planilha com produto novo não
derruba as outras linhas, a análise não escreve nada, o que se aplica é o
alvo (recalculado na hora, não o delta da análise), o cadastro de peças
novas nunca altera cadastro existente, foto da loja só casa com SKU exato, e
fundo branco sem serviço configurado fica pendente em vez de fingir pronto.

Roda contra a `loja-falsa.mjs`, então também precisa do `NUVEMSHOP_BASE`
apontando para `localhost:8799`.

### Foto: upload de verdade, R2 e o link assinado

```bash
node src/foto-modal-test.mjs
```

Abre o modal de foto num navegador de verdade e sobe um arquivo pelo
`<input type=file>` — não existe mais campo de "endereço da foto" para
digitar. Prova que o upload chega como bytes ao servidor, que o `<img>`
exibe através do link assinado (sem mandar o `Authorization: Bearer`, que
uma tag `<img>` não consegue mandar), e que remover apaga de verdade.

```bash
node src/fundo-branco-test.mjs
```

Não precisa do Worker no ar — chama `gerarFundoBranco` direto, com um D1 e
um R2 simulados em memória só deste arquivo. Prova as duas metades do
fluxo: sucesso (o serviço devolve a imagem tratada, e é ela que fica salva,
não a original de novo) e erro (o serviço falha, o estado vira `erro`, e
nada é inventado). `FOTO_FUNDO_URL` nunca é definido em `.dev.vars` — o
serviço de mentira deste teste sobe e desce só dentro dele, então os outros
testes continuam vendo o fluxo como "não configurado", que é o estado real
do projeto até hoje.

### Sincronização com a Nuvemshop

```bash
node src/sync-test.mjs
```

Roda contra `loja-falsa.mjs`, uma Nuvemshop de mentira que sobe no próprio
computador — nenhuma chamada sai para a loja de verdade e nenhum token é
preciso. Ela imita o que importa do comportamento real, inclusive exigir o
`User-Agent` que a API verdadeira exige (sem ele a resposta é 400, e o erro
não se parece nada com o que é).

Precisa do Worker local no ar com estes valores no `.dev.vars`:

```
NUVEMSHOP_STORE_ID=999999
NUVEMSHOP_TOKEN=token-de-mentira
NUVEMSHOP_BASE=http://localhost:8799
NUVEMSHOP_CLIENT_ID=app-de-mentira
NUVEMSHOP_CLIENT_SECRET=segredo-de-mentira
NUVEMSHOP_AUTH_BASE=http://localhost:8799
ORIGENS_PERMITIDAS=http://localhost:8000
```

`NUVEMSHOP_BASE` e `NUVEMSHOP_AUTH_BASE` existem só para isso; fora do teste
ninguém define e vale o endereço real.

As três últimas são fáceis de esquecer e falham de um jeito que não parece o
que é:

- sem `NUVEMSHOP_CLIENT_ID` e `NUVEMSHOP_CLIENT_SECRET`, a seção 10 do
  `sync-test` (a troca do código pelo token) falha 3 asserções;
- sem `ORIGENS_PERMITIDAS=http://localhost:8000`, o Worker responde com o
  endereço de produção no `Access-Control-Allow-Origin`, o navegador bloqueia
  a chamada, e o `e2e` para na tela de conexão dizendo *"Não encontrei a API
  neste endereço"* — que parece erro de rede e é CORS. O `.dev.vars`
  sobrescreve o `[vars]` do `wrangler.toml` durante o `wrangler dev`.

O banco precisa estar limpo (`reset-e-testar.sh` deixa dados do outro teste,
que mudam as contagens).

### Kits (peça vendida inteira ou desmontada)

```bash
node src/kits-test.mjs
```

Reproduz o caso real: um colar montado de corrente + dois pingentes,
publicado também como "só um pingente", os dois anúncios disputando o mesmo
estoque. Prova que vender um derruba o outro na mesma hora, que cancelar
devolve aos componentes, e que um carrinho com os dois kits ao mesmo tempo é
recusado quando só existe peça física para um. Também precisa do banco
limpo, com o Worker local no ar.

Para conferir o visual, com o servidor de teste já rodando:

```bash
node src/shot.mjs /onde/salvar
```

Tira fotos da Visão geral, das Vendas, e das telas de inventário e venda em
tamanho de celular.
