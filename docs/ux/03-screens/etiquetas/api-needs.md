# Necessidades de API — Etiquetas

Nada aqui aprova rota, tabela ou migration. O painel atual opera
predominantemente no navegador; os dados abaixo descrevem necessidades do
produto futuro para avaliação na fase arquitetural adequada.

## Baseline atual

| Capacidade | Situação conhecida | Observação |
|---|---|---|
| peças, fila e impressão | existe no legado | inventariado em `docs/ui/`; React é placeholder |
| cadastro local de etiqueta | `localStorage` | separado do estoque e do D1 pelas regras atuais |
| composição, calibração, PDF e impressão | existe no legado | deve ser preservada antes de evoluir |
| histórico auditável por perfil | não confirmado | mockup define comportamento futuro |

## Necessidades futuras

| ID | Dado/capacidade | Para quê | Impacto potencial | Estado |
|---|---|---|---|---|
| ETQ-A001 | evento ou leitura de produtos recém-cadastrados/importados, com origem | alimentar a fila automaticamente | integração catálogo/importação; sem movimento de estoque | a avaliar |
| ETQ-A002 | nome de exibição da etiqueta e indicação de revisão | manter abreviação separada do nome completo | pode exigir persistência; toca banco se não permanecer local | a avaliar |
| ETQ-A003 | regras ou mapeamentos de abreviação conhecidos | aplicar automaticamente apenas transformações confiáveis | pode tocar catálogo/importação; não toca estoque | a avaliar |
| ETQ-A004 | lote de impressão com itens, quantidades, papel, calibração, origem, horário, ator e estado | histórico e reimpressão auditáveis | provável persistência nova; não aprovada | a avaliar |
| ETQ-A005 | perfil da sessão e permissões | atribuir responsável sem digitação manual | depende da solução futura de perfis | a avaliar |
| ETQ-A006 | foto principal opcional resolvida pelo padrão canônico | exibir miniatura sem bloquear produto sem foto | leitura de catálogo/fotos | parcialmente existente |
| ETQ-A007 | modelos de papel e preferências de calibração | preservar configuração por contexto definido | persistência local ou remota ainda aberta | a avaliar |

## Restrições do contrato futuro

- criar ou reimprimir lote não pode lançar movimento de estoque;
- renomear o texto da etiqueta não pode alterar o nome do produto sem uma ação
  explícita e separada;
- respostas devem distinguir ausência legítima de foto de falha ao carregar;
- histórico não pode depender apenas de texto digitado para identificar autoria;
- nenhuma rota ou schema é definido nesta documentação.
