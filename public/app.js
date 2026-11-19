import { LANG, LOCALE, setLang, startTranslation } from "./i18n.js";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- Constantes ---------- */
const REGIONS = [["qc", "Québec"], ["ca", "Canada"], ["us", "États-Unis"], ["fr", "France"], ["uk", "Royaume-Uni"], ["europe", "Europe"], ["latam", "Amérique latine"], ["afrique", "Afrique"], ["moyenorient", "Moyen-Orient"], ["asie", "Asie"], ["oceanie", "Océanie"], ["monde", "Monde entier"]];
const CATS = [["une", "À la une"], ["politique", "Politique"], ["international", "International"], ["economie", "Économie"], ["environnement", "Environnement"], ["techno", "Techno"], ["science", "Science"], ["sante", "Santé"], ["culture", "Culture"], ["sports", "Sports"]];
const CAT_LABEL = Object.fromEntries(CATS);
const LENSES = {
  essentiel: { label: "L'essentiel", desc: "Les histoires couvertes par le plus de médias, avec un bonus quand la gauche, le centre et la droite en parlent tous. Les plus récentes passent devant." },
  angles: { label: "Angles morts", desc: "Des histoires qu'un côté du spectre couvre beaucoup et que l'autre ignore presque." },
  gauche: { label: "Bulle de gauche", sw: "var(--b-l2)", desc: "Ce que les médias de gauche couvrent le plus en ce moment, et que la droite couvre peu ou pas." },
  droite: { label: "Bulle de droite", sw: "var(--b-r2)", desc: "Ce que les médias de droite couvrent le plus en ce moment, et que la gauche couvre peu ou pas." },
  horsradar: { label: "Hors radar", desc: "Des histoires couvertes par un ou deux médias seulement : enquêtes, sujets locaux, médias indépendants." },
  recent: { label: "En continu", desc: "Tout ce que Prisme lit, du plus récent au plus ancien, sans aucun tri." },
};
const BIAS = {
  l2: { label: "Gauche", color: "var(--b-l2)" },
  l1: { label: "Centre-gauche", color: "var(--b-l1)" },
  c: { label: "Centre", color: "var(--b-c)" },
  r1: { label: "Centre-droit", color: "var(--b-r1)" },
  r2: { label: "Droite", color: "var(--b-r2)" },
  state: { label: "Média d'État", color: "var(--b-state)" },
  unk: { label: "Non évalué", color: "var(--b-unk)" },
};
const ORDER = ["l2", "l1", "c", "r1", "r2", "state", "unk"];
const KEY_BY_BIAS = { "-2": "l2", "-1": "l1", "0": "c", "1": "r1", "2": "r2" };
const SIDES = [
  { key: "left", label: "Gauche", keys: ["l2", "l1"], color: "var(--b-l2)" },
  { key: "center", label: "Centre", keys: ["c"], color: "var(--b-c)" },
  { key: "right", label: "Droite", keys: ["r1", "r2"], color: "var(--b-r2)" },
];
const TYPE_LABEL = { public: "Service public", "État": "Contrôlé par un État", "privé": "Privé", OBNL: "Sans but lucratif", "coopérative": "Coopérative", agence: "Agence de presse", "indépendant": "Indépendant" };

const store = {
  get(k, d) { try { return localStorage.getItem("prisme." + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("prisme." + k, v); } catch { /* stockage indisponible */ } },
};

const state = {
  region: store.get("region", "qc"),
  feeds: new Map(),      // clé de fil → { stories, page, hasMore, summary, trending, loading }
  stories: new Map(),    // id → histoire
  media: new Map(),
  videos: new Map(),
  wide: new Map(),       // recherche élargie (GDELT)
  directory: null,
  route: null,
  observer: null,
  wideTab: "articles",
  wideBias: new Set(),
};

/* ---------- Utilitaires ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");
const rtf = new Intl.RelativeTimeFormat(LANG, { numeric: "auto" });
const regionNames = (() => { try { return new Intl.DisplayNames([LANG], { type: "region" }); } catch { return null; } })();
const countryName = (cc) => { try { return cc ? regionNames?.of(cc) || cc : null; } catch { return cc; } };
const plural = (n, one, many = one + "s") => `${n} ${n > 1 ? many : one}`;

function ago(iso) {
  if (!iso) return "";
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.min(-1, Math.round(diff / 60)), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }) : "");

const biasKey = (m) => (!m || !m.known ? "unk" : m.bias === null || m.bias === undefined ? "state" : KEY_BY_BIAS[m.bias] || "unk");
const sideOf = (m) => { const k = biasKey(m); return SIDES.find((s) => s.keys.includes(k))?.key || null; };
const favicon = (domain, name) => domain
  ? `<img class="fav" src="https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico" alt="" loading="lazy" data-letter="${esc((name || domain)[0].toUpperCase())}">`
  : `<span class="fav-fallback">${esc((name || "?")[0].toUpperCase())}</span>`;
// L'orientation d'un média, écrite en toutes lettres sur sa couleur (lisible même sans voir les couleurs).
const badge = (m) => {
  const k = biasKey(m);
  return `<span class="bb bb-${k}" title="Orientation du média : ${esc(BIAS[k].label)}">${esc(k === "state" && m?.state ? `État · ${m.state}` : BIAS[k].label)}</span>`;
};
const tag = badge;

// Articles en langue étrangère : la langue, et un lien pour lire l'article traduit en français.
const LANG_NAME = { en: "anglais", es: "espagnol", pt: "portugais", de: "allemand", it: "italien", nl: "néerlandais", sv: "suédois", no: "norvégien", pl: "polonais", cs: "tchèque", sk: "slovaque", hu: "hongrois", ro: "roumain", bg: "bulgare", el: "grec", sr: "serbe", sl: "slovène", lv: "letton", lt: "lituanien", uk: "ukrainien", ru: "russe", tr: "turc", he: "hébreu", ar: "arabe", hi: "hindi", bn: "bengali", ja: "japonais", ko: "coréen", zh: "chinois", id: "indonésien", th: "thaï", vi: "vietnamien" };
const transUrl = (u) => `https://translate.google.com/translate?sl=auto&tl=fr&u=${encodeURIComponent(u)}`;
const langTag = (lang) => (lang && lang !== "fr" ? `<span class="lang" title="Article en ${esc(LANG_NAME[lang] || lang)}">${esc(lang.toUpperCase())}</span>` : "");
const transLink = (a) => (a.lang && a.lang !== "fr" ? `<a class="tr" href="${esc(transUrl(a.url))}" target="_blank" rel="noopener noreferrer" title="Lire l'article traduit en français">Traduire</a>` : "");

// Images et icônes cassées : on retire proprement.
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img.tagName !== "IMG") return;
  if (img.classList.contains("fav")) {
    const span = document.createElement("span");
    span.className = "fav-fallback";
    span.textContent = img.dataset.letter || "?";
    img.replaceWith(span);
  } else if (img.closest(".thumb, .lead-media, .s-hero")) {
    const box = img.closest(".thumb, .lead-media, .s-hero");
    box.closest(".story, .lead")?.classList.add("noimg");
    box.remove();
  }
}, true);

const topics = {
  list() { try { return JSON.parse(store.get("topics", "[]")); } catch { return []; } },
  has(q) { return this.list().some((t) => t.toLowerCase() === q.toLowerCase()); },
  add(q) { if (q && !this.has(q)) store.set("topics", JSON.stringify([...this.list(), q].slice(-20))); },
  remove(q) { store.set("topics", JSON.stringify(this.list().filter((t) => t.toLowerCase() !== q.toLowerCase()))); },
};

/* ---------- Alertes : nouvelles histoires sur mes sujets suivis ---------- */
const alerts = { counts: {} };
const seenKey = (t) => `seen.${t.toLowerCase()}`;
function alertCount() { return Object.values(alerts.counts).reduce((a, b) => a + b, 0); }
function markTopicSeen(t, ids) {
  store.set(seenKey(t), JSON.stringify(ids.slice(0, 200)));
  delete alerts.counts[t.toLowerCase()];
}
async function checkAlerts({ notify = true } = {}) {
  const list = topics.list();
  if (!list.length) return;
  let fresh = 0;
  const lines = [];
  await Promise.all(list.map(async (t) => {
    try {
      const d = await api(`/api/feed?q=${encodeURIComponent(t)}&region=${state.region}&page=0`);
      const ids = d.stories.map((s) => s.id);
      let seen;
      try { seen = JSON.parse(store.get(seenKey(t), "null")); } catch { seen = null; }
      if (!seen) { markTopicSeen(t, ids); return; } // première fois : rien de « nouveau »
      const n = ids.filter((id) => !seen.includes(id)).length;
      const before = alerts.counts[t.toLowerCase()] || 0;
      alerts.counts[t.toLowerCase()] = n;
      if (n > before) { fresh += n - before; lines.push(`${t} : ${plural(n, "nouvelle histoire", "nouvelles histoires")}`); }
    } catch { /* hors ligne : on réessaiera */ }
  }));
  if (state.route) renderChrome(state.route);
  if (state.route?.view === "feed") drawTopics(state.feeds.get(feedKey(state.route)) || {});
  if (notify && fresh && document.hidden && "Notification" in window && Notification.permission === "granted") {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    const opts = { body: lines.join("\n"), icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "prisme-sujets" };
    if (reg) reg.showNotification("Prisme · tes sujets", opts); else new Notification("Prisme · tes sujets", opts);
  }
}
setInterval(() => checkAlerts(), 15 * 60e3);

/* ---------- Mes lectures (gardées sur cet appareil seulement, jamais envoyées) ---------- */
const reads = {
  _cache: null,
  list() {
    if (!this._cache) { try { this._cache = JSON.parse(store.get("reads", "[]")); } catch { this._cache = []; } }
    return this._cache;
  },
  save(l) { this._cache = l.slice(-600); this._set = null; store.set("reads", JSON.stringify(this._cache)); },
  add(r) { this.save([...this.list().filter((x) => x.u !== r.u), { ...r, ts: Date.now() }]); },
  remove(u) { this.save(this.list().filter((x) => x.u !== u)); },
  clear() { this.save([]); },
  has(u) { if (!this._set) this._set = new Set(this.list().map((x) => x.u)); return this._set.has(u); },
};

// Un lien vers un article : l'ouvrir compte comme une lecture dans « Mon prisme ».
function artLink(a, cls = "", marks = null) {
  const meta = { u: a.url, d: a.domain, n: a.sourceName, k: biasKey(a.media), o: a.media?.known ? a.media.owner : null, c: a.media?.country || null, t: a.title };
  const side = marks ? (sideOf(a.media) === "left" ? "ml" : "mr") : "";
  // Surligne les « mots chargés » propres à un côté.
  const text = marks && marks.size
    ? a.title.split(/([\p{L}\p{N}'’-]+)/u).map((part) => {
      const k = stem(fold(part.replace(/^(?:[ldjmnstc]|qu)['’]/i, "").replace(/['’-]+$/, "")));
      return marks.has(k) ? `<mark class="${side}">${esc(part)}</mark>` : esc(part);
    }).join("")
    : esc(a.title);
  return `<a data-no-tr class="${cls}${reads.has(a.url) ? " is-read" : ""}" href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${esc(JSON.stringify(meta))}">${text}</a>`;
}
const noteRead = (e) => {
  const a = e.target.closest("a[data-read]");
  if (!a || (e.type === "auxclick" && e.button !== 1)) return;
  try { reads.add(JSON.parse(a.dataset.read)); a.classList.add("is-read"); } catch { /* lien sans données */ }
};
document.addEventListener("click", noteRead);
document.addEventListener("auxclick", noteRead);

/* ---------- Données ----------
   Prisme n'a pas de serveur : un robot (GitHub) prépare toutes les 30 minutes des fichiers d'édition dans data/.
   La fonction api() répond aux mêmes questions qu'avant (/api/feed, /api/videos…) à partir de ces fichiers. */
const DATA_BASE = new URL("data/", document.baseURI).href;
const dataCache = new Map();
function dataJson(name, maxAgeMs = 10 * 60e3) {
  const hit = dataCache.get(name);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.promise;
  const promise = fetch(DATA_BASE + name, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(r.status === 404 ? "Cette édition n'est pas encore prête. Réessaie dans quelques minutes." : `Erreur ${r.status}`);
    return r.json();
  });
  dataCache.set(name, { at: Date.now(), promise });
  promise.catch(() => dataCache.delete(name));
  return promise;
}
const edition = (region) => dataJson(`edition-${region}.json`);
const foldText = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const PAGE = 15;

async function api(path) {
  const u = new URL(path, location.href);
  const p = u.searchParams;
  switch (u.pathname.replace(/^.*\/api\//, "/api/")) {
    case "/api/feed": return feedLocal(p);
    case "/api/videos": return videosLocal(p);
    case "/api/directory": return { media: (await dataJson("directory.json", 864e5)).media };
    case "/api/media": return mediaLocal(p.get("domain"));
    case "/api/summary": return summaryLocal(p.get("id"));
    case "/api/search": return searchLocal(p.get("q"), p.get("region"));
    default: throw new Error("Demande inconnue.");
  }
}

async function findStory(id, region) {
  for (const r of [region, "monde", "qc", "ca"]) {
    const ed = await edition(r).catch(() => null);
    const s = ed?.stories.find((x) => x.id === id);
    if (s) return { s, ed };
  }
  return {};
}

async function feedLocal(p) {
  const region = p.get("region") || state.region;
  const ed = await edition(region);
  const storyId = p.get("story");
  if (storyId) {
    const { s } = await findStory(storyId, region);
    if (!s) throw new Error("Cette histoire n'est plus dans le fil (les fils couvrent les dernières 48 heures).");
    return { story: s };
  }
  const extraId = p.get("extra");
  if (extraId) {
    const { s, ed: e } = await findStory(extraId, region);
    if (!s) throw new Error("Histoire introuvable.");
    const present = new Set(s.articles.map((a) => a.domain));
    return {
      id: s.id,
      silent: e.active.filter((m) => !present.has(m.domain)).map((m) => ({ domain: m.domain, name: m.name, media: m.media, activity: m.n })),
      world: s.world ? { sources: s.world.sources, zones: s.world.zones } : { sources: s.sources, zones: [] },
      changed: s.articles.filter((a) => a.prevTitle),
    };
  }
  if (p.get("quiz")) {
    const shuffle = (l) => { for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
    const items = ["left", "center", "right"].flatMap((sd) => shuffle(ed.quiz.filter((q) => q.side === sd)).slice(0, 5));
    return { items: shuffle(items) };
  }
  if (p.get("changes")) return { items: ed.changes };

  const q = (p.get("q") || "").trim();
  const cat = p.get("cat") || "une";
  const lens = p.get("lens") || "essentiel";
  const page = Number(p.get("page") || 0);
  let list = ed.stories;
  if (q) {
    const words = foldText(q).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
    list = list.filter((s) => {
      const text = foldText(`${s.title} ${s.summary || ""} ${s.articles.map((a) => a.title).join(" ")}`);
      return words.every((w) => text.includes(w));
    });
  } else if (cat !== "une") list = list.filter((s) => s.categories.includes(cat));
  if (q) {
    // Une recherche qui nomme un média trouve aussi les histoires où ce média apparaît.
    const fq = foldText(q).trim();
    const byOutlet = ed.stories.filter((s) => !list.includes(s) && s.articles.some((a) => { const n = foldText(a.sourceName); return n.includes(fq) || (n.length >= 3 && fq.includes(n)); }));
    list = [...list, ...byOutlet];
  }
  const key = q ? "essentiel" : lens;
  if (key !== "recent") list = list.filter((s) => s.scores[key] > 0);
  list = [...list].sort((a, b) => b.scores[key] - a.scores[key]);

  const out = { region, page, fetchedAt: ed.fetchedAt, total: list.length, hasMore: (page + 1) * PAGE < list.length, stories: list.slice(page * PAGE, (page + 1) * PAGE) };
  if (page === 0) {
    const counts = Object.fromEntries(ORDER.map((k) => [k, 0]));
    const doms = new Map(), owners = new Map();
    for (const s of list.slice(0, 300)) for (const a of s.articles) {
      if (!doms.has(a.domain)) { doms.set(a.domain, a); counts[biasKey(a.media)]++; }
    }
    for (const s of list.slice(0, 300)) {
      const seen = new Set();
      for (const a of s.articles) if (a.media.known && !seen.has(a.media.owner)) { seen.add(a.media.owner); owners.set(a.media.owner, (owners.get(a.media.owner) || 0) + 1); }
    }
    out.summary = {
      stories: list.length, outlets: doms.size, sourcesOnline: ed.totals.outlets, counts, blindspots: ed.totals.blindspots,
      owners: [...owners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([owner, n]) => ({ owner, n })),
    };
    out.trending = ed.trending;
  }
  return out;
}

// Vidéos des chaînes de médias, filtrées par édition ou par sujet (au moins 2 mots en commun).
const VSTOP = new Set("avec pour dans plus sont cette leur après avant selon comme mais tout tous fait contre entre sans sous their with from this that have will been were what when about after over into says said more than they them also just".split(" "));
const vwords = (t) => new Set(foldText(t).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !VSTOP.has(w)));
async function videosLocal(p) {
  const all = (await dataJson("videos.json", 30 * 60e3)).videos;
  const region = p.get("region") || "monde";
  const countries = region === "monde" ? null : (await edition(region)).countries;
  let list = all.filter((v) => !countries || countries.includes(v.media.country));
  const q = p.get("q");
  if (q) {
    const qw = vwords(q);
    const need = Math.min(2, qw.size);
    list = list.filter((v) => { let n = 0; for (const w of vwords(v.title)) if (qw.has(w)) n++; return n >= need; });
  }
  return { configured: true, videos: list.slice(0, q ? 24 : 150) };
}

async function summaryLocal(id) {
  const sums = await dataJson("summaries.json").catch(() => ({}));
  return sums[id] ? { configured: true, ...sums[id] } : { configured: false };
}

// Fiche d'un média : la base de Prisme + Wikidata, interrogé directement depuis l'app.
async function lookupDir(domain) {
  const dir = (await dataJson("directory.json", 864e5)).media;
  let d = domain;
  while (d) {
    const hit = dir.find((m) => m.domain === d);
    if (hit) return { hit, dir };
    const i = d.indexOf(".");
    if (i < 0) break;
    d = d.slice(i + 1);
  }
  return { hit: null, dir };
}
async function sparql(query, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query), { signal: ctrl.signal, headers: { Accept: "application/sparql-results+json" } });
    if (!res.ok) throw new Error(`Wikidata ${res.status}`);
    return (await res.json()).results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
  } finally { clearTimeout(t); }
}
const qidOf = (uri) => (uri || "").split("/").pop();
const splitList = (s) => (s ? [...new Set(s.split("|").filter(Boolean))] : []);
async function mediaLocal(domain) {
  domain = String(domain || "").toLowerCase().replace(/^www\d?\./, "");
  const { hit, dir } = await lookupDir(domain);
  const curated = hit ? { name: hit.name, bias: hit.bias, country: hit.country, type: hit.type, owner: hit.owner, state: hit.state } : null;
  const sameOwner = hit ? dir.filter((m) => m !== hit && m.owner === hit.owner).map((m) => ({ name: m.name, domain: m.domain, bias: m.bias })) : [];
  const hosts = [...new Set([domain, hit?.domain].filter(Boolean).flatMap((d) => [d, `www.${d}`]))];
  const sites = hosts.flatMap((h) => ["https", "http"].flatMap((s) => [`<${s}://${h}/>`, `<${s}://${h}>`])).join(" ");
  let wikidata = null, wikidataError = null;
  try {
    const rows = await sparql(`
SELECT ?item ?itemLabel ?itemDescription (SAMPLE(?inc) AS ?inception) (SAMPLE(?lg) AS ?logo) (SAMPLE(?fr) AS ?wpfr) (SAMPLE(?en) AS ?wpen)
  (GROUP_CONCAT(DISTINCT ?ownerLabel; separator="|") AS ?owners) (GROUP_CONCAT(DISTINCT STR(?owner); separator="|") AS ?ownerIds)
  (GROUP_CONCAT(DISTINCT ?parentLabel; separator="|") AS ?parents) (GROUP_CONCAT(DISTINCT STR(?parent); separator="|") AS ?parentIds)
  (GROUP_CONCAT(DISTINCT ?ultimateLabel; separator="|") AS ?ultimates) (GROUP_CONCAT(DISTINCT ?countryLabel; separator="|") AS ?countries)
  (GROUP_CONCAT(DISTINCT ?alignLabel; separator="|") AS ?aligns) (GROUP_CONCAT(DISTINCT ?ideologyLabel; separator="|") AS ?ideologies)
WHERE {
  VALUES ?site { ${sites} }
  ?item wdt:P856 ?site .
  OPTIONAL { ?item p:P127 ?ost . ?ost ps:P127 ?owner . FILTER NOT EXISTS { ?ost pq:P582 ?oend }
    OPTIONAL { ?owner p:P127|p:P749 ?ust . ?ust ps:P127|ps:P749 ?ultimate . FILTER NOT EXISTS { ?ust pq:P582 ?uend } } }
  OPTIONAL { ?item p:P749 ?pst . ?pst ps:P749 ?parent . FILTER NOT EXISTS { ?pst pq:P582 ?pend } }
  OPTIONAL { ?item wdt:P17 ?country } OPTIONAL { ?item wdt:P571 ?inc } OPTIONAL { ?item wdt:P1387 ?align }
  OPTIONAL { ?item wdt:P1142 ?ideology } OPTIONAL { ?item wdt:P154 ?lg }
  OPTIONAL { ?fr schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en".
    ?item rdfs:label ?itemLabel . ?item schema:description ?itemDescription . ?owner rdfs:label ?ownerLabel . ?parent rdfs:label ?parentLabel .
    ?ultimate rdfs:label ?ultimateLabel . ?country rdfs:label ?countryLabel . ?align rdfs:label ?alignLabel . ?ideology rdfs:label ?ideologyLabel . }
} GROUP BY ?item ?itemLabel ?itemDescription LIMIT 10`);
    if (rows.length) {
      const score = (r) => (r.owners ? 4 : 0) + (r.parents ? 3 : 0) + (r.aligns ? 2 : 0) + (r.wpfr || r.wpen ? 1 : 0) + (r.inception ? 1 : 0);
      const best = rows.sort((a, b) => score(b) - score(a))[0];
      const ownerIds = [...splitList(best.ownerIds), ...splitList(best.parentIds)].map(qidOf).slice(0, 3);
      let siblings = [];
      if (ownerIds.length) {
        const sib = await sparql(`SELECT DISTINCT ?o ?oLabel (SAMPLE(?s) AS ?site) WHERE {
  VALUES ?own { ${ownerIds.map((id) => `wd:${id}`).join(" ")} }
  ?o p:P127|p:P749 ?sst . ?sst ps:P127|ps:P749 ?own . FILTER NOT EXISTS { ?sst pq:P582 ?send }
  ?o wdt:P856 ?s . FILTER(?o != wd:${qidOf(best.item)})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?o rdfs:label ?oLabel . }
} GROUP BY ?o ?oLabel LIMIT 30`, 5000).catch(() => []);
        siblings = sib.filter((x) => !/^Q\d+$/.test(x.oLabel)).map((x) => ({ name: x.oLabel, domain: (() => { try { return new URL(x.site).hostname.replace(/^www\d?\./, ""); } catch { return ""; } })(), id: qidOf(x.o) }));
      }
      wikidata = {
        id: qidOf(best.item), url: best.item, label: best.itemLabel, description: best.itemDescription || null,
        inception: best.inception ? best.inception.slice(0, 4) : null,
        logo: best.logo ? best.logo.replace(/^http:/, "https:") + "?width=160" : null,
        wikipedia: best.wpfr || best.wpen || null,
        owners: splitList(best.owners), parents: splitList(best.parents), ultimateOwners: splitList(best.ultimates),
        countries: splitList(best.countries), alignment: splitList(best.aligns), ideology: splitList(best.ideologies), siblings,
      };
    }
  } catch (e) {
    wikidataError = e.name === "AbortError" ? "Wikidata est lent en ce moment" : String(e.message || e);
  }
  return { domain, curated, country: curated?.country || null, sameOwner, wikidata, wikidataError };
}

