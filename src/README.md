# Código-fonte do dashboard

O `dashboard.html` da raiz é **montado**, não editado à mão. Ele tem quase
400 KB porque carrega o CSS e a biblioteca de planilhas embutidos — o que faz
o app funcionar offline, mas o torna péssimo de editar.

**Edite `dashboard.tpl.html`** e rode o build:

```bash
python3 src/build.py
```

O script pega o CSS e o SheetJS de dentro do `index.html` (o app de etiquetas)
e injeta no template, nos lugares marcados por `/*__BASE_CSS__*/` e
`<!--__SHEETJS__-->`. É por isso que os dois apps têm exatamente a mesma cara:
existe uma folha de estilo só, e ela mora no `index.html`.

As fronteiras dos blocos são achadas por conteúdo, não por número de linha, e
o script confere o tamanho do que extraiu — então mexer no `index.html` não
quebra a montagem em silêncio.

## Testar

```bash
src/reset-e-testar.sh
```

Zera o banco local, sobe o Worker em `localhost:8787`, serve o dashboard em
`localhost:8000` e roda o `e2e.mjs` — que abre um navegador de verdade e
percorre o caminho inteiro: conectar, importar catálogo, montar maleta
bipando, fazer o acerto, conferir que a razão fecha (§19).

Nada disso toca a nuvem: o `--local` do wrangler usa um SQLite dentro de
`api/.wrangler`, e a chave de teste sai do `api/.dev.vars`.

Precisa de `playwright` e `xlsx` instalados (`npm install` dentro de `src/`).
