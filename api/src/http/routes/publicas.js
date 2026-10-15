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
 *  decisão, e o inventário de contratos verifica que ela continua com três
 *  linhas — ver scripts/api-contracts.test.mjs. */
import { json, respostaNaoAutorizada } from '../../auth.js';
import { trocarCodigoPorToken } from '../../nuvemshop-oauth.js';
import { conferirAssinaturaFoto } from '../../assinatura.js';
import { lerFotoParaServir } from '../../fotos.js';

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
];
