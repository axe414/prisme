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
// Rapport : les médias que le robot n'arrive pas à lire, et pourquoi (pour l'entretien des sources).
{
  const fails = Object.entries(index.sources || {}).filter(([, s]) => !s.ok).map(([d, s]) => [d, s.error || "?"]);
  writeFileSync(join(DATA, "sources-status.json"), JSON.stringify({ builtAt: new Date().toISOString(), read: Object.keys(index.sources || {}).length, failed: Object.fromEntries(fails) }));
  log(`${fails.length} médias illisibles ce passage-ci (voir data/sources-status.json)`);
}

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

// 3 b) L'archive de 7 jours : page de chaque média et recherche sur 7 jours.
{
  const { loadArchive, mergeArchive, saveArchive, outletFiles, outletFileName } = await import("../lib/archive.mjs");
  mkdirSync(STATE, { recursive: true });
  const ARCH = join(STATE, "archive.json");
  const arch = mergeArchive(loadArchive(ARCH), index);
  saveArchive(ARCH, arch);
  mkdirSync(join(DATA, "m"), { recursive: true });
  const files = outletFiles(arch);
  for (const [domain, file] of files) writeFileSync(join(DATA, "m", outletFileName(domain)), JSON.stringify(file));
  log(`archive : ${Object.keys(arch.items).length} articles sur 7 jours, ${files.length} pages de médias`);
  // Index de recherche (tous pays, 7 jours, titres + extraits).
  const { writeSearchIndex } = await import("../lib/search-index.mjs");
  const build = Date.now().toString(36);
  const si = writeSearchIndex(arch, DATA, build);
  writeFileSync(join(DATA, "search.json"), JSON.stringify({ build, docs: si.docs }));
  log(`index de recherche : ${si.docs} articles, ${si.words} mots, ${si.shards} fichiers`);
}

// 4) Vidéos des chaînes de médias, et annuaire.
mkdirSync(STATE, { recursive: true });
const videos = await allVideos({ memory: join(STATE, "videos.json") });
writeFileSync(join(DATA, "videos.json"), JSON.stringify({ builtAt: new Date().toISOString(), videos }));
writeFileSync(join(DATA, "directory.json"), JSON.stringify({ media: directory() }));
// Les médias locaux du Canada et leur ville (déduite de leurs articles) : pour les pages de villes.
try {
  const { localMediaMap } = await import("../lib/local-cities.mjs");
  const { loadArchive } = await import("../lib/archive.mjs");
  writeFileSync(join(DATA, "local-media.json"), JSON.stringify(localMediaMap(ROOT, loadArchive(join(STATE, "archive.json")))));
} catch (e) { log(`médias locaux : ${e.message}`); writeFileSync(join(DATA, "local-media.json"), "{}"); }
log(`${videos.length} vidéos sur 7 jours (${(await import("../lib/videos.mjs")).channelCount()} chaînes)`);

// 5) Résumés neutres des grandes histoires (gardés d'une fois à l'autre ; seuls les nouveaux sont écrits).
mkdirSync(STATE, { recursive: true });
const SUMS = join(STATE, "summaries.json");
let sums = {};
try { sums = JSON.parse(readFileSync(SUMS, "utf8")); } catch { /* première fois */ }
const cutoff = Date.now() - 3 * 864e5;
for (const [id, v] of Object.entries(sums)) if (Date.parse(v.at) < cutoff) delete sums[id];
if (canSummarize()) {
  // Toutes les histoires d'au moins 2 médias, rang par rang dans chaque édition (les plus en vue d'abord).
  const { summarizeBatch } = await import("../lib/summarize.mjs");
  const ORDER_R = ["qc", "monde", "ca", "fr", "us", "uk", "europe", "latam", "afrique", "moyenorient", "asie", "oceanie"];
  const want = [], seen = new Set();
  for (let rank = 0; rank < 60; rank++) for (const region of ORDER_R) {
    const s = editions[region]?.stories[rank];
    if (s && s.sources >= 2 && !sums[s.id] && !seen.has(s.id)) { seen.add(s.id); want.push(s); }
  }
  // 10 histoires par demande : environ 80 résumés par passage avec 8 demandes (palier gratuit de Gemini).
  const BATCH = 10, CALLS = Number(process.env.SUMMARY_CALLS || 8);
  let done = 0;
  for (let i = 0; i < Math.min(want.length, BATCH * CALLS); i += BATCH) {
    try {
      const out = await summarizeBatch(want.slice(i, i + BATCH));
      for (const [id, r] of Object.entries(out)) { sums[id] = { ...r, at: new Date().toISOString() }; done++; }
    } catch (e) {
      log(`résumés impossibles : ${e.message}`);
      if (e.quota) break;
    }
  }
  log(`${done} nouveaux résumés neutres (${Object.keys(sums).length} en tout)`);
  writeFileSync(SUMS, JSON.stringify(sums));
}
const published = new Set(Object.values(editions).flatMap((e) => e.stories.map((s) => s.id)));

// 5 b) Titres en anglais traduits en français pour les éditions francophones (gardés d'une fois à l'autre).
{
  const { translateTitles } = await import("../lib/summarize.mjs");
  const TR = join(STATE, "translations.json");
  let tr = {};
  try { tr = JSON.parse(readFileSync(TR, "utf8")); } catch { /* première fois */ }
  const want = [];
  for (const region of ["qc", "fr", "monde", "ca"]) for (const s of editions[region].stories.slice(0, 80)) {
    if (s.lang && s.lang !== "fr" && s.title && !tr[s.title] && !want.includes(s.title)) want.push(s.title);
  }
  let added = 0;
  for (let i = 0; i < Math.min(want.length, 120); i += 40) {
    const batch = want.slice(i, i + 40);
    try { const out = await translateTitles(batch); batch.forEach((t, j) => { if (out[j]) { tr[t] = out[j]; added++; } }); }
    catch (e) { log(`traduction impossible : ${e.message}`); break; }
  }
  // On ne garde que les titres encore publiés.
  const live = new Set(Object.values(editions).flatMap((e) => e.stories.map((s) => s.title)));
  for (const t of Object.keys(tr)) if (!live.has(t)) delete tr[t];
  writeFileSync(TR, JSON.stringify(tr));
  writeFileSync(join(DATA, "translations.json"), JSON.stringify(tr));
  log(`${added} titres traduits (${Object.keys(tr).length} en tout)`);
}
writeFileSync(join(DATA, "summaries.json"), JSON.stringify(Object.fromEntries(Object.entries(sums).filter(([id]) => published.has(id)))));

// 6) Fiche de l'édition.
const outlets = new Set(index.articles.map((a) => a.domain)).size;
writeFileSync(join(DATA, "meta.json"), JSON.stringify({ builtAt: new Date().toISOString(), articles: index.articles.length, outlets }));
log(`terminé : ${outlets} médias, ${index.articles.length} articles`);
process.exit(0);
