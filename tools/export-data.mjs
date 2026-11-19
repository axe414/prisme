// Exporte les données de Prisme dans des formats réutilisables (JSON et CSV) :
//   data/media.json, data/media.csv   — les médias connus : orientation, propriétaire, pays, type
//   data/feeds.csv                    — tous les flux lus par Prisme (base + découverts)
// Usage : node tools/export-data.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { MEDIA } from "../lib/media-db.mjs";
import { FEEDS } from "../lib/sources.mjs";

const out = (f) => new URL(`../data/${f}`, import.meta.url);
const csv = (rows) => rows.map((r) => r.map((v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(",")).join("\n") + "\n";
const LEAN = { "-2": "left", "-1": "center-left", "0": "center", "1": "center-right", "2": "right" };

const media = MEDIA.map((m) => ({
  name: m.name, domains: m.domains, country: m.country, type: m.type, owner: m.owner,
  bias: m.bias, leaning: m.bias === null ? "state" : LEAN[m.bias], state: m.state || null,
}));
writeFileSync(out("media.json"), JSON.stringify(media, null, 2) + "\n");
writeFileSync(out("media.csv"), csv([["name", "domain", "country", "type", "owner", "bias", "leaning", "state"],
  ...media.map((m) => [m.name, m.domains[0], m.country, m.type, m.owner, m.bias, m.leaning, m.state])]));

const auto = JSON.parse(readFileSync(out("sources-auto.json"), "utf8")).sources || {};
const feeds = [
  ...Object.entries(FEEDS).flatMap(([d, [urls, lang]]) => (Array.isArray(urls) ? urls : [urls]).map((u) => [d, MEDIA.find((m) => m.domains.includes(d))?.name || d, MEDIA.find((m) => m.domains.includes(d))?.country || "", lang, u, "curated"])),
  ...Object.entries(auto).filter(([d]) => !FEEDS[d]).map(([d, s]) => [d, s.name, s.cc, s.lang, s.feed, "discovered"]),
];
writeFileSync(out("feeds.csv"), csv([["domain", "name", "country", "language", "feed_url", "source"], ...feeds]));
console.log(`${media.length} médias connus, ${feeds.length} flux exportés.`);
