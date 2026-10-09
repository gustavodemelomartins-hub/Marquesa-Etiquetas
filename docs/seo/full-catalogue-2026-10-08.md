# SEO integral da Marquesa — publicações, validações e dependências

Foram escritos **327 produtos**, preservados **271**, validadas as **26
categorias**, publicada e verificada a meta da home e os títulos/metas de
**cinco páginas institucionais**. O ledger de produtos terminou em **327
VALIDATED, 271 SKIPPED, zero FAILED e zero PENDING**. A auditoria pública AFTER
aprovou os 499 PDPs e as 533 URLs do sitemap.

Esse resultado não encerra as dependências de fonte do tema e Merchant:
Organization com logo, ProductGroup, título independente da home e correções
CWV continuam bloqueados por acesso FTP seguro não configurado. Uma oferta
Merchant continua reprovada, duas em revisão e um produto sem matching.
Nenhum desses itens foi apresentado como corrigido.

## Catálogo e cobertura integral

| Medida | Evidência |
|---|---|
| Catálogo classificado | 598 produtos, 675 variantes, 26 categorias |
| Produtos publicados | 499 |
| Vendáveis no snapshot final | 421 |
| Escritos nesta missão | 327 produtos: 87 descrições, 285 títulos SEO e 180 metas SEO |
| Preservados/skipped | 271 produtos, todos com motivo |
| Vendáveis escritos | 327 |
| Vendáveis skipped | 94: 45 suficientes, 44 anteriores, 3 duplicatas, 1 conflito de cor e 1 conflito de acabamento |
| Estados finais do ledger | 327 VALIDATED, 271 SKIPPED, 0 FAILED, 0 PENDING |
| Auditoria AFTER | 578 alvos e 579 checkpoints/fetches, incluindo cache histórico separado |
| Parity pública de PDP | 499 aprovadas, zero falhas; nenhum alt ausente na galeria pública |
| Sitemap AFTER | 533 URLs, todas HTTP 200; canonical/noindex consistentes |
| Parâmetros | 36 páginas examinadas: variantes, filtros, ordenação e paginação |
| URLs históricas | 8 com HTTP 404, fora do sitemap atual |
| Reconstrução de propostas AFTER | Zero delta editorial adicional de produto; 26 categorias revisadas já presentes na API/HTML |

Os oito 404 históricos não representam oito produtos publicados
indisponíveis. A prova por identidade confirmou os 499 PDPs publicados. URLs
do GSC, aliases antigos e anúncios ocultos foram separados do conjunto atual.
Não houve troca de handle, criação de produto ou redirecionamento por
semelhança de nome.

O [ledger por produto](results-2026-10-08/products.csv) e o
[resumo do catálogo](results-2026-10-08/catalogue-summary.json) usam os nomes
definidos em `scripts/seo-catalog-report.py`. O export mascara conteúdo dos
produtos não publicados; snapshots comerciais e provas detalhadas permanecem
privados. Ele exige estados finais VALIDATED/SKIPPED e parity pública.

