// ============================================================
// KESSIA — Service Worker (cahier des charges §5, §35, §51)
//
// Stratégie prudente pour une application financière :
//   - /api/**            : réseau UNIQUEMENT, jamais de cache
//   - navigations        : réseau d'abord (timeout court) → coquille de la
//                          même route en cache → page /offline
//   - assets statiques   : cache d'abord + revalidation en arrière-plan
//
// Ce qui est mis en cache pour les navigations = la COQUILLE de la page
// (layout + îlots clients + squelettes de chargement), jamais de donnée
// financière : tout le contenu utilisateur est chargé côté client via
// /api/** (non caché) et re-validé au retour en ligne.
// ============================================================

const VERSION = 'kessia-v3';
const SHELL = `${VERSION}-shell`;
const NAV = `${VERSION}-nav`;
const RUNTIME = `${VERSION}-runtime`;

// Coquilles pré-cachées : accessibles même lors d'une 1ʳᵉ visite hors ligne.
const PRECACHE = [
  '/offline',
  '/manifest.webmanifest',
  '/logo/kessia-icon-192.png',
];
const NAV_SHELLS = ['/home', '/wallet', '/tontine', '/business', '/profile', '/login'];

const NAV_TIMEOUT_MS = 6000;
const NAV_CACHE_MAX = 16;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await shell.addAll(PRECACHE);
      // Best-effort : une coquille indisponible ne bloque pas l'installation.
      const nav = await caches.open(NAV);
      await Promise.allSettled(
        NAV_SHELLS.map(async (path) => {
          const res = await fetch(path, { credentials: 'same-origin' });
          if (res.ok) await nav.put(path, res.clone());
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Permet à la page de forcer l'activation du nouveau SW.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (const k of keys.slice(0, keys.length - max)) await cache.delete(k);
}

function timeoutFetch(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('nav-timeout')), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function handleNavigation(request) {
  const url = new URL(request.url);
  const cacheKey = url.pathname; // on ignore la query pour la coquille

  try {
    const res = await timeoutFetch(request, NAV_TIMEOUT_MS);
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(NAV).then(async (c) => {
        await c.put(cacheKey, copy);
        trimCache(NAV, NAV_CACHE_MAX);
      });
    }
    return res;
  } catch {
    const cached = await caches.match(cacheKey, { ignoreSearch: true });
    if (cached) return cached;
    const offline = await caches.match('/offline', { ignoreSearch: true });
    return offline || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Données : jamais de cache, jamais de repli. Le client gère l'échec
  // (bandeau hors ligne + ErrorNote) et re-valide au retour du réseau.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  const isAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/logo/') ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);

  if (isAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
  }
});
