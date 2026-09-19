# UI DATA CONTRACT — protótipo V2 DEV

**19/09/2026 · READY FOR GUSTAVO REVIEW · handoff para Claude/Refactor**

Este documento descreve dados demonstrativos e pontos de integração, não uma
API implantada. O protótipo é estático: nenhum comando abaixo deve ser chamado
pelo HTML. Nenhuma aprovação visual é inferida desta documentação.

## Proveniência e cobertura

- Base inspecionada: `codex/prototype-v2-dev`, commit
  `750bc5a7a5dd4dc11ea462a02683cf35e389c646` (código API lido, não alterado).
- Comparação somente leitura: `claude/refactor-sistema-marquesa`, commit
  `b109739061cc171f156fc4223aa0f598d2c9611c`.
- Checkpoint visual de origem: `64ca6ca58dce28eb83c6031f14477ad30150a874`.
- **B** significa rota encontrada no código da base. **R** significa capacidade
  adicional encontrada no Refactor. Nenhuma dessas marcas confirma deploy,
  bindings, migrations ou disponibilidade em staging/PROD.
- O baseline HTTP de 09/09 é histórico. A tabela de rotas e os handlers dos
  SHAs acima prevalecem para esta comparação.
- Cobertura: as 12 famílias do [inventário](product-screen-inventory-v2.md),
  suas abas/formulários e as superfícies transversais Hub/Design system.
  O inventário anterior mistura páginas, aliases, diálogos e FUTURE; suas
  linhas não são uma contagem de páginas. As rotas públicas e a contagem
  publicada devem vir do manifesto de navegação da entrega.

Os exemplos abaixo são dados de demonstração, não um snapshot operacional.
Identidades, vendas, itens, recebimentos e produtos precisam compartilhar IDs
entre módulos; nomes e telefones não são chaves. O adaptador futuro deve mapear
IDs de demonstração para a identidade da fonte, sem deduzir vínculos por nome.

## Convenções do provedor da UI

Separar o provedor demonstrativo da renderização. A entrega DEV persiste dados
locais no navegador; não sincroniza dispositivos. **Restaurar demonstração**
recria o conjunto de exemplos versionado. Falha de armazenamento mantém a
sessão utilizável e informa que as alterações não sobreviverão à recarga.

Interface local inspecionada: `window.MarquesaDemo` em
`docs/ux/prototype/demo-store.js`, com `ready`, `status.persistent`, `version`,
`get(key, fallback)`, `set(key, value)` e `reset()`. Usa IndexedDB
`marquesa-v2-demonstration`, store `data`, chave `snapshot-v1`; comunica mudanças
por `marquesa:demo-change`. Não possui transporte HTTP.

O seed contém `clients`, `sales` e `accounts`; módulos acrescentam namespaces
como `agenda.events`, `settings.profile`, `settings.preferences`,
`notifications.read`, `catalog.productForm`, `resellers.operations`,
`warranty.cases`, `inventory.session` e `labels.queue`. Essas estruturas são
fixtures/estado de interface, não schema de backend. Alguns módulos mantêm
rascunhos ou registros de ações demonstrativas, e isso não prova uma razão
contábil compartilhada. O futuro adaptador deve usar entidades tipadas e
comandos de domínio, não enviar esses snapshots ou arrays de formulário à API.

Os nomes de campos da coluna “UI precisa” são o modelo de leitura da UI, não
uma renomeação automática do JSON legado. O adaptador fará a conversão explícita:

| Tipo da UI | Semântica e conversão |
|---|---|
| `Id` | string opaca, incluindo origem quando duas populações podem repetir o mesmo número; API pode usar número |
| `Dinheiro` | número decimal em BRL, duas casas na apresentação; nunca texto `R$` no cálculo; documentar arredondamento no adaptador |
| `Quantidade` | inteiro em peças; zero contado é diferente de não contado (`null`) |
| `Data` | `YYYY-MM-DD`, data civil; venda, pagamento e vencimento são campos separados |
| `Instante` | ISO 8601 com timezone; usado para observação, autoria e auditoria |
| `Percentual` | número com unidade declarada (`0–100` na UI); não confundir fração com porcentagem |
| `Ausente` | `null`/indisponível; não converter custo, crédito, saldo desconhecido ou média sem base em zero |
| `Foto` | ID, SKU, nome, MIME, ordem, principal e bytes/Blob local; URL de objeto não é referência persistente |

