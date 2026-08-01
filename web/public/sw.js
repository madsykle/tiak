/* eslint-disable no-restricted-globals */

const CACHE_PREFIX = "tiak";
const PRECACHE_CACHE = `${CACHE_PREFIX}-precache`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime`;
const PRECACHE_MANIFEST = self.__WB_MANIFEST || [];

const precacheUrls = PRECACHE_MANIFEST.map((entry) =>
  typeof entry === "string" ? entry : entry.url,
).filter(Boolean);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE_CACHE)
      .then((cache) => cache.addAll(precacheUrls))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(`${CACHE_PREFIX}-`) &&
                key !== PRECACHE_CACHE &&
                key !== RUNTIME_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const isCacheableAsset = (url) =>
  url.origin === self.location.origin &&
  url.pathname !== "/sw.js" &&
  (url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|eot|gif|ico|jpeg|jpg|js|json|png|svg|ttf|woff|woff2|webp)$/i.test(
      url.pathname,
    ));

const networkFirst = async (request) => {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("Network unavailable");
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/files/stream")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request).catch(() => caches.match("/").then((cached) => cached || Response.error())),
    );
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const refresh = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || refresh;
      }),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
