# 0002 — Evoluir o monólito por strangler incremental de contratos

- **Data:** 2026-09-09
- **Situação:** aceita
- **Decide:** Marquesa

## Contexto

O sistema funciona, mas concentra composição, autenticação e 142 contratos HTTP em `api/src/index.js`, enquanto o dashboard legado permanece amplo e vários domínios compartilham tabelas e efeitos. Uma reescrita total colocaria em risco razão de estoque, idempotência de pedidos, consignação, reconciliação, histórico e operação diária. Manter tudo como está também torna cada mudança mais cara e difícil de provar.

## Decisão

Evoluir por strangler incremental: caracterizar o contrato existente, introduzir uma fronteira interna com ownership explícito e migrar um fluxo por vez, preservando rota, payload, status, headers, efeitos D1 e integrações até uma mudança deliberadamente aprovada.

Estoque e Catálogo são a primeira fronteira. A separação começa por comandos/consultas internas e testes; não por duplicação de tabelas. `produtos` continua compartilhada enquanto Catálogo possui identidade/ficha e Estoque possui saldo materializado, sempre reconciliável com `movimentos`.

## Consequências

- Cada fatia exige caracterização antes e paridade depois.
- Rotas antigas podem delegar ao novo módulo durante a transição.
- Ownership passa a ser documentado e imposto por contratos internos antes de qualquer schema novo.
- O custo é convivência temporária entre arquitetura antiga e nova, adapters adicionais e migração mais lenta.
- Não é permitido usar a modernização para alterar silenciosamente regras, habilitar features, mudar cron ou escrever em integrações.
- Remoção de código antigo só ocorre depois que consumidores e gates provarem que a fatia foi substituída.

## Alternativas descartadas

**Reescrita total:** feedback tardio e risco operacional alto demais. **Refactor horizontal por camadas:** espalha mudança sem entregar fronteira verificável. **Separar banco primeiro:** duplica autoridade antes de separar comportamento e ameaça a razão. **Congelar indefinidamente:** preserva risco e acoplamento sem criar caminho de evolução.
