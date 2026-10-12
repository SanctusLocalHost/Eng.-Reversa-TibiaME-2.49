// sw.js — Service Worker PWA offline-first (cujo bug do './' foi corrigido)
// Estratégia:
//   • Navegação → index.html (cache, fallback rede)
//   • Assets estáticos → cache primeiro, fallback rede
//   • Packs (xml/png/áudio/xlf) → cache primeiro, revalida em background

const CACHE_NAME = 'mdb-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './bundle.js',
  './bundle-core.js',
  './css/style.css',
  './js/main.js',
  './js/loader.js',
  './js/atlas.js',
  './js/i18n.js',
  './js/audio.js',
  './js/ui.js',
  './js/world.js',
  './js/game.js',
  './data/world.json',
];

// sufixos para o match (sem './' — vazio casaria com tudo!)
const ASSET_SUFFIXES = STATIC_ASSETS
  .filter(a => a !== './')
  .map(a => a.replace(/^\./, ''));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(STATIC_ASSETS.map(a =>
        cache.add(a).catch(() => { /* ignora falha individual */ })
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Navegação → index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(r => r || fetch(event.request))
    );
    return;
  }

  // Assets estáticos → cache primeiro com fallback de rede
  if (ASSET_SUFFIXES.some(s => url.pathname.endsWith(s))) {
    event.respondWith(
      caches.match(event.request).then(r => r || fetch(event.request))
    );
    return;
  }

  // Packs e dados → cache primeiro + revalidação em background
  if (/\/pack\d+\//.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
          return response;
        });
        return cached || network.catch(() => new Response('Offline — recurso não cacheado', { status: 503 }));
      })
    );
    return;
  }

  // Demais → rede, fallback cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'clearCache') caches.delete(CACHE_NAME);
});
