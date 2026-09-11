# Saídas sem faturamento — integração do workstream Claude

- **Data da integração:** 2026-09-09
- **Baseline:** `main@b08734fa737a96efb515de713677a994eb34cec1`
- **Origem auditada:** `claude/nonrevenue-migration-prep`, commits `87732d3`
  e `0a9df94`
- **Natureza:** regra de domínio + evidência histórica + preparação de
  operação de reconciliação; não é migration de schema
- **Estado:** integrado sem escrita em PROD

## Fato observado

O workstream analisou uma cópia local de um export de produção e identificou
37 linhas históricas candidatas a sair das métricas de venda: 32 propostas
como `uso_proprio`, 2 como `brinde` e 3 como `perda`. O ensaio registrado em
`0a9df94` aplicou as 37 propostas na cópia e observou:

| Medida | Antes | Depois | Delta observado |
|---|---:|---:|---:|
| faturamento histórico | R$ 128.780,71 | R$ 127.680,71 | -R$ 1.100,00 |
| vendas | 711 | 681 | -30 |
| peças vendidas | 1.391 | 1.357 | -34 |
| tickets elegíveis | 681 | 664 | -17 |

No mesmo ensaio, soma de estoque, soma do razão e quantidade de movimentos
permaneceram inalteradas; a segunda inserção foi bloqueada pelo índice único e
o rollback restaurou as métricas. Esses números são **evidência histórica do
dump usado**, não snapshot atual de PROD e não autoriza aplicar as 37 linhas.

O ensaio tinha limitações importantes: inseria diretamente em
`historico_reclassificacao`, não exercitava a rota oficial e não criava linhas
em `saidas_sem_faturamento`. Portanto ele prova a exclusão das métricas, a
invariante do estoque, a constraint de idempotência e o rollback local; não
prova o histórico operacional completo da saída.

## Decisão implementada no conhecimento

- Brinde, uso próprio, perda e sorteio são os tipos estruturais de saída sem
  faturamento.
- Diferença negativa encontrada em Inventário e confirmada como perda/peça
  ausente é `perda`, relacionada ao inventário.
- “ACHO QUE FOI VENDIDO” é observação, não tipo nem motivo estrutural. A frase
  isolada continua sem autorizar aplicação automática; a confirmação humana é
  que decide o fato.
- O caso “ACHO...” dentro das 37 propostas permanece de baixa confiança até a
  confirmação da baixa; quando confirmado como perda/diferença, a classe é
  `perda`.

## Decisão posterior sobre “Sorteio”

Na integração original, “Sorteio” ficou pendente. A decisão humana posterior de
09/09/2026 encerrou essa pendência: peça destinada a sorteio é saída sem
faturamento `sorteio`, distinta de `brinde`, e pode ser filtrada e relatada por
essa categoria.

## Suporte do modelo atual

| Requisito | Situação atual |
|---|---|
| tipo `perda` | suportado |
| tipo `sorteio` | suportado no código e no schema de instalação nova; banco existente exige migration de CHECK ainda não aplicada |
| motivo | suportado em `saidas_sem_faturamento` e `historico_reclassificacao` |
| observação | suportada na saída e preservada na linha histórica de origem |
| origem de inventário | parcial: movimento novo aceita origem `inventario`, mas reclassificação histórica não aponta para sessão/item de inventário |
| histórico operacional da saída reclassificada | lacuna: a aplicação atual só grava `historico_reclassificacao` |
| custo histórico corrigível | não suportado; não há campo/evento de custo nem trilha anterior/novo. Confirmado em 11/09/2026: **zero ocorrências de custo em `api/schema.sql`**. Desenho proposto em [CUSTO-HISTORICO-AUDITAVEL.md](../architecture/CUSTO-HISTORICO-AUDITAVEL.md) (`P12`) |
| rollback auditável | lacuna: a operação atual apaga a decisão; reverte métricas, mas não preserva quem/quando/por quê desfez |

A origem de inventário pertence à fronteira de Estoque/Inventário da Fase 4.
O custo histórico e sua correção auditável pertencem à Fase 5, com trilha
própria de schema/data e sem UI nesta integração.

## Classificação dos artefatos de origem

