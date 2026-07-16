const CACHE = "mnb-cortex-v3";
const OFFLINE_URL = "/offline";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).catch(() => {})); });
self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === "navigate") return caches.match(OFFLINE_URL);
      return new Response("", { status: 504 });
    })
  );
});
