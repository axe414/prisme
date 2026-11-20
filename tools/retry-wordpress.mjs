// Deuxième chance pour les médias dont le fil RSS est mort ou introuvable : s'ils tournent sous WordPress,
// on lit leur API (/wp-json/wp/v2/posts), souvent à jour même quand le fil RSS ne l'est plus.
// Usage : node tools/retry-wordpress.mjs liste.json   (liste de [domaine, nom, région, langue])
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const localFile = join(ROOT, "data", "sources-local.json");
const local = JSON.parse(readFileSync(localFile, "utf8"));
const list = JSON.parse(readFileSync(process.argv[2], "utf8")).filter(([d]) => !local.sources[d]);
const FIELDS = "per_page=40&_fields=date_gmt,link,title,excerpt,jetpack_featured_media_url";

async function tryWp(domain) {
  for (const host of [`www.${domain.replace(/^www\./, "")}`, domain]) {
    const url = `https://${host}/wp-json/wp/v2/posts?${FIELDS}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (!Array.isArray(j) || j.length < 3) continue;
      const last = Math.max(...j.map((p) => Date.parse(p.date_gmt ? `${p.date_gmt}Z` : 0)).filter(Boolean));
      if (Date.now() - last < 21 * 864e5) return url;
    } catch { /* suivant */ }
  }
  return null;
}
let i = 0, ok = 0;
await Promise.all(Array.from({ length: 12 }, async () => {
  while (i < list.length) {
    const [d, name, region, lang] = list[i++];
    const feed = await tryWp(d);
    if (feed) { local.sources[d] = { name, cc: "CA", lang: lang || "fr", feed, region: region || "" }; ok++; console.log(`✓ ${name} (${d})`); }
  }
}));
writeFileSync(localFile, JSON.stringify(local, null, 1));
console.log(`\n${ok} médias récupérés par WordPress sur ${list.length}. Total : ${Object.keys(local.sources).length}.`);
