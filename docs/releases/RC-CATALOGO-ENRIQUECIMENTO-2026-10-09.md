# RC — conteúdo e enriquecimento do catálogo Nuvemshop (09/10/2026)

**Estado: conteúdo entregue em produção e auditado.** Commit de código `61abd5e`, enviado a `origin/develop` e `codex/catalog-enrichment-2026-10-09`. A integração preservou a frente Cloud `07becfe`, incluindo §§63–64. A regra editorial permanente ocupa §65.

Worker `marquesa-api`: versão **`1c3bc2d0-58e8-4cf9-a3b5-4c94324f2342`**, deployment `5f2ca8a9-4964-48b4-b560-1dfc46a3d2b4`, 100% do tráfego, publicado em **09/10/2026 21:23:11 Brasília** (10/10 00:23:11 UTC). Tag remoto `61abd5e` conferido. D1 `marquesa-db-prod`, UUID `51dd629b-52dc-46d0-a1af-fa37f0a79533`; R2 `marquesa-fotos`; crons existentes preservados.

Pages da outra frente: deployment de produção `08544102-19db-42ac-b759-fa0d783e62e5`, fonte `1aa84ac`, preservado. Esta frente não alterou frontend, tela Loja Online, fluxo visual, vendas históricas ou reconciliação visual.

## Apuração comprovada

Snapshot Nuvemshop final: 10/10/2026 00:13:04 UTC. QA do Marquesa executado novamente após o deploy final. Produtos novos são os registros `nuvemshop_catalogo.origem='criado'`; números de requisitos podem se sobrepor.

| Medida | Resultado |
|---|---:|
| Catálogo remoto inicial / final | 926 / 937 produtos |
| Variantes remotas iniciais / finais | 1.011 / 1.028 |
| Categorias comerciais iniciais / finais | 26 / 28 |
| Novos ocultos | **339: 328 originais + 11 criados pela Cloud** |
| Novos com descrição, SEO, marca, tags e categoria completos | **339** |
| Novos totalmente preparados para o clique humano | **1** — SKU 187604 |
| Novos que precisam somente de foto | **167** |
| Novos sem preço atual confiável | **170** — também precisam de foto |
| Novo com foto + cor de unidade em maleta pendentes | **1** — SKU 162190 |
| Novos sem foto canônica disponível | **338** |
| Coorte original de 328 | 1 pronto, 163 somente foto, 164 sem preço |
| Produtos com escrita editorial e readback integral | **914: 339 novos + 575 antigos** |
| Descrições antigas com código confirmado removido | **574** códigos em 574 produtos |
| Marcas preenchidas/corrigidas | **342: 339 novos + 3 antigos**; todos os 937 agora Marquesa |
| Tags adicionadas/normalizadas | **340 produtos: 339 novos + 1 antigo** |
| Categorias de produto resolvidas/ajustadas | **52: 50 novos + 2 antigos** |
| Textos originais “Precisa de informação” resolvidos | **15/15** |
| Rascunhos factuais adicionais de produtos sem anúncio | **10**, com descrição e SEO únicos; identidade continua bloqueada |
| Pendências de descrição / SEO no Marquesa | **0 / 0** |
| Títulos / metas realmente alterados | **16 / 16**: 15 novos e 1 antigo previamente vazio |
| SEO aprovado não vazio dos antigos alterado | **0** |
| Opções inicialmente faltantes demonstradas no remoto | **8/11**, efetivadas pela frente Cloud |
| Divisões de estoque comprovadas | **8/27**; aplicação operacional pertence à Cloud |
| Estoques ou movimentos alterados por esta frente | **0** |
| Peso/dimensões preenchidos sem regra oficial | **0**; regra logística não comprovada |
| SKU repetido entre produtos remotos | **0** |
| Novos tornados visíveis automaticamente | **0** |
| Preços / estoques inventados | **0 / 0** |
| Divergências de sincronização causadas pela missão | **0** |

Os quatro primeiros estados de preparação dos novos são disjuntos: 1 + 167 + 170 + 1 = 339. Os 338 sem foto incluem os 170 sem preço. Dos 24 originalmente sem anúncio, 11 foram criados ocultos pela Cloud, 12 mantêm dúvida real de identidade e 1 é kit/composição com caminho próprio.

As 8 opções resolvidas são: Vermelho/194149, Pink/198242, aro19/408061, aro24/391471, Roxo/318522 e Azul/Cristal/Vermelho/162190. Comparação usa mesmo SKU e valores semânticos exatos; atributos constantes do anúncio podem ser separados do valor de aro/cor. Não considera Verde igual a Verde Esmeralda por mera unicidade.

