# Estratégia de contexto e economia de tokens

Como trabalhar neste repositório com Claude Code gastando o mínimo de
contexto **sem** perder as regras que protegem estoque real.

Economizar token aqui não é avareza: contexto cheio é contexto que esquece,
e um agente que esqueceu a regra do "código virgem" é mais caro que qualquer
janela de contexto.

## O tamanho do problema

| Arquivo | Linhas | Custo aproximado se lido inteiro |
|---|---|---|
| `src/dashboard.tpl.html` | 3.802 | ~50k tokens |
| `dashboard.html` (gerado) | ~9.000 | **nunca leia** — é build, com SheetJS embutido |
| `index.html` (fonte da tela de Etiquetas) | grande | **nunca leia inteiro** — CSS + SheetJS embutidos, `grep`/`sed -n` como no template |
| `api/src/index.js` | 856 | ~11k tokens |
| `api/src/sync.js` | 544 | ~8k tokens |
| `api/REGRAS.md` | 289 | ~5k tokens |
| `api/schema.sql` | 278 | ~4k tokens |

Ler "só o essencial" de forma ingênua já custa 80k tokens. As oito táticas
abaixo derrubam isso para poucos milhares na maioria das tarefas.

---

## 1. `CLAUDE.md` curto, como roteador

O `CLAUDE.md` da raiz entra em **toda** conversa. Cada linha nele é paga
sempre, em toda tarefa, mesmo nas que não precisam daquela informação.

Por isso ele guarda só: identidade do projeto, as regras que **nunca** podem
ser violadas, e o mapa de onde procurar o resto. Nada de esquema de tabela,
nada de assinatura de função, nada de história de decisão.

**Regra prática:** se a informação só importa em algumas tarefas, ela não
pertence ao `CLAUDE.md`.

## 2. Progressive disclosure

O detalhe mora em documento específico, carregado só quando o assunto
aparece:

```
Regras de negócio  → api/REGRAS.md
Arquitetura        → docs/ARCHITECTURE.md
Banco              → docs/DATA_MODEL.md
Nuvemshop          → docs/NUVEMSHOP_INTEGRATION.md
Sincronização      → docs/SYNC_ENGINE.md
Segurança          → docs/SECURITY.md
Backup             → docs/BACKUP_RECOVERY.md
Testes             → docs/TESTING.md
Ambiente local     → docs/DEVELOPMENT.md
```

Uma tarefa de front não precisa de `DATA_MODEL.md`. Uma tarefa de banco não
precisa de `NUVEMSHOP_INTEGRATION.md`. **Carregue o que a tarefa pede, e
pare.**

## 3. Skills sob demanda

As skills de `.claude/skills/` custam quase nada até serem invocadas: o que
fica em contexto permanentemente é o nome e a descrição de uma linha. O
corpo entra só quando a tarefa combina.

| Skill | Entra quando |
|---|---|
| `marquesa-context` | precisa entender uma regra de negócio |
| `marquesa-sync` | Nuvemshop, pedidos, SKU, variantes, `sync.js` |
| `marquesa-safe-import` | CSV, planilha, catálogo, importação |
| `marquesa-reconciliation` | divergência, duplicado, conflito, revisão |
| `safe-d1-change` | schema, migration, índice, D1 |
| `pre-deploy-check` | antes de qualquer deploy |

Cada uma **aponta** para as fontes em vez de copiá-las. Uma skill que
duplica o `REGRAS.md` recria o problema que a skill existia para resolver.

## 4. Subagente de exploração

`.claude/agents/repo-explorer.md` é somente leitura e roda em contexto
próprio. Ele lê 40 arquivos e devolve dez linhas; os 40 arquivos morrem com
ele, e o contexto principal recebe só a resposta.

**Use para:** "onde acontece X?", "o que chama Y?", "quais rotas tocam a
tabela Z?", "esta regra tem teste?".

**Não use para:** editar, ou para perguntas cuja resposta você já tem.

O ganho é maior justamente nas buscas que dariam errado algumas vezes antes
de acertar — o custo das tentativas fica fora do contexto principal.

## 5. Busca dirigida antes de abrir arquivo grande

