# Matriz Protótipo → V2

> **Gerado.** A fonte é [`frontend/src/testing/paridade.ts`](../../../frontend/src/testing/paridade.ts), e
> `paridade.test.ts` confere cada linha contra o arquivo que ela cita.
> Editar este `.md` à mão não muda nada: rode
> `node scripts/build-paridade.mjs`.

A régua é **capacidade**, não rota. Uma matriz de rotas daria 13 de 13
com Vendas sendo uma tabela — a rota existe, e o Painel, os Lançamentos,
o Monte seu Colar e a Saída não. O que a usuária reconhece é o que ela
consegue fazer.

## Placar

| | capacidades |
|---|---|
| 🟢 pronta | 93 |
| 🟡 parcial | 2 |
| ⚪ pendente — o backend tem, a tela não | 8 |
| ⛔ indisponível — o backend não sustenta | 12 |
| **total** | **115** |

**93 de 103** capacidades que o backend sustenta já estão
na V2. As `⛔ indisponível` não contam contra o frontend: entregá-las
exigiria simular algo que o servidor não faz, e a tela diz isso em vez de
fingir.

## Vendas

Autoridade de UX: `/prototype/vendas/` · 🟢 28 · 🟡 0 · ⚪ 1 · ⛔ 4

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Painel de vendas | 🟢 pronta | `#/vendas` | — |
| Filtro de período e intervalo livre | 🟢 pronta | `features/vendas/PainelVendas.tsx` | — |
| Faturamento do período | 🟢 pronta | `features/vendas/PainelVendas.tsx` | — |
| Neste mês | 🟢 pronta | `features/vendas/PainelVendas.tsx` | — |
| A receber no mês | 🟢 pronta | `features/vendas/PainelVendas.tsx` | — |
| Alerta de reparos ativos | 🟢 pronta | `features/vendas/PainelVendas.tsx` | — |
| Evolução por mês, clicável | 🟢 pronta | `features/vendas/PainelVendas.tsx` | — |
| Análise detalhada: produtos, categorias, origem | 🟢 pronta | `features/vendas/PainelVendas.tsx` | — |
| Resumo do mês selecionado | 🟢 pronta | `features/vendas/PainelVendas.tsx` | — |
| Variação contra o período anterior | ⛔ indisponível | `features/vendas/PainelVendas.tsx` | §19 — `analytics.js › painel()` não calcula o período anterior, e recusa explicitamente inventar um percentual. A tela diz isso no rodapé do cartão de faturamento em vez de desenhar uma seta. |
| Lançamentos: as três portas | 🟢 pronta | `#/vendas/lancamentos` | — |
| Venda normal | 🟢 pronta | `#/vendas/nova` | — |
| Itens → Cliente → Pagamento, em passos | 🟢 pronta | `features/vendas/NovaVenda.tsx` | — |
| Busca de produto por nome e SKU | 🟢 pronta | `features/vendas/NovaVenda.tsx` | — |
| Leitura da etiqueta pela câmera | ⚪ pendente | — | O protótipo abre a câmera traseira para ler o código. Não há decodificador de código de barras no bundle da V2, e o campo de busca já aceita o código bipado por leitor físico — que é como a operação funciona hoje. |
| Preço cobrado e motivo do desconto | 🟢 pronta | `features/vendas/NovaVenda.tsx` | — |
| Busca de cliente na venda | 🟢 pronta | `features/vendas/NovaVenda.tsx` | — |
| Cadastro rápido de cliente | 🟢 pronta | `features/vendas/NovaVenda.tsx` | — |
| Data da venda, separada | 🟢 pronta | `features/vendas/NovaVenda.tsx` | — |
| Data efetiva do pagamento, separada | 🟢 pronta | `features/vendas/NovaVenda.tsx` | — |
| Venda ≠ pagamento ≠ registro, na revisão | 🟢 pronta | `features/vendas/NovaVenda.tsx` | — |
| Local ou canal da venda | ⛔ indisponível | `features/vendas/NovaVenda.tsx` | `INSERT INTO vendas` em `vendas-comandos.js` grava `origem = 'balcao'` fixo, e `registrarVenda` não aceita canal nem origem. O canal que aparece no histórico vem da planilha importada. A tela diz isso no passo do cliente. |
| Vários recebimentos numa venda | ⛔ indisponível | `features/vendas/NovaVenda.tsx` | §29 — a quitação é INTEGRAL: `POST /api/vendas/:id/pagamento` quita a venda inteira. Recebimento em partes é a decisão D2, que continua fechada. A tela mostra um recebimento e explica a limitação. |
| Revisão antes de confirmar | 🟢 pronta | `features/vendas/NovaVenda.tsx` | — |
| Monte seu Colar | 🟢 pronta | `#/vendas/colar` | — |
| Composição por grupo, com corrente fixa | 🟢 pronta | `features/vendas/MonteSeuColar.tsx` | — |
| Colar bloqueado quando a feature está desligada | 🟢 pronta | `features/vendas/colar.ts` | — |
| Preço final editável no colar | ⛔ indisponível | `features/vendas/MonteSeuColar.tsx` | O servidor recusa: `prepararPersonalizacoes` compara o preço pedido com o da configuração e devolve 409 com o valor certo na mensagem. Um campo que sempre volta recusado é pior que campo nenhum, então ele não existe — e a tela diz por quê. |
| Saída sem faturamento, dentro de Lançamentos | 🟢 pronta | `#/vendas/saida` | — |
| Histórico de vendas | 🟢 pronta | `#/vendas/historico` | — |
| Abrir os itens de uma venda | 🟢 pronta | `features/vendas/HistoricoVendas.tsx` | — |
| Marcar recebida com a data efetiva | 🟢 pronta | `features/vendas/HistoricoVendas.tsx` | — |
| Cancelar venda, devolvendo a peça | 🟢 pronta | `features/vendas/HistoricoVendas.tsx` | — |

