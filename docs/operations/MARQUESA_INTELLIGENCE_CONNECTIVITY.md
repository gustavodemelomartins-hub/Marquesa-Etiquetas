# Marquesa Intelligence — conectividade Codex-first

Estado local atualizado em 04/10/2026. Objetivo humano vigente: aumentar vendas, receita,
conversão e ticket médio do e-commerce. SEO contribui para esse objetivo.
O baseline anterior foi aprovado; a implementação abaixo permanece local,
somente leitura para dados comerciais. Nenhum deploy, migration remota ou
publicação. A configuração Google segue autorização humana, com estado abaixo.

## Runtime e comandos

Python 3.14.7, isolado em `.venv-seo`. Dependências principais em
[requirements.txt](../../intelligence/requirements.txt); bibliotecas opcionais de
relatórios em [requirements-reports.txt](../../intelligence/requirements-reports.txt).
Os pisos oficiais do toolkit foram consultados na revisão
`ff87fcee0734845d3f59128c8c905799ee2298da`; instalamos o subconjunto Google e
relatórios usado aqui, sem instalar Claude Code, Playwright ou launcher Claude.
O [lock Windows/Python 3.14](../../intelligence/requirements-lock-win-py314.txt)
registra as 51 distribuições locais, incluindo relatórios; não é um lock universal.

```powershell
# Instalação local idempotente e configuração EXTERNA vazia.
.\scripts\setup-marquesa-intelligence.ps1 -Reports
# Não repete instalação se o runtime já estiver pronto:
.\scripts\setup-marquesa-intelligence.ps1 -SkipRuntime

.\scripts\marquesa-intelligence.ps1 doctor
.\scripts\marquesa-intelligence.ps1 schedule-plan
# Baseline offline a partir dos snapshots já coletados:
.\scripts\marquesa-intelligence.ps1 baseline --windows '28,90'
# Coleta real: requer rede e autenticação Wrangler já existente, somente SELECT.
.\scripts\marquesa-intelligence.ps1 collect --sources 'commerce' --windows '28,90'
# Após configuração Google, sem repetir dados comerciais:
.\scripts\marquesa-intelligence.ps1 collect --sources 'gsc,ga4' --windows '28,90'
.\scripts\marquesa-intelligence.ps1 collect --sources 'pagespeed,crux'
# Inspeção pública limitada: --pdp-url pode ser repetido, até 20 URLs explícitas.
.\scripts\marquesa-intelligence.ps1 collect --sources 'storefront'
# GET produtos da API, opcional; requer credencial externa read_products.
.\scripts\marquesa-intelligence.ps1 collect --sources 'nuvemshop'
.\scripts\marquesa-intelligence.ps1 pending
```

O [runner PowerShell](../../scripts/marquesa-intelligence.ps1) resolve o Python
do projeto e não avalia comandos provenientes de `.env` ou skills. O pacote
[Python](../../intelligence/marquesa_intelligence/__main__.py) também pode ser
invocado por `python -m marquesa_intelligence`, com `PYTHONPATH=intelligence`.
Erros de coletor dão código de saída 2 e status sanitizado; configuração inválida
dá 1. Pendência humana explicitamente identificada não é sucesso de autenticação.

Google Auth/API/GA4, requests, tzdata, matplotlib e openpyxl funcionam no runtime.
WeasyPrint 70 está instalado, mas o import falha por bibliotecas nativas ausentes
no Windows. PDF é opcional e continua pendente; isso não impede coleta/JSON/XLSX.
Não instalar bibliotecas globais para contornar essa limitação nesta rodada.

## Credenciais e configuração

Configuração real em `%USERPROFILE%\.config\marquesa-seo\.env`. O setup criou
apenas um modelo vazio e restringiu a pasta nova ao usuário atual e SYSTEM,
sem herança de permissões. Configuração existente não é sobrescrita.
Uma credencial de service account existente foi validada e copiada para essa
pasta protegida. O arquivo original não foi removido. Nenhuma chave remota nova
foi criada. API key PSI/CrUX e token Nuvemshop continuam ausentes neste snapshot.

