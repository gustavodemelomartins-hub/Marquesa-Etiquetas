# D1_USAGE_AUDIT — quem está lendo a cota

A conta da Cloudflare bateu no limite diário de **linhas lidas** do D1. Este
documento responde "quem" com número medido, não com suspeita — e diz o que
foi feito, o que ainda dá para fazer e o que não vale a pena fazer.

Data da medição: 06/09/2026 · branch `claude/marquesa-operational-review-eztpzt`

---

## 1. Como isto foi medido

Não por estimativa. `api/src/d1-metrica.js` envolve o binding do D1 e soma o
`meta.rows_read` que o **próprio D1 devolve** em cada consulta.

```
GET /api/qualquer   +  cabeçalho  X-D1-Metricas: 1
→ resposta com  X-D1-Rows-Read, X-D1-Rows-Written, X-D1-Queries, X-D1-Top
```

Está **desligado por padrão**: sem a variável `D1_METRICAS=true` no ambiente
e sem o cabeçalho, `rotear()` recebe o binding original e nada é envolvido —
a medição não custa nada quando não está sendo usada. Está desligado porque
somar a leitura de um `.first()` exige pedir `.all()` no lugar dele (o
`.first()` do D1 não devolve `meta`): o SQL é o mesmo e o motor lê as mesmas
linhas, mas todas voltam para a memória do Worker. Isso é aceitável enquanto
se mede; não é o que deve rodar em produção.

O banco de medição tem o **tamanho da produção**, gerado por
`src/d1-uso-audit.mjs`:

```
772 produtos · 1.172 movimentos · 343 clientes
4 maletas abertas com 382 peças
25 meses de histórico · 1.375 vendas históricas · 2.750 itens
400 variantes no espelho da loja
```

Reproduzir:

```bash
api/dev-local.sh                    # banco limpo
node src/d1-uso-audit.mjs           # semeia e mede
node src/d1-uso-audit.mjs --medir   # só mede
```

---

## 2. O que apareceu — e o que foi feito

### 2.1 O achado principal: 298.032 linhas num clique

| Rota | Antes | Depois | Queda |
|---|---:|---:|---:|
| `GET /api/variacoes/revisao` | **298.032** | **5.047** | −98,3% |

Mais do que todo o resto do painel somado. A consulta:

```sql
SELECT p.sku, p.desc, p.qtd,
       p.qtd - COALESCE((
         SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
           JOIN maletas m ON m.id = mi.maleta_id
          WHERE mi.sku = p.sku AND m.status IN ('aberta','em_acerto')
       ), 0) AS casa
  FROM produtos p WHERE p.status = 'ativo'
```

A subconsulta é **correlacionada** e `maleta_itens` tem PRIMARY KEY
`(maleta_id, sku)` e um índice por `maleta_id` — **nenhum por `sku`**. Cada
produto ativo varria a tabela inteira: 772 × 382 ≈ 296 mil linhas.

Corrigido por **dois caminhos independentes**, de propósito:

1. **Reescrita da consulta** (`api/src/variantes.js`) — agrega antes e casa
   depois, com um `LEFT JOIN` sobre um CTE. Fica O(produtos + itens) com ou
   sem índice. **Vale sem migration**, então a produção para de pagar isso no
   próximo deploy, sem esperar autorização de banco.
2. **Índice `idx_maleta_itens_sku`** (`api/migracao-pos-golive-1.sql`) —
   resolve o mesmo problema pelo outro lado e barateia também
   `consignadoDoSku`, que roda **uma vez por item de toda venda registrada**.

Medido: a reescrita sozinha leva de 298.032 para 5.427; com o índice, 5.047.

### 2.2 `/api/state` — o tamanho é pequeno, a frequência não

| | Antes | Depois |
|---|---:|---:|
| Linhas por chamada | 3.142 | **2.370** |
| Pontos do painel que a chamam | 50 | 50 |

`SELECT * FROM produtos ORDER BY desc` sem índice monta uma B-tree
temporária e conta a leitura em dobro (1.544 para 772 produtos). O índice
`idx_produtos_desc` (na migration) elimina isso.

O resto é inerente: depois de escrever, o painel precisa do estado fresco.

### 2.3 O painel recalculava 25 meses a cada volta para a aba

`GET /api/analytics/painel` lê **69.716 linhas**: ele agrega faturamento,
evolução, categorias, produtos, origem e ranking, e cada um desses recorre ao
mesmo CTE sobre o histórico inteiro. `switchTab` refazia isso a cada entrada
na aba — ir em Clientes e voltar custava outras 69 mil.

