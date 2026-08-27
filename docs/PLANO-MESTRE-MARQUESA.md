# Plano mestre — Marquesa Semijoias

Documento vivo de acompanhamento do projeto. É a fonte contínua de contexto:
onde estamos, o que já foi decidido, o que falta, e por quê.

**Regra deste documento:** decisão registrada não se apaga. Quando algo muda,
o item ganha a nova decisão e a antiga fica marcada como superada, com a data.

| Símbolo | Significado |
|---|---|
| ✅ | concluído |
| 🟡 | em andamento |
| ⬜ | pendente |
| 🔴 | bloqueado |

Última revisão: **2026-08-27** · Vendas/CRM e histórico (seção 20).
Auditoria de prontidão para produção: 2026-08-22.

---

## 0. Resumo em uma página

O sistema **já está em produção há semanas — só que ninguém chamou aquilo de
produção.** O que a operação chama de "DEV" (`marquesa-dev.pages.dev` +
`marquesa-api-staging` + `marquesa-db-dev`) é o ambiente onde a Sthefany
cadastrou o estoque real, montou maletas reais e registrou vendas reais.

Ao mesmo tempo existe um ambiente que **se chama produção**
(`gustavodemelomartins-hub.github.io` + `marquesa-api` + `marquesa-db`) com
uma versão do código de ~5 semanas atrás, dados de uma importação antiga,
**cron ligado** e **escrita na Nuvemshop liberada**.

Então o go-live **não é** "copiar dados de um laboratório para um ambiente
novo". É:

1. **parar o ambiente que se chama produção de agir sozinho** (ele é hoje o
   maior risco vivo do projeto — ver Risco R1);
2. **promover o código** de `develop` para produção;
3. **promover os dados** de `marquesa-db-dev` para um banco de produção
   **novo**, deixando o `marquesa-db` atual congelado como rollback;
4. **criar o R2 de produção** e copiar as fotos;
5. **apontar a Sthefany para o endereço de produção** e devolver o DEV ao
   papel de laboratório.

Nenhuma dessas etapas exige apagar nada. A recomendação central deste plano é
que **o corte não faça uma única escrita destrutiva em produção** — o banco
antigo continua existindo, intocado, até que a produção nova esteja validada.

---

## 1. Estado atual  🟡

### O que existe hoje, tecnicamente confirmado

| Camada | "Produção" (hoje) | "DEV" (onde a operação acontece) |
|---|---|---|
| Branch | `main` (`f3f08cb`, 2026-08-16) | `develop` (`7ebeaeb`, 2026-08-22) |
| Frontend | GitHub Pages — `https://gustavodemelomartins-hub.github.io/Marquesa-Etiquetas/` | Cloudflare Pages — `https://marquesa-dev.pages.dev` |
| Worker | `marquesa-api` → `https://marquesa-api.marquesaasemijoias.workers.dev` | `marquesa-api-staging` → `https://marquesa-api-staging.marquesaasemijoias.workers.dev` |
| D1 | `marquesa-db` · `089153a9-cee5-4887-b789-a23b1cf419f5` | `marquesa-db-dev` · `dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b` |
| R2 | `marquesa-fotos` — **não existe ainda** | `marquesa-fotos-dev` |
| Cron | `0 9,21 * * *` (06h/18h BRT) — **ligado** | nenhum (`crons = []`) |
| Escrita na Nuvemshop | `NUVEMSHOP_WRITES_ENABLED = "true"` — **liberada** | `"false"` — bloqueada no cliente HTTP |
| CORS | `https://gustavodemelomartins-hub.github.io` | `marquesa-dev.pages.dev`, `marquesa-dev-legado.pages.dev` |
| Deploy | GitHub Pages (`main`) · Worker publicado à mão | GitHub Actions `deploy-dev.yml` · Worker à mão (`wrangler deploy --env staging`) |

Verificado em 2026-08-22, sem credencial nenhuma, só por HTTP público:

- os dois Workers respondem `/api/health` com `{"ok":true}` e devolvem `401`
  em `/api/state` sem chave — os dois estão no ar e protegidos;
- o `dashboard.html` servido pelo GitHub Pages é **byte a byte idêntico** ao
  do `main` (md5 `2204d985…`) — produção roda mesmo o código antigo;
- o `dashboard.html` servido por `marquesa-dev.pages.dev` tem 709 KB e as
  abas `cadastro`, `etiquetas`, `pendencias`, `revgeral`, `revlist`, que não
  existem no `main`.

### Distância entre os dois códigos

`main` é ancestral direto de `develop` — **47 commits atrás**, sem nenhum
commit exclusivo. Um merge `main ← develop` é fast-forward, sem conflito.

O que produção **não tem** e o DEV tem: fotos em R2, catálogo mestre, fila de
peças novas, geração de SKU, Pendências, Estoque Total, motor de
reconciliação, variantes por `variant_id`, trava de escrita na Nuvemshop,
painel React em `/painel-novo/`, e a correção do TECH_DEBT 12.

### O que NÃO foi possível apurar nesta rodada  🔴

Esta sessão **não tem credencial Cloudflare** (`CLOUDFLARE_API_TOKEN`
ausente, sem sessão do wrangler). Portanto continuam desconhecidos, e são a
primeira coisa a levantar:

- contagens reais em `marquesa-db-dev` (produtos, movimentos, vendas, maletas
  abertas, revendedoras, fotos);
- contagens reais em `marquesa-db` e **o que entrou nele desde 18/08** —
  especialmente vendas `origem='site'` criadas pelo cron;
- quais migrations cada banco recebeu;
- se `marquesa-api` tem os Secrets da Nuvemshop e o que as últimas rodadas do
  cron fizeram (`sync_execucoes`);
- quantos objetos existem em `marquesa-fotos-dev`.

---

## 2. Infraestrutura  ✅ (mapeada)

```
                    ┌──────────────── PRODUÇÃO (nome, não uso) ───────────────┐
GitHub Pages (main) │ github.io/Marquesa-Etiquetas  →  marquesa-api  →  marquesa-db │
                    │                                  cron 6h/18h    089153a9…     │
                    │                                  escreve na loja               │
                    └───────────────────────────────────────────────────────────────┘

                    ┌──────────── "DEV" (onde a operação real acontece) ──────────┐
GitHub Actions      │ marquesa-dev.pages.dev  →  marquesa-api-staging  →  marquesa-db-dev │
(develop)           │                            sem cron                dcc36f65…        │
                    │                            NÃO escreve na loja  →  marquesa-fotos-dev │
                    └────────────────────────────────────────────────────────────────────┘
```

Fontes: `api/wrangler.toml`, `.github/workflows/deploy-dev.yml`,
`docs/DEVELOPMENT.md § Ambiente DEV`, `api/tools/RESET-DEV.md`.

Nada foi assumido por nome: cada linha acima está declarada em arquivo
versionado ou foi confirmada por requisição HTTP pública.

### Detalhes que importam no corte

- **`marquesa-dev` é um projeto Pages Direct Upload.** Não tem integração Git
  nativa e não pode ganhar uma sem ser recriado (o que trocaria o endereço
  fixo). Quem publica é o workflow do GitHub.
- **Produção não tem CI.** O Worker `marquesa-api` é publicado à mão com
  `npx wrangler deploy` (sem `--env`); o frontend sai do GitHub Pages a partir
  de `main`.
- **`marquesa-dev-legado.pages.dev`** ainda está de pé como referência. Só
  aparece na lista de `ORIGENS_PERMITIDAS` do staging.
- **`wrangler deploy` sem `--env` hoje falharia** no passo do R2: o
  `wrangler.toml` declara o bucket `marquesa-fotos`, que ainda não existe.
  Isso é deliberado (comentário no próprio arquivo) e vira um **pré-requisito
  explícito** do go-live, não uma surpresa.

---

## 3. Produção  🔴 (é o maior risco vivo do projeto)

O ambiente chamado produção está **ativo, autônomo e desatualizado**:

- roda código de 5 semanas atrás;
- tem um banco cuja última foto conhecida (backup de 18/08) é de **782
  produtos e 1.278 movimentos**, e que não recebeu nenhuma das operações que
  a Sthefany fez no DEV;
- tem `NUVEMSHOP_WRITES_ENABLED = "true"`;
- tem cron de sincronização às **06h e 18h de Brasília**, todos os dias.