**Nunca** abra `src/dashboard.tpl.html` inteiro. Localize e leia a faixa:

```bash
grep -n "montarMaleta" src/dashboard.tpl.html      # acha a linha
sed -n '1240,1310p' src/dashboard.tpl.html         # lê só o trecho
```

Vale para qualquer arquivo acima de ~400 linhas. Para `api/src/index.js`, a
lista de rotas sai com uma linha:

```bash
grep -nE "path === '|path.match" api/src/index.js
```

E **nunca** leia `dashboard.html` inteiro: é gerado e carrega o SheetJS
embutido (250 KB de biblioteca minificada). A fonte é `src/dashboard.tpl.html`.
`index.html` (fonte da tela de Etiquetas) carrega o mesmo SheetJS — também
não leia inteiro, mas é editável com `grep`/`sed -n` como o template.

## 6. Uma regra, uma fonte

Cada regra tem **um** dono:

| Assunto | Dono | Os outros documentos |
|---|---|---|
| Por que a regra de negócio é assim | `api/REGRAS.md` | apontam |
| O que cada tabela guarda | `api/schema.sql` | explicam o porquê, não repetem colunas |
| Fluxo da sincronização | `docs/SYNC_ENGINE.md` | apontam |
| O que pode e o que não pode ser executado | `docs/SECURITY.md` | apontam |

Duplicar não custa só tokens: cria duas versões da verdade que divergem na
primeira mudança, e aí o agente escolhe a errada.

## 7. Respostas intermediárias curtas

Durante implementação: mostre o diff, não o arquivo. Diga o que mudou, não
recite o que leu. Relatório longo só no fim, e só se pedirem.

Cada resumo intermediário de 500 palavras é meio arquivo de código que não
caberá mais adiante na mesma conversa.

## 8. Isolamento de contexto

Pesquisa, auditoria e varredura devem acontecer **fora** do contexto
principal — no subagente. O que volta é a conclusão.

Vale especialmente para: procurar segredo no repositório, mapear todas as
chamadas de uma função, conferir se uma regra tem teste, inventariar rotas.

---

## Receita por tipo de tarefa

Ponto de partida sugerido. Carregue mais só quando faltar.

| Tarefa | Carregue | Não carregue |
|---|---|---|
| Ajuste de tela | trecho do `dashboard.tpl.html` | `REGRAS.md`, `schema.sql`, tudo de `docs/` |
| Nova rota da API | `index.js` (trecho) + `state.js` + `DATA_MODEL.md` | front, `sync.js` |
| Mexer na sincronização | `SYNC_ENGINE.md` + `sync.js` + regras 4, 6, 7, 8 do `REGRAS.md` | front, inventário, comissão |
| Mudar o schema | skill `safe-d1-change` + `schema.sql` + `DATA_MODEL.md` | front |
| Investigar bug de estoque | `estoque.js` + `REGRAS.md` §19 + `GET /api/estoque/conferir` | tudo o mais |
| "Onde fica X?" | **só o subagente** | nada |
| Deploy | skill `pre-deploy-check` | nada |

## Antipadrões

- Ler `dashboard.html` inteiro (gerado) ou `index.html` inteiro (fonte, mas
  enorme) — os dois carregam o SheetJS embutido.
- Ler `api/REGRAS.md` inteiro para uma tarefa de CSS.
- Copiar o `REGRAS.md` para dentro do `CLAUDE.md` "para o agente não
  esquecer". Ele passa a pagar por isso em toda tarefa, e esquece assim
  mesmo quando o contexto encher.
- Abrir os 9 arquivos de `api/src/` "para entender o sistema". O
  `ARCHITECTURE.md` tem a tabela de responsabilidades.
- Pedir ao subagente que edite. Ele é somente leitura de propósito.
- Fazer o agente reler um arquivo que ele acabou de editar para conferir.

## Como medir

Se uma tarefa simples está consumindo mais de ~30k tokens de leitura, algo
foi carregado sem necessidade. As duas causas mais comuns, nesta ordem:
abrir `dashboard.tpl.html` inteiro, e ler documentação que a tarefa não
pedia.
