# Marquesa Semijoias

Sistema de **estoque, revendedoras e integração com a Nuvemshop**. Controla
estoque físico e vendas reais.

- **PWA** em HTML/CSS/JS vanilla, servido pelo GitHub Pages
- **API** num Cloudflare Worker, sem dependências de runtime
- **Banco** Cloudflare D1 (SQLite), sem ORM
- **Loja** sincronizada duas vezes por dia, com freios de segurança

## Começar

```bash
cd api && npm install          # wrangler
cd ../src && npm install       # playwright + xlsx (testes de navegador)

python src/build.py            # monta dashboard.html a partir do template
cd api && npx wrangler dev --local --port 8787
python -m http.server 8000     # na raiz: http://localhost:8000/dashboard.html
```

Painel novo (React + TypeScript + Vite):

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Passo a passo completo, incluindo o `.dev.vars`:
[docs/operations/DEVELOPMENT.md](docs/operations/DEVELOPMENT.md).

## Mapa

```
index.html              app de etiquetas · fonte única do CSS e do SheetJS
dashboard.html          painel legado — GERADO, nunca editar à mão
src/dashboard.tpl.html  a fonte do painel legado
src/build.py            monta o dashboard.html
frontend/               painel novo: React + TypeScript + Vite
src/*-test.mjs          testes
api/src/                o Worker
api/schema.sql          as 16 tabelas
api/REGRAS.md           regras de negócio e as justificativas históricas
docs/                   arquitetura, banco, integração, segurança, backup
CLAUDE.md               roteador de contexto para trabalhar com Claude Code
```

## Documentação

| Assunto | Onde |
|---|---|
| **Regras de negócio** | [api/REGRAS.md](api/REGRAS.md) |
| Arquitetura | [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) |
| Frontend React/TS/Vite | [docs/architecture/FRONTEND_ARCHITECTURE.md](docs/architecture/FRONTEND_ARCHITECTURE.md) |
| Banco de dados | [docs/architecture/DATA_MODEL.md](docs/architecture/DATA_MODEL.md) |
| Nuvemshop | [docs/domains/NUVEMSHOP_INTEGRATION.md](docs/domains/NUVEMSHOP_INTEGRATION.md) |
| Sincronização | [docs/domains/SYNC_ENGINE.md](docs/domains/SYNC_ENGINE.md) |
| Segurança e operações perigosas | [docs/SECURITY.md](docs/SECURITY.md) |
| Backup e recuperação | [docs/operations/BACKUP_RECOVERY.md](docs/operations/BACKUP_RECOVERY.md) |
| Ambiente de desenvolvimento | [docs/operations/DEVELOPMENT.md](docs/operations/DEVELOPMENT.md) |
| Testes | [docs/testing/TESTING.md](docs/testing/TESTING.md) · [baseline](docs/testing/BASELINE.md) |
| Dívida técnica | [docs/architecture/TECH_DEBT.md](docs/architecture/TECH_DEBT.md) |
| Próxima fase | [docs/domains/ROADMAP_RECONCILIATION.md](docs/domains/ROADMAP_RECONCILIATION.md) |
| Publicar a API | [api/DEPLOY.md](api/DEPLOY.md) |
| Montar o dashboard | [src/README.md](src/README.md) |
| Decisões de arquitetura | [docs/decisions/](docs/decisions/) |

## A regra que sustenta tudo

```
produtos.qtd == SUM(movimentos.qtd)     para todo SKU
```

`movimentos` é razão contábil: toda mudança de estoque é uma linha lá, com
tipo, quantidade assinada e origem. `produtos.qtd` é só o saldo
materializado. `GET /api/estoque/conferir` prova a igualdade a qualquer
momento.

**Nunca escreva `produtos.qtd` diretamente.** Todo caminho passa por
`api/src/estoque.js › movimentar`.

## Antes de mexer

Este sistema controla estoque e vendas reais.

- Produção é a fonte operacional. Classe C — migration, deploy, push e
  rollback — pode ser executada autonomamente depois dos gates; Classe D
  destrutiva/empresarial exige decisão humana explícita:
  [docs/SECURITY.md](docs/SECURITY.md).
- Prefira dry-run: `POST /api/sync {"seco": true}` lê tudo e não escreve na
  loja.
- Backup antes de qualquer mudança de banco:
  [docs/operations/BACKUP_RECOVERY.md](docs/operations/BACKUP_RECOVERY.md).
