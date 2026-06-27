const CACHE_NAME = 'sgm-office-v52';
const ASSETS = ['./', './index.html', './manifest.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if(e.request.mode === 'navigate' || e.request.destination === 'document'){
    e.respondWith(fetch(e.request).then(r => { const rc=r.clone(); caches.open(CACHE_NAME).then(c => c.put(e.request, rc)); return r; }).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
  }
});
