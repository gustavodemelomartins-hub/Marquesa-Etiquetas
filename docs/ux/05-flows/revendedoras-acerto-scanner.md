# Revendedoras — integração da câmera no acerto

## Fronteira de responsabilidade

O scanner compartilhado é dono de câmera, `MediaStream`, decodificação e
supressão temporal da mesma imagem. A resolução do código cru para SKU usa
`components/scanner/codigoDaEtiqueta.ts`. Revendedoras não repete nenhuma
dessas responsabilidades.

```text
components/scanner/LeitorDeEtiquetas
  lê a etiqueta e entrega o código cru
  mantém a câmera aberta
  impede releitura acidental conforme o comportamento do clássico
        ↓ aoLer(código cru)
AcertoMaletaFluxo
  chama o resolverSku compartilhado contra o catálogo
  confirma que o SKU pertence à maleta
  soma uma unidade em conferidos[SKU]
  mostra produto e X de Y conferidos
        ↓ somente quando a pessoa confirma o acerto
POST /api/maletas/:id/acerto
```

## Contrato de integração

`AcertoMaletaFluxo` recebe opcionalmente a integração compartilhada real:

```ts
interface IntegracaoScannerAcerto {
  Leitor: ComponentType<{
    aoLer: (codigo: string) => Promise<{ ok: boolean; texto: string }>;
    aoFechar: () => void;
    pausado?: boolean;
    titulo?: string;
    dica?: string;
    intervaloRepetidoMs?: number;
  }>;
  resolverSku: (
    codigo: string,
    conhecidos: { has(sku: string): boolean },
  ) => string | null;
}
```

O catálogo completo é entregue a `resolverSku`, permitindo distinguir uma peça
válida que está fora da maleta de um código inexistente. A resposta de `aoLer`
volta ao componente compartilhado, que mostra o texto e toca o bipe correto.

## Semântica do bip

- bip válido da maleta: incrementa somente o contador local de conferência;
- mesmo SKU: pode incrementar novamente até a quantidade enviada, porque podem
  existir várias unidades físicas com a mesma etiqueta;
- mesma imagem parada: a camada compartilhada aplica a janela temporal portada
  do clássico (`src/dashboard.tpl.html`); Revendedoras não bloqueia o SKU para
  sempre;
- SKU válido fora da maleta: não incrementa e mostra “Esta peça não pertence a
  esta maleta” sem `alert()`;
- quantidade já completa: não ultrapassa o enviado e informa que o SKU já está
  completo;
- nenhum bip chama API, grava venda, cria movimento ou altera estoque;
- a conferência manual e o `DocumentoAcerto` continuam independentes dos
  contadores físicos.

## Ciclo de vida

Fechar o scanner, avançar para a revisão ou fechar o drawer desmonta o componente
compartilhado. Ele deve parar todas as tracks do `MediaStream` no cleanup. Nenhum
frame, imagem ou vídeo é armazenado por Revendedoras.

## Estado em 24/09/2026

A extração compartilhada do Claude entrou em `develop` no commit `b2cbc1d`.
`RevendedorasArea` compõe a integração padrão com
`{ Leitor: LeitorDeEtiquetas, resolverSku }` e a entrega à prop
`scannerCompartilhado` de `AcertoMaletaFluxo`. A prop continua injetável para
testes de domínio, sem duplicar câmera, decodificação ou antirrepique.