O cron faz, nessa ordem: puxa pedidos do site (virando vendas `origem='site'`
no `marquesa-db`) e **empurra o estoque do `marquesa-db` para a loja**.
Ou seja: **a loja da Nuvemshop pode estar recebendo, duas vezes por dia, o
estoque de um banco que não sabe das vendas feitas no DEV.**

O freio de segurança (`syncLimiteMudancas = 40`, `syncLimiteZerar = 15`)
provavelmente vem barrando essas rodadas — é exatamente o cenário para o qual
ele foi feito. Mas *"provavelmente"* não é o padrão deste projeto: isso
precisa ser lido em `sync_execucoes` antes de qualquer outra coisa.

**Ação nº 1 do plano** (Fase 0, adiante) é neutralizar esse cron.

---

## 4. DEV  🟡 (contém dado real, contra o que a própria documentação previa)

`docs/DEVELOPMENT.md` diz, textualmente: *"`marquesa-db-dev` não recebe cópia
de dado real — nunca."* Essa regra **não vale mais desde o teste de importação
da Sthefany**, e este documento registra a mudança de fato:

> **2026-08 (data exata a confirmar): `marquesa-db-dev` passou a conter dados
> reais de operação** — catálogo real, estoque real, revendedoras reais,
> maletas reais e vendas reais de balcão. A partir do corte, ele volta ao
> papel original, e essa frase da documentação volta a valer.

Consequências práticas enquanto isso não acontece:

- **o backup do DEV vira dado pessoal.** Nome, telefone, CPF e endereço de
  revendedoras. `backups/` já é ignorado pelo Git, e continua tendo que ser.
- **o DEV não pode ser resetado** por conveniência. `api/tools/reset-dev.sql`
  e o `RESET-DEV.md` continuam válidos como ferramenta, mas rodar qualquer um
  deles hoje destrói a operação da Marquesa.
- **o DEV é hoje a cópia mais valiosa de dados que existe.** Ele precisa de
  backup com a mesma disciplina que produção — e não tem nenhum agendado.

---

## 5. Banco de dados  🟡

Modelo completo em [DATA_MODEL.md](DATA_MODEL.md); regras em
[../api/REGRAS.md](../api/REGRAS.md). O que importa para o corte:

### A invariante que decide se um backup presta

```
produtos.qtd == SUM(movimentos.qtd)     para todo SKU
```

`estoque.js › movimentar` é o único caminho de escrita de saldo, e
`GET /api/estoque/conferir` prova a invariante a qualquer momento. **Ela é o
critério de aceitação de todo backup, toda restauração e todo smoke test
deste plano.** Vazio = passou.

### Divergência de schema entre os dois bancos  🔴

Não existe controle de migrations (TECH_DEBT 1): as migrations são arquivos
`api/migracao-*.sql` aplicados à mão. As que o DEV recebeu e produção
provavelmente **não** recebeu:

`migracao-catalogo.sql` · `migracao-foto-url.sql` · `migracao-fotos-loja.sql` ·
`migracao-variantes.sql` · `migracao-variacoes-locais.sql` ·
`migracao-sync-seco.sql` · `migracao-reconciliacao.sql` ·
`migracao-idempotencia-reconciliacao.sql`

Isso reforça a escolha de estratégia do go-live: **promover o banco inteiro
do DEV, em vez de migrar o de produção.** Um dump traz o schema junto; uma
sequência de oito migrations aplicadas à mão sobre dados reais não traz
garantia nenhuma.

### As duas bases divergiram, e as duas têm dado que a outra não tem  🔴

Este é o achado mais delicado da auditoria:

- **`marquesa-db-dev`** tem tudo o que a Sthefany fez (estoque, maletas,
  vendas de balcão);
- **`marquesa-db`** pode ter vendas `origem='site'` que o cron puxou da
  Nuvemshop desde 18/08 e que o DEV **não** tem.

Promover o DEV por cima, sem olhar, perderia essas vendas do site. **Antes do
corte é obrigatório listar `SELECT * FROM vendas WHERE origem='site'` dos dois
lados e comparar por `externo_id`** — está na Fase 1 do plano.

---

## 6. Backup  ⬜ (o plano existe; a execução ainda não)

Procedimento completo, comandos conferidos e critérios de aceitação:
[BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).
Ferramentas prontas: `api/tools/backup-dev.sh`, `validar-backup.sh`,
`restaurar-backup.sh`.

### Estado dos backups

| Recurso | Último backup conhecido | Situação |
|---|---|---|
| `marquesa-db` (produção) | `backups/d1/2026-08-18_06-22/` — 720.922 bytes, 16 tabelas, razão fechando | ✅ conferido, mas **de 4 dias atrás e de antes do go-live** |
| `marquesa-db-dev` | nenhum registrado | 🔴 **é onde estão os dados reais e não tem backup** |
| `marquesa-fotos-dev` (R2) | nenhum | 🔴 sem cópia |
| Código | `origin/develop` no GitHub + tag local `checkpoint/pre-bootstrap-claude` | 🟡 falta a tag do corte |
| Secrets | não têm backup e não são legíveis | por construção — perder é rotação, não recuperação |

### Backups obrigatórios antes do corte

Nomes e caminhos já decididos, para não haver improviso na hora:

```
backups/d1/2026-08-22_HH-MM_pre-golive/
  marquesa-db-dev.sql          ← o dado que vira produção
  marquesa-db-dev.sql.sha256
  fotos-manifesto.json         ← mapa D1 → R2 (quais SKUs têm foto)
  MANIFESTO.txt

backups/d1/2026-08-22_HH-MM_pre-golive-producao/
  marquesa-db.sql              ← o que produção tem hoje, antes de ser trocada
  marquesa-db.sql.sha256
  MANIFESTO.txt
```

Comandos exatos (nenhum deles escreve em banco nenhum):

```bash
cd api

# 1. prova de alvo + bookmark de Time Travel + dump + manifesto, tudo em um
bash tools/backup-dev.sh
#    (aborta sozinho se o uuid não for dcc36f65-… — não existe backup
#     "provavelmente do DEV")

# 2. produção, no mesmo padrão
npx wrangler d1 time-travel info marquesa-db          # ANOTE o bookmark
npx wrangler d1 export marquesa-db --remote \
  --output ../backups/d1/2026-08-22_HH-MM_pre-golive-producao/marquesa-db.sql

# 3. validar os dois — restaura de verdade num SQLite descartável
bash tools/validar-backup.sh ../backups/d1/2026-08-22_HH-MM_pre-golive/marquesa-db-dev.sql
bash tools/validar-backup.sh ../backups/d1/2026-08-22_HH-MM_pre-golive-producao/marquesa-db.sql
```

> ⚠️ `wrangler d1 export` imprime um **link temporário do R2 (1 hora) que dá
> acesso ao dump inteiro sem autenticação**. Não cole a saída do comando em
> lugar nenhum.

Critério de aceitação, para os dois: carrega num banco limpo, traz as 20
tabelas, `PRAGMA foreign_key_check` limpo, zero órfãos,
`COUNT(externo_id) == COUNT(DISTINCT externo_id)` e **`divergentes = 0`** na
razão contábil.

### Backup do R2

Não há ferramenta pronta. O caminho é montar a lista a partir do próprio D1 —
as chaves são determinísticas (`produtos/<sku>/original`,
`produtos/<sku>/tratada`, ver `api/src/fotos-storage.js`) — e baixar objeto a
objeto:

```bash
# lista as chaves que o banco referencia
npx wrangler d1 execute marquesa-db-dev --env staging --remote --json --command \
  "SELECT sku, foto_original_key, foto_tratada_key FROM produtos
    WHERE foto_original_key IS NOT NULL OR foto_tratada_key IS NOT NULL"

# para cada chave:
npx wrangler r2 object get marquesa-fotos-dev/<chave> --file backups/r2/2026-08-22/<chave>
```

Vale antes conferir o volume (`npx wrangler r2 bucket info marquesa-fotos-dev`).
Se forem centenas de objetos, um laço de shell resolve; se forem milhares,
compensa usar a API S3 do R2 com `rclone`.

### Rotina depois do go-live  ⬜

| Quando | O quê |
|---|---|
| Semanal | export do D1 de produção |
| Antes de qualquer migration | obrigatório, sem exceção |
| Antes de importação de catálogo/estoque | a importação escreve em massa |
| Antes de `POST /api/sync {"forcar": true}` | pula o freio de segurança |
| Depois de fechar inventário | é o momento em que o físico foi conferido |

