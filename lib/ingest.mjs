// Le collecteur : lit les flux des médias, normalise les articles et les classe par rubrique.
import { FEEDS } from "./sources.mjs";
import { mediaSummary } from "./media-db.mjs";
import { decode } from "./news.mjs";
import { cached } from "./http.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const UA = "Mozilla/5.0 (compatible; PrismeNewsApp/0.1; personal project)";
const MAX_AGE_H = 48;

const strip = (html = "") => decode(decode(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const first = (xml, re) => { const m = xml.match(re); return m ? m[1] : ""; };
const tagText = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : "";
};

function imageOf(it) {
  const cands = [
    first(it, /<media:content[^>]+url="([^"]+)"[^>]*(?:medium="image"|type="image)/),
    first(it, /<media:content[^>]+(?:medium="image"|type="image[^"]*")[^>]+url="([^"]+)"/),
    first(it, /<media:thumbnail[^>]+url="([^"]+)"/),
    first(it, /<media:content[^>]+url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i),
    first(it, /<enclosure[^>]+url="([^"]+)"[^>]+type="image/),
    first(it, /<enclosure[^>]+type="image[^"]*"[^>]+url="([^"]+)"/),
    first(decode(it), /<img[^>]+src=["']([^"']+)["']/),
  ];
  const u = decode(cands.find(Boolean) || "");
  return /^https?:\/\//.test(u) ? u.replace(/^http:/, "https:") : null;
}

// Les articles renvoyés par l'API WordPress (/wp-json/wp/v2/posts).
const ENT = { rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", nbsp: " ", ndash: "–", mdash: "—", laquo: "«", raquo: "»", amp: "&", quot: '"', apos: "'" };
const wpText = (html) => strip(String(html || "").replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m));
// Dépêches nationales reprises par un média local (déjà lues ailleurs) : on les laisse de côté.
const WIRE_PATH = /\/(nouvelles-nationales|national-news|canadian-press|la-presse-canadienne|cp-|ap-news|wire)/i;
export function parseWpJson(list, domain, lang) {
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p.link && !WIRE_PATH.test(new URL(p.link).pathname)).map((p) => {
    const title = wpText(p.title?.rendered);
    const url = p.link;
    const gmt = p.date_gmt || p.date;
    const published = gmt ? new Date(/Z|[+-]\d\d:?\d\d$/.test(gmt) ? gmt : `${gmt}Z`).toISOString() : null;
    const summary = wpText(p.excerpt?.rendered).replace(/\s*(Lire la suite|Read more|\[…\]|\[\.\.\.\]).*$/i, "").slice(0, 400);
    return title && url ? { title, url, published, summary: summary || null, image: p.jetpack_featured_media_url || null, cats: [], domain, lang } : null;
  }).filter(Boolean);
}

export function parseFeed(xml, domain, lang) {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
  const now = Date.now();
  return blocks.map((it) => {
    const title = strip(tagText(it, "title"));
    let url = decode(tagText(it, "link"));
    if (!/^https?:/.test(url)) url = decode(first(it, /<link[^>]+href="([^"]+)"/) || tagText(it, "guid"));
    const when = Date.parse(tagText(it, "pubDate") || tagText(it, "dc:date") || tagText(it, "published") || tagText(it, "updated"));
    let summary = strip(tagText(it, "description") || tagText(it, "summary") || tagText(it, "content:encoded") || tagText(it, "content"));
    if (summary.toLowerCase().startsWith(title.toLowerCase())) summary = summary.slice(title.length).trim();
    if (summary.length > 320) summary = summary.slice(0, 300).replace(/\s+\S*$/, "") + "…";
    const cats = [...it.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/g)].map((m) => strip(m[1]).toLowerCase()).slice(0, 8);
    const published = Number.isFinite(when) ? new Date(Math.min(when, now)).toISOString() : null;
    return { title, url, published, summary: summary || null, image: imageOf(it), cats, domain, lang };
  }).filter((a) => a.title && /^https?:\/\//.test(a.url));
}

