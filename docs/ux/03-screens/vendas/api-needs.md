# Necessidades de API — Vendas

Dado que esta tela precisa, comparado ao que a API entrega hoje. **Nada aqui é
especificação de rota aprovada.** Contrato novo nasce na fase correspondente do
Master Plan, com contract test — não nesta pasta.

Baseline de contratos existentes:
`docs/architecture/API-ROUTES-BASELINE.md` (trilha de refatoração).

## Já atendido

| Dado | Rota atual | Observação |
|---|---|---|
| resumo de um mês para Evolução por mês | `GET /api/analytics/mes?mes=AAAA-MM` | já separa faturamento por pagamento e vendas/peças/clientes por data da venda |
| registrar venda com itens, desconto e pagamento atual | `POST /api/vendas` | contrato crítico; suporte a uma coleção de recebimentos ainda precisa ser comprovado |
| vendas e histórico comercial do dia | `GET /api/vendas?data=`, `GET /api/vendas/dia?data=`, `GET /api/vendas/lancamentos?data=` | as três leituras têm escopos diferentes que a UI não pode misturar |
| lista paginada por período | `GET /api/vendas/lista?de=&ate=&busca=&canal=&limite=&offset=` | atende parte do histórico completo |
| registrar e listar saídas sem faturamento | `POST /api/saidas`, `GET /api/saidas?de=&ate=&tipo=&estornadas=&limite=&offset=` | saída passa pela razão e não cria venda |
| estornar saída | `POST /api/saidas/:id/estornar` | cria contrapartida; não apaga histórico |
| modelos de Monte seu Colar | `GET /api/personalizacao/modelos?inativos=1` | existe, mas a funcionalidade está desligada em produção |

## Falta

| # | Dado necessário | Existe em algum lugar? | Bloqueia o quê | Fase provável |
|---|---|---|---|---|
| API-VEN-001 | agregação de intervalo arbitrário entre mês inicial e final | parcial; há leitura mensal e presets atuais | intervalo personalizado `IF-001` | avaliar na fase de Vendas/Analytics |
| API-VEN-002 | produtos, categorias e origens do período com fórmulas auditáveis | parcial; mapear contratos atuais antes de propor algo | Análise detalhada | avaliar na fase de Vendas/Analytics |
| API-VEN-003 | série mensal do período com metadados dos dois eixos de data | parcial; regra existe, formato completo a confirmar | gráfico e seleção por barra | avaliar na fase de Vendas/Analytics |
| API-VEN-004 | detalhe paginado das vendas do mês ou intervalo escolhido | há listagens atuais; compatibilidade do filtro a confirmar | tabela da Evolução por mês | avaliar na fase de Vendas |
| API-VEN-005 | sinal de dado parcial, aproximado ou indeterminado por métrica | existe em partes do domínio; resposta agregada a confirmar | estado incerto sem esconder números | avaliar na fase de Vendas/Analytics |
| API-VEN-006 | filtros adicionais de histórico por tipo/origem, pagamento e estado operacional | lista atual confirma período, busca e canal; demais filtros a mapear | Histórico completo de vendas | avaliar na fase de Vendas |
| API-VEN-007 | totais do histórico usando exatamente o mesmo filtro da lista | agregações existentes são parciais | cards e rodapé sem divergência da tabela | avaliar na fase de Vendas/Analytics |
| API-VEN-008 | exportação de todas as linhas filtradas com limite, formato e auditoria definidos | não confirmado | Exportar | avaliar após decisão de produto |
| API-VEN-009 | filtros e agregações de saídas por responsável/destino, estado e quatro motivos | lista atual cobre período, tipo e estornadas | Histórico completo de saídas | avaliar na fase de Saídas/Estoque |
| API-VEN-010 | identidade do perfil que registrou, corrigiu ou estornou cada operação | parcial/não mapeado | autoria e permissões | depende da solução futura de perfis |
| API-VEN-011 | composição por posições ordenadas e troca de base no Monte seu Colar | modelo atual cobre composição; compatibilidade exata do mockup a confirmar | personalização guiada | avaliar antes de reativar a funcionalidade |
| API-VEN-012 | medida econômica auditável para `Impacto estimado` | custo histórico próprio não existe de forma confiável | cards de saídas | bloqueado até decisão e fonte de dado |
| API-VEN-013 | coleção de recebimentos da venda, cada um com valor, forma, pago/pendente, data efetiva, vencimento, observação e parcela | não confirmado no contrato atual | pagamento misto, parcial e parcelado | avaliar na fase de Vendas/Financeiro |
| API-VEN-014 | comandos auditáveis para adicionar, liquidar, corrigir e estornar um recebimento individual | há liquidação da venda, mas granularidade por recebimento não foi comprovada | ciclo de vida depois da venda | avaliar na fase de Financeiro |
| API-VEN-015 | resumo derivado `valorVenda`, `valorRecebido`, `valorAReceber` e `statusPagamento` | existe semântica financeira parcial; novo formato a avaliar | cards, tabela, detalhe e recibo | avaliar na fase de Vendas/Analytics |
| API-VEN-016 | catálogo extensível de formas de pagamento | lista inicial definida no produto; autoridade atual não mapeada | seletor consistente e filtros | avaliar sem fixar enum em UI |
| API-VEN-017 | parcelas ordenadas com número/total, valor, vencimento, status e data efetiva | não confirmado | parcelamento e histórico | avaliar na fase de Financeiro |
| API-VEN-018 | idempotência e controle de concorrência por recebimento | venda/liquidação atuais têm proteções; novo nível não confirmado | impedir pagamento duplicado em retry ou duas telas | obrigatório antes de implementação |
| API-VEN-019 | evento financeiro por data efetiva para analytics | regra existe para pagamento; múltiplos eventos por venda ainda não comprovados | faturamento diário/mensal correto | avaliar na fase de Analytics |

## Incompatibilidade conhecida

Caso em que a API responde, mas no formato errado para a tela (agregação
faltando, paginação ausente, campo derivado que a tela teria de recalcular).

| # | Rota | Problema | Alternativa possível |
|---|---|---|---|
| API-VEN-I01 | rotas analíticas atuais | ainda não foi provado que aceitam intervalo personalizado e devolvem todos os blocos do mockup com a mesma seleção | compor leituras existentes só se não criar divergência nem cálculo duplicado no navegador |
| API-VEN-I02 | `POST /api/vendas` e rotas de pagamento atuais | o baseline registra pagamento/liquidação, mas não prova múltiplos recebimentos, formas mistas e parcelas independentes | preservar o contrato atual e introduzir evolução somente na fase arquitetural apropriada |

As necessidades `API-VEN-013` a `API-VEN-019` incluem escrita financeira e
provável persistência nova. Elas **não** aprovam rota, tabela, migration ou
alteração de backend; apenas tornam explícito o contrato de produto que deverá
ser avaliado posteriormente.