Estados comuns de **todas** as linhas da matriz: `loading` preserva contexto e
desabilita comandos duplicados; `empty` diferencia base vazia de filtro sem
resultado; `error` preserva rascunho/filtro e oferece repetição; `partial`
identifica a fonte faltante e não zera agregados; `unavailable` explica a
capacidade indisponível. Não mostrar sucesso antes da resposta autoritativa.
Estados específicos e gaps aparecem por superfície abaixo.

## Matriz por família e superfície

Na coluna staging: **L** = leitura futura possível após snapshot controlado e
contrato verificado; **C** = comandos futuros apenas contra dados DEV, após
revisão dos efeitos; **E** = infraestrutura/integração adicional; **N** = não há
endpoint suficiente. Todas são possibilidades, **não integrações desta rodada**.

### 1. Home e Agenda

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
|---|---|---|---|---|
| Hoje: métricas, prioridades e atalhos demonstrativos | B `GET /api/state` em `api/src/http/routes/plataforma.js`; `GET /api/analytics/painel` em `analytics.js`; `GET /api/pendencias` em `operacao.js` (todos dentro de `api/src/http/routes/`) | período, vendido/recebido/aReceber em BRL, calculadoEm, prioridade, prazo, entidadeId, destino e fonte | V2-API-002: ordenar prioridades com fonte/data/destino; confirmar fórmulas antes de usar métrica real. Parcial por bloco, sem substituir falha por zero | L |
| Agenda semanal, detalhe e criar/editar recorrência: eventos locais | Não localizada rota de Agenda nas tabelas de rotas B/R | id, título, início/fim, timezone, recorrência, origem, destinoId, estado, versão | V2-API-001: coleção e comandos de agenda ainda necessários; sem nome de endpoint inventado. Semana vazia, evento removido, conflito de edição | N |

### 2. Vendas

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
|---|---|---|---|---|
| Painel, histórico, filtros e detalhe: vendas/indicadores locais | B `GET /api/analytics/painel`, `/api/analytics/vendas`, `/api/analytics/mes`, `/api/vendas/lista`, em `api/src/http/routes/analytics.js`; R amplia intervalos e filtros nessa mesma fonte | período de/até, origem/canal, cancelada, vendaId, clienteId, itens, total, recebido, saldo, dataVenda, dataPagamento, totalFiltrado, paginação | V2-API-004: R já recebe `origem`, `canceladas`, `de/ate`, limite/offset; falta validar totais do recorte e exportação auditável. Período inválido, sem vendas, página além do fim | L |
| Tipos de lançamento, venda normal, revisão e conclusão: carrinho/pagamentos simulados | B `POST /api/vendas`, `GET /api/vendas`, `POST /api/vendas/:id/pagamento` em `api/src/http/routes/vendas.js`; `GET /api/vendas/lancamentos` em `comercial.js` | vendaId, itemId, clienteId, SKU/varianteId, quantidade, preço/desconto/total, dataVenda, recebimentos com valor/forma/dataEfetiva, versão | CC-001, V2-API-003: coleção de eventos não equivale à quitação atual. R `api/src/pagamento-venda.js` explicita ausência dessa coleção até fase 5.8. Estoque insuficiente, variante ambígua, pagamento inválido, repetição idempotente | C; revisar efeitos externos da venda antes de integrar |
| Monte seu Colar: composição local | B `GET/POST /api/personalizacao/modelos`, `POST /api/vendas` em `api/src/http/routes/vendas.js` | modeloId, componentes com SKU/variante/quantidade, preço da composição, restrições, capacidade | Flag `PERSONALIZACAO_ATIVA` e regra da composição precisam confirmação. Estado 503/capacidade desligada não é lista vazia. Não inventar nova regra | C/E |
| Saída sem faturamento e histórico: motivos/itens locais | B `GET/POST /api/saidas`, `POST /api/saidas/:id/estornar` em `api/src/http/routes/comercial.js`; handler `api/src/saidas.js` | saídaId, tipo, data, SKU/variante, quantidade, motivo, custoUnitário/custoTotal nullable, origemCusto, informadoEm/Por | V2-API-005: custo histórico congelado não comprovado; não usar preço como custo. Custo indisponível e saída estornada explícitos | C |