// Tous les articles d'une édition (48 h), publiés par le robot en format compact.
async function articlesOf(region) {
  const raw = await dataJson(`articles-${region}.json`, 15 * 60e3);
  if (raw._decoded) return raw._decoded;
  const counts = new Map();
  for (const it of raw.items) counts.set(it[2], (counts.get(it[2]) || 0) + 1);
  const domains = raw.domains.map(([domain, name, k, owner, country, bias, st], i) => ({
    domain, name, count: counts.get(i) || 0, fold: foldText(name),
    media: k === "unk" ? { known: false, name, country } : { known: true, name, owner, country, bias: k === "state" ? null : bias, state: st },
  }));
  const items = raw.items.map(([title, url, di, min, lang]) => ({
    title, url, domain: domains[di].domain, sourceName: domains[di].name, media: domains[di].media,
    published: min ? new Date(min * 60000).toISOString() : null, lang, fold: foldText(title),
  }));
  return (raw._decoded = { domains, items });
}

// Les médias dont le nom ou l'adresse correspond à la recherche (« tva nouvelle » → TVA Nouvelles).
function matchOutlets(domains, q) {
  const fq = foldText(q).trim(), compact = fq.replace(/[^\p{L}\p{N}]+/gu, "");
  if (fq.length < 2) return [];
  return domains.filter((d) => d.fold.includes(fq) || (d.fold.length >= 3 && fq.includes(d.fold)) ||
    (compact.length >= 3 && d.domain.replace(/[^a-z0-9]/g, "").includes(compact)))
    .sort((a, b) => b.count - a.count).slice(0, 8);
}

// Recherche élargie : tous les articles lus par Prisme dans l'édition (48 h), y compris ceux d'un média nommé.
async function searchLocal(q, region) {
  const idx = await articlesOf(region);
  const words = foldText(q).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
  const outlets = new Set(matchOutlets(idx.domains, q).map((d) => d.domain));
  const articles = idx.items.filter((a) => outlets.has(a.domain) || (words.length && words.every((w) => a.fold.includes(w))));
  articles.sort((a, b) => (b.published || "").localeCompare(a.published || ""));
  return { query: q, articles: articles.slice(0, 300) };
}

/* ---------- Routes ---------- */
function parseRoute() {
  const p = new URLSearchParams(location.search);
  const r = REGIONS.some(([v]) => v === p.get("r")) ? p.get("r") : state.region;
  if (p.get("h")) return { view: "story", id: p.get("h"), region: r };
  if (p.get("q")) return { view: "search", q: p.get("q").trim().slice(0, 120), region: r };
  if (p.get("v") === "proprietaires") return { view: "owners", region: r };
  if (p.get("v") === "moi") return { view: "me", region: r };
  if (["matin", "videos", "quiz"].includes(p.get("v"))) return { view: p.get("v"), region: r };
  if (p.get("m")) return { view: "outlet", m: p.get("m").toLowerCase(), region: r };
  const cat = CATS.some(([v]) => v === p.get("c")) ? p.get("c") : "une";
  const lens = p.get("l") in LENSES ? p.get("l") : "essentiel";
  return { view: "feed", cat, lens, region: r };
}

function href(o = {}) {
  const p = new URLSearchParams();
  const r = o.region || state.region;
  if (o.h) p.set("h", o.h);
  else if (o.q) p.set("q", o.q);
  else if (o.v) p.set("v", o.v);
  else if (o.m) p.set("m", o.m);
  else {
    if (o.cat && o.cat !== "une") p.set("c", o.cat);
    if (o.lens && o.lens !== "essentiel") p.set("l", o.lens);
  }
  if (r !== "qc") p.set("r", r);
  const s = p.toString();
  return s ? `?${s}` : "./";
}

function go(url, { replace = false } = {}) {
  history.replaceState({ ...(history.state || {}), y: scrollY }, "");
  history[replace ? "replaceState" : "pushState"]({ y: 0 }, "", url);
  render({ scroll: 0 });
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-nav]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  go(a.getAttribute("href"));
});
addEventListener("popstate", () => render({ scroll: history.state?.y || 0 }));

function render({ scroll = 0 } = {}) {
  const route = parseRoute();
  state.route = route;
  if (route.region !== state.region) { state.region = route.region; store.set("region", route.region); }
  state.observer?.disconnect();
  state.onScroll = null;
  renderChrome(route);
  const v = $("#view");
  if (route.view === "story") viewStory(v, route);
  else if (route.view === "search") viewSearch(v, route);
  else if (route.view === "owners") viewOwners(v);
  else if (route.view === "me") viewMe(v);
  else if (route.view === "matin") viewMatin(v);
  else if (route.view === "videos") viewVideos(v);
  else if (route.view === "quiz") viewQuiz(v);
  else if (route.view === "outlet") viewOutlet(v, route);
  else viewFeed(v, route);
  requestAnimationFrame(() => scrollTo(0, scroll));
}

/* ---------- Bandeau et rubriques ---------- */
const PAGES = [["matin", "Le matin"], ["videos", "Vidéos"], ["moi", "Mon prisme"], ["proprietaires", "Qui possède quoi"], ["quiz", "Devine le média"]];
const ICON = {
  une: '<path d="M4 5h13v14H5a1 1 0 0 1-1-1V5Z"/><path d="M17 9h3v9a1 1 0 0 1-1 1h-2M7 9h7M7 12h7M7 15h4"/>',
  matin: '<circle cx="12" cy="14" r="4"/><path d="M12 4v3M4.9 8.9l2 2M19.1 8.9l-2 2M2 18h20M3 14h2M19 14h2"/>',
  videos: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m10 9 5 3-5 3Z"/>',
  moi: '<path d="M12 4 20 19H4Z"/><path d="M14 13l7-3M14.5 14.5 21 14M15 16l6 3"/>',
  plus: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  proprietaires: '<circle cx="12" cy="6" r="2.5"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="M12 8.5v3M12 11.5 6.5 15.7M12 11.5l5.5 4.2"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  theme: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  install: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M12 7v7M9 11l3 3 3-3M10.5 18.5h3"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
const routePage = (r) => ({ me: "moi", owners: "proprietaires", matin: "matin", videos: "videos", quiz: "quiz" }[r.view] || null);

function renderChrome(route) {
  const page = routePage(route);
  $("#mastLinks").innerHTML = PAGES.map(([v, l]) => `<a href="${href({ v })}" data-nav ${page === v ? 'aria-current="page"' : ""}>${l}</a>`).join("");
  $("#editionSel").innerHTML = REGIONS.map(([v, l]) => `<option value="${v}" ${v === state.region ? "selected" : ""}>${l}</option>`).join("");
  $("#cats").innerHTML = CATS.map(([v, l]) => `<a href="${href({ cat: v, lens: route.view === "feed" ? route.lens : undefined })}" data-nav ${route.view === "feed" && route.cat === v ? 'aria-current="page"' : ""}>${l}</a>`).join("");
  const onUne = ["feed", "story", "search", "outlet"].includes(route.view);
  const alerts = alertCount();
  $("#tabbar").innerHTML = `
    <a href="${href({})}" data-nav ${onUne ? 'aria-current="page"' : ""}>${svg("une")}À la une${alerts ? `<span class="dot">${alerts}</span>` : ""}</a>
    <a href="${href({ v: "matin" })}" data-nav ${page === "matin" ? 'aria-current="page"' : ""}>${svg("matin")}Le matin</a>
    <a href="${href({ v: "videos" })}" data-nav ${page === "videos" ? 'aria-current="page"' : ""}>${svg("videos")}Vidéos</a>
    <a href="${href({ v: "moi" })}" data-nav ${page === "moi" ? 'aria-current="page"' : ""}>${svg("moi")}Mon prisme</a>
    <button type="button" id="moreBtnTab" ${["proprietaires", "quiz"].includes(page) ? 'aria-current="page"' : ""}>${svg("plus")}Plus</button>`;
  $("#moreBtnTab").onclick = openMoreSheet;
  // Garde visible la rubrique choisie dans la barre défilante (téléphone).
  const el = $("#cats [aria-current]");
  if (el) {
    const bar = el.parentElement;
    if (el.offsetLeft + el.offsetWidth > bar.scrollLeft + bar.clientWidth || el.offsetLeft < bar.scrollLeft) bar.scrollLeft = el.offsetLeft - 16;
  }
  $("#search").q.value = route.view === "search" ? route.q : "";
  $("#sections").hidden = !["feed", "search", "story", "outlet"].includes(route.view) && innerWidth < 761;
  topbarSize();
  document.title = route.view === "feed" ? (route.cat === "une" ? "Prisme" : `${CAT_LABEL[route.cat]} — Prisme`) : document.title;
}

$("#editionSel").addEventListener("change", (e) => {
  state.region = e.target.value;
  store.set("region", state.region);
  const r = state.route;
  const page = routePage(r);
  go(href(r.view === "search" ? { q: r.q } : page ? { v: page } : r.view === "story" ? {} : { cat: r.cat, lens: r.lens }));
});

/* ---------- Feuille « Plus » et installation sur l'écran d'accueil ---------- */
let installEvt = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function installBlock() {
  if (isStandalone()) return "";
  if (installEvt) return `<li><button type="button" id="installBtn">${svg("install")}<span>Installer Prisme sur l'écran d'accueil<small>Une icône comme une vraie app, en plein écran.</small></span></button></li>`;
  if (isIOS()) return `<li><div class="install-hint"><b>Installer sur l'iPhone :</b> dans Safari, touche le bouton <b>Partager</b> (le carré avec la flèche), puis <b>« Sur l'écran d'accueil »</b>.</div></li>`;
  return `<li><div class="install-hint"><b>Installer sur Android :</b> dans Chrome, ouvre le menu <b>⋮</b>, puis <b>« Ajouter à l'écran d'accueil »</b> ou <b>« Installer l'application »</b>.</div></li>`;
}

function openMoreSheet() {
  openModal(`<div class="modal-pad">
    <div class="kicker">Prisme</div>
    <h2>Plus</h2>
    <ul class="sheet-list">
      <li><a href="${href({ v: "proprietaires" })}" data-nav data-close-modal>${svg("proprietaires")}<span>Qui possède quoi<small>Les médias regroupés par propriétaire, et la toile des familles.</small></span></a></li>
      <li><a href="${href({ v: "quiz" })}" data-nav data-close-modal>${svg("quiz")}<span>Devine le média<small>Un titre : gauche, centre ou droite ?</small></span></a></li>
      <li><button type="button" data-about>${svg("about")}<span>Comment Prisme choisit<small>Les sources, les lentilles et les limites.</small></span></button></li>
      <li><button type="button" id="sheetTheme">${svg("theme")}<span>Thème clair ou sombre</span></button></li>
      ${installBlock()}
    </ul>
  </div>`, true);
  $("#sheetTheme").onclick = () => $("#themeBtn").click();
  const ib = $("#installBtn");
  if (ib) ib.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => null); installEvt = null; closeLayer("#modal"); };
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-close-modal]")) closeLayer("#modal"); });

/* ---------- Le haut de page reste à portée de main ---------- */
function topbarSize() { document.documentElement.style.setProperty("--top-h", `${$("#topbar").offsetHeight}px`); }
{
  const bar = $("#topbar");
  let lastY = scrollY;
  addEventListener("scroll", () => {
    const y = scrollY, dy = y - lastY;
    lastY = y;
    // Plus mince une fois qu'on est descendu (deux seuils pour ne pas clignoter).
    if (y > 140) bar.classList.add("compact"); else if (y < 40) bar.classList.remove("compact");
    // Téléphone : se range quand on descend, revient dès qu'on remonte.
    if (innerWidth > 760 || y < 160 || bar.contains(document.activeElement)) bar.classList.remove("tucked");
    else if (dy > 8) bar.classList.add("tucked");
    else if (dy < -6) bar.classList.remove("tucked");
  }, { passive: true });
  addEventListener("resize", topbarSize);
  bar.addEventListener("transitionend", topbarSize);
}

/* ---------- Recherche : suggestions pendant qu'on tape ---------- */
const recent = {
  list() { try { return JSON.parse(store.get("recent", "[]")); } catch { return []; } },
  add(q) { store.set("recent", JSON.stringify([q, ...this.list().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8))); },
  clear() { store.set("recent", "[]"); },
};
const SG_ICON = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  all: '<path d="M4 6h16M4 12h16M4 18h10"/>',
};
const sgIcon = (k) => `<svg class="sg-ico" viewBox="0 0 24 24" aria-hidden="true">${SG_ICON[k]}</svg>`;
// Met en gras les mots cherchés dans un titre (sans tenir compte des accents).
function markWords(text, words) {
  const f = foldText(text);
  if (f.length !== text.length || !words.length) return esc(text);
  const hit = new Uint8Array(text.length);
  for (const w of words) { let i = f.indexOf(w); while (i >= 0) { hit.fill(1, i, i + w.length); i = f.indexOf(w, i + w.length); } }
  let out = "", on = false;
  for (let i = 0; i < text.length; i++) {
    if (hit[i] !== +on) { out += on ? "</mark>" : "<mark>"; on = !on; }
    out += esc(text[i]);
  }
  return out + (on ? "</mark>" : "");
}

