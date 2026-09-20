import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const raiz = process.argv[2], porta = Number(process.argv[3] || 5173);
const tipos = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.map':'application/json', '.svg':'image/svg+xml' };
createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  try {
    const b = await readFile(path.join(raiz, p));
    res.writeHead(200, { 'Content-Type': tipos[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end('não achei ' + p); }
}).listen(porta, '127.0.0.1', () => console.log('app em http://127.0.0.1:' + porta));
