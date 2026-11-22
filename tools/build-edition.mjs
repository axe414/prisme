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
// Garde-fou : une lecture qui échoue en bloc (panne de réseau du serveur) ne doit pas publier des éditions vides.
// On arrête le passage : le site en ligne garde les nouvelles du passage précédent.
if (index.articles.length < 2000) {
  console.error(`Trop peu d'articles lus (${index.articles.length}) : passage annulé, le site en ligne reste tel quel.`);
  process.exit(1);
}
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

// 3 a) Pages de partage : un lien Prisme collé dans Messages ou Messenger montre la photo, le titre et la couverture.
{
  const H = join(OUT, "h");
  mkdirSync(H, { recursive: true });
  const e = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const seen = new Set();
  let n = 0;
  // Le Québec d'abord : une histoire présente dans plusieurs éditions garde la page (titre, chiffres, lien)
  // de l'édition Québec, celle de la plupart des lecteurs. Sinon « Monde » passait devant et envoyait
  // le destinataire d'un lien dans l'édition Monde.
  const order = ["qc", "ca", ...Object.keys(editions).filter((r) => r !== "qc" && r !== "ca")].filter((r) => editions[r]);
  for (const region of order) {
    const file = editions[region];
    const top = [...file.stories].sort((a, b) => (b.scores?.essentiel || 0) - (a.scores?.essentiel || 0)).slice(0, 250);
    for (const s of top) {
      if (seen.has(s.id) || !/^[\w-]+$/.test(s.id)) continue;
      seen.add(s.id);
      const c = s.counts || {};
      const L = (c.l2 || 0) + (c.l1 || 0), C = c.c || 0, R = (c.r1 || 0) + (c.r2 || 0);
      const desc = `${s.sources} médias en parlent · gauche ${L} · centre ${C} · droite ${R}. Compare sur Prisme.`;
      const to = `../?h=${s.id}${region !== "qc" ? `&r=${region}` : ""}`;
      writeFileSync(join(H, `${s.id}.html`), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(s.title)} — Prisme</title>
<meta name="description" content="${e(desc)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Prisme">
<meta property="og:title" content="${e(s.title)}"><meta property="og:description" content="${e(desc)}">
${s.image ? `<meta property="og:image" content="${e(s.image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<meta http-equiv="refresh" content="0; url=${e(to)}"><script>location.replace(${JSON.stringify(to)})</script>
</head><body><p><a href="${e(to)}">${e(s.title)}</a></p></body></html>`);
      n++;
    }
  }
  log(`${n} pages de partage (aperçu dans Messages, Messenger…)`);
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

// 4 b) Les logos des médias (gardés d'une fois à l'autre ; seuls les nouveaux sont téléchargés).
try {
  const { buildLogos } = await import("../lib/logos.mjs");
  const doms = new Set();
  for (const file of Object.values(editions)) for (const s of file.stories) for (const a of s.articles || []) doms.add(a.domain);
  try { for (const d of Object.keys(JSON.parse(readFileSync(join(DATA, "local-media.json"), "utf8")))) doms.add(d); } catch { /* pas de médias locaux */ }
  const r = await buildLogos(doms, join(STATE, "logos"), join(DATA, "logos"));
  writeFileSync(join(DATA, "logos.json"), JSON.stringify(r.have));
  log(`logos : ${r.have.length} publiés (${r.fetched} nouveaux sur ${r.tried} essayés)`);
} catch (e) { log(`logos : ${e.message}`); writeFileSync(join(DATA, "logos.json"), "[]"); }

// 4 c) Utile chez toi : pannes d'Hydro-Québec et résultats du Canadien (données publiques, une lecture par passage).
// Un échec ici ne doit jamais faire échouer le passage : on publie simplement un fichier vide.
const getJson = async (url, ms = 10000) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); } finally { clearTimeout(t); }
};
try {
  const v = await getJson("https://pannes.hydroquebec.com/pannes/donnees/v3_0/bisversion.json");
  const m = await getJson(`https://pannes.hydroquebec.com/pannes/donnees/v3_0/bismarkers${String(v).replace(/[^\d]/g, "")}.json`);
  // Chaque panne : [clients touchés, début, fin prévue, type, "[longitude, latitude]", …] → [lat, lon, clients]
  const list = (m.pannes || []).map((p) => { let c = null; try { c = JSON.parse(p[4]); } catch { /* sans position */ } return c && Number(p[0]) > 0 ? [Math.round(c[1] * 1000) / 1000, Math.round(c[0] * 1000) / 1000, Number(p[0])] : null; }).filter(Boolean);
  writeFileSync(join(DATA, "pannes.json"), JSON.stringify({ at: new Date().toISOString(), total: list.reduce((a, p) => a + p[2], 0), list }));
  log(`pannes d'Hydro-Québec : ${list.length} pannes, ${list.reduce((a, p) => a + p[2], 0)} clients`);
} catch (e) { log(`pannes d'Hydro-Québec : ${e.message}`); writeFileSync(join(DATA, "pannes.json"), JSON.stringify({ at: null, total: 0, list: [] })); }
try {
  const n = await getJson("https://api-web.nhle.com/v1/scoreboard/MTL/now");
  const games = (n.gamesByDate || []).flatMap((d) => d.games || []);
  const team = (t) => ({ a: t?.abbrev || "", n: t?.commonName?.fr || t?.commonName?.default || t?.name?.fr || t?.name?.default || t?.abbrev || "", s: Number.isFinite(t?.score) ? t.score : null });
  const slim = (g) => (g ? { at: g.startTimeUTC, state: g.gameState, away: team(g.awayTeam), home: team(g.homeTeam), end: g.periodDescriptor?.periodType || "" } : null);
  const done = games.filter((g) => ["OFF", "FINAL"].includes(g.gameState)), live = games.find((g) => ["LIVE", "CRIT"].includes(g.gameState));
  const next = games.find((g) => ["FUT", "PRE"].includes(g.gameState));
  writeFileSync(join(DATA, "habs.json"), JSON.stringify({ at: new Date().toISOString(), last: slim(done[done.length - 1]), live: slim(live), next: slim(next) }));
  log(`Canadien : dernier match ${done.length ? "trouvé" : "absent"}, prochain ${next ? "trouvé" : "absent"}`);
} catch (e) { log(`Canadien : ${e.message}`); writeFileSync(join(DATA, "habs.json"), JSON.stringify({ at: null })); }

