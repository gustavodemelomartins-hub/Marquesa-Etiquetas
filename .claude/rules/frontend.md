---
paths:
  - "frontend/**"
  - "src/dashboard.tpl.html"
  - "src/build.py"
  - "index.html"
---

# Regras de frontend

Dois painéis vivem sobre o mesmo backend. Descubra em qual você está antes
de editar.

| Painel | Fonte | Build | Saída |
|---|---|---|---|
| Etiquetas (produção) | `index.html` | edição direta | — é a própria fonte |
| Dashboard (produção) | `src/dashboard.tpl.html` | `python src/build.py` (lê CSS/SheetJS de dentro de `index.html`) | `dashboard.html` |
| Novo (React/TS) | `frontend/src/**` | `cd frontend && npm run build` | `frontend/dist/` |

## Proibições

- **Nunca edite `dashboard.html`.** É gerado e embute o SheetJS. Editar ali
  é perder o trabalho no próximo build. Está em `deny`.
- `index.html` é a fonte real da tela de Etiquetas — editável (`Edit`
  liberado, `Write` continua bloqueado). É módulo legado estável: mudança
  ali deve ser pontual (ex.: um botão do cabeçalho), sem refatorar
  impressão/cadastro/CSS/JS existentes sem pedido explícito.
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
