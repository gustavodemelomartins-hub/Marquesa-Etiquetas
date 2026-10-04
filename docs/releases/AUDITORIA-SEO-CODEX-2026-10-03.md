# Auditoria SEO, Content Intelligence e instalação local — 03/10/2026

Escopo executado: inspeção, recuperação documental, instalação local de
skills, proposta e backlog. **Nenhuma escrita em produção, Nuvemshop, D1
remoto ou R2; nenhum deploy, migration remota, publicação ou alteração de tema.**

## 1. Estado Git inicial

Branch `develop`, acompanhando `origin/develop`, árvore limpa.
HEAD `98e8772a2253c101fc22b7730d429f0aa40b09d6`:
`docs(release): horário certo do export usado no QA de UX`.
Nenhum fetch, merge, commit ou push feito nesta rodada. A relação com o
remoto é a informação das refs locais, não revalidação da ponta GitHub.

## 2. Claude SEO

Não estava presente nas skills locais do projeto; não foi identificado
Claude SEO no inventário de SKILL.md das raízes pessoais consultadas.
Instaladas **33 skills únicas / 176 arquivos** em `.agents/skills/`, pela
revisão `ff87fcee0734845d3f59128c8c905799ee2298da` de
[AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo).
Instalador oficial Codex, destino explícito e sem sobrescrita.

Nomes instalados:

```text
seo, seo-agentic, seo-ahrefs, seo-audit, seo-backlinks, seo-bing,
seo-cluster, seo-competitor-pages, seo-content, seo-content-brief,
seo-dataforseo, seo-drift, seo-ecommerce, seo-firecrawl, seo-flow,
seo-geo, seo-google, seo-hreflang, seo-image-gen, seo-images,
seo-local, seo-maps, seo-matomo, seo-page, seo-plan, seo-profound,
seo-programmatic, seo-schema, seo-seranking, seo-sitemap, seo-sxo,
seo-technical, seo-unlighthouse
```

Preservadas as skills locais: `database-dev`, `deploy-dev`, `inventory`,
`marquesa-context`, `marquesa-reconciliation`, `marquesa-safe-import`,
`marquesa-sync`, `pre-deploy-check`, `safe-d1-change`, `ui-verification`.
Resultado: 43 diretórios de skills locais. `.claude/` e `.codex/` continuam
adaptadores existentes; hooks e política não foram modificados.

Cada nova skill contém aviso Marquesa/Codex. Todos os demais arquivos da
instalação correspondem à revisão upstream; hashes originais/adaptados e
caminhos estão no [manifesto](../operations/claude-seo-manifest.json).
**Runtime do plugin/MCP/APIs não configurado:** skills são instruções e
referências disponíveis para uso seletivo. `${CLAUDE_PLUGIN_ROOT}`, scripts
compartilhados e agentes Claude exigem adaptação futura, não execução literal.
O catálogo do Codex descobre as novas skills no próximo turno/sessão.

Priorizar ecommerce/page/content/brief/schema/technical/images/sitemap/google/
cluster/sxo. Hub/audit consolidam; drift/flow/plan se sobrepõem parcialmente.
Extensions pagas, hreflang, local/maps, programmatic e agentic são condicionais.
Responsabilidades, dependências, conflitos e rollback no
[runbook local](../operations/CLAUDE_SEO_TOOLKIT.md).

## 3. SEO atual encontrado

**Existe e foi comprovado localmente:** rascunho comercial/SEO e preparação
com executor desacoplado, revisão e aprovação; testes SQLite/mocks passaram.

Evidências: [publicacao-catalogo.js](../../api/src/publicacao-catalogo.js),
[preparacao.js](../../api/src/catalogo/preparacao.js),
[publicador.js](../../api/src/catalogo/publicador.js),
[fila React](../../frontend/src/features/publicacao/api.ts).

**Existe mas precisa melhorar:** preparação ainda humano-assistida;
faltam conector Codex, avaliação SEO ligada a demanda e resultado, baseline
técnico do storefront e writer completo de mídia/categorias/variantes.
O checklist `seo-ecommerce` foi usado para confrontar o payload atual: isso
não é uma auditoria ao vivo da loja nem permite atribuir nota técnica ao site.

**Obsoleto:** afirmação das skills/memória antigas de que não há writer de
criação de produto. O writer existe hoje, com publicação bloqueada por flag.
Não corrigimos documentação histórica nem relaxamos gates nesta rodada.

