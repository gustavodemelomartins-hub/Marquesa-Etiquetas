# RC — conteúdo e enriquecimento do catálogo Nuvemshop (09/10/2026)

**Estado: execução e apuração final em andamento.** Este documento registra
o comportamento implementado e a evidência disponível. Não confirma
encerramento da rodada, commit/push ou publicação do novo Worker. Versão
publicada, contagens finais e QA serão consolidados após validação.

Produção: Worker `marquesa-api`, D1 `marquesa-db-prod`, Nuvemshop da Marquesa.
Base inicial: catálogo oculto `c2011e7`, mantendo o SEO aprovado anterior.
Durante a execução, a produção Cloud avançou para `origin/develop` `07becfe`;
essa produção está sendo incorporada antes do deploy editorial. O commit
editorial anterior à integração é `99d8af8`. A base antiga não será publicada
por cima da produção operacional Cloud.

Worker Cloud atual: `afdc2eb6-a05b-4122-8a5c-c88f355ad49f`; deployment
`0b3379fa-b8df-420c-a859-d78e6f1869ab`, publicado em 09/10/2026 às
17:49:33 UTC. Essa é a referência atual antes da publicação integrada.
`4d185e84-db1c-42e2-8b89-cd35b2a73cc7` fica somente como histórico inicial.

## Escopo e situação inicial

Conteúdo factual, saneamento editorial e regra permanente de enriquecimento
do cadastro oculto de §62. Sem redesenho de telas, mudança visual de Loja
Online, regras de vendas, reconciliação histórica ou distribuição operacional
de estoque. Pages não precisa de alteração por esta frente.

| Medida | Estado comprovado / fase |
|---|---|
| Produtos / variantes remotos no início | 926 / 1.011 |
| Produtos novos criados pela integração no início | 328 |
| Produtos / variantes após a rodada Cloud incorporada | 937 / 1.028 |
| Novos após Cloud | 339: 328 iniciais + 11 novos ocultos |
| Categorias comerciais | 26 inicialmente; 28 com as duas categorias adicionais |
| SKU presente em mais de um produto remoto no início | 0 |
| SKU com múltiplas variantes legítimas do mesmo produto | 27 |
| Lote editorial planejado | 903: 328 novos e 575 antigos |
| Execução desse lote | 413 validados antes da pausa por concorrência; 490 remanescentes |
| Criações adicionais comprováveis | 11 efetivadas pela Cloud, todas ocultas; conteúdo ainda aguarda auditoria |
| Novo planejamento editorial | 501: 490 remanescentes + auditoria dos 11 novos da Cloud |
| Divisões de estoque recuperáveis | 8 dos 27 casos; encaminhadas à frente operacional, sem aplicação nesta frente |

SKU repetido entre variantes de um anúncio não é duplicação de produto.
O enriquecimento não junta códigos, nem transfere foto/preço por semelhança.

## Regra permanente

1. O cadastro ativo elegível nasce **oculto** pelo caminho de §62.
2. `catalogo/enriquecimento.js` cruza nome, categoria explícita, ficha
   específica e atributos reais fornecidos pelo cadastro.
3. O sistema preenche o que tem prova: descrição, título SEO, meta,
   marca, tags e categoria. Não produz preço, saldo, variante, idade,
   gênero, peso ou dimensão.
4. O writer lê, persiste o journal, relê antes do PUT e confere o resultado.
   Alteração concorrente interrompe a escrita.
5. Preparação recebe fatos editoriais confirmados. Foto inexistente, preço
   sem fonte confiável e identidade realmente ambígua continuam requisitos.
6. A peça permanece `hidden`; só o clique humano em **Publicar na Nuvemshop**,
   com as validações de §62, pode torná-la visível.

Com `NUVEMSHOP_WRITES_ENABLED` e `config.nuvemshopCatalogoAtivo` ligados, o
cron ocioso integra enriquecimento ao rodízio operacional de §64, até duas
peças por rodada editorial, com cursor por SKU e sem ler o catálogo remoto
inteiro. Preserva a Loja online de §63 e a automação Cloud de §64; o conteúdo
ocupa §65. O rodízio integrado final ainda será validado. Estoque §61 segue
independente. O automático considera somente
`origem='criado'`, cadastro ativo, estado/visibilidade ocultos. Saneamento de
antigos é lote controlado, não autorização para reescrevê-los continuamente.

