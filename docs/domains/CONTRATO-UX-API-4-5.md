# Contrato de UX/API da Fase 4.5 — para quem vai desenhar a tela

Backend implementado e provado na branch `claude/refactor-sistema-marquesa`
(worktree `../Marquesa-Claude-Refactor`), **sem deploy**. Este documento é o
que a interface precisa saber para não inventar comportamento que a API não
tem — e para não deixar de fora comportamento que ela passou a ter.

Regra que governa o documento inteiro: **a tela não pode oferecer um botão
que a API não tem, e não pode esconder um estado que o domínio produz.**

Desenho e decisões: [CATALOGO-MIDIA-PUBLICACAO-4-5.md](CATALOGO-MIDIA-PUBLICACAO-4-5.md).
Regras de negócio: [api/REGRAS.md § 44](../../api/REGRAS.md).

---

## 1. As três palavras que não podem ser confundidas

| Palavra | Significa | De onde vem |
|---|---|---|
| **falta** | trabalho humano que alguém pode fazer hoje | `item.falta[]` |
| **bloqueio** | o servidor não consegue fazer, por infraestrutura ausente | `item.bloqueios[]` |
| **presença na loja** | o que a vitrine mostra — fato observado, não decisão | `item.presencaNaLoja` |

Misturá-las foi o defeito que travou a fase inteira: "falta fundo branco"
aparecia como pendência da Sthefany quando era o R2 que não existia no
ambiente. **Bloqueio nunca vai na mesma lista que falta**, e a tela deveria
dizer "o sistema não consegue" com outra voz — nunca com um checkbox que
parece esperar alguém.

Valores possíveis:

```
falta:      nome · categoria · preco · quantidade · foto
bloqueios:  sem_r2 · sem_preparador · foto_nao_preparada
```

---

## 2. O pipeline, e quem escreve cada estado

`GET /api/catalogo/publicacao` → `itens[].estado`

| Estado | Rótulo | Calculado ou gravado |
|---|---|---|
| `falta_informacao` | Falta informação | calculado — nunca persistido |
| `pronto_para_preparacao` | Pronto para preparação | calculado |
| `em_preparacao` | Em preparação | gravado ao abrir tarefa |
| `preparado` | Conteúdo preparado | gravado pelo executor |
| `aguardando_aprovacao` | Aguardando aprovação | gravado |
| `aprovado_para_publicar` | Aprovado para publicar | gravado por `aprovar` |
| `publicando` | Publicando | gravado **antes** da chamada externa |
| `publicado` | Publicado | gravado pelo publicador |
| `falhou_ao_publicar` | Falhou ao publicar | gravado pelo publicador |
| `despublicado` | Despublicado | gravado pelo ato de despublicar |

Duas armadilhas de leitura:

- `estadoObservado: true` significa que aquele `publicado` **não** é decisão
  nossa: é `url_loja` sendo lido. É o caso das 627 peças que já estavam na
  loja antes desta fase. A tela pode mostrar diferente — "está na loja" em
  vez de "publicamos" — e deveria;
- `aprovacaoInvalidada: true` significa que a peça mudou depois do
  "aprovar" e a aprovação caiu sozinha. É informação, não erro: alguém
  precisa revisar e aprovar de novo.

---

## 3. O que cada tela precisa conseguir mostrar

As necessidades de UX que o domínio **obriga** (§ 11 da auditoria), com o
campo que responde cada uma:

### Por peça

| # | Precisa mostrar | Campo |
|---|---|---|
| 1 | foto nossa · só o endereço da loja · nenhuma (**três** estados) | `temFotoPropria` · `temEnderecoDaLoja` · nem um nem outro |
| 2 | tem versão preparada, e se o serviço sequer existe | `temTratada` + `bloqueios` |
| 3 | quantas fotos e qual é a principal | `GET /api/produtos/:sku/galeria` |
| 4 | publicado / não publicado, e que "publicado" pode ser observação | `estado` + `presencaNaLoja` + `estadoObservado` |
| 5 | o que falta, **uma lista só** | `falta[]` |
| 6 | variações, e alguma sem `variante_id` | `GET /api/produtos/:sku/variacoes` |
| 7 | é kit · é componente | `GET /api/produtos/:sku/dependencias` |
| 8 | total em estoque **e** quanto está em casa | `qtd` e `casa` |
| 9 | sem preço é bloqueio, não aviso | `falta` contém `preco` |
| 10 | arquivado, com data e motivo | `GET /api/produtos/:sku/dependencias` |
| 11 | só na loja · candidato a criar | `POST /api/sync/analisar` |
| 12 | a aprovação caiu porque os dados mudaram | `aprovacaoInvalidada` |