## 4. Histórico recuperado

Os números informados pelo usuário foram corroborados por resumo histórico
privado, sem copiar o vault para o repositório:

| Registro histórico | Período | Qualidade/reuso |
|---|---|---|
| 110 consultas, 566 SERPs, 202 domínios, 325 snapshots, 15 Tier A | Snapshot 27/08/2026 | Resumo narrativo; sem linhas brutas recuperadas |
| 13 cliques, 905 impressões, 71 consultas, 226 páginas | GSC 06–26/08/2026 | Janela histórica; não representa 28/90 dias atuais |

Não localizados exports JSON/CSV, banco SEO, fornecedor de SERP, código de
coleta, timestamps detalhados ou atualização contínua. São fontes históricas
documentais, **não datasets reconstituídos**. Não importar esses totais como
linhas nem apresentá-los como métricas atuais. Reuso: hipóteses e baseline
narrativo, seguido de recuperação dos arquivos externos com proveniência.

## 5. GSC / GA4

**Ausentes no código examinado:** integração GSC/GA4, coletor 28/90 dias,
credenciais configuradas de analytics demonstradas e pipeline de atribuição.
`seo-google` oferece instruções upstream, não acesso Google automaticamente.

Analytics atual é [analytics.js](../../api/src/analytics.js): visão geral,
evolução, produtos, categorias e canais financeiros/operacionais. Origem
`site` não comprova Organic Search. Não foram observadas landing/session/UTM
no contrato operacional auditado.

Proposta GSC: query/page/query+page separadamente, 28/90 e comparação, cliques,
impressões/CTR/posição, coverage e período. GA4: verificar eventos ecommerce
e identidade de item/pedido antes de relacionar organic landing, engajamento,
produto, carrinho, checkout, compra e receita. Ver contratos e limitações no
[plano](../architecture/MARQUESA_INTELLIGENCE_PLAN_2026-10-03.md).

## 6. SERP / keywords

**Histórico útil:** resumo de queries/SERPs/domínios/snapshots/Tier A.
**Ausente localmente:** base bruta validada, keyword map, collector e
clustering operacional. Nenhuma coleta paga realizada.

Modelo futuro: keyword/cluster/intenção/categoria/SKU/landing, métricas GSC,
concorrentes com fonte/data, prioridade comercial e status. Queries genéricas
sem presença devem resultar de observação SERP definida por país/device/data;
ausência em dados GSC não prova, sozinha, que a loja nunca aparece.

## 7. Watchdog

Nenhum dos seis arquivos históricos existe ou aparece no histórico Git local
consultado: `scripts/marquesa_watchdog.py`,
`config/marquesa_watchdog_policy.json`, `data/marquesa_watchdog_state.json`,
`data/marquesa_watchdog_log.jsonl`, `scripts/test_marquesa_watchdog.sh`,
`docs/intelligence/MARQUESA_LOW_CONSUMPTION_WATCHDOG.md`.
Os nomes são **referências a artefatos ausentes**, não links atuais.
Não há diretórios `config/`/`data/` nesse clone nem equivalente identificado.
Ausência local não prova ausência em backups/infraestrutura externa.

Histórico documental: cron SEO de aproximadamente 15 minutos pausado em
30/08/2026; execução externa não revalidada. `scheduled()` atual em
[index.js](../../api/src/index.js) chama sync de estoque, não SEO; `crons=[]`
nos três ambientes versionados. Agenda remota não foi consultada.
Reusar a ideia de hash/evento/no-op, recuperando o legado antes de reescrever.

## 8. Nuvemshop / publicação

Fluxo existente: cadastro → completude → tarefa de preparação → rascunho →
aprovação → writer. Estados em `ESTADO_PUBLICACAO`: `falta_informacao` e
`pronto_para_preparacao` calculados; `em_preparacao`, `preparado`,
`aguardando_aprovacao`, `aprovado_para_publicar`, `publicando`, `publicado`,
`falhou_ao_publicar`, `despublicado`.
Na leitura, rascunho completo converge para revisão; estado declarado não
prova que toda transição conceitual tem ação de UI independente.

`concluirTarefa` reutiliza `salvarPreviaPublicacao`, impede renomear a peça
silenciosamente e retorna `publicado:false`. Índice parcial impede duas
tarefas abertas por SKU. A aprovação é separada, invalidada por mudança de
ficha; salvar nova prévia limpa aprovação anterior.