---

## 7. Go-live  🟡

### 7.1 Arquitetura desejada (a mesma que o pedido descreve)

```
PRODUÇÃO   código de produção  +  banco de produção  +  storage de produção
DEV        código de dev       +  banco de dev       +  storage de dev
```

O estado de dados validado hoje no DEV é copiado para produção **uma vez**, no
corte. Depois disso os bancos seguem caminhos independentes.

### 7.2 A decisão central: banco NOVO, não sobrescrever o antigo

Três caminhos foram considerados:

| | Caminho | Veredito |
|---|---|---|
| A | Apontar `marquesa-api` para `marquesa-db-dev` | **Recusado.** Destrói a separação de ambientes — é exatamente o que o pedido proíbe. O DEV deixaria de poder ser quebrado. |
| B | Apagar as tabelas de `marquesa-db` e recarregar o dump do DEV | **Recusado.** Faz uma escrita destrutiva em produção. Se o dump tiver qualquer problema, a produção fica pela metade e o rollback depende de arquivo. |
| C | **Criar um D1 novo, carregar o dump do DEV nele, validar, e só então apontar `marquesa-api` para ele** | **Recomendado.** Nenhuma escrita destrutiva. O `marquesa-db` atual continua existindo, intocado, como rollback de um comando. |

O caminho C é também o que o próprio [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md)
recomenda para restauração em produção: *"carregar o arquivo num banco D1
**novo** e validar lá (…) só então decidir entre apontar o binding para o
banco novo ou reverter o antigo"*.

Nome sugerido para o banco novo: **`marquesa-db-prod`**. Manter `marquesa-db`
com o nome atual, congelado, evita qualquer ambiguidade em comando digitado às
pressas.

O mesmo vale para o R2: o bucket `marquesa-fotos` **ainda não existe**, então
criá-lo e povoá-lo a partir de `marquesa-fotos-dev` não sobrescreve nada.

### 7.3 O corte — fases

Cada fase termina num ponto verificável. Nenhuma fase começa antes de a
anterior ter passado.

#### Fase 0 — parar o sangramento  🟡 (autorizada 2026-08-22)

Objetivo: impedir que o Worker de produção escreva na loja da Nuvemshop com
dados velhos enquanto o corte acontece. **Autorizada explicitamente, com o
escopo restrito ao cron — sem tocar em banco, R2, Secrets, `API_KEY`,
migrations, dados ou deploy.**

Desarmar o cron tem duas metades, e as duas são necessárias:

**a) No repositório — feito ✅.** `api/wrangler.toml`, bloco de produção,
passou a declarar `crons = []`, com o motivo, a forma de repor e a data.

Isso **não desliga nada sozinho**: só passa a valer no próximo
`wrangler deploy`. Mas sem essa metade, o deploy do próprio corte (Fase 5)
**rearmaria o cron em silêncio** — o `wrangler deploy` trata o
`wrangler.toml` como fonte da verdade e reescreve os triggers a partir dele.
Era a armadilha mais provável deste plano inteiro.

`crons = []` (lista vazia) é a forma explícita de remover. Apagar o bloco
`[triggers]` deixaria o que já existe na Cloudflare como está.

**b) Na Cloudflare — pendente ⬜, precisa de quem tem acesso à conta.**
Sem deploy, pelo painel:

```
Cloudflare → Workers & Pages → marquesa-api → Settings → Triggers
→ Cron Triggers → remover "0 9,21 * * *"
```

Alternativa por API, se preferir linha de comando (também não é deploy de
código — só troca a agenda):

```bash
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/scripts/marquesa-api/schedules" \
  -H "Authorization: Bearer <TOKEN com Workers Scripts:Edit>" \
  -H "Content-Type: application/json" \
  --data '[]'
```

**Como confirmar que acabou** (qualquer um dos três serve, e o primeiro é o
mais direto):

- painel → `marquesa-api` → Settings → Triggers: a seção **Cron Triggers**
  fica vazia, sem `0 9,21 * * *`;
- `npx wrangler triggers list marquesa-api` (ou a aba **Cron Events** do
  Worker) não lista agendamento nenhum;
- **a prova que não depende de leitura de tela:** passada a próxima janela
  das 06h ou 18h, nenhuma linha nova aparece em `sync_execucoes`. É o
  primeiro item do inventário da Fase 1, e é o que fecha esta fase.

Reversível a qualquer momento: repor a agenda pelo painel, ou a linha
comentada no `wrangler.toml` mais um deploy.

#### Fase 1 — inventário e diferença entre as duas bases  ⬜

Tudo somente leitura.

1. Contagens dos dois bancos: `produtos`, `movimentos`, `vendas` (por origem),
   `maletas` (por status), `revendedoras`, `venda_itens`, `inventarios`.
2. `GET /api/estoque/conferir` nos dois — tem que voltar vazio nos dois.
3. **Diferença de vendas do site:** `SELECT externo_id, data, total FROM vendas
   WHERE origem='site'` nos dois, comparado por `externo_id`. O que existir só
   em produção é uma venda real que o DEV não conhece — decidir item a item o
   que fazer (o mais provável: relançar como movimento no banco novo, com
   `obs` explicando a origem).
4. Listar as migrations aplicadas em cada banco
   (`SELECT name FROM sqlite_master WHERE type='table'` + `PRAGMA table_info`).
5. Conferir maletas `aberta`/`em_acerto` no DEV — peça consignada de verdade.
6. Volume do `marquesa-fotos-dev`.

**Ferramenta pronta ✅ — `api/tools/inventario-golive.sh`.** Faz os seis
passos acima de uma vez, nos dois bancos, e escreve em
`backups/golive/<carimbo>_inventario/`: um `RELATORIO.txt` legível e os JSON
brutos de cada consulta. Prova os dois uuids antes de ler qualquer coisa, e
**toda consulta é `SELECT`** — nenhuma escrita, em nenhum dos dois lados.

O diff das vendas do site é `api/tools/diff-vendas-site.mjs`, chamado pelo
script e também usável sozinho. Ele sai com código diferente de zero quando
existe algo que precisa de decisão humana — venda só em produção, ou o mesmo
pedido com dados diferentes dos dois lados.

```bash
cd api && bash tools/inventario-golive.sh
```

**Saída desta fase:** uma tabela de contagens antes/depois esperadas, que vira
o critério de aceitação da Fase 4. Sem ela não dá para provar que a cópia
ficou completa.

#### Fase 2 — backups  ⬜

Exatamente a seção 6 acima. Os dois dumps, validados, com manifesto. Mais o
backup do R2. **Nenhuma fase seguinte começa sem os três prontos e conferidos.**

#### Fase 3 — congelar o DEV (a hora do corte)  ⬜

O corte precisa de um instante definido, e de uma trava que não dependa de
alguém lembrar de não usar o sistema.

**Horário sugerido:** um domingo à noite, ou qualquer dia depois das 21h —
fora da janela de venda. A ser confirmado com a Sthefany, com aviso na véspera.

**Trava técnica recomendada:** trocar a `API_KEY` do Worker staging.

```bash
cd api
npx wrangler secret put API_KEY --env staging     # cola a chave nova
```

A partir daí, toda chamada do navegador dela ao DEV responde `401` — inclusive
a tela de vendas. É instantâneo, não toca em dado nenhum e é reversível
(basta pôr a chave antiga de volta). É o que garante o que o pedido pede:
*"uma venda feita no DEV durante a cópia não pode se perder"* — porque nenhuma
venda consegue entrar depois desse instante.

Ela precisa ser avisada **antes**, e o aviso é literalmente: *"a partir das
21h de hoje o endereço antigo para de funcionar; amanhã você usa o endereço
novo, que eu te mando."*

**Verificação dupla contra venda perdida:** anotar `MAX(id)` de `vendas` e de
`movimentos` no DEV imediatamente antes do dump e imediatamente depois.
Se mudarem, alguma escrita entrou durante a cópia → refazer o dump.

#### Fase 4 — promover os dados  ⬜

