# Decisões humanas pendentes

Lista viva do que **nenhum refactor pode decidir sozinho**. Não é ADR: ADR
registra decisão tomada; aqui fica o que ainda não foi. Enquanto um item
estiver aberto, o código não deve inferir a resposta — deve falhar fechado,
preservar o comportamento atual e dizer que parou.

Origem: § 50 do
[plano mestre](../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md), mais
o que apareceu depois dele.

| # | Pendência | Trava qual fase | Estado |
|---|---|---|---|
| P1 | Fonte operacional e frequência real do cron de sync | Fase 7 | aberta |
| P2 | Semântica definitiva de giro e comissão | Fase 6 | aberta |
| P3 | Regra de preço para material bruto versus banhado | Fase 5 | aberta |
| P4 | Fonte única dos parâmetros de planejamento | Fase 9 | aberta |
| P5 | Por quanto tempo manter o fallback do legado | Fase 11 | aberta |
| P6 | Quais fluxos compõem o Pacote 5 | trilha de features | aberta |
| P7 | Quando identidade individual passa a ser necessária | Fase 3 (auth) | aberta |
| P8 | Se haverá publicação externa de catálogo, e com quais freios | trilha de features | **direção decidida (10/09/2026); ligar continua pendente** |
| P9 | Política de R2/mídia em produção | Fase 3 | **direção decidida (10/09/2026); habilitar continua pendente** |
| P10 | SLO e nível de observabilidade esperado | Fase 3 | aberta |
| P11 | Quando aplicar `api/migracao-sorteio-saida-sem-faturamento.sql` | trilha de release | aberta |
| P12 | Desenho da correção auditável de custo histórico | Fase 5 | aberta |
| P13 | Política de preço divergente local × Nuvemshop | Fase 4.5 / 7 | aberta |
| P14 | Mesclar duas categorias numa: o que acontece com o histórico de relatório | Fase 4.5 | aberta |
| P15 | Arquivar uma peça deve despublicá-la da loja? | Fase 4.5 | aberta |
| P16 | Categorias da loja: mapear com as nossas, ou continuar ignorando | Fase 7 | aberta |

## Detalhe do que está travado

**P1 — cron.** `api/wrangler.toml` declara `crons = []`; documentação
histórica descreve `0 9,21 * * *`; o estado implantado não foi verificado. Até
uma consulta read-only autorizada, não mudar cron, não presumir que está
ligado e não rodar sync "para testar". Ver
[SCHEMA-MIGRATIONS-OPERATIONS-BASELINE.md](../architecture/SCHEMA-MIGRATIONS-OPERATIONS-BASELINE.md).

**P2 — giro e comissão.** Aparece nos fluxos de maleta, mas não tem regra
fechada. A Fase 6 caracteriza e preserva o comportamento existente; inventar
semântica de giro durante a extração é proibido.

**P11 — migration do sorteio.** A categoria `sorteio` já existe no domínio e
nos testes. Bancos existentes ainda precisam ampliar dois `CHECK`s, e a
migration proposta reconstrói duas tabelas — operação sensível em SQLite. Ela
**não foi executada em produção** e não pertence à trilha de refatoração.

**P12 — custo histórico.** Requisito confirmado: corrigir custo histórico sem
sobrescrever o passado. Qualquer desenho futuro precisa preservar valor
anterior, valor corrigido, motivo, data e rastreabilidade, e não pode
confundir preço de venda com custo. Nenhuma alteração silenciosa de histórico.

## Decisões já fechadas que costumavam aparecer aqui

- **Saídas sem faturamento** têm quatro categorias: `brinde`, `uso_proprio`,
  `perda` e `sorteio`. Sorteio reduz estoque, não cria venda e não aumenta
  faturamento. Ver [SAIDAS-SEM-FATURAMENTO.md](../domains/SAIDAS-SEM-FATURAMENTO.md).
- **"ACHO QUE FOI VENDIDO" não é categoria.** É observação. Diferença negativa
  de inventário confirmada entra como `perda`, com a observação registrada e
  rastreabilidade pelo histórico de saída sem faturamento.
- **Estratégia de evolução:** strangler incremental por contrato, registrado em
  [0002-strangler-incremental-por-contrato.md](0002-strangler-incremental-por-contrato.md).

**P8 — publicar de verdade.** A DIREÇÃO foi decidida por Gustavo em
10/09/2026: o produto nasce no Sistema Marquesa e a Nuvemshop é canal de
publicação. O writer existe (`api/src/catalogo/publicador.js`) e os estados
`publicando`, `publicado`, `falhou_ao_publicar` e `despublicado` deixaram de
ser valores mortos no schema. **O que continua pendente é ligar**:
`NUVEMSHOP_PUBLICACAO_ENABLED` não está declarada em ambiente nenhum, e toda
chamada é seca por padrão. Ligar é release próprio, depois de uma rodada seca
conferida. Ver [CATALOGO-MIDIA-PUBLICACAO-4-5.md § 10](../domains/CATALOGO-MIDIA-PUBLICACAO-4-5.md).

**P9 — R2.** A direção foi decidida na mesma data: as fotos próprias da
Marquesa ficam no R2, e a medição que fechou a questão é que **158 das 160
peças ainda fora da loja não têm imagem em lugar nenhum** — a loja não pode
ser a fonte da foto delas porque elas não estão lá. O código foi estruturado
para receber o binding por release controlado e parou de EXIGIR R2 para
avançar de estado: sem ele, a resposta é `bloqueio: "sem_r2"`, que é
diferente de erro. **Habilitar o bucket em produção continua pendente** —
custo e release.

**P13 — preço divergente.** Preço local e preço da loja podem divergir e hoje
ninguém compara. `GET /api/catalogo/precos/divergentes` passa a MEDIR e
devolve `politica: "pendente"`. Promoção legítima, preço específico da loja e
divergência acidental produzem o mesmo número, então nada é declarado erro e
nada é corrigido automaticamente. Enquanto esta pendência estiver aberta,
nenhum código deve tratar diferença de preço como defeito.

**P14 — mesclar categorias.** A coluna `categorias.sucessora_id` existe e
**nenhum código a escreve**. Juntar duas categorias muda o passado dos
relatórios, e decidir para onde vão as peças e o que acontece com o histórico
é decisão comercial. Até lá, a API responde 409 a quem tentar renomear uma
categoria para o nome de outra.

**P15 — arquivar despublica?** Hoje, não: arquivar tira a peça da
sincronização e o número dela congela na vitrine. O ato de despublicar passa
a existir (`POST /api/catalogo/publicacao/:sku/despublicar`) e é deliberado —
ninguém o dispara sozinho. Tornar automático é decisão comercial.

**P16 — categorias da loja.** A Nuvemshop tem categorias próprias e este
sistema nunca as leu nem escreveu. O adapter ganhou `categorias()` (somente
leitura) para a decisão ter dado quando for tomada. Enquanto isso, os dois
lados seguem ignorando um ao outro — que é o comportamento atual, preservado
de propósito.
