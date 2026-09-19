# Segurança operacional

Vigente desde 2026-09-08. Esta política substitui o antigo modelo de
`Production Release Approval` e qualquer regra que exigia execução humana
para push, migration ou deploy de produção.

## Princípio operacional

O Sistema Marquesa opera em modo **production-first**.

- Produção é a fonte de verdade operacional para código implantado, Worker,
  bindings, configuração, schema e dados.
- DEV/staging é auxiliar. Pode ser usado em experiências e testes, mas não é
  gate, fonte de verdade nem pré-requisito para produção.
- Divergência entre DEV e PROD não bloqueia uma release. Ela apenas impede
  usar DEV como evidência sobre o estado de PROD.
- Agentes podem concluir autonomamente o ciclo analisar → implementar →
  testar → proteger → publicar → validar → corrigir/rollback → registrar.
- Segurança vem de gates proporcionais ao risco, não de um botão humano.

Antes de uma operação relevante, consulte diretamente o estado real de
produção. Nunca publique sobre PROD a partir de uma branch antiga, migration
local presumida ou documentação histórica sem reconciliar as diferenças.

## Classes de risco

### Classe A — baixo risco

Leitura, documentação, testes e UI simples sem impacto operacional relevante.
O agente executa normalmente e valida de forma proporcional.

### Classe B — risco operacional moderado

Backend, APIs, lógica, integrações e mudanças que podem afetar comportamento
existente. O agente implementa, testa, revisa o diff e valida as regressões
prováveis.

### Classe C — alto risco técnico, execução autônoma permitida

Produção, D1 PROD, migrations, deploy, infraestrutura, secrets técnicos,
merge/push de release e rollback. Classe C **não exige execução humana**.
O agente pode operar autonomamente quando a tarefa autorizada inclui colocar
a mudança em funcionamento, desde que execute os gates aplicáveis:

1. confirmar branch, commit e árvore de trabalho;
2. comparar com a revisão atualmente implantada e com o remoto;
3. revisar exatamente o diff que entrará na release;
4. executar testes, lint, typecheck e build existentes e relevantes;
5. consultar bindings, variáveis e schema reais de PROD;
6. testar a migration em banco novo e em banco antigo representativo;
7. criar backup/bookmark quando houver risco de dados;
8. definir o rollback antes da primeira escrita;
9. executar migration/deploy na ordem compatível;
10. validar produção por API, UI, banco, logs e integrações afetadas;
11. corrigir ou fazer rollback seguro diante de regressão grave;
12. registrar commit, versão, backup, migration e resultado.

Use somente os gates que existem e fazem sentido para a mudança. Ausência de
uma ferramenta que o projeto não usa não é falha burocrática.

#### O freeze de produção estreita a Classe C — e só ela

Enquanto a produção estiver **congelada** (`DR-013`: não há data de go-live; a
entrada em produção depende de gate de qualidade, não de calendário), uma
operação Classe C que atinja **produção** deixa de ser autônoma e passa a
exigir instrução humana explícita. A mesma operação apontada para DEV/staging
continua autônoma, com os mesmos gates de sempre.

O estado é declarado em `.claude/governanca.json` e lido pelos hooks antes de
cada decisão. Descongelar é trocar `prodCongelada` para `false` **em um commit
próprio**, com a decisão humana citada na mensagem — não existe variável de
ambiente que faça isso, porque destravar produção tem que deixar rastro no
histórico. Arquivo ausente, ilegível ou inválido significa **congelada**: um
arquivo perdido não pode destravar produção.

O destino nunca é adivinhado pelo texto do comando:

| Pergunta | Quem responde |
|---|---|
| este Worker/banco é de produção? | `api/wrangler.toml` — o ambiente raiz é produção; um ambiente nomeado só é DEV quando não reaproveita recurso da raiz |
| este `git push` publica em produção? | o lado direito do refspec, comparado com `ramosProtegidos` |
| este projeto Pages é DEV? | `pagesNaoProdutivos`, porque Pages não aparece no `wrangler.toml` |

Alvo que **não pode ser provado** como DEV vale o mesmo que produção. É o caso
de `marquesa-db`, a cópia congelada de rollback: ela não pertence a ambiente
nenhum, e por isso nunca é "DEV por eliminação".

O freeze não afrouxa nem endurece a Classe D, que continua pedindo instrução
humana em qualquer ambiente, nem a negação de leitura de segredo.

### Classe D — destrutiva ou empresarial

Exige instrução humana explícita para o alvo e o efeito concretos. Exemplos:

- apagar base, tabela, bucket, Worker ou histórico comercial;
- zerar estoque ou excluir clientes/dados financeiros;
- `DELETE`/`UPDATE` em massa sem condição previamente validada;
- force-push, reescrita de histórico ou descarte de trabalho não salvo;
- mudar uma regra de negócio importante não solicitada.

Uma autorização de implementação/release não vira autorização genérica para
Classe D. A intervenção humana também é necessária quando há limitação real:
credencial ausente, permissão insuficiente, MFA, serviço indisponível ou
bloqueio da plataforma.