// 4 d) « Ta semaine » : chaque jour, on retient les 12 histoires les plus couvertes de chaque édition (7 jours gardés).
try {
  const WEEKF = join(STATE, "week.json");
  let week = {};
  try { week = JSON.parse(readFileSync(WEEKF, "utf8")); } catch { /* première fois */ }
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const keep = new Date(Date.now() - 7 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  for (const [region, file] of Object.entries(editions)) {
    const w = (week[region] ||= {});
    const today = new Map((w[day] || []).map((x) => [x.id, x]));
    for (const s of [...file.stories].sort((a, b) => (b.sources || 0) - (a.sources || 0)).slice(0, 12)) {
      const prev = today.get(s.id);
      if (prev && prev.n >= s.sources) continue;
      const lead = (s.articles || []).find((a) => a.media?.known) || (s.articles || [])[0];
      today.set(s.id, { id: s.id, t: s.title, n: s.sources, c: s.counts || {}, img: s.image || null, cat: (s.categories || [])[0] || null, u: lead?.url || null, src: lead?.sourceName || null });
    }
    w[day] = [...today.values()].sort((a, b) => b.n - a.n).slice(0, 12);
    for (const d of Object.keys(w)) if (d < keep) delete w[d];
    writeFileSync(join(DATA, `week-${region}.json`), JSON.stringify({ builtAt: new Date().toISOString(), days: w }));
  }
  writeFileSync(WEEKF, JSON.stringify(week));
  log(`semaine : ${Object.keys(week.qc || {}).length} jours gardés pour le Québec`);
} catch (e) { log(`semaine : ${e.message}`); }

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
