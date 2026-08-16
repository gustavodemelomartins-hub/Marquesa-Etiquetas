/** Uma Nuvemshop de mentira, para testar a sincronização sem tocar na loja
 *  de verdade nem precisar de token.
 *
 *  Imita o que importa do comportamento real: exige o User-Agent (a API
 *  verdadeira responde 400 sem ele, e é um erro fácil de não perceber),
 *  pagina por page/per_page, e guarda o estoque que recebe no PATCH para o
 *  teste poder conferir o que foi escrito.
 */
import http from 'node:http';

export function subirLojaFalsa(porta = 8799) {
  const estado = {
    produtos: [],
    pedidos: [],
    escritas: [],          // tudo que chegou no PATCH, na ordem
    semUserAgent: 0,
  };

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const partes = url.pathname.split('/').filter(Boolean);   // [versão, loja, recurso...]
    const recurso = partes.slice(2).join('/');
    const responder = (código, corpo) => {
      res.writeHead(código, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(corpo));
    };

    if (!req.headers['user-agent']) {
      estado.semUserAgent++;
      return responder(400, { message: 'User-Agent é obrigatório' });
    }
    if (!(req.headers.authorization || '').startsWith('Bearer ')) {
      return responder(401, { message: 'sem token' });
    }

    // permite ao teste simular um token sem a permissão de pedidos, que foi
    // o primeiro erro real que a integração encontrou em produção
    if (estado.negarEscopo && recurso.startsWith(estado.negarEscopo.recurso)) {
      return responder(403, {
        code: 403, message: 'Forbidden',
        description: `Missing required scope: ${estado.negarEscopo.escopo}`,
      });
    }

    const pagina = +(url.searchParams.get('page') || 1);
    const porPagina = +(url.searchParams.get('per_page') || 200);
    const fatia = lista => lista.slice((pagina - 1) * porPagina, pagina * porPagina);

    if (recurso === 'products' && req.method === 'GET') {
      return responder(200, fatia(estado.produtos));
    }
    if (recurso === 'orders' && req.method === 'GET') {
      const min = url.searchParams.get('created_at_min');
      const filtrados = min
        ? estado.pedidos.filter(p => String(p.created_at) >= min)
        : estado.pedidos;
      return responder(200, fatia(filtrados));
    }
    if (recurso === 'products/stock-price' && req.method === 'PATCH') {
      let corpo = '';
      for await (const p of req) corpo += p;
      const itens = JSON.parse(corpo || '[]');
      estado.escritas.push(...itens);
      // reflete a escrita no estoque, como a loja real faria
      for (const it of itens) {
        const prod = estado.produtos.find(p => p.id === it.id);
        for (const v of it.variants || []) {
          const alvo = prod && prod.variants.find(x => x.id === v.id);
          if (!alvo) continue;
          if (v.inventory_levels) alvo.inventory_levels = v.inventory_levels;
          else alvo.stock = v.stock;
        }
      }
      return responder(200, itens);
    }
    responder(404, { message: 'rota não existe na loja falsa: ' + recurso });
  });

  return new Promise(ok => {
    servidor.listen(porta, () => ok({
      estado,
      url: `http://localhost:${porta}`,
      fechar: () => new Promise(r => servidor.close(r)),
    }));
  });
}

/** Monta um produto no formato que a API devolve. */
export function produtoFalso(id, variantes) {
  return {
    id,
    name: { pt: 'Produto ' + id },
    variants: variantes.map(v => ({
      id: v.id, sku: v.sku,
      inventory_levels: [{ location_id: 'LOC1', stock: v.estoque }],
    })),
  };
}
