# Arquitetura

Sistema operacional de estoque, revendedoras e loja online da Marquesa
Semijoias. Três peças, sem framework em nenhuma delas.

```
┌──────────────────────┐        ┌───────────────────────┐       ┌───────────────┐
│  PWA (GitHub Pages)  │  HTTPS │  Worker (Cloudflare)  │  SQL  │  D1 / SQLite  │
│  dashboard.html      │ ─────► │  marquesa-api         │ ────► │  marquesa-db  │
│  index.html          │ Bearer │  api/src/index.js     │       │               │
└──────────────────────┘        └───────────┬───────────┘       └───────────────┘
                                            │ REST + Bearer
                                            ▼
                                  ┌───────────────────┐
                                  │  Nuvemshop / API  │
                                  │  produtos, pedidos│
                                  └───────────────────┘
```

## Frontend

**Dois painéis convivem**, sobre o mesmo backend e a mesma autenticação:

| | Legado | Novo |
|---|---|---|
| Onde | `src/dashboard.tpl.html` → `dashboard.html` | `frontend/` |
| Stack | HTML/CSS/JS vanilla | React + TypeScript + Vite |
| Cobre | Tudo | Nuvemshop + fundação da reconciliação |
| Situação | **Em produção** | Em construção, não publicado |

Detalhes do novo em [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md).
O resto desta seção descreve o legado, que continua sendo o painel principal.

HTML + CSS + JavaScript vanilla. Nenhum build de bundler, nenhum framework.

| Arquivo | O que é |
|---|---|
| [src/dashboard.tpl.html](../src/dashboard.tpl.html) | **A fonte.** ~3.800 linhas: markup, estado e regras de tela do painel |
| [src/build.py](../src/build.py) | Monta `dashboard.html` injetando CSS e SheetJS extraídos do `index.html` |
| [dashboard.html](../dashboard.html) | **Gerado.** ~450 KB. Nunca editar à mão |
| [index.html](../index.html) | App de etiquetas. É também a fonte única do CSS e do SheetJS |
| [sw.js](../sw.js) | Service worker: `dashboard.html` sempre da rede, o resto do cache |
| [manifest.json](../manifest.json) | PWA instalável |
| [vendor/zxing.min.js](../vendor/zxing.min.js) | Leitor de código de barras pela câmera, carregado sob demanda |

O estado do app é um objeto global JS preenchido por `GET /api/state`, e a
tela é redesenhada a partir dele. Não há estado derivado guardado em dois
lugares: o servidor calcula os três saldos (total, consignado, disponível) e
o front só exibe.

A chave de acesso e o endereço da API ficam em `localStorage`, na chave
`marquesa_conexao_v1` — ver [SECURITY.md](SECURITY.md).

## Backend

Cloudflare Worker, ES modules, sem dependências em runtime.

| Arquivo | Responsabilidade |
|---|---|
| [api/src/index.js](../api/src/index.js) | Roteador HTTP de `/api/*` + handler do cron (`scheduled`) |
| [api/src/auth.js](../api/src/auth.js) | Bearer da `API_KEY`, CORS, helper `json()` |
| [api/src/state.js](../api/src/state.js) | Monta o payload de `GET /api/state` que o dashboard consome |
| [api/src/estoque.js](../api/src/estoque.js) | **Razão contábil.** `movimentar`, saldos, kits, `conferirEstoque` |
| [api/src/sync.js](../api/src/sync.js) | Motor de sincronização com a loja — ver [SYNC_ENGINE.md](SYNC_ENGINE.md) |
| [api/src/nuvemshop.js](../api/src/nuvemshop.js) | Transporte da API da Nuvemshop + `mapearSkus` |
| [api/src/nuvemshop-oauth.js](../api/src/nuvemshop-oauth.js) | Troca do código de autorização por token (app de parceiro) |
| [api/src/inventario.js](../api/src/inventario.js) | Contagem física: abrir, contar, concluir, ajustar |
| [api/src/comissao.js](../api/src/comissao.js) | Faixas de comissão do acerto de maleta |
| [api/src/saidas.js](../api/src/saidas.js) | §31 — brinde, uso próprio e perda: sai do estoque, **não** é venda |
| [api/src/garantias.js](../api/src/garantias.js) | §32 — garantia por ITEM da compra, troca e a diferença |
| [api/src/dias-uteis.js](../api/src/dias-uteis.js) | O prazo em dias úteis, com os feriados vindos da tabela |
| [api/src/historico-dia.js](../api/src/historico-dia.js) | §33 — o dia inteiro, de todas as origens, sem duplicata |
| [api/src/auditoria-historico.js](../api/src/auditoria-historico.js) | §35 — propõe reclassificar linha da planilha; **nunca** decide |

Duas portas de entrada não exigem a `API_KEY`, de propósito:

- `GET /api/health` — sonda pública, não devolve dado nenhum;
- `GET /api/nuvemshop/callback` — chamado pelo navegador vindo da Nuvemshop;
  quem autentica é o `code` de uso único, não o Bearer.

Todo o resto passa por `checarChave` antes de chegar ao roteador.

## Banco

Cloudflare D1 (SQLite). Sem ORM: SQL escrito à mão, `db.prepare().bind()`.

- Schema: [api/schema.sql](../api/schema.sql) — a fonte da verdade
- Versão para colar no console do painel: `api/schema-console.sql` (derivado,
  gerado por `api/gerar-schema-console.mjs`)
- Migrations: `api/migracao-*.sql`, aplicadas **à mão**, sem versionamento
  automático — ver [TECH_DEBT.md](TECH_DEBT.md)

Detalhe de cada tabela em [DATA_MODEL.md](DATA_MODEL.md).

## Nuvemshop

Integração de duas mãos, agendada por cron da Cloudflare (`0 9,21 * * *`
UTC = 06:00 e 18:00 em Brasília) e disparável à mão pelo painel.

Fluxo completo em [SYNC_ENGINE.md](SYNC_ENGINE.md); detalhes de API,
matching e limites em [NUVEMSHOP_INTEGRATION.md](NUVEMSHOP_INTEGRATION.md).

## Fluxo geral de uma requisição

```
navegador
  → GET /api/state  (Bearer)
      → auth.js       checarChave
      → state.js      montarState  (10 queries em paralelo)
          → inventario.js  resumoInventario
          → sync.js        resumoSync
      → auth.js       comCors
  ← JSON com produtos, revendedoras, maletas, config, loja, inventário, sync
```

Toda mudança de estoque, venha de onde vier (venda de balcão, acerto de
maleta, pedido do site, inventário, importação), passa por
`estoque.js › movimentar`. Não existe caminho alternativo — é o que sustenta
a invariante `produtos.qtd == SUM(movimentos.qtd)`.

## O que este sistema deliberadamente NÃO faz

- Não cria produto na Nuvemshop. Código sem anúncio lá fica em "falta subir"
  para sempre; cadastrar é passo manual.
- Não trata a Nuvemshop como fonte da verdade do estoque físico. A loja é
  **destino**; a exceção única e vigiada é a semeadura de variações.
- Não tem contas de usuário. É uma senha compartilhada, proporcional a uma
  ferramenta interna de uma pessoa.
- **Não decide, sozinho, o que era uma linha ambígua da planilha.** A
  auditoria de §35 propõe e mostra o motivo; quem aplica é uma pessoa, linha
  a linha. "ACHO QUE FOI VENDIDO" fica esperando.
- **Não define crédito nem reembolso** quando a peça nova de uma troca custa
  menos que a original. A troca é registrada com `pendente_regra`, nada é
  lançado, e o sistema diz que parou ali.