```bash
cd api

# 1. banco novo, vazio
npx wrangler d1 create marquesa-db-prod           # anote o database_id

# 2. carregar o dump do DEV (o banco está vazio, então não há colisão de PK)
npx wrangler d1 execute marquesa-db-prod --remote \
  --file=../backups/d1/2026-08-22_HH-MM_pre-golive/marquesa-db-dev.sql

# 3. conferir contra a tabela de contagens da Fase 1
npx wrangler d1 execute marquesa-db-prod --remote --command \
  "SELECT (SELECT COUNT(*) FROM produtos) produtos,
          (SELECT COUNT(*) FROM movimentos) movimentos,
          (SELECT COUNT(*) FROM vendas) vendas,
          (SELECT COUNT(*) FROM revendedoras) revendedoras"

# 4. a prova que importa
npx wrangler d1 execute marquesa-db-prod --remote --command \
  "SELECT COUNT(*) AS divergentes FROM produtos p
     LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m
       ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.soma,0)"
```

`divergentes = 0` e contagens idênticas às do DEV = aprovado.

**R2 de produção:**

```bash
npx wrangler r2 bucket create marquesa-fotos
# copiar objeto a objeto a partir do backup local (mesmas chaves)
npx wrangler r2 object put marquesa-fotos/<chave> --file backups/r2/2026-08-22/<chave>
```

As chaves são determinísticas por SKU, então o banco novo já aponta para elas
sem nenhuma reescrita de coluna.

#### Fase 5 — promover o código  ⬜

1. **Tag do estado que vai ao ar**, no `develop` validado:

   ```bash
   git tag -a golive-producao-2026-08-22 -m "Estado promovido a produção no corte de 2026-08-22"
   git push origin golive-producao-2026-08-22
   ```

   Nome escolhido em vez de `pre-production-cutover-…` porque a tag marca o
   que **foi** para produção, não o que havia antes — o "antes" já está
   marcado por `checkpoint/pre-bootstrap-claude` e por `origin/main`.

2. **Merge `main ← develop`** (fast-forward, sem conflito) — **exige
   autorização humana explícita**, conforme `CLAUDE.md`.

3. **`api/wrangler.toml`**: trocar o `database_id` do bloco de produção para o
   do `marquesa-db-prod`, e acrescentar o endereço do painel de produção em
   `ORIGENS_PERMITIDAS`.

4. **Publicar o Worker de produção:**

   ```bash
   cd api && npx wrangler deploy          # sem --env
   ```

   Só funciona depois que o bucket `marquesa-fotos` existir (Fase 4).

5. **Secrets de produção:** conferir `API_KEY` e os `NUVEMSHOP_*` com
   `npx wrangler secret list` (lista só nomes). Nesta hora vale **rotacionar a
   `API_KEY` de produção**, já que a antiga circulou por meses.

6. **Frontend de produção.** Decisão pendente — ver 7.4.

7. **Cron:** religar só depois dos smoke tests, e depois de uma rodada seca
   (`POST /api/sync {"seco": true}`) mostrar que o que ele faria está correto.

#### Fase 6 — smoke tests  ⬜

Seção 7.5. Nenhum acesso é liberado para a Sthefany antes de todos passarem.

#### Fase 7 — devolver o DEV ao papel de laboratório  ⬜

**Não é para fazer no dia do corte.** Enquanto a produção nova não tiver uma
semana de uso tranquilo, o `marquesa-db-dev` é a terceira cópia dos dados e
vale mais parado do que limpo.

Quando for a hora, e com autorização explícita:
`api/tools/RESET-DEV.md` já descreve o procedimento inteiro, preservando
revendedoras — e ele passa a ser executado **com o backup do go-live guardado
em outro lugar**.

### 7.4 Frontend de produção — DECIDIDO  ✅

**2026-08-22 — o frontend oficial continua sendo o GitHub Pages atual:**

```
https://gustavodemelomartins-hub.github.io/Marquesa-Etiquetas/
```

A Sthefany continua usando **exatamente esse endereço**. Ele não muda no
corte. O que muda é tudo o que está atrás dele: o código aprovado, o Worker
de produção, o banco novo e o storage de produção.

`marquesa-dev.pages.dev` continua sendo **exclusivamente** o ambiente DEV.
Nenhum Pages de produção é criado agora.

> Decisão superada, registrada porque foi tomada e revertida na mesma
> rodada: chegou a ser escolhido criar um Pages novo de produção, com
> workflow espelho do `deploy-dev.yml`. Revertido no mesmo dia — a favor de
> não trocar o endereço que a cliente já tem e de reduzir o número de peças
> móveis no corte.

**O que isso simplifica:** `ORIGENS_PERMITIDAS` do Worker de produção já vale
`https://gustavodemelomartins-hub.github.io` e **não precisa mudar**. O
Risco R6 (CORS) cai para perto de zero. E promover o código passa a ser um
ato só: o merge em `main` republica o GitHub Pages sozinho.

**O que isso deixa em aberto**, e vale registrar para não virar surpresa:
publicar por GitHub Pages a partir de `main` **não roda teste nenhum**. Hoje
o único caminho de deploy com portão de testes é o do DEV
(`deploy-dev.yml`: testes do painel novo, build, teste de migration, e o
`build.py` que garante que o `dashboard.html` publicado veio mesmo do
template). Em produção, o que entra é o que estiver commitado.

Duas consequências práticas para o corte:

1. **O `dashboard.html` precisa estar em dia com o template antes do merge.**
   Ele é montado, não editado (`python src/build.py`). Um merge com o
   arquivo desatualizado publica um painel que não corresponde ao código.
   Conferir com `git diff --ignore-cr-at-eol -- dashboard.html` — vazio.
2. **Item de backlog, não do corte:** um workflow em `main` que rode a mesma
   suíte e falhe alto quando o painel publicado divergir do template. Não
   impede a publicação (o Pages publica do branch de qualquer jeito), mas
   transforma "ninguém percebeu" em "o CI ficou vermelho".

### 7.5 Smoke tests de produção  ⬜

Rodar **na produção nova**, com a chave nova, antes de entregar o endereço.
Cada teste tem um critério objetivo, comparado contra a tabela de contagens da
Fase 1.

| # | Teste | Critério de aceitação |
|---|---|---|
| 1 | **Produtos** — abrir Meu Estoque | Número de SKUs idêntico ao do DEV antes do corte. Conferir 5 peças conhecidas por nome, categoria e preço. |
| 2 | **Estoque** — comparar quantidades | 10 códigos escolhidos na Fase 1 com total, consignado e disponível **iguais** aos anotados. Mais `GET /api/estoque/conferir` **vazio**. |
| 3 | **Revendedoras** | Mesma quantidade, mesmos nomes, mesmas maletas abertas, mesma contagem de peças e mesmo valor por maleta. Abrir uma maleta em acerto e conferir o cálculo de comissão. |
| 4 | **Venda controlada** | Registrar UMA venda de 1 peça de código conhecido. `estoque anterior − 1 == estoque novo`. Depois **cancelar** e conferir que voltou. `conferir` vazio nas duas pontas. |
| 5 | **Persistência** | Recarregar a página e reabrir em outro aparelho. Os dados da venda do teste 4 continuam lá. |
| 6 | **Nuvemshop** | `POST /api/sync {"seco": true}` — rodada **seca**. Ler o relatório: nenhuma variação repartida indevidamente, nenhum código zerado sem motivo, e a lista de mudanças fazendo sentido. **Não aplicar.** Só depois de o relatório estar limpo é que o cron volta a ser religado. |
| 7 | **Fotos** | Abrir 5 peças com foto e ver a imagem carregando do bucket novo. Conferir uma peça com foto tratada e uma só com original. |
| 8 | **Autorização** | `GET /api/state` sem chave → `401`. Com a chave antiga → `401` (prova que a rotação funcionou). |

Teste 6 merece ênfase: é o único que pode alterar a loja de verdade se rodado
errado. **Seco primeiro, sempre.**

### 7.6 Rollback  ⬜

Cada camada volta sozinha, sem depender das outras.

