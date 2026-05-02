const cacheName = "chat-app-cache-v3";

const filesToCache = [
  "./",
  "./signup",
  "./login",
  "./forgot.html",
  "./animation.html",
  "./Chats.html",
  "./homepage.html",
  "./style.css",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName)
      .then((cache) => {
        console.log("Caching files");
        return cache.addAll(filesToCache);
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== cacheName)
          .map((key) => caches.delete(key))
      )
    )
  );
});

// self.addEventListener("fetch", (event) => {
//   const url = new URL(event.request.url);

//   // Strategy: Network Only for API calls to ensure data freshless
//   if (url.pathname.includes('/api/')) {
//     event.respondWith(fetch(event.request));
//     return;
//   }

//   // Strategy: Network First, falling back to Cache for static assets
//   event.respondWith(
//     fetch(event.request)
//       .then((networkResponse) => {
//         if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
//           return networkResponse;
//         }

//         const responseToCache = networkResponse.clone();
//         caches.open(cacheName).then((cache) => {
//           cache.put(event.request, responseToCache);
//         });

//         return networkResponse;
//       })
//       .catch(() => {
//         return caches.match(event.request);
//       })
//   );
// });
self.addEventListener('fetch', (event) => {
  // FIX 1: Ignore non-GET requests (like POST messages)
  if (event.request.method !== 'GET') return;

  // FIX 2: Do not cache API calls. Let them always go to the network.
  // This ensures your 401 status is handled by the page, not the cache.
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchRes) => {
        // FIX 3: Don't cache redirected responses (like the login page)
        if (fetchRes.status !== 200 || fetchRes.type === 'opaqueredirect') {
          return fetchRes;
        }
        return caches.open('v1').then((cache) => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      });
    })
  );
});
