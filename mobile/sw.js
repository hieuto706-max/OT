const CACHE_NAME = 'ot-manager-v15';
const ASSETS = [
      './',
      'index.html',
      'style.css',
      'app.js',
      'manifest.json',
    ];

self.addEventListener('install', event => {
      event.waitUntil(
              caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
            );
      self.skipWaiting();
});

self.addEventListener('activate', event => {
      event.waitUntil(
              caches.keys().then(keys => Promise.all(
                        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
                      ))
            );
      self.clients.claim();
});

self.addEventListener('fetch', event => {
      if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
              return;
      }
      const url = new URL(event.request.url);
      if (url.pathname.indexOf('/api/') !== -1) {
              return;
      }
      // For static assets: Stale-While-Revalidate (SWR)
      event.respondWith(
          caches.match(event.request).then(cachedResponse => {
              const fetchPromise = fetch(event.request).then(networkResponse => {
                  if (networkResponse && networkResponse.status === 200) {
                      const clone = networkResponse.clone();
                      caches.open(CACHE_NAME).then(cache => {
                          cache.put(event.request, clone).catch(() => {});
                      });
                  }
                  return networkResponse;
              }).catch(err => {
                  // If network fails, try to return cached response
                  if (cachedResponse) return cachedResponse;
                  throw err;
              });

              // Return cached response instantly if available, otherwise wait for network
              return cachedResponse || fetchPromise;
          })
      );
});
