// L'index de recherche de Prisme : tous les articles des 7 derniers jours, de tous les pays, titres et extraits.
// Le site est statique : l'app ne télécharge que les petits morceaux dont elle a besoin pour une recherche.
//   s/<n°>/meta.json        les médias, et pour chaque article : média, âge, langue, rubriques (pour filtrer et compter sans tout charger)
//   s/<n°>/w/<préfixe>.json  pour chaque mot : la liste des articles qui le contiennent (regroupés par 2 premières lettres)
//   s/<n°>/d/<bloc>.json     le détail des articles (titre, lien, extrait), par blocs de 250
// Le n° change à chaque édition pour que l'app ne mélange jamais deux versions.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CHUNK = 250;
const STOP = new Set(("le la les un une des du de d l au aux et ou en a à dans sur pour par avec sans sous ce cet cette ces son sa ses leur leurs " +
  "qui que quoi dont ne pas plus moins est sont été etre être avoir a ont il elle ils elles on nous vous je tu se s y lui " +
  "the a an of to in on for and or with by from at as is are was were be been it its this that these those not but after over about into " +
  "el los las del y por con para un una que al lo se es").split(" "));

export const fold = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// Un mot de l'index : sans accent, sans « s » du pluriel (élections → election).
export const norm = (w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
export function words(text) {
  const out = new Set();
  for (const w of fold(text).split(/[^\p{L}\p{N}]+/u)) if (w.length >= 2 && !STOP.has(w)) out.add(norm(w));
  return out;
}
// Le fichier d'un mot : ses 2 premières lettres (a-z, 0-9) ; les autres alphabets sont regroupés par blocs de 64 caractères.
export const shardOf = (w) => {
  const c = [...w];
  if (/[a-z0-9]/.test(c[0])) return c[0] + (c[1] && /[a-z0-9]/.test(c[1]) ? c[1] : "_");
  return `u${(c[0].codePointAt(0) >> 6).toString(16)}`;
};

const LANGS = ["fr", "en", "es", "pt", "de", "it", "nl", "ar", "ru", "uk", "pl", "tr", "zh", "ja", "ko"];

export function writeSearchIndex(arch, outDir, build) {
  const dir = join(outDir, "s", String(build));
  mkdirSync(join(dir, "w"), { recursive: true });
  mkdirSync(join(dir, "d"), { recursive: true });
  // Les plus récents d'abord : les résultats affichés tombent dans les premiers blocs.
  const items = Object.values(arch.items).sort((a, b) => b[3] - a[3]);
  const nowMin = Math.round(Date.now() / 60000);
  const dIdx = new Map(), domains = [];
  const dom = [], age = [], lang = [], cats = [];
  const post = new Map();
  items.forEach((r, id) => {
    const [title, , domain, min, lg, cm, , summary] = r;
    if (!dIdx.has(domain)) {
      const m = arch.domains[domain] || [domain, "unk", null, null, null, null];
      dIdx.set(domain, domains.length);
      domains.push([domain, ...m]);
    }
    dom.push(dIdx.get(domain));
    age.push(min ? Math.max(0, Math.round((nowMin - min) / 10)) : 1008); // en tranches de 10 minutes
    const li = LANGS.indexOf(lg || "");
    lang.push(li < 0 ? (lg ? LANGS.length : -1) : li);
    cats.push(cm || 0);
    for (const w of words(`${title} ${summary || ""} ${(arch.domains[domain] || [])[0] || ""}`)) {
      let l = post.get(w);
      if (!l) post.set(w, (l = []));
      l.push(id);
    }
  });
  // Mots regroupés par préfixe ; listes d'articles en écarts (plus compactes).
  const shards = new Map();
  for (const [w, ids] of post) {
    const k = shardOf(w);
    let s = shards.get(k);
    if (!s) shards.set(k, (s = {}));
    const gaps = ids.map((v, i) => (i ? v - ids[i - 1] : v));
    s[w] = gaps;
  }
  for (const [k, s] of shards) writeFileSync(join(dir, "w", `${k}.json`), JSON.stringify(s));
  for (let c = 0; c * CHUNK < items.length; c++) {
    const part = items.slice(c * CHUNK, (c + 1) * CHUNK).map((r) => [r[0], r[1], dIdx.get(r[2]), r[3], r[6] || null, r[7] || null]);
    writeFileSync(join(dir, "d", `${c}.json`), JSON.stringify(part));
  }
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ build, builtAt: new Date().toISOString(), nowMin, chunk: CHUNK, langs: LANGS, domains, dom, age, lang, cats }));
  return { docs: items.length, words: post.size, shards: shards.size };
}
