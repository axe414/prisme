// Serveur local : sert l'app (public/) et calcule en direct les fichiers d'édition (data/*.json),
// exactement comme le robot GitHub les publie en ligne. Rien à installer.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = import.meta.dirname;
process.chdir(root);
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2]) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}

const { getIndex } = await import("./lib/ingest.mjs");
const { buildStories, editionFile, articlesFile, mondeLookup, REGIONS } = await import("./lib/edition.mjs");
const { allVideos } = await import("./lib/videos.mjs");
const { directory } = await import("./lib/media-db.mjs");

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".json": "application/json; charset=utf-8" };
const port = Number(process.env.PORT) || 8888;

// Mémoire utilisée, notée toutes les 5 minutes (pour surveiller la lecture de milliers de flux).
setInterval(() => {
  const m = process.memoryUsage();
  console.log(`${new Date().toLocaleTimeString("fr-CA")}  mémoire : ${Math.round(m.heapUsed / 1e6)} Mo utilisés / ${Math.round(m.rss / 1e6)} Mo au total`);
}, 5 * 60e3).unref();

/* ---------- Éditions calculées en direct (une génération à la fois) ---------- */
let gen = { stamp: null, monde: null, files: new Map() };
let lastFiles = new Map(); // dernière version prête de chaque édition (servie pendant un recalcul)
async function editionJson(region) {
  const index = await getIndex();
  if (gen.stamp !== index.fetchedAt) gen = { stamp: index.fetchedAt, monde: null, files: new Map() };
  const g = gen;
  if (!g.files.has(region)) {
    const job = (async () => {
      await new Promise((ok) => setTimeout(ok, 0));
      if (!g.monde) g.monde = mondeLookup(buildStories(index, "monde"));
      const body = JSON.stringify(editionFile(index, buildStories(index, region), g.monde));
      lastFiles.set(region, body);
      job.done = true;
      return body;
    })();
    g.files.set(region, job);
    job.catch(() => g.files.delete(region));
  }
  const job = g.files.get(region);
  // Pendant un recalcul, on sert la version précédente tout de suite.
  const prev = lastFiles.get(region);
  return prev && !job.done ? prev : job;
}
// Préparation d'avance de toutes les éditions, dès que de nouveaux articles arrivent.
let warming = false;
async function warmUp() {
  if (warming) return;
  warming = true;
  try { for (const r of REGIONS) { await editionJson(r); await (gen.files.get(r) || Promise.resolve()); } } catch { /* on réessaiera */ } finally { warming = false; }
}
setTimeout(warmUp, 3000);
setInterval(warmUp, 60e3).unref();

let videosCache = { at: 0, body: null };
async function dataFile(name) {
  const m = name.match(/^edition-([a-z]+)\.json$/);
  if (m && REGIONS.includes(m[1])) return editionJson(m[1]);
  const a = name.match(/^articles-([a-z]+)\.json$/);
  if (a && REGIONS.includes(a[1])) return JSON.stringify(articlesFile(await getIndex(), a[1]));
  if (name === "videos.json") {
    if (!videosCache.body || Date.now() - videosCache.at > 30 * 60e3) videosCache = { at: Date.now(), body: JSON.stringify({ builtAt: new Date().toISOString(), videos: await allVideos() }) };
    return videosCache.body;
  }
  if (name === "directory.json") return JSON.stringify({ media: directory() });
  if (name === "summaries.json") { try { return readFileSync(join(root, ".data", "summaries.json"), "utf8"); } catch { return "{}"; } }
  if (name === "meta.json") { const i = await getIndex(); return JSON.stringify({ builtAt: new Date().toISOString(), articles: i.articles.length }); }
  return null;
}

const browser = (ua = "") => (ua.match(/(Edg|OPR|Firefox|Chrome|Safari)\/[\d.]+/) || ["?"])[0];

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const t0 = Date.now();
  res.on("finish", () => {
    if (url.pathname !== "/__log") console.log(`${new Date().toLocaleTimeString("fr-CA")}  ${res.statusCode}  ${req.method} ${url.pathname}${url.search}  ${Date.now() - t0} ms  [${browser(req.headers["user-agent"])}]`);
  });
  try {
    if (url.pathname === "/__log" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      console.log(`  NAVIGATEUR [${browser(req.headers["user-agent"])}] ${body.slice(0, 2000)}`);
      res.writeHead(204).end();
      return;
    }
    if (url.pathname.startsWith("/data/")) {
      const body = await dataFile(url.pathname.slice(6));
      if (body == null) { res.writeHead(404).end("Introuvable"); return; }
      res.writeHead(200, { "content-type": types[".json"], "cache-control": "no-store" }).end(body);
      return;
    }
    const rel = normalize(decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)).replace(/^([/\\])+/, "");
    const file = join(root, "public", rel);
    if (!file.startsWith(join(root, "public"))) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch (e) {
    if (e.code === "ENOENT") { res.writeHead(404).end("Introuvable"); return; }
    console.error(e);
    res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "server", message: String(e.message || e) }));
  }
}).listen(port, () => console.log(`Prisme tourne sur http://localhost:${port}`));
