const CACHE='masroofi-v34-cache-20260702-0115';
const ASSETS=['./','./index.html?v=3.4','./style.css?v=3.4','./app.js?v=3.4','./manifest.json?v=3.4','./icon-v5.svg?v=3.4','./icon-180.png?v=3.4','./icon-512.png?v=3.4'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET') return; e.respondWith(fetch(e.request).then(r=>{ const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{}); return r; }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html?v=3.4')||caches.match('./index.html')))); });
