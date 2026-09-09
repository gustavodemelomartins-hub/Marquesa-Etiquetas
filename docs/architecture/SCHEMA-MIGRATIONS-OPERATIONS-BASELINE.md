# Baseline de schema, migrations e cron — Fase 0

- **Captura local:** 2026-09-09
- **Commit de origem:** `04edb022455e417b8389d2163b2f007b7dd3ecff`
- **Limite de evidência:** arquivos e registros versionados. Nenhum D1 remoto, dashboard Cloudflare ou Nuvemshop foi consultado.

## Schema desejado para instalação limpa

`api/schema.sql` é o snapshot canônico para criar um banco novo, não um comprovante do estado de produção. No baseline ele declara **40 tabelas**, **90 índices explícitos** e **57 chaves estrangeiras**. O conjunto cobre catálogo/razão, clientes, vendas, maletas, sync, variantes/kits, inventário, reconciliação, histórico, financeiro, garantias, saídas e publicação interna.

Esse snapshot pode avançar antes de bancos existentes. Portanto, “existe em `schema.sql`” significa estado desejado de instalação limpa; só um ledger de aplicação ou introspecção autorizada prova um banco concreto.

## Manifesto dos 26 arquivos

| Migration | Papel | Repetição/risco | Evidência versionada sobre aplicação |
|---|---|---|---|
| `migracao-catalogo.sql` | ficha/foto/status do catálogo | aditiva; legado antigo | sequência histórica documentada; banco concreto não provado aqui |
| `migracao-cliente-cpf.sql` | CPF e normalização do cliente | aditiva | requisito operacional documentado; ledger remoto ausente |
| `migracao-foto-url.sql` | URL de foto | aditiva | sequência histórica; ledger remoto ausente |
| `migracao-fotos-loja.sql` | espelho/órfãs de fotos | aditiva | sequência histórica; ledger remoto ausente |
| `migracao-garantias.sql` | garantias, eventos e trocas | aditiva | GO_LIVE Phase 2 registra aplicação do pacote |
| `migracao-historico-operacoes.sql` | decisões e operações sobre histórico | aditiva | GO_LIVE Phase 1 registra aplicação |
| `migracao-idempotencia-reconciliacao.sql` | chave idempotente no razão | aditiva | `RECONCILIATION_ENGINE.md` diz não aplicada em produção naquele baseline |
| `migracao-inventario.sql` | sessões/itens de inventário | aditiva | ledger remoto ausente |
| `migracao-kits.sql` | composição de kits | aditiva | ledger remoto ausente |
| `migracao-pacote-2.sql` | SKU comercial/personalização | aditiva, depende de estado anterior | handoff 2026-09-08 registra aplicação com backup/bookmark |
| `migracao-pos-golive-1.sql` | pacote pós-go-live 1 | aditiva; pré-requisito do pacote 2 | upgrade local provado; aplicação nominal remota não registrada no handoff final |
| `migracao-publicacao-catalogo.sql` | rascunho/aprovação interna | aditiva | handoff 2026-09-08 registra aplicação com backup/bookmark |
| `migracao-publicacao-catalogo-rollback.sql` | remove publicação interna | **destrutiva: DROP** | rollback manual somente; nunca runner automático |
| `migracao-reconciliacao.sql` | sessões/itens de reconciliação | `IF NOT EXISTS`; aditiva | documento do motor diz não aplicada em produção naquele baseline |
| `migracao-saidas-sem-faturamento.sql` | brindes/uso próprio/ajustes | aditiva | GO_LIVE Phase 2 registra aplicação |
| `migracao-sync-seco.sql` | marca execução seca | não idempotente na 2ª execução | sequência histórica; estado remoto não provado aqui |
| `migracao-sync.sql` | histórico/config do sync | aditiva | ledger remoto ausente |
| `migracao-variacoes-locais.sql` | estrutura local de variação | aditiva | sequência histórica; ledger remoto ausente |
| `migracao-variacoes.sql` | saldo/identidade por variação | não idempotente na 2ª execução | dívida técnica registra aplicação em produção; banco atual não reinspecionado |
| `migracao-variantes.sql` | espelho de variantes externas | testada nas duas direções | sequência histórica; ledger remoto ausente |
| `migracao-venda-desconto.sql` | preço tabela/desconto congelado | aditiva | GO_LIVE Phase 1 registra aplicação |
| `migracao-vendas-cliente-ambiguo.sql` | vínculo/revisão de cliente | aditiva | GO_LIVE Phase 2 registra aplicação |
| `migracao-vendas-historicas.sql` | camada derivada do histórico | aditiva | runbook DEV documenta uso; ledger remoto ausente |
| `migracao-vendas-historico.sql` | colunas/lotes brutos históricos | aditiva | runbook DEV documenta uso; ledger remoto ausente |
| `migracao-vendas-nuvemshop.sql` | identidade/status de venda externa | aditiva | ledger remoto ausente |
| `migracao-vendas-pagamento.sql` | pagamento/data/observação | aditiva | GO_LIVE Phase 2 registra aplicação |