Corrigido no cliente (`src/dashboard.tpl.html › api()`): a resposta das rotas
de análise fica em memória enquanto **duas** coisas forem verdade:

1. nada foi **escrito** desde então — qualquer método diferente de GET
   incrementa `dadosVersao` e limpa tudo. `api()` e `apiArquivo()` são os
   únicos caminhos de escrita da tela, então nenhuma gravação escapa;
2. faz **menos de 60 segundos** — é o teto para o que este navegador não pode
   saber: a sincronização da madrugada e outro aparelho escrevendo ao mesmo
   tempo. Sem esse teto a memória seria uma segunda verdade.

Cada acerto devolve uma **cópia** (`structuredClone`): a tela altera o objeto
que recebe, e o guardado não pode ser contaminado.

Efeito prático: a primeira abertura do Painel custa o que custava; as
seguintes, dentro de um minuto e sem escrita, custam **zero**.

### 2.4 Resultado consolidado

Uma passada por **todas** as rotas do painel, no banco do tamanho da
produção:

| | Linhas lidas |
|---|---:|
| Antes | **435.032** |
| Depois (mesmas rotas) | **141.273** |
| Depois, incluindo as 4 rotas novas desta rodada | **165.326** |

−67,5% nas rotas que já existiam. As quatro rotas novas
(`/api/vendas/lancamentos`, `/api/analytics/mes`, `/api/pendencias`,
`/api/variacoes/reconciliacao`) somam 24.053 e substituem trabalho que antes
era feito com várias chamadas ou não era feito.

---

## 3. Ranking atual, por rota

Medido depois das correções. "Frequência" é quantas vezes o painel chama a
rota num uso normal.

| Linhas | Consultas | Rota | Frequência | Observação |
|---:|---:|---|---|---|
| 69.716 | 20 | `/api/analytics/painel` | 1× por abertura da aba, agora memorizada | ver 4.1 |
| 17.878 | 3 | `/api/analytics/vendas` | dentro do painel | 13.752 vêm de uma consulta só |
| 9.796 | 2 | `/api/analytics/produtos` | dentro do painel | |
| 9.627 | 1 | `/api/analytics/evolucao` | dentro do painel | CTE sobre 25 meses |
| 6.274 | 2 | `/api/analytics/categorias` | dentro do painel | |
| 5.844 | 2 | `/api/analytics/crm` | aba Clientes, memorizada | |
| 5.501 | 1 | `/api/analytics/clientes` | dentro do painel | |
| 5.443 | 11 | `/api/pendencias` | aba Pendências | rota nova |
| 5.285 | 3 | `/api/analytics/mes` | clique numa barra | rota nova |
| 5.049 | 6 | `/api/variacoes/reconciliacao` | sob demanda | rota nova, read-only |
| 5.047 | 5 | `/api/variacoes/revisao` | aba Pendências | **era 298.032** |
| 4.959 | 8 | `/api/clientes/perfil` | por ficha aberta | |
| 4.259 | 1 | `/api/estoque/conferir` | a prova da razão | |
| 4.135 | 9 | `/api/vendas/lancamentos` | por data escolhida | rota nova |
| 4.131 | 7 | `/api/vendas/dia` | por data escolhida | |
| 2.370 | 17 | `/api/state` | **50 pontos de escrita** | era 3.142 |
| 8 | 3 | `/api/analytics/revendedoras` | | |
| 2 | 4 | `/api/contas-receber` | | |
| 2 | 1 | `/api/personalizacao/modelos` | | rota nova |
| 0 | 2 | `/api/vendas?data=` | | |

---

## 4. O que ainda dá para fazer, e o risco de cada coisa

### 4.1 A consulta de 13.752 linhas dentro de `visaoGeral`

```sql
SELECT COUNT(DISTINCT h.sku_base) FROM vendas_historico_itens h
  JOIN vendas_historico_lotes l ...
  JOIN vendas_historicas vh ...
  LEFT JOIN historico_operacoes ho ...
 WHERE h.sku_base IS NOT NULL <filtros> ...
```

São 2.750 itens × ~5 leituras cada (dois JOINs e dois `NOT EXISTS` por
linha). Ela alimenta **um** indicador: "quantos códigos distintos foram
vendidos". Custa 20% do painel inteiro.

**Opções, do menos ao mais arriscado:**

