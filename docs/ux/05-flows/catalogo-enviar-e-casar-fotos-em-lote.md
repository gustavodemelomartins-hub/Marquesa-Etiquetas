# Fluxo: Enviar e casar fotos em lote

**Quem:** perfil autorizado de catálogo/mídia  
**Começa em:** Catálogo → Fotos em lote  
**Termina em:** resumo final recontado, com cada arquivo vinculado ou explicado

## Passos

| # | Onde | Ação | Contrato | Resultado | Escreve no banco/R2? |
|---:|---|---|---|---|---|
| 1 | Seleção | escolher arquivos | navegador | lista local | não |
| 2 | Análise | criar lote com nomes | `POST /api/fotos/lotes` | casamento preliminar e `gravouBytes: false` | não grava bytes |
| 3 | Revisão | conferir cada resultado | resposta do lote | decisão humana antes do envio | não |
| 4 | Upload | enviar um arquivo por requisição | `PUT /api/fotos/lotes/:id/arquivo/:nome` | progresso e resultado isolados por arquivo | sim, bytes no R2 quando disponível |
| 5 | Confirmação | concluir lote | `POST /api/fotos/lotes/:id/confirmar` | resumo final recontado das linhas | sim, conforme contrato |
| 6 | Órfãs | consultar arquivos sem dono | `GET /api/fotos/orfas` | fila explícita aguardando decisão | não |

## Onde pode falhar

| Situação | Semântica | Recuperação |
|---|---|---|
| `multiplas` | segunda ou outra foto do mesmo SKU; válida | seguir normalmente |
| `sku_nao_encontrado` | código não existe | corrigir catálogo/nome por fluxo autorizado |
| `nome_ambiguo` | dois candidatos | renomear arquivo e analisar novamente |
| `nome_invalido` | nenhum candidato | corrigir nome |
| `duplicado` | arquivo ou imagem já existe | remover duplicata da seleção |
| `erro_upload` | R2 recusou/não respondeu | repetir só o arquivo afetado |

## Invariantes

- a análise precede qualquer byte;
- o envio é por arquivo, com concorrência baixa;
- uma falha não derruba os outros arquivos;
- o resumo final vem da recontagem do `confirmar`;
- o sistema nunca casa SKU ambíguo por palpite.

