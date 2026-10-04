/*
  THE SERVICE WORKER WAS KEEPING THE WORKSPACE'S FINANCIALS ON THE DEVICE.

  ============================================================================
  WHAT IT USED TO DO
  ============================================================================

  The previous version cached EVERY same-origin GET:

      if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
      e.respondWith(fetch(req).then((res) => {
        caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }) ...

  That is every `/api/*` JSON response and every server-rendered app page —
  /dashboard, /receivables, /payables, /customers — written to the Cache
  Storage of the browser profile, with no expiry and no regard for
  `Cache-Control: no-store`.

  Signing out clears the Supabase cookie. It does not touch Cache Storage. So
  on a shared machine — the front-desk PC, a borrowed laptop, an accountant's
  terminal used for several clients — the next person can read the previous
  workspace's receivables by going offline, or simply by opening DevTools and
  reading the cache. For a product whose whole content is one SME's debtors,
  bank position and customer list, that is the data we exist to protect
  sitting in a store nothing in the app ever clears.

  It also made the app WRONGER when it half-worked: a cached /dashboard from
  last Tuesday renders as today's numbers with no staleness marker, which is
  the failure this codebase has spent the most effort eliminating everywhere
  else.

  ============================================================================
  WHAT IT DOES NOW
  ============================================================================

  Caches static, non-personal assets only — the build output under
  /_next/static (content-hashed, immutable), icons, fonts, the manifest, and
  the offline page. Everything else goes to the network every time and is
  never written to the cache.

  That is an allowlist, not a denylist. A denylist on `/api/` would have
  missed the server-rendered pages, which carry the same data without the
  obvious prefix — and a new route would quietly opt itself in.

  CACHE is bumped to v4 and `activate` now DELETES every older cache. Without
  that, this fix would protect new installs and leave every existing user's
  device holding the old data forever — a fix that does not reach the people
  already exposed.

  ============================================================================
  WHAT THIS COSTS, STATED PLAINLY
  ============================================================================

  Offline no longer shows your data — it shows the offline page. The app
  shell, icons and fonts still load instantly from cache, so installing it is
  still worth doing, but the "works offline" line in /help overstated what was
  ever safe here and has been corrected to say what is true.

  Genuine offline use needs a deliberate design: an explicit opt-in, an
  encrypted store, a visible "last synced" stamp, and a clear on sign-out. Not
  a cache-everything handler.
*/
const CACHE = "mnb-cortex-v4";
const OFFLINE_URL = "/offline";

/** Static, non-personal, safe to keep on the device. */
function isCacheable(url) {
  if (url.origin !== location.origin) return false;
  if (url.pathname === OFFLINE_URL) return true;
  if (url.pathname.startsWith("/_next/static/")) return true;   // content-hashed build output
  if (url.pathname === "/manifest.webmanifest" || url.pathname === "/manifest.json") return true;
  return /\.(?:css|js|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/i.test(url.pathname);
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).catch(() => {}));
});

self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  /*
    Purge every previous cache. v3 and earlier hold API responses and rendered
    pages for whoever was signed in at the time; this is the only code path
    that will ever remove them from an existing device.
  */
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  /*
    Not cacheable: go to the network and STAY there. No cache read, no cache
    write — a stale authenticated page must never be served, not even when
    offline. Navigations fall back to the offline page so the app does not
    show a browser error; everything else surfaces the failure.
  */
  if (!isCacheable(url)) {
    if (req.mode === "navigate") {
      e.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    }
    return;
  }

  /* Cacheable: cache-first, since these are content-hashed or versioned. */
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      /* Only store a real, complete response — never an opaque or error one. */
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      return new Response("", { status: 504 });
    }
  })());
});
