const CACHE_NAME = 'planicorne-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/Logo Step Up.png',
  '/manifest.json',
  '/Icone.png',
  '/pwa-192.png',
  '/pwa-512.png'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network-first with cache fallback)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  // Only intercept standard http/https schemes (ignore chrome-extensions, etc.)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  // Ignore Supabase, Google APIs & Auth calls
  if (url.includes('supabase.co') || url.includes('googleapis.com') || url.includes('googleusercontent.com')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache new assets dynamically
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, resClone);
        });
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
