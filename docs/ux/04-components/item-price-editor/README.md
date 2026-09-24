# Componente: editor de preço do item

Editor compacto usado para registrar o preço realmente cobrado sem transformar
a linha da venda em um formulário permanente.

## Gatilho

O preço unitário aparece antes do subtotal da linha. Hover, foco visível e um
lápis discreto comunicam que ele pode ser editado. Clique, toque ou `Enter`
abrem o editor ancorado; o subtotal em negrito continua somente leitura.

## Anatomia

```text
Preço de tabela                 R$ 150,00
Preço final por peça           [R$ 135,00]
Desconto calculado         R$ 15,00 · 10%
Motivo*                       [Grupo VIP ▾]

                         Cancelar  Aplicar
```

- preço de tabela: somente leitura e congelado para a venda;
- preço final por peça: único valor monetário editável;
- desconto: diferença e percentual derivados em tempo real;
- motivo: obrigatório quando houver diferença;
- `Aplicar`: atualiza a linha e todos os totais dependentes;
- `Cancelar`: descarta a edição local.

## Quantidade maior que um

Por padrão, o preço final vale para todas as unidades da linha. O editor permite
indicar uma quantidade menor que a quantidade da linha quando somente parte
receberá aquele preço. Ao aplicar, o sistema separa automaticamente:

```text
2 × SKU 122060 a R$ 150,00

desconto em 1 unidade para R$ 135,00
                   ↓
1 × SKU 122060 a R$ 150,00
1 × SKU 122060 a R$ 135,00 · Grupo VIP
```

A soma das quantidades não muda. Linhas equivalentes só podem ser reagrupadas
quando SKU, preço final e motivo forem iguais.

## Estados

| Estado | Apresentação | Ação |
|---|---|---|
| padrão | preço unitário discreto com affordance de edição | abrir editor |
| editando | popover ancorado e linha preservada | aplicar ou cancelar |
| inválido | motivo ou preço identificado junto ao campo | corrigir |
| aplicado | tabela riscada, preço final destacado e motivo disponível no detalhe | editar novamente |
| separação prevista | mostra quantas unidades manterão e receberão cada preço | confirmar ou cancelar |

## Regras

- a pessoa digita o preço final; desconto em reais e percentual são derivados;
- preço diferente exige motivo;
- preço do catálogo não muda;
- preço e desconto não movimentam estoque;
- pagamento ainda não confirmado acompanha o novo total; recebimento já salvo
  exige fluxo de correção auditável, não ajuste silencioso;
- valor monetário é calculado em centavos inteiros.

## Acessibilidade

- o preço editável participa da ordem de foco e possui nome acessível, por
  exemplo `Editar preço de Argola Duas Linhas`;
- o editor abre por teclado, mantém foco contido enquanto ativo e fecha com
  `Esc` sem aplicar;
- preço original riscado não é o único sinal de desconto: texto e valores
  continuam disponíveis para leitor de tela;
- erros anunciam o campo e a correção necessária.

## Referências

- [Nova Venda](../../03-screens/vendas/README.md#proposta-de-ux--desconto-por-peça)
- [Regras de Vendas](../../03-screens/vendas/rules.md#desconto-na-nova-venda)
- [Fluxo de lançamento](../../05-flows/lancar-venda-e-consultar-historico.md)