| Se falhar | Como voltar | Custo |
|---|---|---|
| Dados de produção | Trocar o `database_id` no `wrangler.toml` de volta para `089153a9-…` e `wrangler deploy`. O `marquesa-db` continua exatamente como estava. | minutos |
| Dados, com o banco novo já em uso | `npx wrangler d1 time-travel restore marquesa-db-prod --bookmark <o do manifesto>` | minutos, últimos 30 dias |
| Código do Worker | Painel da Cloudflare → `marquesa-api` → Deployments → promover o anterior; ou `git checkout <sha antigo> && wrangler deploy` | minutos |
| Frontend (opção A) | `git revert` em `main` e push — o GitHub Pages republica | minutos |
| Frontend (opção B) | Painel Pages → Deployments → promover o anterior | minutos |
| Tudo | O DEV continua de pé, com o dado e o código que funcionavam. Repor a `API_KEY` antiga do staging devolve o sistema à Sthefany como estava antes do corte. | minutos |

O que **não** tem rollback: os Secrets. Chave rotacionada não volta — a antiga
não é legível. Guarde a nova antes de trocar.

---

## 8. Estoque  ✅ (comportamento atual documentado)

- Saldo **nunca** é digitado. Toda mudança é um movimento
  (`estoque.js › movimentar`), e o `PATCH` de produto com `qtd` é recusado.
- Três saldos por SKU (§5.2): **total**, **consignado** (soma das maletas
  `aberta`/`em_acerto`), **disponível** = total − consignado.
- **Kit** não tem saldo próprio: o disponível é o mínimo entre os componentes,
  compartilhado — vender um kit derruba na hora o outro anúncio que usa a mesma
  peça.
- **Variação** é uma coluna em `movimentos`, não uma contabilidade paralela.
  O saldo de uma variação é a mesma soma com um filtro a mais.
- **Inventário** compara e sugere; corrigir é um ato separado (`ajustar`), um
  código por vez, com o motivo escrito.

### Redesign da tela  ⬜ — ver backlog item 3

---

## 9. Vendas  🟡

### Como funciona hoje

`VENDA → reduz estoque`, e o caminho é sempre o mesmo:

```
POST /api/vendas
  → valida: SKU existe? tem preço (§24)? tem disponível?
  → INSERT vendas (origem='balcao')
  → INSERT venda_itens (uma linha por SKU, motivo='venda')
  → movimentar(tipo='venda', origem='venda')  →  movimentos + produtos.qtd −= n
  tudo num db.batch() só
```

Tabelas envolvidas: `vendas`, `venda_itens`, `movimentos`, `produtos`
(e `clientes`, quando a venda cita uma cliente cadastrada).

Três origens convivem na mesma tabela `vendas`, separadas por `origem`:
`balcao` (a tela), `acerto` (peça não devolvida numa maleta) e `site`
(pedido puxado da Nuvemshop, com `externo_id` e índice único contra duplicata).

Cancelar hoje (`POST /api/vendas/:id/cancelar`) cria movimento de
`cancelamento` com sinal invertido e marca `vendas.cancelada = 1`. A venda
**não** é apagada (§28).

### REGRA DE OURO — a planilha `Vendas Marquesa.xlsx`  ⬜  🔴 não implementar agora

> **A planilha histórica de vendas NÃO deve ser importada no go-live, e quando
> for importada NÃO pode movimentar o estoque atual.**
>
> **Motivo:** o estoque de hoje já incorpora todas essas vendas antigas. Um
> movimento de `venda` para cada linha histórica descontaria a mesma peça duas
> vezes e deixaria o estoque negativo — e, pior, empurraria esse número para a
> Nuvemshop, tirando do ar peças que existem.
>
> **O que a venda histórica alimenta:** clientes, CRM, dashboards, ticket
> médio, produtos mais vendidos, histórico por cliente. **Nada mais.**
>
> **Como isso vai ser garantido tecnicamente** (desenho, ainda não construído):
> vendas históricas entram com uma origem própria — `origem = 'historico'` —
> e o importador **não chama `movimentar()`**. `venda_itens` registra o item
> para o CRM; `movimentos` não recebe linha nenhuma. Assim a invariante
> `produtos.qtd == SUM(movimentos.qtd)` continua fechando, e todo relatório de
> CRM lê `vendas`/`venda_itens` sem filtro, enquanto todo cálculo de estoque
> lê `movimentos` e nunca vê o histórico.
>
> **Contra duplicação**, três populações que não podem se sobrepor:
> 1. vendas históricas da planilha (`origem='historico'`);
> 2. vendas feitas no DEV antes do corte (vieram no dump, já são `balcao`/
>    `acerto`/`site`);
> 3. vendas feitas em produção depois do corte.
>
> A fronteira entre (1) e (2) é a **data do corte**: a planilha só pode trazer
> linhas anteriores à primeira venda registrada no sistema. A importação
> precisa recusar — e anunciar, §22 — qualquer linha cuja data caia dentro do
> período já coberto pelo sistema, em vez de decidir sozinha.

### Backlog de vendas  ⬜ — ver backlog itens 1 e 2

---

## 10. Clientes / CRM  ⬜

Existe hoje: a tabela `clientes` (id, nome, tel, criada_em),
`GET/POST /api/clientes`, e `vendas.cliente_id` + `vendas.cliente_nome`.
A venda de balcão exige o nome da cliente.

Não existe: área de Clientes, nenhum indicador, nenhum perfil individual.
Escopo desejado no backlog item 2.

---

## 11. Revendedoras  ✅ (comportamento) · ⬜ (redesign)

Como uma peça enviada à revendedora afeta os saldos:

| Ato | `produtos.qtd` (total) | Em casa | Consignado |
|---|---|---|---|
| Montar maleta (`consignacao`) | **não muda** | cai | sobe |
| Devolver no acerto (`devolucao`) | **não muda** | sobe | cai |
| Não devolvida, vendida | **cai** | — | cai |
| Não devolvida, perda/quebra/dano | **cai** | — | cai |
| Não devolvida, "ficou" com ela | não muda | — | continua fora |
| Maleta cancelada | **não muda** | volta tudo | zera |

§5.3: **consignação não é venda.** Os movimentos `consignacao` e `devolucao`
têm efeito **0** no total — a peça continua sendo da Marquesa, só mudou de
lugar. Quem responde "quanto está em casa" é
`total − SUM(maleta_itens.qtd − devolvida)` das maletas ainda abertas.

O acerto (§7, §9, §13) congela o preço do envio (`maleta_itens.preco_envio`),
gera venda de verdade (`vendas.origem='acerto'`) para o que não voltou, e
calcula comissão por faixa sobre as **banhadas**, com Prata 925 a 10% à parte.

> ⚠️ **Pendência de negócio, não de código:** `api/REGRAS.md` registra que a
> regra da faixa (pelo total de banhadas, e não pelo total geral) precisa ser
> conferida contra o contrato assinado. Numa maleta de fronteira a diferença
> chega a **R$ 295**. Nenhuma das maletas atuais é afetada, mas isso vale ser
> resolvido antes de usar o valor do acerto para cobrar.

### Redesign  ⬜ — ver backlog item 4

---

## 12. Nuvemshop  🟡

### Quem é a fonte do estoque

**Nós somos.** A Nuvemshop é **destino** do estoque, nunca fonte da verdade do
físico. A única exceção é a semeadura inicial de variações, e ela tem duas
travas (só código virgem; e só se a soma das variações da loja bater com o
nosso total).

### Como a sincronização compara e corrige

`sync.js › sincronizar`, e a **ordem importa**:

1. `puxarPedidos()` — lê os pedidos do site e vira venda aqui (`origem='site'`,
   idempotente por `externo_id`);
2. `semearVariacoes()` — reparte, uma única vez, o estoque de códigos virgens
   com mais de uma variação;
3. `empurrarEstoque()` — calcula `em casa = total − consignado` e manda para a
   caixinha certa da loja;
4. `gravarRetratoDaLoja()` — guarda o que leu (é o que alimenta a aba Loja).

Inverter 1 e 3 quebraria o sistema: a Nuvemshop baixa o estoque dela sozinha
quando alguém compra, e empurrar antes de puxar recolocaria à venda uma peça
já vendida.

### O freio de segurança

Uma rodada que mudaria mais de **40** produtos, ou zeraria mais de **15**,
**para sozinha** e fica registrada como `pausado`. Ajustável por
`PUT /api/config` (`syncLimiteMudancas`, `syncLimiteZerar`).

### O problema das variações — onde ocorreu

Histórico registrado em `api/REGRAS.md` (regras 7 e 8), resumido:

