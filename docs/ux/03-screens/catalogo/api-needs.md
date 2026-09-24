# Contrato de integração da tela — Catálogo, Mídia e Publicação

> **Fonte canônica técnica:** `docs/domains/CONTRATO-UX-API-4-5.md`
>
> Este arquivo descreve as necessidades da UX. Ele não substitui a regra de
> domínio.

O documento canônico está na branch paralela `claude/refactor-sistema-marquesa`
e ainda não é visível nesta branch. O conteúdo abaixo usa o espelho integral
aprovado fornecido por Gustavo em 10/09/2026. O backend foi implementado e
provado naquela branch, mas não foi publicado.

## Limite

- não cria rota, payload, estado ou ação além do contrato;
- não afirma integração React nem disponibilidade em produção;
- mantém nomes técnicos literais quando são parte do contrato;
- respostas do servidor são autoridade sobre estado, recusas e capacidades.

## Matriz por visão

| Visão UX | Contrato consumido | Obrigação da interface |
|---|---|---|
| Central do Catálogo | `GET /api/catalogo/publicacao`; `GET /api/produtos/pendentes` | mostrar `estado`, `falta[]`, `bloqueios[]`, presença na loja e aprovação invalidada sem colapsar dimensões |
| Cadastro/edição | `GET /api/produtos/:sku/variacoes`; `GET /api/produtos/:sku/dependencias`; dados `qtd` e `casa` | mostrar variações, dependências, arquivamento e saldos; não editar `qtd` |
| Categorias | `GET /api/categorias`; `POST /api/categorias`; `PATCH /api/categorias/:id`; `POST /api/categorias/:id/arquivar` | usar `id`, respeitar sentinela, órfã e permissões; não oferecer mesclar |
| Galeria | `GET /api/produtos/:sku/galeria`; `POST /api/produtos/:sku/galeria`; `PUT /api/galeria/:id/preparada`; `POST /api/galeria/:id/aprovar`; `DELETE /api/galeria/:id`; `POST /api/produtos/:sku/galeria/principal`; `POST /api/produtos/:sku/galeria/ordem` | suportar múltiplas fotos, original/preparada, principal, ordem, `ignorados[]`, `novaPrincipal` e bloqueio `sem_r2` |
| Upload em lote | `POST /api/fotos/lotes`; `PUT /api/fotos/lotes/:id/arquivo/:nome`; `POST /api/fotos/lotes/:id/confirmar` | analisar antes de bytes, enviar um arquivo por chamada, manter progresso e mostrar recontagem final |
| Fotos órfãs | `GET /api/fotos/orfas` | manter itens aguardando decisão, sem casar por palpite |
| Preparação | `POST /api/catalogo/preparacao/tarefas`; `GET /api/catalogo/preparacao/tarefas?estado=pendente`; `POST /api/catalogo/preparacao/tarefas/:id/entregar`; `POST /api/catalogo/preparacao/tarefas/:id/resultado`; `POST /api/catalogo/preparacao/tarefas/:id/falhou`; `POST /api/catalogo/preparacao/tarefas/:id/cancelar` | distinguir tarefa, executor livre e resultado; nunca traduzir preparo como publicação |
| Revisão/aprovação | `POST /api/catalogo/publicacao/:sku/preparar`; `POST /api/catalogo/publicacao/:sku/previa`; `POST /api/catalogo/publicacao/:sku/aprovar`; `POST /api/catalogo/publicacao/:sku/reabrir` | mostrar prévia, exigir aprovação humana, tratar `faltam[]` e `aprovacaoInvalidada` |
| Publicação | `POST /api/catalogo/publicacao/:sku/publicar`; `POST /api/catalogo/publicacao/:sku/repetir`; `POST /api/catalogo/publicacao/rodada` | mostrar simulação `enviaria`, respeitar seco por padrão, flag desligada e freio acima de 20 |
| Despublicação | `POST /api/catalogo/publicacao/:sku/despublicar` | ensaio por padrão, motivo opcional e resultado autoritativo; nunca disparar ao arquivar |
| Divergências Nuvemshop | `POST /api/sync/analisar`; `GET /api/catalogo/precos/divergentes` | mostrar próxima ação, `semEmpurrar[]`, produtos só na loja e preços divergentes sem correção automática |

