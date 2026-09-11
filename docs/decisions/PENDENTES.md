# Decisões humanas pendentes

Lista viva do que **nenhum refactor pode decidir sozinho**. Não é ADR: ADR
registra decisão tomada; aqui fica o que ainda não foi. Enquanto um item
estiver aberto, o código não deve inferir a resposta — deve falhar fechado,
preservar o comportamento atual e dizer que parou.

Origem: § 50 do
[plano mestre](../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md), mais
o que apareceu depois dele.

**`P*` e `DR-*` são a mesma coisa vista de dois lugares.** `P1..P17` (aqui) é a
pergunta na forma em que ela trava uma fase da arquitetura; `DR-002..DR-014`
(no [PROJECT-STATUS.md](../project/PROJECT-STATUS.md)) é a mesma pergunta na
forma em que ela chega ao Gustavo. A correspondência está na tabela de
`## DECISIONS MADE` de lá. Quando divergirem, **este arquivo é a fonte** para o
conteúdo da regra, e o PROJECT-STATUS é a fonte para o estado da tarefa.

| # | Pendência | Trava qual fase | Estado |
|---|---|---|---|
| P1 | Fonte operacional e frequência real do cron de sync | Fase 7 | **fechada (11/09/2026)** — verificação read-only |
| P2 | Semântica definitiva de giro e comissão | Fase 6 | **aberta — aguarda Sthefany** |
| P3 | Regra de preço para material bruto versus banhado | Fase 5 | aberta |
| P4 | Fonte única dos parâmetros de planejamento | Fase 9 | **fechada (11/09/2026)** — reserva é parâmetro, não trava |
| P5 | Por quanto tempo manter o fallback do legado | Fase 11 | **fechada (11/09/2026)** — ~30 dias somente leitura |
| P6 | Quais fluxos compõem o Pacote 5 | trilha de features | **fechada (11/09/2026)** — não existe escopo obrigatório |
| P7 | Quando identidade individual passa a ser necessária | Fase 3 (auth) | **fechada (11/09/2026)** — roadmap pós-validação |
| P8 | Se haverá publicação externa de catálogo, e com quais freios | trilha de features | direção decidida (10/09/2026); **critério de ativação fechado em 11/09**; ligar continua pendente |
| P9 | Política de R2/mídia em produção | Fase 3 | direção decidida (10/09/2026); **política de ambiente e migração fechadas em 11/09**; habilitar continua pendente |
| P10 | SLO e nível de observabilidade esperado | Fase 3 | **fechada (11/09/2026)** — observabilidade prática, sem SLA formal |
| P11 | Quando aplicar `api/migracao-sorteio-saida-sem-faturamento.sql` | trilha de release | aberta — **escopo reduzido**: só o schema, ver P17 |
| P12 | Desenho da correção auditável de custo histórico | Fase 5 | **regra fechada; desenho proposto (11/09/2026)**, implementação não autorizada |
| P13 | Política de preço divergente local × Nuvemshop | Fase 4.5 / 7 | **fechada (11/09/2026)** — preço cadastral × transacional |
| P14 | Mesclar duas categorias numa: o que acontece com o histórico de relatório | Fase 4.5 | **fechada (11/09/2026)** — não reescreve o passado |
| P15 | Arquivar uma peça deve despublicá-la da loja? | Fase 4.5 | **fechada (11/09/2026)** — sim, mas nunca por estoque zero |
| P16 | Categorias da loja: mapear com as nossas, ou continuar ignorando | Fase 7 | **fechada (11/09/2026)** — entidades distintas, mapeáveis |
| P17 | Reclassificação do histórico de não-vendas já importado | trilha de release | **aberta** — auditoria pronta, execução não autorizada |

## Detalhe do que está travado

