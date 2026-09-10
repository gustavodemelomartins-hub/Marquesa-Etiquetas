# PRE_STAGING_GATE — revisão final antes de staging

> Documento histórico. DEV não é mais gate; governança vigente em
> `docs/SECURITY.md` (2026-09-08).

Revisão do pacote `claude/marquesa-operational-review-eztpzt`, trazido
para esta branch por fast-forward. **Nenhum deploy, migration em produção,
escrita na Nuvemshop ou merge em `main` foi executado.** Tudo abaixo rodou
contra Worker local (`--local`) e D1 local, com `api/migracao-pos-golive-1.sql`
aplicada só no banco local.

---

## 1. Inconsistência do relatório ("três" vs. dois `ALTER TABLE`)

**PASS.**

`grep -n "ALTER TABLE" api/migracao-pos-golive-1.sql` mostra exatamente
dois:
- `garantia_trocas.venda_id` (linha 102)
- `vendas.vencimento_em` (linha 288)

`docs/releases/POST_GOLIVE_REVIEW_1.md` dizia "Três" em dois lugares (linha 129 e a
linha de risco R7). Corrigido para "Dois" nos dois pontos. A migration em
si **não foi alterada** — só a documentação, que estava errada.

---

## 2. Revendedoras — 4 falhas pré-existentes em `revendedoras-test.mjs`

**Causa raiz identificada. Dois bugs reais, distintos, confirmados
pré-existentes em `main` (não é regressão deste pacote). Um corrigido
nesta branch; um documentado e não corrigido, por ser decisão de negócio.**

### Confirmação de que é pré-existente
`git diff main -- src/revendedoras-test.mjs` e o código exercido
(`src/dashboard.tpl.html`, `api/src/analytics.js`) são **idênticos** entre
`main` e esta branch nas regiões relevantes.

### Bug A — cache de leitura não revalidado (falhas 1, 2 e 4)
`acertosRevendedoras` é populado só por `carregarAcertosRevendedoras()`,
chamada apenas ao entrar na aba (`switchTab`). `renderAll()` — disparada
por **todo** `sincronizar()` — redesenhava a tabela sem buscar dado novo.
Some a isso a memoização de 60s de `api()` (`memoriaLeitura`, keyed por
`dadosVersao`), que só é invalidada por uma escrita feita **pela própria
página** — uma escrita de outro aparelho, ou (como no teste) via chamada
direta à API, não invalida nada localmente.

**Corrigido nesta branch** (`src/dashboard.tpl.html`):
- `renderAll()` agora, para a aba `revgeral`, também chama
  `carregarAcertosRevendedoras()` e redesenha com o resultado.
- `carregarAcertosRevendedoras()` agora chama `invalidarMemoriaLeitura()`
  antes de buscar — garante dado fresco mesmo dentro da janela de 60s.

**Resultado**: `node src/revendedoras-test.mjs` foi de 4 falhas para 1
("Bia entrou no Top", "valor vendido" e "Ana continua fora" passam agora).
`node src/e2e.mjs` (99 asserções) e `pos-golive-1-test.mjs` (189) rodados
depois, sem regressão. `GET /api/estoque/conferir` continua vazio.

**Regressão**: comentário adicionado em `src/revendedoras-test.mjs`
documentando a falha restante (Bug B) como conhecida e intencional.

### Bug B — "Giro" nunca é calculado no Top Revendedoras (falha 3) — NÃO CORRIGIDO, decisão de negócio
`api/src/analytics.js` (`acertosDeMaleta`) nunca agrega "peças enviadas"
por revendedora — nem de acertos do sistema (que têm o dado em
`maletas.acerto_json`) nem de históricos importados (que **não têm**: a
tabela `historico_operacoes` não guarda "enviadas", só "vendida").
`src/dashboard.tpl.html` hardcoda `giro:null`, e a coluna mostra "—" para
toda revendedora, sempre — reproduzível independente de qualquer timing.

Existe uma função já certa e já usada com sucesso na ficha individual
(`desempenhoDe()`, calcula giro = vendida/enviadas a partir de
`state.maletas`), mas o Top Revendedoras não a reaproveita.

