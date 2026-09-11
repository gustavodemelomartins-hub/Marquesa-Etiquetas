# Contrato de integração da tela — Estoque e Inventário

> **Fonte canônica técnica:** `docs/domains/INVENTARIO-4-4.md`
>
> Este arquivo descreve as necessidades da UX. Ele não substitui a regra de
> domínio.

O arquivo canônico pertence à trilha paralela da Fase 4.4 e ainda não está
visível nesta branch. O conteúdo abaixo é a tradução para Produto/UX do espelho
aprovado fornecido por Gustavo em 10/09/2026. Quando a branch chegar, nomes de
rotas e formatos devem ser reconciliados com a fonte; nenhum endpoint é
inventado aqui.

## Limite deste documento

- descreve o que cada estado da tela precisa enviar, receber e impedir;
- não aprova implementação, rota, tabela ou migration;
- a API é autoridade sobre sessão, contagens persistidas, cobertura, resultado
  e quantidade do ajuste;
- estado local da interface nunca substitui a sessão persistida.

## Baseline visível nesta branch

O baseline anterior já registra estes contratos, mas não comprova sozinho as
capacidades adicionais da Fase 4.4:

| Contrato visível | Uso atual conhecido | Cuidado para a UX futura |
|---|---|---|
| `GET /api/inventarios` | listar inventários | histórico precisa de data, status, cobertura, divergências e ajustes resolvidos |
| `POST /api/inventarios` | começar; recusa segundo aberto | início deve devolver a sessão autoritativa |
| `GET /api/inventarios/:id` | obter sessão/detalhe | deve permitir retomar em outro dia/dispositivo e consultar o resultado histórico completo |
| `PUT /api/inventarios/:id/contagem` | registrar contados/desconhecidos | novo contrato distingue inclusão, correção, remoção, zero explícito e conflito de variação |
| `POST /api/inventarios/:id/concluir` | comparar sem ajustar | conclusão não movimenta estoque |
| `POST /api/inventarios/:id/ajustar` | ajustar explicitamente pela razão | frontend não pode enviar a quantidade do ajuste |
| `POST /api/inventarios/:id/cancelar` | cancelar sem apagar | o estado cancelado permanece consultável; visibilidade da ação depende da matriz de permissões |

## Operações que a experiência consome

| ID | Capacidade | O que a UX envia | O que precisa receber/garantir |
|---|---|---|---|
| API-EST-INV-001 | começar inventário | somente os metadados aceitos pelo contrato; nunca saldo ou ajuste calculado pela tela | identificador, status inicial, datas e cobertura inicial da sessão; segundo inventário aberto é recusado |
| API-EST-INV-002 | registrar item incrementalmente | identidade exata do SKU/variação e quantidade contada; zero somente após gesto explícito | confirmação persistida do item, seu estado e progresso/cobertura atualizados |
| API-EST-INV-003 | corrigir contagem | identidade do item e nova contagem explícita | valor autoritativo substituto, status comparativo e progresso atualizados |
| API-EST-INV-004 | remover contagem | identidade do item já contado | item volta a `não contado`; remoção não equivale a contar zero |
| API-EST-INV-005 | registrar “não sei a variação” | código lido e decisão humana explícita de não identificar a variação | peça encontrada e SKU conhecido preservados como pendência de identificação, sem atribuir quantidade a uma variação, comparar, movimentar ou ajustar |
| API-EST-INV-006 | pausar | identidade da sessão | status pausado e tudo já contado persistido |
| API-EST-INV-007 | retomar/obter sessão aberta | identidade da sessão ou consulta da sessão aberta | snapshot autoritativo com contagens, desconhecidos, cobertura e status, utilizável em outro dia/dispositivo |
| API-EST-INV-008 | concluir | comando de encerramento da contagem, sem lista de ajustes | resultado congelado da comparação; nenhuma mudança de estoque |
| API-EST-INV-009 | obter resultado/detalhe | identidade do inventário | estado final, responsável, início/fechamento, cobertura, contados, divergências, faltas, sobras, pendências, aplicações efetivas, observações e `deltaPos`/movimentações posteriores; linhas relevantes trazem identidade, esperado, contado, diferença, ação e status |
| API-EST-INV-010 | aplicar divergências | identidades das divergências autorizadas e observação opcional | backend deriva a quantidade de cada ajuste, aplica pela razão e devolve resultado individual; retry não pode duplicar ajuste |

Os métodos, URLs e nomes exatos do payload das operações novas permanecem os
da fonte canônica da Fase 4.4. A UX não fixa essas decisões arquiteturais.

## Identidade de variação e resposta 409

Quando um código/SKU possui mais de uma variação e a leitura não identifica
qual delas está sendo contada, a API responde `409`. Isso significa
**identidade insuficiente**, não falha genérica.

A interface deve:

1. preservar o código digitado/bipado;
2. mostrar somente as variações reais devolvidas pelo contrato, com identidade
   estável e rótulo de exibição;
3. permitir escolher a identidade exata e reenviar;
4. oferecer `Não sei a variação` como decisão explícita e secundária;
5. nunca escolher a primeira variação, dividir quantidade ou registrar no SKU
   pai por aproximação.