**P2 — giro e comissão. Aguarda Sthefany.** Aparece nos fluxos de maleta, mas
não tem regra fechada. A pergunta específica que falta, formulada em
11/09/2026: quando há desconto no acerto de uma revendedora, a comissão incide
sobre o **preço original** ou sobre o **valor final após o desconto**? E existe
diferença de tratamento entre desconto **autorizado pela Sthefany** e desconto
**concedido pela própria revendedora**? Enquanto isso não for respondido, a
Fase 6 caracteriza e preserva o comportamento existente; inventar semântica de
giro durante a extração continua proibido. Note que `maletas.acerto_json` já
guarda a comissão real do acerto, então o histórico não depende desta resposta
— só o cálculo dos acertos futuros depende.

**P3 — material bruto versus banhado.** Continua aberta e não foi tocada em
11/09/2026. Relacionada à faixa de comissão das banhadas, que o
[api/REGRAS.md](../../api/REGRAS.md) marca como pendente de conferência no
contrato.

**P11 — migration do sorteio. Escopo reduzido em 11/09/2026.** Esta pendência
passou a tratar **exclusivamente do schema**. A reclassificação do histórico
saiu daqui e virou **P17**, logo abaixo: são dois atos de tamanhos diferentes,
e juntá-los escondia que um deles já estava auditado e o outro não tinha sido
começado.

Estado medido em produção por leitura (`SELECT sql FROM sqlite_master`,
11/09/2026):

```sql
saidas_sem_faturamento.tipo      CHECK (tipo IN ('brinde','uso_proprio','perda'))
```

Ou seja: **`sorteio` não cabe em produção hoje**. Já cabe em `api/schema.sql`
(linhas 1371 e 1461), então banco criado do zero nasce com os quatro tipos e
banco migrado não — mais uma face do `ARQ-007`. A migration reconstrói duas
tabelas (`DROP TABLE`), operação sensível em SQLite, e **não foi executada em
produção**. Não pertence à trilha de refatoração.

**P12 — custo histórico. Regra fechada, desenho proposto, implementação não
autorizada.** Requisito confirmado: corrigir custo histórico sem sobrescrever o
passado, preservando valor anterior, valor corrigido, motivo, autor, data e
rastreabilidade, sem confundir preço de venda com custo. Verificação de
11/09/2026: **não existe conceito de custo em lugar nenhum** — zero ocorrências
em `api/schema.sql` e nenhuma coluna de custo em `produtos`, que só tem `preco`.
Isto é terreno limpo, não correção de algo existente. O desenho mínimo proposto
está em
[CUSTO-HISTORICO-AUDITAVEL.md](../architecture/CUSTO-HISTORICO-AUDITAVEL.md);
ele é proposta, não autorização.

**P17 — reclassificar o histórico de não-vendas.** Separada de P11 em
11/09/2026. Trinta e sete linhas do histórico importado de planilha são saídas
sem faturamento registradas como venda — 32 `uso_proprio`, 2 `brinde`, 3
`perda`. A regra e a evidência **já foram integradas ao conhecimento** em
09/09/2026, a partir da branch `claude/nonrevenue-migration-prep`: ver
[SAIDAS-SEM-FATURAMENTO.md](../domains/SAIDAS-SEM-FATURAMENTO.md), que também
classifica artefato por artefato o que foi integrado e o que ficou
deliberadamente no commit de origem.

O que falta é **autorização humana para executar**, mais duas decisões de
classificação que o sistema não toma sozinho: um registro com observação
`Sorteio (Feira Franceschini)` (confiança **média** — sorteio é brinde para
quem ganha, não retirada pessoal) e um `ACHO QUE FOI VENDIDO` (confiança
**baixa**; a frase é observação, não categoria).

**O ensaio não prova tudo, e a diferença importa.** Ele inseriu direto em
`historico_reclassificacao`, sem exercitar a rota oficial e sem criar linha em
`saidas_sem_faturamento`. Portanto prova a exclusão das métricas, a invariante
do estoque, a idempotência e o rollback local — e **não** prova o histórico
operacional completo da saída. Os números são evidência do dump usado, não
snapshot atual de produção.

