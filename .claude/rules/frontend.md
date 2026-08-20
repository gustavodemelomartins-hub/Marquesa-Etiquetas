---
paths:
  - "frontend/**"
  - "src/dashboard.tpl.html"
  - "src/build.py"
---

# Regras de frontend

Dois painéis vivem sobre o mesmo backend. Descubra em qual você está antes
de editar.

| Painel | Fonte | Build | Saída |
|---|---|---|---|
| Legado (produção) | `src/dashboard.tpl.html` | `python src/build.py` | `dashboard.html`, `index.html` |
| Novo (React/TS) | `frontend/src/**` | `cd frontend && npm run build` | `frontend/dist/` |

## Proibições

- **Nunca edite `dashboard.html` nem `index.html`.** São gerados e embutem o
  SheetJS. Editar ali é perder o trabalho no próximo build. Estão em `deny`.
- **Nunca abra `src/dashboard.tpl.html` inteiro** (3.802 linhas). `grep -n`
  para achar, `sed -n 'a,bp'` para ler a faixa.
- Mexeu no legado sem rodar `python src/build.py` = mudança que não chega
  ao usuário.

## Ordem no Estoque

A **foto da peça é a primeira coluna/primeiro item** de qualquer listagem de
estoque. Não reordene para trás.

## Verificação proporcional

| Mudou | Verifique |
|---|---|
| `frontend/src/**` | `cd frontend && npm test && npm run build` (o build já roda `tsc --noEmit`) |
| `src/dashboard.tpl.html` | `python src/build.py` + `git diff --stat --ignore-cr-at-eol dashboard.html` |
| Tela que tem teste de navegador | a skill `ui-verification` (Playwright), não inspeção humana |

Detalhe de arquitetura: [docs/FRONTEND_ARCHITECTURE.md](../../docs/FRONTEND_ARCHITECTURE.md).
