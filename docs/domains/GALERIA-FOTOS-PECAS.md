# Galeria de fotos da peça (V2 › Peças)

Data: 29/09/2026 · Migration: `api/migracao-galeria-fotos.sql` (aditiva)

## Onde está, para quem usa

| Ação | Onde |
|---|---|
| Ver todas as fotos, ampliar, ordenar, escolher a principal, remover | Peças › toque na peça › aba **Fotos** |
| Buscar/importar as fotos de UMA peça na loja online | aba **Fotos** › **Buscar fotos na loja online** (também na aba **Loja online**) |
| Importar o catálogo inteiro (migração inicial) | Peças › botão **Importar fotos da Nuvemshop** (topo, ao lado de "Novo produto") — endereço `#/estoque/importar-fotos` |
| Filtrar por situação de foto | Peças › seletor **Fotos** (sem foto, 1, várias, importadas, só na loja, precisa revisar, não está na loja) e **Cadastro incompleto › Sem foto** |
| Conferência visual do catálogo | Peças › **Lista \| Galeria** |

## Modelo

`produto_fotos` (Fase 4.5) é a relação Peça → Fotos. Uma linha por foto, bytes no R2
em `produtos/<sku>/<fotoId>/{original,miniatura,preparada}`. Colunas relevantes:

| Coluna | Papel |
|---|---|
| `ordem` | posição na galeria, decidida por gente (arrastar / botões) |
| `principal` | a capa, decisão explícita; índice único parcial garante uma por peça |
| `origem` | `nuvemshop` · `upload` · `lote` · `adocao` |
| `imagem_id_loja`, `produto_id_loja`, `variante_id_loja`, `posicao_loja`, `url_externa` | procedência da loja |
| `miniatura_key/_tipo/_tam`, `largura`, `altura` | miniatura própria (≤400 px) e dimensões |
| `removida_em` | remoção com memória (ver abaixo) |

Ordem e principal são independentes desde 29/09/2026: a galeria é ordenada só por
`ordem`; "Definir como principal" também leva a foto para o início, mas reordenar
depois não troca a principal.

A principal aparece em toda a V2 pelo `/api/state` (`fotoGaleriaUrl`, `fotoMiniUrl`,
`fotosQtd`, `fotosDaLoja`, `fotosNaLoja`, `naLoja`) e `domain/foto.ts › fotoDaPeca`,
que a coloca à frente das fontes antigas. O painel clássico não lê a galeria.

## Leitura das imagens

Fotos não são públicas. `GET /api/galeria/:id/:versao?exp&sig` (sem Bearer, HMAC com
a `API_KEY`). O prazo é o fim da janela de 12 h + 12 h: o endereço não muda entre
recargas e o navegador usa o cache.

A assinatura é **da janela** (`galeria|*|<exp>`), um HMAC por `/api/state`. Até 29/09
22h era uma por foto: com 1.100 fotos isso dava ~140 ms de CPU, o plano gratuito do
Workers dá 10 ms, e o estado passou a morrer sem resposta — a tela ficava com o estado
velho ("0 fotos" com duas fotos na galeria). O que se abre mão: um link vazado lê, até
expirar, outra foto cujo id (UUID aleatório, só no `/api/state`) a pessoa conheça. Link
antigo, assinado foto a foto, continua valendo até o prazo dele. A V2 recebe o caminho e prefixa o
endereço da API (`services/client.ts › enderecoDaFoto`).

## Casamento loja ↔ peça (`api/src/catalogo/fotos-da-loja.js`)

Por imagem, em camadas, parando na dúvida:

1. **SKU** — a variação declara `image_id`, ou o anúncio tem um código só; o código existe aqui.
2. **Vínculo gravado** — `produto_variacoes.variante_id/produto_id`, `produtos.produto_id_loja`, apontando para UM código.
3. **Histórico** — o endereço da imagem é o `produtos.foto_url` gravado em UMA peça.

Vai para **Precisa revisar** (sem vincular): camadas discordam; vínculo aponta para vários
códigos; anúncio junta vários códigos daqui e a foto não está presa a uma variação; o mesmo
código aparece em dois anúncios. Vai para **Sem correspondência**: código da loja que não
existe aqui. Nenhum caminho casa por nome.

## Idempotência e remoção

- Índice único `idx_produto_fotos_imagem_loja (sku, imagem_id_loja)`: a mesma imagem da loja
  não entra duas vezes; `INSERT OR IGNORE` + limpeza dos bytes se outra aba ganhou a corrida.
- Imagem idêntica (hash) a uma já enviada à mão: amarra o id da loja nela em vez de duplicar.
- **Remover** apaga os bytes do R2 (a chave inclui o id da foto — nada mais aponta para ela)
  e mantém a linha com `removida_em`. A foto da loja online não é tocada, e a próxima
  importação não a traz de volta.

## Fluxo da importação em massa

`POST /api/fotos/loja/analisar` lê o catálogo inteiro (só leitura na Nuvemshop), atualiza o
espelho `loja_fotos` e devolve o plano — é o dry-run. `POST /api/fotos/loja/importar
{limite, ignorar}` executa o próximo lote (≤20 fotos, 2 buscas na CDN cada); a tela repete até
`restantes = 0`. Parar no meio não perde nada. `GET /api/fotos/loja/plano` relê o plano sem
falar com a loja.

A tela abre pelo **plano** (barato) e só relê a loja quando não há leitura gravada ou quando
a pessoa toca em **Ler a loja de novo**. Lote de 6. Chamada que morre sem resposta (limite
do Worker) é repetida com lote menor, 6 → 3 → 1; se UMA foto sozinha derruba o servidor
quatro vezes, e `/api/health` responde, ela é pulada com o motivo (a resposta de cada lote
traz `proximos`, a fila seguinte, para a tela saber qual é). No máximo 10 por rodada;
servidor fora do ar para a importação sem pular nada.

Nada disto escreve na Nuvemshop, lê pedidos ou movimenta estoque. A sincronização de
pedidos e estoque continua desligada.

## Provas

- `src/galeria-fotos-test.mjs` — Worker real, SQLite, R2/loja/CDN falsos (29 provas).
- `frontend/src/features/estoque/galeria/GaleriaDaPeca.test.tsx` — componente (9).
- `src/v2-galeria-e2e.mjs` — navegador, 1280 e 390 px, sobre `MQ_LOCAL_FOTOS=1`
  (`scripts/v2-local/loja-falsa-fotos.mjs`) — 58 provas.
