# Reset do DEV para o teste de importação da Sthefany

Deixar o DEV com **as revendedoras intactas** e **o estoque vazio**, para a
importação da planilha real ser feita por ela, pela tela, no fluxo de
verdade da aplicação.

Nada aqui toca produção. Nada aqui dropa tabela, apaga schema, remove
migration, mexe em Secret ou libera escrita na Nuvemshop.

---

## Antes de tudo: três coisas que o pedido supõe e o sistema não tem

Vale conferir antes de aprovar, porque mudam o que dá para prometer.

**1. Não existe ambiente DEV separado.** O `wrangler.toml` declara um único
banco D1 — `marquesa-db`, id `089153a9-…` — sem `[env.dev]` nem
`[env.staging]`. O que se chama de "DEV" é este banco. Se a intenção é que
exista um staging apartado de produção, isso ainda precisa ser criado; se
"DEV" e "produção" são o mesmo banco hoje, **este reset apaga o estoque de
produção**, e é o motivo mais forte para não rodar a Fase B antes de
responder a esta pergunta.

**2. `NUVEMSHOP_WRITES_ENABLED` não existe.** Não está no código, nem no
`wrangler.toml`, nem no histórico do git (`git log -S` não acha uma linha).
O que existe é o **freio de segurança**: uma rodada que mudaria mais de
`syncLimiteMudancas` (40) produtos, ou zeraria mais de `syncLimiteZerar`
(15), para sozinha sem tocar na loja. Os dois vivem na tabela `config` e o
plano os **preserva**. Ver "Nuvemshop" mais abaixo — o comportamento
prático é seguro, mas por um caminho diferente do que o pedido supõe.

**3. Não há fotos no banco, nem bucket R2.** Nenhuma tabela de foto no
schema, nenhum `r2_bucket` no `wrangler.toml`, nenhum endpoint de imagem no
Worker. As imagens moram na Nuvemshop e são referenciadas por `url_loja`
em `produtos` — só um endereço, dentro da linha do produto. Apagar o
produto leva o endereço junto; **nenhum arquivo de imagem é apagado em
lugar nenhum**, porque nenhum arquivo de imagem é nosso. Não há R2 para
proteger nem referência órfã para sobrar.

---

## Fase A — o mapa das tabelas

16 tabelas, lidas do schema real (`api/schema.sql` + as quatro
`migracao-*.sql`), não de suposição sobre nomes.

### PRESERVAR

| Tabela | Por quê | Dependências |
|---|---|---|
| **`revendedoras`** | **A regra crítica.** Nome, tel, cidade, CPF, endereço, obs, status e `criada_em` ficam, e os **ids também** — nenhum `DELETE`, nenhum `UPDATE`, nenhum reset de sequência. | É referenciada por `maletas.rev_id` e `vendas.revendedora_id`. Ambas são apagadas — mas apagar quem **aponta** para a revendedora nunca apaga a revendedora. |
| `categorias` | Não é dado, é configuração (§4), e é **pré-requisito da importação**: `produtos.cat` tem FK para cá. Limpar aqui faria toda linha da planilha ser recusada. | Pai de `produtos.cat`. |
| `config` | `prazoDias`, `prataPct`, `faixas` de comissão e os dois limites do freio do sync. Parâmetros da operação. | Nenhuma. Uma chave só sai — ver AVALIAR. |

### LIMPAR

Ordem obrigatória, filho antes de pai: o D1 força as FKs em toda query e
não aceita `PRAGMA foreign_keys`.

