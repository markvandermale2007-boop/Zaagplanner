// Service worker: de Zaagplanner ook zonder internet openen (bv. bij de klant op de iPad).
// Altijd eerst het netwerk (dan heb je na een update direct de nieuwe versie), bij geen verbinding de bewaarde kopie.
// Bewaart alleen de app zelf en de bibliotheken van het CDN (pdf.js, three.js, SheetJS, lettertypen) – geen gegevens:
// projecten en foto's staan in de browser (localStorage / IndexedDB) en gaan nergens heen.
const CACHE = 'zaagplanner-v1';
const APP = ['./', 'index.html', 'met-excel/index.html', 'timer.html', 'timer.webmanifest', 'js/timer.js', 'icons/timer-180.png', 'icons/timer-192.png', 'icons/timer-512.png','manifest.webmanifest', 'css/app.css', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'zaagplanner-pictogram.png',
  'js/geom.js', 'js/parts.js', 'js/materials.js', 'js/dxfimport.js', 'js/pdfimport.js', 'js/nest.js', 'js/layout.js', 'js/render.js', 'js/store.js', 'js/fotos.js',
  'js/costing.js', 'js/drawings.js', 'js/view3d.js', 'js/config.js', 'js/cf3d.js', 'js/spec3d.js', 'js/opstelling.js', 'js/cloud.js', 'js/sync.js', 'js/werk.js',
  'js/app/core.js', 'js/app/projecten.js', 'js/app/importeren.js', 'js/app/controleren.js', 'js/app/hout.js', 'js/app/indeling.js', 'js/app/berekenen.js',
  'js/app/afdrukken.js', 'js/app/materialen.js', 'js/app/prijzen.js', 'js/app/begroting.js', 'js/app/spectekening.js', 'js/app/houtopties.js', 'js/app/offerte.js', 'js/app/varianten.js', 'js/app/uitvoering.js', 'js/app/configurator.js', 'js/app/schets.js', 'js/app/opstelling.js', 'js/app/koppeling.js', 'js/app/events.js'];
const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'];
const BUITEN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(APP).catch(() => { /* één bestand mist: de rest komt bij gebruik in de cache */ });
    await Promise.all(CDN.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const eigen = new URL(r.url).origin === location.origin;
  if (!eigen && !BUITEN.test(r.url)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const res = await fetch(r);
      if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await c.match(r, { ignoreSearch: true }) || (r.mode === 'navigate' ? await c.match('index.html') : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
