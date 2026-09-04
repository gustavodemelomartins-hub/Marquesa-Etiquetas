# Backup e recuperação

## ⚠️ Qual banco é produção

Desde o corte de **2026-08-22**, produção é **`marquesa-db-prod`**
(`51dd629b-52dc-46d0-a1af-fa37f0a79533`). O `marquesa-db` antigo
(`089153a9-…`) virou a **cópia congelada de rollback** e não é alvo de nada.

Por isso **todo comando aqui endereça o banco pelo binding `DB`**, que o
`api/wrangler.toml` resolve: sem `--env` → produção; `--env staging` →
`marquesa-db-dev`. Digitar o nome de memória não erra o ambiente — acerta o
banco que jamais deveria ser tocado.

> **Último backup conferido do banco ANTIGO — 2026-08-18 06:22.**
> `backups/d1/2026-08-18_06-22/marquesa-db.sql` · 720.922 bytes · 16 tabelas
> · 2.583 `INSERT`. Restaurado num banco limpo local e validado: **a razão
> contábil fecha (0 divergências)**, zero registros órfãos, idempotência dos
> pedidos intacta. Detalhes e contagens no `MANIFESTO.txt` ao lado do
> arquivo.
> Este arquivo é do `marquesa-db`, quando ele ainda era produção. **Não é
> backup da produção atual**, e não existe backup da produção atual até
> alguém rodar o export da seção 1.

Ambiente conferido: Wrangler **4.123.0**, Node v24.19.0, Windows 10.
Todos os comandos abaixo foram verificados contra o `--help` desta versão e
**executados de verdade**. Nenhum comando aqui é inventado.

> **Onde ficam as credenciais do Wrangler nesta máquina:**
> `%APPDATA%\xdg.config\.wrangler\config\default.toml` — **não** em
> `~/.wrangler`. Procurar no lugar errado faz parecer que não há sessão
> autenticada quando há. Confira sempre com `npx wrangler whoami`.

## O que estamos protegendo

| Recurso | Valor | Onde |
|---|---|---|
| Banco `marquesa-db-prod` (D1) | Estoque, movimentos, vendas, maletas, revendedoras, inventários, histórico | Cloudflare, `51dd629b-52dc-46d0-a1af-fa37f0a79533` — binding `DB` em [api/wrangler.toml](../api/wrangler.toml) |
| Código | Este repositório | Git local + GitHub |
| Secrets | `API_KEY`, `NUVEMSHOP_*` | Cloudflare Secrets. **Não têm backup e não são legíveis** — se perder, é rotação, não recuperação |

| Banco | Nome | `database_id` | Papel |
|---|---|---|---|
| Produção | `marquesa-db-prod` | `51dd629b-52dc-46d0-a1af-fa37f0a79533` | binding `DB` **sem** `--env` |
| DEV | `marquesa-db-dev` | `dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b` | binding `DB` com `--env staging` |
| Rollback congelado | `marquesa-db` | `089153a9-cee5-4887-b789-a23b1cf419f5` | **nunca é alvo de nada** |

---

# Backup

## 1. Export do D1 (o backup de verdade)

```bash
cd api
npx wrangler d1 export DB --remote \
  --output ../backups/d1/2026-09-04_07-35/producao-51dd629b-2026-09-04.sql
```

**Pelo binding `DB`, nunca pelo nome.** Digitar `marquesa-db` exporta a cópia
congelada de rollback: o comando termina com sucesso, o arquivo nasce com
tamanho plausível, e você fica sem backup da produção sem nenhum sinal de
que algo deu errado.

Duas observações sobre o nome do arquivo:

- não escreva `marquesa-db` no caminho de saída. O hook
  `.claude/hooks/protect-production.mjs` casa esse texto **em qualquer
  posição do comando**, inclusive no `--output`, e recusa a linha inteira;
- ponha o `database_id` no nome. Seis meses depois, `producao-51dd629b-…`
  responde sozinho de qual banco o dump saiu; `marquesa-db.sql` não.

Só leitura. Não altera nada no banco. Três coisas aprendidas rodando isto
de verdade:

- o comando avisa que o banco fica **indisponível para consultas** enquanto
  exporta. Com 639 kB levou segundos, mas prefira fora do horário de venda;
