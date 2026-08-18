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

`src/e2e.mjs`, `src/import-casa-test.mjs` e `src/shot.mjs` traziam
`executablePath: '/opt/pw-browsers/chromium'` escrito no código, e por isso
só rodavam num Linux com esse caminho exato.

Agora os três honram `PW_CHROMIUM` quando ela existe e, sem ela, usam o
Chromium que o próprio Playwright instala. O `e2e` — o único teste que prova
que interface e API conversam — voltou a rodar, e o baseline subiu de 135
para 209 asserções.

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
- `api/gerar-seed.py` gera dado real e o `.gitignore` protege a saída
  (`seed.sql`) — correto, e vale manter no radar em qualquer mudança do
  `.gitignore`.
