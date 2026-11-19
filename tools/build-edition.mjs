// Le robot de Prisme : lit tous les médias, prépare les 12 éditions, les vidéos et les résumés neutres,
// et écrit le site complet (app + données) dans un dossier prêt à publier sur GitHub Pages.
// Usage : node --max-old-space-size=6144 tools/build-edition.mjs [dossier]   (par défaut : site)
import { mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const OUT = join(ROOT, process.argv[2] || "site");
const DATA = join(OUT, "data");
const STATE = join(ROOT, ".data");

// En local, les clés viennent du fichier .env ; sur GitHub, des « secrets » du dépôt.
if (existsSync(join(ROOT, ".env"))) {
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2]) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}

const { getIndex, refreshAuto, autoStatus } = await import("../lib/ingest.mjs");
const { buildStories, editionFile, articlesFile, mondeLookup, REGIONS } = await import("../lib/edition.mjs");
const { allVideos } = await import("../lib/videos.mjs");
const { directory } = await import("../lib/media-db.mjs");
const { canSummarize, summarize } = await import("../lib/summarize.mjs");

const t0 = Date.now();
const log = (m) => console.log(`[${Math.round((Date.now() - t0) / 1000)} s] ${m}`);

// 1) Le site : on part de l'app (public/), puis on ajoute les données.
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
cpSync(join(ROOT, "public"), OUT, { recursive: true });
mkdirSync(DATA, { recursive: true });
writeFileSync(join(OUT, ".nojekyll"), "");

// 2) Lecture de tous les médias (base + découverts).
await getIndex();
await refreshAuto();
const index = await getIndex();
const st = autoStatus();
log(`${index.articles.length} articles lus (${st.loaded} médias découverts sur ${st.total})`);

// 3) Les éditions : Monde d'abord (elle sert à « Vu d'ici, vu d'ailleurs » pour les autres).
const mondeData = buildStories(index, "monde");
const monde = mondeLookup(mondeData);
const editions = {};
for (const region of REGIONS) {
  const data = region === "monde" ? mondeData : buildStories(index, region);
  const file = editionFile(index, data, monde);
  editions[region] = file;
  writeFileSync(join(DATA, `edition-${region}.json`), JSON.stringify(file));
  writeFileSync(join(DATA, `articles-${region}.json`), JSON.stringify(articlesFile(index, region)));
  log(`édition ${region} : ${file.stories.length} histoires publiées sur ${file.totals.stories}, ${file.totals.outlets} médias`);
}

// 4) Vidéos des chaînes de médias, et annuaire.
const videos = await allVideos();
writeFileSync(join(DATA, "videos.json"), JSON.stringify({ builtAt: new Date().toISOString(), videos }));
writeFileSync(join(DATA, "directory.json"), JSON.stringify({ media: directory() }));
log(`${videos.length} vidéos`);

// 5) Résumés neutres des grandes histoires (gardés d'une fois à l'autre ; seuls les nouveaux sont écrits).
mkdirSync(STATE, { recursive: true });
const SUMS = join(STATE, "summaries.json");
let sums = {};
try { sums = JSON.parse(readFileSync(SUMS, "utf8")); } catch { /* première fois */ }
const cutoff = Date.now() - 3 * 864e5;
for (const [id, v] of Object.entries(sums)) if (Date.parse(v.at) < cutoff) delete sums[id];
if (canSummarize()) {
  const want = [];
  for (const region of ["qc", "ca", "monde", "fr", "us", "uk", "europe"]) {
    for (const s of editions[region].stories.slice(0, 8)) if (s.sources >= 3 && !sums[s.id] && !want.some((w) => w.id === s.id)) want.push(s);
  }
  const MAX = Number(process.env.SUMMARY_MAX || 12); // le palier gratuit de Gemini permet environ 500 résumés par jour
  let done = 0;
  for (const s of want.slice(0, MAX)) {
    try {
      const r = await summarize(s);
      sums[s.id] = { summary: r.summary, left: r.left, right: r.right, provider: r.provider, at: new Date().toISOString() };
      done++;
    } catch (e) {
      log(`résumé impossible : ${e.message}`);
      if (e.quota) break;
    }
  }
  log(`${done} nouveaux résumés neutres (${Object.keys(sums).length} en tout)`);
  writeFileSync(SUMS, JSON.stringify(sums));
}
const published = new Set(Object.values(editions).flatMap((e) => e.stories.map((s) => s.id)));
writeFileSync(join(DATA, "summaries.json"), JSON.stringify(Object.fromEntries(Object.entries(sums).filter(([id]) => published.has(id)))));

// 6) Fiche de l'édition.
const outlets = new Set(index.articles.map((a) => a.domain)).size;
writeFileSync(join(DATA, "meta.json"), JSON.stringify({ builtAt: new Date().toISOString(), articles: index.articles.length, outlets }));
log(`terminé : ${outlets} médias, ${index.articles.length} articles`);
process.exit(0);
