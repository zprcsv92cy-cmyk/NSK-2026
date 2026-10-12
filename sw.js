// NSK-2026 v671 – nätverket först, cache endast som offline-reserv.
const CACHE_NAME = "nsk-team18-v671";
const OFFLINE_ASSETS = [
  "./startsida/", "./app.css?v=671", "./app.js?v=671",
  "./version.js?v=671", "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // En misslyckad förhämtning får inte stoppa uppdateringen.
      await Promise.allSettled(OFFLINE_ASSETS.map((url) => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("nsk-team18-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);
  // deploy.json får aldrig hämtas ur cache: den styr versionskontrollen.
  if (url.pathname.endsWith("/deploy.json")) return;
  // Cachelagra endast filer som hör till denna GitHub Pages-app.
  const scope = new URL(self.registration.scope);
  if (!url.href.startsWith(scope.href)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(req);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        try { await cache.put(req, response.clone()); } catch (_) { /* nätverkssvaret gäller ändå */ }
      }
      return response;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === "navigate") {
        const fallback = await caches.match(new URL("startsida/", scope).href);
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
