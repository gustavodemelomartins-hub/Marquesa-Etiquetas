# Componente: Galeria de produto

Conjunto reutilizável para consultar e organizar múltiplas fotos de um SKU sem
confundir original, preparada e endereço observado na loja.

## Responsabilidades

- mostrar uma ou mais fotos do SKU na ordem autoritativa;
- identificar exatamente uma foto principal;
- preservar e diferenciar original e versão preparada;
- permitir definir principal, reordenar, preparar/aprovar e excluir apenas
  pelas ações do contrato;
- representar foto própria, somente endereço da loja e nenhuma foto;
- manter bloqueio `sem_r2` separado de falta humana de foto.

## Estados

| Estado | Comportamento |
|---|---|
| vazia | nenhuma foto própria; orientação sem imagem quebrada |
| endereço da loja | referência externa claramente identificada, não tratada como arquivo próprio |
| uma foto | primeira já aparece como principal |
| várias fotos | uma principal e demais em ordem estável |
| original | arquivo fonte preservado |
| preparada | versão tratada associada, sem substituir o original |
| reordenando | somente a galeria aguarda; retorno pode trazer `ignorados[]` |
| excluindo principal | confirmação e atualização por `novaPrincipal` |
| bloqueada | `sem_r2` explicado como infraestrutura indisponível |
| erro | falha de foto localizada, distinta de preparo e publicação |

## Regras de interação

- reordenar não altera qual foto é principal sem ação explícita de principal;
- da segunda foto em diante, o sistema não escolhe automaticamente uma nova
  principal;
- preparação nunca sobrescreve o original;
- apagar é ação humana explícita; não acontece ao arquivar ou despublicar;
- `ignorados[]` e `novaPrincipal` são anunciados, nunca descartados;
- o componente não conhece Codex, ChatGPT ou fornecedor de preparação.

## Contrato

Ver [Catálogo — contrato da tela](../../03-screens/catalogo/api-needs.md#galeria-e-bytes).
Não existe implementação React aprovada nesta fase.

