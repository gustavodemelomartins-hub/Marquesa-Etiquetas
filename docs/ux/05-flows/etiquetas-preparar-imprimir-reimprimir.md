# Fluxo: preparar, imprimir e reimprimir etiquetas

**Quem:** Sthefany Marques ou outro perfil autorizado  
**Começa em:** cadastro manual, importação ou ação Adicionar produtos  
**Termina em:** novo lote registrado no histórico, após PDF ou envio para impressão

## Passos

| # | Onde | Ação | Resultado | Escreve no banco? |
|---:|---|---|---|---|
| 1 | Catálogo/importação | cadastrar ou importar produto | item aparece na fila com origem identificada | cadastro/importação já pode escrever; a entrada na fila não move estoque |
| 2 | Etiquetas › Preparar | revisar texto abreviado, selecionar item e ajustar quantidade | lote em preparação atualizado | hoje é local; persistência futura a definir |
| 3 | Etiquetas › Preparar | conferir resumo e abrir Revisar impressão | composição da folha é criada | não deveria exigir escrita definitiva |
| 4 | Etiquetas › Impressão | revisar todas as folhas e ajustar calibração | prévia proporcional e configuração válida | calibração: local ou banco ainda aberto |
| 5 | Etiquetas › Impressão | baixar PDF ou enviar ao diálogo de impressão | saída gerada e novo lote registrado | histórico futuro provavelmente sim; não move estoque |
| 6 | Etiquetas › Histórico | buscar lote e abrir detalhes | autoria, horário, produtos e quantidades visíveis | não, leitura |
| 7 | Etiquetas › Histórico | preparar reimpressão | novo rascunho com base no lote anterior | novo lote só ao gerar/enviar; não altera o anterior nem o estoque |

## Onde pode falhar

| Ponto | Falha | O que o usuário vê | Recuperação |
|---|---|---|---|
| entrada automática | nome não possui abreviação confiável | item marcado para revisão, sem chute | editar e confirmar o texto |
| foto | imagem ausente ou inválida | placeholder neutro | continuar sem foto |
| composição | quantidade excede a página | folhas adicionais com a mesma escala | navegar e revisar todas |
| calibração | papel não alinha com a saída física | valores atuais e opção de recalibrar | teste controlado e novo ajuste |
| PDF/impressão | navegador bloqueia ou geração falha | erro sem perder seleção | tentar novamente ou baixar PDF |
| histórico | não é possível provar impressão física | estado técnico preciso, sem falso sucesso | atualizar conforme a ação confirmada disponível |

## Invariantes

- nenhuma etapa de etiqueta movimenta estoque, cria venda, pagamento ou comissão;
- o nome de etiqueta não renomeia o produto do catálogo;
- reimpressão não altera lote anterior;
- o responsável é obtido do perfil em uso;
- foto ausente nunca bloqueia o fluxo.

## Decisões abertas

Ver [decisões da tela](../03-screens/etiquetas/open-questions.md), principalmente
quantidade automática, modelos de folha, escopo da calibração e estados reais
de impressão.