{
  const form = $("#search"), input = form.q, box = $("#suggest");
  let token = 0;
  const open = (html) => { box.innerHTML = html; box.hidden = false; input.setAttribute("aria-expanded", "true"); };
  const close = () => { box.hidden = true; input.setAttribute("aria-expanded", "false"); };
  const searchFor = (q, wide = false) => {
    q = q.trim();
    if (q.length < 2) return;
    recent.add(q);
    if (wide) state.pendingWide = q;
    close();
    input.blur();
    go(href({ q }));
  };
  const item = (attrs, inner) => `<a class="sg" role="option" ${attrs}>${inner}</a>`;
  const sgSearch = (q, icon, sub = "") => item(`href="${href({ q })}" data-q="${esc(q)}"`, `${sgIcon(icon)}<span class="sg-main">${esc(q)}${sub ? `<small>${sub}</small>` : ""}</span>`);

  async function suggest() {
    const my = ++token;
    const q = input.value.trim(), fq = foldText(q).trim();
    const ed = await edition(state.region).catch(() => null);
    if (my !== token) return;
    const trending = ed?.trending || [];
    if (fq.length < 2) {
      const rec = recent.list(), mine = topics.list();
      open(`${rec.length ? `<div class="sg-h">Recherches récentes <button type="button" data-clear>Effacer</button></div>${rec.slice(0, 5).map((t) => sgSearch(t, "clock")).join("")}` : ""}
        ${mine.length ? `<div class="sg-h">Mes sujets</div>${mine.slice(0, 5).map((t) => sgSearch(t, "star")).join("")}` : ""}
        ${trending.length ? `<div class="sg-h">En ce moment</div>${trending.slice(0, 7).map((t) => sgSearch(t, "trend")).join("")}` : ""}
        <p class="sg-tips">Cherche un sujet (une personne, une ville, un enjeu) ou le nom d'un média, comme « TVA » ou « Le Devoir ».</p>`);
      return;
    }
    const words = fq.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
    const themes = [...new Set([...topics.list(), ...recent.list(), ...trending])].filter((t) => foldText(t).includes(fq) && foldText(t) !== fq).slice(0, 3);
    const stories = (ed?.stories || []).filter((s) => words.length && words.every((w) => foldText(s.title).includes(w)))
      .sort((a, b) => b.sources - a.sources).slice(0, 4);
    const draw = (outlets) => {
      if (my !== token) return;
      open(`${sgSearch(q, "search", "Les histoires sur ce sujet")}
        ${themes.map((t) => sgSearch(t, "trend")).join("")}
        ${outlets.length ? `<div class="sg-h">Médias</div>${outlets.map((d) => item(`href="${href({ m: d.domain })}" data-nav`,
          `${favicon(d.domain, d.name)}<span class="sg-main" data-no-tr><b>${markWords(d.name, words)}</b><small>${d.media.known ? esc(d.media.owner.replace(/\s*\(.*\)$/, "")) : esc(d.domain)}</small></span><span class="sg-side">${badge(d.media)}</span>`)).join("")}` : ""}
        ${stories.length ? `<div class="sg-h">Histoires</div>${stories.map((s) => item(`href="${href({ h: s.id })}" data-nav`,
          `<span class="sg-main"><span class="sg-t" data-no-tr>${markWords(s.title, words)}</span><small>${plural(s.sources, "média")} ${s.sources > 1 ? "en parlent" : "en parle"} · ${esc(ago(s.lastSeen || s.firstSeen))}</small></span>`)).join("")}` : ""}
        ${item(`href="${href({ q })}" data-q="${esc(q)}" data-wide`, `${sgIcon("all")}<span class="sg-main">Chercher « ${esc(q)} » dans tous les articles (48 h)</span>`).replace('class="sg"', 'class="sg sg-all"')}`);
    };
    draw([]);
    articlesOf(state.region).then((idx) => draw(matchOutlets(idx.domains, q).slice(0, 4))).catch(() => {});
  }

  input.addEventListener("focus", () => { suggest(); articlesOf(state.region).catch(() => {}); });
  input.addEventListener("input", suggest);
  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    const opts = $$(".sg", box), cur = opts.findIndex((o) => o.getAttribute("aria-selected") === "true");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = opts[(cur + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length];
      opts.forEach((o) => o.setAttribute("aria-selected", o === next));
      next?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && cur >= 0) {
      e.preventDefault();
      opts[cur].click();
    } else if (e.key === "Escape") { close(); }
  });
  // Un clic dans la liste ne doit pas fermer la liste avant d'être reçu.
  box.addEventListener("mousedown", (e) => e.preventDefault());
  box.addEventListener("click", (e) => {
    if (e.target.closest("[data-clear]")) { recent.clear(); suggest(); return; }
    const a = e.target.closest(".sg");
    if (!a) return;
    if (a.dataset.q) { e.preventDefault(); e.stopPropagation(); searchFor(a.dataset.q, a.hasAttribute("data-wide")); return; }
    close();
    input.blur();
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    searchFor(input.value);
  });
}

/* ---------- Petits morceaux ---------- */
function bar(counts, lg = false) {
  const total = ORDER.reduce((s, k) => s + (counts[k] || 0), 0) || 1;
  return `<div class="bar${lg ? " lg" : ""}" role="img" aria-label="${esc(splitText(counts))}">${ORDER.filter((k) => counts[k]).map((k) =>
    `<span class="${k === "unk" ? "unk" : ""}" style="flex:${counts[k]};${k === "unk" ? "" : `background:${BIAS[k].color}`}" title="${BIAS[k].label} : ${counts[k]}"></span>`).join("")}</div>`;
}
function sides(counts) {
  return { left: (counts.l2 || 0) + (counts.l1 || 0), center: counts.c || 0, right: (counts.r1 || 0) + (counts.r2 || 0) };
}
function splitText(counts) {
  const s = sides(counts);
  return `Gauche ${s.left}, centre ${s.center}, droite ${s.right}`;
}
// Le décompte en mots : « Gauche 2 · Centre 1 · Droite 0 ».
function splitHtml(counts) {
  const s = sides(counts);
  const part = (cls, label, n) => `<span class="sl ${cls}${n ? "" : " zero"}"><i></i>${label} <b>${n}</b></span>`;
  return `<span class="split">${part("l", "Gauche", s.left)}${part("c", "Centre", s.center)}${part("r", "Droite", s.right)}${counts.state ? part("s", "État", counts.state) : ""}</span>`;
}

// La grande barre : chaque côté porte son nom et son pourcentage.
function bigBar(counts, { rated = false } = {}) {
  const s = sides(counts);
  const parts = [["l", "Gauche", s.left], ["c", "Centre", s.center], ["r", "Droite", s.right]];
  if (!rated) parts.push(["s", "État", counts.state || 0], ["u", "Non évalués", counts.unk || 0]);
  const shown = parts.filter((p) => p[2]);
  const tot = shown.reduce((a, p) => a + p[2], 0) || 1;
  if (!shown.length) return `<div class="bigbar empty"><span class="seg u" style="flex:1"><em>Aucun média évalué</em></span></div>`;
  return `<div class="bigbar" role="img" aria-label="${esc(splitText(counts))}">${shown.map(([c, l, n]) =>
    `<span class="seg ${c}" style="flex:${n}" title="${l} : ${n}"><span class="in"><em>${l}</em> <b>${Math.round((n / tot) * 100)} %</b></span></span>`).join("")}</div>`;
}

// Légende permanente des couleurs.
function legend() {
  return `<div class="legend" aria-label="Légende des couleurs">${["l2", "l1", "c", "r1", "r2", "state", "unk"].map((k) => `<span class="bb bb-${k}">${BIAS[k].label}</span>`).join("")}</div>`;
}

// Pourquoi cette histoire est là : la règle, en clair.
function reason(s) {
  const parts = [`<b>${plural(s.sources, "média")}</b> ${s.sources > 1 ? "en parlent" : "en parle"}`];
  if (s.sides === 3) parts.push("des 3 côtés");
  else if (s.sides === 2) parts.push("2 côtés");
  parts.push(ago(s.lastSeen || s.firstSeen));
  return parts.join(" · ");
}
function flags(s) {
  const out = [];
  if (s.blindspot === "right") out.push(`<span class="flag r" title="Moins de 15 % des médias évalués qui couvrent cette histoire sont à droite">Peu couvert à droite</span>`);
  if (s.blindspot === "left") out.push(`<span class="flag l" title="Moins de 15 % des médias évalués qui couvrent cette histoire sont à gauche">Peu couvert à gauche</span>`);
  if (!s.blindspot && s.lean === "left" && s.split.pol >= 3) out.push(`<span class="flag l">Surtout à gauche</span>`);
  if (!s.blindspot && s.lean === "right" && s.split.pol >= 3) out.push(`<span class="flag r">Surtout à droite</span>`);
  if (s.counts.state) out.push(`<span class="flag s">Médias d'État</span>`);
  return out.join("");
}
function favRow(s, max = 6) {
  const seen = new Set(), list = [];
  for (const a of s.articles) if (!seen.has(a.domain)) { seen.add(a.domain); list.push(a); }
  return `<span class="favs">${list.slice(0, max).map((a) => favicon(a.domain, a.sourceName)).join("")}${list.length > max ? `<span class="more">+${list.length - max}</span>` : ""}</span>`;
}
// « Couvert par La Presse, Radio-Canada, Le Devoir et 4 autres » : les médias de l'histoire, nommés en clair.
// Les médias connus passent devant ; chaque nom mène à la page du média.
function coveredBy(s, max = 3) {
  const seen = new Set(), list = [];
  for (const a of s.articles) if (!seen.has(a.domain)) { seen.add(a.domain); list.push(a); }
  const named = [...list].sort((a, b) => (b.media?.known ? 1 : 0) - (a.media?.known ? 1 : 0)).slice(0, max);
  const rest = Math.max(0, s.sources - named.length);
  return `<p class="covered">${favRow(s, 5)}<span>Couvert par <span data-no-tr>${named.map((a) =>
    `<a href="${href({ m: a.domain })}" data-nav>${esc(a.sourceName)}</a>`).join(", ")}</span>${rest ? ` et ${rest} ${rest > 1 ? "autres" : "autre"}` : ""}</span></p>`;
}
const catKicker = (s, cat) => {
  const c = s.categories?.find((x) => x !== cat) || s.categories?.[0];
  return c ? `${esc(CAT_LABEL[c] || c)} · ` : "";
};

function storyRow(s, cat) {
  const link = href({ h: s.id });
  return `<article class="story${s.image ? "" : " noimg"}">
    <div>
      <div class="kicker">${catKicker(s, cat)}${reason(s)} ${langTag(s.lang)}</div>
      <h3 data-no-tr><a href="${link}" data-nav>${esc(s.title)}</a></h3>
      ${s.summary ? `<p class="dek" data-no-tr>${esc(s.summary)}</p>` : ""}
      ${coveredBy(s)}
      <div class="story-foot">${bar(s.counts)}${splitHtml(s.counts)}${flags(s)}${s.articles.some((a) => reads.has(a.url)) ? `<span class="flag read">Lu</span>` : ""}</div>
    </div>
    ${s.image ? `<a class="thumb" href="${link}" data-nav tabindex="-1" aria-hidden="true"><img src="${esc(safeUrl(s.image))}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>` : ""}
  </article>`;
}

function pickBySide(s) {
  const out = {};
  for (const side of SIDES) {
    const list = s.articles.filter((a) => side.keys.includes(biasKey(a.media)));
    out[side.key] = list.sort((a, b) => (b.published || "").localeCompare(a.published || ""))[0] || null;
  }
  return out;
}

function leadStory(s, cat) {
  const link = href({ h: s.id });
  const by = pickBySide(s);
  return `<article class="lead${s.image ? "" : " noimg"}">
    ${s.image ? `<a class="lead-media" href="${link}" data-nav tabindex="-1" aria-hidden="true"><img src="${esc(safeUrl(s.image))}" alt="" referrerpolicy="no-referrer"><span class="credit">${esc(s.imageSource || "")}</span></a>` : ""}
    <div>
      <div class="kicker">${catKicker(s, cat)}${reason(s)}</div>
      <h2 data-no-tr><a href="${link}" data-nav>${esc(s.title)}</a></h2>
      ${s.summary ? `<p class="dek" data-no-tr>${esc(s.summary)}</p><p class="dek-src">Résumé : ${esc(s.summarySource || "")}</p>` : ""}
      ${coveredBy(s, 4)}
      ${bigBar(s.counts)}
      <div class="story-foot">${splitHtml(s.counts)}${flags(s)}</div>
      <div class="angles3">${SIDES.map((side) => {
        const a = by[side.key];
        return `<div><div class="side"><i style="background:${side.color}"></i>${side.label}</div>
          ${a ? `${artLink(a)}<div class="by">${esc(a.sourceName)} ${badge(a.media)}</div>`
            : `<div class="none">Aucun média de ${side.label.toLowerCase()} lu par Prisme n'en parle.</div>`}</div>`;
      }).join("")}</div>
    </div>
  </article>`;
}

/* ---------- Le fil ---------- */
// Montrée une seule fois : comment lire un bloc du fil.
const HOWTO = `<aside class="howto" aria-label="Comment lire Prisme">
  <div class="howto-h"><span class="kicker">Comment lire Prisme</span><button class="btn" type="button" id="howtoOk">Compris</button></div>
  <ol>
    <li><b>Chaque bloc est une histoire</b>, pas un article : un même évènement, raconté par plusieurs médias. Prisme regroupe leurs articles.</li>
    <li><b>« 6 médias en parlent »</b> : six médias différents ont publié un article sur cette histoire. Leurs noms sont écrits en dessous (« Couvert par… ») ; touche un nom pour voir ce média.</li>
    <li><b>La barre de couleur</b> montre d'où viennent ces médias : <span class="sw-l">gauche</span>, <span class="sw-c">centre</span>, <span class="sw-r">droite</span>.</li>
    <li><b>Touche le titre</b> pour comparer : chaque article, média par média, les mots de chaque côté et qui possède ces médias.</li>
  </ol>
</aside>`;
const feedKey = (r) => (r.q ? `q|${r.q.toLowerCase()}|${state.region}` : `f|${r.cat}|${r.lens}|${state.region}`);

function viewFeed(v, route) {
  const key = feedKey(route);
  const lensHtml = `<div class="lensbar">
      <span class="label">Voir par</span>
      <div class="lenses" role="group" aria-label="Lentille">${Object.entries(LENSES).map(([k, l]) =>
        `<button type="button" data-lens="${k}" aria-pressed="${route.lens === k}">${l.sw ? `<span class="sw" style="background:${l.sw}"></span>` : ""}${l.label}</button>`).join("")}</div>
      <p class="lens-desc">${esc(LENSES[route.lens].desc)}</p>
      <div class="legend-row"><span class="label">Orientation des médias</span>${legend()}</div>
    </div>`;
  v.innerHTML = `${folio(esc(CAT_LABEL[route.cat]), regionLabel())}${lensHtml}
    <div class="topics" id="topics"></div>
    <div class="layout">
      <div class="main-col">${store.get("howto") ? "" : HOWTO}<div id="feed"></div><div id="sentinel"></div><div id="feedStatus"></div></div>
      <aside class="rail" aria-label="Autour du fil"><div class="rail-in" id="rail"></div></aside>
    </div>`;
  const ht = $("#howtoOk", v);
  if (ht) ht.onclick = () => { store.set("howto", "1"); $(".howto", v)?.remove(); };
  $(".lenses", v).onclick = (e) => {
    const b = e.target.closest("[data-lens]");
    if (b) go(href({ cat: route.cat, lens: b.dataset.lens }));
  };
  mountFeed(key, { cat: route.cat, lens: route.lens });
}

function mountFeed(key, params) {
  let f = state.feeds.get(key);
  if (!f) { f = { stories: [], page: -1, hasMore: true, loading: false, params }; state.feeds.set(key, f); }
  drawFeed(f);
  if (f.page < 0) loadMore(key);
  const sentinel = $("#sentinel");
  state.observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) loadMore(key);
  }, { rootMargin: "1200px 0px" });
  state.observer.observe(sentinel);
  // Filet de sécurité : certains navigateurs mettent l'observateur en pause (onglet caché, économie d'énergie).
  state.onScroll = () => { if (sentinel.isConnected && sentinel.getBoundingClientRect().top < innerHeight + 1200) loadMore(key); };
}
addEventListener("scroll", () => state.onScroll?.(), { passive: true });

async function loadMore(key) {
  const f = state.feeds.get(key);
  if (!f || f.loading || !f.hasMore) return;
  f.loading = true;
  drawStatus(f);
  const p = new URLSearchParams({ region: state.region, page: String(f.page + 1) });
  if (f.params.q) p.set("q", f.params.q);
  else { p.set("cat", f.params.cat); p.set("lens", f.params.lens); }
  try {
    const d = await api(`/api/feed?${p}`);
    f.page = d.page;
    f.hasMore = d.hasMore;
    if (d.summary) { f.summary = d.summary; f.trending = d.trending; f.total = d.total; }
    const fresh = d.stories.filter((s) => !f.stories.some((x) => x.id === s.id));
    for (const s of fresh) state.stories.set(s.id, s);
    f.stories.push(...fresh);
    f.error = null;
    // Ouvrir un sujet suivi le marque comme lu pour les alertes.
    if (f.params.q && d.page === 0 && topics.has(f.params.q)) { markTopicSeen(f.params.q, d.stories.map((s) => s.id)); renderChrome(state.route); }
  } catch (e) {
    f.error = e.message;
    f.hasMore = false;
  }
  f.loading = false;
  if (feedKey(state.route) === key) {
    if (f.page === 0 || $("#feed")?.dataset.count === "0") drawFeed(f);
    else appendFeed(f);
    // Si la page est encore courte, on continue de remplir.
    const s = $("#sentinel");
    if (f.hasMore && s && s.getBoundingClientRect().top < innerHeight + 1200) loadMore(key);
  }
}

function drawFeed(f) {
  const el = $("#feed");
  if (!el) return;
  const cat = f.params.cat;
  if (!f.stories.length) {
    el.dataset.count = "0";
    el.innerHTML = f.page < 0 || f.loading ? skeleton() : "";
  } else {
    el.dataset.count = String(f.stories.length);
    const [first, ...rest] = f.stories;
    el.innerHTML = leadStory(first, cat) + rest.map((s) => storyRow(s, cat)).join("");
  }
  drawStatus(f);
  drawTopics(f);
  drawRail(f);
}

function appendFeed(f) {
  const el = $("#feed");
  const shown = Number(el.dataset.count || 0);
  el.insertAdjacentHTML("beforeend", f.stories.slice(shown).map((s) => storyRow(s, f.params.cat)).join(""));
  el.dataset.count = String(f.stories.length);
  drawStatus(f);
}

function drawStatus(f) {
  const el = $("#feedStatus");
  if (!el) return;
  if (f.loading && f.stories.length) el.innerHTML = `<div class="loader">Chargement des histoires suivantes…</div>`;
  else if (f.error) el.innerHTML = `<div class="empty"><h3>Le fil n'a pas pu se charger.</h3><p>${esc(f.error)}</p><button class="btn ghost" type="button" id="retry">Réessayer</button></div>`;
  else if (!f.hasMore && !f.stories.length && !f.loading) el.innerHTML = emptyFeed(f);
  else if (!f.hasMore && f.stories.length) el.innerHTML = `<div class="end">C'est tout pour cette lentille. ${f.params.q ? "" : `Essaie <a class="link" href="${href({ cat: f.params.cat, lens: "recent" })}" data-nav>En continu</a> pour tout voir.`}</div>`;
  else if (f.hasMore && f.stories.length) el.innerHTML = `<div class="more-row"><button class="btn ghost" type="button" id="moreBtn">Plus d'histoires</button></div>`;
  else el.innerHTML = "";
  const retry = $("#retry", el);
  if (retry) retry.onclick = () => { f.error = null; f.hasMore = true; loadMore(feedKey(state.route)); };
  const more = $("#moreBtn", el);
  if (more) more.onclick = () => loadMore(feedKey(state.route));
}