| # | Tabela | Por quê | Depende de |
|---|---|---|---|
| 1 | `inventario_itens` | Contagem física do estoque que vai deixar de existir. | `inventarios`, `produtos` |
| 2 | `inventarios` | Idem. | — |
| 3 | `venda_itens` | Cada item cita um SKU que vai sumir. | `vendas`, `produtos` |
| 4 | `vendas` | Vendas de teste do DEV, de balcão e de acerto. | `clientes`, `revendedoras`, `maletas` |
| 5 | `maleta_itens` | O vínculo peça↔maleta. | `maletas`, `produtos` |
| 6 | `maletas` | **Ver a nota sobre ambiguidade, abaixo.** | `revendedoras` |
| 7 | `kit_componentes` | Composição de kits montados sobre SKUs que vão sumir. | `produtos` (duas vezes) |
| 8 | `produto_variacoes` | A sincronização reescreve do zero a cada rodada — a loja é a fonte. | `produtos` |
| 9 | `movimentos` | A razão do estoque (§19). Sem produto não há razão. | `produtos` |
| 10 | `produtos` | O catálogo. **É o que a planilha da Sthefany vai recriar.** | `categorias` |
| 11 | `loja_snapshot` | Cache de uma leitura da loja: "380 casados de 400". Com catálogo vazio, mente. | — |
| 12 | `sync_execucoes` | Histórico das rodadas do robô. Fala de um estoque que não existe mais. | — |
| 13 | `clientes` | Nomes inventados pelos testes. **Sem FK para produto** — se houver cliente real aqui, comente a linha. | — |

### AVALIAR — decisões que precisam da sua palavra