### 3. Clientes

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
|---|---|---|---|---|
| Lista, busca, cadastro rápido e editar cadastro: fichas demonstrativas | B `GET/POST /api/clientes`, `PATCH /api/clientes/:id` em `api/src/http/routes/comercial.js`; `api/src/clientes.js` aceita `nome,tel,email,instagram,cidade,cpf,nascimento,obs` | id, campos cadastrais acima, validações por campo; nascimento Data, demais strings/null | Cadastro/edição existentes; confirmar limites e paginação, sem criar rota duplicada. Homônimas continuam separadas; erro mantém formulário | L/C |
| Perfil, compras, financeiro, garantias e feed: entidades locais relacionadas | B `GET /api/clientes/perfil?id=...`; R mesma rota/`api/src/analytics.js` fornece histórico, itens estáveis e indicadores; R `GET /api/clientes/:id/credito` em `api/src/http/routes/comercial.js` | clienteId, vendaId, itemId+origem, garantiaId, ticket comercial/recebido separados, frequênciaDias, últimaCompra, saldo, crédito+extrato, eventos tipados/dataEfetiva/destino | V2-API-006: feed único de todos os eventos ainda não comprovado. V2-API-007/008 parcialmente atendidos em R; validar payload/identidades. Crédito existe em R: não classificar como inexistente nem inferir deploy. Sem histórico → médias null; vínculo ambíguo → pedir revisão | L/E |

### 4. Financeiro

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
|---|---|---|---|---|
| A receber e detalhe por cliente/venda: saldos locais | B `GET /api/contas-receber`, `PATCH /api/contas-receber/prazo`, `POST /api/contas-receber/receber` em `api/src/http/routes/comercial.js` | chave com origem, vendaId, clienteId, total/recebido/saldo BRL, vencimento, versão, estado cobravel | R mantém portas por `chave`; remove HTTP `/api/contas-receber/:id/marcar-paga` e `/:id/vencimento`. Não integrar rotas aposentadas. Sem saldo, parcial conhecido, conflito de versão | L/C |
| Registrar/corrigir recebimento e histórico: eventos locais por venda | B pagamento/quitação acima e `GET /api/vendas/pagamento/auditoria`; R núcleo `api/src/pagamento-venda.js` e `GET /api/financeiro/conferir` em `comercial.js` | eventoId, vendaId, valor, forma, dataEfetiva, registradoEm/Por, motivo, substituiEventoId, versãoEsperada, chave idempotente | V2-API-003/009 permanecem: comandos/read model por recebimento, correção/estorno auditável e autoria. R melhora quitação e conferência, não fornece coleção de pagamentos. Excesso não vira crédito automaticamente; erro conserva evento original | N para coleção; C para quitação existente |

### 5. Garantias/Reparos

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
|---|---|---|---|---|
| Lista, caso, linha do tempo e prazos: casos/eventos locais | B `GET/POST /api/garantias`, `GET /api/garantias/pendentes`, `GET /api/garantias/:id`, `POST /api/garantias/:id/status` em `api/src/http/routes/comercial.js`; R adiciona `/vinculos`, `/:id/reabrir`, `/:id/corrigir-status` | casoId, clienteId, fonteVenda, vendaId/itemId imutável, SKU/variante, status, prazo, eventos com ator/data/motivo, casoAnteriorId | V2-API-008: R resolve identidade do item e relatório de vínculos; verificar payload. Reabrir é novo atendimento; corrigir encerramento não é reabrir. Prazos/feriados e capacidade por ação devem vir da fonte; não reimplementar regra no HTML | L/C |
| Troca e diferença: comparação/saldo demonstrativos | B `POST /api/garantias/:id/troca`, `/troca/pagar`, `/troca/estornar` em `api/src/http/routes/comercial.js` | trocaId, itemOriginalId, novo SKU/variante, valores, diferença, estado financeiro, pagamentoId | V2-DEC-001/002 históricos precisam reconciliação com crédito existente em R. Não inferir que toda diferença negativa vira crédito/reembolso. Manter regra pendente até contrato/decisão aplicável. Conflito, peça indisponível e reversão com efeitos posteriores explícitos | C/E |

