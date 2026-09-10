# Monte seu Colar / montagens — o que existe, e o que precisa ser decidido

Levantamento de **10/09/2026**, item 3 da Fase 4. **Nada foi implementado.**
Este documento existe para a decisão humana que precede o código.

## 1. O que já existe tecnicamente

Três mecanismos distintos, construídos em épocas diferentes, que resolvem
problemas parecidos:

| Mecanismo | Onde | O que faz | Dados em produção |
|---|---|---|---|
| **Kit genérico** | `estoque.js` + `kit_componentes` | um SKU **sem saldo próprio**, cujo disponível é o mínimo entre os componentes; a venda vira movimento nos componentes | `kit_componentes`: **0 linhas** |
| **Personalização** | `personalizacao.js` + 4 tabelas | modelos com slots, opções por grupo, composição escolhida por venda e congelada | as 4 tabelas: **0 linhas** |
| **Modelos canônicos** | constantes em `personalizacao.js` | 5 configurações + composição livre, embutidas no código | — |

A feature está **desligada em produção** por trava fail-closed:
`PERSONALIZACAO_ATIVA = "false"` em [api/wrangler.toml](../../api/wrangler.toml)
(`"true"` só no DEV). Foi desligada em 06/09/2026 pelo commit `1ca62f6`,
justamente por não estar fechado o mapeamento SKU comercial × base ×
componentes — ver [docs/releases/SESSION_CLOSE_2026-09-06.md](../releases/SESSION_CLOSE_2026-09-06.md).

O motor tem teste (`src/kits-test.mjs`, `src/pacote2-test.mjs`,
`src/pos-golive-1-test.mjs` cenários N e O) e um checklist manual
([docs/testing/MONTE_SEU_COLAR_CHECKLIST.md](../testing/MONTE_SEU_COLAR_CHECKLIST.md)).

## 2. SKUs e configurações documentados

Constantes em `personalizacao.js` e §42 do [api/REGRAS.md](../../api/REGRAS.md):

| Papel | SKU | Nome | Existe no catálogo de produção? |
|---|---|---|---|
| **Base física** | `444032` | Colar Veneziana | **NÃO EXISTE** |
| Componente | `263236` | Menina rosa claro | sim — `Pingente`, qtd 5, R$ 119 |
| Componente | `273470` | Menina incolor | sim — `Pingente`, qtd 5, R$ 119 |
| Componente | `251551` | Menino azul | **NÃO EXISTE** |
| Componente | `251552` | Menino incolor | **NÃO EXISTE** |
| Componente | `329494` | Menino verde | **NÃO EXISTE** |
| Configuração | `326660` | Colar Casal | sim — `Colar`, **qtd 1**, R$ 129, ativo |
| Configuração | `364945` | Duas meninas | **NÃO EXISTE** |
| Configuração | `311066` | Dois meninos | **NÃO EXISTE** |
| Configuração | `314161` | 2 meninos + 1 menina | **NÃO EXISTE** |
| Configuração | `399872` | 2 meninas + 1 menino | sim — qtd 0, R$ 129, **inativo** |
| Composição livre | `MONTE-COLAR` | composição livre | sim — qtd 0, sem preço, **inativo** |

**7 dos 12 códigos não existem no catálogo de produção**, incluindo a base
Veneziana, que é obrigatória. Nenhum deles está na Nuvemshop. Provável causa: o
go-live de 22/08/2026 trocou de banco e esses cadastros não vieram.

Movimentos existentes: `263236` (2), `273470` (1), `326660` (2). Nada mais.

## 3. Como o estoque dessas montagens funciona **hoje** no código

```
venda de composição
   │
   ├─ venda_itens        ← UMA linha, com o SKU COMERCIAL (ex. 326660)
   │                       — é o que aparece no recibo
   │
   └─ movimentos         ← -1 da BASE (444032)
                           -1 de CADA COMPONENTE escolhido (os pingentes)
                           NADA no SKU comercial
```

O SKU comercial **não recebe movimento**: ele é linha de recibo, não peça
física. A composição escolhida fica congelada em `venda_personalizacoes` +
`venda_personalizacao_itens`. O preço é da composição, não a soma das peças.
`estoque_ja_refletido = 1` marca venda histórica: entra como registro e não
movimenta nada.

## 4. O que bate com as regras que você definiu

- não existe saldo independente de "kit pronto" — o kit genérico é
  explicitamente um SKU sem saldo próprio;
- a disponibilidade é o **mínimo compartilhado** entre componentes, e é isso
  que impede dois anúncios venderem a mesma peça física;
- a base é obrigatória e consumida automaticamente;
- configurações são **cadastradas**, não inventadas na venda: os cinco modelos
  são lista fechada, e o motor recusa slots fora de `slots_min`/`slots_max`;
- componentes apontam para SKUs físicos reais do catálogo, nunca para uma "cor"
  abstrata;
- a composição fica congelada na venda, imune a mudança posterior do modelo.

## 5. O que DIVERGE — e é o centro da decisão

### 5.1 Quantos movimentos uma venda gera

| | Sua regra | §42 e o código de hoje |
|---|---|---|
| Movimentos | `-1` configuração + `-1` veneziana | `-1` base + `-1` **por pingente** |
| SKU da configuração | tem saldo próprio | não tem movimento nenhum |
| Disponibilidade | `min(configuração, veneziana)` | `min(pingentes, base)` |

O seu exemplo — *"configuração casal = 8, veneziana = 3 → disponibilidade
real = 3"* — só faz sentido se a **configuração for uma peça física com saldo**.
Hoje `326660` está no catálogo exatamente assim (`Colar`, qtd 1, R$ 129), mas o
código nunca a movimenta.

