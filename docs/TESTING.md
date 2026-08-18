# Testes

Nenhum teste toca a nuvem. Todos rodam contra o Worker local
(`localhost:8787`), um SQLite dentro de `api/.wrangler` e — quando o assunto
é Nuvemshop — a loja de mentira de [src/loja-falsa.mjs](../src/loja-falsa.mjs).

Não há framework: cada arquivo é um script que imprime `ok` / `FALHA` e sai
com código 1 se falhou alguma coisa. Manter esse estilo é mais barato que
introduzir um runner.

## Pré-requisitos comuns

1. Worker local no ar (`npx wrangler dev --local --port 8787`);
2. **banco limpo** — as contagens mudam se sobrar dado de outro teste;
3. `api/.dev.vars` completo, incluindo as variáveis de OAuth. Ver
   [DEVELOPMENT.md](DEVELOPMENT.md).

> Faltar `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET` e
> `NUVEMSHOP_AUTH_BASE` no `.dev.vars` derruba exatamente 3 asserções da
> seção 10 do `sync-test` ("troca do código pelo token"). É falha de
> ambiente, não de produto — o `src/README.md` não listava essas três.

## Os testes

### `src/sync-test.mjs` — sincronização com a Nuvemshop
**67 asserções · ~10 s · precisa da loja falsa (ele mesmo a sobe)**

14 seções. O que fica provado, em ordem de importância:

1. pedido do site vira venda daqui e baixa o estoque;
2. o empurrão manda o estoque certo, e **só de quem ele conhece**;
3. rodar de novo **não cobra a mesma venda duas vezes** (idempotência pelo
   índice único `vendas.externo_id`);
4. a ordem certa — **puxar antes de empurrar**, senão a sincronização desfaz
   a própria venda;
5. item de pedido que não casa com o catálogo é anunciado, não engolido;
6. pedido cancelado no site não vira venda;
7. o freio segura uma rodada grande demais em vez de aplicar;
8. e aplica quando alguém manda aplicar (`forcar`);
9. token sem permissão de pedidos devolve a mensagem que diz o que fazer
   (o erro real de produção);
10. a troca do código pelo token (caminho do app de parceiro) funciona e
    mostra token e id da loja para copiar;
11. **a razão fecha** depois de tudo (§19);
12. a rodada guarda o retrato da loja que leu;
13. produto tirado do ar na loja deixa de constar como publicado aqui;
14. variação não é cadastro duplicado — e o código com variação volta a ser
    empurrado, cada aro na caixinha dele.

### `src/variacoes-test.mjs` — aro do anel, comprimento da corrente
**48 asserções · ~6 s · precisa da loja falsa**

13 seções:

1. a sincronização descobre **e reparte sozinha**;
2. semear **não desfaz** o que já foi mexido à mão (a regra do código virgem);
3. a soma da loja tem de bater com o estoque, e a recusa explica;
4. repartir **não muda o total** do código (§19: são dois atos diferentes);
5. código **com** variação exige dizer qual, inclusive pela API;
6. código **sem** variação não muda em nada;
7. vender um aro baixa o aro **e** o total;
8. a razão fecha (§19);
9. aro que sumiu da loja some daqui na rodada seguinte;
10. cada variação volta para a caixinha dela na loja;
11. peça em maleta ainda segura o empurrão;
12. soma da loja que não bate não é repartida;
13. dá para desfazer uma repartição automática que não devia ter havido.

### `src/kits-test.mjs` — peça vendida inteira ou desmontada
**20 asserções · ~1 s · não precisa da loja falsa**

Reproduz o caso real: "Colar Casal de Filhos" (corrente + dois pingentes)
publicado também como "Colar Filho(a)" avulso, os dois anúncios disputando o
mesmo estoque físico.

1. não deixa um SKU com saldo próprio virar kit;
2. monta os dois kits;
3. com 1 de cada componente, os **dois** anúncios mostram 1;
4. **vender um derruba o outro na hora** — o problema real;
5. cancelar a venda devolve tudo aos componentes;
6. o carrinho recusa vender os dois juntos quando só há peça para um
   (validação contra o que as outras linhas do mesmo carrinho já reservaram);
7. kit não entra em maleta;
8. inventário ignora os kits e conta só os componentes reais;
9. a razão fecha no fim de tudo (§19).