1. **`mapearSkus` tratava variação como duplicata.** Ao encontrar o mesmo SKU
   duas vezes, descartava a segunda. A sincronização então escrevia **o
   estoque inteiro do código dentro de uma única variação** — na prática,
   anunciava todo o estoque num tamanho só e deixava os outros com número
   velho. A tela acusava 56 duplicatas numa loja que tem 2.
2. **A herança disso ainda está na loja.** Muitos códigos estão lá com
   `[total, resto, resto]`. Por isso `semearVariacoes` **não reparte quando a
   soma das variações da loja não bate com o nosso total** — repartir "na
   ordem" reproduziria o bug e levaria zero de volta para os outros tamanhos.
   O freio pegou esse cenário real: 16 produtos que seriam zerados.
3. **Correção atual:** variações viraram entidade própria
   (`produto_variacoes` + coluna `variacao` em `movimentos`), o casamento é
   por `variant_id`, e códigos que não estão inteiramente repartidos **não são
   empurrados** — melhor não anunciar do que anunciar peça que não existe.

### O que pode alterar o estoque da loja automaticamente  🔴

Exatamente dois caminhos, e os dois passam por `empurrarEstoque`:

- **o cron de produção**, às 06h e 18h BRT (`marquesa-api` apenas);
- **o botão "Sincronizar agora"** no painel, e o "Aplicar mesmo assim"
  (`forcar: true`), que pula o freio.

`marquesa-api-staging` **não consegue** escrever na loja: a trava
`NUVEMSHOP_WRITES_ENABLED="false"` recusa qualquer POST/PUT/PATCH/DELETE
dentro de `nuvemshop.js › chamar`, antes do `fetch` sair do Worker. Fail-closed
— só a string exata `"true"` libera, e `GET` nunca é afetado.

### Redesign da aba (dashboard de saúde)  ⬜ — ver backlog item 5

---

## 13. Pendências  ⬜

Existe hoje no `develop` como aba `pendencias`, com `/api/produtos/pendentes`,
`/api/fotos/orfas` e `/api/catalogo/publicacao`. O redesign para **Central de
Ação / Resolução** está no backlog item 6.

---

## 14. Fotos  🟡

- Os bytes moram no **R2**; o D1 guarda só a chave, o tipo, o tamanho e o
  estado (`migracao-catalogo.sql`).
- Duas versões por peça: `original` (o que foi fotografado, ou o que a loja
  tinha) e `tratada` (fundo branco, a que vai para a loja).
- Chave **determinística**: `produtos/<sku>/original` e `produtos/<sku>/tratada`
  — sem timestamp, sem extensão. Trocar a foto sobrescreve o mesmo objeto, e o
  D1 nunca aponta para chave que sumiu. **É isso que torna a cópia DEV → PROD
  trivial: o banco novo já procura no lugar certo.**
- Limites: JPEG/PNG/WebP, 8 MB.
- A sincronização ingere sozinha as fotos do catálogo da loja
  (`fotos.js › ingerirFotosDoCatalogo`), sem chamada extra à Nuvemshop.
- **Em produção não existe bucket ainda** — criar `marquesa-fotos` é
  pré-requisito do primeiro `wrangler deploy` de produção.

### Importação de fotos em lote  ⬜ — ver backlog item 7

---

## 15. Agentes  ⬜

**Agente de tratamento de imagem — não implementar agora.** Depois que a foto
estiver associada à peça: analisar, remover fundo, padronizar fundo branco,
melhorar enquadramento, normalizar resolução, preparar para a Nuvemshop.

Exige rodada própria de testes antes de entrar em produção. O schema já
antecipa o estado (`foto_status`: `sem_foto | original | fundo_pendente |
fundo_gerado | erro`), então o módulo entra sem migration nova.

---

## 16. Bugs conhecidos e riscos

### Riscos do go-live

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| **R1** | **Cron de produção empurrando estoque velho para a loja real, 2×/dia** | 🔴 alta → 🟡 | Fase 0 **autorizada e em curso**: `crons = []` já no `wrangler.toml` (impede o rearme no deploy do corte); falta remover a agenda na Cloudflare. Confirmação final = nenhuma linha nova em `sync_execucoes` depois da próxima janela. |
| **R2** | Venda registrada no DEV durante a cópia se perde | 🔴 alta | Fase 3: rotacionar a `API_KEY` do staging na hora do corte + conferir `MAX(id)` antes e depois do dump. |
| **R3** | Vendas do site que só existem no `marquesa-db` seriam perdidas ao promover o DEV | 🔴 alta | Fase 1: diff por `externo_id`, decisão item a item, relançamento com `obs` explicando. |
| **R4** | Produção não tem as 8 migrations do DEV | 🟡 média | Resolvido pela estratégia: banco novo a partir do dump, que traz o schema junto. |
| **R5** | `wrangler deploy` de produção falha por falta do bucket `marquesa-fotos` | 🟡 média | Criar o bucket antes (Fase 4). Está documentado no próprio `wrangler.toml`. |
| **R6** | CORS errado deixa a tela dizendo "não encontrei a API" | 🟢 baixa | Resolvido por G8: o endereço de produção não muda, e `ORIGENS_PERMITIDAS` já vale `https://gustavodemelomartins-hub.github.io`. Só reconferir que a linha continua lá no deploy. |
| **R7** | `API_KEY` de produção circulando há meses | 🟡 média | Rotacionar no corte. Guardar a nova antes de trocar — não há como ler a antiga. |
| **R8** | Backup do DEV carrega nome, telefone, CPF e endereço reais | 🟡 média | `backups/` fora do Git (já está). Não colar a saída do `d1 export` em lugar nenhum — ela traz link R2 público de 1 hora. |
| **R9** | Rodada `forcar: true` logo depois do corte | 🟡 média | Só seco (`{"seco": true}`) até o smoke test 6 passar. |
| **R10** | Service worker servindo painel antigo do cache | 🟢 baixa | O `sw.js` já rebaixa o HTML da rede a cada abertura; subir o número do `CACHE` no corte fecha a brecha. |
| **R11** | Publicação em produção sem portão de testes (GitHub Pages publica o que estiver em `main`) | 🟡 média | Consequência aceita de G8. Antes do merge: suíte verde + `git diff --ignore-cr-at-eol -- dashboard.html` vazio. Workflow de conferência em `main` fica no backlog. |

### Bugs e dívida herdada

Lista completa em [TECH_DEBT.md](TECH_DEBT.md). Os que tocam este plano:

- **1 — migrations aplicadas à mão, sem controle de versão.** É a causa direta
  de R4. Depois do go-live, adotar `wrangler d1 migrations` fica muito mais
  fácil: o banco novo nasce com um schema conhecido.
- **7 — segurança proporcional:** senha única em `localStorage`, sem log de
  auditoria (`movimentos` diz *o que* mudou, nunca *quem*), sem rate limiting.
  O primeiro a virar problema real é o log, no dia em que mais de uma pessoa
  usar o painel — e esse dia é o go-live.
- **9 — `comissao.js` sem teste próprio**, sendo o arquivo que decide quanto
  uma revendedora recebe.
- **11 — `listarTudo` da Nuvemshop tem teto de 40 páginas (8.000 registros)**,
  e o excedente é ignorado **em silêncio**. A loja tem ~600 produtos; sobra
  margem, mas o silêncio é o problema.
- **13 — `saude-sync-test` depende do relógio de segundo do SQLite.** Falha
  isolada nessa linha específica é oscilação, não regressão.

---

## 17. Decisões de arquitetura

Decisões anteriores continuam válidas e estão registradas em
[../api/REGRAS.md](../api/REGRAS.md) (as 8 regras + as divergências
conscientes) e em [decisions/](decisions/). Registradas **nesta rodada**:

