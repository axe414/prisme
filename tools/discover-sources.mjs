// Découverte de médias partout dans le monde.
// 1) On parcourt les éditions nationales de Google News (une soixantaine de pays, toutes rubriques)
//    seulement pour savoir QUELS médias existent dans chaque pays (Google ne choisit rien pour Prisme).
// 2) Pour chaque média trouvé, on cherche son propre flux RSS sur son site, et on vérifie qu'il est vivant.
// Résultat : data/sources-auto.json, lu par le collecteur. Reprise possible si on l'interrompt.
// Usage : node tools/discover-sources.mjs            (≈ 30 à 60 minutes)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { FEEDS } from "../lib/sources.mjs";

const OUT_DIR = new URL("../data/", import.meta.url);
const OUT = new URL("sources-auto.json", OUT_DIR);
mkdirSync(OUT_DIR, { recursive: true });
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// [pays, langue Google (hl), ceid, langue ISO]
const EDITIONS = [
  ["CA", "fr-CA", "CA:fr", "fr"], ["CA", "en-CA", "CA:en", "en"], ["US", "en-US", "US:en", "en"], ["US", "es-419", "US:es-419", "es"],
  ["MX", "es-419", "MX:es-419", "es"], ["AR", "es-419", "AR:es-419", "es"], ["CO", "es-419", "CO:es-419", "es"], ["CL", "es-419", "CL:es-419", "es"],
  ["PE", "es-419", "PE:es-419", "es"], ["VE", "es-419", "VE:es-419", "es"], ["CU", "es-419", "CU:es-419", "es"], ["BR", "pt-BR", "BR:pt-419", "pt"],
  ["GB", "en-GB", "GB:en", "en"], ["IE", "en-IE", "IE:en", "en"], ["FR", "fr", "FR:fr", "fr"], ["BE", "fr", "BE:fr", "fr"], ["BE", "nl", "BE:nl", "nl"],
  ["CH", "fr", "CH:fr", "fr"], ["CH", "de", "CH:de", "de"], ["DE", "de", "DE:de", "de"], ["AT", "de", "AT:de", "de"], ["ES", "es", "ES:es", "es"],
  ["PT", "pt-PT", "PT:pt-150", "pt"], ["IT", "it", "IT:it", "it"], ["NL", "nl", "NL:nl", "nl"], ["SE", "sv", "SE:sv", "sv"], ["NO", "no", "NO:no", "no"],
  ["PL", "pl", "PL:pl", "pl"], ["CZ", "cs", "CZ:cs", "cs"], ["SK", "sk", "SK:sk", "sk"], ["HU", "hu", "HU:hu", "hu"], ["RO", "ro", "RO:ro", "ro"],
  ["BG", "bg", "BG:bg", "bg"], ["GR", "el", "GR:el", "el"], ["RS", "sr", "RS:sr", "sr"], ["SI", "sl", "SI:sl", "sl"], ["LV", "lv", "LV:lv", "lv"],
  ["LT", "lt", "LT:lt", "lt"], ["UA", "uk", "UA:uk", "uk"], ["RU", "ru", "RU:ru", "ru"], ["TR", "tr", "TR:tr", "tr"], ["IL", "he", "IL:he", "he"],
  ["IL", "en-IL", "IL:en", "en"], ["EG", "ar", "EG:ar", "ar"], ["SA", "ar", "SA:ar", "ar"], ["AE", "ar", "AE:ar", "ar"], ["LB", "ar", "LB:ar", "ar"],
  ["MA", "fr", "MA:fr", "fr"], ["SN", "fr", "SN:fr", "fr"], ["NG", "en-NG", "NG:en", "en"], ["KE", "en-KE", "KE:en", "en"], ["ZA", "en-ZA", "ZA:en", "en"],
  ["GH", "en-GH", "GH:en", "en"], ["ET", "en-ET", "ET:en", "en"], ["TZ", "en-TZ", "TZ:en", "en"], ["UG", "en-UG", "UG:en", "en"], ["ZW", "en-ZW", "ZW:en", "en"],
  ["IN", "en-IN", "IN:en", "en"], ["IN", "hi", "IN:hi", "hi"], ["PK", "en-PK", "PK:en", "en"], ["BD", "bn", "BD:bn", "bn"], ["JP", "ja", "JP:ja", "ja"],
  ["KR", "ko", "KR:ko", "ko"], ["CN", "zh-CN", "CN:zh-Hans", "zh"], ["TW", "zh-TW", "TW:zh-Hant", "zh"], ["HK", "zh-HK", "HK:zh-Hant", "zh"],
  ["SG", "en-SG", "SG:en", "en"], ["MY", "en-MY", "MY:en", "en"], ["ID", "id", "ID:id", "id"], ["PH", "en-PH", "PH:en", "en"], ["TH", "th", "TH:th", "th"],
  ["VN", "vi", "VN:vi", "vi"], ["AU", "en-AU", "AU:en", "en"], ["NZ", "en-NZ", "NZ:en", "en"],
];
const TOPICS = ["", "WORLD", "NATION", "BUSINESS", "TECHNOLOGY", "SCIENCE", "HEALTH", "SPORTS", "ENTERTAINMENT"];

