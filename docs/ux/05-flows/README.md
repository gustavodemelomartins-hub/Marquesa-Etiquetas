# Fluxos

Percurso do usuário **entre** telas. Uma tela isolada não mostra onde o
trabalho começa e termina; o fluxo mostra.

Um arquivo por fluxo: `<nome-do-fluxo>.md`. Imagens do fluxo ficam nesta pasta,
nome `AAAA-MM-DD_fluxo-<nome>_<sequencia>.<ext>`.

## Fluxos registrados

| Fluxo | Arquivo | Telas envolvidas | Estado |
|---|---|---|---|
| Preparar, imprimir e reimprimir etiquetas | [etiquetas-preparar-imprimir-reimprimir.md](etiquetas-preparar-imprimir-reimprimir.md) | Catálogo/importação → Etiquetas: Preparar, Impressão e Histórico | descrito |
| Lançar venda e consultar histórico | [lancar-venda-e-consultar-historico.md](lancar-venda-e-consultar-historico.md) | Vendas, Personalização, Clientes e Financeiro | em detalhamento |
| Registrar recebimentos da venda | [registrar-recebimentos-da-venda.md](registrar-recebimentos-da-venda.md) | Nova Venda, Histórico e Financeiro | descrito |
| Registrar e estornar saída sem faturamento | [registrar-e-estornar-saida-sem-faturamento.md](registrar-e-estornar-saida-sem-faturamento.md) | Vendas, Estoque, Histórico e Inventário | em detalhamento |
| Cadastrar e completar produto | [catalogo-cadastrar-e-completar-produto.md](catalogo-cadastrar-e-completar-produto.md) | Central do Catálogo, Produto, Categorias e Galeria | mapeado; contrato de salvar produto não exposto no espelho |
| Enviar e casar fotos em lote | [catalogo-enviar-e-casar-fotos-em-lote.md](catalogo-enviar-e-casar-fotos-em-lote.md) | Fotos em lote, Revisão do casamento, Galeria e Órfãs | descrito pelo contrato 4.5 |
| Preparar, aprovar e publicar | [catalogo-preparar-aprovar-publicar.md](catalogo-preparar-aprovar-publicar.md) | Preparação, Aprovação e Publicação | descrito; publicação real desligada |
| Revisar divergências com Nuvemshop | [catalogo-revisar-divergencias-nuvemshop.md](catalogo-revisar-divergencias-nuvemshop.md) | Central, Sincronização e Preços divergentes | descrito pelo contrato 4.5 |

## Modelo de arquivo de fluxo

```markdown
# Fluxo: <nome>

**Quem:** <perfil>
**Começa em:** <tela / evento>
**Termina em:** <resultado observável>

## Passos
| # | Onde | Ação | Resultado | Escreve no banco? |
|---|---|---|---|---|

## Onde pode falhar
| Ponto | Falha | O que o usuário vê | Recuperação |
|---|---|---|---|

## Decisões abertas
```

A coluna **"escreve no banco?"** é obrigatória. Fluxo que move estoque ou
dinheiro tem regra de idempotência e razão contábil a respeitar
([api/REGRAS.md](../../../api/REGRAS.md)); marcar o passo agora evita descobrir
isso só na implementação.

Candidatos óbvios, ainda não escritos: venda no balcão, saída de maleta e
acerto, entrada de peça nova, pedido chegando da Nuvemshop, reparo, peça
personalizada.
