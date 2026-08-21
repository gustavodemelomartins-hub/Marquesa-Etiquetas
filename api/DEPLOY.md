# Publicar a API na Cloudflare

Tudo o que a API precisa cabe no **plano gratuito**: 100.000 requisições por
dia e um banco D1 de 5 GB. Uma operação com 780 códigos e algumas maletas usa
uma fração disso.

Há dois caminhos. O **pelo navegador** não exige instalar nada. O **pelo
terminal** é mais rápido se você já tem Node instalado.

> ⚠️ Antes de tudo: os passos 1 e 2 **precisam ser feitos na ordem**, porque
> o Worker não sobe enquanto o `database_id` no `wrangler.toml` for o
> placeholder de zeros que está lá hoje.

---

## Caminho A — só pelo navegador

### 1. Criar o banco

No painel da Cloudflare: **Storage & Databases → D1 → Create database**.

- Nome: `marquesa-db`

Ao abrir o banco criado, copie o **Database ID** (um código longo com hífens).

### 2. Colocar o ID no `wrangler.toml`

No GitHub, abra `api/wrangler.toml`, clique no lápis e troque a linha:

```toml
database_id = "00000000-0000-0000-0000-000000000000"
```

pelo ID que você copiou. Commit direto na branch `main`.

### 3. Criar as tabelas

Volte ao banco no painel → aba **Console**. Abra o arquivo `api/schema.sql`
no GitHub, copie o conteúdo inteiro, cole no console e execute.

Para conferir, rode no mesmo console:

```sql
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
```

Devem aparecer: `categorias`, `clientes`, `config`, `loja_snapshot`,
`maleta_itens`, `maletas`, `movimentos`, `produtos`, `revendedoras`,
`venda_itens`, `vendas`.

### 4. Criar o Worker ligado ao GitHub

**Workers & Pages → Create → Workers → Import a repository**.

- Repositório: `Marquesa-Etiquetas`
- **Nome do Worker: `marquesa-api`** — precisa ser igual ao `name` do
  `wrangler.toml`, senão o build falha
- **Root directory: `api`** ⚠️ **é o campo que mais se esquece de preencher**
- **Build command:** deixe vazio (não há build)
- **Deploy command:** `npx wrangler deploy`
- Branch de produção: `main`

> Só a branch `main` publica de verdade. Outras branches geram apenas uma
> versão de pré-visualização.

> ⚠️ **Se o Root directory ficar vazio**, a Cloudflare escaneia a raiz do
> repositório, encontra `index.html` e `dashboard.html` lá, e conclui que é
> um site estático — cria um Worker que só serve arquivos, sem rodar o
> código de `api/src/index.js`. O sintoma aparece depois, no passo 5: a aba
> *Variables and Secrets* recusa qualquer variável com a mensagem
> `Variables cannot be added to a Worker that only has static assets`.
>
> Para corrigir sem recriar o projeto: **Settings → Build**, ajuste o
> **Root directory** para `api`, salve, e use **Retry deployment** na aba
> *Deployments* — o retry aplica a configuração salva na hora, não a de
> quando o build original rodou.

### 5. Definir a chave de acesso

No Worker criado → **Settings → Variables and Secrets**, adicione **apenas**:

| Nome | Tipo | Valor |
|---|---|---|
| `API_KEY` | **Secret** | uma senha longa, só sua |

Para gerar a `API_KEY`, use um gerenciador de senhas ou qualquer senha
aleatória de 30+ caracteres. **Não reaproveite uma senha que você já usa** —
quem tiver essa chave lê e escreve todo o seu estoque.

