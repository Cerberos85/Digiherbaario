/* sw.js - Service Worker offline-tukea varten */

// Välimuistin nimi. Kun teet päivityksiä sovellukseen, vaihda versionumeroa (esim. v2).
const CACHE_NAME = 'herbaario-v2'

// Tiedostot, jotka ladataan laitteen muistiin offline-käyttöä varten
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  // Ladataan myös PDF-kirjasto välimuistiin, jotta raportin luonti onnistuu metsässä!
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// 1. ASENNUSVAIHE (Install)
// Suoritetaan, kun Service Worker rekisteröidään ensimmäisen kerran
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Tallennetaan tiedostot välimuistiin...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // Pakotetaan uusi SW heti aktiiviseksi
  );
});

// 2. AKTIVOINTIVAIHE (Activate)
// Suoritetaan, kun uusi SW ottaa ohjat. Poistetaan vanhat välimuistit, jotta tilaa ei kulu turhaan.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Poistetaan vanha välimuisti:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim())
  );
});

// 3. VERKKOPYYNTÖJEN SIEPPAUS (Fetch)
// Aina kun selain pyytää tiedostoa, katsotaan löytyykö se jo välimuistista
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Jos tiedosto löytyy välimuistista (esim. offline-tilassa), palautetaan se.
        // Muuten haetaan normaalisti verkosta.
        return cachedResponse || fetch(event.request);
      })
      .catch(() => {
        // Tänne voidaan lisätä esim. offline-fallback-sivu, jos halutaan
        console.log('[Service Worker] Verkkopyyntö epäonnistui ja tiedostoa ei ole välimuistissa.');
      })
  );
});
