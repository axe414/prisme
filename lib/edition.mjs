// Les éditions de Prisme, calculées d'avance : pour chaque région, les histoires classées et tout ce que l'app
// affiche (sujets du moment, silences, vu d'ailleurs, quiz, titres modifiés), dans un seul fichier JSON.
// Utilisé par le robot GitHub (tools/build-edition.mjs) et par le serveur local (dev-server.mjs).
import { cluster, storyFrom, tokens, biasKey } from "./cluster.mjs";

export const REGION_COUNTRIES = {
  qc: ["CA"], ca: ["CA"], fr: ["FR", "BE", "CH"], us: ["US"], uk: ["GB"],
  europe: ["FR", "BE", "CH", "DE", "AT", "ES", "PT", "IT", "NL", "LU", "IE", "GB", "SE", "NO", "DK", "FI", "IS", "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "RS", "SI", "HR", "BA", "AL", "MK", "LV", "LT", "EE", "UA", "MD", "BY", "RU"],
  latam: ["MX", "AR", "CO", "CL", "PE", "VE", "CU", "BR", "UY", "EC", "BO", "PY", "GT", "CR", "DO", "PR", "HN", "SV", "NI", "PA"],
  afrique: ["MA", "DZ", "TN", "LY", "EG", "SN", "CI", "CM", "ML", "BF", "NE", "NG", "GH", "KE", "ET", "TZ", "UG", "RW", "CD", "ZA", "ZW", "ZM", "MZ", "AO", "MG", "SD"],
  moyenorient: ["IL", "PS", "EG", "SA", "AE", "QA", "KW", "BH", "OM", "YE", "JO", "LB", "SY", "IQ", "IR", "TR"],
  asie: ["IN", "PK", "BD", "LK", "NP", "JP", "KR", "KP", "CN", "TW", "HK", "MO", "MN", "SG", "MY", "ID", "PH", "TH", "VN", "KH", "LA", "MM", "AF", "KZ", "UZ"],
  oceanie: ["AU", "NZ", "FJ", "PG"],
  monde: null,
};
export const REGIONS = ["monde", "qc", "ca", "us", "fr", "uk", "europe", "latam", "afrique", "moyenorient", "asie", "oceanie"];
export const LENSES = ["essentiel", "angles", "gauche", "droite", "horsradar", "recent"];
const CATEGORIES = ["politique", "international", "economie", "environnement", "techno", "science", "sante", "culture", "sports"];

const hoursAgo = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 36e5 : 48);
const decay = (h, half = 10) => Math.pow(0.5, Math.max(0, h) / half);
const round = (x) => Math.round(x * 1000) / 1000;

// 1) Les histoires d'une région, avec leurs scores pour chaque lentille.
// L'édition Québec : les médias du Québec, ceux en français et les grands médias canadiens connus,
// mais pas les hebdos locaux de l'Ontario ou de l'Ouest (ils restent dans l'édition Canada).
const QC_REGIONS = new Set(["Québec", "Montréal", "Laval", "Capitale-Nationale", "Outaouais", "Montérégie", "Estrie", "Chaudière-Appalaches", "Saguenay--Lac-Saint-Jean",
  "Mauricie", "Lanaudière", "Centre-du-Québec", "Laurentides", "Bas-Saint-Laurent", "Abitibi-Témiscamingue", "Côte-Nord", "Gaspésie--Îles-de-la-Madeleine", "Nord-du-Québec"]);