O caminho `Não sei a variação` não precisa ocupar espaço permanente na tela
principal: aparece no contexto do conflito e permanece resolvível depois. Ele
significa que a peça física foi encontrada e o SKU é conhecido, mas a variação
não; a API não pode transformá-lo em contagem comparável nem permitir
movimento/ajuste até a identificação ser resolvida.

A interface não aceita texto livre nem fabrica nomes de variação. Se a resposta
do conflito não trouxer opções válidas, o fluxo para e anuncia a inconsistência.

## Três estados de contagem que a resposta não pode colapsar

| Estado de domínio | Significado para a tela | Representação proibida |
|---|---|---|
| `não contado` | não existe contagem explícita daquele item | mostrar `0` ou tratá-lo como conferido |
| `contado zero` | a pessoa afirmou explicitamente que encontrou zero | campo vazio, traço ambíguo ou ausência de registro |
| `contado N` | a pessoa registrou uma quantidade inteira N | recalcular a partir de estado local não confirmado |

Remover uma contagem leva a `não contado`. Digitar/confirmar zero leva a
`contado zero`. Esses estados precisam sobreviver à serialização, pausa,
retomada e troca de dispositivo.

Na UX, `contado zero` é oferecido durante a revisão/confirmação de uma peça não
encontrada. Não existe controle permanente de zero ao lado do campo de bipagem.

## Persistência, cobertura e retomada

- cada inclusão, correção, remoção ou declaração `não sei` é persistida
  incrementalmente;
- sucesso só aparece depois da confirmação da API;
- reabrir a seção, trocar dispositivo ou retomar em outro dia recupera o
  snapshot autoritativo, não apenas um cache do navegador;
- cobertura vem da API com numerador e denominador coerentes com o escopo do
  inventário; não é contada pelas linhas visíveis da tabela/página;
- `não contado` continua diferente de `contado zero` em progresso e resultado;
- pausa preserva a sessão; conclusão encerra a contagem e abre a etapa de
  resultado/revisão.

## Resultado, movimentações posteriores e aplicação

O resultado precisa separar, sem depender apenas de cor:

- conferido sem divergência;
- faltando;
- sobrando;
- `naoConferido`;
- `naoComparavel`;
- códigos/leituras desconhecidos;
- ajustes já aplicados ou ainda pendentes.

O detalhe histórico também precisa expor o estado final real — sucesso,
finalização com pendências ou cancelamento/equivalente — sem derivar sucesso de
100% de cobertura. Um inventário pode estar encerrado e ainda conter
`naoConferido`, `naoComparavel`, desconhecidos ou divergências não aplicadas.

Para faltas, `contado < esperado` e a diferença é negativa; eventual aplicação
é saída/perda e reduz estoque. Para sobras, `contado > esperado` e a diferença
é positiva; eventual aplicação é entrada/ajuste e aumenta estoque. A UX exibe
os valores autoritativos e não escolhe a ação apenas pelo cálculo local.

`deltaPos` e o aviso de movimentações posteriores são dados do backend. A UX
os exibe junto à divergência afetada e no resumo da revisão; não recalcula,
zera ou interpreta silenciosamente esse valor. Quando houver movimentação
posterior, a tela avisa que o cenário mudou desde a contagem antes de qualquer
aplicação.

### Regra visual de segurança — hard deny

`naoConferido` e `naoComparavel`:

- nunca possuem checkbox;
- nunca exibem quantidade sugerida de ajuste;
- nunca entram em selecionar tudo;
- nunca participam de ação em lote;
- mostram o motivo do bloqueio e, quando existir no contrato, o caminho de
  resolução.

Desconhecidos permanecem identificados e fora da aplicação enquanto não houver
identidade comparável confirmada.

### O frontend não informa a quantidade do ajuste

Na aplicação, a tela envia apenas a identidade dos itens autorizados e, quando
informada, a observação opcional. É proibido enviar `quantidadeAjuste`, delta
calculado pela interface ou saldo final desejado. O backend deriva novamente a
quantidade com base no resultado e nas precondições atuais, grava pela razão e
devolve o que foi aplicado ou recusado.

## Estados de erro que precisam de tratamento próprio

| Situação | Tratamento na tela |
|---|---|
| `409` por variações | seletor de variação + ação secundária `Não sei a variação`; nunca erro genérico |
| segundo inventário já aberto | levar ao inventário existente em vez de criar sessão paralela |
| gravação incremental incerta | manter rascunho visível e consultar a sessão antes de repetir |
| sessão pausada | bloquear nova contagem até retomar explicitamente |
| tentativa de aplicar item bloqueado | recusar sem checkbox reaparecer e explicar `não conferido`/`não comparável` |
| movimentação posterior | aviso associado a `deltaPos`; exigir revisão do resultado atualizado |
| aplicação parcial | mostrar sucesso e recusa por item; nunca afirmar que o lote inteiro foi resolvido |
| detalhe encerrado com pendências | renderizar o estado final e os grupos pendentes; não promover para `Finalizado com sucesso` |

## Pendências de reconciliação quando a fonte chegar a esta branch

- substituir referências genéricas pelos métodos/URLs exatos da Fase 4.4;
- conferir nomes literais de status e campos, sem renomear `deltaPos`,
  `naoConferido` ou `naoComparavel` por conveniência;
- conferir o nome literal do estado cancelado/equivalente e a política de
  desconhecidos no encerramento;
- validar formato de paginação do histórico e detalhe.
