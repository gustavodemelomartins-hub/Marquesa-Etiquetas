# Fechamento global V2 — 19/09/2026

**FULL V2 UX PROTOTYPE — READY FOR GUSTAVO REVIEW**
Não é aprovação do produto.

## Entrada e navegação

- Principal: `/prototype/`
- Hub: `/prototype/hub/`
- Manifesto: `prototype/routes.json`

O cabeçalho mostra diretamente Home, Vendas, Clientes, Financeiro, Estoque,
Catálogo, Revendedoras, Garantias/Reparos, Etiquetas, Nuvemshop, Agenda,
Notificações e Configurações. A navegação mobile mantém os mesmos 13 destinos em
grade compacta. Subáreas têm links explícitos e URLs próprias.

O inventário separa 18 páginas públicas, 49 superfícies documentadas e duas
capacidades futuras. Todas permanecem `READY FOR GUSTAVO REVIEW`.

## Protótipo funcional

- dados demonstrativos compartilhados entre Vendas, Clientes e Financeiro;
- persistência em IndexedDB, fallback para sessão e ação Restaurar demonstração;
- cadastro e edição completos de cliente;
- fluxos demonstrativos de venda, recebimento, inventário, maleta/acerto,
  garantia/troca e etiquetas;
- Nuvemshop refeita como listas operacionais, com seis etapas, pendências,
  publicados, divergências e sincronização;
- revisão de conteúdo, categoria, preço, galeria, foto principal e ordem;
- publicação, falha, repetição e invalidação de aprovação totalmente simuladas;
- estados loading, vazio, erro e parcial recuperáveis em cada módulo.

Não existe chamada operacional, credencial, D1, escrita na Nuvemshop ou
sincronização entre navegadores. Uma futura fonte staging deve usar snapshot
controlado, nunca D1 PROD.

## Verificação

O pacote público é gerado por lista explícita de 33 assets e 18 rotas. A matriz
automatizada executa 793 verificações em 320, 390, 768, 1024 e 1440 px, cobrindo
links, fragmentos, abertura direta, recarga, voltar/avançar, estados, tela
correta, cabeçalho, overflow, erros JavaScript e ausência de chamadas
operacionais. Há ainda 19 verificações de dados compartilhados e 130 da
Nuvemshop.

O contrato completo está em [UI DATA CONTRACT](ui-data-contract-v2.md), e o
estado de cada superfície na [matriz única](product-screen-inventory-v2.md).
