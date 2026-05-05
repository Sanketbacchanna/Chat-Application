const cacheName = "chat-app-cache-v5";

const filesToCache = [
  "/",
  "/signup",
  "/login",
  "/forgot.html",
  "/animation.html",
  "/Chats.html",
  "/homepage.html",
  "/style.css",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(cacheName)
      .then((cache) => {
        console.log("Caching files");
        return cache.addAll(filesToCache);
      })
      .catch(err => console.error("Cache install error:", err))
  );
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== cacheName)
          .map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.url.includes('/api/') || event.request.url.includes('socket.io')) {
    return;
  }

  // Network-First Strategy ensures users get the latest code (like notifications.js)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaqueredirect') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(cacheName).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// === WEB PUSH NOTIFICATIONS (OFFLINE) ===
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: data.url }
      };

      event.waitUntil(
        self.registration.showNotification(data.title, options)
      );
    } catch (e) {
      console.error("Push Error", e);
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(windowClients => {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === event.notification.data.url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
    );
  }
});
