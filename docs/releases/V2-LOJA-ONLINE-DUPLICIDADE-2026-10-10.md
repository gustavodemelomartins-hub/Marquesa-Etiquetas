# V2 — Loja online: duplicidade em todo código, estado atual vence a conferência, zero em casa (§66)

Data: 10/10/2026 · Regra: `api/REGRAS.md` §66 · Commits: `32ca780`, `f2c0c98`

## Versões

| | Nova | Rollback |
|---|---|---|
| Worker `marquesa-api` | `82ce9e35` | `1c3bc2d0` (Codex, contém o §64) |
| Pages `marquesa` (`marquesa-9da.pages.dev`) | `9b140d66` (`84073a66` sem o filtro) | `08544102` |
| D1 `marquesa-db-prod` | sem migration | bookmark `00000324-00000000-00005100-8a6fcdfbc972fd9f1ee20e40a12eacac` |

Nada foi publicado: 521 visíveis antes e depois, nenhum `publicado_em` novo.

## Antes → depois (export de PROD 04:3x → 05:1x UTC)

| | Antes | Depois |
|---|---|---|
| "Precisam de atenção" (códigos) | 34 (22 maleta + 12 identidade) | **22** (12 sem anúncio + 10 ocultos gêmeos) |
| Central de Pendências | 46 (12 · 34 maleta) | **56** (12 sem anúncio · 10 gêmeos ocultos · 34 maleta) |
| Prontos para publicar | 60 | **59** (561638 saiu: gêmeo do 561637) |
| Prontos com suspeita de duplicidade | 1 (561638) | **0** |
| "Conferir estoque da variação" | 30 | **0** |
| Fila de estoque | 934 sincronizados · 22 revisão | 956 · 0 |

## Resolvido automaticamente

- **8 falsos alertas de variação** (191620, 334079, 351489, 393950, 635650,
  647729, 711591, 717389): a fila sincronizada depois da conferência de
  09/10 09:51 vence o "sem mapeamento" dela. Regra permanente.
- **22 códigos com maleta sem variação**: a loja passou a mostrar o que o
  inventário #1 bipou em casa. 70 unidades que a loja vendia sem existir em
  casa saíram (235290 n°22 8→1; 218178 n°20 3→0), 13 que estavam em casa e
  não apareciam entraram. Razão, movimentos e vendas intocados; a pergunta
  da maleta continua na Central (34 itens). Dois lotes `reenviar_estoque`:
  12 + 10 sincronizados, 0 erros, 0 adiados, freio não acionado.
- **221300 × 244831**: acabamento diferente na loja (Prata × Ouro) —
  suspeita removida (e o 221300 está sem peça em casa).
- **318524 Verde × Verde Esmeralda**: equivalência operacional, sem
  pendência, sem reescrever nenhum nome, desfaz-se sozinha se o anúncio
  ganhar outra variante.
- Venda 5 (balcão, 22/08) teve só o `nuvemshop_status` regularizado
  (revisão → sincronizada) pela fila ao sincronizar 346802/647729; valor e
  itens iguais.

## Exige decisão humana

- **10 ocultos gêmeos** (não ficam prontos, não publicam): 186027 × 170308,
  222908 × 640509, 533018 × 721947, 561638 × 561637, 481514 × 454953,
  484220 × 483454, 120591 × 120592.
- **12 sem anúncio** (não são criados): 102311 × 114998, 196333 × 132944,
  272073 × 227655, 519177 × 408061/283680, 132961 × 194786, 187550 × 102367,
  387128 × 619940, 410321 × 750894, 450320 × 838474, 493074 × 466730,
  561637 × 561638; 334078 × 334079 (outro aro).
- **Informação, sem ação**: 151449, 156980, 619940 (ocultos sem peça em
  casa com gêmeo); 13 pares publicado × publicado (150163 × 159930,
  626317 × 895766 e outros).
- **34 itens de maleta** (22 códigos): qual variação cada revendedora levou.

## Testes

- `src/loja-online-duplicidade-test.mjs` — 23 provas (Worker real + loja falsa).
- Suítes do assunto: automação 18, catálogo 37, loja online 15,
  enriquecimento 19, fila 49, inventário 25, variações locais 16.
- Clássicas no harness: sync, variações, kits, editar-peça, import-total,
  pendências-nuvemshop, pos-golive-1, venda-item-id — todas passaram.
- Frontend 639 (vitest), `tsc` e build ok.
- Gate `fast` 9/11 — as mesmas 2 falhas anteriores do Codex
  (`/catalogo/enriquecer` sem inventário de contrato;
  `catalogo-enriquecimento-fluxo-test.mjs` sem classificação).
- `src/v2-loja-online-qa.mjs` no site publicado, 1366 e 390 px, sobre os
  exports antes e depois: tudo ok, inclusive filtro "Possível duplicidade",
  bloco de atenção e detalhe do gêmeo.

## O que não foi provado aqui

- O agente não tem a `API_KEY`: o reenvio rodou pelo cron
  (`config.nuvemshopPedidoAdmin`); o estoque enviado foi conferido pelo
  `enviado_json` da fila, não abrindo o painel da Nuvemshop. A conferência
  diária das 09:00 UTC relê a loja inteira.
