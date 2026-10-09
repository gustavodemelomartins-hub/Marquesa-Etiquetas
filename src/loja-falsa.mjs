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
    pedidosCriados: [],
    proximoPedidoId: 9000,
    criarComEstoqueInsuficiente: false,
    escritas: [],          // tudo que chegou no PATCH, na ordem
    semUserAgent: 0,
    /* Liga a loja para responder 500 em tudo. Serve para provar o que o
       sistema faz quando a Nuvemshop cai — e a resposta certa nunca é
       "seguir em frente com o número velho". */
    falhar: false,
    /* Igual a `falhar`, mas só para a escrita de estoque — serve para
       provar o comportamento do Apply do motor de reconciliação quando SÓ
       o PATCH falha (a leitura de precondition continua funcionando).
       `null` = nunca falha; um Set de produto_id = falha só o PATCH que
       tocar aquele produto; `true` = falha QUALQUER PATCH. */
    falharPatchParaProduto: null,
    trocasOAuth: [],
    codigoValido: null,
    totalRequisicoes: 0,   // qualquer request que chegou aqui, de qualquer rota — prova que a trava de escrita barrou ANTES de sair do Worker, não só que o PATCH específico não apareceu
    caminhos: [],          // inclui a versão (/v1 ou /2025-03) para provar o roteamento de cada recurso
  };

  const servidor = http.createServer(async (req, res) => {
    estado.totalRequisicoes++;
    const url = new URL(req.url, 'http://x');
    estado.caminhos.push(url.pathname);
    const partes = url.pathname.split('/').filter(Boolean);   // [versão, loja, recurso...]
    const recurso = partes.slice(2).join('/');
    const responder = (código, corpo) => {
      res.writeHead(código, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(corpo));
    };

    if (estado.falhar) {
      return responder(500, { message: 'loja de mentira: falha proposital' });
    }
    /* §61 — uma loja lenta, para o teste provar o que acontece quando o
       código muda DURANTE uma rodada. */
    if (estado.atraso) await new Promise((ok) => setTimeout(ok, estado.atraso));

    // A troca do código de autorização por token (POST /apps/authorize/token)
    // fica ANTES das checagens abaixo: na API real esse endereço não pede
    // Bearer — é o próprio corpo (client_id + client_secret) que autentica,
    // porque ainda não existe token nenhum nesse momento do fluxo.
    if (partes[0] === 'apps' && partes[1] === 'authorize' && partes[2] === 'token' && req.method === 'POST') {
      let corpo = '';
      for await (const p of req) corpo += p;
      const b = JSON.parse(corpo || '{}');
      estado.trocasOAuth.push(b);
      if (b.code !== estado.codigoValido) {
        return responder(400, { error: 'invalid_grant', error_description: 'código inválido ou expirado' });
      }
      return responder(200, {
        access_token: 'token-trocado-' + b.code, token_type: 'bearer',
        scope: 'read_orders,write_orders,read_products,write_products', user_id: '555444',
      });
    }

    // Imagem servida como um CDN público serviria: sem Bearer, sem
    // User-Agent obrigatório. Existe para o teste da importação de fotos
    // poder BAIXAR bytes de verdade (importarFotosDaLoja copia para o R2),
    // e não só guardar uma URL que nunca respondeu nada.
    if (partes[0] === 'imagens' && req.method === 'GET') {
      const pixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64');
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(pixel);
    }

    /* §62 — a VITRINE pública, sem token: produto hidden responde 404 como na
       loja real; unlisted e visible respondem a página. */
    if (partes[0] === 'vitrine' && partes[1] === 'produtos' && req.method === 'GET') {
      const p = estado.produtos.find((x) => {
        const h = x.handle && (x.handle.pt || x.handle);
        return String(h) === partes[2];
      });
      const vis = p && (p.visibility || (p.published ? 'visible' : 'hidden'));
      if (!p || vis === 'hidden') return responder(404, { message: 'Not Found' });
      return responder(200, { id: p.id, visibility: vis });
    }

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
    // Como a loja real: pedir página além da última não volta [], volta 404
    // "Last page is N". Só acontece quando a última página veio cheia.
    const ultima = lista => Math.max(1, Math.ceil(lista.length / porPagina));

    /* §61 — o caminho incremental lê UM produto por id, em vez do catálogo
       inteiro. Os dois contadores deixam o teste provar que uma venda não
       relê a loja toda. */
    const produtoUnico = /^products\/(\d+)$/.exec(recurso);
    if (produtoUnico && req.method === 'GET') {
      estado.leiturasDeProduto = (estado.leiturasDeProduto || 0) + 1;
      const p = estado.produtos.find(x => String(x.id) === produtoUnico[1]);
      return p ? responder(200, p) : responder(404, { code: 404, message: 'Not Found' });
    }

    if (recurso === 'products' && req.method === 'GET') {
      estado.leiturasDoCatalogo = (estado.leiturasDoCatalogo || 0) + 1;
      if (pagina > ultima(estado.produtos)) {
        return responder(404, { code: 404, message: 'Not Found', description: `Last page is ${ultima(estado.produtos)}` });
      }
      return responder(200, fatia(estado.produtos));
    }
    if (recurso === 'orders' && req.method === 'GET') {
      const min = url.searchParams.get('created_at_min');
      const filtrados = min
        ? estado.pedidos.filter(p => String(p.created_at) >= min)
        : estado.pedidos;
      /* Como a loja real (visto em produção em 08/10/2026): listagem vazia
         não volta [], volta 404 "Last page is 0". */
      if (!filtrados.length || pagina > ultima(filtrados)) {
        return responder(404, { code: 404, message: 'Not Found', description: `Last page is ${filtrados.length ? ultima(filtrados) : 0}` });
      }
      return responder(200, fatia(filtrados));
    }
    if (recurso === 'orders' && req.method === 'POST') {
      let corpo = '';
      for await (const p of req) corpo += p;
      const b = JSON.parse(corpo || '{}');
      const id = estado.proximoPedidoId++;
      const produtos = [];
      for (const linha of b.products || []) {
        let achada = null, produto = null;
        for (const p of estado.produtos) {
          const v = (p.variants || []).find(x => String(x.id) === String(linha.variant_id));
          if (v) { achada = v; produto = p; break; }
        }
        if (!achada) return responder(422, { message: 'variante não encontrada' });
        let reservada = linha.quantity;
        let issues = {};
        if (b.inventory_behaviour === 'claim') {
          const nivel = (achada.inventory_levels || [])[0];
          if (!nivel || nivel.stock < linha.quantity) {
            if (!estado.criarComEstoqueInsuficiente) return responder(422, { message: 'estoque insuficiente' });
            reservada = Math.max(0, Number(nivel && nivel.stock) || 0);
            issues = { unclaimed_stock: linha.quantity - reservada };
            if (nivel) nivel.stock = 0;
          } else {
            nivel.stock -= linha.quantity;
          }
        }
        produtos.push({
          variant_id: achada.id, sku: achada.sku, quantity: linha.quantity,
          price: linha.price, name: (produto.name && (produto.name.pt || produto.name.pt_BR)) || 'Produto',
          issues, _reservada: reservada,
        });
      }
      const pedido = {
        id, number: id, status: b.status || 'open', payment_status: b.payment_status || 'pending',
        created_at: new Date().toISOString(), customer: b.customer, products: produtos,
        extra: b.extra || {}, note: b.note || null, storefront: 'api',
      };
      estado.pedidos.push(pedido);
      estado.pedidosCriados.push({ corpo: b, pedido });
      return responder(201, pedido);
    }
    const pedidoUnico = /^orders\/(\d+)$/.exec(recurso);
    if (pedidoUnico && req.method === 'GET') {
      const pedido = estado.pedidos.find(p => String(p.id) === pedidoUnico[1]);
      return pedido ? responder(200, pedido) : responder(404, { message: 'pedido não encontrado' });
    }
    const cancelarPedido = /^orders\/(\d+)\/cancel$/.exec(recurso);
    if (cancelarPedido && req.method === 'POST') {
      let corpo = '';
      for await (const p of req) corpo += p;
      const b = JSON.parse(corpo || '{}');
      const pedido = estado.pedidos.find(p => String(p.id) === cancelarPedido[1]);
      if (!pedido) return responder(404, { message: 'pedido não encontrado' });
      if (pedido.status !== 'cancelled' && b.restock) {
        for (const linha of pedido.products || []) {
          for (const p of estado.produtos) {
            const v = (p.variants || []).find(x => String(x.id) === String(linha.variant_id));
            if (v && v.inventory_levels && v.inventory_levels[0]) {
              v.inventory_levels[0].stock += linha._reservada == null ? linha.quantity : linha._reservada;
            }
          }
        }
      }
      pedido.status = 'cancelled';
      pedido.cancelled_at = new Date().toISOString();
      return responder(200, pedido);
    }
    /* §62 — catálogo: criar, atualizar, variante, imagem, categorias. A
       loja falsa obedece `visibility` como a real (published derivado: true
       só em visible); `ignorarVisibilidade` simula uma API que não conhece
       o campo e publica direto — o pior caso que o Worker precisa pegar. */
    const lerCorpo = async () => { let c = ''; for await (const p of req) c += p; return JSON.parse(c || '{}'); };
    const aplicarVisibilidade = (p, b) => {
      if (b.visibility && b.published !== undefined) return 'ambos';
      if (b.visibility && !estado.ignorarVisibilidade) p.visibility = b.visibility;
      else if (b.published !== undefined) p.visibility = b.published ? 'visible' : 'hidden';
      p.published = p.visibility === 'visible';
      if (estado.semCampoVisibility) delete p.visibility;
      return null;
    };
    const porSku = /^products\/sku\/(.+)$/.exec(recurso);
    if (porSku && req.method === 'GET') {
      estado.buscasPorSku = (estado.buscasPorSku || 0) + 1;
      const alvo = decodeURIComponent(porSku[1]);
      const p = estado.produtos.find((x) => (x.variants || []).some((v) => String(v.sku) === alvo));
      if (estado.semBuscaPorSku) return responder(404, { code: 404, message: 'Not Found' });
      return p ? responder(200, p) : responder(404, { code: 404, message: 'Not Found' });
    }
    if (recurso === 'categories' && req.method === 'GET') {
      return responder(200, estado.categorias || []);
    }
    if (recurso === 'products' && req.method === 'POST') {
      const b = await lerCorpo();
      estado.criacoes = (estado.criacoes || 0) + 1;
      if (estado.falharCriacao) {
        estado.falharCriacao = estado.falharCriacao === true ? true : estado.falharCriacao - 1;
        return responder(500, { message: 'loja de mentira: criação falhou de propósito' });
      }
      const id = estado.proximoProdutoId = (estado.proximoProdutoId || 900000) + 1;
      const nome = (b.name && (b.name.pt || Object.values(b.name)[0])) || 'Produto';
      const p = {
        id, name: b.name, handle: { pt: String(nome).toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-') + '-' + id },
        description: b.description || { pt: '' }, seo_title: b.seo_title || null, seo_description: b.seo_description || null,
        brand: b.brand || '', tags: b.tags || '',
        attributes: b.attributes || [], categories: (b.categories || []).map((c) => ({ id: c })), images: [],
        visibility: 'visible', published: true,
        variants: (b.variants || []).map((v, i) => ({
          id: id * 10 + i, sku: v.sku, price: v.price ?? null, values: v.values || [],
          ...(v.inventory_levels ? { inventory_levels: v.inventory_levels.map((n) => ({ ...n })) } : { stock: v.stock ?? null }),
        })),
      };
      if (aplicarVisibilidade(p, b)) return responder(422, { message: "Cannot send both 'published' and 'visibility'. Use 'visibility' only." });
      estado.produtos.push(p);
      return responder(201, p);
    }
    const produtoPut = /^products\/(\d+)$/.exec(recurso);
    if (produtoPut && req.method === 'PUT') {
      const b = await lerCorpo();
      estado.atualizacoes = (estado.atualizacoes || []).concat([{ id: +produtoPut[1], corpo: b }]);
      const p = estado.produtos.find((x) => String(x.id) === produtoPut[1]);
      if (!p) return responder(404, { message: 'Not Found' });
      const { visibility, published, ...resto } = b;
      if (aplicarVisibilidade(p, { visibility, published })) return responder(422, { message: 'both' });
      Object.assign(p, resto);
      return responder(200, p);
    }
    const varPost = /^products\/(\d+)\/variants$/.exec(recurso);
    if (varPost && req.method === 'POST') {
      const b = await lerCorpo();
      const p = estado.produtos.find((x) => String(x.id) === varPost[1]);
      if (!p) return responder(404, { message: 'Not Found' });
      const v = { id: p.id * 10 + p.variants.length + 50, sku: b.sku, price: b.price ?? null, values: b.values || [],
        ...(b.inventory_levels ? { inventory_levels: b.inventory_levels.map((n) => ({ ...n })) } : { stock: b.stock ?? null }) };
      p.variants.push(v);
      estado.variantesCriadas = (estado.variantesCriadas || []).concat([{ produto: p.id, corpo: b }]);
      return responder(201, v);
    }
    const imgPost = /^products\/(\d+)\/images$/.exec(recurso);
    if (imgPost && req.method === 'POST') {
      const b = await lerCorpo();
      const p = estado.produtos.find((x) => String(x.id) === imgPost[1]);
      if (!p) return responder(404, { message: 'Not Found' });
      const img = { id: p.id * 100 + p.images.length + 1, src: `http://cdn/${b.filename}`, position: b.position || 1 };
      p.images.push(img);
      estado.imagensRecebidas = (estado.imagensRecebidas || []).concat([{ produto: p.id, filename: b.filename, tamanho: String(b.attachment || '').length }]);
      return responder(201, img);
    }
    if (recurso === 'products/stock-price' && req.method === 'PATCH') {
      let corpo = '';
      for await (const p of req) corpo += p;
      const itens = JSON.parse(corpo || '[]');
      const alvo = estado.falharPatchParaProduto;
      const deveFalhar = alvo === true || (alvo && itens.some(it => alvo.has(it.id)));
      if (deveFalhar) {
        return responder(500, { message: 'loja de mentira: PATCH falhou de propósito' });
      }
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

/** Monta um produto no formato que a API devolve.
 *
 *  `handle` e `name` vêm como objeto por idioma, e `published` diz se o
 *  produto está visível na loja — são os três campos que a sincronização
 *  guarda para a aba Loja poder se descrever sem depender de CSV. */
export function produtoFalso(id, variantes, { publicado = true, imagens = [] } = {}) {
  return {
    id,
    name: { pt: 'Produto ' + id },
    handle: { pt: 'produto-' + id },
    published: publicado,
    // A imagem mora no PRODUTO; a variação aponta para uma delas por
    // `image_id` quando tem foto própria (o anel dourado e o prateado).
    images: imagens.map((src, i) => ({ id: id * 100 + i, src, position: i + 1 })),
    variants: variantes.map(v => ({
      id: v.id, sku: v.sku,
      ...(v.imagemIdx === undefined ? {} : { image_id: id * 100 + v.imagemIdx }),
      inventory_levels: [{ location_id: 'LOC1', stock: v.estoque }],
    })),
  };
}
