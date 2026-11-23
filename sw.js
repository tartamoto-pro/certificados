/* Servicio de la app: permite instalarla y que abra sin conexión.
   La página se pide a internet primero (para que las actualizaciones lleguen enseguida),
   pero si la cobertura es mala, a los 3 segundos se abre la copia guardada. */
const CACHE = 'certificados-v119';
const BASICOS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];

self.addEventListener('install', e => {
  // cada recurso por separado: si uno falla, los demás se guardan igual
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(BASICOS.map(u => c.add(u).catch(() => null)))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
  // la página, al notar el cambio de servicio, se recarga sola con la versión nueva
});

function guardar(req, res) {
  if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === location.origin;
  const libreria = url.hostname === 'cdnjs.cloudflare.com';
  if (!propio && !libreria) return;
  // el aviso de versión siempre va a internet
  if (propio && url.pathname.endsWith('/version.txt')) return;
  // "Actualizar": esperar a la versión nueva de internet y guardarla como la copia de la app
  if (propio && url.searchParams.has('act')) {
    e.respondWith(fetch(new Request(url.origin + url.pathname, { cache: 'reload' })).then(res => {
      if (res.ok) {
        const c1 = res.clone(), c2 = res.clone();
        caches.open(CACHE).then(k => { k.put('./', c1); k.put('./index.html', c2); });
      }
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  if (libreria) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => guardar(req, res))));
    return;
  }
  e.respondWith((async () => {
    const red = fetch(req).then(res => url.search ? res : guardar(req, res));  // un aviso compartido (?text=…) no se guarda como copia
    const copia = await caches.match(req, { ignoreSearch: true }) || await caches.match('./index.html');
    if (!copia) return red;
    // con copia guardada: la red tiene 3 s; si no responde, se usa la copia y la red actualiza por detrás
    const tiempo = new Promise(r => setTimeout(() => r(null), 3000));
    try {
      const res = await Promise.race([red, tiempo]);
      if (res && res.ok) return res;
    } catch (_) { /* sin red */ }
    e.waitUntil(red.catch(() => null));
    return copia;
  })());
});
