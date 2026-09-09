# Baseline de regressão — Fase 0

- **Captura:** 2026-09-09
- **Commit de partida:** `04edb022455e417b8389d2163b2f007b7dd3ecff`
- **Manifesto executável:** `docs/testing/test-suites.json`
- **Runner portátil:** `scripts/run-baseline-tests.mjs`

## Um comando

Na raiz, `npm test` executa o gate de release local e seguro:

1. coerência/freios dos artefatos da Fase 0;
2. governança versionada;
3. hard-denies production-first;
4. suíte React/Vitest;
5. build React;
6. build do dashboard legado e `git diff --exit-code dashboard.html`.

O runner usa `spawnSync` sem shell e recusa no próprio manifesto comandos com `--remote`, deploy, push, publish ou host do Worker de produção. Ele não inicia serviços, não reseta banco e não escreve em integrações.

## Níveis

| Nível | Comando | Escopo |
|---|---|---|
| rápido | `npm run test:fast` | artefatos, governança e hard-denies |
| domínio | `npm run test:domain` | Vitest e regras puras selecionadas |
| integração | `npm run test:integration` | catálogo explicativo; nenhum gate automático sem D1/Worker local isolado |
| navegador | `npm run test:browser` | catálogo explicativo; requer servidores e Playwright locais |
| release | `npm test` | gates locais conhecidos e builds |
| inventário | `npm run test:list` | lista suítes, níveis, modo e descrição |

Integração/navegador deliberadamente não inventam hermeticidade. Para executá-los, preparar D1 local descartável, Worker local, fake Nuvemshop e/ou navegador conforme `docs/TESTING.md`, então chamar a suíte individual. Nunca reutilizar banco com estado de uma suíte anterior quando o documento pede estado limpo. Os scripts `stephanie-production-apply.mjs`, screenshots e auditorias ficam `manual-only` e não entram em gate.

## Cobertura congelada

| Área | Caracterização disponível | Lacuna explícita |
|---|---|---|
| governança/segurança | 27 checks versionados + 23 hard-denies esperados | nenhuma para Fase 0 |
| frontend React | suíte Vitest + TypeScript/build | E2E requer servidor/browser |
| dashboard legado | build reproduzível + grande suíte Playwright catalogada | fragmentação e custo de setup |
| estoque/catálogo | importação, razão, variações, kits, SKU, fotos, inventário | contrato HTTP único ainda parcial |
| sync/Nuvemshop | fake, seco, corte, saúde, vendas externas | estado implantado/cron não consultado |
| reconciliação | schema local, análise/apply e preconditions | migrations não provadas em produção |
| vendas/financeiro/histórico | pacotes, desconto, pagamento, reconstrução, garantias/saídas | ownership ainda transversal |
| rotas HTTP | contagem do despachante e sentinelas | Fase 1 deve caracterizar método/auth/status/body por rota |

## Baseline esperado

O Plano Mestre registrava, antes desta fase: governança **27/27**, hook **23/23**, frontend **190/190**, build React aprovado e build legado aprovado. A execução desta Fase 0 deve registrar no commit/relatório final o resultado observado, sem atualizar números por suposição.

## Resultado observado em 2026-09-09

| Execução | Resultado |
|---|---|
| `npm run test:fast` | 3/3 gates; artefatos OK, governança 27/27, hook 23/23 |
| `npm run test:domain` | 2/2 gates; Vitest 16 arquivos/190 testes e quatro suítes puras aprovadas |
| `npm test` | 6/6 gates; 190/190, build React e paridade do legado aprovados |

Vitest/Vite precisaram ser executados fora da restrição de leitura do sandbox local porque o `esbuild` recebeu “Cannot read directory ../../..”; repetido com as mesmas entradas em ambiente local autorizado, o gate passou. As suítes Node puras emitiram apenas o warning existente `MODULE_TYPELESS_PACKAGE_JSON`; não houve falha. Nenhuma suíte de integração, navegador, D1 remoto ou Nuvemshop real foi executada.

## Política de expansão

Começar pelo nível mínimo. Em mudança de domínio, executar testes puros + integração focada; em mudança de UI, acrescentar Playwright; em release, usar `npm test` e os gates adicionais exigidos pelo risco. Migration, produção e reconciliação real continuam sujeitos aos protocolos específicos e nunca são autorizados por este runner.
