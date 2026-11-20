// Ajoute une liste de médias candidats (fichier JSON) aux médias locaux, après avoir vérifié leur flux RSS.
// Format : [{ "site": "https://...", "name": "...", "placeName": "Victoriaville" }]  (placeName facultatif)
// Usage : node tools/add-local.mjs candidats.json
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const fold = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const villes = JSON.parse(readFileSync(join(ROOT, "public", "villes.json"), "utf8"));
const byName = new Map();
for (const v of villes) if (!byName.has(fold(v.n))) byName.set(fold(v.n), v);

const localFile = join(ROOT, "data", "sources-local.json");
const local = JSON.parse(readFileSync(localFile, "utf8"));
const known = new Set(Object.keys(local.sources));
for (const m of readFileSync(join(ROOT, "lib", "sources.mjs"), "utf8").matchAll(/^\s+"([a-z0-9.-]+)":\s*\[/gm)) known.add(m[1]);
for (const f of ["sources-auto.json", "sources-mediacloud.json"]) { try { for (const d of Object.keys(JSON.parse(readFileSync(join(ROOT, "data", f), "utf8")).sources)) known.add(d); } catch { /* absent */ } }

const get = async (url) => { const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(r.status); return r.text(); };
const okFeed = (xml) => {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) return false;
  const items = (xml.match(/<(item|entry)[\s>]/gi) || []).length;
  const dates = [...xml.matchAll(/<(pubDate|published|updated|dc:date)>([^<]+)</gi)].map((m) => Date.parse(m[2])).filter(Boolean);
  return items >= 3 && dates.length && Date.now() - Math.max(...dates) < 21 * 864e5;
};
async function discover(domain) {
  const tries = [];
  try {
    const html = await get(`https://${domain}/`);
    for (const m of html.matchAll(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*>/gi)) {
      const href = (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
      if (href && !/comments?\/feed|\/comments/i.test(href)) tries.push(new URL(href.replace(/&amp;/g, "&"), `https://${domain}/`).href);
    }
  } catch { /* adresses habituelles */ }
  tries.push(`https://${domain}/feed/`, `https://${domain}/rss`, `https://${domain}/rss.xml`, `https://www.${domain}/feed/`);
  for (const u of [...new Set(tries)].slice(0, 7)) { try { if (okFeed(await get(u))) return u; } catch { /* suivant */ } }
  return null;
}

const cands = JSON.parse(readFileSync(process.argv[2], "utf8"));
const todo = [];
for (const c of cands) {
  let d;
  try { d = new URL(c.site).hostname.replace(/^www\./, "").toLowerCase(); } catch { continue; }
  if (known.has(d) || todo.some((t) => t.d === d)) continue;
  const v = c.placeName ? byName.get(fold(c.placeName)) : null;
  todo.push({ d, name: c.name, region: v ? v.r : "", lang: c.lang === "en" ? "en" : "fr", cc: "CA" });
}
let i = 0, ok = 0;
await Promise.all(Array.from({ length: 12 }, async () => {
  while (i < todo.length) {
    const t = todo[i++];
    const feed = await discover(t.d);
    if (feed) { local.sources[t.d] = { name: t.name, cc: t.cc, lang: t.lang, feed, region: t.region }; ok++; console.log(`✓ ${t.name} (${t.d})`); }
  }
}));
local.builtAt = new Date().toISOString();
writeFileSync(localFile, JSON.stringify(local, null, 1));
console.log(`\n${ok} médias ajoutés sur ${todo.length} nouveaux candidats. Total des médias locaux : ${Object.keys(local.sources).length}.`);