export const inEdition = (a, region) => {
  const countries = REGION_COUNTRIES[region];
  if (countries && !countries.includes(a.media.country)) return false;
  if (region === "qc") return a.lang === "fr" || a.media.known || QC_REGIONS.has(a.media.region) || (!a.media.region && a.lang !== "en");
  return true;
};
export function buildStories(index, region) {
  const countries = REGION_COUNTRIES[region];
  const arts = index.articles.filter((a) => inEdition(a, region));
  const groups = cluster(arts, { threshold: 0.55, maxHours: 36 });
  const stories = groups.map((g) => {
    const s = storyFrom(g.idx.map((i) => arts[i]), { prefer: region === "qc" || region === "fr" ? "fr" : null });
    const { left, center, right, pol } = s.split;
    const sides = [left, center, right].filter(Boolean).length;
    // Au Québec, une voix québécoise francophone compte un peu plus dans « L'essentiel ».
    const seen = new Set();
    let weight = 0;
    for (const a of s.articles) if (!seen.has(a.domain)) { seen.add(a.domain); weight += region === "qc" && a.lang === "fr" ? 1.5 : 1; }
    const age = hoursAgo(s.lastSeen);
    const share = (n) => (pol ? n / pol : 0);
    return {
      ...s,
      sides,
      age,
      lean: pol >= 2 ? (share(left) >= 0.6 ? "left" : share(right) >= 0.6 ? "right" : null) : null,
      scores: {
        // Au Québec, une histoire dont aucun média francophone ne parle passe derrière.
        essentiel: weight * (1 + 0.35 * (sides - 1)) * decay(age) * (region === "qc" && !s.articles.some((a) => a.lang === "fr") ? 0.4 : 1),
        gauche: left >= 1 && share(left) >= 0.6 ? left * share(left) * decay(age, 14) : 0,
        droite: right >= 1 && share(right) >= 0.6 ? right * share(right) * decay(age, 14) : 0,
        angles: s.blindspot || (pol >= 4 && Math.min(share(left), share(right)) <= 0.15 && Math.max(share(left), share(right)) >= 0.35) ? s.sources * decay(age, 16) : 0,
        horsradar: s.sources <= 2 && s.articles.some((a) => a.media.known) ? decay(age, 8) * (["indépendant", "OBNL", "coopérative"].includes(s.articles[0].media.type) ? 2 : 1) : 0,
        recent: -age,
      },
    };
  });
  return { fetchedAt: index.fetchedAt, region, countries, stories, trending: trending(stories) };
}

// Les sujets du moment : les noms propres qui reviennent dans le plus d'histoires couvertes par plusieurs médias.
function trending(stories) {
  const score = new Map(), surface = new Map();
  for (const s of stories) {
    if (s.sources < 2 || s.age > 24) continue;
    const seen = new Set();
    for (const a of s.articles.slice(0, 12)) {
      for (const m of a.title.matchAll(/\b(\p{Lu}[\p{L}'’-]{2,}(?:\s+\p{Lu}[\p{L}'’-]{2,})?)/gu)) {
        const raw = m[1];
        if (m.index === 0 && !/\s/.test(raw)) continue; // majuscule de début de phrase
        if (/^[\p{Lu}\s'’-]+$/u.test(raw) && raw.length > 4) continue; // titres EN MAJUSCULES
        const key = [...tokens(raw)].join(" ");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!surface.has(key)) surface.set(key, new Map());
        surface.get(key).set(raw, (surface.get(key).get(raw) || 0) + 1);
      }
    }
    for (const k of seen) score.set(k, (score.get(k) || 0) + Math.log2(1 + s.sources));
  }
  const firstWords = /^(Le|La|Les|Un|Une|Des|Du|De|Au|Aux|En|Et|Pour|Avec|Sur|Dans|The|A|An|In|On|Of|For|And|With|How|Why|What|Who|When|This|After|Before|Quand|Comment|Pourquoi|Voici|Selon|Après|Avant|Il|Elle|Ils|Nous|Vous|Ce|Ces|Cette|Mon|Ma|Mes|Notre|Nos|Son|Sa|Ses|Leur|Leurs|Que|Qui|Où|Is|Are|Was|It|He|She|They|We|You|Here|There|Not|No|Yes|Our|Your|Their|His|Her|Its|My|BREAKING|EXCLUSIVE|VIDEO|VIDÉO|LIVE|WATCH|OPINION|DIRECT|Direct|EN|INFOGRAPHIE|ANALYSE|Analyse|Chronique|Éditorial|Editorial|Lettre|Opinion|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Janv|Févr|Avr|Juil|Déc|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Inc|Ltd|Corp|Co|LLC|Ltée|Cie)$/;
  const generic = /^(qu[ée]bec|qu[ée]b[ée]cois\w*|canada|canadien\w*|canadian\w*|montr[ée]al|ottawa|france|fran[çc]ais\w*|french|paris|[ée]tats-unis|am[ée]ricain\w*|american\w*|us|usa|uk|britain|british|london|londres|europe\w*|monde|world|gouvernement|government)$/i;
  return [...score.entries()]
    .map(([k, v]) => [[...surface.get(k).entries()].sort((a, b) => b[1] - a[1])[0][0], v])
    .filter(([w]) => !firstWords.test(w.split(/\s+/)[0]) && !generic.test(w))
    .sort((a, b) => b[1] - a[1]).slice(0, 14).map(([w]) => w);
}