- em contexto **não interativo** o wrangler responde "yes" sozinho à
  confirmação. Inofensivo no export — e a razão de restore e escrita remota
  estarem no `deny` do `.claude/settings.json`, onde o mesmo comportamento
  seria destrutivo;
- ele imprime um **link temporário do R2** (1 hora de validade) que dá
  acesso ao dump inteiro sem autenticação. Não cole a saída do comando em
  lugar nenhum.

Opções úteis desta versão:

| Flag | Efeito |
|---|---|
| `--remote` | Exporta o banco de produção (**sempre use em backup**) |
| `--local` | Exporta o SQLite local de `api/.wrangler` |
| `--output` | Caminho do arquivo `.sql` (obrigatório) |
| `--no-data` | Só o schema |
| `--no-schema` | Só os dados |
| `--table` | Restringe a tabelas específicas |

## 2. Convenção de nomes

```
backups/
  d1/
    2026-09-04_07-35/
      producao-51dd629b-2026-09-04.sql         <- export completo (schema + dados)
      producao-51dd629b-2026-09-04.schema.sql  <- opcional: --no-data, para ver o que mudou
      MANIFESTO.txt                            <- data, wrangler, contagens, tamanho, bookmark
```

Pasta por `YYYY-MM-DD_HH-mm` em **horário local**. Ordena sozinha e nunca
sobrescreve. `backups/` é ignorado pelo Git de propósito: contém nomes de
clientes, revendedoras, preços e estoque, e este repositório é público.

## 3. Conferir que o arquivo presta

Um backup nunca conferido não é um backup. Três checagens, da mais barata
para a mais cara:

**a) Não está vazio nem truncado**

```bash
DUMP=backups/d1/2026-09-04_07-35/producao-51dd629b-2026-09-04.sql
ls -l "$DUMP"
grep -c "INSERT INTO"  "$DUMP"
grep -c "CREATE TABLE" "$DUMP"   # produção tem 29 tabelas em 2026-09-04
tail -5 "$DUMP"                  # termina em ';', não no meio
```

As 16 tabelas esperadas estão em [DATA_MODEL.md](DATA_MODEL.md).

**b) O SQL carrega num banco limpo** — ver "Restaurar em ambiente de teste".

**c) A razão fecha** — a prova que importa neste sistema:

```sql
SELECT p.sku, p.qtd, COALESCE(m.soma, 0) AS soma
  FROM produtos p
  LEFT JOIN (SELECT sku, SUM(qtd) AS soma FROM movimentos GROUP BY sku) m
    ON m.sku = p.sku
 WHERE p.qtd <> COALESCE(m.soma, 0);
```

Zero linhas = o backup preserva `produtos.qtd == SUM(movimentos.qtd)`.
É a mesma prova que `GET /api/estoque/conferir` faz no ar.

**Registre no `MANIFESTO.txt`**: data, versão do Wrangler, tamanho do
arquivo, contagem de `CREATE TABLE` e de `INSERT`, o bookmark de Time Travel
e o resultado da checagem (c). Use
`backups/d1/2026-08-18_06-22/MANIFESTO.txt` como modelo — ele é de um backup
real, já conferido.

Vale acrescentar duas checagens baratas que pegaram valor no primeiro
backup: registros órfãos (`movimentos`, `venda_itens`, `maleta_itens` sem
pai) e `COUNT(externo_id) == COUNT(DISTINCT externo_id)` nas vendas do site,
que prova a idempotência dos pedidos no dado real.

## 4. Frequência recomendada

| Quando | Por quê |
|---|---|
| **Semanal** | Linha de base. O volume é pequeno (centenas de produtos) |
| **Antes de qualquer migration** | Obrigatório. Sem export recente, a migration não roda — ver a skill `safe-d1-change` |
| **Antes de importação real de catálogo ou estoque** | A importação escreve em massa |
| **Antes de sincronização forçada** (`forcar: true`) | Ela pula o freio de segurança |
| **Depois de fechar um inventário** | O momento em que o estoque foi conferido fisicamente vale ser guardado |

