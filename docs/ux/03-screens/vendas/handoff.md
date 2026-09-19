# Handoff progressivo — Vendas

> **Status: UX/UI EM REFINAMENTO.** Este documento não libera implementação.
> O design principal está avançado, mas interações, estados, responsividade e
> destinos relevantes continuam pendentes.

## 1. Task ID

`VEN-001` — reconstrução visual e especificação UX/UI de Vendas V2.

## 2. Objetivo

Definir uma referência visual navegável para Painel, Lançamentos, Clientes e
Saídas sem faturamento; preservar a separação entre venda, recebimento e
movimento não comercial; preparar um contrato de interface auditável para a
futura implementação React.

## 3. HTML/CSS de referência

- [master.html](master.html): protótipo navegável com dados ilustrativos;
- [master.css](master.css): estilos, tokens locais e responsividade do protótipo;
- [README.md](README.md): objetivo, blocos, propostas e referências visuais;
- [images/](images/): oito mockups recebidos e capturas do protótipo mestre.

Não existe componente React derivado deste material, nem integração com API.

## 4. Estados

O inventário está em [states.md](states.md). O protótipo cobre principalmente
sucesso ilustrativo, seleção de período, troca de visão, detalhe inline e
paginação. Continuam incompletos: vazio, carregamento, erro, erro de permissão,
ação em progresso, recusa, resultado incerto, confirmação e recuperação.

## 5. Ações

As ações locais priorizadas são: alternar superfícies, selecionar período,
selecionar barra, alternar análise, expandir ranking, paginar vendas e abrir
quantos detalhes inline forem necessários, com recolhimento independente.
Lançar venda, compor produto, editar preço, distribuir pagamentos, finalizar e
registrar saída estão simulados no protótipo. Parcelamento saiu desta versão:
qualquer diferença permanece como `A receber`, conforme `VEN-D005`.

## 6. Matriz de interações

A fonte oficial é [interaction-matrix.md](interaction-matrix.md). Ela distingue
`LOCAL`, `NAVEGAÇÃO`, `MODAL` e `FUTURA TELA`, registra o que funciona e impede
que uma simulação contextual seja confundida com uma tela concluída.

## 7. Componentes reutilizáveis

- App Shell e header desktop;
- navegação principal e submenu;
- Page Header;
- Metric Card e resumo financeiro;
- Alert;
- Filter / Period Selector;
- Chart Card e seleção de barra;
- controle segmentado;
- tabela, paginação e detalhe inline;
- formulário, editor de preço e compositor de pagamentos;
- botões, inputs, badges e estados semânticos.

O inventário compartilhado fica em
[COMPONENT-INVENTORY.md](../../../ui/COMPONENT-INVENTORY.md). Esses padrões não
são componentes React nesta rodada.

## 8. Dados necessários

- vendas, peças e clientes distintas pela data da venda;
- dinheiro efetivamente recebido pela data do recebimento;
- dívida real e cobrável, sem tratá-la como complemento do faturamento;
- produtos, categorias e origens do período;
- série temporal e seleção contínua por datas;
- venda, itens, preço de tabela congelado, preço final e motivo;
- recebimentos, vencimento, situação e autoria;
- saídas sem faturamento e sua trilha de estorno;
- composição congelada do Monte seu Colar;
- reparos apenas como resumo até a tela própria existir.

Fórmulas e distinções estão em [metrics.md](metrics.md) e [rules.md](rules.md).

## 9. APIs existentes conhecidas

O mapeamento atual registra, sem autorizar integração:

- `GET /api/analytics/mes?mes=AAAA-MM`;
- `POST /api/vendas`;
- `GET /api/vendas`, `GET /api/vendas/dia` e
  `GET /api/vendas/lancamentos`;
- `GET /api/vendas/lista`;
- `POST /api/saidas`, `GET /api/saidas` e
  `POST /api/saidas/:id/estornar`;
- `GET /api/personalizacao/modelos`.

Compatibilidade com a experiência proposta ainda precisa ser provada na Fase 5.

## 10. APIs ausentes ou não comprovadas

[api-needs.md](api-needs.md) registra `API-VEN-001` a `API-VEN-019`. Os grupos
principais são: intervalo arbitrário, analytics coerente entre todos os blocos,
série mensal, detalhe paginado, incerteza por métrica, filtros/totais/exportação,
recebimentos múltiplos, correção/estorno individual, idempotência e
eventos financeiros por data efetiva.

Nenhuma rota nova é proposta ou aprovada neste handoff.

## 11. Regras legadas e decisões vigentes