**Por que não corrigi**: fechar isso corretamente exige decidir o que
fazer com acertos históricos sem o dado "enviadas" — mostrar giro só
quando aplicável, backfillar o dado, ou outra escolha — e a regra do
projeto é "nunca chute a distribuição" quando o dado não existe. Isso é
decisão de produto, não bug de uma linha. Documentado no código
(`src/revendedoras-test.mjs`, comentário acima da asserção) e aqui.

### Veredito sobre a tela em produção
**Sim — "Top Revendedoras" pode estar exibindo dado incorreto em produção
hoje**, nos dois sentidos:
- a coluna "Giro" está sempre errada (nunca mostra percentual);
- Vendido/Peças/Ciclos ficam desatualizados sempre que uma escrita
  acontece enquanto o usuário permanece na aba Revendedoras → Visão Geral
  sem trocar de aba (ex.: outro dispositivo fechando um acerto, ou
  "Salvar planejamento" chamando `sincronizar()` na mesma aba) — **esta
  parte já está corrigida nesta branch.**

---

## 3. Monte seu Colar — checklist de validação manual

**Documento próprio**: [`MONTE_SEU_COLAR_CHECKLIST.md`](../../MONTE_SEU_COLAR_CHECKLIST.md).

Cobre modelo, base, posições, menino/menina, cores, disponibilidade,
preço, carrinho, venda, histórico, baixa da base, baixa de cada
componente, proteção contra baixa dupla, edição/cancelamento e
comportamento sem estoque — cada item dizendo exatamente o que o código
faz hoje, sem inventar comportamento.

**Achado durante o mapeamento**: cancelamento de venda
(`POST /api/vendas/{id}/cancelar`) estorna pelo `sku` de `venda_itens`
(a base), e **não** percorre `venda_personalizacao_itens` — há risco real
de que cancelar uma venda de colar personalizado devolva ao estoque só a
base, não os componentes. Não há teste automático cobrindo isso. Marcado
como item de verificação manual obrigatória no checklist (§14) — não
corrigido aqui, por não termos como comprovar o comportamento sem o teste
manual de vocês dois primeiro.

Tudo o mais no fluxo (cenários N/O de `pos-golive-1-test.mjs` e
`pos-golive-1-ui-test.mjs`) já está coberto por teste automático e passou
nesta rodada — não precisa reconferir manualmente, só validar visualmente.

---

## 4. Auditoria D1 — precisão da conclusão

**PASS, corrigido.**

`D1_USAGE_AUDIT.md` agora deixa explícito, logo na abertura e na seção
"Como isto foi medido": nenhum número veio de ler o D1 de produção
(`marquesa-db`) — toda medição rodou contra um banco D1 **local**, semeado
sinteticamente com dimensões equivalentes à produção. A conclusão de que
`/api/variacoes/revisao` é a causa do estouro de cota continua valendo,
mas agora qualificada como **causa reproduzida e provável** neste banco
sintético — não observada diretamente no ambiente que de fato bateu no
limite.

---

## 5. Ordem migration/deploy — compatibilidade nos dois sentidos

**Investigado a fundo. A frase original do checklist estava enganosa no
parêntese, mesmo a ordem estando certa.**

### Direção A — código antigo (`main`) + banco migrado
**Segura.** As duas `ADD COLUMN` são nullable, sem default — inserts do
código antigo continuam válidos. As tabelas novas nascem vazias e o código
antigo nunca escreve nelas. O índice único `idx_gar_troca_venda` admite
múltiplos `NULL` no SQLite, então trocas antigas sem `venda_id` não
colidem.

### Direção B — código novo (esta branch) + banco NÃO migrado
**NÃO é segura.** Duas rotas que **já rodavam em produção** quebram com
500 sem guard:
- `GET /api/analytics/painel` — `analytics.js` chama `contasAReceber`
  dentro de um `Promise.all` sem `.catch`; `contas-receber.js` lê
  `vendas.vencimento_em` e `garantia_trocas.venda_id`, que não existem
  ainda.
- `GET /api/vendas?data=` — `index.js` chama `personalizacoesDeVendas`
  sem guard; a função lê `venda_personalizacoes`, tabela nova.