## Clientes

Autoridade de UX: `/prototype/clientes/` · 🟢 10 · 🟡 0 · ⚪ 0 · ⛔ 0

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Lista com busca no servidor | 🟢 pronta | `#/clientes` | — |
| Cadastro e edição | 🟢 pronta | `features/clientes/FormCliente.tsx` | — |
| Ficha da cliente | 🟢 pronta | `#/clientes/<id>` | — |
| Comprou · Pago · Em aberto | 🟢 pronta | `features/clientes/PerfilCliente.tsx` | — |
| Três datas, três significados | 🟢 pronta | `features/clientes/PerfilCliente.tsx` | — |
| O que falta receber | 🟢 pronta | `features/clientes/PerfilCliente.tsx` | — |
| Saldo e extrato de crédito | 🟢 pronta | `features/clientes/PerfilCliente.tsx` | — |
| Garantias, trocas e reparos da cliente | 🟢 pronta | `features/clientes/PerfilCliente.tsx` | — |
| Linha do tempo de tudo o que aconteceu | 🟢 pronta | `features/clientes/PerfilCliente.tsx` | — |
| Nova venda para esta cliente | 🟢 pronta | `app/App.tsx` | — |

## Financeiro

Autoridade de UX: `/prototype/financeiro/` · 🟢 8 · 🟡 0 · ⚪ 0 · ⛔ 1

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Resumo do período | 🟢 pronta | `#/financeiro` | — |
| Período e intervalo livre, no endereço | 🟢 pronta | `features/financeiro/FinanceiroArea.tsx` | — |
| A receber, com vencimento | 🟢 pronta | `features/financeiro/AReceber.tsx` | — |
| Receber com a data efetiva | 🟢 pronta | `features/financeiro/api.ts` | — |
| Definir vencimento | 🟢 pronta | `features/financeiro/api.ts` | — |
| Desfazer pagamento, com motivo | 🟢 pronta | `features/financeiro/api.ts` | — |
| Saiu sem faturar | 🟢 pronta | `features/financeiro/FinanceiroArea.tsx` | — |
| Conferência da razão do dinheiro | 🟢 pronta | `features/financeiro/api.ts` | — |
| Recebimento parcial de uma conta | ⛔ indisponível | `features/financeiro/api.ts` | O backend quita a conta INTEIRA (`marcarContaPaga`). Parcial é a decisão D2, ainda fechada. Está dito no próprio adaptador. |