## Conteúdo, marca e cuidados

- **SEO aprovado permanece.** Título/meta não vazios vencem a geração. Texto
  humano não é trocado. Descrição v1 só é melhorada quando ainda coincide
  exatamente com a descrição comprovadamente enviada por aquela regra.
- **Código no SKU.** Remove `Cód:`, `Código:` ou `SKU:` da descrição somente
  com coincidência exata no SKU remoto de produto/variante, incluindo zeros
  iniciais e entidades HTML. Outros códigos comerciais são preservados.
- **Marca Marquesa:** comprovada em 595 anúncios antigos; uma ocorrência
  incorreta `Mrquesa`. Corrige ausência/grafia comprovada, preservando marca
  semanticamente diferente.
- **Cuidados:** `CUIDADOS_HTML` reproduz integralmente o bloco dominante em
  472 anúncios, referência remota `238432990`. Mesmos três itens: evitar água;
  retirar para dormir, tratamentos e transpiração intensa; guardar
  individualmente para evitar danos. Nenhum quarto item inventado.
  Instruções específicas, embalagens e observações são preservadas. Troca de
  bloco existente exige trecho anterior integral conhecido e escopo restrito.
- **Tags:** taxonomia factual nos novos; equivalências lexicais comprovadas
  e deduplicação nos antigos. `Banho de Ouro 18k` exige evidência de banho.
  A API ordena tags/remove acentos: ordem, caixa ou acento não provocam PUT
  repetido. Multiset normalizado preserva contagens e detecta duplicata/perda.
- **Copy comercial:** tipo, desenho e detalhes reais, sem SKU, linguagem de
  implementação, promessas de durabilidade ou saúde. Material/cor vêm da
  peça. Cuidados genéricos não provam material; Ródio Branco é acabamento,
  não declara sozinho a cor da peça inteira.

SEO title respeita **70 bytes UTF-8**. Pode resumir nome extenso mantendo
os fatos completos no corpo. Nomes iguais admitem redação comercial distinta
sem inventar diferença física. Consulta de colisões inconclusiva falha fechada.

## Categorias e Google Shopping

Argola corresponde a Brincos. Colar com Pingente continua Colar; Pulseira com
Berloque continua Pulseira. Categoria explícita pode esclarecer nome sem tipo.
Prata 925 exige prova: não transforma Prata 926/927 em Prata 925.

| Categoria | Google Product Category / alteração |
|---|---|
| Pingentes — nova, oculta | 192 — Vestuário e acessórios > Joias > Amuletos e pingentes |
| Conjuntos — nova, oculta | 6463 — Vestuário e acessórios > Joias > Conjuntos de joias |
| Brinco — 35650540 | Vazio → 194 — Brincos |
| Infantil — 28019915 | Acessórios de roupas para bebês e crianças → 188 — Joias |
| Bracelete — 32545254 | Pulseiras para relógio → 191 — Pulseiras |

O campo real é `categories[].google_shopping_category`; não se inventou um
campo Google no produto nem gênero/faixa etária para eliminar aviso Merchant.
Bracelete mantém o pai Pulseira `28019937`. IDs das duas categorias novas e
readbacks integrais ficam no journal privado, com consolidação final pendente.

A API acrescenta ancestrais à categoria escolhida. Readback aceita somente
extras demonstrados pela cadeia `parent`, rejeitando categoria sem essa prova.

## Writer, journal e reavaliação

`catalogo/enriquecimento-fluxo.js` limita patches a `brand`, `tags`,
`description`, `seo_title`, `seo_description`, `categories`. Nome, URL,
visibilidade, preço, estoque, variantes e imagens ficam preservados.
Campos traduzíveis completos passam pelo PUT para impedir limpeza de idiomas
omitidos pela API. A comparação posterior também verifica conteúdo preservado.

Migration `api/migracao-catalogo-enriquecimento.sql`: tabela aditiva
`nuvemshop_enriquecimento`, dois índices, sem alteração de ledger. Journal:

- `id`, `sku`, `product_id`, `regra`, `estado` (`preparado/validado/erro`);
- `before_json`, `patch_json`, `after_json`;
- `before_hash`, `after_hash`, `fonte_hash`, `erro`, `em`.