### 6. Estoque

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
|---|---|---|---|---|
| Geral, produtos, saldo e razão: quantidades/indicadores locais | B `GET /api/state`; `GET /api/estoque/conferir`, `GET /api/estoque/:sku/movimentos` em `api/src/http/routes/estoque.js`; dados de produto em catálogo | SKU, nome, categoria, varianteId, total/casa/maletas, movimentos com origem/data/quantidade, custo nullable, valor/fórmula/calculadoEm | V2-API-010: read model de saúde/valor precisa fórmula, fonte e cobertura. Total não prova distribuição de variante; divergência mostra ambos números. Não gravar saldo direto | L |
| Inventário iniciar/retomar, contar/zero/variante/pausar, revisar/aplicar, histórico/detalhe | B `GET/POST /api/inventarios`, `GET /api/inventarios/:id`, `PUT /:id/contagem`, `POST /:id/pausar`, `/retomar`, `/concluir`, `/aplicar`, `GET /:id/resultado`, em `api/src/http/routes/operacao.js` (prefixo `/api/inventarios`) | inventarioId, estado, SKU/variante, esperado, contado nullable, delta, seleção de aplicação, versão/hash do resultado, ator/instantes | Rotas existentes; confirmar payload e autorização de aplicar. Zero contado ≠ não contado; resultado obsoleto exige revisão, erro mantém contagem. Aplicação via razão, nunca saldo direto | C |

### 7. Catálogo

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
|---|---|---|---|---|
| Central, cadastro/edição, categorias e variações: produtos locais | B `GET /api/categorias`, `/api/produtos/pendentes`, `/api/produtos/:sku/variacoes`, `/dependencias` em `api/src/http/routes/catalogo.js`; `PATCH /api/produtos/:sku`, `PUT /:sku/variacoes`, `POST /api/produtos/novos/cadastrar` em `catalogo-importacao.js` | SKU, nome, categoriaId, status, preço, quantidade somente leitura, dependências, variantes e presença na loja | Não inventar `POST /api/produtos`: verificar se cadastro individual será fachada de cadastro existente. Categoria sentinela não é editável; arquivamento não despublica. Rota de merge de categoria não existe | L/C |
| Galeria por SKU, foto principal/ordem e lote: fotos locais | B `GET/POST /api/produtos/:sku/galeria`, `POST /:sku/galeria/principal`, `/ordem`, `POST /api/fotos/lotes`, `PUT /api/fotos/lotes/:id/arquivo/:arquivo`, `POST /:id/confirmar` em `api/src/http/routes/galeria.js` | fotoId, SKU, MIME, bytes, original/preparada, principal, ordem; loteId, arquivo, candidato, resultado por arquivo, ignorados | CC-004: upload real é binário; R2/bindings/limites não verificados. Lote distingue ambíguo, desconhecido, duplicado e falha; uma falha não invalida arquivos bons. Tratamento automático de imagem FUTURE | E |

### 8. Revendedoras

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
|---|---|---|---|---|
| Geral, perfil, agenda operacional e histórico: revendedoras/maletas locais | B `GET /api/state`, `GET /api/analytics/revendedoras`; `POST /api/revendedoras`, `PATCH /api/revendedoras/:id` em `api/src/http/routes/maletas.js` | revendedoraId, nome/contato, situação, maletaId, prazo, capacidade, totais e datas de acerto | Confirmar fórmula das métricas; agenda manual depende V2-API-001. Sem maleta é vazio válido, histórico parcial identificado | L/C |
| Criar maleta e acerto: seleção e resultado demonstrativos | B `POST /api/maletas`, `/api/maletas/:id/itens`, `/:id/acerto`, `/:id/cancelar` em `api/src/http/routes/maletas.js` | maletaId, revendedoraId, SKU/variante, enviadas/vendidas/devolvidas, preço congelado, comissão percentual/valor, bruto/líquido, snapshot/versão | V2-API-011: criação continua em portas separadas; atomicidade cabeçalho+itens não provada por existir comando. R altera handler, sem nova rota atômica comprovada. Estoque insuficiente, acerto repetido e versão obsoleta | C |

### 9. Etiquetas

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
| Preparar, selecionar quantidade/texto, revisar folha e calibrar: composição local | B produtos de `GET /api/state`; impressão do legado `index.html` é local, não API de impressão | loteId, SKU, nome, preço BRL, quantidade, texto, foto, papel, linhas/colunas, margens/medidas em mm | Não enviar impressão a backend. Sem seleção, texto excedente, falta de foto e impressora cancelada explícitos | L |
| Histórico/reimpressão/PDF: lotes locais | Nenhuma coleção HTTP de lotes de etiquetas localizada em B/R | versãoLayout, itens congelados, configuraçãoPapel, criadoEm/Por, estado de geração, origemLoteId | V2-API-012: criar/listar/reimprimir lote auditável; “arquivo gerado” não comprova impressão física. Estado impresso permanece desconhecido | N |

