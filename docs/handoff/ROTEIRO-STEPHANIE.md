# Roteiro de entrega e onboarding — Stephanie

Preparado em 29/10/2026. A fonte oficial é esta branch no GitHub, não o ZIP. Leia `AUDITORIA-12-COMMITS.md` e cole `PROMPT-CODEX-STEPHANIE.txt` no Codex dela para executar a preparação local.

## O que Gustavo precisa entregar

| Entrega | Necessidade |
|---|---|
| URL do GitHub e este pacote | Obrigatório; já identificado no relatório |
| Convite GitHub para a conta pessoal de Stephanie | Para enviar branches/PRs; leitura do código público dispensa convite. Conceder escrita conforme função; não compartilhar conta do Gustavo |
| Convite à conta Cloudflare proprietária | Para manutenção/publicação futura de Workers, D1, R2 e Pages. Validar o menor conjunto de permissões disponível; não conceder billing/administrador global por padrão |
| Orientação sobre loja e app Nuvemshop | Para operação futura: acesso próprio autorizado à loja e, se necessário, ao app parceiro. Não precisa para testes fictícios locais |
| Chave de acesso ao painel real | Só se ela precisar operar o painel PROD; entregar por canal privado apropriado. É compartilhada, não uma conta individual |
| Canal privado para credenciais | Gerenciador de senhas/compartilhamento autorizado. Não colar segredos em PR, docs, histórico de comandos ou conversa do Codex |
| Responsável e procedimento de release | Decidir quem autoriza PROD durante o freeze e quem acompanha rollback |
| Revisão do trabalho ainda local | Os seis conjuntos úteis do toolkit foram integrados integral ou parcialmente nesta branch; planos/provas particulares e `intelligence/` não integram a entrega. Ver a auditoria dos 12 commits |

Não é preciso enviar o banco inteiro, suas credenciais globais, logins, tokens GitHub/Cloudflare pessoais, instalação do Codex, `node_modules` ou a pasta inteira do computador. Os cinco secrets de PROD já existem na Cloudflare e podem continuar lá.

Esta branch inclui a correção de segurança `1671bc5` para os hooks reconhecerem comandos com prefixo RTK. RTK não é necessário para instalar ou executar o produto. Plugins, MCPs e skills globais são opcionais e exigem instalação/autenticação própria, sem copiar configurações pessoais.

Se um segredo necessário foi perdido, emitir novo pelo responsável e rotacionar de forma coordenada. Não tentar recuperar valores via logs ou arquivos privados. Para CI, conferir os nomes `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no GitHub; recriar o token apenas se necessário, com permissões compatíveis com Workers/D1/Pages e recursos usados. Não supor isolamento perfeito de token por ambiente: conferir os escopos realmente suportados pela conta.

## Clonar a fonte oficial

```powershell
git clone https://github.com/gustavodemelomartins-hub/Marquesa-Etiquetas.git
cd Marquesa-Etiquetas
git checkout handoff/stephanie-2026-10-29
```

Não é necessário receber ZIP. Ele permanece apenas como backup histórico.

## Etapa 1 — computador e código

1. Instalar/usar Git, Node 24 LTS (conforme .node-version), npm e Python 3. Node 26 não é o ambiente de referência: há incompatibilidade observada na suíte JSDOM/localStorage. Manter a assinatura/login oficial do Codex de Stephanie; o projeto não exige OpenAI API key para funcionar. Não habilitar billing ou proxy.
2. Encontrar a Área de Trabalho real do Windows (pode estar no OneDrive). Criar `Marquesa-Etiquetas` ali. Se já existir, inspecionar e preservar o conteúdo antes de decidir reutilização; não sobrescrever.
3. Clonar `https://github.com/gustavodemelomartins-hub/Marquesa-Etiquetas.git` com histórico completo, partindo de `handoff/stephanie-2026-10-29`, e criar uma branch própria como `stephanie/onboarding`. A branch parte do código operacional `cd0cec1`, com documento de release em `1fb618d`, mais ferramentas portáteis auditadas. Verificar o SHA da branch na instalação.
4. Ler `AGENTS.md`, `docs/SECURITY.md`, `.claude/governanca.json` e instruções locais aplicáveis. O vault privado do Gustavo não estará na máquina dela; registrar a ausência e usar os contratos versionados e este pacote, sem inventar caminhos ou copiar o vault.

## Etapa 2 — dependências reproduzíveis

Da raiz do clone, no PowerShell, executar cada comando separadamente e parar se uma instalação falhar:

```powershell
npm --prefix api ci
npm --prefix src ci
npm --prefix frontend ci
```

Em `src/`:

```powershell
npx playwright install chromium
```

Não fazer upgrade, `npm audit fix --force` ou trocar lockfiles no onboarding. Na raiz não há dependências a instalar. A instalação de ferramentas deve usar canais oficiais; autenticação interativa e MFA ficam com Stephanie.

## Etapa 3 — ambiente local sem credenciais reais

Criar `api/.dev.vars` ignorado pelo Git, com uma nova chave aleatória apenas local, e esta configuração de segurança. A chave deve ser armazenada no arquivo e consultada por Stephanie quando conectar a tela; não imprimi-la em relatórios.

```dotenv
API_KEY=<GERAR_CHAVE_APENAS_LOCAL>
ORIGENS_PERMITIDAS=http://localhost:8000,http://localhost:5173
NUVEMSHOP_WRITES_ENABLED=false
NUVEMSHOP_PUBLICACAO_ENABLED=false
NUVEMSHOP_STORE_ID=999999
NUVEMSHOP_TOKEN=token-de-mentira
NUVEMSHOP_CLIENT_ID=1234
NUVEMSHOP_CLIENT_SECRET=segredo-de-mentira
NUVEMSHOP_BASE=http://localhost:8799
NUVEMSHOP_AUTH_BASE=http://localhost:8799
```

