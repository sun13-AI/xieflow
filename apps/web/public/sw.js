/* XieFlow Service Worker (r20 · M10 start). ASCII only.
   Static assets: cache-first. API reads: network-first with bounded fallback.
   All queue writes/mutations bypass this worker and go straight to the network,
   so an offline mutation is handled by shared offlineQueue in the page, not here.
   Registration is disabled in tests/dev via ?no-sw=1 (see index.html). */

const CACHE = "xieflow-static-v20";
const CACHE_FIRST_PATHS = ["/assets/", "/icons/", "/manifest.json"];
const NETWORK_FIRST_PATHS = ["/api/"];
const OFFLINE_FALLBACK = "/offline.html";
const PRECACHE = ["/", "/index.html", "/manifest.json", "/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function apiFallback() {
  return new Response(JSON.stringify({ error: "current offline, queued locally", offline: true }), {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8", "x-xieflow-sw-fallback": "1" },
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Only safe reads are eligible for SW handling. Mutations (including replay)
  // must reach the API untouched so the page keeps authoritative status codes.
  if (req.method !== "GET") return;

  if (NETWORK_FIRST_PATHS.some((p) => url.pathname.startsWith(p))) {
    // network-first API: fresh when online, bounded fallback when offline.
    event.respondWith(
      fetch(req).catch(() => apiFallback()),
    );
    return;
  }

  if (CACHE_FIRST_PATHS.some((p) => url.pathname.startsWith(p))) {
    // cache-first static: instant repeat loads, network only on cache miss.
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(OFFLINE_FALLBACK))),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_FALLBACK)),
    );
  }
});
