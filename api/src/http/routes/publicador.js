/** Publicação real na Nuvemshop (Fase 4.5) — desligada por padrão.
 *
 *  Estas rotas existem para os estados `publicando`, `publicado`,
 *  `falhou_ao_publicar` e `despublicado` pararem de ser valores mortos no
 *  CHECK da tabela. Elas NÃO ligam a publicação: o padrão de toda uma delas
 *  é `seco: true`, e mesmo com `seco: false` a escrita ainda depende de
 *  `NUVEMSHOP_WRITES_ENABLED` e de `NUVEMSHOP_PUBLICACAO_ENABLED`, que não
 *  está declarada em ambiente nenhum.
 */
import { json } from '../../auth.js';
import {
  publicarPeca, despublicarPeca, publicarAprovadas, divergenciasDePreco,
} from '../../catalogo/publicador.js';

const sku = (params) => decodeURIComponent(params.sku);
const codigo = (r) => (r.ok ? 200 : (r.statusHttp ?? 400));
/* `seco` só deixa de valer quando alguém escreve `false` — ausente,
   ilegível ou qualquer outra coisa mantém a simulação. É a mesma postura
   fail-closed do resto do sistema. */
const secoDoCorpo = (b) => b?.seco !== false;

export const rotas = [
  {
    metodo: 'POST', caminho: '/api/catalogo/publicacao/:sku/publicar', auth: 'bearer',
    async handler({ db, env, request, params }) {
      const b = await request.json().catch(() => ({}));
      const r = await publicarPeca(db, env, sku(params), {
        seco: secoDoCorpo(b), publicarNaVitrine: b.publicarNaVitrine === true,
      });
      return json(r, codigo(r));
    },
  },
  {
    metodo: 'POST', caminho: '/api/catalogo/publicacao/:sku/despublicar', auth: 'bearer',
    async handler({ db, env, request, params }) {
      const b = await request.json().catch(() => ({}));
      const r = await despublicarPeca(db, env, sku(params), { seco: secoDoCorpo(b), motivo: b.motivo });
      return json(r, codigo(r));
    },
  },
  {
    /* A rodada, com freio por volume — o mesmo espírito do empurrão de
       estoque: parar e perguntar é melhor que despejar o catálogo na
       vitrine antes de alguém ver. */
    metodo: 'POST', caminho: '/api/catalogo/publicacao/rodada', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      const r = await publicarAprovadas(db, env, {
        seco: secoDoCorpo(b), forcar: b.forcar === true,
      });
      return json(r, codigo(r));
    },
  },
  {
    /* Medição, não julgamento: a política de preço divergente ainda não foi
       decidida, e a resposta carrega essa ressalva. */
    metodo: 'GET', caminho: '/api/catalogo/precos/divergentes', auth: 'bearer',
    async handler({ db }) {
      return json(await divergenciasDePreco(db));
    },
  },
];
