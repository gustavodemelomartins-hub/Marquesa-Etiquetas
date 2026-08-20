# Rodar o Claude Code no WSL2 — plano, não tarefa

Situação hoje (2026-08-20, medida, não suposta):

| | |
|---|---|
| Host | Windows 10 Pro 19045 |
| Shell do agente | Git Bash (MINGW64) |
| Claude Code | nativo no Windows, dentro do VS Code |
| WSL2 | **instalado e em versão 2** — só a distro `docker-desktop`, parada |
| Sandbox | indisponível: depende de Linux |

Nada disso impede trabalhar. O ganho da migração é **uma** coisa: o sandbox
do Claude Code, que isola o sistema de arquivos e a rede do agente. Enquanto
ele não existe, quem isola é a lista de permissões e o hook — e é por isso
que os dois são a prioridade, não a migração.

**Não migre no meio de uma tarefa.** Isto aqui é para uma manhã tranquila.

## Por que não é urgente

`bypassPermissions` no host Windows está fora de questão — sem sandbox, seria
dar ao agente a máquina inteira. O modo atual (allow/ask/deny + hook) já
entrega quase toda a autonomia no DEV sem essa aposta. O sandbox é ganho
incremental, não pré-requisito.

## O plano, quando for a hora

1. **Instalar uma distro de verdade** (a `docker-desktop` não serve para
   trabalhar dentro):

   ```powershell
   wsl --install -d Ubuntu-24.04
   ```

2. **Clonar o repositório DENTRO do Linux**, em `~/Marquesa-Etiquetas`.
   Não trabalhe por `/mnt/c/...`: o I/O cruzando a fronteira é lento a ponto
   de mudar o comportamento dos testes, e a permissão de arquivo vira ruído
   no `git status`.

3. **Reinstalar as ferramentas dentro do Linux**: Node 22+, Python 3, e
   `npm ci` em `api/`, `src/` e `frontend/`. `npx playwright install
   chromium` mais as dependências de sistema do Chromium.

4. **Recriar `api/.dev.vars`** à mão. Ele não é versionado, de propósito.
   Os nomes das variáveis estão em `.env.example` e em `docs/DEVELOPMENT.md`.

5. **VS Code continua sendo a interface do Gustavo**: extensão *WSL*,
   "Reopen Folder in WSL". Editor igual, terminal e agente do lado Linux.
   Nada muda no dia a dia visual.

6. **Provar que migrou sem quebrar nada**, nesta ordem:

   ```bash
   node .claude/hooks/protect-production.test.mjs   # 50 casos
   node src/sync-test.mjs                           # precisa do Worker local
   cd frontend && npm test && npm run build
   python3 src/build.py && git diff --stat dashboard.html
   ```

   O passo do `build.py` é o que costuma pegar: no Linux o comando é
   `python3`, e o fim de linha do `dashboard.html` gerado pode mudar. Se o
   diff vier gigante, é CRLF — compare com `--ignore-cr-at-eol` antes de
   concluir qualquer coisa.

7. **Só então** avaliar ligar o sandbox, e medir se ele atrapalha algum teste
   de navegador antes de deixar ligado.

## O que a migração NÃO deve mudar

`.claude/` inteiro, as skills, as regras e os hooks são Node puro e caminhos
relativos. Eles atravessam para o Linux sem edição. Se algum precisar de
ajuste para funcionar lá, isso é bug de portabilidade — conserte no arquivo,
não crie uma versão paralela.

## MCP — avaliação, e por que nenhum por enquanto

| Necessidade | Coberta por | MCP resolveria melhor? |
|---|---|---|
| Git e GitHub | `git`, `gh run watch`, `gh pr view` | Não. CLI cobre, e a saída é menor |
| Cloudflare (D1, R2, Pages, Worker) | `wrangler` | Não. E um MCP com escrita no D1 fura a trava do hook |
| Testes | os `src/*-test.mjs` e o vitest | Não. Já são determinísticos |
| Navegador | Playwright, nos testes que já existem | Só se um dia for preciso explorar UI que não tem teste |

Todo MCP declarado custa contexto em **toda** sessão, use-se ou não: as
definições de ferramenta entram no prompt. Com as CLIs cobrindo o caso de
uso, o custo é certo e o benefício é hipotético.

Reavalie quando aparecer capacidade que a CLI não dá — e, se aparecer, diga
antes qual problema ela resolve, quanto de contexto custa, e por que a CLI
não bastou.
