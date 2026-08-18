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
3. `api/.dev.vars` completo: as variáveis de OAuth **e**
   `ORIGENS_PERMITIDAS=http://localhost:8000`. Ver
   [DEVELOPMENT.md](DEVELOPMENT.md);
4. para os testes de navegador, também: `npm install` dentro de `src/`,
   `npx playwright install chromium`, e o dashboard servido por HTTP em
   `localhost:8000`.

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
**66 asserções · ~36 s · Playwright + servidor HTTP em `localhost:8000`**

12 seções, do portal de conexão ao fim: conectar, importar catálogo de uma
planilha fictícia, cadastrar revendedora pela tela, montar maleta bipando,
fazer o acerto, recarregar a página como se fosse outro aparelho,
**conferir que a razão fecha (§19)**, venda de balcão, inventário, o leitor
de código de barras (o caminho do iPhone) e, no fim, que **nenhum erro de
console apareceu**.

É o único teste que prova que a interface e a API conversam.

### `src/import-casa-test.mjs` — "total ou só em casa?"
**8 asserções · ~10 s · Playwright + servidor HTTP**

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
**Playwright. Não é teste.**

Não é teste: tira fotos da Visão geral, das Vendas e das telas de inventário
e venda em tamanho de celular, para conferir o visual depois de mexer no
front. Roda depois do `e2e`, que deixa o banco com dados de exemplo.

### `src/frontend-e2e.mjs` — o painel novo num navegador de verdade
**33 asserções · ~5 s · Playwright + servidor HTTP + build do frontend**

Prova o painel React/TypeScript sobre o mesmo backend:

1. o app abre **já conectado** — a conexão do painel legado é reaproveitada
   (mesma chave de `localStorage`, mesmo formato);
2. a tela Nuvemshop lê o estado real e mostra os números certos;
3. com a sincronização de pé, o estado diz "Sincronizando normalmente";
4. **divergência de estoque NÃO aparece como pendência** enquanto a
   sincronização estiver de pé — a rodada seguinte conserta sozinha, e
   listar isso como tarefa de alguém é o que faz o painel parecer sempre em
   chamas;
5. o que precisa de gente aparece em Pendências, com o motivo;
6. *Analisar sincronização* roda a rodada seca e mostra o diff classificado
   por risco;
7. **e não escreve nada na Nuvemshop** — a loja falsa registra tudo que
   recebe, e a contagem de escritas continua zero depois da análise inteira;
8. a aba Reconciliação recebe a mesma análise e diz que aprovar e aplicar
   ainda não existem;
9. **com a sincronização QUEBRADA (a loja falsa forçada a responder 500), a
   MESMA divergência vira a pendência mais séria da tela**, em primeiro
   lugar, carregando a mensagem que o servidor deu — não um texto genérico.
   É o teste de ponta a ponta do diagnóstico descrito em
   [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md);
10. o rodapé continua apontando para o painel legado;
11. nenhum erro de console.

Precisa do build pronto: `cd frontend && npm run build`.

### Testes unitários do frontend
**73 testes · Vitest · sem navegador**

```bash
cd frontend && npm test
```

Cobrem lógica pura e a camada de API, não aparência:

| Arquivo | O que prova |
|---|---|
| `src/features/nuvemshop/panorama.test.ts` | O porte de `panoramaLoja()` é fiel: divergência, falta cadastrar, oculto com peça, estoque negativo virando zero, produto sem preço não inventando R$ 0, e códigos que a rodada não empurra ficando fora de "estoque errado". E os **dois sentidos** da regra de divergência: o mesmo panorama conta 0 ou 2 pendências conforme a sincronização esteja de pé ou não |
| `src/features/nuvemshop/saude.test.ts` | O diagnóstico da sincronização: os sete estados, as bordas exatas dos dois limites (26 h de atraso, 1 h travada), a precedência entre eles, o timestamp do SQLite lido como UTC e não como hora local, e data ilegível **não** virando atraso silencioso |
| `src/features/reconciliacao/classificar.test.ts` | A classificação de risco, inclusive a assimetria deliberada (tirar do ar é pior que colocar à venda), a ordenação por atenção e a extração do nome da variação |
| `src/services/client.test.ts` | Bearer em toda chamada, mensagem de erro vinda do servidor, 401 marcado, falha de rede virando status 0, abortar não sendo erro, conexão no formato do painel legado |
| `src/services/sync.test.ts` | **`analisar` sempre manda `seco:true` e nunca manda `forcar`** — este frontend não escreve na loja |