Três travas que qualquer execução futura tem que respeitar, todas medidas e não
supostas:

1. **Endereçar por `cliente_id`, nunca por nome.** O cadastro em produção é
   `Sthefany Marques` (#64). Um filtro por nome pegaria R$ 3.989,51 de venda
   real de nove clientes legítimas com sobrenome Marques.
2. **Não criar movimento de estoque.** A importação histórica nunca movimentou
   peça; baixar agora inventaria 37 unidades que nunca saíram e quebraria a
   razão contábil, que hoje fecha exata (1.487 = 1.487, zero SKU divergente).
   Simetricamente, o rollback não pode devolver peça.
3. **Não há migration nova a escrever.** As tabelas `saidas_sem_faturamento` e
   `historico_reclassificacao` já existem em produção, vazias, e a rota oficial
   já é idempotente, auditável e reversível.

## Decisões já fechadas que costumavam aparecer aqui

- **Saídas sem faturamento** têm quatro categorias: `brinde`, `uso_proprio`,
  `perda` e `sorteio`. Sorteio reduz estoque, não cria venda e não aumenta
  faturamento. Ver [SAIDAS-SEM-FATURAMENTO.md](../domains/SAIDAS-SEM-FATURAMENTO.md).
  Decidido também em 11/09/2026 que esses quatro são **o padrão, não o teto**:
  a Sthefany deverá poder criar tipos novos pela interface, o que torna o
  `CHECK` fixo um beco sem saída arquitetural. Direção no Master Plan § 46;
  nada a implementar agora.
- **"ACHO QUE FOI VENDIDO" não é categoria.** É observação. Diferença negativa
  de inventário confirmada entra como `perda`, com a observação registrada e
  rastreabilidade pelo histórico de saída sem faturamento.
- **Estratégia de evolução:** strangler incremental por contrato, registrado em
  [0002-strangler-incremental-por-contrato.md](0002-strangler-incremental-por-contrato.md).

**P8 — publicar de verdade.** A DIREÇÃO foi decidida por Gustavo em
10/09/2026: o produto nasce no Sistema Marquesa e a Nuvemshop é canal de
publicação. O writer existe (`api/src/catalogo/publicador.js`) e os estados
`publicando`, `publicado`, `falhou_ao_publicar` e `despublicado` deixaram de
ser valores mortos no schema. **O que continua pendente é ligar**:
`NUVEMSHOP_PUBLICACAO_ENABLED` não está declarada em ambiente nenhum, e toda
chamada é seca por padrão. Ligar é release próprio, depois de uma rodada seca
conferida. Ver [CATALOGO-MIDIA-PUBLICACAO-4-5.md § 10](../domains/CATALOGO-MIDIA-PUBLICACAO-4-5.md).

**Complemento de 11/09/2026 — o critério de ativação fechou.**
`NUVEMSHOP_PUBLICACAO_ENABLED` permanece desligada, e só poderá ser considerada
depois de, cumulativamente: V2 suficientemente concluída no DEV; dados de teste
realistas (cópia controlada de produção); fluxo de cadastro validado; R2 do DEV
quando necessário; dry-run mostrando exatamente o que subiria; e validação
humana antes da primeira escrita real. O que resta pendente é só o **ato de
ligar** — o critério não é mais a parte desconhecida.

**P9 — R2.** A direção foi decidida na mesma data: as fotos próprias da
Marquesa ficam no R2, e a medição que fechou a questão é que **158 das 160
peças ainda fora da loja não têm imagem em lugar nenhum** — a loja não pode
ser a fonte da foto delas porque elas não estão lá. O código foi estruturado
para receber o binding por release controlado e parou de EXIGIR R2 para
avançar de estado: sem ele, a resposta é `bloqueio: "sem_r2"`, que é
diferente de erro. **Habilitar o bucket em produção continua pendente** —
custo e release.

**Complemento de 11/09/2026 — política de ambiente e de migração.** O R2 de
**produção continua desligado**. Um bucket R2 **separado, de desenvolvimento**,
pode ser habilitado quando o DEV estiver corretamente estruturado — o binding
`marquesa-fotos-dev` já está declarado em `[env.staging]`.

Quando o R2 de produção for ativado no futuro, a primeira carga tem processo
próprio, e ele é **aditivo**: localizar as imagens que já existem dos produtos
na Nuvemshop → baixar/copiar → validar → armazenar no R2 → vincular ao
produto/SKU → conferir correspondência. **Nada é apagado da Nuvemshop durante
essa migração.** Ver o Master Plan § 46.

Decisão de ambiente registrada junto, porque é a mesma conversa: o **DEV deve
receber uma cópia/snapshot controlado dos dados reais de produção** para
teste. O DEV **nunca** aponta direto para o banco de produção, e a escrita real
na Nuvemshop permanece bloqueada nele (`NUVEMSHOP_WRITES_ENABLED = "false"`).
A medição que torna isso urgente está em `P17`: o DEV tem 29 tabelas contra 41
de produção, então **hoje o DEV não serve como referência de estado**.

## Fechadas em 11/09/2026

Sete pendências fecharam de uma vez, por decisão de Gustavo. Elas continuam
aqui — e não viram ADR — porque o valor está em saber **o que foi perguntado e
o que foi respondido**, não só a resposta.

**P1 — cron. Fechada por verificação read-only, não por decisão.** A pergunta
era se o estado implantado batia com o declarado. Bate, e a evidência é uma
cadeia, não uma leitura única:

| Evidência | O que diz |
|---|---|
| `api/wrangler.toml:109-110` e `:153-154` | `crons = []` nos **dois** ambientes |
| `git log -S"crons" -- api/wrangler.toml` | último commit a tocar `crons` é `69986ef`, de **22/08/2026** |
| `wrangler deployments list --name marquesa-api` | **10 deploys de produção depois disso**, o último em **09/09/2026 02:07 UTC** |

Como o `wrangler deploy` trata o `wrangler.toml` como fonte da verdade dos
triggers — e lista vazia **remove**, em vez de "deixar como está" —, cada um
desses 10 deploys reafirmou a lista vazia. **Não há divergência entre
documentação e código.** O `0 9,21 * * *` que aparece na documentação histórica
está no próprio `wrangler.toml` como comentário de *como repor*, nunca como
estado corrente.

O critério de religar também já estava escrito e não precisava ser inventado:
só depois do corte, com a produção nova validada e uma rodada seca
(`POST /api/sync {"seco": true}`) mostrando relatório limpo.

Lacuna residual, dita em voz alta: `wrangler deployments list` **não expõe os
cron triggers**. A conclusão acima é inferência forte a partir de configuração
mais 10 deploys posteriores, não leitura direta do agendador da Cloudflare.
Confirmar direto exigiria o painel ou a API de schedules. Como a resposta é
"desarmado" e a ação pretendida é "não religar", a lacuna não muda nada — mas
mudaria se algum dia a resposta fosse "ligado".

**P4 — parâmetros de planejamento. Reserva é parâmetro, não bloqueio.** A
reserva mínima é um **parâmetro de planejamento**: `estoque em casa − reserva
configurada = estoque matematicamente utilizável`. "Cabem quantas maletas"
expressa **capacidade matemática**, nunca uma recomendação de enviar tudo — a
operação também precisa de e-commerce, feiras, venda direta, variedade e
segurança de estoque. O limite que a Sthefany não quer cruzar é ter mais peça
circulando com revendedoras do que disponível com ela.

Consequência para o código: a reserva **avisa forte, mas não bloqueia** uma
decisão manual. Métrica que passa a valer a pena existir: a proporção entre
estoque em casa e estoque circulando com revendedoras.

**P5 — fallback do legado: ~30 dias, somente leitura.** Depois do go-live da
V2, o legado fica aproximadamente 30 dias em modo **somente leitura** — sem
receber venda nova, lançamento novo ou alteração. Serve para consulta,
comparação e segurança da transição. Passado o período, com a V2 estável e sem
dependências, pode ser arquivado ou desativado.

**P6 — Pacote 5 não existe.** Não há escopo obrigatório com esse nome. É
placeholder antigo, sem compromisso de implementação. Os próximos pacotes serão
definidos pelo estado real da V2. Qualquer documento que trate "Pacote 5" como
entrega devida está errado.

**P7 — identidade individual: roadmap pós-validação.** Não se implementa agora.
O destino é conhecido: redesenho do login, autenticação individual, criação de
usuários, perfis e permissões (Administrador, Funcionário, eventualmente
outros), identificação de quem realizou ações importantes e trilha de auditoria
por usuário. Entra **depois** da V2 validada. Ver o Master Plan § 46.

Isto tem efeito imediato sobre P12: um campo de autor de correção nasce hoje
como texto livre preenchido pela aplicação, e só vira chave estrangeira para
`usuarios` quando esta pendência sair do roadmap.

**P10 — observabilidade prática, sem SLA formal.** Não há stack enterprise nem
SLO numérico agora. O que se quer é baixo custo e utilidade real: erro 500,
falha de sincronização, cron, Nuvemshop, publicação, banco/migration, imagens,
divergência de estoque e demais falhas operacionais.

O destino é uma **Central de Notificações** ligada ao sino que já existe no
cabeçalho, recebendo eventos técnicos, operacionais, financeiros, de estoque,
inventário, garantias, pagamentos e integrações — com severidade, lida/não
lida, contexto, link para a origem e agrupamento de repetições. O critério que
mata o desenho errado: **não pode virar feed barulhento**.

**P13 — preço: cadastral × transacional.** O preço-base oficial é **sempre** o
cadastrado no Sistema Marquesa, e a Nuvemshop o recebe. Cupom, promoção ou
condição específica da loja alteram o **valor efetivamente pago numa venda** e
**não** alteram o preço cadastral.

Isso fecha o que estava aberto: a divergência que
`GET /api/catalogo/precos/divergentes` mede **não é defeito por si só**, e nada
no sentido loja → sistema corrige preço cadastral automaticamente. O que a rota
mede continua útil como sinal; o que ela não pode fazer é escrever de volta.

**P14 — mesclar categorias não reescreve o passado.** A partir da mesclagem, os
produtos passam a usar a categoria nova. O histórico anterior continua
permitindo saber qual era a classificação da época quando isso importar, e a
própria mesclagem fica **auditável**. A coluna `categorias.sucessora_id` existe
e continua sem ninguém escrevendo nela — agora com a regra que dirá como
escrever quando houver implementação.

**P15 — arquivar despublica; estoque zero não arquiva.** São dois estados
diferentes, e confundi-los era o risco:

| Estado | O que significa |
|---|---|
| `ativo` + estoque 0 | produto continua existindo, apenas "Sem estoque" |
| `arquivado` | **decisão manual** da Sthefany, nunca automática |

Arquivar tira a peça das listagens operacionais principais e a deixa de ficar
vendável/publicada na Nuvemshop quando a integração real estiver ativa. **Não
apaga nada**: histórico, SKU, fotos, movimentações e vendas permanecem, e a
peça pode ser reativada. Enquanto a publicação real estiver seca, arquivar
apenas **registra a necessidade** de despublicar.

A parte que fecha em definitivo: **estoque chegar a zero nunca arquiva sozinho**.

**P16 — categorias da loja: entidades distintas, mapeáveis.** Categoria interna
e categoria da Nuvemshop são coisas diferentes que podem ser **mapeadas** entre
si. Não depender de nomes iguais e não exigir espelhamento 1:1: a estrutura
interna serve estoque e relatório, enquanto a loja pode ter organização
comercial própria. O adapter já tem `categorias()` somente leitura; o que falta
é a tabela de mapeamento, que é trabalho, não decisão.
