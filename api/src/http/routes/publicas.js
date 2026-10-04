/** As três rotas que respondem SEM o Bearer da API_KEY.
 *
 *  Não é ausência de autorização: é outra forma de provar a mesma coisa.
 *  O callback da Nuvemshop chega pelo navegador dela, vindo da loja, e quem
 *  prova que foi ela quem autorizou é o `code` de uso único. A foto é
 *  buscada por um `<img src>`, que não manda cabeçalho nenhum, e o link
 *  carrega uma assinatura HMAC de prazo curto (assinatura.js). O health não
 *  toca no banco e não conta nada sobre o negócio.
 *
 *  Qualquer rota nova entra na tabela autenticada. Esta lista é fechada por
 *  decisão, e o inventário de contratos verifica cada linha — ver
 *  scripts/api-contracts.test.mjs. A quarta (a foto da galeria, 29/09/2026)
 *  segue o MESMO modelo da foto por código: link assinado com prazo. */
import { json, respostaNaoAutorizada } from '../../auth.js';
import { trocarCodigoPorToken } from '../../nuvemshop-oauth.js';
import { conferirAssinaturaFoto, conferirAssinaturaGaleria } from '../../assinatura.js';
import { lerFotoParaServir } from '../../fotos.js';
import { lerFoto } from '../../fotos-storage.js';
import { chaveParaServir } from '../../catalogo/galeria.js';
import { servirAvatar } from '../../cliente-avatar.js';

const hoje = () => new Date().toISOString().slice(0, 10);

export const rotas = [
  {
    metodo: 'ANY', caminho: '/api/health', auth: 'sem-bearer',
    handler() {
      return json({ ok: true, hoje: hoje() });
    },
  },
  {
    metodo: 'GET', caminho: '/api/nuvemshop/callback', auth: 'sem-bearer',
    async handler({ env, url }) {
      return trocarCodigoPorToken(env, url.searchParams.get('code'));
    },
  },
  {
    metodo: 'GET', caminho: '/api/produtos/:sku/foto/:versao', auth: 'sem-bearer',
    padroes: { versao: 'original|tratada' },
    async handler({ env, url, params }) {
      const sku = decodeURIComponent(params.sku);
      const ok = await conferirAssinaturaFoto(
        env, sku, params.versao,
        url.searchParams.get('exp'), url.searchParams.get('sig'));
      if (!ok) return respostaNaoAutorizada();
      const foto = await lerFotoParaServir(env.DB, sku, params.versao, env);
      if (!foto) return new Response('Foto não encontrada', { status: 404 });
      return new Response(foto.corpo, {
        headers: { 'Content-Type': foto.tipo, 'Cache-Control': 'private, max-age=21600' },
      });
    },
  },
  {
    /* Avatar da cliente: mesmo modelo da foto por código — o <img src> não
       manda Bearer, então o link carrega prazo + assinatura HMAC. */
    metodo: 'GET', caminho: '/api/clientes/:id/avatar', auth: 'sem-bearer', padroes: { id: '[0-9]+' },
    async handler({ env, url, params }) {
      const r = await servirAvatar(env.DB, env, +params.id, url.searchParams.get('exp'), url.searchParams.get('sig'));
      if (r.negado) return respostaNaoAutorizada();
      if (!r.foto) return new Response('Sem foto', { status: 404 });
      return new Response(r.foto.corpo, {
        headers: { 'Content-Type': r.foto.tipo, 'Cache-Control': 'private, max-age=21600' },
      });
    },
  },
  {
    /* A foto da GALERIA (29/09/2026) — mesma ideia da rota acima, mas por
       foto e não por código: `<img src>` não manda o Bearer, então o link
       carrega uma assinatura HMAC com prazo (assinatura.js). O objeto sob
       uma chave nunca muda (trocar a foto cria outra linha), por isso o
       navegador pode guardar a resposta pelo prazo do próprio link. */
    metodo: 'GET', caminho: '/api/galeria/:id/:versao', auth: 'sem-bearer',
    padroes: { versao: 'original|preparada|miniatura' },
    async handler({ env, url, params }) {
      const id = decodeURIComponent(params.id);
      const ok = await conferirAssinaturaGaleria(
        env, id, params.versao, url.searchParams.get('exp'), url.searchParams.get('sig'));
      if (!ok) return respostaNaoAutorizada();
      const chave = await chaveParaServir(env.DB, id, params.versao);
      const foto = chave ? await lerFoto(env, chave) : null;
      if (!foto) return new Response('Foto não encontrada', { status: 404 });
      return new Response(foto.corpo, {
        headers: { 'Content-Type': foto.tipo, 'Cache-Control': 'private, max-age=86400' },
      });
    },
  },
];
