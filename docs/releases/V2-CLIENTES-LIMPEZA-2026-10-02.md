# V2 — Clientes sem pseudo-clientes, e arquivar/excluir cliente (02/10/2026)

> **Situação: EM PRODUÇÃO desde 02/10/2026.** Commits `844b77e` (código) e
> `20503da` (dados).

## Por que a limpeza de 26/09 ficou incompleta

A rodada anterior (`docs/migracao-nao-venda/`, executada em 26/09 por
`scripts/reconciliacao/reconciliar-fonte-operacional.mjs`, passo 6) reclassificou
30 linhas da planilha como saída sem faturamento. Ela parou em dois pontos,
os dois de propósito:

1. **Regra 4 de lá:** "valor positivo marcado PAGO preserva o faturamento,
   mesmo que o texto diga brinde — fica para conferência humana". Por isso
   ficaram a linha do "Brinde dia das mães" (R$ 109,00, "Eu que dei") e as 8
   linhas pagas da Sthefany Marques.
2. **O cadastro não tinha para onde ir.** As linhas da planilha apontam para o
   cadastro (`cliente_id`), §28 proíbe apagar histórico, e `clientes` não
   tinha estado de arquivado. "Brinde festa junina" e "Inventário" já não
   tinham venda nenhuma, mas continuavam na lista.

## O que foi feito