O modelo do repositório habilita escrita para a loja falsa. O onboarding começa com `false`. Só habilitar `true` temporariamente quando o teste exigir e ambas as bases estiverem comprovadamente em localhost e todas as credenciais forem fictícias. Repor `false` ao terminar. Não substituir essas bases por loja real para fazer um teste passar.

O Vite precisa apenas de API URL e rótulo. Preferir variáveis de processo ou `frontend/.env.local` ignorado:

```dotenv
VITE_API_URL=http://localhost:8787
VITE_APP_ENV=dev
```

Confirmar com `git check-ignore` que ambos os arquivos ficam fora do Git. Nenhum `VITE_*` pode conter chave privada.

Se reutilizar um clone com `api/.dev.vars` existente, preservar esse arquivo e criar `api/.dev.vars.staging` fictício, se o nome estiver livre. O `--env staging` deve selecionar esse arquivo; confirmar a seleção antes de iniciar. Se ambos já existirem, preferir clone novo em pasta irmã livre a abrir/sobrescrever credenciais. Não iniciar o Worker herdando ambiente real sem perceber.

## Etapa 4 — banco e serviços locais

Em clone novo, não existe estado anterior a apagar. Em `api/`:

```powershell
npx wrangler d1 execute DB --env staging --local --file=schema.sql
npx wrangler dev --env staging --local --port 8787
```

Usar o mesmo ambiente e persistência no comando de criação e no servidor. Confirmar antes que nenhum binding foi configurado com `remote=true`. Não usar `--remote` nem executar migrations históricas sobre esse banco já criado pelo schema.

Em outro terminal, na raiz:

```powershell
python src/build.py
python -m http.server 8000 --bind 127.0.0.1
```

Em outro terminal, em `frontend/`:

```powershell
npm run dev
```

Abrir `http://localhost:8000/dashboard.html` e `http://localhost:5173`. Conectar cada origem com `http://localhost:8787` e a chave local. As portas têm localStorage separado; uma conexão não configura automaticamente a outra.

O D1 e R2 locais são simulados e separados dos dados na nuvem; o desenvolvimento local não faz download automático de dados reais. Ver a [documentação oficial de dados locais](https://developers.cloudflare.com/workers/local-development/local-data/). A loja falsa é iniciada pelos testes pertinentes; não precisa ficar rodando para abrir telas sem integração.

## Etapa 5 — prova de funcionamento

Executar e registrar resultados reais:

```powershell
node src/migracao-variantes-test.mjs
npm run test:fast
npm --prefix frontend test
npm --prefix frontend run build
```

Conferir `/api/health`, 401 sem chave em rota protegida e acesso autenticado ao Worker local. Abrir as duas telas e verificar ausência de erro de conexão; testar um fluxo fictício de cadastro/venda se a inicialização local permitir, usando a API normal. Checar `GET /api/estoque/conferir` autenticado e esperar `divergentes: []`.

Para sync/cliente, executar os testes específicos de loja falsa conforme `docs/testing/TESTING.md`; para mudança no legado, E2E pertinente; para React, teste e build. Antes de cada teste de integração, identificar qual banco local ele pressupõe e se exige estado vazio. Não apagar `.wrangler` existente indiscriminadamente.

`api/npm test` não é o teste da API: é um placeholder. `test:integration` e `test:browser` podem só listar itens manuais. Resultado zero dessas listagens não prova que o sistema foi testado. Não rodar todos os scripts encontrados por nome.

## Etapa 6 — DEV e publicação futura

Após local funcionar, Stephanie pode autenticar a própria conta Cloudflare via login oficial e confirmar conta/permissões e recursos. Isso é separado da instalação local. A fase inicial não deve disparar Actions, push para develop, migrations remotas ou deploy.

O DEV existente é auxiliar e pode ter dados reais e schema defasado. Publicar para staging/staging-v2 exige provar os alvos e avaliar o compartilhamento de R2. Não recriar recursos sem necessidade nem importar um dump real como seed padrão.

Para uma release futura: abrir branch/PR, revisar diff, conferir produção atual e schema, executar testes e build, preparar backup e rollback, coordenar API e frontend e respeitar o freeze. `develop` dispara atualização DEV automática; workflow PROD de Pages é manual e não publica Worker PROD. Ele faz checkout fixo de develop: dispará-lo a partir da branch de handoff NÃO publica automaticamente o código desta branch. Uma release futura precisa reconciliar a fonte de publicação explicitamente. O diretório de publicação deve seguir o empacotamento do workflow; não publicar a raiz do clone.

## Quando a transferência estará aceita

- [ ] Código correto e branch própria na Área de Trabalho; revisão registrada.
- [ ] Três instalações por lockfile concluídas; Chromium disponível.
- [ ] Segredos locais fora do Git; zero credencial real em teste.
- [ ] Worker, D1 local, painel clássico e React funcionando.
- [ ] Resultados dos testes, build e razão de estoque registrados; falhas não ocultadas.
- [ ] Convites pessoais GitHub/Cloudflare aceitos para o trabalho futuro; Nuvemshop conforme necessidade.
- [ ] Recursos/ambientes/efeitos de push compreendidos; nenhum serviço remoto alterado no onboarding.
- [ ] Trabalho local não publicado revisado separadamente ou explicitamente marcado como fora da entrega.

Este pacote prepara a transferência. A instalação no computador de Stephanie e os convites ainda precisam ser executados; não foram simulados como concluídos pela auditoria.