- faturamento é dinheiro recebido; venda é saída comercial;
- data do recebimento e data da venda são eixos diferentes;
- A Receber representa dívida real;
- venda cancelada não entra nos agregados elegíveis;
- preço final é por item e mudança exige motivo;
- status de pagamento é derivado, nunca escolhido manualmente;
- saída sem faturamento não é venda e é corrigida por estorno;
- Monte seu Colar baixa base e componentes exatamente uma vez;
- a base Veneziana 45 cm com extensor é fixa na versão atual;
- estado operacional e estado financeiro permanecem separados.

Fontes: [rules.md](rules.md), [open-questions.md](open-questions.md) e
`api/REGRAS.md`.

## 12. Responsividade

O protótipo tem agora uma composição própria para celular em até `580px`: topo
compacto, navegação principal fixa no rodapé, submenu de Vendas sem rolagem,
conteúdo em uma coluna, seletores com áreas de toque adequadas e tabelas de
Clientes, Reparos e Saídas convertidas em cartões legíveis. O Painel,
Lançamentos e Pagamento também tiveram densidade e hierarquia ajustadas.

A validação direcionada em Chromium cobriu larguras de `320px`, `360px` e
`390px`, navegação entre as superfícies, barra inferior após rolagem, popover de
datas e detalhe expandido sem overflow horizontal. O desktop foi conferido em
`1440px` e permanece com a navegação original. Ainda faltam aceite humano no
celular, validação específica de tablet e a rodada formal completa de
acessibilidade. `DP-001` e `DP-002` continuam abertas.

### Venda normal navegável

A primeira variante de Lançamentos agora percorre o rascunho completo no
protótipo: busca e inclusão de produto, quantidade, remoção, edição do preço
final com motivo obrigatório, seleção/cadastro rápido de cliente, data, canal,
observação, vários recebimentos, situação financeira derivada, revisão final e
retorno de sucesso. O total funciona como âncora visual e a ação final fica
acima da navegação inferior no celular.

A confirmação é deliberadamente local e declara que não gravou dados reais.
A escrita integrada continua fora desta etapa. A prova direcionada cobriu o
fluxo em `390px`, a
largura mínima de `320px` e o desktop em `1440px`, com 24 verificações verdes,
sem erro JavaScript ou overflow horizontal.

Por decisão do Gustavo, a composição foi então aproximada fielmente do mockup
de pagamento misto: itens e cliente passaram a compartilhar a mesma moldura;
Pagamento ganhou quatro indicadores, linhas compactas e ações progressivas; o
rodapé reúne peças, subtotal, desconto, total e confirmação; `Vendas de hoje`
fica imediatamente abaixo. A estrutura original foi preservada com a
identidade nova, sem restaurar o cabeçalho, a paleta ou a tipografia antigas.
Essa rodada passou em 30 verificações direcionadas entre `320px`, `390px` e
`1440px`, incluindo excesso de pagamentos, desconto derivado e confirmação.

## 13. Empty, loading e error

Os conceitos estão descritos em [states.md](states.md), mas não estão
representados de ponta a ponta no HTML. Antes de `UX/UI DESIGNED`, devem existir
ao menos referências para:

- primeiro uso e ausência de vendas;
- filtro sem resultado;
- carregamento sem salto de layout;
- falha parcial por bloco e nova tentativa;
- permissão insuficiente;
- escrita em andamento, recusada ou incerta;
- sucesso/confirmacão sem duplicar a operação.

## 14. Pendências

- revisar e aprovar a matriz de interações;
- representar os estados vazio, carregando, erro e recuperação dos fluxos principais;
- fechar decisões que mudam taxonomia, fórmulas, permissões e campos;
- validar responsividade e acessibilidade;
- decidir quando o histórico completo vira superfície própria;
- desenhar futuramente Clientes / Recebimentos e Reparos;
- comprovar contratos apenas na fase arquitetural apropriada;
- realizar handoff final antes de iniciar React.

## 15. Checklist de aceitação

- [x] identidade, logo e cabeçalho desktop alinhados;
- [x] hierarquia principal do Painel avançada;
- [x] período, barra e duas análises sincronizados no protótipo;
- [x] ranking, paginação e detalhe inline simulados;
- [x] regras financeiras fundamentais documentadas;
- [x] destinos futuros separados de interações locais;
- [x] composição mobile validada tecnicamente entre 320px e 390px;
- [x] Venda normal navegável no protótipo, incluindo revisão e confirmação local;
- [ ] matriz revisada e aceita por Gustavo;
- [ ] todos os controles locais relevantes definidos;
- [ ] estados vazio/loading/error/confirmation validados;
- [ ] tablet/mobile e acessibilidade validados;
- [ ] pendências de produto bloqueadoras fechadas;
- [ ] dados e contratos entregues à arquitetura sem suposição;
- [ ] status promovido explicitamente para `UX/UI DESIGNED`;
- [ ] implementação React iniciada — **não faz parte desta rodada**.