### 10. Nuvemshop

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
| Fila, preparação e pendências humanas/técnicas: lista simulada | B `GET /api/catalogo/publicacao`, `GET /api/produtos/pendentes`; `GET/POST /api/catalogo/preparacao/tarefas` em `api/src/http/routes/preparacao.js` | SKU, foto, nome, categoria/preço/quantidade, estado, falta[], bloqueios[], presencaNaLoja, estadoObservado, próximaAção | CC-003/005: executor e capacidade não confirmados. Separar `sem_r2` de falta de foto; sem preço bloqueia. Contagens derivadas da mesma lista/filtro | L/E |
| Revisão, conteúdo, SEO, fotos e prévia; aprovar/publicando/publicado/falha/repetir | B `POST /api/catalogo/publicacao/:sku/preparar`, `/previa`, `/aprovar`, `/reabrir`, `/repetir` em `api/src/http/routes/catalogo-comandos.js`; `/publicar` em `publicador.js`; galeria na família 7 | conteúdo/título/descrição/SEO, categorias, preço, fotos, assinaturaVersão, aprovação, aprovaçãoInvalidada, publicacaoErro, tentativas e observadoEm | CC-002/004/005: separar aprovação, envio e conclusão. Encadeamento automático aprovado pela UX precisa contrato idempotente; edição invalida aprovação; repetir preserva aprovação válida. Publicador seco por padrão, flags/R2 não verificados; nenhuma escrita externa autorizada nesta rodada | E; somente simulação nesta entrega |
| Produtos publicados, pendências, divergências e sincronização/análise segura: comparações locais | B `GET /api/state`, `GET /api/sync`, `GET /api/pendencias`; `GET /api/catalogo/precos/divergentes` em `publicador.js`; `POST /api/sync/analisar` em `sincronizacao.js` | SKU/varianteId, quantidade local/loja, preço local/observado, observadoEm, diagnóstico, semEmpurrar[], proposta e motivo | Não chamar análise real do protótipo: pode ler rede operacional e depende da configuração. Snapshot futuro deve trazer comparação datada; diferença não autoriza correção. Apply e correção automática de preço fora desta entrega | L/E |

### 11. Notificações

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
| Lista, filtros, ler/adiar e abrir destino: notificações locais | B `GET /api/pendencias` em `api/src/http/routes/operacao.js`; `POST /api/pendencias/adiar`, `/retomar` em `catalogo-comandos.js` são comandos de pendência, não inbox individual | id, tipo, entidadeId, título, criadoEm, lidaEm, adiadaAté, rotaDestino, usuarioId | V2-API-013: lida/preferências/entrega por usuário ainda necessários; não reutilizar adiar pendência como leitura de notificação. Destino removido informa contexto; sem novas não é erro | N/L parcial |

### 12. Conta/Configurações

| Superfície / mock atual | Endpoint e evidência | UI precisa | Gap e estados específicos | Staging |
| Meu perfil e preferências: identidade/configuração demonstrativas locais | B `PUT /api/config` em `api/src/http/routes/plataforma.js` é configuração operacional, não perfil. Auth em `api/src/auth.js` é Bearer técnico | usuárioId, nome, papel/capacidades; início, densidade, acessibilidade, tiposAlertas, escopo/versão | V2-API-014/015: sessão/capacidades e preferência por conta não comprovadas. Não colocar chave técnica no protótipo público. “Sem capacidade” diferente de sessão expirada | N |
| Conexão e restaurar demonstração: estado local, sem testar serviço operacional | B `ANY /api/health` existe em `api/src/http/routes/publicas.js`, mas não demonstra auth, D1, R2 nem contrato completo | modo `demo`, versãoFixture, armazenamento persistente/sessão, capacidade futura indisponível | Nesta entrega não permitir inserir URL PROD/token nem conectar. Futuro adapter staging precisa identificação verificável do ambiente e contrato; health 200 sozinho é insuficiente | E |

### Transversal

Hub e Design system consomem manifesto/estados de aprovação/tokens locais e não
necessitam endpoint. Rotas Clientes e Agenda podem ser aliases de views sem
duplicar entidades; abrir alias e abrir aba precisam preservar seleção e
histórico. Loading/vazio/erro demonstráveis são estados do provedor local, não
falhas artificiais da API operacional. Tratamento automático de imagens é uma
capacidade FUTURE, não página operacional concluída.

## Reconciliação dos IDs de gaps existentes

