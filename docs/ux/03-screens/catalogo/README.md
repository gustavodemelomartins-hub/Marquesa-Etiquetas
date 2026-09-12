# Tela: Catálogo, Mídia e Publicação

| | |
|---|---|
| Estado do material | domínio mapeado; aguardando mockups |
| Última atualização | 10/09/2026 |
| Fonte técnica | `docs/domains/CONTRATO-UX-API-4-5.md` |
| Backend | implementado e provado na branch paralela; sem deploy |
| React | não implementado nesta trilha |

> Este arquivo descreve o produto futuro. Não autoriza implementação, deploy
> ou publicação na Nuvemshop.

## Princípio do domínio

```text
Sistema Marquesa = autoridade do produto aprovado
Nuvemshop = canal externo

preparação ≠ aprovação
aprovação ≠ publicação concluída
```

Nada preparado por agente publica sem aprovação humana. O executor de
preparação é desacoplado: hoje pode ser acionado por Codex/ChatGPT e no futuro
por API, mas a interface nunca exibe fornecedor de IA nem cria uma lista
fechada de executores.

`catalogo/` é uma família documental de telas. Isso não aprova um novo item no
cabeçalho global; o posicionamento final dentro de Estoque/Catálogo permanece
decisão de navegação.

## Arquitetura conceitual da experiência

```text
Catálogo
├── Visão de trabalho e publicação
├── Cadastro/edição do produto
│   ├── informações e categoria
│   ├── variações e dependências
│   └── galeria de fotos
├── Categorias
├── Fotos em lote
│   ├── análise do casamento
│   ├── envio por arquivo
│   └── resultado recontado
├── Preparação de conteúdo
├── Revisão e aprovação humana
├── Publicação/despublicação
└── Divergências Marquesa × Nuvemshop
```

## Telas conceituais a desenhar, em ordem

| Ordem | Visão | O que precisa fixar | Variações no mesmo desenho |
|---:|---|---|---|
| 1 | Central do Catálogo | fila de produtos e separação visual entre `falta[]`, `bloqueios[]`, presença na loja e estado do pipeline | incompleto, pronto, preparando, aguardando aprovação, aprovado, publicando, falhou, publicado e despublicado |
| 2 | Cadastro/edição de produto | dados editáveis, categoria, preço, quantidade apenas como leitura, estoque total/casa, variações, dependências e prontidão | produto completo e produto incompleto com lista única de faltas |
| 3 | Categorias | categorias reais, ordem, cor, contagens e ações autorizadas | `Sem categoria` como estado sentinela; órfã; ação indisponível conforme `podeRenomear`/`podeArquivar` |
| 4 | Galeria do produto | múltiplas fotos por SKU, original e preparada, ordem, foto principal e ausência legítima de foto | só endereço da loja; foto própria; nenhuma; sem R2; exclusão da principal promovendo a próxima |
| 5 | Upload de fotos em lote | seleção dos arquivos e ensaio do casamento antes de enviar bytes | análise, progresso por arquivo e falha isolada |
| 6 | Resultado do casamento por SKU | revisão de `vinculado`, `multiplas`, `sku_nao_encontrado`, `nome_ambiguo`, `nome_invalido`, `duplicado` e `erro_upload` | renomear e reanalisar quando resolver ambiguidade; resumo final recontado |
| 7 | Preparação de conteúdo | produtos prontos, tarefas abertas, já existentes e recusadas; executor como rótulo livre interno | em preparação, conteúdo preparado, falha de preparo e cancelamento da tarefa |
| 8 | Revisão e aprovação humana | prévia do conteúdo, aprovação invalidada e ações `Aprovar` ou proposta de UX `Pedir ajuste` vinculada a `reabrir` | aguardando aprovação, aprovado para publicar, aprovação invalidada |
| 9 | Publicação e presença na loja | ensaio com payload exato, bloqueio atual da escrita real, progresso, falha, publicação, despublicação e origem observada | simulação; flag desligada; rodada pausada acima de 20; “Está na loja” quando observado |
| 10 | Divergências Marquesa × Nuvemshop | próxima sincronização, `semEmpurrar[]`, produtos só na loja e preços divergentes sem correção automática | análise seca, item não empurrado, candidato sem ação inventada |

Essas dez visões não representam dez módulos. Produto incompleto é uma variante
do cadastro; os estados do pipeline são variantes da Central; falha,
publicado e despublicado são variantes da publicação.

## Relações

- Contrato de tela/API: [api-needs.md](api-needs.md).
- Estados obrigatórios: [states.md](states.md).
- Fluxos: [cadastrar e completar](../../05-flows/catalogo-cadastrar-e-completar-produto.md), [fotos em lote](../../05-flows/catalogo-enviar-e-casar-fotos-em-lote.md), [preparar, aprovar e publicar](../../05-flows/catalogo-preparar-aprovar-publicar.md) e [revisar divergências](../../05-flows/catalogo-revisar-divergencias-nuvemshop.md).
- Matriz tela ↔ backend: [Fase 4.5](../../07-mapping/catalogo-fase-4-5.md).

## Material visual

Ainda não há mockup da Fase 4.5 salvo. Quando chegar, usar
`images/AAAA-MM-DD_catalogo-<visao>_<viewport>_<sequencia>.<ext>`.
