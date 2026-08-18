# Desenvolvimento

Nada aqui toca a nuvem. Tudo roda contra um SQLite local dentro de
`api/.wrangler` e, quando o assunto é Nuvemshop, contra uma loja de mentira
que sobe no próprio computador.

## O que precisa estar instalado

| Ferramenta | Versão conferida | Para quê |
|---|---|---|
| Node.js | v24.19.0 | Worker local, testes, scripts |
| npm | 12.0.2 | Dependências |
| Python 3 | 3.14.7 | `src/build.py` |
| Wrangler | 4.123.0 (via `npx`) | Worker + D1 |
| Git | 2.54 | Checkpoints |

```bash
cd api && npm install     # wrangler
cd ../src && npm install  # playwright + xlsx (só para os testes de navegador)
```

> **Windows:** o comando é `python`, não `python3`. O script
> `npm run build` do `src/package.json` chama `python3` e falha aqui —
> rode `python src/build.py` direto. Ver [TECH_DEBT.md](TECH_DEBT.md).

## Gerar o dashboard

`dashboard.html` é **montado**, nunca editado à mão.

```bash
python src/build.py
# dashboard.html: 452.292 bytes  (css 20.852 · sheetjs 250.427)
```

O build lê o CSS e o SheetJS de dentro do `index.html` e injeta em
`src/dashboard.tpl.html` nos marcadores `/*__BASE_CSS__*/` e
`<!--__SHEETJS__-->`. É por isso que os dois apps têm a mesma cara: existe
uma folha de estilo só, e ela mora no `index.html`.

As fronteiras dos blocos são achadas **por conteúdo**, não por número de
linha, e o script confere o tamanho do que extraiu — mexer no `index.html`
não quebra a montagem em silêncio.

> **Windows:** o build reescreve o arquivo inteiro com CRLF, o que produz um
> diff de 4.248 linhas sem uma única mudança de conteúdo. Confira com
> `git diff --ignore-cr-at-eol` antes de commitar um `dashboard.html`
> regerado no Windows.

## Subir o Worker local

```bash
cd api
cp .dev.vars.example .dev.vars     # e escolha uma chave qualquer de teste
rm -rf .wrangler/state             # zera o banco (pare o wrangler antes)
npx wrangler d1 execute marquesa-db --local --file=schema.sql
npx wrangler dev --local --port 8787
```

Conferir que subiu:

```bash
curl http://localhost:8787/api/health
# {"ok":true,"hoje":"2026-08-18"}
```

O `.dev.vars` completo, com o que os testes de sincronização também exigem:

```
API_KEY=troque-por-uma-chave-de-teste
NUVEMSHOP_STORE_ID=999999
NUVEMSHOP_TOKEN=token-de-mentira
NUVEMSHOP_BASE=http://localhost:8799
NUVEMSHOP_CLIENT_ID=app-de-mentira
NUVEMSHOP_CLIENT_SECRET=segredo-de-mentira
NUVEMSHOP_AUTH_BASE=http://localhost:8799
```

`NUVEMSHOP_BASE` e `NUVEMSHOP_AUTH_BASE` existem só para o teste apontar
para a loja falsa; fora do teste ninguém define e vale o endereço real.
`.dev.vars` é ignorado pelo Git.

## Servir o dashboard

Aberto como `file://` o navegador bloqueia a chamada à API por CORS. Sirva
por HTTP:

```bash
python -m http.server 8000
# http://localhost:8000/dashboard.html
```

Na tela de conexão: endereço `http://localhost:8787` e a chave do
`.dev.vars`.

## Trabalhar com a loja falsa

[src/loja-falsa.mjs](../src/loja-falsa.mjs) sobe uma Nuvemshop de mentira em
`localhost:8799`. Nenhuma chamada sai para a loja de verdade e nenhum token
real é preciso.

Ela imita o que importa do comportamento real:

- exige o `User-Agent` (a API verdadeira responde **400** sem ele);
- pagina por `page` / `per_page`;
- guarda tudo que chega no `PATCH`, para o teste conferir o que foi escrito;
- implementa a troca OAuth `POST /apps/authorize/token`.

Os testes a sobem sozinhos (`subirLojaFalsa()`), então normalmente não é
preciso iniciá-la à mão.

## Rodar os testes

Ver [TESTING.md](TESTING.md) — inclui o que roda em cada sistema
operacional e o baseline atual.

Resumo:

```bash
node src/sync-test.mjs        # sincronização com a Nuvemshop
node src/variacoes-test.mjs   # aro do anel, comprimento da corrente
node src/kits-test.mjs        # peça vendida inteira ou desmontada
```

Cada um precisa do Worker local no ar **e de banco limpo** — as contagens
mudam se sobrar dado do teste anterior.

## Ciclo de trabalho

```
1. leia a regra    → api/REGRAS.md e o documento de docs/ correspondente
2. edite           → api/src/*.js  ou  src/dashboard.tpl.html
3. build           → python src/build.py     (se mexeu no front)
4. teste           → banco limpo + Worker local + os três testes de API
5. confira a razão → GET /api/estoque/conferir  deve voltar vazio
6. diff            → git diff  (e --ignore-cr-at-eol para dashboard.html)
```

## Validar antes de pensar em deploy

Use a skill `pre-deploy-check`. O essencial:

- [ ] `git status` limpo ou inteiramente compreendido
- [ ] os três testes de API passando **com banco limpo**
- [ ] `python src/build.py` rodado se o front mudou, e o `dashboard.html`
      regerado incluído no commit
- [ ] `GET /api/estoque/conferir` vazio
- [ ] nenhum segredo no diff
- [ ] migration pendente identificada e **combinada com uma pessoa**
- [ ] backup do D1 feito se houver migration ou escrita em massa
- [ ] rollback definido antes de subir

**Deploy é Classe C** ([SECURITY.md](SECURITY.md)): `npx wrangler deploy`
nunca é executado por um agente.

## Onde as coisas ficam

| Preciso de… | Vá para |
|---|---|
| Regras de negócio e o porquê | [api/REGRAS.md](../api/REGRAS.md) |
| Visão geral do sistema | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Tabelas e invariantes | [DATA_MODEL.md](DATA_MODEL.md) |
| API da loja, matching, limites | [NUVEMSHOP_INTEGRATION.md](NUVEMSHOP_INTEGRATION.md) |
| Fluxo da sincronização | [SYNC_ENGINE.md](SYNC_ENGINE.md) |
| Publicar a API pela primeira vez | [api/DEPLOY.md](../api/DEPLOY.md) |
| Backup e restore | [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) |
| Como montar o dashboard | [src/README.md](../src/README.md) |
