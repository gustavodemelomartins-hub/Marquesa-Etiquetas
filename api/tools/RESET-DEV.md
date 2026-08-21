# Reset do DEV para o teste de importação da Sthefany

Deixar `marquesa-db-dev` com **as revendedoras intactas** e **o estoque
vazio**, para a planilha real entrar pela tela, no fluxo de verdade da
aplicação.

| | Produção — **não tocar** | DEV — o alvo |
|---|---|---|
| Worker | `marquesa-api` | `marquesa-api-staging` |
| D1 | `marquesa-db` · `089153a9-…` | `marquesa-db-dev` · `dcc36f65-…` |
| R2 | `marquesa-fotos` | `marquesa-fotos-dev` |
| `NUVEMSHOP_WRITES_ENABLED` | `"true"` | `"false"` |

Nada aqui dropa tabela, apaga schema, remove migration, mexe em Secret,
altera o `wrangler.toml` ou apaga um byte no R2.

---

## O achado que muda o roteiro da Sthefany

**"Atualizar Estoque Total" não cadastra produto novo.** Sobre um catálogo
vazio ela não tem o que aplicar: `analisarPlanilhaEstoqueTotal` compara a
planilha com o que já existe, e o que não existe sai como `naoEncontrados`.
Quem cria produto é **"Adicionar Peças Novas"**. A própria tela diz isso
(`ResumoSessao.tsx`: *"Esta tela não cadastra produto novo. Use Adicionar
Peças Novas para isso."*).

Verificado contra o Worker rodando, com o catálogo zerado e uma planilha de
3 códigos:

```
Atualizar Estoque Total → total: 0 · novos: 3 · naoEncontrados: [120029, 120030, 120031]
                          nenhum item para aplicar

Adicionar Peças Novas   → sessão 'revisao' com 3 itens (2 trivial, 1 confere)
                          aprovar + aplicar → status 'aplicada'
                          produtos: 120040 qtd 4 · 120041 qtd 7 · 120042 qtd 2 sem preço
                          /api/estoque/conferir → ok:true, 0 divergências
```

Então o roteiro dela, num DEV zerado, é **de trás para frente do que o
pedido supunha**:

1. **Estoque → Adicionar Peças Novas** · sobe a planilha · revisa o que a
   tela marcou como `confere` (peça sem preço cai como "sem preço", §24, e
   categoria desconhecida cai em "Outros") · aplica. **É este passo que
   cria a base de estoque.**
2. **Estoque → Atualizar Estoque Total** · a mesma planilha · agora todos os
   códigos existem, e ela serve para o que foi feita: conferir e corrigir
   quantidade. Num catálogo recém-criado o normal é dar "0 alterações" —
   que já é a confirmação de que o passo 1 entrou certo.

Se o teste que interessa é especificamente o **botão "Importar estoque
total"** funcionando com dados, o DEV não pode ficar com o catálogo vazio:
teria que ficar com os produtos cadastrados e as quantidades desencontradas.
**Diga qual dos dois você quer** — muda o que o reset limpa (ver
"Variante B", no fim).

---

## Fase A — o mapa das 20 tabelas

Lido de `api/schema.sql` no commit atual, conferido contra `docs/DATA_MODEL.md`.
**As contagens reais faltam** — esta sessão não tem credencial Cloudflare
(`wrangler whoami` → *not authenticated*), então o DEV remoto não foi lido.
`tools/backup-dev.sh` produz essa coluna e a grava no `MANIFESTO.txt`.

### PRESERVAR

| Tabela | Por quê |
|---|---|
| **`revendedoras`** | A regra crítica. Nome, tel, cidade, CPF, endereço, obs, status, `criada_em` e os **ids**. Nenhum `DELETE`, nenhum `UPDATE`. É apontada por `maletas.rev_id` e `vendas.revendedora_id` — as duas são limpas, mas apagar quem **aponta** para a revendedora nunca apaga a revendedora. |
| `categorias` | Não é dado, é configuração (§4), e é **pré-requisito da importação**: `produtos.cat` tem FK para cá. Limpar faria toda linha da planilha ser recusada. |
| `config` | `prazoDias`, `prataPct`, `faixas`, `inventarioDias` e os dois freios (`syncLimiteMudancas`, `syncLimiteZerar`). Três chaves de estado do robô saem — ver AVALIAR. |

### LIMPAR — nesta ordem

O D1 força as chaves estrangeiras em toda query e não aceita
`PRAGMA foreign_keys`: filho antes de pai é obrigação, não estética.

| # | Tabela | Por quê | FK que obriga a ordem |
|---|---|---|---|
| 1 | `inventario_itens` | Contagem física de um estoque que vai deixar de existir | → `inventarios`, `produtos` |
| 2 | `inventarios` | Idem | |
| 3 | `venda_itens` | Cada item cita um SKU que vai sumir | → `vendas`, `produtos` |
| 4 | `vendas` | Vendas de teste (balcão, acerto e site) | → `clientes`, `revendedoras`, `maletas` |
| 5 | `maleta_itens` | O vínculo peça↔maleta | → `maletas`, `produtos` |
| 6 | `maletas` | O vínculo revendedora↔peça. **A revendedora fica** | → `revendedoras` |
| 7 | `kit_componentes` | Kits montados sobre SKUs que vão sumir | → `produtos` (duas vezes) |
| 8 | `produto_variacoes` | A sincronização reescreve do zero a cada rodada — a loja é a fonte | → `produtos` |
| 9 | `movimentos` | A razão do estoque (§19) | → `produtos` **e** → `reconciliacao_itens` |
| 10 | `reconciliacao_itens` | Itens de sessões de análise sobre peças que somem | → `reconciliacao_sessoes` |
| 11 | `reconciliacao_sessoes` | As sessões em si | |
| 12 | `produtos` | O catálogo. **É o que a planilha vai recriar** | → `categorias` |
| 13 | `produtos_pendentes` | Fila de peças novas de uma importação anterior | — |
| 14 | `fotos_orfas` | Fotos da loja sem par entre os SKUs que somem | — |
| 15 | `loja_snapshot` | Cache "380 casados de 400". Sem catálogo, mente | — |
| 16 | `sync_execucoes` | Histórico das rodadas do robô | — |
| 17 | `clientes` | Nomes inventados pelos testes. **Sem FK para produto** | — |

> **`movimentos` vem antes de `reconciliacao_itens`, e isso é novo.** Desde
> a migration de idempotência, `movimentos.reconciliacao_item_id` referencia
> `reconciliacao_itens(id)`. Apagar o item antes do movimento seria recusado
> pela FK. Foi a única ordem que mudou em relação ao schema antigo.

### AVALIAR — decisões que precisam da sua palavra

**`maletas` + `maleta_itens`.** É a tabela que mistura revendedora e
produto. A FK para `produtos` obriga a limpar os itens, e maleta sem itens
é casca. Você já autorizou (*"podem ser apagadas se forem apenas histórico
operacional do DEV"*) — **e é preciso confirmar essa premissa com a
contagem real**: se aparecer maleta `aberta` ou `em_acerto`, ela não é
histórico, é consignação viva, e apagá-la faria peça que está fisicamente
com alguém sumir do sistema. O `MANIFESTO.txt` traz a contagem por status.

**As três chaves de estado do robô em `config`:** `syncUltimoPedido` (até
que pedido da loja já li), `syncUltimoEstoque` (quando o último empurrão
foi aplicado) e `lojaVariacoes` (códigos que a rodada decidiu não empurrar).
Todas descrevem um estoque que não existe mais. Apagar faz a próxima rodada
recomeçar a leitura — **não desconecta a loja, não mexe em token, não
libera escrita**. Os freios e os parâmetros de negócio ficam.

**`clientes`.** Sem FK para produto, então poderia ficar. Vai junto porque
em DEV são nomes de teste. Se algum for real, comente a linha.

**Revendedoras com prefixo `DEV-`.** `docs/DEVELOPMENT.md` diz que
`marquesa-db-dev` *"não recebe cópia de dado real — nunca"*, e que a semente
usa prefixo `DEV-`. Se as revendedoras do DEV forem todas `DEV-…`, preservá-las
é trivial e não há dado pessoal em jogo. Se **não** tiverem o prefixo, é
cadastro real dentro do DEV — o backup passa a carregar nome, telefone, CPF
e endereço, e vira dado pessoal para todos os efeitos. `validar-backup.sh`
conta os dois grupos e avisa.

---

## Fotos — o que acontece e o que não acontece

**Nenhum byte do R2 é apagado.** `reset-dev.sql` não tem uma linha que
alcance o bucket; só o Worker fala com o R2, e só por
`fotos-storage.js › apagarFoto`, que este reset não chama.

O que o reset apaga é a **referência**: as colunas `foto_original_key`,
`foto_tratada_key`, `foto_status`, `foto_url` e as irmãs vivem na linha de
`produtos`, e a linha some.

Isso é recuperável por construção. `chaveFoto` monta a chave de forma
**determinística**, sem timestamp e sem extensão:

```
produtos/<sku>/original
produtos/<sku>/tratada
```

Então, depois que a Sthefany recriar os mesmos SKUs, os objetos continuam
exatamente onde os produtos vão procurá-los — só falta reescrever a coluna.
Ainda assim o backup guarda `fotos-manifesto.json` com o mapa de antes:
quais SKUs realmente tinham objeto, de que tipo, com que tamanho e em que
estado. É barato e é a diferença entre "sei de quem era" e "vou adivinhar".

**Fica um resíduo, e é honesto dizer:** objeto no R2 de um SKU que a
planilha nova não trouxer não é referenciado por ninguém, e o bucket não
tem como saber disso. Não custa quase nada (são imagens de teste) e
**limpar isso não está neste plano** — precisa de aprovação explícita sua,
como você pediu. O `fotos-manifesto.json` é justamente a lista para decidir
depois, com calma.

---

## Nuvemshop — o que o reset não alcança

**Os Secrets não estão no banco.** `NUVEMSHOP_TOKEN`, `NUVEMSHOP_STORE_ID`,
`NUVEMSHOP_CLIENT_ID` e `NUVEMSHOP_CLIENT_SECRET` são Secrets do Worker
`marquesa-api-staging`. Um `DELETE` no D1 não alcança um Secret. A prova é
`sync.conectada` em `/api/state`, que sai de os Secrets existirem — o
script de checagem confere.

**`NUVEMSHOP_WRITES_ENABLED=false` também não está no banco.** Mora em
`[env.staging.vars]` no `wrangler.toml`, versionado. O reset não toca nesse
arquivo.

A trava foi testada direto no cliente (`nuvemshop.js › chamar`), que é o
único ponto por onde toda chamada externa passa:

| `NUVEMSHOP_WRITES_ENABLED` | POST/PUT/PATCH/DELETE | GET |
|---|---|---|
| `"false"` (staging) | **bloqueado antes do fetch** | livre |
| ausente | **bloqueado** | livre |
| `"TRUE"` | **bloqueado** | livre |
| `"1"` | **bloqueado** | livre |
| `"true"` (produção) | liberado | livre |

Fail-closed confirmado: só a string exata `"true"` libera, e `GET` nunca é
afetado.

**O que o reset zera, e por quê:** `sync_execucoes` (histórico das rodadas)
e `loja_snapshot` (o retrato "380 de 400"). Descrevem um estoque que não
existe mais. Efeito visível: a aba Nuvemshop passa a dizer "nunca
sincronizou". A conexão continua de pé. **Staging não tem cron**
(`[env.staging.triggers] crons = []`), então nada roda sozinho de
madrugada — outra diferença importante em relação a produção.

---

## Fase A — o backup

```bash
cd api
npm install
npx wrangler login          # ou CLOUDFLARE_API_TOKEN com D1 no ambiente
bash tools/backup-dev.sh
```

O script **prova o alvo antes de qualquer outra coisa**: lê o uuid de
`marquesa-db-dev` e aborta se vier `089153a9-…` (produção) ou qualquer
coisa diferente de `dcc36f65-…`. Não existe backup "provavelmente do DEV".

Depois disso, em `backups/d1/<carimbo>_pre-reset-sthefany/`:

- `marquesa-db-dev.sql` — o dump inteiro
- `marquesa-db-dev.sql.sha256`
- `fotos-manifesto.json` — o mapa D1 → R2
- `MANIFESTO.txt` — banco de origem e uuid, ambiente, hora UTC e local,
  commit, branch, versão do wrangler, tamanho, contagem de `CREATE TABLE` e
  `INSERT`, SHA-256, bookmark do Time Travel com validade, contagem por
  tabela, contagem de revendedoras e o procedimento de restauração

O bookmark do **Time Travel** é capturado antes do dump: é um ponto de
retorno do lado da Cloudflare, válido 30 dias, que não depende de arquivo
nenhum. É o caminho de restauração preferido.

> ⚠️ O `wrangler d1 export` imprime um **link temporário do R2 (1 hora) que
> dá acesso ao dump inteiro sem autenticação**. Não cole a saída do comando
> em lugar nenhum — ver `docs/BACKUP_RECOVERY.md`.

Nenhum Secret é lido ou gravado. `backups/` já é ignorado pelo Git.

## Fase A — validar o backup

```bash
bash tools/validar-backup.sh ../backups/d1/<carimbo>_pre-reset-sthefany/marquesa-db-dev.sql
```

Um comando que terminou sem erro não é prova de backup bom. Este **restaura
o dump de verdade**, num SQLite descartável em memória, e confere:

- existe, não está vazio, **termina em `;`** (não truncado no meio de um `INSERT`)
- bate com o `.sha256`
- carrega sem erro num banco limpo
- traz as **20 tabelas** do schema atual — e diz explicitamente quando só
  faltam as `reconciliacao_*`, porque aí o achado é "o DEV está sem as
  migrations do motor", não "o backup está ruim"
- tem revendedoras de verdade, e separa quantas têm prefixo `DEV-`
- **a razão contábil fecha** (`produtos.qtd == SUM(movimentos.qtd)`) — a
  prova que importa neste sistema
- zero órfãos em `movimentos`, `venda_itens` e `maleta_itens`
- `COUNT(externo_id) == COUNT(DISTINCT externo_id)` — a idempotência dos
  pedidos do site, no dado real
- `PRAGMA foreign_key_check` limpo

O DEV remoto não é tocado em momento nenhum.

---

## Fase B — o reset (só depois da sua aprovação)

`DELETE` em massa é **Classe C** em `docs/SECURITY.md`: exige autorização
humana explícita. É por isso que esta parte espera.

```bash
cd api
npx wrangler d1 info marquesa-db-dev                                          # confira dcc36f65-…
npx wrangler d1 execute marquesa-db-dev --env staging --remote --file=tools/tabelas.sql
npx wrangler d1 execute marquesa-db-dev --env staging --remote --file=tools/revendedoras-antes-depois.sql
npx wrangler d1 execute marquesa-db-dev --env staging --remote --file=tools/reset-dev.sql
npx wrangler d1 execute marquesa-db-dev --env staging --remote --file=tools/revendedoras-antes-depois.sql
```

As duas saídas de `revendedoras-antes-depois.sql` têm que ser **idênticas**
nas três colunas: contagem, soma dos ids e impressão digital do cadastro. A
contagem sozinha não bastaria — a soma dos ids pega uma troca de linha que
mantivesse o total, e a impressão digital pega uma edição que mantivesse
contagem e ids.

## Fase B — conferir

```bash
API_URL=https://marquesa-api-staging.marquesaasemijoias.workers.dev \
API_KEY=<a chave do staging> \
REV_ESPERADAS=<o número do MANIFESTO.txt> \
node tools/checar-pos-reset.mjs
```

Confere pela API, do jeito que a tela enxerga. O script **recusa rodar
contra uma URL que não seja staging ou localhost**. Só faz `GET`.

Cobre: `/api/health`; 401 sem chave; `/api/state` 200 com todas as chaves
que a tela lê; catálogo vazio; nenhum saldo; nenhuma maleta; nenhum
inventário aberto; fila de peças novas vazia; nenhuma foto órfã;
revendedoras listadas e em número idêntico; categorias e configurações
preservadas; **loja ainda conectada**; histórico de sync zerado; razão do
estoque fechando (§19).

---

## Plano de restauração — "restaura o DEV para antes do reset"

### Caminho 1 — Time Travel (preferido)

```bash
cd api
npx wrangler d1 time-travel restore marquesa-db-dev --bookmark='<o bookmark do MANIFESTO.txt>'
```

Volta o banco inteiro ao instante do checkpoint, sem depender de arquivo.
Vale 30 dias. Se o bookmark se perder, um timestamp resolve:

```bash
npx wrangler d1 time-travel restore marquesa-db-dev --timestamp=2026-08-21T12:00:00Z
```

### Caminho 2 — a partir do arquivo

```bash
cd api
bash tools/restaurar-backup.sh ../backups/d1/<carimbo>_pre-reset-sthefany/marquesa-db-dev.sql
```

Prova o alvo (uuid `dcc36f65-…`), valida o arquivo, **exporta o estado
atual antes de substituí-lo** (um restore sobre dado ruim ainda é uma perda
se ninguém guardou o ruim), pede `RESTAURAR` digitado por extenso, remove as
tabelas e as recria a partir do dump.

As tabelas precisam sair antes porque o `wrangler d1 export` grava
`CREATE TABLE` **sem** `IF NOT EXISTS` — aplicado sobre um banco que ainda
as tem, o arquivo falha na primeira linha. Quem repõe tudo (schema, índices
e linhas) é o próprio dump.

Nos dois caminhos, o critério de aceitação é o mesmo: as contagens batendo
com o `MANIFESTO.txt` e `divergentes = 0` na razão contábil.

> Restore é **Classe C**. Nunca é executado por um agente. Só quando uma
> pessoa diz, naquele momento, que quer restaurar aquele banco a partir
> daquele arquivo.

---

## Variante B — se o teste for do botão "Importar estoque total"

Neste caso o DEV **não** deve ficar com o catálogo vazio, e o reset muda:
`produtos` e `movimentos` ficam (com os SKUs que a planilha vai conferir), e
some só o resto do operacional. A partir daí "Atualizar Estoque Total" tem o
que comparar e a tela mostra diff de verdade.

Não escrevi esse SQL porque ele depende de uma decisão sua que ainda não
foi tomada — **quais SKUs sobrevivem**, e a partir de qual origem. Diga o
que prefere e eu monto.

---

## Como este plano foi verificado

Sem credencial Cloudflare, tudo o que dava para provar foi provado num
Worker `--env staging` rodando local, com o schema atual (20 tabelas) e um
DEV falso completo: 3 revendedoras, 4 produtos (um com foto no R2, um só
com URL da loja), kit, variações, 2 maletas, venda de acerto, inventário,
sessão de reconciliação com item ligado a um movimento, peça pendente,
foto órfã, snapshot, sync e 9 chaves de config.

- `reset-dev.sql` roda com as FKs **ligadas**, sem violação, e
  `PRAGMA foreign_key_check` fica limpo — a ordem de deleção está certa,
  inclusive `movimentos` antes de `reconciliacao_itens`
- as revendedoras saem **idênticas** nas três colunas da impressão digital
- `categorias` e os parâmetros de `config` intactos; saem só as três chaves
  de estado do robô
- `/api/state` responde 200 depois do reset, com todas as chaves da tela
- `/api/produtos/pendentes` e `/api/fotos/orfas` voltam vazios
- **"Atualizar Estoque Total" sobre catálogo vazio: 0 itens para aplicar**
- **"Adicionar Peças Novas" sobre catálogo vazio: cria os 3 produtos, com
  quantidade certa, sem preço virando `NULL` (§24), e a razão fecha**
- a trava da Nuvemshop é fail-closed nos 5 cenários da tabela acima
- `validar-backup.sh` foi testado contra um dump **real** do
  `wrangler d1 export` do schema atual, e recusa arquivo vazio, truncado,
  sem revendedoras ou com tabela faltando

O que **não** foi verificado, e só o acesso ao DEV resolve: as contagens
reais, se há maleta `aberta`/`em_acerto` lá dentro, se as revendedoras têm
prefixo `DEV-`, e se as migrations do motor de reconciliação já foram
aplicadas em `marquesa-db-dev`.
