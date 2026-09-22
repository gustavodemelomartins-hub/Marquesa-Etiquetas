# Conclusão da Marquesa V2 no DEV

Estado levantado em 22/09/2026 no código de `develop`. A matriz executável
`frontend/src/testing/paridade.ts` registra 130 capacidades: 111 prontas,
3 parciais, 3 pendentes e 13 indisponíveis após a correção do crédito de troca.
Essas contagens são ponto de partida, não definição do produto final.

## Regra de entrega

Cada etapa usa dados e contratos reais, preserva a razão de estoque e dinheiro,
passa em testes focados e no build, e é verificada em `/v2/` no DEV. O
`/prototype/` orienta composição visual; não fornece números nem regras.
O painel clássico permanece acessível para fluxos ainda não migrados. Nenhuma
etapa desta frente altera PROD ou liga escrita real na Nuvemshop por inferência.

## Sequência recomendada

1. **Fechar fluxos já suportados.** Corrigir o estado do crédito de troca
   (feito em código), concluir o acerto de maletas, a revisão dos vínculos
   antigos de garantia, a busca global e a leitura de código por câmera.
   Respeitar recusas do servidor e não escolher item ambíguo automaticamente.
2. **Catálogo e fotos.** Entregar bytes das fotos por rota segura, galeria
   conectada e upload em lote. Alterar estrutura de variações somente com
   prévia dos saldos, confirmação explícita e bloqueio de ambiguidades.
3. **Identidade e Etiquetas.** Criar autoria verificável; então migrar fila,
   nome abreviado, calibração A4, PDF/impressão e histórico de lotes. Validar
   a impressão real antes de aposentar o fluxo clássico. Impressão não movimenta
   estoque.
4. **Agenda e Notificações.** Começar pelos prazos e alertas derivados de
   maletas, recebíveis e garantias. Adicionar compromissos, recorrência e
   estado de leitura somente com contratos próprios e sem duplicar fatos.
5. **Financeiro e indicadores.** Implementar recebimentos múltiplos/parciais,
   canal da venda, custo histórico, margem e saúde do estoque após fechar
   as políticas correspondentes. Não usar preço de venda como custo.
6. **Monte seu Colar.** Validar catálogo, composição, estoque, preço da
   configuração e venda ponta a ponta no DEV. Manter a ativação de PROD
   desligada.
7. **Publicação na Nuvemshop.** Preparar fotos, revisão final, aprovação
   assinada, execução idempotente e modo seco. A escrita real na loja depende
   de ativação explícita e dos freios de integração.

## Decisões de negócio necessárias antes das etapas dependentes

- Recebimentos múltiplos: excedente/troco, uso de crédito, taxas, vencimentos
  e correção de um recebimento salvo (DEC-2026-016).
- Etiquetas: persistência da fila e da calibração, abreviação por produto ou
  variação, significado de "impresso" e modelos de papel; a intenção de
  Preparar → Revisar impressão → Histórico está registrada em DEC-2026-014.
- Qualquer mudança no preço fixo da configuração do colar exige nova decisão:
  a regra atual em `api/REGRAS.md` o fixa no servidor.
- Compromissos e recorrência da Agenda e leitura/preferências de Notificações
  exigem contratos novos, pois não são migração do painel clássico.

## Critério de conclusão

Uma capacidade só passa a pronta quando a tela V2 executa a operação real,
os estados de sucesso/erro são visíveis, os invariantes de estoque e dinheiro
passam, e o fluxo foi testado no DEV. Atualizar a matriz e seu documento gerado
em cada etapa. Publicar PROD requer instrução humana específica e permanece
fora desta frente.