Retenção sugerida: 8 semanais, mais todos os pré-migration guardados
indefinidamente. São arquivos de texto pequenos.

## 5. Time Travel — a rede de proteção que já existe

O D1 mantém a possibilidade de voltar a **qualquer ponto dos últimos 30
dias**, sem você ter feito nada. Isso **não substitui** o export (não cobre
banco apagado, conta perdida, nem mais de 30 dias), mas é a recuperação mais
rápida para "a importação de agora há pouco estragou tudo".

Consulta — só leitura, segura:

`time-travel` **não aceita binding** — só nome ou `database_id`. Use o
`database_id`, que não tem como ser confundido com o banco errado:

```bash
npx wrangler d1 time-travel info 51dd629b-52dc-46d0-a1af-fa37f0a79533
npx wrangler d1 time-travel info 51dd629b-52dc-46d0-a1af-fa37f0a79533 \
  --timestamp 2026-09-04T09:00:00Z
```

Guarde o **bookmark** que ele devolve antes de qualquer operação de risco:
é o endereço exato do "antes".

---

# Restaurar

> ## REGRA CRÍTICA
>
> **Restore é Classe C** ([SECURITY.md](SECURITY.md)). Nunca é executado por
> um agente. Nunca é executado sem uma pessoa dizendo, naquele momento, que
> quer restaurar aquele banco a partir daquele arquivo.
>
> Nenhum restore em **produção** foi executado na etapa que produziu este
> documento. Houve um restore **local**, para validar o backup — é o caminho
> normal, descrito logo abaixo.

## Antes de qualquer restore

1. **Exporte o estado atual primeiro**, mesmo que ele pareça quebrado, para
   `backups/d1/<agora>_ANTES-DO-RESTORE/`. Um restore sobre dado ruim ainda
   é uma perda se ninguém guardou o ruim.
2. Anote o bookmark de Time Travel de agora (`time-travel info`).
3. Escreva **qual é o resultado esperado**: quantos produtos, quantas
   vendas, qual a data do último movimento.

## Restaurar em ambiente de teste (o caminho normal)

Sempre valide o arquivo aqui antes de pensar em produção. Nada disto toca a
nuvem: `--local` usa um SQLite dentro de `api/.wrangler`.

> **Depois de validar, zere o banco local** (`rm -rf api/.wrangler/state`).
> O backup traz nomes de clientes e revendedoras, preços e estoque reais, e
> não há motivo para esse dado ficar morando no ambiente de desenvolvimento.
> Os testes também precisam do banco limpo.

```bash
cd api

# 1. zera o banco local (pare o wrangler dev antes — ele segura o arquivo)
rm -rf .wrangler/state

# 2. carrega o backup
npx wrangler d1 execute DB --local \
  --file=../backups/d1/2026-09-04_07-35/producao-51dd629b-2026-09-04.sql

# 3. confere o que entrou
npx wrangler d1 execute DB --local \
  --command "SELECT COUNT(*) AS produtos FROM produtos"
npx wrangler d1 execute DB --local \
  --command "SELECT COUNT(*) AS movimentos FROM movimentos"

# 4. a prova que importa: a razão fecha?
npx wrangler d1 execute DB --local --command \
  "SELECT COUNT(*) AS divergentes FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.soma,0)"
```

`divergentes = 0` é o critério de aceitação.

Para conferir comportamento, e não só números, suba o Worker local
(`npx wrangler dev --local`) e abra o dashboard — ver
[DEVELOPMENT.md](DEVELOPMENT.md).

## Restaurar em produção (só com decisão humana)

Dois caminhos. **Prefira o primeiro.**

### Caminho A — Time Travel (últimos 30 dias)

Reverte o banco inteiro a um ponto no tempo. Não depende de arquivo.

```bash
# 51dd629b-… é marquesa-db-prod. Confira o UUID antes de apertar enter:
# um dígito errado restaura o banco errado, e restore não tem volta.
npx wrangler d1 time-travel info    51dd629b-52dc-46d0-a1af-fa37f0a79533 --timestamp <RFC3339>
npx wrangler d1 time-travel restore 51dd629b-52dc-46d0-a1af-fa37f0a79533 --bookmark  <BOOKMARK>
# ou: --timestamp <RFC3339>
```

