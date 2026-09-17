/* ============================================================
 *  SawitGIS Mandiri — Service Worker (PWA offline)
 *  Meng-cache cangkang aplikasi (HTML, ikon, pustaka CDN) agar
 *  aplikasi tetap tampil saat di-refresh tanpa sinyal internet.
 *
 *  Naikkan VERSI setiap kali index.html diubah agar cache diperbarui.
 * ============================================================ */
var VERSI = 'sawitgis-v4.1.0';
var INTI = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Pustaka CDN yang ikut di-cache saat pertama kali diakses (agar peta/chart
// tetap jalan offline setelah sekali online).
/* Hanya pustaka & font yang di-cache.
 *
 * PENTING — TILE PETA SENGAJA TIDAK DI-CACHE.
 * Kebijakan pemakaian tile OpenStreetMap Foundation melarang pengunduhan
 * massal dan penyimpanan tile untuk pemakaian offline. Hal serupa berlaku pada
 * OpenTopoMap dan citra Esri. Menyimpannya di Service Worker adalah pelanggaran
 * lisensi sekaligus berisiko pemblokiran IP.
 *
 * Untuk peta offline yang sah, gunakan salah satu:
 *   1. Berlangganan penyedia yang mengizinkan caching (MapTiler, Mapbox,
 *      Stadia Maps), lalu isi URL-nya di menu Pengaturan; atau
 *   2. Muat berkas MBTiles milik sendiri lewat menu "Muat File" — legal
 *      sepenuhnya karena datanya milik/berlisensi pelanggan.
 */
var POLA_CDN = [
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

/* Host tile yang WAJIB selalu dari jaringan (tidak boleh masuk cache). */
var POLA_TILE = [
  'tile.openstreetmap.org',
  'tile.opentopomap.org',
  'arcgisonline.com',
  'basemaps.cartocdn.com',
  'tile.stadiamaps.com',
  'api.maptiler.com',
  'api.mapbox.com'
];

/* Host yang TIDAK boleh di-cache: data yang harus selalu segar.
   (Panggilan API ke Apps Script memakai POST sehingga sudah otomatis
   dilewati, tetapi cuaca memakai GET dan harus tetap real-time.) */
var POLA_JANGAN_CACHE = [
  'script.google.com',
  'api.open-meteo.com'
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

  // Selalu ambil dari jaringan untuk data yang harus segar
  if (POLA_JANGAN_CACHE.some(function (p) { return url.hostname.indexOf(p) >= 0; })) return;
  if (POLA_TILE.some(function (p) { return url.hostname.indexOf(p) >= 0; })) return;

  /* Navigasi/HTML: sajikan dari simpanan lebih dulu, perbarui di latar belakang.
   *
   * Sebelumnya memakai network-first: setiap muat ulang harus menunggu seluruh
   * berkas aplikasi (sekitar 1 MB) selesai diunduh sebelum apa pun tampil. Di
   * jaringan seluler kebun, itu berarti menunggu belasan detik pada layar
   * kosong — meski salinan yang sama persis sudah ada di perangkat.
   *
   * Dengan cara ini aplikasi terbuka seketika, sementara versi barunya diunduh
   * diam-diam. Bila ternyata ada pembaruan, pengguna diberi tahu dan dapat
   * memuat ulang saat siap.
   */
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0) {
    e.respondWith(
      caches.match('./index.html').then(function (tersimpan) {
        var dariJaringan = fetch(req).then(function (res) {
          if (res && res.ok) {
            var salin = res.clone();
            caches.open(VERSI).then(function (c) { c.put('./index.html', salin); });

            /* Beri tahu halaman bila isinya benar-benar berbeda. Perbandingan
               memakai ETag atau panjang isi — cukup untuk mendeteksi rilis
               baru tanpa membandingkan seluruh berkas. */
            if (tersimpan) {
              var lamaTag = tersimpan.headers.get('etag') || tersimpan.headers.get('content-length');
              var baruTag = res.headers.get('etag') || res.headers.get('content-length');
              if (lamaTag && baruTag && lamaTag !== baruTag) {
                self.clients.matchAll().then(function (cs) {
                  cs.forEach(function (c) { c.postMessage({ tipe: 'versiBaru' }); });
                });
              }
            }
          }
          return res;
        }).catch(function () { return null; });

        /* Ada salinan → tampilkan seketika. Belum ada → tunggu jaringan. */
        return tersimpan || dariJaringan.then(function (r) {
          return r || caches.match('./');
        });
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
