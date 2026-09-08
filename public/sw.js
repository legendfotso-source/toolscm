/*
 * Tools.cm service worker.
 *
 * Scope of the promise: this makes the site load fast on a poor connection and
 * lets already-visited pages open with no network at all. It does NOT make
 * every tool work offline — the heavy libraries are fetched on demand, and the
 * background-removal model is not cached here. The interface never claims
 * otherwise.
 */

const VERSION = "v1";
const SHELL_CACHE = `toolscm-shell-${VERSION}`;
const ASSET_CACHE = `toolscm-assets-${VERSION}`;
const PAGE_CACHE = `toolscm-pages-${VERSION}`;

const SHELL = ["/", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, PAGE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only ever touch our own origin. The segmentation model and anything else
  // third-party is left entirely alone.
  if (url.origin !== self.location.origin) return;

  // Build output is content-hashed, so it can be served from cache forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // pdf.js runtime data: large, rarely changing, worth keeping once fetched.
  if (url.pathname.startsWith("/pdfjs/") || url.pathname.startsWith("/vendor/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    const offline = await caches.match("/offline");
    if (offline) return offline;
    throw error;
  }
}
