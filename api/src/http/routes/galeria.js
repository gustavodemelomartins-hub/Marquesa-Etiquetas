/** Galeria própria da peça e upload em lote (Fase 4.5).
 *
 *  Transporte apenas — quem decide de quem é uma foto é
 *  `catalogo/nome-de-arquivo.js`, e quem fala com o R2 é
 *  `catalogo/galeria.js`.
 *
 *  Dois detalhes do contrato que não podem mudar de forma:
 *
 *   - o upload recebe os BYTES no corpo, sem envelope JSON. Base64 infla 33%
 *     um arquivo que já chega carimbado com o Content-Type pelo navegador;
 *   - o lote analisa numa chamada e grava noutra, um arquivo por
 *     requisição. É o que faz um arquivo ruim não derrubar os outros 300.
 */
import { json } from '../../auth.js';
import {
  galeriaDoProduto, adicionarFoto, registrarPreparada, aprovarFoto,
  definirPrincipal, reordenarGaleria, removerFotoDaGaleria,
} from '../../catalogo/galeria.js';
import {
  analisarLote, lerLote, enviarArquivoDoLote, confirmarLote, cancelarLote,
} from '../../catalogo/lote-de-fotos.js';

const sku = (params) => decodeURIComponent(params.sku);
const codigo = (r, padrao = 200) => (r.ok ? padrao : (r.statusHttp ?? 400));

export const rotas = [
  {
    metodo: 'GET', caminho: '/api/produtos/:sku/galeria', auth: 'bearer',
    async handler({ db, params }) {
      return json(await galeriaDoProduto(db, sku(params)));
    },
  },
  {
    // Os bytes vão no corpo; o nome do arquivo, quando existir, no cabeçalho
    // `X-Arquivo` — é ele que a auditoria do lote usa para responder "de
    // qual arquivo saiu esta foto?".
    metodo: 'POST', caminho: '/api/produtos/:sku/galeria', auth: 'bearer',
    async handler({ db, env, request, params }) {
      const tipo = (request.headers.get('Content-Type') || '').split(';')[0].trim();
      const bytes = await request.arrayBuffer();
      const r = await adicionarFoto(db, env, sku(params), bytes, tipo, {
        arquivoNome: request.headers.get('X-Arquivo') || null,
        principal: request.headers.get('X-Principal') === '1',
      });
      return json(r, codigo(r, 201));
    },
  },
  {
    /* Registrar a versão preparada NÃO encosta no original — são duas
       chaves diferentes no R2 e dois campos diferentes na linha. */
    metodo: 'PUT', caminho: '/api/galeria/:id/preparada', auth: 'bearer',
    async handler({ db, env, request, params }) {
      const tipo = (request.headers.get('Content-Type') || '').split(';')[0].trim();
      const bytes = await request.arrayBuffer();
      const r = await registrarPreparada(db, env, decodeURIComponent(params.id), bytes, tipo);
      return json(r, codigo(r));
    },
  },
  {
    // Aprovar a IMAGEM. Não publica nada — ver catalogo/publicador.js.
    metodo: 'POST', caminho: '/api/galeria/:id/aprovar', auth: 'bearer',
    async handler({ db, request, params }) {
      const b = await request.json().catch(() => ({}));
      const r = await aprovarFoto(db, decodeURIComponent(params.id), b);
      return json(r, codigo(r));
    },
  },
  {
    metodo: 'DELETE', caminho: '/api/galeria/:id', auth: 'bearer',
    async handler({ db, env, params }) {
      const r = await removerFotoDaGaleria(db, env, decodeURIComponent(params.id));
      return json(r, codigo(r));
    },
  },
  {
    metodo: 'POST', caminho: '/api/produtos/:sku/galeria/principal', auth: 'bearer',
    async handler({ db, request, params }) {
      const b = await request.json().catch(() => ({}));
      const r = await definirPrincipal(db, sku(params), b.fotoId);
      return json(r, codigo(r));
    },
  },
  {
    metodo: 'POST', caminho: '/api/produtos/:sku/galeria/ordem', auth: 'bearer',
    async handler({ db, request, params }) {
      const b = await request.json().catch(() => ({}));
      const r = await reordenarGaleria(db, sku(params), b.ordem);
      return json(r, codigo(r));
    },
  },

  /* ── lote ──────────────────────────────────────────────────────────── */
  {
    /* Só os NOMES. Nenhum byte sobe aqui, e a resposta diz isso — o
       contrário de um "importar" que já importou. */
    metodo: 'POST', caminho: '/api/fotos/lotes', auth: 'bearer',
    async handler({ db, request }) {
      const r = await analisarLote(db, await request.json().catch(() => ({})));
      return json(r, codigo(r, 201));
    },
  },
  {
    metodo: 'GET', caminho: '/api/fotos/lotes/:id', auth: 'bearer',
    async handler({ db, params }) {
      const r = await lerLote(db, decodeURIComponent(params.id));
      return json(r, codigo(r));
    },
  },
  {
    /* Um arquivo por requisição: a falha fica do tamanho do problema. */
    metodo: 'PUT', caminho: '/api/fotos/lotes/:id/arquivo/:arquivo', auth: 'bearer',
    async handler({ db, env, request, params }) {
      const tipo = (request.headers.get('Content-Type') || '').split(';')[0].trim();
      const bytes = await request.arrayBuffer();
      const r = await enviarArquivoDoLote(db, env, decodeURIComponent(params.id),
        decodeURIComponent(params.arquivo), bytes, tipo);
      return json(r, codigo(r));
    },
  },
  {
    metodo: 'POST', caminho: '/api/fotos/lotes/:id/confirmar', auth: 'bearer',
    async handler({ db, params }) {
      const r = await confirmarLote(db, decodeURIComponent(params.id));
      return json(r, codigo(r));
    },
  },
  {
    metodo: 'POST', caminho: '/api/fotos/lotes/:id/cancelar', auth: 'bearer',
    async handler({ db, params }) {
      const r = await cancelarLote(db, decodeURIComponent(params.id));
      return json(r, codigo(r));
    },
  },
];
