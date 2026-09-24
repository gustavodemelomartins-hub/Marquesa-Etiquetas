/** Fotos: espelho da loja, adoção de órfã, upload, remoção e fundo branco.
 *
 *  Transporte apenas — quem fala com a Nuvemshop, com o R2 e com o
 *  processador de imagem é `fotos.js`. Três detalhes do contrato que não
 *  podem mudar de forma: `seco` não grava nada, o upload recebe os BYTES no
 *  corpo (sem envelope JSON) e a versão só pode ser `original` ou `tratada`.
 *
 *  A leitura pública da foto, assinada por HMAC, continua antes da porta da
 *  chave em `api/src/index.js`: ela é a única rota de imagem sem Bearer. */
import { json } from '../../auth.js';
import {
  sincronizarFotosDaLoja, vincularFotosDaLoja, importarFotosDaLoja,
  adotarFotoOrfa, salvarFotoUpload, removerFotos, gerarFundoBranco,
} from '../../fotos.js';

const sku = (params) => decodeURIComponent(params.sku);

export const rotas = [
  {
    metodo: 'POST', caminho: '/api/fotos/sincronizar', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      return json(await sincronizarFotosDaLoja(db, env, { seco: !!b.seco }));
    },
  },
  {
    metodo: 'POST', caminho: '/api/fotos/vincular-da-loja', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      return json(await vincularFotosDaLoja(db, env, { seco: !!b.seco, refazer: !!b.refazer }));
    },
  },
  {
    metodo: 'POST', caminho: '/api/fotos/importar-da-loja', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      return json(await importarFotosDaLoja(db, env, { seco: !!b.seco, refazer: !!b.refazer }));
    },
  },
  {
    metodo: 'POST', caminho: '/api/fotos/orfas/adotar', auth: 'bearer',
    async handler({ db, env, request }) {
      return json(await adotarFotoOrfa(db, env, await request.json()));
    },
  },
  {
    // Upload dos bytes: o corpo da requisição É a imagem — sem envelope
    // JSON, porque não há razão para base64 inflar 33% um arquivo que já
    // vai carimbado com o Content-Type certo pelo próprio navegador.
    metodo: 'PUT', caminho: '/api/produtos/:sku/foto/:versao', auth: 'bearer',
    padroes: { versao: 'original|tratada' },
    async handler({ db, env, request, params }) {
      const tipo = (request.headers.get('Content-Type') || '').split(';')[0].trim();
      const bytes = await request.arrayBuffer();
      return json(await salvarFotoUpload(db, env, sku(params), params.versao, bytes, tipo));
    },
  },
  {
    metodo: 'DELETE', caminho: '/api/produtos/:sku/foto', auth: 'bearer',
    async handler({ db, env, params }) {
      return json(await removerFotos(db, env, sku(params)));
    },
  },
  {
    metodo: 'POST', caminho: '/api/produtos/:sku/foto/fundo-branco', auth: 'bearer',
    async handler({ db, env, params }) {
      return json(await gerarFundoBranco(db, env, sku(params)));
    },
  },
];
