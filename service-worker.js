const CACHE_VERSION = "v2.3.0";
const CACHE_NAME = `alphabet-game-${CACHE_VERSION}`;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.webmanifest",
  "./icons/ABC favicon .jpg",
  "./icons/ear.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const AUDIO_ASSETS = LETTERS.flatMap((letter) => {
  const lower = letter.toLowerCase();
  return [
    `./audio/${lower}.wav`,
    `./audio/letter ${lower}.wav`,
    `./audio/find ${lower}.wav`,
  ];
}).concat("./audio/great_job.wav", "./audio/correct.wav");

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...CORE_ASSETS, ...AUDIO_ASSETS]);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve())));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const response = await fetch(request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
      return response;
    } catch (error) {
      return cached || Response.error();
    }
  })());
});
