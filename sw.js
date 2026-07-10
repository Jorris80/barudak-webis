/* ============================================================
 *  SawitGIS Mandiri — Service Worker (PWA offline)
 *  Meng-cache cangkang aplikasi (HTML, ikon, pustaka CDN) agar
 *  aplikasi tetap tampil saat di-refresh tanpa sinyal internet.
 *
 *  Naikkan VERSI setiap kali index.html diubah agar cache diperbarui.
 * ============================================================ */
var VERSI = 'sawitgis-v4';
var INTI = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Pustaka CDN yang ikut di-cache saat pertama kali diakses (agar peta/chart
// tetap jalan offline setelah sekali online).
var POLA_CDN = [
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'tile.openstreetmap.org',
  'server.arcgisonline.com'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSI).then(function (c) {
    return c.addAll(INTI).catch(function () { /* sebagian file mungkin belum ada saat dev */ });
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== VERSI) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; // POST ke API tidak di-cache

  var url = new URL(req.url);

  // Navigasi/HTML: network-first, fallback ke cache (agar tetap tampil offline)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0) {
    e.respondWith(
      fetch(req).then(function (res) {
        var salin = res.clone();
        caches.open(VERSI).then(function (c) { c.put('./index.html', salin); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  // Pustaka CDN & tile peta: cache-first, lalu perbarui di latar belakang
  var dariCdn = POLA_CDN.some(function (p) { return url.hostname.indexOf(p) >= 0; });
  var seOrigin = url.origin === self.location.origin;

  if (dariCdn || seOrigin) {
    e.respondWith(
      caches.match(req).then(function (tembolok) {
        var jaringan = fetch(req).then(function (res) {
          if (res && res.status === 200) {
            var salin = res.clone();
            caches.open(VERSI).then(function (c) { c.put(req, salin); });
          }
          return res;
        }).catch(function () { return tembolok; });
        return tembolok || jaringan;
      })
    );
  }
});
