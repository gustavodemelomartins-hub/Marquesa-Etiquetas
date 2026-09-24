# Matriz legado → React

Status desta matriz: **baseline inicial, sem aprovação de paridade**.

| Fluxo | Legado atual | React atual | Lacuna principal | Status |
|---|---|---|---|---|
| Shell e conexão | conexão, navegação e ajustes | `AppShell`, `ConnectionForm` e desconexão | ajustes e navegação persistente/deep link | parcial |
| Etiquetas | peças, fila e impressão | placeholder com link | toda a operação | legado |
| Estoque Total | visão, tabela e operações por planilha | painel, análise, revisão e aplicação por sessão | provar equivalência por cenário; operações de peça continuam fora | parcial |
| Catálogo de produtos | cadastro, edição, arquivo/exclusão, SKU, variação e kit | sem tela | toda a operação | legado |
| Fotos e publicação | galeria, órfãs, tratamento e fila de publicação | sem tela | toda a operação | legado |
| Nuvemshop | panorama, análise, confirmação e sincronização | panorama, saúde e análise segura | fluxo mutável/confirmado e paridade de todos os casos | parcial |
| Central de pendências | fila transversal, variações, fotos, catálogo e publicação | diff da análise corrente | `/api/pendencias`, adiamento, correções e filas completas | parcial |
| Inventário | abrir, bipar, concluir, revisar e ajustar | sem tela | toda a operação | legado |
| Revendedoras | visão geral, lista, ficha e administração | visão geral, cards, ficha e nova revendedora | lista administrativa, editar/arquivar e prova de histórico | parcial |
| Maletas | criar, importar Anexo I, adicionar, acertar e cancelar | sugestões, criação e adição de itens | Anexo I, acerto, cancelamento e fechamento completo | parcial |
| Vendas | lançar, pagar, corrigir e cancelar | placeholder | toda a operação | legado |
| Clientes | lista, CRM, perfil, edição e revisão | busca global | busca navega para `dashboard.html`; faltam lista e perfil React | ponte para legado |
| Financeiro | recebíveis, prazo e liquidação | sem tela | toda a operação | legado |
| Garantias e trocas | casos, eventos, troca e diferença financeira | sem tela | toda a operação | legado |
| Saídas sem faturamento | registrar, filtrar e estornar | sem tela | toda a operação | legado |
| Analytics | painel, evolução, rankings e fechamento | sem tela | toda a operação | legado |

## Critério futuro de paridade

Um fluxo só muda para `paridade aprovada` quando:

1. cobre os mesmos casos de uso relevantes do legado;
2. preserva regras e contratos do backend;
3. trata loading, vazio, erro, sucesso e confirmação;
4. tem prova automatizada proporcional ao risco;
5. mantém fallback conhecido durante a janela definida;
6. recebe aprovação humana de produto quando houver mudança de UX.

A existência de um componente ou de um endpoint consumido não prova paridade.