Ambas são caminho normal de operação diária (o Painel abre toda sessão; a
lista de vendas do dia é a tela de uso constante). Outras cinco rotas
degradam **em silêncio** (números somem ou zeram) em vez de quebrar —
pior ainda, porque não avisa. Rotas 100% novas
(`/api/contas-receber`, `/api/personalizacao/modelos`,
`/api/vendas/corrigir-item`, `/api/pendencias/variacao/maleta`) dependem
do schema novo por definição — não é regressão, é esperado.

### Conclusão
**A migration PRECISA preceder o deploy do Worker — não é preferência.**
O texto original ("o código funciona sem ela — só mais devagar") estava
errado nessa afirmação: sem a migration, o Painel e a lista de vendas do
dia caem com 500, e faturamento de troca/pendência de maleta somem sem
aviso. O caminho inverso (banco migrado, Worker antigo) é seguro — essa
parte da ordem, e só ela, é tolerável de inverter.

**Texto corrigido para o checklist** (ver também § "Comandos" abaixo):
> Aplicar a migration **antes** do deploy do Worker. A ordem não é
> preferência: sem ela, `GET /api/analytics/painel` e `GET /api/vendas`
> respondem 500, e faturamento de troca, trocas do dia e pendência de
> maleta viram zero em silêncio. O caminho inverso é seguro — o banco
> migrado com o Worker antigo apenas ignora as colunas e tabelas novas.

---

## 6. Gate de staging

### PASS / FAIL por item

| Item | Estado |
|---|---|
| 1. Inconsistência "três ALTER" | ✅ PASS — corrigido |
| 2. Revendedoras — causa raiz | ✅ PASS — 2 bugs reais achados; 1 corrigido (Bug A); 1 documentado, decisão de negócio (Bug B) |
| 3. Monte seu Colar — checklist | ✅ PASS — checklist entregue; 1 gap de comportamento (cancelamento) sinalizado para validação manual |
| 4. Auditoria D1 — precisão | ✅ PASS — corrigido |
| 5. Ordem migration/deploy | ✅ PASS — comprovado nos dois sentidos; texto do checklist corrigido |
| 6. Este documento | ✅ entregue |

### Bugs encontrados

1. **Top Revendedoras — cache não revalidado** (`src/dashboard.tpl.html`).
   Real, afetava produção. **Corrigido nesta branch.**
2. **Top Revendedoras — giro nunca calculado** (`api/src/analytics.js`,
   `src/dashboard.tpl.html`). Real, afeta produção hoje, sempre. **Não
   corrigido** — decisão de negócio sobre acertos históricos sem o dado
   "enviadas".
3. **Cancelamento de colar personalizado pode não estornar componentes**
   (`api/src/index.js`, função de cancelamento). **Não confirmado por
   teste automático** — pendente de validação manual (checklist §14).
4. **Duas rotas pré-existentes quebram (500) se o Worker novo subir antes
   da migration** (`api/src/analytics.js`, `api/src/index.js`). Não é bug
   de código — é a razão pela qual a ordem migration→deploy é obrigatória
   (§5). Nenhuma mudança necessária, desde que a ordem seja respeitada.

### Testes executados (banco local limpo, Worker `--local`, migration aplicada)

| Suíte | Asserções | Resultado |
|---|---:|---|
| `src/pos-golive-1-test.mjs` | 189 | 189 ok |
| `src/pos-golive-1-variacoes-test.mjs` | 27 | 27 ok |
| `src/revendedoras-test.mjs` | 48 | 47 ok · 1 falha conhecida (Bug B, documentada) |
| `src/e2e.mjs` | 99 | 99 ok |
| **Total** | **363** | **362 ok · 1 falha documentada e esperada** |

Não rodados nesta rodada (fora do escopo desta revisão, sem mudança nesses
caminhos): `src/sync-test.mjs`, `src/nuvemshop-writes-test.mjs`,
`src/pos-golive-1-ui-test.mjs` (Playwright completo), suíte de
`frontend/` (React não foi tocado neste pacote).

