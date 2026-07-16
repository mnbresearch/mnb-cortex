const CACHE = "mnb-cortex-v2";
self.addEventListener("install", () => { /* wait — client will prompt to update */ });
self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // network-first for navigations/APIs, cache-first fallback for offline
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});
