// Instantané « qui possède quoi » selon Wikidata, pour chaque propriétaire connu de Prisme.
// Usage : node tools/build-empires.mjs   (environ 15 à 25 minutes ; on ménage Wikidata)
// Résultat : public/empires.json, lu par la carte « Qui possède quoi ».
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { MEDIA } from "../lib/media-db.mjs";
import { empire } from "../lib/empire.mjs";

const OUT = new URL("../public/empires.json", import.meta.url);
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^(the|le|la|les|l')\s*/, "").replace(/[^a-z0-9]+/g, "");

// Même regroupement que la carte : par famille quand elle est nommée, sinon par entreprise.
function ownerGroup(owner) {
  if (/^(Indépendant|Organisme sans but lucratif|Association sans but lucratif)/i.test(owner)) return null;
  const fam = owner.match(/\([^)]*?\b(?:famille|groupe) (\p{Lu}[\p{L}'’-]+)/u);
  return fam ? `Famille ${fam[1]}` : owner.replace(/\s*\(.*\)\s*$/, "").trim();
}
const groups = new Map();
for (const m of MEDIA) {
  const key = ownerGroup(m.owner);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(m);
}

// Reprise : on garde ce qui est déjà fait (utile si le script est interrompu).
const result = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { builtAt: null, groups: {} };
let i = 0;
for (const [key, list] of groups) {
  i++;
  if (result.groups[key] && !process.argv.includes("--refresh")) continue;
  const t0 = Date.now();
  try {
    const domains = list.flatMap((m) => m.domains);
    const knownNames = new Set(list.map((m) => norm(m.name)));
    const knownDomains = new Set(domains);
    const r = await empire(domains);
    // On retire les doublons des médias que Prisme suit déjà.
    const items = r.items.filter((x) => !knownNames.has(norm(x.name)) && !(x.domain && knownDomains.has(x.domain)))
      .map(({ id, name, kind, domain, country, via }) => ({ id, name, kind, domain, country, via }));
    result.groups[key] = { owners: r.owners, items };
    console.log(`[${i}/${groups.size}] ${key} : ${items.length} médias en plus (${Date.now() - t0} ms)`);
  } catch (e) {
    console.log(`[${i}/${groups.size}] ${key} : ÉCHEC ${e.message}`);
  }
  result.builtAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(result));
  await new Promise((r) => setTimeout(r, 1500));
}
const total = Object.values(result.groups).reduce((n, g) => n + g.items.length, 0);
console.log(`\nTerminé : ${Object.keys(result.groups).length} propriétaires, ${total} médias en plus selon Wikidata.`);
