const CACHE_NAME = 'vyapar-os-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/merchant-qr.jpg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA: Failed to cache some static assets during install', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Direct Network Bypass:
  // Non-GET requests (POST, PUT, DELETE), backend API calls (/api), or external Render backend
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api') ||
    url.hostname.includes('onrender.com') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return; // Pass through directly to network
  }

  // 2. SPA Navigation: For HTML page navigations (/login, /pos, etc.)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match('/index.html');
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // 3. Static assets: Stale-While-Revalidate with safe Response fallback
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      const response = cachedResponse || (await fetchPromise);
      return (
        response ||
        new Response('Asset not found', {
          status: 404,
          statusText: 'Not Found',
        })
      );
    })
  );
});
