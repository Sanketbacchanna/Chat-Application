const cacheName = "chat-app-v1";

const filesToCache = [
  "./",
  "./signup.html",
  "./viwes/Login.html",
  "./forgot.html",
  "./animation.html",
  "./Chats.html",
  "./homepage.html",
  "./s.html",
  "./Abhijeet.html",
  "./Abhishek.html",
  "./Hankuni.html",
  "./Mahesh.html",
  "./Monika.html",
  "./Nagesh.html",
  "./Nikita.html",
  "./NIVEDITA.html",
  "./Prince.html",
  "./Ranjita.html",
  "./Sachin.html",
  "./Sangamesh.html",
  "./style.css",
  "./index.js",
  "./icon-192.png",
  "./icon-512.png"
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
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
