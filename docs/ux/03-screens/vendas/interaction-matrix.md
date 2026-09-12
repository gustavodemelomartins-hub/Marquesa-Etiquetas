# Matriz de interações — Vendas

| | |
|---|---|
| Task ID | `VEN-001` |
| Data do checkpoint | 11/09/2026 |
| Status | **UX/UI EM REFINAMENTO — design principal avançado, interações pendentes** |
| Protótipo | [master.html](master.html) |

Esta matriz separa o que precisa funcionar dentro do protótipo do que depende
de uma tela futura. Os dados e as mudanças de período são ilustrativos; não há
API, React, DEV ou produção envolvidos.

Tipos: `LOCAL` altera somente a tela atual; `NAVEGAÇÃO` muda para uma superfície
já representada; `MODAL` abre uma camada da própria experiência; `FUTURA TELA`
registra um destino sem obrigar sua criação nesta rodada.

## App Shell e navegação

| Elemento | Localização | Ação esperada | Tipo | Destino | Estado atual | Funcional no protótipo? | Depende de outra tela? | Observação |
|---|---|---|---|---|---|---|---|---|
| Logo Marquesa | cabeçalho | voltar ao início da área | NAVEGAÇÃO | Painel de Vendas | link visual com `#painel` | Parcial | Não | precisa ativar a superfície Painel quando outra estiver aberta |
| Estoque | menu principal | abrir Estoque | FUTURA TELA | Estoque V2 | somente visual | Não | Sim | não inventar o destino dentro de Vendas |
| Revendedoras | menu principal | abrir Revendedoras | FUTURA TELA | Revendedoras V2 | somente visual | Não | Sim | contrato de rota ainda futuro |
| Vendas | menu principal | indicar área atual | LOCAL | Vendas | ativo | Sim | Não | estado visual consolidado |
| Etiquetas | menu principal | abrir Etiquetas | FUTURA TELA | Etiquetas V2 | somente visual | Não | Sim | não faz parte desta rodada |
| Sino | ferramentas do cabeçalho | abrir notificações | FUTURA TELA | Central de notificações | somente visual | Não | Sim | destino ainda não especificado |
| Perfil | ferramentas do cabeçalho | abrir/fechar menu | LOCAL | menu de perfil | implementado | Sim | Não | mantém `aria-expanded` |
| Meu perfil / Preferências / Sair | menu de perfil | executar a ação correspondente | FUTURA TELA | conta e sessão | somente visual | Não | Sim | permissões e rotas fora do escopo |
| Lançamentos | submenu | abrir novo lançamento | NAVEGAÇÃO | superfície Lançamentos do protótipo | implementado | Sim | Não | troca local de superfície |
| Painel | submenu | abrir painel analítico | NAVEGAÇÃO | superfície Painel do protótipo | implementado | Sim | Não | referência principal atual |
| Clientes | submenu | abrir lista contextual | NAVEGAÇÃO | superfície Clientes do protótipo | implementado | Sim | Parcial | a tela completa de Clientes ainda não foi desenhada |

## Painel e análise

| Elemento | Localização | Ação esperada | Tipo | Destino | Estado atual | Funcional no protótipo? | Depende de outra tela? | Observação |
|---|---|---|---|---|---|---|---|---|
| Tudo / 12 meses / 90 dias / 30 dias | topo do Painel | aplicar período em todos os indicadores e listas | LOCAL | próprio Painel | simulação implementada | Sim | Não | atualiza cartões, gráfico, duas análises e paginação |
| Calendário | topo do Painel | abrir seletor de datas exatas | MODAL | popover de intervalo | implementado | Sim | Não | valida início e fim; dados são ilustrativos |
| Aplicar período / Cancelar | seletor de datas | aplicar ou abandonar o intervalo | LOCAL | próprio Painel | implementado | Sim | Não | falta estado de carregamento da futura consulta |
| Barra do gráfico | Desempenho de vendas | selecionar o recorte e sincronizar o conteúdo inferior | LOCAL | Informações do período | implementado | Sim | Não | atualiza Análise detalhada e Evolução por mês |
| Análise detalhada / Evolução por mês | Informações do período | alternar a apresentação da mesma seleção | LOCAL | painel analítico correspondente | implementado | Sim | Não | não cria recortes independentes |
| Ver lista completa | Produtos mais vendidos | expandir/recolher ranking | LOCAL | própria tabela | implementado | Sim | Não | mostra 5 ou 10 linhas ilustrativas |
| Paginação 1–3 e setas | Vendas do período | trocar página da seleção | LOCAL | própria tabela | implementado | Sim | Não | mostra até 10 vendas por página; dados amostrais, não consulta API |
| Linha de venda / seta | Vendas do período | expandir detalhes compactos abaixo da linha | LOCAL | detalhe inline | implementado | Sim | Não | funciona por clique, Enter e Espaço; várias vendas podem permanecer abertas e cada uma recolhe independentemente |
| Nome da cliente | linha da venda | abrir o contexto da cliente | NAVEGAÇÃO | Clientes | simulação contextual | Parcial | Sim | destino final da cliente ainda precisa ser desenhado |
| Pendente | detalhe inline | abrir recebíveis da cliente | FUTURA TELA | Clientes / Recebimentos | simulação contextual | Parcial | Sim | destino oficial ainda não desenhado |
| Ver recebimentos | cartão A receber | abrir recebíveis do período | FUTURA TELA | Clientes / Recebimentos | simulação contextual | Parcial | Sim | não contar a simulação como tela concluída |
| Reparos: 21 ativos | alerta | abrir Reparos | FUTURA TELA | Reparos | simulação provisória | Parcial | Sim | Reparos tem material vazio e zero mockups; não está desenhada |

