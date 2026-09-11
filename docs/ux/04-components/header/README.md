# Componente: Header

Faixa superior de página: identificação de onde o usuário está e ações principais da tela.

| | |
|---|---|
| Estado do padrão | alvo visual aprovado |
| Decisão | todo o cabeçalho do sistema deve seguir este padrão |
| Data e origem | 10/09/2026 · Gustavo |
| Referência principal | [2026-09-10_header_desktop.png](2026-09-10_header_desktop.png) |

Registre aqui apenas o padrão que **repete em mais de uma tela**. Se só existe
numa tela, ele mora no README daquela tela.

Imagens deste componente ficam nesta pasta, nome
`AAAA-MM-DD_header_<variante>.<ext>`.

## Variantes

| Variante | Quando usar | Referência |
|---|---|---|
| desktop | largura suficiente para marca, navegação, notificações e perfil na mesma linha | [mockup aprovado](2026-09-10_header_desktop.png) |
| tablet | — ainda não definido — | decisão pendente `DP-001` |
| mobile | — ainda não definido — | decisão pendente `DP-001` |

## Anatomia aprovada no desktop

1. logo horizontal compacta à esquerda;
2. navegação principal central, com ícone e rótulo;
3. área ativa com fundo rosa suave e sublinhado bordô;
4. separador antes das utilidades;
5. notificações, avatar, nome, perfil e menu da conta à direita;
6. ornamentos lineares rosas nos cantos, discretos e sem competir com a navegação;
7. navegação secundária contextual abaixo do cabeçalho quando a área tiver
   subseções.

## Estados

| Estado | Aparência | Definido? |
|---|---|---|
| padrão | fundo branco quente, contorno fino e marca/navegação distribuídas em uma linha | sim, desktop |
| item ativo | fundo rosa suave, texto/ícone bordô e sublinhado espesso | sim, desktop |
| notificação pendente | contador junto ao sino, com valor legível além da cor | sim, conceito |
| foco (teclado) | foco visível sem depender apenas da mudança de cor | sim, conceito; acabamento pendente |
| desabilitado | | não |
| carregando | | não |
| erro | | não |

## Regras de uso

- o título diz a tela, não o sistema;
- ação destrutiva não fica no header sem confirmação.
- a logo nunca é esticada, achatada ou usada como fundo decorativo;
- navegação ativa é identificável por cor e forma;
- nome, perfil e contador dos mockups são dados ilustrativos, não conteúdo fixo;
- quando o perfil ilustrativo representar a operadora principal, usar a grafia
  correta **Sthefany Marques**; a grafia diferente presente no PNG original
  está supersedida pela correção de 11/09/2026;
- o cabeçalho deve manter a mesma estrutura visual entre as áreas; muda apenas
  o item ativo e a navegação secundária pertinente;
- em larguras insuficientes, a solução responsiva deve reorganizar elementos,
  não comprimir a marca nem reduzir alvos de toque.

## Componente React equivalente hoje

— a preencher — Inventário do que já existe:
`docs/ui/COMPONENT-INVENTORY.md`. Não presuma que o padrão novo substitui o
componente atual; isso é decisão da fase 9 do Master Plan.

## Ativo de interface

O protótipo mestre de Vendas usa a
[`logo_sistema-marquesa_principal.png`](../../01-brand/logo_sistema-marquesa_principal.png)
original enviada por Gustavo. Não reconstruir nem substituir o desenho da
marca por aproximação.