| ID preservado | Situação após inspeção B/R | Próximo trabalho de integração |
|---|---|---|
| V2-API-001 | Não localizada Agenda | Contrato persistente de eventos/recorrência |
| V2-API-002 | Pendências e agregados existem; prioridades parciais | Confirmar ordenação/prazo/destino e agregação |
| V2-API-003 | **Não atendido** pela quitação; R declara coleção futura | Eventos múltiplos com data efetiva e idempotência |
| V2-API-004 | R amplia filtros e intervalos | Validar total filtrado/exportação e paginação |
| V2-API-005 | Custo histórico da saída não comprovado | Fonte/snapshot por item; manter null até existir |
| V2-API-006 | Perfil existe; feed único não comprovado | Normalizar eventos sem inventar pagamentos históricos |
| V2-API-007 | Indicadores explícitos em R | Mapear ticket comercial vs recebido/frequência/última compra |
| V2-API-008 | Identidade estável e vínculos em R | Validar origem+itemId no perfil e caso; schema staging |
| V2-API-009 | R unifica quitação/conferência, não eventos | Correção/estorno auditável por recebimento |
| V2-API-010 | Leituras existem, saúde/valor parciais | Definir fórmula/fonte/cobertura/calculadoEm |
| V2-API-011 | Portas de maleta/itens separadas | Provar atomicidade ou contrato de rascunho seguro |
| V2-API-012 | Histórico de etiquetas local | Lote auditável e reimpressão; sem garantir impressão física |
| V2-API-013 | Pendência não equivale a inbox | Estado por usuário e preferências/entrega |
| V2-API-014 | Bearer técnico não equivale a sessão de usuário | Identidade/capacidades seguras para implementação futura |
| V2-API-015 | Preferências locais | Persistência por conta opcional, escopo/versionamento |
| CC-001 | Datas distintas existem; coleção futura | Testar venda em um dia/pagamento em outro e múltiplos eventos |
| CC-002 | Aprovar/publicar/repetir existem como comandos separados | Provar encadeamento, assinatura, repetição e autorização |
| CC-003 | Fila e tarefas existem em B/R | Validar transições e executor disponível |
| CC-004 | Galeria/principal/ordem/lote existem em B/R | Validar conteúdo/SEO e invalidação, R2 e limites |
| CC-005 | Capacidade de publicação não confirmada | Verificar staging na integração futura, sem habilitar writes |

Crédito tem rotas em R (`GET /api/clientes/:id/credito`,
`GET /api/credito/conferir`, `POST /api/credito/ajuste`) e não deve gerar API
duplicada por causa do handoff antigo. Isso não prova política de consumo,
reembolso ou relação automática com troca negativa. V2-DEC-001/002 devem ser
reconciliados com a decisão e o contrato vigentes pela frente Refactor.

V2-DEC-004/005 de navegação foram superados pelo pedido humano atual:
**Catálogo e Financeiro têm acessos globais explícitos, sem “Mais”**.

## Preparação para snapshot controlado em staging

O futuro adaptador terá a mesma interface de leitura/comandos do provedor
demonstrativo, com capacidades explícitas. Não aceitar conexão configurável a
qualquer URL no HTML público. Seleção do ambiente deve ocorrer na implementação
autorizada, com origem staging fixa e credencial fora do pacote público.

Uma cópia futura exige processo próprio: snapshot identificado por data/versão,
dados pessoais minimizados, bindings exclusivos DEV, schema compatível e
integrações externas desabilitadas. Não existe autorização nesta entrega para
exportar PROD, importar dados, executar migrations ou alterar flags.

Mesmo `GET` não deve ser presumido isento de efeitos: R
`api/src/analytics.js::perfilCliente` possui normalização legada que pode escrever
em leitura por nome. A avaliação dos handlers e do ambiente deve preceder a
integração. Nenhuma chamada operacional foi necessária para este contrato.

## Aceite do handoff

1. Cada família e alias aparece na matriz; cada necessidade distingue rota
   encontrada, capacidade adicional em R e proposta ainda ausente.
2. Manter IDs API/CC nas issues futuras; não fechar gap com sucesso de mock.
3. Validar fixtures relacionadas, persistência/recarga/reset e estados por
   provedor. Contratos HTTP terão testes próprios somente na integração.
4. Conferir explicitamente datas civil/efetiva, identidade de item/variante,
   totais filtrados, null vs zero, aprovação invalidada e erro parcial.
5. Confirmar disponibilidade de staging antes de ligar qualquer adaptador.
   Nunca DEV→D1 PROD e nunca escrita na Nuvemshop por este protótipo.
