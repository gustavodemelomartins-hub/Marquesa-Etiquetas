# Encerramento da sessão — 2026-09-06

> Documento histórico. Governança vigente: `docs/SECURITY.md` (2026-09-08).

> Este documento é escrito **antes** do deploy de produção. `wrangler deploy`,
> `wrangler pages deploy` e qualquer `wrangler d1 execute --remote` com
> escrita são Classe C (docs/SECURITY.md) e estão no `deny` do
> `.claude/settings.json` — nenhum agente os executa, com ou sem aprovação.
> O que este documento fecha é a **decisão pronta para publicar**, não a
> publicação em si. Os comandos exatos que faltam (backup, migration,
> deploy) estão na seção "O que falta — comandos para rodar" no final.

## Commit final desta sessão (branch `claude/marquesa-operational-review-eztpzt`)

| | |
|---|---|
| `main` antes desta sessão | `d3a2740` |
| Ponta do branch antes desta sessão | `7c5f8d0` (10 commits à frente de `main`) |
| Commit que desliga Produtos Montáveis | `1ca62f6` — `fix: Produtos Montáveis fica pronto mas fechado até fechar SKU comercial x base` |
| Ponta do branch ao fechar esta sessão | `1ca62f6` (mais este próprio documento, em commit separado) |

## O pacote que vai para produção hoje (as 10 commits + os ajustes desta sessão)

```
7c5f8d0  fix: Top Revendedoras ficava desatualizado depois de um acerto em outro lugar
ab3ea3a  docs: eram dois ALTER TABLE, não três, e a medição de D1 nunca leu produção
044af41  docs: o relatório da revisão 1, e as regras novas onde elas moram
e7bac41  feat: uma variante por combinação seriam 1.728 cadastros que ninguém mantém
8c28337  feat: o sistema dizia "revisar variação" com precisão e não deixava responder
5b9aa09  feat: o código estava errado e as duas saídas óbvias eram as duas erradas
c6ff1fe  feat: o gráfico tinha 25 barras e nenhuma delas respondia nada
d56463d  feat: o prazo era um campo de data cru sempre vazio, e a diferença não tinha botão
6f39c6e  feat: a peça trocada some da ficha, e a diferença de R$ 10 não tinha onde ser cobrada
a16d004  perf: uma consulta lia 298 mil linhas por clique, e a cota do D1 é da conta
```

mais os commits desta sessão que **desligam** Produtos Montáveis (listados
abaixo, categoria 3).

**Nenhuma dessas 10 commits foi reordenada, dividida ou reescrita.** O
histórico já estava assim quando a sessão começou, e reescrever commit
publicado é operação destrutiva — fora de escopo sem pedido explícito. A
separação entre "o que é Produtos Montáveis" e "o que não é" está feita por
**arquivo**, abaixo, não por commit.

### Dentro dessas 10 commits, o que é especificamente Produtos Montáveis

| O quê | Onde | Commit que introduziu |
|---|---|---|
| Backend (`listarModelos`, `salvarModelo`, `prepararPersonalizacoes`, `gravarPersonalizacoes`, `personalizacoesDeVendas`) | `api/src/personalizacao.js` (arquivo inteiro, 448 linhas) | `e7bac41` |
| Rotas `GET`/`POST /api/personalizacao/modelos`, campo `personalizacoes` em `POST /api/vendas` | `api/src/index.js` | `e7bac41` |
| UI do carrinho ("Monte seu colar", botão "+ Colar personalizado") | `src/dashboard.tpl.html` | `e7bac41` (e ajustes em `c6ff1fe`, `5b9aa09`, `8c28337`) |
| 4 tabelas (`personalizacao_modelos`, `personalizacao_opcoes`, `venda_personalizacoes`, `venda_personalizacao_itens`) | `api/migracao-pos-golive-1.sql` linhas 162–274 (seção 5) | `a16d004` (o arquivo inteiro nasceu nesta commit, junto com índices e outras tabelas que NÃO são desta feature) |
| Regra de negócio documentada | `api/REGRAS.md` § 42 | `044af41` |
| Checklist manual de validação | `MONTE_SEU_COLAR_CHECKLIST.md` | `7c5f8d0` |
| Cenários de teste N/O | `src/pos-golive-1-test.mjs` linhas 602–759, `src/pos-golive-1-ui-test.mjs` § 7 | espalhado em `c6ff1fe`, `5b9aa09`, `8c28337`, `e7bac41` |

