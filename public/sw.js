const cacheName = "chat-app-cache-v6";

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
      
      const isCall = data.title && data.title.includes('Incoming');
      
      const options = {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: data.url }
      };

      if (isCall) {
        options.requireInteraction = true;
        options.renotify = true;
        options.tag = 'incoming_call';
        // Short vibration pattern for ringing
        options.vibrate = [500, 1000, 500];
        // Direct MP3 link for better compatibility
        options.sound = 'https://raw.githubusercontent.com/rafaelbotazini/ringtone/master/iphone.mp3';
        options.silent = false;
        
        // Add action buttons to the notification for quick response
        options.actions = [
          { action: 'accept', title: 'Answer', icon: '/icons/icon-192.png' },
          { action: 'reject', title: 'Decline', icon: '/icons/icon-192.png' }
        ];
      }

      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
          let isFocused = false;
          for (let i = 0; i < windowClients.length; i++) {
            if (windowClients[i].focused) {
              isFocused = true;
              break;
            }
          }

          if (isFocused) {
            // App is currently focused, do not show background push notification.
            // The frontend socket.io will handle in-app notification & custom audio.
            return;
          }

          return self.registration.showNotification(data.title, options);
        })
      );
    } catch (e) {
      console.error("Push Error", e);
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  let url = notification.data.url;

  notification.close();

  if (action === 'accept') {
    if (url.includes('?')) {
        url += '&acceptCall=true';
    } else {
        url += '?acceptCall=true';
    }
  } else if (action === 'reject') {
    // Notify the server to reject the call via a background fetch
    if (url) {
       try {
           const urlObj = new URL(url, self.location.origin);
           const callerEmail = urlObj.searchParams.get('email');
           const toEmail = urlObj.searchParams.get('toEmail');
           const rt = urlObj.searchParams.get('rt');
           if (callerEmail && toEmail && rt) {
               event.waitUntil(
                   fetch('/api/reject-call-push', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ caller: callerEmail, receiver: toEmail, token: rt })
                   }).catch(err => console.error("Push reject error:", err))
               );
           }
       } catch (e) {
           console.error("URL parse error in sw.js:", e);
       }
    }
    return;
  }

  if (url) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});
