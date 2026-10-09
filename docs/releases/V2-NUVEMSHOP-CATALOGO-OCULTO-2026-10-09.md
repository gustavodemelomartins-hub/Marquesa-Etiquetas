# V2 — catálogo oculto na Nuvemshop, auditoria das variações e Preparação (09/10/2026)

REGRAS §62. Produção = Worker `marquesa-api` + D1 `marquesa-db-prod` +
Pages `marquesa` (servido em `marquesa-9da.pages.dev`, que **é** produção).

## 1. Antes

- Estoque online pela fila (§61) em produção desde 08/10: 590/590 variantes
  mapeadas iguais. Conferência fresca de 09/10 04:31 UTC: loja com 598
  produtos / 675 variantes — idêntica à de 08/10 (nenhuma variante nova
  criada no painel da Nuvemshop desde então).
- O sistema não criava produto na loja. 334 códigos com peça em casa e sem
  anúncio; 17 só com peça em maleta.
- 40 variações criadas AQUI (Peças › Variações, origem `local`) em 32 códigos,
  nenhuma com id da loja.

## 2. O que mudou

Ver §62. Em uma frase: peça com estrutura segura nasce na Nuvemshop como
`hidden` (id, variantes, SKU, estoque, texto, SEO, categoria de mesmo nome),
recebe estoque pela fila de §61, e só fica `visible` pelo clique em
"Publicar na Nuvemshop", que confere tudo na própria loja antes.

- `api/src/catalogo/nuvemshop-catalogo.js` — classificar, criar oculto
  (lote, reserva, adoção, conferência de `hidden`), variante faltante em
  anúncio existente, foto que entra depois, publicar, estado pela leitura.
- `api/src/catalogo/texto-site.js` — a regra editorial de 08/10 aplicada ao
  nome cadastrado; "Precisa de informação" em vez de texto genérico.
- `api/src/sync.js` — variante única na loja + estoque repartido aqui: manda
  só o saldo da variação equivalente (o 391471 ia com 2 para o aro 18 que tem 1).
- `api/src/variantes.js` — movimento com id `local:…` conta pelo nome.
- `api/src/nuvemshop-estoque.js` — conferência grava visibilidade e nº de
  categorias; cron aceita `catalogo`, `catalogo_variantes`, `catalogo_fotos`
  em `config.nuvemshopPedidoAdmin` e, com o catálogo ligado e a fila ociosa,
  cria até 5 ocultos (ou sobe 2 fotos) por rodada.
- Preparação para Nuvemshop: abas Não cadastrados · Ocultos em preparação ·
  Prontos para publicar · Publicados · Com erro; chips por pendência; card com
  ✓ ✕ ⚠; "Publicar na Nuvemshop" com confirmação; detalhe técnico recolhido.
- Migration `api/migracao-nuvemshop-catalogo.sql` (tabela
  `nuvemshop_catalogo`, `produtos.visibilidade_loja`,
  `nuvemshop_conferencia.ns_categorias`).

## 3. Travas e rollback

- Kill switch do catálogo: `UPDATE config SET valor='false' WHERE chave='nuvemshopCatalogoAtivo'`
  (ou `PUT /api/nuvemshop/catalogo/automatico {"ativo": false}`). O estoque de
  §61 não depende dele.
- Produto criado oculto que precise sair: ele já não aparece; apagar na loja é
  decisão humana (Classe D) — a lista está em `nuvemshop_catalogo` (`origem = 'criado'`).
- Rollback de código: Worker e Pages anteriores (ver § 4). Rollback do banco:
  `api/migracao-nuvemshop-catalogo-rollback.sql` (não apaga nada na loja).

## 4. Execução em produção

(preenchido na execução)
