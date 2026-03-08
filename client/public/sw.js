// Lemons Portal — Service Worker
// Cache strategy: network-first para API, cache-first para assets estáticos

const CACHE_NAME = 'lemons-v1';
const STATIC_CACHE = 'lemons-static-v1';
const API_CACHE = 'lemons-api-v1';

// Assets estáticos a pre-cachear
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Rutas de la app (SPA fallback)
const APP_ROUTES = [
  '/client/shipments',
  '/operator',
  '/dashboard',
  '/caja',
  '/client/quote',
  '/quote',
  '/login',
  '/coins',
  '/coins/operator',
];

// Endpoints de API a cachear (solo GET, para offline)
const CACHEABLE_API_PATTERNS = [
  /\/client\/shipments/,
  /\/shipments\/.*\/events/,
  /\/operator\/shipments/,
  /\/operator\/dashboard/,
  /\/quote\/rates/,
  /\/quote\/my-rates/,
  /\/cash\/summary/,
  /\/accounts/,
  /\/coins/,
];

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache parcial:', err);
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => {
            console.log('[SW] Eliminando cache viejo:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar chrome-extension y non-http
  if (!url.protocol.startsWith('http')) return;

  // ── API requests (api.lemonsarg.com) ──────────────────────────────────────
  if (url.hostname === 'api.lemonsarg.com' || url.port === '4000') {
    if (request.method === 'GET' && isCacheableAPI(url.pathname)) {
      event.respondWith(networkFirstAPI(request));
    }
    // POST/PATCH/DELETE: solo network, sin cache
    return;
  }

  // ── Assets estáticos (JS, CSS, imágenes, fuentes) ─────────────────────────
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  // ── Rutas SPA ─────────────────────────────────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(spaFallback(request));
    return;
  }
});

// ─── Estrategias ─────────────────────────────────────────────────────────────

// Network-first para API: intenta red, guarda en cache, usa cache si offline
async function networkFirstAPI(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    return offlineAPIResponse();
  }
}

// Cache-first para assets: usa cache, si no hay, va a red y guarda
async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Asset no disponible offline', { status: 503 });
  }
}

// SPA fallback: sirve index.html para rutas de la app
async function spaFallback(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match('/index.html');
    return cached || new Response('App offline', { status: 503 });
  }
}

// Respuesta JSON para API cuando offline
function offlineAPIResponse() {
  return new Response(
    JSON.stringify({
      error: 'offline',
      message: 'Sin conexión. Mostrando datos cacheados.',
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isCacheableAPI(pathname) {
  return CACHEABLE_API_PATTERNS.some((pattern) => pattern.test(pathname));
}

function isStaticAsset(pathname) {
  return /\.(js|css|png|svg|ico|woff2?|ttf|webp|jpg|jpeg)$/.test(pathname);
}

// ─── Push Notifications (preparado para futuro) ───────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Lemons Portal', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});