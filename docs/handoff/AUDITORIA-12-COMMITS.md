# Auditoria dos 12 commits locais e branch canônica

Data: 29/10/2026. Branch oficial de transferência: `handoff/stephanie-2026-10-29`.
O ZIP anterior fica apenas como backup histórico. O código, as ferramentas
portáteis, o [roteiro](ROTEIRO-STEPHANIE.md) e o
[prompt do Codex](PROMPT-CODEX-STEPHANIE.txt) são obtidos pelo GitHub.

## Base operacional, comprovada pelo uso

Não foi usada a palavra DEV/PROD como prova. Consultas somente leitura, sem
nomes de clientes ou pedidos, mostraram:

| Recurso D1 | Vendas de origem site | Última importação encontrada |
|---|---:|---|
| `marquesa-db-prod`, binding do `marquesa-api` | 6 | 28/10/2026 20:20:58, timestamp retornado pelo banco |
| `marquesa-db-staging-v2` | 0 | nenhuma |
| `marquesa-db-dev` | 0 | nenhuma |

Na base operacional, `nuvemshopSyncAtivo=true` e `syncCorteEm` está configurado.
Essas foram as únicas chaves operacionais consultadas; nenhum segredo foi lido.
As consultas retornaram zero linhas escritas e `changed_db=false`.

O Worker ativo identificado na auditoria tem versão
`3099a322-4788-4abe-bb54-049c826c7a29`, tag `cd0cec1`. O Pages operacional
`marquesa`, em `https://marquesa-9da.pages.dev`, tem deployment
`86a2e59e-383b-4d26-8385-b96a1f673ae1`, source `cd0cec1`; React em `/v2/`.
O código funcional identificado é `cd0cec15b325469d4a9d355ed347601702ecf5ce`.
O commit `1fb618d401e50c4d790e3bf23d0e5a3a5d400eea` de `develop` acrescenta
somente o documento dessa release; seu runtime é igual ao implantado.
Foi a base da branch de handoff, preservando histórico completo.

Isso identifica o sistema que recebe pedidos reais; não certifica qual atalho
está salvo no dispositivo de Stephanie nem compara byte a byte o bundle remoto.
Se outro recurso passar a receber operação real, ele será produção operacional
independentemente do nome. Reconfirmar serviços/revisões antes de uma release.

## Método da comparação com o GitHub

Foi feito clone novo do GitHub e conferidas 59 heads remotas de `origin`.
Os 12 commits vieram da referência local `claude/toolkit-setup-2026-10-15`,
HEAD `0ae8423eda2b26ddcd9087eccc6c0c48446d1fa2`, árvore limpa.
Nenhum dos 12 SHAs estava contido em branch remota. Nenhum patch-id estável
coincidia com commit não-merge alcançável pelas refs de `origin`.

Para detectar squash/reimplementação, também foram comparados 36 blobs únicos
de 13 caminhos de instruções, produto, lint e hooks nas heads remotas.
Foi encontrado um equivalente **parcial**: o ignore `graphify-out/` de
`429f049` já existe em `claude/graphify-instalacao-mmlu7v`, commit `af9498d`;
a `.graphifyignore` desse commit não existe lá nem nas demais heads.
Não foi encontrado equivalente funcional novo para os outros 11 nos caminhos
auditados. Isso não é uma alegação de equivalência semântica de todo o GitHub.

## Decisão por commit

Nenhum desses commits muda API funcional, regras de negócio, frontend funcional
ou schema. “Projeto” abaixo significa governança/ferramenta portátil que precisa
acompanhar a manutenção; “local” significa evidência/configuração da máquina de origem.

