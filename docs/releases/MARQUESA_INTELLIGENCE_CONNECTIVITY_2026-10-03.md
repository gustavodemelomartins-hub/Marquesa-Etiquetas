# Marquesa Intelligence — execução de conectividade, 03/10/2026

Rodada local autorizada após aprovação do baseline SEO. Resultado: código e
runtime executáveis, leituras reais D1/R2/storefront e baseline comercial com
cobertura explícita. Google ainda depende de configuração humana.
Não houve mutação remota, publicação, deploy, migration, commit ou push.

## 1. Runtime preparado

`.venv-seo`, CPython 3.14.7, isolado no clone. Runner PowerShell resolve o
Python local e chama pacote Marquesa; sem Claude Code ou launcher upstream.
Comandos doctor, discover-google, collect, baseline, pending e schedule-plan.

## 2. Dependências instaladas

google-api-python-client 2.201.0, google-auth 2.59.1,
google-auth-oauthlib 1.5.0, google-auth-httplib2 0.4.4,
google-analytics-data 0.23.3, requests 2.34.2, tzdata 2026.5,
matplotlib 3.11.2, WeasyPrint 70.0, openpyxl 3.1.5.
Lock de 51 distribuições para Windows/Python 3.14; pip check sem conflitos.
PNG matplotlib e XLSX openpyxl testados. WeasyPrint instalado, mas import
falha por bibliotecas nativas Windows ausentes: PDF opcional não está pronto.

## 3. Claude SEO executável pelo Codex

33 skills e 176 arquivos anteriores conferidos por SHA-256: zero divergências.
Não alteramos upstream nessa rodada. Instruções/referências são utilizadas
seletivamente pelo Codex; integrações locais são wrappers Marquesa.
seo-google e seo-ecommerce orientaram a construção, sem carregar todas as
skills nem executar scripts dependentes de CLAUDE_PLUGIN_ROOT.

## 4. Google APIs necessárias

Search Console API, Analytics Data API, PageSpeed Insights API e Chrome UX
Report API. Admin API é opcional para descoberta automática GA4; copiar ID
pela interface dispensa-a. Knowledge Graph sem caso demonstrado. Indexing
API ausente e não suportada pelo allowlist.

## 5. APIs habilitadas

Não confirmadas: nenhum projeto Google selecionado/autenticado nesta rodada.
Nenhuma API foi habilitada ou propriedade/configuração alterada pelo Codex.
Resposta PSI anônima de quota não prova configuração de projeto da Marquesa.

## 6. O que precisa de ação humana

