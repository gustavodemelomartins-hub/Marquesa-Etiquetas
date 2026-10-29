# Validação da transferência

Validação em 29/10/2026 da branch `handoff/stephanie-2026-10-29`.
Não é autorização para publicar a aplicação.

O ambiente usa dados e credenciais fictícios, D1/R2 locais e endpoints localhost.
Nenhuma prova local depende de copiar arquivos privados, `node_modules`, logins,
vault ou ZIP da máquina original.

## Resultados na cópia de integração

Runtime de referência: Node **24.22.1**, conforme `.node-version`.

| Verificação | Resultado |
|---|---|
| `npm ci` em api, src e frontend | Concluído a partir dos três lockfiles |
| Chromium do Playwright | Instalado/disponível pela dependência do projeto |
| `npm run test:fast` | **12/12 gates** aprovados |
| `npm test` em frontend | **67 arquivos, 643 testes** aprovados |
| `npm run build` em frontend | Aprovado, inclui TypeScript |
| Schema novo vs migrations | Aprovado em SQLite temporário |
| Hook Codex | **65 casos** aprovados |
| Hook Claude | **65 casos** aprovados no gate rápido |
| Governança versionada | **40 casos** aprovados |
| Fluxo de enriquecimento com loja simulada | **19 provas** aprovadas |
| Worker/D1 local | Health 200; rota protegida 401 sem chave e 200 com chave fictícia |
| Razão de estoque local | Zero divergências |
| Painel clássico no Chromium | Carrega, acessa `/api/state` 200, sem exceção JavaScript |
| Painel React compilado no Chromium | Carrega, acessa `/api/state` 200, sem exceção JavaScript |
| Tráfego externo dos painéis no smoke | Nenhuma solicitação externa; política de navegador bloquearia qualquer uma |

O smoke usa portas locais alternativas para não interferir em processos existentes.
Os servidores/processos criados pela prova são encerrados ao final. A chave local
não aparece nos resultados, nos commits nem na documentação.

## Falhas iniciais investigadas

- O manifesto não classificava `catalogo-enriquecimento-fluxo-test.mjs`; ele foi
  registrado como domínio local e executado, sem desativar gates.
- O inventário de contratos não incluía `POST /api/nuvemshop/catalogo/enriquecer`,
  já servido com Bearer pela base operacional. Só o inventário foi atualizado.
- Node 26 apresentou falhas JSDOM/localStorage; Node 24 passou os 643 testes,
  sem alterar testes, regras de negócio ou código de aplicação para contornar isso.

## Limites

O ESLint conserva **344 warnings e zero erros**. Há aviso de bundle acima do limite
de 700 kB e mensagens conhecidas do canvas simulado no JSDOM; não causaram falhas.
As dependências foram preservadas; esta entrega não é uma correção de todas as
vulnerabilidades ou dívidas antigas. Não certifica câmera física, impressão ou
Nuvemshop real ponta a ponta. Produção não foi alterada.

A verificação independente de clone remoto será acrescentada após a primeira
publicação da branch, mantendo esses resultados anteriores como evidência datada.
