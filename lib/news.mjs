// Recherche Google News : sert seulement à « Élargir à tout le web » (le fil principal vient des médias eux-mêmes).
import { fetchWithTimeout } from "./http.mjs";
import { cleanDomain, domainForName, mediaSummary } from "./media-db.mjs";

export const EDITIONS = {
  "fr-CA": { hl: "fr-CA", gl: "CA", ceid: "CA:fr" },
  "en-CA": { hl: "en-CA", gl: "CA", ceid: "CA:en" },
  "fr-FR": { hl: "fr", gl: "FR", ceid: "FR:fr" },
  "en-US": { hl: "en-US", gl: "US", ceid: "US:en" },
  "en-GB": { hl: "en-GB", gl: "GB", ceid: "GB:en" },
};
export const REGIONS = {
  qc: ["fr-CA"],
  ca: ["fr-CA", "en-CA"],
  fr: ["fr-FR"],
  us: ["en-US"],
  uk: ["en-GB"],
  monde: Object.keys(EDITIONS),
};
export const PERIOD_DAYS = { "1d": 1, "7d": 7, "30d": 30 };

export const decode = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]).trim() : "";
};

const stripSource = (title, source) => (source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title);
const iso = (s) => { const d = new Date(s); return isNaN(d) ? null : d.toISOString(); };

const editionUrl = (path, ed, extra = "") => {
  const e = EDITIONS[ed];
  return `https://news.google.com/rss${path}?${extra}hl=${e.hl}&gl=${e.gl}&ceid=${e.ceid}`;
};

// Un <item> Google News : l'article principal, plus (pour les manchettes) la liste d'articles liés du même sujet.
function parseItem(it, edition) {
  const src = it.match(/<source url="([^"]+)">([\s\S]*?)<\/source>/);
  const sourceName = src ? decode(src[2]).trim() : "";
  const main = {
    title: stripSource(tag(it, "title"), sourceName),
    url: tag(it, "link"),
    published: iso(tag(it, "pubDate")),
    sourceName,
    domain: cleanDomain(src ? src[1] : ""),
    image: null,
    provider: "google",
    edition,
  };
  const desc = tag(it, "description");
  const related = [...desc.matchAll(/<li>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<font[^>]*>([\s\S]*?)<\/font>/g)].map((m) => ({
    title: decode(m[2]).trim(),
    url: m[1],
    published: null,
    sourceName: decode(m[3]).trim(),
    domain: "",
    image: null,
    provider: "google",
    edition,
  }));
  return { main, related };
}

async function getFeed(url, ms) {
  const res = await fetchWithTimeout(url, {}, ms);
  if (!res.ok) throw new Error(`Google News ${res.status}`);
  return res.text();
}

export async function googleSearch(q, ed, days, ms) {
  const xml = await getFeed(editionUrl("/search", ed, `q=${encodeURIComponent(`${q} when:${days}d`)}&`), ms);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => parseItem(m[1], ed).main);
}

// Complète domaine et fiche média. `names` associe des noms de médias vus dans les flux à leur domaine.
export function annotate(a, names = new Map()) {
  const domain = a.domain || names.get(a.sourceName.toLowerCase()) || domainForName(a.sourceName) || "";
  const media = mediaSummary(domain);
  return { ...a, domain, sourceName: a.sourceName || media.name || domain, media };
}
