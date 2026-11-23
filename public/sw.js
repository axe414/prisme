// Service worker de Prisme : réseau d'abord (toujours la version fraîche), cache en secours (hors ligne).
const CACHE = "prisme-v60";
// Les données (éditions, villes, logos) dans une réserve à part, qui survit aux mises à jour de l'app :
// sans réseau (chalet, bois), les dernières nouvelles déjà chargées restent lisibles.
const DATA = "prisme-data-v1";
const SHELL = ["./", "index.html", "app.js", "i18n.js", "styles.css", "favicon.svg", "manifest.webmanifest", "icons/icon-192.png", "villes.json"];
const SLOW_MS = 7000; // réseau très lent : après ce délai, on sert la copie gardée (s'il y en a une)

self.addEventListener("install", (e) => {
  // « reload » : on prend la toute dernière version, pas une copie gardée par le navigateur.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// L'index de recherche change de dossier à chaque passage du robot (data/s/<passage>/…) :
// on ne garde que le plus récent, sinon la réserve grossirait sans fin.
let lastBuild = "";
async function pruneSearch(build) {
  if (!build || build === lastBuild) return;
  lastBuild = build;
  const c = await caches.open(DATA);
  for (const req of await c.keys()) {
    const m = new URL(req.url).pathname.match(/\/data\/s\/([^/]+)\//);
    if (m && m[1] !== build) await c.delete(req);
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const isNav = e.request.mode === "navigate";
  const isData = url.pathname.includes("/data/");
  const isShell = !isNav && SHELL.some((p) => url.pathname.endsWith(p.replace("./", "/")));
  // Une page ouverte (avec ou sans « ?h=… ») : une seule copie de secours, « index.html ».
  const cacheKey = isNav ? "index.html" : e.request.url;

  e.respondWith((async () => {
    // (Une page qu'on ouvre ne peut pas recevoir d'options : le navigateur la revérifie déjà.)
    const net = (isNav ? fetch(e.request) : fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }))
      .then((res) => {
        if (res.ok && (isData || isShell)) {
          const copy = res.clone();
          caches.open(isData ? DATA : CACHE).then((c) => c.put(cacheKey, copy)).then(() => {
            const m = url.pathname.match(/\/data\/s\/([^/]+)\//);
            if (m) return pruneSearch(m[1]);
          }).catch(() => {});
        }
        return res;
      });
    net.catch(() => {}); // (l'échec est traité plus bas ; ceci évite une erreur « non attrapée » après le délai)
    try {
      // Réseau très lent : la copie gardée d'abord, pendant que le réseau continue en arrière-plan.
      const first = await Promise.race([net, new Promise((r) => setTimeout(r, SLOW_MS, null))]);
      if (first) return first;
      const hit = await caches.match(cacheKey);
      return hit || (await net);
    } catch {
      const hit = await caches.match(cacheKey);
      return hit || (isNav ? (await caches.match("index.html")) || Response.error() : Response.error());
    }
  })());
});

// Toucher une alerte ouvre l'app.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow("./"))));
});
