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

self.addEventListener("fetch", (event) => {
  // Strategy: Network First, falling back to Cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Check if we received a valid response
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // Clone the response to store it in cache
        const responseToCache = networkResponse.clone();
        caches.open(cacheName).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      })
      .catch(() => {
        // If network fails, try the cache
        return caches.match(event.request);
      })
  );
});
