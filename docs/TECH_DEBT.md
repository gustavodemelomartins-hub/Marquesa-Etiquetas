# Dívida técnica

Inventário honesto do que está torto, **sem consertar nada agora**. Cada
item traz o custo real de conviver com ele e o que uma correção exigiria.

Nada aqui é urgente por si só. O sistema funciona, a razão contábil fecha e
os testes passam. O valor deste documento é não redescobrir os mesmos
problemas daqui a três meses.

Ordem: risco para o dado > risco para a operação > incômodo de manutenção.

---

## 1. Migrations aplicadas à mão, sem controle de versão

**Onde:** `api/migracao-*.sql` (4 arquivos), aplicados copiando e colando no
console do D1 ou por `wrangler d1 execute`.

Não existe tabela de migrations, nem ordem declarada, nem registro do que já
foi aplicado em produção. `api/migracao-variacoes.sql` documenta isso no
próprio comentário: *"o ALTER TABLE falha se a coluna já existir, e esse erro
significa 'já foi aplicada' — pode ignorar"*.

**Custo:** ninguém consegue responder com certeza "o banco de produção está
no mesmo schema do `schema.sql`?". Um `ALTER TABLE` esquecido só aparece
quando uma query quebra em produção.

**Correção futura:** `wrangler d1 migrations` já existe nesta versão do
Wrangler e resolveria — mas adotá-lo exige mapear o estado atual de produção
antes, o que exige acesso remoto. Ver a skill `safe-d1-change`.

---

## 2. `src/dashboard.tpl.html` com 3.802 linhas num arquivo só

Markup, estado, regras de tela, formatação, gráficos e integração com a
câmera, tudo no mesmo arquivo.

**Custo concreto, não estético:**

- **Contexto.** Abrir o arquivo inteiro num agente consome dezenas de
  milhares de tokens por tarefa. Ver [CLAUDE_CONTEXT_STRATEGY.md](CLAUDE_CONTEXT_STRATEGY.md).
- **Estado global.** O objeto de estado é global e mutável; qualquer função
  pode escrever nele, e não há um lugar único onde olhar para saber quem
  mudou o quê.
- **Re-render completo.** A tela é redesenhada a partir do estado inteiro a
  cada mudança. Funciona bem no volume atual (centenas de produtos) e vai
  degradar antes de dar erro — o sintoma será lentidão na digitação, não uma
  exceção.
- **UI e regra misturadas.** Há decisão de negócio dentro de função de
  desenho (o que mostrar como "estoque errado no site", quando oferecer o
  botão de aplicar). Mudar a regra exige mexer na tela e vice-versa.

**O caminho escolhido foi outro, e melhor:** em vez de quebrar este arquivo,
um painel novo nasceu ao lado, em React + TypeScript + Vite (`frontend/`), e
as áreas migram uma por vez. O legado continua inteiro e funcionando enquanto
isso — ver [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md).

A primeira área migrada foi a Nuvemshop. Cada área que sair daqui reduz este
item; ele só fecha quando a última sair.

---

## 3. ~~Testes de navegador com caminho de binário fixo~~ — RESOLVIDO

`src/e2e.mjs`, `src/import-total-test.mjs` e `src/shot.mjs` traziam
`executablePath: '/opt/pw-browsers/chromium'` escrito no código, e por isso
só rodavam num Linux com esse caminho exato.

Agora os três honram `PW_CHROMIUM` quando ela existe e, sem ela, usam o
Chromium que o próprio Playwright instala. O `e2e` — o único teste que prova
que interface e API conversam — voltou a rodar, e o baseline subiu de 135
para 209 asserções.

Faltou um: `src/foto-modal-test.mjs` ficou com o caminho fixo até a
FASE 2, e por isso não rodava aqui. Agora honra `PW_CHROMIUM` como os
outros.

Junto veio uma segunda descoberta, resolvida **sem tocar em código**: o
`e2e` também falhava por CORS, porque o navegador do teste vem de
`localhost:8000` e o `wrangler.toml` libera só o endereço de produção. A
correção é `ORIGENS_PERMITIDAS=http://localhost:8000` no `.dev.vars`. O
sintoma na tela — *"Não encontrei a API neste endereço"* — parece erro de
rede e não é.