## Estoque

Autoridade de UX: `/prototype/estoque/` · 🟢 7 · 🟡 0 · ⚪ 0 · ⛔ 2

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Painel do estoque | 🟢 pronta | `#/estoque` | — |
| Total · em casa · com revendedoras | 🟢 pronta | `features/estoque-total/PainelEstoque.tsx` | — |
| Por categoria | 🟢 pronta | `features/estoque-total/PainelEstoque.tsx` | — |
| Peças, com filtro | 🟢 pronta | `#/estoque/pecas` | — |
| A razão de uma peça, movimento a movimento | 🟢 pronta | `features/estoque/PecasArea.tsx` | — |
| Atualizar Estoque Total por planilha, com diff | 🟢 pronta | `features/estoque-total/EstoqueTotalPage.tsx` | — |
| Saiu sem faturar | 🟢 pronta | `#/estoque/saidas` | — |
| Custo e margem da peça | ⛔ indisponível | — | D6 — não há coluna de custo em `produtos`, e nenhuma rota devolve uma. Um valor de estoque calculado sobre preço de VENDA não é patrimônio, e chamá-lo assim seria inventar um número de balanço. |
| Indicador de saúde do estoque | ⛔ indisponível | — | D8 — "saúde" exigiria giro, cobertura e ponto de reposição, e nenhum dos três é calculado pelo servidor. Um semáforo verde sem conta atrás é pior que semáforo nenhum. |

## Inventário

Autoridade de UX: `/prototype/estoque/#inventario` · 🟢 8 · 🟡 0 · ⚪ 0 · ⛔ 0

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Abrir contagem | 🟢 pronta | `#/estoque/inventario` | — |
| Contar peça a peça | 🟢 pronta | `features/inventario/InventarioArea.tsx` | — |
| Desfazer contagem — voltar a não contado | 🟢 pronta | `features/inventario/InventarioArea.tsx` | — |
| Pausar e continuar | 🟢 pronta | `features/inventario/InventarioArea.tsx` | — |
| Concluir e congelar o retrato | 🟢 pronta | `features/inventario/InventarioArea.tsx` | — |
| Aplicar os ajustes escolhidos | 🟢 pronta | `features/inventario/resultado.ts` | — |
| Zero explícito ≠ não contado | 🟢 pronta | `features/inventario/resultado.ts` | — |
| Histórico de contagens | 🟢 pronta | `features/inventario/InventarioArea.tsx` | — |

## Catálogo

Autoridade de UX: `/prototype/catalogo/` · 🟢 2 · 🟡 0 · ⚪ 4 · ⛔ 0

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Produtos com busca e filtro | 🟢 pronta | `#/catalogo` | — |
| Editar nome, preço, categoria e situação | 🟢 pronta | `features/catalogo/CatalogoArea.tsx` | — |
| Galeria de fotos da peça | ⚪ pendente | — | `GET/POST /api/produtos/:sku/galeria`, ordem, principal e aprovação existem no Worker inteiros. A tela da V2 ainda não os consome — é o maior buraco do módulo. |
| Variações da peça | ⚪ pendente | — | `PUT /api/produtos/:sku/variacoes` e `GET /api/variacoes/revisao` existem. A V2 ainda não tem a tela. |
| Preparar → revisar → aprovar | ⚪ pendente | — | `/api/catalogo/publicacao/:sku/{preparar,previa,aprovar,reabrir}` existem. A V2 ainda não tem a fila. |
| Operações em lote | ⚪ pendente | — | `POST /api/fotos/lotes` e `POST /api/catalogo/publicacao/rodada` existem. A tela ainda não. |

