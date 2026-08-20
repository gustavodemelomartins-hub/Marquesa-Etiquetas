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
| Etiquetas (app autônomo) | `index.html` | edição direta | — é a própria fonte |
| Dashboard (produção) | `src/dashboard.tpl.html` | `python src/build.py` (lê CSS/SheetJS de dentro de `index.html`) | `dashboard.html` |
| Novo (React/TS) | `frontend/src/**` | `cd frontend && npm run build` | `frontend/dist/` |

## Proibições

- **Nunca edite `dashboard.html`.** É gerado e embute o SheetJS. Editar ali
  é perder o trabalho no próximo build. Está em `deny`.
- `index.html` é a fonte real do app de Etiquetas autônomo, e a fonte do CSS
  e das bibliotecas (SheetJS, JsBarcode, jsPDF) que o `build.py` extrai —
  editável (`Edit` liberado, `Write` continua bloqueado). É módulo legado
  estável: mudança ali deve ser pontual, sem refatorar impressão/cadastro/
  CSS/JS existentes sem pedido explícito.
- **A tela de Etiquetas que a usuária vê é a do painel** (`window.Etq` em
  `src/dashboard.tpl.html`), não o `index.html`. Ela é um porte fiel: a
  regra de negócio — folha Pimaco 7×18, calibração de 0,5 mm, mapeamento de
  coluna na importação, chave `marquesa_etiquetas_v1` no localStorage — veio
  linha a linha do original. Mexer numa e não na outra faz as duas
  divergirem em silêncio.
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