function emptyFeed(f) {
  if (f.params.q) return "";
  const lens = LENSES[f.params.lens];
  return `<div class="empty"><h3>Rien dans « ${esc(lens.label)} » pour l'instant.</h3>
    <p>${f.params.lens === "angles" ? "Aucune histoire n'est assez couverte d'un seul côté en ce moment. C'est plutôt bon signe." : "Essaie une autre lentille ou une autre édition."}</p>
    <a class="btn ghost" href="${href({ cat: f.params.cat, lens: "essentiel" })}" data-nav>Revenir à L'essentiel</a></div>`;
}

function skeleton() {
  const line = (w, h = 14, m = 10) => `<div class="skel" style="height:${h}px;width:${w}%;margin-top:${m}px"></div>`;
  return `<div class="lead"><div class="skel" style="aspect-ratio:4/3"></div><div>${line(40, 12, 0)}${line(95, 34, 14)}${line(80, 34, 8)}${line(100, 14, 18)}${line(90)}${line(100, 12, 22)}</div></div>`
    + `<div class="story noimg"><div>${line(30, 11, 0)}${line(85, 22, 12)}${line(100)}${line(60)}</div></div>`.repeat(3);
}

// Un sujet suivi, avec le nombre de nouvelles histoires depuis la dernière visite.
const topicChip = (t) => { const n = alerts.counts[t.toLowerCase()] || 0; return `<a class="chip star" href="${href({ q: t })}" data-nav>${esc(t)}${n ? `<b class="new" title="Nouvelles histoires">${n}</b>` : ""}</a>`; };

function drawTopics(f) {
  const el = $("#topics");
  if (!el) return;
  const mine = topics.list();
  const trend = (f.trending || []).filter((t) => !mine.some((m) => m.toLowerCase() === t.toLowerCase())).slice(0, 10);
  el.innerHTML = `${mine.length ? `<span class="label">Mes sujets</span>${mine.map(topicChip).join("")}<span style="width:12px"></span>` : ""}
    ${trend.length ? `<span class="label">En ce moment</span>${trend.map((t) => `<a class="chip" href="${href({ q: t })}" data-nav>${esc(t)}</a>`).join("")}` : f.loading ? `<span class="label">En ce moment</span><span class="skel" style="width:280px;height:24px;display:inline-block"></span>` : ""}`;
  el.hidden = !mine.length && !trend.length && !f.loading;
}

function drawRail(f) {
  const el = $("#rail");
  if (!el) return;
  const sm = f.summary;
  const blinds = f.stories.filter((s) => s.blindspot).slice(0, 4);
  const maxOwner = sm?.owners?.[0]?.n || 1;
  el.innerHTML = `
    ${meCard()}
    <section>
      <h2 class="block-h">Mes sujets <small>sur cet appareil</small></h2>
      ${topics.list().length ? `<div class="chips">${topics.list().map(topicChip).join("")}</div>`
        : `<p class="note" style="margin-top:0">Suis un sujet (une personne, une ville, un enjeu) pour le retrouver ici en un clic.</p>`}
      <form class="add-topic" id="addTopic"><input name="t" placeholder="ex. Hydro-Québec" aria-label="Ajouter un sujet" maxlength="60"><button class="btn" type="submit">Suivre</button></form>
      ${topics.list().length && "Notification" in window && Notification.permission === "default" ? `<button class="link small" type="button" id="notifBtn" style="margin-top:10px">Recevoir une alerte quand un de mes sujets bouge</button>` : ""}
      ${topics.list().length && "Notification" in window && Notification.permission === "granted" ? `<p class="note">Alertes activées pour tes sujets.</p>` : ""}
    </section>
    ${blinds.length && f.params.lens !== "angles" ? `<section>
      <h2 class="block-h">Angles morts <small>dans ce fil</small></h2>
      <ul class="mini-stories">${blinds.map((s) => `<li><span class="flag ${s.blindspot === "right" ? "r" : "l"}">Peu couvert ${s.blindspot === "right" ? "à droite" : "à gauche"}</span>
        <a href="${href({ h: s.id })}" data-nav>${esc(s.title)}</a>${bar(s.counts)}</li>`).join("")}</ul>
    </section>` : ""}
    ${sm ? `<section>
      <h2 class="block-h">Qui possède ce fil <small>${plural(sm.outlets, "média")}</small></h2>
      <ul class="rank">${sm.owners.map((o) => `<li><span class="nm">${esc(o.owner.replace(/\s*\(.*\)$/, ""))}</span><span class="n">${plural(o.n, "histoire")}</span><span class="track"><span style="width:${(o.n / maxOwner) * 100}%"></span></span></li>`).join("")}</ul>
      <p class="note">Nombre d'histoires de ce fil où chaque propriétaire a au moins un média.</p>
    </section>
    <section>
      <h2 class="block-h">Les médias du fil <small>médias évalués</small></h2>
      ${bigBar(sm.counts, { rated: true })}
      <div style="margin-top:8px">${splitHtml(sm.counts)}</div>
      <p class="note">${sm.counts.unk ? `${plural(sm.counts.unk, "autre média", "autres médias")} non évalués. ` : ""}${plural(sm.sourcesOnline, "média lu", "médias lus")} directement par Prisme dans cette édition. <button class="link" type="button" data-about>Comment Prisme choisit</button></p>
    </section>` : ""}`;
  const nb = $("#notifBtn", el);
  if (nb) nb.onclick = async () => { await Notification.requestPermission(); drawRail(f); };
  $("#addTopic", el).onsubmit = (e) => {
    e.preventDefault();
    const t = e.target.t.value.trim();
    if (t.length < 2) return;
    topics.add(t);
    go(href({ q: t }));
  };
}

