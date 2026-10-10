const VERSION = "667";
const CACHE_NAME = "nsk-team18-v667";

const ASSETS = [
  "./",
  "./index.html?v=667",
  "./version.js?v=667",
  "./deploy.json?v=667",
  "./app.css?v=667",
  "./config.js?v=667",
  "./auth.js?v=667",
  "./db.js?v=667",
  "./app.js?v=667",
  "./manifest.webmanifest?v=667",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req);
    })
  );
});