## Lacuna deliberada do espelho

O contrato exige representar **cadastro de produto**, mas o espelho não lista
uma rota de criar/editar produto. Ele informa validações de categoria, status e
quantidade e expõe a fila `GET /api/produtos/pendentes`. Portanto:

- a tela conceitual de cadastro pode ser desenhada;
- campos e ações já proibidos devem ser respeitados;
- a ligação técnica de salvar/criar produto permanece “contrato não exposto
  neste espelho”;
- não será criada referência a uma rota hipotética de criação nesta
  documentação.

## Resposta da Central

`GET /api/catalogo/publicacao` precisa ser consumido sem derivar estados novos.
Cada item usa o conjunto fechado de `estado` documentado em [states.md](states.md)
e mantém separadamente:

- `falta[]`;
- `bloqueios[]`;
- `presencaNaLoja`;
- `estadoObservado`;
- `aprovacaoInvalidada`.

Foto própria, somente endereço da loja e nenhuma foto são combinações de
`temFotoPropria` e `temEnderecoDaLoja`. Versão preparada e capacidade do
serviço usam `temTratada` e `bloqueios`.

## Galeria e bytes

- upload envia bytes diretamente no corpo, com `X-Arquivo`, `X-Principal` e o
  `Content-Type` do navegador; a UX não converte para Base64/JSON;
- a ordem do GET já é principal, ordem, criação e id;
- o comando de ordem pode devolver `ignorados[]`, que permanecem visíveis;
- exclusão pode devolver `novaPrincipal`;
- qualquer escrita de bytes sem R2 retorna `503` e
  `{ bloqueio: "sem_r2" }`.

R2 próprio ainda não está habilitado em produção. Isso impede escrita de bytes,
mas não transforma a pendência em trabalho da usuária.

## Upload em lote

```text
POST lote — analisa nomes, gravouBytes: false
→ pessoa revisa o casamento
→ PUT de um arquivo por vez
→ POST confirmar — servidor reconta o resultado
```

A tela preserva por arquivo as situações `vinculado`, `multiplas`,
`sku_nao_encontrado`, `nome_ambiguo`, `nome_invalido`, `duplicado` e
`erro_upload`. Uma falha não cancela os arquivos já enviados ou ainda válidos.

## Preparação desacoplada

- criar tarefa sem `skus` alcança todos os produtos prontos;
- a resposta separa `abertas`, `jaTinhamTarefa` e `recusados`;
- `executor` é texto livre aceito pelo contrato, não enumeração da UX;
- `resultado` sempre comunica `publicado: false`;
- a UX não depende de Codex, ChatGPT ou fornecedor específico.

## Publicação ainda desligada

Todas as chamadas são secas por padrão. Mesmo com `seco: false`, a escrita
depende de `NUVEMSHOP_PUBLICACAO_ENABLED`, ausente em todos os ambientes no
estado descrito pelo contrato. Consequências:

- oferecer `Prévia`/`Simular publicação` e mostrar `enviaria` integral;
- não habilitar CTA que prometa publicar de verdade enquanto o bloqueio existir;
- quando a capacidade futura estiver habilitada, ainda exigir
  `aprovado_para_publicar` e aprovação válida;
- rodada com mais de 20 aprovados mostra `pausado: true` e somente oferece
  `forcar: true` para perfil autorizado.

## Recusas que a UX mostra como devolvidas

| Ato | Resposta relevante |
|---|---|
| editar categoria inexistente | `400` + `categoriasDisponiveis[]` |
| editar status inválido | `400` + `statusValidos[]` |
| editar `qtd` | `400` sempre |
| renomear categoria para nome existente | `409` |
| arquivar categoria com peças | `409` + `pecas` |
| aprovar fora do estado/com faltas | `409` + `faltam[]` |
| publicar sem aprovação ou com assinatura caída | `409` + `aprovacaoInvalidada` |
| excluir produto com histórico | `409` + `bloqueios[]` + `alternativa: 'arquivar'` |

## Três classes de erro

`foto_erro`, `preparo_erro` (`bloqueioExterno`) e `publicacao_erro` precisam de
tratamento independente. A tela preserva o estágio que falhou e oferece apenas
a recuperação realmente coberta pelo contrato.