O `doctor` foi verificado no contexto do usuário, com projeto/propriedade
presentes. O sandbox do Codex não tem acesso à pasta por causa da ACL restrita;
nesse contexto, o teste de presença retorna ausente. Não relaxar a ACL para
contornar essa diferença; executar probes autorizados no contexto do usuário.

[.env.example](../../intelligence/.env.example) contém somente nomes:

| Nome | Finalidade |
|---|---|
| `GOOGLE_CLOUD_PROJECT` | Projeto selecionado pelo humano, configuração não secreta |
| `GOOGLE_APPLICATION_CREDENTIALS` | Caminho externo para JSON da service account |
| `GOOGLE_API_KEY` | PSI e CrUX; restrita a essas APIs |
| `GSC_PROPERTY` | Propriedade exata autorizada, confirmada por `sites.list` |
| `GA4_PROPERTY_ID` | ID NUMÉRICO, diferente do measurement ID `G-...` |
| `NUVEMSHOP_STORE_ID`, `NUVEMSHOP_TOKEN` | GET catálogo opcional, fora do Git |
| `MARQUESA_API_URL`, `MARQUESA_API_KEY` | Reservados; nenhum adapter HTTP ERP foi implementado, pois D1 já atende |
| `MARQUESA_INTELLIGENCE_STORAGE` | Opcional; vazio usa `.local/intelligence` |

O validator não imprime valores. Credencial Google dentro do clone é recusada.
Configuração vazia não substitui defaults. Storage dentro do clone só pode
usar `.local/intelligence` ou seus descendentes; paths versionáveis são recusados.
Esse último gate foi adicionado após detectar e corrigir um caso com variável
vazia; as evidências daquela execução foram movidas, sem exclusão, para recovery
na área ignorada. Nenhum dado foi commitado/enviado.

`.gitignore` cobre runtime, evidência local, caches/egg-info/build e nomes
específicos de credenciais. Não existe exclusão genérica de todos os JSON.
Headers, private keys, bearer tokens e URLs com credenciais/chaves são recusados
pela storage. API key Google vai em `X-Goog-Api-Key`, nunca em URL persistida.
Erros externos não imprimem corpos, headers ou texto da exceção.

## Projeto selecionado e progresso em 04/10/2026

O humano informou `marquesa-seo`; o Console autenticado confirmou esse projeto.
Search Console, Analytics Data, PageSpeed e Chrome UX Report foram confirmadas
como habilitadas. A ativação CrUX foi entregue ao humano por exibir aceite de
termos; depois, o Console mostrou status Ativado. A conta de serviço existente
`marquesa-seo-readonly` e duas chaves de agosto foram encontradas no Console.
Reutilizamos o JSON correspondente à chave mais recente, validando projeto,
identidade, identificador da chave, endpoint OAuth e estrutura criptográfica
sem expor valores privados. A autenticação direta confirmou GSC e GA4.
O próximo passo humano depende do estado verificado no navegador, não deste
snapshot; não repetir criação de projeto ou habilitação já concluída.

Projeto e propriedade GSC confirmada foram registrados no `.env` externo:

```powershell
.\scripts\marquesa-intelligence.ps1 configure-google --project marquesa-seo --gsc-property sc-domain:marquesasemijoias.com.br
# Propriedade numérica confirmada na interface Analytics da loja:
.\scripts\marquesa-intelligence.ps1 configure-google --project marquesa-seo --ga4-property 473886060
```

O comando salva só metadados não secretos, preserva linhas de credenciais e
recusa troca implícita de projeto/propriedade previamente preenchidos.

GSC estava disponível por OAuth já existente no conector GSC Wizard do Codex.
Recuperamos query, page, query+page e totais sem dimensão, com raw salvo antes
de transformar. Maturidade informou 29/09/2026 como último dia consolidado;
30/09 foi excluído do baseline. 28 dias: 02–29/09, 21 cliques, 974 impressões,
CTR 2,156% e posição média 9,515. 90 dias: 02/07–29/09, 37 cliques, 2.150
impressões, CTR 1,721% e posição 10,076. Esses são dados atuais coletados nesta
rodada, distintos do histórico de agosto. Todas as respostas indicaram fonte API.