Sem `jsdom` e sem `@testing-library` de propósito: aparência se prova no
navegador de verdade, não em DOM simulado.

### `src/dry-run-test.mjs` — o que a rodada seca escreve e o que não escreve
**49 asserções · ~15 s · precisa da loja falsa (ele mesmo a sobe)**

O teste mais paranoico da suíte, e o único que **lê o SQLite direto** em vez
de perguntar à API. Ele fotografa oito tabelas linha por linha antes e depois
de `POST /api/sync {"seco": true}`, e compara:

`produtos` · `movimentos` · `vendas` · `venda_itens` · `produto_variacoes` ·
`config` · `loja_snapshot` · `sync_execucoes` — mais o contador de escritas
da loja falsa.

Quatro seções:

0. **uma rodada real primeiro.** Foto de banco vazio não prova nada: "não
   mudou" seria verdade por falta de conteúdo.
1. **a rodada seca com trabalho de verdade esperando** — um pedido novo e
   estoque mexido na loja. Ela CONTA a venda e CALCULA as mudanças (provado),
   e mesmo assim não toca em saldo, razão, vendas nem na Nuvemshop.
   As colunas-espelho e o registro da execução, essas sim, mudam — e cada uma
   está afirmada explicitamente.
2. **rodar seco duas vezes é inofensivo**, inclusive `produto_variacoes`,
   que é apagada e regravada com o mesmo conteúdo.
3. **o freio pausa a rodada seca igual à real** — a checagem vem antes do
   `if (seco) return`, e é o que permite descobrir que a rodada travaria sem
   arriscar a loja.
4. **a rodada REAL, essa sim, escreve.** O contraste que fecha a prova: sem
   este bloco, todos os "não mudou" acima poderiam ser verdade por acidente.

A tabela do que muda e do que não muda está em
[SYNC_ENGINE.md](SYNC_ENGINE.md).

> Ele lê `api/.wrangler/state/.../*.sqlite` em modo somente-leitura, com o
> Worker no ar. SQLite aceita vários leitores; nada aqui escreve.

### `src/saude-sync-test.mjs` — uma análise nunca esconde uma falha real
**25 asserções · ~10 s · precisa da loja falsa (ele mesmo a sobe)**

Prova a correção do TECH_DEBT.md item 12: `resumoSync` responde a saúde
operacional a partir da última execução REAL, nunca de uma seca.

Quatro cenários, usando `loja.estado.falhar = true` (a loja falsa responde
500 em tudo) para forçar uma falha de verdade:

1. sync real falha → dry-run passa → a saúde **continua** `erro`;
2. sync real ok → dry-run ok → a saúde continua `ok`, sem mudança;
3. sync real pausada pelo freio → dry-run também pausa → a saúde **continua**
   `pausado`;
4. o caso simétrico: uma ANÁLISE que falha não pode contaminar uma
   sincronização real saudável.

Cada cenário confere `ultimaId` continua apontando para a execução real, não
para a seca — e `ultimaAnaliseEm` (quando a última análise rodou) fica
separado de `ultimaEm` (quando a última sincronização real terminou).

### `src/reconciliacao-schema-test.mjs` — o schema do motor de reconciliação
**65 asserções · ~40 s · roda `wrangler d1 execute` direto, SEM subir o
Worker, num banco descartável (`--persist-to` numa pasta temporária)**

O único teste da suíte que fala com o D1 local sem passar pelo Worker. Prova,
nessa ordem:

