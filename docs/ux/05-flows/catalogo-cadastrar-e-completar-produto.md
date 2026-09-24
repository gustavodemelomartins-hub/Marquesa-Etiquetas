# Fluxo: Cadastrar e completar produto

**Quem:** perfil autorizado de catálogo  
**Começa em:** Central do Catálogo → Novo produto  
**Termina em:** produto completo ou explicitamente incompleto, com estado
autoritativo de prontidão

> O espelho da Fase 4.5 não expõe a rota de criar/salvar produto. O desenho do
> formulário é válido, mas esta documentação não inventa seu contrato.

## Passos

| # | Onde | Ação | Contrato | Resultado | Escreve no banco? |
|---:|---|---|---|---|---|
| 1 | Cadastro do produto | informar os campos permitidos | rota de criação/edição não exposta no espelho | rascunho visual; salvar depende do contrato canônico complementar | não definido |
| 2 | Categoria | escolher categoria existente | edição recusa inexistente com `categoriasDisponiveis[]` | identidade de categoria válida | sim, pela edição existente não detalhada no espelho |
| 3 | Variações e dependências | consultar identidade física, kit/componente e arquivamento | `GET /api/produtos/:sku/variacoes`; `GET /api/produtos/:sku/dependencias` | relações visíveis sem palpite | não |
| 4 | Estoque | consultar total e em casa | `qtd`, `casa` | dois saldos apenas para leitura | não |
| 5 | Galeria | incluir e organizar fotos | contratos de galeria | original preservado, principal e ordem definidos | sim; bytes dependem de R2 |
| 6 | Central | reavaliar prontidão | `GET /api/catalogo/publicacao` | `falta_informacao` ou `pronto_para_preparacao` | não; estado é calculado |

## Onde pode falhar

| Ponto | Falha/bloqueio | O que a pessoa vê | Recuperação |
|---|---|---|---|
| salvar produto | contrato de escrita ausente neste espelho | ação não declarada como integrada | aguardar contrato, sem inventar rota |
| categoria | categoria inexistente | mensagem + `categoriasDisponiveis[]` | selecionar identidade válida |
| quantidade | tentativa de editar `qtd` | recusa 400 e explicação do fluxo correto | usar operação de estoque |
| foto | `sem_r2` | bloqueio do sistema, fora de `falta[]` | tentar quando infraestrutura existir |
| excluir produto | histórico em alguma dependência | `bloqueios[]` e alternativa arquivar | arquivar se autorizado |

## Invariantes

- falta humana e bloqueio de infraestrutura nunca usam a mesma lista;
- sem preço permanece em `falta[]` e bloqueia prontidão;
- presença na Nuvemshop não aprova nem completa automaticamente o produto local;
- quantidade do catálogo não é editável diretamente.