/* ---------- Une histoire ---------- */
async function viewStory(v, route) {
  let s = state.stories.get(route.id);
  if (!s) {
    v.innerHTML = `<a class="back" href="./" data-nav>← Le fil</a><div class="s-head">${'<div class="skel" style="height:40px;width:80%;margin-top:16px"></div>'.repeat(2)}</div>`;
    try { s = (await api(`/api/feed?story=${encodeURIComponent(route.id)}&region=${state.region}`)).story; state.stories.set(s.id, s); }
    catch (e) { v.innerHTML = `<a class="back" href="./" data-nav>← Le fil</a><div class="empty"><h3>Histoire introuvable.</h3><p>${esc(e.message)}</p></div>`; return; }
    if (state.route.view !== "story" || state.route.id !== route.id) return;
  }
  document.title = `${s.title} — Prisme`;
  const sd = sides(s.counts);
  const pol = sd.left + sd.center + sd.right;
  const pct = (n) => (pol ? Math.round((n / pol) * 100) : 0);
  const groups = SIDES.map((side) => ({ ...side, items: s.articles.filter((a) => side.keys.includes(biasKey(a.media))) }));
  const others = s.articles.filter((a) => !sideOf(a.media));
  const owners = new Map();
  for (const a of s.articles) if (a.media.known) owners.set(a.media.owner, (owners.get(a.media.owner) || new Set()).add(a.domain));
  const ownerList = [...owners.entries()].map(([o, d]) => ({ owner: o, n: d.size })).sort((a, b) => b.n - a.n);
  const timeline = s.articles.filter((a) => a.published).sort((a, b) => a.published.localeCompare(b.published)).slice(0, 10);
  const back = history.length > 1 ? `<a class="back" href="./" id="backBtn">← Retour</a>` : `<a class="back" href="./" data-nav>← Le fil</a>`;

  const words = loadedWords(s);
  const marksFor = (a) => { const sd = sideOf(a.media); return sd === "left" ? words.leftSet : sd === "right" ? words.rightSet : null; };
  const hlItem = (a) => `<li>
    <div class="row"><button class="src" type="button" data-domain="${esc(a.domain)}" data-name="${esc(a.sourceName)}">${favicon(a.domain, a.sourceName)}<span>${esc(a.sourceName)}</span></button>${badge(a.media)}${langTag(a.lang)}<time>${esc(ago(a.published))}</time></div>
    ${artLink(a, "t", marksFor(a))} ${transLink(a)}
    ${a.prevTitle ? `<div class="was">Titre modifié · avant : <s>${esc(a.prevTitle)}</s></div>` : ""}
    ${a.media.known ? `<div class="own">${esc(a.media.owner)}</div>` : ""}
  </li>`;

  v.innerHTML = `${back}
    <div class="layout" style="padding-top:0">
      <div class="main-col">
        <header class="s-head">
          <div class="kicker">${(s.categories || []).map((c) => esc(CAT_LABEL[c] || c)).join(" · ") || "Histoire"} · ${reason(s)}${s.firstBy ? ` · révélée par <b>${esc(s.firstBy)}</b>` : ""}</div>
          <h1 data-no-tr>${esc(s.title)}</h1>
          ${s.summary ? `<p class="dek" data-no-tr>${esc(s.summary)}</p><p class="dek-src">Résumé : ${esc(s.summarySource || "")}</p>` : ""}
        </header>
        ${s.image ? `<figure class="s-hero"><img src="${esc(safeUrl(s.image))}" alt="" referrerpolicy="no-referrer"><span class="credit">${esc(s.imageSource || "")}</span></figure>` : ""}

        <section class="sec" id="sxSummary" hidden></section>

        <section class="sec">
          <h2 class="block-h">Qui couvre cette histoire <small>${plural(s.sources, "média")} · une voix par média</small></h2>
          ${bigBar(s.counts)}
          <div class="s-cov">${SIDES.map((side) => `<div><b>${pct(sd[side.key])} %</b><small><i style="background:${side.color}"></i>${side.label} · ${plural(sd[side.key], "média")}</small></div>`).join("")}</div>
          ${s.blindspot ? `<div class="callout ${s.blindspot === "right" ? "r" : "l"}"><b>ANGLE MORT.</b> Les médias de ${s.blindspot === "right" ? "droite" : "gauche"} en parlent très peu : ${pct(s.blindspot === "right" ? sd.right : sd.left)} % des médias évalués.</div>` : ""}
          ${s.counts.state ? `<div class="callout"><b>MÉDIAS D'ÉTAT.</b> ${plural(s.counts.state, "média contrôlé", "médias contrôlés")} par un gouvernement couvre${s.counts.state > 1 ? "nt" : ""} aussi cette histoire.</div>` : ""}
        </section>

        <section class="sec" id="sxSilent" hidden></section>

        <section class="sec">
          <h2 class="block-h">Comment ils le titrent</h2>
          ${words.left.length || words.right.length ? `<div class="words">
            <p class="note" style="margin:0 0 10px">Les mots surlignés n'apparaissent que d'un côté : c'est souvent là que se cache le cadrage.</p>
            <div class="words-cols">
              <div><span class="bb bb-l2">Mots de la gauche</span> ${words.left.map((w) => `<mark class="ml">${esc(w.w)}</mark>`).join(" ") || '<span class="muted small">aucun mot propre</span>'}</div>
              <div><span class="bb bb-r2">Mots de la droite</span> ${words.right.map((w) => `<mark class="mr">${esc(w.w)}</mark>`).join(" ") || '<span class="muted small">aucun mot propre</span>'}</div>
            </div>
          </div>` : ""}
          <div class="cols3">${groups.map((g) => `<section>
            <div class="col-h"><i style="background:${g.color}"></i>${g.label}<small>${plural(g.items.length, "article")}</small></div>
            ${g.items.length ? `<ul class="hl">${g.items.map(hlItem).join("")}</ul>` : `<div class="col-empty">Aucun média de ${g.label.toLowerCase()} lu par Prisme n'a couvert cette histoire.</div>`}
          </section>`).join("")}</div>
        </section>

        ${others.length ? `<section class="sec">
          <h2 class="block-h">Autres sources <small>médias d'État ou non évalués</small></h2>
          <ul class="hl">${others.map(hlItem).join("")}</ul>
        </section>` : ""}

        <section class="sec" id="sxWorld" hidden></section>
        <section class="sec" id="sxVideos" hidden></section>
        <section class="sec" id="sxChanged" hidden></section>
      </div>

      <aside class="rail"><div class="rail-in">
        <section>
          <h2 class="block-h">Qui possède ces médias</h2>
          ${ownerList.length ? `<ul class="rank">${ownerList.slice(0, 8).map((o) => `<li><span class="nm">${esc(o.owner.replace(/\s*\(.*\)$/, ""))}</span><span class="n">${plural(o.n, "média")}</span><span class="track"><span style="width:${(o.n / ownerList[0].n) * 100}%"></span></span></li>`).join("")}</ul>` : `<p class="note">Aucun propriétaire connu.</p>`}
        </section>
        ${timeline.length ? `<section>
          <h2 class="block-h">Chronologie <small>qui en a parlé en premier</small></h2>
          <ol class="timeline">${timeline.map((a) => `<li><time>${esc(clock(a.published))}</time><span><b>${esc(a.sourceName)}</b> ${tag(a.media)}</span></li>`).join("")}</ol>
        </section>` : ""}
        <section>
          <h2 class="block-h">Aller plus loin</h2>
          <p class="note" style="margin:0 0 10px">Cherche ce sujet dans tous les médias lus par Prisme, ou suis-le.</p>
          <div class="chips">${(s.keywords || keywordsOf(s)).slice(0, 4).map((k) => `<a class="chip" href="${href({ q: k })}" data-nav>${esc(k)}</a>`).join("")}</div>
        </section>
      </div></aside>
    </div>`;
  const b = $("#backBtn", v);
  if (b) b.onclick = (e) => { e.preventDefault(); history.back(); };
  storyExtras(s, hlItem);
}

const still = (id) => state.route.view === "story" && state.route.id === id;

// Les à-côtés d'une histoire, chargés après l'affichage.
async function storyExtras(s, hlItem) {
  // Résumé neutre (IA), seulement si une clé est configurée. Le palier gratuit est lent : on l'annonce.
  const sumEl = $("#sxSummary");
  const pending = setTimeout(() => {
    if (!sumEl || !still(s.id) || !sumEl.hidden || s.sources < 2) return;
    sumEl.hidden = false;
    sumEl.innerHTML = `<h2 class="block-h">Résumé neutre <small>écrit par IA à partir de tous les titres</small></h2><div class="ai"><p class="ai-wait">L'IA lit les ${plural(s.sources, "média")} et écrit un résumé neutre… (10 à 20 secondes la première fois)</p></div>`;
  }, 900);
  api(`/api/summary?id=${encodeURIComponent(s.id)}&region=${state.region}`).then((r) => {
    clearTimeout(pending);
    const el = $("#sxSummary");
    if (!el || !still(s.id)) return;
    if (!r.configured || (!r.summary && !r.error)) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = r.error ? `<h2 class="block-h">Résumé neutre</h2><p class="note">${esc(r.error)}</p>`
      : `<h2 class="block-h">Résumé neutre <small>écrit par IA (${esc(r.provider)}) à partir de tous les titres</small></h2>
        <div class="ai">
          <p class="ai-sum">${esc(r.summary)}</p>
          ${r.left ? `<p><span class="bb bb-l2">À gauche</span> ${esc(r.left)}</p>` : ""}
          ${r.right ? `<p><span class="bb bb-r2">À droite</span> ${esc(r.right)}</p>` : ""}
        </div>`;
  }).catch(() => {});

  // Silences, vu d'ailleurs, titres modifiés.
  api(`/api/feed?extra=${encodeURIComponent(s.id)}&region=${state.region}`).then((x) => {
    if (!still(s.id)) return;
    const silentEl = $("#sxSilent");
    if (s.sources >= 4 && x.silent.length) {
      const by = { left: [], center: [], right: [], other: [] };
      for (const m of x.silent) by[sideOf(m.media) || "other"].push(m);
      silentEl.hidden = false;
      silentEl.innerHTML = `<h2 class="block-h">Qui n'en parle pas <small>${plural(x.silent.length, "média actif", "médias actifs")} silencieux</small></h2>
        <p class="note" style="margin:0 0 10px">Ces médias publient beaucoup en ce moment, mais rien sur cette histoire dans leurs flux des dernières 48 heures. Ils peuvent en parler ailleurs (télé, papier, plus tard).</p>
        <div class="silent">${[["left", "Gauche", "bb-l2"], ["center", "Centre", "bb-c"], ["right", "Droite", "bb-r2"], ["other", "État ou non évalués", "bb-state"]].filter(([k]) => by[k].length).map(([k, l, cls]) =>
          `<div><span class="bb ${cls}">${l}</span> ${by[k].slice(0, 8).map((m) => `<button class="src" type="button" data-domain="${esc(m.domain)}" data-name="${esc(m.name)}">${favicon(m.domain, m.name)}<span>${esc(m.name)}</span></button>`).join("")}${by[k].length > 8 ? `<span class="muted small"> +${by[k].length - 8}</span>` : ""}</div>`).join("")}</div>`;
    }

    const zones = x.world.zones.filter((z) => z.articles.length);
    const worldEl = $("#sxWorld");
    if (zones.length >= 2 || (zones.length === 1 && zones[0].key !== ({ qc: "CA", ca: "CA", fr: "FR", us: "US", uk: "GB" }[state.region] || ""))) {
      worldEl.hidden = false;
      worldEl.innerHTML = `<h2 class="block-h">Vu d'ici, vu d'ailleurs <small>${plural(x.world.sources, "média")} dans le monde</small></h2>
        <p class="note" style="margin:0 0 6px">${zones.map((z) => `${esc(z.label)} : <b>${z.articles.length}</b>`).join(" · ")}</p>
        <div class="zones">${zones.map((z) => `<section>
          <div class="col-h">${esc(z.label)}<small>${plural(z.articles.length, "article")}</small></div>
          <ul class="hl">${z.articles.slice(0, 5).map(hlItem).join("")}</ul>
        </section>`).join("")}</div>`;
    }

    const changedEl = $("#sxChanged");
    if (x.changed.length) {
      changedEl.hidden = false;
      changedEl.innerHTML = `<h2 class="block-h">Titres modifiés <small>depuis leur publication</small></h2>
        <ul class="hl">${x.changed.map((a) => `<li><div class="row"><span class="src">${favicon(a.domain, a.sourceName)}<span>${esc(a.sourceName)}</span></span>${badge(a.media)}<time>${esc(ago(a.changedAt))}</time></div>
          <div class="was" style="margin-top:6px">Avant : <s>${esc(a.prevTitle)}</s></div><div class="t">Maintenant : ${esc(a.title)}</div></li>`).join("")}</ul>`;
    }
  }).catch(() => {});

  // Vidéos des chaînes de médias sur cette histoire.
  api(`/api/videos?region=monde&q=${encodeURIComponent(s.title)}`).then((r) => {
    const el = $("#sxVideos");
    if (!el || !still(s.id) || !r.videos?.length) return;
    el.hidden = false;
    el.innerHTML = `<h2 class="block-h">En vidéo <small>chaînes YouTube des médias</small></h2>${videoGrid(r.videos.slice(0, 6))}`;
    bindVideos(el, r.videos);
  }).catch(() => {});
}

// Les mots qu'un seul côté emploie (même langue que l'histoire).
const STOPW = new Set(`avec pour dans plus sont être cette leur leurs après avant selon comme mais tout tous toute toutes fait faire contre entre sans sous dont elle elles nous vous ceux celle celui déjà vers chez quand comment pourquoi aussi même autre autres bien très peut doit veut était avait avoir sera seront depuis premier première nouveau nouvelle nouvelles deux trois quatre cinq lors alors encore ainsi cela ceci votre notre jour jours mois année années heure heures
their with from this that have will been were what when about after over into says said more than they them also just only some would could should there these those which while where being other first last week year years news says told amid back down make made like here what your just`.split(/\s+/));
const fold = (w) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// Racine grossière : « committed », « committing », « commits » → « commit » ; « réformes » → « reform ».
const stem = (k) => k.length < 6 ? k.replace(/s$/, "") : k.replace(/(ements|ement|ations|ation|ings|ing|ed|es|s|e)$/, "");
function loadedWords(s) {
  const lang = s.lang || s.articles[0]?.lang;
  const per = { left: new Map(), right: new Map() };
  const outlets = { left: new Set(), right: new Set() };
  for (const a of s.articles) {
    if (lang && a.lang && a.lang !== lang) continue;
    const side = sideOf(a.media);
    if (side !== "left" && side !== "right") continue;
    const seen = new Set();
    for (let w of `${a.title} ${a.summary || ""}`.split(/[^\p{L}\p{N}'’-]+/u)) {
      w = w.replace(/^(?:[ldjmnstc]|qu)['’]/i, "").replace(/['’-]+$/, "");
      const f = fold(w);
      if (f.length < 4 || STOPW.has(f) || /^\d+$/.test(f)) continue;
      const k = stem(f);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!per[side].has(k)) per[side].set(k, { w, d: new Set() });
      per[side].get(k).d.add(a.domain);
    }
    outlets[side].add(a.domain);
  }
  // Il faut les deux côtés pour comparer.
  if (!per.left.size || !per.right.size) return { left: [], right: [], leftSet: null, rightSet: null };
  // Avec 3 médias ou plus d'un côté, un mot doit revenir chez au moins 2 d'entre eux.
  const only = (a, b) => {
    const min = outlets[a].size >= 3 ? 2 : 1;
    return [...per[a].entries()].filter(([k, v]) => !per[b].has(k) && v.d.size >= min)
      .sort((x, y) => y[1].d.size - x[1].d.size || y[0].length - x[0].length).slice(0, 7).map(([k, v]) => ({ k, w: v.w.toLowerCase(), n: v.d.size }));
  };
  const left = only("left", "right"), right = only("right", "left");
  return { left, right, leftSet: new Set(left.map((x) => x.k)), rightSet: new Set(right.map((x) => x.k)) };
}

// Mots-clés lisibles d'une histoire : les noms propres de ses titres.
function keywordsOf(s) {
  const count = new Map();
  for (const a of s.articles.slice(0, 15)) {
    for (const m of a.title.matchAll(/\b(\p{Lu}[\p{L}'’-]{2,}(?:\s+\p{Lu}[\p{L}'’-]{2,})?)/gu)) {
      const w = m[1];
      if (/^(Le|La|Les|Un|Une|Des|The|A|An|In|On|How|Why|What|Il|Elle|Ce|Cette|Voici|Après|Avant|Pour|Avec|Selon)\b/.test(w)) continue;
      count.set(w, (count.get(w) || 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 4);
}

/* ---------- Un sujet (recherche) ---------- */
function viewSearch(v, route) {
  document.title = `${route.q} — Prisme`;
  const followed = topics.has(route.q);
  v.innerHTML = `<header class="page-h">
      <div class="kicker">Sujet · ${esc(REGIONS.find(([r]) => r === state.region)[1])}</div>
      <h1>« ${esc(route.q)} »</h1>
      <p>Les histoires des dernières 48 heures, dans les médias que Prisme lit directement.</p>
      <div class="actions">
        <button class="btn${followed ? " ghost" : ""}" type="button" id="follow">${followed ? "✓ Suivi" : "★ Suivre ce sujet"}</button>
        <a class="btn ghost" href="#wide" id="wideBtn">Chercher dans tous les articles (48 h)</a>
      </div>
    </header>
    <section id="outletHits" hidden></section>
    <div class="layout">
      <div class="main-col"><div id="feed"></div><div id="sentinel"></div><div id="feedStatus"></div>
        <section id="wide" class="sec"></section>
      </div>
      <aside class="rail"><div class="rail-in" id="rail"></div></aside>
    </div>`;
  $("#follow", v).onclick = (e) => {
    if (topics.has(route.q)) topics.remove(route.q); else topics.add(route.q);
    const on = topics.has(route.q);
    e.target.textContent = on ? "✓ Suivi" : "★ Suivre ce sujet";
    e.target.classList.toggle("ghost", on);
    drawRail(state.feeds.get(feedKey(route)));
  };
  $("#wideBtn", v).onclick = (e) => { e.preventDefault(); loadWide(route.q); };
  recent.add(route.q);
  const key = feedKey(route);
  mountFeed(key, { q: route.q });
  const f = state.feeds.get(key);
  // Peu de résultats dans l'index : on élargit tout de suite.
  const check = () => {
    const ff = state.feeds.get(key);
    if (ff.loading || ff.page < 0) return setTimeout(check, 300);
    if (ff.stories.length < 3 && state.route.view === "search" && state.route.q === route.q) loadWide(route.q, false);
  };
  if (f) check();
  if (state.wide.has(`${route.q}|${state.region}`) || state.pendingWide === route.q) { state.pendingWide = null; loadWide(route.q, state.wide.size > 0); }
  // La recherche nomme peut-être un média : on le propose en premier.
  articlesOf(state.region).then((idx) => {
    const hits = matchOutlets(idx.domains, route.q);
    const el = $("#outletHits");
    if (!el || !hits.length || state.route.view !== "search" || state.route.q !== route.q) return;
    el.hidden = false;
    el.innerHTML = `<h2 class="block-h">Médias <small>qui correspondent à « ${esc(route.q)} »</small></h2>
      <div class="outlet-hits">${hits.map((d) => `<a class="outlet-hit" href="${href({ m: d.domain })}" data-nav>
        ${favicon(d.domain, d.name)}<span class="oh-main"><b>${esc(d.name)}</b><small>${d.media.known ? esc(d.media.owner.replace(/\s*\(.*\)$/, "")) : esc(d.domain)}</small></span>
        <span class="oh-side">${badge(d.media)}<small>${plural(d.count, "article")} en 48 h</small></span></a>`).join("")}</div>`;
  }).catch(() => {});
}

const emptySearch = (q) => `<div class="empty" style="padding-bottom:10px"><h3>Rien dans les dernières 48 heures.</h3><p>Aucune histoire de Prisme ne correspond à « ${esc(q)} ». Voici ce qu'on trouve dans tous les articles lus par Prisme.</p></div>`;

/* ---------- La page d'un média : ses derniers articles et ses histoires du moment ---------- */
async function viewOutlet(v, route) {
  v.innerHTML = `<div class="page-h">${'<div class="skel" style="height:44px;width:50%;margin-top:10px"></div>'.repeat(2)}</div>`;
  let idx = await articlesOf(state.region).catch(() => null);
  let d = idx?.domains.find((x) => x.domain === route.m);
  if (!d && state.region !== "monde") { idx = await articlesOf("monde").catch(() => null); d = idx?.domains.find((x) => x.domain === route.m); }
  if (state.route.view !== "outlet" || state.route.m !== route.m) return;
  if (!d) {
    v.innerHTML = `<div class="empty"><h3>Ce média n'a rien publié dans les dernières 48 heures.</h3><p><button class="btn ghost" type="button" data-domain="${esc(route.m)}" data-name="${esc(route.m)}">Voir sa fiche</button></p></div>`;
    return;
  }
  document.title = `${d.name} — Prisme`;
  const items = idx.items.filter((a) => a.domain === d.domain).slice(0, 120);
  const ed = await edition(state.region).catch(() => null);
  const stories = (ed?.stories || []).filter((s) => s.sources >= 2 && s.articles.some((a) => a.domain === d.domain)).slice(0, 6);
  for (const s of stories) state.stories.set(s.id, s);
  const m = d.media;
  v.innerHTML = `<header class="page-h outlet-head">
      <div class="kicker">Média · ${esc(regionLabel())}</div>
      <h1>${favicon(d.domain, d.name)} ${esc(d.name)}</h1>
      <p class="outlet-meta">${badge(m)} ${m.known ? `<span>Propriété : <b>${esc(m.owner)}</b></span>` : ""} ${m.country ? `<span>${esc(countryName(m.country))}</span>` : ""} <a class="link" href="https://${esc(d.domain)}" target="_blank" rel="noopener noreferrer">${esc(d.domain)} ↗</a></p>
      <div class="actions"><button class="btn" type="button" data-domain="${esc(d.domain)}" data-name="${esc(d.name)}">Fiche complète (propriétaire, groupe)</button></div>
    </header>
    ${stories.length ? `<section class="sec"><h2 class="block-h">Ses histoires du moment <small>celles que d'autres médias couvrent aussi</small></h2>${stories.map((s) => storyRow(s)).join("")}</section>` : ""}
    <section class="sec">
      <h2 class="block-h">Ses derniers articles <small>${plural(items.length, "article")} en 48 h</small></h2>
      <ul class="arts">${items.map((a) => `<li class="art"><time>${esc(ago(a.published))}</time><div>${langTag(a.lang)} ${artLink(a, "t")} ${transLink(a)}</div></li>`).join("")}</ul>
    </section>`;
}

async function loadWide(q, scroll = true) {
  const el = $("#wide");
  if (!el) return;
  const key = `${q}|${state.region}`;
  const f = state.feeds.get(feedKey(state.route));
  const intro = f && !f.stories.length && !f.loading ? emptySearch(q) : "";
  if (scroll) el.scrollIntoView({ behavior: "smooth", block: "start" });
  if (!state.wide.has(key)) {
    el.innerHTML = `${intro}<h2 class="block-h">Tous les articles <small>48 h</small></h2><div class="loader">Recherche dans des milliers de médias…</div>`;
    try { state.wide.set(key, await api(`/api/search?q=${encodeURIComponent(q)}&region=${state.region}`)); }
    catch (e) { el.innerHTML = `<h2 class="block-h">Tous les articles</h2><div class="empty"><p>${esc(e.message)}</p></div>`; return; }
    if (state.route.view !== "search" || state.route.q !== q) return;
  }
  state.wideBias.clear();
  drawWide(el, state.wide.get(key), intro);
}

function drawWide(el, d, intro = "") {
  const a = d.articles;
  const doms = new Set(a.map((x) => x.domain)).size;
  const counts = Object.fromEntries(ORDER.map((k) => [k, 0]));
  const seen = new Set();
  for (const x of a) if (!seen.has(x.domain)) { seen.add(x.domain); counts[biasKey(x.media)]++; }
  const tabs = [["articles", "Articles", a.length], ["comparer", "Comparer", null], ["medias", "Médias", doms], ["videos", "Vidéos", null]];
  if (!a.length) { el.innerHTML = `${intro}<h2 class="block-h">Tous les articles <small>48 h</small></h2><div class="empty"><p>Aucun article des médias lus par Prisme ne contient tous ces mots. Essaie un mot plus court ou une autre édition (Monde entier cherche partout).</p></div>`; return; }
  el.innerHTML = `${intro}<h2 class="block-h">Tous les articles <small>48 h · ${plural(a.length, "article")} · ${plural(doms, "média")}</small></h2>
    <p class="note" style="margin:0 0 12px">Ici, Prisme cherche dans chaque article publié par les médias de cette édition depuis 48 heures, même ceux qui ne font pas partie d'une histoire. Aucun tri : du plus récent au plus ancien.</p>
    ${bigBar(counts)}
    <nav class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${state.wideTab === k}">${l}${n != null ? `<sup>${n}</sup>` : ""}</button>`).join("")}</nav>
    <div id="widePanel"></div>`;
  $(".tabs", el).onclick = (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    state.wideTab = b.dataset.tab;
    $$(".tabs button", el).forEach((x) => x.setAttribute("aria-selected", x === b));
    drawWidePanel(d);
  };
  drawWidePanel(d);
}

function drawWidePanel(d) {
  const p = $("#widePanel");
  const a = d.articles;
  if (state.wideTab === "comparer") {
    p.innerHTML = `<div class="cols3" style="margin-top:14px">${SIDES.map((side) => {
      const items = a.filter((x) => side.keys.includes(biasKey(x.media)));
      return `<section><div class="col-h"><i style="background:${side.color}"></i>${side.label}<small>${plural(items.length, "article")}</small></div>
        ${items.length ? `<ul class="hl">${items.slice(0, 15).map((x) => `<li><div class="row"><button class="src" type="button" data-domain="${esc(x.domain)}" data-name="${esc(x.sourceName)}">${favicon(x.domain, x.sourceName)}<span>${esc(x.sourceName)}</span></button>${badge(x.media)}<time>${esc(ago(x.published))}</time></div>${artLink(x, "t")}</li>`).join("")}</ul>`
          : `<div class="col-empty">Aucun média de ${side.label.toLowerCase()} dans ces résultats.</div>`}</section>`;
    }).join("")}</div>`;
    return;
  }
  if (state.wideTab === "medias") {
    const by = new Map();
    for (const x of a) { const m = by.get(x.domain) || { ...x, n: 0 }; m.n++; by.set(x.domain, m); }
    const list = [...by.values()].sort((x, y) => y.n - x.n);
    p.innerHTML = `<ul class="outlets" style="margin-top:10px">${list.map((m) => `<li><button type="button" data-domain="${esc(m.domain)}" data-name="${esc(m.sourceName)}">${favicon(m.domain, m.sourceName)}<span class="nm">${esc(m.sourceName)}<small>${plural(m.n, "article")}${m.media.known ? " · " + esc(m.media.owner.replace(/\s*\(.*\)$/, "")) : ""}</small></span>${scaleMini(m.media)}</button></li>`).join("")}</ul>`;
    return;
  }
  if (state.wideTab === "videos") { drawVideos(p, d.query); return; }
  const list = a.filter((x) => !state.wideBias.size || state.wideBias.has(biasKey(x.media)));
  const c = Object.fromEntries(ORDER.map((k) => [k, a.filter((x) => biasKey(x.media) === k).length]));
  p.innerHTML = `<div class="filters">${ORDER.filter((k) => c[k]).map((k) => `<button class="chip" type="button" data-bias="${k}" aria-pressed="${state.wideBias.has(k)}"><span class="sw" style="background:${BIAS[k].color}"></span>${BIAS[k].label} <span class="muted">${c[k]}</span></button>`).join("")}</div>
    <ul class="arts">${list.slice(0, 80).map((x) => `<li class="art"><time>${esc(ago(x.published))}</time><div>
      <div class="row"><button class="src" type="button" data-domain="${esc(x.domain)}" data-name="${esc(x.sourceName)}">${favicon(x.domain, x.sourceName)}<span>${esc(x.sourceName)}</span></button>${tag(x.media)}</div>
      ${artLink(x, "t")}
      ${x.media.known ? `<div class="own">${esc(x.media.owner)}</div>` : ""}</div></li>`).join("")}</ul>`;
  $(".filters", p).onclick = (e) => {
    const b = e.target.closest("[data-bias]");
    if (!b) return;
    const k = b.dataset.bias;
    state.wideBias.has(k) ? state.wideBias.delete(k) : state.wideBias.add(k);
    drawWidePanel(d);
  };
}

/* ---------- Vidéos (chaînes YouTube des médias, sans clé) ---------- */
function videoGrid(list) {
  return `<div class="vgrid">${list.map((x) => `<button class="vid" type="button" data-vid="${esc(x.id)}">
      <span class="frame"><img src="${esc(safeUrl(x.thumb))}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <span class="vbadge">${badge(x.media)}</span>
        <span class="play"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg></span></span>
      <h3 data-no-tr>${esc(x.title)}</h3>
      <div class="vmeta">${favicon(x.domain, x.channel)}<b>${esc(x.channel)}</b><span>${esc(ago(x.published))}</span></div>
    </button>`).join("")}</div>`;
}
function bindVideos(el, list) {
  el.onclick = (e) => {
    if (e.target.closest("[data-domain]")) return;
    const b = e.target.closest("[data-vid]");
    if (!b) return;
    const v = list.find((x) => x.id === b.dataset.vid);
    if (!v) return;
    reads.add({ u: `https://www.youtube.com/watch?v=${v.id}`, d: v.domain, n: v.channel, k: biasKey(v.media), o: v.media.known ? v.media.owner : null, c: v.media.country || null, t: v.title });
    openVideo(v);
  };
}

async function drawVideos(p, q) {
  p.innerHTML = `<div class="loader">Recherche de vidéos…</div>`;
  try {
    const r = await api(`/api/videos?region=monde&q=${encodeURIComponent(q)}`);
    if (state.wideTab !== "videos") return;
    if (!r.videos.length) { p.innerHTML = `<div class="empty"><p>Aucune vidéo des chaînes de médias sur ce sujet cette semaine.</p></div>`; return; }
    p.innerHTML = videoGrid(r.videos);
    bindVideos(p, r.videos);
  } catch (e) { p.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; }
}

function folio(title, sub = "") {
  const d = new Date().toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `<header class="folio"><h1>${title}${sub ? `<em>${sub}</em>` : ""}</h1><span class="dateline">${d}</span></header>`;
}
const regionLabel = () => REGIONS.find(([r]) => r === state.region)[1];

async function viewVideos(v, side = "all", noShorts = true) {
  document.title = "Vidéos — Prisme";
  v.innerHTML = `${folio("Vidéos", regionLabel())}
    <p class="lead-note">Les dernières vidéos des chaînes YouTube des médias, lues directement : pas d'algorithme YouTube, pas de recommandations. Chaque vidéo porte l'orientation de son média.</p>
    <div class="filters" id="vidFilters">
      ${[["all", "Toutes"], ["left", "Gauche"], ["center", "Centre"], ["right", "Droite"], ["other", "État"]].map(([k, l]) => `<button class="chip" type="button" data-side="${k}" aria-pressed="${k === side}">${l}</button>`).join("")}
      <button class="chip" type="button" data-shorts aria-pressed="${noShorts}">Sans les Shorts</button>
    </div>
    <div id="vidBody"><div class="loader">Chargement des chaînes…</div></div>`;
  $("#vidFilters", v).onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.shorts !== undefined) viewVideos(v, side, !noShorts);
    else viewVideos(v, b.dataset.side, noShorts);
  };
  let r = state.videos.get(state.region);
  if (!r) {
    try { r = await api(`/api/videos?region=${state.region}`); state.videos.set(state.region, r); }
    catch (e) { $("#vidBody").innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return; }
  }
  if (state.route.view !== "videos") return;
  const list = r.videos.filter((x) => (side === "all" || (sideOf(x.media) || "other") === side) && (!noShorts || !x.isShort));
  const c = { l2: 0, l1: 0, c: 0, r1: 0, r2: 0, state: 0, unk: 0 };
  for (const x of r.videos) c[biasKey(x.media)]++;
  $("#vidBody").innerHTML = `<div style="margin:6px 0 4px">${bigBar(c)}</div>
    <p class="note">${plural(r.videos.length, "vidéo")} de la dernière semaine, de ${plural(new Set(r.videos.map((x) => x.domain)).size, "chaîne")} de médias.</p>
    ${list.length ? videoGrid(list.slice(0, 60)) : `<div class="empty"><p>Aucune vidéo de ce côté pour cette édition.</p></div>`}`;
  bindVideos($("#vidBody"), list);
}

/* ---------- Le prisme du matin ---------- */
async function viewMatin(v) {
  document.title = "Le matin — Prisme";
  const h = new Date().getHours();
  const hello = h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
  v.innerHTML = `${folio("Le matin", regionLabel())}
    <p class="lead-note">${hello}. Cinq histoires pour comprendre la journée, chacune vue de gauche, du centre et de droite. Environ trois minutes.</p>
    <div id="matin"><div class="loader">On prépare ton édition…</div></div>`;
  try {
    const [une, angles, changes] = await Promise.all([
      api(`/api/feed?region=${state.region}&page=0`),
      api(`/api/feed?region=${state.region}&lens=angles&page=0`),
      api(`/api/feed?region=${state.region}&changes=1`).catch(() => ({ items: [] })),
    ]);
    if (state.route.view !== "matin") return;
    // Cinq histoires couvertes par au moins deux côtés, de rubriques variées.
    const picked = [], usedCats = new Map();
    for (const s of une.stories) {
      if (picked.length >= 5) break;
      if (s.sides < 2 && une.stories.filter((x) => x.sides >= 2).length >= 5) continue;
      const c = s.categories[0] || "-";
      if ((usedCats.get(c) || 0) >= 2) continue;
      usedCats.set(c, (usedCats.get(c) || 0) + 1);
      picked.push(s);
    }
    for (const s of [...picked, ...angles.stories]) state.stories.set(s.id, s);
    const blind = angles.stories.find((s) => !picked.some((p) => p.id === s.id));
    const prof = profile(reads.list().filter((r) => r.ts >= Date.now() - 30 * 864e5));
    let bubble = null;
    if (prof.n >= 3 && (prof.blind || prof.lean !== "center")) {
      const lens = (prof.blind || (prof.lean === "left" ? "right" : "left")) === "right" ? "droite" : "gauche";
      const b = await api(`/api/feed?region=${state.region}&lens=${lens}&page=0`).catch(() => null);
      bubble = b?.stories.find((s) => s.categories.some((c) => ["politique", "international", "economie", "sante", "environnement"].includes(c))) || b?.stories[0];
      if (bubble) state.stories.set(bubble.id, bubble);
    }
    const sidesHtml = (s) => { const by = pickBySide(s); return `<div class="angles3">${SIDES.map((side) => {
      const a = by[side.key];
      return `<div><div class="side"><span class="bb bb-${side.key === "left" ? "l2" : side.key === "right" ? "r2" : "c"}">${side.label}</span></div>
        ${a ? `${artLink(a)}<div class="by">${esc(a.sourceName)}</div>` : `<div class="none">Aucun média de ${side.label.toLowerCase()} n'en parle.</div>`}</div>`;
    }).join("")}</div>`; };
    $("#matin").innerHTML = `
      <ol class="matin-list">${picked.map((s, i) => `<li>
        <span class="num">${i + 1}</span>
        <div>
          <div class="kicker">${catKicker(s)}${reason(s)}</div>
          <h2 data-no-tr><a href="${href({ h: s.id })}" data-nav>${esc(s.title)}</a></h2>
          ${s.summary ? `<p class="dek" data-no-tr>${esc(s.summary)}</p>` : ""}
          ${bigBar(s.counts)}
          ${sidesHtml(s)}
        </div>
      </li>`).join("")}</ol>
      <div class="matin-extra">
        ${blind ? `<section><h2 class="block-h">L'angle mort du jour</h2><span class="flag ${blind.blindspot === "left" ? "l" : "r"}">Peu couvert ${blind.blindspot === "left" ? "à gauche" : "à droite"}</span>
          <h3 class="mini-h" data-no-tr><a href="${href({ h: blind.id })}" data-nav>${esc(blind.title)}</a></h3>${bigBar(blind.counts)}</section>` : ""}
        ${bubble ? `<section><h2 class="block-h">Ce que ta bulle rate</h2><p class="note" style="margin:0 0 6px">D'après Mon prisme, tu lis peu l'autre côté. Voici ce qu'il couvre.</p>
          <h3 class="mini-h" data-no-tr><a href="${href({ h: bubble.id })}" data-nav>${esc(bubble.title)}</a></h3>${bigBar(bubble.counts)}</section>` : ""}
        ${changes.items.length ? `<section><h2 class="block-h">Ils ont changé leur titre</h2><ul class="hl">${changes.items.slice(0, 3).map((a) => `<li><div class="row"><span class="src">${favicon(a.domain, a.sourceName)}<span>${esc(a.sourceName)}</span></span>${badge(a.media)}</div>
          <div class="was" style="margin-top:6px">Avant : <s>${esc(a.prevTitle)}</s></div><div class="t">Maintenant : ${esc(a.title)}</div></li>`).join("")}</ul></section>` : ""}
        <section><h2 class="block-h">La question du jour</h2><p class="note" style="margin:0 0 10px">Un titre, trois choix : gauche, centre ou droite ? Entraîne ton œil à repérer le cadrage.</p>
          <a class="btn" href="${href({ v: "quiz" })}" data-nav>Jouer à Devine le média</a></section>
      </div>`;
  } catch (e) {
    $("#matin").innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`;
  }
}

/* ---------- Devine le média ---------- */
async function viewQuiz(v) {
  document.title = "Devine le média — Prisme";
  v.innerHTML = `${folio("Devine le média")}
    <p class="lead-note">Un vrai titre publié aujourd'hui. Gauche, centre ou droite ? Le média est révélé après ta réponse.</p>
    <div id="quiz"><div class="loader">On choisit des titres…</div></div>`;
  let items;
  try { items = (await api(`/api/feed?region=${state.region}&quiz=1`)).items; }
  catch (e) { $("#quiz").innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return; }
  if (state.route.view !== "quiz") return;
  if (items.length < 3) { $("#quiz").innerHTML = `<div class="empty"><p>Pas assez de titres pour cette édition. Essaie l'édition Monde.</p></div>`; return; }
  const res = [];
  const best = Number(store.get("quizBest", "0"));
  const draw = (i) => {
    const el = $("#quiz");
    if (!el) return;
    if (i >= items.length) {
      const ok = res.filter((r) => r.ok).length;
      const per = (sd) => { const l = res.filter((r) => r.side === sd); return l.length ? `${l.filter((r) => r.ok).length}/${l.length}` : "–"; };
      if (ok > best) store.set("quizBest", String(ok));
      el.innerHTML = `<div class="quiz-card done">
        <div class="kicker">Résultat</div>
        <h2>${ok} sur ${items.length}</h2>
        <p class="dek" data-no-tr>${ok / items.length >= 0.7 ? "Bel œil : tu repères bien le cadrage." : ok / items.length >= 0.45 ? "Pas mal. Le centre est souvent le plus difficile à deviner." : "Pas facile ! Beaucoup de titres se ressemblent d'un camp à l'autre, et c'est une bonne nouvelle."}</p>
        <div class="quiz-sides"><span class="bb bb-l2">Gauche ${per("left")}</span><span class="bb bb-c">Centre ${per("center")}</span><span class="bb bb-r2">Droite ${per("right")}</span></div>
        <p class="note">Meilleur score sur cet appareil : ${Math.max(ok, best)} sur ${items.length}.</p>
        <button class="btn" type="button" id="quizAgain">Rejouer avec d'autres titres</button>
      </div>`;
      $("#quizAgain").onclick = () => viewQuiz(v);
      return;
    }
    const it = items[i];
    el.innerHTML = `<div class="quiz-card">
      <div class="kicker">Titre ${i + 1} sur ${items.length} · ${res.filter((r) => r.ok).length} bonne${res.filter((r) => r.ok).length > 1 ? "s" : ""} réponse${res.filter((r) => r.ok).length > 1 ? "s" : ""}</div>
      <h2 data-no-tr>« ${esc(it.title)} »</h2>
      <div class="quiz-btns">
        <button type="button" data-a="left" class="qa l">Gauche</button>
        <button type="button" data-a="center" class="qa c">Centre</button>
        <button type="button" data-a="right" class="qa r">Droite</button>
      </div>
      <div id="quizReveal"></div>
    </div>`;
    $(".quiz-btns", el).onclick = (e) => {
      const b = e.target.closest("[data-a]");
      if (!b || res.length > i) return;
      const ok = b.dataset.a === it.side;
      res.push({ ok, side: it.side });
      $$(".qa", el).forEach((x) => { x.disabled = true; x.classList.toggle("right-answer", x.dataset.a === it.side); x.classList.toggle("picked", x === b); });
      $("#quizReveal").innerHTML = `<div class="reveal ${ok ? "ok" : "ko"}">
        <b>${ok ? "Bien vu." : "Raté."}</b> C'est <button class="src" type="button" data-domain="${esc(it.domain)}" data-name="${esc(it.sourceName)}">${favicon(it.domain, it.sourceName)}<span>${esc(it.sourceName)}</span></button> ${badge(it.media)}
        ${it.media.owner ? `<div class="own">Propriété : ${esc(it.media.owner)}</div>` : ""}
        <div class="reveal-actions">${artLink(it, "link small")}<button class="btn" type="button" id="quizNext">${i + 1 < items.length ? "Titre suivant" : "Voir mon score"}</button></div>
      </div>`;
      $("#quizNext").onclick = () => draw(i + 1);
    };
  };
  draw(0);
}

/* ---------- Mon prisme (mon angle mort perso) ---------- */
const POS = { l2: -2, l1: -1, c: 0, r1: 1, r2: 2 };
const SIDE_NAME = { left: "gauche", center: "centre", right: "droite" };

function profile(list) {
  const counts = Object.fromEntries(ORDER.map((k) => [k, 0]));
  for (const r of list) counts[r.k in counts ? r.k : "unk"]++;
  const sd = sides(counts);
  const pol = sd.left + sd.center + sd.right;
  const share = (n) => (pol ? n / pol : 0);
  const rated = list.filter((r) => r.k in POS);
  const avg = rated.length ? rated.reduce((s, r) => s + POS[r.k], 0) / rated.length : null;
  const lean = avg == null ? null : avg <= -0.5 ? "left" : avg >= 0.5 ? "right" : "center";
  let blind = null;
  if (pol >= 5) {
    const l = share(sd.left), r = share(sd.right);
    if (l < r && l < 0.2) blind = "left";
    else if (r < l && r < 0.2) blind = "right";
  }
  const tally = (key) => {
    const m = new Map();
    for (const r of list) if (r[key]) m.set(r[key], (m.get(r[key]) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  return { n: list.length, counts, sd, pol, share, avg, lean, blind, owners: tally("o"), outlets: tally("n"), countries: tally("c") };
}

const avgOf = (counts) => {
  let s = 0, n = 0;
  for (const [k, p] of Object.entries(POS)) { s += (counts[k] || 0) * p; n += counts[k] || 0; }
  return n ? s / n : null;
};

function gauge(me, ref) {
  const pos = (v) => `${((v + 2) / 4) * 100}%`;
  return `<div class="gauge" role="img" aria-label="Ta position moyenne sur le spectre">
    <div class="segs">${["l2", "l1", "c", "r1", "r2"].map((k) => `<span style="background:${BIAS[k].color}"></span>`).join("")}</div>
    ${me != null ? `<span class="mk me" style="left:${pos(me)}">Toi</span>` : ""}
    ${ref != null ? `<span class="mk ref" style="left:${pos(ref)}">La une du jour</span>` : ""}
  </div>
  <div class="scale-labels"><span>Gauche</span><span>Centre</span><span>Droite</span></div>`;
}

const PERIODS_ME = [["7", "7 jours"], ["30", "30 jours"], ["all", "Tout"]];

async function viewMe(v, period = store.get("mePeriod", "30")) {
  document.title = "Mon prisme — Prisme";
  const since = period === "all" ? 0 : Date.now() - Number(period) * 864e5;
  const list = reads.list().filter((r) => r.ts >= since);
  const p = profile(list);
  const head = `<header class="page-h">
      <div class="kicker">Mon prisme · gardé sur cet appareil seulement</div>
      <h1>Ton angle mort</h1>
      <p>Chaque article que tu ouvres depuis Prisme est noté ici, avec l'orientation et le propriétaire de son média. Rien n'est envoyé ailleurs : tout reste dans ce navigateur.</p>
    </header>
    <div class="filters" id="mePeriod">${PERIODS_ME.map(([k, l]) => `<button class="chip" type="button" data-p="${k}" aria-pressed="${k === period}">${l}</button>`).join("")}</div>`;

  if (p.n < 3) {
    v.innerHTML = `${head}<div class="empty">
      <h3>Ton portrait se construit en lisant.</h3>
      <p>Ouvre quelques articles depuis Prisme : un titre dans « Comment ils le titrent », dans la page d'une histoire ou dans la recherche. Dès 3 lectures, tu verras de quel côté tu penches, à qui appartiennent les médias que tu lis, et ce que tu rates de l'autre côté.</p>
      <p class="note">${p.n ? `${plural(p.n, "lecture notée", "lectures notées")} pour cette période.` : "Aucune lecture notée pour cette période."}</p>
      <a class="btn" href="${href({})}" data-nav>Aller au fil</a></div>`;
    bindMePeriod(v);
    return;
  }

  const pct = (n) => Math.round(p.share(n) * 100);
  const verdict = p.lean === "left" ? "Tu lis surtout des médias de gauche." : p.lean === "right" ? "Tu lis surtout des médias de droite." : "Tes lectures sont plutôt équilibrées.";
  const blindSide = p.blind || (p.lean === "left" ? "right" : p.lean === "right" ? "left" : null);
  const bubbleLens = blindSide === "right" ? "droite" : blindSide === "left" ? "gauche" : "angles";
  const topOwners = p.owners.slice(0, 3).reduce((s, [, n]) => s + n, 0);
  const ownedShare = Math.round((topOwners / p.n) * 100);

  v.innerHTML = `${head}
    <div class="layout" style="padding-top:8px">
      <div class="main-col">
        <section class="me-verdict">
          <div class="kicker">${plural(p.n, "article lu", "articles lus")} · ${plural(p.outlets.length, "média")}</div>
          <h2>${verdict}</h2>
          <div id="meGauge">${gauge(p.avg, null)}</div>
        </section>

        <section class="sec">
          <h2 class="block-h">Ce que tu lis <small>une lecture = un article ouvert</small></h2>
          ${bigBar(p.counts)}
          <div class="s-cov">${SIDES.map((side) => `<div><b>${pct(p.sd[side.key])} %</b><small><i style="background:${side.color}"></i>${side.label} · ${plural(p.sd[side.key], "lecture")}</small></div>`).join("")}</div>
          ${p.blind ? `<div class="callout ${p.blind === "right" ? "r" : "l"}"><b>TON ANGLE MORT : LA ${SIDE_NAME[p.blind].toUpperCase()}.</b> Seulement ${pct(p.sd[p.blind])} % de tes lectures évaluées viennent de médias de ${SIDE_NAME[p.blind]}.</div>`
            : `<div class="callout"><b>PAS D'ANGLE MORT MARQUÉ.</b> Tu lis au moins 20 % de chaque côté du spectre${p.lean === "center" ? ". Rare et précieux" : ""}.</div>`}
          ${p.counts.state ? `<div class="callout"><b>MÉDIAS D'ÉTAT.</b> ${plural(p.counts.state, "de tes lectures vient", "de tes lectures viennent")} d'un média contrôlé par un gouvernement.</div>` : ""}
        </section>

        <section class="sec">
          <h2 class="block-h">${blindSide ? `Pour sortir de ta bulle : ce que la ${SIDE_NAME[blindSide]} couvre` : "Pour élargir : les angles morts du moment"} <small>${esc(REGIONS.find(([r]) => r === state.region)[1])}</small></h2>
          <p class="note" style="margin:0 0 4px">${blindSide ? `Les histoires que les médias de ${SIDE_NAME[blindSide]} couvrent le plus en ce moment, et que l'autre côté couvre peu.` : "Des histoires qu'un côté du spectre couvre beaucoup et que l'autre ignore presque."}</p>
          <div id="bubble"><div class="loader">Chargement…</div></div>
        </section>
      </div>

      <aside class="rail"><div class="rail-in">
        <section>
          <h2 class="block-h">À qui appartient ce que tu lis</h2>
          ${p.owners.length ? `<ul class="rank">${p.owners.slice(0, 6).map(([o, n]) => `<li><span class="nm">${esc(o.replace(/\s*\(.*\)$/, ""))}</span><span class="n">${Math.round((n / p.n) * 100)} %</span><span class="track"><span style="width:${(n / p.owners[0][1]) * 100}%"></span></span></li>`).join("")}</ul>
            <p class="note">${p.owners.length >= 3 ? `Trois propriétaires contrôlent ${ownedShare} % de ce que tu lis.` : `Tes lectures viennent de ${plural(p.owners.length, "propriétaire")}.`}</p>` : `<p class="note">Aucun propriétaire connu pour l'instant.</p>`}
        </section>
        <section>
          <h2 class="block-h">Tes médias</h2>
          <ul class="rank">${p.outlets.slice(0, 6).map(([o, n]) => `<li><span class="nm">${esc(o)}</span><span class="n">${n}</span><span class="track"><span style="width:${(n / p.outlets[0][1]) * 100}%"></span></span></li>`).join("")}</ul>
          ${p.countries.length > 1 ? `<p class="note">Pays : ${p.countries.slice(0, 5).map(([c, n]) => `${esc(countryName(c))} (${n})`).join(", ")}.</p>` : ""}
        </section>
        <section>
          <h2 class="block-h">Historique <small>${plural(list.length, "lecture")}</small></h2>
          <ul class="hist">${[...list].reverse().slice(0, 12).map((r) => `<li>
            <span class="tag"><i style="background:${(BIAS[r.k] || BIAS.unk).color}"></i>${esc(r.n || r.d)}</span>
            <a href="${esc(safeUrl(r.u))}" target="_blank" rel="noopener noreferrer">${esc(r.t)}</a>
            <button type="button" class="x" data-forget="${esc(r.u)}" aria-label="Oublier cette lecture" title="Oublier cette lecture">×</button>
          </li>`).join("")}</ul>
          <button class="btn ghost" type="button" id="forgetAll" style="margin-top:12px">Tout effacer</button>
        </section>
      </div></aside>
    </div>`;
  bindMePeriod(v);

  v.querySelector(".hist").onclick = (e) => {
    const b = e.target.closest("[data-forget]");
    if (!b) return;
    reads.remove(b.dataset.forget);
    viewMe(v, period);
  };
  $("#forgetAll", v).onclick = () => {
    if (confirm("Effacer tout ton historique de lecture sur cet appareil ?")) { reads.clear(); viewMe(v, period); }
  };

  // Comparaison avec la une du jour, et les histoires pour sortir de ta bulle.
  try {
    const [une, b0, b1] = await Promise.all([
      api(`/api/feed?region=${state.region}&page=0`),
      api(`/api/feed?region=${state.region}&lens=${bubbleLens}&page=0`),
      api(`/api/feed?region=${state.region}&lens=${bubbleLens}&page=1`).catch(() => ({ stories: [] })),
    ]);
    if (state.route.view !== "me") return;
    $("#meGauge").innerHTML = gauge(p.avg, avgOf(une.summary?.counts || {}));
    // Pour sortir de sa bulle, on veut du fond : sujets de société d'abord, et les histoires reprises par plusieurs médias.
    const SERIOUS = ["politique", "international", "economie", "environnement", "sante", "science"];
    const weight = (s) => (s.categories.some((c) => SERIOUS.includes(c)) ? 2 : 0) + Math.min(s.sources, 4) - (s.categories.length && s.categories.every((c) => c === "culture" || c === "sports") ? 3 : 0);
    const fresh = [...b0.stories, ...b1.stories]
      .filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i && !s.articles.every((a) => reads.has(a.url)))
      .sort((a, b) => weight(b) - weight(a))
      .slice(0, 6);
    for (const s of fresh) state.stories.set(s.id, s);
    $("#bubble").innerHTML = fresh.length ? fresh.map((s) => storyRow(s)).join("")
      : `<div class="empty" style="padding:20px 0"><p>Rien de neuf de ce côté pour l'instant.</p></div>`;
  } catch (e) {
    $("#bubble").innerHTML = `<div class="empty" style="padding:20px 0"><p>${esc(e.message)}</p></div>`;
  }
}

function bindMePeriod(v) {
  $("#mePeriod", v).onclick = (e) => {
    const b = e.target.closest("[data-p]");
    if (!b) return;
    store.set("mePeriod", b.dataset.p);
    viewMe(v, b.dataset.p);
  };
}

// Petite carte « Mon prisme » dans la colonne du fil.
function meCard() {
  const p = profile(reads.list().filter((r) => r.ts >= Date.now() - 30 * 864e5));
  if (p.n < 3) return `<section>
      <h2 class="block-h">Mon prisme <small>ton angle mort</small></h2>
      <p class="note" style="margin-top:0">Ouvre des articles depuis Prisme : il te montrera de quel côté tu penches et ce que tu rates de l'autre côté. Tout reste sur cet appareil.</p>
      <a class="link small" href="${href({ v: "moi" })}" data-nav>Voir Mon prisme</a>
    </section>`;
  return `<section>
      <h2 class="block-h">Mon prisme <small>30 jours · ${plural(p.n, "lecture")}</small></h2>
      ${bar(p.counts)}<div style="margin-top:8px">${splitHtml(p.counts)}</div>
      <p class="note">${p.blind ? `Ton angle mort : <b>la ${SIDE_NAME[p.blind]}</b>.` : p.lean === "center" ? "Lectures plutôt équilibrées." : `Tu penches à ${SIDE_NAME[p.lean]}.`} <a class="link" href="${href({ v: "moi" })}" data-nav>Voir mon portrait</a></p>
    </section>`;
}

/* ---------- Qui possède quoi ---------- */
function ownerGroup(owner) {
  // « Indépendant » ou « sans but lucratif » : chacun s'appartient, on les présente ensemble sans laisser croire à un groupe.
  if (/^(Indépendant|Organisme sans but lucratif|Association sans but lucratif)/i.test(owner)) return { key: "Indépendants et sans but lucratif", company: owner.replace(/\s*\(.*\)\s*$/, "") };
  const fam = owner.match(/\([^)]*?\b(?:famille|groupe) (\p{Lu}[\p{L}'’-]+)/u);
  const company = owner.replace(/\s*\(.*\)\s*$/, "").trim();
  return fam ? { key: `Famille ${fam[1]}`, company } : { key: company, company };
}
const OWNER_FILTERS = [["tous", "Tous"], ["CA", "Canada"], ["FR", "France, Belgique, Suisse"], ["US", "États-Unis"], ["GB", "Royaume-Uni"], ["intl", "International"]];
function inFilter(m, f) {
  if (f === "tous") return true;
  if (f === "FR") return ["FR", "BE", "CH"].includes(m.country);
  if (f === "intl") return !["CA", "FR", "BE", "CH", "US", "GB"].includes(m.country);
  return m.country === f;
}
function scaleMini(m) {
  const k = biasKey(m);
  if (k === "state") return `<span class="scale-mini state" title="Média d'État"><span></span><span></span><span></span><span></span><span></span></span>`;
  const pos = m.bias != null ? m.bias + 2 : -1;
  return `<span class="scale-mini" style="--bc:${BIAS[k].color}" title="${esc(BIAS[k].label)}">${[0, 1, 2, 3, 4].map((i) => `<span class="${i === pos ? "on" : ""}"></span>`).join("")}</span>`;
}

async function viewOwners(v, filter = "tous", mode = store.get("ownersMode", "toile")) {
  document.title = "Qui possède quoi — Prisme";
  v.innerHTML = `${folio("Qui possède quoi")}
    <p class="lead-note">Les médias que Prisme connaît, regroupés par propriétaire. Quand une famille contrôle plusieurs entreprises, elles sont réunies. Touche un média pour sa fiche complète.</p>
    <div class="tabs" role="tablist" id="ownerMode" style="margin-top:6px">
      <button type="button" role="tab" data-m="toile" aria-selected="${mode === "toile"}">La carte</button>
      <button type="button" role="tab" data-m="liste" aria-selected="${mode === "liste"}">La liste</button>
    </div>
    <div class="filters" id="ownerFilters">${OWNER_FILTERS.map(([k, l]) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${k === filter}">${l}</button>`).join("")}</div>
    <div class="${mode === "toile" ? "web-wrap" : "owners-grid"}" id="ownersGrid"><div class="loader">Chargement…</div></div>`;
  $("#ownerFilters", v).onclick = (e) => {
    const b = e.target.closest("[data-f]");
    if (b) viewOwners(v, b.dataset.f, mode);
  };
  $("#ownerMode", v).onclick = (e) => {
    const b = e.target.closest("[data-m]");
    if (b) { store.set("ownersMode", b.dataset.m); viewOwners(v, filter, b.dataset.m); }
  };
  if (!state.directory) {
    try { state.directory = (await api("/api/directory")).media; }
    catch (e) { $("#ownersGrid").innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return; }
  }
  const groups = new Map();
  for (const m of state.directory.filter((x) => inFilter(x, filter))) {
    const { key, company } = ownerGroup(m.owner);
    const g = groups.get(key) || { key, companies: new Set(), types: new Set(), items: [] };
    g.companies.add(company);
    g.types.add(m.type);
    g.items.push({ ...m, known: true });
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key, "fr"));
  if (mode === "toile") { drawWeb($("#ownersGrid"), list); return; }
  $("#ownersGrid").innerHTML = list.map((g) => `<section class="owner-block">
      <h3>${esc(g.key)}</h3>
      <div class="sub">${g.key.startsWith("Famille") || g.companies.size > 1 ? `Via ${[...g.companies].map(esc).join(", ")} · ` : ""}${[...g.types].map((t) => TYPE_LABEL[t] || t).join(", ")} · ${plural(g.items.length, "média")}</div>
      <ul class="outlets">${g.items.map((m) => `<li><button type="button" data-domain="${esc(m.domain)}" data-name="${esc(m.name)}">${favicon(m.domain, m.name)}<span class="nm">${esc(m.name)}<small>${esc(m.country)}</small></span>${scaleMini(m)}</button></li>`).join("")}</ul>
    </section>`).join("");
}

const loadD3 = () => window.d3 ? Promise.resolve(window.d3) : new Promise((res, rej) => {
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js";
  s.onload = () => res(window.d3);
  s.onerror = () => rej(new Error("Impossible de charger la toile (connexion ?)."));
  document.head.append(s);
});

// La carte des propriétaires : une bulle par groupe qui possède plusieurs médias, et une bulle
// « Propriétaire unique » (classée par pays) pour tous les autres. Tous les médias de Prisme y sont.
// Toucher une bulle zoome dessus et affiche sa fiche ; toucher un média ouvre la fiche du média.
const ZONE_LABEL = { CA: "Canada", FR: "France", BE: "Belgique", CH: "Suisse", US: "États-Unis", GB: "Royaume-Uni" };
async function drawWeb(el, groups) {
  let d3;
  try { d3 = await loadD3(); } catch (e) { el.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return; }
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  const color = (k) => v({ l2: "--b-l2", l1: "--b-l1", c: "--b-c", r1: "--b-r1", r2: "--b-r2", state: "--b-state", unk: "--b-unk" }[k]);
  const ink = v("--ink"), paper = v("--paper"), card = v("--card"), hair = v("--hair"), paper2 = v("--paper-2");
  const darkText = (k) => ["l1", "c", "r1", "unk"].includes(k);

  const multi = groups.filter((g) => g.items.length >= 2 && !g.key.startsWith("Indépendants"));
  const singles = groups.filter((g) => !multi.includes(g)).flatMap((g) => g.items);
  const byZone = new Map();
  for (const m of singles) {
    const z = ZONE_LABEL[m.country] || "Ailleurs";
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z).push(m);
  }
  const data = {
    name: "Tous",
    children: [
      ...multi.map((g) => ({ name: g.key, kind: "owner", g, children: g.items.map((m) => ({ name: m.name, m })) })),
      ...(singles.length ? [{ name: "Propriétaire unique", kind: "singles", n: singles.length,
        children: [...byZone.entries()].map(([z, list]) => ({ name: z, kind: "zone", children: list.map((m) => ({ name: m.name, m, light: true })) })) }] : []),
    ],
  };
  const total = multi.reduce((n, g) => n + g.items.length, 0) + singles.length;

  // Sur grand écran, la fiche est à droite de la carte ; sur téléphone, en dessous.
  const W = innerWidth > 1020 ? Math.max(420, Math.min((el.clientWidth || 1100) - 320, 820)) : (el.clientWidth || 343);
  el.innerHTML = `<p class="note" style="margin:0 0 10px">${plural(total, "média")}. ${multi.length} groupes en possèdent plusieurs ; les ${singles.length} autres ont chacun leur propriétaire. Chaque bulle est un propriétaire, et les ronds à l'intérieur sont ses médias, colorés selon leur orientation. <b>Touche une bulle</b> pour l'ouvrir, puis un média pour sa fiche.</p>
    <div class="pack-wrap"><div class="pack" style="width:${W}px;height:${W}px"></div>
      <div class="pack-info" id="packInfo"></div></div>
    <div class="legend" style="margin-top:12px">${["l2", "l1", "c", "r1", "r2", "state"].map((k) => `<span class="bb bb-${k}">${BIAS[k].label}</span>`).join("")}</div>`;

  const root = d3.pack().size([W, W]).padding((d) => (d.depth === 0 ? 10 : d.depth === 1 ? 4 : 3))(
    // Les médias à propriétaire unique pèsent moins, pour que les groupes ressortent (à l'intérieur, ils restent égaux entre eux).
    d3.hierarchy(data).sum((d) => (d.children ? 0 : d.light ? 0.055 : 1)).sort((a, b) => b.value - a.value || a.data.name.localeCompare(b.data.name, "fr")));
  const svg = d3.select($(".pack", el)).append("svg").attr("viewBox", [-W / 2, -W / 2, W, W]).attr("width", W).attr("height", W).style("cursor", "pointer");
  const g = svg.append("g");
  let focus = root, view;

  const nodes = root.descendants().slice(1);
  const circle = g.selectAll("circle").data(nodes).join("circle")
    .attr("class", (d) => (d.children ? "pk-owner" : "pk-media"))
    .attr("fill", (d) => (!d.children ? color(biasKey(d.data.m)) : d.data.kind === "singles" ? paper2 : card))
    .attr("stroke", (d) => (!d.children ? paper : d.data.kind === "owner" ? ink : hair))
    .attr("stroke-width", (d) => (d.children && d.data.kind === "owner" ? 1.5 : 1))
    .attr("stroke-dasharray", (d) => (d.data.kind === "singles" ? "4 3" : null))
    .on("click", (e, d) => {
      e.stopPropagation();
      if (d.children) { if (focus !== d) zoomTo(d); return; }
      if (focus === d.parent) openMedia(d.data.m.domain, d.data.m.name);
      else zoomTo(d.parent);
    });
  circle.append("title").text((d) => (d.children ? `${d.data.name} · ${plural(d.leaves().length, "média")}` : `${d.data.name} · ${BIAS[biasKey(d.data.m)].label}`));

  const label = g.selectAll("text").data(nodes).join("text").attr("text-anchor", "middle").attr("pointer-events", "none").attr("paint-order", "stroke").attr("stroke-linejoin", "round");

  // Coupe un nom en 1 à 3 lignes qui tiennent dans le cercle (au lieu de le tronquer).
  const wrap = (txt, widthPx, size) => {
    const max = Math.max(4, Math.floor(widthPx / (size * 0.56)));
    const lines = [];
    let cur = "";
    for (const w of txt.split(/\s+/)) {
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= max) cur += " " + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    const out = lines.slice(0, 3).map((l) => (l.length > max ? l.slice(0, max - 1) + "…" : l));
    if (lines.length > 3) out[2] = out[2].replace(/…?$/, "…");
    return out;
  };

  function place([x, y, w]) {
    const k = W / w;
    view = [x, y, w];
    circle.attr("transform", (d) => `translate(${(d.x - x) * k},${(d.y - y) * k})`).attr("r", (d) => d.r * k);
    label.each(function (d) {
      const r = d.r * k;
      const t = d3.select(this);
      t.selectAll("tspan").remove();
      if (d.parent !== focus || r < 16) { t.attr("display", "none"); return; }
      const isGroup = !!d.children;
      const size = isGroup ? Math.max(W < 500 ? 9 : 11, Math.min(18, r / 3.4)) : Math.max(9.5, Math.min(15, r / 3));
      let lines = wrap(isGroup && d.data.kind === "singles" ? `Les autres (${d.leaves().length})` : d.data.name, r * (isGroup ? 1.75 : 1.6), size);
      if (!isGroup && r < 22) lines = lines.slice(0, 2);
      // Un nom coupé ne sert à rien : on le cache (la liste sous la carte le donne en entier).
      if (lines.some((l) => l.endsWith("…")) && (isGroup ? r < 60 : r < 30)) { t.attr("display", "none"); return; }
      const lh = size * 1.1;
      // Le nom d'un groupe se place en haut de sa bulle, pour laisser voir ses médias.
      const cy = isGroup ? -r * 0.55 + (lines.length - 1) * lh * 0.15 : 0;
      const k2 = isGroup ? null : biasKey(d.data.m);
      t.attr("display", null).attr("font-size", size).attr("font-weight", isGroup ? 700 : 600)
        .attr("font-family", isGroup ? "Newsreader, Georgia, serif" : "IBM Plex Sans, system-ui, sans-serif")
        .attr("fill", isGroup ? ink : darkText(k2) ? "#1E1D1A" : "#FFFFFF")
        .attr("stroke", isGroup ? paper : null).attr("stroke-width", isGroup ? 4 : 0);
      lines.forEach((line, i) => t.append("tspan")
        .attr("x", (d.x - x) * k).attr("y", (d.y - y) * k + cy + (i - (lines.length - 1) / 2) * lh).attr("dy", "0.35em").text(line));
    });
  }

  function info(d) {
    const box = $("#packInfo");
    if (!box) return;
    if (d === root) {
      const owners = root.children.filter((c) => c.data.kind === "owner").sort((a, b) => b.leaves().length - a.leaves().length);
      const solo = root.children.find((c) => c.data.kind === "singles");
      box.innerHTML = `<div class="kicker">Les groupes qui possèdent plusieurs médias</div>
        <ul class="pk-top">${owners.map((c) => `<li><button type="button" data-node="${esc(c.data.name)}"><span>${esc(c.data.name)}</span><b>${plural(c.leaves().length, "média")}</b></button></li>`).join("")}</ul>
        ${solo ? `<ul class="pk-top" style="margin-top:14px"><li><button type="button" data-node="${esc(solo.data.name)}"><span><i>Et ${solo.leaves().length} médias à propriétaire unique</i></span><b>par pays</b></button></li></ul>` : ""}`;
      box.onclick = (e) => { const b = e.target.closest("[data-node]"); if (b) zoomTo(root.children.find((c) => c.data.name === b.dataset.node)); };
      return;
    }
    const items = d.leaves().map((l) => l.data.m);
    const counts = Object.fromEntries(ORDER.map((k) => [k, 0]));
    for (const m of items) counts[biasKey(m)]++;
    const gr = d.data.g;
    const sub = gr ? `${gr.key.startsWith("Famille") || gr.companies.size > 1 ? `Via ${[...gr.companies].join(", ")} · ` : ""}${[...gr.types].map((t) => TYPE_LABEL[t] || t).join(", ")}`
      : d.data.kind === "singles" ? "Des médias qui appartiennent chacun à un propriétaire différent, classés par pays." : `Propriétaire unique · ${esc(d.data.name)}`;
    box.innerHTML = `<button class="back" type="button" id="packBack" style="margin:0 0 8px">← ${d.parent === root ? "Tous les propriétaires" : esc(d.parent.data.name)}</button>
      <div class="kicker">${d.data.kind === "owner" ? "Propriétaire" : d.data.kind === "singles" ? "Propriétaire unique" : "Pays"}</div>
      <h3 class="pk-name">${esc(d.data.name)}</h3>
      <p class="note" style="margin:0 0 10px">${esc(sub)} · ${plural(items.length, "média")}</p>
      <div style="margin-bottom:10px">${splitHtml(counts)}</div>
      ${d.data.kind === "singles" ? `<ul class="pk-top">${d.children.map((c) => `<li><button type="button" data-node="${esc(c.data.name)}"><span>${esc(c.data.name)}</span><b>${plural(c.leaves().length, "média")}</b></button></li>`).join("")}</ul>`
        : `<ul class="outlets">${items.map((m) => `<li><button type="button" data-domain="${esc(m.domain)}" data-name="${esc(m.name)}">${favicon(m.domain, m.name)}<span class="nm">${esc(m.name)}<small>${d.data.kind === "zone" ? esc(m.owner.replace(/\s*\(.*\)$/, "")) : esc(m.country)}</small></span>${badge(m)}</button></li>`).join("")}</ul>`}`;
    $("#packBack").onclick = () => zoomTo(d.parent);
    box.onclick = (e) => { const b = e.target.closest("[data-node]"); if (b) zoomTo(d.children.find((c) => c.data.name === b.dataset.node)); };
  }

  function zoomTo(d) {
    if (!d) return;
    focus = d;
    info(d);
    svg.transition().duration(650).ease(d3.easeCubicInOut).tween("zoom", () => {
      const i = d3.interpolateZoom(view, [d.x, d.y, d.r * 2 + (d === root ? 0 : 8)]);
      return (t) => place(i(t));
    });
    if (innerWidth < 761) $(".pack", el).scrollIntoView({ behavior: "smooth", block: "start" });
  }

  svg.on("click", () => zoomTo(focus.parent || root));
  place([root.x, root.y, root.r * 2]);
  info(root);
}

/* ---------- Fiche média ---------- */
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-domain]");
  if (b && b.dataset.domain) { e.preventDefault(); e.stopPropagation(); openMedia(b.dataset.domain, b.dataset.name); }
}, true);

async function openMedia(domain, name) {
  const body = $("#drawerBody");
  body.innerHTML = `<div class="dr-head"><div class="dr-logo fallback">${esc((name || domain)[0].toUpperCase())}</div><h2 id="drawerTitle">${esc(name || domain)}</h2><span class="dom">${esc(domain)}</span></div>
    <div class="dr-sec"><div class="loader" style="text-align:left;padding:0">Recherche du propriétaire…</div></div>`;
  openLayer("#drawer");
  let info = state.media.get(domain);
  if (!info) {
    try { info = await api(`/api/media?domain=${encodeURIComponent(domain)}`); state.media.set(domain, info); }
    catch (e) { body.querySelector(".dr-sec").innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  }
  if ($("#drawer").getAttribute("aria-hidden") === "true") return;
  body.innerHTML = mediaSheet(domain, name, info);
}

function mediaSheet(domain, name, info) {
  const c = info.curated, w = info.wikidata;
  const m = c ? { known: true, ...c } : { known: false };
  const k = biasKey(m);
  const title = c?.name || w?.label || name || domain;
  const owners = [...new Set([...(w?.owners || []), ...(w?.parents || [])])];
  const ultimate = (w?.ultimateOwners || []).filter((u) => !owners.includes(u) && !/^Q\d+$/.test(u));
  const chain = [`<div class="node"><small>Média</small><span>${esc(title)}</span></div>`];
  if (c?.owner) chain.push(`<div class="node"><small>Propriétaire (Prisme)</small><span>${esc(c.owner)}</span></div>`);
  if (owners.length) chain.push(`<div class="node"><small>Propriétaire selon Wikidata</small><span>${owners.map(esc).join(" · ")}</span></div>`);
  if (ultimate.length) chain.push(`<div class="node top"><small>Contrôlé ultimement par</small><span>${ultimate.slice(0, 4).map(esc).join(" · ")}</span></div>`);
  const facts = [
    ["Type", c ? TYPE_LABEL[c.type] || c.type : null],
    ["Pays", countryName(info.country) || w?.countries?.[0]],
    ["Fondé en", w?.inception],
    ["Orientation (Wikidata)", w?.alignment?.join(", ")],
    ["Idéologie (Wikidata)", w?.ideology?.slice(0, 3).join(", ")],
  ].filter(([, val]) => val);
  const siblings = (w?.siblings || []).slice(0, 14);
  const pos = c && c.bias != null ? c.bias + 2 : -1;

  return `<div class="dr-head">
    ${w?.logo ? `<div class="dr-logo"><img src="${esc(safeUrl(w.logo))}" alt="" referrerpolicy="no-referrer"></div>` : `<div class="dr-logo fallback">${esc(title[0].toUpperCase())}</div>`}
    <h2 id="drawerTitle">${esc(title)}</h2>
    <a class="dom" href="https://${esc(domain)}" target="_blank" rel="noopener noreferrer">${esc(domain)} ↗</a>
    ${w?.description ? `<p class="dr-desc">${esc(w.description[0].toUpperCase() + w.description.slice(1))}</p>` : ""}
  </div>
  <section class="dr-sec"><h3>Orientation</h3>
    ${c?.state ? `<div class="state-badge"><svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V10M19 21V10M9 21v-6h6v6M12 3l9 5H3z"/></svg><div><b>Média d'État · ${esc(c.state)}</b><div class="note">La ligne éditoriale suit celle du gouvernement. Le spectre gauche/droite ne s'applique pas.</div></div></div>`
      : pos >= 0 ? `<div class="scale" style="--bc:${BIAS[k].color}">${[0, 1, 2, 3, 4].map((i) => `<span class="${i === pos ? "on" : ""}"></span>`).join("")}</div>
        <div class="scale-labels"><span>Gauche</span><span>Centre</span><span>Droite</span></div><div class="scale-verdict">${esc(BIAS[k].label)}</div>`
      : `<p class="muted" style="margin:0">Ce média n'est pas encore évalué dans Prisme.${w?.alignment?.length ? ` Wikidata le classe : <b>${esc(w.alignment.join(", "))}</b>.` : ""}</p>`}
  </section>
  ${chain.length > 1 ? `<section class="dr-sec"><h3>Qui le possède</h3><div class="chain">${chain.join("")}</div></section>` : ""}
  ${facts.length ? `<section class="dr-sec"><h3>Fiche</h3><div class="facts">${facts.map(([l, val]) => `<div class="fact"><small>${esc(l)}</small><span>${esc(val)}</span></div>`).join("")}</div></section>` : ""}
  ${info.sameOwner?.length ? `<section class="dr-sec"><h3>Même propriétaire</h3><div class="tags">${info.sameOwner.map((s) => `<button class="chip" type="button" data-domain="${esc(s.domain)}" data-name="${esc(s.name)}"><span class="sw" style="background:${BIAS[biasKey({ known: true, bias: s.bias })].color}"></span>${esc(s.name)}</button>`).join("")}</div></section>` : ""}
  ${siblings.length ? `<section class="dr-sec"><h3>Le même groupe possède aussi</h3><div class="tags">${siblings.map((s) => `<button class="chip" type="button" data-domain="${esc(s.domain)}" data-name="${esc(s.name)}">${esc(s.name)}</button>`).join("")}</div><p class="note" style="margin:12px 0 0">Selon Wikidata : médias et entreprises qui partagent le même propriétaire ou la même société mère.</p></section>` : ""}
  <section class="dr-sec">
    <div class="links">
      ${w?.wikipedia ? `<a class="btn ghost" href="${esc(safeUrl(w.wikipedia))}" target="_blank" rel="noopener noreferrer">Wikipédia ↗</a>` : ""}
      ${w?.url ? `<a class="btn ghost" href="${esc(safeUrl(w.url))}" target="_blank" rel="noopener noreferrer">Wikidata ↗</a>` : ""}
      <a class="btn ghost" href="https://github.com/axe414/prisme/issues/new?template=corriger-un-media.yml&media=${encodeURIComponent(`${title} (${domain})`)}" target="_blank" rel="noopener noreferrer">Signaler une erreur ↗</a>
    </div>
    <p class="note" style="margin:16px 0 0">L'orientation est une estimation indicative inspirée des évaluations publiques (AllSides, Media Bias/Fact Check, Ad Fontes). La propriété vient de la base Prisme et de Wikidata, une source collaborative qui peut être incomplète ou en retard.${info.wikidataError ? ` Wikidata : ${esc(info.wikidataError)}.` : ""}</p>
  </section>`;
}

/* ---------- Couches (tiroir, fenêtre) ---------- */
let lastFocus = null;
function openLayer(sel) {
  const el = $(sel);
  if (el.classList.contains("open")) return;
  lastFocus = document.activeElement;
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => $(".drawer-close, .modal-close", el)?.focus(), 50);
}
function closeLayer(sel) {
  const el = $(sel);
  if (!el.classList.contains("open")) return;
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
  if (sel === "#modal") setTimeout(() => { if (!el.classList.contains("open")) $("#modalBody").innerHTML = ""; }, 300);
  if (!$(".drawer.open, .modal.open")) document.body.style.overflow = "";
  lastFocus?.focus?.();
}
$$("[data-close]").forEach((b) => b.addEventListener("click", () => closeLayer(b.closest(".drawer") ? "#drawer" : "#modal")));

function openModal(html, narrow = false) {
  $(".modal-box").classList.toggle("narrow", narrow);
  $("#modalBody").innerHTML = html;
  openLayer("#modal");
}

function openVideo(v) {
  if (!v || !/^[\w-]{6,20}$/.test(v.id)) return;
  openModal(`<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
    <div class="player-info"><h3>${esc(v.title)}</h3><div class="kicker">${esc(v.channel)} · ${esc(ago(v.published))}</div></div>`);
}

function askAccessCode() {
  return new Promise((resolve) => {
    openModal(`<div class="modal-pad">
      <div class="kicker">Accès privé</div>
      <h2>Entre ton code</h2>
      <p>Cette édition de Prisme est réservée. Entre le code que tu as reçu.</p>
      <form class="access-form" id="accessForm"><input type="password" name="code" placeholder="Code d'accès" autocomplete="current-password" required><button class="btn" type="submit">Entrer</button></form>
      <div class="err-text" id="accessErr" hidden>Code incorrect.</div>
    </div>`, true);
    if (store.get("code", "")) $("#accessErr").hidden = false;
    setTimeout(() => $("#accessForm input").focus(), 60);
    $("#accessForm").onsubmit = (e) => {
      e.preventDefault();
      store.set("code", e.target.code.value.trim());
      closeLayer("#modal");
      resolve();
    };
  });
}

const ABOUT_EN = `<div class="modal-pad">
    <div class="kicker">Method</div>
    <h2>How Prisme chooses</h2>
    <p>Prisme doesn't rely on any aggregator for its feed. A robot reads the public feeds of about 2,900 news outlets in nearly 70 countries every 30 minutes, from left to right. Nobody sorts the news for you.</p>
    <h3>Stories, not articles</h3>
    <p>Articles about the same event are grouped into one story, even across languages. Each outlet counts as one voice, and an owner publishing the same text in two papers only counts once.</p>
    <h3>Lenses</h3>
    <dl>${Object.values(LENSES).map((l) => `<dt>${esc(l.label)}</dt><dd>${esc(l.desc)}</dd>`).join("")}</dl>
    <h3>Leaning and ownership</h3>
    <p>About 160 well-known outlets have an indicative leaning on five levels, inspired by public ratings (AllSides, Media Bias/Fact Check, Ad Fontes Media). State-controlled outlets are listed separately. Outlets discovered automatically are marked “Not rated”. Ownership comes from Prisme's database and Wikidata.</p>
    <h3>My prism</h3>
    <p>When you open an article from Prisme, its outlet, leaning and owner are logged in your browser, and nowhere else. You can erase everything in one tap.</p>
    <h3>Search</h3>
    <p>Type a topic or an outlet's name: suggestions appear as you type. “Search all articles” looks through every article published in the last 48 hours by the edition's outlets, even those not part of a story. Results are sorted newest first.</p>
    <h3>Limits</h3>
    <p>A left/right label sums up a whole outlet, not each article. Feeds only cover roughly the last 48 hours. Neutral summaries are written by AI from headlines only. Use Prisme as a compass, not a verdict.</p>
  </div>`;

function openAbout() {
  if (LANG === "en") { openModal(ABOUT_EN); return; }
  openModal(`<div class="modal-pad">
    <div class="kicker">Méthode</div>
    <h2>Comment Prisme choisit</h2>
    <p>Prisme ne passe par aucun agrégateur pour son fil. Toutes les 30 minutes, un robot lit lui-même les flux publics d'environ 2 900 médias dans près de 70 pays, de la gauche à la droite. Personne ne trie à sa place.</p>
    <h3>Des histoires, pas des articles</h3>
    <p>Les articles qui racontent le même évènement sont regroupés en une histoire, même d'une langue à l'autre. Chaque média compte pour une voix, et un même propriétaire qui publie le même texte dans deux journaux ne compte qu'une fois.</p>
    <h3>Les lentilles</h3>
    <dl>${Object.values(LENSES).map((l) => `<dt>${esc(l.label)}</dt><dd>${esc(l.desc)}</dd>`).join("")}</dl>
    <h3>Les rubriques</h3>
    <p>Prisme classe lui-même chaque article d'après son adresse, ses étiquettes et ses mots. Une histoire peut appartenir à plusieurs rubriques.</p>
    <h3>L'orientation et la propriété</h3>
    <p>Environ 160 médias connus ont une orientation indicative sur cinq niveaux, inspirée des évaluations publiques (AllSides, Media Bias/Fact Check, Ad Fontes Media). Les médias contrôlés par un État sont à part. Les médias découverts automatiquement sont marqués « Non évalué ». La propriété vient de la base Prisme et de Wikidata.</p>
    <h3>Mon prisme</h3>
    <p>Quand tu ouvres un article depuis Prisme, son média, son orientation et son propriétaire sont notés dans ton navigateur, et nulle part ailleurs. « Mon prisme » s'en sert pour te montrer de quel côté tu penches, à qui appartient ce que tu lis, et ce que tu rates de l'autre côté. Tu peux tout effacer en un clic.</p>
    <h3>La recherche élargie</h3>
    <p>Tape un sujet ou le nom d'un média : des suggestions apparaissent pendant que tu écris. Le bouton « Chercher dans tous les articles » fouille chaque article publié depuis 48 heures par les médias de l'édition, même ceux qui ne font pas partie d'une histoire. Personne ne trie : du plus récent au plus ancien.</p>
    <h3>Les limites</h3>
    <p>Une étiquette gauche/droite résume un média entier, pas chaque article. Les flux ne couvrent que les dernières 48 heures environ. Sers-toi de Prisme comme d'une boussole, pas d'un verdict.</p>
  </div>`);
}

/* ---------- Évènements globaux ---------- */
document.addEventListener("click", (e) => { if (e.target.closest("[data-about]")) openAbout(); });
$("#aboutBtn").addEventListener("click", openAbout);
$("#aboutBtn2").addEventListener("click", openAbout);
$("#themeBtn").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur === "dark" || (cur !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  $('meta[name="theme-color"]').content = next === "light" ? "#F4F2EC" : "#121211";
  store.set("theme", next);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeLayer($("#modal").classList.contains("open") ? "#modal" : "#drawer"); return; }
  if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    e.preventDefault();
    $("#search input").focus();
  }
});

history.scrollRestoration = "manual";
startTranslation();
$("#langBtn").textContent = LANG === "en" ? "FR" : "EN";
$("#langBtn").title = LANG === "en" ? "Passer en français" : "Switch to English";
$("#langBtn").onclick = () => setLang(LANG === "en" ? "fr" : "en");
render({ scroll: history.state?.y || 0 });
window.__prismeReady = true;

// App installable : le service worker garde l'app et les dernières histoires pour le mode hors ligne.
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
setTimeout(() => checkAlerts({ notify: false }), 4000);
