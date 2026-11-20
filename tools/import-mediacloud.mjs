// Importe les médias locaux du répertoire Media Cloud (projet universitaire libre : search.mediacloud.org).
// Media Cloud sert seulement de répertoire (quels médias existent, et leurs flux) : Prisme lit ensuite chaque média
// directement, par son propre flux RSS, vérifié un à un. Écrit data/sources-mediacloud.json.
// La clé (gratuite) se met dans .env : MEDIACLOUD_API_KEY=...  — elle n'est jamais publiée.
// Usage : node tools/import-mediacloud.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const l of readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && m[2]) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "").replace(/^﻿/, "").trim();
}
const KEY = process.env.MEDIACLOUD_API_KEY;
if (!KEY) { console.log("Il manque MEDIACLOUD_API_KEY dans .env"); process.exit(1); }
const H = { Authorization: `Token ${KEY}`, Accept: "application/json" };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const wait = (ms) => new Promise((o) => setTimeout(o, ms));
async function mc(path) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`https://search.mediacloud.org/api/${path}`, { headers: H, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await wait(5000 * (t + 1)); continue; }
      if (r.ok) return r.json();
    } catch { await wait(2000); }
  }
  return null;
}
async function allSources(collectionId) {
  const out = [];
  for (let offset = 0; offset < 20000; offset += 100) {
    const j = await mc(`sources/sources/?collection_id=${collectionId}&limit=100&offset=${offset}`);
    if (!j?.results?.length) break;
    out.push(...j.results);
    if (!j.next) break;
  }
  return out;
}
const PROV_FR = { Quebec: "Québec", Ontario: "Ontario", "British Columbia": "Colombie-Britannique", Alberta: "Alberta", Saskatchewan: "Saskatchewan", Manitoba: "Manitoba",
  "Nova Scotia": "Nouvelle-Écosse", "New Brunswick": "Nouveau-Brunswick", "Newfoundland and Labrador": "Terre-Neuve-et-Labrador", "Prince Edward Island": "Île-du-Prince-Édouard" };

// 1) Les collections : Canada (provinces, puis tout le reste), Royaume-Uni, États-Unis (les plus actifs de chaque État).
const picks = new Map(); // domaine → { name, cc, region, lang, sourceId, spw }
const host = (u) => { try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } };
const add = (s, cc, region, rotate = false) => {
  const d = host(s.homepage || s.name);
  if (!d || picks.has(d)) return;
  // Média encore actif (dernier article ce mois-ci ou le mois passé).
  const [mm, yy] = String(s.last_story || "").split("/").map(Number);
  const now = new Date();
  const months = (now.getFullYear() - yy) * 12 + (now.getMonth() + 1 - mm);
  if (!yy || months > 1) return;
  picks.set(d, { name: s.label || s.name, cc, region, lang: s.primary_language === "fr" ? "fr" : "en", sourceId: s.id, spw: s.stories_per_week || 0, rotate });
};
const colls = async (name) => (await mc(`sources/collections/?name=${encodeURIComponent(name)}&limit=100`))?.results || [];
for (const c of await colls("Canada - State & Local")) {
  const m = c.name.match(/^(.+), Canada - State & Local$/);
  if (m) for (const s of await allSources(c.id)) add(s, "CA", PROV_FR[m[1]] || m[1]);
}
for (const name of ["Canada - State & Local", "Canada - National"]) for (const c of (await colls(name)).filter((x) => x.name === name)) for (const s of await allSources(c.id)) add(s, "CA", name.includes("National") ? "Canada" : "");
for (const name of ["United Kingdom - State & Local", "United Kingdom - National"]) for (const c of (await colls(name)).filter((x) => x.name === name)) for (const s of await allSources(c.id)) add(s, "GB", "Royaume-Uni");
console.log(`Canada et Royaume-Uni : ${picks.size} médias actifs`);
const states = (await colls("United States - State & Local")).filter((c) => /^.+, United States ?- ?State & Local$/.test(c.name));
for (const c of states) {
  const st = c.name.split(",")[0];
  // Les 30 plus actifs de chaque État sont lus à chaque passage ; tous les autres, en rotation (un tiers par passage).
  const list = (await allSources(c.id)).sort((a, b) => (b.stories_per_week || 0) - (a.stories_per_week || 0));
  list.forEach((s, k) => add(s, "US", st, k >= 30));
}
for (const c of (await colls("United States - National")).filter((x) => x.name === "United States - National")) for (const s of await allSources(c.id)) add(s, "US", "États-Unis");
console.log(`Avec les États-Unis : ${picks.size} médias actifs`);

// 2) On retire ceux que Prisme lit déjà.
const known = new Set();
for (const m of readFileSync(join(ROOT, "lib", "sources.mjs"), "utf8").matchAll(/^\s+"([a-z0-9.-]+)":\s*\[/gm)) known.add(m[1]);
for (const f of ["sources-auto.json", "sources-local.json"]) {
  const p = join(ROOT, "data", f);
  if (existsSync(p)) for (const d of Object.keys(JSON.parse(readFileSync(p, "utf8")).sources || {})) known.add(d);
}
const todo = [...picks.entries()].filter(([d]) => !known.has(d));
console.log(`${todo.length} nouveaux à vérifier`);

// 3) Leurs flux (répertoire Media Cloud), vérifiés : au moins 3 articles, le plus récent de moins de 21 jours.
const get = async (url) => { const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(r.status); return r.text(); };
const okFeed = (xml) => {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) return false;
  const items = (xml.match(/<(item|entry)[\s>]/gi) || []).length;
  const dates = [...xml.matchAll(/<(pubDate|published|updated|dc:date)>([^<]+)</gi)].map((m) => Date.parse(m[2])).filter(Boolean);
  return items >= 3 && dates.length && Date.now() - Math.max(...dates) < 21 * 864e5;
};
const out = {};
let i = 0, done = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (i < todo.length) {
    const [d, p] = todo[i++];
    const feeds = ((await mc(`sources/feeds/?source_id=${p.sourceId}`))?.results || []).filter((f) => f.admin_rss_enabled !== false).map((f) => f.url);
    for (const u of feeds.slice(0, 4)) {
      try { if (okFeed(await get(u))) { out[d] = { name: p.name, cc: p.cc, lang: p.lang, feed: u, region: p.region, ...(p.rotate ? { rotate: true } : {}) }; break; } } catch { /* suivant */ }
    }
    if (++done % 200 === 0) console.log(`${done}/${todo.length} vérifiés · ${Object.keys(out).length} valides`);
  }
}));
writeFileSync(join(ROOT, "data", "sources-mediacloud.json"), JSON.stringify({ builtAt: new Date().toISOString(), sources: out }, null, 1));
const by = {};
for (const x of Object.values(out)) by[x.cc] = (by[x.cc] || 0) + 1;
console.log(`\n${Object.keys(out).length} médias valides ajoutés`, by);
