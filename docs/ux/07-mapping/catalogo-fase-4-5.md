# Mapeamento UX ↔ contrato — Catálogo Fase 4.5

Fonte técnica: `docs/domains/CONTRATO-UX-API-4-5.md`, implementada e provada
na branch paralela `claude/refactor-sistema-marquesa`, sem deploy e ainda não
visível nesta branch. Esta matriz usa o espelho integral fornecido por Gustavo
em 10/09/2026.

## Telas e contratos

| Ordem | Tela conceitual | Leitura/ação do contrato | Estados/fatos obrigatórios | Limite atual |
|---:|---|---|---|---|
| 1 | Central do Catálogo | `GET /api/catalogo/publicacao`; `GET /api/produtos/pendentes` | dez estados de `item.estado`; `falta[]`; `bloqueios[]`; `presencaNaLoja`; `estadoObservado`; `aprovacaoInvalidada` | sem React; sem deploy |
| 2 | Cadastro/edição de produto | `GET /api/produtos/:sku/variacoes`; `GET /api/produtos/:sku/dependencias`; validações descritas no contrato | produto incompleto, variação sem `variante_id`, kit/componente, total/casa, arquivamento | rota de criar/salvar produto não aparece no espelho; não inventar |
| 3 | Categorias | `GET /api/categorias`; `POST /api/categorias`; `PATCH /api/categorias/:id`; `POST /api/categorias/:id/arquivar` | sentinela, órfã, `podeRenomear`, `podeArquivar`, `pecas`, `pecasAtivas` | mesclar não existe |
| 4 | Galeria do produto | `GET /api/produtos/:sku/galeria`; `POST /api/produtos/:sku/galeria`; `PUT /api/galeria/:id/preparada`; `POST /api/galeria/:id/aprovar`; `DELETE /api/galeria/:id`; `POST /api/produtos/:sku/galeria/principal`; `POST /api/produtos/:sku/galeria/ordem` | foto própria/endereço da loja/nenhuma; original/preparada; principal; ordem; `ignorados[]`; `novaPrincipal`; `sem_r2` | R2 não habilitado em PROD |
| 5 | Upload em lote | `POST /api/fotos/lotes`; `PUT /api/fotos/lotes/:id/arquivo/:nome`; `POST /api/fotos/lotes/:id/confirmar` | análise sem bytes, progresso por arquivo, sete resultados do casamento, resumo final recontado | escrita bloqueada sem R2 |
| 6 | Resultado/órfãs | retorno do lote; `GET /api/fotos/orfas` | múltiplas válidas, desconhecido, ambíguo, inválido, duplicado e erro de upload | nenhuma resolução automática |
| 7 | Preparação | `POST /api/catalogo/preparacao/tarefas`; `GET /api/catalogo/preparacao/tarefas?estado=pendente`; ações por id `entregar`, `resultado`, `falhou`, `cancelar`; `POST /api/catalogo/publicacao/:sku/preparar` | `abertas`, `jaTinhamTarefa`, `recusados`; executor livre; `publicado: false`; falha de preparo separada | relação interna entre comando por SKU e tarefa não é responsabilidade da UX |
| 8 | Revisão/aprovação | `POST /api/catalogo/publicacao/:sku/previa`; `POST /api/catalogo/publicacao/:sku/aprovar`; `POST /api/catalogo/publicacao/:sku/reabrir` | aguardando aprovação, aprovado, `faltam[]`, aprovação invalidada | `Pedir ajuste` não cria estado; usa `reabrir` |
| 9 | Publicação/despublicação | `POST /api/catalogo/publicacao/:sku/publicar`; `POST /api/catalogo/publicacao/:sku/repetir`; `POST /api/catalogo/publicacao/:sku/despublicar`; `POST /api/catalogo/publicacao/rodada` | `enviaria`, seco por padrão, publicando/publicado/falhou/despublicado, rodada pausada | escrita real desligada pela flag ausente |
| 10 | Divergências Nuvemshop | `POST /api/sync/analisar`; `semEmpurrar[]`; `GET /api/catalogo/precos/divergentes` | próxima ação, fato observado, produto só na loja, preço divergente | sem corrigir preço nem criar produto automaticamente |

## Travas de desenho

- botão sem endpoint/capacidade não entra no mockup;
- estado produzido pelo contrato não pode ser ocultado;
- falta humana, bloqueio técnico e presença externa não compartilham checklist;
- preparação nunca termina visualmente como publicação;
- aprovação humana sempre precede publicação;
- publicação real aparece bloqueada enquanto a flag estiver ausente;
- nenhuma ação menciona fornecedor de IA.

## Estado da integração

```text
Contrato backend 4.5: implementado e provado na branch paralela
Deploy: não
Documentação UX: mapeada
Mockups: ainda não recebidos
React consumindo: não
```
