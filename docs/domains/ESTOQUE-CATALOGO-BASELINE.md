# Matriz de domínio — Estoque e Catálogo

- **Captura:** 2026-09-09
- **Baseline:** `04edb022455e417b8389d2163b2f007b7dd3ecff`
- **Objetivo:** congelar ownership e invariantes antes do strangler; nenhuma mudança de comportamento.

## Autoridade e limites

| Assunto | Fonte de verdade atual | Dono proposto | Não é autoridade |
|---|---|---|---|
| Saldo físico | Planilha Estoque Total durante a transição; no sistema, razão `movimentos` | Estoque | Nuvemshop, snapshot, UI |
| Saldo materializado | `produtos.qtd`, sempre derivável do razão | Estoque | Importador direto |
| Consignado | movimentos + itens de maleta aberta | Estoque/Maletas | saldo total |
| Identidade do produto | SKU definitivo em `produtos` | Catálogo | nome/descrição |
| Identidade da variação | `variant_id` + estrutura local/espelho | Catálogo | texto inferido |
| Estrutura de kit | `kit_componentes` | Catálogo/Estoque | quantidade do kit |
| Catálogo externo | Nuvemshop para metadados/IDs; espelho local para observação | Nuvemshop/Catálogo | estoque físico externo |
| Fotos | R2 + metadados locais; URLs externas são fonte importável | Catálogo/Mídia | HTML do painel |
| Publicação preparada | `catalogo_publicacoes` | Catálogo | autorização de escrever na loja |
| Contagem física | sessão de inventário | Estoque/Inventário | ajuste automático |
| Divergência | sessão/itens de reconciliação | Reconciliação | comando implícito de correção |

## Invariantes congeladas

| ID | Invariante | Guardião atual | Prova/regressão |
|---|---|---|---|
| EST-01 | `produtos.qtd == SUM(movimentos.qtd)` | `api/src/estoque.js` | conferir estoque; testes de venda/importação/inventário |
| EST-02 | Toda mudança de saldo passa por `movimentar()` e preserva razão | Estoque e chamadores | `estoque/conferir`, suítes de domínio |
| EST-03 | Consignação e devolução têm efeito zero no total | Maletas + razão | `revendedoras`, `kits`, vendas Nuvemshop |
| EST-04 | Contar/concluir inventário não ajusta; ajustar é ato separado e idempotente por item | `inventario.js` | suítes de inventário/reconciliação |
| EST-05 | Saída/estorno cria contrapartida; histórico nunca é apagado | `saidas.js`, `estoque.js` | Pacotes 1–3 |
| CAT-01 | SKU é identidade; nome não é chave | `sku.js`, `produtos.js` | auditoria/gerador/edição |
| CAT-02 | Variação nunca é adivinhada; conflito falha fechado e usa `variant_id` | `variantes.js`, sync/vendas | variações, variantes fase 1, pendências |
| CAT-03 | Distribuição por variação fecha exatamente o saldo total | Estoque/variantes | testes de variações |
| CAT-04 | Kit tem `qtd=0`; disponibilidade deriva dos componentes; kit não contém kit | `estoque.js`, catálogo | `kits-test.mjs` |
| CAT-05 | Produto com histórico é arquivado; exclusão só sem dependências | `produtos.js` | editar peça/sku |
| CAT-06 | Publicação preparada/aprovada é interna e não escreve Nuvemshop | `publicacao-catalogo.js` | pacote 4 |
| SYNC-01 | Pull de pedidos antecede push de saldo absoluto | `sync.js` | sync/dry-run/corte |
| SYNC-02 | Pedido externo é idempotente por `vendas.externo_id` | vendas/sync/schema | vendas Nuvemshop |
| SYNC-03 | `seco`/análise não grava local nem externamente | sync, fotos, reconciliação | dry-run/saúde/reconciliação |
| REC-01 | Comparar e aprovar precedem aplicar; precondition obsoleta bloqueia | `reconciliacao.js` | reconciliação schema/apply |

## Matriz operacional completa