Todo o resto dessas 10 commits (correção de `/api/vendas/dia`, dinheiro por
data de pagamento, A Receber, Comprou/Pago/Em aberto, Garantia/Troca com
diferença como receita, correção de SKU, Central de Pendências, resolução de
variação, otimização de `/api/variacoes/revisao`, Top Revendedoras pelo
histórico real) **não toca Produtos Montáveis** e está pronto para produção.

## O que esta sessão adicionou (categoria 3 — desligar a feature)

Uma trava operacional mínima, reaproveitando o único padrão de feature flag
que já existe no projeto (`NUVEMSHOP_WRITES_ENABLED` em `api/wrangler.toml` +
`api/src/nuvemshop.js`): fail-closed, só a string exata `"true"` liga.

| Arquivo | Mudança |
|---|---|
| `api/src/personalizacao.js` | `export function personalizacaoAtiva(env)` — mesma lógica de `NUVEMSHOP_WRITES_ENABLED` |
| `api/src/index.js` | `GET`/`POST /api/personalizacao/modelos` respondem `503 PERSONALIZACAO_DESATIVADA`; `registrarVenda` recusa `personalizacoes` não vazio com o mesmo 503, antes de tocar catálogo ou D1 — venda comum (sem composição) não passa por esse trecho e não muda |
| `api/wrangler.toml` | `[vars]` (produção) ganha `PERSONALIZACAO_ATIVA = "false"`; `[env.staging.vars]` (DEV) ganha `PERSONALIZACAO_ATIVA = "true"`, para o checklist manual continuar testável amanhã sem passo extra |
| `src/dashboard.tpl.html` | botão "+ Colar personalizado" comentado (não removido); a chamada a `montarBoxColar()` dentro de `abrirFecharVenda()` comentada — sem isso, toda venda (inclusive normal) bateria em `/api/personalizacao/modelos`, receberia 503 e mostraria a seção "Monte seu colar" com uma mensagem de erro em vez de escondê-la |
| `dashboard.html` | regerado com `python src/build.py` a partir do template acima |
| `api/migracao-pos-golive-1.sql` | comentário de decisão no cabeçalho (ver seção seguinte) — nenhuma instrução SQL mudou |

Reverter amanhã: `PERSONALIZACAO_ATIVA = "true"` em produção + descomentar as
duas linhas em `src/dashboard.tpl.html` + rebuild. Três pontos, todos
comentados no próprio código com a data de hoje.

## Decisão sobre a migration (`api/migracao-pos-golive-1.sql`)

**As 4 tabelas de Produtos Montáveis PERMANECEM na migration de hoje — não
foram separadas para amanhã.**

Critério aplicado (o que a instrução desta rodada pediu): a seção 5 do
arquivo é só `CREATE TABLE IF NOT EXISTS` + índices — nenhum `ALTER TABLE` em
tabela existente, nenhuma linha gravada por ela sozinha. O código que
escreveria nelas (`salvarModelo`, `prepararPersonalizacoes`,
`gravarPersonalizacoes`) está atrás de `personalizacaoAtiva(env)`, que em
produção é `false`: as rotas recusam com 503 antes de qualquer `INSERT`. Ou
seja, quatro tabelas nascem e ficam vazias — comportamento idêntico a não
tê-las criado, para qualquer outra feature.