## Conteúdo e regra permanente

`catalogo/enriquecimento.js` cruza nome, categoria explícita, ficha existente e atributos reais. Preenche copy, SEO, marca, tags, cuidados e categoria sem determinar preço, saldo, identidade, idade, gênero ou medidas. Nenhuma característica física foi inventada para diferenciar homônimos. SEO único pode variar a redação factual sem prometer peça diferente.

O bloco “Como preservar suas semijoias” reproduz o padrão dominante de 472 anúncios, referência 238432990: evitar água; retirar para dormir/tratamentos/transpiração intensa; guardar individualmente. Informações específicas verdadeiras, inclusive cuidados de prata, são preservadas. Antigos tiveram saneamento objetivo; não houve reescrita cosmética de 499 fichas.

`Cód:`, `Código:` e `SKU:` saem da descrição somente quando coincidem exatamente com um SKU remoto. Outros códigos permanecem. Tags usam tipo/fatos e equivalências lexicais; a API ordena/remove acentos, por isso ordem e acento não provocam escrita repetida. Marca canônica comprovada em 595 anúncios antigos: Marquesa.

Novo cadastro elegível nasce hidden com conteúdo completo. Writer aceita somente marca, tags, descrição, título/meta e categorias, preservando campos traduzíveis completos, nome, URL, imagem, variante, preço, saldo e visibilidade. Duas leituras antes do PUT e hash detectam concorrência; journal durável precede a escrita; readback integral valida o resultado. A API não oferece CAS remoto: mudança posterior também interrompe e exige revisão.

Cron ocioso preserva o rodízio Cloud §64: :00 normalização/repartição, :10 criação, :20 variações, :30 fotos, :40 categorias; :50 enriquece até duas peças. Enriquecimento automático considera apenas origem criado, ativo e hidden. Cursor e hash dos fatos editoriais evitam reescrita validada. Alteração humana de SEO é preservada; texto automático só é substituído quando ainda coincide com a origem comprovada.

Homônimo não impede descrição factual no preview. Rascunho completo vence geração. SEO automático exige ocupação real; os dez rascunhos atuais foram comparados com os 937 anúncios e entre si, permanecendo em `em_preparacao`, sem aprovação, publicação ou ID remoto. O bloqueio de identidade permanece separado e integral. Só o clique humano e as validações de §62 autorizam hidden → visible.

## Google e categorias

Campo real: `categories[].google_shopping_category`. Dois grupos comerciais recorrentes receberam categorias ocultas, preservando a hierarquia existente:

| Categoria | Resultado |
|---|---|
| Brinco 35650540 | GPC vazio → 194 — Brincos |
| Infantil 28019915 | Acessórios para roupas de bebês/crianças → 188 — Joias |
| Bracelete 32545254 | Pulseiras para relógio → 191 — Pulseiras; pai Pulseira 28019937 preservado |
| Pingentes 41453694 | Nova, oculta; GPC192 — Amuletos e pingentes |
| Conjuntos 41453695 | Nova, oculta; GPC6463 — Conjuntos de joias |

Readback final compara descrição/SEO/traduções/handle/pai de todas as categorias: zero diferença nesses campos preservados. Nenhum campo Google fictício foi criado no produto; gênero e faixa etária sem regra oficial permanecem desconhecidos. Material, cor e acabamento comercial provêm exclusivamente de fatos cadastrados.

## Integridade, testes e QA

Migration aditiva `api/migracao-catalogo-enriquecimento.sql`: tabela `nuvemshop_enriquecimento` + dois índices, sem FK nova ou alteração de ledger. SHA256 `5d5ea985fe924a642d308792eb95a9b1fafda0547fc671597c4a8049caf79c27`.

914 journals validados no D1. Importações guardadas preservam metadados concorrentes e alteram apenas conteúdo editorial/4 flags de conferência. Os 10 rascunhos usam INSERT condicionado à ausência de linha e nome/categoria ainda iguais; não sobrescrevem trabalho humano. Backup fresco, simulação SQLite com FK, digests de tabelas/colunas/esquema/índices/triggers e revisão independente: integridade preservada, razão=0 divergências, FK=0. Replays e concorrência simulados com segurança.

Testes relevantes passaram: helper25, fluxo19, catálogo37, automações Cloud18, fila49, bloqueios de escrita29, writer SEO23, coerência schema/migrations. Compilação Worker final passou (1.203,68 KiB; gzip301,42 KiB). A expectativa antiga de HTTP404 foi alinhada ao comportamento já publicado que normaliza a página final da API; transporte comercial permaneceu intacto.