**`maletas` + `maleta_itens` — a tabela que mistura revendedora e produto.**
É exatamente o caso que o pedido mandou não apagar em silêncio. Uma maleta
é *da* revendedora (`rev_id`) e *de* produtos (`maleta_itens.sku`). A FK
para `produtos` obriga a limpar `maleta_itens`; e uma maleta sem itens é
uma casca. **A proposta é apagar o vínculo operacional e manter o
cadastro** — que é a leitura literal da sua regra. O custo: some o
histórico de maletas encerradas, o que contraria o §28 ("não apagar
histórico — arquivar e cancelar, nunca excluir"). Em DEV isso é dado de
teste; se houver maleta real aqui, **diga, e a alternativa é manter
`maletas` com status `cancelada` e limpar só `maleta_itens`**.

**`config.syncUltimoPedido`.** É o cursor "até que pedido da loja já li".
Só esta chave sai; as outras quatro ficam. Com o estoque zerado, o cursor
aponta para um passado que não existe mais. Apagar faz a próxima rodada
recomeçar a leitura — **não desconecta a loja, não mexe em token, não
libera escrita**. Se preferir manter, é uma linha comentada; o efeito é a
sincronização ignorar pedidos antigos, o que também é defensável.

**`clientes`.** Sem FK para produto, então tecnicamente poderia ficar. Vai
junto porque em DEV são nomes de teste. Se algum for real, comente.

### Não existem no banco

`fotos`, `imagens`, `importacoes`, `pendencias`, `reconciliacao`,
`d1_migrations`. As migrations são aplicadas à mão por `--file=`; não há
tabela de controle, então **não há como uma migration ser apagada por este
reset** — elas são arquivos no repositório.

---

## Fase A — o backup

```bash
cd api
npm install
npx wrangler login                       # ou CLOUDFLARE_API_TOKEN no ambiente
bash tools/backup-dev.sh
```

Gera três arquivos em `backups/` (fora do git — ver nota de privacidade):

- `marquesa-dev-pre-reset-sthefany-<UTC>.sql` — o dump inteiro, restaurável
- `.sha256` — a soma de verificação
- `.md` — o cartão: banco de origem, data/hora UTC, commit, branch, tamanho,
  contagem por tabela, contagem de revendedoras e o comando exato de restauração

Antes do dump o script grava o **bookmark do Time Travel** — um ponto de
retorno do lado da Cloudflare, válido 30 dias, que restaura o banco sem
depender de arquivo nenhum. É o caminho de restauração preferido.

Nenhum Secret é lido ou gravado. O wrangler autentica pelo login da
máquina; nada disso entra nos arquivos.

> **Privacidade.** O dump carrega nome, CPF, telefone e endereço das
> revendedoras. Este repositório é **público** (GitHub Pages). `backups/`
> foi adicionado ao `.gitignore` por isso. Não commite o dump.

## Fase A — validar o backup

```bash
bash tools/validar-backup.sh ../backups/marquesa-dev-pre-reset-....sql
```

Não confia no código de saída do comando anterior: **restaura o dump de
verdade**, num SQLite temporário em memória, e confere que ele existe, não
está vazio, bate com o `.sha256`, carrega sem erro, traz as 16 tabelas
esperadas, tem revendedoras de verdade (não só schema) e passa no
`foreign_key_check`. O DEV real não é tocado em nenhum momento.

---

## Fase B — o reset (só depois da aprovação)

```bash
cd api
npx wrangler d1 execute marquesa-db --remote --file=tools/contagem.sql              # o "antes"
npx wrangler d1 execute marquesa-db --remote --file=tools/revendedoras-antes-depois.sql
npx wrangler d1 execute marquesa-db --remote --file=tools/reset-dev.sql             # a limpeza
npx wrangler d1 execute marquesa-db --remote --file=tools/contagem.sql              # o "depois"
npx wrangler d1 execute marquesa-db --remote --file=tools/revendedoras-antes-depois.sql
```

As duas saídas de `revendedoras-antes-depois.sql` têm que ser **idênticas**:
contagem, soma dos ids e a impressão digital do conteúdo cadastral.

## Fase B — conferir

```bash
API_URL=https://marquesa-api.SEU-SUBDOMINIO.workers.dev \
API_KEY=a-chave-do-DEV \
REV_ESPERADAS=<o número que está no cartão do backup> \
node tools/checar-pos-reset.mjs
```

Confere pela API, do jeito que o dashboard enxerga: `/api/health` responde;
rota protegida devolve 401 sem chave; `/api/state` devolve 200 e traz todas
as chaves que a tela lê; catálogo vazio; nenhum saldo; nenhuma maleta;
nenhum inventário aberto; revendedoras listadas e em número idêntico;
categorias e configurações preservadas; **loja ainda conectada**; razão do
estoque fechando em zero (§19). Só faz `GET` — não importa planilha nenhuma.

---

## Nuvemshop

**O que o reset não toca, porque não pode:** o banco não guarda credencial
nenhuma. `NUVEMSHOP_TOKEN`, `NUVEMSHOP_STORE_ID`, `NUVEMSHOP_CLIENT_ID` e
`NUVEMSHOP_CLIENT_SECRET` são Secrets do Worker. Um `DELETE` no D1 não
alcança um Secret. A prova disso é o `sync.conectada` em `/api/state`, que
sai de os Secrets existirem — o script de checagem confere.

**O que o reset zera, e por quê:** `sync_execucoes` (o histórico das
rodadas) e `loja_snapshot` (o retrato "380 de 400 casados"). Os dois
descrevem um estoque que não existe mais. Efeito visível: a aba Nuvemshop
passa a dizer "nunca sincronizou". A conexão continua de pé.

**O cron continua ligado** — 6h e 18h de Brasília, no `wrangler.toml`. Duas
janelas, e cada uma é segura por um motivo diferente:

- **Entre o reset e a importação**, `empurrarEstoque` lê
  `SELECT … FROM produtos WHERE status='ativo'` e cruza com o que a loja
  tem. Com `produtos` vazia, o resultado é vazio: **não há o que empurrar,
  e nenhum zero chega à loja**. A sincronização também nunca faz `INSERT`
  em `produtos` (o único no código todo está em `/api/produtos/importar`),
  então ela não repovoa o catálogo pelas costas da importação.
- **Depois da importação**, a rodada seguinte veria centenas de produtos
  mudando de uma vez. Aí o freio de segurança atua: passa de 40 mudanças,
  **a rodada para sozinha e fica registrada como pausada**, sem tocar na
  loja. É esse o mecanismo que faz o papel que o pedido atribuía ao
  `NUVEMSHOP_WRITES_ENABLED`.

Se quiser garantia dura em vez de comportamental, o caminho honesto é
**remover temporariamente o `NUVEMSHOP_TOKEN` do Worker de DEV** — aí a
sincronização responde "loja não conectada" e não há caminho de escrita
nenhum. Isso é uma mudança de Secret e **não está neste plano**; só sob
pedido explícito.

---

## Plano de restauração — "restaura o DEV para antes do reset"

### Caminho 1 — Time Travel (preferido)

```bash
cd api
npx wrangler d1 time-travel restore marquesa-db --bookmark='<o bookmark do cartão>'
```

Volta o banco inteiro ao instante exato do checkpoint. Vale 30 dias. Se o
bookmark tiver se perdido, um timestamp resolve:

```bash
npx wrangler d1 time-travel restore marquesa-db --timestamp=2026-08-21T12:00:00Z
```

### Caminho 2 — a partir do arquivo

```bash
cd api
bash tools/restaurar-backup.sh ../backups/marquesa-dev-pre-reset-....sql
```

Valida o arquivo, pede `RESTAURAR` por extenso, remove as tabelas atuais e
as recria a partir do dump. As tabelas precisam sair antes porque o
`wrangler d1 export` grava `CREATE TABLE` **sem** `IF NOT EXISTS` — aplicado
sobre um banco que ainda as tem, o arquivo falha na primeira linha. Quem
repõe tudo (schema, índices e linhas) é o próprio dump.

Depois, para conferir que voltou:

```bash
npx wrangler d1 execute marquesa-db --remote --file=tools/contagem.sql
npx wrangler d1 execute marquesa-db --remote --file=tools/revendedoras-antes-depois.sql
```

Compare com as contagens do cartão do backup.

---

## O que a Sthefany faz depois

Nada foi importado por fora — de propósito. O caminho é o da aplicação:

1. abre o DEV
2. **Estoque → Cadastro de Produtos**
3. **Importar planilha**
4. sobe o `.xlsx` real
5. escolhe **"a planilha é o estoque total"** (é o padrão; a outra opção,
   "só o que está em casa", soma de volta o que está em maleta — e não há
   maleta nenhuma agora)
6. o preview mostra quantos códigos serão criados e quantos mudam
7. confirma

Cada linha da planilha vira `INSERT` em `produtos` **mais** um registro em
`movimentos`, que é como o saldo passa a existir sem ninguém digitar (§19).

---

## Como este plano foi verificado

Sem acesso ao DEV remoto, tudo o que dava para provar foi provado num
Worker de verdade rodando local, com um banco populado imitando o DEV
(3 revendedoras, 4 produtos, kit, variações, 2 maletas, venda de acerto,
inventário, sync, snapshot, cliente):

- `reset-dev.sql` roda com as FKs **ligadas**, sem violação, e
  `PRAGMA foreign_key_check` fica limpo — a ordem de deleção está certa
- as revendedoras saem **byte a byte idênticas**: contagem, soma de ids e
  impressão digital do cadastro batem antes e depois
- `categorias` e `config` intactas; só `syncUltimoPedido` sai
- `/api/state` responde 200 depois do reset, com todas as chaves que a tela lê
- `POST /api/produtos/importar` funciona sobre o catálogo vazio, e a razão
  do estoque fecha (`/api/estoque/conferir` → `ok:true`)
- `validar-backup.sh` foi testado contra um dump **real** do
  `wrangler d1 export`, e também contra três backups quebrados de
  propósito (vazio, sem revendedoras, com tabela faltando) — recusou os três
- `contagem.sql` foi reescrito sem `UNION ALL` porque o D1 recusa um
  `SELECT` composto com 16 termos ("too many terms in compound SELECT")

O que **não** foi verificado, e só o acesso ao DEV resolve: as contagens
reais, se há maleta ou cliente de verdade lá dentro, e se o "DEV" é mesmo
um banco separado de produção.