---

## 4. `reset-e-testar.sh` não roda no Windows

Usa `setsid` (ausente no Git Bash) e um `pkill` que não alcança o processo
do Wrangler no Windows. O resultado é que **não existe um comando único**
para rodar a suíte na máquina de desenvolvimento atual — o ciclo
derrubar/zerar/subir/rodar é feito à mão, teste a teste.

Agora que os cinco testes passam aqui, este virou o item de maior retorno da
lista: um runner portátil transformaria cinco sequências manuais em um
comando. A forma de derrubar o Wrangler que funciona no Windows está em
[BASELINE.md](BASELINE.md) e serviria de base.

Ver o passo a passo em [TESTING.md](TESTING.md).

---

## 5. `build.py` reescreve o arquivo inteiro com CRLF no Windows

`pathlib.Path.write_text` sem `newline=` usa a tradução de fim de linha da
plataforma. No Windows isso gera um diff de **4.248 linhas com zero mudanças
de conteúdo** — e um diff assim esconde qualquer mudança de verdade que
esteja no meio dele.

**Correção futura:** `write_text(out, encoding="utf-8", newline="\n")`. Uma
palavra. Ficou de fora por ser alteração de código.

Enquanto isso: `git diff --ignore-cr-at-eol`.

---

## 6. `npm run build` chama `python3`

`src/package.json` declara `"build": "python3 build.py"`. No Windows o
comando é `python`, e o script falha. O caminho que funciona é
`python src/build.py`.

---

## 7. Segurança proporcional, mas com limites já visíveis

Detalhes e justificativa em [SECURITY.md](SECURITY.md). Em forma de dívida:

| Item | Consequência |
|---|---|
| Senha única compartilhada em `localStorage` | Sem revogação por dispositivo; XSS entrega a chave |
| Sem log de auditoria | `movimentos` diz **o que** mudou, nunca **quem** mudou |
| Sem rate limiting | `/api/health` e o callback do OAuth são abertos |
| Comparação de chave não constant-time | Risco teórico neste porte, real se o sistema crescer |

O primeiro item que vira problema de verdade é o **log de auditoria**, no
dia em que mais de uma pessoa usar o painel.

---

## 8. Dry-run não é o caminho principal da interface

A rodada seca existe e funciona (`POST /api/sync {"seco": true}`), mas o
fluxo natural da tela é aplicar. O mesmo vale para a importação, que grava
antes de mostrar prévia.

Este item é a **fase seguinte de trabalho**, não dívida a ser paga em
silêncio: ver [ROADMAP_RECONCILIATION.md](ROADMAP_RECONCILIATION.md).

---

## 9. Cobertura de teste desigual

`comissao.js` não tem teste próprio, e é o arquivo que decide **quanto uma
revendedora recebe**. O `REGRAS.md` inclusive registra uma dúvida aberta
sobre a regra da faixa (R$ 295 de diferença num acerto de fronteira), que
"vale conferir contra o contrato assinado antes de usar o valor para
cobrar".

Um teste de tabela em `calcComissao`, com os casos de fronteira das faixas,
é barato e cobre a decisão de maior valor em dinheiro por linha de código do
sistema.

Lacunas completas em [TESTING.md](TESTING.md).

---

## 10. `schema-console.sql` é derivado e pode dessincronizar

Gerado por `api/gerar-schema-console.mjs` a partir do `schema.sql`. O gerador
existe justamente para os dois não discordarem — mas nada obriga a rodá-lo.
Um `schema.sql` alterado sem regerar deixa o console do painel com um schema
velho, que é exatamente o caminho usado por quem cria o banco pelo navegador.

**Correção futura:** conferir no `pre-deploy-check` (a skill já pede) ou
gerar no próprio build.

---

## 12. ~~Uma rodada seca apagava o rastro de uma rodada real que falhou~~ — RESOLVIDO

**Descoberto em 2026-08-18** ao provar formalmente o comportamento do
dry-run; **corrigido no mesmo dia**, ao fechar o contrato de schema do motor
de reconciliação (a validação exigia decidir isto antes de construir o Apply
em cima).

`resumoSync` (api/src/sync.js) montava o resumo a partir da **última linha**
de `sync_execucoes`, sem olhar se ela era seca:

```
rodada real  → o PATCH falha        → sync_execucoes: erro
alguém abre o painel                → "Última rodada falhou" (certo)
alguém clica em "Analisar"          → rodada seca, que não faz PATCH nenhum
                                    → sync_execucoes: ok
o painel recarrega                  → "Sincronizando normalmente" (errado)
```

Contrariava a regra 9 do `CLAUDE.md` — o que o sistema não fez tem de ser
anunciado, e aqui deixava de ser por conta de uma leitura.

**A correção:** `sync_execucoes` ganhou a coluna `seco` (migration
`api/migracao-sync-seco.sql`), marcada no **INSERT**, não derivada do
relato no fim — funciona mesmo enquanto a linha ainda está `'rodando'`, o
que uma checagem via `detalhe_json` (só existe depois que a rodada termina)
não conseguiria. `resumoSync` agora filtra `WHERE seco = 0` para responder
`ultimoStatus`/`ultimaEm`/`pausada`/`erro` — sempre a última execução REAL.

Uma análise continua gravada e auditável (nada foi escondido do histórico);
só deixou de contar para a saúde operacional. Quem quiser saber "quando foi
a última vez que alguém clicou em Analisar" tem `ultimaAnaliseEm`, um campo
**separado** de propósito — misturar os dois de novo seria reintroduzir o
mesmo bug com um nome diferente.

Provado por `src/saude-sync-test.mjs` (25 asserções): sync real falha + seca
passa → saúde continua erro; sync real ok + seca ok → sem mudança; sync real
pausada + seca passa → saúde continua pausada; e o caso simétrico — uma
ANÁLISE que falha não pode contaminar uma sincronização real saudável.

## 13. `saude-sync-test` depende do relógio de segundo do SQLite

A asserção `ultimaAnaliseEm !== ultimaEm` compara dois `datetime('now')`, que
o SQLite grava com resolução de **segundo**. Quando a rodada real e a seca
caem dentro do mesmo segundo — e caem, num banco local vazio — os textos são
idênticos e o teste quebra.

Aconteceu uma vez na medição de 2026-08-22 e não se repetiu na repetição
imediata. Não é regressão: nada muda em `sync.js` entre as duas execuções.

A correção honesta não é dormir um segundo no teste (isso esconde o
problema): é o `sync` gravar um carimbo com precisão de milissegundo, ou o
teste comparar o **id** da execução em vez do horário — que é o que ele já
faz na asserção anterior. Enquanto isso não acontece, uma falha isolada
nessa linha específica pode ser tratada como oscilação, e só nessa linha.

---

## 14. Ainda não existe um runner de suíte versionado

O item 4 continua aberto, e a medição da FASE 2 mostrou por quê. Um runner
foi escrito para produzir o baseline (derruba `workerd`/`node`, recria o
banco, sobe o Worker, roda um teste, mede) e **não foi versionado** por um
motivo concreto: no Git Bash, um script de suíte rodando em segundo plano
sobrevive ao shell que o iniciou e vira órfão — e como o próprio script
chama `taskkill //F //IM node.exe` entre um teste e outro, o órfão começa a
matar o Worker das execuções seguintes. O sintoma é cruel: testes que
passam sozinhos falham em lote, sem imprimir nada.

Um runner versionado precisa resolver isso antes de existir — trap de saída,
arquivo de lock, ou matar só o PID que ele mesmo iniciou em vez de todo
`node.exe` da máquina.

---

## 11. Detalhes menores, anotados para não se perderem

- `listarTudo` da Nuvemshop tem teto de **40 páginas** (8.000 registros).
  Passando disso, o excedente é ignorado **em silêncio**. Hoje sobra
  margem — a loja tem ~600 produtos.
- `api/package.json` tem `"test": "echo Error: no test specified && exit 1"`.
- Não há `LICENSE` no repositório, que é público.
- O painel novo ainda **não é publicado**: onde e sob qual endereço é decisão
  a tomar. Enquanto isso ele só existe localmente.
- `frontend/src/features/reconciliacao/exemplo.ts` é dado de mentira que
  vive no código de produção. Ele some quando a tela de revisão de verdade
  existir; até lá, a faixa listrada avisa o usuário em voz alta.