| Cadastro | Linhas | Ação | Motivo |
|---|---|---|---|
| Brinde dia das mães (#300) | 1 · R$ 109,00 PAGO | linha → **brinde**; cadastro **arquivado** | decisão do dono em 02/10: brinde é saída, não cliente |
| Brinde festa junina (#311) | 1 · R$ 0 (já brinde desde 26/09) | **arquivado** | cadastro operacional |
| Inventário (#326) | 3 · R$ 0 (já perda desde 26/09) | **arquivado** | cadastro operacional |
| Sem nome (#219) | 0 · nenhuma dependência | **excluído** | só a observação "Cliente atendida pela minha mãe" |
| Sthefany Marques (#64) | 34 (26 já fora desde 26/09) | **nenhuma** | pessoa real; as 8 linhas restantes têm dinheiro registrado |

As 8 linhas da Sthefany que continuam como compra (R$ 922,00, todas PAGO):
24/11/07 R$ 99 · 24/11/30 R$ 129 · 25/04/11 R$ 189 · 25/12/24 R$ 169
("Presente vó Gustavo") · 25/12/24 R$ 79 ("Presente Geisa") · 25/12/28 R$ 79 ·
26/05/10 R$ 49 ("Presente Cecilia") · 26/06/11 R$ 129. Se forem presente ou
uso próprio, cada uma vira saída pela mesma rota
(`POST /api/historico/reclassificar`, por `historicoItemId`).

**Fora desta rodada, mas é o mesmo assunto:** as "9 vendas sem informação,
R$ 367" de Vendas feitas são as 9 vendas da Sthefany com status `indefinida`
— linhas que já são saída desde 26/09. Elas aparecem em Vendas feitas porque
essa lista (`analytics.js › SQL_ITENS_DE_VENDA`) não aplica o filtro de
reclassificação. Não foi mexido, por pedido.

## Antes e depois (PROD)

| | Antes | Depois |
|---|---:|---:|
| Cadastros | 353 | 352 |
| Na lista de Clientes | 353 | **349** (3 arquivados) |
| Saídas sem faturamento | 12 | 13 |
| Reclassificações | 30 | 31 |
| Clientes ativos (crm) | 349 | 348 |
| Vendas no histórico (crm) | 702 | 701 |
| Faturamento histórico (crm) | R$ 127.499,61 | R$ 127.390,61 (−R$ 109,00) |
| Estoque (peças / movimentos) | 2.244 / 2.721 | **2.244 / 2.721** |
| Razão divergente | 0 | **0** |
| Vendas do sistema | 19 · R$ 2.612 | **19 · R$ 2.612** |
| A receber | 3 · R$ 583,00 | **3 · R$ 583,00** |

## Publicação

| | Novo | Rollback |
|---|---|---|
| Migration | `api/migracao-clientes-arquivo.sql` (aditiva) | colunas ficam; código antigo as ignora |
| Worker `marquesa-api` | `9186282d-6a8c-44a6-ac6d-5d5a0e839e74` | `d52ba1b3-249a-4a0d-ba9a-575e9684bc02` |
| Dados | `docs/migracao-nao-venda/limpeza-clientes-2026-10-02.sql` | Time Travel `00000181-00000000-000050f8-144edcf8f5f96e72b06f5b53faefa938` |
| Pages `marquesa` | `c4722cb2` | `8060f779` |
| Backup | `../Marquesa-Etiquetas-backups/d1/2026-10-02_clientes/` | idêntico byte a byte ao export auditado |

O SQL foi gerado por `diferenca-sql.mjs` a partir das rotas reais rodadas numa
cópia (`scripts/reconciliacao/limpeza-clientes-2026-10-02.mjs`), com
precondição (contagens de origem; falha deixa `config.valor` NULL e o arquivo
volta inteiro) e marca de idempotência (`config`). Ensaiado: aplica igual ao
"depois", recusa a segunda vez e recusa banco alterado.

## Provas

- `src/clientes-arquivo-test.mjs` 10/10 (A–I) · `acoes.test.tsx` 7/7 ·
  frontend 503/503 · build com typecheck.
- `src/v2-clientes-acoes-qa.mjs` 1280 e 390px · paridade 66/66 · Vendas/Clientes
  QA 104 · inventário QA 40.
- Suítes clássicas e de Vendas/Clientes/Saídas idênticas às do commit que
  estava em PROD (`6f81e3b`).
- QA de produção: site publicado + Worker publicado sobre export pós-aplicação,
  sem escrita — 349 clientes, busca "brinde"/"inventário"/"sem nome" vazia,
  Sthefany ativa com R$ 922,00 e protegida contra exclusão, 3 em Arquivadas,
  Visão geral sem pseudo-cliente, Saídas (tudo) 13 peças com a linha 129561,
  Elizama 1 venda R$ 504,00. Em 1280 e 390px.

## Segunda rodada (02/10/2026, tarde) — Sthefany Marques e Vendas feitas

**Confirmação humana do responsável:** todas as linhas da planilha atribuídas
à Sthefany Marques (#64) são uso próprio ou presentes dados por ela — nenhuma
é venda comercial. O cadastro continua ativo.

As 8 linhas restantes (R$ 922,00, todas PAGO) pela rota oficial
(`scripts/reconciliacao/reclassificar-sthefany-2026-10-02.mjs` →
`docs/migracao-nao-venda/reclassificar-sthefany-2026-10-02.sql`):

| Item | Nº | Data | SKU | Peça | Valor | Texto | Classe |
|---|---|---|---|---|---:|---|---|
| 2904 | 187 | 07/11/2024 | 944768 | Berloque Patas Zircônias | 99 | Maleta | uso próprio |
| 2914 | 197 | 30/11/2024 | 524730 | Pulseira Lisa Lap Cruz | 129 | Maleta | uso próprio |
| 2859 | 142 | 11/04/2025 | 922884 | Bracelete Prego Liso | 189 | Maleta | uso próprio |
| 3514 | 797 | 24/12/2025 | 204997 | Colar Longo Corações | 169 | Presente vó Gustavo | brinde |
| 3515 | 798 | 24/12/2025 | 377105 | Pulseira Coração Vazado | 79 | Presente Geisa | brinde |
| 3516 | 799 | 28/12/2025 | 152177 | Brinco Esfera Lisa e Fosca | 79 | Maleta | uso próprio |
| 3793 | 1076 | 10/05/2026 | 450475 | Brinco Baby de Morangos | 49 | Presente Cecilia | brinde |
| 3870 | 1153 | 11/06/2026 | 322557 | Anel Pai Nosso e Cruz | 129 | Maleta | uso próprio |

Sthefany, as 34 linhas: **brinde 11, sorteio 1, uso próprio 22**. Ficha: R$ 0,00,
0 compras.

**Vendas feitas** passa a aplicar o filtro da reclassificação oficial
(`SQL_ITENS_DE_VENDA`), e a busca global e a lista item a item também, já que
usam a mesma consulta. As "9 vendas sem informação, R$ 367" eram todas da
Sthefany, já reclassificadas, e saíram com o resto. **Financeiro › Saiu sem
faturar** passa a mostrar os registros antigos sem saída (23), com o valor da
planilha.

| | Antes | Depois |
|---|---:|---:|
| Vendas feitas (tela) | 729 | **696** (−26 já reclassificadas, −7 da Sthefany) |
| Vendas "sem informação" | 12 | **0** |
| Vendas no histórico (crm) | 701 | **694** |
| Faturamento histórico (crm) | R$ 127.390,61 | **R$ 126.468,61** (−R$ 922,00) |
| Clientes ativos / recorrentes | 348 / 113 | 347 / 112 |
| Saídas sem faturamento (linhas) | 13 | 16 |
| Registros antigos sem saída | 18 | 23 |
| Reclassificações | 31 | 39 |
| Estoque (peças / movimentos) | 2.244 / 2.721 | **2.244 / 2.721** |
| Saídas com baixa de estoque | 0 | **0** |
| Vendas do sistema · A receber | 19 / R$ 2.612 · 3 / R$ 583 | **iguais** |

| | Novo | Rollback |
|---|---|---|
| Commits | `581d689` · `ae4a8b8` · `b3ffff5` | `916a905` |
| Worker | `5d1791e4-44e7-4949-9beb-bcd62e5969e0` | `9186282d-6a8c-44a6-ac6d-5d5a0e839e74` |
| Pages | `f4ba0dd4` | `c4722cb2` |
| D1 (antes) | bookmark `00000185-00000000-000050f8-9bbf695c4ac4f36be8a73be307430a42` | backup `../Marquesa-Etiquetas-backups/d1/2026-10-02_sthefany/` |

Entre a auditoria e a aplicação, dois cadastros foram renomeados na tela
(#347, #123) — fora das tabelas tocadas; a precondição do SQL cobre saídas,
reclassificações, estoque e vendas. Provas: `src/reclassificacao-vendas-feitas-test.mjs`
(10, A–I), `RegistrosAntigos.test.tsx` (3), frontend 506/506, suítes clássicas e do assunto
idênticas às do commit em PROD, QA de produção em 1280 e 390px sem escrita.