/* ---------- 2) Le fichier d'une édition ---------- */
const mediaOut = (m) => (m.known
  ? { known: true, name: m.name, bias: m.bias, country: m.country, type: m.type, owner: m.owner, state: m.state || null }
  : { known: false, name: m.name || null, country: m.country || null });
const artOut = (a) => {
  const o = { title: a.title, url: a.url, published: a.published, sourceName: a.sourceName, domain: a.domain, media: mediaOut(a.media), lang: a.lang || null };
  if (a.prevTitle) { o.prevTitle = a.prevTitle; o.changedAt = a.changedAt; }
  return o;
};
// Jusqu'à 24 articles par histoire, en privilégiant un article par média (pour la diversité des titres).
function pickArticles(list, max = 24) {
  const out = [], seen = new Set();
  for (const a of list) if (!seen.has(a.domain)) { seen.add(a.domain); out.push(a); if (out.length >= max) break; }
  for (const a of list) { if (out.length >= max) break; if (!out.includes(a)) out.push(a); }
  return out.map(artOut);
}

const ZONES = [["CA", "Canada et Québec", ["CA"]], ["FR", "France, Belgique, Suisse", ["FR", "BE", "CH"]], ["US", "États-Unis", ["US"]], ["GB", "Royaume-Uni", ["GB"]]];
// La même histoire dans l'édition Monde (celle qui partage le plus d'articles), regroupée par pays des médias.
function worldOf(s, monde) {
  let best = s;
  if (monde) {
    const counts = new Map();
    for (const a of s.articles) { const w = monde.byUrl.get(a.url); if (w) counts.set(w, (counts.get(w) || 0) + 1); }
    let n = 0;
    for (const [w, c] of counts) if (c > n) { n = c; best = w; }
  }
  if (best.sources < 3) return null;
  const zones = ZONES.map(([key, label, cc]) => ({ key, label, all: best.articles.filter((a) => a.media.country && cc.includes(a.media.country) && a.media.bias !== null) }));
  zones.push({ key: "XX", label: "Ailleurs et médias d'État", all: best.articles.filter((a) => !ZONES.some(([, , cc]) => cc.includes(a.media.country)) || a.media.bias === null) });
  return { sources: best.sources, zones: zones.map((z) => ({ key: z.key, label: z.label, n: z.all.length, articles: pickArticles(z.all, 5) })) };
}

// Tous les articles d'une édition (48 h), en format compact : pour la recherche et la page de chaque média.
// domains : [domaine, nom, orientation (clé), propriétaire, pays, biais, État] ; items : [titre, lien, n° du média, minute de publication, langue]
export function articlesFile(index, region) {
  const countries = REGION_COUNTRIES[region];
  const dIdx = new Map(), domains = [], items = [];
  for (const a of index.articles) {
    if (countries && !countries.includes(a.media.country)) continue;
    if (!dIdx.has(a.domain)) {
      const m = a.media;
      dIdx.set(a.domain, domains.length);
      domains.push([a.domain, a.sourceName || a.domain, biasKey(m), m.known ? m.owner : null, m.country || null, m.known ? m.bias : null, m.state || null]);
    }
    const cats = (a.categories || []).reduce((m, c) => { const i = CATEGORIES.indexOf(c); return i >= 0 ? m | (1 << i) : m; }, 0);
    items.push([a.title, a.url, dIdx.get(a.domain), a.published ? Math.round(Date.parse(a.published) / 60000) : 0, a.lang || null, cats]);
  }
  items.sort((x, y) => y[3] - x[3]);
  return { region, builtAt: new Date().toISOString(), domains, items };
}

