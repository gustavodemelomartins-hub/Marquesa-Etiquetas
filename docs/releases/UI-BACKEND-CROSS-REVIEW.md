# Cross-review técnica — UI (protótipo V2 do Codex) ↔ domínio ↔ backend

**Aberta:** 16/09/2026 · **Consolidada:** 18/09/2026 · **Autor:** Claude (trilha
de review) · **Escopo:** auditoria somente leitura do protótipo, comparada ao
backend real da trilha Refactor.

> **Estado: checkpoint fechado, aguardando o SHA publicado do Codex.**
> As correções de backend desta revisão estão commitadas e no remoto
> (`aac0c7f`, §6). O que falta é a passada final contra a UI publicada em
> `https://marquesa-dev.pages.dev/prototype/` — plano em §8.

**Não edita UI.** Nenhum HTML, CSS ou JS de protótipo foi tocado, e o worktree
do Codex (`../Marquesa-Etiquetas`, branch `codex/ui-system-marquesa`) foi aberto
apenas para leitura. Codex continua sendo owner exclusivo da UX/UI.

## O fato que muda a leitura de tudo abaixo

`codex/ui-system-marquesa` derivou de **`52f5f5f`** e nunca viu o backend das
fases 5.3 a 5.6. No worktree do Codex não existem `api/src/credito.js` nem
`api/src/pagamento-venda.js`; em `api/src/http/routes/analytics.js` não existe
`validarIntervalo`.

Consequência direta: **quase todo "não confirmado" do handoff do Codex está
correto para o que ele consegue ver, e desatualizado em relação ao que já
existe.** Isso não é erro dele — é distância entre branches. A ação principal
desta revisão não é corrigir o Codex; é entregar a ele o delta.

| Estado no protótipo | Quantos itens | Tratamento |
|---|---|---|
| já existe no Refactor, Codex não vê | 7 necessidades | entregar o contrato |
| gap backend real | 8 necessidades | 2 implementados aqui, 6 registrados |
| depende de decisão humana | 6 decisões | listadas no fim |
| só design / sem impacto backend | o restante | nada a fazer |

## O que foi lido