O conector retorna CTR em pontos percentuais; raw mantém esse valor e o
adapter recomputa clicks/impressions para fração compatível com o coletor
Google direto. Dados incompletos, propriedade/período inconsistente ou
paginação desconhecida são recusados. Reimportação idêntica não cria pending.

```powershell
# Depois de o Codex salvar os responses autorizados em arquivo ignorado:
.\scripts\marquesa-intelligence.ps1 import-gsc-connector --file .local/intelligence/incoming/gsc_wizard_baseline_20261003.json
.\scripts\marquesa-intelligence.ps1 baseline --windows '28,90' --end-date 2026-09-29
```

Esse conector é acesso interativo do Codex, não autenticação do scheduler
Python. GA4 pelo
mesmo conector informou `notConfigured/no_scope`; não usar resposta vazia como
zero tráfego/receita. Não ativamos vínculo ou OAuth adicional nesse fornecedor.

Depois dessa recuperação interativa, a service account existente autenticou
`sites.list` como `siteRestrictedUser`. Coleta direta de query/page/query+page e
totais para 28/90 dias reproduziu os mesmos totais e contagens de linhas do
conector. As versões raw de ambas as fontes permanecem na área ignorada.

GA4 direto, propriedade `473886060`, coletou metadata, compatibility, overview,
landing pages, events e items para all traffic/Organic Search, além do funil
alpha de usuários. Todos os relatórios internos tiveram status collected.
Metadata: BRL, America/Sao_Paulo, sem restrição de receita informada. Overview:
285/1.143 sessões totais e 47/172 orgânicas, respectivamente 28/90 dias;
127/556 sessões engajadas totais e 28/103 orgânicas. GA4 informa zero compras e
receita nos dois períodos, sem evento purchase. Isso não demonstra zero vendas
operacionais. Validar tracking e cobertura Nuvemshop antes de concluir.

A tentativa de descoberta pela Analytics Admin API retornou 403; não ativamos
essa API nem ampliamos IAM. O ID foi obtido pela interface da propriedade; a
Data API funcionou sem essa dependência. Não confundir 403 Admin com falha GA4.

Existe `Chave de API 1`. Na continuação de 04/10, a lista de credenciais passou
a mostrar 3 APIs; a dica de restrições confirmou Search Console, PageSpeed e
CrUX efetivamente salvas, preservando as duas APIs anteriores. O Console
inicialmente falhou ao carregar a lista; uma recarga trouxe CrUX. O Codex não
clicou Salvar. O botão Copiar chave foi acionado, o Google confirmou Código
copiado e a janela de exibição foi fechada sem imprimir o valor. Falta somente
o humano colar a chave em GOOGLE_API_KEY no `.env` externo e salvar. O doctor
no contexto do usuário ainda informou google_api_key.configured=false.
Depois: probes autenticados PSI/CrUX; não repetir chamadas anônimas com quota 0.
Não criar outra chave, remover permissões antigas ou abrir a credencial a todas
as APIs para facilitar a configuração. Restrições de aplicativo existentes
não foram modificadas.

## Seleção do projeto — procedimento inicial já concluído

