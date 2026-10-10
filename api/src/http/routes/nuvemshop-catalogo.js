/** §62 — Catálogo oculto na Nuvemshop: o que existe lá, o que falta, e os
 *  gestos de criar (oculto) e publicar (visível).
 *
 *  Regra de negócio mora em `catalogo/nuvemshop-catalogo.js`. Toda escrita
 *  passa pelas travas de lá (NUVEMSHOP_WRITES_ENABLED + kill switch
 *  `nuvemshopCatalogoAtivo`); `seco` é o padrão das rodadas — só um
 *  `{"seco": false}` escrito por alguém cria de verdade. Publicar não tem
 *  `seco`: é sempre um clique humano, e confere tudo na loja antes. */
import { json } from '../../auth.js';
import { enriquecerOcultos } from '../../catalogo/enriquecimento-fluxo.js';
import {
  lerBase, classificarCatalogo, criarOcultos, criarVariantesFaltantes,
  enviarFotosPendentes, publicarNaLoja, ligarCatalogo, catalogoAtivo, lerAnuncio,
} from '../../catalogo/nuvemshop-catalogo.js';

const secoDoCorpo = (b) => b?.seco !== false;
const codigo = (r) => (r.ok === false ? (r.statusHttp ?? 400) : 200);

export const rotas = [
  {
    metodo: 'POST', caminho: '/api/nuvemshop/catalogo/enriquecer', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      const r = await enriquecerOcultos(db, env, { seco: secoDoCorpo(b), limite: b.limite, skus: b.skus });
      return json(r, codigo(r));
    },
  },
  {
    /* Só leitura do banco — nenhuma chamada à loja. */
    metodo: 'GET', caminho: '/api/nuvemshop/catalogo', auth: 'bearer',
    async handler({ db }) {
      const base = await lerBase(db);
      const { itens, resumo } = classificarCatalogo(base);
      return json({ ok: true, ativo: await catalogoAtivo(db), resumo, itens });
    },
  },
  {
    /* Criar ocultos. `{"seco": true}` (padrão) lê a loja e devolve o corpo
       exato de cada POST, sem escrever. */
    metodo: 'POST', caminho: '/api/nuvemshop/catalogo/criar', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      const r = await criarOcultos(db, env, { seco: secoDoCorpo(b), limite: b.limite, skus: b.skus });
      return json(r, codigo(r));
    },
  },
  {
    metodo: 'POST', caminho: '/api/nuvemshop/catalogo/variantes', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      const r = await criarVariantesFaltantes(db, env, { seco: secoDoCorpo(b), limite: b.limite });
      return json(r, codigo(r));
    },
  },
  {
    metodo: 'POST', caminho: '/api/nuvemshop/catalogo/fotos', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      const r = await enviarFotosPendentes(db, env, { seco: secoDoCorpo(b), limite: b.limite });
      return json(r, codigo(r));
    },
  },
  {
    /* §63 — a prévia do anúncio para conferir antes de publicar: o que a
       loja tem AGORA para este código. Uma leitura, nenhuma escrita. */
    metodo: 'GET', caminho: '/api/nuvemshop/catalogo/:sku/anuncio', auth: 'bearer',
    async handler({ db, env, params }) {
      const r = await lerAnuncio(db, env, decodeURIComponent(params.sku));
      return json(r, codigo(r));
    },
  },
  {
    /* "Publicar na Nuvemshop": hidden → visible, depois de conferir foto,
       nome, SKU, variantes, preço, estoque, descrição, SEO e categoria NA
       LOJA. A resposta só é ok quando a releitura confirma visible. */
    metodo: 'POST', caminho: '/api/nuvemshop/catalogo/:sku/publicar', auth: 'bearer',
    async handler({ db, env, request, params }) {
      const b = await request.json().catch(() => ({}));
      const r = await publicarNaLoja(db, env, decodeURIComponent(params.sku), { por: b.por || 'operador' });
      return json(r, codigo(r));
    },
  },
  {
    /* Kill switch do catálogo. Desligado, nada é criado nem publicado; o
       estoque (§61) segue igual. */
    metodo: 'PUT', caminho: '/api/nuvemshop/catalogo/automatico', auth: 'bearer',
    async handler({ db, request }) {
      const b = await request.json().catch(() => ({}));
      if (typeof b.ativo !== 'boolean') return json({ erro: 'Informe {"ativo": true} ou {"ativo": false}.' }, 400);
      return json(await ligarCatalogo(db, b.ativo));
    },
  },
];
