/*
 * HaqCheck service worker: caches the public app shell, the sample images and
 * the public Help page. It never caches /api responses (private data, signed
 * URLs) — those always go to the network.
 */
const VERSION = "hc-shell-2026-10-17-1";
const PUBLIC_PAGES = ["/", "/help", "/demo", "/home", "/earnings"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(PUBLIC_PAGES))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache private API responses

  // Immutable build assets and samples: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/demo/") || url.pathname.match(/\.(woff2|png|svg|ico)$/)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Public pages: network first, fall back to cached shell when offline.
  if (req.mode === "navigate" && PUBLIC_PAGES.includes(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
  }
});
