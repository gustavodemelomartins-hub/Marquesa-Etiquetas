# Design System Marquesa V2

**Estado:** `READY FOR GUSTAVO REVIEW` · **Data:** 15/09/2026  
Fonte visual corrente: `03-screens/vendas/master.css`, reutilizada pelos
protótipos de todos os módulos.

## Direção

Premium, elegante e operacional. Bordô comunica marca, ação e seleção. Fundos
brancos/rosados criam calor sem reduzir contraste. Títulos editoriais usam
serif; controles, números e texto de trabalho usam sans. A interface é feminina
sem recorrer a ilustrações infantis ou excesso de rosa.

## Tokens

| Grupo | Token | Valor / regra |
|---|---|---|
| Marca | `wine-900 / 700 / 600` | `#741238 / #9f1748 / #b32659` |
| Superfície | `paper / canvas / rose-050` | `#fffdfc / #f9f5f3 / #fff7f9` |
| Texto | `ink / muted` | `#241d20 / #6e6267` |
| Linha | `line / line-soft` | `#eadcdf / #f2e9eb` |
| Estados | sucesso | verde `#33735a` sobre `#e6f3ec` |
| Estados | atenção | âmbar `#986b1e` sobre `#fbf1dd` |
| Estados | a receber | bordô sólido; não confundir com erro |
| Tipografia | títulos | Cormorant Garamond, 600 |
| Tipografia | interface | Jost, 300–700 |
| Espaço | escala | 4, 8, 12, 16, 24, 32 e 48 px |
| Radius | controles / cards / modais | 8–10 / 12–16 / 16–18 px |
| Sombra | card / sobreposição | leve no conteúdo; forte apenas em modal/toast |
| Grid | conteúdo | até 1480 px; margem fluida de 3–4 vw |

## Componentes

| Componente | Padrão V2 |
|---|---|
| Card | uma pergunta por card; título escuro, número tabular, bordô pontual |
| Tabela | cabeçalho discreto; linha inteira abre detalhe; no mobile vira card |
| Filtro | chips para recorte curto; formulário para busca/data; seleção persistente |
| Input/select | 40–44 px; label sempre visível; foco com halo bordô |
| Tabs | contexto irmão dentro do módulo; sublinhado bordô; rolagem horizontal segura |
| Chip/tag | categoria ou atributo; nunca representa sucesso/erro |
| Badge/status | semântica + texto; cor nunca é o único sinal |
| Botão | `primary`, `secondary`, `ghost`; uma ação primária por superfície |
| Dropdown | ações secundárias; item destrutivo separado e nomeado |
| Modal | decisão curta ou revisão; no mobile pode virar bottom sheet |
| Drawer | detalhe lateral preservando lista; mobile ocupa a tela |
| Toast | confirmação transitória; nunca é a única prova de operação crítica |
| Date picker | data visível em pt-BR; prazo e data efetiva não se misturam |
| Paginação | total + página + anterior/próxima; filtro não muda silenciosamente |
| Chart | responde pergunta e oferece alternativa textual/tabela |
| Header | módulos globais; sino e perfil à direita |
| Mobile nav | cinco destinos no máximo, com safe area e alvo de 44 px |
| Skeleton | preserva forma da tela e usa `aria-busy`; sem spinner infinito |
| Empty state | explica por que está vazio e oferece próxima ação possível |
| Error state | causa compreensível, impacto e tentativa segura |
| Confirmação | resume fatos, efeitos financeiros/estoque e ação irreversível |

## Densidade e responsividade

- Desktop usa comparação lado a lado quando há relação direta.
- Tablet reduz colunas antes de esconder informação.
- Mobile transforma tabelas em cartões, mantém ações primárias alcançáveis e
  usa navegação inferior; nenhuma informação depende de hover.
- Gráficos podem rolar ou virar lista; nunca são espremidos até perder leitura.
- `prefers-reduced-motion` remove animação não essencial.

## Estados obrigatórios

Toda tela implementável precisa especificar: carregando, vazio, erro,
permissão insuficiente, resultado parcial/incerto e sucesso. Comando financeiro,
estoque ou integração exige ainda confirmação, tentativa idempotente e retorno
autoritativo do servidor.

## Uso de dados demonstrativos

Protótipos mostram exemplos para validar hierarquia. Dado não confirmado deve
ser rotulado como `dados demonstrativos`, `UI NEEDS API`, `UI NEEDS BUSINESS
DECISION` ou `FUTURE IDEA`. O design system não transforma exemplo em contrato.

