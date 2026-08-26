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
    const detalhe = String(corpo || '').trim().slice(0, 300);
    return `A Nuvemshop não encontrou ${caminho}. Confira se NUVEMSHOP_STORE_ID é o número mostrado na página de autorização (não o App ID).`
         + (detalhe ? ` Resposta da Nuvemshop: ${detalhe}` : '');
  }
  return `Nuvemshop respondeu ${status} em ${caminho}: ${String(corpo || '').slice(0, 300)}`;
}

const METODOS_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Erro específico para a escrita bloqueada — não um Error genérico — para
 *  quem chama (sync.js, reconciliacao.js, um endpoint novo) poder distinguir
 *  "ambiente não autorizado a escrever" de "a Nuvemshop recusou o pedido".
 *  `.codigo` é o contrato estável; a mensagem é só para gente ler. */
export class NuvemshopEscritaDesativada extends Error {
  constructor(caminho, metodo) {
    super('Operações de escrita na Nuvemshop estão desativadas neste ambiente.');
    this.name = 'NuvemshopEscritaDesativada';
    this.codigo = 'NUVEMSHOP_WRITE_DISABLED';
    this.caminho = caminho;
    this.metodo = metodo;
  }
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
    // A API de pedidos 2025-03 ainda é liberada loja por loja. Esta loja já
    // usa 2025-03 para catálogo/estoque, mas /orders responde 404 nela. O v1
    // continua sendo a API estável e documentada para criar, ler e cancelar
    // pedidos, inclusive com inventory_behaviour claim/bypass.
    this.basePedidos = `${raiz}/v1/${this.loja}`;
    // Pedidos convivem em duas gerações da API durante a migração da
    // plataforma. Os dois hosts v1 e a versão 2025-03 são oficiais. Só
    // escolhemos outro depois que uma LEITURA responde 404; toda venda lê
    // primeiro para procurar `extra.marquesa_venda_id`, e o POST usa a rota
    // que acabou de responder. Assim o fallback nunca troca de endereço às
    // cegas depois de uma escrita.
    this.basesPedidos = raiz === 'https://api.nuvemshop.com.br'
      ? [
          this.basePedidos,
          `https://api.tiendanube.com/v1/${this.loja}`,
          this.base,
        ]
      : [this.basePedidos];
    this.ultimaChamada = 0;
    // Fail-closed de propósito (não fail-open): qualquer coisa que não seja
    // exatamente a string "true" — ausente, "false", "1", "TRUE" — mantém a
    // escrita desligada. Só um "true" exato liga. Ver docs/SECURITY.md.
    this.escritaHabilitada = String(env.NUVEMSHOP_WRITES_ENABLED || '').trim() === 'true';
  }

  configurada() { return !!(this.loja && this.token); }

  async espera(ms) { if (ms > 0) await new Promise(r => setTimeout(r, ms)); }

  async chamar(caminho, opcoes = {}, tentativa = 0) {
    // Trava central: recusa ANTES do fetch, então nenhuma escrita sai do
    // Worker enquanto a flag não disser "true" — vale para rota direta, bug
    // de frontend, sync automático ou uma tela nova que reuse este cliente.
    const metodo = String(opcoes.method || 'GET').toUpperCase();
    if (!/^\d+$/.test(this.loja)) {
      throw new Error('NUVEMSHOP_STORE_ID precisa ser somente o número mostrado na página de autorização da loja — não use o App ID nem o domínio.');
    }
    if (METODOS_ESCRITA.has(metodo) && !this.escritaHabilitada) {
      throw new NuvemshopEscritaDesativada(caminho, metodo);
    }

    await this.espera(INTERVALO_MS - (Date.now() - this.ultimaChamada));
    this.ultimaChamada = Date.now();

    const { apiPedidos, ...opcoesFetch } = opcoes;
    let base = apiPedidos ? this.basePedidos : this.base;
    const fazerFetch = () => fetch(base + caminho, {
      ...opcoesFetch,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        ...(opcoesFetch.headers || {}),
      },
    });
    let resp = await fazerFetch();

    if (resp.status === 404 && apiPedidos && metodo === 'GET') {
      for (const candidata of this.basesPedidos) {
        if (candidata === base) continue;
        base = candidata;
        resp = await fazerFetch();
        if (resp.ok) {
          this.basePedidos = candidata;
          break;
        }
        // 401/403/429 já trazem uma orientação útil e não significam rota
        // ausente. Só um novo 404 justifica experimentar a próxima geração.
        if (resp.status !== 404) break;
      }
    }

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
  async listarTudo(caminho, params = {}, limitePaginas = 40, opcoes = {}) {
    const saida = [];
    for (let pagina = 1; pagina <= limitePaginas; pagina++) {
      const q = new URLSearchParams({ ...params, page: String(pagina), per_page: '200' });
      const lote = await this.chamar(`${caminho}?${q}`, opcoes);
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
    return this.listarTudo('/orders', p, 40, { apiPedidos: true });
  }

  pedido(id) { return this.chamar(`/orders/${id}`, { apiPedidos: true }); }

  criarPedido(dados) {
    return this.chamar('/orders', { apiPedidos: true, method: 'POST', body: JSON.stringify(dados) });
  }

  cancelarPedido(id, dados) {
    return this.chamar(`/orders/${id}/cancel`, { apiPedidos: true, method: 'POST', body: JSON.stringify(dados) });
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

/** Mapa SKU → tudo que a loja tem sob aquele código.
 *
 *  Um produto da Nuvemshop tem uma ou mais variações, e o estoque mora na
 *  VARIAÇÃO, não no produto. O mesmo código pode aparecer em mais de uma
 *  variação, e os dois motivos possíveis não têm nada a ver um com o outro:
 *
 *   - variações do MESMO produto — tamanho de anel, cor do banho. É o normal
 *     nesta loja, não é erro nenhum, e não há o que unificar.
 *   - o mesmo código em produtos DIFERENTES — aí sim é cadastro duplicado: o
 *     estoque fica dividido entre dois anúncios e a conta nunca fecha.
 *
 *  Só o segundo caso vira `duplicados`. Confundir os dois é o que fazia a
 *  tela acusar 56 duplicatas numa loja que tem 2.
 *
 *  Todas as variações ficam guardadas em `variantes`. A versão anterior
 *  descartava da segunda em diante, e o efeito era silencioso e ruim: a
 *  sincronização só escrevia estoque numa das variações e deixava os outros
 *  tamanhos com o número velho para sempre.
 *
 *  O SKU é normalizado como no resto do sistema (maiúsculas, sem espaço em
 *  volta), mas o sufixo NÃO é removido aqui: quem decide consolidar é a
 *  importação, e na loja cada variação é uma linha de estoque própria que
 *  precisa ser endereçada como ela é. */
export function mapearSkus(produtos) {
  const mapa = new Map();
  for (const p of produtos || []) {
    const variantes = p.variants || [];
    const comSku = variantes
      .map(v => ({ v, sku: String(v.sku || '').trim().toUpperCase() }))
      .filter(x => x.sku);
    const semSku = variantes.length - comSku.length;

    for (const { v, sku } of comSku) {
      if (!mapa.has(sku)) {
        mapa.set(sku, {
          produtoId: p.id,
          varianteId: v.id,
          locais: (v.inventory_levels || []).map(n => n.location_id),
          // Os três campos abaixo não servem para empurrar estoque: servem para
          // a aba Loja poder descrever a loja a partir do que a sincronização
          // acabou de ler, em vez de um CSV importado à mão semanas atrás.
          url: texto(p.handle),
          nome: texto(p.name),
          visivel: p.published == null ? null : !!p.published,
          // Como a loja CHAMA a dimensão que varia: "Tamanho", "Cor",
          // "Comprimento", "Aro". Não presumimos quais existem — cada
          // produto declara os seus, e é esse nome que a tela mostra.
          atributos: (p.attributes || []).map(texto).filter(Boolean),
          variantes: [],
          variantesSemSku: 0,
          produtos: new Set(),
        });
      }
      const e = mapa.get(sku);
      e.produtos.add(p.id);
      e.variantes.push(descreverVariante(p, v));
    }

    // Uma variante irmã sem SKU não pode desaparecer do mapa: isso faria o
    // produto parecer ter uma opção só e concentraria todo o estoque nela.
    for (const sku of new Set(comSku.map(x => x.sku))) {
      mapa.get(sku).variantesSemSku += semSku;
    }
  }

  const duplicados = [], multiVariacao = [];
  for (const [sku, e] of mapa) {
    /* O estoque do CÓDIGO é a soma das suas variações: é assim que a
       importação por arquivo sempre contou, e é o único número comparável
       com o nosso, que é um só por código. */
    e.estoque = e.variantes.reduce((s, v) => s + v.estoque, 0);
    if (e.produtos.size > 1) duplicados.push(sku);
    else if (e.variantes.length > 1) multiVariacao.push(sku);
  }
  return { mapa, duplicados, multiVariacao };
}

/** Campo traduzível da Nuvemshop: vem como {pt: "...", es: "..."} nas lojas
 *  com mais de um idioma e como string simples nas demais. */
function texto(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return String(v.pt || v.pt_BR || Object.values(v)[0] || '');
}

function somaEstoque(v) {
  if (Array.isArray(v.inventory_levels) && v.inventory_levels.length) {
    return v.inventory_levels.reduce((s, n) => s + (n.stock == null ? 0 : +n.stock), 0);
  }
  return v.stock == null ? 0 : +v.stock;
}

/** Uma variante da loja, descrita do jeito que o resto do sistema precisa.
 *
 *  O ponto importante é `valores`: a Nuvemshop entrega os atributos em
 *  DUAS listas paralelas — `product.attributes` tem os nomes ("Tamanho",
 *  "Banho") e `variant.values` tem os valores DESTA variante, na mesma
 *  ordem. Quantos e quais existem muda de produto para produto, e é por
 *  isso que aqui não há nenhuma lista fixa de "cor e tamanho": o par é
 *  montado pela posição, com o nome que o próprio produto declara, e o que
 *  não tiver nome fica como "Opção 2" em vez de sumir.
 *
 *  `nome` continua sendo os valores concatenados — é o que a tela mostra e
 *  o que `movimentos.variacao` guarda desde sempre. Ele NÃO é identidade:
 *  identidade é `varianteId`. Nome muda quando a loja renomeia um valor;
 *  id, não. */
export function descreverVariante(p, v) {
  const nomes = (p.attributes || []).map(texto);
  const valores = (v.values || []).map((val, i) => ({
    atributo: (nomes[i] || '').trim() || `Opção ${i + 1}`,
    valor: texto(val).trim(),
  })).filter(x => x.valor);

  const imagens = (p.images || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  const propria = v.image_id != null
    ? imagens.find(im => String(im.id) === String(v.image_id))
    : null;

  return {
    produtoId: p.id,
    varianteId: v.id,
    // O SKU que a loja carrega NA VARIANTE. Normalmente é o mesmo do
    // código, mas a loja permite um por variante — e quando ela usa isso,
    // ignorar seria perder a única pista de qual peça é qual.
    sku: String(v.sku || '').trim(),
    // inventory_levels substituiu o campo `stock`, que segue existindo
    // por compatibilidade; lemos os dois para não depender da migração
    // da loja dela já ter acontecido.
    estoque: somaEstoque(v),
    locais: (v.inventory_levels || []).map(n => n.location_id),
    valores,
    // "16", "Dourado · 16" — o que diferencia esta variação das irmãs. A
    // loja já sabe disso, então ninguém precisa digitar de novo.
    nome: valores.map(x => x.valor).join(' · '),
    preco: v.price == null || v.price === '' ? null : +v.price,
    promocional: v.promotional_price == null || v.promotional_price === '' ? null : +v.promotional_price,
    // Imagem PRÓPRIA da variante quando ela aponta para uma; senão a
    // primeira do produto, que é o que a loja mostra na prática.
    imagemUrl: (propria && propria.src) || (imagens[0] && imagens[0].src) || null,
    posicao: v.position == null ? 0 : +v.position,
  };
}

/** O catálogo INTEIRO, achatado em uma linha por variante — inclusive as de
 *  produto cujo SKU não é nosso, e inclusive produto de variante única.
 *
 *  `mapearSkus` responde outra pergunta ("o que a loja tem sob o código X?")
 *  e por isso descarta variante sem SKU e agrupa por código. Esta responde
 *  "o que existe lá, ponto" — que é o que a importação de estrutura precisa
 *  para nunca mais ter de adivinhar de qual variante um número era. */
export function catalogoDeVariantes(produtos) {
  const linhas = [];
  for (const p of produtos || []) {
    const url = texto(p.handle);
    const nome = texto(p.name);
    const visivel = p.published == null ? null : !!p.published;
    (p.variants || []).forEach((v, i) => {
      const d = descreverVariante(p, v);
      linhas.push({
        ...d,
        posicao: d.posicao || i,
        produtoNome: nome || null,
        produtoUrl: url || null,
        produtoVisivel: visivel,
      });
    });
  }
  return linhas;
}