| Arquivo | Commit | Finalidade | Classificação | Conflito com `main` | Ação |
|---|---|---|---|---|---|
| `RELATORIO-FASE1.md` | ambos | auditoria/evidência | documentação histórica | afirma uma segunda escrita que o código não faz e traz dado real | **B**: síntese corrigida neste documento |
| `auditar-prod.py` | `87732d3` | auditoria de dump | script operacional one-off | hardcodes de dados reais | **D**: preservar no commit de origem |
| `conferencia.sql` | `87732d3` | conferência read-only | SQL operacional | espera todas as propostas aplicadas | **C**: incorporar critérios reproduzíveis em teste e registrar aqui os demais como lacunas |
| `gerar-manifesto.py` | `87732d3` | gerar decisões | script operacional one-off | hardcodes e saída com dados reais | **D**: preservar no commit de origem |
| `manifesto-nao-venda.json` | `87732d3` | alvos reais | evidência sensível | PII e hash inconsistente | **E**: não integrar |
| `migrar-nao-venda.mjs` | `87732d3` | aplicar pela API | script operacional | autenticação incompatível e aplicação incompleta | **E**: não integrar |
| `patch-hook-leitura-prod.md` | `87732d3` | proposta de governança | proposta superada | contradiz a política production-first atual | **E**: não integrar |
| `ensaio-antes-depois.py` | `0a9df94` | prova local | teste/evidência | dump/caminho real e SQL direto | **B**: adaptar a regra/idempotência/rollback para teste hermético e manter os agregados como evidência; os demais critérios continuam sem prova E2E reproduzível |

## São dois assuntos, não um (11/09/2026)

Decisão de `DR-007`: **o schema e o histórico deixam de ser tratados como uma
coisa só.** Juntá-los escondia que um deles já estava auditado e o outro nem
começado, e fazia "aplicar a migration" parecer resolver ambos.

| | Assunto | Pendência | Estado |
|---|---|---|---|
| 1 | Migration de schema que admite `sorteio` como tipo | `P11` | não executada; produção ainda tem `CHECK` de **3** tipos |
| 2 | Reclassificação do histórico já importado (37 linhas) | `P17` | regra e evidência integradas; **execução não autorizada** |

O assunto 2 **não precisa do assunto 1**: os três tipos de destino das 37
linhas (`uso_proprio`, `brinde`, `perda`) já cabem no `CHECK` atual de
produção. A única das 37 que esbarra em `sorteio` é o registro de confiança
média (`Sorteio (Feira Franceschini)`), e ele depende de decisão humana antes
de qualquer coisa.

Estado de produção medido por leitura em 11/09/2026:

```sql
saidas_sem_faturamento.tipo   CHECK (tipo IN ('brinde', 'uso_proprio', 'perda'))
saidas_sem_faturamento        0 linhas
historico_reclassificacao     0 linhas
vendas_historico_itens        1.375 linhas
```

`api/schema.sql` já declara os quatro tipos, então instalação nova nasce certa
e banco migrado não — a mesma divergência registrada em `ARQ-007`.

## Direção futura: os quatro tipos são o padrão, não o teto

Decisão de produto de 11/09/2026: a Sthefany deverá poder **criar tipos novos
pela interface**. `brinde`, `uso_proprio`, `perda` e `sorteio` passam a ser os
tipos que o sistema já traz, não a lista fechada.

Isso condena o modelo atual, e a razão é mecânica: cada tipo está preso num
`CHECK` em **duas** tabelas, e ampliar um `CHECK` no SQLite exige **reconstruir
a tabela**. A migration do `sorteio` é a prova — ela faz `DROP TABLE` de duas
tabelas para acrescentar uma palavra. Uma migration destrutiva por tipo novo
não é um caminho que se possa oferecer a um botão de interface.

A direção correta, quando isso for implementado — **não é autorização, e nada
disso existe hoje**:

- os tipos viram **dados**, numa tabela própria, com chave estrangeira
  substituindo o `CHECK`;
- os tipos que o sistema traz são marcados como **de sistema** e não podem ser
  apagados, porque regra de negócio depende deles (`perda` é o único que aceita
  `sentido = 'entrada'`, e essa trava precisa continuar existindo);
- tipo criado pela usuária **desativa, nunca apaga** — apagar órfã o histórico
  que aponta para ele;
- a regra por tipo (se soma ou só subtrai, se entra em relatório de brinde) tem
  que morar junto do tipo, senão volta tudo para o código.

Registrado no [Master Plan § 46.1](../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md).

## Limites desta integração

- nenhum contrato HTTP foi criado ou alterado;
- nenhuma migration foi adicionada ao fluxo forward;
- nenhum manifesto com IDs ou dados reais foi versionado;
- nenhuma reclassificação foi aplicada;
- nenhum estoque, D1 remoto, Nuvemshop, deploy ou cron foi tocado;
- Fase 1 e Fase 2 do Master Plan não foram iniciadas.
