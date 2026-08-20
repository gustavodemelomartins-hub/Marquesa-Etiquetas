---
name: ui-verification
description: Carregue para PROVAR que uma tela funciona depois de mexer nela — escolhe o teste de navegador certo (Playwright) em vez de pedir inspeção humana ou olhar screenshot. Vale para o painel legado e para o frontend React.
---

# Provar a tela, não descrevê-la

"Editei o arquivo" não é verificação. Existe teste de navegador de verdade —
Playwright, Chromium real — para quase toda tela deste projeto. Use o
**direcionado**, não a suíte inteira.

## Escolha o teste pela tela que mudou

| Mudou | Rode |
|---|---|
| Painel legado (`src/dashboard.tpl.html`) | `node src/e2e.mjs` |
| Frontend React, geral | `node src/frontend-e2e.mjs` |
| Estoque Total — "Atualizar" | `node src/estoque-total-e2e.mjs` |
| Estoque Total — "Adicionar Peças Novas" | `node src/produtos-novos-e2e.mjs` |
| Foto da peça / upload / R2 | `node src/foto-modal-test.mjs` |
| Componente ou hook isolado | `cd frontend && npm test` (vitest, sem navegador — mais barato) |

Componente puro: pare no vitest. Só suba navegador quando o que mudou é o
fluxo entre telas.

## Pré-requisitos (o teste falha feio sem eles)

```bash
npx wrangler dev --local --port 8787        # Worker local, banco LIMPO
python -m http.server 8000                  # serve dashboard.html e frontend/dist
cd src && npm install && npx playwright install chromium   # uma vez só
```

Painel legado alterado exige `python src/build.py` **antes** — o teste lê o
`dashboard.html` gerado, não o template.

## Ler o resultado

Cada teste imprime `ok` / `FALHA` e sai com código 1 se falhou. Sem
framework, de propósito.

- **Não cole a saída inteira** no relatório. Cite a contagem de asserções e
  a linha exata do primeiro `FALHA`.
- Falha de ambiente (`.dev.vars` incompleto, porta ocupada, banco sujo) é
  **falha de ambiente** — diga isso, não a chame de regressão.
- Teste verde não vira "está pronto" se você não rodou o teste da tela que
  mudou. Diga qual você rodou e qual deixou de fora.

`node src/shot.mjs` tira screenshots (celular + computador) para conferir
visual — complemento, nunca substituto do teste.

Catálogo completo e o que cada um prova: [docs/TESTING.md](../../../docs/TESTING.md).
