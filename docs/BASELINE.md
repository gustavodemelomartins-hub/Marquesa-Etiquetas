# Baseline de testes

Retrato do comportamento do sistema, para responder a pergunta que mais
importa depois de uma mudança: *isto já estava assim?*

Nenhum teste funcional foi "consertado" para produzir este documento. O que
mudou entre a primeira e a segunda medição foi **ambiente**, não
comportamento.

---

## Data

**2026-08-18**, 06:40 (horário local, UTC−3).

## Commit / checkpoint

| | |
|---|---|
| Commit medido | `29d95eb` (bootstrap) + as correções de ambiente do E2E |
| Tag local | `checkpoint/pre-bootstrap-claude` → `f3f08cb` |
| Branch | `main` |
| Remote | `origin` → github.com/gustavodemelomartins-hub/Marquesa-Etiquetas |
| Backup do D1 | `backups/d1/2026-08-18_06-22/` — conferido, razão fecha |
| Snapshot físico | `../Marquesa-Etiquetas-backups/pre-bootstrap-claude_2026-08-18_00-21.tar.gz` |

## Ambiente

| | |
|---|---|
| SO | Windows 10 Pro 19045 |
| Node | v24.19.0 |
| npm | 12.0.2 |
| Python | 3.14.7 (comando `python`; `python3` **não existe** aqui) |
| Wrangler | 4.123.0, autenticado |
| Playwright | instalado em `src/node_modules` |
| Chromium | Chrome Headless Shell 151.0.7922.34 (`npx playwright install chromium`) |
| Git | 2.54.0.windows.1 |

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
| Asserções internas | todas passaram |

**Diferença contra o `dashboard.html` versionado:** 4.248 linhas alteradas,
**0 mudanças de conteúdo**. Ignorando os `\r`, os arquivos são idênticos. É
a tradução de fim de linha do `pathlib.write_text` no Windows —
[TECH_DEBT.md](TECH_DEBT.md), item 5. Confira com
`git diff --ignore-cr-at-eol`.

---

## Testes

Cada teste rodou com **banco zerado e Worker local recém-subido**.

| Teste | Resultado | Asserções | Falhas | Duração |
|---|---|---|---|---|
| `src/sync-test.mjs` | **passou** | 67 | 0 | 9 s |
| `src/variacoes-test.mjs` | **passou** | 48 | 0 | 6 s |
| `src/kits-test.mjs` | **passou** | 20 | 0 | 2 s |
| `src/e2e.mjs` | **passou** | 66 | 0 | 36 s |
| `src/import-casa-test.mjs` | **passou** | 8 | 0 | 10 s |

### Total: **209 asserções, 0 falhas, 5 de 5 testes.**

Sequência por teste:

```bash
# 1. derrubar o Worker (ele segura o arquivo do SQLite)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*wrangler*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }; Get-Process workerd -EA SilentlyContinue | Stop-Process -Force"

# 2. banco limpo
cd api && rm -rf .wrangler/state
npx wrangler d1 execute marquesa-db --local --file=schema.sql

# 3. Worker + servidor HTTP (o e2e precisa dos dois)
npx wrangler dev --local --port 8787 &
python -m http.server 8000 &          # na raiz do repositório

# 4. o teste
node src/<teste>.mjs
```

---

## Histórico

| Data | Testes | Asserções | Nota |
|---|---|---|---|
| 2026-08-18 00:45 | 3 de 5 | 135 | Testes de navegador não rodavam: `executablePath` fixo em `/opt/pw-browsers/chromium` |
| **2026-08-18 06:40** | **5 de 5** | **209** | Ambiente do E2E corrigido |

O salto de 135 para 209 é **cobertura recuperada**, não comportamento novo:
os dois testes de navegador sempre existiram e sempre passaram na máquina de
origem. O que mudou foi o ambiente parar de impedi-los aqui.

---

## Falhas de ambiente encontradas (todas resolvidas)

Nenhuma falha de produto em nenhuma das duas medições. Três problemas de
ambiente, que vão acontecer de novo com quem montar a máquina do zero:

1. **`.dev.vars` incompleto derruba a seção OAuth do `sync-test`.**
   Faltando `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET` e
   `NUVEMSHOP_AUTH_BASE`, exatamente 3 asserções da seção 10 falham. O
   `src/README.md` documentava só três das seis variáveis.

2. **`executablePath` fixo impedia os testes de navegador.**
   `/opt/pw-browsers/chromium` é caminho de Linux. Agora os três arquivos
   honram `PW_CHROMIUM` e, sem ela, usam o Chromium que o próprio Playwright
   instala.

3. **CORS derrubava o `e2e` na tela de conexão.**
   `ORIGENS_PERMITIDAS` no `wrangler.toml` vale o endereço de produção, e o
   navegador do teste vem de `http://localhost:8000`. O Worker respondia com
   `Access-Control-Allow-Origin: https://gustavodemelomartins-hub.github.io`
   e o navegador bloqueava — a tela dizia *"Não encontrei a API neste
   endereço"*, que parece erro de rede e não é.

   Corrigido **sem tocar em código**: `ORIGENS_PERMITIDAS=http://localhost:8000`
   no `.dev.vars`, que sobrescreve o `[vars]` do `wrangler.toml` durante o
   `wrangler dev`.

---

## Observações

1. **A razão fecha em todos os testes.**
   `produtos.qtd == SUM(movimentos.qtd)` é verificado explicitamente no fim
   de `sync-test` (seção 11), `variacoes-test` (seção 8), `kits-test`
   (seção 9) e `e2e` (seção "a razão fecha (§19)"). É a invariante mais
   importante do sistema, e ela está de pé.

2. **A razão também fecha no dado de produção**, conferida no backup de
   06:22: 782 produtos, 1.278 movimentos, **0 divergências**.

3. **Nenhuma chamada saiu para a Nuvemshop de verdade.** Toda sincronização
   testada foi contra `src/loja-falsa.mjs` em `localhost:8799`.

4. **Nenhum dado de produção foi alterado.** O único acesso remoto foi o
   `d1 export`, que é somente leitura.

5. O `e2e` é o teste mais valioso da suíte e o mais caro: 36 s, navegador de
   verdade, 12 seções, e é o único que prova que interface e API conversam.
   Termina conferindo que **nenhum erro de console apareceu**.

6. `src/shot.mjs` não é teste — tira fotos das telas. `api/test-api.mjs` é
   script auxiliar.

---

## Como refazer esta medição

```bash
python src/build.py && git diff --ignore-cr-at-eol --stat -- dashboard.html
# depois, a sequência de 4 passos acima, para cada um dos 5 testes
```

Queda em relação a esta tabela é regressão.
