# Baseline de testes

Retrato do comportamento do sistema, para responder a pergunta que mais
importa depois de uma mudança: *isto já estava assim?*

Nenhum teste funcional foi "consertado" para produzir este documento. O que
mudou entre a primeira e a segunda medição foi **ambiente**, não
comportamento.

---

## Data

**2026-08-18**, 14:40 (horário local, UTC−3).

## Commit / checkpoint

| | |
|---|---|
| Commit medido | `0e7bcd1` — schema do motor de reconciliação + correção do TECH_DEBT 12 |
| Tags locais | `checkpoint/pre-bootstrap-claude` → `f3f08cb` · `checkpoint/pre-frontend-react` → `3c849a0` |
| Branch | `feature/motor-reconciliacao` (com `main` mesclado dentro) |
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
| Vite | 7.3.6 |
| React | 19 |
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
| `src/sync-test.mjs` | **passou** | 67 | 0 | 10 s |
| `src/variacoes-test.mjs` | **passou** | 48 | 0 | 6 s |
| `src/kits-test.mjs` | **passou** | 20 | 0 | 1 s |
| `src/e2e.mjs` | **passou** | 66 | 0 | 37 s |
| `src/import-casa-test.mjs` | **passou** | 8 | 0 | 11 s |
| `src/frontend-e2e.mjs` | **passou** | 33 | 0 | 5 s |
| `src/dry-run-test.mjs` | **passou** | 49 | 0 | 15 s |
| `src/saude-sync-test.mjs` | **passou** | 25 | 0 | 10 s |

### Total: **316 asserções, 0 falhas, 8 de 8 testes.**

### Schema do motor de reconciliação — sem Worker

`src/reconciliacao-schema-test.mjs` fala com o D1 local direto
(`wrangler d1 execute --persist-to <pasta descartável>`), sem subir o
Worker. **65 asserções, 0 falhas, ~40 s.** Não entra no total acima porque
segue um protocolo diferente (não precisa do ciclo banco-limpo-e-Worker-no-ar
dos outros oito) — ver [TESTING.md](TESTING.md).

### Frontend novo, sem navegador

```bash
cd frontend
npm run typecheck   # tsc --noEmit          → 0 erros
npm test            # vitest                → 73 testes, 0 falhas
npm run build       # tsc --noEmit + vite   → dist/ em ~1,6 s
```

| | |
|---|---|
| Testes unitários | **73 passaram, 0 falharam** (5 arquivos) |
| TypeScript `strict` | 0 erros |
| Build | 224 kB de JS (71 kB gzip) + 11 kB de CSS + as duas fontes |

Os 73 testes unitários não mudaram nesta medição — a mudança desta fase foi
toda em schema e backend.

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
| 2026-08-18 06:40 | 5 de 5 | 209 | Ambiente do E2E corrigido |
| 2026-08-18 07:35 | 6 de 6 | 232 | + `frontend-e2e` (painel React), + 47 testes unitários do frontend |
| 2026-08-18 11:05 | 7 de 7 | 289 | + `dry-run-test` (49), + 8 no `frontend-e2e`, + 26 unitários |
| **2026-08-18 14:40** | **8 de 8** | **316** | + `saude-sync-test` (25), + 2 no `frontend-e2e` (33). Fora do total: `reconciliacao-schema-test` (65, sem Worker) |

O salto de 135 para 209 foi **cobertura recuperada**, não comportamento novo:
os dois testes de navegador sempre existiram e sempre passaram na máquina de
origem. De 209 em diante é cobertura **nova**.

Os 209 originais nunca mudaram de valor em nenhuma das medições — é isso que
prova que nem a migração do frontend, nem a validação de saúde, nem esta
etapa mexeram no que já funcionava. As 10 asserções novas do `frontend-e2e`
(2 nesta medição, 8 na anterior) são acréscimo; a única alterada segue sendo
o rótulo do selo de estado, de "Conectada" para "Sincronizando normalmente" —
decisão deliberada, e ainda a mesma da medição anterior.

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
   `d1 export` e duas contagens de tabela, todos somente leitura.

5. **O painel novo não escreve na Nuvemshop.** O `frontend-e2e` confere que
   a loja falsa registra **zero** escritas depois de a análise inteira rodar
   — e um teste unitário trava que `services/sync.ts` só sabe mandar
   `{seco: true}`, nunca `forcar`.

6. **O dry-run não escreve estoque, razão, venda nem na loja**, agora com
   prova formal em vez de leitura de código: `src/dry-run-test.mjs` compara
   oito tabelas linha por linha, lidas direto do SQLite. Ele **também**
   documenta os quatro recursos que a rodada seca SIM atualiza — todos
   metadado de leitura. Tabela completa em [SYNC_ENGINE.md](SYNC_ENGINE.md).

7. **O backup de produção foi reconferido nesta medição**, carregando o dump
   de 06:22 num banco limpo: 16 tabelas, 782 produtos, 1.278 movimentos,
   **0 divergências na razão**, nenhum `externo_id` repetido, e nenhuma
   tabela `reconciliacao_*` — confirmando que a migration do branch nunca
   foi aplicada.

8. O `e2e` é o teste mais valioso da suíte e o mais caro: 37 s, navegador de
   verdade, 12 seções, e é o único que prova que a interface legada e a API
   conversam. Termina conferindo que **nenhum erro de console apareceu** — e
   o `frontend-e2e` faz a mesma checagem para o painel novo.

9. **O TECH_DEBT.md item 12 está corrigido e provado**: uma rodada seca não
   consegue mais fazer uma falha real de sincronização desaparecer da tela.
   `src/saude-sync-test.mjs` cobre os quatro cenários — inclusive o caso
   simétrico (uma análise que falha não pode contaminar uma sincronização
   real saudável).

10. **O schema do motor de reconciliação está fechado, e nunca foi aplicado
    em banco nenhum** — nem local, nem produção.
    `src/reconciliacao-schema-test.mjs` aplica a migration sobre o schema
    real de ANTES desta fase (`git show f3f08cb:api/schema.sql`) e prova a
    unicidade, os `CHECK`, a idempotência e que nada anterior se perdeu.
    Detalhe completo em [RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md).

11. `src/shot.mjs` não é teste — tira fotos das telas. `api/test-api.mjs` é
    script auxiliar.

---

## Como refazer esta medição

```bash
python src/build.py && git diff --ignore-cr-at-eol --stat -- dashboard.html
cd frontend && npm run build && npm test && cd ..
# depois, a sequência de 4 passos acima, para cada um dos 8 testes
node src/reconciliacao-schema-test.mjs   # este não precisa do Worker
```

Queda em relação a esta tabela é regressão.
