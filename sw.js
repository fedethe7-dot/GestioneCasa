// Ad ogni aggiornamento dell'app aumenta questo numero
const CACHE = 'gestione-casa-v2';
const FILES = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // il foglio Google non passa dalla cache
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
