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

`.claude/hooks/protect-production.mjs` é a implementação versionada desta
política. Qualquer integração local em `.codex/` deve espelhá-la:

- Classe C não é bloqueada por aprovação humana artificial;
- Classe D retorna `ask` com o risco concreto;
- leitura de segredo/dado real continua negada;
- arquivos SQL são inspecionados para destruição extraordinária.

O antigo `.claude/approvals/production-release.json` não faz mais parte do
fluxo. Segurança de release é comprovada pelo preflight, artefatos de
backup/rollback e validação pós-deploy registrados no handoff.

Uma cópia local `.codex/` divergente é conflito de governança, não exceção à
política. Não publique enquanto ela ainda impuser o modelo human-only; veja
o handoff da sessão que introduziu esta política.

## Regra de parada

Uma release só termina depois da validação pós-deploy. Se aparecer falha
grave, interrompa mudanças novas, avalie impacto e escolha a correção mínima
segura ou o rollback já preparado. Valide novamente e registre o incidente.