O motivo para NÃO separar, além de ser desnecessário: o código de leitura
(`listarModelos`, `personalizacoesDeVendas`) já é escrito para tolerar tabela
ausente (`.catch(() => ({ results: [] }))`), mas isso é defesa, não a razão
principal — a razão é que dividir esta migration sob pressão de deploy, para
um ganho que não existe (o comportamento observável é o mesmo com ou sem as
4 tabelas), é o tipo de reescrita de última hora que este projeto trata como
risco, não como cautela.

As outras 4 seções da migration (índices de leitura, `maleta_item_variacoes`,
`garantia_trocas.venda_id`, `venda_item_correcoes`, `vendas.vencimento_em`)
são as que o pacote de hoje usa de verdade e não têm nenhuma relação com
Produtos Montáveis.

## Testes executados

Todos localmente, Windows, `wrangler dev --local`, banco resetado
(`schema.sql` + `api/migracao-pos-golive-1.sql`) antes de cada rodada citada
como limpa. `PERSONALIZACAO_ATIVA` **ausente** nas rodadas abaixo — o mesmo
estado de produção (fail-closed, resolve para `false`).

| Teste | Resultado | Observação |
|---|---|---|
| `src/pos-golive-1-test.mjs` | **154 ok, 1 falha esperada** | A única falha é `POST /api/personalizacao/modelos → 503` (cenário N/O, pediu 200). Comportamento correto da trava; o script não trata 503 e aborta com uma exceção logo depois — por isso não há contagem para além da linha 618 do arquivo, mas essa é a última seção do arquivo (nada de cobertura foi perdido). Cobre: cartões por data, dinheiro por data de pagamento, garantia/troca com diferença como receita, A Receber (venda fiada e diferença de troca), Comprou/Pago/Em aberto, prazo de venda, resumo mensal, correção de SKU (venda operacional e histórico), Central de Pendências e resolução de variação (por venda e por maleta) |
| `src/pos-golive-1-variacoes-test.mjs` | **27 ok, 0 falhas** | Freio de maleta sem variação identificada, destravar sem mexer em estoque, reconciliação READ-ONLY (cenário T) — confirmado que nenhum saldo mudou e nenhuma escrita saiu para a loja falsa |
| `src/revendedoras-test.mjs` (Playwright) | **39 ok, 1 falha conhecida** | A falha é o cálculo de "Giro" (30 de 40) — é exatamente a decisão de negócio pendente que esta rodada foi instruída a NÃO inventar. Tudo o resto passa, inclusive o Bug A (Top Revendedoras pelo histórico real, não pelo tamanho da maleta de hoje), Anexo I com preview obrigatório, ficha da revendedora, e "nenhum erro de console" |
| `src/sync-test.mjs` | **71 ok, 0 falhas** | Rodado porque `sync.js` foi reescrito nesta leva de commits (`8c28337`) |
| `src/variacoes-test.mjs` | **58 ok, 0 falhas** | Rodado porque `variantes.js` foi reescrito na mesma commit |

**Total: 349 ok, 2 falhas — as duas exatamente as esperadas e já conhecidas
antes de rodar o teste** (Produtos Montáveis desligado por decisão desta
sessão; Giro pendente de decisão de negócio, fora de escopo hoje).

`GET /api/estoque/conferir` voltou `{"ok":true,"divergentes":[]}` em cada
rodada. Nenhum saldo negativo em nenhum teste. `python src/build.py` rodou
sem erro e o diff de `dashboard.html` é só a mudança do botão comentado.

### O que não rodou nesta sessão

`kits-test.mjs`, `e2e.mjs`, `fase2-telas-test.mjs`, `catalogo-test.mjs` e o
resto da suíte de 2026-08-23 (`docs/BASELINE.md`) **não foram re-rodados**:
nenhum arquivo que eles cobrem foi tocado por esta sessão nem pelas 10
commits anteriores (conferido por `git diff --stat main..HEAD`). Rodar a
suíte inteira por reflexo não é a régua deste projeto — é rodar o que o diff
justifica.

