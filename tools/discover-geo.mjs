// Découvre les médias locaux ville par ville, grâce aux pages « nouvelles locales » de Google Nouvelles.
// Google Nouvelles sert seulement à savoir QUELS médias couvrent chaque ville : Prisme lit ensuite ces médias
// directement, par leurs propres flux RSS (vérifiés un à un). Les nouveaux médias s'ajoutent à data/sources-local.json.
// Usage : node tools/discover-geo.mjs   (long : quelques secondes par ville)
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const wait = (ms) => new Promise((o) => setTimeout(o, ms));
const villes = JSON.parse(readFileSync(join(ROOT, "public", "villes.json"), "utf8"));

// Les villes à explorer : Québec (2 000 habitants et plus), reste du Canada, grandes villes des États-Unis et du Royaume-Uni.
const usList = [];
for (const m of "New York|NY,Los Angeles|CA,Chicago|IL,Houston|TX,Phoenix|AZ,Philadelphia|PA,San Antonio|TX,San Diego|CA,Dallas|TX,Jacksonville|FL,Austin|TX,Fort Worth|TX,San Jose|CA,Columbus|OH,Charlotte|NC,Indianapolis|IN,San Francisco|CA,Seattle|WA,Denver|CO,Oklahoma City|OK,Nashville|TN,Washington|DC,El Paso|TX,Las Vegas|NV,Boston|MA,Detroit|MI,Portland|OR,Louisville|KY,Memphis|TN,Baltimore|MD,Milwaukee|WI,Albuquerque|NM,Tucson|AZ,Fresno|CA,Sacramento|CA,Atlanta|GA,Kansas City|MO,Colorado Springs|CO,Omaha|NE,Raleigh|NC,Miami|FL,Virginia Beach|VA,Oakland|CA,Minneapolis|MN,Tulsa|OK,Tampa|FL,Wichita|KS,New Orleans|LA,Cleveland|OH,Honolulu|HI,Orlando|FL,Lexington|KY,Saint Paul|MN,Cincinnati|OH,Pittsburgh|PA,Anchorage|AK,Buffalo|NY,Madison|WI,St. Louis|MO,Richmond|VA,Boise|ID,Spokane|WA,Des Moines|IA,Salt Lake City|UT,Birmingham|AL,Rochester|NY,Hartford|CT,Providence|RI,Albany|NY,Burlington|VT,Portland|ME,Manchester|NH,Charleston|SC,Jackson|MS,Little Rock|AR,Fargo|ND,Sioux Falls|SD,Billings|MT,Savannah|GA,Knoxville|TN,Grand Rapids|MI,Toledo|OH,Syracuse|NY,Worcester|MA,New Haven|CT".split(",")) {
  const [n, st] = m.split("|");
  usList.push({ n, q: `${n}, ${st}`, cc: "US", region: st, hl: "en-US", gl: "US", ceid: "US:en" });
}
const ukList = "London,Birmingham,Manchester,Glasgow,Liverpool,Leeds,Sheffield,Edinburgh,Bristol,Cardiff,Belfast,Leicester,Coventry,Bradford,Nottingham,Newcastle upon Tyne,Southampton,Portsmouth,Plymouth,Aberdeen,Swansea,Derby,Stoke-on-Trent,Wolverhampton,Brighton,Hull,Reading,Norwich,Oxford,Cambridge,York,Exeter,Dundee,Inverness,Bath,Ipswich,Milton Keynes,Sunderland,Preston,Luton"
  .split(",").map((n) => ({ n, q: `${n}, UK`, cc: "GB", region: "Royaume-Uni", hl: "en-GB", gl: "GB", ceid: "GB:en" }));
// « QCPETITES » : les municipalités du Québec de moins de 2 000 habitants (deuxième passage).
const SMALL = process.argv[2] === "QCPETITES";
const caList = villes.filter((v) => (SMALL ? v.pr === "QC" && v.p < 2000 : v.pr === "QC" ? v.p >= 2000 : true)).map((v) => ({
  n: v.n, q: v.pr === "QC" ? v.n : `${v.n}, ${v.pr}`, cc: "CA", region: v.r, hl: v.pr === "QC" ? "fr-CA" : "en-CA", gl: "CA", ceid: v.pr === "QC" ? "CA:fr" : "CA:en",
}));
const ONLY = process.argv[2]; // ex. « CA » pour ne faire que le Canada
const cities = SMALL ? caList : [...caList, ...usList, ...ukList].filter((c) => !ONLY || c.cc === ONLY);

