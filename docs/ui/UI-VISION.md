# Visão de UI — Sistema Marquesa

## Identidade e objetivo

O nome oficial do produto é **Sistema Marquesa**. A interface React será o
frontend definitivo, substituindo o dashboard legado por áreas completas e
com paridade comprovada, sem reescrita total nem retirada antecipada do
fallback.

Esta trilha é responsável por produto, React, UI, UX, design system,
componentes visuais, responsividade e fidelidade às referências. Backend,
contratos, arquitetura, D1 e refatoração estrutural pertencem à trilha paralela
do Claude Code.

## Regra de registro

Toda tela mantém três estados separados:

1. **ESTADO ATUAL** — o que existe e pode ser provado no código.
2. **REFERÊNCIAS / DESEJO** — sinais ainda não aprovados, inclusive conflitos.
3. **ALVO APROVADO** — somente decisão humana explícita.

Nenhuma referência enviada é alvo aprovado por padrão.

## Tipos de informação

Cada registro deve ser classificado como um dos tipos abaixo:

- **REGRA DE NEGÓCIO** — verdade operacional; a UI apenas a comunica.
- **REQUISITO FUNCIONAL** — capacidade que a pessoa precisa executar.
- **DECISÃO DE UX** — comportamento, sequência, prevenção de erro ou navegação.
- **DECISÃO VISUAL** — composição, hierarquia, tipografia, cor ou acabamento.
- **REFERÊNCIA** — material externo ou interno usado para comparação.
- **IDEIA** — hipótese ainda não aprovada.
- **PENDÊNCIA** — escolha ou informação ainda ausente.

## Força das referências

| Classe | Significado |
|---|---|
| A | Seguir fielmente. |
| B | Referência principal. |
| C | Inspiração. |
| D | Aproveitar apenas elementos nomeados. |
| E | Não repetir. |

“É esse resultado que eu queria” é um sinal forte, mas ainda deve ser ligado à
tela e ao aspecto específico. “Gosto só dessa parte” limita o requisito à
parte indicada.

## Princípios já vigentes

- React é o destino; o legado continua como referência e fallback até a
  paridade por fluxo.
- Estados de carregamento, vazio, erro, sucesso e confirmação fazem parte da
  tela, não são acabamento posterior.
- Risco deve ser anunciado de forma proporcional e ações de leitura, análise,
  escrita local e efeito externo devem ser distinguíveis.
- Acessibilidade, contraste, foco por teclado, movimento reduzido e uso móvel
  são critérios de aceite.
- Mockup não cria regra de negócio e regra de negócio não determina sozinha a
  solução visual.
- A tela deve usar o vocabulário de trabalho da Marquesa; nomes internos de
  módulo não ganham destaque apenas porque existem no código.

## Estado visual atual

O React atual usa Cormorant Garamond + Jost, paleta marfim/bordô/rosé, escala
de espaçamento, três raios e quatro tons semânticos (`neutro`, `positivo`,
`atencao`, `critico`). Esses tokens são o **estado atual**, derivados da marca
e do legado; não são o redesign aprovado.

## Pendências abertas

- A ordem principal diverge: o legado usa `Estoque → Revendedoras → Vendas →
  Etiquetas`; o React usa `Etiqueta → Estoque → Revendedoras → Vendas`.
- O rótulo diverge entre `Etiquetas` no legado e `Etiqueta` no React.
- Não há decisão aprovada sobre deep links ou biblioteca de rotas.
- Não há referência visual recebida nem tela com alvo aprovado nesta trilha.

Esses conflitos permanecem registrados; não serão resolvidos silenciosamente.