`frontend/` (React/TS) não foi tocado nesta sessão — nenhuma mudança de hoje
alcança o painel novo.

## Estado do estoque, A Receber e Revendedoras

Os números acima são do **banco de teste local**, não de produção — este
agente não tem acesso de leitura a `marquesa-db-prod` (`wrangler d1 execute
--remote` está no `deny`, mesmo para `SELECT`). A prova de que a razão fecha
**em produção**, com os dados reais, é o `GET /api/estoque/conferir` que a
pessoa que publicar deve rodar depois do deploy — item já na lista de smoke
test abaixo.

## Nuvemshop

Nenhuma escrita saiu para a Nuvemshop nesta sessão. Toda sincronização
testada rodou contra `src/loja-falsa.mjs`, em `localhost`. `POST /api/sync`
com `forcar: true` não foi chamado nem cogitado. Reconciliação testada
(cenário T) é confirmadamente READ-ONLY: nenhum saldo mudou, nenhuma
requisição de escrita saiu para a loja de mentira.

## Rollback

| | |
|---|---|
| Código (Worker) | O Cloudflare guarda a versão publicada anterior — reverter é escolher a versão anterior na aba **Deployments** do Worker `marquesa-api`, ou publicar de novo a partir do commit `d3a2740` (o `main` de antes desta sessão) |
| Código (painel) | Reverter o commit no branch que o GitHub Pages serve |
| Banco | Bookmark de Time Travel a ser anotado **no momento do backup**, antes de qualquer migration — ver comando abaixo. `marquesa-db-prod` aceita Time Travel dos últimos 30 dias sem exigir o export |
| Sinal de que deu errado | `GET /api/health` não responde `{"ok":true}`; `GET /api/estoque/conferir` retorna algo em `divergentes`; qualquer rota citada no smoke test abaixo responde 500 |
| Quem decide reverter | Gustavo, a qualquer momento após o deploy — não há prazo definido nesta sessão |

## Funcionalidades que ficaram para amanhã

1. **Produtos Montáveis / Monte seu Colar** — código e schema preservados,
   acesso fechado por `PERSONALIZACAO_ATIVA`. Ver seção dedicada abaixo.
2. **"Giro" das Revendedoras** — decisão de negócio pendente, não resolvida
   nesta sessão nem inventada. `src/revendedoras-test.mjs` documenta a
   asserção que falha (`e o giro em cima do que saiu (30 de 40)`) até a regra
   ser definida. Enquanto isso, o número exibido não deve ser tratado como
   confiável — considerar exibir "—"/"Dados insuficientes" na tela é uma
   opção para quando essa decisão for tomada, não uma mudança feita hoje.

---

# RETOMAR AMANHÃ — PRODUTOS MONTÁVEIS

O que já ficou definido e não deve ser reaberto/redecidido sem motivo — só
implementado:

- Aproveitar o motor de kits existente (`kit_componentes`) pela IDEIA e pelo
  mecanismo de baixa — não pela composição fixa, que não serve aqui.
- Produto comercial não representa necessariamente estoque físico direto:
  SKU comercial é separado do SKU da base.
- SKU comercial × SKU da base × SKUs dos componentes precisam de um
  mapeamento fechado antes de ir ao ar — é o que ficou pendente e bloqueou o
  lançamento de hoje.
- Componentes apontam para SKUs físicos reais do catálogo — nunca uma "cor"
  abstrata. Selecionar o pingente físico real do estoque, não um atributo.
- Suportar Ouro 18k e Prata 925.
- Base Veneziana 45 cm como padrão, com possibilidade de trocar a base.
- Mostrar somente pingentes compatíveis/disponíveis no estoque (a
  disponibilidade vem do mesmo `saldosDoSku` que a venda usa — já
  implementado em `listarModelos`).