### Por categoria

`GET /api/categorias` devolve, por linha: `id`, `nome`, `ordem`, `cor`,
`sentinela`, `pecas`, `pecasAtivas`, `orfa`, `podeRenomear`, `podeArquivar`.

- `sentinela: true` é a linha `Sem categoria`. **Não é uma categoria** — não
  se renomeia, não se arquiva, e a tela deveria apresentá-la como estado, não
  como opção ao lado das outras;
- `orfa: true` é categoria sem peça nenhuma. Não é erro;
- `podeRenomear` / `podeArquivar` existem exatamente para a tela não oferecer
  o que a API vai recusar.

### Por lote / operação

| Precisa mostrar | Onde |
|---|---|
| o que a próxima sincronização faria | `POST /api/sync/analisar` |
| o que ela decidiu **não** fazer, e por peça | `semEmpurrar[]` |
| fotos órfãs esperando decisão | `GET /api/fotos/orfas` |
| peças novas na fila | `GET /api/produtos/pendentes` |
| preço local ≠ preço da loja | `GET /api/catalogo/precos/divergentes` |

Os três erros têm lugares diferentes e não podem virar um "erro" só:
`foto_erro` ≠ `preparo_erro` (`bloqueioExterno`) ≠ `publicacao_erro`.

---

## 4. Galeria

```
GET    /api/produtos/:sku/galeria
POST   /api/produtos/:sku/galeria              bytes no corpo; X-Arquivo, X-Principal
PUT    /api/galeria/:id/preparada              bytes no corpo
POST   /api/galeria/:id/aprovar                { aprovadaPor }
DELETE /api/galeria/:id
POST   /api/produtos/:sku/galeria/principal    { fotoId }
POST   /api/produtos/:sku/galeria/ordem        { ordem: [fotoId, ...] }
```

- **os bytes vão no corpo, sem envelope JSON.** Base64 infla 33% um arquivo
  que já chega com `Content-Type` do navegador;
- a **primeira** foto de uma peça vira principal sozinha. Da segunda em
  diante, quem decide é gente;
- a ordem devolvida é `principal DESC, ordem, criado_em, id`. A tela pode
  confiar nela;
- `POST .../ordem` ignora id que não é daquela peça e **diz** quais ignorou
  (`ignorados[]`);
- apagar a principal promove a próxima (`novaPrincipal`);
- sem R2 no ambiente, toda escrita de bytes responde
  `503 { bloqueio: "sem_r2" }`. **Isso não é erro de quem clicou.**

---

## 5. Upload em lote — três chamadas, nesta ordem

```
POST /api/fotos/lotes                      { arquivos: ["132721.jpg", ...] }
PUT  /api/fotos/lotes/:id/arquivo/:nome    bytes de UM arquivo
POST /api/fotos/lotes/:id/confirmar
```

A primeira **não grava byte nenhum** (`gravouBytes: false`) e devolve o
casamento para a pessoa conferir. A tela deveria mostrar esse ensaio e
esperar — é o ponto inteiro de o lote existir.

O upload é **um arquivo por requisição**, de propósito: é o que faz um
arquivo ruim não derrubar os outros 300. A tela envia em sequência (ou com
concorrência baixa) e vai marcando; uma requisição que falha marca só aquele
arquivo.

Situações que o lote produz, e a tela precisa saber desenhar todas:

| Situação | O que dizer |
|---|---|
| `vinculado` | casou |
| `multiplas` | é a 2ª, 3ª… foto do mesmo código — **não é erro** |
| `sku_nao_encontrado` | o código não existe no catálogo |
| `nome_ambiguo` | dois códigos poderiam ser o dono; renomear resolve |
| `nome_invalido` | o nome não produz candidato nenhum |
| `duplicado` | mesmo arquivo, ou mesma imagem já na galeria |
| `erro_upload` | o R2 recusou ou não respondeu |

