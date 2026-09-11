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
| P8 | Se haverá publicação externa de catálogo, e com quais freios | trilha de features | aberta |
| P9 | Política de R2/mídia em produção | Fase 3 | aberta |
| P10 | SLO e nível de observabilidade esperado | Fase 3 | aberta |
| P11 | Quando aplicar `api/migracao-sorteio-saida-sem-faturamento.sql` | trilha de release | aberta |
| P12 | Desenho da correção auditável de custo histórico | Fase 5 | aberta |

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