Os dois modelos descrevem realidades físicas diferentes:

- **sua regra**: existe um conjunto de pingentes já montado na gaveta, e ele se
  junta a uma corrente na hora da venda;
- **§42**: existem pingentes avulsos, e o colar é montado peça a peça.

Não dá para escolher isso a partir do código nem dos dados — depende de como a
peça está fisicamente na prateleira da Marquesa.

### 5.2 A base pode ser trocada?

- **Você (10/09)**: a veneziana não é escolha, não aparece na UI, e permitir
  troca seria funcionalidade nova.
- **Decisão anterior (06/09)**: *"Base Veneziana 45 cm como padrão, **com
  possibilidade de trocar a base**"*, e o código já implementa a troca
  (`corpo.baseSku` sobrescreve o padrão, exceto nos modelos canônicos).

A sua regra de hoje é mais nova e mais restrita. Só precisa ser dita
explicitamente para o código passar a recusar a troca em vez de aceitá-la.

### 5.3 Motor genérico

- **Você (10/09)**: não transformar em motor genérico de kits/combos/bundles.
- **Decisão anterior (06/09)**: *"Arquitetura genérica para pulseiras,
  berloques e outros produtos montáveis"*, depois de fechar o colar.

Também mais nova e mais restrita. Vale registrar que o motor **genérico já
existe** (`kit_componentes`) e está sem uso: a decisão é não expandi-lo, não
removê-lo.

### 5.4 Composição livre

`MONTE-COLAR` permite montar qualquer combinação, com preço digitado na venda.
A sua descrição fala só de configurações cadastradas. Se composição livre
continua valendo, ela é a única exceção à regra "nada de composição arbitrária
em tempo de venda" — e precisa ser dita como exceção, não sobrar por omissão.

### 5.5 Gap conhecido, ainda aberto

O cancelamento **estorna a base mas não os componentes**
([checklist item 14](../testing/MONTE_SEU_COLAR_CHECKLIST.md)). Registrado em
06/09 como bloqueador de reativação. Sob a sua regra o cancelamento vira
`+1 configuração, +1 veneziana` — mais simples, mas ainda precisa existir.

## 6. Decisões de negócio necessárias

Nenhuma foi tomada.

1. **A configuração é peça física com saldo, ou linha de recibo?** (§5.1) — é a
   decisão que define todo o resto. Pergunta prática: quando chega mercadoria
   nova, a Sthefany conta "8 colares de casal montados" ou conta pingentes
   avulsos?
2. **Composição livre continua existindo?** (§5.4)
3. **Troca de base fica proibida agora?** (§5.2) — confirma que a decisão de
   06/09 está revogada.
4. **Os 7 SKUs ausentes vão ser cadastrados?** Sem a base `444032` no catálogo,
   nenhuma montagem pode ser vendida — o motor recusa com "a base não está no
   catálogo". Quem cadastra, e com que saldo inicial?
5. **Ouro 18k e Prata 925** apareciam nas decisões de 06/09 e não aparecem na
   sua regra de hoje. São configurações separadas (SKUs próprios), variação de
   um mesmo SKU, ou não existem mais?
6. **Configurações novas** (três meninos, três meninas): cadastro por tela, ou
   por migration/seed? Você disse que precisa ser possível cadastrar — falta
   dizer por onde.
7. **Reativar `PERSONALIZACAO_ATIVA` em produção** é decisão sua, e não deve
   acontecer antes de 1 a 5.

## 7. Desenho técnico mínimo recomendado

**Se** a resposta de §6.1 for "a configuração é peça física com saldo" — que é
o que a sua regra descreve — o desenho mínimo é este, e ele **não** é um kit:

> Um kit, por definição, não tem saldo próprio. A sua configuração tem. Logo
> isto não é kit, e forçá-lo dentro de `kit_componentes` quebraria a definição
> que sustenta o cálculo de disponibilidade compartilhada.

O que a sua regra descreve é **acompanhamento obrigatório**: vender X consome
também N × Y.

```
produtos(326660)                      ← configuração: produto normal, com saldo
produtos(444032)                      ← veneziana: produto normal, com saldo

acompanhamento_obrigatorio            ← tabela NOVA, 3 colunas
  sku              326660
  acompanha_sku    444032
  qtd              1
```

- **Venda**: `movimentar` duas vezes — `-1` em `326660` e `-1` em `444032` —
  ambos `origem: 'montagem'`, ambos no mesmo batch, `venda_id` igual. Nenhuma
  escrita direta em `produtos.qtd`, nenhum movimento fora de
  `estoque.js › movimentar`;
- **Disponibilidade**: `min(saldo(326660), floor(saldo(444032) / qtd))` — a
  mesma fórmula que `saldosDoKit` já usa, aplicada a outra relação;
- **Cancelamento**: o inverso exato, os dois movimentos;
- **Configuração nova**: uma linha em `produtos` + uma em
  `acompanhamento_obrigatorio`. Sem código;
- **UI**: a veneziana não aparece. Ela é consequência do cadastro, não escolha;
- **Nada de composição arbitrária**: só vende quem tem linha na tabela.

Três coisas que este desenho deliberadamente **não** faz: não generaliza para
bundles, não permite trocar o acompanhamento, e não cria um terceiro saldo.
Mudança de schema é proposta separada, com `safe-d1-change`, e não faz parte
automática da Fase 4.

**Se** a resposta de §6.1 for "linha de recibo", o desenho já existe e está
implementado — o trabalho vira cadastrar os 7 SKUs ausentes, fechar o estorno
dos componentes (§5.5) e decidir §5.2 e §5.4.

Os dois caminhos são incompatíveis. Por isso o item 3 não começa antes da
resposta de §6.1.
