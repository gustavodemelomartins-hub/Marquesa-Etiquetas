# Mapa de fluxos críticos — Sistema Marquesa V2

**Tarefa:** `ARQ-009` · **Estado:** `READY FOR GUSTAVO REVIEW`
O mapa valida onde cada trabalho começa, quais decisões aparecem e para onde a
pessoa vai depois. Ele descreve o protótipo; não autoriza escrita real.

| Fluxo | Entrada | Ações centrais | Saída / próximo destino | Contrato |
|---|---|---|---|---|
| Venda normal | Vendas → Lançamentos | escolher itens, cliente, pagamentos com data real editável, revisar | venda concluída → histórico / perfil | PARTIAL: recebimentos múltiplos |
| Monte seu Colar | Vendas → Lançamentos | configurar composição, preço, revisar | item composto na venda | BLOCKED: regra canônica |
| Saída sem faturamento | Vendas → Lançamentos | motivo, destino, peças, custo, confirmar | histórico de saídas → estoque | PARTIAL: custo congelado |
| Cliente | Clientes → lista | buscar, abrir perfil, salvar observação na sessão | painel da cliente | SUPPORTED no núcleo |
| Recebimento | Perfil ou Financeiro | escolher conta, valor, forma e data | saldo atualizado → histórico | PARTIAL: coleção auditável |
| Crédito da cliente | Perfil / troca negativa | consultar ou usar crédito | — | UI NEEDS BUSINESS DECISION |
| Abrir garantia | Perfil ou Garantias | selecionar item comprado, motivo e prazo | caso de garantia | SUPPORTED |
| Conserto / reparo | Caso de garantia | registrar evento e transição | peça pronta/devolvida | SUPPORTED |
| Troca | Caso de garantia | escolher peça nova, calcular diferença | troca registrada → receber diferença | PARTIAL: diferença negativa |
| Estoque | Estoque → Visão geral | diagnosticar distribuição/saúde | produtos ou inventário | PARTIAL: fórmula de saúde |
| Inventário | Estoque → Inventário | iniciar, contar, revisar, aplicar | resultado e histórico | SUPPORTED |
| Produto / catálogo | Estoque → Produtos / Catálogo | cadastrar, completar, preparar, aprovar | publicação / Nuvemshop | PARTIAL / BLOCKED por flags |
| Revendedora | Revendedoras → lista | abrir perfil, editar | histórico e maleta atual | SUPPORTED |
| Criar maleta | Perfil → Nova maleta | sugerir, revisar, confirmar itens | maleta aberta | PARTIAL: comando atômico |
| Acerto | Maleta → Acertar | vendidas, devolvidas, faltas, comissão | maleta encerrada → histórico | SUPPORTED no núcleo |
| Etiquetas | Etiquetas → Preparar | selecionar, configurar, revisar, imprimir | lote / reimpressão | PARTIAL: histórico persistente |
| Nuvemshop | Mais → Nuvemshop | lista, filtros, pendências, análise seca | plano seguro sem aplicação | SUPPORTED para leitura/dry-run |

## Princípios de transição

1. Toda ação que move dinheiro ou estoque recebe confirmação e resultado
   autoritativo; a UI não presume sucesso.
2. Perfil da cliente conecta compra, recebimento e pós-venda sem misturar seus
   fatos contábeis.
3. Estoque abriga Produtos, Catálogo e Inventário como subáreas relacionadas.
4. Financeiro, Garantias, Etiquetas e Nuvemshop ficam em `Mais` na navegação
   implementada, mas continuam acessíveis pelos contextos de trabalho.
5. Falhas preservam filtro, seleção e rascunho sempre que o contrato permitir.

Detalhamento técnico: [handoff UI ↔ API](../07-mapping/ui-api-handoff-v2.md).

## Publicação consolidada — 16/09

Mais → Publicar na Nuvemshop → solicitar preparação → acompanhar → revisar
conteúdo/fotos/prévia → **Aprovar e publicar** → Publicando → Publicado.
A aprovação final é a autorização humana; não há confirmação extra. Falha de
envio oferece repetição com aprovação válida; alteração de conteúdo após falha
volta à revisão. Simulação ocorre somente em memória, sem chamada externa.
Catálogo e Estoque encaminham à mesma fila. Ver CC-002 a CC-005 no handoff.