1. a migration aplica sobre o schema de **produção antes desta fase**
   (`git show f3f08cb:api/schema.sql` — reproduzível por qualquer clone, ao
   contrário de um dump de backup);
2. as duas tabelas, todas as colunas (inclusive a gerada,
   `variacao_chave` — que `pragma_table_info` omite; precisa de
   `pragma_table_xinfo`) e os cinco índices nascem certos;
3. nenhuma das 16 tabelas antigas some, e um produto+movimento inseridos
   ANTES da migration continuam intactos depois;
4. a unicidade `(sessao_id, sku, variacao_chave, tipo)` rejeita duplicata —
   inclusive com `variacao IS NULL` nos dois lados, e aceita variações
   diferentes do mesmo código;
5. no máximo uma sessão `revisao` por origem;
6. os `CHECK` de status/tipo/risco/origem aceitam o válido e recusam o
   inventado;
7. `migracao-reconciliacao.sql` roda duas vezes sem erro (tudo
   `IF NOT EXISTS`); `migracao-sync-seco.sql` roda uma segunda vez e
   **falha**, e isso é o esperado — mesmo padrão de `migracao-variacoes.sql`.

Detalhe completo do schema em
[RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md).

### `api/test-api.mjs`
Script auxiliar de chamada à API. Não faz parte da suíte.

## Como rodar

### Linux / macOS

```bash
src/reset-e-testar.sh          # zera o banco, sobe tudo e roda o e2e
node src/sync-test.mjs         # com banco limpo e Worker no ar
node src/variacoes-test.mjs
node src/kits-test.mjs
node src/frontend-e2e.mjs      # precisa de `cd frontend && npm run build` antes
node src/dry-run-test.mjs      # a prova formal do dry-run
node src/saude-sync-test.mjs   # análise nunca esconde falha real

cd frontend && npm test        # os 73 testes unitários, sem navegador

# este não precisa do Worker no ar — fala com o D1 local direto
node src/reconciliacao-schema-test.mjs
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

| Limitação | Efeito | Situação |
|---|---|---|
| `executablePath` fixo em `/opt/pw-browsers/chromium` | Os testes de navegador só rodavam no Linux | **Resolvido**: os três honram `PW_CHROMIUM` e, sem ela, usam o Chromium do Playwright |
| CORS derruba o `e2e` na tela de conexão | O navegador vem de `localhost:8000`, e o `wrangler.toml` libera só o endereço de produção | **Resolvido pelo ambiente**: `ORIGENS_PERMITIDAS=http://localhost:8000` no `.dev.vars` |
| `reset-e-testar.sh` usa `setsid` e `pkill` | Não roda no Windows | **Aberto** — [TECH_DEBT.md](TECH_DEBT.md) item 4 |
| `npm run build` chama `python3` | Falha no Windows, onde o comando é `python` | **Aberto** — item 6 |
| Cada teste exige reset manual do banco | Não dá para rodar a suíte inteira num comando | **Aberto** — item 4 |

O `wrangler dev` segura o arquivo do SQLite: derrube o processo **antes** de
apagar `.wrangler/state`, ou o `rm` falha com `Device or resource busy`.

## O que a suíte **não** cobre

- `comissao.js` — as faixas do acerto não têm teste próprio; só passam pelo
  caminho do `e2e`;
- `inventario.js` — coberto de raspão pelo `e2e` e pelo `kits-test`;
- rotas de revendedora, cliente e categoria fora do caminho do `e2e`;
- comportamento contra a Nuvemshop **de verdade** (por definição: a loja
  falsa imita o que se sabe que ela faz);
- concorrência: duas rodadas de sincronização ao mesmo tempo;
- o Apply do motor de reconciliação, porque ele não existe ainda — só o
  schema (`src/reconciliacao-schema-test.mjs`) e a correção de saúde de que
  ele depende (`src/saude-sync-test.mjs`). Ver
  [RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md).

## Baseline atual

Resultados medidos em 2026-08-18 estão em [BASELINE.md](BASELINE.md).