/* ---------- Rubriques (décidées par Prisme, d'après l'adresse, les étiquettes et les mots) ---------- */
export const CATEGORIES = ["politique", "international", "economie", "environnement", "techno", "science", "sante", "culture", "sports"];
// Adresses des rubriques, en plusieurs langues (fr, en, es, pt, it, de, nl…).
const PATH = {
  sports: /\/(sports?|esportes?|deportes?|sportivo|calcio|futbol|fussball|voetbal|hockey|soccer|football|nhl|nba|nfl|mlb|f1|formule-1|tennis|golf|canadiens|olympi\w*|cyclisme|rugby)(\/|-|$)/,
  economie: /\/(economie|economy|economia|econom[íi]a|wirtschaft|economie|business|negocios|affaires|finance|finances|finanzas|finanzen|markets?|mercados?|marches|argent|money|dinero|bourse|borsa|immobilier|emploi|consommation|entreprises?|empresas)(\/|-|$)/,
  techno: /\/(techno|technologies?|tecnologia|tecnolog[íi]a|technik|tech|numerique|digital|innovation|intelligence-artificielle|gaming|jeux-video)(\/|-|$)/,
  science: /\/(sciences?|ciencia|ciencias|ci[eê]ncia|scienza|wissenschaft|wetenschap|espace|space|astronomie)(\/|-|$)/,
  sante: /\/(sante|health|salud|sa[uú]de|salute|gesundheit|gezondheid|medecine|wellness|bien-etre|bienestar)(\/|-|$)/,
  culture: /\/(culture|cultura|kultur|cultuur|arts?|cinema|cine|film|movies|musique|music|musica|entertainment|espectaculos|entretenimento|spettacoli|spectacles|television|tele|tv|livres|books|people|celebrity|style|lifestyle|series)(\/|-|$)/,
  environnement: /\/(environnement|environment|medio-?ambiente|meio-?ambiente|ambiente|umwelt|climat|climate|clima|klima|planete|ecologie|biodiversite)(\/|-|$)/,
  politique: /\/(politique|politics|politica|pol[íi]tica|politik|politiek|elections?|elecciones|gouvernement|government|gobierno|policy|congress|parlement)(\/|-|$)/,
  international: /\/(international|internacional|internazionale|world|monde|mundo|mondo|welt|ausland|buitenland|esteri|europe|asie|asia|afrique|africa|ameriques|americas|middle-east|moyen-orient|proche-orient|ukraine|israel)(\/|-|$)/,
};
const WORDS = {
  sports: /\b(match|matchs|but|buts|joueur|joueurs|entraîneur|championnat|coupe|ligue|séries|canadiens|nhl|lnh|nba|nfl|mlb|mls|playoffs?|goal|coach|tournoi|tournament|olympi\w+|médaille|medal|quarterback|touchdown|hockey|soccer|tennis|golf|f1|grand prix)\b/i,
  economie: /\b(économie|économique|inflation|taux|banque|bourse|marchés?|emplois?|chômage|pib|tarifs?|douaniers?|entreprises?|profits?|investisse\w+|immobilier|loyers?|prix de l'essence|economy|economic|stocks?|markets?|jobs|unemployment|gdp|tariffs?|earnings|investors?|wall street|recession|fed|interest rates?)\b/i,
  techno: /\b(intelligence artificielle|ia|ai|openai|chatgpt|google|apple|microsoft|meta|tesla|nvidia|amazon|cyber\w*|logiciel|application|technolog\w+|algorithm\w*|données|data|smartphone|internet|réseaux sociaux|social media|tiktok|startup|puces?|chips?|semiconductor\w*|robot\w*|jeu vidéo|video game)\b/i,
  science: /\b(science\w*|scientifiques?|chercheurs?|researchers?|étude|study|nasa|espace|space|planète|planet|sonde|probe|astéroïde|asteroid|fossile|fossil|physique|physics|biologie|génétique|gene\w*|découverte|discovery|télescope|telescope|voyager)\b/i,
  sante: /\b(santé|health|hôpita\w+|hospital\w*|urgences?|médecins?|doctors?|patients?|cancer|virus|vaccin\w*|vaccine\w*|maladie\w*|disease\w*|épidémie|pandémie|grippe|flu|covid|médicaments?|drugs?|infirmières?|nurses?|santé mentale|mental health|chirurgie|surgery)\b/i,
  culture: /\b(film|films|cinéma|movie\w*|série|séries|series|album|chanson|song|musique|music|concert|festival|livre|book|roman|novel|acteur|actrice|actor|actress|oscar\w*|grammy|netflix|disney|spectacle|théâtre|theatre|exposition|museum|musée|artiste|artist|james bond|gta)\b/i,
  environnement: /\b(climat|climatique|climate|cop\d+|émissions|emissions|carbone|carbon|pollution|biodiversité|biodiversity|écolog\w+|environnement\w*|environment\w*|énergie renouvelable|renewable|incendies de forêt|wildfires?|sécheresse|drought|inondations?|floods?|ouragan|hurricane|el niño|fossiles?)\b/i,
  politique: /\b(gouvernement|ministre|député\w*|premier ministre|élection\w*|électoral\w*|parti|caucus|sénat|parlement|assemblée nationale|legault|carney|poilievre|plamondon|st-pierre plamondon|duhaime|macron|trump|biden|harris|congress|senate|government|minister|election\w*|parliament|republicans?|democrats?|white house|maison-blanche|vote|scrutin|campagne électorale|budget)\b/i,
  international: /\b(ukraine|russie|russia|poutine|putin|gaza|israël|israel|hamas|iran|chine|china|xi jinping|taïwan|taiwan|inde|india|syrie|syria|liban|lebanon|otan|nato|onu|united nations|union européenne|european union|bruxelles|brussels|kremlin|zelensky|netanyahu|afrique|africa|moyen-orient|middle east|corée|korea|venezuela|mexique|mexico|brésil|brazil)\b/i,
};

// Noms d'équipes (sensibles à la casse : « Canadien » l'équipe, pas « canadien » l'adjectif).
const SPORT_NAMES = /\b(Canadien|CH|Devils|Maple Leafs|Bruins|Rangers|Alouettes|Raptors|Blue Jays|Oilers|Flames|Senators|Canucks|Jets de Winnipeg|Victoire de Montréal|CF Montréal|Rocket de Laval|Remparts|Penguins|Lightning|Panthers|Golden Knights|PWHL|LPHF|LNH|NHL|NBA|NFL|MLB|MLS|Ligue 1|Premier League|Champions League|Ligue des champions|Super Bowl|Coupe Stanley|Stanley Cup|Coupe Grey|Grey Cup|Roland-Garros|Wimbledon|Tour de France)\b/;
// Contenu promotionnel ou pratique, qui n'est pas de l'actualité.
// Titres génériques sans nouvelle (balados, émissions, bulletins datés) : « Épisode du jeudi 19 novembre 2026 ».
const GENERIC = /^((l[’']|un |une |le |la )?(é|e)pisode|émission|emission|bulletin|chronique|podcast|balado|édition|edition|le fil|revue de presse|newscast|show|segment)\b[^a-z]{0,6}(du|de|of|for|:|-|–|—)?\s*((lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)?[\s\d,]*((janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)\b)?[\s\d,.]*$|^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\w+(\s+\d{4})?$|^(\d{1,2}(er)?\s+)?(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(\s+\d{4})?$/i;
// Testé aussi sans accents : certains flux écrivent « É » en deux caractères (E + accent), que l'expression ne reconnaît pas.
const isGeneric = (t) => { const x = String(t || "").trim(); return GENERIC.test(x) || GENERIC.test(x.normalize("NFD").replace(/[̀-ͯ]/g, "")); };
const NOT_NEWS = /\b(meilleures offres|vendredi fou|black friday|cyber monday|soldes|code promo|coupons?|circulaires?|horoscope|loto[- ]?qu[ée]bec|lotto max|r[ée]sultats? de loterie|deals?|best (?:deals|buys)|promo code|gift guide|guide cadeaux|wordle|mots crois[ée]s|sudoku|crossword|envolez-vous|destinations? soleil|en vol direct|forfaits? (?:voyage|vacances)|tout-inclus|concours|gagnez|contenu commandit[ée]|publireportage|en partenariat avec|sponsored|partner content|paid post|annonces class[ée]es|avis de d[ée]c[èe]s|n[ée]crologie)\b/i;

function classify(a, country) {
  const path = (() => { try { return new URL(a.url).pathname.toLowerCase(); } catch { return ""; } })();
  const out = new Set();
  for (const [c, re] of Object.entries(PATH)) if (re.test(path)) out.add(c);
  const tagText = a.cats.join(" ");
  for (const [c, re] of Object.entries(WORDS)) if (tagText && re.test(tagText)) out.add(c);
  if (SPORT_NAMES.test(a.title)) out.add("sports");
  if (!out.size || out.size === 1 && out.has("politique")) {
    // Un mot du titre compte double ; il faut au moins 2 points pour classer un article.
    const count = (re, t) => (t.match(new RegExp(re.source, "gi")) || []).length;
    const hits = Object.entries(WORDS).map(([c, re]) => [c, count(re, a.title) * 2 + count(re, a.summary || "")]).filter(([, n]) => n >= 2);
    hits.sort((x, y) => y[1] - x[1]);
    for (const [c] of hits.slice(0, 2)) out.add(c);
  }
  // Pour un média américain, Trump est de la politique intérieure, pas de l'international.
  if (country === "US" && out.has("international") && !/ukraine|russia|china|gaza|israel|iran|nato/i.test(a.title)) out.delete("international");
  return [...out];
}

async function fetchOne(url, domain, lang, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Sites WordPress dont le fil RSS est abandonné : on lit leur API (liste des derniers articles en JSON).
    if (url.includes("/wp-json/")) return parseWpJson(await res.json(), domain, lang);
    return parseFeed(await res.text(), domain, lang);
  } finally {
    clearTimeout(t);
  }
}

// Un média peut avoir plusieurs flux (rubriques) : on les lit tous et on fusionne.
// Copie publique de la liste d'articles d'un média (Google Actualités, « site:domaine »), UNIQUEMENT pour les médias
// qui ont donné leur accord à Prisme mais dont le site refuse les serveurs du robot (data/accord-medias.json).
// Seuls les articles de CE média sont gardés ; le lien mène à l'article sur son site.
const ACCORD = (() => { try { return new Set(JSON.parse(readFileSync(join(process.cwd(), "data", "accord-medias.json"), "utf8")).domains || []); } catch { return new Set(); } })();
export const mirrorUrl = (domain, lang = "fr", cc = "CA") => {
  const ed = lang === "fr" ? (cc === "FR" ? ["fr", "FR", "FR:fr"] : ["fr-CA", "CA", "CA:fr"]) : cc === "GB" ? ["en-GB", "GB", "GB:en"] : cc === "US" ? ["en-US", "US", "US:en"] : ["en-CA", "CA", "CA:en"];
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`site:${domain} when:7d`)}&hl=${ed[0]}&gl=${ed[1]}&ceid=${ed[2]}`;
};
async function fetchMirror(domain, url, lang) {
  const items = await fetchOne(url, domain, lang);
  return items
    .filter((a) => { const m = (a.raw || "").match(/<source url="([^"]+)"/); return !m || new URL(m[1]).hostname.replace(/^www\./, "").endsWith(domain.replace(/^www\./, "")); })
    .map((a) => ({ ...a, title: a.title.replace(/\s+-\s+[^-]{2,80}$/, ""), summary: null, mirror: true }));
}

async function fetchFeed(domain, [urls, lang], mirror = null) {
  const t0 = Date.now();
  const list = Array.isArray(urls) ? urls : [urls];
  const res = await Promise.allSettled(list.map((u) => fetchOne(u, domain, lang)));
  const items = res.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const failed = res.find((r) => r.status === "rejected");
  if (!items.length && failed) {
    const e = failed.reason;
    const error = e?.name === "AbortError" ? "délai dépassé" : String(e?.message || e);
    // Média qui refuse le robot (403) : on lit la copie publique de sa liste d'articles.
    if (mirror && /403|401/.test(error)) {
      try { const m = await fetchMirror(domain, mirror, lang); if (m.length) return { domain, ok: true, items: m, ms: Date.now() - t0, via: "copie" }; } catch { /* rien de plus à faire */ }
    }
    return { domain, ok: false, items: [], error, ms: Date.now() - t0 };
  }
  return { domain, ok: true, items, ms: Date.now() - t0 };
}

/* ---------- Titres modifiés : Prisme se souvient du premier titre vu pour chaque article ---------- */
const TITLES_FILE = process.env.NETLIFY ? "/tmp/prisme-titles.json" : join(process.cwd(), ".data", "titles.json");
let titles = null;
function loadTitles() {
  if (titles) return titles;
  try { titles = new Map(Object.entries(JSON.parse(readFileSync(TITLES_FILE, "utf8")))); } catch { titles = new Map(); }
  return titles;
}
function saveTitles() {
  const cutoff = Date.now() - 5 * 864e5;
  for (const [u, v] of titles) if (v.seen < cutoff) titles.delete(u);
  try { mkdirSync(dirname(TITLES_FILE), { recursive: true }); writeFileSync(TITLES_FILE, JSON.stringify(Object.fromEntries(titles))); } catch { /* stockage indisponible : on garde en mémoire */ }
}
function trackTitle(a) {
  const map = loadTitles();
  const key = a.url.split("?")[0];
  const prev = map.get(key);
  const now = Date.now();
  if (!prev) { map.set(key, { t: a.title, first: a.title, seen: now }); return a; }
  if (prev.t !== a.title) {
    prev.history = [...(prev.history || []), { t: prev.t, until: now }].slice(-5);
    prev.t = a.title;
    prev.changedAt = now;
  }
  prev.seen = now;
  if (prev.first !== a.title) return { ...a, prevTitle: prev.first, changedAt: new Date(prev.changedAt || now).toISOString() };
  return a;
}

// Communiqués de presse (fils Business Wire, GlobeNewswire, Newsfile, CNW…) republiés tels quels par des dizaines de sites :
// ce ne sont pas des nouvelles, et ils gonflaient artificiellement le nombre de médias d'une « histoire ».
const PRESS_PATH = /\/(press-releases?|communiques?(-de-presse)?|newsfile|business-?wire|globe-?newswire|pr-?newswire|accesswire|cision|newswire-ca|news-releases?)\//i;
const isPress = (url) => { try { return PRESS_PATH.test(new URL(url).pathname); } catch { return false; } };
// La langue déclarée d'un flux est parfois fausse : un titre clairement dans l'autre langue la corrige.
const FR_W = new Set("le la les des du de et à au aux un une pour dans sur est qui que avec en ses son sa leur pas plus selon après contre être été ont sont".split(" "));
const EN_W = new Set("the of and to in for with is as at by from its new after over this that are be has have will says said into amid".split(" "));
function langFix(title, declared) {
  if (declared !== "fr" && declared !== "en") return declared;
  const words = title.toLowerCase().split(/[^\p{L}']+/u);
  let fr = 0, en = 0;
  for (const w of words) { if (FR_W.has(w) || /^(l|d|qu|j|n|s|c)'/.test(w)) fr++; if (EN_W.has(w)) en++; }
  if (/[éèêàçùâîôû]/i.test(title)) fr++;
  if (declared === "fr" && fr === 0 && (en >= 2 || (en === 1 && words.filter(Boolean).length >= 4))) return "en";
  if (declared === "en" && fr >= 2 && en === 0) return "fr";
  return declared;
}

// Transforme des flux lus en articles propres (dédoublonnés, classés, titres suivis).
function normalize(results, mediaFor) {
  const cutoff = Date.now() - MAX_AGE_H * 36e5;
  const seen = new Set();
  const articles = [];
  const sources = {};
  const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  for (const r of results) {
    const media = mediaFor(r);
    let kept = 0;
    for (const a of r.items) {
      if (a.published && Date.parse(a.published) < cutoff) continue;
      if (NOT_NEWS.test(a.title) || isGeneric(a.title) || isPress(a.url)) continue;
      // Aussi sur le titre nettoyé : « Épisode du jeudi 19 novembre 2026 | QUB » devient générique sans le nom du média.
      if (isGeneric(cleanTitle(a.title, media.name || r.domain, r.domain))) continue;
      const key = a.url.split("?")[0];
      // Même propriétaire, même titre (ex. Journal de Montréal et Journal de Québec) : une seule voix.
      const synd = `${media.owner || r.domain}|${norm(a.title)}`;
      if (seen.has(key) || seen.has(synd)) continue;
      seen.add(key);
      seen.add(synd);
      articles.push(trackTitle({ ...a, title: cleanTitle(a.title, media.name || r.domain, r.domain), lang: langFix(a.title, a.lang || r.lang || null), sourceName: media.name || r.domain, media, categories: classify(a, media.country) }));
      kept++;
    }
    sources[r.domain] = { ok: r.ok, count: kept, error: r.error || null, ms: r.ms, auto: !!r.meta };
  }
  saveTitles();
  return { fetchedAt: new Date().toISOString(), articles, sources };
}

// Beaucoup de médias collent leur nom à la fin de chaque titre (« Titre | L'Écho de Laval ») : on le retire.
const foldT = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function cleanTitle(title, name, domain) {
  const m = title.match(/^(.{12,}?)\s+[|–—-]\s+([^|–—]{2,90})$/);
  if (!m) return title;
  const tail = foldT(m[2]);
  const site = foldT(`${name} ${domain.split(".")[0]}`);
  const words = tail.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const isSite = /actualites|evenements|emplois|petites annonces|nouvelles|news/.test(tail) || words.some((w) => site.includes(w)) || site.includes(tail.replace(/[^a-z0-9]/g, ""));
  return isSite ? m[1].trim() : title;
}

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); }));
}

// 1) Les médias de base (orientation et propriétaire connus) : lus d'un coup, en quelques secondes.
// Les fils régionaux des grands réseaux (CBC, Global, CityNews…), trouvés par tools/discover-local.mjs.
function feedsWithRegional() {
  let extra = {};
  try { extra = JSON.parse(readFileSync(join(process.cwd(), "data", "feeds-regional.json"), "utf8")); } catch { /* aucun */ }
  return Object.entries(FEEDS).map(([d, [urls, lang]]) => {
    const more = extra[d] || [];
    return [d, [more.length ? [...new Set([...(Array.isArray(urls) ? urls : [urls]), ...more])] : urls, lang]];
  });
}
async function ingestCurated() {
  const results = await Promise.all(feedsWithRegional().map(([d, f]) => fetchFeed(d, f)));
  return normalize(results, (r) => mediaSummary(r.domain));
}

// 2) Les médias découverts partout dans le monde (data/sources-auto.json, créé par tools/discover-sources.mjs) :
//    des milliers de flux, lus par lots en arrière-plan, sans jamais faire attendre l'app.
const AUTO_FILE = join(process.cwd(), "data", "sources-auto.json");
// Les médias locaux et régionaux (data/sources-local.json, créé par tools/discover-local.mjs) s'ajoutent aux découverts.
const LOCAL_FILE = join(process.cwd(), "data", "sources-local.json");
function autoSources() {
  const read = (f) => { try { return JSON.parse(readFileSync(f, "utf8")).sources || {}; } catch { return {}; } };
  const s = { ...read(AUTO_FILE), ...read(join(process.cwd(), "data", "sources-mediacloud.json")), ...read(LOCAL_FILE) };
  const turn = Math.floor(Date.now() / (30 * 60e3)) % 3;
  const slot = (d) => { let h = 0; for (const c of d) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 3; };
  return Object.entries(s).filter(([d, x]) => !FEEDS[d] && (!x.rotate || slot(d) === turn));
}
const auto = { articles: [], sources: {}, fetchedAt: null, running: null, total: 0 };
export function refreshAuto() {
  if (auto.running) return auto.running;
  auto.running = (async () => {
    const list = autoSources();
    auto.total = list.length;
    if (!list.length) return;
    const results = [];
    await pool(list, 64, async ([d, s]) => { const r = await fetchFeed(d, [s.feed, s.lang], ACCORD.has(d) ? mirrorUrl(d, s.lang, s.cc) : null); results.push({ ...r, meta: s, lang: s.lang }); });
    // Deuxième chance pour les médias trop lents au premier essai (serveurs surchargés à l'heure pile).
    const slow = results.filter((r) => !r.ok && /délai/.test(r.error || ""));
    if (slow.length) {
      const again = [];
      await pool(slow, 32, async (r) => { const s = r.meta; const x = await fetchFeed(r.domain, [s.feed, s.lang], ACCORD.has(r.domain) ? mirrorUrl(r.domain, s.lang, s.cc) : null); if (x.ok) again.push({ ...x, meta: s, lang: s.lang }); });
      for (const x of again) { const k = results.findIndex((r) => r.domain === x.domain); if (k >= 0) results[k] = x; }
    }
    const out = normalize(results, (r) => {
      const m = mediaSummary(r.domain);
      // Un média découvert qui figure déjà dans la base garde son orientation ; sinon : « non évalué ».
      return m.known ? m : { known: false, name: r.meta.name, country: r.meta.cc, region: r.meta.region || null };
    });
    Object.assign(auto, out);
  })().catch(() => {}).finally(() => { auto.running = null; });
  return auto.running;
}

// L'index : les médias de base (10 minutes en mémoire) + les médias découverts (rafraîchis toutes les 15 minutes).
export async function getIndex() {
  const cur = await cached("index", 10 * 60e3, ingestCurated);
  if (!auto.fetchedAt || Date.now() - Date.parse(auto.fetchedAt) > 15 * 60e3) refreshAuto();
  if (!auto.articles.length) return cur;
  // Une seule version fusionnée en mémoire à la fois (l'ancienne est libérée dès qu'une nouvelle est prête).
  const key = `${cur.fetchedAt}|${auto.fetchedAt}`;
  if (merged.key !== key) {
    const urls = new Set(cur.articles.map((a) => a.url));
    merged.key = key;
    merged.value = { fetchedAt: cur.fetchedAt > auto.fetchedAt ? cur.fetchedAt : auto.fetchedAt, articles: [...cur.articles, ...auto.articles.filter((a) => !urls.has(a.url))], sources: { ...auto.sources, ...cur.sources } };
  }
  return merged.value;
}
const merged = { key: null, value: null };
export const autoStatus = () => ({ total: auto.total, loaded: Object.keys(auto.sources).length, articles: auto.articles.length, fetchedAt: auto.fetchedAt, running: !!auto.running });