- ~~`reconciliacao_itens` sem UNIQUE em `(sessao_id, sku, variacao, tipo)`~~
  — RESOLVIDO em 2026-08-18: `idx_rec_itens_unico`, sobre uma coluna gerada
  (`variacao_chave`) para o caso `variacao IS NULL` também ser pego. Ver
  [RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md).
- `api/gerar-seed.py` gera dado real e o `.gitignore` protege a saída
  (`seed.sql`) — correto, e vale manter no radar em qualquer mudança do
  `.gitignore`.

## 12. Planejamento de maletas — duas lacunas declaradas

Abertas em 2026-08-19, junto com a tela "Capacidade para novas maletas"
(Revendedoras › Visão Geral no painel React).

### 12.1 Não existe regra de negócio para tamanho de maleta nem reserva

`api/REGRAS.md` não define **tamanho mínimo ou alvo de uma maleta** nem
**reserva mínima em casa**. O backend só garante o piso absoluto: a
consignação recusa `qtd > disponivel` (`adicionarItens`) e recusa kit em
maleta (§28).

A tela precisa dos dois números para responder "quantas maletas dá para
montar?". Como a decisão de negócio não foi tomada, ela **não inventou uma
regra**:

- `tamanhoAlvo` tem por padrão a **mediana das maletas já montadas** — dado
  real, lido de `state.maletas`. Sem histórico nenhum, cai num valor de
  partida e a interface diz, com todas as letras, que aquilo não é regra da
  Marquesa.
- `reservaPct` (quanto de **cada código** fica em casa) é escolha humana. Os
  três modos de planejamento — Conservador 50%, Equilibrado 30%, Agressivo
  15% — são três valores do mesmo parâmetro, e nada mais: não há heurística,
  modelo nem inferência atrás deles.

Os dois vivem no **navegador** (`localStorage`, chave
`marquesa_planejamento_v1`), não em `/api/config`. Gravar no banco os
transformaria em regra do sistema sem que ninguém tivesse decidido isso.

**O que falta decidir:** a reserva mínima em casa é percentual por código,
absoluta por código, ou por categoria? O tamanho alvo é um número só, ou
varia por revendedora? Quando houver resposta, o caminho é: escrever em
`api/REGRAS.md`, acrescentar as chaves à lista fechada de `PUT /api/config`
(`api/src/index.js`), e `frontend/src/features/maletas/planejamento.ts` vira
só um cache.

### 12.2 Criar maleta com peças são duas chamadas, não uma

Não existe endpoint que crie a maleta **já com os itens**. O fluxo é:

```
POST /api/maletas            → maleta vazia
POST /api/maletas/:id/itens  → consigna, validando SKU por SKU
```

Se a segunda recusar peça, a maleta já existe. Isso **não corrompe nada** —
maleta vazia é legítima, `POST /api/maletas/:id/cancelar` a desfaz (§28), e
o que não entrou não gerou movimento —, mas obriga a tela a contar o que
aconteceu em vez de dizer "criada" e ficar quieta. O fluxo "Criar maleta"
faz isso: mostra o id criado, quantos códigos entraram e a lista de
recusados com o motivo do servidor.

Um `POST /api/maletas {itens}` atômico resolveria. Não foi feito aqui:
mexer no contrato de escrita de estoque é decisão humana, e o caminho
existente já é seguro.

### 12.3 Giro de venda por peça não é legível pelo frontend

A sugestão "Giro rápido" gostaria de ordenar por **venda**. Não dá:
`maletas.acerto_json` guarda só os totais do acerto (`vendidas`,
`totalVendido`), sem quebra por SKU, e `GET /api/vendas` responde **um dia
por vez**. O que existe agregado e legível de `GET /api/state` é o histórico
de **consignação** — o que já foi para maleta, por categoria —, e é isso que
a estratégia usa, dizendo na própria proposta qual é a base.

Um endpoint de vendas agregadas por SKU/categoria num intervalo trocaria a
base sem reescrever a tela: `gerarSugestoes` já recebe os pesos por
parâmetro (`pesosPorCategoria`), que é também o ponto de entrada da
personalização por revendedora.