“Ledger remoto ausente” não significa “não aplicada”; significa apenas que a Fase 0 se recusou a inferir estado implantado de arquivos locais. A pasta mistura evolução histórica, migrations candidatas, migrations já absorvidas pelo schema e um rollback destrutivo. Não existe ainda tabela/manifesto executável único que registre versão por banco.

## Operação de dados catalogada fora do fluxo forward

A reclassificação de linhas históricas que não representam venda, auditada
nos commits `87732d3` e `0a9df94`, é **data correction / reconciliation
operation**, não schema migration. O schema necessário já pertence a
`migracao-saidas-sem-faturamento.sql`; um manifesto com IDs de produção não
entra neste inventário de 26 migrations nem deve ser versionado. A operação
permanece não executada nesta integração e ainda depende de uma decisão humana
sobre o caso “Sorteio”.

## Sequenciamento e segurança

- Instalação limpa usa `schema.sql`; não deve reaplicar cegamente todas as migrations.
- Upgrade exige sequência explícita por release, backup/bookmark e validação de pré/pós-condições.
- `migracao-publicacao-catalogo-rollback.sql` fica isolada logicamente e nunca entra no runner.
- `migracao-sync-seco.sql` e `migracao-variacoes.sql` não devem ser tratadas como idempotentes.
- Alterar D1/schema está fora desta fase e exige o protocolo `safe-d1-change` antes de qualquer escrita.

## Divergência do cron

| Fonte | Afirmação capturada |
|---|---|
| `api/wrangler.toml` raiz | `[triggers] crons = []`; comentário diz desligado desde 2026-08-22 |
| `api/wrangler.toml` staging | `[env.staging.triggers] crons = []` |
| `docs/ARCHITECTURE.md`, `docs/SYNC_ENGINE.md`, `api/DEPLOY.md` | descrevem `0 9,21 * * *` como agendamento |
| `docs/PLANO-MESTRE-MARQUESA.md` | registra produção `0 9,21` e DEV vazio, mas também narra o desligamento versionado |
| Canonical privado `Sistema-Atual.md` | registra produção `0 9,21`, DEV nenhum |
| código `scheduled()` | continua funcional e chama sincronização |

Conclusão: há divergência entre **configuração desejada versionada (cron vazio)**, documentação histórica/canônica (**duas execuções diárias**) e o estado efetivamente implantado, que **não foi verificado** nesta fase. O handler permanecer é compatível com cron desligado e não prova agendamento.

Regra até verificação autorizada: não mudar cron, não assumir que está ativo/inativo e não executar sync para “testar”. Antes de qualquer decisão futura, consultar o estado implantado por procedimento read-only aprovado, reconciliar a documentação e fazer uma rodada seca com os freios existentes.