export function mondeLookup(mondeData) {
  const byUrl = new Map();
  for (const s of mondeData.stories) if (s.sources >= 2) for (const a of s.articles) byUrl.set(a.url, s);
  return { byUrl };
}

export function editionFile(index, data, monde) {
  const { region, countries, stories } = data;
  const inRegion = (a) => !countries || countries.includes(a.media.country);

  // Les histoires retenues : les meilleures de chaque lentille, et de chaque rubrique.
  const keep = new Set();
  const top = (list, key, n) => list.filter((s) => key === "recent" || s.scores[key] > 0).sort((a, b) => b.scores[key] - a.scores[key]).slice(0, n);
  for (const lens of LENSES) for (const s of top(stories, lens, 160)) keep.add(s);
  for (const c of CATEGORIES) {
    const inCat = stories.filter((s) => s.categories.includes(c));
    for (const lens of LENSES) for (const s of top(inCat, lens, lens === "essentiel" || lens === "recent" ? 60 : 25)) keep.add(s);
  }
  const out = [...keep].sort((a, b) => b.scores.essentiel - a.scores.essentiel).map((s) => ({
    id: s.id, title: s.title, leadSource: s.leadSource, leadDomain: s.leadDomain,
    summary: s.summary, summarySource: s.summarySource, image: s.image, imageSource: s.imageSource,
    categories: s.categories, lang: s.lang, sources: s.sources, articleCount: s.articleCount,
    counts: s.counts, split: s.split, blindspot: s.blindspot, sides: s.sides, lean: s.lean,
    firstSeen: s.firstSeen, lastSeen: s.lastSeen, firstBy: s.firstBy,
    scores: Object.fromEntries(Object.entries(s.scores).map(([k, v]) => [k, round(v)])),
    articles: pickArticles(s.articles),
    world: s.sources >= 3 ? worldOf(s, monde) : null,
  }));

  // Les médias actifs de l'édition (pour « Qui n'en parle pas »).
  const activity = new Map();
  for (const a of index.articles) {
    if (!inRegion(a)) continue;
    const v = activity.get(a.domain) || { n: 0, a };
    v.n++;
    activity.set(a.domain, v);
  }
  const active = [...activity.entries()].filter(([, v]) => v.n >= 8).sort((x, y) => y[1].n - x[1].n).slice(0, 400)
    .map(([d, v]) => ({ domain: d, name: v.a.sourceName || d, n: v.n, media: mediaOut(v.a.media) }));

  // Devine le média : un réservoir de titres de médias évalués (l'app en tire 15 au hasard).
  const side = (a) => (a.media.bias < 0 ? "left" : a.media.bias > 0 ? "right" : "center");
  const pool = index.articles.filter((a) => inRegion(a) && a.media.known && a.media.bias !== null && a.title.length > 35 && hoursAgo(a.published) < 40);
  const quiz = [];
  for (const sd of ["left", "center", "right"]) {
    const used = new Set();
    for (const a of pool.filter((x) => side(x) === sd).sort(() => Math.random() - 0.5)) {
      if (used.has(a.domain) && used.size < 12) continue;
      used.add(a.domain);
      quiz.push({ ...artOut(a), side: sd, k: biasKey(a.media) });
      if (quiz.filter((q) => q.side === sd).length >= 30) break;
    }
  }

  const changes = index.articles.filter((a) => a.prevTitle && inRegion(a))
    .sort((a, b) => (b.changedAt || "").localeCompare(a.changedAt || "")).slice(0, 40).map(artOut);

  const outlets = new Set(index.articles.filter(inRegion).map((a) => a.domain)).size;
  return {
    region, countries, builtAt: new Date().toISOString(), fetchedAt: data.fetchedAt,
    totals: { stories: stories.length, outlets, blindspots: stories.filter((s) => s.scores.angles > 0).length },
    trending: data.trending, stories: out, active, quiz, changes,
  };
}
