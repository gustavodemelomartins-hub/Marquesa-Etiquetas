# Tela: Etiquetas

| | |
|---|---|
| Estado do material | descrito |
| Última atualização | 10/09/2026 |
| Referências recebidas | 3 mockups próprios |
| Existe hoje no legado? | sim — operação de peças, fila e impressão |
| Existe hoje no React? | placeholder; ver [07-mapping/frontend-feature-map.md](../../07-mapping/frontend-feature-map.md) |

> Esta pasta é documental. Nada aqui autoriza implementação; ver
> [00-index.md](../../00-index.md).

## Direção aprovada

O painel futuro organiza o trabalho em três momentos: **Preparar**,
**Impressão** e **Histórico**. A operação atual foi relatada por Gustavo como
100% funcional no uso da Marquesa; o redesenho deve preservar essa capacidade,
inclusive impressão em folha adesiva A4, antes de acrescentar refinamentos.

O fluxo aprovado permite selecionar produtos e quantidades, revisar exatamente
o que será impresso, calibrar o alinhamento, imprimir ou baixar PDF e consultar
os lotes anteriores com data, horário e pessoa responsável.

## Para quem

- Sthefany Marques e demais perfis autorizados a preparar e imprimir etiquetas;
- administração, para consultar histórico e identificar quem realizou cada lote.

## Mockups aprovados

| Visão | Arquivo | O que fixa |
|---|---|---|
| Preparar etiquetas | [desktop 01](images/2026-09-10_etiquetas_desktop_01.png) | fila, filtros, quantidades, prévia e resumo da impressão |
| Revisar impressão | [desktop 02](images/2026-09-10_etiquetas_desktop_02.png) | folha proporcional, produtos selecionados, calibração, PDF e impressão |
| Histórico de impressões | [desktop 03](images/2026-09-10_etiquetas_desktop_03.png) | lotes, responsável, estados, detalhes e reimpressão |

As imagens são referência de produto, não medidas finais. Folha, etiquetas e
espaços devem manter proporção e legibilidade na implementação.

O conteúdo da área está aprovado, mas o símbolo alternativo mostrado à esquerda
nestes mockups **não substitui** a identidade já definida: Etiquetas deve usar o
[cabeçalho global e a logo principal aprovados](../../04-components/header/README.md).

## Blocos da tela

| # | Bloco | O que mostra | Origem do dado | Referência |
|---:|---|---|---|---|
| 1 | Navegação contextual | Preparar, Impressão com quantidade e Histórico | estado da área | desktop 01–03 |
| 2 | Fila de preparação | produto, foto opcional, nome, SKU, preço, origem e quantidade | catálogo, cadastro manual e importação | desktop 01 |
| 3 | Resumo da impressão | produtos, etiquetas, folhas, posições e modelo de papel | seleção e configuração da folha | desktop 01 |
| 4 | Revisão da folha | posição real de cada etiqueta e espaços livres | composição do lote | desktop 02 |
| 5 | Alinhamento | ajuste horizontal e vertical e ação de calibrar | configuração da impressão | desktop 02 |
| 6 | Histórico | data/hora, responsável, origem, totais, estado e ações | lotes de impressão | desktop 03 |
| 7 | Detalhe do lote | produtos e quantidades incluídos, autoria e reimpressão | lote selecionado | desktop 03 |

## Relações importantes

- Fluxo completo: [preparar, imprimir e reimprimir](../../05-flows/etiquetas-preparar-imprimir-reimprimir.md).
- Ideias funcionais associadas: [IF-002, IF-003 e IF-004](../../06-backlog/functional-ideas.md).
- O painel existente é inventariado em `docs/ui/`; esta pasta descreve o alvo futuro.

## Log de material recebido

| Data | O que chegou | Arquivo | Quem enviou |
|---|---|---|---|
| 10/09/2026 | mockup Preparar etiquetas | `images/2026-09-10_etiquetas_desktop_01.png` | Gustavo |
| 10/09/2026 | mockup Revisar impressão | `images/2026-09-10_etiquetas_desktop_02.png` | Gustavo |
| 10/09/2026 | mockup Histórico de impressões | `images/2026-09-10_etiquetas_desktop_03.png` | Gustavo |