Protótipo: `docs/ux/00-index.md`, hub `docs/ux/prototype/index.html`, as 12
famílias em `docs/ux/03-screens/`, `04-components/`, `05-flows/`, `06-backlog/`,
`07-mapping/` (inventário V2, navegação V2, mapa de fluxos V2, handoff
`ui-api-handoff-v2.md`, `prototype-coverage.md`) e `docs/project/WORKLOG-CODEX.md`.
Trabalho não commitado: o worktree do Codex estava limpo em 16/09; o checkpoint
lido é `ab8951b`. **Em 18/09 o Codex já avançou para `a6d7c6b`** ("checkpoint
vendas v2 refinement"), ainda não publicado — e o deploy em curso será mais novo
que os dois. Toda linha desta matriz é verdade sobre `ab8951b`; §9 repassa a
matriz contra o SHA que for publicado.

Backend: worktree `../Marquesa-Claude-Refactor` (`claude/refactor-sistema-marquesa`,
`b109739`) — 186 rotas registradas em `api/src/http/routes/`, `api/schema.sql`,
as seis migrations da fase 5, `api/REGRAS.md` (45 seções) e as auditorias de
domínio em `docs/domains/`.

---

## 1. Data de pagamento — resposta factual

**A pergunta:** o backend aceita data real/retroativa do pagamento, ou tem gap
também?

**Resposta: A, com uma exceção — que foi corrigida aqui.**

A regra pedida já é `api/REGRAS.md §30` ("A data da venda e a data do pagamento
são duas datas diferentes") e `§36.1` (procedência do pagamento). O cenário
`venda 10/09 · pagamento 12/09 · cadastro 16/09` preserva 10/09 e 12/09.

### As quatro portas financeiras

| Porta | Campo | Aceita retroativo | Onde |
|---|---|---|---|
| `POST /api/vendas` | `data` + `dataPagamento` | **sim** | `api/src/vendas-comandos.js:109-146` |
| `POST /api/vendas/:id/pagamento` | `dataPagamento` | **sim** | `api/src/vendas-comandos.js:492` |
| `POST /api/garantias/:id/troca/pagar` | `pagaEm` | **sim** | `api/src/garantias.js:1090` |
| `POST /api/contas-receber/receber` | `pagaEm` | **sim** para venda e troca; **não** no ramo histórico | `api/src/contas-receber.js:287-313` |

As três primeiras aplicam as mesmas três recusas: data que não existe no
calendário, data futura e pagamento anterior à venda
(`api/src/pagamento-venda.js:142-149`).

### O gap real encontrado

`receberConta` **validava** `pagaEm` e o **descartava** no ramo `historico:` —
`marcarContaPaga` carimbava `paga_em = agora()`, o relógio do servidor. Para a
cobrança vinda da planilha, o cenário 10/09 → 12/09 → 16/09 faturava em **16/09**.
E §30 é explícito: do lado histórico, `paga_em` governa o faturamento da
cobrança que nasceu aberta e foi paga depois.

Não dependia de decisão humana nenhuma — a semântica já estava escrita e as
outras três portas já a respeitavam. **Corrigido** (§6).

### Classificação para o Codex

**UI CONTRACT GAP**, e localizado: em `docs/ux/03-screens/vendas/master.html:338`
a data da venda é um campo real (`<input type="date" data-sale-date>`); no
compositor de pagamento (`:1241`, `:930`) a data do pagamento é o texto fixo
`'Data do pagamento: 12/09/2026'`, sem campo, e a situação do recebimento é
`Pago hoje` | `Pendente`.

A tela de Financeiro **já está certa**: `financeiro/master.html:6` tem
`Data efetiva<input type="date" data-receipt-date>`.

O backend aceita as duas datas separadas desde §30. O compositor de pagamento
da Venda é o único lugar onde a UI afirma "hoje" por construção.

---

## 2. Matriz por tela e fluxo

Legenda de `BACKEND STATUS`: `SUPPORTED` · `PARTIAL` · `MISSING BACKEND` ·
`CONTRACT MISMATCH` · `BUSINESS RULE CONFLICT` · `FUTURE`.

### Vendas

| TELA/FLOW | UI EXPECTATION | BACKEND STATUS | CONTRACT | GAP | OWNER | BLOCKER | ACTION |
|---|---|---|---|---|---|---|---|
| Venda normal · itens e cliente | lançar venda com itens, desconto, cliente | SUPPORTED | `POST /api/vendas` | — | Codex | não | seguir |
| Venda normal · data da venda | data editável, futuro recusado | SUPPORTED | `POST /api/vendas` `data` | — | Codex | não | seguir |
| Venda normal · data do pagamento | hoje fixo no compositor | **UI CONTRACT GAP** | `POST /api/vendas` `dataPagamento` | UI não expõe campo | Codex | não | expor campo quando o design fechar |
| Venda normal · vários recebimentos | coleção por venda, formas mistas, parcial | **MISSING BACKEND** (API-VEN-013/014/018, V2-API-003) | `vendas.valor_recebido` é total conhecido, não coleção | não existe tabela de recebimentos | backend | não bloqueia o desenho | aguardar fase; ver §5 |
| Venda normal · situação `Pendente` + vencimento | prazo por recebimento | PARTIAL | `PATCH /api/contas-receber/prazo` (prazo é da CONTA) | prazo por evento não existe | backend | não | registrado |
| Monte seu Colar | composição, SKU e preço sugeridos | PARTIAL + **desligado** | `GET /api/personalizacao/modelos`; `POST /api/vendas` `personalizacoes[]` | `PERSONALIZACAO_DESATIVADA` (503) desde 06/09 | humano | sim, por flag | manter fora da V2 até religar |
| Saída sem faturamento | motivo, destino, peças, confirmar | SUPPORTED | `POST /api/saidas`, `GET /api/saidas`, `POST /api/saidas/:id/estornar` | — | Codex | não | seguir |
| Saída · custo real / `Impacto estimado` | custo congelado por unidade | **MISSING BACKEND** (V2-API-005, API-VEN-012) | `saidas_sem_faturamento` não tem coluna de custo; `produtos` não tem `custo` | não há base de custo em lugar nenhum | humano + backend | não bloqueia o desenho | **não exibir número**; decisão V2-DEC-003 |
| Painel de vendas · intervalo livre | período arbitrário entre datas | **SUPPORTED — Codex não vê** (API-VEN-001) | `de=&ate=` em todas as `/api/analytics/*`, validado | nenhum | Codex | não | usar; ver §5 |
| Painel · produtos, categorias, origem | blocos do mesmo recorte | **SUPPORTED — Codex não vê** (API-VEN-002/003) | `/api/analytics/painel`, `/crm`, `/produtos`, `/categorias`, `/origem`, `/evolucao`, `/mes` | nenhum | Codex | não | usar |
| Histórico completo · filtros | tipo/origem, pagamento, estado | PARTIAL (API-VEN-006) | `GET /api/vendas/lista?de&ate&busca&canal&origem&canceladas&limite&offset` | falta filtro por estado de pagamento | backend | não | registrado |
| Histórico completo · totais e paginação | totais sob o mesmo filtro; contagem | **MISSING BACKEND** (API-VEN-007) | `listarVendasUnificado` devolve `{itens, limite, offset}` | **sem `total`** — a UI não consegue paginar nem somar sem recalcular | backend | não | criar; ver §5 |
| Histórico · exportar | exportação auditada | FUTURE (API-VEN-008) | — | — | humano | não | decisão de produto |
| Cancelar venda | cancelamento com contrapartida | SUPPORTED | `POST /api/vendas/:id/cancelar` | — | Codex | não | seguir |
| Corrigir item vendido | trocar SKU sem virar venda nova | SUPPORTED (§40) | `POST /api/vendas/corrigir-item`, `GET /api/vendas/correcoes` | — | Codex | não | superfície ainda não desenhada |

### Clientes

| TELA/FLOW | UI EXPECTATION | BACKEND STATUS | CONTRACT | GAP | OWNER | BLOCKER | ACTION |
|---|---|---|---|---|---|---|---|
| Lista e busca | buscar, paginar, abrir | SUPPORTED | `GET /api/clientes?busca=&limite=` | — | Codex | não | seguir |
| Cadastro rápido | criar e selecionar | SUPPORTED | `POST /api/clientes` | — | Codex | não | seguir |
| Editar cadastro | contato e dados | SUPPORTED | `PATCH /api/clientes/:id` | — | Codex | não | seguir |
| Perfil · KPIs | comprado, pago, em aberto, ticket | **SUPPORTED** (V2-API-007) | `GET /api/clientes/perfil` → `resumo{}` | semântica já documentada na resposta | Codex | não | não recalcular no browser |
| Perfil · crédito disponível | hoje mostra `Regra pendente` | **SUPPORTED — regra decidida** (V2-DEC-001) | `GET /api/clientes/:id/credito` | UI ainda anuncia regra inexistente | Codex + humano | não | ver §3 |
| Perfil · garantias por item | abrir o caso exato | **SUPPORTED** (V2-API-008) | `perfil.garantias[]` com `id, vendaId, vendaItemId, sku, varianteId, status, prazo` | confirmado, campo a campo | Codex | não | usar |
| Perfil · feed unificado | `eventos[]` tipados e ordenados | **MISSING BACKEND** (V2-API-006) | compras, garantias e correções vêm em listas separadas | não há feed único | backend | não bloqueia o desenho | criar; ver §5 |
| Perfil · homônimas | duas fichas com o mesmo nome | SUPPORTED | `perfil.homonimos`, `nomeAmbiguo`, `aviso` | — | Codex | não | **mostrar o aviso**; §2 |

### Financeiro

| TELA/FLOW | UI EXPECTATION | BACKEND STATUS | CONTRACT | GAP | OWNER | BLOCKER | ACTION |
|---|---|---|---|---|---|---|---|
| A receber · lista | contas abertas, vencimento, saldo | SUPPORTED | `GET /api/contas-receber?status=` | — | Codex | não | seguir |
| Alterar prazo | vencimento controlado | **CONTRACT MISMATCH** | `PATCH /api/contas-receber/prazo` com `chave` | `api-needs` cita `PATCH /api/contas-receber/:id/vencimento`, **aposentada** | Codex | não | trocar a citação |
| Marcar item pago (histórico) | liquidar cobrança da planilha | **CONTRACT MISMATCH** | `POST /api/contas-receber/receber` com `chave: "historico:<id>"` | `api-needs` cita `POST /api/contas-receber/:id/marcar-paga`, **aposentada** | Codex | não | trocar a citação |
| Receber · data efetiva | data real do recebimento | **SUPPORTED — corrigido aqui** | `POST /api/contas-receber/receber` `pagaEm` | era descartada no ramo histórico | backend | não | ver §1 e §6 |
| Registrar vários recebimentos | coleção auditável por venda | **MISSING BACKEND** (V2-API-003) | — | não existe | backend | não | ver §5 |
| Corrigir/estornar um recebimento | preservar anterior, autoria, motivo | **MISSING BACKEND** (V2-API-009) | `desfazerPagamentoVenda` desfaz a QUITAÇÃO inteira | sem granularidade por evento, sem autoria | backend | não | ver §5 |
| Excesso recebido | recebeu a mais que o total | PARTIAL | `GET /api/vendas/lista` marca `sobra: true`; `GET /api/contas-receber` faz `Math.max(0, …)` | as duas leituras discordam | backend + humano | não | decisão V2-DEC-001b |
| Conferência financeira | a razão do dinheiro fecha | **SUPPORTED — Codex não vê** | `GET /api/financeiro/conferir` | nenhum | Codex | não | usar |

### Garantias, Reparos e Trocas

| TELA/FLOW | UI EXPECTATION | BACKEND STATUS | CONTRACT | GAP | OWNER | BLOCKER | ACTION |
|---|---|---|---|---|---|---|---|
| Lista e prazos | fila, filtros, urgência | SUPPORTED | `GET /api/garantias`, `/pendentes` | — | Codex | não | seguir |
| Caso e linha do tempo | detalhe e eventos | SUPPORTED | `GET /api/garantias/:id` | — | Codex | não | seguir |
| Abrir caso pelo item comprado | ligar à linha da compra | SUPPORTED (§31, 5.2b) | `POST /api/garantias` com `vendaItemId` | — | Codex | não | usar `vendaItemId`, nunca o trio antigo |
| Prazo de 45 dias úteis | contagem e feriados | SUPPORTED | `prazo` na resposta; `consideraFeriados` | feriados podem não estar cadastrados — o backend **diz** | Codex | não | exibir `consideraFeriados` |
| Transição de status | mudança controlada | SUPPORTED | `POST /api/garantias/:id/status` | — | Codex | não | seguir |
| Corrigir status lançado errado | corrigir sem apagar o erro | **SUPPORTED — Codex não vê** | `POST /api/garantias/:id/corrigir-status` | nenhum | Codex | não | usar |
| Reabertura (7 dias úteis + etiqueta) | novo atendimento é caso novo | **SUPPORTED — Codex não vê** | `POST /api/garantias/:id/reabrir` | nenhum | Codex | não | usar |
| Troca e diferença positiva | diferença vira venda, recebe | SUPPORTED (§36) | `POST /api/garantias/:id/troca`, `/troca/pagar`, `/troca/estornar` | — | Codex | não | seguir |
| Troca · diferença negativa | hoje `pendente_regra` na UI | **SUPPORTED — regra decidida** (V2-DEC-002) | `credito_emitido` + `credito_movimentos` | UI ainda trata como regra inexistente | Codex + humano | não | ver §3 |
| Vínculos que o backfill recusou | garantia sem ponteiro de item | **SUPPORTED — Codex não vê** | `GET /api/garantias/vinculos` | nenhum | Codex | não | superfície ainda não desenhada |

### Estoque e Inventário

| TELA/FLOW | UI EXPECTATION | BACKEND STATUS | CONTRACT | GAP | OWNER | BLOCKER | ACTION |
|---|---|---|---|---|---|---|---|
| Saldo e razão | saldo por SKU, movimentos | SUPPORTED | `GET /api/estoque/:sku/movimentos`, `GET /api/estoque/conferir` | — | Codex | não | seguir |
| Produtos · buscar e editar | metadados, variações, dependências | SUPPORTED | `PATCH /api/produtos/:sku`, `GET /api/produtos/:sku/variacoes`, `/dependencias` | `qtd` recusa edição (400 sempre) | Codex | não | nunca oferecer campo `qtd` |
| **Saúde e valor econômico** | fórmula de saúde, patrimônio | **MISSING BACKEND** (V2-API-010) | não existe read model; `produtos` **não tem coluna de custo** | patrimônio por preço de venda não é patrimônio | humano + backend | não bloqueia o desenho | **não exibir número**; ver §5 |
| Inventário · iniciar/retomar | sessão autoritativa | SUPPORTED | `POST /api/inventarios`, `GET /api/inventarios/:id`, `/pausar`, `/retomar` | — | Codex | não | seguir |
| Inventário · contar | incluir, corrigir, remover, zero | SUPPORTED | `PUT /api/inventarios/:id/contagem`, `POST /:id/itens`, `DELETE /:id/itens/:sku` | os três estados existem no contrato | Codex | não | não colapsar `não contado` × `contado zero` |
| Inventário · `não sei a variação` | decisão explícita, sem chutar | SUPPORTED (§2) | `POST /api/inventarios/:id/nao-identificado`; 409 com variações | — | Codex | não | seguir |
| Inventário · concluir e aplicar | backend deriva a quantidade | SUPPORTED | `POST /:id/concluir`, `/ajustar`, `/aplicar`, `GET /:id/resultado` | — | Codex | não | **nunca enviar `quantidadeAjuste`** |

### Revendedoras e Maletas

| TELA/FLOW | UI EXPECTATION | BACKEND STATUS | CONTRACT | GAP | OWNER | BLOCKER | ACTION |
|---|---|---|---|---|---|---|---|
| CRUD e arquivar | ficha, status | SUPPORTED | `POST/PATCH /api/revendedoras`, `/:id/arquivar` | — | Codex | não | seguir |
| Maleta · consignar e acertar | itens, comissão, líquido | SUPPORTED | `POST /api/maletas/:id/itens`, `/acerto`, `/cancelar` | — | Codex | não | seguir |
| **Criar maleta atômica** | cabeçalho + itens numa confirmação | **MISSING BACKEND** (V2-API-011) | `criarMaleta` insere só o cabeçalho (`maletas-comandos.js:281`) | falha no meio deixa maleta vazia | backend + arquitetura | não bloqueia o desenho | ver §5; decisão de desenho |
| Desempenho da revendedora | métricas do histórico | SUPPORTED (§19) | `GET /api/analytics/revendedoras` | — | Codex | não | seguir |

### Catálogo, Mídia e Publicação

| TELA/FLOW | UI EXPECTATION | BACKEND STATUS | CONTRACT | GAP | OWNER | BLOCKER | ACTION |
|---|---|---|---|---|---|---|---|
| Central, estados e faltas | pipeline sem colapsar dimensões | SUPPORTED | `GET /api/catalogo/publicacao`, `GET /api/produtos/pendentes` | — | Codex | não | seguir |
| Categorias | criar, renomear, arquivar | SUPPORTED | `GET/POST /api/categorias`, `PATCH /:id`, `/:id/arquivar` | — | Codex | não | não oferecer mesclar |
| Galeria e fotos em lote | múltiplas fotos, principal, ordem | SUPPORTED, **bloqueado por R2** | `/api/produtos/:sku/galeria*`, `/api/fotos/lotes*` | escrita de bytes → `503 {bloqueio:"sem_r2"}` | humano (infra) | sim | tratar `sem_r2` como estado, não erro |
| Preparação desacoplada | tarefa, executor livre, resultado | SUPPORTED | `/api/catalogo/preparacao/tarefas*` | — | Codex | não | `resultado` sempre `publicado:false` |
| Aprovação humana | prévia, aprovar, reabrir | SUPPORTED | `/api/catalogo/publicacao/:sku/{previa,aprovar,reabrir}` | — | Codex | não | seguir |
| Publicar de verdade | CTA de publicação | SUPPORTED, **desligado** | `NUVEMSHOP_PUBLICACAO_ENABLED` ausente (`plataforma/config.js:63`) | — | humano | sim, por flag | só `Simular`; freio acima de 20 |
| **Cadastro de produto novo** | criar produto pela tela | PARTIAL — o Codex já registrou a lacuna | `POST /api/produtos/importar`, `POST /api/produtos/novos/cadastrar` existem | não é uma rota "criar um produto" | backend | não | mapear qual das duas atende |

### Nuvemshop e Pendências

| TELA/FLOW | UI EXPECTATION | BACKEND STATUS | CONTRACT | GAP | OWNER | BLOCKER | ACTION |
|---|---|---|---|---|---|---|---|
| Panorama e saúde | estado da integração | SUPPORTED | `GET /api/sync`, `GET /api/state` | — | Codex | não | seguir |
| Análise seca | dry-run que não escreve | SUPPORTED (§11) | `POST /api/sync/analisar`; `POST /api/sync {"seco":true}` | — | Codex | não | seguir |
| Pendências humanas | variação, duplicata, vínculo | SUPPORTED | `GET /api/pendencias`, `/adiar`, `/retomar`, `/variacao/venda`, `/variacao/maleta` | — | Codex | não | seguir |
| Pendência de crédito | frase da pendência | **corrigido aqui** | `GET /api/pendencias` | a frase afirmava regra inexistente | backend | não | ver §6 |
| Preços divergentes | ver sem corrigir | SUPPORTED | `GET /api/catalogo/precos/divergentes` | — | Codex | não | nunca corrigir automático |
| Reconciliação · Apply | aprovar item a item e aplicar | SUPPORTED no backend | `/api/reconciliacao*` | tela não existe | Codex | não | fora da V2 atual |
| Prioridades da Home | ordenar por prazo/impacto | PARTIAL (V2-API-002) | `GET /api/pendencias` tem `tipo`, `grupo`, `motivo`, `explicacao`, `acoes` | faltam `prioridade`, `prazo`, `rotaDestino`, `entidadeId`, `observadoEm` | backend | não | ver §5 |

### Etiquetas, Notificações, Home/Agenda, Perfil

| TELA/FLOW | UI EXPECTATION | BACKEND STATUS | CONTRACT | GAP | OWNER | BLOCKER | ACTION |
|---|---|---|---|---|---|---|---|
| Etiquetas · preparar e imprimir | operação local | SUPPORTED como está | nenhuma rota de etiqueta existe | — | Codex | não | manter local |
| Etiquetas · lote e histórico | reimpressão auditável | **MISSING BACKEND** (V2-API-012, ETQ-A004) | nenhuma | persistência nova, não aprovada | humano + backend | não | registrado |
| Etiquetas · fila automática | produtos recém-cadastrados | PARTIAL (ETQ-A001) | `GET /api/produtos/pendentes` pode servir | a ligar | Codex | não | avaliar |
| Notificações · central | ler, adiar, preferências | **MISSING BACKEND** (V2-API-013) | `GET /api/pendencias` + `/adiar` cobrem parte | sem `lidaEm`, sem preferências, sem identidade | backend | não | ver §5 |
| Home · Agenda semanal | compromissos e recorrência | **MISSING BACKEND** (V2-API-001) | nenhuma | persistência nova | backend | não bloqueia o desenho | ver §5 |
| Home · métricas de abertura | vendido, recebido, a receber, **patrimônio** | PARTIAL + **conflito** | os três primeiros existem em `/api/analytics/painel` | **patrimônio não tem base de custo** | humano | não | V2-DEC-006; ver §4 |
| Perfil · identidade e permissões | usuário, papel, capacidades | **MISSING BACKEND** (V2-API-014) | `api/src/auth.js` é **chave única compartilhada**, sem contas | não existe usuário, nem papel, nem `/me` | humano + backend | não bloqueia o desenho | ver §5; permissões só informativas |
| Preferências da conta | persistir por conta | **MISSING BACKEND** (V2-API-015) | `localStorage` | — | backend | não | fallback local é aceitável |
| Conexão | testar e mascarar chave | SUPPORTED | `GET /api/health`, `GET /api/config` | — | Codex | não | §15: navegador nunca manda chave de API |

---

## 3. Clientes — o que o perfil já serve hoje

Auditoria de `perfilCliente` (`api/src/analytics.js:1014-1344`) contra a lista
pedida. Rota: `GET /api/clientes/perfil?id=|norm=`.

| Informação | Já existe? | Onde, nome literal |
|---|---|---|
| **total comprado** | **sim** | `resumo.comprou` — total comercial, não diminui por falta de pagamento (§39) |
| **saldo A Receber** | **sim** | `resumo.emAberto` |
| total pago | sim | `resumo.pago` (= `resumo.faturamento`) |
| ticket médio | sim | `resumo.ticketMedio` (sobre o comprado) e `ticketMedioRecebido` |
| gasto médio por peça | sim | `resumo.gastoMedioPorPeca` |
| primeira e última compra | sim | `resumo.primeiraCompra`, `resumo.ultimaCompra` |
| estado de relacionamento | sim | `resumo` recebe o spread de `classificarCliente` |
| preferências | sim | `canalPreferido`, `categoriasPreferidas[]`, `produtosPreferidos[]`, `contextos[]` |
| **compras** | **sim** | `vendas[]` — venda agregada, com `itens[]` por baixo, das duas populações |
| **pagamentos** | **parcial** | por VENDA: `valorRecebido`, `valorReceber`, `status`, `cobrancaStatus`, `vencimentoEm`, `pagaEm`. **Não existe** lista de recebimentos individuais |
| **garantias** | **sim** | `garantias[]` e `garantiasPendentes[]`, cada uma com `id`, `vendaId`, `vendaItemId`, `sku`, `varianteId`, `status`, `prazo`, `eventos[]` |
| **reparos** | **sim** | são garantias: `eventos[]` do caso |
| **trocas** | **sim** | `garantias[].troca{}` com `diferenca`, `diferencaStatus`, `creditoAoCliente`, `vendaId` |
| **crédito** | **sim, fora do perfil** | `GET /api/clientes/:id/credito` → saldo derivado por `SUM` + extrato |
| **histórico** | **parcial** | `vendas[]` + `correcoes[]` + `garantias[]`. **Não existe** `eventos[]` unificado |
| composições Monte seu Colar | sim | `vendas[].personalizacoes` — configuração congelada na venda |
| homônimas | sim | `homonimos`, `nomeAmbiguo`, `aviso` |

### O crédito da cliente — V2-DEC-001 **já foi decidido**

O protótipo mostra `Regra pendente` e não exibe `R$ 0,00` — decisão correta
**para o que o Codex enxerga**. Mas a regra fechou:

- **12/09/2026** (Sthefany): peça nova mais barata **vira crédito da cliente**,
  não volta em dinheiro — `api/REGRAS.md`, "A peça nova mais barata vira
  CRÉDITO da cliente";
- **13/09/2026**, quatro decisões: o crédito **não expira**; é de **cliente
  identificada**; o saldo é **projeção** (`SUM`, nunca coluna); legado sem
  cliente confiável é **pendência**;
- implementado em `api/src/credito.js` sobre a tabela `credito_movimentos`,
  com `migracao-credito-cliente.sql`;
- rotas: `GET /api/clientes/:id/credito`, `POST /api/credito/ajuste`,
  `GET /api/credito/conferir`.

**O que o crédito ainda NÃO faz:** ninguém o consome. Não existe "pagar com
crédito". O compositor de pagamento do protótipo oferece a forma
`Crédito da cliente` (`vendas/master.html:1241`) — essa forma **não tem
backend**. É gap real, e o consumo do crédito é decisão humana pendente
(quanto pode ser usado por venda, se pode ficar negativo, quem autoriza).

**Ação para o Codex:** trocar `Regra pendente` por saldo real e extrato é
seguro. Oferecer `Crédito da cliente` como forma de pagamento **não é** —
ainda.

### O que precisará de contrato novo em Clientes

| # | O quê | Por quê |
|---|---|---|
| V2-API-006 | `eventos[]` unificado no perfil | compras, recebimentos, garantias e trocas vêm em listas paralelas; ordenar e tipar no browser recriaria regra de domínio no cliente |
| — | crédito dentro do perfil | hoje é uma segunda chamada; o dashboard do perfil pediria as duas |
| V2-API-003 | recebimentos individuais | o perfil só sabe o estado financeiro **da venda** |

---

## 4. Nuvemshop — a UI respeita o modelo?

**Sim, com uma ressalva de vocabulário.** O protótipo
(`docs/ux/03-screens/nuvemshop/master.html`) preserva os freios corretos, e o
próprio README da tela diz: "não cria produto, não muda preço, não casa variante
por nome e não transforma análise em autorização de escrita".

| Regra | Onde está | A UI respeita? |
|---|---|---|
| a loja é **destino** do estoque, não fonte do físico | CLAUDE.md regra 4; §44 "O produto nasce aqui — e a loja é canal" | sim |
| nenhuma sincronização sem confirmação | §11 | sim — só dry-run |
| casamento por `variant_id`, **nunca** por nome | §8b | sim — "não casa variante por nome" |
| preço não é corrigido automaticamente | §4 / `GET /api/catalogo/precos/divergentes` | sim — mostra sem corrigir |
| categoria vem do catálogo ou do nome, nunca do material | §22 | sim — fora de correção automática |
| mídia: bytes no R2, referência no D1 | §14 | sim — e trata `sem_r2` |
| publicação exige aprovação humana **e** flag | §13; `NUVEMSHOP_PUBLICACAO_ENABLED` | sim — só `Simular` |
| freio acima de 20 aprovados na rodada | contrato 4.5 | sim — `pausado: true` |
| idempotência de pedidos (`vendas.externo_id`) | CLAUDE.md regra 5 | não é superfície de UI |
| pedido anterior ao corte é história, não venda | §4b | não aparece na UI — **ok, não contradiz** |

**A ressalva:** o botão `Publicar na Nuvemshop` aparece três vezes em
`nuvemshop/master.html` como nome de área. O contrato exige que **nenhum CTA
prometa publicar de verdade** enquanto a flag estiver desligada — e o próprio
`catalogo/api-needs.md` do Codex escreve isso. Como nome de área é aceitável;
como botão de ação, não. Vale o Codex conferir no visual final. Não é bloqueio.

**Nada foi tocado na Nuvemshop.** Nenhuma escrita, nenhuma chamada à loja de
verdade.

**Correção de 18/09 à versão de 16/09 deste parágrafo.** Estava escrito aqui que
`src/pendencias-nuvemshop-test.mjs` não fora executado porque `POST /api/sync
{forcar:true}` sairia para a loja real. **Isso estava errado, e importa saber
por quê:** o teste sobe a Nuvemshop de mentira de `src/loja-falsa.mjs` em
`localhost:8799`, e `docs/operations/DEVELOPMENT.md:74-77` fixa
`NUVEMSHOP_BASE=http://localhost:8799` no `.dev.vars` de desenvolvimento.
Nenhuma chamada sai do ambiente local, e nenhum token real é usado.

O teste **foi executado** em 18/09, contra o Worker local com banco limpo, e
passou inteiro (`✓ TUDO PASSOU`) — incluindo a asserção que interessa aqui:
*"nenhum PATCH de estoque na caixinha do código não repartido"*, ou seja, a
loja de mentira não recebeu escrita nenhuma. A prova de que o Worker estava
mesmo apontado para ela, e não para a loja real, é que `POST
/api/loja/variantes/importar` **leu** os produtos 70 e 71 plantados no estado da
loja falsa — dado que só existe lá.

---

## 5. Resumos

### 5.1 Gaps backend **reais**

| # | Gap | Criticidade | Depende de decisão humana? |
|---|---|---|---|
| G1 | ~~`pagaEm` descartado no ramo histórico de `receberConta`~~ | crítica | não — **corrigido** (§6) |
| G2 | ~~pendência de crédito anunciava regra decidida como inexistente~~ | média | não — **corrigido** (§6) |
| G3 | coleção de recebimentos por venda (V2-API-003/013/014/018) | crítica | **sim** — formas, parcelamento, taxas |
| G4 | corrigir/estornar **um** recebimento, com autoria (V2-API-009) | crítica | **sim** — depende de G3 e de identidade |
| G5 | `total` em `GET /api/vendas/lista` | alta | **não** — ver 5.4 |
| G6 | feed `eventos[]` no perfil da cliente (V2-API-006) | média | não, mas depende do desenho do perfil |
| G7 | `prioridade`, `prazo`, `rotaDestino`, `entidadeId`, `observadoEm` em pendências (V2-API-002) | alta | **sim** — o que é prioridade |
| G8 | custo congelado na saída sem faturamento (V2-API-005/012) | alta | **sim** — não há fonte de custo |
| G9 | saúde e valor econômico do estoque (V2-API-010) | alta | **sim** — fórmula; sem custo não há patrimônio |
| G10 | criar maleta atômica (V2-API-011) | crítica | **sim** — comando único ou rascunho |
| G11 | identidade, sessão e capacidades (V2-API-014) | crítica | **sim** — não existe usuário no sistema |
| G12 | consumo de crédito ("pagar com crédito") | média | **sim** |
| G13 | agenda persistente (V2-API-001) | média | não bloqueia o desenho |
| G14 | notificações: `lidaEm`, preferências, entrega (V2-API-013) | média | **sim** — canal externo |
| G15 | lote e histórico de etiquetas (V2-API-012) | média | **sim** |
| G16 | excesso recebido: `/api/vendas/lista` mostra a sobra, `/api/contas-receber` a esconde com `Math.max(0,…)` | média | **sim** |

### 5.2 Gaps que são **só design** — nenhuma ação de backend

Data do pagamento no compositor de venda (o contrato existe, §1); estrutura de
abas e navegação (Clientes na barra, Financeiro em `Mais`, Catálogo dentro de
Estoque); taxonomia visual das etapas de garantia; ordenação e filtros do
histórico já suportados; o aviso de homônimas (dado pronto, falta exibir);
`consideraFeriados` (idem); `sem_r2` como estado (idem).

### 5.3 Regras **conflitantes** ou desatualizadas no material do Codex

| # | Onde | O que diz | O que vale |
|---|---|---|---|
| C1 | `financeiro/api-needs.md` | `POST /api/contas-receber/:id/marcar-paga` como "já atendido" | **aposentada** em 5.3d/B9 — use `POST /api/contas-receber/receber` com `chave: "historico:<id>"` |
| C2 | `financeiro/api-needs.md` | `PATCH /api/contas-receber/:id/vencimento` como "já atendido" | **aposentada** — use `PATCH /api/contas-receber/prazo` com `chave` |
| C3 | `clientes/api-needs.md`, handoff V2-DEC-001 | "crédito: decisão pendente" | **decidido** 12–13/09 e implementado |
| C4 | `reparos/api-needs.md`, V2-DEC-002 | "destino da diferença negativa: regra não fechada" | **fechado**: vira crédito. `pendente_regra` hoje só significa crédito sem dona ou troca anterior à regra |
| C5 | `vendas/api-needs.md` API-VEN-001/002/003 | "intervalo arbitrário: parcial" | **existe** e é validado (5.6) |
| C6 | handoff V2-DEC-006 | Home abre com "vendido, recebido, a receber e **patrimônio** com fórmula auditável" | **não há fórmula auditável de patrimônio** — não existe custo. Os outros três existem |
| C7 | `vendas/master.html:1241` | forma de pagamento `Crédito da cliente` | o crédito **existe**, o **consumo não** |

C1 e C2 são erro de citação sobre uma branch que o Codex não vê; C3–C5 são
distância de branch. Nenhum deles é decisão errada de UX.

### 5.4 Endpoints que **já existem** e o Codex pode usar hoje

Todos em `claude/refactor-sistema-marquesa`, ausentes da branch do Codex:

| Rota | Serve a |
|---|---|
| `GET /api/clientes/:id/credito` | crédito da cliente: saldo derivado + extrato |
| `POST /api/credito/ajuste` | ajuste manual de crédito, com motivo |
| `GET /api/credito/conferir` | razão de crédito fechando |
| `GET /api/financeiro/conferir` | conferência da razão do dinheiro |
| `POST /api/garantias/:id/corrigir-status` | corrigir status lançado errado sem apagar o erro |
| `POST /api/garantias/:id/reabrir` | reabertura: caso novo ligado ao anterior |
| `GET /api/garantias/vinculos` | garantias que o backfill se recusou a adivinhar |
| `GET /api/analytics/*` com `de=&ate=` | **intervalo arbitrário validado** — fecha API-VEN-001 |
| `GET /api/analytics/painel` e `/crm` | read models agregados: um recorte, todos os blocos |
| `GET /api/clientes/perfil` | `resumo{}`, `vendas[]`, `garantias[]`, `correcoes[]`, homônimas |

E, do que ambos já têm mas o handoff marca como incerto: `POST /api/saidas` +
`/estornar`, `GET /api/vendas/lista` com `origem` e `canceladas`,
`POST /api/vendas/corrigir-item`, a família `/api/inventarios/*` inteira e a
família `/api/catalogo/*` inteira.

### 5.5 Endpoints que **realmente** precisamos criar

Ordenados por quanto travam a UI, e separando o que depende de decisão:

| Ordem | Contrato | Depende de decisão? |
|---|---|---|
| 1 | `total` (e contagem) em `GET /api/vendas/lista` | **não** — a UI não pagina sem ele |
| 2 | read model + comandos de **recebimentos por venda** (G3/G4) | **sim** |
| 3 | `/me` ou equivalente: `id, nome, papel, capacidades[]` (G11) | **sim** |
| 4 | campos de prioridade em `GET /api/pendencias` (G7) | **sim** |
| 5 | `POST /api/maletas` aceitando `itens[]` atômico (G10) | **sim** (desenho) |
| 6 | `eventos[]` no perfil da cliente (G6) | não |
| 7 | custo na saída sem faturamento (G8) | **sim** |
| 8 | read model de saúde/valor do estoque (G9) | **sim** |
| 9 | agenda (G13), notificações (G14), lotes de etiqueta (G15) | G13 não, G14/G15 sim |

**O item 1 é o único que eu poderia ter implementado sem decisão humana** e não
implementei: definir *quais* totais (peças, valor comercial, recebido, em
aberto) é escolha de contrato que conversa com o desenho da tela, e o item 8 do
pedido proíbe inventar requisito. Fica como primeira tarefa desbloqueada assim
que o formato do rodapé do histórico for confirmado.

### 5.6 Decisões humanas necessárias

| # | Decisão | Trava o quê |
|---|---|---|
| D1 | **Consumo** de crédito: pode pagar venda com crédito? limite? quem autoriza? | forma `Crédito da cliente`; perfil; troca negativa |
| D2 | Recebimentos múltiplos: formas aceitas, parcial, taxa de cartão, parcelamento | Vendas, Financeiro, perfil |
| D3 | Excesso recebido: sobra vira crédito, devolução, ou fica visível como sobra? | Financeiro; resolve C7 e G16 |
| D4 | Identidade: haverá contas de usuário? quantos papéis? | Perfil, autoria, toda a matriz de permissões |
| D5 | Quem vê custo e executa ajuste, estorno e exportação (V2-DEC-003) | Estoque, Saídas, Financeiro |
| D6 | Fonte de custo — existe? de onde vem? | `Impacto estimado` das saídas; patrimônio da Home |
| D7 | Métricas de abertura da Home (V2-DEC-006), sabendo que patrimônio não tem base | Home |
| D8 | Fórmula de "Saúde do estoque" | Estoque |
| D9 | Criar maleta: comando atômico ou rascunho com rollback? | Revendedoras |
| D10 | Trocas negativas **anteriores** a 12/09: emitir crédito retroativo ou deixar como pendência? | fila de pendências |
| D11 | Religar Monte seu Colar | Vendas |
| D12 | Habilitar R2 e `NUVEMSHOP_PUBLICACAO_ENABLED` | Catálogo, Publicação |
| D13 | Notificações: canal externo e retenção | Central de Notificações |

D10 apareceu nesta revisão e ainda não estava em nenhuma lista.

---

## 6. O que foi implementado no Refactor

Dois gaps, ambos sem dependência de decisão humana, ambos com a semântica já
escrita em `api/REGRAS.md`.

**Commit `aac0c7f`** — `fix(financeiro): §30 — a data do pagamento também vale
no ramo histórico` — na branch `claude/refactor-sistema-marquesa`, worktree
`../Marquesa-Claude-Refactor`, empurrado para `origin` em 18/09
(`f5a4bd6..aac0c7f`, fast-forward, 0 atrás). Seis arquivos, 374 inserções.

**Nada foi implantado.** Nenhum deploy, nenhuma migration, nenhum toque em
`develop`, em Pages, no protótipo ou no design system. A branch do Refactor é
independente da que o Codex publica.

### G1 — a data do pagamento deixa de ser o relógio do servidor

- `api/src/historico-operacoes.js` — `marcarContaPaga` passa a aceitar `pagaEm`.
  Aplica as **mesmas três recusas** das outras portas: data que não existe
  (400), data futura (400), pagamento anterior à venda (400, comparando com
  `vendas_historicas.data`, que `SQL_CONTA` já traz). Sem `pagaEm`, continua
  gravando o timestamp de agora — o padrão de quem recebeu neste instante não
  mudou.
- `api/src/contas-receber.js` — `receberConta` passa `pagaEm` adiante no ramo
  `historico:`, em vez de validar e descartar. Passa `pagaEm ? data : null`,
  e não `data`, justamente para não trocar em silêncio o timestamp pela data
  seca de quem não informou nada.

A data validada é gravada crua (`AAAA-MM-DD`); toda leitura de faturamento já
normaliza com `date(ho.paga_em)` (`api/src/analytics.js:155`), então o mês
continua saindo certo.

### G2 — a pendência de crédito passa a dizer o motivo verdadeiro

`api/src/pendencias.js` — a frase era "Crédito ou reembolso ainda não é regra
definida — nada foi lançado", e isso deixou de ser verdade em 12/09. Como
`migracao-credito-cliente.sql` escreve, `pendente_regra` hoje tem **dois**
significados diferentes, com saídas diferentes: cliente não identificada
(crédito sem dona) ou troca anterior à regra. A consulta passou a trazer
`g.cliente_id` e cada linha diz o seu caso.

A **chave** `motivo: 'credito_sem_regra'` não mudou de propósito: o painel
legado tem um rótulo indexado por ela (`src/dashboard.tpl.html:6546`), e
renomear apagaria a explicação de lá sem trocar o fato.

### Provas executadas

Rodada de validação do commit, 18/09, Worker local subido do worktree do
Refactor, **banco zerado e schema recarregado antes de cada teste HTTP** — a
primeira tentativa de rodar o teste de riscos sobre o banco sujo do teste
anterior falhou em 8 asserções, que é exatamente o que
`docs/testing/TESTING.md` avisa e não um defeito do código.

| Prova | Resultado |
|---|---|
| `node src/data-pagamento-historico-test.mjs` (novo, 14 provas) | **14/14** — inclui o cenário 10/09 → 12/09 literal |
| `node src/historico-operacoes-test.mjs` (Worker local, banco limpo) | **passou** — *"Tudo certo — papéis, acertos, duplicidade, cobrança e estoque fecham"* |
| `node src/historico-operacoes-riscos-test.mjs` (idem) | **passou** — *"Tudo certo — troca, fingerprint, versionamento, validação e estoque"* |
| `node src/pendencias-nuvemshop-test.mjs` (loja de mentira + Playwright) | **passou** — `✓ TUDO PASSOU`; ver a correção em §4 |
| `src/fin-101-5-3a-test.mjs` … `-3f-test.mjs` (cinco) | **passaram** (11, 13, 16, 10, 15 provas) — rodada de 16/09 |
| `node src/credito-ledger-test.mjs` | **passou** (19 provas) — rodada de 16/09 |
| razão contábil (`GET /api/estoque/conferir`) | `[]` dentro dos três primeiros testes |

O teste novo cobre: a data informada sobrevive; a resposta devolve a mesma
data; `date(paga_em)` acha o mês; sem data o carimbo continua sendo agora; as
quatro recusas **sem escrever nada e sem consumir versão**; data impossível
responde 400 mesmo com versão velha junto; receber no mesmo dia da venda é
aceito; e as três asserções da pendência de crédito.

### Correção de rota em dois testes existentes

`src/historico-operacoes-test.mjs` e `src/historico-operacoes-riscos-test.mjs`
chamavam `PATCH /api/contas-receber/:id/vencimento`, **aposentada em 5.3d/B9**.
Os dois já estavam quebrando na branch antes desta revisão (404). Passaram a
chamar `PATCH /api/contas-receber/prazo` com `chave` — a mesma
`definirVencimento`, o mesmo `versaoEsperada`, as mesmas asserções.

---

## 7. O que ficou de fora, e por quê

| Não feito | Motivo |
|---|---|
| rótulo `credito_sem_regra` no painel legado (`src/dashboard.tpl.html:6546`) | ainda diz "crédito sem regra definida" — a API já diz o motivo verdadeiro, o painel legado não. Corrigir exige `python src/build.py` + `node src/e2e.mjs` e um `dashboard.html` de 1 MB regerado. **Handoff H4 de §9.3** |
| comentário de 5.3d em `api/src/http/routes/comercial.js:291` | afirma que `PATCH /api/contas-receber/:id/vencimento` "não tinha call site nenhum: nem legado, nem React, nem teste". Tinha dois testes, e é por isso que eles quebraram. A rota continua corretamente aposentada; só a justificativa escrita está errada. **Handoff H5** |
| `total` em `GET /api/vendas/lista` (G5) | quais totais é escolha de contrato que conversa com o desenho do rodapé — §5.5 |
| qualquer outro gap de §5.1 | depende de decisão humana, ou de desenho ainda em revisão |
| deploy, migration | nenhum foi executado |
| revisão da UI publicada | o Codex ainda está publicando. §9 é o plano, e ele roda quando o SHA chegar |

**O que mudou desde 16/09:** o `push` desta linha deixou de ser "não feito" — a
branch `claude/refactor-sistema-marquesa` foi empurrada para `origin` em 18/09
(`aac0c7f`). Deploy e migration continuam sem acontecer. E
`src/pendencias-nuvemshop-test.mjs` saiu desta tabela: ele rodou, passou, e
nunca teria saído para a loja real — §4.

**Sobre o ambiente local:** os testes rodaram contra um Worker local subido
deste worktree, com banco descartável. Nenhum processo de outro worktree foi
afetado — a checagem de dono foi refeita pela linha de comando do processo pai,
porque `Marquesa-Claude-Refactor/api/node_modules` é um symlink para o do
worktree do Codex e o caminho do binário `workerd` não identifica o dono. Todos
os Workers locais subidos aqui foram encerrados ao fim; nenhum ficou no ar.

---

## 8. Plano da revisão final, contra o SHA publicado

Esta revisão está fechada **como checkpoint**, não como veredito. Ela compara
o protótipo em `ab8951b` com o backend em `aac0c7f`. O que falta é a passada
final, quando o Codex entregar o SHA publicado em
`https://marquesa-dev.pages.dev/prototype/`.

A revisão final é **somente leitura**. Não altera o deploy, o protótipo, o
design system, `develop`, o workflow ou o Pages.

### 8.1 Os quatro lados que a passada final compara

```
UI PUBLICADA (SHA do Codex)
   ↔  BACKEND REFACTOR (aac0c7f ou mais novo)
   ↔  REGRAS (api/REGRAS.md, 45 seções)
   ↔  SCHEMA/MIGRATIONS (api/schema.sql + migrations da fase 5)
```

O quarto lado é o que esta revisão de 16/09 **não** cobriu com profundidade: a
matriz §2 conferiu rota contra tela, e citou schema só onde o gap era de
coluna ausente (custo, recebimentos). A passada final fecha isso — para cada
promessa da UI, a coluna que a sustenta tem que existir na migration que já
rodou, não só na rota.

### 8.2 As quatorze frentes, e a pergunta específica de cada uma

| # | Frente | A pergunta que a passada final responde |
|---|---|---|
| 1 | **Vendas** | o compositor publicado ainda promete o que §2 lista, ou o refinamento `a6d7c6b` mudou o contrato? |
| 2 | **Data da venda** | continua editável e com futuro recusado? (hoje: SUPPORTED) |
| 3 | **Data do pagamento** | o campo apareceu, ou ainda é o texto fixo `12/09/2026`? O backend aceita nas **quatro** portas desde `aac0c7f` |
| 4 | **Múltiplos pagamentos** | a UI publicada apresenta coleção de recebimentos? Se sim, é **contrato fictício** — G3 não existe |
| 5 | **Clientes** | o perfil usa `resumo{}` do backend ou recalcula no browser? O aviso de homônimas aparece? |
| 6 | **Crédito** | saiu o `Regra pendente`? A forma de pagamento `Crédito da cliente` continua ofertada? (o consumo **não existe** — G12) |
| 7 | **Financeiro** | as citações C1/C2 foram trocadas pelas rotas por `chave`? A `Data efetiva` continua lá? |
| 8 | **Garantias/Trocas/Reparos** | a troca negativa ainda é anunciada como regra indefinida? `corrigir-status` e `reabrir` foram incorporados? |
| 9 | **Estoque/Inventário** | algum número de **patrimônio** ou **saúde** é exibido? Não há base de custo — exibir seria número inventado. Campo `qtd` é oferecido em algum lugar? `quantidadeAjuste` é enviado? |
| 10 | **Revendedoras/Maletas** | criar maleta é apresentada como uma confirmação só? O backend insere só o cabeçalho (G10) |
| 11 | **Monte seu Colar** | continua fora da V2? A rota responde `PERSONALIZACAO_DESATIVADA` (503) desde 06/09 |
| 12 | **Saídas sem faturamento** | `Impacto estimado` mostra número? Não pode — V2-DEC-003/G8 |
| 13 | **Etiquetas** | permanece local, sem prometer lote nem histórico persistido? (G15) |
| 14 | **Nuvemshop** | continua demonstrativa: dry-run, sem CTA que prometa publicar de verdade, freio acima de 20, `sem_r2` como estado |

### 8.3 Os sete cortes do relatório final

O relatório sai curto, nestas gavetas:

1. **compatível** — a UI promete e o backend entrega, com a rota nomeada;
2. **parcialmente compatível** — entrega parte; o que falta, em uma linha;
3. **gap real de backend** — a UI promete e não existe (fila §5.1);
4. **conflito de regra** — a UI contradiz `api/REGRAS.md` (§5.3);
5. **UI desatualizada em relação ao backend** — a UI anuncia como pendente o
   que já foi decidido e implementado (hoje: crédito, troca negativa,
   intervalo arbitrário, duas rotas aposentadas);
6. **decisão humana necessária** — §5.6, atualizada pelo que a UI publicada
   revelar;
7. **handoffs exatos para o Refactor** — §8.5.

### 8.4 As seis travas de segurança da leitura do publicado

Verificação somente leitura do endereço publicado. Cada uma é binária:

| Trava | Como se prova |
|---|---|
| a UI não promete o que não existe | cada CTA visível tem rota correspondente na matriz §2 |
| a UI não apresenta regra antiga como pendente | busca por `Regra pendente`, `pendente_regra`, `não definida` no HTML publicado |
| não há contrato fictício | nenhuma chamada a rota ausente de `api/src/http/routes/` |
| o que é FUTURE está identificado | ver §8.6 |
| nenhum CTA parece operar PROD | nenhuma origem de API apontando para o Worker de produção; nenhum botão de escrita sem `Simular` |
| nenhum dado sensível real foi publicado | nome de cliente, telefone, CPF, valor real ou chave de API no HTML estático |

### 8.5 Handoffs já conhecidos para o Refactor

Não dependem do SHA e podem ser feitos a qualquer momento:

| # | Handoff | Bloqueia? |
|---|---|---|
| H1 | `total` em `GET /api/vendas/lista` (G5) — **único item da fila sem decisão humana** | a paginação do histórico |
| H2 | `eventos[]` unificado no perfil da cliente (G6) | não, depende do desenho do perfil |
| H3 | levar `pagaEm` para a documentação de contrato de `POST /api/contas-receber/receber` | não |
| H4 | rótulo `credito_sem_regra` no painel legado (`src/dashboard.tpl.html:6546`) — a API já diz o motivo verdadeiro, o painel legado ainda diz "sem regra definida" | não |
| H5 | corrigir o comentário de 5.3d em `api/src/http/routes/comercial.js:291` — a justificativa escrita está errada, a aposentadoria está certa | não |

### 8.6 FUTURE — o que é produto, não engenharia

Distinto de "gap de backend": ninguém pediu ainda, e construir agora seria
inventar requisito.

| Item | Onde apareceu | Por que é FUTURE |
|---|---|---|
| exportação auditada do histórico (API-VEN-008) | Vendas · Histórico | é decisão de produto: o que exporta, quem pode, e se fica registro |
| agenda persistente (G13/V2-API-001) | Home | persistência nova sem regra de negócio escrita |
| notificações com entrega externa (G14/V2-API-013) | Central | canal externo e retenção são decisão (D13) |
| lote e histórico de etiquetas (G15/V2-API-012) | Etiquetas | persistência nova, não aprovada |
| preferências por conta (V2-API-015) | Perfil | depende de identidade (D4); `localStorage` serve enquanto isso |
| tela do Apply da reconciliação | Nuvemshop | backend existe, tela não foi desenhada; fora da V2 atual |

Os seis **não** entram na fila do Refactor sem decisão de Gustavo. Estão aqui
para que nenhum deles seja confundido com defeito.

---

## 9. Recomendação em uma linha por frente

- **Codex:** nada aqui pede que você pare, e nada aqui foi tocado — UI, design
  system, protótipo, `develop`, workflow e Pages seguem só seus. Três coisas
  ficaram prontas para usar quando o design chegar lá: crédito real no perfil,
  troca negativa com regra fechada, e intervalo arbitrário no painel. Duas
  citações de rota precisam de correção (C1, C2).
- **Backend/Refactor:** `aac0c7f` fechou G1 e G2 e está no remoto. A fila
  desbloqueada continua no `total` do histórico (G5/H1); o resto de §5.1 espera
  decisão.
- **Gustavo:** D1, D2 e D4 destravam, sozinhas, sete gaps da lista. E, quando o
  SHA publicado chegar, §8 é o plano da passada final — leitura apenas.