| Opção | Ganho | Risco |
|---|---:|---|
| Tirar o indicador `skus` do payload padrão e servi-lo sob demanda | −13.752 por abertura | baixo — some um número da tela |
| Materializar `sku_base` distintos numa tabela derivada, atualizada na importação | −13.700 | médio — segunda fonte da verdade |
| Deixar como está | 0 | nenhum |

**Não foi feito nesta rodada**: mexer nele é mexer no que a tela mostra, e
isso é decisão da Sthefany, não minha. Fica registrado com o número.

### 4.2 O painel recalcula tudo, seis vezes, sobre o mesmo recorte

`painel()` chama `visaoGeral`, `evolucao`, `categoriasMaisVendidas`,
`produtosMaisVendidos`, `porOrigem` e `clientesRanking`, e cada um refaz
`cteVendas` sobre os 25 meses. O SQLite não compartilha CTE entre
statements, então não há como fazer isso numa consulta só sem reescrever o
arquivo inteiro.

O caminho real seria uma **tabela de agregados por mês**, recalculada quando
uma venda muda. É trabalho de uma rodada própria, com o risco clássico de
agregado: ele diverge quando alguém escreve por um caminho que esqueceu de
invalidá-lo. Não vale fazer com pressa.

A memorização do cliente (§2.3) já tira o repique, que era a maior parte do
desperdício real.

### 4.3 N+1 encontrados e não corrigidos

| Onde | Padrão | Por que não foi mexido |
|---|---|---|
| `garantias.js › garantiasDaCliente` | um `lerGarantia` por garantia, e cada um faz 2 consultas | poucas linhas por consulta; o custo é latência, não cota |
| `garantias.js › garantiasPendentes(limite:50)` | idem, até 100 consultas | mesma coisa — mas é a mais próxima de valer a pena |
| `personalizacao.js › listarModelos` | um `saldosDoSku` por SKU distinto | dezenas de SKUs, não centenas; e o saldo tem de ser o MESMO que a venda valida |
| `registrarVenda` | um `saldosDoSku` por item do carrinho | é validação de estoque; agrupar aqui é trocar exatidão por leitura |

Nenhum deles é grande em **linhas**. Estão listados porque contagem de
consultas também tem custo, e porque quem for otimizar depois merece a lista
pronta.

### 4.4 O que NÃO é a causa (verificado, para não caçar de novo)

- **Polling**: não existe `setInterval` nem `setTimeout` recorrente no
  painel. Nenhuma tela consulta sozinha.
- **Cron**: `crons = []` desde o go-live de 22/08 (`api/wrangler.toml`).
- **Carregamento duplo do Painel**: `switchTab` chamava uma vez por entrada
  na aba — o problema era a repetição, não a duplicidade, e a memorização
  resolveu.
- **Auditoria de varredura total**: `GET /api/estoque/conferir` lê 4.259
  linhas (produtos + movimentos agrupados). É a prova da razão contábil e
  roda sob demanda. Barato e essencial.

---

## 5. Índices desta rodada

Em `api/migracao-pos-golive-1.sql`. **Nenhum foi aplicado em produção.**

| Índice | Por quê |
|---|---|
| `idx_maleta_itens_sku` | §2.1 — e barateia `consignadoDoSku` em toda venda |
| `idx_produtos_desc` | §2.2 — tira a B-tree temporária de `/api/state` |
| `idx_gar_troca_venda` | caminho de volta da venda para a troca (§36) |
| `idx_vendas_vencimento` (parcial, `WHERE pago = 0`) | o A Receber ordena por prazo |
| `idx_mitem_var_sku` / `idx_mitem_var_maleta` | variação identificada na maleta |
| `idx_vic_venda` / `idx_vic_hist` / `idx_vic_data` | auditoria de correção de SKU |
| `idx_pers_opcoes_modelo`, `idx_vpers_venda`, `idx_vpers_item_sku` | Monte seu Colar |

---

## 6. Regra que não foi violada

Nada aqui trocou consistência por leitura. Em particular:

- a memorização do cliente **nunca** cobre rota de escrita nem
  `GET /api/state`, e é invalidada por qualquer gravação;
- nenhuma consulta de estoque ou de dinheiro foi agregada, aproximada ou
  cacheada no servidor;
- `produtos.qtd == SUM(movimentos.qtd)` continua provado por
  `GET /api/estoque/conferir`, que roda em todos os testes desta rodada.