`preparado` persiste antes do PUT. Falha de journal impede escrita. Resultado
não validado grava erro/desliga cadastro automático e nunca declara sucesso;
estoque §61 permanece independente. Sem tokens/dados de clientes no journal.

`fonte_hash` considera `produtos.desc`, categoria local, nomes/atributos/opções
reais das variantes locais e versão da regra. Ignora IDs operacionais, ordem
das linhas, preço e saldo. Fonte igual já validada evita reescrita; mudança
nesses fatos locais permite reavaliar sem apagar SEO aprovado. Alteração
exclusivamente remota não invalida esse marcador e requer reavaliação
explícita/gatilho comprovado.

Snapshots, patches, hashes e readbacks do saneamento ficam privados em
`.local/catalog-enrichment-2026-10-09/`; dump de produção não é versionado.

## Incidentes de canário e correção

A API limpou campos traduzíveis omitidos num PUT parcial de categoria e
resetou `parent` omitido em outro canário. Estado de referência, SEO,
descrição e hierarquia foram **restaurados imediatamente**; não ficou impacto
persistente desses canários. Bracelete voltou ao pai `28019937` antes da
continuação. A comparação integral final da rodada ainda será registrada.

Guard permanente: enviar os campos preservados necessários, backup antes da
escrita e readback. Testes detectam SEO apagado pela API, mudança comercial,
idioma perdido, tag perdida e ancestral sem prova. Nenhuma tolerância para
divergência posterior foi introduzida.

Na escrita em lote, o SKU `570328` apresentou estoque diferente do snapshot
de planejamento. O guard interrompeu antes de qualquer PUT desse item. Os
413 readbacks anteriores estavam validados; os 490 remanescentes serão
replanejados sobre estado fresco, junto da auditoria dos 11 novos ocultos
criados pela Cloud. As alterações concorrentes em variantes/saldos de oito
SKUs pertencem à frente operacional: esta missão não restaura saldos antigos.

A resolução documental preserva integralmente as seções Cloud §63 e §64,
renumerando o apêndice editorial para §65. Incorporação não confirma deploy
editorial, e as contagens operacionais frescas ainda aguardam auditoria final.

## Verificação e entrega pendentes

Primeira rodada local: Node 24.19.0/SQLite disponível. Passaram helper 20,
fluxo 17, catálogo 30, fila 49 e writer SEO anterior 23. Bloqueios de escrita:
27 aprovações/uma expectativa antiga de 404 onde o transporte já publicado
normaliza `Last page is N` para `[]`; ajuste/reexecução final devem constar da
apuração, sem alterar transporte para satisfazer expectativa desatualizada.

**Apuração final pendente:** produtos novos reais; totalmente preparados;
somente foto; preço sem fonte confiável; categorias/variações resolvidas;
textos sanados; códigos retirados/confirmados; tags; logística comprovada;
ambiguidades; unicidade de SKU entre produtos; visibilidade; preços/estoques
não inventados; SEO aprovado preservado; sincronização sem divergência causada.

**Entrega pendente:** commit/push, migration/deploy necessários, versão
efetivamente publicada e QA real. Não aplicar 0,076 kg / 16 × 11 × 3 cm
somente pela frequência: regra empresarial ainda não comprovada neste registro.

## Rollback

1. Desligar `config.nuvemshopCatalogoAtivo` pelo caminho de §62 se uma escrita
   não puder ser validada; estoque §61 segue independente.
2. Restaurar a referência Cloud atual
   `afdc2eb6-a05b-4122-8a5c-c88f355ad49f`, deployment
   `0b3379fa-b8df-420c-a859-d78e6f1869ab`, confirmando a versão que recebeu
   o tráfego. `4d185e84` é anterior às automações Cloud e não deve
   sobrescrevê-las nesta integração.
3. **Manter a tabela aditiva e journals.** Não apagar auditoria nem reverter
   banco inteiro. Pages não requer rollback por esta frente.
4. Conteúdo remoto só pode ser revertido a partir do backup e após releitura
   sem alteração concorrente. Não apagar anúncios/categorias, publicar ocultos
   ou modificar movimentos históricos.

Rollback de código não desfaz conteúdo remoto validado: reversão editorial é
operação separada, com journal e readback.
