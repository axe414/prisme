// Service worker de Prisme : réseau d'abord (toujours la version fraîche), cache en secours (hors ligne).
const CACHE = "prisme-v11";
const SHELL = ["./", "index.html", "app.js", "i18n.js", "styles.css", "favicon.svg", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  // « reload » : on prend la toute dernière version, pas une copie gardée par le navigateur.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Les pages et les éditions : réseau d'abord (en revérifiant toujours s'il y a du nouveau), copie gardée pour le mode hors ligne.
  e.respondWith(
    // (Une page qu'on ouvre ne peut pas recevoir d'options : le navigateur la revérifie déjà.)
    (e.request.mode === "navigate" ? fetch(e.request) : fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }))
      .then((res) => {
        if (res.ok && (url.pathname.includes("/data/") || SHELL.some((p) => url.pathname.endsWith(p.replace("./", "/"))))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});

// Toucher une alerte ouvre l'app.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow("./"))));
});