> ⚠️ **Não crie variáveis de texto (Text) pelo painel.** O `wrangler deploy`
> trata o `wrangler.toml` como fonte da verdade e **apaga** as variáveis de
> texto criadas pelo painel que não estejam declaradas no arquivo — no
> próximo build elas somem sem aviso. Só os **Secrets** sobrevivem.
>
> Por isso `ORIGENS_PERMITIDAS` fica no `wrangler.toml`, versionada: ela não
> é segredo, é o endereço público do painel. Para mudar, edite o arquivo.
>
> Referência: [workers-sdk#4453](https://github.com/cloudflare/workers-sdk/issues/4453)

### 6. Conferir

Abra no navegador:

```
https://marquesa-api.SEU-SUBDOMINIO.workers.dev/api/health
```

Deve responder `{"ok":true,"hoje":"..."}`. Essa rota é pública de propósito —
serve só para saber se está no ar, não devolve dado nenhum.

Qualquer outra rota sem a chave deve devolver `401`.

---

## Caminho B — pelo terminal

Com Node instalado e o repositório clonado:

```bash
cd api
npm install
npx wrangler login                       # abre o navegador para autorizar

npx wrangler d1 create marquesa-db       # copie o database_id devolvido
# cole o id em wrangler.toml

npx wrangler d1 execute marquesa-db --remote --file=schema.sql
npx wrangler secret put API_KEY          # cola a senha quando pedir
npx wrangler deploy
```

`ORIGENS_PERMITIDAS` já está declarada no `wrangler.toml` — basta editar o
arquivo se o endereço do painel mudar.

---

## Ambiente de DEV (Worker + D1 + R2 + Pages, tudo separado da produção)

Este ambiente existe para testar o trabalho do catálogo/fotos/R2 antes de
ele chegar em produção, sem risco nenhum de tocar no que já está no ar. O
`wrangler.toml` já declara um `[env.dev]` inteiro à parte — outro nome de
Worker, outro banco, outro bucket. Nenhum comando abaixo é capaz de alcançar
o recurso de produção, mesmo digitado errado, porque o NOME do recurso já é
outro.

Precisa de acesso à conta Cloudflare (`npx wrangler login`, ou um
`CLOUDFLARE_API_TOKEN` com permissão de D1, R2, Workers e Pages) — nenhum
destes passos funciona sem isso.

### 1. Criar o banco e o bucket do DEV

```bash
cd api
npx wrangler d1 create marquesa-db-dev
```

Copie o `database_id` que o comando devolver e cole em `wrangler.toml`, na
linha `database_id = "COLE_AQUI_O_ID_DE_marquesa-db-dev"` dentro do bloco
`[[env.dev.d1_databases]]`.

```bash
npx wrangler d1 execute marquesa-db-dev --env dev --remote --file=schema.sql
npx wrangler r2 bucket create marquesa-fotos-dev
```

### 2. Publicar o Worker do DEV

```bash
npx wrangler secret put API_KEY --env dev      # uma chave só do DEV, diferente da de produção
npx wrangler deploy --env dev
```

Isso publica um Worker com nome **`marquesa-api-dev`** — separado do
`marquesa-api` de produção — em
`https://marquesa-api-dev.SEU-SUBDOMINIO.workers.dev`.

Se a loja de teste precisar de sincronização de verdade (não obrigatório):
`npx wrangler secret put NUVEMSHOP_TOKEN --env dev` e
`NUVEMSHOP_STORE_ID --env dev`. Sem eles, a aba Nuvemshop só informa que a
loja não está conectada — nada quebra.

### 3. Publicar o painel em marquesa-dev.pages.dev

O painel (`index.html` e `dashboard.html`, mais as pastas `brand/`,
`icons/`, `vendor/`, `manifest.json`, `sw.js`) é estático — o mesmo tipo de
site que já roda hoje no GitHub Pages, só que aqui vai para o **Cloudflare
Pages**, que é quem dá o endereço `.pages.dev`.

No painel da Cloudflare: **Workers & Pages → Create → Pages → Upload
assets** (ou **Connect to Git**, apontando para este repositório e branch).
Nomeie o projeto **`marquesa-dev`** — o nome do projeto Pages é o que vira o
subdomínio: `marquesa-dev.pages.dev`.

> ⚠️ Se conectar por Git, configure **Build output directory: `/`** (raiz do
> repositório) e nenhum comando de build — são arquivos estáticos, não há o
> que compilar.

Depois de publicado, abra `https://marquesa-dev.pages.dev/dashboard.html` e
conecte com:

- **Endereço da API:** `https://marquesa-api-dev.SEU-SUBDOMINIO.workers.dev`
- **Chave de acesso:** a `API_KEY` do passo 2

`ORIGENS_PERMITIDAS` do `[env.dev.vars]` já está preparado para
`https://marquesa-dev.pages.dev` — se o projeto Pages ganhar um nome
diferente, ajuste essa linha antes do deploy.

### Testar sem nada disso

Todo este ambiente pode ser testado **inteiramente no seu computador**, sem
conta Cloudflare nenhuma: `npx wrangler dev --env dev --local` simula o
Worker, o D1 e o R2 do DEV em arquivos locais — é o que `api/dev-local.sh
--env dev` faz. Só o deploy de verdade (os três comandos acima) exige
acesso à conta.

## Fotos com fundo branco (opcional)

O botão *Gerar fundo branco* manda a foto original para um serviço de fora e
guarda a versão tratada. O endereço desse serviço é um Secret:

```bash
npx wrangler secret put FOTO_FUNDO_URL      # para onde mandar a foto
npx wrangler secret put FOTO_FUNDO_TOKEN    # só se o serviço pedir chave
```

A foto original mora no R2, atrás da chave da API — o serviço não consegue
simplesmente baixar uma URL nossa. Por isso os bytes viajam em base64 nos
dois sentidos: ele recebe

```json
{"sku":"...", "descricao":"...", "fundo":"branco",
 "imagemBase64":"<bytes em base64>", "tipoImagem":"image/jpeg"}
```

e deve responder

```json
{"imagemBase64":"<bytes em base64>", "tipo":"image/jpeg"}
```

(`tipo` é opcional — se faltar, usa o mesmo tipo da imagem enviada.)

**Enquanto `FOTO_FUNDO_URL` não existir**, o sistema continua funcionando: a
peça é marcada como `fundo_pendente` e a tela diz o que falta. Nenhuma
imagem é inventada — uma foto que o sistema diz ter e não tem é pior que uma
faltando, porque a publicação em lote confiaria nela. `src/fundo-branco-
test.mjs` prova o caminho inteiro (sucesso e erro) contra um serviço de
mentira, sem nunca configurar isto de verdade em lugar nenhum.

## Atualizar um banco que já está no ar

Quando uma versão nova cria tabelas, o banco existente precisa recebê-las —
os dados que já estão lá **não** são tocados.

Para o inventário (tabelas `inventarios` e `inventario_itens`), abra o banco
no painel → aba **Console**, cole o conteúdo de `api/migracao-inventario.sql`
e execute. Ou, pelo terminal:

```bash
npx wrangler d1 execute marquesa-db --remote --file=migracao-inventario.sql
```

É seguro rodar duas vezes: todo comando é `CREATE TABLE IF NOT EXISTS`.

Sem esse passo, o dashboard carrega normalmente, mas o botão de inventário
responde com erro de tabela inexistente.

Para conferir depois:

```sql
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'inventario%';
```

### Catálogo: fotos (no R2) e as filas de pendências

`api/migracao-catalogo.sql` cria em `produtos` as colunas de **referência**
à foto — a chave do objeto no R2, o tipo, o tamanho, o estado — e as
tabelas `produtos_pendentes` (peça nova esperando cadastro em lote) e
`fotos_orfas` (foto da loja cujo código não bate com nenhum daqui).

**Os bytes da foto NÃO ficam no D1.** Eles moram num bucket R2 (binding
`FOTOS` no `wrangler.toml`), que precisa existir antes do primeiro upload:

```bash
# produção — só quando este trabalho for aprovado para produção
npx wrangler r2 bucket create marquesa-fotos

# DEV — é este que interessa enquanto o trabalho está em revisão
npx wrangler r2 bucket create marquesa-fotos-dev --env dev
```

E a migração do banco, no ambiente certo:

```bash
# DEV — banco marquesa-db-dev, isolado do de produção
npx wrangler d1 execute marquesa-db-dev --env dev --remote --file=migracao-catalogo.sql

# produção — só depois de aprovado; NÃO rode isto enquanto o recurso
# ainda estiver em revisão no DEV
npx wrangler d1 execute marquesa-db --remote --file=migracao-catalogo.sql
```

⚠️ Como a de sincronização e a de variações, esta **não pode ser rodada duas
vezes** no mesmo banco: os `ALTER TABLE` falham se a coluna já existir, e
esse erro significa "já foi aplicada" — pode ignorar. As tabelas em si são
seguras.

### Foto da loja por referência

`api/migracao-foto-url.sql` acrescenta duas colunas a `produtos`:
`foto_url` e `foto_url_em`. Elas guardam **onde a imagem está na Nuvemshop**
— não os bytes, que continuam sendo assunto do R2.

Existem porque as duas coisas custam muito diferente. Copiar 800 imagens
para o bucket exige uma requisição de download por peça; casar código com
imagem e anotar o endereço custa uma leitura do catálogo inteiro. Com as
colunas, a tabela de estoque para de dizer "sem foto" para peça que tem
foto — na loja — no mesmo minuto, e a cópia para o R2 vira um passo
seguinte, sem pressa e sem reescrever nada: quando a chave do R2 existir,
é ela que vale.

`foto_status` **não é tocado** por esta migração. Ele responde "temos os
bytes?", e a resposta continua sendo a mesma.

```bash
# DEV — banco marquesa-db-dev, isolado do de produção
npx wrangler d1 execute marquesa-db-dev --env dev --remote --file=migracao-foto-url.sql

# produção — só depois de aprovado no DEV
npx wrangler d1 execute marquesa-db --remote --file=migracao-foto-url.sql
```

⚠️ Aditiva e não idempotente, como as outras: `duplicate column name:
foto_url` significa "já foi aplicada", pode ignorar. Enquanto ela não
roda, o painel inteiro funciona — só o botão **Vincular fotos da loja**
responde dizendo qual arquivo falta.

Depois de aplicada, a primeira carga é pela tela: **Estoque → Pendências →
Fotos → Vincular fotos da loja**. O botão mostra o ensaio antes de gravar,
com quantos códigos foram olhados, quantas fotos casaram, quantos códigos a
loja não ilustra, quantos ela não conhece e quantas imagens dela não têm
dono aqui.

Sem esse passo o painel abre normalmente e o estoque funciona igual: a aba
Pendências mostra as filas zeradas e o estado da foto sai como "sem foto"
para todo mundo. As rotas que dependem da migração (importar produtos
novos, trazer fotos da loja, publicação) respondem com um erro 503 que já
explica o que falta rodar — não um erro de banco cru.

Para conferir depois:

```sql
SELECT name FROM sqlite_master WHERE type='table'
   AND name IN ('produtos_pendentes','fotos_orfas');
```

## Ligar a sincronização com a Nuvemshop

Enquanto os dois segredos abaixo não existirem, o Worker funciona igual e a
sincronização apenas responde que a loja não está conectada. Nada quebra.

### 1. Migrar o banco

`api/migracao-sync.sql` no console do D1 (ou `--file=migracao-sync.sql` pelo
terminal). ⚠️ Diferente das outras, esta **não pode ser rodada duas vezes**:
o `ALTER TABLE` falha se a coluna já existir. Se isso acontecer, é sinal de
que já foi aplicada — pode ignorar o erro.

### 2. Gerar o token na Nuvemshop

Existem dois caminhos. Use o que aparecer disponível — o resto do sistema
não muda dependendo de qual foi usado.

**Caminho A — Aplicativo sob medida** (mais simples, planos **Escala** e
**Next**): painel da loja → **Aplicativos → Aplicativos sob medida** → criar.
Marque **leitura e escrita em produtos** e **leitura de pedidos**. O token
**aparece uma única vez** — copie na hora. O ID da loja é o número na URL do
painel, e também vem junto com o token como `user_id`. Pule direto para o
passo 3.

**Caminho B — Aplicativo de parceiro** (planos menores, ou se o A não
aparecer): [painel de parceiros](https://partners.tiendanube.com) → criar um
app. Ele não entrega o token direto — entrega um **App ID** e um **Client
Secret** (aba "Chaves de acesso"), e o token só sai depois que a loja
autoriza o app. Passo a passo:

1. Guarde `App ID` como `NUVEMSHOP_CLIENT_ID` e `Client Secret` como
   `NUVEMSHOP_CLIENT_SECRET` nos Secrets do Worker (passo 3, mais os dois de
   sempre) e publique (`npx wrangler deploy`) — o endereço de callback só
   existe depois de publicado.
2. Na aba **Configuração** do app, campo **URL de redirecionamento**, cole:
   `https://marquesa-api.SEU-SUBDOMINIO.workers.dev/api/nuvemshop/callback`
3. Marque as permissões (produtos leitura/escrita, pedidos leitura) e salve.
4. Logada na loja, abra:
   `https://www.tiendanube.com/apps/SEU-APP-ID/authorize`
   (o `App ID` do passo 1 — no exemplo do print, seria `38392`)
5. Aprove a instalação. O navegador cai numa página do próprio Worker
   mostrando o `NUVEMSHOP_TOKEN` e o `NUVEMSHOP_STORE_ID` prontos para
   copiar. O código de autorização vale só 5 minutos — se demorar, é só
   abrir o link de novo.

### 3. Guardar como Secrets

No Worker → **Settings → Variables and Secrets**, como **Secret** (nunca
como Text — variável de texto criada pelo painel é apagada no próximo
deploy):

| Nome | Valor |
|---|---|
| `NUVEMSHOP_TOKEN` | o token (caminho A: copiado direto; caminho B: veio da página do callback) |
| `NUVEMSHOP_STORE_ID` | o ID da loja (mesma origem) |
| `NUVEMSHOP_CLIENT_ID` | só no caminho B — o App ID |
| `NUVEMSHOP_CLIENT_SECRET` | só no caminho B — o Client Secret |

Ou pelo terminal:

```bash
npx wrangler secret put NUVEMSHOP_TOKEN
npx wrangler secret put NUVEMSHOP_STORE_ID
```

### 4. Conferir antes de deixar solto

Na aba **Nuvemshop** do painel, o aviso passa a dizer "Loja ligada direto".
Clique em **Sincronizar agora** e confira o que ele relata antes de esperar
o cron. O agendamento (`crons` no `wrangler.toml`) roda às 6h e 18h de
Brasília.

### O freio de segurança

Uma rodada que mudaria mais de 40 produtos, ou zeraria mais de 15, **para
sozinha sem tocar na loja** e fica registrada como pausada. Mudança em massa
quase sempre é dado nosso quebrado, não venda de verdade — e empurrar um
zero errado tira a peça do ar.

Os dois limites são ajustáveis por `PUT /api/config` (`syncLimiteMudancas` e
`syncLimiteZerar`). Para liberar uma rodada específica, o botão **Aplicar
mesmo assim** no painel.

## Ligar as variações (mesmo código vendido em mais de uma opção)

⚠️ **Esta migração precisa rodar ANTES do código novo subir.** Diferente das
outras, aqui a ordem importa: o `/api/state` passa a ler a tabela
`produto_variacoes`, e sem ela **o dashboard inteiro para de carregar**, não
só a parte nova.

`api/migracao-variacoes.sql` no console do D1 (ou `--file=migracao-variacoes.sql`
pelo terminal). A criação da tabela é segura de repetir; o `ALTER TABLE
movimentos ADD COLUMN variacao` no fim **não** é — se falhar dizendo que a
coluna já existe, é sinal de que já foi aplicada e pode ignorar.

Para conferir antes de liberar o deploy:

```sql
SELECT name FROM sqlite_master WHERE type='table' AND name='produto_variacoes';
SELECT variacao FROM movimentos LIMIT 1;
```

Depois disso, a sincronização preenche as variações sozinha na primeira
rodada, lendo o que a Nuvemshop declara. Ninguém digita aro nem cor.

## Ligar os kits (peça vendida inteira ou desmontada)

Migração `api/migracao-kits.sql` — uma tabela nova (`kit_componentes`), sem
`ALTER TABLE`, então é seguro rodar mesmo se não tiver certeza se já rodou.

Depois disso, em **Meu estoque**, cada produto tem um selo "+ kit" — clique
para escolher de quais outras peças ele é montado. Um produto só pode virar
kit com o saldo próprio zerado (o sistema explica e recusa se não estiver).

## Testar com dados de verdade

Com a URL e a chave em mãos:

```bash
API_URL=https://marquesa-api.SEU-SUBDOMINIO.workers.dev \
API_KEY=sua-chave \
node test-api.mjs
```

Roda os 30 testes contra o servidor publicado. **Atenção:** o teste cria
produtos e maletas de exemplo — rode antes de importar os dados reais, ou
num banco separado.

---

## Rodar local, sem tocar na nuvem

```bash
cd api
cp .dev.vars.example .dev.vars
npx wrangler d1 execute marquesa-db --local --file=schema.sql
npx wrangler dev --local
```

O `--local` usa um SQLite no seu computador. Nada vai para a Cloudflare, e
a chave do `.dev.vars` nunca sai da sua máquina (o arquivo está no
`.gitignore`).

---

## Custo

| | Limite grátis | Uso esperado |
|---|---|---|
| Requisições | 100.000/dia | algumas centenas |
| Leituras no banco | 5 milhões/dia | milhares |
| Escritas no banco | 100.000/dia | dezenas |
| Armazenamento | 5 GB | poucos MB |

Não é preciso cadastrar cartão para usar o plano gratuito de Workers e D1.
