# V2 — Loja online: o que os dados provam, o sistema resolve (§64)

Data: 09–10/10/2026 · Regra: `api/REGRAS.md` §64 · Commits: `1aa84ac`, `07becfe`, `c6ef496`

## Versões

| | Nova | Rollback |
|---|---|---|
| Worker `marquesa-api` | `0e299037` → `afdc2eb6` (§64); depois o Codex publicou `1a12674d` e `1c3bc2d0` a partir de um `develop` que CONTÉM o §64 | `758763ac` (§63) |
| Pages `marquesa` (PROD, `marquesa-9da.pages.dev`) | `08544102` | `dafec82d` |
| D1 `marquesa-db-prod` | sem migration | bookmark `000002e1-00000000-000050ff-c675fdd9a1f15fbfdd74864dcb885be2` |

Nada foi publicado: visíveis na loja 521 antes e 521 depois; nenhum
`publicado_em` novo.

## Antes → depois

Antes = código do §63 sobre o export de PROD das 13h de 09/10. Depois =
código no ar sobre o export de 10/10 00:3x (UTC).

| | Antes | Depois |
|---|---|---|
| Central de Pendências | **66** (8 estoque por variação · 24 catálogo · 34 maleta) | **46** (0 · 12 · 34) |
| "Precisam de atenção" (códigos) | **51** (8 + 19 + 24) | **34** (22 maleta + 12 decisão de identidade) |
| Ocultos em preparação | 364 (55 deles sem peça em casa) | 320 com peça em casa; 55 em "Sem peça em casa", fora da fila |
| Prontos para publicar | 60 | 60 |
| Variação só no Marquesa | 5 | 0 |
| Peças sem anúncio | 24, todas "decidir" | 13: 12 decisões reais + 1 kit (não é tarefa) |
| Categoria faltando | 58 | 0 (ver "Quem resolveu") |
| Fila de estoque | 918 sincronizados · 27 revisão | 934 · 22 |

## Resolvido automaticamente

- **8 códigos de "Conferir estoque por variação" repartidos pelo inventário
  #1** (191620, 334079, 351489, 393950, 635650, 647729, 711591, 717389): a
  bipagem por variação fechou com o total, nada se moveu depois. Mais 8
  códigos de variação única (16 no total), 52 movimentos de ajuste com soma
  zero, origem escrita na observação. Nenhum total mudou.
- **4 variações criadas na Nuvemshop**, estoque 0 na criação, grafia das
  irmãs, banho copiado, releitura confirmando valor único e SKU do código:
  194149 Vermelho (a loja recebeu Cristal 2 · Vermelho 1, divisão provada),
  391471 n°24 (n°18 1 · n°24 1), 198242 Pink e 408061 n°19 (ficam em revisão
  de maleta, sem número inventado). 4 vínculos de equivalência gravados no
  mesmo ato.
- **1 equivalência por unicidade**: 318524 "Verde" ≡ "Verde Esmeralda" (única
  variação dos dois lados).
- **Atributos corrigidos**: 10 variações em 6 códigos tinham cor gravada em
  "Tamanho" (162190, 186016, 194149, 198242, 318522, 318524) → "Cor". O nome
  da variação não mudou.
- **11 peças cadastradas ocultas** que estavam presas em "decidir": 9 eram
  falso "mesmo modelo" (colar × brinco, anel × brinco, pulseira × colar) e 2
  travavam pela cor em "Tamanho". Todas `hidden`.
- **55 ocultos sem peça em casa** saíram da fila, dos ocultos e da atenção.
- **1 kit** saiu das decisões e da Central.
- **Categorias**: 5 aplicadas pelo §64 (taxonomia), em anúncios sem nenhuma
  categoria — 168190, 417615, 629372, 843659, 956144.

### Quem resolveu as categorias

Das 58 faltando no retrato das 13h, 52 já tinham sido aplicadas pela frente
editorial do Codex às 14h (journal `nuvemshop_enriquecimento`, que criou na
loja as categorias "Pingentes" e "Conjuntos" — por isso os 14 pingentes
avulsos e conjuntos que o §64 deixaria como pergunta já têm categoria). O
§64 aplicou as 5 restantes. As duas frentes concordam: o Codex fez merge do
§64 e publicou o Worker com os dois.

## Ainda exige conferência humana real

- **22 códigos com peça em maleta sem a variação** (34 itens de maleta na
  Central): qual aro/cor cada revendedora levou. O que está em casa o
  inventário já contou; respondida a maleta, a rodada seguinte reparte o
  resto sozinha (quando nada se moveu desde o inventário).
- **12 peças "mesmo modelo já anunciado?"** — mesmo nome e mesma família de
  um código que já está na loja; os dados não provam se é o mesmo produto:
  102311×114998, 196333×132944, 272073×227655, 334078×334079 (nº27),
  519177×408061/283680, 132961×194786, 187550×102367, 387128×619940,
  410321×750894, 450320×838474, 493074×466730, 561637×561638.

Fora da Central (Preparação, dado que só gente fornece): 351 ocultos sem
foto, 177 peças sem preço.

Decisão registrada, não pendência: 3 anúncios da loja usam "Cores = Banho de
Ouro 18k"; renomear atributo de anúncio existente não é documentado pela API
da Nuvemshop e não foi feito. "Cor" continua sendo o atributo do banho na
loja (convenção de ~640 variantes).

## Testes

- `src/loja-online-automacao-test.mjs` — 18 provas (Worker real + loja falsa):
  os 14 itens pedidos, mais inventário, família e kit.
- `nuvemshop-catalogo` 30 (atualizado: cor em "Tamanho" sobe como "Cor"; S1
  ganha o n°24), `loja-online` 15, `nuvemshop-fila` 49,
  `inventario-v2-reconstrucao` 25, `v2-variacoes-locais` 16, `venda-item-id` 22.
- Clássicas no harness (iguais ao commit de PROD): sync 72, variações 59,
  kits 21, editar-peça 40, import-total 14, pendências-nuvemshop 33;
  pos-golive-1 com as mesmas 2 falhas antigas.
- Frontend 637 (vitest) e build ok. Gate `fast` 11/11. Gate `domain` 21/23:
  `domain-pure` falha em `nuvemshop-writes` ("página além da última é 404"),
  igual no commit de PROD; `inventario-d1-leitura` é intermitente nos dois
  lados (o `waitUntil` da requisição anterior soma 2 consultas ao contador).
- `src/v2-loja-online-qa.mjs` no site publicado, 1366 e 390 px, API do bundle
  desviada para o Worker do código no ar sobre o export final: tudo ok (sem
  código interno no detalhe nem na Preparação; aba "Sem peça em casa" com 55;
  KPIs 521 · 320 · 60).

## O que não foi provado aqui

- O agente não tem a `API_KEY`: as ações rodaram pelo cron
  (`config.nuvemshopPedidoAdmin`) e o QA usou uma cópia do banco. As escritas
  na loja (variantes, categorias, ocultos) foram conferidas pelo espelho
  `loja_variantes` e pela conferência, não abrindo o painel da Nuvemshop.