- Modelos prontos como referência: Colar Casal, Dois Meninos, Duas Meninas
  etc.
- Preço base + regras/acréscimos.
- Composição congelada na venda (já implementado: `venda_personalizacoes` +
  `venda_personalizacao_itens` gravam nome e configuração no momento da
  venda, imunes a mudança posterior do modelo).
- Baixa automática dos componentes (já implementado).
- Cancelamento/estorno de **todos** os componentes da composição — não só da
  base. **Gap conhecido e já registrado**: `MONTE_SEU_COLAR_CHECKLIST.md`
  item 14 documenta que o cancelamento hoje estorna a base mas não os
  componentes. Isto precisa ser fechado antes de reativar a feature.
- Integração futura com a Nuvemshop, usando o mesmo motor de regras
  (`GET /api/personalizacao/modelos` como dado, `POST /api/vendas` como
  entrada — arquitetura já pensada para isso em `api/src/personalizacao.js`
  § 7.5, não implementada).
- Arquitetura genérica para pulseiras, berloques e outros produtos
  montáveis, não só colares — generalizar depois que o colar estiver
  fechado ponta a ponta, não antes.

Nenhuma decisão nova sobre estes pontos foi tomada nesta sessão — este
resumo é só o que já estava definido, reunido num lugar para retomar sem
precisar reconstruir o contexto.

---

## O que falta — comandos para rodar (Classe C, execução humana)

Nenhum destes comandos foi executado por este agente. `wrangler deploy`,
`wrangler pages deploy` e `wrangler d1 execute --remote` (com escrita) são
negados no `.claude/settings.json` independentemente de aprovação.

```bash
# 1. Backup + bookmark de Time Travel (obrigatório antes da migration)
cd api
npx wrangler d1 time-travel info 51dd629b-52dc-46d0-a1af-fa37f0a79533
npx wrangler d1 export DB --remote \
  --output ../backups/d1/<AAAA-MM-DD_HH-mm>/producao-51dd629b-<AAAA-MM-DD>.sql
# conferir: tamanho plausível, CREATE TABLE / INSERT presentes, razão fecha
# (ver docs/BACKUP_RECOVERY.md § 3)

# 2. Migration (roda ANTES do deploy do Worker — o código novo não depende
#    de nenhuma coluna nova, mas a ordem documentada no projeto é sempre
#    banco primeiro)
npx wrangler d1 execute DB --remote --file=migracao-pos-golive-1.sql
# conferir:
npx wrangler d1 execute DB --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'personalizacao%' OR name IN ('maleta_item_variacoes','venda_item_correcoes')"

# 3. Deploy do Worker (produção — SEM --env)
npx wrangler deploy

# 4. Deploy do painel (dashboard.html já está regerado e commitado)
# — pelo caminho que este projeto já usa para publicar o painel de produção

# 5. Smoke test
curl -s https://<worker-de-producao>/api/health
curl -s -H "Authorization: Bearer <API_KEY>" https://<worker-de-producao>/api/estoque/conferir
# abrir o painel publicado e conferir, olhando de verdade:
#   - painel abre, estoque, lançamentos, clientes, revendedoras, A Receber
#   - histórico por data, garantia, correção de SKU, Central de Pendências
#   - NENHUMA rota crítica responde 500
#   - "+ Colar personalizado" NÃO aparece na tela de Vendas
#   - POST /api/personalizacao/modelos responde 503 PERSONALIZACAO_DESATIVADA
```

## Estado final

`SESSION_CLOSED_WITH_BLOCKER` — não porque algo deu errado, mas porque o
próprio deploy (`wrangler deploy`, migration remota, `wrangler pages deploy`)
é Classe C e esta sessão não o executa por construção. O código, os testes e
a decisão de migration estão prontos; falta o passo humano descrito acima
para a sessão virar `SESSION_CLOSED_PRODUCTION_OPERATIONAL`.
