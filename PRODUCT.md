# Produto

Sistema interno da **Marquesa Semijoias**: controla o estoque físico de
semijoias, o trabalho das revendedoras e a loja online na Nuvemshop.

Este documento diz o que o produto é e para quem. Regra de negócio vive só em
[api/REGRAS.md](api/REGRAS.md); arquitetura, em
[docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

## Problema

Cada peça é física e tem valor. Uma venda registrada duas vezes cobra a
cliente em dobro; uma baixa errada some com peça da prateleira; um estoque
online maior que o físico vende o que não existe. O sistema existe para que
o número na tela seja o número na gaveta, e para que cada mudança tenha um
motivo rastreável.

## Quem usa

- **A operação da loja**: uma ferramenta interna, de uso de poucas pessoas,
  com senha compartilhada e sem contas de usuário.
- **Revendedoras**, indiretamente: recebem maletas em consignação e acertam
  o que venderam; o sistema registra, elas não acessam.
- **Clientes da loja online**, indiretamente: veem o estoque que o sistema
  publica na Nuvemshop.

## Fluxos críticos

- Venda no balcão e venda da loja online (pedido importado sem duplicar).
- Maleta da revendedora: saída em consignação, retorno e acerto.
- Inventário por bipagem, por variação, com fechamento que ajusta o estoque
  com motivo.
- Estoque online: a fila envia à Nuvemshop o que a casa tem. A loja não define o
  estoque físico; a única exceção é a semeadura de variações (regra 4 do
  [AGENTS.md](AGENTS.md)). Venda da loja baixa estoque pelo pedido importado.
- Catálogo: peça nova nasce oculta na loja e só é publicada por um clique.

## Restrições

- `movimentos` é razão contábil: todo estoque se explica por movimento.
- Produção (Worker, D1 e Pages na Cloudflare) é a fonte de verdade operacional.
- O banco roda no plano gratuito do D1: o custo de consulta por requisição é
  uma restrição de desenho, não um detalhe.
- Ambiguidade que pode representar peça física é mostrada a uma pessoa, nunca
  resolvida por palpite.

## Painéis

Dois painéis sobre o mesmo backend: o legado em HTML/JS (`src/dashboard.tpl.html`)
e o React + TypeScript + Vite (`frontend/`, publicado em `/v2/`). Os fluxos
acima valem para os dois.
