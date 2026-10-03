# V2 — Histórico de inventários zerado, planilha "Saiu sem faturar" aplicada, fuso de São Paulo (03/10/2026)

> **Situação (03/10/2026, ~10h40 BRT):** dados, código, Worker e Pages EM
> PRODUÇÃO. Fecha a pendência de `V2-INVENTARIO-BIPOU-MARCHA-2026-10-02.md`
> (o SQL de dados que o classificador tinha negado).

## Dados (PROD)

Regra do dono (03/10/2026): **todo inventário existente antes desta limpeza
era teste**; o próximo que a Sthefany abrir é o primeiro real (REGRAS §53).

Export de PROD de 03/10 13:10 UTC — idêntico ao estado de 02/10:

| id | status | iniciado (UTC) | fim (UTC) | contagens | resultado/itens/eventos/não-ident. | saídas/movimentos |
|---:|---|---|---|---:|---|---|
| 1 | cancelado | 22/08 07:57:15 | 22/08 07:57:23 | 0 | 0 | 0 |
| 2 | cancelado | 09/09 06:11:01 | 09/09 06:11:07 | 0 | 0 | 0 |
| 3 | cancelado | 09/09 14:57:47 | 09/09 14:57:56 | 0 | 0 | 0 |
| 4 | cancelado | 09/09 14:57:58 | 09/09 14:58:03 | 0 | 0 | 0 |
| 5 | cancelado | 10/09 15:33:50 | 10/09 15:34:00 | 0 | 0 | 0 |
| 6 | cancelado (pausado 30/09) | 28/09 10:39:18 | 01/10 01:27:54 | 1 (0 peças) | 0 | 0 |
| 7 | cancelado | 02/10 15:14:20 | 02/10 18:37:53 | 3 (5 peças) | 0 | 0 |

Nenhum movimento com origem `inventario`, nenhuma saída com
`inventario_id`, nenhum movimento citando "Inventário #".

**SQL:** `docs/migracao-nao-venda/rodada-inventario-2026-10-02.sql`,
regerado pelo gerador agora dinâmico (todos os inventários da cópia, para
se algum estiver em andamento) e com 19 precondições (contagens, ids exatos,
MAX(id), dependência zero, estoque, movimentos, vendas). Ensaio: aplica igual
ao "depois"; 2ª aplicação recusada (marca); com um inventário novo aberto,
recusado e nada escrito.

| | |
|---|---|
| Aplicado | 03/10/2026 13:18:26 UTC (10:18 BRT), `wrangler d1 execute DB --remote --file` |
| Ponto de restauração | bookmark `00000198-00000000-000050f9-d198d15ed8f3ee0b503fee352f3e43dd` + `../Marquesa-Etiquetas-backups/d1/2026-10-03_rodada-inventario/marquesa-db-prod-pre-aplicacao.sql` |
| PROD depois × ensaio local | idênticos, tabela a tabela (export pós-aplicação) |

| | Antes | Depois |
|---|---:|---:|
| Inventários | 7 | **0** |
| Contagens | 4 | **0** |
| Resultados / itens / eventos / não identificados | 0 | 0 |
| Estoque (peças) | 2.231 | **2.231** |
| Movimentos (linhas / soma / maior id) | 2.733 / 2.231 / 3901 | **2.733 / 2.231 / 3901** |
| Razão divergente (`/api/estoque/conferir`) | 0 | **0** |
| Casa + revendedoras | 1.842 + 389 | **1.842 + 389** (Luciana 90, Evelyn 84, Graciele 123, Bruna 92) |
| Brinde | 13 | **27** |
| Uso próprio | 22 | **9** |
| Diferença de inventário / Perda | 3 | **3** |
| Sorteio | 1 | **0** |
| Saídas com baixa de estoque | 0 | 0 |

As 14 reclassificações conferidas uma a uma em PROD (todas `brinde`):
431593, 295623, 944768, 524730, 198242, 104777, 569425, 603122, 152177,
361240 (registro antigo) · 113626, 162655, 397728, 178464 (saída). As outras
23 linhas da planilha ganharam observação/custo sem mudar a classe.
**821920** ("Presente Ana JS", 27/09) continua sem registro — fora da
migração, de propósito: lançar seria uma baixa nova.

### Numeração

"Inventário #N" é o `id` técnico (AUTOINCREMENT, `sqlite_sequence` = 7). Não
existe numeração operacional separada; o contador **não** foi reiniciado
para nenhum id voltar a ser usado. O próximo inventário aparece como
**Inventário #8** (provado na cópia) e é o primeiro real.

## Fuso (REGRAS §52)

**Causa:** o banco grava instantes em UTC (`datetime('now')` →
"2026-10-03 00:00:00" para 02/10 21h em SP); a tela (`fmtData`) e o servidor
(`inventario.js`) cortavam os dez primeiros caracteres — o dia de Greenwich.