## Revendedoras e maletas

Autoridade de UX: `/prototype/revendedoras/` · 🟢 7 · 🟡 1 · ⚪ 0 · ⛔ 0

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Visão geral | 🟢 pronta | `#/revendedoras` | — |
| Ficha da revendedora | 🟢 pronta | `#/revendedoras/<id>` | — |
| A ficha sobrevive a recarregar e ao voltar | 🟢 pronta | `app/App.tsx` | — |
| Cadastrar revendedora | 🟢 pronta | `features/revendedoras/NovaRevendedora.tsx` | — |
| Montar maleta | 🟢 pronta | `features/maletas/CriarMaletaFluxo.tsx` | — |
| Sugestão de peças para a maleta | 🟢 pronta | `features/maletas/SugestoesDrawer.tsx` | — |
| Capacidade e planejamento | 🟢 pronta | `features/maletas/CapacidadeMaletas.tsx` | — |
| Acerto da maleta | 🟡 parcial | `features/maletas/api.ts` | `POST /api/maletas/:id/acerto` está no adaptador e o cálculo de comissão é do servidor. Falta a tela de conferência item a item que o protótipo desenha — hoje o acerto é fechado pelo painel clássico. |

## Garantias, reparos e trocas

Autoridade de UX: `/prototype/garantias/` · 🟢 3 · 🟡 0 · ⚪ 3 · ⛔ 0

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Casos, com filtro por status | 🟢 pronta | `#/garantias` | — |
| Abrir garantia | ⚪ pendente | — | `POST /api/garantias` existe no Worker e a V2 nao o chama: ela LE os casos e muda o status deles, mas um caso novo so nasce hoje pelo painel classico. E o buraco mais caro do modulo, porque e o comeco do fluxo inteiro. |
| Mudar status, com observação | 🟢 pronta | `features/garantias/GarantiasArea.tsx` | — |
| Prazo em dias úteis | 🟢 pronta | `features/garantias/GarantiasArea.tsx` | — |
| Troca, diferença e estorno | ⚪ pendente | — | `POST /api/garantias/:id/troca`, `/troca/pagar` e `/troca/estornar` existem (Fase 5.4). A V2 mostra o caso e muda status, mas ainda não registra a troca. |
| Vínculo com o item da venda | ⚪ pendente | — | `GET /api/garantias/vinculos` devolve o `venda_item_id`. A tela ainda não o usa para amarrar o caso à peça vendida. |

## Nuvemshop

Autoridade de UX: `/prototype/nuvemshop/` · 🟢 4 · 🟡 0 · ⚪ 0 · ⛔ 1

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Visão geral da loja | 🟢 pronta | `#/nuvemshop` | — |
| Pendências | 🟢 pronta | `features/nuvemshop/PendenciasList.tsx` | — |
| Análise da sincronização e divergências | 🟢 pronta | `features/nuvemshop/NuvemshopPage.tsx` | — |
| Saúde da conexão e das falhas | 🟢 pronta | `features/nuvemshop/saude.ts` | — |
| Publicar na loja real | ⛔ indisponível | — | ESCRITA NA LOJA REAL CONTINUA PROIBIDA nesta trilha. `POST /api/catalogo/publicacao/:sku/publicar` existe e NÃO é chamado pela V2. A análise usa `POST /api/sync {"seco": true}`, que lê tudo e não escreve. |

## Home

Autoridade de UX: `/prototype/` · 🟢 5 · 🟡 0 · ⚪ 0 · ⛔ 0

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Precisa da sua atenção | 🟢 pronta | `#/home` | — |
| Entrou por mês | 🟢 pronta | `features/home/HomeArea.tsx` | — |
| Quem mais trouxe | 🟢 pronta | `features/home/HomeArea.tsx` | — |
| Peças em reparo | 🟢 pronta | `features/home/HomeArea.tsx` | — |
| Atalhos do dia | 🟢 pronta | `features/home/HomeArea.tsx` | — |

