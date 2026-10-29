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

## Clone independente obtido do GitHub

Após publicar a branch, foi executado **outro `git clone` diretamente do GitHub**,
seguido de `git checkout handoff/stephanie-2026-10-29`. A revisão obtida foi
`471a7307a903b27a254d0a8812492dbb8a81c9c2`. Antes de instalar, esse clone estava
limpo e não continha `.dev.vars`, `.wrangler` ou `node_modules` da máquina de origem.

Nele, sem copiar dependências ou configuração da primeira cópia:

- `npm ci` concluído nos três diretórios, usando somente seus lockfiles;
- Node 24.22.1, **643/643 testes React** e build TypeScript/Vite aprovados;
- **12/12 gates rápidos** aprovados, incluindo schema, governança, hook e lint;
- configuração fictícia local criada do zero e ignorada pelo Git;
- D1 inicializado somente com `--local`, mesmo ambiente/persistência do Worker;
- health 200, state 401 sem chave e 200 com chave local, razão sem divergências;
- painéis clássico e React compilado abertos no Chromium, cada um recebendo
  `/api/state` com 200, sem exceção JavaScript e sem solicitações externas;
- processos de teste encerrados. Nenhuma credencial real ou serviço remoto foi
  necessário para esses resultados.

Este registro posterior altera apenas documentação. O código funcional, fontes
dos painéis, schema, configurações de infraestrutura e workflows seguem idênticos
à base operacional identificada na auditoria. O arquivo de configuração local e
os artefatos de instalação/build não foram publicados no GitHub.

Assim, **GitHub + checkout da branch + instalação + configuração local segura**
é suficiente para desenvolver localmente; ZIP e arquivos privados não são necessários.
Isso não concede acesso automático à operação real nem certifica uma futura release.
