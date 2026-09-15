# Cobertura do protótipo — Sistema Marquesa V2

Estado reconstruído em **15/09/2026** a partir de `docs/ux/`, inventário
legado/React, fluxos, backlog, Master Plan, regras e handoffs. Esta matriz mede
o protótipo navegável de UX/UI; não confunde mockup com implementação React ou
integração real.

## Estados usados

- `NOT STARTED`
- `IN PROGRESS`
- `READY FOR REVIEW`
- `READY FOR GUSTAVO REVIEW`
- `APPROVED` — somente quando existe aprovação humana registrada
- `BLOCKED`
- `UI NEEDS API` — necessidade registrada, sem atribuir backend à trilha de UX

## Matriz de cobertura

| Área / superfície | Requirements | UX structure | Desktop | Mobile | Interactions | Flow | Human approval | Backend contract | Implementation |
|---|---|---|---|---|---|---|---|---|---|
| Hub / navegação mestre | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | não se aplica | protótipo |
| Home / Dashboard geral | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | legado em produção |
| Vendas · Painel | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | UI NEEDS API | legado em produção |
| Vendas · Nova venda | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | UI NEEDS API | legado em produção |
| Vendas · Monte seu Colar | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | UI NEEDS API | legado parcial; desligado |
| Vendas · Saída sem faturamento | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | UI NEEDS API | legado em produção |
| Vendas · Histórico completo | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | IN PROGRESS | IN PROGRESS | READY FOR GUSTAVO REVIEW | UI NEEDS API | legado em produção |
| Clientes · Lista / CRM | IN PROGRESS | IN PROGRESS | IN PROGRESS | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | existente | legado em produção |
| Clientes · Perfil | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | existente | legado em produção |
| Clientes · Cadastro rápido | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | IN PROGRESS | READY FOR GUSTAVO REVIEW | UI NEEDS API | protótipo em Vendas |
| Financeiro · A receber | IN PROGRESS | IN PROGRESS | IN PROGRESS | IN PROGRESS | NOT STARTED | IN PROGRESS | NOT STARTED | UI NEEDS API | legado em produção |
| Financeiro · Registrar/corrigir recebimento | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | UI NEEDS API | legado em produção |
| Garantias / Reparos / Trocas · Lista | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | BLOCKED | legado parcial / domínio novo |
| Garantias / Reparos / Trocas · Caso e eventos | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | UI NEEDS API | legado parcial |
| Estoque · Visão geral | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | IN PROGRESS | React parcial |
| Estoque · Todos os produtos | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | existente parcial | legado em produção |
| Inventário · Sem sessão / iniciar | APPROVED | APPROVED | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | existente | legado em produção |
| Inventário · Contar / pausar / retomar | APPROVED | APPROVED | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | existente | legado em produção |
| Inventário · Escolha de variação | APPROVED | APPROVED | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | existente | legado em produção |
| Inventário · Revisão de divergências | APPROVED | APPROVED | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | existente | legado em produção |
| Inventário · Histórico / detalhe | APPROVED | APPROVED | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | READY FOR GUSTAVO REVIEW | existente | legado em produção |
| Cadastro / edição de produto | READY FOR REVIEW | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | UI NEEDS API | legado em produção |
| Catálogo · Central e categorias | READY FOR REVIEW | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | contrato técnico pronto | legado em produção |
| Catálogo · Galeria / fotos em lote | READY FOR REVIEW | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | contrato técnico pronto | legado em produção |
| Catálogo · Preparar / revisar conteúdo | READY FOR REVIEW | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | contrato técnico pronto | legado em produção |
| Catálogo · Publicar / despublicar | READY FOR REVIEW | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | contrato técnico pronto | legado em produção |
| Catálogo · Divergências com Nuvemshop | READY FOR REVIEW | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | contrato técnico pronto | React parcial |
| Revendedoras · Visão geral / lista | IN PROGRESS | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | existente | React parcial |
| Revendedoras · Perfil / editar / arquivar | IN PROGRESS | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | existente | React parcial |
| Maletas · Sugestão / criar / adicionar | IN PROGRESS | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | existente | React parcial |
| Maletas · Importar / acertar / cancelar | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | existente | legado em produção |
| Etiquetas · Preparar | APPROVED | APPROVED | NOT STARTED | NOT STARTED | NOT STARTED | READY FOR REVIEW | APPROVED | UI NEEDS API | legado em produção |
| Etiquetas · Revisar / imprimir / PDF | APPROVED | APPROVED | NOT STARTED | NOT STARTED | NOT STARTED | READY FOR REVIEW | APPROVED | UI NEEDS API | legado em produção |
| Etiquetas · Histórico / reimpressão | APPROVED | APPROVED | NOT STARTED | NOT STARTED | NOT STARTED | READY FOR REVIEW | APPROVED | UI NEEDS API | legado em produção |
| Nuvemshop · Panorama / saúde | IN PROGRESS | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | existente | React parcial |
| Pendências / Reconciliação | IN PROGRESS | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | existente | React parcial |
| Notificações | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | UI NEEDS API | NOT STARTED |
| Perfil | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | UI NEEDS API | shell parcial |
| Configurações / conexão | IN PROGRESS | IN PROGRESS | NOT STARTED | NOT STARTED | NOT STARTED | IN PROGRESS | NOT STARTED | existente parcial | React parcial |

## Modais, drawers e estados conhecidos

| Família | Elementos conhecidos |
|---|---|
| Vendas | editor de preço, escolha de variação, cadastro rápido de cliente, revisão da venda, sucesso, revisão/estorno de saída, custo histórico |
| Inventário | iniciar, confirmar contagem zero, escolha de variação, não sei a variação, finalizar, revisar/aplicar divergências |
| Produtos / Catálogo | novo/editar produto, galeria, upload em lote, casamento de fotos, aprovação, pedido de ajuste, ensaio de publicação |
| Revendedoras / Maletas | nova revendedora, sugestões, criação, adicionar itens, importar Anexo I, acerto, cancelamento |
| Etiquetas | configurar folha, calibrar alinhamento, revisar impressão, baixar PDF, reimprimir lote |
| Financeiro | registrar recebimento, corrigir/estornar, resolver resposta incerta |

## Decisões que permanecem humanas

- métricas exatas do Dashboard geral;
- fórmula de Saúde e valor econômico do Estoque;
- permissões para inventário, ajuste, custo, estorno e exportação;
- tratamento financeiro de excesso, crédito da cliente, cartão e taxas;
- escopo final de Reparos, Garantias e Trocas;
- navegação definitiva entre Catálogo, Estoque, Nuvemshop e Pendências.

As dúvidas não bloqueiam a cobertura visual das demais superfícies; cada tela
deve marcar o dado incerto ou demonstrativo sem inventar regra.