## Etiquetas

Autoridade de UX: `/prototype/etiquetas/` · 🟢 0 · 🟡 0 · ⚪ 0 · ⛔ 1

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Preparar, imprimir e reimprimir | ⛔ indisponível | — | NÃO EXISTE ROTA DE ETIQUETAS no Worker — nenhuma, em nenhum dos 17 módulos de rota. A operação de hoje é local: folha Pimaco 7×18, calibração de 0,5 mm e a chave `marquesa_etiquetas_v1` no localStorage do painel clássico. Construir a tela na V2 sem backend faria a fila de impressão viver num navegador e sumir no outro. |

## Agenda e notificações

Autoridade de UX: `/prototype/agenda/` · 🟢 0 · 🟡 0 · ⚪ 0 · ⛔ 2

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| O que vence, acerta ou fecha | ⛔ indisponível | `app/AreaPendente.tsx` | Não há rota de agenda nem de notificação no Worker. Os prazos que existem — vencimento de conta, prazo de garantia, acerto de maleta — moram cada um no módulo dele, e juntá-los numa agenda é uma view que ainda não foi escrita no servidor. |
| O que o sistema precisa me contar | ⛔ indisponível | `app/AreaPendente.tsx` | Idem: não há rota de notificação no Worker, e nada no schema guarda "lida" ou "descartada". A tela existe no trilho, marcada, e diz "em desenvolvimento" em vez de desenhar caixas vazias com números falsos — fingir persistência aqui perderia o que alguém marcasse. |

## Configurações

Autoridade de UX: `/prototype/configuracoes/` · 🟢 3 · 🟡 0 · ⚪ 0 · ⛔ 1

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Parâmetros da operação | 🟢 pronta | `#/configuracoes` | — |
| Faixas de comissão | 🟢 pronta | `features/configuracoes/ConfiguracoesArea.tsx` | — |
| Corte do go-live | 🟢 pronta | `features/configuracoes/ConfiguracoesArea.tsx` | — |
| Perfis e permissões | ⛔ indisponível | `features/configuracoes/ConfiguracoesArea.tsx` | Não há usuários no sistema: a autenticação é UMA chave Bearer compartilhada (`auth.js › checarChave`). Perfil por pessoa exigiria tabela de usuários e sessão, que não existem. A tela diz isso. |

## Casco, marca e navegação

Autoridade de UX: `/prototype/design-system/` · 🟢 8 · 🟡 1 · ⚪ 0 · ⛔ 0

| Capacidade | Estado | Onde | Observação |
|---|---|---|---|
| Um AppShell, nenhuma tela com cabeçalho próprio | 🟢 pronta | `app/AppShell.tsx` | — |
| Logo oficial, de um asset só | 🟢 pronta | `components/LogoMarquesa.tsx` | — |
| Os mesmos tokens do protótipo | 🟢 pronta | `styles/marquesa.css` | — |
| Cormorant e Jost | 🟢 pronta | `styles/fonts.css` | — |
| Números tabulares | 🟢 pronta | `styles/marquesa.css` | — |
| Os treze módulos, em quatro grupos | 🟢 pronta | `app/modulos.ts` | — |
| Deep-link, reload e voltar/avançar | 🟢 pronta | `app/rota.ts` | — |
| Gaveta e barra inferior no telefone | 🟢 pronta | `styles/shell.css` | — |
| Busca global que não sai da V2 | 🟡 parcial | `app/BuscaGlobal.tsx` | Cliente, venda, peça e revendedora entram, todas por contrato existente. Garantia, maleta, inventário e conta a receber NÃO têm rota de busca por termo no servidor, e a lista diz isso em vez de deixar alguém procurar em silêncio. |

