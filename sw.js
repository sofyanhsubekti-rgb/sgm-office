const CACHE_NAME = 'sgm-office-v79';
const ASSETS = ['./', './index.html', './manifest.json', './logo.png', './icons/icon-192.png', './icons/icon-512.png'];

// Isi cache saat pemasangan supaya aplikasi tetap bisa dibuka tanpa internet.
// cache:'reload' memaksa ambil dari jaringan, bukan dari cache HTTP browser.
// Tanpa itu, versi baru yang dipasang beberapa menit setelah penerbitan akan
// menyalin halaman LAMA yang masih tersimpan browser (GitHub Pages memasang
// max-age=600 pada index.html), lalu menyimpannya sebagai cadangan offline.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.all(ASSETS.map(a =>
        c.add(new Request(a, { cache: 'reload' })).catch(() => c.add(a).catch(() => {}))
      )))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// Hapus cache versi LAMA saja, jangan yang baru saja diisi.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => self.clients.claim())
  );
});

// Utamakan jaringan agar versi terbaru selalu terpakai; cache hanya cadangan saat offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith(
    fetch(req)
      .then(res => {
        // Simpan juga pustaka dari CDN (Firebase, Chart.js, jsPDF) supaya
        // aplikasi tetap hidup saat benar-benar tanpa internet.
        if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const salinan = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, salinan)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => {
          if (hit) return hit;
          // Saat offline, permintaan halaman diarahkan ke index.html yang tersimpan
          if (req.mode === 'navigate') {
            return caches.match('./index.html').then(idx =>
              idx || new Response('Aplikasi sedang offline dan belum tersimpan di perangkat ini.',
                { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
            );
          }
          return new Response('', { status: 504, statusText: 'Offline' });
        })
      )
  );
});