## Lançamentos, Clientes e saídas

| Elemento | Localização | Ação esperada | Tipo | Destino | Estado atual | Funcional no protótipo? | Depende de outra tela? | Observação |
|---|---|---|---|---|---|---|---|---|
| Limpar rascunho | cabeçalho de Lançamentos | confirmar e limpar dados preenchidos | MODAL | confirmação local | somente visual | Não | Não | precisa definir preservação e descarte |
| Venda normal | tipo de lançamento | mostrar formulário de venda normal | LOCAL | formulário de venda | visualmente selecionado | Parcial | Não | não há alternância completa de formulário |
| Monte seu Colar | tipo de lançamento | mostrar composição personalizada | LOCAL | fluxo Monte seu Colar | somente visual | Não | Não | base é fixa; demais decisões continuam abertas |
| Saída sem faturamento | tipo de lançamento | abrir fluxo não comercial | NAVEGAÇÃO | superfície Saídas | implementado | Sim | Não | fica dentro de Lançamentos, não como aba do submenu |
| Adicionar item / busca de item | itens da venda | localizar e incluir SKU disponível | MODAL | seletor de produto | somente visual | Não | Não | depende de estados de estoque e indisponibilidade |
| Editar preço final | linha do item | aplicar preço por peça e motivo | MODAL | editor ancorado | especificado, não simulado | Não | Não | ver componente `item-price-editor` |
| Nova cliente / remover cliente | dados da venda | cadastrar ou retirar cliente do rascunho | MODAL | cadastro rápido de cliente | somente visual | Não | Parcial | cadastro completo de Clientes é futuro |
| Data, canal e observação | dados da venda | editar metadados da operação | LOCAL | rascunho | controles parciais | Parcial | Não | data está somente leitura e canal tem uma opção |
| Mais opções / adicionar pagamento | Pagamento | detalhar ou criar lançamento | LOCAL | compositor de pagamentos | somente visual | Não | Não | especificação existe; simulação ainda falta |
| Parcelar | Pagamento | configurar parcelas e vencimentos | MODAL | configuração de parcelas | somente visual | Não | Não | estados e validações ainda pendentes |
| Finalizar venda | rodapé de Pagamento | validar e confirmar venda uma vez | MODAL | confirmação / sucesso | somente visual | Não | Não | não salvar nem integrar nesta etapa |
| Buscar / Nova cliente | superfície Clientes | filtrar ou cadastrar cliente | LOCAL / MODAL | lista ou cadastro | somente visual | Não | Sim | superfície é apenas contexto auxiliar atual |
| Ver todas as clientes | contexto de recebíveis | voltar à lista geral | LOCAL | superfície Clientes | implementado | Sim | Não | desfaz o recorte contextual |
| Novo reparo / busca / linha | superfície provisória Reparos | criar, filtrar ou abrir reparo | FUTURA TELA | Reparos | somente visual | Não | Sim | superfície não é design oficial de Reparos |
| Registrar saída | superfície Saídas | abrir formulário não comercial | MODAL | formulário de saída | somente visual | Não | Não | motivos e campos condicionais ainda pendentes |
| Exportar saídas | histórico de Saídas | baixar o conjunto filtrado | LOCAL | arquivo de exportação | somente visual | Não | Não | formato, permissão e escopo precisam ser definidos |
| Linha de saída | histórico de Saídas | abrir detalhe auditável | LOCAL | detalhe da saída | somente visual | Não | Não | correção/estorno ainda dependem de regra |

## O que falta para `UX/UI DESIGNED`

- [ ] revisar com Gustavo esta matriz e confirmar a ação de cada controle;
- [ ] concluir as interações locais de lançamento, itens, cliente, pagamento e
  saída sem faturamento;
- [ ] especificar confirmações, sucesso, vazio, carregamento, erro e recuperação
  nas superfícies principais;
- [ ] validar header e submenu em tablet/mobile (`DP-001` e `DP-002`);
- [ ] fechar as decisões de produto que alteram campos, fórmulas, taxonomia ou
  permissões;
- [ ] validar teclado, foco, contraste, redução de movimento e tabelas em tela
  estreita;
- [ ] marcar explicitamente os destinos futuros sem confundi-los com telas
  desenhadas;
- [ ] revisar o checklist de aceite do [handoff](handoff.md).
