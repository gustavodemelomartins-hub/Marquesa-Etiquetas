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