Primeiro selecionar/criar projeto no [Google Cloud](https://console.cloud.google.com/cloud-resource-manager)
e informar somente o ID. Depois habilitar quatro APIs, criar service account
marquesa-seo sem papéis IAM de projeto, guardar JSON fora do clone, autorizar
propriedade GSC e GA4 Viewer sem restrição de receita, e criar chave restrita
PSI/CrUX. [Runbook com telas/botões/permissões](../operations/MARQUESA_INTELLIGENCE_CONNECTIVITY.md)
preparado. Nunca enviar JSON/token/chave no chat.

## 7. GSC conectado?

Ainda não. Collector pronto para 28/90 dias, query, page, query+page e totais,
readonly scope, paginação e raw antes de normalizar. Propriedade candidata
é sc-domain:marquesasemijoias.com.br ou URL-prefix existente; sites.list deve
confirmá-la. Sitemaps/URL Inspection são leitura, sem envio/indexação.
Nenhum número histórico de agosto foi promovido a baseline atual.

## 8. GA4 conectado?

Ainda não via API. Storefront declara measurement ID G-6J2GLTCT7E; ele não
é o ID numérico da propriedade. Reports de overview, landing, events, items,
all traffic/organic e coorte de usuários estão implementados. Metadata e
compatibility são validados; limitações de sampling/thresholding ficam no raw.

## 9. PageSpeed conectado?

Probe público executado: HTTP 429 RESOURCE_EXHAUSTED, quota diária 0.
Não repetimos nem produzimos score/Core Web Vitals fictício. Collector pronto,
aguarda chave/projeto/quota. Baseline/scheduler evita nova tentativa anônima.

## 10. CrUX conectado?

Não; falta API key. Collector pronto. Após autenticação, 404 de URL é tratado
como dados de campo insuficientes, sem substituir silenciosamente por origin.

## 11. URL → SKU

Fonte real D1 marquesa-db-prod: 987 produtos, 674 variantes de espelho.
617 SKUs com vínculo cadastrado URL/ID, 672 IDs de variante associados a SKU;
zero conflitos nos registros lidos. Nas duas PDPs públicas, item_id GA4 é
variante, não produto/SKU. Join bloqueia IDs contraditórios e não usa nomes.

Exemplos confirmados:

| SKU | produto_id_loja | item_id/variante |
|---|---|---|
| 151618 | 244521779 | 1097454044 |
| 443929 | 247103449 | 1097528446 |

Cobertura corrente é menor que cobertura cadastrada: 2 SKUs confirmados por
HTML/canonical, 2 URLs do mapa no sitemap atual, 596 URLs distintas fora dele.
URLs do espelho sem /produtos/ podem ser aliases/antigas; não reescrevemos ou
atribuímos tráfego por suposição. Espelho datado de 02/10 15:12:28Z.
370 SKUs operacionais sem URL cadastrada ligada nesta leitura.

## 12. Eventos ecommerce encontrados

Duas PDPs declaram view_item, item_id, item_name, value e currency.
Não encontramos declaração inline de add_to_cart, begin_checkout, purchase
ou transaction_id nessas amostras. Scripts externos podem implementá-los.
Store ID público 5134350. GA4 e GTM-NGGDWZJT, com dataLayerTN/dataLayer,
estão declarados; presença não confirma disparo ou duplicidade.

## 13. Gaps de tracking

Sem API/autenticação não sabemos quais eventos foram recebidos. Confirmar
consentimento, payloads, deduplicação purchase/transaction_id, moeda/valor,
IDs de itens e cancelamentos/refunds. Não inferir falha de tracking por evento
ausente em HTML ou sem atividade no período. Sessões e pedidos reais não são
substituídos por volumes de eventos/unidades de itens.

## 14. Baseline possível

Operacional/local preparado para 28/90 dias e contexto all_available:

- 987/987 saldos produtos.qtd iguais ao SUM de movimentos no SELECT.
- Disponibilidade derivada de razão, consignação e componentes, sem write.
- Sitemap: 533 URLs, 499 PDPs individuais; lastmod máximo 02/10 13:41:08Z.
- R2 prod/dev confirmado por metadados; zero objetos lidos.
- D1 contém zero vendas origem site nesta leitura. Isso não significa zero
  vendas Nuvemshop; há um gap de ingestão/cobertura a investigar.
- Sem denominadores Google, taxas/receita por sessão/produto/categoria ficam
  indisponíveis. Não há hipótese A–J com evidência suficiente nesse baseline.
- Sem cestas site, não há pares cross-sell suportados; não usamos balcão/acerto
  como se fossem pedidos online. Margem histórica permanece desconhecida.

Baseline privado local: `.local/intelligence/analysis/commercial-baseline.json`;
raw, normalização, identidade, tracking e lineage ficam ignorados pelo Git.

## 15. Coletores criados

[Pacote Python](../../intelligence/marquesa_intelligence/__main__.py): config,
storage, google, cloudflare, storefront, nuvemshop, commerce, analysis,
pipeline e scheduler. SQL revisado exporta oito tabelas mínimas; SELECT
adicional confere o ledger. GET Nuvemshop opcional possui raw com projeção
de catálogo, paginação e whitelist; token externo ausente, não testado ao vivo.
R2 adapter lista somente metadados, sem conteúdo de objetos.

A–J, métricas de funil com grão explícito e basket-pair support/confidence/lift
implementados. Aprovação é requerida em toda hipótese; nenhum writer incluído.
Schema D1 não foi modificado nem duplicamos produto/venda como cadastro novo.

## 16. Testes

81 testes unitários de collectors/adapters/pipeline passaram. Verificação
independente do subagente passou 78 antes dos dois últimos gates de storage;
execução final do root passou os 81, incluindo cobertura site não presumida
pela existência de algumas linhas. Pip check, docs links e git diff --check
passaram. Hashes dos 176 arquivos das 33 skills preservados.

Leituras reais: D1/schema/catalogo/ledger/cobertura, R2 buckets e HTTP público
home/robots/sitemap/duas PDPs; runner PowerShell com SELECT real após correção.
Repetir baseline idêntico adicionou zero pending. Google e Nuvemshop privada
seguem testados por mocks, não alegamos autenticação funcional.

Correção local detectada no teste: `.env` externo vazio fez storage usar a
raiz numa execução. Corrigimos o default e adicionamos gate que recusa storage
versionável dentro do clone; os cinco diretórios criados foram movidos para
recovery ignorado, sem exclusão, commit ou envio. Nenhum secret foi exposto.

## 17. Scheduler proposto

Runner diário determinístico com --due e lease, preparado em
[marquesa-intelligence-scheduled.ps1](../../scripts/marquesa-intelligence-scheduled.ps1).
GSC/GA4 diário; comercial eventos no futuro/SELECT diário hoje; PSI/CrUX
semanal e após frontend relevante; SERP semanal futuro. Tarefa Windows/cron
não registrados. Nenhum polling de LLM, dispatch de IA ou ação de vitrine.

## 18. Segurança das credenciais

Diretório externo criado com ACL usuário/SYSTEM, herança bloqueada e modelo
vazio. Validator metadata-only; paths Google internos recusados; env vazio
preserva defaults; storage somente área ignorada ou externa. .gitignore
específico para credenciais, sem esconder JSON legítimo. Secrets/headers/URLs
com autenticação não são capturados nem impressos; errors status-only.

## 19. Arquivos modificados

Nesta rodada: `.env.example`, `.gitignore`, `docs/README.md`, complemento ao
runbook Claude SEO; novos `intelligence/` (package, env exemplo, dependências/
lock, SQL e seis módulos de teste), três scripts PowerShell, runbook de
conectividade e este relatório. Mantidos os arquivos de auditoria/arquitetura/
manifesto locais da rodada anterior; não são alterações remotas.

Ignorados: venv, raw/normalized/analysis/state/pending/cache, recovery da
execução com default vazio, PNG/XLSX de teste e HTML público. Config externa
e memória privada não entram no clone. Nenhum frontend/API operacional,
schema/migration, tema, proteção ou skill upstream mudou nesta rodada.

## 20. Estado Git final

Branch develop, HEAD 98e8772a2253c101fc22b7730d429f0aa40b09d6.
Antes desta rodada já havia docs/README.md modificado e quatro documentos
novos da auditoria anterior. Agora há código/docs locais para revisão;
nenhum arquivo staged, commit ou push. Evidências operacionais ignoradas;
nenhum diretório raw/analysis/normalized/pending/state na raiz do clone.

## 21. Próxima ação

Selecionar projeto Google e informar só ID. Depois concluir acessos externos
e executar probes/baseline GSC/GA4 28/90, PSI/CrUX; investigar ausência de
pedidos site e canonicals do espelho em paralelo. Validar tracking e margem/
períodos antes de priorizar campanhas ou construir dashboard.
Merchandising score, decisões de vitrine e experimentos seguem propostas,
com aprovação humana e medição; nenhuma automação de publicação foi ativada.