| Fluxo | Entrada | Escrita local | Efeito externo | Rotas | Consumidores | Testes característicos | Owner futuro |
|---|---|---|---|---|---|---|---|
| Consulta do estado | sem corpo | nenhuma | nenhum | `GET /state`, `/estoque/conferir`, movimentos | legado/React | API/e2e | read model transversal |
| Importar catálogo/saldo inicial | planilha normalizada | produtos + deltas no razão | nenhum | `/produtos/importar` | legado | catálogo/import-total | serviço de aplicação Catálogo→Estoque |
| Trocar Estoque Total | planilha | snapshot/deltas aprovados | nenhum | `/estoque-total/analisar|aplicar` | legado | trocar-planilha/estoque-total | Estoque |
| Cadastrar novos | planilha | produtos/categorias | nenhum | `/produtos/novos/analisar|cadastrar` | legado | produtos-novos | Catálogo |
| Espelhar loja | catálogo externo | `loja_snapshot`, IDs/metadados | leitura Nuvemshop | `/loja/importar`, `/loja/variantes/importar` | legado | sync/variantes | Nuvemshop adapter |
| Movimento manual | tipo, quantidade, observação, variação | razão + saldo materializado | nenhum | `/produtos/:sku/movimento` | legado | estoque/variações | Estoque |
| Editar/arquivar/excluir | ficha ou ação | produto/estado | nenhum | PATCH/DELETE/arquivar/desarquivar/dependências | legado | editar-peça | Catálogo |
| Gerar/auditar SKU | origem/amostra | reserva de SKU | nenhum | `/produtos/sku/*` | legado | sku gerador/auditoria | Catálogo |
| Estruturar variações | estrutura/distribuição | produto_variacoes + razão quando reparte | leitura externa no espelho | `/variacoes/*`, `/loja/variantes/*` | legado | variações/variantes | Catálogo + Estoque |
| Estruturar kit | componentes | `kit_componentes`; kit com saldo zero | nenhum | `/produtos/:sku/componentes` | legado | kits | Catálogo; disponibilidade em Estoque |
| Consignar/acertar/cancelar maleta | itens/devoluções/faltas | maleta + movimentos + eventual venda | sync de saldo | `/maletas/*` | legado/React | revendedoras/kits/vendas NS | Maletas orquestra; Estoque/Vendas executam |
| Vender/cancelar/corrigir | cliente/itens/pagamento | venda + itens + razão + auditoria | sync de saldo | `/vendas*` | legado | pacote-vendas/desconto/sync | Vendas orquestra; Estoque movimenta |
| Inventariar | contagens | sessão/itens; só ajuste cria movimento | nenhum | `/inventarios*` | legado | inventário/reconciliação | Estoque/Inventário |
| Reconciliar | fonte/sessão/aprovações | sessões/itens; apply cria mudanças rastreáveis | leitura e apply aprovado quando origem externa | `/reconciliacao*` | legado/React | reconciliação | Reconciliação orquestra owners |
| Importar/vincular fotos | seco/refazer/bytes | metadados | leitura Nuvemshop, R2 e processador | `/fotos*`, `/produtos/:sku/foto*` | legado | fotos/fundo/modal | Catálogo/Mídia |
| Preparar publicação | rascunho/aprovação | `catalogo_publicacoes` | preparador; nunca loja | `/catalogo/publicacao*` | legado/agente | pacote 4 | Catálogo/Publicação |
| Sincronizar | forçar/seco | execuções, pedidos, vendas, razão, snapshot | pull/push Nuvemshop com freios | `/sync*`, scheduled | legado/React/cron | sync/dry-run/corte/saúde | Nuvemshop orquestra owners |
| Saída sem faturamento | tipo/itens | saída + razão | nenhum imediato | `/saidas*` | legado | pacote 1–3 | Estoque + registro Saídas |

## Tabelas e ownership

| Owner | Tabelas primárias | Acesso legítimo de outros domínios |
|---|---|---|
| Estoque | `movimentos`; saldo em `produtos`; `inventarios`, `inventario_itens` | Vendas/Maletas/Saídas solicitam movimentos; Analytics lê |
| Catálogo | `produtos` (identidade/ficha), `categorias`, `sku_reservas`, `produtos_pendentes` | Estoque materializa saldo; Vendas lê preço/identidade |
| Variações/Kits | `produto_variacoes`, `kit_componentes` | Estoque calcula disponibilidade; sync/vendas resolvem IDs |
| Nuvemshop adapter | `loja_snapshot`, `loja_variantes`, `sync_execucoes` | Catálogo/reconciliação leem espelho |
| Mídia/Publicação | `loja_fotos`, `fotos_orfas`, `catalogo_publicacoes` + R2 | painéis leem URLs/estado |
| Reconciliação | `reconciliacao_sessoes`, `reconciliacao_itens` | owners recebem comandos aprovados |
| Maletas | `maletas`, `maleta_itens`, `maleta_item_variacoes` | Estoque calcula disponível; Vendas cria acerto |

`produtos` é a tensão arquitetural central: Catálogo possui identidade e ficha, enquanto Estoque possui seu saldo materializado. O strangler deve separar comandos e contratos antes de separar persistência; criar duas cópias da tabela agora quebraria a invariante.

## Fronteiras de extração

1. Introduzir contratos internos de Estoque (`consultarSaldo`, `movimentar`, `distribuir`, `calcularDisponivel`) mantendo as tabelas atuais.
2. Encapsular Catálogo (`produtoPorSku`, ficha, SKU, variações, kits) sem trocar rotas ou payloads.
3. Fazer Vendas, Maletas, Inventário, Saídas e Sync chamarem esses contratos em vez de SQL/estado compartilhado.
4. Migrar handlers um grupo por vez, com caracterização HTTP e paridade de razão.
5. Só considerar alteração de schema depois que ownership estiver comprovado por chamadas e testes.

Não pertencem à Fase 0: mover handler, alterar schema, habilitar personalização, mudar cron, escrever Nuvemshop ou refatorar o dashboard.
