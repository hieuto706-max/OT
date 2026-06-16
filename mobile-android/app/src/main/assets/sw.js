const CACHE_NAME = 'ot-manager-v8';
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
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Always fetch API calls from network
    if (url.pathname.indexOf('/api/') !== -1) {
        return event.respondWith(fetch(event.request));
    }

    // For static assets: Stale-While-Revalidate (SWR)
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return networkResponse;
            }).catch(() => {
                // Ignore network errors in background update
            });

            // Return cached response instantly if available, otherwise wait for network
            return cachedResponse || fetchPromise;
        })
    );
});
