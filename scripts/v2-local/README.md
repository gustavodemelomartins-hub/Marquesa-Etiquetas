# V2 local, sem nuvem

Sobe o **Worker real** — `api/src/index.js`, mesmo roteador e mesmos
handlers — com o binding `DB` apontando para um SQLite em memória criado de
`api/schema.sql`. Este processo não tem binding para nuvem nenhuma: não há
caminho daqui até PROD, até o D1 remoto ou até a Nuvemshop. Não por
disciplina — por ausência.

```bash
# da raiz do repositório
node scripts/v2-local/worker-local.mjs . 8787 scripts/v2-local/seed-catalogo.sql &
node scripts/v2-local/semear.mjs

cd frontend && npm run build && cd ..
node scripts/v2-local/serve-app.mjs frontend/dist 5173 &
```

Abra `http://127.0.0.1:5173`. Endereço da API `http://127.0.0.1:8787`,
chave `chave-local-de-teste`.

`subir.sh` faz os dois primeiros passos de uma vez.

## O seed

`seed-catalogo.sql` carrega só CATÁLOGO e razão de estoque, respeitando a
invariante `produtos.qtd == SUM(movimentos.qtd)`.

Todo o resto — cliente, venda, pagamento, garantia, troca, crédito — entra
por `semear.mjs`, **pelas rotas reais**, e portanto pelas mesmas regras de
negócio da produção. Se uma regra recusar, o seed falha. É o que se quer: o
dado da tela precisa ser um dado que o sistema aceitaria de verdade.

O cenário foi desenhado para mostrar §30 (vendeu 10/09, recebeu 12/09),
§38 (comprou, pago e em aberto, que não fecham entre si), pagamento
parcial, garantia em andamento, troca por peça mais barata virando crédito,
e §2 (duas "Camila Souza", que só a cidade distingue).

## O E2E

```bash
node scripts/v2-local/e2e-completo.mjs
```

Dezoito checagens num viewport de telefone, com os dois servidores no ar.
Precisa de Playwright (`npm i playwright`).