Mais seguro que recarregar SQL à mão: não depende de o arquivo estar íntegro
e não deixa o banco meio carregado se falhar no meio.

### Caminho B — recarregar o export

`wrangler d1 execute --remote --file=…` **não zera** o banco: executa o SQL
do arquivo por cima do que existe. Um export com `CREATE TABLE IF NOT
EXISTS` + `INSERT` sobre um banco que já tem dados colide em chave primária,
e o resultado é um banco pela metade. Se o Caminho B for mesmo necessário, o
destino precisa estar vazio ou ser um banco novo.

Sequência mínima aceitável, com uma pessoa acompanhando cada passo:

1. export do estado atual (acima);
2. bookmark de Time Travel anotado;
3. carregar o arquivo num banco D1 **novo** (`wrangler d1 create`) e validar
   lá com as mesmas checagens do ambiente de teste;
4. só então decidir entre apontar o binding para o banco novo ou reverter o
   antigo por Time Travel.

## Como evitar restaurar em cima de produção por acidente

1. `--local` é o padrão mental. `--remote` se escreve conscientemente.
2. Nunca cole um comando com `--remote` sem reler o nome do banco.
3. Restore não é Classe A nem B. Só roda com autorização explícita.
4. O agente do Claude Code está impedido de executar
   `wrangler d1 time-travel restore`, `wrangler d1 execute --remote` com
   escrita, e `wrangler d1 delete` — ver [SECURITY.md](SECURITY.md) e
   `.claude/settings.json`.
5. Faça o export **antes**, sempre. Ele é a única coisa que transforma um
   erro em contratempo.

---

# Backup do código

O repositório é a cópia canônica do código. Nesta etapa foram criados dois
pontos de retorno:

| Mecanismo | Onde | O que guarda |
|---|---|---|
| Tag local `checkpoint/pre-bootstrap-claude` | commit `f3f08cb` — o último antes do bootstrap, e o mesmo que estava em `origin/main` | O repositório exatamente como estava antes da organização |
| Snapshot físico | `../Marquesa-Etiquetas-backups/pre-bootstrap-claude_2026-08-18_00-21.tar.gz` (827 KB, 61 entradas) | Cópia fora do repositório, imune a erro de Git |
| `origin/main` | GitHub | A rede de proteção final: enquanto o bootstrap não for publicado, o remoto ainda é o estado pré-bootstrap |

Como voltar ao estado pré-bootstrap:

```bash
# ver o que mudou desde o checkpoint
git diff checkpoint/pre-bootstrap-claude

# voltar um arquivo específico
git checkout checkpoint/pre-bootstrap-claude -- <caminho>

# olhar o estado inteiro sem desfazer nada
git switch --detach checkpoint/pre-bootstrap-claude

# desfazer tudo criando um commit de reversão (NÃO apaga histórico)
git revert --no-commit checkpoint/pre-bootstrap-claude..HEAD && git commit

# último recurso, fora do Git: extrair o tarball em outra pasta e comparar
tar -xzf ../Marquesa-Etiquetas-backups/pre-bootstrap-claude_2026-08-18_00-21.tar.gz -C /tmp/
```

> `git reset --hard` **não** está nesta lista, de propósito. Ele apaga
> trabalho não commitado sem perguntar. Ver [SECURITY.md](SECURITY.md).

## Proveniência deste repositório

Este é o **clone real** de `gustavodemelomartins-hub/Marquesa-Etiquetas`:
histórico completo (45 commits até `f3f08cb`) e `origin` configurado.

O bootstrap de organização nasceu numa cópia extraída do ZIP
(`../Marquesa-Etiquetas-main/`), onde não havia Git. Antes de transferir,
os dois lados foram comparados arquivo a arquivo: **conteúdo idêntico byte
a byte**, então nada de lá se perdeu ao trazer o trabalho para cá.

A pasta antiga pode ser apagada quando você quiser. O tarball em
`../Marquesa-Etiquetas-backups/` continua sendo a cópia física de segurança.

Como o `origin` agora existe, vale a regra do
[SECURITY.md](SECURITY.md): `push` só quando alguém pedir, e
`push --force` nunca.