**Correção:** `fmtData` distingue dia civil (passa como veio) de instante
(UTC → America/Sao_Paulo pelo `Intl`); no servidor, `api/src/fuso.js ›
diaOperacional` no relatório do inventário, na observação da diferença
aplicada e no `ultimoEm` do resumo. Nenhuma soma de horas à mão. Vale para
toda tela que mostra instante (ficha da peça, galeria, fila, estorno,
correção de acerto).

**Provas:** `src/fuso-operacional-test.mjs` 13/13; `formato.test.ts` +5. No
site publicado (cópia): inventário com `iniciado_em = 2026-10-03 00:00:00`
mostra "iniciado em 02/10/2026"; 02:59:59 UTC (23:59:59 SP) → 02/10;
03:00:00 UTC (00:00 SP) → 03/10.

## Evelyn Veiga (preservado)

Acerto 05/08/2026: `situacaoFinanceira: paga` (líquido R$ 1.473,10; a linha
de troca R$ 10 continua excluída). Maleta #17 aberta: 84 peças, R$ 7.904.
263571 = 5 casa + Luciana 1 + Graciele 1; 421089 = 3 casa + Luciana 1 +
Evelyn 1. Nenhum dado dela alterado.

## Provas

- frontend 525/525 · build com typecheck · gates `fast` 11/11 e `domain` 12/12
- inventário: bipou-marcha 14, 4.4 23, conciliação 17, descartar 8;
  saídas/planilha 10; fuso 13
- clássicas idênticas ao commit em PROD (`54b1f82`): sync 71, variações 58,
  kits 20, import-total 13; e2e 81 ok/5 falhas e fase2-telas 3 ok — mesmas
  falhas antigas; `revendedoras-test` 3 falhas — as mesmas no `54b1f82`
- QA no site publicado (bundle no ar + Worker do commit sobre cópia do PROD
  pós-aplicação; escrita só na cópia, 0 requisições à API real), 1280 e
  390 px: histórico vazio com "Nenhum inventário ainda" e "Abrir inventário"
  disponível; Saiu sem faturar mostra só os motivos (Brinde 27, Uso próprio 9,
  Diferença de inventário / Perda 3), cada um abre só as suas peças, 0
  erros de página. Na cópia: novo inventário = #8, leitor com foco, um bipe
  em 421089 → contado 3 = esperado em casa, falta 0, campo limpo; estoque da
  cópia idêntico.

**Notado, não mexido:** Saiu sem faturar abre no período padrão de 30 dias,
onde não há saída — "Nenhuma saída neste período"; os motivos aparecem em
"Tudo". E o card "Saúde do estoque" mostra ícone verde com "Conferência
vencida".

## Publicação

| | Novo | Rollback |
|---|---|---|
| Commits | `8c5dc55` (fuso) · `bfda6bf` (dados) | `54b1f82` |
| Worker `marquesa-api` | `0e15b5ac-c92a-463f-a679-af35dbbf9f3c` | `ef2f32da-f324-4f1a-a4e0-c22e4e0ff5f2` |
| Pages `marquesa` | `8be256ea` | `60f22ceb` |
| D1 | dados aplicados | bookmark `00000198-00000000-000050f9-d198d15ed8f3ee0b503fee352f3e43dd` |

Publicado de worktree limpa em `bfda6bf` com os passos do `deploy-prod.yml`.
`/api/health` → `{"ok":true,"hoje":"2026-10-03"}`.

## Complemento de UX (03/10/2026, tarde)

- **Saiu sem faturar abre em Tudo.** Sem período na URL a aba abre em Tudo
  e os motivos aparecem de imediato (Brinde 27, Uso próprio 9, Diferença de
  inventário / Perda 3). Os outros filtros continuam; período não escolhido
  não viaja entre abas, o escolhido viaja. O período da tela agora segue a
  URL, e o intervalo `de~ate` é lido inteiro.
- **Saúde do estoque** (REGRAS §53): antes, ícone verde sempre e o título
  "Conferência vencida" ou "Situação geral". Agora: verde só conferido no
  prazo; atenção perto de vencer ou sem nenhum inventário real concluído
  ("Primeira conferência pendente"); vencida em risco, nunca verde.
  Em PROD hoje: **Primeira conferência pendente · Nenhum inventário
  concluído ainda**, em atenção.

| | Novo | Rollback |
|---|---|---|
| Commit | `7cf3601` | `ccddeff` |
| Worker | `0e15b5ac` (sem mudança — nenhum `api/src` mudou) | — |
| Pages `marquesa` | `34cced85` | `8be256ea` |

Provas: frontend 541/541, build com typecheck, gates fast 11/11 e domain
13/13, `src/inventario-saude-test.mjs` 4/4. QA no site publicado sobre cópia
de PROD (export das 13h40 UTC), 1280 e 390 px, 0 escritas, 0 erros.
