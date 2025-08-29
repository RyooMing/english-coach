// service-worker.js
const CACHE_NAME = 'engcoach-v5';   // 새 버전명
const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const pathname = url.pathname.split('/').pop(); // 파일명만 추출해서 비교
  if (ASSETS.includes(pathname)) {
    e.respondWith(caches.match(pathname).then(r => r || fetch(e.request)));
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match('index.html')));
});