| # | Decisão | Data | Motivo |
|---|---|---|---|
| G1 | **O go-live promove o DEV, não o contrário.** O ambiente chamado "produção" tem código e dados velhos; o chamado "DEV" tem a operação real. | 2026-08-22 | O nome dos ambientes não corresponde ao uso. Copiar produção por cima do DEV destruiria a operação. |
| G2 | **Banco de produção NOVO (`marquesa-db-prod`), em vez de sobrescrever `marquesa-db`.** | 2026-08-22 | Nenhuma escrita destrutiva em produção. Rollback vira uma linha no `wrangler.toml`. É o que o próprio BACKUP_RECOVERY.md recomenda. |
| G3 | **A separação de ambientes é preservada.** Produção nunca aponta para `marquesa-db-dev`. | 2026-08-22 | Apontar produção para o banco do laboratório tiraria a liberdade de quebrar o DEV — que é a razão de ele existir. |
| G4 | **O corte tem trava técnica, não só combinado.** Rotação da `API_KEY` do staging no instante do corte. | 2026-08-22 | "Não usar mais o DEV" depende de alguém lembrar. `401` não depende. |
| G5 | **Venda histórica não movimenta estoque.** `origem='historico'`, sem `movimentar()`. | 2026-08-22 | O estoque atual já incorpora essas vendas. Ver seção 9. |
| G6 | **Fase 0 antes de tudo: desligar o cron de produção.** | 2026-08-22 | É a única coisa no sistema que age sozinha sobre a loja real com dados errados. |
| G7 | **O DEV não é resetado no dia do corte.** | 2026-08-22 | Enquanto a produção nova não estiver validada, o `marquesa-db-dev` é a terceira cópia dos dados. |
| G8 | **O frontend de produção continua no GitHub Pages atual.** Nenhum Pages novo de produção. `marquesa-dev.pages.dev` fica exclusivamente DEV. | 2026-08-22 | O endereço da cliente não muda, `ORIGENS_PERMITIDAS` já está correto, e o corte ganha uma peça móvel a menos. Supera a decisão oposta tomada horas antes na mesma rodada. |
| G9 | **O cron de produção é desarmado no `wrangler.toml`, não só no painel.** | 2026-08-22 | O `wrangler deploy` reescreve os triggers a partir do arquivo. Desligar só pelo painel faria o deploy do próprio corte rearmar o cron em silêncio. |

Nenhuma decisão de arquitetura em aberto no momento. A de 7.4 foi fechada em
2026-08-22 (G8).

---

## 18. Backlog pós-go-live  ⬜

Nada aqui é para ser implementado antes de a produção estar estável. Ordem =
prioridade acordada.

### 1 — Vendas: excluir (lixeira) ≠ cancelar (estornar)

A tela atual foi aprovada pela cliente e **seu conceito é preservado**. O que
falta é separar duas operações que hoje são uma só.

**Excluir / lixeira** — lançamento feito por engano. Some da interface, e o
sistema desfaz corretamente os efeitos operacionais: vendeu 1 por engano →
estoque caiu 1 → excluiu → estoque volta 1. Mantém log/auditoria interna.

**Cancelar / estornar** — a venda aconteceu de verdade e depois houve
devolução, garantia, peça defeituosa sem reparo, ou estorno à cliente. A venda
**continua no histórico** marcada como cancelada/estornada.

Nos dois casos, o destino físico da peça precisa ser declarado:
voltou ao estoque vendável · foi para garantia · perda/defeito · outro.
**Nunca devolver automaticamente uma peça defeituosa ao estoque disponível
sem saber o destino.**

> O `cancelarVenda` de hoje faz metade disso: cria o movimento inverso e marca
> `cancelada = 1`, mas devolve tudo ao estoque vendável sem perguntar o
> destino, e não distingue engano de estorno.

### 2 — Clientes / CRM

Nova área **Vendas → Clientes**, alimentada por vendas futuras **e** pela
planilha histórica (respeitando a regra da seção 9).

Indicadores: total de clientes · ativos · novos · melhores · quem mais gastou ·
quem mais comprou · frequência · última compra · sem comprar há muito tempo ·
para reativação · ticket médio · gasto médio · produto mais vendido ·
categoria mais vendida · faturamento por produto · aniversariantes.

Perfil individual: nome · telefone · e-mail · aniversário · nº de compras ·
total gasto · ticket médio · última compra · histórico · produtos favoritos.

Avaliar depois: classificação RFM (VIP · recorrente · nova · em risco ·
inativa).

### 3 — Estoque: redesign da tabela

Remover o modal grande de edição. Editar direto na tabela: **nome**,
**categoria**, **estoque total**, **valor unitário**.

- **Nome do produto ≠ descrição SEO da Nuvemshop.** A descrição comercial é
  produzida depois, no fluxo de publicação.
- **Categoria** selecionável na própria linha, com `+ Criar nova categoria`.
- **Variações** saem do modal geral e ganham ação dedicada: `+ Variação` /
  `Variações (X)`.
- **Foto**: clicar troca/adiciona.
- **Código/SKU não é editável** — é a identidade da peça.
- **Valor total** calculado: `estoque × valor unitário`.

### 4 — Revendedoras: uma página só

Incorporar "Todas as revendedoras" dentro da própria "Visão Geral". Eliminar as
duas páginas separadas.

### 5 — Nuvemshop: dashboard de saúde da loja

A aba deixa de ser uma tabela com centenas de produtos corretos ocupando a
tela. Vira indicadores: produtos publicados · divergências de estoque ·
produtos faltando subir · problemas de cadastro · valor parado · variações ·
última sincronização · alterações desde a última sincronização.

Produto que está normal não precisa aparecer.

### 6 — Pendências: central de ação / resolução

Tudo que exige intervenção humana vai para lá: falta foto · falta preço ·
falta categoria · falta cadastro · falta subir · estoque divergente · produto
oculto · variação incompleta · erro da Nuvemshop.

Cada item responde **"o que falta para ficar pronto?"**:

```
540490 — Colar Gota Incolor
Faltam:  ▢ Foto   ▢ Preço
→ depois de preencher:  ✓ Pronto para publicar
```

Seleção em lote e, depois, `Publicar na Nuvemshop`.

### 7 — Fotos em lote

Importar uma pasta de fotos cujos arquivos trazem o código no nome
(`540490.jpg`, `540489.png`, `220706.webp`). O fluxo: ler código → localizar
SKU → associar → **preview** → mostrar erros → **pedir confirmação** → só então
salvar.

Indicadores: fotos encontradas · correspondências · códigos inexistentes ·
duplicados · arquivos inválidos.

Convenção para várias imagens da mesma peça: `540490_1.jpg`, `540490_2.jpg`,
`540490_3.jpg`.

### 8 — Agente de imagens

Ver seção 15. **Não implementar agora.**

### 9 — Venda de balcão → somente estoque na Nuvemshop  ✅

Decisão operacional tomada em 2026-08-26: não criar pedido para venda local.

1. Marquesa registra a venda e reduz o estoque físico;
2. o Worker calcula `em casa = total − consignado`;
3. publica esse saldo absoluto por `variant_id` em `/products/stock-price`;
4. retry publica o mesmo número e não desconta duas vezes;
5. adicionar itens à maleta baixa o online imediatamente;
6. acerto não baixa novamente e as devolvidas aumentam o online, mesmo sem venda;
7. cancelar venda ou maleta faz o movimento inverso e republica o saldo aumentado.

As funções de criar/cancelar pedido foram removidas do caminho ativo. A API
de pedidos permanece somente para a futura leitura de vendas feitas no site.
`vendas.externo_id` e a compatibilidade com pedidos antigos continuam no
banco para impedir duplicidade se existir algum registro legado.

---

## 19. Próximos passos  🟡

**Ordem estrita. Cada passo termina numa verificação.**

| # | Passo | Estado | Precisa de |
|---|---|---|---|
| 0 | Auditoria e este documento | ✅ | — |
| 1 | Fase 0 **(a)** — `crons = []` no `wrangler.toml` | ✅ | — |
| 2 | Fase 0 **(b)** — remover a agenda do cron na Cloudflare | ✅ | feito no painel em 2026-08-22 |
| 3 | Confirmar: nenhuma linha nova em `sync_execucoes` | ✅ | ver prova abaixo |
| 4 | Decisão 7.4 — frontend de produção | ✅ | GitHub Pages atual (G8) |
| 5 | Credencial Cloudflare acessível à sessão | ✅ | OAuth do Wrangler na máquina do Gustavo |
| 6 | Fase 1 — `npm run inventario:golive` (somente leitura) | ✅ | inclui `--alvos prod-nova` |
| 7 | Fase 2 — export do DEV congelado, validado | ✅ | ledger fecha dentro do dump |
| 7b | Fase 2 — export do `marquesa-db-prod` e do `marquesa-db` | ⬜ | **comando humano** — o hook nega `d1 export` em produção |
| 8 | Relatório de leitura + backup + diff, e **parada para decisão** | ✅ | 2026-08-23 |
| 9 | Decidir o destino das vendas que existirem só em produção | ✅ | promovido o estado do DEV; 10 vendas válidas, 0 canceladas |
| 10 | Combinar o horário do corte com a Sthefany | ✅ | corte de 2026-08-22 |
| 11 | Fases 3 a 5 — congelar, promover dados, promover código | 🟡 | dados promovidos; **falta publicar o código** |
| 11b | Gravar `config.syncCorteEm` **antes** da primeira sincronização real | ⬜ | passo 11 |
| 12 | Fase 6 — smoke tests | ⬜ | passo 11 |
| 13 | Entregar o endereço à Sthefany (o mesmo de sempre) | ⬜ | passo 12 verde |
| 14 | Religar o cron, depois de uma rodada seca limpa | ⬜ | passo 13 |
| 15 | Uma semana de operação estável | ⬜ | — |
| 16 | Fase 7 — devolver o DEV ao papel de laboratório | ⬜ | **autorização humana** |
| 17 | Backlog, na ordem da seção 18 | ⬜ | passo 15 |

