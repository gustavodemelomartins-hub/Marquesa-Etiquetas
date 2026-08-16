/** Conversa com a API da Nuvemshop.
 *
 *  Só o transporte mora aqui: autenticação, paginação e o respeito ao
 *  limite de requisições. Quem decide o que sincronizar é `sync.js`.
 *
 *  Documentação: https://tiendanube.github.io/api-documentation/intro
 */

const VERSAO_API = '2025-03';

/** O User-Agent é obrigatório: sem ele a API responde 400, não 401 — o que
 *  faz o erro parecer qualquer outra coisa menos o que é. */
const USER_AGENT = 'Marquesa Semijoias (contato via github.com/gustavodemelomartins-hub/Marquesa-Etiquetas)';

/** Balde furado: capacidade 40, vaza 2 por segundo. Estes números são os do
 *  plano padrão; planos maiores multiplicam por 10, então ficar no limite
 *  menor é seguro para os dois casos.
 *
 *  Em vez de contar o balde por conta própria, o cliente espaça as chamadas
 *  e obedece o `x-rate-limit-reset` quando a própria API avisa que encheu.
 *  É menos esperto e erra menos. */
const INTERVALO_MS = 550;

/** Traduz o erro da API para uma frase que diz o que FAZER.
 *
 *  Vale o esforço porque os dois erros mais prováveis são de configuração,
 *  não de código, e acontecem com quem está montando a integração pela
 *  primeira vez. "403 Forbidden: Missing required scope: read_orders" está
 *  tecnicamente perfeito e não diz a ninguém que a solução é refazer o app
 *  na Nuvemshop marcando a permissão de pedidos. */
const PERMISSOES = {
  read_orders: 'ler pedidos',
  write_orders: 'escrever pedidos',
  read_products: 'ler produtos',
  write_products: 'escrever produtos',
};

export function explicarErro(status, corpo, caminho) {
  const escopo = /Missing required scope:\s*([a-z_]+)/i.exec(corpo || '');
  if (escopo) {
    const chave = escopo[1];
    const legivel = PERMISSOES[chave] || chave;
    return `O token da Nuvemshop não tem a permissão de ${legivel} (${chave}). `
         + 'Na loja, em Aplicativos → Aplicativos sob medida, marque essa permissão '
         + 'e gere um token novo — o token guarda as permissões de quando foi criado, '
         + 'então mudar o app sem gerar outro token não adianta.';
  }
  if (status === 401) {
    return 'A Nuvemshop recusou o token. Confira se NUVEMSHOP_TOKEN foi colado inteiro '
         + 'e se NUVEMSHOP_STORE_ID é o número certo da loja.';
  }
  if (status === 404) {
    return `A Nuvemshop não encontrou ${caminho}. Normalmente é o NUVEMSHOP_STORE_ID errado.`;
  }
  return `Nuvemshop respondeu ${status} em ${caminho}: ${String(corpo || '').slice(0, 300)}`;
}

export class Nuvemshop {
  constructor(env) {
    this.loja = String(env.NUVEMSHOP_STORE_ID || '').trim();
    this.token = String(env.NUVEMSHOP_TOKEN || '').trim();
    // NUVEMSHOP_BASE existe para o teste poder subir uma loja de mentira no
    // próprio computador. Fora do teste ninguém define, e vale o endereço
    // de verdade.
    const raiz = String(env.NUVEMSHOP_BASE || 'https://api.nuvemshop.com.br').replace(/\/+$/, '');
    this.base = `${raiz}/${VERSAO_API}/${this.loja}`;
    this.ultimaChamada = 0;
  }

  configurada() { return !!(this.loja && this.token); }

  async espera(ms) { if (ms > 0) await new Promise(r => setTimeout(r, ms)); }

  async chamar(caminho, opcoes = {}, tentativa = 0) {
    await this.espera(INTERVALO_MS - (Date.now() - this.ultimaChamada));
    this.ultimaChamada = Date.now();

    const resp = await fetch(this.base + caminho, {
      ...opcoes,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        ...(opcoes.headers || {}),
      },
    });

    // 429 não é falha: é a API pedindo para esperar, e ela diz quanto.
    if (resp.status === 429 && tentativa < 3) {
      const esperar = parseInt(resp.headers.get('x-rate-limit-reset') || '2000', 10);
      await this.espera(Math.min(esperar, 20000));
      return this.chamar(caminho, opcoes, tentativa + 1);
    }

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      const e = new Error(explicarErro(resp.status, corpo, caminho));
      e.status = resp.status;
      e.corpo = corpo;
      throw e;
    }
    if (resp.status === 204) return null;
    return resp.json();
  }

  /** Percorre todas as páginas de uma listagem. `per_page` vai no máximo
   *  permitido (200) para gastar o mínimo de requisições possível. */
  async listarTudo(caminho, params = {}, limitePaginas = 40) {
    const saida = [];
    for (let pagina = 1; pagina <= limitePaginas; pagina++) {
      const q = new URLSearchParams({ ...params, page: String(pagina), per_page: '200' });
      const lote = await this.chamar(`${caminho}?${q}`);
      if (!Array.isArray(lote) || !lote.length) break;
      saida.push(...lote);
      if (lote.length < 200) break;
    }
    return saida;
  }

  produtos() { return this.listarTudo('/products'); }

  /** Pedidos criados depois de uma data. `created_at_min` é ISO 8601. */
  pedidos(desdeISO) {
    const p = { status: 'any' };
    if (desdeISO) p.created_at_min = desdeISO;
    return this.listarTudo('/orders', p);
  }

  /** Escrita em lote de estoque. Um PATCH resolve vários produtos de uma
   *  vez, o que importa muito com 2 requisições por segundo: mandar um por
   *  produto levaria 5 minutos para os 600 da loja. */
  atualizarEstoque(itens) {
    return this.chamar('/products/stock-price', {
      method: 'PATCH',
      body: JSON.stringify(itens),
    });
  }
}

/** Mapa SKU → {produtoId, varianteId} a partir da lista de produtos.
 *
 *  Um produto da Nuvemshop pode ter várias variações, cada uma com o seu
 *  SKU — é por isso que a loja tem 614 produtos e 630 códigos nossos entre
 *  eles. A sincronização trabalha na variação, que é onde o estoque mora.
 *
 *  O SKU é normalizado do mesmo jeito que no resto do sistema (maiúsculas,
 *  sem espaço em volta), mas o sufixo NÃO é removido aqui: quem decide
 *  consolidar é a importação, e na loja cada variação é uma linha de
 *  estoque própria que precisa ser endereçada como ela é. */
export function mapearSkus(produtos) {
  const mapa = new Map();
  const duplicados = [];
  for (const p of produtos || []) {
    for (const v of p.variants || []) {
      const sku = String(v.sku || '').trim().toUpperCase();
      if (!sku) continue;
      if (mapa.has(sku)) { duplicados.push(sku); continue; }
      mapa.set(sku, {
        produtoId: p.id,
        varianteId: v.id,
        // inventory_levels substituiu o campo `stock`, que segue existindo
        // por compatibilidade; lemos os dois para não depender da migração
        // da loja dela já ter acontecido.
        estoque: somaEstoque(v),
        locais: (v.inventory_levels || []).map(n => n.location_id),
      });
    }
  }
  return { mapa, duplicados };
}

function somaEstoque(v) {
  if (Array.isArray(v.inventory_levels) && v.inventory_levels.length) {
    return v.inventory_levels.reduce((s, n) => s + (n.stock == null ? 0 : +n.stock), 0);
  }
  return v.stock == null ? 0 : +v.stock;
}
