# Identidade — Sistema Marquesa

Registro da identidade visual e verbal do produto. Só o que foi **definido**
entra aqui; o resto fica como decisão pendente.

Nome do produto: **Sistema Marquesa**. O repositório continua `Marquesa-Etiquetas`
e esta pasta não autoriza renomear repositório, pastas, URLs, build ou
entrypoints.

## Cores

| Papel | Valor | Onde usar | Origem |
|---|---|---|---|
| bordô principal | valor técnico a validar | navegação ativa, ações primárias, números de destaque e séries principais; não usar como cor padrão de todo título | mockups aprovados + ajuste de Gustavo em 10/09/2026 |
| rosa suave | valor técnico a validar | fundos de seleção, ícones auxiliares e detalhes decorativos | mockups aprovados por Gustavo em 10/09/2026 |
| branco quente | valor técnico a validar | fundo geral e superfícies | mockups aprovados por Gustavo em 10/09/2026 |
| rosa de borda | valor técnico a validar | contornos leves e divisores | mockups aprovados por Gustavo em 10/09/2026 |
| texto escuro | valor técnico a validar | títulos principais, títulos de seção, texto de interface e ícones neutros | preferência explícita de Gustavo em 10/09/2026 |

Os papéis cromáticos e a hierarquia estão aprovados. Os valores hexadecimais
não devem ser extraídos cegamente do PNG: serão definidos quando houver
tratamento dos ativos e teste de contraste. Sucesso, alerta, erro e informação
continuam sem paleta aprovada.

Direção cromática confirmada: os títulos devem ser predominantemente escuros.
O bordô/rosa funciona como acento de seleção, ação e destaque; repetir a cor em
todos os títulos enfraquece a hierarquia e foi recusado por Gustavo.

## Tipografia

| Papel | Família | Peso / tamanho | Origem |
|---|---|---|---|
| títulos e números editoriais | serif de alto contraste; família e escala a validar | mockups aprovados por Gustavo em 10/09/2026 |
| navegação, rótulos e texto operacional | sans-serif limpa; família e escala a validar | mockups aprovados por Gustavo em 10/09/2026 |

## Logo e marca

O conjunto visual da marca — monograma `M` com diamante, assinatura
`MARQUESA` e complemento `SEMIJOIAS` — foi aprovado por Gustavo em
10/09/2026 como a logo do sistema.

Arquivo recebido: [logo_sistema-marquesa_principal.png](logo_sistema-marquesa_principal.png).

O protótipo deve usar este arquivo original. A reconstrução vetorial criada em
11/09/2026 foi recusada por não preservar fielmente a logo enviada e foi
removida.

No cabeçalho usa-se a composição horizontal compacta, preservando proporção e
área de respiro. O arquivo recebido é uma referência raster com fundo,
contorno e ornamentos; antes da implementação será necessário preparar um
ativo de interface limpo, preferencialmente vetorial ou com transparência. Não
recortar nem deformar este PNG para simular esse ativo.

Arquivos de marca, quando chegarem, ficam nesta pasta com nome
`logo_<variante>.<ext>`.

## Tom de voz

Critérios já válidos por herança do sistema, não por decisão de design:

- número que representa peça física nunca aparece arredondado ou adivinhado;
- o que o sistema decide **não** fazer é anunciado na tela, não engolido;
- mensagem de erro diz o que fazer, não só o que falhou.

O resto — pessoa, formalidade, vocabulário de botão — ainda não definido.

## Acessibilidade

- contraste mínimo, tamanhos e escala final: — ainda não definido —;
- bordô e rosa não podem ser o único sinal de seleção: item ativo também usa
  forma, sublinhado ou texto;
- foco por teclado deve permanecer visível em navegação, filtros e gráficos.
