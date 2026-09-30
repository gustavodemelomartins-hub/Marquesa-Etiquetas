/* Uma LOJA ONLINE e uma CDN de mentira, para provar as fotos da V2 no
 * navegador sem token, sem rede e sem a Nuvemshop de verdade.
 *
 * Sobe em 127.0.0.1 e responde o pedaço da API que a importação de fotos
 * usa (`/products`, `/products/:id`, `/products/sku/:sku`) e as próprias
 * imagens — PNGs de verdade, desenhados aqui, cada um de uma cor, para a
 * ordem ser visível numa captura de tela. Só aceita GET: qualquer escrita
 * responde 405 e fica registrada, para o roteiro poder provar que nada foi
 * escrito na loja.
 *
 * O catálogo usa os códigos de `seed-catalogo.sql` e cobre os casos que
 * importam: várias fotos, uma foto, nenhuma, foto que não baixa, um anúncio
 * que junta dois códigos (revisar) e um código que só a loja tem. */
import { createServer } from 'node:http';
import { deflateSync, crc32 } from 'node:zlib';

/** Um PNG 480×480: fundo em degradê e um aro no meio — "uma joia". */
export function pngDeJoia(cor, fundo = [250, 246, 244]) {
  const L = 480;
  const linhas = [];
  for (let y = 0; y < L; y++) {
    const linha = Buffer.alloc(1 + L * 3);
    for (let x = 0; x < L; x++) {
      const dx = x - L / 2, dy = y - L / 2;
      const r = Math.sqrt(dx * dx + dy * dy);
      const noAro = r > 120 && r < 165;
      const brilho = noAro ? 0.75 + 0.25 * Math.cos((Math.atan2(dy, dx) + 0.8) * 2) : 1;
      const base = noAro ? cor : fundo.map((c, i) => Math.round(c - (y / L) * 18 * (i === 0 ? 1 : 1.2)));
      for (let i = 0; i < 3; i++) linha[1 + x * 3 + i] = Math.max(0, Math.min(255, Math.round(base[i] * brilho)));
    }
    linhas.push(linha);
  }
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])) >>> 0);
    return Buffer.concat([tam, t, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(L, 0); ihdr.writeUInt32BE(L, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

const CORES = {
  ouro: [201, 160, 72], rose: [214, 140, 150], prata: [168, 172, 180], vinho: [159, 23, 72],
  perola: [236, 228, 214], verde: [70, 140, 110], azul: [80, 110, 170], cobre: [184, 110, 70],
};

export function subirLojaFalsaDeFotos(porta) {
  const base = `http://127.0.0.1:${porta}`;
  const img = (nome) => `${base}/img/${nome}.png`;
  const estado = {
    escritas: [],
    produtos: [
      { id: 101, name: { pt: 'Colar Lua Cheia' }, canonical_url: `${base}/produtos/colar-lua-cheia`,
        images: ['ouro', 'rose', 'prata', 'vinho'].map((c, i) => ({ id: 10100 + i, src: img(`lua-${c}`), position: i + 1 })),
        variants: [{ id: 1011, sku: '100101' }] },
      { id: 102, name: { pt: 'Colar Ponto de Luz' }, images: [{ id: 10201, src: img('luz-perola'), position: 1 }],
        variants: [{ id: 1021, sku: '100102' }] },
      { id: 201, name: { pt: 'Brinco Gota Zircônia' },
        images: [{ id: 20101, src: img('gota-azul'), position: 1 }, { id: 20102, src: img('gota-prata'), position: 2 }],
        variants: [{ id: 2011, sku: '100201' }] },
      { id: 202, name: { pt: 'Brinco Argola Pequena' }, images: [], variants: [{ id: 2021, sku: '100202' }] },
      { id: 301, name: { pt: 'Anel Solitário' },
        images: [{ id: 30101, src: img('solitario-ouro'), position: 1 }, { id: 30102, src: img('solitario-verde'), position: 2 }],
        variants: [{ id: 3011, sku: '100301', image_id: 30102 }, { id: 3012, sku: '100301' }] },
      { id: 302, name: { pt: 'Anel Aparador Trio' }, images: [{ id: 30201, src: `${base}/img/quebrada.png`, position: 1 }],
        variants: [{ id: 3021, sku: '100302' }] },
      { id: 400, name: { pt: 'Kit Pulseiras' }, images: [{ id: 40001, src: img('kit-cobre'), position: 1 }],
        variants: [{ id: 4001, sku: '100401' }, { id: 4002, sku: '100402' }] },
      { id: 900, name: { pt: 'Tornozeleira que só a loja tem' }, images: [{ id: 90001, src: img('fora-rose'), position: 1 }],
        variants: [{ id: 9001, sku: 'SO-NA-LOJA' }] },
    ],
  };

  const servidor = createServer((req, res) => {
    const url = new URL(req.url, base);
    if (url.pathname === '/__escritas') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(estado.escritas));
      return;
    }
    if (req.method !== 'GET') {
      estado.escritas.push(`${req.method} ${url.pathname}`);
      res.writeHead(405); res.end(); return;
    }
    if (url.pathname.startsWith('/img/')) {
      const nome = url.pathname.slice(5).replace(/\.png$/, '');
      if (nome === 'quebrada') { res.writeHead(404); res.end('fora do ar'); return; }
      const cor = CORES[nome.split('-').pop()] || CORES.ouro;
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' });
      res.end(pngDeJoia(cor));
      return;
    }
    const partes = url.pathname.split('/').filter(Boolean);
    const i = partes.indexOf('products');
    const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (i < 0) return json({ description: 'Not found' }, 404);
    const resto = partes.slice(i + 1);
    if (!resto.length) return json(Number(url.searchParams.get('page') || 1) === 1 ? estado.produtos : []);
    if (resto[0] === 'sku') {
      const p = estado.produtos.find((x) => x.variants.some((v) => v.sku === decodeURIComponent(resto[1] || '')));
      return p ? json(p) : json({ description: 'Not found' }, 404);
    }
    const p = estado.produtos.find((x) => String(x.id) === resto[0]);
    return p ? json(p) : json({ description: 'Not found' }, 404);
  });
  servidor.listen(porta, '127.0.0.1');
  return { base, estado, servidor };
}