### `src/e2e.mjs` — o caminho inteiro num navegador de verdade
**Playwright · não roda no Windows como está** (ver limitações)

12 seções, do portal de conexão ao fim: conectar, importar catálogo de uma
planilha fictícia, cadastrar revendedora pela tela, montar maleta bipando,
fazer o acerto, recarregar a página como se fosse outro aparelho,
**conferir que a razão fecha (§19)**, venda de balcão, inventário, o leitor
de código de barras (o caminho do iPhone) e, no fim, que **nenhum erro de
console apareceu**.

É o único teste que prova que a interface e a API conversam.

### `src/import-casa-test.mjs` — "total ou só em casa?"
**Playwright · não roda no Windows como está**

Prova o botão da importação que pergunta se os números da planilha são o
total ou só o que está em casa. O risco que ele evita: uma planilha que
contou só a prateleira, comparada direto contra o total do sistema, corta a
peça que está numa maleta aberta — ela não sumiu, só mudou de lugar.

Cenário: C1 tem 10 no total, 3 numa maleta aberta, 7 deveriam estar em casa.

### `src/loja-falsa.mjs` — infraestrutura, não teste
Nuvemshop de mentira em `localhost:8799`. Exige `User-Agent` (a real
responde 400 sem ele), pagina como a real, guarda tudo que chega no `PATCH`
e implementa a troca OAuth.

### `src/shot.mjs` — fotos das telas
**Playwright · não roda no Windows como está**

Não é teste: tira fotos da Visão geral, das Vendas e das telas de inventário
e venda em tamanho de celular, para conferir o visual depois de mexer no
front. Roda depois do `e2e`, que deixa o banco com dados de exemplo.

### `api/test-api.mjs`
Script auxiliar de chamada à API. Não faz parte da suíte.

## Como rodar

### Linux / macOS

```bash
src/reset-e-testar.sh          # zera o banco, sobe tudo e roda o e2e
node src/sync-test.mjs         # com banco limpo e Worker no ar
node src/variacoes-test.mjs
node src/kits-test.mjs
```

### Windows

`src/reset-e-testar.sh` **não roda no Windows**: usa `setsid` (ausente no
Git Bash) e um `pkill` que não alcança o processo do Wrangler. Os três
testes de API rodam normalmente desde que o ciclo seja feito à mão:

```bash
# 1. derrubar o Worker (ele segura o arquivo do SQLite)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*wrangler*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }; Get-Process workerd -EA SilentlyContinue | Stop-Process -Force"

# 2. zerar o banco e recriar o schema
cd api && rm -rf .wrangler/state
npx wrangler d1 execute marquesa-db --local --file=schema.sql

# 3. subir o Worker e esperar o /api/health responder
npx wrangler dev --local --port 8787 &

# 4. rodar UM teste
node ../src/sync-test.mjs
```

Repita os passos 1–4 para cada teste: banco limpo é requisito, não capricho.

## Limitações conhecidas do ambiente

| Limitação | Efeito | Onde consertar |
|---|---|---|
| `executablePath: '/opt/pw-browsers/chromium'` fixo em `e2e.mjs`, `import-casa-test.mjs`, `shot.mjs` | Os três só rodam onde esse caminho existe (Linux) | [TECH_DEBT.md](TECH_DEBT.md) |
| `reset-e-testar.sh` usa `setsid` e `pkill` | Não roda no Windows | idem |
| `npm run build` chama `python3` | Falha no Windows, onde o comando é `python` | idem |
| Cada teste exige reset manual do banco | Não dá para rodar a suíte inteira de uma vez | idem |

Nenhuma delas foi corrigida nesta etapa — são mudanças de código, e a etapa
era de organização.

## O que a suíte **não** cobre

- `comissao.js` — as faixas do acerto não têm teste próprio; só passam pelo
  caminho do `e2e`;
- `inventario.js` — coberto de raspão pelo `e2e` e pelo `kits-test`;
- rotas de revendedora, cliente e categoria fora do caminho do `e2e`;
- comportamento contra a Nuvemshop **de verdade** (por definição: a loja
  falsa imita o que se sabe que ela faz);
- concorrência: duas rodadas de sincronização ao mesmo tempo.

## Baseline atual

Resultados medidos em 2026-08-18 estão em [BASELINE.md](BASELINE.md).