### `GET /api/estoque/conferir`

**Vazio (`{"ok":true,"divergentes":[]}`) em todas as verificações** — antes
da suíte, depois da suíte principal, depois do e2e, depois da correção de
revendedoras. A razão contábil fecha em todos os pontos checados.

### Saldo negativo

Nenhum caso observado nos testes. O código tem validação em várias
camadas contra saldo negativo silencioso (`api/src/venda-correcao.js`,
`api/src/pendencias.js`, `api/src/historico-operacoes.js`) — recusa com
mensagem explícita em vez de deixar o número passar de zero.

### Impacto esperado no "A Receber"

Conforme já registrado em `docs/releases/POST_GOLIVE_REVIEW_1.md`: vendas operacionais
não pagas que já existiam (`pago=0, cobravel=1`) passam a **aparecer** no
A Receber. O total em aberto do Painel deve subir — não porque alguém
passou a dever mais, mas porque uma dívida que já existia deixa de ficar
invisível. Some a isso a diferença de troca/garantia (nova, R$ 10 no
exemplo testado da Evelyn).

### Estado do problema de Revendedoras

Ver §2 acima: Bug A corrigido e comprovado por teste; Bug B documentado,
decisão de negócio pendente.

### Estado do Monte seu Colar

Fluxo automatizado (N/O) 100% coberto e passando. Checklist manual
entregue (`MONTE_SEU_COLAR_CHECKLIST.md`) com 1 gap sinalizado
(cancelamento/estorno de componentes) para validação humana antes de
confiar cegamente nessa parte em produção.

### Compatibilidade schema/código

Ver §5: migration **precisa** preceder o deploy. Comprovado nos dois
sentidos, com rotas específicas listadas.

### Riscos restantes

1. Cancelamento de colar personalizado — comportamento de estorno não
   confirmado (ver acima), precisa do teste manual antes de considerar
   resolvido.
2. "Giro" no Top Revendedoras continua sempre "—" até uma decisão de
   negócio sobre acertos históricos.
3. Nenhum teste rodado nesta revisão cobre Nuvemshop real (`sync-test.mjs`
   não fazia parte do escopo tocado por este pacote) — se o pacote for
   para staging, vale rodar aquela suíte antes de qualquer autorização de
   produção.
4. `dashboard.html` foi regenerado (`python src/build.py`) por causa da
   correção do Bug A — qualquer deploy do painel legado depois desta
   revisão deve usar o `dashboard.html` já commitado nesta branch, não
   regenerar de novo sem necessidade.

### Comandos EXATOS para subir somente DEV/staging

Nenhum deles foi executado nesta revisão — ficam aqui como referência para
quando alguém autorizar a subida:

```bash
# 1. Aplicar a migration no D1 de DEV (marquesa-db-dev) — NUNCA em marquesa-db
npx wrangler d1 execute marquesa-db-dev --remote \
  --file=api/migracao-pos-golive-1.sql

# 2. Só depois, publicar o Worker de staging
npx wrangler deploy --env staging   # dispara marquesa-api-staging

# 3. Publicar o painel novo (Cloudflare Pages marquesa-dev), se aplicável
cd frontend && npm run build
# — o deploy do Pages em si segue o fluxo já configurado no Git, não wrangler direto

# 4. Smoke test do publicado (skill deploy-dev cobre isto)
curl -s https://marquesa-api-staging.<subdomínio>.workers.dev/api/health
curl -s https://marquesa-api-staging.<subdomínio>.workers.dev/api/estoque/conferir \
  -H "Authorization: Bearer <API_KEY de staging>"
```

A ordem 1→2 não é opcional (§5). Nenhum destes comandos toca
`marquesa-db` (produção) ou `wrangler deploy` sem `--env` (produção).

---

## Estado final

## **READY_FOR_STAGING**

Com as duas ressalvas explícitas de §"Riscos restantes" (cancelamento de
colar personalizado pendente de validação manual, e giro de Top
Revendedoras pendente de decisão de negócio) — nenhuma delas bloqueia a
subida para DEV/staging, ambas precisam de atenção antes de
`READY_FOR_PRODUCTION`.
