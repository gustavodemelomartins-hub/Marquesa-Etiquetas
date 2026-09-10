/** Leituras de catálogo: identidade da peça, categorias, fila de novas,
 *  fotos, variações e kits.
 *
 *  A ordem das rotas aqui repete a ordem em que elas viviam no despachante.
 *  Nenhuma delas escreve; o que decide o que é um SKU válido, o que é kit e
 *  o que a loja espelhou continua nos módulos de domínio. */
import { json } from '../../auth.js';
import { listarPendentes } from '../../catalogo.js';
import { listarFotosOrfas, fotosDoSku } from '../../fotos.js';
import { listarPublicacoes } from '../../publicacao-catalogo.js';
import { variantesDoSku, variacoesParaRevisao, reconciliarVariacoes } from '../../variantes.js';
import { dependenciasDoProduto, estruturaDoProduto } from '../../produtos.js';
import { checarSku, auditarSkus } from '../../sku.js';
import { componentesDoKit } from '../../estoque.js';

const sku = (params) => decodeURIComponent(params.sku);

export const rotas = [
  {
    metodo: 'GET', caminho: '/api/categorias', auth: 'bearer',
    async handler({ db }) {
      const r = await db.prepare(`SELECT * FROM categorias ORDER BY ordem, nome`).all();
      return json(r.results);
    },
  },
  {
    metodo: 'GET', caminho: '/api/produtos/pendentes', auth: 'bearer',
    async handler({ db }) {
      return json(await listarPendentes(db));
    },
  },
  {
    metodo: 'GET', caminho: '/api/produtos/:sku/fotos', auth: 'bearer',
    async handler({ db, params }) {
      return json(await fotosDoSku(db, sku(params)));
    },
  },
  {
    metodo: 'GET', caminho: '/api/fotos/orfas', auth: 'bearer',
    async handler({ db }) {
      return json(await listarFotosOrfas(db));
    },
  },
  {
    metodo: 'GET', caminho: '/api/catalogo/publicacao', auth: 'bearer',
    async handler({ db }) {
      return json(await listarPublicacoes(db));
    },
  },
  {
    metodo: 'GET', caminho: '/api/loja/variantes/:sku', auth: 'bearer',
    async handler({ db, params }) {
      return json(await variantesDoSku(db, sku(params)));
    },
  },
  {
    // "Precisa de revisão — variações não mapeadas": o que a sincronização
    // decidiu NÃO escrever, com os dois números lado a lado.
    metodo: 'GET', caminho: '/api/variacoes/revisao', auth: 'bearer',
    async handler({ db }) {
      return json(await variacoesParaRevisao(db));
    },
  },
  {
    /* §42.6 — a comparação READ-ONLY das três fontes: o que sabemos aqui,
       as variações cadastradas e o espelho da loja. Classifica em
       RESOLVIDO, PENDENTE_HUMANO e DIVERGENCIA_REAL, e não escreve em
       lugar nenhum — nem no banco, nem na Nuvemshop. É o relatório que
       vem ANTES de qualquer sincronização de escrita. */
    metodo: 'GET', caminho: '/api/variacoes/reconciliacao', auth: 'bearer',
    async handler({ db }) {
      return json(await reconciliarVariacoes(db));
    },
  },
  {
    metodo: 'GET', caminho: '/api/produtos/:sku/variacoes', auth: 'bearer',
    async handler({ db, params }) {
      const r = await estruturaDoProduto(db, sku(params));
      return json(r, r.erro ? (r.status || 400) : 200);
    },
  },
  {
    /* §28: quem tem histórico é arquivado, nunca apagado. Quem decide não é
       preferência: é a pergunta que `dependenciasDoProduto` faz ao banco. */
    metodo: 'GET', caminho: '/api/produtos/:sku/dependencias', auth: 'bearer',
    async handler({ db, params }) {
      const r = await dependenciasDoProduto(db, sku(params));
      return json(r, r.erro ? (r.status || 400) : 200);
    },
  },
  {
    metodo: 'GET', caminho: '/api/produtos/sku/checar', auth: 'bearer',
    async handler({ db, url }) {
      return json(await checarSku(db, url.searchParams.get('sku')));
    },
  },
  {
    /* O padrão REAL dos códigos, medido no catálogo inteiro — produtos,
       fila de peças novas e o que a loja carrega nas variantes. Leitura
       pura: não muda gerador, não renumera, não decide. Existe porque
       "qual código o sistema deve gerar?" é pergunta de dado, não de
       opinião, e a resposta errada só aparece meses depois numa etiqueta. */
    metodo: 'GET', caminho: '/api/produtos/sku/auditoria', auth: 'bearer',
    async handler({ db, url }) {
      return json(await auditarSkus(db, {
        amostra: Math.min(200, Math.max(1, Number(url.searchParams.get('amostra')) || 25)),
      }));
    },
  },
  {
    metodo: 'GET', caminho: '/api/produtos/:sku/componentes', auth: 'bearer',
    async handler({ db, params }) {
      return json(await componentesDoKit(db, sku(params)));
    },
  },
];
