---
paths:
  - "api/src/**"
  - "api/wrangler.toml"
---

# Regras da API (Worker)

Backend sem dependência de runtime. Cloudflare Worker + D1. Roteador em
`api/src/index.js`; o cron (`scheduled`) mora no mesmo arquivo.

As invariantes que nenhuma rota pode quebrar já estão no `CLAUDE.md`
(§ Regras fundamentais), que está sempre carregado. Não as releia daqui.

## Ambientes no `wrangler.toml`

Bloco raiz = **produção** (`marquesa-api`, `marquesa-db`, `marquesa-fotos`).
`[env.staging]` = **DEV** (`marquesa-api-staging`, `marquesa-db-dev`,
`marquesa-fotos-dev`, sem cron, sem credencial da Nuvemshop).

Mexeu no bloco raiz? Diga isso em voz alta no resumo — é configuração de
produção, mesmo que o deploy não seja seu.

## Verificação proporcional

```
Worker local:  npx wrangler dev --local --port 8787
smoke:         curl -s http://localhost:8787/api/health
razão fecha:   curl -s http://localhost:8787/api/estoque/conferir   → vazio
```

Suíte direcionada, nunca tudo por reflexo:

| Mudou | Rode |
|---|---|
| `sync.js`, `nuvemshop.js` | `node src/sync-test.mjs` |
| variações | `node src/variacoes-test.mjs` |
| kits | `node src/kits-test.mjs` |
| importação/estoque total | `node src/import-casa-test.mjs`, `node src/estoque-total-e2e.mjs` |
| reconciliação | `node src/reconciliacao-test.mjs` |

Regras de negócio: [api/REGRAS.md](../../api/REGRAS.md). Motor:
[docs/SYNC_ENGINE.md](../../docs/SYNC_ENGINE.md).