| Commit original | O que altera | Equivalente remoto | Projeto atual / apenas local | Risco de integrar | Handoff |
|---|---|---|---|---|---|
| `0e7be01c2aa2fe2ca1d7d923dd6ef76040108229` | Design do toolkit, em specs | Não encontrado | Plano histórico de setup, não produto | Premissas e instalações globais datadas | **Fora**; não é requisito de execução/manutenção |
| `061d69e171cee925a25c9a9e1c8abf57a51e4fc0` | Plano de execução do toolkit | Não encontrado | Planejamento da máquina de origem | Comandos globais e caminhos pessoais podem ser repetidos indevidamente | **Fora** |
| `a410a49e3aa4baed83d45a86f24c7ccce0066da0` | Evidência/baseline de testes de 15/10 | Não encontrado | Evidência histórica local | Confundir resultado antigo com prova desta entrega | **Fora**; novas provas substituem certificação datada |
| `45134692e28d93ad9ec0a0dec3762b69b264590d` | AGENTS fonte única, CLAUDE importa; tabela de provas e teste de governança | Não encontrado | Governança portátil do projeto | Isolado, perde descoberta Codex e referencia docs posteriores | **Parte**; versão final com correções, sem exigir plugins globais |
| `c06ee7aafa748910fea2deb2915644f6df171797` | PRODUCT, princípios, regra de paralelismo, índices e caminhos de backup | Não encontrado | Mistura conhecimento do projeto e configuração pessoal | Reescrever releases históricas com caminho privado não portátil | **Parte**; PRODUCT/princípios/guia de paralelismo e links. Caminhos pessoais e alterações históricas ficam fora |
| `f85d8d0dc37f0d14d377cea41dcf380c0006d571` | Registra instalação Context7, DevTools e Ponytail | Não encontrado | Só estado de ferramentas globais da máquina | Clone não instala/autentica essas ferramentas | **Fora**; ferramentas descritas como opcionais em setup novo |
| `9793656000adc26b2ad1798b64e03ee332c6dd39` | Registra RTK global e prova de convivência com hooks | Não encontrado | Só estado/evidência local | Transmitir prova antiga ou presumir binário global entregue | **Fora**; a correção portátil vem de `1671bc5` |
| `429f049e88bf3afb2af21e3c912b16d591e25846` | Ignore do grafo e `.graphifyignore` para segredos/dumps/estado/gerados | Parcial: só `graphify-out/`, em `af9498d` | Proteção portátil do desenvolvimento | Baixo: derivados ficam locais; schema/migrations continuam disponíveis | **Integral**, novo commit `a42ee64` |
| `d580464e1a546295c3162cc046232d0323035639` | ESLint, regras, scripts, deps/lockfile e gate fast/release | Não encontrado | Ferramenta reproduzível do projeto | Mais deps de desenvolvimento e gate; warnings existentes. Não troca versões já presentes no lockfile | **Integral**, novo commit `56bd42e`; comentário de deploy corrigido pelo conteúdo final |
| `77d47cf8f28f975a6651990a5ca1611037cbebb8` | Matriz de toolkit e evidências da máquina em setup.md | Não encontrado | Registro particular de setup | Versões, instalações e provas não portáteis | **Fora**; `docs/setup.md` novo descreve apenas requisitos portáteis |
| `1671bc5016403264124dc1a33c63821cd4f4b1fa` | Hooks reconhecem wrappers RTK e incluem testes correspondentes | Não encontrado | Proteção portátil do projeto | Parser de comandos muda; requer testes Claude e Codex | **Integral**, novo commit `ab56c7f`; não requer instalar RTK |
| `0ae8423eda2b26ddcd9087eccc6c0c48446d1fa2` | Recupera descoberta Codex, move regra para doc, corrige produto/lint/teste de governança | Não encontrado | Governança portátil com registros históricos misturados | Dependências com AGENTS/PRODUCT/lint e premissas globais | **Parte**; arquivos finais úteis, sem planos/evidências particulares |

Resultado: **3 integrais + partes de 3; 6 integralmente fora**. As partes úteis
foram consolidadas em commit próprio, sem fingir que os commits mistos entraram
inteiros. Os originais, branches, worktrees, estado não rastreado e o ZIP anterior
permanecem preservados. Não houve reset, force-push ou reescrita de trabalho existente.

## Adaptações para portabilidade

- AGENTS é a fonte comum, CLAUDE a importa; tabelas de provas continuam em TESTING.
- Reconhece React já publicado e produção por operação real, incluindo exceção de freeze.
- Skills versionadas podem ser lidas em `.claude/skills` sem alias global `.agents/skills`.
- Plugins, MCPs, RTK, Graphify e vault do Gustavo não são pré-requisitos do produto.
- Não assume que backups particulares ou instalações globais existem na máquina nova.
- O roteiro e prompt começam por `handoff/stephanie-2026-10-29`, com ambiente fictício.
- Correções de inventário descobertas na validação apenas registram teste e rota já existentes;
  não habilitam endpoint novo nem mudam autenticação ou comportamento operacional.

## Limites e acesso externo

O GitHub é canônico para **código e ferramentas portáteis**, não para segredos ou
dados operacionais. D1/R2 e credenciais permanecem na Cloudflare; a loja permanece
na Nuvemshop. O diretório `intelligence/` não rastreado e outros experimentos não
fazem parte do runtime operacional comprovado e não foram incorporados por suposição.

Stephanie precisa de conta própria e convite GitHub para escrever branches/PRs;
o clone público dispensa convite. Para administrar/publicar, convite à conta Cloudflare
com Workers/D1/R2/Pages conforme função. Para manter a integração, acesso autorizado
à loja e ao app Nuvemshop conforme necessidade. A API_KEY real só é necessária para
operar o painel real e deve ser entregue por canal privado; local usa chave nova fictícia.
Não precisa receber ZIP, dumps, login do Gustavo ou tokens pessoais. Não há necessidade
de habilitar billing, proxy ou uma chave de API de IA para instalar o sistema.

As provas de instalação ficam em [VALIDACAO.md](VALIDACAO.md). Nenhum deploy, mutation
de D1, Worker, Pages, secrets ou Nuvemshop faz parte desta tarefa; somente a branch
GitHub de transferência é publicada.
