# 0001 — Bootstrap de organização para Claude Code

- **Data:** 2026-08-18
- **Situação:** aceita
- **Decide:** Gustavo (dono do projeto)

## Contexto

O sistema controla estoque e vendas reais e já tinha o essencial certo:
razão contábil em `movimentos`, freios na sincronização, dry-run, testes que
provam as invariantes, e um `api/REGRAS.md` que registra as decisões de
negócio com as justificativas históricas.

O que faltava era a camada em volta:

- a pasta não era um repositório Git — era uma cópia extraída do ZIP do
  GitHub, sem histórico e sem ponto de retorno local;
- não havia estratégia de backup do D1 escrita em lugar nenhum;
- não havia política declarando quais operações são perigosas;
- a documentação estava dispersa entre `api/REGRAS.md`, `api/DEPLOY.md` e
  `src/README.md`, sem porta de entrada;
- não havia `CLAUDE.md`, e `.gitignore` ignorava `.claude/` inteiro;
- o baseline de testes não estava registrado, então não havia como
  distinguir regressão de falha pré-existente.

## Decisão

Executar uma etapa **exclusivamente** de organização, documentação,
segurança, tooling, backup e configuração do Claude Code, sem tocar em
nenhuma linha de lógica funcional.

Concretamente:

1. **Checkpoint duplo** antes de qualquer mudança: `git init` local (commit
   `b82f4f5`, na pasta antiga — ver a atualização no fim) mais um tarball fora do
   repositório.
2. **`.gitignore` endurecido** para segredos, backups e SQLite, passando a
   **versionar** a configuração própria de `.claude/`.
3. **`docs/`** com nove documentos, cada assunto com um dono só.
4. **`CLAUDE.md` curto**, como roteador de contexto — não como enciclopédia.
5. **Seis skills locais** e **um subagente somente leitura**.
6. **Baseline de testes medido** e registrado.
7. `api/REGRAS.md` permanece a fonte fundamental das regras de negócio, e
   **não** é duplicado em lugar nenhum.

## Consequências

**Passa a ser verdade:**

- existe um ponto de retorno nomeado, com o procedimento escrito;
- o procedimento de backup e restore do D1 existe, com comandos conferidos
  contra o Wrangler 4.123.0 instalado;
- operações destrutivas têm uma lista explícita do que nunca roda sozinho;
- o `.claude/` versionado faz o próximo desenvolvedor — humano ou agente —
  receber as mesmas regras;
- há um baseline (135 asserções, 0 falhas) para medir regressão.

**Custos aceitos:**

- **Mais arquivos para manter.** Documentação que ninguém atualiza vira
  mentira. Mitigação: uma regra, uma fonte, e o `CLAUDE.md` apontando em vez
  de copiar.
- **O histórico Git local era sintético** e não correspondia ao do GitHub —
  uma armadilha real. **Resolvido no mesmo dia**: ver a atualização no fim
  deste documento.
- **O backup de produção continua pendente.** Não havia credencial da
  Cloudflare neste ambiente. O documento existe; o arquivo, não.

**Deixa de ser possível:**

- justificar uma operação destrutiva com "não sabia que era perigoso".

## Alternativas descartadas

**Não inicializar Git, só o tarball.** Descartada: sem Git não há `diff`
contra o estado anterior, que é a ferramenta mais usada nesta própria etapa.
O risco do histórico sintético foi aceito e documentado.

**Clonar o repositório real do GitHub e trabalhar lá.** Seria mais correto,
e continua sendo o caminho recomendado para publicar estas mudanças. Foi
descartado **para esta etapa** porque exigiria mover o trabalho da pessoa
para outra pasta antes de existir qualquer checkpoint — mais arriscado que o
problema que resolvia.

**Colocar tudo no `CLAUDE.md`.** Descartada: ele entra em toda conversa, e
cada linha é paga em toda tarefa. Ver
[CLAUDE_CONTEXT_STRATEGY.md](../CLAUDE_CONTEXT_STRATEGY.md).

**Instalar um conjunto amplo de skills externas.** Descartada: cada skill
custa contexto em toda sessão, e várias mandam código para serviços
externos. Foram recomendadas duas, e nove **removidas** —
[CLAUDE_SKILLS.md](../CLAUDE_SKILLS.md).

**Corrigir de passagem os problemas encontrados** (o `executablePath` fixo
dos testes, o CRLF do `build.py`, o `python3` no `package.json`). Descartada
por ser alteração de código, fora do escopo declarado. Registrados em
[TECH_DEBT.md](../TECH_DEBT.md) com a correção já escrita, prontos para
serem aplicados quando alguém autorizar.

---

## Atualização — 2026-08-18, mesmo dia

O bootstrap foi **transferido para o clone real** de
`gustavodemelomartins-hub/Marquesa-Etiquetas`, que tem os 45 commits de
histórico e `origin` configurado.

Antes de transferir, os dois lados foram comparados arquivo a arquivo: o ZIP
extraído e o clone em `f3f08cb` tinham **conteúdo idêntico byte a byte**,
então nada se perdeu. O repositório Git sintético da pasta antiga foi
abandonado, e a tag `checkpoint/pre-bootstrap-claude` foi recriada aqui
apontando para `f3f08cb` — o último commit antes do bootstrap, que é também
o que estava em `origin/main`.

**Com isso a única consequência negativa desta ADR deixou de existir.** A
alternativa que havia sido descartada ("clonar o repositório real e
trabalhar lá") acabou sendo adotada, na ordem certa: o checkpoint veio
primeiro, o clone depois.
