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