Canonical e parâmetros foram examinados no HTML; as páginas observadas de
variante/filtro apontam à página principal quando apropriado. Isso não
certifica todas as combinações possíveis de filtros. A documentação oficial
orienta consistência entre links internos, sitemap e canonical e trata
parâmetros opcionais de variantes. [Estrutura de URLs para ecommerce](https://developers.google.com/search/docs/specialty/ecommerce/designing-a-url-structure-for-ecommerce-sites).

O envio do sitemap ao GSC foi confirmado em **08/10/2026 às 21h39 de Brasília**
(09/10 às 00h39:19.408 UTC): um sitemap aceito, aguardando download, sem erros
ou warnings naquele retorno. Aceitação não significa indexação de todas as
URLs nem garante posição nos resultados.

## Produtos, conteúdo e propagação de cache

Títulos/metas suficientes foram preservados. As propostas priorizam modelo,
desenho, material/acabamento e medidas registrados. Novas introduções mantêm
exatamente a ficha, os cuidados e o conteúdo original abaixo do primeiro
parágrafo. Variantes, fotos, URLs e nomes comerciais permanecem vinculados ao
mesmo produto. As 45 publicações anteriores foram reauditadas e preservadas;
não entraram na contagem de 327 novas escritas.

No D0, 372 propostas passaram pela seleção editorial inicial. O conflito
“28k” no nome/handle versus “Ouro 18k” na ficha bloqueou um candidato antes de
publicação. A elegibilidade foi reavaliada com API fresca na retomada, e nove
produtos antes sem variante vendável receberam propostas adicionais com
`before` exato, gate factual e baseline público existente. O resultado final
considera a disponibilidade real, sem escrever estoque.

O produto 313682963 inicialmente entregou conteúdo antigo no cache da forma
com barra final. A leitura limpa sem barra mostrou o conteúdo novo e a
canonical original. Na conferência final de **09/10 às 01h23 BRT**, a própria
URL original com barra também passou: HTTP 200, título, meta, descrição,
canonical, comércio e Product/Offer compatíveis. A propagação foi resolvida
por leitura, sem repetir PUT, criar redirect ou migrar URL. As provas anteriores
permanecem no journal; o ledger registra a prova final limpa.

O writer encontrou limite de título expresso em **bytes UTF-8**: um texto de
69 caracteres/72 bytes foi devolvido truncado em “Marque”. O readback acionou
parada de segurança por diferença editorial, preservando o contrato
comercial. O título foi reparado e 11 propostas longas foram encurtadas. O
writer guarda 70 bytes UTF-8; a revisão adicional de nove itens usou margem
até 68 bytes e metas até 160 caracteres/320 bytes. Essa é restrição observada
da plataforma, não regra universal do Google.

Falhas transitórias de tentativa/cache foram resolvidas e não são somadas
como resultado final. WRITTEN sem readback/HTML correspondente não foi
promovido silenciosamente a VALIDATED.

## Categorias, home e institucionais

As **26 categorias estão validadas**, com nomes, parents, handles e hierarquia
exatamente preservados no fechamento. A seleção editorial distingue família
geral, Prata 925, público infantil/masculino e identidade das coleções. Duas
regressões transitórias de identidade/parent foram reparadas e as 26 passaram
pela verificação final. A alteração de Google Product Category é separada dos
textos SEO e da hierarquia comercial.

A home recebeu meta factual sobre colares, brincos, anéis, pulseiras, prata
925 e banho de ouro 18k. A canonical limpa foi recapturada em **08/10 às 12h42
de Brasília**, exibindo a meta nova. O nome “Marquesa Semijóias” foi mantido;
um título independente da home continua dependente de fonte do tema, pois o
campo disponível no painel está associado ao nome da empresa.

Cinco páginas receberam título/meta com HTTP 200, canonical original e corpo
preservado:

- [Como comprar](https://marquesasemijoias.com.br/como-comprar/).
- [Quem somos](https://marquesasemijoias.com.br/quem-somos/).
- [Política de privacidade](https://marquesasemijoias.com.br/politica-de-privacidade/).
- [Trocas e devoluções](https://marquesasemijoias.com.br/trocas-e-devolucoes/).
- [Cuidados](https://marquesasemijoias.com.br/cuidados/).

A comparação do corpo normaliza a codificação rotativa de proteção de
e-mail do Cloudflare e whitespace de texto HTML; elementos, atributos e
conteúdo público decodificado são preservados. Não houve
alteração de políticas comerciais/jurídicas, nomes, navegação ou URLs.

## Product, Organization e acesso à fonte do tema

A auditoria percorreu JSON-LD recursivamente, inclusive
`WebPage.mainEntity`, e distinguiu o Product da própria canonical/Offer URL
dos produtos recomendados. Microdata também foi examinada; no baseline, os
499 Products principais estavam em JSON-LD. O parser anterior de primeiro
nível produzia falsos negativos, corrigidos na auditoria integral.

Não foi injetado Product redundante. Nome, imagem, offers, preço, BRL e
availability foram examinados, com parity pública AFTER compatível com a API
nos 499 PDPs. Prova de HTML/parser não substitui resposta de teste de
resultados avançados nem avaliação de elegibilidade pelo Google.
[Merchant listing structured data](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing).

O tema gera `offers.seller.Organization` repetido com nome e sem logo, URL ou
`@id`. A falta foi observada em 563 páginas/checkpoints, incluindo PDPs,
categorias e aliases. O logo oficial existente tem 320 × 128 px. A proposta
de fonte é Organization central com URL/logo/identidade consistente e
referências de seller. Logo e URL são informações recomendadas; a ausência
não foi tratada como rejeição de todos os Products. [Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization).

**Não foram publicados:** Organization central com logo, ProductGroup para
variantes ou título independente da home. Também não houve correção de CWV
no código do tema.

O tema ativo é **Amazonas**. O painel autenticado mostrou FTP aberto e senha
mascarada, mas não confirmou profile/sessão segura para baixar, editar e
publicar os arquivos. Nenhuma senha foi lida/regenerada para a auditoria. O
rascunho Rio antigo não foi publicado para limpar cache ou aplicar mudanças
no Amazonas.

A documentação atual distingue Amazonas legado, editável por CLI em modo
FTP, de temas por seções editados via fork. Recomenda backup antes de alterar;
fechar FTP legado elimina personalizações de fonte. A continuação exige
configuração protegida, download/backup do Amazonas ativo, alteração
restrita, revisão/publicação e rollback. [Edição do código do layout](https://atendimento.nuvemshop.com.br/pt_BR/personalizacao-avancada-do-layout/como-editar-o-codigo-do-layout-da-minha-loja),
[CLI oficial da Nuvemshop](https://atendimento.nuvemshop.com.br/pt_BR/para-parceiros-nuvemshop/como-instalar-e-usar-a-cli-da-nuvemshop-para-editar-layouts).

## Imagens e fidelidade

Houve **zero escrita de imagens**. Fotos, ordem e vínculos foram preservados;
a verificação AFTER encontrou zero alt ausente nas galerias públicas dos 499
PDPs. Isso não constitui revisão visual integral de todos os alts.

A auditoria marcou uma imagem principal original de **640 × 427 px**, abaixo
de 500 px em uma dimensão. No export posterior Merchant, **179 URLs** usam
derivados identificados como 480 e 573 como 1024. O sufixo da CDN deve ser
separado da resolução do original e de uma medição real do arquivo servido;
não foi comprovada rejeição generalizada por derivados de 480.

A documentação oficial anuncia mínimo de 500 × 500 px para todos os produtos
a partir de **31/01/2027**. Em outubro de 2026, tratar o gap como qualidade e
preparação, confrontando o diagnóstico real de cada oferta, sem atribuir
retroativamente rejeição ao limite futuro. [Image link no Merchant Center](https://support.google.com/merchants/answer/6324350?hl=en-GB).

Casos registrados nos CSVs de [original principal abaixo de 500](results-2026-10-08/original-images-below-500.csv)
e [derivados menores do feed](results-2026-10-08/feed-image-derivatives-below-500.csv).
Não houve geração de imagem nem fabricação de detalhe da peça.

## Merchant Center e processamento assíncrono

Produtos de catálogo, variantes/ofertas e itens descobertos pelo Google têm
unidades diferentes. O resumo de integração da Nuvemshop não foi tratado
como inventário completo do Merchant.

| Fotografia | Ofertas | Correspondência com publicados | Fontes / status |
|---|---:|---:|---|
| D0/export inicial | 463 | 437/499; 62 sem oferta correspondente | 288 API e 175 Found by Google |
| Última consulta, 08/10 às 20h08 BRT | 752 | 498/499; 1 sem oferta correspondente | 573 API e 179 crawler; 749 aprovadas, 1 reprovada, 2 em revisão |

As 62 ausências iniciais tinham estoque/preço mínimos e imagem no catálogo;
isso não prova aprovação ou elegibilidade de política. Na última conciliação
restou o **Anel Cravejado Cristal Banho de Ouro 18k**, produto **281082552,
SKU 843659**, sem matching. Não foi criada oferta substituta nem reescrito
identificador para compensar a ausência.

A atualização Merchant exibida às **18h56 de Brasília** precede as novas
escritas da retomada. O aumento de 463 para 752 ofertas **não foi atribuído
causalmente às alterações SEO** desta etapa.

A oferta descoberta **174404**, Brinco Ponto de Luz Banho de Ouro 18k,
continua reprovada por preço ausente e verificação da loja pendente. O PDP e
a API comprovam **49 BRL** e disponibilidade; o registro do crawler ainda não
reflete esse preço. Foi solicitado “Update products now” uma vez à fonte
Found by Google, preservando preço, IDs, fontes e arquivos. Pedido de crawl
não comprova processamento concluído ou aprovação.

O valor 49 foi preparado na UI, **não salvo**. A revisão automática de
aprovação rejeitou salvar a edição porque a mesma operação envolveria três
atributos desconhecidos. A continuação dessa ação aguarda aprovação humana;
não foi descrita como correção aplicada.

Duas ofertas com marca **“Mrquesa”** permanecem inalteradas. Preço ausente do
crawler, matching de catálogo e aprovação são problemas distintos. A
especificação oficial exige consistência entre oferta/site; não permite
resolver ausência de identificador fabricando GTIN. [Product data specification](https://support.google.com/merchants/answer/7052112?hl=en).

## Google Product Category

As seis correções GPC foram **publicadas e validadas na API** em 08/10 às
21h43 BRT. Presentes foi a canary: `Vestuário e acessórios > Joias > Conjuntos de joias`
(Google 6463). Promessas, Elos de Amor, Raizes, Essência e Aurum receberam
`Vestuário e acessórios > Joias` (Google 188), conforme os produtos reais dessas
coleções mistas. Todos os campos comerciais, nomes, handles, hierarquia e SEO
foram preservados. A leitura pública das 26 categorias passou após essas
alterações. A propagação dos novos valores ao Merchant ainda não foi comprovada;
o feed consultado era anterior às seis correções.

Detalhamento em [categorias](results-2026-10-08/categories.csv) e
[provas técnicas](results-2026-10-08/technical-summary.json).

O Google atribui categorias automaticamente e permite override nos casos
descritos na documentação. Uma classificação própria da loja não deve ser
apresentada como caminho oficial inventado. [Google product category](https://support.google.com/merchants/answer/6324436?hl=en).

## Performance mobile e busca

PSI mobile, Lighthouse 13.5.0, foi coletado em 08/10/2026 para duas URLs. É
amostra de performance; catálogo e sitemap tiveram auditoria integral.

| Página | Performance | SEO Lighthouse | FCP | LCP | TBT | CLS |
|---|---:|---:|---:|---:|---:|---:|
| Home | 52 | 92 | 6,5 s | 12,6 s | 290 ms | 0,002 |
| Chaveiro Pai e Filhos | 43 | 92 | 3,2 s | 10,5 s | 870 ms | 0,137 |

O retorno não trouxe métricas CrUX/INP. Esses números são de laboratório;
não comprovam aprovação real de Core Web Vitals nem melhora pós-publicação.
As oportunidades incluem JS não utilizado, recursos bloqueando renderização,
descoberta da imagem LCP, cache e links sem `href` rastreável. Correções de
código continuam dependentes da fonte FTP. PSI distingue laboratório
Lighthouse e experiência real CrUX. [Sobre o PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/about).

O GSC D0 Web de 08/09–05/10/2026, maduro até 05/10, contém 46 linhas página ×
query, 42 queries distintas, 111 impressões e 2 cliques **nessas linhas**.
Esses números não são volume de busca nem todos os acessos da loja. A maior
query específica observada, “chaveiro pai e filho”, teve 52 impressões, zero
cliques e posição média 8,81; conteúdo suficiente do produto foi preservado.

A comparação geral de 28 dias registrada no fechamento mostrou **19 cliques e
931 impressões**, contra **18 e 1.151** na janela anterior. São totais gerais,
distintos do subconjunto de queries D0. As publicações ainda não maturaram;
a diferença de janelas não demonstra efeito causal do SEO.

O [mapa de palavras-chave](keyword-map-2026-10-08.md) separa queries observadas
de intenção inferida, cobre as 26 categorias e diferencia banho de ouro de
ouro maciço e banho de prata de prata 925. Nenhum ganho de ranking, tráfego ou
venda foi demonstrado nesta execução.

D0 dos novos produtos segue o receipt real de publicação de **08/10/2026,
horário de Brasília**: D7 em **15/10**, D28 em **05/11**, D56 em **03/12** e D84
em **31/12/2026**. Os 45 anteriores mantêm seus próprios D0/calendários.
O registro final de agendamento consta no fechamento operacional abaixo;
não se presume scheduler ativo só pela existência de datas no ledger.

## Gaps preservados, incidentes e segurança comercial

| Item | Tratamento |
|---|---|
| Anel Incolor com ficha dourado/verde | Skip factual, sem nova alegação de cor |
| Dois Anéis Aparador de Aliança de mesmo nome | Skip sem distinção factual; nenhuma diferença artificial por cor comum/SKU |
| Pulseira Cordão Baiano com handle terminado em `2` | Skip por ausência de diferença verificável |
| Colar Cordão Baiano “28k”, ficha 18k | Skip antes da publicação por conflito de acabamento |
| 27 grupos de SKU duplicado no baseline | Reportados; nenhum SKU reescrito por SEO |
| Claims legados de garantia/hipoalergenicidade | Catalogados; sem nova promessa para preencher conteúdo/schema; ficha original preservada |
| Handles legados e 8 URLs históricas | Mantidos; sem redirect inferido |
| Falso negativo inicial de schema | Parser recursivo corrigido; recomendados separados do Product principal |
| Filtro de checkout alcançando Cartier | Corrigido para segmentos exatos; PDPs completadas, checkout não acessado |
| Trava breve do Windows em checkpoint | Cache/escrita atômica com retry preservaram baseline |
| Cache inicial da home | Canonical limpa confirmada com meta nova; tema Rio antigo não publicado |
| Duas regressões de identidade/parent de categoria | Reparadas; 26 categorias com hierarquia final exata |
| Truncamento de título UTF-8 | Reparado; 11 propostas encurtadas; guard de 70 bytes |
| Cache editorial final do produto 313682963 | Resolvido: URL original com barra passou no readback final de 09/10 às 01h23 BRT |
| Estoque externo durante interrupção | API fresca reavaliou elegibilidade; sem escrita de saldo pelo SEO |

O snapshot de retomada de **08/10 às 20h33 BRT** registrou 421 vendáveis,
contra 468 no D0. Mudou o estoque de **254 variantes** fora do writer durante
a interrupção de oito horas. A comparação final encontrou **zero drift
comercial não relacionado a estoque**: preços, nomes, SKUs, fotos, IDs e
assignments foram preservados. Desde o snapshot de retomada houve **zero
mudança de estoque** na comparação. O SEO não redistribuiu saldo por variante.

Passaram **43 testes Node e cinco testes Python focados**, sem falhas. A parity AFTER aprovou 499 PDPs sem falha
comercial e sem alt ausente. Falhas de tentativa anteriores não foram
contabilizadas como falhas finais depois de resolvidas.

## Provas, rollback e fechamento operacional

As provas privadas incluem snapshots API, HTML antes/depois, journals de
escrita/readback, status por produto/categoria, exports Merchant e relatório
PSI. São fontes desta síntese, sem copiar dados privados ou credenciais para
Git. Artefatos principais: `audit.json`, `parity-after.json`,
`products-status.json`, `categories-status.json`,
`institutional-public-validation.json`, `merchant-after-reconciliation.json`,
`tools/performance.json` e comparação comercial final da execução.

O backup privado anterior às alterações tem SHA-256
`50ff1afa9f092c1289ec6b1ee0f8820a7c96dd15f041bc5f1316f25ef28cbc6f`.
Journals e conteúdo anterior permitem rollback dos campos editoriais, sem
alterar estoque, preço, SKU, fotos, nomes ou políticas.

**Fechamento operacional:** código e relatórios na branch
`codex/seo-catalogo-integral-2026-10-08`, baseada em `0fab9972`. O vault privado
recebe Canonical, Estado-Atual, Graphify Lite e Run desta execução. O commit
exato é registrado no Run e no resultado do push; nenhum deploy de Worker ou
mudança D1 faz parte desta publicação editorial.

Quatro acompanhamentos ativos no app foram registrados para **15/10, 05/11,
03/12 e 31/12/2026, às 22h30 de Brasília**, ligados a este chat. Fazem somente
leitura de GSC/loja/Merchant e mantêm os D0 individuais. Agendamento depende
do executor local disponível na data, sem promessa de ganho ou execução já realizada.

A captura API final é de **09/10/2026 às 01h23:36 BRT** (04h23:36 UTC), com
421 vendáveis, 327 VALIDATED e 94 SKIPPED vendáveis. O conjunto total mantém
598 registros, 327 VALIDATED, 271 SKIPPED, zero FAILED e zero PENDING.

As publicações de conteúdo, categorias, home e institucionais têm provas
próprias. As dependências abertas estão identificadas: tema exige perfil
FTP protegido; Merchant
mantém uma reprovação, duas revisões e uma ausência de matching. Preservar
essa distinção impede apresentar publicação editorial como resolução de
processamento Google ou de código do tema.