Writer exige duas flags exatas, modo seco desligado explicitamente e
aprovação vigente. Criação usa `published:false`; visibilidade externa é
passo distinto. Lote tem teto 20. UI atual não chama as rotas de publicação,
despublicação ou rodada. **Não ligar flags nesta fase.**

Limitações verificadas no payload: não envia categoria, galeria, atributos,
alt, schema nem representação completa de múltiplas variantes. Validar API,
tema e dados reais antes de propor extensão. Timeout pode exigir reconciliação
antes de retry; não presumir idempotência de criação externa.

## 9. Banco e tabelas relacionadas

Configuração **versionada**, não sondagem remota:

| Ambiente | Worker | D1 | R2 | Cron |
|---|---|---|---|---|
| PROD | marquesa-api | marquesa-db-prod | marquesa-fotos | [] |
| DEV | marquesa-api-staging | marquesa-db-dev | marquesa-fotos-dev | [] |
| staging-v2 | marquesa-api-staging-v2 | marquesa-db-staging-v2 | Sem binding | [] |

Fonte: [wrangler.toml](../../api/wrangler.toml). R2 PROD declarado desde
29/09/2026; notas antigas "PROD sem R2" estão stale. D1 guarda chaves/metadados,
R2 os bytes; links assinados protegem fotos próprias.
Escrita de estoque habilitada no bloco PROD; publicação de catálogo ausente
em todos os ambientes. Configuração não comprova valores implantados hoje.

[Schema local](../../api/schema.sql): `categorias`, `produtos`,
`produtos_custo_historico`, `produto_fotos`, `fotos_lotes`, `fotos_lote_itens`,
`catalogo_publicacoes`, `preparacao_tarefas`, `movimentos`, `maletas`,
`maleta_itens`, `loja_snapshot`, `produto_variacoes`, `loja_variantes`,
`loja_fotos`, `vendas`, `venda_itens`, históricos e `sync_execucoes`.
Nenhuma tabela SEO/GSC/GA4/Content Brain identificada. Isso não é confirmação
do schema real de produção, que não foi consultado.

Identidade local: `produtos.sku`; Nuvemshop: `produto_id_loja`/`variante_id`.
Vendas site preservam `vendas.externo_id`. Não criar catálogo paralelo.

## 10. O que deve ser reaproveitado

Fila fornecedor-agnóstica, contexto/resultado de tarefa, rascunho SEO,
completude única, aprovação/invalidação, flags, writer/mock, SKU/categoria,
galeria/R2, razão de estoque, vendas/pagamentos e analytics operacional.
Do legado: intenção comercial, checkpoints, pilares como hipóteses editoriais,
economia por eventos e observações históricas com data.

## 11. O que deve ser aposentado

Como desenho futuro: executor externo obrigatório, cron caro sem mudança,
cópias independentes de produto, alteração semanal sem hipótese e inferência
de receita por ranking. Documentação histórica permanece com seu status;
nenhum cron, recurso, dado ou documento foi apagado nesta rodada.
Não reintroduzir Production Release Approval revogado. O freeze atual é
outro mecanismo vigente em `.claude/governanca.json`, preservado.

## 12. Gaps

Dados brutos externos; GSC/GA4; mapa URL–SKU; eventos ecommerce; proveniência;
collector/coverage; runtime Codex do toolkit; keywords/experimentos; Content
Brain; watchdog/scheduler separado; custo/lineage; atribuição; media/categoria/
variantes no writer e rollback/idempotência da criação externa.

## 13. Arquitetura proposta

Codex + toolkit SEO seletivo + contexto operacional → oportunidade/hipótese →
tarefa/draft existente → revisão/aprovação humana → writer Marquesa → medição.
Coletores e watchdog determinísticos antecedem IA. Commerce lê a fonte real;
Content Brain e Experimentos armazenam evidências relacionadas e datadas.
Diagrama, alternativas e contratos no
[plano Codex-first](../architecture/MARQUESA_INTELLIGENCE_PLAN_2026-10-03.md).

## 14. Backlog priorizado

O plano detalha **25 itens**, cada um com problema/solução, impacto, esforço,
risco, dependências, necessidade de IA e aprovação humana:

- P0: legado, identidade, runtime, ledger e baseline real.
- P1: GSC, GA4, keywords, auditoria técnica e experimentos.
- P2: Codex preparador, qualidade da ficha, writer completo e retry/rollback.
- P3: conteúdo/observações, métricas privadas e editoria.
- P4: concorrentes e tendências/criativos.
- P5: watchdog, scheduler/limites e action ledger.
- P6: causalidade proporcional, ROI e expansão multicanal/GEO.

## 15. Riscos

Memória temporal desatualizada; histórico sem raw; toolkit com comandos Claude
e setup global; serviços pagos/transferência de dados; conteúdo factual
inventado; métricas incompatíveis; baixa amostra; ranking com ruptura; schema
duplicado; criação externa não idempotente; identificação de aprovação pela
chave compartilhada; capacidades e tema da Nuvemshop não auditados ao vivo.
Cada risco tem tratamento no plano/runbook; nenhum justifica relaxar proteção.

## 16. Dependências externas

Google Cloud/Search Console/GA4, loja Nuvemshop e tema atual, Cloudflare,
exports legados e eventual host antigo. SERP: fornecedor público/contratado
somente após seleção e custo. DataForSEO/Ahrefs/Firecrawl/SE Ranking/Profound,
Matomo e ferramentas sociais são opcionais, não pré-requisitos universais.

## 17. Credencial ou configuração humana

Propriedades GSC/GA4 corretas e acesso read-only; OAuth/service account sem
exposição de segredo; APIs Google habilitadas; timezone/eventos/item_id/
transaction_id; acesso aos backups/exports do legado; perfis sociais próprios
e métricas privadas quando autorizados; prioridades de marca/concorrentes e
budgets de provedores. Configuração técnica não equivale a aprovação de copy.
Ativar publicação externa é decisão futura explícita, fora desta missão.

## 18. Arquivos alterados nesta rodada

- Este relatório, plano de arquitetura, runbook de toolkit e manifesto JSON.
- Índice `docs/README.md`, para apontar à proposta e ao runbook.
- 176 arquivos novos locais ignorados em `.agents/skills/seo*`, incluindo 33
  SKILL.md com aviso local. Inventário completo por arquivo no manifesto.
- Helper temporário de instalação em `.tmp/`, ignorado; não faz parte do produto.

Nenhum arquivo de aplicação, schema, migration, workflow, proteção, hook,
skill preexistente, tema ou configuração global alterado. Hashes de 43
arquivos preexistentes de skills/configuração conferidos após instalação.

## 19. Testes executados

Executados com sucesso nesta rodada, sem acesso remoto/dados reais:

| Comando | Resultado |
|---|---|
| `node src/catalogo-4-5-test.mjs` | 26 provas; SQLite em memória, fetch/R2 mock |
| `node src/config-plataforma-test.mjs` | 9 blocos |
| `node src/analytics-recorte-canal-test.mjs` | 11 provas |
| `node scripts/governance-versioned.test.mjs` | 32 casos |
| `node .codex/hooks/protect-production.test.mjs` | 51 casos |

Instalação: nomes/frontmatter/hashes e preservação de arquivos anteriores.
Documentação: gate de links versionados e validação adicional dos documentos
novos, pois o gate existente usa `git ls-files` e não inclui untracked.
Aviso preexistente `MODULE_TYPELESS_PACKAGE_JSON`, sem falha.
Não rodados: storefront/browser, runtime Claude SEO, APIs Google, collectors,
MCPs, Worker remoto ou schema real. Não há alegação de produção validada.

## 20. Estado Git final

Mesma branch e HEAD, sem commit/push. Mudanças revisáveis: um índice modificado
e quatro documentos/manifesto novos não rastreados. Skills/helper locais são
ignorados conforme política preexistente. O diff comum não inclui os 176
arquivos de skills; o manifesto os torna auditáveis. Nenhum deploy disparado.

## 21. Próxima execução recomendada

Recuperar exports externos ou registrar sua indisponibilidade; confirmar
propriedades/acessos somente leitura; definir URL–SKU e runtime local de um
collector Google. Entregar baseline 28/90 + uma PDP/categoria com demanda,
estoque/preço e hipótese mensurável. Preparar exemplo offline de draft usando
o contrato atual. Manter publicação e alterações reais fora dessa próxima
fatia até que seu escopo seja autorizado.