`confirmar` **reconta** a partir das linhas: o resumo final não repete o
número otimista da análise.

---

## 6. Preparação de conteúdo

```
POST /api/catalogo/preparacao/tarefas                    { skus?, campos? }
GET  /api/catalogo/preparacao/tarefas?estado=pendente
POST /api/catalogo/preparacao/tarefas/:id/entregar       { executor }
POST /api/catalogo/preparacao/tarefas/:id/resultado      { resultado: {...}, executor }
POST /api/catalogo/preparacao/tarefas/:id/falhou         { erro }
POST /api/catalogo/preparacao/tarefas/:id/cancelar
```

`POST .../tarefas` **sem `skus`** abre tarefa para toda peça pronta — é o
"prepare todos os produtos novos de hoje". A resposta separa `abertas`,
`jaTinhamTarefa` e `recusados` (com o motivo e o que falta em cada uma).

`executor` é **rótulo livre**. A tela não deve oferecer uma lista fechada de
fornecedores nem escrever nome de fornecedor em lugar nenhum.

`resultado` responde `publicado: false` explicitamente. A tela **nunca**
deve dizer "publicado" depois de uma preparação.

---

## 7. Publicação — o que existe e o que está desligado

```
POST /api/catalogo/publicacao/:sku/preparar
POST /api/catalogo/publicacao/:sku/previa
POST /api/catalogo/publicacao/:sku/aprovar
POST /api/catalogo/publicacao/:sku/reabrir
POST /api/catalogo/publicacao/:sku/repetir
POST /api/catalogo/publicacao/:sku/publicar       { seco?, publicarNaVitrine? }
POST /api/catalogo/publicacao/:sku/despublicar    { seco?, motivo? }
POST /api/catalogo/publicacao/rodada              { seco?, forcar? }
```

**Toda chamada de publicação é seca por padrão.** `seco` só deixa de valer
quando o corpo traz `false` explícito — e mesmo assim a escrita depende de
`NUVEMSHOP_PUBLICACAO_ENABLED`, que não está declarada em ambiente nenhum.
Hoje, portanto, **nenhuma tela consegue publicar de verdade**, e ela deve
dizer isso em vez de oferecer um botão que devolve simulação.

O ensaio devolve `enviaria` com o corpo **exato** que subiria. A tela deveria
mostrar isso, não um resumo.

`rodada` pausa acima de 20 peças aprovadas (`pausado: true`) e espera
`forcar: true`. Não é erro: é um freio.

---

## 8. Categorias

```
GET   /api/categorias
POST  /api/categorias                  { nome, ordem?, cor? }   cria ou atualiza
PATCH /api/categorias/:id              { nome }                 renomeia
POST  /api/categorias/:id/arquivar
```

O `:id` é `categorias.id`, **não** o nome — é isso que permite renomear. Um
nome que colapsa para uma categoria existente (caixa, espaço) atualiza aquela
em vez de criar outra: a tela não precisa checar antes.

Mesclar **não existe** e não deve ter botão.

---

## 9. O que a API recusa, e com qual mensagem

A tela não precisa reimplementar nenhuma destas validações — todas voltam com
texto pronto para mostrar:

| Ato | Recusa quando | Código |
|---|---|---|
| editar categoria da peça | a categoria não existe | 400 + `categoriasDisponiveis[]` |
| editar status | não é ativo/inativo/arquivado | 400 + `statusValidos[]` |
| editar `qtd` | sempre (§19) | 400 |
| renomear categoria | o nome já existe | 409 |
| arquivar categoria | ainda tem peça | 409 + `pecas` |
| aprovar | não está aguardando, ou falta algo | 409 + `faltam[]` |
| publicar | não está aprovado, ou a assinatura caiu | 409 + `aprovacaoInvalidada` |
| excluir peça | tem histórico em qualquer das 16 FKs | 409 + `bloqueios[]` + `alternativa: 'arquivar'` |

---

## 10. O que NÃO existe, e não deve ser desenhado

- mesclar categorias;
- despublicar automático ao arquivar;
- correção automática de preço divergente;
- publicação sem aprovação humana;
- qualquer menção a fornecedor de IA na tela.