QA real após o deploy: catálogo HTTP200, ativo, zero pendência descrição/SEO; `/api/estoque/conferir` com divergentes=[]; sincronização Nuvemshop com divergentes=[]; anúncio 187604 lido hidden, uma foto e faltam=[]. O registro do 100633 foi relido com SKU/SEO/marca corretos e falta somente foto. Páginas publicadas 244521779 e 246074619: HTTP200, SEO preservado e cuidados presentes, sem código interno; URL do novo 373141783: HTTP404.

Snapshots/SQL/journals completos, recibos de escrita, hashes, backups e readbacks ficam privados em `.local/catalog-enrichment-2026-10-09/`. Somente este resumo e código são versionados; nenhum segredo, dump ou dado de cliente entra em Git ou vault.

## Concorrência e incidentes encerrados

Canários da API limparam campos traduzíveis omitidos e resetaram pai omitido de categoria. Escritas interrompidas; estado, SEO e hierarquia restaurados imediatamente. Comparação final prova zero regressão persistente. Guard permanente envia campos preservados e valida readback.

SKU570328 mudou comercialmente durante o lote: interrupção antes de PUT, 413 itens já validados preservados, replanejamento fresco de 501 restantes incluindo os11 novos Cloud. Onze produtos antigos tiveram alterações comerciais concorrentes, incluindo quatro opções adicionais e visibilidade do antigo417528. Comparações por operação provaram zero alteração comercial por este writer; estado antigo nunca foi restaurado por cima da outra frente.

O primeiro import registrou20 itens antes de um parser de recibo falhar. Revisão automática rejeitou repetir todo o lote sem prova de idempotência. Readback exato dos20, simulação independente e plano somente dos308 faltantes permitiram retomada segura. Fechamento posterior importou somente586 IDs ausentes, sem replay dos328 anteriores. Nenhum bloqueio de aprovação permanece.

## REALMENTE PRECISA DE DECISÃO HUMANA

- **Foto real:** 338 dos339 novos não têm fonte canônica de imagem ligada ao mesmo SKU. Somente187604 tinha foto comprovada, já reaproveitada. Fotos parecidas de outros SKUs não comprovam identidade.
- **Preço atual:** 170 novos +7 ainda sem anúncio =177 sem fonte atual confiável. Todas as fontes internas disponíveis foram cruzadas. Histórico187550 prova valores69/89, mas não um preço atual autorizado; não foi copiado.
- **Identidade:** 12 ainda sem anúncio:102311,196333,272073,334078,519177,132961,187550,387128,410321,450320,493074,561637. Mais três pares de novos sem fato diferenciador:481514/454953,484220/483454,120591/120592. Copy completa não decide duplicidade física.
- **Opção de cor:**318524 tem local Verde e remoto Verde Esmeralda; equivalência não foi comprovada por esta frente. Duas outras opções ainda faltantes pertencem aos334078/519177 já contados na dúvida de identidade. O comportamento operacional concorrente dessa correspondência pertence à Cloud; esta rodada não usa a suposição como evidência editorial.
- **Variante em maleta:**22 SKUs têm unidade sem identificação factual de cor/aro. São19 dos27 originais, mais162190,198242,408061. As8 divisões comprovadas não entram nessa lista humana:191620,334079,351489,393950,635650,647729,711591,717389; execução operacional pertence à outra frente.
- **Regra logística:**0,076kg e16×11×3cm aparecem frequentemente, mas nenhuma regra oficial confirma se são embalagem comum ou medida específica. Preenchimento por regra comprovada=0; nenhum valor foi inventado.

União de identidades/opções/variantes de maleta realmente ambíguas: **41 SKUs** (18 identidades +22 maletas +318524), sem dupla contagem. Foto/preço podem se sobrepor a esses grupos. Kit314161 tem composição/caminho próprios e não foi classificado como duplicidade humana.

## Rollback

Restaurar Worker Cloud anterior `afdc2eb6-a05b-4122-8a5c-c88f355ad49f` somente se necessário e confirmar tráfego. Não restaurar a referência histórica4d185 por cima da Cloud. Preservar a tabela/journals; não usar DROP ou restauração integral de D1. Desligar `nuvemshopCatalogoAtivo` se uma escrita não puder ser validada; estoque §61 permanece independente. Reversão de conteúdo remoto exige leitura atual sem concorrência, backup e readback; rollback de Worker não desfaz conteúdo remoto.