1. Abrir [Gerenciar projetos](https://console.cloud.google.com/cloud-resource-manager)
   e entrar com a conta administradora da Marquesa.
2. Selecionar o projeto destinado à loja. Se não houver, clicar **Criar projeto**,
   nome **Marquesa Intelligence**, mantendo organização/faturamento conforme a conta.
3. Copiar apenas o **ID do projeto** exibido nos detalhes e informar ao Codex.
4. Não conceder acesso ao agente nesta etapa; não enviar chaves no chat.
5. Confirmação: ID copiado e projeto selecionado no seletor superior.

Esse procedimento está concluído. O estado atual é o registrado acima;
as etapas abaixo orientam somente configurações ainda não verificadas.

## Roteiro humano posterior, após seleção do projeto

| Etapa | Tela/botão | Valor ou permissão | Confirmação |
|---|---|---|---|
| APIs | [Biblioteca de APIs](https://console.cloud.google.com/apis/library), projeto selecionado; buscar cada nome; **Ativar** | Google Search Console API, Google Analytics Data API, PageSpeed Insights API, Chrome UX Report API | As quatro aparecem em APIs e serviços habilitados |
| Service account | [Contas de serviço](https://console.cloud.google.com/iam-admin/serviceaccounts), **Criar conta de serviço** | ID `marquesa-seo`; pular concessão de papéis IAM no projeto e acesso de outros usuários | Conta criada, copiar `client_email` |
| JSON | Conta `marquesa-seo` → **Chaves** → **Adicionar chave** → **Criar nova chave** → JSON | Mover arquivo para a pasta externa; informar caminho só no `.env` externo | `doctor` mostra arquivo presente, sem imprimir conteúdo |
| GSC | [Search Console](https://search.google.com/search-console) → propriedade Marquesa → **Configurações** → **Usuários e permissões** → **Adicionar usuário** | `client_email`, inicialmente **Restricted/Restrito** para análise; nunca Owner | `sites.list` e Search Analytics respondem; testar inspection/sitemaps; elevar a Full apenas se faltar permissão comprovada |
| GA4 | [Analytics](https://analytics.google.com/) → propriedade correta → **Administrador** → **Gerenciamento de acesso à propriedade** → **+** → adicionar | `client_email`, **Viewer/Leitor**, sem restrição de métricas de receita | ID numérico em detalhes da propriedade, metadata/runReport com acesso e receita |
| Chave PSI/CrUX | [Credenciais](https://console.cloud.google.com/apis/credentials) → **Criar credenciais** → **Chave de API** → editar | Restringir APIs a PageSpeed e Chrome UX Report; não usar HTTP referrer para runner Python local | Salvar chave somente no `.env` externo; probes autenticados respondem |

Se a organização proibir chaves JSON de service account, manter a política e
planejar autenticação sem chave; não desabilitar a proteção. Se o IP de saída
for estável, a chave pode também ser restrita por IP; não inventar IP dinâmico.

A [tabela oficial de permissões GSC](https://support.google.com/webmasters/answer/7687615)
e [URL Inspection API](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)
orientam o menor acesso; a API lê a versão indexada, sem teste ao vivo/submissão.
[Viewer GA4](https://support.google.com/analytics/answer/9305587) permite leitura;
a restrição de receita impediria o objetivo comercial. Não criar Owner por conveniência.

A propriedade confirmada pelo conector é `sc-domain:marquesasemijoias.com.br`.
Após conceder acesso à service account, verificar a mesma propriedade por:

```powershell
.\scripts\marquesa-intelligence.ps1 discover-google
# Opcional: somente se Google Analytics Admin API JÁ estiver habilitada.
.\scripts\marquesa-intelligence.ps1 discover-google --ga4-admin
```

Admin API é opcional para descoberta; copiar o ID pela interface evita essa
dependência. Knowledge Graph não tem uso demonstrado agora. Indexing API não
é habilitada, configurada nem suportada pelo código.

## Fontes, períodos e limites

- **GSC:** query, page, query+page e totais sem dimensão, 28/90 dias, web,
  `dataState=final`; termina 3 dias calendários antes, no fuso Pacific.
  Paginação de 25 mil, cap 100 mil por relatório. Queries anonimizadas/top rows
  impedem interpretar soma de queries como todo o tráfego. Métodos adicionais
  `list_sitemaps` e `inspect_url` são leitura, sem enviar sitemap.
- **GA4:** all traffic e Organic Search, overview, landingPage, events e items,
  metadata/compatibility antes da leitura, paginação/cap e quality metadata.
  Runner usa mesmo último dia calendário do GSC para os baselines; os fusos
  GA4 da propriedade e GSC Pacific continuam diferentes. Receita por landing
  page é atribuição da landing, não compra do SKU daquela página.
- **Funil GA4:** API alpha de coorte fechada ordenada de usuários, que pode
  atravessar sessões. Taxas dessa coorte são separadas de sessões/event volumes.
  Taxas por sessão/PDP/produto/categoria ficam desconhecidas sem evidência no
  grão correto. Itens comprados são unidades, não pedidos.
- **Tracking:** Data API não prova payload `value/currency/transaction_id`,
  disparo, consentimento ou deduplicação. Validar DebugView/Tag Assistant ou
  export de eventos autorizado posteriormente, sem produzir pedido artificial.
- **PSI:** probe anônimo devolveu 429 RESOURCE_EXHAUSTED, quota diária 0;
  não foi repetido. Necessita projeto/chave/quota. Sem score/CWV fabricado.
- **CrUX:** chave ausente. Resposta 404 após autenticação significará ausência
  de amostra de campo naquela URL, não necessariamente falha de conexão.
- **D1:** SELECT de registro revisado, sem nomes de cliente/revendedora,
  endereços ou observações. Vendas elegíveis `site`, não canceladas, sem
  revendedora/duplicatas históricas. Recebidos são separados de valor de pedidos.
  [SQL](../../intelligence/commerce-readonly.sql) não contém migrations/writes.
- **R2:** buckets prod/dev confirmados via listagem de metadados; zero objetos
  lidos, gravados ou apagados. Não exportar fotos sem tarefa que as justifique.
- **Nuvemshop:** adapter GET de produtos/variantes, `read_products`, cap 20x100.
  [Contrato v1](https://tiendanube.github.io/api-documentation/v1/intro) e backend
  atual usam Authorization Bearer. Sem token externo nesta execução; usamos o
  espelho operacional e HTML público. Estoque externo nunca substitui o razão.

## Identidade e cobertura real

O join é URL exata/canonical observado → `produto_id_loja` → SKU; `item_id`
GA4 observado nas duas PDPs é ID de variante. Nenhum casamento por nome.
Uma URL compartilhada entre SKUs não recebe divisão arbitrária de GSC.
Conflitos IDs/SKU bloqueiam o vínculo. Não inferimos prefixo `/produtos/`.

Em 03/10: 987 produtos operacionais, 674 variantes no espelho (leitura
02/10/2026 15:12:28Z), 617 SKUs com URLs cadastradas e 672 IDs de variantes
ligados a SKU. Zero conflitos nos registros analisados. Só 2 SKUs foram
confirmados por HTML público/canonical; somente essas 2 URLs mapeadas coincidem
com o sitemap atual. 596 URLs distintas do mapa não aparecem nesse sitemap.
Isso não prova que estejam quebradas: podem ser aliases, antigas ou não indexáveis;
verificar redirect/canonical/ID antes de atribuir páginas Google desconhecidas.

Sitemap público: 533 URLs, 499 PDPs individuais (o índice `/produtos/` é outra
página), lastmod máximo 02/10 13:41:08Z. Estoque conferido: 987/987 saldos
materializados iguais ao SUM de movimentos. Isso verifica saldo, não cada evento
histórico ou disponibilidade de cada variante na loja em tempo real.

O D1 não contém linhas `vendas.origem='site'` neste snapshot. Existem vendas
de balcão/acerto, que não foram tratadas como pedidos do e-commerce. Resolver
cobertura/ingestão antes de concluir receita zero, abandono ou produto parado.
Não recuperamos raw de SERP/GSC histórico de agosto por meio desta integração.

## Storage, fila e execução econômica

```text
.local/intelligence/                # ignorado, não publicar
  raw/<fonte>/<snapshot_id>.json     # timestamp, request sem auth, hash, payload
  normalized/                       # snapshots derivados, IDs e coverage
  state/                            # comparações e último sucesso/tentativa
  pending/events.jsonl              # trigger, lineage, hash, llm_calls=0
  analysis/commercial-baseline.json # funil, gaps, A–J, pares e contexto
```

Raw é salvo antes de normalização, imutável por UUID. Nuvemshop raw é uma
projeção explícita de campos de catálogo, descartando campos inesperados.
Diff exclui quota GA4, timings D1 e lineage volátil, mantendo conteúdo e
quality metadata. Coleta possui lease para impedir concorrência e escrita
local atômica. Um crash pode deixar lock: confirmar ausência de processo antes
de remover apenas esse arquivo; não ignorar lease para executar dois jobs.

Capturas brutas Google não enfileiram análise; datasets consolidados e
hipóteses podem criar pending. Janelas rolantes representam outra população
e podem mudar o dataset diariamente: pending é evidência para triagem, nunca
um comando para chamar IA ou publicar. Baseline idêntico não adiciona evento.
Ainda não existe consumer de IA/ack, ação/experimento/resultado persistidos
nem retenção automatizada de raw; não alegar aprendizado executado.

Não criamos tabelas D1 ou outro cadastro operacional. Snapshots são evidência
datada; SKU continua no ERP. O futuro modelo separa raw → normalized → analysis
→ hypothesis → action/aprovação → experiment → result, referenciando IDs.

## Inteligência comercial e sequência

Regras A–J estão implementadas com thresholds explícitos, evidence/coverage,
gaps e aprovação requerida. B/C e taxas G/H/I não usam unidades de itens como
sessões. E/F podem ser analisadas após GSC; D usa apenas margem de referência,
nunca margem líquida histórica. J exige `site_sales_coverage_verified=true`
após verificar ingestão; a mera existência de algumas vendas não prova
cobertura completa. Cross-sell calcula pares de SKUs em pedidos reais distintos,
support, confidence e lift, alertando amostra pequena; zero pares válidos aqui.

Próximas prioridades: autenticar Google; corrigir/entender cobertura de pedidos;
validar URLs/canonicals e eventos; obter baseline financeiro comparável;
calibrar merchandising com conversão, receita, margem de contribuição, estoque,
tendência e demanda; só então painel e recomendações home/coleção/relacionados/
kits/Monte seu Colar/presentes. Nenhuma vitrine é alterada automaticamente.

Painel futuro: receita, conversão, ticket, receita/sessão e por visitante
(denominadores distintos); funil; GSC; ranking comercial de produtos;
oportunidades, experimentos e ações. UI continua planejada até validar dados.

## Scheduler preparado e reversibilidade

[Ação PowerShell](../../scripts/marquesa-intelligence-scheduled.ps1) está pronta
para execução diária com `--due`; não registramos tarefa Windows nem cron Cloudflare.
Proposta: 04h30 Brasília, usuário dono das credenciais, projeto como diretório de
trabalho, execução sem sobreposição. GSC/GA4 e fallback comercial 24h; PSI/CrUX 7d
e execução explícita após frontend relevante. SERP semanal aguarda fornecedor,
quota/custo e credenciais; não há um coletor competitivo ativo nesta rodada.
Para histórico próprio de movimentos/eventos, evoluir do SELECT diário para
eventos operacionais, sem LLM polling.

Rollback local: parar a eventual tarefa futura; preservar evidências desejadas;
reverter somente código/docs dessa rodada; remover runtime local só após
validar destino e autorização. Credenciais externas são geridas pelo humano.
Não há rollback remoto porque nenhuma mutação remota foi realizada.

## Testes

```powershell
.\.venv-seo\Scripts\python.exe -m unittest discover -s intelligence/tests -q
.\.venv-seo\Scripts\python.exe -m pip check
node scripts/docs-links.test.mjs
git diff --check
```

Testes focam contratos: períodos, IDs contraditórios, ausência de métricas,
funil com grão correto, exclusão de duplicatas, saldos, kits, SQL readonly,
paginação, raw-before-normalized, no-op, quota/timestamp, configurações vazias,
paths seguros, exceções/URLs com credenciais e scheduler sem IA. Chamadas
Google/Nuvemshop autenticadas não foram testadas porque dependem do humano.
