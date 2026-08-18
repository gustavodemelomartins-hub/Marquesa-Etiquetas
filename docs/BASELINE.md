# Baseline de testes

Retrato do comportamento do sistema **antes** de qualquer trabalho futuro.
Serve para responder a pergunta que mais importa depois de uma mudança:
*isto já estava assim?*

Nenhum teste funcional quebrado foi "consertado" para produzir este
documento. O objetivo é medir, não melhorar.

---

## Data

**2026-08-18**, 00:21–00:45 (horário local, UTC−3).

## Commit / checkpoint

| | |
|---|---|
| Commit | `f3f08cb` |
| Tag local | `checkpoint/pre-bootstrap-claude` |
| Branch | `main` |
| Remote | `origin` -> github.com/gustavodemelomartins-hub/Marquesa-Etiquetas |
| Snapshot físico | `../Marquesa-Etiquetas-backups/pre-bootstrap-claude_2026-08-18_00-21.tar.gz` (827 KB, 61 entradas) |

## Ambiente

| | |
|---|---|
| SO | Windows 10 Pro 19045 |
| Node | v24.19.0 |
| npm | 12.0.2 |
| Python | 3.14.7 (comando `python`; `python3` **não existe** aqui) |
| Wrangler | 4.123.0 |
| Git | 2.54.0.windows.1 |
| Cloudflare | **sem credenciais** — nenhum acesso remoto |

---

## Build

```bash
python src/build.py
```

| | |
|---|---|
| Resultado | **passou** |
| Duração | < 1 s |
| Saída | `dashboard.html: 452.292 bytes (css 20.852 · sheetjs 250.427)` |
| Asserções internas | todas passaram (CSS > 15 KB, SheetJS > 50 KB, marcadores presentes) |

**Diferença contra o `dashboard.html` versionado:** 4.248 linhas alteradas,
**0 mudanças de conteúdo**. Comparando os dois arquivos com os `\r`
removidos, eles são idênticos byte a byte. A diferença é inteiramente de
fim de linha: no Windows, `pathlib.write_text` traduz `\n` para `\r\n` e
duplica o CR nas linhas que já vinham com CRLF do `index.html`.

O `dashboard.html` original foi restaurado; a árvore ficou limpa.

---

## Testes

Cada teste rodou com **banco zerado e Worker local recém-subido**, como o
`src/README.md` exige.

| Teste | Resultado | Asserções | Falhas | Duração |
|---|---|---|---|---|
| `src/sync-test.mjs` | **passou** | 67 | 0 | 10 s |
| `src/variacoes-test.mjs` | **passou** | 48 | 0 | 6 s |
| `src/kits-test.mjs` | **passou** | 20 | 0 | 1 s |
| `src/e2e.mjs` | **não executado** | — | — | — |
| `src/import-casa-test.mjs` | **não executado** | — | — | — |
| `src/shot.mjs` | **não executado** | — | — | — |

**Total executado: 135 asserções, 0 falhas.**

Comandos usados (por teste, na ordem):

```bash
# derrubar o Worker, zerar o banco, recriar o schema, subir de novo
rm -rf api/.wrangler/state
npx wrangler d1 execute marquesa-db --local --file=schema.sql
npx wrangler dev --local --port 8787
# esperar /api/health responder, então:
node src/<teste>.mjs
```

### Por que três testes não rodaram

Os três dependem do Playwright com `executablePath: '/opt/pw-browsers/chromium'`
escrito no código — caminho de Linux, inexistente nesta máquina. Além disso,
`src/node_modules` está vazio (Playwright não instalado).

Não é falha do produto e **não foi corrigido**: mudar o `executablePath`
seria alterar código de teste, fora do escopo desta etapa. Registrado em
[TECH_DEBT.md](TECH_DEBT.md).

---

## Falhas conhecidas

**Nenhuma falha de produto.** Uma falha de ambiente, já resolvida durante a
medição e vale ficar registrada porque vai acontecer de novo com quem montar
o ambiente pela primeira vez:

> Na primeira execução, `sync-test.mjs` falhou 3 asserções da seção 10
> ("troca do código pelo token"):
> *"código errado mostra o motivo"*, *"a página mostra o token para copiar"*,
> *"e o id da loja"*.
>
> **Causa:** `api/.dev.vars` sem `NUVEMSHOP_CLIENT_ID`,
> `NUVEMSHOP_CLIENT_SECRET` e `NUVEMSHOP_AUTH_BASE`. O `src/README.md`
> documenta só as três primeiras variáveis. Com as seis, os 67 passam.

---

## Observações

1. **A razão fecha em todos os testes.** `produtos.qtd == SUM(movimentos.qtd)`
   é verificado explicitamente no fim de `sync-test` (seção 11),
   `variacoes-test` (seção 8) e `kits-test` (seção 9). É a invariante mais
   importante do sistema e ela está de pé.

2. **Nenhuma chamada saiu para a Nuvemshop de verdade.** Toda a
   sincronização testada foi contra `src/loja-falsa.mjs` em `localhost:8799`.

3. **Nenhum dado de produção foi tocado.** Todo o banco usado é o SQLite
   local de `api/.wrangler`, criado e destruído durante a medição.

4. A suíte inteira, dos três testes de API, leva **menos de 20 segundos** de
   execução — o custo real é o reset do banco entre eles, não o teste.

5. `api/test-api.mjs` é script auxiliar e não entra na suíte.

---

## Como refazer esta medição

```bash
# 1. build
python src/build.py && git diff --ignore-cr-at-eol --stat -- dashboard.html

# 2. para cada teste: derrubar Worker, zerar banco, subir, rodar
#    (ver o passo a passo de Windows em docs/TESTING.md)

# 3. comparar com a tabela acima
```

Uma queda em relação a este baseline é regressão. Um teste que passa a rodar
(o `e2e` num Linux, por exemplo) amplia o baseline — atualize a tabela.