## Preflight production-first

O preflight começa em PROD, não em DEV:

```text
Git remoto e commit implantado
        ↓
Worker/deployments e bindings reais
        ↓
D1 PROD: schema, migrations e contagens seguras
        ↓
diff + testes + build + impacto
        ↓
backup/bookmark + rollback
        ↓
migration → deploy → smoke tests → observação
```

Se repositório/documentação divergirem de produção, pare a publicação,
investigue e reconcilie. Não copie DEV por cima de PROD.

## D1 de produção

Desde o go-live de 2026-08-22:

| Papel | Nome | ID conhecido |
|---|---|---|
| Produção operacional | `marquesa-db-prod` | `51dd629b-…` |
| DEV auxiliar | `marquesa-db-dev` | `dcc36f65-…` |
| Cópia congelada de rollback | `marquesa-db` | `089153a9-…` |

No `api/wrangler.toml`, o binding `DB` sem `--env` resolve para produção.
Não use o nome `marquesa-db` como sinônimo de produção: ele é a cópia
congelada. Para qualquer migration:

- consultar primeiro `sqlite_master`, `PRAGMA table_info` e contagens úteis;
- confirmar se já foi aplicada e se os dados existentes são compatíveis;
- preferir operações aditivas e pré-condições;
- exportar D1 e registrar bookmark/time-travel antes da escrita;
- aplicar um arquivo revisado, não SQL improvisado;
- validar schema, contagens e `produtos.qtd == SUM(movimentos.qtd)` depois.

Migration destrutiva ou que apague histórico é Classe D. Migration aditiva e
necessária para a release é Classe C e pode ser executada autonomamente.

## Backup e rollback

Rollback é parte do plano, não sinal de fracasso. Antes de publicar, registre:

- commit/release anterior;
- deployment anterior do Worker/Pages;
- export e bookmark/time-travel do D1 quando houver migration;
- migration reversa ou estratégia compatível com o código anterior;
- condição objetiva para abortar ou reverter.

`wrangler rollback` e `d1 time-travel restore` podem ser executados pelo
agente quando uma regressão grave foi comprovada e essa é a alternativa mais
segura. Exclusão definitiva de recurso/dados continua Classe D.

## Nuvemshop

A Nuvemshop é destino do estoque físico, não sua fonte de verdade. Toda
escrita externa continua passando por `api/src/nuvemshop.js` e pelo freio
fail-closed `NUVEMSHOP_WRITES_ENABLED`.

- Produção precisa da string exata `"true"` para preservar a sincronização
  operacional já autorizada.
- DEV/staging permanece `"false"` por padrão, mas isso não o transforma em
  gate de release.
- Preview/dry-run deve preceder sync de risco.
- Sync forçado contra a loja real sem solicitação específica é Classe D.

## Segredos e dados reais

- Nunca imprimir valores de secrets, tokens ou dados pessoais em resposta,
  log, commit ou documentação.
- Nunca versionar `.env`, `.dev.vars`, backups, seeds reais ou dumps.
- Consultar metadados e nomes de secrets é permitido; ler o valor não é.
- `wrangler secret put/delete` é Classe C quando tecnicamente necessário à
  tarefa. A ausência do valor/credencial é uma limitação real a reportar.

O painel usa uma `API_KEY` compartilhada em `localStorage`. Isso é aceitável
para a operação atual de uma pessoa, mas não oferece identidade individual,
revogação por dispositivo ou auditoria por usuário.

## Hooks e permissões

Este documento é a fonte versionada da política. O adaptador executável do
Claude está em `.claude/hooks/protect-production.mjs`; qualquer integração
Codex em `.codex/` deve espelhar o mesmo contrato, sem criar outra política:

- Classe C não é bloqueada por aprovação humana artificial;
- Classe C **contra produção** retorna `ask` enquanto o freeze estiver
  declarado, e continua `allow` contra DEV/staging;
- alvo que não se consegue provar como DEV é tratado como produção;
- Classe D retorna `ask` com o risco concreto, em qualquer ambiente;
- leitura de segredo/dado real continua negada;
- arquivos SQL são inspecionados para destruição extraordinária.

O estado do freeze mora em **um** arquivo — `.claude/governanca.json`. O
adaptador do Codex espelha o hook, nunca o estado: duas cópias do estado
seriam duas políticas, que é exatamente o que esta seção proíbe.

O antigo `.claude/approvals/production-release.json` não faz mais parte do
fluxo. Segurança de release é comprovada pelo preflight, artefatos de
backup/rollback e validação pós-deploy registrados no handoff.

Uma cópia local `.codex/` ou `.agents/` divergente é conflito de governança,
não exceção à política. Configuração local nunca prevalece sobre esta fonte;
se ainda bloquear Classe C, não publique até alinhar o adaptador e testar a
mesma matriz Classe C/Classe D/segredos.

## Regra de parada

Uma release só termina depois da validação pós-deploy. Se aparecer falha
grave, interrompa mudanças novas, avalie impacto e escolha a correção mínima
segura ou o rollback já preparado. Valide novamente e registre o incidente.
