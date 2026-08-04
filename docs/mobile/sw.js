importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD8W_NVkhL-7uSfR6aNigLDHXtLN7fO6cI",
  authDomain: "ot-manager-4a0eb.firebaseapp.com",
  projectId: "ot-manager-4a0eb",
  storageBucket: "ot-manager-4a0eb.firebasestorage.app",
  messagingSenderId: "75783850598",
  appId: "1:75783850598:web:274a61bee43b65c2343ba7"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[Service Worker] Nhận tin nhắn ngầm FCM:', payload);
  const notificationTitle = payload.notification.title || 'OT Manager';
  const notificationOptions = {
    body: payload.notification.body,
    icon: './favicon.png',
    badge: './favicon.png',
    data: payload.data || {}
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

const CACHE_NAME = 'ot-manager-build-1785859044078';
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

// ==================== WEB PUSH EVENT LISTENERS ====================
self.addEventListener('push', event => {
    let data = { title: 'OT Manager', body: 'Hãy ghi nhận giờ OT hôm nay nhé!' };
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'OT Manager', body: event.data.text() };
        }
    }

    const options = {
        body: data.body,
        icon: './favicon.png',
        badge: './favicon.png',
        data: data.data || {},
        actions: data.actions || []
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'skip') {
        console.log('[Service Worker] Đã bấm bỏ qua thông báo.');
        return;
    }
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.indexOf('/mobile/') !== -1 && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./');
            }
        })
    );
});