// Déjà connus : médias de base, découverts, locaux.
const known = new Set();
for (const m of readFileSync(join(ROOT, "lib", "sources.mjs"), "utf8").matchAll(/^\s+"([a-z0-9.-]+)":\s*\[/gm)) known.add(m[1]);
const auto = JSON.parse(readFileSync(join(ROOT, "data", "sources-auto.json"), "utf8")).sources || {};
const localFile = join(ROOT, "data", "sources-local.json");
const local = JSON.parse(readFileSync(localFile, "utf8"));
for (const d of [...Object.keys(auto), ...Object.keys(local.sources)]) known.add(d);
const NOT_NEWS = /(google|facebook|youtube|instagram|twitter|x\.com|tiktok|linkedin|wikipedia|yahoo|msn\.com|apple\.com|amazon|iqair|weather|meteo|funeral|funerai|obituar|legacy\.com|dignitymemorial|zillow|realtor|kijiji|indeed|eventbrite|tripadvisor|yelp)/i;

// 1) Ville par ville : quels médias en parlent ?
const cand = new Map(); // domaine → { name, hits, cities:Set, region, cc, lang }
let done = 0;
for (const c of cities) {
  for (const url of [`https://news.google.com/rss/headlines/section/geo/${encodeURIComponent(c.q)}?hl=${c.hl}&gl=${c.gl}&ceid=${c.ceid}`]) {
    let xml = "";
    for (let t = 0; t < 3 && !xml; t++) {
      try { const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }); if (r.status === 429) { await wait(20000); continue; } xml = await r.text(); }
      catch { await wait(3000); }
    }
    const counts = new Map();
    for (const m of xml.matchAll(/<source url="([^"]+)">([^<]+)<\/source>/g)) {
      let d; try { d = new URL(m[1]).hostname.replace(/^www\./, "").toLowerCase(); } catch { continue; }
      if (known.has(d) || NOT_NEWS.test(d)) continue;
      const x = counts.get(d) || { name: m[2].replace(/&amp;/g, "&"), n: 0 };
      x.n++;
      counts.set(d, x);
    }
    for (const [d, x] of counts) {
      if (x.n < 2) continue; // au moins 2 articles sur la ville
      const e = cand.get(d) || { name: x.name, hits: 0, cities: new Set(), region: c.region, cc: c.cc, lang: c.hl.slice(0, 2) };
      e.hits += x.n; e.cities.add(c.n);
      cand.set(d, e);
    }
  }
  if (++done % 25 === 0) console.log(`${done}/${cities.length} villes · ${cand.size} médias candidats`);
  await wait(700);
}
console.log(`${cand.size} médias candidats`);

// 2) On vérifie le flux RSS de chacun.
const get = async (url) => { const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(r.status); return r.text(); };
function checkFeed(xml) {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) return null;
  const items = xml.match(/<(item|entry)[\s>]/gi) || [];
  const dates = [...xml.matchAll(/<(pubDate|published|updated|dc:date)>([^<]+)</gi)].map((m) => Date.parse(m[2])).filter(Boolean);
  const last = dates.length ? Math.max(...dates) : 0;
  return items.length >= 3 && last && Date.now() - last < 21 * 864e5 ? true : null;
}
async function discover(domain) {
  const tries = [];
  try {
    const html = await get(`https://${domain}/`);
    for (const m of html.matchAll(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*>/gi)) {
      const href = (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
      if (href && !/comments?\/feed|\/comments/i.test(href)) tries.push(new URL(href.replace(/&amp;/g, "&"), `https://${domain}/`).href);
    }
  } catch { /* adresses habituelles */ }
  tries.push(`https://${domain}/feed/`, `https://${domain}/rss`, `https://${domain}/rss.xml`, `https://www.${domain}/feed/`, `https://www.${domain}/rss.xml`);
  for (const u of [...new Set(tries)].slice(0, 7)) { try { if (checkFeed(await get(u))) return u; } catch { /* suivant */ } }
  return null;
}
const list = [...cand.entries()];
let ok = 0, i = 0;
await Promise.all(Array.from({ length: 14 }, async () => {
  while (i < list.length) {
    const [d, e] = list[i++];
    const feed = await discover(d);
    if (feed) {
      local.sources[d] = { name: e.name, cc: e.cc, lang: e.lang === "fr" ? "fr" : "en", feed, region: e.region, cities: [...e.cities].slice(0, 8) };
      ok++;
    }
  }
}));
local.builtAt = new Date().toISOString();
writeFileSync(localFile, JSON.stringify(local, null, 1));
console.log(`\n${ok} nouveaux médias locaux vérifiés (sur ${list.length} candidats). Total : ${Object.keys(local.sources).length}.`);
