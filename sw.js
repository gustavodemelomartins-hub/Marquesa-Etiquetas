const CACHE = 'marquesa-etiquetas-v12';
const ASSETS = [
  // A raiz NÃO entra nesta lista: no Cloudflare Pages ela redireciona para
  // ./dashboard.html (ver _redirects), e a Cache API recusa guardar uma
  // resposta que veio de redirecionamento — `addAll` rejeita e a instalação
  // inteira do service worker falha junto, levando o offline embora.
  './index.html',
  './dashboard.html',
  './manifest.json',
  // Leitor de código de barras para a câmera. Fica fora do dashboard.html
  // de propósito: aquele arquivo é rebaixado a cada abertura (ver o fetch
  // mais abaixo), e este aqui, sendo separado, é baixado uma vez só e
  // servido do cache daí em diante — inclusive sem internet.
  './vendor/zxing.min.js',
  // Gerador de código de barras e de PDF da tela de Etiquetas. Ficam fora do
  // dashboard.html pelo mesmo motivo do zxing: aquele arquivo é rebaixado da
  // rede a cada abertura, e estes 430 KB seriam pagos toda vez, inclusive por
  // quem só quer ver o estoque. Aqui descem uma vez e ficam.
  './vendor/jsbarcode.min.js',
  './vendor/jspdf.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './brand/logo.webp',
  './brand/bg.jpg',
  './brand/fonts/cormorant.woff2',
  './brand/fonts/jost.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Página principal: sempre busca a versão mais nova da rede; cache só entra como reserva offline.
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Demais arquivos (ícones, manifest): cache primeiro, já que raramente mudam.
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});
