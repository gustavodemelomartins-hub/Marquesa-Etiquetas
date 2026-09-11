# Decisões pendentes

Pergunta que atravessa mais de uma tela ou que muda o desenho do produto.
Enquanto aberta, ninguém decide por conta própria e ninguém implementa por cima
dela: a regra 2 do [CLAUDE.md](../../../CLAUDE.md) — nunca chutar quando o dado
pode representar peça física — vale igual para decisão de produto.

## Abertas

| ID | Pergunta | Contexto | Telas afetadas | Quem decide | Trava o quê | Desde |
|---|---|---|---|---|---|---|
| DP-001 | Como o cabeçalho global se reorganiza em tablet e mobile sem comprimir logo, navegação, notificações e perfil? | padrão desktop aprovado; ainda não há referência responsiva | todas | Gustavo | variantes responsivas de header e navegação | 10/09/2026 |
| DP-002 | A faixa de navegação secundária aparece em toda área com subseções ou cada domínio pode adotar outra solução? | Vendas usa `Lançamentos`, `Painel` e `Clientes` abaixo do header | todas as áreas com subseções | Gustavo | regra global de navegação contextual | 10/09/2026 |
| DP-003 | Onde vive o nome abreviado da etiqueta: no catálogo, numa configuração própria de etiquetas ou apenas no lote de impressão? | o nome impresso pode diferir do nome completo e precisa ser corrigível sem efeito colateral | cadastro, importação e etiquetas | Gustavo + Sthefany Marques | modelo do dado, reaproveitamento da correção e API futura | 10/09/2026 |
| DP-004 | Qual taxonomia separa origem estrutural, tipo da operação e local/canal comercial? | os mockups usam balcão, revendedora e WhatsApp no mesmo espaço, enquanto o domínio distingue venda, acerto e site | Lançamentos, Histórico, Painel e Clientes | Gustavo | filtros, métricas e badges consistentes | 10/09/2026 |

ID sequencial `DP-001`, `DP-002`, `DP-003`, `DP-004`, `DP-005`…

## Decididas

Nunca apague uma decisão fechada. Saber **por que** algo foi decidido vale mais
depois do que a decisão em si.

| ID | Pergunta | Decisão | Quem | Data | Onde ficou registrada |
|---|---|---|---|---|---|
| DP-005 | Estado da venda e estado financeiro aparecem separados em toda lista? | Sim. A venda mantém seu estado operacional; PAGO, PARCIAL e A RECEBER são derivados dos recebimentos e aparecem como dimensão financeira separada. | Gustavo | 10/09/2026 | `03-screens/vendas/rules.md` e `metrics.md` |

Decisão que muda regra de negócio não fica só aqui: vai para
[api/REGRAS.md](../../../api/REGRAS.md), que continua a fonte única. Decisão
arquitetural vai para `docs/decisions/`.
