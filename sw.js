/* Keeps kK working when the Wi-Fi drops: serve the saved copy, and refresh it whenever the phone is online.
   Only handles this site's own files. MLB's live feed and stats always go straight to the network. */
const CACHE = "kk-baseball-v4";
const FILES = ["./", "./?source=app", "index.html", "kk-app.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "icon-maskable-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match("index.html")))
  );
});
