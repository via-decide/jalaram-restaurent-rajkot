/* Decide OS v2 - Cloudflare Pages Service Worker */
const CACHE_NAME = "decide-os-v2-cache-1";

// Minimal core cache (avoid addAll() failures if files missing)
const CORE_URLS = [
  "/",            // Cloudflare Pages serves index.html
  "/index.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Cache core
    await Promise.allSettled(CORE_URLS.map((u) => cache.add(u)));

    // Optional assets (won’t crash if missing)
    await Promise.allSettled([
      cache.add("/manifest.json"),
      cache.add("/sw.js"),
    ]);

    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

// Network-first for HTML, cache-first for others
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // HTML navigation -> network first (fresh deploys)
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match("/index.html") || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Assets -> cache first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return new Response("", { status: 504 });
    }
  })());
});