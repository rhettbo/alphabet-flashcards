const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `abc-cache-${CACHE_VERSION}`;
const CORE_ASSETS = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.webmanifest',
];

// Precache letters (images + audio) if present
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MEDIA = [];
LETTERS.forEach(L => {
  MEDIA.push(`images/${L}.png`);
  MEDIA.push(`audio/${L.toLowerCase()}.wav`);
  MEDIA.push(`audio/letter ${L.toLowerCase()}.wav`);
  MEDIA.push(`audio/find ${L.toLowerCase()}.wav`);
});
MEDIA.push('audio/great_job.wav');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([...CORE_ASSETS, ...MEDIA].map(url => new Request(url)))).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    self.clients.claim();
  })());
});

// Cache-first for media, network-first for HTML/CSS/JS
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  const isMedia = url.pathname.startsWith('/images/') || url.pathname.startsWith('/audio/');
  if (isMedia) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const res = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, res.clone());
        return res;
      } catch (e) {
        return cached || Response.error();
      }
    })());
  } else {
    event.respondWith((async () => {
      try {
        const res = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, res.clone());
        return res;
      } catch (e) {
        const cached = await caches.match(event.request);
        return cached || Response.error();
      }
    })());
  }
});