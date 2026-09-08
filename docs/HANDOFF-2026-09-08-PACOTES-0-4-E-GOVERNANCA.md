# Handoff — Pacotes 0–4 e investigação de governança

Data: 2026-09-08

## ESTADO ATUAL

- **Branch:** `codex/especificacao-mestra-2026-09-07`.
- **Base antes do checkpoint:** `2e5aaf1`.
- **Commit final:** o commit local que contém este documento; o hash é
  informado no relatório da sessão e pode ser obtido com `git rev-parse HEAD`.
- **Produção:** inalterada. Nenhum deploy, push, migration remota, secret ou
  escrita em PROD foi executado nesta etapa.
- **Banco/migrations:** schemas e migrations dos Pacotes 2 e 4 estão
  versionados e foram provados somente em D1 local descartável. Nada foi
  aplicado remotamente.
- **Deploy:** não executado, por instrução expressa e porque a governança
  Codex local ainda impõe o modelo anterior.
- **Testes:** hooks, sintaxe, schemas gerados, build legado, frontend, APIs e
  Playwright dos Pacotes 1–4 passaram. As provas detalhadas estão em
  `docs/baselines/`.

## CONCLUÍDO

- Pacote 0: baseline funcional e visual do sistema anterior preservado.
- Pacote 1: shell/navegação em duas camadas, busca global de clientes e
  placeholder de perfil sem fingir autenticação.
- Pacote 2: Lançamentos, Monte seu Colar com SKUs físicos, cadastro rápido de
  cliente, A Receber/Reparos e reorganização de Revendedoras.
- Pacote 3: painel analítico de Vendas com períodos coerentes, evolução e
  detalhamento mensal.
- Pacote 4: Central unificada e fluxo interno de preparação/prévia/aprovação
  de catálogo, sem escrita externa na Nuvemshop.
- Investigação da governança: origem das recusas identificada; camada Claude
  versionada atualizada e testada; limitações externas e cópias locais
  divergentes documentadas.
- Checkpoint final validado sem iniciar Pacote 5 nem outra funcionalidade.

## ALTERAÇÕES

- **API:** analytics, contas a receber, pendências, personalização, rotas de
  catálogo/publicação e contratos do painel.
- **Banco:** schema canônico e derivado; migration aditiva do Pacote 2;
  migration e rollback do fluxo `catalogo_publicacoes`.
- **Painel legado:** navegação, busca, fluxos operacionais de Vendas/Clientes,
  painel analítico, Central e publicação de catálogo.
- **Frontend React:** shell, busca global, visão de Revendedoras, estilos e
  testes de componente.
- **Testes/evidências:** roteiros focados dos Pacotes 1–4 e capturas desktop/
  mobile em `docs/baselines/`.
- **Governança:** `CLAUDE.md`, `AGENTS.md`, `docs/SECURITY.md`, settings, hook,
  regras, skills e documentação da camada `.claude/`.

## VALIDAÇÃO

| Prova | Resultado |
|---|---|
| `.claude/hooks/protect-production.test.mjs` | 23 casos, 0 falhas |
| teste legado de `release-approval` | 48 casos, 0 falhas; módulo inerte |
| `.claude/settings.json` | JSON válido |
| `node --check` nos Workers e testes novos | passou |
| `node api/gerar-schema-console.mjs` | passou; derivado regenerado |
| `python src/build.py` | passou; `dashboard.html` regenerado |
| `frontend/npm test` | 190/190 testes em 16 arquivos |
| `frontend/npm run build` | passou; TypeScript + Vite, 96 módulos |
| Pacote 1 Playwright | passou; desktop, mobile e console |
| Pacote 2 API | passou; gates, baixa, estorno e razão de estoque |
| Pacote 2 Playwright | passou; 6 fluxos/capturas locais |
| Pacote 3 API | passou; períodos e datas contábeis coerentes |
| Pacote 3 Playwright | passou; desktop/mobile, zero erros |
| Pacote 4 API | passou; gates e zero escrita externa |
| Pacote 4 Playwright | passou; desktop/mobile, zero erros |
| D1 local limpo | schema atual executou 132 comandos |
| migrations Pacotes 2 e 4 | caminhos de upgrade já provados localmente |
| rollback Pacote 4 | já provado localmente, preservando sentinela |

Ocorrências ambientais encerradas durante a validação:

- o sandbox bloqueou o `esbuild`; os mesmos testes/build passaram fora dessa
  limitação, ainda localmente;
- uma origem CORS local `127.0.0.1` não coincidia com o `localhost` de
  `.dev.vars`; o Playwright foi executado pela origem autorizada, sem ler ou
  alterar secrets;
- havia outro Worker local antigo na porta 8787; os testes finais usaram
  portas isoladas 8788/8789, sem encerrar processo de outra tarefa.

## PRODUÇÃO

Nada foi enviado. Não houve `git push`, merge, deploy de Worker/Pages,
migration D1 remota, alteração de secret, chamada de escrita à Nuvemshop ou
validação contra PROD. A produção continua no estado anterior conhecido; este
checkpoint é somente local.

## PENDÊNCIAS

- **CRÍTICA — governança Codex local divergente:** `.codex/hooks.json` ainda
  aponta para um hook human-only que nega push em main, deploy, D1 PROD e
  secrets. O diretório estava somente leitura nesta sessão.
- **IMPORTANTE — skills locais divergentes:** cópias em `.agents/` continuam
  com instruções antigas e também estavam somente leitura. Não foram
  contornadas.
- **IMPORTANTE — release não iniciada:** antes de qualquer produção, alinhar
  as camadas locais, repetir a matriz Classe C/Classe D e executar o preflight
  contra o estado real implantado.
- **NECESSITA DECISÃO — publicação externa do catálogo:** o Pacote 4 termina
  na aprovação interna. Os estados/botões finais e a autorização do caminho
  de escrita na Nuvemshop ainda precisam da confirmação prevista na
  especificação.
- **AGUARDANDO CLAUDE/CLOUD — aguardando integração:** existe uma frente
  separada trabalhada no Claude/Cloud. Não foi adivinhada, recriada nem
  incorporada nesta execução.
- **MELHORIA — Pacote 5:** Etiquetas integradas ao cadastro é o próximo pacote
  da especificação, mas não foi iniciado neste checkpoint.
- **DÍVIDA TÉCNICA — migrations:** o projeto ainda não usa um registro formal
  de migrations do Wrangler; o estado real deve ser conferido antes de cada
  aplicação remota.

## PRÓXIMO PASSO RECOMENDADO

Na próxima conversa, partir deste `HEAD`, incorporar primeiro a frente
**CLAUDE/CLOUD — aguardando integração** sem recriá-la e reconciliar as
camadas locais `.codex/`/`.agents/` com a política versionada. Depois, repetir
a matriz efetiva de governança. Não iniciar Pacote 5 nem release até essa
consistência estar comprovada.