> **Prova de que o cron está desarmado (passo 3).** Em `marquesa-db`
> (produção antiga), `sync_execucoes` tem 27 linhas e as automáticas caem
> sempre às 09:00 e 21:00 UTC. A última é
> **`id 27 · 2026-08-22 09:00:00 · pausado`**. Não existe linha às 21:00 do
> dia 22 nem às 09:00 do dia 23 — as duas janelas já passaram. Em
> `marquesa-db-prod` as três linhas existentes são rodadas manuais
> (`seco = 1`), a última em `2026-08-22 22:28:43`. Nenhum cron rodou depois
> do desarme.

> **Passo 11b — por que ele existe.** `config.syncCorteEm` **não existe** em
> `marquesa-db-prod`, e `syncUltimoPedido` também não. Sem corte, a primeira
> sincronização real leria os 24 pedidos da loja desde o começo e criaria as
> **5 vendas antigas** que a rodada seca de 22/08 já simulou — baixando
> estoque de peça que já saiu por outro caminho. O índice único
> `vendas.externo_id` não protege contra isso: ele impede repetir, não
> importar pela primeira vez. Mecanismo e prova em
> [SYNC_ENGINE.md](SYNC_ENGINE.md) § `config.syncCorteEm` e em
> `api/REGRAS.md` § 4b.

> **Nota sobre a credencial (passo 5).** Esta sessão roda num container
> efêmero na nuvem, não na máquina de quem conduz o projeto: um
> `npx wrangler login` feito localmente **não** alcança esta sessão. Dois
> caminhos, os dois válidos:
>
> **(i) a pessoa roda, o agente lê.** `bash tools/inventario-golive.sh` na
> máquina local e o `RELATORIO.txt` é colado aqui. É o caminho mais
> conservador, e o que a política do projeto já prevê: `wrangler d1 execute
> --remote` contra `marquesa-db` está no `deny` do `.claude/settings.json`
> justamente para produção não ser lida nem escrita por um agente sozinho.
>
> **(ii) token de escopo mínimo** exposto a esta sessão como
> `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. Para a Fase 1 e a Fase 2
> bastam: **D1:Edit** (o `d1 export` precisa dele, apesar de ser leitura),
> **Workers R2 Storage:Read**, **Workers Scripts:Read** e **Account
> Settings:Read**. Nada de Zone, nada de DNS. Mesmo com o token, o `deny` do
> `settings.json` continua valendo — ele é o que garante que nenhuma escrita
> em produção passe por engano.

---

## 20. Vendas / CRM — rodada de 2026-08-27  🟡

### O que entrou

**Histórico de vendas.** `Vendas Marquesa.xlsx` (1.341 linhas, 05/04/2024 a
21/08/2026) tem importador completo: análise seca → relatório → decisão →
aplicar, idempotente por sha-256 do conteúdo, com reconciliação campo a campo
contra a fonte e reversão de lote. **Não movimenta estoque** — ver a regra em
`api/src/vendas-historico.js` e a prova em `src/vendas-historico-test.mjs`.

O histórico mora em `vendas_historico_itens`, não em `vendas`. A coluna `Nº`
numera LINHAS, não pedidos (uma cliente aparece com 36 linhas na mesma data,
que é acerto de maleta), então contagem de pedidos e ticket médio histórico
ficam **indisponíveis por construção**, com o motivo na própria resposta da
API. Quando existir regra de agrupamento validada, ela preenche
`pedido_chave` sem reescrever o que está preservado.

**Painel de Vendas e Clientes.** Três sub-abas — Lançamentos, Painel,
Clientes — com KPIs, evolução, rankings de produto/categoria/origem/cliente e
perfil individual. Clientes segue Revendedoras como referência de UX, e isso
é **verificado**: o teste compara o estilo computado dos dois cards.

**Segurança operacional.** `api/DEPLOY.md` mandava rodar
`wrangler d1 execute marquesa-db --remote` — que hoje escreve no banco
CONGELADO de rollback. Corrigido para o binding `DB`, e o hook de proteção
ganhou a regra que faltava: `d1` remoto sem `--env staging` é produção,
inclusive quando o comando não cita nome de banco nenhum.

### O que falta para o DEV ficar completo  ⬜ — **precisa de credencial**

O Pages publicou (`marquesa-dev.pages.dev`, commit `2caafb1`, CI verde). As
outras duas metades **não**, porque esta sessão não tem credencial Cloudflare
e `wrangler deploy` é Classe C (nunca executado por agente):

```bash
cd api

# 1. migration no D1 do DEV — aditiva, não reescreve nada
npx wrangler d1 execute DB --env staging --remote \
  --file=migracao-vendas-historico.sql

# 2. publicar o Worker do DEV
npx wrangler deploy --env staging
```

Enquanto isso não acontece, Painel e Clientes mostram um aviso dizendo que a
API deste ambiente ainda não foi atualizada. **Estoque, Revendedoras,
Lançamentos e Etiquetas seguem funcionando normalmente** — as rotas novas só
são chamadas por essas duas abas.

Conferir depois, com a chave do DEV:

```bash
curl -H "Authorization: Bearer <API_KEY do staging>" \
  https://marquesa-api-staging.marquesaasemijoias.workers.dev/api/analytics/vendas
```

### O que NÃO entrou nesta rodada  ⬜

A Prioridade B do pedido — reestruturar Nuvemshop/Pendências/Fotos — **não
foi feita**. Segue pendente, com o desenho já descrito no pedido:

- `produto_imagens` (galeria inteira, papel semântico ≠ posição na galeria);
- nunca classificar `imagem[0]` como "original" por posição;
- "Subir para Nuvemshop" como pipeline (cadastro → fotos → tratamento → SEO →
  revisão → publicação);
- upload de fotos em massa por SKU no nome do arquivo;
- Pendências como central de resolução guiada;
- pontos de extensão para os agentes de imagem e de SEO.

Nada disso foi iniciado — não há código pela metade a limpar.

---

## Anexo — o que foi verificado nesta auditoria, e como

Somente leitura. Nenhum dado foi alterado, nenhuma credencial foi usada,
nenhuma chamada saiu para a Nuvemshop.

| Verificação | Método |
|---|---|
| Estrutura de código, API, schema, migrations | leitura dos arquivos em `main` e `origin/develop` |
| Ambientes, bindings, cron, CORS, travas | `api/wrangler.toml` (blocos de produção e `[env.staging]`) |
| Deploy do DEV | `.github/workflows/deploy-dev.yml` |
| `main` × `develop` | `git merge-base --is-ancestor` (main é ancestral) + `git diff --stat` (221 arquivos, 47 commits) |
| Produção no ar e desatualizada | `curl` do `dashboard.html` do GitHub Pages, md5 idêntico ao do `main` |
| DEV no ar e à frente | `curl` do `dashboard.html` de `marquesa-dev.pages.dev` (709 KB, abas `pendencias`/`cadastro`/`etiquetas`/`revgeral`/`revlist`) |
| Os dois Workers no ar e protegidos | `GET /api/health` → 200 · `GET /api/state` sem chave → 401, nos dois |
| Ausência de proxy de API no Pages | `GET marquesa-dev.pages.dev/api/health` devolve HTML (fallback SPA), não JSON |
| Contagens dos bancos, Secrets, R2, `sync_execucoes` | **não verificado** — sem credencial Cloudflare nesta sessão |