const state = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { builtAt: null, editionsDone: [], candidates: {}, sources: {}, failed: {} };
const save = () => { state.builtAt = new Date().toISOString(); writeFileSync(OUT, JSON.stringify(state)); };
const host = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\d?\./, "").replace(/^m\./, ""); } catch { return null; } };
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function get(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8" } });
    const text = res.ok ? (await res.text()).slice(0, 600000) : "";
    return { ok: res.ok, status: res.status, url: res.url, text };
  } catch { return { ok: false, status: 0, url, text: "" }; } finally { clearTimeout(t); }
}

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const x = list[i++]; await fn(x); } }));
}

// ---------- 1) Annuaire des médias par pays ----------
const known = new Set(Object.keys(FEEDS));
const editions = EDITIONS.filter(([cc, hl, ceid]) => !state.editionsDone.includes(ceid));
console.log(`Éditions à parcourir : ${editions.length}`);
await pool(editions, 3, async ([cc, hl, ceid, lang]) => {
  let found = 0;
  for (const topic of TOPICS) {
    const url = `https://news.google.com/rss${topic ? `/headlines/section/topic/${topic}` : ""}?hl=${hl}&gl=${cc}&ceid=${ceid}`;
    const r = await get(url, 10000);
    for (const m of r.text.matchAll(/<source url="([^"]+)">([^<]*)<\/source>/g)) {
      const d = host(m[1]);
      if (!d || known.has(d)) continue;
      const c = state.candidates[d] || (state.candidates[d] = { name: decode(m[2]).trim(), home: m[1], cc, lang, hits: 0 });
      c.hits++;
      found++;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  state.editionsDone.push(ceid);
  console.log(`  ${ceid} : ${found} mentions, ${Object.keys(state.candidates).length} médias au total`);
  save();
});

// ---------- 2) Le flux RSS de chaque média, trouvé sur son propre site ----------
const FEED_TYPES = /application\/(rss|atom)\+xml|application\/xml|text\/xml/i;
function feedLinks(html, base) {
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag) || !FEED_TYPES.test(tag)) continue;
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href || /comments|commentaires/i.test(href)) continue;
    try { out.push(new URL(decode(href), base).href); } catch { /* lien invalide */ }
  }
  return [...new Set(out)];
}
function alive(xml) {
  const items = (xml.match(/<(item|entry)[\s>]/g) || []).length;
  if (items < 4) return null;
  const dates = [...xml.matchAll(/<(pubDate|dc:date|published|updated)>([^<]+)</g)].map((m) => Date.parse(m[2])).filter(Boolean);
  const newest = dates.length ? Math.max(...dates) : 0;
  if (!newest || Date.now() - newest > 4 * 864e5) return null; // rien depuis 4 jours : flux mort
  return { items, newestH: Math.round((Date.now() - newest) / 36e5) };
}

const todo = Object.entries(state.candidates).filter(([d]) => !state.sources[d] && !state.failed[d]).sort((a, b) => b[1].hits - a[1].hits);
console.log(`\nMédias à examiner : ${todo.length}`);
let done = 0;
await pool(todo, 24, async ([d, c]) => {
  const tries = [];
  const home = await get(`https://${d}/`, 8000);
  if (home.text) tries.push(...feedLinks(home.text, home.url || `https://${d}/`));
  tries.push(`https://${d}/feed`, `https://${d}/rss`, `https://${d}/rss.xml`, `https://${d}/feed.xml`);
  let ok = null;
  for (const u of [...new Set(tries)].slice(0, 6)) {
    const r = await get(u, 7000);
    const a = r.ok && alive(r.text);
    if (a) { ok = { feed: r.url || u, ...a }; break; }
  }
  if (ok) state.sources[d] = { name: c.name, cc: c.cc, lang: c.lang, hits: c.hits, feed: ok.feed, items: ok.items };
  else state.failed[d] = 1;
  if (++done % 50 === 0) { save(); console.log(`  ${done}/${todo.length} examinés · ${Object.keys(state.sources).length} flux trouvés`); }
});
save();
const by = Object.values(state.sources).reduce((m, s) => ((m[s.cc] = (m[s.cc] || 0) + 1), m), {});
console.log(`\nTerminé : ${Object.keys(state.sources).length} médias avec un flux vivant, dans ${Object.keys(by).length} pays.`);
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · "));
