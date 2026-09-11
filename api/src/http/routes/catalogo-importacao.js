/** Importações e ciclo de vida da ficha: planilha de produtos, espelho da
 *  loja, Estoque Total, peças novas, ficha, variações, kit e reserva de SKU.
 *
 *  Dois fluxos separados de propósito: Estoque Total ajusta quantidade de
 *  quem já existe e NUNCA cria; peças novas cria quem não existe e NUNCA
 *  altera. Cada um analisa antes de aplicar, e a análise não escreve.
 *
 *  Transporte apenas: quem decide continua em catalogo.js, produtos.js,
 *  variantes.js, sku.js e catalogo-comandos.js. */
import { json } from '../../auth.js';
import {
  analisarEstoqueTotal, aplicarEstoqueTotal, analisarNovos, cadastrarNovos,
} from '../../catalogo.js';
import {
  importarProdutos, importarLoja, editarProduto, definirKit,
} from '../../catalogo-comandos.js';
import { importarVariantesDaLoja } from '../../variantes.js';
import { excluirProduto, definirVariacoes } from '../../produtos.js';
import { gerarSku } from '../../sku.js';
import { Nuvemshop } from '../../nuvemshop.js';

const sku = (params) => decodeURIComponent(params.sku);

export const rotas = [
  {
    metodo: 'POST', caminho: '/api/produtos/importar', auth: 'bearer',
    async handler({ db, request }) {
      return await importarProdutos(db, await request.json());
    },
  },
  {
    // Espelho local do catálogo da loja: não toca estoque físico.
    metodo: 'POST', caminho: '/api/loja/importar', auth: 'bearer',
    async handler({ db, request }) {
      return await importarLoja(db, await request.json());
    },
  },
  {
    metodo: 'POST', caminho: '/api/estoque-total/analisar', auth: 'bearer',
    async handler({ db, request }) {
      return json(await analisarEstoqueTotal(db, await request.json()));
    },
  },
  {
    metodo: 'POST', caminho: '/api/estoque-total/aplicar', auth: 'bearer',
    async handler({ db, request }) {
      return json(await aplicarEstoqueTotal(db, await request.json()));
    },
  },
  {
    /* `origem: 'manual'` muda uma coisa só: liga a regra de formato do
       código digitado à mão (seis dígitos). Planilha e fila continuam
       aceitando o código que o fornecedor ou a loja escreveu. */
    metodo: 'POST', caminho: '/api/produtos/novos/analisar', auth: 'bearer',
    async handler({ db, request }) {
      return json(await analisarNovos(db, await request.json()));
    },
  },
  {
    metodo: 'POST', caminho: '/api/produtos/novos/cadastrar', auth: 'bearer',
    async handler({ db, request }) {
      return json(await cadastrarNovos(db, await request.json()));
    },
  },
  {
    /* Leitura pura do catálogo REAL da Nuvemshop, espelhada localmente. Não
       escreve estoque, preço nem cadastro em lugar nenhum — nem aqui, nem
       lá. Saber o que a loja tem e decidir o que fazer com isso são atos
       separados de propósito. */
    metodo: 'POST', caminho: '/api/loja/variantes/importar', auth: 'bearer',
    async handler({ db, env, request }) {
      const b = await request.json().catch(() => ({}));
      return json(await importarVariantesDaLoja(db, new Nuvemshop(env), { seco: !!b.seco }));
    },
  },
  {
    /* Gerar RESERVA um código no banco e por isso é POST, mesmo "só
       devolvendo um texto". O código que sai daqui é DEFINITIVO — ver
       api/REGRAS.md §17 e GET /api/produtos/sku/auditoria. */
    metodo: 'POST', caminho: '/api/produtos/sku/gerar', auth: 'bearer',
    async handler({ db, request }) {
      const b = await request.json().catch(() => ({}));
      return json(await gerarSku(db, { origem: b.origem || 'cadastro' }));
    },
  },
  {
    // §19 — a ficha recusa editar `qtd`: saldo só muda por movimento.
    metodo: 'PATCH', caminho: '/api/produtos/:sku', auth: 'bearer',
    async handler({ db, request, params }) {
      return await editarProduto(db, sku(params), await request.json());
    },
  },
  {
    // §28 — só exclui quem não tem histórico; o resto se arquiva.
    metodo: 'DELETE', caminho: '/api/produtos/:sku', auth: 'bearer',
    async handler({ db, env, params }) {
      const r = await excluirProduto(db, sku(params), env);
      return json(r, r.status || (r.erro ? 400 : 200));
    },
  },
  {
    // Estrutura (atributos e valores). NÃO mexe em estoque: quantidade é o
    // outro ato, e passa por repartir ou distribuir.
    metodo: 'PUT', caminho: '/api/produtos/:sku/variacoes', auth: 'bearer',
    async handler({ db, request, params }) {
      const r = await definirVariacoes(db, sku(params), await request.json());
      return json(r, r.status || (r.erro ? 400 : 200));
    },
  },
  {
    // CAT-04 — kit tem saldo próprio zero e não contém outro kit.
    metodo: 'PUT', caminho: '/api/produtos/:sku/componentes', auth: 'bearer',
    async handler({ db, request, params }) {
      return await definirKit(db, sku(params), await request.json());
    },
  },
];
