/*
 * Service worker — hand-written, deliberately.
 *
 * `@serwist/next` was the plan, but it states outright that it does not support Turbopack, which
 * Next 16 uses for builds. The alternatives were regressing to webpack builds or adopting an
 * experimental package. Writing this by hand costs about 150 lines, adds no dependency, and buys
 * something that matters more here than convenience: complete control over what is cached. Next's
 * static chunks are already content-hashed, so a generated precache manifest would add little.
 *
 * The rule that governs everything below: NEVER cache anything user-specific. A cached order page or
 * cart response on a shared device is a data leak, and a service worker cache outlives a sign-out.
 * The deny-list is checked first, before any strategy runs.
 *
 * Plain JavaScript in /public, so there is no build step and what ships is what you read.
 */

const VERSION = 'v1';

const SHELL_CACHE = `prefrmart-shell-${VERSION}`;
const STATIC_CACHE = `prefrmart-static-${VERSION}`;
const IMAGE_CACHE = `prefrmart-images-${VERSION}`;
const DATA_CACHE = `prefrmart-data-${VERSION}`;

const OFFLINE_URL = '/offline';

/** Kept small: just enough to render something coherent with no network. */
const PRECACHE_URLS = [OFFLINE_URL, '/manifest.webmanifest'];

const IMAGE_CACHE_MAX_ENTRIES = 120;
const DATA_CACHE_MAX_ENTRIES = 60;

/**
 * Paths that must never be cached, checked before anything else.
 *
 * Auth endpoints, the cart, the account area and orders are all either per-user or
 * state-changing. Caching any of them risks showing one person another's data, or replaying a
 * stale session.
 */
const NEVER_CACHE = [
  '/api/auth/',
  '/api/cart',
  '/api/account/',
  '/api/orders',
  '/api/search/image',
  '/account',
  '/orders',
  '/checkout',
  '/login',
  '/signup',
];

function isNeverCached(pathname) {
  return NEVER_CACHE.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/** Trim a cache to a maximum number of entries, oldest first. */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  // Cache.keys() returns insertion order, so the front is the oldest.
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // Take over as soon as installed rather than waiting for every tab to close. Safe here
      // because the caches are versioned and the old ones are deleted on activate.
      .then(() => self.skipWaiting())
      .catch((error) => {
        // A failed precache must not leave a broken worker registered.
        console.warn('[sw] precache failed', error);
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              // Anything from a previous VERSION...
              (name.startsWith('prefrmart-') && !name.endsWith(VERSION)) ||
              /*
               * ...plus every cache under the pre-rename `tender-` prefix, unconditionally.
               * The version check deliberately does not apply to these: the rename did not bump
               * VERSION, so `tender-shell-v1` ends with the *current* version and a shared
               * `!endsWith(VERSION)` guard would spare it forever. Nothing writes this prefix
               * again, so any cache carrying it is stale by definition.
               */
              name.startsWith('tender-'),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Cache-first, for content that cannot change without its URL changing.
 * Next's static chunks are content-hashed, so a hit is always correct.
 */
async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached !== undefined) return cached;

  const response = await fetch(request);
  // Only store complete, successful responses. A 206 or an opaque error would poison the cache.
  if (response.ok && response.status === 200) {
    await cache.put(request, response.clone());
    if (maxEntries !== undefined) void trimCache(cacheName, maxEntries);
  }
  return response;
}

/**
 * Stale-while-revalidate, for catalog data.
 *
 * Serves the cached copy immediately and refreshes in the background, so a repeat visit paints
 * instantly and the next one is current. Right for product listings, where being a minute stale is
 * invisible; wrong for stock at checkout, which is why the order path never comes near this.
 */
async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      if (response.ok && response.status === 200) {
        await cache.put(request, response.clone());
        if (maxEntries !== undefined) void trimCache(cacheName, maxEntries);
      }
      return response;
    })
    .catch(() => undefined);

  if (cached !== undefined) {
    // Do not await the refresh; that is the point of this strategy.
    void network;
    return cached;
  }

  const response = await network;
  if (response !== undefined) return response;

  return new Response(JSON.stringify({ error: { code: 'offline', message: 'You are offline.' } }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Network-first for page navigations, falling back to a cached copy, then the offline page.
 *
 * Network-first rather than cache-first because a storefront showing yesterday's prices is worse
 * than one that takes an extra moment.
 *
 * A cached HTML response is stored with its own headers, including the per-request CSP and its
 * nonce — so replaying it keeps the policy and the nonce consistent. Serving cached HTML under a
 * freshly generated nonce would block every script on the page.
 */
async function navigationHandler(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      await cache.put(request, response.clone());
      void trimCache(SHELL_CACHE, 30);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached !== undefined) return cached;

    const offline = await cache.match(OFFLINE_URL);
    if (offline !== undefined) return offline;

    return new Response('You are offline.', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is ever cacheable. A POST is an action, not a resource.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only. Cross-origin requests are left entirely alone.
  if (url.origin !== self.location.origin) return;

  // The deny-list wins over every strategy below.
  if (isNeverCached(url.pathname)) return;

  // Immutable, content-hashed build output.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Product art: local SVG and the optimiser's output.
  if (url.pathname.startsWith('/img/') || url.pathname.startsWith('/_next/image')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_CACHE_MAX_ENTRIES));
    return;
  }

  // Catalog data — public, and tolerably stale.
  if (url.pathname === '/api/products' || url.pathname.startsWith('/api/search/suggest')) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE, DATA_CACHE_MAX_ENTRIES));
    return;
  }
  if (url.pathname === '/api/cart/resolve') return; // POST only, but be explicit.

  // Page navigations.
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }
});

/**
 * Let the page ask the worker to drop cached data — used on sign-out, so a shared device does not
 * keep the previous session's catalog state around.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'clear-data-caches') {
    event.waitUntil(
      Promise.all([caches.delete(DATA_CACHE), caches.delete(SHELL_CACHE)]),
    );
  }
});
