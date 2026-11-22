import { LANG, LOCALE, setLang, startTranslation, tr } from "./i18n.js";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- Constantes ---------- */
const REGIONS = [["qc", "Québec"], ["ca", "Canada"], ["us", "États-Unis"], ["fr", "France"], ["uk", "Royaume-Uni"], ["europe", "Europe"], ["latam", "Amérique latine"], ["afrique", "Afrique"], ["moyenorient", "Moyen-Orient"], ["asie", "Asie"], ["oceanie", "Océanie"], ["monde", "Monde entier"]];
const CATS = [["une", "À la une"], ["politique", "Politique"], ["international", "International"], ["economie", "Économie"], ["environnement", "Environnement"], ["techno", "Techno"], ["science", "Science"], ["sante", "Santé"], ["culture", "Culture"], ["sports", "Sports"]];
const CAT_LABEL = Object.fromEntries(CATS);
const CAT_EMOJI = { une: "📰", politique: "⚖️", international: "🌍", economie: "💰", environnement: "🌱", techno: "💻", science: "🔬", sante: "🩺", culture: "🎭", sports: "🏒" };
const LENSES = {
  essentiel: { label: "L'essentiel", desc: "Les histoires couvertes par le plus de médias, avec un bonus quand la gauche, le centre et la droite en parlent tous. Les plus récentes passent devant." },
  angles: { label: "Angles morts", desc: "Des histoires qu'un côté du spectre couvre beaucoup et que l'autre ignore presque." },
  gauche: { label: "Bulle de gauche", sw: "var(--b-l2)", desc: "Ce que les médias de gauche couvrent le plus en ce moment, et que la droite couvre peu ou pas." },
  droite: { label: "Bulle de droite", sw: "var(--b-r2)", desc: "Ce que les médias de droite couvrent le plus en ce moment, et que la gauche couvre peu ou pas." },
  horsradar: { label: "Hors radar", desc: "Des histoires couvertes par un ou deux médias seulement : enquêtes, sujets locaux, médias indépendants." },
  recent: { label: "En continu", desc: "Tout ce que Prisme lit, du plus récent au plus ancien, sans aucun tri." },
  pourtoi: { label: "Pour toi", desc: "Les histoires qui touchent tes sujets, tes médias suivis, tes rubriques préférées et ta ville. Rien ne quitte ton appareil." },
  local: { label: "Ma ville", qc: true, desc: "Les histoires qui parlent de ta ville ou de ta région, ou qui viennent de ses médias." },
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

const memStore = new Map(); // ce que le téléphone a refusé d'enregistrer (stockage plein ou bloqué) : gardé pour la visite
const store = {
  get(k, d) {
    if (memStore.has(k)) return memStore.get(k);
    try { return localStorage.getItem("prisme." + k) ?? d; } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem("prisme." + k, v); memStore.delete(k); }
    catch {
      memStore.set(k, String(v));
      if (!store.warned) { store.warned = true; setTimeout(() => { try { toast("Le stockage de ton téléphone est plein ou bloqué : tes choix seront gardés seulement pour cette visite."); } catch { /* pas encore prêt */ } }, 1500); }
    }
  },
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
// Le logo d'un média : servi par Prisme lui-même (le robot les télécharge), sinon sa lettre sur une couleur à lui.
let LOGOS = null;
const letterHue = (d) => { let h = 0; for (const c of String(d)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const favicon = (domain, name) => {
  const L = esc(String(name || domain || "?").replace(/^(l['’]|le |la |les |the )/i, "")[0]?.toUpperCase() || "?");
  const d = String(domain || "").toLowerCase().replace(/^www\./, "");
  return d && LOGOS?.has(d)
    ? `<img class="fav" src="${DATA_BASE}logos/${encodeURIComponent(d)}.png" alt="" loading="lazy" data-letter="${L}" data-hue="${letterHue(d)}">`
    : `<span class="fav-fallback" style="--fh:${letterHue(d || L)}">${L}</span>`;
};
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
    if (img.dataset.hue) span.style.setProperty("--fh", img.dataset.hue);
    img.replaceWith(span);
  } else if (img.classList.contains("glow")) {
    img.remove();
  } else if (img.closest(".big-media")) {
    // Grande carte sans photo valide : on la remplace par une carte normale.
    const card = img.closest(".story.big"), s = card && state.stories.get(cardId(card));
    if (s) { s.image = null; card.outerHTML = storyRow(s); } else img.remove();
  } else if (img.closest(".c2-img, .hero-media, .mini-img")) {
    // Photo cassée : la carte garde sa place, avec la couleur de sa rubrique et le logo du média.
    img.closest(".c2-img, .hero-media, .mini-img").classList.add("ph");
    img.remove();
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
  updateBadge();
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
  try { reads.add(JSON.parse(a.dataset.read)); a.classList.add("is-read"); later.remove(`a:${JSON.parse(a.dataset.read).u}`); } catch { /* lien sans données */ }
};
document.addEventListener("click", noteRead);
document.addEventListener("auxclick", noteRead);

/* ---------- Favoris, médias suivis, partage (tout reste sur cet appareil) ---------- */
const listStore = (name, max) => ({
  list() { try { return JSON.parse(store.get(name, "[]")); } catch { return []; } },
  save(l) { store.set(name, JSON.stringify(l.slice(0, max))); },
});
// Un favori : { k (clé), type "s" (histoire) ou "a" (article), t, u, id, r, d, n, src, img, at }
const favs = Object.assign(listStore("favs", 500), {
  has(k) { return this.list().some((x) => x.k === k); },
  toggle(item) {
    const l = this.list();
    const on = !l.some((x) => x.k === item.k);
    this.save(on ? [{ ...item, at: Date.now() }, ...l] : l.filter((x) => x.k !== item.k));
    return on;
  },
  remove(k) { this.save(this.list().filter((x) => x.k !== k)); },
});
// Médias suivis : { d, n, at }
const follows = Object.assign(listStore("follows", 100), {
  has(d) { return this.list().some((x) => x.d === d); },
  toggle(d, n) { const l = this.list(); const on = !l.some((x) => x.d === d); this.save(on ? [{ d, n, at: Date.now() }, ...l] : l.filter((x) => x.d !== d)); return on; },
});

const ICO = {
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};
const ico = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;
const storyFav = (s) => ({ k: `s:${s.id}`, type: "s", id: s.id, r: state.region, t: s.title, src: s.sources, img: s.image || null, d: s.articles?.[0]?.domain, n: s.articles?.[0]?.sourceName });
const artFav = (a) => ({ k: `a:${a.url}`, type: "a", u: a.url, t: a.title, d: a.domain, n: a.sourceName, img: a.image || null, lang: a.lang || null, p: a.published || null });
const absUrl = (rel) => new URL(rel, location.href).href;
// Bouton étoile (favori) et bouton partager ; « label » ajoute le texte à côté de l'icône.
function favBtn(item, label = false) {
  const on = favs.has(item.k);
  return `<button class="act${label ? " act-l" : ""}" type="button" data-fav="${esc(JSON.stringify(item))}" data-fav-key="${esc(item.k)}" aria-pressed="${on}" title="${on ? "Retirer des favoris" : "Enregistrer dans mes favoris"}">${ico("star")}${label ? `<span>${on ? "Enregistré" : "Enregistrer"}</span>` : ""}</button>`;
}
function shareBtn(data, label = false) {
  return `<button class="act${label ? " act-l" : ""}" type="button" data-share="${esc(JSON.stringify(data))}" title="Partager">${ico("share")}${label ? "<span>Partager</span>" : ""}</button>`;
}
const storyShare = (s) => ({ title: s.title, text: `${s.title} — ${plural(s.sources, "média")} en parlent, de la gauche à la droite, sur Prisme`, url: absUrl(`h/${encodeURIComponent(s.id)}.html`) });
const artShare = (a) => ({ title: a.title, text: `${a.title} (${a.sourceName})`, url: a.url });

let toastTimer = null;
function toast(msg) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.remove("has-undo");
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 2400);
}
async function shareIt(d) {
  if (navigator.share) { try { await navigator.share(d); return; } catch (e) { if (e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(d.url); toast("Lien copié : tu peux le coller où tu veux."); }
  catch { prompt("Copie ce lien :", d.url); }
}
document.addEventListener("click", (e) => {
  const f = e.target.closest("[data-fav]");
  if (f) {
    e.preventDefault(); e.stopPropagation();
    const item = JSON.parse(f.dataset.fav);
    const on = favs.toggle(item);
    if (item.type === "s") { const st = state.stories.get(item.id); if (on && st) saveFavStory(st); }
    for (const b of $$(`[data-fav-key="${CSS.escape(item.k)}"]`)) {
      b.setAttribute("aria-pressed", on);
      b.title = on ? "Retirer des favoris" : "Enregistrer dans mes favoris";
      const sp = $("span", b); if (sp) sp.textContent = on ? "Enregistré" : "Enregistrer";
    }
    if (on && item.type === "s") followN.set(item.id, item.src || 0);
    toast(on ? (item.type === "s" ? "Histoire suivie ★ : tu verras ici quand de nouveaux médias en parlent." : "Enregistré dans tes favoris ★") : "Retiré de tes favoris");
    buzz();
    return;
  }
  const s = e.target.closest("[data-share]");
  if (s) { e.preventDefault(); e.stopPropagation(); shareIt(JSON.parse(s.dataset.share)); }
}, true);

/* ---------- Recherche avancée : « phrase exacte », -exclure, synonymes et traductions ---------- */
const SYN = [
  ["ovni", "ovnis", "ufo", "ufos", "uap", "pan", "phenomene aerien non identifie", "phenomenes aeriens non identifies", "soucoupe volante", "extraterrestre"],
  ["ia", "ai", "intelligence artificielle", "artificial intelligence", "chatgpt", "openai"],
  ["climat", "climate", "climatique", "rechauffement", "global warming", "ges"],
  ["russie", "russia", "russe", "russian", "kremlin", "poutine", "putin"],
  ["chine", "china", "chinois", "chinese", "pekin", "beijing"],
  ["etats-unis", "united states", "americain", "american", "usa", "washington"],
  ["ukraine", "ukrainien", "ukrainian", "kyiv", "kiev"],
  ["israel", "israelien", "israeli", "gaza", "hamas"],
  ["immigration", "immigrant", "immigrants", "migrant", "migrants", "demandeurs d'asile", "asylum"],
  ["logement", "housing", "loyer", "loyers", "rent", "locataires"],
  ["election", "elections", "electoral", "scrutin", "vote", "sondage", "poll"],
  ["economie", "economy", "economique", "economic", "recession"],
  ["sante", "health", "hopital", "hopitaux", "hospital"],
  ["guerre", "war", "conflit", "conflict"],
  ["tarifs", "tariffs", "tariff", "droits de douane", "douanes"],
  ["petrole", "oil", "pipeline", "oleoduc"],
  ["incendie", "incendies", "feux de foret", "wildfire", "wildfires"],
  ["vaccin", "vaccins", "vaccine", "vaccines", "vaccination"],
  ["tremblement de terre", "seisme", "earthquake"],
  ["ouragan", "hurricane", "tempete", "storm"],
  ["inondation", "inondations", "flood", "floods"],
  ["hockey", "lnh", "nhl", "canadiens", "habs"],
  ["greve", "greves", "strike", "syndicat", "union"],
  ["trump", "maga"],
  ["carney", "premier ministre du canada"],
  ["legault", "caq"],
];
const SYN_BY = new Map();
for (const g of SYN) for (const w of g) SYN_BY.set(w, g);
const WORD_RE = /[^\p{L}\p{N}'’-]+/u;

function parseQuery(q) {
  let rest = foldText(q || "");
  const phrases = [], not = [];
  rest = rest.replace(/"([^"]+)"|«\s*([^»]+?)\s*»/g, (m, a, b) => { phrases.push((a || b).trim()); return " "; });
  rest = rest.replace(/(^|\s)-([\p{L}\p{N}][\p{L}\p{N}'’-]*)/gu, (m, s, w) => { not.push(w); return " "; });
  rest = rest.replace(/\s+/g, " ").trim();
  const terms = [], synUsed = [];
  if (rest && SYN_BY.has(rest)) { terms.push(SYN_BY.get(rest)); synUsed.push(rest); }
  else {
    for (const w of rest.split(WORD_RE).filter((x) => x.length >= 2)) {
      const g = SYN_BY.get(w);
      terms.push(g || [w]);
      if (g) synUsed.push(w);
    }
  }
  const empty = !terms.length && !phrases.length;
  // Les mots à surligner dans les résultats.
  const marks = [...new Set([...terms.flat(), ...phrases])].filter((w) => w.length >= 2);
  const also = synUsed.length ? [...new Set(terms.filter((g) => g.length > 1).flat())].filter((w) => !synUsed.includes(w)).slice(0, 8) : [];
  return { terms, phrases, not, empty, marks, also };
}
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const shortRe = new Map();
// Les mots courts (« ia », « us », « pan ») doivent être des mots entiers, pas un morceau d'un autre mot.
const hasWord = (text, w) => {
  if (w.length > 3) return text.includes(w);
  if (!shortRe.has(w)) shortRe.set(w, new RegExp("(^|[^\\p{L}\\p{N}])" + reEsc(w) + "([^\\p{L}\\p{N}]|$)", "u"));
  return shortRe.get(w).test(text);
};
// Le texte (déjà sans accents) correspond-il à la recherche ?
function matchQuery(text, pq) {
  if (pq.empty) return false;
  return pq.terms.every((g) => g.some((w) => hasWord(text, w)))
    && pq.phrases.every((p) => text.includes(p))
    && !pq.not.some((w) => hasWord(text, w));
}

/* ---------- Données ----------
   Prisme n'a pas de serveur : un robot (GitHub) prépare toutes les 30 minutes des fichiers d'édition dans data/.
   La fonction api() répond aux mêmes questions qu'avant (/api/feed, /api/videos…) à partir de ces fichiers. */
const DATA_BASE = new URL("data/", document.baseURI).href;
const dataCache = new Map();
// Démarrage rapide, en deux temps :
// 1. la page (index.html) lance le téléchargement des nouvelles dès sa première ligne, pendant que le code se charge :
//    on reprend ici ces téléchargements déjà en route (window.__pre) ;
// 2. aux visites suivantes, la copie de l'édition gardée sur l'appareil s'affiche tout de suite, et les nouvelles
//    fraîches la remplacent dès qu'elles arrivent (freshArrived).
const netJson = (name) => {
  const pre = window.__pre?.[name];
  if (pre) delete window.__pre[name];
  return (pre || fetch(DATA_BASE + name, { cache: "no-cache" })).then((r) => {
    if (!r.ok) throw new Error(r.status === 404 ? "Cette édition n'est pas encore prête. Réessaie dans quelques minutes." : `Erreur ${r.status}`);
    return r.json();
  });
};
const staleDone = new Set(); // une seule fois par visite et par édition
const stamp = (ed) => ed?.fetchedAt || ed?.builtAt || "";
function dataJson(name, maxAgeMs = 10 * 60e3) {
  const hit = dataCache.get(name);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.promise;
  let promise;
  if (/^edition-/.test(name) && !staleDone.has(name) && "caches" in window) {
    staleDone.add(name);
    const net = netJson(name);
    net.catch(() => {});
    promise = caches.match(DATA_BASE + name).then((c) => (c ? c.json() : null)).catch(() => null).then((stale) => {
      // Rien de gardé, ou une copie de plus de 3 heures : on attend le réseau, comme avant.
      if (!stale || !(Date.now() - Date.parse(stamp(stale) || 0) < 3 * 36e5)) return net;
      // (Repère de diagnostic : quelle copie a servi au démarrage, et quand les nouvelles fraîches l'ont remplacée.)
      window.__prismeDemarrage = { copie: stamp(stale), copieA: Math.round(performance.now()) };
      net.then((fresh) => {
        dataCache.set(name, { at: Date.now(), promise: Promise.resolve(fresh) });
        Object.assign(window.__prismeDemarrage, { frais: stamp(fresh), fraisA: Math.round(performance.now()) });
        if (stamp(fresh) !== stamp(stale)) freshArrived();
      }).catch(() => {});
      return stale;
    });
  } else promise = netJson(name);
  dataCache.set(name, { at: Date.now(), promise });
  promise.catch(() => dataCache.delete(name));
  return promise;
}
// Les nouvelles fraîches viennent d'arriver par-dessus la copie gardée : on met le fil à jour sans déranger.
function freshArrived() {
  const r = state.route;
  if (!r) return;
  const busy = state.panel || $("#modal.open") || $("#shorts") || $(".coach") || $("#smenu") || state.sel;
  if (r.view === "feed" && scrollY < 300 && !busy) { state.feeds.clear(); render({ scroll: scrollY }); }
  else if (r.view === "story" && !state.panel && $("#view .empty")) render(); // un lien vers une histoire trop récente pour la copie
  else state.refreshFeeds = true; // au prochain retour sur un fil
}
// La liste des logos publiés par le robot (une fois par jour suffit).
const logosReady = dataJson("logos.json", 864e5).then((l) => { LOGOS = new Set(Array.isArray(l) ? l : []); }).catch(() => { LOGOS = new Set(); });
// « L'Écho de la Rive-Nord | Actualités, événements, emplois… » → « L'Écho de la Rive-Nord ».
const cleanName = (n) => { const t = String(n || "").split(/\s+[|–—·:]\s+|\s+-\s+/)[0].trim(); return t.length >= 2 ? t : String(n || ""); };
const edition = (region) => Promise.all([dataJson(`edition-${region}.json`), logosReady]).then(([ed]) => {
  if (!ed._clean) { ed._clean = 1; for (const s of ed.stories || []) for (const a of s.articles || []) a.sourceName = cleanName(a.sourceName); }
  return ed;
});
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
    default: throw new Error("Demande inconnue.");
  }
}

async function findStory(id, region) {
  for (const r of [region, "monde", "qc", "ca"]) {
    const ed = await edition(r).catch(() => null);
    const s = ed?.stories.find((x) => x.id === id);
    if (s) return { s, ed };
  }
  // Une histoire enregistrée dans les favoris reste lisible, même hors ligne ou sortie de l'édition.
  const saved = savedStory(id);
  return saved ? { s: saved, ed: { active: [], stories: [] } } : {};
}

async function feedLocal(p) {
  const region = p.get("region") || state.region;
  const ed = await edition(region);
  const storyId = p.get("story");
  if (storyId) {
    const { s } = await findStory(storyId, region);
    if (!s) throw new Error("Cette histoire n'est plus dans le fil (les fils couvrent les dernières 48 heures).");
    await withTitlesFr([s]);
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
    const pq = parseQuery(q);
    const all = list;
    list = all.filter((s) => matchQuery(storyFold(s), pq));
    // Aucune histoire avec tous les mots : celles qui en ont le plus.
    if (!list.length && pq.terms.length > 1) {
      const n = (s) => pq.terms.filter((g) => g.some((w) => hasWord(storyFold(s), w))).length;
      list = all.filter((s) => n(s) > 0).sort((a, b) => n(b) - n(a)).slice(0, 30);
    }
  } else if (cat !== "une") list = list.filter((s) => s.categories.includes(cat));
  // Rien trouvé : une faute de frappe ? (« victoriavile » → « victoriaville »). On corrige une fois et on le dit.
  let corrected = null;
  if (q && !list.length && page === 0 && !p.get("nofix")) {
    const fix = await fixQuery(q, ed);
    if (fix) corrected = fix;
  }
  if (q) {
    // Une recherche qui nomme un média trouve aussi les histoires où ce média apparaît.
    const fq = foldText(q).trim();
    const byOutlet = ed.stories.filter((s) => !list.includes(s) && s.articles.some((a) => { const n = foldText(a.sourceName); return n.includes(fq) || (n.length >= 3 && fq.includes(n)); }));
    list = [...list, ...byOutlet];
  }
  const key = q ? "essentiel" : lens;
  // « Ma ville » : le nom de la municipalité, ou les médias locaux de sa région.
  let villeCtx = null;
  if (key === "local" || key === "pourtoi") {
    const mv = await myVille();
    if (mv) { const loc = await localMedia(); villeCtx = { words: villeWords(mv), domains: Object.entries(loc).filter(([, [, reg]]) => reg === mv.r).map(([d]) => d) }; }
  }
  if (key === "pourtoi") { const sc = forYouScorer(villeCtx); for (const s of list) s.scores.pourtoi = sc(s); }
  if (key === "local") for (const s of list) s.scores.local = localScore(s, villeCtx) * (s.scores.essentiel + 0.2);
  if (key !== "recent") list = list.filter((s) => s.scores[key] > 0);
  const lf = !q && key !== "recent" ? lessScorer(cat) : null;
  list = lf ? [...list].sort((a, b) => b.scores[key] * lf(b) - a.scores[key] * lf(a)) : [...list].sort((a, b) => b.scores[key] - a.scores[key]);
  // La une : jamais au hasard. C'est l'histoire couverte par le plus de médias depuis 12 heures
  // (parmi les 25 premières), avec une photo si une autre presque aussi couverte en a une.
  let hero = null;
  if (!q && cat === "une" && key === "essentiel" && list.length > 3) {
    const now = Date.now();
    const ok = (s) => !lf || lf(s) >= 0.99;
    let pool = list.slice(0, 25).filter((s) => ok(s) && now - Date.parse(s.lastSeen || s.firstSeen || 0) < 12 * 36e5);
    if (!pool.length) pool = list.slice(0, 10).filter(ok);
    if (pool.length) {
      const top = Math.max(...pool.map((s) => s.sources || 0));
      const byCov = [...pool].sort((a, b) => (b.sources || 0) - (a.sources || 0));
      hero = byCov.find((s) => s.image && (s.sources || 0) >= top * 0.8) || byCov[0];
      list = [hero, ...list.filter((s) => s !== hero)];
    }
  }

  const out = { region, page, fetchedAt: ed.fetchedAt, total: list.length, hasMore: (page + 1) * PAGE < list.length, stories: await withTitlesFr(list.slice(page * PAGE, (page + 1) * PAGE)) };
  if (corrected && !list.length) out.corrected = corrected;
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
    out.hero = !!hero;
    // Une carte « Angle mort » dans le fil de la une : une histoire qu'un côté ignore, plus bas que la première page.
    if (hero) {
      const b = list.slice(PAGE, 120).find((x) => x.blindspot && x.sources >= 4);
      if (b) out.blind = (await withTitlesFr([b]))[0];
    }
    out.fresh = !q && visit.prev ? list.slice(0, 45).filter(isNew).length : 0; // parmi les 3 premières pages : ce qu'on voit vraiment
  }
  return out;
}

// Corriger une faute de frappe : chaque mot inconnu est remplacé par le mot connu le plus proche
// (titres de l'édition, noms de villes et de médias), à une lettre près (deux pour les mots longs).
function editDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
async function fixQuery(q, ed) {
  if (!ed._vocab) {
    const freq = new Map();
    const add = (t, w = 1) => { for (const x of foldText(t).split(/[^\p{L}\p{N}-]+/u)) if (x.length >= 4) freq.set(x, (freq.get(x) || 0) + w); };
    for (const s of ed.stories) { add(s.title); for (const a of s.articles || []) add(a.sourceName, 2); }
    const V = await villesData().catch(() => null);
    for (const v of V?.list || []) add(v.n, 3);
    ed._vocab = freq;
  }
  const vocab = ed._vocab;
  let changed = false;
  const words = foldText(q).trim().split(/\s+/).map((w) => {
    if (w.length < 4 || vocab.has(w) || /^["-]/.test(w)) return w;
    const max = w.length >= 8 ? 2 : 1;
    let best = null, bd = max + 1, bf = 0;
    for (const [k, f] of vocab) {
      if (Math.abs(k.length - w.length) > max || k[0] !== w[0] && k[1] !== w[1]) continue;
      const d = editDist(w, k, max);
      if (d < bd || (d === bd && f > bf)) { best = k; bd = d; bf = f; }
    }
    if (best && bd <= max) { changed = true; return best; }
    return w;
  });
  return changed ? words.join(" ") : null;
}

// Vidéos des chaînes de médias, filtrées par édition ou par sujet (au moins 2 mots en commun).
const VSTOP = new Set("avec pour dans plus sont cette leur après avant selon comme mais tout tous fait contre entre sans sous their with from this that have will been were what when about after over into says said more than they them also just".split(" "));
const vwords = (t) => new Set(foldText(t).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !VSTOP.has(w)));
async function videosLocal(p) {
  const all = (await dataJson("videos.json", 30 * 60e3)).videos;
  const region = p.get("region") || "monde";
  const countries = region === "monde" ? null : (await edition(region)).countries;
  // Les capsules commerciales (idées cadeaux, commandité…) ne sont pas des nouvelles (même règle que le robot).
  const PROMO = /(gift ideas?|gifts? (guide|under \$?\d)|must[- ]have gifts|holiday gifts|stocking stuffers|everyday finds|id[ée]es?[- ](de )?cadeaux|guide (des |de )?cadeaux|deals? (of|du) (the )?(day|jour|week|semaine)|sponsored (by|content|post|video)|contenu (commandit|sponsoris)|(commandit|sponsoris)[ée]e?s? par|brought to you by|paid partnership|partenariat (pay|r[ée]mun)|#ad\b|#sponsored|unboxing|product picks|shopping (picks|guide|list))/i;
  let list = all.filter((v) => (!countries || countries.includes(v.media.country)) && !PROMO.test(v.title || ""));
  const q = p.get("q");
  if (q) {
    const qw = vwords(q);
    const need = Math.min(2, qw.size);
    list = list.filter((v) => { let n = 0; for (const w of vwords(v.title)) if (qw.has(w)) n++; return n >= need; });
  }
  return { configured: true, videos: q ? list.slice(0, 24) : list };
}

async function summaryLocal(id) {
  const sums = await dataJson("summaries.json").catch(() => ({}));
  state.summaries = sums;
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
const mediaFromKey = (name, k, owner, country, bias, st) => (k === "unk" ? { known: false, name, country } : { known: true, name, owner, country, bias: k === "state" ? null : bias, state: st });
const catsOf = (mask) => CATS.slice(1).filter((c, i) => mask & (1 << i)).map(([c]) => c);
function decodeArticles(raw) {
  if (raw._decoded) return raw._decoded;
  const counts = new Map();
  for (const it of raw.items) counts.set(it[2], (counts.get(it[2]) || 0) + 1);
  const domains = raw.domains.map(([domain, name, k, owner, country, bias, st], i) => ({
    domain, name, count: counts.get(i) || 0, fold: foldText(name), media: mediaFromKey(name, k, owner, country, bias, st),
  }));
  const items = raw.items.map(([title, url, di, min, lang, cats]) => ({
    title, url, domain: domains[di].domain, sourceName: domains[di].name, media: domains[di].media,
    published: min ? new Date(min * 60000).toISOString() : null, lang, cats: cats || 0, fold: foldText(title),
  }));
  return (raw._decoded = { domains, items });
}
const articlesOf = async (region) => decodeArticles(await dataJson(`articles-${region}.json`, 15 * 60e3));
// Les médias dont le nom ou l'adresse correspond à la recherche (« tva nouvelle » → TVA Nouvelles).
function matchOutlets(domains, q) {
  const fq = foldText(q).trim(), compact = fq.replace(/[^\p{L}\p{N}]+/gu, "");
  if (fq.length < 2) return [];
  return domains.filter((d) => d.fold.includes(fq) || (d.fold.length >= 3 && fq.includes(d.fold)) ||
    (compact.length >= 3 && d.domain.replace(/[^a-z0-9]/g, "").includes(compact)))
    .sort((a, b) => b.count - a.count).slice(0, 8);
}


/* ---------- Routes ---------- */
function parseRoute() {
  const p = new URLSearchParams(location.search);
  const r = REGIONS.some(([v]) => v === p.get("r")) ? p.get("r") : state.region;
  if (p.get("h")) return { view: "story", id: p.get("h"), region: r };
  if (p.get("q")) return { view: "search", q: p.get("q").trim().slice(0, 120), region: r };
  if (p.get("v") === "proprietaires") return { view: "owners", region: r };
  if (p.get("v") === "moi") return { view: "me", region: r };
  if (["matin", "videos", "quiz", "favoris"].includes(p.get("v"))) return { view: p.get("v"), region: r };
  if (p.get("m")) return { view: "outlet", m: p.get("m").toLowerCase(), region: r };
  if (p.get("ville")) return { view: "ville", ville: p.get("ville").toLowerCase(), region: r };
  if (p.get("v") === "villes") return { view: "villes", region: r };
  if (p.get("v") === "comparer") return { view: "comparer", a: (p.get("a") || "").toLowerCase(), b: (p.get("b") || "").toLowerCase(), region: r };
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
  else if (o.ville) p.set("ville", o.ville);
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
  const d = (history.state?.d || 0) + (replace ? 0 : 1);
  history[replace ? "replaceState" : "pushState"]({ y: 0, d }, "", url);
  const run = () => render({ scroll: 0 });
  // Changement de page en douceur (navigateurs récents), sauf quand l'histoire s'ouvre en panneau.
  // Une photo de carte qui grandit vers l'histoire (runFlip) remplace le fondu.
  if (document.startViewTransition && !reduceMotion() && !panelWanted(url) && !state.flip) document.startViewTransition(run); else run();
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-nav]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  go(a.getAttribute("href"));
});
addEventListener("popstate", () => {
  // Le bouton Retour ferme d'abord ce qui est ouvert par-dessus (En bref, fenêtre, menu, tutoriel).
  if ($("#shorts")) closeShorts();
  if ($("#modal.open")) closeLayer("#modal");
  closeStoryMenu();
  $(".coach")?.remove();
  render({ scroll: history.state?.y || 0 });
});

function render({ scroll = 0 } = {}) {
  const route = parseRoute();
  exitSelect();
  document.body.classList.toggle("in-story", route.view === "story");
  // L'histoire s'ouvre en panneau (téléphone) ou à droite (iPad) : la page d'en dessous reste en place.
  if (route.view === "story" && panelMode() && (state.panel || (state.route && PANEL_BASES.includes(state.route.view)))) {
    if (!state.panel) state.panel = { base: state.lastSearch ?? "", baseRoute: state.route, title: document.title };
    state.route = route;
    openPanel(route);
    updateBackBtn();
    return;
  }
  if (state.panel) {
    const { base, baseRoute, title } = state.panel;
    closePanel();
    if (location.search === base) { state.route = baseRoute; document.title = title; updateBackBtn(); return; }
  }
  state.route = route;
  // Une édition venue de l'adresse (lien partagé « &r=monde ») vaut pour cette visite seulement :
  // on ne remplace pas l'édition choisie par la personne (c'est le sélecteur d'édition qui l'enregistre).
  if (route.region !== state.region) state.region = route.region;
  state.observer?.disconnect();
  state.onScroll = null;
  stopSpeaking();
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
  else if (route.view === "favoris") viewFavs(v);
  else if (route.view === "comparer") viewCompare(v, route);
  else if (route.view === "ville") viewVille(v, route);
  else if (route.view === "villes") viewVilles(v);
  else viewFeed(v, route);
  state.lastSearch = location.search;
  updateBackBtn();
  requestAnimationFrame(() => scrollTo(0, scroll));
}

/* ---------- Bandeau et rubriques ---------- */
const PAGES = [["matin", "Le matin"], ["videos", "Vidéos"], ["moi", "Mon prisme"], ["favoris", "Favoris"]];
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
  ville: '<path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  reglages: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  comparer: '<rect x="3" y="5" width="7" height="14" rx="1"/><rect x="14" y="5" width="7" height="14" rx="1"/>',
  favoris: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  bref: '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5Z"/>',
  install: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M12 7v7M9 11l3 3 3-3M10.5 18.5h3"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
const routePage = (r) => ({ me: "moi", owners: "proprietaires", matin: "matin", videos: "videos", quiz: "quiz", favoris: "favoris" }[r.view] || null);

function renderChrome(route) {
  const page = routePage(route);
  // Ordinateur : « En bref » est un vrai bouton dans le bandeau, à côté des pages (au téléphone, il est dans la barre du bas).
  const dayLabel = (v, l) => (v === "matin" && new Date().getHours() >= 15 ? "Ta journée" : l);
  $("#mastLinks").innerHTML = `<button type="button" class="mast-bref" id="mastBref" title="Une nouvelle par écran"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5Z"/></svg>En bref</button>` + PAGES.map(([v, l]) => `<a href="${href({ v })}" data-nav ${page === v ? 'aria-current="page"' : ""}>${dayLabel(v, l)}</a>`).join("") + `<button type="button" class="mast-more" data-explore ${["proprietaires", "quiz", "comparer"].includes(page) ? 'aria-current="page"' : ""}>Explorer</button>`;
  $("#editionSel").innerHTML = REGIONS.map(([v, l]) => `<option value="${v}" ${v === state.region ? "selected" : ""}>${l}</option>`).join("");
  // « Ma ville » juste après « À la une » : visible tout de suite, sans glisser la barre.
  const catLink = ([v, l]) => `<a class="cc-${v}" href="${href({ cat: v, lens: route.view === "feed" ? route.lens : undefined })}" data-nav ${route.view === "feed" && route.cat === v ? 'aria-current="page"' : ""}>${CAT_EMOJI[v] ? `<span class="ce" aria-hidden="true">${CAT_EMOJI[v]}</span>` : ""}${l}</a>`;
  $("#cats").innerHTML = catLink(CATS[0])
    // « Ma ville » en un toucher, aller et retour : sur la page de ta ville, la même pastille (avec ✕) ramène à la une.
    + (() => { const onMine = route.view === "ville" && route.ville === prefs.city && prefs.city;
      return `<a class="cat-ville${onMine ? " on" : ""}" href="${onMine ? href({}) : prefs.city ? href({ ville: prefs.city }) : href({ v: "villes" })}" data-nav ${["ville", "villes"].includes(route.view) ? 'aria-current="page"' : ""} title="${onMine ? "Revenir à la une" : "Les nouvelles de ma ville"}">📍 ${esc(prefs.cityLabel || "Ma ville")}${onMine ? `<span class="cv-x" aria-hidden="true">✕</span>` : ""}</a>`; })()
    + `${prefs.city ? `<button class="cat-wx" id="catWx" type="button" aria-label="Météo" hidden></button>` : ""}<span class="sep"></span>`
    + CATS.slice(1).map(catLink).join("");
  const onUne = ["feed", "story", "search", "outlet", "ville", "villes"].includes(route.view);
  const alerts = alertCount();
  $("#tabbar").innerHTML = `
    <a href="${href({})}" data-nav ${onUne ? 'aria-current="page"' : ""}>${svg("une")}À la une${alerts ? `<span class="dot">${alerts}</span>` : ""}</a>
    <button type="button" id="enBrefTab">${svg("bref")}En bref</button>
    <a href="${href({ v: "matin" })}" data-nav ${page === "matin" ? 'aria-current="page"' : ""}>${svg("matin")}${new Date().getHours() >= 15 ? "Ta journée" : "Le matin"}</a>
    <a href="${href({ v: "videos" })}" data-nav ${page === "videos" ? 'aria-current="page"' : ""}>${svg("videos")}Vidéos</a>
    <a href="${href({ v: "moi" })}" data-nav ${page === "moi" ? 'aria-current="page"' : ""}>${svg("moi")}Mon prisme</a>
    <button type="button" id="moreBtnTab" ${["proprietaires", "quiz", "favoris", "comparer", "villes"].includes(page) ? 'aria-current="page"' : ""}>${svg("plus")}Plus</button>`;
  $("#moreBtnTab").onclick = openMoreSheet;
  drawCatWx();
  $("#enBrefTab").onclick = openEnBref;
  $("#mastBref").onclick = openEnBref;
  hScroll($("#cats"));
  // Garde visible la rubrique choisie dans la barre défilante (téléphone).
  const el = $("#cats [aria-current]");
  if (el) {
    const bar = el.parentElement;
    if (el.offsetLeft + el.offsetWidth > bar.scrollLeft + bar.clientWidth || el.offsetLeft < bar.scrollLeft) bar.scrollLeft = el.offsetLeft - 16;
  }
  if (document.activeElement !== $("#search").q) $("#search").q.value = route.view === "search" ? route.q : "";
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
  if (isIOS()) return `<li><div class="install-hint install-steps"><b>Installer Prisme sur l'iPhone :</b>${iosInstallSteps()}</div></li>`;
  return `<li><div class="install-hint"><b>Installer sur Android :</b> dans Chrome, ouvre le menu <b>⋮</b>, puis <b>« Ajouter à l'écran d'accueil »</b> ou <b>« Installer l'application »</b>.</div></li>`;
}

function openMoreSheet() {
  openModal(`<div class="modal-pad">
    <div class="kicker">Prisme</div>
    <h2>Plus</h2>
    <ul class="sheet-list">
      <li><button type="button" data-open-settings>${svg("reglages")}<span>Réglages<small>Taille du texte, langue, thème, ta ville, ce qui t'intéresse.</small></span></button></li>
      <li><a href="${href({ v: "favoris" })}" data-nav data-close-modal>${svg("favoris")}<span>Mes favoris<small>Les histoires suivies, les articles enregistrés, « À lire ».</small></span></a></li>
      <li><a href="${href({ v: "villes" })}" data-nav data-close-modal>${svg("ville")}<span>Nouvelles par ville<small>Toutes les municipalités du Québec et les villes du Canada.</small></span></a></li>
      <li><button type="button" data-explore>${svg("proprietaires")}<span>Explorer<small>Qui possède quoi, comparer deux médias, devine le média, comment Prisme choisit.</small></span></button></li>
      <li><button type="button" data-report>${svg("about")}<span>Signaler un problème<small>Quelque chose ne marche pas ? Dis-le en un toucher.</small></span></button></li>
      <li><button type="button" id="sheetTheme">${svg("theme")}<span>Thème clair ou sombre</span></button></li>
      ${installBlock()}
    </ul>
  </div>`, true);
  $("#sheetTheme").onclick = () => $("#themeBtn").click();
  const ib = $("#installBtn");
  if (ib) ib.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => null); installEvt = null; closeLayer("#modal"); };
}
// « Explorer » : les pages pour les curieux, rangées ensemble.
function openExplore() {
  openModal(`<div class="modal-pad">
    <div class="kicker">Prisme</div>
    <h2>Explorer</h2>
    <ul class="sheet-list">
      <li><a href="${href({ v: "proprietaires" })}" data-nav data-close-modal>${svg("proprietaires")}<span>Qui possède quoi<small>Les médias regroupés par propriétaire, et la toile des familles.</small></span></a></li>
      <li><a href="${href({ v: "comparer" })}" data-nav data-close-modal>${svg("comparer")}<span>Comparer deux médias<small>Les mêmes histoires, deux titres, côte à côte.</small></span></a></li>
      <li><a href="${href({ v: "quiz" })}" data-nav data-close-modal>${svg("quiz")}<span>Devine le média<small>Un titre : gauche, centre ou droite ?</small></span></a></li>
      <li><button type="button" data-about>${svg("about")}<span>Comment Prisme choisit<small>Les sources, les façons de trier et les limites.</small></span></button></li>
    </ul>
  </div>`, true);
}
// « Signaler un problème » : on décrit en une phrase, et l'envoi part par Messages, Messenger ou courriel (au choix),
// avec la page et l'appareil déjà notés. Rien n'est envoyé à Prisme : c'est la personne qui choisit à qui l'envoyer.
function openReport() {
  const r = state.route || {};
  const page = r.view === "story" ? `histoire ${r.id}` : r.view === "search" ? `recherche « ${r.q} »` : r.view === "ville" ? `ville ${r.ville}` : r.view === "feed" ? `fil ${r.cat} / ${r.lens}` : r.view || "?";
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : "Ordinateur";
  const os = (ua.match(/OS (\d+[_.]\d+)/) || ua.match(/Android (\d+(?:\.\d+)?)/) || [])[1]?.replace("_", ".") || "";
  const details = [`Page : ${page}`, `Édition : ${state.region}`, `Ville : ${prefs.cityLabel || "aucune"}`, `Appareil : ${device}${os ? " " + os : ""}${isStandalone() ? " (app installée)" : " (navigateur)"}`,
    `Écran : ${innerWidth} × ${innerHeight}`, `Thème : ${document.documentElement.dataset.theme || "auto"}`, `Taille du texte : ${prefs.scale}`, `En ligne : ${navigator.onLine ? "oui" : "non"}`, `Date : ${new Date().toLocaleString(LOCALE)}`].join("\n");
  openModal(`<div class="modal-pad rp-sheet">
    <div class="kicker">Prisme</div>
    <h2>Signaler un problème</h2>
    <p class="note">Dis ce qui ne marche pas, en une phrase. Les détails utiles (page, appareil) sont ajoutés tout seuls.</p>
    <textarea id="rpText" rows="4" placeholder="Ex. : quand je touche « Comparer », rien ne s'ouvre." aria-label="Ce qui ne marche pas"></textarea>
    <details class="rp-det"><summary>Voir ce qui sera ajouté</summary><pre data-no-tr>${esc(details)}</pre></details>
    <button class="btn rp-send" type="button" id="rpSend">Envoyer…</button>
    <p class="note">Tu choisis ensuite à qui l'envoyer (à la personne qui t'a fait installer Prisme, par exemple). Rien n'est envoyé automatiquement.</p>
  </div>`, true);
  $("#rpSend").onclick = async () => {
    const text = `Prisme : un problème\n\n${$("#rpText").value.trim() || "(sans description)"}\n\n${details}\n${location.href}`;
    if (navigator.share) { try { await navigator.share({ title: "Prisme : un problème", text }); closeLayer("#modal"); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(text); toast("Copié : colle-le dans un message ou un courriel."); closeLayer("#modal"); }
    catch { prompt("Copie ce texte et envoie-le :", text); }
  };
  setTimeout(() => $("#rpText")?.focus(), 250);
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-explore]")) { e.preventDefault(); openExplore(); return; }
  if (e.target.closest("[data-report]")) { e.preventDefault(); openReport(); return; }
  if (e.target.closest("[data-open-settings]")) { e.preventDefault(); openSettings(); return; }
  if (e.target.closest("[data-close-modal]")) closeLayer("#modal");
  if (e.target.closest("[data-close-drawer]")) closeLayer("#drawer");
});

/* ---------- Le haut de page reste à portée de main ---------- */
function topbarSize() { document.documentElement.style.setProperty("--top-h", `${$("#topbar").offsetHeight}px`); catsStick(); }
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
  // Téléphone : une fois descendu, la recherche se range derrière une loupe dans le bandeau.
  $("#searchBtn").onclick = () => { bar.classList.add("searching"); bar.classList.remove("tucked"); $("#search input").focus({ preventScroll: true }); };
  $("#search input").addEventListener("blur", () => setTimeout(() => bar.classList.remove("searching"), 150));
}

/* ---------- Recherche : suggestions pendant qu'on tape ---------- */
const recent = {
  list() { try { return JSON.parse(store.get("recent", "[]")); } catch { return []; } },
  add(q) { store.set("recent", JSON.stringify([q, ...this.list().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8))); },
  clear() { store.set("recent", "[]"); },
  remove(q) { store.set("recent", JSON.stringify(this.list().filter((x) => x !== q))); },
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
      const rec = recent.list(), mine = topics.list(), fol = follows.list();
      open(`${rec.length ? `<div class="sg-h">Recherches récentes <button type="button" data-clear>Effacer</button></div>${rec.slice(0, 5).map((t) => sgSearch(t, "clock").replace(/<\/a>$/, `<button type="button" class="sg-del" data-del="${esc(t)}" aria-label="Effacer cette recherche">✕</button></a>`)).join("")}` : ""}
        ${fol.length ? `<div class="sg-h">Mes médias</div>${fol.slice(0, 4).map((x) => item(`href="${href({ m: x.d })}" data-nav`, `${favicon(x.d, x.n)}<span class="sg-main" data-no-tr><b>${esc(x.n)}</b><small>${esc(x.d)}</small></span>`)).join("")}` : ""}
        ${mine.length ? `<div class="sg-h">Mes sujets</div>${mine.slice(0, 5).map((t) => sgSearch(t, "star")).join("")}` : ""}
        ${trending.length ? `<div class="sg-h">En ce moment</div>${trending.slice(0, 7).map((t) => sgSearch(t, "trend")).join("")}` : ""}
        <p class="sg-tips">Cherche un sujet (une personne, une ville, un enjeu) ou le nom d'un média, comme « TVA » ou « Le Devoir ».</p>`);
      return;
    }
    const words = fq.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
    const themes = [...new Set([...topics.list(), ...recent.list(), ...trending])].filter((t) => foldText(t).includes(fq) && foldText(t) !== fq).slice(0, 3);
    const stories = (ed?.stories || []).filter((s) => words.length && words.every((w) => foldText(s.title).includes(w)))
      .sort((a, b) => b.sources - a.sources).slice(0, 4);
    const draw = (outlets, vs = []) => {
      if (my !== token) return;
      open(`${sgSearch(q, "search", "Les histoires sur ce sujet")}
        ${vs.length ? `<div class="sg-h">Villes</div>${vs.map((x) => item(`href="${href({ ville: x.s })}" data-nav`, `${pin}<span class="sg-main"><b>${markWords(villeLabel(x), words)}</b><small>${esc(villeWhere(x))}${x.p ? ` · ${x.p.toLocaleString(LOCALE)} hab.` : ""}</small></span>`)).join("")}` : ""}
        ${themes.map((t) => sgSearch(t, "trend")).join("")}
        ${outlets.length ? `<div class="sg-h">Médias</div>${outlets.map((d) => item(`href="${href({ m: d.domain })}" data-nav`,
          `${favicon(d.domain, d.name)}<span class="sg-main" data-no-tr><b>${markWords(d.name, words)}</b><small>${d.media.known ? esc(d.media.owner.replace(/\s*\(.*\)$/, "")) : esc(d.domain)}</small></span><span class="sg-side">${badge(d.media)}</span>`)).join("")}` : ""}
        ${stories.length ? `<div class="sg-h">Histoires</div>${stories.map((s) => item(`href="${href({ h: s.id })}" data-nav`,
          `<span class="sg-main"><span class="sg-t" data-no-tr>${markWords(s.title, words)}</span><small>${plural(s.sources, "média")} ${s.sources > 1 ? "en parlent" : "en parle"} · ${esc(ago(s.lastSeen || s.firstSeen))}</small></span>`)).join("")}` : ""}
        ${item(`href="${href({ q })}" data-q="${esc(q)}" data-wide`, `${sgIcon("all")}<span class="sg-main">Chercher « ${esc(q)} » dans tous les articles (48 h)</span>`).replace('class="sg"', 'class="sg sg-all"')}`);
    };
    draw([]);
    Promise.all([searchBase().catch(() => null), villesData().catch(() => null)]).then(([m, V]) => draw(m ? matchOutlets(m.D, q).slice(0, 4) : [], V ? matchVilles(V, q, 3) : []));
  }

  input.addEventListener("focus", () => { suggest(); searchBase().catch(() => {}); });
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
    const del = e.target.closest("[data-del]");
    if (del) { e.preventDefault(); e.stopPropagation(); recent.remove(del.dataset.del); suggest(); return; }
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
  // Chaque morceau reste entier : « il y a 2 heures » ne se coupe jamais en deux lignes.
  return parts.map((p) => `<span class="kp">${p}</span>`).join(" · ");
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
  return c ? `<span class="kp">${esc(CAT_LABEL[c] || c)}</span> · ` : "";
};

function pickBySide(s) {
  const out = {};
  for (const side of SIDES) {
    const list = s.articles.filter((a) => side.keys.includes(biasKey(a.media)));
    out[side.key] = list.sort((a, b) => (b.published || "").localeCompare(a.published || ""))[0] || null;
  }
  return out;
}

/* ---------- Fil épuré : cartes simples, rangées par thème, Shorts ---------- */
// Le mince trait gauche / centre / droite sous une histoire (les détails sont sur sa page).
function sideStrip(s) {
  const sd = sides(s.counts || {});
  const tot = sd.left + sd.center + sd.right;
  if (!tot) return `<span class="c2-bar none" role="img" aria-label="Aucun média évalué" title="Aucun média évalué"></span>`;
  return `<span class="c2-bar" role="img" aria-label="Médias : gauche ${sd.left}, centre ${sd.center}, droite ${sd.right}" title="Gauche ${sd.left} · Centre ${sd.center} · Droite ${sd.right}">${sd.left ? `<i class="l" style="flex:${sd.left}"></i>` : ""}${sd.center ? `<i class="c" style="flex:${sd.center}"></i>` : ""}${sd.right ? `<i class="r" style="flex:${sd.right}"></i>` : ""}</span>`;
}
// « Radio-Canada, Le Devoir +11 » : deux médias nommés (les connus d'abord), puis le reste en nombre.
function sourcesLine(s, max = 2) {
  // Le premier nommé est celui que « Lire ↗ » ouvre.
  const named = rankArticles(s).slice(0, max);
  const rest = Math.max(0, (s.sources || named.length) - named.length);
  return `<span data-no-tr>${named.map((a) => esc(a.sourceName)).join(", ")}</span>${rest ? ` +${rest}` : ""}`;
}
// Les logos des 3 premiers médias d'une histoire, l'un sur l'autre (les connus d'abord).
function logoStack(s, max = 3) {
  const seen = new Set(), list = [];
  for (const a of s.articles || []) if (!seen.has(a.domain)) { seen.add(a.domain); list.push(a); }
  const top = [...list].sort((a, b) => (b.media?.known ? 1 : 0) - (a.media?.known ? 1 : 0)).slice(0, max);
  return top.length ? `<span class="lstack" aria-hidden="true">${top.map((a) => favicon(a.domain, a.sourceName)).join("")}</span>` : "";
}
// « 12 min », « 3 h », « 2 j » : l'heure courte des cartes (tient sur une ligne).
const agoShort = (iso) => { const m = (Date.now() - Date.parse(iso || 0)) / 60e3; return !iso || !Number.isFinite(m) ? "" : m < 60 ? `${Math.max(1, Math.round(m))} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`; };
// Le meilleur article à lire d'une histoire : dans ta langue, d'un média connu, et d'abord chez les médias
// que tu suis ou que tu lis le plus souvent (compté sur cet appareil seulement).
let favDomCache = null;
function favDomains() {
  if (favDomCache && Date.now() - favDomCache.at < 60e3) return favDomCache.m;
  const m = new Map();
  for (const r of reads.list().slice(-300)) if (r.d) m.set(r.d, (m.get(r.d) || 0) + 1);
  try { for (const x of follows.list()) m.set(x.d, (m.get(x.d) || 0) + 6); } catch { /* pas de médias suivis */ }
  favDomCache = { at: Date.now(), m };
  return m;
}
function rankArticles(s) {
  const seen = new Set();
  const one = (s.articles || []).filter((a) => a.url && !seen.has(a.domain) && seen.add(a.domain));
  const want = LANG === "en" ? "en" : "fr";
  const fav = favDomains();
  const pref = prefMed.set();
  // Un lien qui passe par Google News (petits hebdos sans fil lisible) vient après les liens directs :
  // Google bloque parfois ces redirections (« automated queries »).
  const score = (a) => (pref.has(a.domain) ? 20 : 0) - (viaGoogle(a.url) ? 12 : 0) - (isPaywall(a) ? 3 : 0) - (isOpinion(a) ? 5 : 0) + ((a.lang || "fr") === want ? 4 : 0) + (a.media?.known ? 2 : 0) + (a.domain === s.leadDomain ? 1 : 0) + Math.min(3, (fav.get(a.domain) || 0) * 0.6);
  return one.sort((a, b) => score(b) - score(a));
}
const viaGoogle = (u) => /^https?:\/\/news\.google\.com\//.test(String(u || ""));
// Un lien qui passe par Google News : Google bloque parfois ces redirections (« automated queries »).
// On propose d'aller directement sur le site du média (l'article est parmi ses plus récents), et on retient le choix.
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="https://news.google.com/"]');
  if (!a || e.metaKey || e.ctrlKey) return;
  let meta = {};
  try { meta = JSON.parse(a.dataset.read || "{}"); } catch { /* sans détails */ }
  if (!meta.d) return;
  const site = `https://${meta.d}/`, name = meta.n || meta.d, pref = store.get("gnPref", "");
  if (pref === "google") return;
  // Pas de « stopPropagation » : la lecture compte toujours dans Mon prisme, et les autres gestes
  // (mode sélection, appui long), qui passent avant, gardent la main.
  if (e.defaultPrevented) return;
  e.preventDefault();
  const card = a.closest("[data-card-read]") || a;
  const sid = card.dataset?.cardRead;
  const go2 = (u) => { window.open(u, "_blank", "noopener"); if (sid && state.stories.get(sid)) setTimeout(() => setSeen(state.stories.get(sid), true), 400); };
  if (pref === "site") { go2(site); toast(`Sur ${name} : l'article est parmi les plus récents.`); return; }
  openModal(`<div class="modal-pad gn-sheet"><div class="kicker">Lire chez <span data-no-tr>${esc(name)}</span></div>
    <h2 class="pk-h2" data-no-tr>${esc(meta.t || "")}</h2>
    <p class="note">Ce média ne laisse pas Prisme lire son site directement : son lien passe par Google News, et Google le bloque parfois.</p>
    <ul class="sheet-list">
      <li><button type="button" data-gn="site">${ico("share")}<span>Aller sur le site de <span data-no-tr>${esc(name)}</span><small>Sans Google. L'article est parmi les plus récents de leur page d'accueil.</small></span></button></li>
      <li><button type="button" data-gn="google"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8M9 8h7v7"/></svg><span>Ouvrir l'article (via Google News)<small>Directement sur l'article, quand Google le permet.</small></span></button></li>
    </ul>
    <label class="gn-keep"><input type="checkbox" id="gnKeep" checked> Retenir mon choix</label></div>`, true);
  $("#modalBody .gn-sheet").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-gn]");
    if (!b) return;
    if ($("#gnKeep")?.checked) store.set("gnPref", b.dataset.gn);
    closeLayer("#modal");
    go2(b.dataset.gn === "site" ? site : a.href);
  });
});
// Tes médias préférés (⭐) : quand ils couvrent une nouvelle, le titre s'ouvre chez eux. Sur cet appareil seulement.
const prefMed = {
  list() { try { return JSON.parse(store.get("prefMed", "[]")); } catch { return []; } },
  set() { return new Set(this.list().map((x) => x.d)); },
  toggle(d, n) { const l = this.list(); const on = !l.some((x) => x.d === d); store.set("prefMed", JSON.stringify(on ? [{ d, n }, ...l].slice(0, 12) : l.filter((x) => x.d !== d))); return on; },
};
// « Lire chez… » : tous les médias qui couvrent la nouvelle, leur titre, leur côté. On touche, ça s'ouvre.
function openPicker(s) {
  const all = rankArticles(s);
  if (!all.length) return;
  const pref = prefMed.set();
  const side = (a) => sideOf(a.media) || "other";
  const counts = { left: 0, center: 0, right: 0, other: 0 };
  for (const a of all) counts[side(a)]++;
  const row = (a) => `<li data-side="${side(a)}"><a class="pk-go" href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${readAttr(a)}" data-card-read="${esc(s.id)}" data-close-modal>
      <span class="pk-src">${favicon(a.domain, a.sourceName)}<b data-no-tr>${esc(a.sourceName)}</b>${badge(a.media)}${langTag(a.lang)}${artTags(a)}${viaGoogle(a.url) ? `<small class="pk-via" title="Ce média n'a pas de fil lisible directement : le lien passe par Google News">via Google</small>` : ""}<time>${esc(agoShort(a.published))}</time></span>
      <span class="pk-tt" data-no-tr>${esc(a.title)}</span></a>
    <button class="pk-star" type="button" data-pref-med="${esc(a.domain)}" data-name="${esc(a.sourceName)}" aria-pressed="${pref.has(a.domain)}" aria-label="Média préféré">${ico("star")}</button></li>`;
  const tabs = all.length >= 6 ? `<div class="seg pk-tabs" role="group">${[["all", "Tous", all.length], ["left", "Gauche", counts.left], ["center", "Centre", counts.center], ["right", "Droite", counts.right]]
    .filter(([k, , n]) => k === "all" || n).map(([k, l, n]) => `<button type="button" data-pk-tab="${k}" aria-pressed="${k === "all"}">${l} <small>${n}</small></button>`).join("")}</div>` : "";
  openModal(`<div class="modal-pad pk-sheet">
    <div class="kicker">Lire chez…</div>
    <h2 class="pk-h2" data-no-tr>${titleOf(s)}</h2>
    ${tabs}
    <ul class="pk-list">${all.map(row).join("")}</ul>
    <p class="note pk-note">⭐ Touche l'étoile d'un média : quand il couvre une nouvelle, le titre s'ouvrira chez lui en premier.</p>
  </div>`, true);
  const box = $("#modalBody .pk-sheet");
  box.addEventListener("click", (e) => {
    const t = e.target.closest("[data-pk-tab]");
    if (t) {
      $$("[data-pk-tab]", box).forEach((x) => x.setAttribute("aria-pressed", x === t));
      $$(".pk-list li", box).forEach((li) => { li.hidden = t.dataset.pkTab !== "all" && li.dataset.side !== t.dataset.pkTab; });
      return;
    }
    const st = e.target.closest("[data-pref-med]");
    if (st) {
      const on = prefMed.toggle(st.dataset.prefMed, st.dataset.name);
      st.setAttribute("aria-pressed", on);
      buzz(10);
      toast(on ? `⭐ ${st.dataset.name} : ses articles s'ouvriront en premier.` : `${st.dataset.name} n'est plus un média préféré.`);
      favDomCache = null;
    }
  });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pick]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const s = state.stories.get(b.dataset.pick);
  if (s) openPicker(s);
}, true);
const bestArticle = (s) => rankArticles(s)[0] || null;
// Toucher le titre ou la photo d'une carte : l'article s'ouvre directement (le meilleur pour toi).
// Sans article (rare), on retombe sur la page de l'histoire.
function openAttrs(s) {
  const a = bestArticle(s);
  return a ? `href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${readAttr(a)}" data-card-read="${esc(s.id)}"`
    : `href="${href({ h: s.id })}" data-nav`;
}
// Sous la carte : « Comparer les 13 médias › » (la page Prisme : gauche, centre, droite) et l'aperçu sur place.
function cmpRow(s) {
  const n = s.sources || 1;
  return `<div class="c2-row"><a class="c2-cmp" href="${href({ h: s.id })}" data-nav><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M5 20h14M6 8l-3 6a3 3 0 0 0 6 0Zm12 0-3 6a3 3 0 0 0 6 0ZM6 8h12"/></svg><span>${n > 1 ? `Comparer les ${n} médias` : "Voir l'histoire"}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></a></div>`;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-card-read]");
  if (!a) return;
  const s = state.stories.get(a.dataset.cardRead);
  if (s) setTimeout(() => setSeen(s, true), 400);
});
// Les sources d'une carte sont un bouton : « Le Devoir +11 ▾ » ouvre « Lire chez… » pour choisir le média.
const srcPick = (s, n = 1, logos = 3) => `<button class="src-pick" type="button" data-pick="${esc(s.id)}" title="Choisir le média à lire">${logoStack(s, logos)}${sourcesLine(s, n)}${isPaywall(bestArticle(s)) ? `<span class="lock" title="Ce média demande souvent un abonnement">🔒</span>` : ""}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>`;
const metaLine = (s, st) => `<p class="c2-meta">${newTag(s)}${srcPick(s)} · <time title="${esc(ago(s.lastSeen || s.firstSeen))}">${agoShort(s.lastSeen || s.firstSeen)}</time>${st?.fresh ? ` · <b class="c2-fresh">+${st.fresh} depuis ta lecture</b>` : ""}</p>`;

// La rubrique d'une histoire, en couleur, et l'angle mort : en haut de chaque carte. La rubrique mène à son fil.
const catOf = (s, cat) => s.categories?.find((x) => x !== cat && x !== "une" && CAT_LABEL[x]) || null;
// « En direct » : au moins 2 médias ont publié sur l'histoire dans la dernière heure.
const isLive = (s) => { const t = Date.now() - 60 * 60e3; return new Set((s.articles || []).filter((a) => Date.parse(a.published || 0) > t).map((a) => a.domain)).size >= 2; };
const liveTag = (s) => (isLive(s) ? `<span class="ck-live" title="Des médias publient encore sur cette histoire dans la dernière heure">En direct</span>` : "");
function kickerLine(s, cat) {
  const c = catOf(s, cat);
  const k = liveTag(s) + (isOpinion(bestArticle(s)) ? `<span class="tg tg-op" title="Texte d'opinion : chronique, éditorial ou lettre">Opinion</span>` : "") + (c ?`<a class="ck cc-${c}" href="${href({ cat: c })}" data-nav>${esc(CAT_LABEL[c])}</a>` : "")
    + (s.blindspot ? `<span class="ck-blind ${s.blindspot === "right" ? "r" : "l"}" title="Les médias de ${s.blindspot === "right" ? "droite" : "gauche"} en parlent très peu">Angle mort ${s.blindspot === "right" ? "à droite" : "à gauche"}</span>` : "");
  return k ? `<div class="c2-k">${k}</div>` : "";
}
// La photo d'une carte ; sans photo, la couleur de la rubrique avec le logo du média en grand.
function cardImg(s, cat, cls = "c2-img") {
  const a = s.articles?.find((x) => x.media?.known) || s.articles?.[0];
  const c = catOf(s, cat) || s.categories?.find((x) => CAT_LABEL[x]) || "une";
  return `<a class="${cls} cc-${c}${s.image ? "" : " ph"}" ${openAttrs(s)} tabindex="-1" aria-hidden="true">${s.image ? `<img src="${esc(safeUrl(s.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="ph-logo">${a ? favicon(a.domain, a.sourceName) : ""}</span></a>`;
}

function storyRow(s, cat) {
  const st = seenState(s);
  return `<article class="story c2${st?.seen ? " is-seen" : ""}">
    <div class="c2-body">
      ${kickerLine(s, cat)}
      <h3 data-no-tr><a ${openAttrs(s)}>${titleOf(s)}</a></h3>
      ${sideStrip(s)}
      ${metaLine(s, st)}
    </div>
    ${cardImg(s, cat)}
    ${cmpRow(s)}
  </article>`;
}
// La une : la photo pleine largeur, le titre par-dessus, et pourquoi elle est là (le nombre de médias).
function heroStory(s, cat) {
  const link = href({ h: s.id });
  const st = seenState(s);
  const h = new Date().getHours();
  const when = h >= 5 && h < 11 ? "La une de ce matin" : h >= 18 ? "La une de ce soir" : "La une";
  const sd = sides(s.counts || {});
  const all3 = sd.left && sd.center && sd.right;
  const dek = s.ai?.summary || s.summary || "";
  return `<article class="lead hero${st?.seen ? " is-seen" : ""}">
    ${s.image ? `<img class="glow" src="${esc(safeUrl(s.image))}" alt="" aria-hidden="true" referrerpolicy="no-referrer">` : ""}
    <a class="hero-media${s.image ? "" : ` ph cc-${catOf(s, cat) || "une"}`}" ${openAttrs(s)}>
      ${s.image ? `<img src="${esc(safeUrl(s.image))}" alt="" referrerpolicy="no-referrer" fetchpriority="high">` : ""}
      <span class="hero-in">
        <span class="hero-k">${when}</span>${isLive(s) ? `<span class="hero-live">En direct</span>` : ""}
        <h2 data-no-tr>${titleOf(s)}</h2>
      </span>
    </a>
    <div class="hero-why"><b><span data-count="${s.sources}">${s.sources}</span> ${s.sources > 1 ? "médias en parlent" : "média en parle"}</b><span>${all3 ? "La gauche, le centre et la droite" : "L'histoire la plus couverte"} · ${esc(ago(s.lastSeen || s.firstSeen))}</span></div>
    ${sideStrip(s)}
    ${dek ? `<p class="dek" data-no-tr>${esc(dek)}</p>` : ""}
    <p class="c2-meta">${newTag(s)}${srcPick(s, 2, 5)}${st?.fresh ? ` · <b class="c2-fresh">+${st.fresh} depuis ta lecture</b>` : ""}</p>
    ${cmpRow(s)}
  </article>`;
}
// Les grandes cartes du haut du fil (places 2 à 5) : la photo en large, le titre en blanc par-dessus.
function bigCard(s, cat) {
  const st = seenState(s);
  return `<article class="story big${st?.seen ? " is-seen" : ""}">
    <div class="big-box">
      <a class="big-media" ${openAttrs(s)} tabindex="-1" aria-hidden="true"><img src="${esc(safeUrl(s.image))}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>
      <div class="big-in">${kickerLine(s, cat)}<h3 data-no-tr><a ${openAttrs(s)}>${titleOf(s)}</a></h3></div>
    </div>
    ${sideStrip(s)}
    ${metaLine(s, st)}
    ${cmpRow(s)}
  </article>`;
}
// Une carte « Angle mort » glissée dans le fil.
function blindCard(s) {
  const r = s.blindspot === "right";
  return `<aside class="bcard ${r ? "r" : "l"}">
    <div class="bc-k">◐ Angle mort</div>
    <h3 data-no-tr><a href="${href({ h: s.id })}" data-nav>${titleOf(s)}</a></h3>
    <p>${plural(s.sources, "média")} en parlent, mais presque aucun média de ${r ? "droite" : "gauche"}.</p>
    ${sideStrip(s)}
    <a class="link bc-all" href="${href({ lens: "angles" })}" data-nav>Tous les angles morts →</a>
  </aside>`;
}
function leadStory(s, cat) {
  const link = href({ h: s.id });
  const st = seenState(s);
  const dek = s.ai?.summary || s.summary || "";
  return `<article class="lead c2l${s.image ? "" : " noimg"}${st?.seen ? " is-seen" : ""}">
    ${s.image ? `<a class="lead-media" ${openAttrs(s)} tabindex="-1" aria-hidden="true"><img src="${esc(safeUrl(s.image))}" alt="" referrerpolicy="no-referrer"></a>` : ""}
    ${kickerLine(s, cat)}
    ${sideStrip(s)}
    <h2 data-no-tr><a ${openAttrs(s)}>${titleOf(s)}</a></h2>
    ${dek ? `<p class="dek" data-no-tr>${esc(dek)}</p>` : ""}
    ${metaLine(s, st)}
    ${cmpRow(s)}
  </article>`;
}
// Une petite carte dans une rangée qu'on glisse.
const miniCard = (s) => `<article class="mini${seenState(s)?.seen ? " is-seen" : ""}">
    <a class="mini-img${s.image ? "" : " noimg"}" href="${href({ h: s.id })}" data-nav tabindex="-1" aria-hidden="true">${s.image ? `<img src="${esc(safeUrl(s.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</a>
    ${sideStrip(s)}
    <h3 data-no-tr><a href="${href({ h: s.id })}" data-nav>${titleOf(s)}</a></h3>
    <p class="c2-meta">${sourcesLine(s, 1)} · ${esc(ago(s.lastSeen || s.firstSeen))}</p>
  </article>`;
const rowHtml = (r) => `<section class="row-sec"><div class="row-h"><h2>${esc(CAT_LABEL[r.cat] || r.cat)}</h2><a class="link" href="${href({ cat: r.cat })}" data-nav>Tout voir →</a></div>
    <div class="row-sc">${r.stories.map(miniCard).join("")}</div></section>`;

// La rangée de ta ville : les articles de la semaine, regroupés par média (les plus actifs d'abord).
async function cityWeek(city) {
  if (cityCache && cityCache.s === city.s && Date.now() - cityCache.at < 10 * 60e3) return cityCache;
  const q = city.s === "quebec" ? `"ville de Québec"` : `"${city.n}"`;
  const [r, loc] = await Promise.all([indexSearch(q).catch(() => null), localMedia()]);
  if (!r) return null;
  const m = r.meta;
  const own = new Set(Object.entries(loc).filter(([, [, , cities]]) => (cities || []).some((c) => foldText(c) === city.f)).map(([d]) => d));
  const ids = new Set(r.ids.filter((id) => m.D[m.dom[id]].country === "CA"));
  if (own.size) {
    const idx = new Set(m.D.map((d, i) => (own.has(d.domain) ? i : -1)).filter((i) => i >= 0));
    for (let id = 0; id < m.dom.length; id++) if (idx.has(m.dom[id])) ids.add(id);
  }
  const all = [...ids].sort((a, b) => m.age[a] - m.age[b]);
  const by = new Map();
  for (const id of all) { const d = m.dom[id]; if (!by.has(d)) by.set(d, []); by.get(d).push(id); }
  const groups = [...by.values()].sort((a, b) => b.length - a.length);
  const pick = groups.flatMap((g) => g.slice(0, 4)).slice(0, 12);
  cityCache = { s: city.s, at: Date.now(), n: all.length, top: await docsFor(pick) };
  return cityCache;
}
async function fillCityRow() {
  const el = $("#rowVille");
  if (!el || el.dataset.done) return;
  const city = await myVille();
  if (!city) return;
  const d = await cityWeek(city).catch(() => null);
  if (!d?.n || !el.isConnected) return;
  el.dataset.done = "1";
  // Une carte simple, de haut en bas : la ville, sa météo, ses 3 dernières nouvelles.
  const latest = [...d.top].sort((a, b) => (b.published || "").localeCompare(a.published || "")).slice(0, 3);
  el.innerHTML = `<div class="vc-h"><a class="vc-t" href="${href({ ville: city.s })}" data-nav>${pin}<b>${esc(city.n)}</b></a><span class="wx" id="rvWx"></span></div>
    <p class="vc-n">${d.n > 1 ? `${d.n} nouvelles cette semaine` : "1 nouvelle cette semaine"}</p>
    <p class="notices" id="rvNotice" role="button" tabindex="0" hidden></p>
    <ul class="vc-list">${latest.map((x) => `<li><span class="vc-src">${favicon(x.domain, x.sourceName)}<span data-no-tr>${esc(cleanName(x.sourceName))}</span> · ${esc(ago(x.published))}</span>${artLink(x, "vc-a")}</li>`).join("")}</ul>
    <div class="vc-acts"><button class="vc-bref" type="button" data-city-bref="${esc(city.s)}">▶ En bref</button><a class="vc-all" href="${href({ ville: city.s })}" data-nav>Tout voir →</a></div>`;
  el.hidden = false;
  fillWeather($("#rvWx", el), city);
  fillNotices($("#rvNotice", el), city);
}

/* Shorts : une histoire par écran, on glisse vers le haut pour la suivante. */
const readAttr = (a) => esc(JSON.stringify({ u: a.url, d: a.domain, n: a.sourceName, k: biasKey(a.media), o: a.media?.known ? a.media.owner : null, c: a.media?.country || null, t: a.title }));
function shortSlide(s) {
  const by = pickBySide(s);
  const dek = s.ai?.summary || s.summary || "";
  const cat = s.categories?.[0];
  return `<section class="sh" data-id="${esc(s.id)}">
    ${s.image ? `<img class="sh-bg" src="${esc(safeUrl(s.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
    <div class="sh-in">
      <div class="sh-k">${cat ? `${esc(CAT_LABEL[cat] || cat)} · ` : ""}${plural(s.sources, "média")}</div>
      <h2 data-no-tr>${titleOf(s)}</h2>
      ${dek ? `<p class="sh-dek" data-no-tr>${esc(dek.length > 260 ? `${dek.slice(0, 257)}…` : dek)}</p>` : ""}
      ${sideStrip(s)}
      <div class="sh-sides">${SIDES.map((side) => {
        const a = by[side.key];
        return a ? `<a class="sh-side sh-${side.key}" href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${readAttr(a)}"><b>${side.label}</b><small data-no-tr>${esc(a.sourceName)}</small></a>`
          : `<span class="sh-side sh-${side.key} off"><b>${side.label}</b><small>personne</small></span>`;
      }).join("")}</div>
      <a class="sh-open" href="${href({ h: s.id })}" data-sh-open>Toute l'histoire →</a>
    </div>
  </section>`;
}
function openShorts() {
  const key = feedKey(state.route);
  const f = state.feeds.get(key);
  if (!f?.stories.length) return;
  closeShorts();
  const o = document.createElement("div");
  o.id = "shorts";
  o.innerHTML = `${shBar("une", prefs.city ? prefs.cityLabel || "Ma ville" : "")}
    <div class="sh-sc" id="shSc">${f.stories.map(shortSlide).join("")}</div>`;
  $("#shPos", o).textContent = `1 / ${f.stories.length} · glisse vers le haut`;
  document.body.appendChild(o);
  document.body.classList.add("shorts-open");
  requestAnimationFrame(() => o.classList.add("on"));
  const sc = $("#shSc", o);
  let shown = f.stories.length;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const i = [...sc.children].indexOf(en.target);
      $("#shPos", o).textContent = `${i + 1} / ${f.hasMore ? `${f.stories.length}+` : f.stories.length}`;
      // Bientôt la fin : on charge les histoires suivantes.
      if (i >= sc.children.length - 3 && f.hasMore && !f.loading) loadMore(key).then(() => {
        const fresh = f.stories.slice(shown);
        shown = f.stories.length;
        sc.insertAdjacentHTML("beforeend", fresh.map(shortSlide).join(""));
        for (const el of [...sc.children].slice(-fresh.length)) io.observe(el);
      });
    }
  }, { root: sc, threshold: 0.6 });
  for (const el of sc.children) io.observe(el);
  o._io = io;
  o.onclick = shClick;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-city-bref]");
  if (!b) return;
  e.preventDefault();
  const V = await villesData().catch(() => null);
  openCityBref(V?.bySlug.get(b.dataset.cityBref) || null);
});
// Le haut de « En bref » : À la une ou ta ville, la position, et fermer.
const shBar = (mode, cityName) => `<div class="sh-bar">
    <div class="sh-modes"><button type="button" data-shmode="une" aria-pressed="${mode === "une"}">À la une</button>${cityName ? `<button type="button" data-shmode="ville" aria-pressed="${mode === "ville"}">📍 <span data-no-tr>${esc(cityName)}</span></button>` : ""}<button type="button" data-shmode="video" aria-pressed="${mode === "video"}">▶ Vidéos</button></div>
    <button class="icon-btn sh-x" type="button" aria-label="Fermer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <span class="sh-pos" id="shPos"></span>
  </div>`;
function shClick(e) {
  if (e.target.closest(".sh-x, [data-sh-close]")) { closeShorts(); return; }
  const m = e.target.closest("[data-shmode]");
  if (m && m.getAttribute("aria-pressed") !== "true") { if (m.dataset.shmode === "ville") openCityBref(); else if (m.dataset.shmode === "video") openVideoBref(); else { closeShorts(); openEnBref(); } return; }
  const op = e.target.closest("[data-sh-open]");
  if (op) { e.preventDefault(); closeShorts(); go(op.getAttribute("href")); }
}

/* « En bref » de ta ville : ses nouvelles de la semaine, puis celles des villes voisines (même MRC, puis même région). */
function nearVilles(V, city) {
  const pop = (a, b) => (b.p || 0) - (a.p || 0);
  const mrc = city.m ? V.list.filter((x) => x !== city && x.pr === city.pr && x.m === city.m).sort(pop) : [];
  const reg = V.list.filter((x) => x !== city && x.pr === city.pr && x.r === city.r && !mrc.includes(x)).sort(pop);
  return [...mrc.slice(0, 10), ...reg].slice(0, 16);
}
async function placeIds(c, loc) {
  const r = await indexSearch(c.s === "quebec" ? `"ville de Québec"` : `"${c.n}"`).catch(() => null);
  if (!r) return [];
  const m = r.meta;
  const own = new Set(Object.entries(loc).filter(([, [, , cities]]) => (cities || []).some((x) => foldText(x) === c.f)).map(([d]) => d));
  const ids = new Set(r.ids.filter((id) => m.D[m.dom[id]].country === "CA"));
  if (own.size) {
    const idx = new Set(m.D.map((d, i) => (own.has(d.domain) ? i : -1)).filter((i) => i >= 0));
    for (let id = 0; id < m.dom.length; id++) if (idx.has(m.dom[id])) ids.add(id);
  }
  return [...ids].sort((a, b) => m.age[a] - m.age[b]);
}
const artSlide = (x, c, near = false) => `<section class="sh${x.image ? "" : " sh-noimg"}" data-city="${esc(c.n)}">
    ${x.image ? `<img class="sh-bg" src="${esc(safeUrl(x.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="sh-logo">${favicon(x.domain, x.sourceName)}<span data-no-tr>${esc(x.sourceName)}</span></div>`}
    <div class="sh-in">
      <div class="sh-place${near ? " near" : ""}">📍 <b data-no-tr>${esc(c.n)}</b>${near ? "<small>ville voisine</small>" : ""}</div>
      <div class="sh-k"><span data-no-tr>${esc(x.sourceName)}</span> · ${esc(ago(x.published))}</div>
      <h2 data-no-tr>${esc(x.title)}</h2>
      ${x.summary ? `<p class="sh-dek" data-no-tr>${esc(x.summary.length > 280 ? `${x.summary.slice(0, 277)}…` : x.summary)}</p>` : ""}
      <a class="sh-read" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer" data-read="${readAttr(x)}">Lire l'article →</a>
    </div>
  </section>`;
const nextCitySlide = (prev, c, n, none = false) => `<section class="sh sh-div" data-city="${esc(c.n)}"><div class="sh-in">
    <div class="sh-k">${none ? "Rien de neuf à" : "C'est tout pour"} <span data-no-tr>${esc(prev.n)}</span> cette semaine</div>
    <h2>Maintenant : <span data-no-tr>${esc(c.n)}</span></h2>
    <p class="sh-dek">Ville voisine · ${esc(villeWhere(c))} · ${plural(n, "nouvelle")}</p>
    <p class="sh-hint">Glisse vers le haut ↑</p></div></section>`;
async function openCityBref(city = null) {
  city = city || await myVille();
  if (!city) { toast("Choisis d'abord ta ville."); go(href({ v: "villes" })); return; }
  closeShorts();
  const o = document.createElement("div");
  o.id = "shorts";
  o.innerHTML = `${shBar("ville", city.n)}<div class="sh-sc" id="shSc"><section class="sh sh-div"><div class="sh-in"><h2>Les nouvelles de <span data-no-tr>${esc(city.n)}</span>…</h2></div></section></div>`;
  document.body.appendChild(o);
  document.body.classList.add("shorts-open");
  requestAnimationFrame(() => o.classList.add("on"));
  o.onclick = shClick;
  const sc = $("#shSc", o);
  const [V, loc] = await Promise.all([villesData(), localMedia()]);
  const queue = [city, ...nearVilles(V, city)];
  const seen = new Set();
  let qi = 0, pend = [], cur = null, shown = null, busy = false, done = false;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const i = [...sc.children].indexOf(en.target);
      // La ville de la nouvelle affichée, en haut ; elle s'illumine quand on passe à une autre ville.
      const here = en.target.dataset.city || city.n, pos = $("#shPos", o);
      if (pos.dataset.city !== here) {
        pos.dataset.city = here;
        // Le bouton du haut reste ta ville ; cette ligne dit seulement d'où vient la nouvelle affichée.
        pos.innerHTML = here !== city.n ? `Nouvelle de <b data-no-tr>${esc(here)}</b>, ville voisine` : `Nouvelles de <b data-no-tr>${esc(here)}</b>`;
        pos.classList.remove("flash"); void pos.offsetWidth; pos.classList.add("flash");
      }
      if (i >= sc.children.length - 3) more();
    }
  }, { root: sc, threshold: 0.6 });
  o._io = io;
  async function more() {
    if (busy || done) return;
    busy = true;
    let html = "";
    while (!html) {
      if (!pend.length) {
        if (qi >= queue.length) { done = true; html = `<section class="sh sh-div"><div class="sh-in"><h2>Tu as fait le tour</h2><p class="sh-dek">Les nouvelles de <span data-no-tr>${esc(city.n)}</span> et des villes voisines, cette semaine.</p><button class="btn" type="button" data-sh-close>Fermer</button></div></section>`; break; }
        cur = queue[qi++];
        pend = (await placeIds(cur, loc)).filter((id) => !seen.has(id));
        if (!pend.length) continue;
        // Passage à une ville voisine : une page l'annonce.
        if (cur !== city) html += nextCitySlide(shown || city, cur, pend.length, !shown);
      }
      const take = pend.splice(0, 10);
      take.forEach((id) => seen.add(id));
      html += (await docsFor(take)).map((x) => artSlide(x, cur, cur !== city)).join("");
      shown = cur;
    }
    if (!o.isConnected) return;
    if (sc.children.length === 1 && !sc.children[0].dataset.city) sc.innerHTML = "";
    const before = sc.children.length;
    sc.insertAdjacentHTML("beforeend", html);
    for (const el of [...sc.children].slice(before)) io.observe(el);
    busy = false;
  }
  more();
}
// L'onglet « En bref » : depuis le fil, tout de suite ; d'ailleurs, on revient au fil puis on l'ouvre dès qu'il est chargé.
function openEnBref() {
  const f = state.route?.view === "feed" ? state.feeds.get(feedKey(state.route)) : null;
  if (f?.stories.length && !state.panel) { openShorts(); return; }
  // Le fil s'affiche (parfois un instant plus tard, avec la transition) : il ouvrira En bref dès qu'il a des histoires.
  state.enBrefPending = true;
  go(href({}));
}
function closeShorts() {
  const o = $("#shorts");
  if (!o) return;
  o._io?.disconnect();
  o.classList.remove("on");
  document.body.classList.remove("shorts-open");
  setTimeout(() => o.remove(), 220);
}
addEventListener("keydown", (e) => {
  if (!$("#shorts")) return;
  if (e.key === "Escape") closeShorts();
  if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "j" || e.key === "k") {
    e.preventDefault();
    const sc = $("#shSc");
    sc?.scrollBy({ top: (e.key === "ArrowDown" || e.key === "j" ? 1 : -1) * sc.clientHeight, behavior: "smooth" });
  }
});

/* ---------- Préférences : taille du texte, ville, rubriques préférées ---------- */
const SCALES = [[0.92, "Petit"], [1, "Normal"], [1.12, "Grand"], [1.25, "Très grand"]];
const prefs = {
  get scale() { const v = store.get("scale", ""); return v ? Number(v) || 1 : iosTextRatio() || 1; },
  get city() { return store.get("city", ""); },
  get cityLabel() { return store.get("city") ? store.get("cityLabel", "") || CITIES[store.get("city")]?.label || "" : ""; },
  get cats() { try { return JSON.parse(store.get("prefCats", "[]")); } catch { return []; } },
};
const applyScale = () => document.documentElement.style.setProperty("--scale", String(prefs.scale));
applyScale();

// Les villes et régions du Québec : mots qui les nomment et médias régionaux.
const CITIES = {
  montreal: { label: "Montréal", words: ["montreal", "montrealais", "ville de laval", "longueuil", "rive-sud", "rive-nord", "plateau mont-royal", "rosemont", "verdun", "lasalle", "ahuntsic", "westmount", "saint-laurent", "hochelaga", "villeray", "stm", "brossard"], domains: ["montrealgazette.com", "mtlblog.com", "24heures.ca"] },
  quebec: { label: "Québec (ville)", words: ["ville de quebec", "capitale-nationale", "levis", "sainte-foy", "beauport", "charlesbourg", "limoilou", "vieux-quebec", "saint-roch", "rtc", "bruno marchand", "tramway de quebec"], domains: ["lesoleil.com", "quebechebdo.com"] },
  gatineau: { label: "Gatineau et Outaouais", words: ["gatineau", "outaouais", "aylmer", "hull", "ottawa"], domains: ["ledroit.com"] },
  sherbrooke: { label: "Sherbrooke et Estrie", words: ["sherbrooke", "estrie", "magog", "coaticook"], domains: ["latribune.ca"] },
  troisrivieres: { label: "Trois-Rivières et Mauricie", words: ["trois-rivieres", "mauricie", "shawinigan", "becancour"], domains: ["lenouvelliste.ca"] },
  saguenay: { label: "Saguenay–Lac-Saint-Jean", words: ["saguenay", "chicoutimi", "jonquiere", "lac-saint-jean", "alma", "roberval", "dolbeau"], domains: ["lequotidien.com"] },
  monteregie: { label: "Montérégie", words: ["monteregie", "saint-jean-sur-richelieu", "granby", "saint-hyacinthe", "chateauguay", "vaudreuil", "sorel"], domains: ["lavoixdelest.ca"] },
  laurentides: { label: "Laurentides et Lanaudière", words: ["laurentides", "saint-jerome", "mirabel", "mont-tremblant", "lanaudiere", "joliette", "terrebonne", "repentigny"], domains: [] },
  bsl: { label: "Bas-Saint-Laurent et Gaspésie", words: ["rimouski", "bas-saint-laurent", "gaspesie", "matane", "riviere-du-loup", "iles-de-la-madeleine"], domains: [] },
  abitibi: { label: "Abitibi-Témiscamingue", words: ["abitibi", "rouyn-noranda", "val-d'or", "temiscamingue", "amos"], domains: [] },
  cotenord: { label: "Côte-Nord", words: ["cote-nord", "sept-iles", "baie-comeau", "havre-saint-pierre"], domains: [] },
};
const storyFold = (s) => s._fold || (s._fold = foldText(`${s.title} ${s.summary || ""} ${s.articles.map((a) => a.title).join(" ")}`));

// « Ma ville » : les histoires qui nomment la ville choisie ou viennent de ses médias.
function localScore(s, ctx = null) {
  const c = ctx || CITIES[prefs.city];
  if (!c) return 0;
  const t = storyFold(s);
  const hit = c.words.some((w) => hasWord(t, w)) || s.articles.some((a) => c.domains.includes(a.domain));
  return hit ? 1 + Math.max(0, 48 - (s.age || 0)) / 48 : 0;
}
// « Pour toi » : sujets et médias suivis, rubriques préférées, médias que tu lis souvent.
function forYouScorer(villeCtx = null) {
  const tps = topics.list().map((t) => parseQuery(t));
  const fol = new Set(follows.list().map((x) => x.d));
  const cats = new Set(prefs.cats);
  const readN = new Map();
  for (const r of reads.list().slice(-200)) readN.set(r.d, (readN.get(r.d) || 0) + 1);
  return (s) => {
    let boost = 0;
    if (tps.some((pq) => matchQuery(storyFold(s), pq))) boost += 3;
    if (s.articles.some((a) => fol.has(a.domain))) boost += 2;
    if (s.categories.some((c) => cats.has(c))) boost += 1.5;
    if (prefs.city && localScore(s, villeCtx)) boost += 1.5;
    boost += Math.min(1.5, s.articles.reduce((n, a) => n + (readN.get(a.domain) ? 0.3 : 0), 0));
    return boost > 0 ? (s.scores.essentiel || 0.05) * (1 + boost) : 0;
  };
}
const hasPrefs = () => topics.list().length || follows.list().length || prefs.cats.length || prefs.city || reads.list().length >= 5;

/* ---------- Réglages ---------- */
function openSettings() {
  const theme = store.get("theme", "dark");
  const regionOpts = REGIONS.map(([v, l]) => `<option value="${v}" ${v === state.region ? "selected" : ""}>${esc(l)}</option>`).join("");
  openModal(`<div class="modal-pad settings">
    <div class="kicker">Prisme</div>
    <h2>Réglages</h2>
    <section><h3>Taille du texte</h3>
      <div class="seg seg-big" role="group" aria-label="Taille du texte">${SCALES.map(([v, l]) => `<button type="button" data-scale="${v}" aria-pressed="${prefs.scale === v}"><span style="font-size:${Math.round(15 * v)}px">A</span>${l}</button>`).join("")}</div>
      <p class="set-preview">Voici à quoi ressemble le texte des histoires.</p></section>
    <section><h3>Langue de l'app</h3>
      <div class="seg seg-big" role="group"><button type="button" data-lang-set="fr" aria-pressed="${LANG === "fr"}">Français</button><button type="button" data-lang-set="en" aria-pressed="${LANG === "en"}">English</button></div></section>
    <section><h3>Thème</h3>
      <div class="seg seg-big" role="group">${[["light", "Clair"], ["dark", "Sombre"], ["oled", "Noir (OLED)"], ["auto", "Automatique"]].map(([v, l]) => `<button type="button" data-theme-set="${v}" aria-pressed="${theme === v}">${l}</button>`).join("")}</div></section>
    <section><h3>Mon édition</h3><select id="setRegion" class="set-select">${regionOpts}</select></section>
    <section><h3>Ma ville <small>pour le fil « Ma ville »</small></h3>
      <input id="setCity" class="set-select" list="villesList" placeholder="Tape le nom de ta ville…" autocomplete="off"><datalist id="villesList"></datalist>
      <p class="note" id="setCityNote" style="margin:6px 0 0"></p></section>
    <section><h3>Ce qui m'intéresse <small>pour le fil « Pour toi »</small></h3>
      <div class="chips">${CATS.slice(1).map(([c, l]) => `<button class="chip" type="button" data-pcat="${c}" aria-pressed="${prefs.cats.includes(c)}">${esc(l)}</button>`).join("")}</div></section>
    ${settingsExtra()}
    <section class="set-foot"><button class="btn ghost" type="button" id="setOnboard">Revoir l'accueil</button></section>
  </div>`, true);
  const box = $("#modalBody");
  box.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.scale) { store.set("scale", b.dataset.scale); applyScale(); $$("[data-scale]", box).forEach((x) => x.setAttribute("aria-pressed", x === b)); }
    if (b.dataset.langSet && b.dataset.langSet !== LANG) setLang(b.dataset.langSet);
    if (b.dataset.themeSet) {
      const v = b.dataset.themeSet;
      store.set("theme", v);
      if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
      syncThemeColor();
      $$("[data-theme-set]", box).forEach((x) => x.setAttribute("aria-pressed", x === b));
    }
    if (b.dataset.pcat) {
      const l = prefs.cats, c = b.dataset.pcat;
      store.set("prefCats", JSON.stringify(l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
      b.setAttribute("aria-pressed", !l.includes(c));
      state.feeds.clear();
    }
    if (b.id === "setOnboard") { closeLayer("#modal"); setTimeout(openOnboarding, 250); }
  };
  $("#setRegion").onchange = (e) => { state.region = e.target.value; store.set("region", state.region); closeLayer("#modal"); go(href({})); };
  villesData().then((V) => {
    cityAuto($("#setCity"), V);
    const cur = V.bySlug.get(prefs.city);
    if (cur) { $("#setCity").value = villeLabel(cur); $("#setCityNote").textContent = villeWhere(cur); }
    $("#setCity").onchange = (e) => {
      const f = foldText(e.target.value).trim();
      const hit = V.list.find((x) => foldText(villeLabel(x)) === f) || matchVilles(V, e.target.value, 1)[0];
      if (!hit) { $("#setCityNote").textContent = "Ville introuvable : choisis-la dans la liste."; return; }
      store.set("city", hit.s); store.set("cityLabel", hit.n); state.feeds.clear();
      e.target.value = villeLabel(hit); $("#setCityNote").textContent = `✓ ${villeWhere(hit)}`;
      if (state.route.view === "feed") render();
    };
  }).catch(() => {});
}

/* ---------- Accueil, la première fois ---------- */
function openOnboarding() {
  let step = 0;
  store.set("onboarded", "1"); // vu une fois, même fermé par ✕ ou en glissant
  const choice = { region: state.region, city: prefs.city, cityLabel: prefs.cityLabel, cats: new Set(prefs.cats), scale: prefs.scale };
  const steps = [
    () => `<div class="ob-hero"><svg class="ob-logo" viewBox="0 0 64 40" aria-hidden="true"><path d="M1 23.5 L21 21" style="stroke:var(--ink)"/><path d="M27 4 L41 34 H13 Z" style="stroke:var(--ink)"/><path d="M32.5 18.5 L63 7" style="stroke:var(--b-l2)"/><path d="M33.3 20 L63 14" style="stroke:var(--b-l1)"/><path d="M34 21.5 L63 21" style="stroke:var(--b-c)"/><path d="M34.7 23 L63 28" style="stroke:var(--b-r1)"/><path d="M35.4 24.5 L63 35" style="stroke:var(--b-r2)"/></svg>
        <h2>Bienvenue dans Prisme</h2>
        <ul class="ob-points">
          <li><b>Les nouvelles de partout</b>, lues directement dans près de 3 000 médias.</li>
          <li><b>Chaque histoire montre qui en parle</b> : la gauche, le centre, la droite.</li>
          <li><b>Et à qui appartiennent les médias.</b> Gratuit, sans pub, sans compte.</li>
        </ul>
        <div class="ob-demo" aria-label="Exemple : 12 médias en parlent, 4 à gauche, 5 au centre, 3 à droite">
          <span class="ob-demo-t">Sous chaque nouvelle, cette barre :</span>
          <span class="c2-bar ob-bar"><i class="l" style="flex:4"></i><i class="c" style="flex:5"></i><i class="r" style="flex:3"></i></span>
          <span class="ob-demo-l"><span><i class="l"></i>Gauche 4</span><span><i class="c"></i>Centre 5</span><span><i class="r"></i>Droite 3</span></span>
          <span class="ob-demo-t">Quand un côté n'en parle presque pas, c'est un <b class="ck-blind r">Angle mort</b>.</span>
        </div></div>`,
    // Deux écrans seulement : bienvenue, puis ta ville (en un toucher avec ta position). Le reste se règle plus tard.
    () => `<h2>Ta ville</h2><p class="ob-sub">Pour ses nouvelles, même celles des petits médias locaux, et sa météo. Facultatif.</p>
        <button class="btn ob-geo" type="button" data-ob="geo">📍 Utiliser ma position</button>
        <p class="ob-geo-msg" id="obGeoMsg" hidden></p>
        <h3 class="ob-h3">Ou tape son nom</h3>
        <input class="set-select" id="obCity" list="obVilles" placeholder="ex. Victoriaville" autocomplete="off" value="${esc(choice.cityLabel || "")}"><datalist id="obVilles"></datalist>
        <div class="ob-grid ob-small" style="margin-top:8px">${[["montreal", "Montréal"], ["quebec", "Québec"], ["laval", "Laval"], ["gatineau", "Gatineau"], ["longueuil", "Longueuil"], ["sherbrooke", "Sherbrooke"], ["saguenay", "Saguenay"], ["levis", "Lévis"]].map(([k, l]) => `<button type="button" data-ob-city="${k}" data-label="${l}" aria-pressed="${choice.city === k}">${l}</button>`).join("")}</div>
        <p class="note ob-geo-note">Ta position sert seulement à trouver ta ville (arrondie à environ 1 km, envoyée à BigDataCloud) ; elle n'est jamais gardée.</p>`,
  ];
  const draw = () => {
    openModal(`<div class="modal-pad ob">
      <div class="ob-dots">${steps.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("")}</div>
      <div class="ob-body">${steps[step]()}</div>
      <div class="ob-nav">${step ? `<button class="btn ghost" type="button" data-ob="back">Retour</button>` : `<button class="btn ghost" type="button" data-ob="skip">Passer</button>`}
        <button class="btn" type="button" data-ob="next">${step === steps.length - 1 ? "C'est parti" : "Continuer"}</button></div>
    </div>`, true);
    $("#modalBody").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.obRegion) { choice.region = b.dataset.obRegion; if (!["qc", "ca"].includes(choice.region)) { choice.city = ""; choice.cityLabel = ""; } draw(); }
      else if (b.dataset.obCity) { choice.city = choice.city === b.dataset.obCity ? "" : b.dataset.obCity; choice.cityLabel = choice.city ? b.dataset.label : ""; draw(); }
      else if (b.dataset.obCat) { choice.cats.has(b.dataset.obCat) ? choice.cats.delete(b.dataset.obCat) : choice.cats.add(b.dataset.obCat); b.setAttribute("aria-pressed", choice.cats.has(b.dataset.obCat)); }
      else if (b.dataset.obScale) { choice.scale = Number(b.dataset.obScale); draw(); }
      else if (b.dataset.ob === "geo") findMyCity(b, (hit) => { choice.city = hit.s; choice.cityLabel = villeLabel(hit); choice.pr = hit.pr; const oc = $("#obCity"); if (oc) oc.value = choice.cityLabel; $$("[data-ob-city]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.obCity === hit.s)); });
      else if (b.dataset.ob === "back") { step--; draw(); }
      else if (b.dataset.ob === "skip") finish();
      else if (b.dataset.ob === "next") { if (step < steps.length - 1) { step++; draw(); } else finish(); }
    };
    // Choisir n'importe quelle ville en tapant son nom.
    const oc = $("#obCity");
    if (oc) villesData().then((V) => {
      cityAuto(oc, V);
      oc.onchange = () => {
        const f = foldText(oc.value).trim();
        const hit = V.list.find((x) => foldText(villeLabel(x)) === f) || matchVilles(V, oc.value, 1)[0];
        if (hit) { choice.city = hit.s; choice.cityLabel = villeLabel(hit); choice.pr = hit.pr; oc.value = choice.cityLabel; $$("[data-ob-city]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.obCity === hit.s)); }
      };
    }).catch(() => {});
  };
  const finish = () => {
    store.set("onboarded", "1");
    store.set("city", choice.city);
    store.set("cityLabel", choice.cityLabel || "");
    state.feeds.clear();
    closeLayer("#modal");
    // L'édition suit la ville : Québec pour une ville du Québec, Canada pour une ville d'une autre province.
    if (choice.pr && choice.pr !== "QC" && state.region === "qc") choice.region = "ca";
    if (choice.region !== state.region) { state.region = choice.region; store.set("region", choice.region); }
    go(href({}));
  };
  draw();
}

/* ---------- Écouter (voix du téléphone, gratuite) ---------- */
const canSpeak = "speechSynthesis" in window;
// iPhone : la voix est coupée en mode silencieux. On demande à l'iPhone de traiter Prisme comme un lecteur
// (comme un balado), en jouant un son muet d'une fraction de seconde au moment du toucher.
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* Safari plus ancien */ }
  try {
    // Un dixième de seconde de silence (WAV fabriqué ici, rien à télécharger).
    const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
    a.setAttribute("playsinline", "");
    a.play().catch(() => {});
  } catch { /* sans audio */ }
}
let speakBtn = null;
function speak(parts, btn) {
  if (!canSpeak) { toast("La lecture à voix haute n'est pas offerte sur cet appareil."); return; }
  const setBtn = (b, on) => { if (!b) return; b.setAttribute("aria-pressed", on); const sp = $("span", b); if (sp) sp.textContent = on ? "Arrêter" : "Écouter"; };
  // Toucher « Arrêter » arrête ; toucher un autre « Écouter » passe à cette histoire-là.
  const drop = (b) => { setBtn(b, false); if (b?.dataset.float) b.remove(); };
  const wasMine = btn && speakBtn === btn;
  if (speakBtn) { speechSynthesis.cancel(); drop(speakBtn); speakBtn = null; if (wasMine) return; }
  // Sans bouton sous le doigt (menu de l'appui long) : un bouton « Arrêter » flottant.
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button"; btn.className = "speak-stop"; btn.dataset.float = "1";
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg><span>Arrêter</span>';
    btn.onclick = () => { speechSynthesis.cancel(); btn.remove(); if (speakBtn === btn) speakBtn = null; };
    document.body.appendChild(btn);
  }
  unlockAudio();
  speechSynthesis.cancel(); // iPhone : vide une lecture restée coincée
  const want = LANG === "en" ? "en" : "fr";
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((x) => x.lang.toLowerCase().replace("_", "-") === (want === "fr" ? "fr-ca" : "en-ca")) || voices.find((x) => x.lang.toLowerCase().startsWith(want));
  // Des phrases courtes : l'iPhone coupe parfois les longs textes en plein milieu.
  const list = parts.filter(Boolean).map((t) => String(t).replace(/\s+/g, " ").trim()).filter(Boolean)
    .flatMap((t) => t.match(/[^.!?…]+[.!?…]*\s*/g) || [t]).map((t) => t.trim()).filter(Boolean);
  if (!list.length) { if (btn.dataset.float) btn.remove(); return; }
  let started = false;
  speakBtn = btn;
  list.forEach((t, i) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = voice?.lang || (want === "fr" ? "fr-CA" : "en-CA");
    if (voice) u.voice = voice;
    u.rate = 1;
    u.onstart = () => { started = true; };
    if (i === list.length - 1) u.onend = () => { if (speakBtn === btn) { drop(btn); speakBtn = null; } };
    u.onerror = (ev) => { if (ev.error !== "interrupted" && ev.error !== "canceled" && speakBtn === btn) { drop(btn); speakBtn = null; } };
    speechSynthesis.speak(u);
  });
  speechSynthesis.resume();
  setBtn(btn, true);
  toast("Lecture à voix haute… Touche « Arrêter » pour couper.");
  // Rien ne joue après 3 secondes : on le dit, avec la cause la plus fréquente.
  setTimeout(() => { if (!started && speakBtn === btn) toast("Tu n'entends rien ? Monte le volume, et sur iPhone vérifie que le mode silencieux est désactivé."); }, 3000);
}
if (canSpeak) { speechSynthesis.getVoices(); addEventListener("pagehide", () => speechSynthesis.cancel()); }
const listenBtn = (id) => `<button class="act act-l" type="button" data-listen="${esc(id)}" aria-pressed="false" title="Écouter">${'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'}<span>Écouter</span></button>`;
function storySpeech(s) {
  const sd = sides(s.counts);
  const parts = [s.titleFr || s.title];
  const ai = s.ai || state.summaries?.[s.id];
  parts.push(ai?.summary || s.summary || "");
  parts.push(`${plural(s.sources, "média")} en parlent : ${sd.left} à gauche, ${sd.center} au centre, ${sd.right} à droite.`);
  if (ai?.left) parts.push(`À gauche : ${ai.left}`);
  if (ai?.right) parts.push(`À droite : ${ai.right}`);
  if (s.blindspot) parts.push(`Angle mort : les médias de ${s.blindspot === "right" ? "droite" : "gauche"} en parlent très peu.`);
  return parts;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-listen]");
  if (!b) return;
  const id = b.dataset.listen;
  if (id === "matin") { speak(state.matinSpeech || [], b); return; }
  if (id === "express") { speak(state.expressSpeech || [], b); return; }
  const s = state.stories.get(id);
  if (s) speak(storySpeech(s), b);
});

/* ---------- Recherche à la voix ---------- */
{
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("#micBtn");
  if (SR && mic) {
    mic.hidden = false;
    $("#search").classList.add("has-mic");
    mic.onclick = () => {
      const rec = new SR();
      rec.lang = LANG === "en" ? "en-CA" : "fr-CA";
      rec.interimResults = true;
      const input = $("#search input");
      mic.classList.add("on");
      input.placeholder = "Je t'écoute…";
      rec.onresult = (ev) => {
        const t = [...ev.results].map((r) => r[0].transcript).join("");
        input.value = t;
        if (ev.results[ev.results.length - 1].isFinal && t.trim().length >= 2) { rec.stop(); recent.add(t.trim()); go(href({ q: t.trim() })); }
      };
      const end = () => { mic.classList.remove("on"); input.placeholder = "Un sujet, un média…"; };
      rec.onend = end;
      rec.onerror = (ev) => { end(); if (ev.error === "not-allowed") toast("Autorise le micro pour chercher à la voix."); };
      try { rec.start(); } catch { end(); }
    };
  }
}

/* ---------- Gestes sur téléphone : glisser entre rubriques, tirer pour rafraîchir ---------- */
{
  let sx = 0, sy = 0, t0 = 0, pulling = false, blocked = false;
  const ptr = document.createElement("div");
  ptr.className = "ptr";
  ptr.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4"/></svg>';
  document.body.appendChild(ptr);
  // Tirer un peu : la recherche ; tirer plus loin : rafraîchir. Une étiquette dit ce qui va se passer.
  const ptrL = document.createElement("div");
  ptrL.className = "ptr-l";
  document.body.appendChild(ptrL);
  let zone = "";
  const NOSWIPE = "#feed .story, .sides-swipe, #smenu, .hcard, #selBar, .lenses, .topics, .cats, .wf-row, .o-chips, .o-days, .tl, .vgrid, .pack-wrap, input, select, textarea, .modal, .drawer, .tabs, .seg";
  addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now();
    blocked = !!e.target.closest(NOSWIPE);
    pulling = scrollY <= 0 && !blocked && state.route?.view === "feed";
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - sy;
    if (dy > 0 && scrollY <= 0) {
      const p = Math.min(1, dy / 110); ptr.style.opacity = p; ptr.style.transform = `translate(-50%, ${Math.min(dy, 110) * 0.6}px) rotate(${p * 270}deg)`; ptr.classList.toggle("ready", p >= 1);
      const z = p >= 1 ? "refresh" : dy > 45 ? "search" : "";
      if (z !== zone) { zone = z; ptrL.textContent = z === "refresh" ? tr("Relâche pour rafraîchir") : z === "search" ? tr("Relâche pour chercher · tire plus pour rafraîchir") : ""; ptrL.classList.toggle("on", !!z); if (z) buzz(6); }
      ptrL.style.transform = `translate(-50%, ${Math.min(dy, 110) * 0.6}px)`;
    }
  }, { passive: true });
  addEventListener("touchend", (e) => {
    const x = e.changedTouches[0].clientX, y = e.changedTouches[0].clientY;
    const dx = x - sx, dy = y - sy;
    if (pulling) {
      const ready = ptr.classList.contains("ready"), z = zone;
      ptr.style.opacity = ""; ptr.style.transform = ""; ptr.classList.remove("ready");
      ptrL.classList.remove("on"); ptrL.style.transform = ""; zone = "";
      pulling = false;
      if (ready) { buzz(15); dataCache.clear(); state.feeds.clear(); toast("Fil mis à jour"); render(); return; }
      if (z === "search") { const b = $("#searchBtn"); if (b && getComputedStyle(b).display !== "none") b.click(); else $("#search input").focus({ preventScroll: true }); return; }
    }
    // Glisser à gauche ou à droite : rubrique suivante ou précédente (fil seulement). Depuis le bord gauche : c'est « Retour ».
    if (sx < 24) return;
    if (blocked || state.route?.view !== "feed" || innerWidth > 1100) return;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45 || Date.now() - t0 > 600) return;
    const i = CATS.findIndex(([c]) => c === state.route.cat);
    const next = CATS[i + (dx < 0 ? 1 : -1)];
    if (!next) return;
    go(href({ cat: next[0], lens: state.route.lens }));
  }, { passive: true });
}

/* ---------- Comparer deux médias ---------- */
async function viewCompare(v, route) {
  document.title = "Comparer deux médias — Prisme";
  const pick = (k, d) => `<label class="cmp-pick"><span class="label">${k === "a" ? "Premier média" : "Deuxième média"}</span>
      <input type="search" data-cmp="${k}" placeholder="ex. ${k === "a" ? "La Presse" : "Le Journal de Montréal"}" value="${esc(d?.name || "")}" autocomplete="off"><div class="cmp-sug" data-sug="${k}" hidden></div></label>`;
  const meta = await searchBase().catch(() => null);
  const find = (dom) => meta?.D.find((x) => x.domain === dom) || null;
  const A = find(route.a), B = find(route.b);
  v.innerHTML = `<header class="page-h"><div class="kicker">Comparer</div><h1>Deux médias, côte à côte</h1>
      <p>Choisis deux médias : Prisme montre comment chacun titre les mêmes histoires, ce que l'un couvre et pas l'autre, et leurs sujets.</p></header>
    <div class="cmp-picks">${pick("a", A)}<span class="cmp-vs">vs</span>${pick("b", B)}</div>
    <div id="cmpBody">${A && B ? '<div class="loader">Comparaison…</div>' : `<div class="empty"><p>Tape le nom de deux médias ci-dessus.</p>${meta ? `<div class="chips">${[["lapresse.ca", "journaldemontreal.com"], ["ledevoir.com", "tvanouvelles.ca"], ["cbc.ca", "nationalpost.com"], ["foxnews.com", "cnn.com"]].filter(([a, b]) => find(a) && find(b)).map(([a, b]) => `<a class="chip" href="${href({ v: "comparer" })}&a=${a}&b=${b}" data-nav>${esc(find(a).name)} vs ${esc(find(b).name)}</a>`).join("")}</div>` : ""}</div>`}</div>`;
  // Choix des médias avec suggestions.
  for (const input of $$("[data-cmp]", v)) {
    const k = input.dataset.cmp, box = $(`[data-sug="${k}"]`, v);
    input.oninput = () => {
      const hits = meta ? matchOutlets(meta.D, input.value).slice(0, 6) : [];
      box.hidden = !hits.length;
      box.innerHTML = hits.map((d) => `<button type="button" data-dom="${esc(d.domain)}">${favicon(d.domain, d.name)}<span>${esc(d.name)}</span>${badge(d.media)}</button>`).join("");
    };
    box.onclick = (e) => {
      const b = e.target.closest("[data-dom]");
      if (!b) return;
      const p = new URLSearchParams(location.search);
      p.set("v", "comparer"); p.set(k, b.dataset.dom);
      go(`?${p}`);
    };
  }
  if (!A || !B) return;
  const [da, db, ed, mo] = await Promise.all([outletArticles(A.domain), outletArticles(B.domain), edition(state.region).catch(() => null), edition("monde").catch(() => null)]);
  if (state.route.view !== "comparer") return;
  const stories = new Map();
  for (const s of [...(ed?.stories || []), ...(mo?.stories || [])]) if (s.sources >= 2 && !stories.has(s.id)) stories.set(s.id, s);
  const both = [], onlyA = [], onlyB = [];
  for (const s of stories.values()) {
    const a = s.articles.find((x) => x.domain === A.domain), b = s.articles.find((x) => x.domain === B.domain);
    if (a && b) both.push({ s, a, b }); else if (a) onlyA.push(s); else if (b) onlyB.push(s);
  }
  for (const s of stories.values()) state.stories.set(s.id, s);
  const subjA = outletSubjects(da?.items || [], 10), subjB = outletSubjects(db?.items || [], 10);
  const card = (D, data, subj) => `<div class="cmp-card">
      <a class="cmp-name" href="${href({ m: D.domain })}" data-nav>${favicon(D.domain, D.name)}<b>${esc(D.name)}</b></a>
      <div class="cmp-meta">${badge(D.media)}${D.media.known ? `<span>${esc(D.media.owner)}</span>` : ""}</div>
      <div class="cmp-num"><b>${data?.items.length || 0}</b><small>articles en ${data?.days > 2 ? "7 jours" : "48 h"}</small></div>
      <div class="chips">${subj.map(([w, c]) => `<span class="chip">${esc(w)} <span class="muted">${c}</span></span>`).join("") || '<span class="muted">—</span>'}</div>
    </div>`;
  const sRow = (s) => `<li><a href="${href({ h: s.id })}" data-nav data-no-tr>${esc(s.titleFr || s.title)}</a><small>${plural(s.sources, "média")}</small></li>`;
  $("#cmpBody").innerHTML = `<div class="cmp-cards">${card(A, da, subjA)}${card(B, db, subjB)}</div>
    <section class="sec"><h2 class="block-h">Les mêmes histoires, deux titres <small>${plural(both.length, "histoire")}</small></h2>
      ${both.length ? `<ul class="cmp-both">${both.slice(0, 20).map(({ s, a, b }) => `<li><a class="cmp-story" href="${href({ h: s.id })}" data-nav>${plural(s.sources, "média")} en parlent →</a>
        <div class="cmp-two"><div><span class="label">${esc(A.name)}</span>${artLink(a, "t")}</div><div><span class="label">${esc(B.name)}</span>${artLink(b, "t")}</div></div></li>`).join("")}</ul>`
        : `<p class="note">Aucune histoire commune dans les éditions en cours.</p>`}</section>
    <div class="cmp-only">
      <section class="sec"><h2 class="block-h">Seulement chez ${esc(A.name)} <small>${onlyA.length}</small></h2><ul class="cmp-list">${onlyA.sort((x, y) => y.sources - x.sources).slice(0, 10).map(sRow).join("") || '<li class="muted">—</li>'}</ul></section>
      <section class="sec"><h2 class="block-h">Seulement chez ${esc(B.name)} <small>${onlyB.length}</small></h2><ul class="cmp-list">${onlyB.sort((x, y) => y.sources - x.sources).slice(0, 10).map(sRow).join("") || '<li class="muted">—</li>'}</ul></section>
    </div>`;
}

/* ---------- Partager une histoire en image (pour Messenger, Facebook…) ---------- */
async function storyImage(s) {
  try { await Promise.all([document.fonts.load("700 60px Newsreader"), document.fonts.load("600 30px Inter"), document.fonts.load("500 26px 'IBM Plex Mono'")]); } catch { /* polices par défaut */ }
  const W = 1080, H = 1500, P = 80;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  g.fillStyle = "#F4F2EC"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#121212"; g.fillRect(0, 0, W, 130);
  const cols = ["--b-l2", "--b-l1", "--b-c", "--b-r1", "--b-r2"].map(css);
  cols.forEach((col, i) => { g.fillStyle = col; g.fillRect((W / 5) * i, 130, W / 5, 10); });
  g.fillStyle = "#F2EFE8"; g.font = "700 58px Newsreader, Georgia, serif"; g.fillText("Prisme", P, 88);
  g.font = "500 24px 'IBM Plex Mono', monospace"; g.fillStyle = "#C9C5BC"; g.textAlign = "right"; g.fillText("QUI EN PARLE, ET DE QUEL CÔTÉ", W - P, 84); g.textAlign = "left";
  let y = 230;
  g.fillStyle = "#6E6A62"; g.font = "500 28px 'IBM Plex Mono', monospace";
  g.fillText(`${plural(s.sources, "MÉDIA", "MÉDIAS")} EN PARLENT`, P, y);
  y += 40;
  // Titre, coupé en lignes.
  g.fillStyle = "#141414"; g.font = "700 66px Newsreader, Georgia, serif";
  const words = (s.titleFr || s.title).split(/\s+/);
  let line = "";
  const lines = [];
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > W - 2 * P) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  for (const l of lines.slice(0, 7)) { y += 78; g.fillText(l, P, y); }
  if (lines.length > 7) { g.fillText("…", P, y + 60); y += 60; }
  // La barre gauche/centre/droite.
  y += 80;
  const sd = sides(s.counts);
  const parts = [["Gauche", sd.left, css("--b-l2")], ["Centre", sd.center, css("--b-c")], ["Droite", sd.right, css("--b-r2")]].filter((p) => p[1]);
  const tot = parts.reduce((a, p) => a + p[1], 0);
  if (tot) {
    let x = P;
    for (const [l, n, col] of parts) {
      const w = ((W - 2 * P) * n) / tot;
      g.fillStyle = col; g.fillRect(x, y, w - 4, 70);
      g.fillStyle = l === "Centre" ? "#1E1D1A" : "#fff"; g.font = "600 26px 'IBM Plex Mono', monospace";
      if (w > 150) g.fillText(`${l.toUpperCase()} ${Math.round((n / tot) * 100)} %`, x + 18, y + 45);
      x += w;
    }
    y += 120;
  }
  // Les médias.
  const names = [...new Set(s.articles.map((a) => a.sourceName))];
  g.fillStyle = "#3A3833"; g.font = "400 32px -apple-system, 'Inter', 'Segoe UI', sans-serif";
  const cov = `Couvert par ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` et ${s.sources - 4} autres` : ""}`;
  line = ""; let n = 0;
  for (const w of cov.split(" ")) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > W - 2 * P) { g.fillText(line, P, y); y += 44; line = w; n++; if (n > 2) break; } else line = t; }
  if (n <= 2) g.fillText(line, P, y);
  // Pied, juste sous le contenu ; l'image est ensuite coupée à la bonne hauteur.
  const F = Math.max(y + 80, 760);
  g.fillStyle = "#121212"; g.fillRect(0, F, W, 120);
  g.fillStyle = "#F2EFE8"; g.font = "600 32px -apple-system, 'Inter', 'Segoe UI', sans-serif"; g.fillText("Voir tous les côtés sur Prisme", P, F + 68);
  g.fillStyle = "#C9C5BC"; g.font = "500 26px 'IBM Plex Mono', monospace"; g.textAlign = "right"; g.fillText("axe414.github.io/prisme", W - P, F + 68); g.textAlign = "left";
  const out = document.createElement("canvas");
  out.width = W; out.height = Math.min(H, F + 120);
  out.getContext("2d").drawImage(c, 0, 0);
  return new Promise((ok) => out.toBlob(ok, "image/png"));
}
async function shareStoryImage(s) {
  toast("Préparation de l'image…");
  const blob = await storyImage(s);
  const file = new File([blob], `prisme-${s.id}.png`, { type: "image/png" });
  const url = storyShare(s).url; // la page de partage : l'aperçu montre la photo et la couverture
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: s.titleFr || s.title, text: `${s.titleFr || s.title} — ${url}` }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Image enregistrée : tu peux l'envoyer dans Messenger.");
}
/* ---------- Titres anglais traduits en français (préparés par le robot) ---------- */
async function withTitlesFr(stories) {
  const [tr, sums] = await Promise.all([
    LANG === "fr" ? dataJson("translations.json", 30 * 60e3).catch(() => ({})) : {},
    dataJson("summaries.json").catch(() => ({})),
  ]);
  state.summaries = sums;
  for (const s of stories) {
    if (!s.titleFr && tr[s.title]) s.titleFr = tr[s.title];
    if (sums[s.id]?.summary) s.ai = sums[s.id];
  }
  return stories;
}
// Le chapeau d'une histoire dans le fil : le résumé neutre de l'IA s'il existe, sinon celui d'un média.
const aiTag = `<span class="ai-tag" title="Résumé neutre écrit par une IA à partir des titres de tous les médias">✦ Résumé IA</span>`;
function dekOf(s, lead = false) {
  if (s.ai?.summary) return `<p class="dek dek-ai"><span data-no-tr>${esc(s.ai.summary)}</span></p>${lead ? `<p class="dek-src">✦ Écrit par une IA à partir des titres de ${plural(s.sources, "média")}, de tous les côtés.</p>` : ""}`;
  if (!s.summary) return "";
  return `<p class="dek" data-no-tr>${esc(s.summary)}</p>${lead ? `<p class="dek-src">Résumé : ${esc(s.summarySource || "")}</p>` : ""}`;
}
const titleOf = (s) => esc(s.titleFr || s.title);
const trTag = (s) => (s.titleFr ? `<span class="trd" title="Titre original : ${esc(s.title)}">traduit</span>` : "");

/* ---------- Les villes : toutes les municipalités du Québec et les villes du Canada ---------- */
const PROV_NAME = { QC: "Québec", ON: "Ontario", BC: "Colombie-Britannique", AB: "Alberta", MB: "Manitoba", SK: "Saskatchewan", NS: "Nouvelle-Écosse", NB: "Nouveau-Brunswick", NL: "Terre-Neuve-et-Labrador", PE: "Île-du-Prince-Édouard", YT: "Yukon", NT: "Territoires du Nord-Ouest", NU: "Nunavut" };
let villesP = null;
function villesData() {
  if (!villesP) villesP = fetch(new URL("villes.json", document.baseURI).href).then((r) => r.json()).then((list) => {
    for (const v of list) { v.f = foldText(v.n); v.short = v.f.replace(/^(ville de |municipalite de |paroisse de )/, ""); }
    return { list, bySlug: new Map(list.map((v) => [v.s, v])) };
  }).catch((e) => { villesP = null; throw e; });
  return villesP;
}
// Les villes qui correspondent à ce qu'on tape, dès 2 lettres : le nom exact, puis les noms qui commencent ainsi,
// puis ceux dont un mot commence ainsi (« rivi » → Trois-Rivières). « St- » et « Ste- » valent « Saint- » et « Sainte- ».
function matchVilles(V, q, n = 5) {
  let f = foldText(q).trim().replace(/\s+/g, " ");
  f = f.replace(/^st(e)?[ .-]+/, (m, e) => (e ? "sainte-" : "saint-"));
  if (f.length < 2) return [];
  const g = f.replace(/ /g, "-");
  // Au Québec, les municipalités québécoises passent devant (Victoriaville avant Victoria), puis les plus peuplées.
  const qc = state.region === "qc" ? (v) => (v.pr === "QC" ? 0 : 1) : () => 0;
  const order = (a, b) => qc(a) - qc(b) || (b.p || 0) - (a.p || 0);
  const exact = (v) => v.f === f || v.f === g;
  const hit = (v) => exact(v) || v.f.startsWith(f) || v.f.startsWith(g) || v.short.startsWith(f)
    || (f.length >= 3 && v.f.split(/[-' ]+/).some((w) => w.startsWith(f)));
  // Le Québec d'abord (dans l'édition Québec), le nom exact ensuite, puis les plus peuplées.
  return V.list.filter(hit).sort((a, b) => qc(a) - qc(b) || exact(b) - exact(a) || order(a, b)).slice(0, n);
}
// Une case « ta ville » avec des suggestions sous le doigt (la liste du navigateur marche mal sur iPhone).
// Choisir une suggestion remplit la case et déclenche son « change » habituel.
function cityAuto(input, V) {
  if (!input || input.dataset.auto) return;
  input.dataset.auto = "1";
  input.removeAttribute("list");
  const box = document.createElement("div");
  box.className = "city-sg"; box.setAttribute("role", "listbox"); box.hidden = true;
  input.insertAdjacentElement("afterend", box);
  const draw = () => {
    const hits = matchVilles(V, input.value, 6);
    box.innerHTML = hits.map((x) => `<button type="button" role="option" data-cs="${esc(x.s)}">${pin}<span><b>${esc(villeLabel(x))}</b><small>${esc(villeWhere(x))}${x.p ? ` · ${x.p.toLocaleString(LOCALE)} hab.` : ""}</small></span></button>`).join("");
    box.hidden = !hits.length || foldText(input.value).trim() === foldText(villeLabel(hits[0])) && hits.length === 1;
  };
  input.addEventListener("input", draw);
  input.addEventListener("focus", () => { if (input.value) draw(); });
  input.addEventListener("blur", () => setTimeout(() => { box.hidden = true; }, 150));
  box.addEventListener("mousedown", (e) => e.preventDefault());
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cs]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const hit = V.bySlug.get(b.dataset.cs);
    input.value = villeLabel(hit);
    box.hidden = true;
    input.dispatchEvent(new Event("change"));
    input.blur();
  });
}
const mrcName = (m) => (!m ? "" : /^(MRC|Communauté|Agglomération|Ville|TÉ|Territoire)/i.test(m) ? m : `MRC ${m}`);
const villeWhere = (v) => (v.pr === "QC" ? `${v.r.replace(/--/g, "–")}${v.m && v.m !== v.n ? ` · ${mrcName(v.m)}` : ""}` : `${PROV_NAME[v.pr] || v.pr}`);
const villeLabel = (v) => `${v.n}${v.pr !== "QC" ? `, ${v.pr}` : ""}`;
// Les mots qui désignent la ville dans un texte (sans accents). « Québec » seul désigne surtout la province.
const villeWords = (v) => (v.s === "quebec" ? ["ville de quebec", "a quebec", "capitale-nationale"] : [v.f]);
const pin = '<svg viewBox="0 0 24 24" aria-hidden="true" class="sg-ico"><path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>';

// La ville choisie pour « Ma ville » : une municipalité (nouveau) ou une région (ancien réglage).
async function myVille() {
  const key = prefs.city;
  if (!key) return null;
  // Une vraie municipalité d'abord (« montreal », « quebec »…), sinon l'ancienne région.
  return (await villesData().catch(() => null))?.bySlug.get(key) || null;
}
const localMedia = () => dataJson("local-media.json", 864e5).catch(() => ({}));

/* ---------- La page d'une ville ---------- */
async function viewVille(v, route) {
  v.innerHTML = `<div class="page-h"><div class="skel" style="height:44px;width:40%;margin-top:10px"></div></div>`;
  const V = await villesData().catch(() => null);
  const city = V?.bySlug.get(route.ville);
  if (state.route.view !== "ville") return;
  if (!city) { v.innerHTML = `<div class="empty"><h3>Ville introuvable.</h3><p><a class="btn" href="${href({ v: "villes" })}" data-nav>Toutes les villes</a></p></div>`; return; }
  document.title = `${city.n} — Prisme`;
  const followed = topics.has(city.n);
  const mine = prefs.city === city.s;
  const near = V.list.filter((x) => x !== city && x.pr === city.pr && (city.m ? x.m === city.m : x.r === city.r)).slice(0, 10);
  const nearRegion = near.length < 6 ? V.list.filter((x) => x !== city && x.pr === city.pr && x.r === city.r && !near.includes(x)).slice(0, 10 - near.length) : [];
  Object.assign(state.wf, { scope: "auto", hours: 0, side: "all", lang: "all", cat: "all", media: "" });
  v.innerHTML = `<header class="ville-top">
      <div class="vt-row"><h1>${esc(villeLabel(city))}</h1>
        <div class="vt-acts">
          <button class="vt-btn" type="button" id="vFollow" aria-pressed="${followed}" title="${followed ? "Ville suivie" : "Suivre cette ville"}">${ico("star")}<span>${followed ? "Suivie" : "Suivre"}</span></button>
          <button class="vt-btn vt-bref" type="button" data-city-bref="${esc(city.s)}" title="Une nouvelle par écran">▶<span>En bref</span></button>
          <button class="vt-btn" type="button" id="vMine" aria-pressed="${mine}" title="C'est ma ville">${pin}<span>${mine ? "Ma ville" : "C'est ma ville"}</span></button>
          ${shareBtn({ title: `${city.n} sur Prisme`, text: `Les nouvelles de ${city.n}`, url: absUrl(href({ ville: city.s })) })}
        </div></div>
      <p class="vt-meta">${city.p ? `${city.p.toLocaleString(LOCALE)} hab. · ` : ""}${esc(villeWhere(city))}<span class="wx" id="vWx"></span></p>
    </header>
    <div class="vm-row" id="vLocal" hidden></div>
    <section id="wide" class="sec v-wide"><div class="loader">Recherche des nouvelles de ${esc(city.n)}…</div></section>
    <section class="sec" id="vStories" hidden></section>
    <details class="sec v-more" id="vMore" hidden></details>
    ${near.length + nearRegion.length ? `<section class="sec"><h2 class="block-h">Villes voisines <small>${esc(city.m ? mrcName(city.m) : city.r.replace(/--/g, "–"))}</small></h2>
      <div class="chips">${[...near, ...nearRegion].map((x) => `<a class="chip" href="${href({ ville: x.s })}" data-nav>${esc(x.n)}</a>`).join("")}</div></section>` : ""}`;
  fillWeather($("#vWx", v), city);
  $("#vFollow", v).onclick = (e) => {
    if (topics.has(city.n)) topics.remove(city.n); else topics.add(city.n);
    const on = topics.has(city.n);
    const b = e.target.closest("button");
    b.setAttribute("aria-pressed", on); $("span", b).textContent = on ? "Suivie" : "Suivre";
    toast(on ? `Tu suis ${city.n} : tu la retrouves dans « Mes sujets ».` : `Tu ne suis plus ${city.n}.`);
  };
  $("#vMine", v).onclick = (e) => {
    store.set("city", city.s);
    store.set("cityLabel", city.n);
    state.feeds.clear();
    const b = e.target.closest("button");
    b.setAttribute("aria-pressed", "true"); $("span", b).textContent = "Ma ville";
    toast(`${city.n} est ta ville : le fil « Ma ville » montre ses nouvelles.`);
  };
  // Les histoires de l'édition qui parlent de la ville.
  const words = villeWords(city);
  const eds = await Promise.all([edition(city.pr === "QC" ? "qc" : "ca").catch(() => null), edition("monde").catch(() => null)]);
  const seenS = new Set();
  const stories = eds.flatMap((e) => e?.stories || []).filter((s) => !seenS.has(s.id) && seenS.add(s.id) && words.some((w) => hasWord(storyFold(s), w)));
  if (state.route.view !== "ville" || state.route.ville !== city.s) return;
  if (stories.length) {
    await withTitlesFr(stories.slice(0, 8));
    for (const s of stories) state.stories.set(s.id, s);
    $("#vStories").hidden = false;
    $("#vStories").innerHTML = `<h2 class="block-h">Les grandes histoires <small>couvertes par plusieurs médias</small></h2>${stories.slice(0, 4).map((s) => storyRow(s)).join("")}`;
  }
  // Tous les articles des 7 derniers jours : ceux qui nomment la ville, et TOUS ceux de ses médias locaux
  // (un hebdo local n'écrit pas toujours le nom de sa ville). Seulement des médias canadiens (pas Warwick en Angleterre).
  const q = city.s === "quebec" ? `"ville de Québec"` : `"${city.n}"`;
  const [r, loc] = await Promise.all([indexSearch(q).catch(() => null), localMedia()]);
  if (state.route.view !== "ville" || state.route.ville !== city.s) return;
  const sameCity = (x) => (x.cities || []).some((c) => foldText(c) === city.f);
  const cityMedia = Object.entries(loc).map(([d, [n, reg, cities]]) => ({ d, n, reg, cities })).filter(sameCity);
  const regionMedia = Object.entries(loc).map(([d, [n, reg, cities]]) => ({ d, n, reg, cities })).filter((x) => x.reg === city.r && !sameCity(x));
  if (r) {
    const m = r.meta;
    const inCanada = (id) => m.D[m.dom[id]].country === "CA";
    r.ids = r.ids.filter(inCanada);
    const own = new Set(cityMedia.map((x) => x.d));
    if (own.size) {
      const idx = new Set(m.D.map((d, i) => (own.has(d.domain) ? i : -1)).filter((i) => i >= 0));
      const have = new Set(r.ids);
      const extra = [];
      for (let id = 0; id < m.dom.length; id++) if (idx.has(m.dom[id]) && !have.has(id)) extra.push(id);
      r.ids = [...r.ids, ...extra].sort((x, y) => x - y);
    }
    // Petite municipalité dont on a peu parlé : on ajoute les nouvelles de sa MRC et des villes voisines (au Canada).
    if (r.ids.length < 5 && city.pr === "QC") {
      const mrc = city.m ? city.m.replace(/^MRC\s+(de |du |des |d')?/i, "").trim() : "";
      const others = [...(mrc ? [`"${mrc}"`] : []), ...[...near, ...nearRegion].slice(0, 4).map((x) => `"${x.n}"`)];
      const more = await Promise.all(others.map((x) => indexSearch(x).catch(() => null)));
      if (state.route.view !== "ville" || state.route.ville !== city.s) return;
      const have = new Set(r.ids);
      const extra = [...new Set(more.flatMap((x) => x?.ids || []))].filter((id) => !have.has(id) && inCanada(id)).sort((x, y) => x - y);
      if (extra.length) {
        r.ids = [...r.ids, ...extra];
        r.marks = [...(r.marks || []), ...more.flatMap((x) => x?.marks || [])];
        $("#wide").insertAdjacentHTML("beforebegin", `<p class="q-fix">Peu de nouvelles nomment ${esc(city.n)} cette semaine : voici aussi celles de ${esc(city.m ? mrcName(city.m) : "la région")} et des villes voisines.</p>`);
      }
    }
    r.query = q;
    r.light = true;
    drawWide($("#wide"), r);
  } else $("#wide").innerHTML = `<div class="empty"><p>La recherche n'est pas encore prête.</p></div>`;
  // Les médias de la ville, ceux qui en parlent le plus, puis ceux de la région.
  const top = new Map();
  if (r) for (const id of r.ids) { const di = r.meta.dom[id]; top.set(di, (top.get(di) || 0) + 1); }
  const topList = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([di, n]) => ({ d: r.meta.D[di].domain, n: r.meta.D[di].name, c: n }));
  const count = (d) => topList.find((t) => t.d === d)?.c || (r ? r.ids.filter((id) => r.meta.D[r.meta.dom[id]].domain === d).length : 0);
  // Chaque média est un filtre : on ne voit que ses articles sur la ville. Le ↗ mène à la page du média.
  const withN = [...cityMedia, ...topList.filter((t) => !cityMedia.some((x) => x.d === t.d))].map((x) => ({ ...x, c: x.c ?? count(x.d) })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
  if (withN.length) {
    $("#vLocal").hidden = false;
    $("#vLocal").innerHTML = `<button class="vm" type="button" data-vmedia="" aria-pressed="true">Tous <b>${r ? r.ids.length : ""}</b></button>${withN.map((x) => `<button class="vm" type="button" data-vmedia="${esc(x.d)}" aria-pressed="false">${favicon(x.d, x.n)}<span data-no-tr>${esc(x.n)}</span> <b>${x.c}</b></button>`).join("")}`;
    $("#vLocal").onclick = (e) => {
      const b = e.target.closest("[data-vmedia]");
      if (!b || !r) return;
      state.wf.media = state.wf.media === b.dataset.vmedia ? "" : b.dataset.vmedia;
      $$("[data-vmedia]", $("#vLocal")).forEach((x) => x.setAttribute("aria-pressed", x.dataset.vmedia === state.wf.media));
      const row = $("#vLocal");
      row.scrollTo({ left: b.offsetLeft - (row.clientWidth - b.offsetWidth) / 2, behavior: "smooth" });
      drawWide($("#wide"), r);
      const top = $("#topbar").getBoundingClientRect().bottom + $("#vLocal").offsetHeight;
      if ($("#wide").getBoundingClientRect().top < top) scrollTo({ top: $("#wide").getBoundingClientRect().top + scrollY - top - 8, behavior: "smooth" });
    };
  }
  // Les autres médias de la région (sans article sur la ville cette semaine) : repliés, chacun mène à sa page.
  const others = [...cityMedia, ...regionMedia].filter((x) => !withN.some((w) => w.d === x.d)).slice(0, 24);
  if (others.length) {
    $("#vMore").hidden = false;
    $("#vMore").innerHTML = `<summary>Autres médias de la région <small>${others.length}</small></summary>
      <div class="chips" style="margin-top:10px">${others.map((x) => `<a class="chip" href="${href({ m: x.d })}" data-nav>${favicon(x.d, x.n)} <span data-no-tr>${esc(x.n)}</span></a>`).join("")}</div>`;
  }
}

/* ---------- Toutes les villes, par région ---------- */
async function viewVilles(v) {
  document.title = "Nouvelles par ville — Prisme";
  v.innerHTML = `<header class="page-h"><div class="kicker">${pin}Nouvelles par ville</div><h1>Les nouvelles de ta ville</h1>
      <p>Toutes les municipalités du Québec et les villes du Canada. Choisis une ville pour voir tout ce que les médias en disent.</p></header>
    <label class="o-search villes-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" id="vQ" placeholder="Tape le nom d'une ville (ex. Granby, Rimouski, Calgary)…" autocomplete="off"></label>
    <div id="vHits"></div><div id="vRegions"><div class="loader">Chargement des villes…</div></div>`;
  const V = await villesData().catch(() => null);
  if (!V || state.route.view !== "villes") return;
  const cityLink = (x) => `<a class="ville-link" href="${href({ ville: x.s })}" data-nav><b>${esc(x.n)}</b><small>${x.p ? x.p.toLocaleString(LOCALE) : ""}</small></a>`;
  const regions = new Map();
  for (const x of V.list) { const k = x.pr === "QC" ? x.r : PROV_NAME[x.pr] || x.pr; if (!regions.has(k)) regions.set(k, []); regions.get(k).push(x); }
  const qcFirst = [...regions.entries()].sort((a, b) => (a[1][0].pr === "QC" ? 0 : 1) - (b[1][0].pr === "QC" ? 0 : 1) || a[0].localeCompare(b[0], "fr"));
  $("#vRegions").innerHTML = qcFirst.map(([k, list]) => `<details class="ville-region"${k === "Montréal" || k === "Capitale-Nationale" ? " open" : ""}><summary>${esc(k.replace(/--/g, "–"))} <small>${plural(list.length, list[0].pr === "QC" ? "municipalité" : "ville")}</small></summary>
    <div class="ville-grid">${list.map(cityLink).join("")}</div></details>`).join("");
  $("#vQ").oninput = (e) => {
    const hits = matchVilles(V, e.target.value, 12);
    $("#vHits").innerHTML = hits.length ? `<div class="ville-grid ville-hits">${hits.map((x) => `<a class="ville-link" href="${href({ ville: x.s })}" data-nav><b>${esc(villeLabel(x))}</b><small>${esc(villeWhere(x))}</small></a>`).join("")}</div>` : "";
  };
}

/* ---------- Comme une vraie app (iPhone, iPad) ---------- */
const coarse = matchMedia("(pointer: coarse)");
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Téléphone : l'histoire monte en panneau par-dessus la page. iPad : elle s'ouvre à droite, la liste reste à gauche.
const panelMode = () => (innerWidth <= 760 ? "sheet" : coarse.matches && innerWidth >= 900 ? "split" : null);
const PANEL_BASES = ["feed", "search", "ville", "outlet", "favoris", "matin"];
const panelWanted = (url) => {
  try { return !!panelMode() && !!new URL(url, location.href).searchParams.get("h") && (!!state.panel || PANEL_BASES.includes(state.route?.view)); } catch { return false; }
};

function openPanel(route) {
  stopSpeaking();
  const mode = panelMode();
  let p = $("#panel");
  if (!p) {
    p = document.createElement("div");
    p.id = "panel";
    p.innerHTML = `<div class="panel-scrim" data-panel-close></div>
      <section class="panel-card" role="dialog" aria-label="Histoire">
        <div class="panel-bar"><span class="grab" aria-hidden="true"></span><button class="icon-btn panel-x" type="button" data-panel-close aria-label="Fermer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <div class="panel-body" id="panelBody"></div>
      </section>`;
    document.body.appendChild(p);
    bindPanelGestures(p);
  }
  document.body.classList.toggle("panel-sheet", mode === "sheet");
  document.body.classList.toggle("panel-split", mode === "split");
  requestAnimationFrame(() => document.body.classList.add("panel-open"));
  const body = $("#panelBody");
  body.scrollTop = 0;
  $(".panel-card").style.transform = "";
  viewStory(body, route);
  markSelected(route.id);
}
function closePanel() {
  document.body.classList.remove("panel-open");
  setTimeout(() => {
    if (document.body.classList.contains("panel-open")) return;
    document.body.classList.remove("panel-sheet", "panel-split");
    const b = $("#panelBody");
    if (b) b.innerHTML = "";
  }, 320);
  $$(".kbd-sel").forEach((x) => x.classList.remove("kbd-sel"));
  state.panel = null;
  stopSpeaking(); // fermer l'histoire coupe la lecture à voix haute
}
function stopSpeaking() {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  if (!speakBtn) return;
  speakBtn.setAttribute("aria-pressed", "false");
  if (speakBtn.dataset.float) speakBtn.remove(); else { const sp = $("span", speakBtn); if (sp) sp.textContent = "Écouter"; }
  speakBtn = null;
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-panel-close]")) { e.preventDefault(); history.back(); }
});
// Glisser le panneau vers le bas pour le fermer (téléphone).
function bindPanelGestures(p) {
  const card = $(".panel-card", p), body = $(".panel-body", p);
  let y0 = null, dy = 0;
  card.addEventListener("touchstart", (e) => {
    if (!document.body.classList.contains("panel-sheet")) return;
    const onBar = e.target.closest(".panel-bar");
    if (!onBar && body.scrollTop > 0) return;
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) card.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  card.addEventListener("touchend", () => {
    if (y0 == null) return;
    y0 = null;
    if (dy > 110) history.back(); else card.style.transform = "";
  }, { passive: true });
}

// Bouton Retour (app installée : Safari n'affiche plus le sien) et glisser du bord gauche pour revenir.
function updateBackBtn() {
  const b = $("#backNav");
  if (!b) return;
  const deep = (history.state?.d || 0) > 0;
  b.hidden = !(deep && (isStandalone() || coarse.matches) && !state.panel);
}
$("#backNav")?.addEventListener("click", () => history.back());
{
  let sx = null, sy = 0;
  addEventListener("touchstart", (e) => {
    const x = e.touches[0].clientX;
    sx = x < 24 && ((isStandalone() && (history.state?.d || 0) > 0) || state.panel) ? x : null;
    sy = e.touches[0].clientY;
  }, { passive: true });
  // La page suit le doigt (comme les Réglages de l'iPhone) ; relâchée assez loin, on revient en arrière.
  const page = () => (state.panel ? $(".panel-card") : $("#view"));
  addEventListener("touchmove", (e) => {
    if (sx == null || state.panel) return;
    const dx = e.touches[0].clientX - sx, dy = Math.abs(e.touches[0].clientY - sy);
    if (dy > 60) { sx = null; const v = page(); v.style.transition = "transform .2s ease"; v.style.transform = ""; return; }
    if (dx > 0) { const v = page(); v.style.transition = "none"; v.style.transform = `translateX(${dx}px)`; document.body.classList.add("edge-back"); }
  }, { passive: true });
  addEventListener("touchend", (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = Math.abs(e.changedTouches[0].clientY - sy);
    sx = null;
    const v = page();
    const reset = () => { v.style.transition = ""; v.style.transform = ""; document.body.classList.remove("edge-back"); };
    if (dx > 80 && dy < 70) {
      if (state.panel) { history.back(); return; }
      v.style.transition = "transform .18s ease-out"; v.style.transform = "translateX(100vw)";
      setTimeout(() => { v.style.transition = "none"; v.style.transform = "translateX(-12px)"; history.back(); requestAnimationFrame(() => { v.style.transition = "transform .22s ease-out"; v.style.transform = ""; setTimeout(reset, 240); }); }, 170);
    } else { v.style.transition = "transform .2s ease"; v.style.transform = ""; setTimeout(reset, 220); }
  }, { passive: true });
}

// Raccourcis clavier (iPad avec clavier, ordinateur) : j / k ou ↓ / ↑ pour passer d'une histoire à l'autre,
// Entrée pour l'ouvrir, Échap pour fermer le panneau.
let kbdIndex = -1;
const storyCards = () => $$("#view .lead, #view .story");
function markSelected(id) {
  $$(".kbd-sel").forEach((x) => x.classList.remove("kbd-sel"));
  const cards = storyCards();
  const k = cards.findIndex((c) => c.querySelector(`a[href*="h=${CSS.escape(id)}"]`));
  if (k >= 0) { kbdIndex = k; cards[k].classList.add("kbd-sel"); }
}
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
  if (e.key === "Escape" && state.panel) { history.back(); return; }
  const arrows = state.panel && document.body.classList.contains("panel-split");
  const next = e.key === "j" || (arrows && e.key === "ArrowDown"), prev = e.key === "k" || (arrows && e.key === "ArrowUp");
  if (!next && !prev && !(e.key === "Enter" && kbdIndex >= 0)) return;
  const cards = storyCards();
  if (!cards.length) return;
  e.preventDefault();
  if (e.key === "Enter") { const id = cards[kbdIndex] && cardId(cards[kbdIndex]); if (id) go(href({ h: id })); return; }
  kbdIndex = Math.max(0, Math.min(cards.length - 1, kbdIndex + (next ? 1 : -1)));
  $$(".kbd-sel").forEach((x) => x.classList.remove("kbd-sel"));
  const c = cards[kbdIndex];
  c.classList.add("kbd-sel");
  c.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
  // En deux colonnes, l'histoire choisie s'ouvre tout de suite à droite.
  if (arrows) { const id = cardId(c); if (id) go(href({ h: id }), { replace: true }); }
});

// Recherche plein écran sur téléphone.
{
  const input = $("#search input");
  input.addEventListener("focus", () => { if (innerWidth <= 760) document.body.classList.add("search-full"); });
  input.addEventListener("blur", () => setTimeout(() => document.body.classList.remove("search-full"), 160));
  $("#searchCancel")?.addEventListener("click", () => { input.value = ""; input.blur(); document.body.classList.remove("search-full"); });
}

// Guide d'installation sur iPhone/iPad (Safari, pas encore installée), après quelques visites.
store.set("visits", String(Number(store.get("visits", "0")) + 1));
// Les étapes exactes pour l'iPhone : iOS 26 cache « Partager » derrière le menu ≡ ; avant, le bouton était en bas.
// Ouvert dans Messenger, Facebook ou Instagram : il faut d'abord passer à Safari.
const SHARE_ICO = `<span class="ic-share" aria-label="Partager"><svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/></svg></span>`;
function iosInstallSteps() {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|Snapchat|TikTok/i.test(ua)) return `<ol>
      <li>Touche <b>⋯</b> ou <b>⋮</b> en haut à droite</li>
      <li>Choisis <b>« Ouvrir dans Safari »</b> (ou « Ouvrir dans le navigateur »)</li>
      <li>Dans Safari, reviens ici : les étapes s'afficheront</li></ol>`;
  if (/CriOS|FxiOS|EdgiOS/.test(ua)) return `<ol>
      <li>Touche ${SHARE_ICO} <b>Partager</b>, en haut à droite de l'adresse</li>
      <li>Choisis <b>« Sur l'écran d'accueil »</b></li><li>Touche <b>Ajouter</b></li></ol>`;
  const v = Number((ua.match(/Version\/(\d+)/) || [])[1] || 0);
  if (v >= 26) return `<ol>
      <li>En bas, touche <b class="ic-key">≡</b> (les 3 lignes, à gauche de l'adresse)</li>
      <li>Touche ${SHARE_ICO} <b>Partager</b></li>
      <li>Glisse vers le bas, touche <b>« Sur l'écran d'accueil »</b></li>
      <li>Laisse <b>« Ouvrir comme app Web »</b> activé, puis touche <b>Ajouter</b></li></ol>`;
  return `<ol><li>Touche ${SHARE_ICO} <b>Partager</b>, en bas de Safari</li>
      <li>Glisse vers le bas, touche <b>« Sur l'écran d'accueil »</b></li><li>Touche <b>Ajouter</b></li></ol>`;
}
function installCard() {
  if (isStandalone() || !isIOS() || store.get("installDone") || Number(store.get("visits", "0")) < 2) return "";
  return `<aside class="install-card" id="installCard">
    <div class="ic-icon"><img src="icons/apple-touch-icon.png" alt=""></div>
    <div class="ic-body"><b>Ajoute Prisme à ton écran d'accueil</b>
      ${iosInstallSteps()}
      <small>Prisme s'ouvrira en plein écran, comme une vraie app.</small></div>
    <button class="icon-btn" type="button" id="installX" aria-label="Fermer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  </aside>`;
}
document.addEventListener("click", (e) => { if (e.target.closest("#installX")) { store.set("installDone", "1"); $("#installCard")?.remove(); } });

// Les histoires enregistrées restent lisibles hors ligne (et après leur sortie de l'édition).
const favStoryKey = (id) => `fs:${id}`;
function saveFavStory(s) {
  const slim = { ...s, articles: (s.articles || []).slice(0, 24).map((a) => ({ title: a.title, url: a.url, published: a.published, sourceName: a.sourceName, domain: a.domain, lang: a.lang, media: a.media })), world: undefined, _fold: undefined };
  try {
    store.set(favStoryKey(s.id), JSON.stringify(slim));
    const ids = JSON.parse(store.get("fsIds", "[]")).filter((x) => x !== s.id);
    ids.unshift(s.id);
    for (const old of ids.slice(80)) localStorage.removeItem(`prisme.${favStoryKey(old)}`);
    store.set("fsIds", JSON.stringify(ids.slice(0, 80)));
  } catch { /* stockage plein : tant pis */ }
}
const savedStory = (id) => { try { return JSON.parse(store.get(favStoryKey(id), "null")); } catch { return null; } };

// Les 3 côtés en carrousel (téléphone) : on glisse d'un titre à l'autre.
function sidesSwipe(s) {
  if ((s.sources || 0) < 2) return "";
  const by = pickBySide(s);
  return `<div class="sides-swipe" aria-label="Le titre de chaque côté">${SIDES.map((side) => {
    const a = by[side.key];
    return `<div class="ss-card"><span class="ss-side"><i style="background:${side.color}"></i>${side.label}</span>
      ${a ? `${artLink(a, "ss-t")}<span class="ss-by">${esc(a.sourceName)}</span>` : `<span class="ss-none">Aucun média de ${side.label.toLowerCase()} n'en parle.</span>`}</div>`;
  }).join("")}</div>`;
}

/* ---------- Petites touches : nouvelles depuis ta visite, reprise, gestes, « moins de ça » ---------- */
// Dernière visite : le moment où Prisme a été quitté la dernière fois (mis en arrière-plan ou fermé).
const RESUME_MS = 30 * 60e3;
const visit = { prev: Number(store.get("lastSeenAt", "0")) || 0, hiddenAt: 0, pillDone: false };
const firstSeenMs = (s) => { const t = Date.parse(s.firstSeen || ""); return Number.isFinite(t) ? t : 0; };
const isNew = (s) => !!visit.prev && firstSeenMs(s) > visit.prev && !readS.get(s.id);
const newTag = (s) => (isNew(s) ? `<span class="new-tag">Nouveau</span> ` : "");

// Histoires lues (ouvertes, ou glissées vers la droite) : { id, n (articles au moment de la lecture), at }.
const readS = Object.assign(listStore("readS", 800), {
  _m: null,
  map() { if (!this._m) this._m = new Map(this.list().map((x) => [x.id, x])); return this._m; },
  get(id) { return this.map().get(id); },
  mark(s) { this.save([{ id: s.id, n: s.articleCount || s.articles?.length || 0, at: Date.now() }, ...this.list().filter((x) => x.id !== s.id)]); this._m = null; },
  unmark(id) { this.save(this.list().filter((x) => x.id !== id)); this._m = null; },
});
// Lue et rien de neuf : en gris. Lue, mais 3 articles ou plus sont arrivés depuis : normale, avec « +6 depuis ta lecture ».
function seenState(s) {
  const r = readS.get(s.id) || (s.articles?.some((a) => reads.has(a.url)) ? { n: s.articleCount || s.articles.length } : null);
  if (!r) return null;
  const more = (s.articleCount || s.articles?.length || 0) - r.n;
  return more >= 3 ? { fresh: more } : { seen: true };
}
const seenFlag = (st) => (st?.fresh ? `<span class="flag fresh">+${st.fresh} depuis ta lecture</span>` : st?.seen ? `<span class="flag read">Lu</span>` : "");
const cardId = (c) => { const a = c.querySelector('a[href*="h="]'); try { return a ? new URL(a.getAttribute("href"), location.href).searchParams.get("h") : null; } catch { return null; } };
const cardsOf = (id) => $$("#view .lead, #view .story").filter((c) => cardId(c) === id);

// « Moins de ça » : une rubrique ou un média descend dans ton fil, sans jamais disparaître complètement.
const less = {
  get() { try { const v = JSON.parse(store.get("less", "{}")); return { c: v.c || [], m: v.m || [] }; } catch { return { c: [], m: [] }; } },
  set(v) { store.set("less", JSON.stringify(v)); },
  addCat(c) { const v = this.get(); if (!v.c.includes(c)) v.c.push(c); this.set(v); },
  addMed(d, n) { const v = this.get(); if (!v.m.some((x) => x.d === d)) v.m.push({ d, n }); this.set(v); },
  delCat(c) { const v = this.get(); v.c = v.c.filter((x) => x !== c); this.set(v); },
  delMed(d) { const v = this.get(); v.m = v.m.filter((x) => x.d !== d); this.set(v); },
};
function lessScorer(cat) {
  const L = less.get();
  const cats = new Set(L.c.filter((c) => c !== cat)), med = new Set(L.m.map((x) => x.d));
  if (!cats.size && !med.size) return null;
  return (s) => {
    let f = 1;
    if (s.categories?.some((c) => cats.has(c))) f *= 0.25;
    if (med.size && s.articles?.length) {
      if (med.has(s.leadDomain)) f *= 0.5;
      f *= 1 - 0.7 * (s.articles.filter((a) => med.has(a.domain)).length / s.articles.length);
    }
    return f;
  };
}
// Les autres fils seront recalculés ; celui qu'on regarde garde sa place.
const dropOtherFeeds = () => { const k = state.route?.view === "feed" ? feedKey(state.route) : null; for (const key of [...state.feeds.keys()]) if (key !== k) state.feeds.delete(key); };

// Un petit message, avec « Annuler » quand on peut revenir en arrière.
function toastUndo(msg, undo) {
  toast(msg);
  const el = $("#toast");
  const b = document.createElement("button");
  b.type = "button"; b.className = "toast-undo"; b.textContent = "Annuler";
  b.onclick = () => { undo(); el.classList.remove("on"); };
  el.append(" ", b);
  el.classList.add("has-undo");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on", "has-undo"), 3600);
}

// Favori d'une histoire depuis un geste ou le menu (les boutons étoile visibles se mettent à jour).
function toggleStoryFav(s) {
  const item = storyFav(s);
  const on = favs.toggle(item);
  if (on) saveFavStory(s);
  for (const b of $$(`[data-fav-key="${CSS.escape(item.k)}"]`)) {
    b.setAttribute("aria-pressed", on);
    b.title = on ? "Retirer des favoris" : "Enregistrer dans mes favoris";
    const sp = $("span", b); if (sp) sp.textContent = on ? "Enregistré" : "Enregistrer";
  }
  return on;
}
function setSeen(s, on) {
  if (on) { readS.mark(s); later.remove(`s:${s.id}`); } else readS.unmark(s.id);
  for (const c of cardsOf(s.id)) {
    c.classList.toggle("is-seen", on);
    $(".new-tag", c)?.remove();
    const fl = $(".flag.read, .flag.fresh", c);
    if (on && !fl) $(".story-foot .acts", c)?.insertAdjacentHTML("beforebegin", `<span class="flag read">Lu</span>`);
    if (!on) fl?.remove();
  }
}
// Retire une histoire du fil affiché (après « Moins de ça »), en douceur.
function collapseCard(s) {
  const f = state.feeds.get(feedKey(state.route));
  for (const c of cardsOf(s.id)) {
    c.style.height = `${c.offsetHeight}px`;
    requestAnimationFrame(() => { c.classList.add("gone"); c.style.height = "0px"; });
    setTimeout(() => c.remove(), 320);
  }
  if (f) {
    const i = f.stories.findIndex((x) => x.id === s.id);
    if (i >= 0) { f.stories.splice(i, 1); const el = $("#feed"); if (el) el.dataset.count = String(Math.max(0, Number(el.dataset.count || 0) - 1)); }
  }
}

/* Menu de l'appui long */
const MI = {
  listen: '<path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
  sides: '<path d="M4 18V8M12 18V5M20 18v-7"/>',
  read: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  less: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
};
function openStoryMenu(s) {
  closeStoryMenu();
  const cat = s.categories?.[0];
  const st = seenState(s);
  const on = favs.has(`s:${s.id}`);
  const m = document.createElement("div");
  m.id = "smenu";
  m.innerHTML = `<div class="smenu-scrim" data-sm="close"></div>
    <div class="smenu-box" role="menu" aria-label="Actions">
      <div class="smenu-prev">${s.image ? `<img src="${esc(safeUrl(s.image))}" alt="" referrerpolicy="no-referrer">` : ""}
        <div><b data-no-tr>${titleOf(s)}</b>${bar(s.counts)}<small>${plural(s.sources, "média")}</small></div></div>
      <div class="smenu-list">
        <button type="button" role="menuitem" data-sm="fav">${ico("star")}<span>${on ? "Retirer des favoris" : "Enregistrer"}</span></button>
        <button type="button" role="menuitem" data-sm="later"><svg viewBox="0 0 24 24" aria-hidden="true">${CLOCK}</svg><span>${later.has(`s:${s.id}`) ? "Retirer de « À lire »" : "Lire plus tard"}</span></button>
        <button type="button" role="menuitem" data-sm="share">${ico("share")}<span>Partager</span></button>
        <button type="button" role="menuitem" data-sm="select"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg><span>Sélectionner plusieurs</span></button>
        ${canSpeak ? `<button type="button" role="menuitem" data-sm="listen"><svg viewBox="0 0 24 24" aria-hidden="true">${MI.listen}</svg><span>Écouter</span></button>` : ""}
        <button type="button" role="menuitem" data-sm="pick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg><span>Lire chez un autre média</span></button>
        <button type="button" role="menuitem" data-sm="open"><svg viewBox="0 0 24 24" aria-hidden="true">${MI.sides}</svg><span>Comparer les côtés</span></button>
        <button type="button" role="menuitem" data-sm="read"><svg viewBox="0 0 24 24" aria-hidden="true">${MI.read}</svg><span>${st?.seen ? "Marquer comme non lu" : "Marquer comme lu"}</span></button>
        ${cat ? `<button type="button" role="menuitem" data-sm="lesscat"><svg viewBox="0 0 24 24" aria-hidden="true">${MI.less}</svg><span>Moins de « ${esc(CAT_LABEL[cat] || cat)} »</span></button>` : ""}
        ${s.leadDomain ? `<button type="button" role="menuitem" data-sm="lessmed"><svg viewBox="0 0 24 24" aria-hidden="true">${MI.less}</svg><span>Moins de <span data-no-tr>${esc(s.leadSource || s.leadDomain)}</span></span></button>` : ""}
      </div>
    </div>`;
  document.body.appendChild(m);
  requestAnimationFrame(() => m.classList.add("on"));
  m.onclick = (e) => {
    const b = e.target.closest("[data-sm]");
    if (!b) return;
    const k = b.dataset.sm;
    closeStoryMenu();
    if (k === "fav") { const now = toggleStoryFav(s); toast(now ? "Enregistré dans tes favoris ★" : "Retiré de tes favoris"); }
    else if (k === "share") shareIt(storyShare(s));
    else if (k === "later") toggleLater(storyFav(s));
    else if (k === "select") enterSelect(s);
    else if (k === "listen") speak(storySpeech(s), null);
    else if (k === "open") go(href({ h: s.id }));
    else if (k === "pick") openPicker(s);
    else if (k === "read") { const was = !!seenState(s)?.seen; setSeen(s, !was); }
    else if (k === "lesscat") {
      less.addCat(cat); dropOtherFeeds(); collapseCard(s);
      toastUndo(`Moins de « ${CAT_LABEL[cat] || cat} » dans ton fil`, () => { less.delCat(cat); state.feeds.clear(); render({ scroll: scrollY }); });
    } else if (k === "lessmed") {
      less.addMed(s.leadDomain, s.leadSource || s.leadDomain); dropOtherFeeds(); collapseCard(s);
      toastUndo(`Moins de ${s.leadSource || s.leadDomain} dans ton fil`, () => { less.delMed(s.leadDomain); state.feeds.clear(); render({ scroll: scrollY }); });
    }
  };
}
function closeStoryMenu() {
  const m = $("#smenu");
  if (!m) return;
  m.classList.remove("on");
  setTimeout(() => m.remove(), 200);
}
addEventListener("keydown", (e) => { if (e.key === "Escape") closeStoryMenu(); });

// Appui long sur une histoire (téléphone, iPad) : le menu, avec une petite vibration quand l'appareil le permet.
{
  let timer = null, x0 = 0, y0 = 0, firedAt = 0;
  const stop = () => { clearTimeout(timer); timer = null; $$(".pressing").forEach((c) => c.classList.remove("pressing")); };
  addEventListener("touchstart", (e) => {
    stop();
    if (e.touches.length !== 1) return;
    const card = e.target.closest("#view .story, #view .lead, #panel .story");
    if (!card || state.sel || e.target.closest(".sides-swipe, .acts, button, input, .covered a")) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    if (x0 < 24) return;
    timer = setTimeout(() => {
      timer = null;
      const s = state.stories.get(cardId(card));
      if (!s) return;
      firedAt = Date.now();
      card.classList.remove("pressing");
      navigator.vibrate?.(12);
      openStoryMenu(s);
    }, 460);
    setTimeout(() => { if (timer) card.classList.add("pressing"); }, 120);
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (timer && (Math.abs(e.touches[0].clientX - x0) > 10 || Math.abs(e.touches[0].clientY - y0) > 10)) stop();
  }, { passive: true });
  addEventListener("touchend", stop, { passive: true });
  addEventListener("touchcancel", stop, { passive: true });
  // Le toucher qui termine l'appui long n'ouvre pas l'histoire (et ne ferme pas le menu).
  document.addEventListener("click", (e) => { if (Date.now() - firedAt < 600) { e.preventDefault(); e.stopPropagation(); } }, true);
  // Pas de menu du navigateur par-dessus le nôtre (Android).
  addEventListener("contextmenu", (e) => { if (coarse.matches && e.target.closest("#view .story, #view .lead")) e.preventDefault(); });
}

// Glisser une histoire du fil : vers la gauche, elle est enregistrée ; vers la droite, marquée comme lue.
{
  const SW = 84;
  let card = null, x0 = 0, y0 = 0, dx = 0, mode = null;
  addEventListener("touchstart", (e) => {
    card = null; mode = null; dx = 0;
    if (e.touches.length !== 1 || innerWidth > 1100 || state.sel) return;
    const c = e.target.closest("#feed .story");
    if (!c || e.target.closest(".sides-swipe")) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    if (x0 < 24) return;
    card = c;
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (!card) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!mode) {
      if (Math.abs(mx) > 14 && Math.abs(mx) > Math.abs(my) * 1.4) { mode = "h"; card.classList.add("swiping"); }
      else if (Math.abs(my) > 10) { card = null; return; }
      else return;
    }
    dx = Math.max(-150, Math.min(150, mx));
    card.style.setProperty("--dx", `${dx}px`);
    const dir = dx < 0 ? "l" : "r";
    if (card.dataset.dir !== dir) { card.dataset.dir = dir; card.dataset.lbl = dir === "l" ? tr(favs.has(`s:${cardId(card)}`) ? "Retirer ★" : "★ Enregistrer") : tr(card.classList.contains("is-seen") ? "↺ Non lu" : "✓ Lu"); }
    const past = Math.abs(dx) > SW;
    if (past !== card.classList.contains("armed")) { card.classList.toggle("armed", past); if (past) navigator.vibrate?.(8); }
  }, { passive: true });
  const end = () => {
    if (!card || mode !== "h") { card = null; return; }
    const c = card; card = null;
    c.classList.remove("swiping", "armed");
    c.style.removeProperty("--dx");
    delete c.dataset.dir;
    const s = state.stories.get(cardId(c));
    if (!s || Math.abs(dx) <= SW) return;
    if (dx < 0) {
      const on = toggleStoryFav(s);
      toastUndo(on ? "Enregistré dans tes favoris ★" : "Retiré de tes favoris", () => toggleStoryFav(s));
    } else {
      const was = !!seenState(s)?.seen;
      setSeen(s, !was);
      toastUndo(was ? "Marquée comme non lue" : "Marquée comme lue", () => setSeen(s, was));
    }
  };
  addEventListener("touchend", end, { passive: true });
  addEventListener("touchcancel", end, { passive: true });
}

// Toucher l'onglet (ou la rubrique) où l'on est déjà : on remonte en haut ; déjà en haut, on rafraîchit.
for (const sel of ["#tabbar", "#cats"]) {
  $(sel)?.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-nav]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (new URL(a.getAttribute("href"), location.href).search !== location.search) return;
    e.preventDefault(); e.stopPropagation();
    if (scrollY > 30) { scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }); return; }
    if (state.route?.view === "feed") { buzz(15); dataCache.clear(); state.feeds.clear(); toast("Fil mis à jour"); render(); }
  });
}

// Reprendre où on était : la position dans le fil est gardée 30 minutes.
function topCard() {
  const top = $("#topbar")?.getBoundingClientRect().bottom || 0;
  return storyCards().find((c) => c.getBoundingClientRect().bottom > top + 8) || null;
}
function saveResume() {
  if (state.route?.view !== "feed" && !state.panel) { store.set("resume", "null"); return; }
  const c = state.panel ? null : topCard();
  const top = $("#topbar")?.getBoundingClientRect().bottom || 0;
  // Une histoire ouverte par-dessus le fil : on la rouvrira aussi.
  const h = state.panel && state.route?.view === "story" ? state.route.id : null;
  store.set("resume", JSON.stringify({ u: state.panel ? state.panel.base : location.search, y: scrollY, id: c ? cardId(c) : null, off: c ? c.getBoundingClientRect().top - top : 0, h, at: Date.now() }));
}
const reopenStory = (h) => { if (h && state.route?.view === "feed") setTimeout(() => go(href({ h })), 120); };
// Appelée quand le fil a des histoires : on retrouve l'histoire du haut (en chargeant les pages qu'il faut), sinon la hauteur.
function tryResume(f, key) {
  const r = state.resume;
  if (!r || feedKey(state.route) !== key) return;
  const card = r.id && storyCards().find((c) => cardId(c) === r.id);
  if (card) {
    state.resume = null;
    requestAnimationFrame(() => {
      const top = $("#topbar")?.getBoundingClientRect().bottom || 0;
      scrollTo(0, Math.max(0, card.getBoundingClientRect().top + scrollY - top - r.off));
      reopenStory(r.h);
    });
    return;
  }
  if (r.id && f.hasMore && f.page < 6) { setTimeout(() => loadMore(key), 0); return; }
  state.resume = null;
  if (r.y) requestAnimationFrame(() => scrollTo(0, Math.min(r.y, document.documentElement.scrollHeight - innerHeight)));
  reopenStory(r.h);
}
{
  let r = null;
  try { r = JSON.parse(store.get("resume", "null")); } catch { r = null; }
  if (r && Date.now() - r.at < RESUME_MS && (!location.search || location.search === "?source=app") && (r.u || r.y || r.h)) {
    if (r.u) history.replaceState({ y: 0, d: 0 }, "", r.u);
    state.resume = r;
  }
  // Un doigt qui bouge avant la fin du chargement : on n'impose plus de position.
  const cancel = () => { if (state.resume) state.resume = null; };
  addEventListener("touchstart", cancel, { passive: true });
  addEventListener("wheel", cancel, { passive: true });
}
addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    visit.hiddenAt = Date.now();
    store.set("lastSeenAt", String(visit.hiddenAt));
    saveResume();
    updateBadge();
    return;
  }
  // De retour après plus de 30 minutes : le fil repart du haut, avec les nouvelles fraîches.
  if (visit.hiddenAt && Date.now() - visit.hiddenAt > RESUME_MS) {
    visit.prev = visit.hiddenAt;
    visit.pillDone = false;
    if (state.route?.view === "feed" && !state.panel) { dataCache.clear(); state.feeds.clear(); render({ scroll: 0 }); }
  }
  drawFresh();
});
addEventListener("pagehide", () => { store.set("lastSeenAt", String(Date.now())); saveResume(); });

// « 8 nouvelles depuis ta dernière visite » : chaque toucher mène à la nouvelle histoire suivante.
function drawNewPill(f) {
  const el = $("#newPill");
  if (!el) return;
  const n = f.fresh || 0;
  if (!n || visit.pillDone || f.params.q) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span class="np-dot"></span>${n > 1 ? `${n} nouvelles depuis ta visite` : "1 nouvelle depuis ta visite"}<span class="np-go" aria-hidden="true">›</span>`;
  // Toucher la pastille : seulement ce qui est nouveau, dans une feuille, à lire en un toucher.
  el.onclick = () => openNewSheet(feedKey(state.route));
}
async function openNewSheet(key) {
  const f = state.feeds.get(key);
  if (!f) return;
  openModal(`<div class="modal-pad"><div class="loader">Les nouvelles depuis ta visite…</div></div>`, true);
  // Les nouvelles comptées sont dans les 3 premières pages : on les charge si besoin.
  for (let i = 0; i < 3 && f.hasMore && f.stories.length < 45; i++) await loadMore(key);
  const list = f.stories.slice(0, 45).filter(isNew);
  const body = $("#modalBody");
  if (!body) return;
  visit.pillDone = true;
  $("#newPill")?.setAttribute("hidden", "");
  body.innerHTML = `<div class="modal-pad ns-sheet">
    <div class="kicker">Depuis ta dernière visite</div>
    <h2>${list.length > 1 ? `${list.length} nouvelles` : list.length ? "1 nouvelle" : "Rien de neuf"}</h2>
    ${list.length ? `<ul class="ns-list">${list.map((s) => {
      const c = catOf(s, "une");
      return `<li>${c ? `<span class="ck cc-${c}">${esc(CAT_LABEL[c])}</span>` : ""}
        <a class="ns-t" ${openAttrs(s)} data-close-modal data-no-tr>${titleOf(s)}</a>
        <span class="ns-m">${sourcesLine(s, 1)} · ${esc(agoShort(s.lastSeen || s.firstSeen))} · <a class="link" href="${href({ h: s.id })}" data-nav data-close-modal>Comparer ${s.sources > 1 ? `les ${s.sources} médias` : ""} ›</a></span></li>`;
    }).join("")}</ul>` : `<p class="note">Tout ce qui est dans ton fil, tu l'as déjà vu.</p>`}
  </div>`;
}
// En continu (du plus récent au plus ancien) : une seule ligne, avant la première histoire qui n'a pas bougé
// depuis ta dernière visite. Tout ce qui est au-dessus est arrivé (ou a été mis à jour) depuis.
const sinceLine = `<div class="since-line" role="separator"><span>Tu t'étais arrêté ici</span></div>`;
const lastMs = (s) => { const t = Date.parse(s.lastSeen || s.firstSeen || ""); return Number.isFinite(t) ? t : 0; };
function feedRows(f, from) {
  const cat = f.params.cat, chrono = f.params.lens === "recent" && !f.params.q;
  if (chrono && visit.prev && f.sinceAt == null) {
    const k = f.stories.findIndex((s, i) => i > 0 && lastMs(f.stories[i - 1]) > visit.prev && lastMs(s) <= visit.prev);
    if (k > 0) f.sinceAt = k;
  }
  let html = "";
  for (let i = from; i < f.stories.length; i++) {
    const s = f.stories[i];
    if (chrono && i === f.sinceAt) html += sinceLine;
    // Un seul fil, de haut en bas : la une, puis les histoires. Deux cartes s'y glissent, sans carrousel :
    // ta ville (après la 3e) et un angle mort (après la 8e).
    const home = cat === "une" && !f.params.q && f.params.lens !== "local";
    if (i === 1 && home) html += `<section class="fcard" id="followCard" hidden></section>`;
    if (i === 3 && home && prefs.city) html += `<section class="vcard" id="rowVille" hidden></section>`;
    if (i === 8 && home && f.blind) html += blindCard(f.blind);
    html += i === 0 ? (f.hero ? heroStory(s, cat) : leadStory(s, cat)) : home && i <= 4 && s.image ? bigCard(s, cat) : storyRow(s, cat);
  }
  return html;
}

// « À jour il y a 12 minutes » (et « Hors ligne » sans réseau).
function drawFresh() {
  const el = $("#fresh");
  const f = state.route?.view === "feed" ? state.feeds.get(feedKey(state.route)) : null;
  const off = !navigator.onLine;
  if (off !== document.body.classList.contains("is-offline")) { document.body.classList.toggle("is-offline", off); $("#topbar").dataset.off = tr("Hors ligne · les dernières nouvelles restent lisibles"); topbarSize(); }
  if (!el) return;
  if (!navigator.onLine) {
    el.hidden = false; el.className = "fresh off";
    el.innerHTML = `<span class="fr-dot"></span>Hors ligne · voici les dernières nouvelles chargées ${f?.fetchedAt ? `(${esc(ago(f.fetchedAt))})` : ""}`;
    return;
  }
  if (!f?.fetchedAt) { el.hidden = true; return; }
  const old = Date.now() - Date.parse(f.fetchedAt) > 2 * 36e5;
  el.hidden = false; el.className = `fresh${old ? " old" : ""}`;
  el.innerHTML = `<span class="fr-dot"></span>${old ? "Dernière mise à jour" : "À jour"} ${esc(ago(f.fetchedAt))}`;
}
addEventListener("online", () => { drawFresh(); toast("De retour en ligne"); });
addEventListener("offline", drawFresh);
setInterval(drawFresh, 60e3);

// Pastille sur l'icône de l'app (écran d'accueil) : les histoires non lues de tes sujets suivis. Seulement si activée.
const badgeOn = () => store.get("badge") === "1" && "setAppBadge" in navigator;
function updateBadge() {
  if (!("setAppBadge" in navigator)) return;
  if (store.get("badge") !== "1") { navigator.clearAppBadge?.().catch(() => {}); return; }
  const n = alertCount();
  (n ? navigator.setAppBadge(Math.min(n, 99)) : navigator.clearAppBadge()).catch(() => {});
}

// La barre de l'histoire qui reste en haut quand on descend (titre, couverture, Écouter / Enregistrer / Partager).
function storySticky(v, s) {
  const st = $(".s-sticky", v), h1 = $(".s-head h1", v);
  if (!st || !h1) return;
  const inPanel = v.id === "panelBody";
  state.stickyIO?.disconnect();
  state.stickyIO = new IntersectionObserver(([en]) => {
    st.classList.toggle("on", !en.isIntersecting && en.boundingClientRect.top < (inPanel ? v.getBoundingClientRect().top : innerHeight / 2));
  }, { root: inPanel ? v : null, rootMargin: inPanel ? "0px" : `-${$("#topbar")?.offsetHeight || 0}px 0px 0px 0px` });
  state.stickyIO.observe(h1);
  $(".ss-tl", st).onclick = () => (inPanel ? v.scrollTo({ top: 0, behavior: "smooth" }) : scrollTo({ top: 0, behavior: "smooth" }));
}
const stickyBar = (s) => `<div class="s-sticky"><div class="ss-bar">
    <button class="ss-tl" type="button" title="Revenir en haut"><b data-no-tr>${titleOf(s)}</b>${bar(s.counts)}</button>
    <div class="ss-acts">${canSpeak ? listenBtn(s.id) : ""}${favBtn(storyFav(s))}${shareBtn(storyShare(s))}</div>
  </div></div>`;

// Ce que j'ai mis en « Moins de ça », et la pastille de l'icône : dans les réglages.
function settingsExtra() {
  const L = less.get();
  const items = [...L.c.map((c) => `<button class="chip on" type="button" data-unless-cat="${esc(c)}">${esc(CAT_LABEL[c] || c)} <span aria-hidden="true">✕</span></button>`),
    ...L.m.map((x) => `<button class="chip on" type="button" data-unless-med="${esc(x.d)}"><span data-no-tr>${esc(x.n)}</span> <span aria-hidden="true">✕</span></button>`)];
  const gp = store.get("gnPref", "");
  return `<section><h3>Liens des petits hebdos <small>ceux qui passent par Google News</small></h3>
      <div class="seg seg-big" role="group">${[["", "Demander"], ["site", "Site du média"], ["google", "Via Google"]].map(([v, l]) => `<button type="button" data-gnpref="${v}" aria-pressed="${gp === v}">${l}</button>`).join("")}</div></section>
    <section><h3>Lecture du soir <small>de 21 h à 6 h, des couleurs plus chaudes pour les yeux</small></h3>
      <div class="seg seg-big" role="group"><button type="button" data-soir-set="0" aria-pressed="${store.get("soir") === "0"}">Non</button><button type="button" data-soir-set="1" aria-pressed="${store.get("soir") !== "0"}">Oui</button></div></section>
    <section><h3>Lecture simple <small>sans barres de couleur ni étiquettes</small></h3>
      <div class="seg seg-big" role="group"><button type="button" data-simple-set="0" aria-pressed="${store.get("simple") !== "1"}">Non</button><button type="button" data-simple-set="1" aria-pressed="${store.get("simple") === "1"}">Oui</button></div></section>
    <section id="setLess"><h3>Moins de ça <small>baissé dans ton fil, jamais caché</small></h3>
      ${items.length ? `<div class="chips">${items.join("")}</div><p class="note" style="margin:6px 0 0">Touche un élément pour le remettre comme avant.</p>`
        : `<p class="note" style="margin:0">Rien pour l'instant. Appuie longtemps sur une histoire, puis choisis « Moins de… ».</p>`}</section>
    ${"setAppBadge" in navigator ? `<section><h3>Pastille sur l'icône</h3>
      <div class="seg seg-big" role="group"><button type="button" data-badge-set="0" aria-pressed="${!badgeOn()}">Non</button><button type="button" data-badge-set="1" aria-pressed="${badgeOn()}">Oui</button></div>
      <p class="note" style="margin:6px 0 0">Le nombre d'histoires non lues sur tes sujets suivis, sur l'icône de Prisme. L'iPhone le met à jour quand Prisme s'ouvre ou vient de servir.</p></section>` : ""}`;
}
document.addEventListener("click", async (e) => {
  const c = e.target.closest("[data-unless-cat], [data-unless-med]");
  if (c) {
    if (c.dataset.unlessCat) less.delCat(c.dataset.unlessCat); else less.delMed(c.dataset.unlessMed);
    state.feeds.clear();
    const sec = $("#setLess");
    if (sec) { const t = document.createElement("div"); t.innerHTML = settingsExtra(); const fresh = t.querySelector("#setLess"); if (fresh) sec.replaceWith(fresh); }
    return;
  }
  const gq = e.target.closest("[data-gnpref]");
  if (gq) { store.set("gnPref", gq.dataset.gnpref); $$("[data-gnpref]").forEach((x) => x.setAttribute("aria-pressed", x === gq)); return; }
  const so = e.target.closest("[data-soir-set]");
  if (so) { store.set("soir", so.dataset.soirSet); applySoir(); $$("[data-soir-set]").forEach((x) => x.setAttribute("aria-pressed", x === so)); return; }
  const sm = e.target.closest("[data-simple-set]");
  if (sm) { store.set("simple", sm.dataset.simpleSet); applySimple(); $$("[data-simple-set]").forEach((x) => x.setAttribute("aria-pressed", x === sm)); return; }
  const b = e.target.closest("[data-badge-set]");
  if (b) {
    const want = b.dataset.badgeSet === "1";
    if (want && "Notification" in window && Notification.permission === "default") await Notification.requestPermission().catch(() => {});
    if (want && "Notification" in window && Notification.permission === "denied") { toast("Autorise les notifications de Prisme dans les réglages de l'iPhone."); return; }
    store.set("badge", want ? "1" : "0");
    $$("[data-badge-set]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.badgeSet === (want ? "1" : "0")));
    updateBadge();
    if (want && !topics.list().length) toast("Suis un sujet pour voir la pastille bouger.");
  }
});

/* ---------- Encore des touches : cartes d'accueil, à lire plus tard, pincer, lecture simple, sélection ---------- */
// Petite vibration (Android ; l'iPhone ne la permet pas aux apps web).
const buzz = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* sans vibreur */ } };
const todayKey = () => dayKey(new Date().toISOString());

// À lire plus tard : une file à part des favoris, qui se vide d'elle-même une fois lu.
const later = Object.assign(listStore("later", 200), {
  has(k) { return this.list().some((x) => x.k === k); },
  toggle(item) { const l = this.list(); const on = !l.some((x) => x.k === item.k); this.save(on ? [{ ...item, at: Date.now() }, ...l] : l.filter((x) => x.k !== item.k)); return on; },
  remove(k) { const l = this.list(); if (l.some((x) => x.k === k)) { this.save(l.filter((x) => x.k !== k)); syncLater(k, false); } },
});
const CLOCK = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>';
function laterBtn(item, label = false) {
  const on = later.has(item.k);
  return `<button class="act act-later${label ? " act-l" : ""}" type="button" data-later="${esc(JSON.stringify(item))}" data-later-key="${esc(item.k)}" aria-pressed="${on}" title="${on ? "Retirer de « À lire »" : "Lire plus tard"}"><svg viewBox="0 0 24 24" aria-hidden="true">${CLOCK}</svg>${label ? `<span>${on ? "Retirer" : "Plus tard"}</span>` : ""}</button>`;
}
function syncLater(k, on) {
  for (const b of $$(`[data-later-key="${CSS.escape(k)}"]`)) {
    b.setAttribute("aria-pressed", on);
    b.title = on ? "Retirer de « À lire »" : "Lire plus tard";
    const sp = $("span", b); if (sp) sp.textContent = on ? "Retirer" : "Plus tard";
  }
}
function toggleLater(item) {
  const on = later.toggle(item);
  syncLater(item.k, on);
  buzz();
  if (item.type === "s" && on) { const st = state.stories.get(item.id); if (st) saveFavStory(st); }
  toastUndo(on ? "Ajouté à « À lire »" : "Retiré de « À lire »", () => { later.toggle(item); syncLater(item.k, !on); });
  return on;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-later]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  toggleLater(JSON.parse(b.dataset.later));
  if (state.route?.view === "favoris" && store.get("favTab") === "plustard") setTimeout(() => viewFavs($("#view"), "plustard"), 900);
}, true);

// Cartes en haut du fil : « Ton matin » (avant 10 h) et « Ma ville aujourd'hui ». Un ✕ ou un glisser les range pour la journée.
function homeCards(route) {
  if (route.cat !== "une" || route.lens === "local") return "";
  const h = new Date().getHours();
  const matin = h >= 5 && h < 10 && store.get("hcMatin") !== todayKey();
  const ville = false; // remplacée par la rangée de la ville dans le fil
  return `${matin ? `<aside class="hcard hc-matin" data-hc="hcMatin">
      <span class="hc-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON.matin}</svg></span>
      <a class="hc-body" href="${href({ v: "matin" })}" data-nav><b>Ton matin en 5 histoires</b><span>De gauche, du centre et de droite · environ 3 minutes</span></a>
      <button class="icon-btn hc-x" type="button" data-hc-x aria-label="Ranger pour aujourd'hui"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </aside>` : ""}
    ${ville ? `<aside class="hcard hc-ville" data-hc="hcVille" id="hcVille" hidden></aside>` : ""}`;
}
let cityCache = null;
function dismissCard(c) {
  store.set(c.dataset.hc, todayKey());
  c.style.height = `${c.offsetHeight}px`;
  requestAnimationFrame(() => { c.classList.add("gone"); c.style.height = "0px"; c.style.marginTop = "0px"; });
  setTimeout(() => c.remove(), 320);
}
document.addEventListener("click", (e) => { const x = e.target.closest("[data-hc-x]"); if (x) dismissCard(x.closest(".hcard")); });
{
  let c = null, x0 = 0, y0 = 0;
  addEventListener("touchstart", (e) => { c = e.touches.length === 1 ? e.target.closest(".hcard") : null; if (c) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (!c) return;
    const dx = e.touches[0].clientX - x0;
    if (Math.abs(e.touches[0].clientY - y0) > 30) { c.style.transform = ""; c = null; return; }
    c.style.transform = `translateX(${dx}px)`; c.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / 300));
  }, { passive: true });
  addEventListener("touchend", (e) => {
    if (!c) return;
    const dx = e.changedTouches[0].clientX - x0, card = c; c = null;
    if (Math.abs(dx) > 90) dismissCard(card); else { card.style.transform = ""; card.style.opacity = ""; }
  }, { passive: true });
}

// Pincer dans une histoire pour grossir ou réduire le texte (comme dans Photos).
{
  let d0 = 0, s0 = 1, on = false;
  const inStory = (t) => !!t?.closest && (!!t.closest("#panelBody") || (state.route?.view === "story" && !!t.closest("#view")));
  const dist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  const clamp = (x) => Math.max(SCALES[0][0], Math.min(SCALES[SCALES.length - 1][0], x));
  addEventListener("touchstart", (e) => { if (e.touches.length === 2 && inStory(e.target)) { d0 = dist(e) || 1; s0 = prefs.scale; on = true; } }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (!on || e.touches.length !== 2) return;
    document.documentElement.style.setProperty("--scale", String(clamp(s0 * (dist(e) / d0))));
  }, { passive: true });
  addEventListener("touchend", (e) => {
    if (!on || e.touches.length >= 2) return;
    on = false;
    const cur = Number(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || s0;
    const [v, label] = SCALES.reduce((best, x) => (Math.abs(x[0] - cur) < Math.abs(best[0] - cur) ? x : best));
    store.set("scale", String(v)); applyScale();
    if (v !== s0) { buzz(); toast(`Taille du texte : ${label}`); }
  }, { passive: true });
  // iPhone : pas de zoom de la page pendant qu'on pince dans une histoire.
  for (const t of ["gesturestart", "gesturechange"]) document.addEventListener(t, (e) => { if (inStory(e.target)) e.preventDefault(); });
}

// Lecture simple : sans barres de couleur ni étiquettes, juste les titres et les résumés.
const applySimple = () => document.documentElement.classList.toggle("simple", store.get("simple") === "1");
applySimple();

// Sélectionner plusieurs histoires et les partager d'un coup (par exemple à la famille).
function enterSelect(first) {
  state.sel = new Map();
  document.body.classList.add("selecting");
  let bar = $("#selBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "selBar"; bar.className = "sel-bar"; bar.setAttribute("role", "toolbar");
    document.body.appendChild(bar);
    bar.onclick = (e) => {
      const b = e.target.closest("[data-selb]");
      if (!b) return;
      if (b.dataset.selb === "share") shareSelected();
      else exitSelect();
    };
  }
  if (first) toggleSel(first);
  drawSelBar();
}
function exitSelect() {
  if (!state.sel) return;
  state.sel = null;
  document.body.classList.remove("selecting");
  $$(".picked").forEach((c) => c.classList.remove("picked"));
  $("#selBar")?.remove();
}
function toggleSel(s) {
  if (state.sel.has(s.id)) state.sel.delete(s.id); else state.sel.set(s.id, s);
  for (const c of cardsOf(s.id)) c.classList.toggle("picked", state.sel.has(s.id));
  buzz(6);
  drawSelBar();
}
function drawSelBar() {
  const bar = $("#selBar");
  if (!bar) return;
  const n = state.sel?.size || 0;
  bar.innerHTML = `<span class="sel-n">${n ? `${n} ${n > 1 ? "histoires choisies" : "histoire choisie"}` : "Touche les histoires à partager"}</span>
    <button class="btn ghost" type="button" data-selb="cancel">Annuler</button>
    <button class="btn" type="button" data-selb="share"${n ? "" : " disabled"}>Partager</button>`;
}
async function shareSelected() {
  const list = [...(state.sel?.values() || [])];
  if (!list.length) return;
  const text = `${list.length > 1 ? `${list.length} nouvelles` : "Une nouvelle"} à lire sur Prisme, vues de gauche, du centre et de droite :\n\n`
    + list.map((s) => `• ${s.titleFr || s.title}\n${absUrl(href({ h: s.id }))}`).join("\n\n");
  exitSelect();
  if (navigator.share) { try { await navigator.share({ title: "Prisme", text }); return; } catch (e) { if (e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(text); toast("Copié : colle-le dans ton message."); } catch { prompt("Copie ce texte :", text); }
}
document.addEventListener("click", (e) => {
  if (!state.sel || e.target.closest("#selBar")) return;
  const card = e.target.closest("#view .story, #view .lead");
  if (!card) return;
  e.preventDefault(); e.stopPropagation();
  const s = state.stories.get(cardId(card));
  if (s) toggleSel(s);
}, true);
addEventListener("keydown", (e) => { if (e.key === "Escape") exitSelect(); });

/* ---------- Encore plus iPhone : vidéos en bref, titre qui se réduit, feuilles à glisser, raccourcis ---------- */
// En bref · Vidéos : les vidéos des médias, une par écran, qui démarrent seules (sans le son, comme Instagram).
const vidSlide = (v) => `<section class="sh sh-v" data-vid="${esc(v.id)}">
    <img class="sh-blur" src="${esc(safeUrl(v.thumb))}" alt="" loading="lazy" referrerpolicy="no-referrer">
    <div class="sh-player"><img src="${esc(safeUrl(v.thumb))}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="sh-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg></span>
      <button class="sh-sound" type="button" data-sound aria-pressed="${state.vidSound ? "true" : "false"}">${state.vidSound ? "🔊 Son" : "🔇 Son"}</button></div>
    <div class="sh-in">
      <div class="sh-k">${badge(v.media)} <span class="sh-ch" data-no-tr>${esc(v.channel)}</span> · ${esc(ago(v.published))}</div>
      <h2 data-no-tr>${esc(v.title)}</h2>
      <p class="sh-hint">Touche « Son » pour entendre · glisse vers le haut</p>
    </div>
  </section>`;
// Le lecteur YouTube, sans ses commandes (titre, réglages, liens) : Prisme garde un seul bouton « Son ».
// (Les avis obligatoires de YouTube, comme « promotion payée », restent affichés par YouTube.)
const ytSend = (f, func) => { try { f.contentWindow.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*"); } catch { /* lecteur pas prêt */ } };
function playSlide(sec, on) {
  const box = $(".sh-player", sec);
  if (!box) return;
  const f = $("iframe", box);
  if (on && !f) {
    box.insertAdjacentHTML("beforeend", `<iframe src="https://www.youtube-nocookie.com/embed/${sec.dataset.vid}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=0&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="Vidéo" allow="autoplay; encrypted-media; picture-in-picture"></iframe>`);
    const nf = $("iframe", box);
    // Le son déjà ouvert sur la vidéo d'avant : on le garde.
    nf.addEventListener("load", () => { if (state.vidSound) [600, 1500].forEach((t) => setTimeout(() => ytSend(nf, "unMute"), t)); });
    const sb = $("[data-sound]", sec);
    if (sb) { sb.setAttribute("aria-pressed", String(!!state.vidSound)); sb.textContent = state.vidSound ? "🔊 Son" : "🔇 Son"; }
  }
  if (!on && f) f.remove();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-sound]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  state.vidSound = !state.vidSound;
  const f = $("iframe", b.closest(".sh-player"));
  if (f) { ytSend(f, state.vidSound ? "unMute" : "mute"); ytSend(f, "playVideo"); }
  b.setAttribute("aria-pressed", String(state.vidSound));
  b.textContent = state.vidSound ? "🔊 Son" : "🔇 Son";
}, true);
async function openVideoBref() {
  closeShorts();
  const o = document.createElement("div");
  o.id = "shorts";
  o.classList.add("sh-videos");
  o.innerHTML = `${shBar("video", prefs.city ? prefs.cityLabel || "Ma ville" : "")}<div class="sh-sc" id="shSc"><section class="sh sh-div"><div class="sh-in"><h2>Les vidéos…</h2></div></section></div>`;
  document.body.appendChild(o);
  document.body.classList.add("shorts-open");
  requestAnimationFrame(() => o.classList.add("on"));
  o.onclick = shClick;
  const d = await api(`/api/videos?region=${state.region}`).catch(() => null);
  const list = (d?.videos || []).filter((v) => /^[\w-]{6,20}$/.test(v.id)).sort((a, b) => (b.published || "").localeCompare(a.published || ""));
  const sc = $("#shSc", o);
  if (!o.isConnected) return;
  if (!list.length) { sc.innerHTML = `<section class="sh sh-div"><div class="sh-in"><h2>Aucune vidéo pour l'instant.</h2></div></section>`; return; }
  let shown = 0;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      playSlide(en.target, en.isIntersecting);
      if (!en.isIntersecting) continue;
      const i = [...sc.children].indexOf(en.target);
      $("#shPos", o).textContent = `${i + 1} / ${list.length} · ${en.target.querySelector(".sh-ch")?.textContent || ""}`;
      if (i >= shown - 3) add();
    }
  }, { root: sc, threshold: 0.7 });
  o._io = io;
  const add = () => {
    const next = list.slice(shown, shown + 12);
    if (!next.length) return;
    const before = sc.children.length;
    sc.insertAdjacentHTML("beforeend", next.map(vidSlide).join(""));
    shown += next.length;
    for (const el of [...sc.children].slice(before)) io.observe(el);
  };
  sc.innerHTML = "";
  add();
  // Toucher l'image avant que la vidéo démarre : elle démarre.
  sc.addEventListener("click", (e) => { const s = e.target.closest(".sh-v"); if (s && e.target.closest(".sh-player img, .sh-play")) playSlide(s, true); });
}

// Grand titre de page qui se range dans le bandeau quand on descend (comme Mail et Notes).
{
  const t = document.createElement("span");
  t.className = "page-title";
  t.setAttribute("aria-hidden", "true");
  $(".logo")?.insertAdjacentElement("afterend", t);
  let last = "";
  const check = () => {
    const h = $("#view h1");
    const bar = $("#topbar");
    if (!h || !bar || innerWidth > 760) { bar?.classList.remove("has-title"); return; }
    const gone = h.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom;
    const text = (h.firstChild?.textContent || h.textContent).replace(/\s+/g, " ").trim().slice(0, 40);
    if (text !== last) { last = text; t.textContent = text; }
    bar.classList.toggle("has-title", gone);
  };
  addEventListener("scroll", check, { passive: true });
  addEventListener("popstate", () => setTimeout(check, 50));
}

// Les fenêtres (Réglages, Plus, fiches) : une poignée, et on les ferme en glissant vers le bas.
{
  let y0 = null, dy = 0, box = null;
  addEventListener("touchstart", (e) => {
    box = e.target.closest("#modal.open .modal-box");
    if (!box || innerWidth > 760 || e.touches.length !== 1) { box = null; return; }
    const scroller = box.querySelector("#modalBody") || box;
    if (scroller.scrollTop > 0 && !e.target.closest(".modal-grab")) { box = null; return; }
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (!box) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { box.style.transition = "none"; box.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  addEventListener("touchend", () => {
    if (!box) return;
    const b = box; box = null;
    b.style.transition = "transform .22s ease";
    if (dy > 110) { b.style.transform = "translateY(100%)"; setTimeout(() => { closeLayer("#modal"); b.style.transform = ""; b.style.transition = ""; }, 200); }
    else { b.style.transform = ""; setTimeout(() => { b.style.transition = ""; }, 230); }
  }, { passive: true });
}

// La couleur de la barre d'état suit le bandeau (noir, ou vrai noir en mode OLED).
function syncThemeColor() {
  const m = $('meta[name="theme-color"]');
  if (m) m.content = document.documentElement.dataset.theme === "oled" ? "#000000" : "#141414";
}

// La taille du texte suit celle choisie dans les réglages de l'iPhone (tant qu'on ne l'a pas choisie dans Prisme).
function iosTextRatio() {
  if (iosTextRatio.v !== undefined) return iosTextRatio.v;
  iosTextRatio.v = 0;
  try {
    if (!/iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return 0;
    const p = document.createElement("span");
    p.style.font = "-apple-system-body";
    if (!p.style.font) return 0;
    p.style.position = "absolute"; p.style.visibility = "hidden";
    document.body.appendChild(p);
    const px = parseFloat(getComputedStyle(p).fontSize);
    p.remove();
    if (px) iosTextRatio.v = Math.max(0.9, Math.min(1.4, Math.round((px / 17) * 100) / 100));
  } catch { /* pas d'iPhone */ }
  return iosTextRatio.v;
}

/* ================= Visuel : ouverture animée, face à face, fil de l'histoire, météo, tri ================= */
// Toucher une carte : sa photo grandit jusqu'au haut de l'histoire (comme l'App Store).
document.addEventListener("click", (e) => {
  state.flip = null;
  const a = e.target.closest("a[data-nav]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button || reduceMotion() || !/[?&]h=/.test(a.getAttribute("href") || "")) return;
  const card = a.closest("article, aside");
  const img = card && card.querySelector(".c2-img img, .hero-media img, .big-media img, .lead-media img, .mini-img img");
  if (!img || !img.complete || !img.naturalWidth) return;
  const r = img.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight || !r.width) return;
  state.flip = { src: img.currentSrc || img.src, r, at: Date.now() };
}, true);
function runFlip(v) {
  const f = state.flip;
  state.flip = null;
  if (!f || Date.now() - f.at > 1500) return;
  const hero = $(".s-hero-top img", v);
  if (!hero) return;
  const box = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  const g = document.createElement("img");
  g.className = "flip-ghost"; g.alt = ""; g.referrerPolicy = "no-referrer"; g.src = f.src;
  Object.assign(g.style, box(f.r));
  document.body.appendChild(g);
  hero.style.opacity = "0";
  // On attend que la page (ou le panneau) soit en place pour viser le bon endroit.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const card = v.closest(".panel-card");
    let ty = 0;
    try { if (card) ty = new DOMMatrixReadOnly(getComputedStyle(card).transform).m42 || 0; } catch { /* pas de transformation */ }
    const t = hero.getBoundingClientRect();
    const to = { left: t.left, top: t.top - ty, width: t.width, height: t.height };
    if (!to.width) { hero.style.opacity = ""; g.remove(); return; }
    const anim = g.animate([{ ...box(f.r), borderRadius: "8px" }, { ...box(to), borderRadius: "0px" }], { duration: 400, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    anim.onfinish = () => { hero.style.opacity = ""; g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }).onfinish = () => g.remove(); };
  }));
}

// Les chiffres qui comptent : « 13 médias » monte de 0 à 13 quand il apparaît.
function countUp(root) {
  if (reduceMotion()) return;
  for (const el of $$("[data-count]:not([data-counted])", root)) {
    el.dataset.counted = "1";
    const n = Number(el.dataset.count);
    if (!(n > 1)) continue;
    const t0 = performance.now(), dur = Math.min(900, 380 + n * 25);
    el.textContent = "0";
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = String(Math.round(n * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// Lecture du soir : de 21 h à 6 h, des couleurs plus chaudes (réglage « Lecture du soir »).
function applySoir() {
  const h = new Date().getHours();
  document.documentElement.classList.toggle("soir", store.get("soir") !== "0" && (h >= 21 || h < 6));
}
setInterval(applySoir, 60e3);

// Face à face : le titre d'un média de gauche et celui d'un média de droite, côte à côte (même sur téléphone).
function faceToFace(s) {
  const want = s.lang || "fr";
  const pick = (keys) => {
    const l = s.articles.filter((a) => keys.includes(biasKey(a.media)));
    return l.find((a) => (a.lang || "fr") === want && a.media?.known) || l.find((a) => (a.lang || "fr") === want) || l[0];
  };
  const L = pick(["l2", "l1"]), R = pick(["r2", "r1"]);
  if (!L || !R || L.title === R.title) return "";
  const col = (a, side, label) => `<a class="ff-c ff-${side}" href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${readAttr(a)}">
      <span class="ff-h">${label}</span>
      <b data-no-tr>${esc(a.title)}</b>
      <span class="ff-src">${favicon(a.domain, a.sourceName)}<span data-no-tr>${esc(a.sourceName)}</span></span></a>`;
  return `<section class="sec ff"><h2 class="block-h">Face à face <small>la même nouvelle, deux titres</small></h2>
    <div class="ff-g">${col(L, "l", "À gauche")}${col(R, "r", "À droite")}</div></section>`;
}

// Le fil de l'histoire : jour après jour, le premier titre et combien de médias en ont parlé.
function storyThread(s) {
  const arts = s.articles.filter((a) => a.published).sort((a, b) => a.published.localeCompare(b.published));
  const days = new Map();
  for (const a of arts) {
    const k = new Date(a.published).toLocaleDateString("en-CA");
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(a);
  }
  if (days.size < 2) return "";
  const today = new Date().toLocaleDateString("en-CA"), yest = new Date(Date.now() - 864e5).toLocaleDateString("en-CA");
  const all = [...days.entries()];
  const label = (k, d) => (k === today ? "Aujourd'hui" : k === yest ? "Hier" : d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }));
  return `<section class="sec thread"><h2 class="block-h">Le fil de l'histoire <small>${plural(days.size, "jour")}</small></h2>
    <ol class="th">${all.slice(-5).map(([k, l]) => {
      const i = all.findIndex(([x]) => x === k);
      const n = new Set(l.map((a) => a.domain)).size;
      return `<li><span class="th-d"><b>Jour ${i + 1}</b> · ${esc(label(k, new Date(l[0].published)))}</span>
        <span class="th-t" data-no-tr>${esc(l[0].title)}</span>
        <span class="th-n">${favicon(l[0].domain, l[0].sourceName)}<span data-no-tr>${esc(l[0].sourceName)}</span> en premier, à ${esc(clock(l[0].published))}${n > 1 ? ` · ${plural(n, "média")} ce jour-là` : ""}</span></li>`;
    }).join("")}</ol></section>`;
}

// La météo de ta ville (Open-Meteo : gratuit, sans clé ; seule la ville est envoyée). Gardée 30 minutes.
const WMO = (c) => (c === 0 ? ["☀️", "Ensoleillé"] : c <= 2 ? ["🌤️", "Partiellement nuageux"] : c === 3 ? ["☁️", "Nuageux"] : c <= 48 ? ["🌫️", "Brouillard"] : c <= 57 ? ["🌦️", "Bruine"]
  : c <= 67 ? ["🌧️", "Pluie"] : c <= 77 ? ["🌨️", "Neige"] : c <= 82 ? ["🌧️", "Averses"] : c <= 86 ? ["🌨️", "Averses de neige"] : ["⛈️", "Orages"]);
async function weather(city) {
  try { const c = JSON.parse(store.get(`wx.${city.s}`, "null")); if (c?.hours && Date.now() - c.at < 30 * 60e3) return c; } catch { /* rien en mémoire */ }
  let geo = null;
  try { geo = JSON.parse(store.get(`geo.${city.s}`, "null")); } catch { /* rien en mémoire */ }
  if (!geo) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.n)}&count=10&language=fr&countryCode=CA`).then((x) => x.json());
    const prov = foldText(PROV_NAME[city.pr] || "");
    const hit = (r.results || []).find((x) => foldText(x.admin1) === prov) || (r.results || [])[0];
    if (!hit) return null;
    geo = { lat: hit.latitude, lon: hit.longitude };
    store.set(`geo.${city.s}`, JSON.stringify(geo));
  }
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}`
    + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day"
    + "&hourly=temperature_2m,weather_code,precipitation_probability"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset"
    + "&timezone=auto&forecast_days=6").then((x) => x.json());
  if (!w.current) return null;
  const r = Math.round, d = w.daily || {}, h = w.hourly || {};
  // Les 24 prochaines heures, à partir de l'heure en cours (heure locale de la ville).
  const now = String(w.current.time || "").slice(0, 13);
  const k0 = Math.max(0, (h.time || []).findIndex((t) => t.slice(0, 13) >= now));
  const out = {
    at: Date.now(), t: r(w.current.temperature_2m), feel: r(w.current.apparent_temperature), code: w.current.weather_code,
    day: w.current.is_day !== 0, wind: r(w.current.wind_speed_10m), max: r(d.temperature_2m_max?.[0]), min: r(d.temperature_2m_min?.[0]),
    rain: d.precipitation_probability_max?.[0] ?? null, rise: d.sunrise?.[0] || "", set: d.sunset?.[0] || "",
    hours: (h.time || []).slice(k0, k0 + 24).map((t, i) => ({ t, temp: r(h.temperature_2m[k0 + i]), code: h.weather_code[k0 + i], p: h.precipitation_probability?.[k0 + i] ?? null })),
    days: (d.time || []).map((t, i) => ({ t, code: d.weather_code[i], max: r(d.temperature_2m_max[i]), min: r(d.temperature_2m_min[i]), p: d.precipitation_probability_max?.[i] ?? null, rise: d.sunrise?.[i] || "", set: d.sunset?.[i] || "" })),
  };
  store.set(`wx.${city.s}`, JSON.stringify(out));
  try {
    const keep = new Set([prefs.city, ...wxSaved(), city.s]);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i) || "";
      const m = k.match(/^prisme\.(?:wx|geo)\.(.+)$/);
      if (m && !keep.has(m[1])) localStorage.removeItem(k);
    }
  } catch { /* stockage indisponible */ }
  return out;
}
// L'icône de nuit pour un ciel dégagé.
const wxIco = (code, day = true) => (!day && code <= 1 ? "🌙" : !day && code === 2 ? "☁️" : WMO(code)[0]);
const isDayAt = (iso, days) => { const dd = days?.find((x) => x.t === iso.slice(0, 10)); return !dd || !dd.rise ? true : iso >= dd.rise && iso < dd.set; };
async function fillWeather(el, city) {
  if (!el || !navigator.onLine) return;
  const w = await weather(city).catch(() => null);
  if (!w || !el.isConnected) return;
  const [ico, lbl] = WMO(w.code);
  el.innerHTML = `<span aria-hidden="true">${ico}</span><b>${w.t}°</b><small>${esc(lbl)}${Number.isFinite(w.max) ? ` · ${w.max}° / ${w.min}°` : ""}</small>`;
  el.title = `${lbl}, ${w.t}° (max ${w.max}°, min ${w.min}°)`;
  el.classList.add("on");
  // Toucher la météo ouvre la feuille météo.
  if (el.tagName !== "BUTTON") { el.setAttribute("role", "button"); el.tabIndex = 0; }
  el.dataset.wxCity = city.s;
}

// La pastille météo en haut, à côté de ta ville : toujours visible, même en descendant.
// La ville de la météo : ta ville, ou une autre choisie dans la feuille météo (chalet, parents…).
const wxSaved = () => { try { return JSON.parse(store.get("wxCities", "[]")); } catch { return []; } };
const wxSlug = () => { const s = store.get("wxSel", ""); return s && (s === prefs.city || wxSaved().includes(s)) ? s : prefs.city; };
async function drawCatWx() {
  const b = $("#catWx");
  if (!b || !prefs.city || !navigator.onLine) return;
  const city = (await villesData().catch(() => null))?.bySlug.get(wxSlug());
  if (!city || !b.isConnected) return;
  b.dataset.other = city.s !== prefs.city ? city.n : "";
  // D'abord ce qu'on a en mémoire (instantané), puis à jour si c'est vieux.
  let w = null;
  try { w = JSON.parse(store.get(`wx.${city.s}`, "null")); } catch { /* rien */ }
  const paint = (x) => { if (!x?.hours || !b.isConnected) return; b.innerHTML = `<span aria-hidden="true">${wxIco(x.code, x.day)}</span>${x.t}°${b.dataset.other ? `<small data-no-tr>${esc(b.dataset.other)}</small>` : ""}`; b.title = `Météo à ${city.n} : ${WMO(x.code)[1]}, ${x.t}°`; b.hidden = false; };
  paint(w);
  if (!w?.hours || Date.now() - w.at > 30 * 60e3) paint(await weather(city).catch(() => null));
}
setInterval(drawCatWx, 15 * 60e3);

// La feuille météo : maintenant, les prochaines heures, les 5 prochains jours.
async function openWeather(slug, { add = false } = {}) {
  const V = await villesData().catch(() => null);
  const city = V?.bySlug.get(slug || wxSlug());
  if (!city) return;
  // Les villes de la météo : ta ville, puis celles ajoutées (jusqu'à 4).
  const list = [...new Set([prefs.city, ...wxSaved()].filter(Boolean))].map((x) => V.bySlug.get(x)).filter(Boolean);
  const chips = `<div class="wx-cities">${list.map((c) => `<span class="wx-city${c.s === city.s ? " on" : ""}"><button type="button" data-wx-pick="${esc(c.s)}">${c.s === prefs.city ? "📍 " : ""}${esc(c.n)}</button>${c.s !== prefs.city ? `<button class="wx-del" type="button" data-wx-del="${esc(c.s)}" aria-label="Retirer ${esc(c.n)}">✕</button>` : ""}</span>`).join("")}
      ${wxSaved().length < 4 ? `<button class="wx-add" type="button" data-wx-add>+ Ajouter une ville</button>` : ""}</div>
    <div class="wx-addbox" id="wxAddBox"${add ? "" : " hidden"}><input class="set-select" id="wxAddIn" placeholder="Chalet, parents… tape le nom de la ville" autocomplete="off"></div>`;
  openModal(`<div class="modal-pad wx-sheet">${chips}<div class="loader">Météo de ${esc(city.n)}…</div></div>`, true);
  bindWxSheet(V);
  if (add) setTimeout(() => $("#wxAddIn")?.focus(), 250);
  const w = await weather(city).catch(() => null);
  const body = $("#modalBody");
  if (!body || !$(".wx-sheet", body)) return;
  if (!w?.hours) { $(".wx-sheet .loader", body)?.replaceWith(Object.assign(document.createElement("p"), { className: "note", textContent: "La météo n'a pas pu se charger. Vérifie ta connexion et réessaie." })); return; }
  const [, lbl] = WMO(w.code);
  const hm = (iso) => iso.slice(11, 16).replace(":", " h ").replace(/ h 00$/, " h");
  const dayName = (iso, i) => (i === 0 ? "Aujourd'hui" : i === 1 ? "Demain" : new Date(`${iso}T12:00`).toLocaleDateString(LOCALE, { weekday: "long" }));
  const lo = Math.min(...w.days.map((d) => d.min)), hi = Math.max(...w.days.map((d) => d.max)), span = Math.max(1, hi - lo);
  const hours = w.hours.filter((_, i) => i % 3 === 0).slice(0, 8);
  const ld = $(".wx-sheet .loader", body);
  if (!ld) return;
  ld.outerHTML = `<div class="wx-body">
    <div class="kicker">${pin} ${esc(city.n)}</div>
    <div class="wx-now">
      <span class="wx-big" aria-hidden="true">${wxIco(w.code, w.day)}</span>
      <div><b class="wx-t">${w.t}°</b><span class="wx-l">${esc(lbl)}</span>
        <span class="wx-s">Ressenti ${w.feel}° · Vent ${w.wind} km/h${w.rain >= 10 ? ` · Pluie ${w.rain} %` : ""}</span>
        <span class="wx-s">Max ${w.max}° · Min ${w.min}°${w.rise ? ` · ☀︎ ${hm(w.rise)} – ${hm(w.set)}` : ""}</span></div>
    </div>
    <h3 class="wx-h">Les prochaines heures</h3>
    <ol class="wx-hours">${hours.map((x, i) => `<li><span>${i === 0 ? "Maint." : hm(x.t)}</span><b aria-hidden="true">${wxIco(x.code, isDayAt(x.t, w.days))}</b><span class="wx-ht">${x.temp}°</span>${x.p >= 10 ? `<small>${x.p} %</small>` : "<small></small>"}</li>`).join("")}</ol>
    <h3 class="wx-h">Les prochains jours</h3>
    <ol class="wx-days">${w.days.slice(0, 6).map((d, i) => `<li><span class="wx-dn">${esc(dayName(d.t, i))}</span><b aria-hidden="true">${WMO(d.code)[0]}</b>
      <small class="wx-dp">${d.p >= 10 ? `${d.p} %` : ""}</small><span class="wx-dmin">${d.min}°</span>
      <span class="wx-range"><i style="left:${((d.min - lo) / span) * 100}%;right:${100 - ((d.max - lo) / span) * 100}%"></i></span><span class="wx-dmax">${d.max}°</span></li>`).join("")}</ol>
    <p class="note wx-src">Données Open-Meteo, mises à jour aux 30 minutes. Alertes : Environnement Canada. Pannes : Hydro-Québec. <a class="link" href="${href({ ville: city.s })}" data-nav data-close-modal>Les nouvelles de ${esc(city.n)} →</a></p>
  </div>`;
  // Alertes en vigueur et pannes à proximité : en tête de la feuille, avec le texte complet de l'alerte.
  localNotices(city).then(({ al, out }) => {
    const wb = $("#modalBody .wx-body");
    if (!wb || (!al.length && !(out?.clients > 0))) return;
    wb.insertAdjacentHTML("afterbegin", `<div class="wx-alerts">${al.map((a) => `<details class="wx-alert nt-${esc(a.type)}"><summary>⚠️ ${esc(a.name)}</summary><p>${esc(a.text).replace(/\n+/g, "<br>")}</p></details>`).join("")}${out?.clients > 0 ? `<p class="wx-out">⚡ <b>${out.clients.toLocaleString(LOCALE)}</b> ${out.clients > 1 ? "clients" : "client"} d'Hydro-Québec sans courant à moins de 30 km (${plural(out.n, "panne")}, ${esc(ago(out.at))}).</p>` : ""}</div>`);
  }).catch(() => {});
}
// Les gestes de la feuille météo : changer de ville, en ajouter une, en retirer une.
function bindWxSheet(V) {
  const box = $("#modalBody .wx-sheet");
  if (!box) return;
  box.addEventListener("click", (e) => {
    const p = e.target.closest("[data-wx-pick]"), d = e.target.closest("[data-wx-del]"), a = e.target.closest("[data-wx-add]");
    if (p) { store.set("wxSel", p.dataset.wxPick); drawCatWx(); openWeather(p.dataset.wxPick); }
    else if (d) {
      store.set("wxCities", JSON.stringify(wxSaved().filter((x) => x !== d.dataset.wxDel)));
      drawCatWx(); openWeather(wxSlug());
    } else if (a) { const ab = $("#wxAddBox"); ab.hidden = false; $("#wxAddIn").focus(); }
  });
  const inp = $("#wxAddIn");
  if (!inp) return;
  cityAuto(inp, V);
  inp.addEventListener("change", () => {
    const f = foldText(inp.value).trim();
    const hit = V.list.find((x) => foldText(villeLabel(x)) === f) || matchVilles(V, inp.value, 1)[0];
    if (!hit) return;
    if (hit.s !== prefs.city) store.set("wxCities", JSON.stringify([...new Set([...wxSaved(), hit.s])].slice(-4)));
    store.set("wxSel", hit.s);
    drawCatWx();
    openWeather(hit.s);
  });
}
// Toucher la météo : la feuille. Toucher longtemps la pastille : ajouter une autre ville.
{
  let timer = null, longDone = false;
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#catWx")) return;
    longDone = false;
    timer = setTimeout(() => { longDone = true; buzz(15); openWeather(wxSlug(), { add: true }); }, 550);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) document.addEventListener(ev, () => clearTimeout(timer));
  document.addEventListener("contextmenu", (e) => { if (e.target.closest("#catWx")) e.preventDefault(); });
  document.addEventListener("click", (e) => {
    const x = e.target.closest("#catWx, [data-wx-city]");
    if (!x) return;
    e.preventDefault(); e.stopPropagation();
    if (longDone) { longDone = false; return; }
    openWeather(x.id === "catWx" ? wxSlug() : x.dataset.wxCity);
  }, true);
}
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-wx-city]")) { e.preventDefault(); openWeather(e.target.dataset.wxCity); } });

// Trier le fil (téléphone) : un seul bouton « Trier : L'essentiel ▾ » au lieu de deux rangées de boutons.
function openSortSheet(route) {
  const list = Object.entries(LENSES).filter(([k, l]) => (!l.qc || ["qc", "ca"].includes(state.region)) && (k !== "local" || prefs.city));
  // Les 4 choix les plus utiles, avec une phrase courte ; les autres sous « Plus de choix ».
  const SHORT = { essentiel: "Les plus importantes, couvertes par le plus de médias.", recent: "Tout, du plus récent au plus ancien.", local: "Les nouvelles de ta ville et de sa région.", angles: "Ce qu'un côté couvre et que l'autre ignore." };
  const main = ["essentiel", "recent", "local", "angles"];
  const item = ([k, l]) => `<li><button type="button" data-sort="${k}" aria-pressed="${route.lens === k}">
      <span class="so-t">${l.sw ? `<span class="sw" style="background:${l.sw}"></span>` : ""}${k === "local" ? `📍 ${esc(prefs.cityLabel || "Ma ville")}` : esc(l.label)}</span>
      <small>${esc(SHORT[k] || l.desc)}</small></button></li>`;
  const first = list.filter(([k]) => main.includes(k)), rest = list.filter(([k]) => !main.includes(k));
  openModal(`<div class="modal-pad">
    <div class="kicker">${esc(CAT_LABEL[route.cat] || "À la une")}</div>
    <h2>Trier le fil</h2>
    <ul class="sort-list">${first.map(item).join("")}</ul>
    ${rest.length ? `<details class="sort-more"${rest.some(([k]) => k === route.lens) ? " open" : ""}><summary>Plus de choix <small>gauche, droite, hors radar, pour toi</small></summary>
      <ul class="sort-list">${rest.map(item).join("")}</ul></details>` : ""}
  </div>`, true);
  $("#modalBody").onclick = (e) => {
    const b = e.target.closest("[data-sort]");
    if (!b) return;
    closeLayer("#modal");
    go(href({ cat: route.cat, lens: b.dataset.sort }));
  };
}

// Téléphone : en descendant, le bandeau se range mais les rubriques restent collées en haut.
function catsStick() {
  const bar = $("#topbar"), cats = $("#cats");
  if (!bar || !cats) return;
  const shown = cats.offsetHeight > 0 && innerWidth <= 760;
  const tuck = shown ? Math.round(cats.getBoundingClientRect().top - bar.getBoundingClientRect().top) : bar.offsetHeight;
  document.documentElement.style.setProperty("--tuck", `${tuck}px`);
  document.documentElement.style.setProperty("--cats-h", `${shown ? bar.offsetHeight - tuck : 0}px`);
}
addEventListener("resize", catsStick);

/* ================= Moins de gestes : lire, passer à la suivante, retrouver sa ville ================= */
// « Utiliser ma position » : la position (arrondie à ~1 km) donne le nom de la ville, puis on la trouve dans la liste.
function findMyCity(btn, cb) {
  const msg = $("#obGeoMsg");
  const say = (t) => { if (msg) { msg.hidden = false; msg.textContent = t; } else toast(t); };
  if (!navigator.geolocation) { say("Ton appareil ne donne pas sa position. Tape le nom de ta ville."); return; }
  const old = btn.innerHTML;
  btn.disabled = true; btn.textContent = "📍 Recherche de ta ville…";
  const done = () => { btn.disabled = false; btn.innerHTML = old; };
  navigator.geolocation.getCurrentPosition(async (p) => {
    try {
      const lat = p.coords.latitude.toFixed(2), lon = p.coords.longitude.toFixed(2);
      const [r, V] = await Promise.all([
        fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=fr`).then((x) => x.json()),
        villesData(),
      ]);
      const pr = String(r.principalSubdivisionCode || "").replace(/^CA-/, "");
      // La localité d'abord (« Victoriaville »), puis les noms plus larges (« city » est parfois la MRC).
      const names = [r.locality, ...(r.localityInfo?.administrative || []).map((a) => a.name).reverse(), r.city].filter(Boolean);
      let hit = null;
      for (const n of names) { const f = foldText(n).trim(); hit = V.list.find((x) => x.f === f && (!pr || x.pr === pr)); if (hit) break; }
      if (!hit && names[0]) hit = matchVilles(V, names[0], 1)[0] || null;
      if (hit) { cb(hit); say(`Trouvée : ${villeLabel(hit)}. Tu peux en choisir une autre plus bas.`); } else say("Ville introuvable. Tape son nom plus bas.");
    } catch { say("Ta position n'a pas pu être lue. Tape le nom de ta ville plus bas."); }
    done();
  }, () => { done(); say("Position refusée. Tape le nom de ta ville plus bas."); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
}

// L'histoire suivante du fil d'où l'on vient.
function nextStory(id) {
  const list = state.feeds.get(state.lastFeedKey)?.stories || [];
  const i = list.findIndex((x) => x.id === id);
  return i >= 0 ? list[i + 1] || null : null;
}
async function goNext(id) {
  let nx = nextStory(id);
  const f = state.feeds.get(state.lastFeedKey);
  if (!nx && f?.hasMore && f.stories.some((x) => x.id === id)) { await loadMore(state.lastFeedKey); nx = nextStory(id); }
  if (!nx) { toast("C'est la dernière histoire de ce fil."); return; }
  buzz(8);
  const host = state.panel ? $("#panelBody") : $("#view");
  go(href({ h: nx.id }), { replace: true });
  if (!reduceMotion()) host?.animate([{ transform: "translateX(40px)", opacity: 0.25 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
}
// La barre collée en bas de l'histoire : « Lire l'article » (le meilleur pour toi) et « Suivante ».
function storyReadBar(v, s) {
  $(".s-readbar", v)?.remove();
  const a = bestArticle(s), nx = nextStory(s.id);
  const col = $(".main-col", v);
  if (!col || (!a && !nx)) return;
  col.insertAdjacentHTML("beforeend", `<div class="s-readbar">
    ${a ? `<a class="rb-read" href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${readAttr(a)}"><b>Lire l'article</b><small>chez <span data-no-tr>${esc(a.sourceName)}</span> ↗</small></a>` : ""}
    ${(s.sources || 0) > 1 ? `<button class="rb-pick" type="button" data-pick="${esc(s.id)}" aria-label="Choisir le média" title="Choisir le média"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button>` : ""}
    ${nx ? `<button class="rb-next" type="button" data-next title="Histoire suivante"><span>Suivante</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>` : ""}
  </div>`);
  // La barre n'apparaît qu'une fois le gros bouton « Lire l'article » du haut dépassé (pas de doublon).
  const bar = $(".s-readbar", v), topBtn = $(".btn-read", v);
  if (bar && topBtn) {
    bar.classList.add("rb-hide");
    state.readIO?.disconnect();
    state.readIO = new IntersectionObserver(([en]) => bar.classList.toggle("rb-hide", en.isIntersecting || en.boundingClientRect.top > 0), { root: v.id === "panelBody" ? v : null });
    state.readIO.observe(topBtn);
  }
  if (nx && matchMedia("(pointer: coarse)").matches && !store.get("hintNext")) {
    store.set("hintNext", "1");
    setTimeout(() => toast("Astuce : glisse vers la gauche pour passer à l'histoire suivante."), 1400);
  }
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-next]")) { e.preventDefault(); goNext(state.route?.id); } });
// Glisser vers la gauche dans une histoire : la suivante.
{
  let x0 = null, y0 = 0, t0 = 0;
  const NOSW = ".s-acts, .s-read-alt, .chips, .cols3, .ff-g, .zones, .words, .vgrid, input, textarea, select, .s-readbar, .modal";
  addEventListener("touchstart", (e) => {
    x0 = null;
    if (e.touches.length !== 1 || state.route?.view !== "story") return;
    const t = e.touches[0];
    if (t.clientX < 30 || !e.target.closest("#panelBody, #view") || e.target.closest(NOSW)) return;
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, { passive: true });
  addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (dx < -80 && Math.abs(dy) < Math.abs(dx) * 0.5 && Date.now() - t0 < 700) goNext(state.route.id);
  }, { passive: true });
}
// De retour d'un article (Safari) : les cartes lues passent en gris tout de suite.
addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  for (const c of storyCards()) { const s = state.stories.get(cardId(c)); if (s) c.classList.toggle("is-seen", !!seenState(s)?.seen); }
});

// Le rappel du matin, sans serveur : un événement de calendrier qui revient chaque jour, avec une alerte.
// Le calendrier du téléphone fait sonner le rappel ; le toucher ouvre « Le matin » de Prisme.
function reminderCard() {
  const t = store.get("remTime", "07:00");
  return `<aside class="rem-card"><div class="rem-h"><span aria-hidden="true">⏰</span><b>Un rappel chaque matin</b></div>
    <p class="note">Ton téléphone te rappelle de lire ton matin Prisme, à l'heure choisie. Ça passe par ton calendrier : rien n'est envoyé à Prisme.</p>
    <div class="rem-row"><label>À <input type="time" id="remTime" value="${esc(t)}"></label>
      <select id="remDays" aria-label="Quels jours"><option value="all">tous les jours</option><option value="week"${store.get("remDays") === "week" ? " selected" : ""}>en semaine</option></select>
      <button class="btn" type="button" id="remAdd">Ajouter à mon calendrier</button></div></aside>`;
}
function reminderIcs(time, days) {
  const [hh, mm] = String(time || "07:00").split(":").map(Number);
  const d = new Date();
  if (d.getHours() * 60 + d.getMinutes() >= hh * 60 + mm) d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const url = absUrl(href({ v: "matin" }));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Prisme//Rappel du matin//FR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:prisme-matin-${Date.now()}@axe414.github.io`, `DTSTAMP:${stamp}`, `DTSTART:${day}T${p(hh)}${p(mm)}00`, "DURATION:PT10M",
    `RRULE:FREQ=${days === "week" ? "WEEKLY;BYDAY=MO,TU,WE,TH,FR" : "DAILY"}`,
    "SUMMARY:☀️ Ton matin Prisme", `DESCRIPTION:Les nouvelles du jour\\, de la gauche à la droite : ${url}`, `URL:${url}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Ton matin Prisme est prêt", "TRIGGER:PT0M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
document.addEventListener("click", async (e) => {
  if (!e.target.closest("#remAdd")) return;
  const time = $("#remTime")?.value || "07:00", days = $("#remDays")?.value || "all";
  store.set("remTime", time); store.set("remDays", days);
  const file = new File([reminderIcs(time, days)], "prisme-matin.ics", { type: "text/calendar" });
  // iPhone : Safari ouvre ce type de fichier directement avec « Ajouter au calendrier ».
  if (isIOS()) {
    const u = URL.createObjectURL(file);
    if (!window.open(u, "_blank")) location.href = u;
    setTimeout(() => URL.revokeObjectURL(u), 60e3);
    toast("Touche « Ajouter » : le rappel sonnera chaque matin.");
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast("Ouvre le fichier « prisme-matin.ics » et touche « Ajouter » : le rappel sonnera chaque matin.");
});

// « Aa » dans une histoire : la taille du texte en un toucher, sans passer par les réglages.
const textSizeBtn = `<button class="act act-l" type="button" data-textsize title="Taille du texte"><span class="aa" aria-hidden="true">Aa</span><span>Texte</span></button>`;
function openTextSize() {
  const cur = prefs.scale;
  openModal(`<div class="modal-pad ts-sheet"><div class="kicker">Lecture</div><h2>Taille du texte</h2>
    <div class="ob-grid ob-sizes">${SCALES.map(([v, l]) => `<button type="button" data-ts="${v}" aria-pressed="${Math.abs(cur - v) < 0.01}"><span style="font-size:${Math.round(20 * v)}px">Aa</span>${l}</button>`).join("")}</div>
    <p class="ob-preview" id="tsPrev" style="font-size:${Math.round(17 * cur)}px">Les histoires du jour, vues de tous les côtés.</p></div>`, true);
  $("#modalBody .ts-sheet").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ts]");
    if (!b) return;
    store.set("scale", b.dataset.ts);
    applyScale();
    $$("[data-ts]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    $("#tsPrev").style.fontSize = `${Math.round(17 * Number(b.dataset.ts))}px`;
    buzz(8);
  });
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-textsize]")) { e.preventDefault(); openTextSize(); } });

// Partager une histoire : un seul bouton, deux choix clairs (le lien avec son aperçu, ou une image avec la barre).
const storyShareBtn = (s) => `<button class="act act-l" type="button" data-share-story="${esc(s.id)}" title="Partager">${ico("share")}<span>Partager</span></button>`;
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-share-story]");
  if (!b) return;
  e.preventDefault();
  const s = state.stories.get(b.dataset.shareStory);
  if (!s) return;
  openModal(`<div class="modal-pad sh-sheet"><div class="kicker">Partager</div><h2 class="pk-h2" data-no-tr>${titleOf(s)}</h2>
    <ul class="sheet-list">
      <li><button type="button" data-shs="link">${ico("share")}<span>Le lien<small>Dans Messages ou Messenger, il s'affiche avec la photo et « ${plural(s.sources, "média")} en parlent ».</small></span></button></li>
      <li><button type="button" data-shs="img"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-8 8.5"/></svg><span>Une image<small>Le titre et la barre gauche, centre, droite, prête à envoyer.</small></span></button></li>
    </ul></div>`, true);
  $("#modalBody .sh-sheet").addEventListener("click", (ev) => {
    const o = ev.target.closest("[data-shs]");
    if (!o) return;
    closeLayer("#modal");
    if (o.dataset.shs === "link") shareIt(storyShare(s)); else shareStoryImage(s);
  });
});

// Recherche : les articles les plus récents tout en haut, à lire en un toucher.
async function searchTopArticles(q) {
  const el = $("#topArts");
  if (!el) return;
  const r = await indexSearch(q).catch(() => null);
  if (!r?.ids?.length || state.route?.view !== "search" || state.route.q !== q) return;
  const ids = [...r.ids].sort((a, b) => r.meta.age[a] - r.meta.age[b]).slice(0, 5);
  const docs = await docsFor(ids).catch(() => []);
  if (!docs.length || !el.isConnected) return;
  el.hidden = false;
  el.innerHTML = `${dossierHtml(r)}<h2 class="block-h">Les plus récents <small>${plural(r.ids.length, "article")} en 7 jours</small></h2>
    <ul class="ta-list">${docs.map((x) => `<li><span class="vc-src">${favicon(x.domain, x.sourceName)}<span data-no-tr>${esc(cleanName(x.sourceName))}</span> · ${esc(agoShort(x.published))}</span>${artLink(x, "vc-a")}</li>`).join("")}</ul>
    <a class="link ta-all" href="#wide">Tous les articles ↓</a>`;
  $(".ta-all", el).onclick = (e) => { e.preventDefault(); $("#wide")?.scrollIntoView({ behavior: "smooth" }); };
}

// « Pour comprendre » : sur une histoire qui dure depuis plus d'un jour, d'où elle part et où elle en est, en 30 secondes.
function understandCard(s) {
  const arts = (s.articles || []).filter((a) => a.published).sort((a, b) => a.published.localeCompare(b.published));
  if (arts.length < 2) return "";
  const day = (iso) => new Date(iso).toLocaleDateString("en-CA");
  const first = arts[0], last = arts[arts.length - 1];
  if (day(first.published) === day(last.published)) return "";
  const today = new Date().toLocaleDateString("en-CA"), yest = new Date(Date.now() - 864e5).toLocaleDateString("en-CA");
  const when = (iso) => (day(iso) === today ? "aujourd'hui" : day(iso) === yest ? "hier" : new Date(iso).toLocaleDateString(LOCALE, { weekday: "long" }));
  const sd = sides(s.counts || {});
  const lean = sd.left && sd.center && sd.right ? "de tous les côtés" : sd.left > sd.right * 2 ? "surtout à gauche" : sd.right > sd.left * 2 ? "surtout à droite" : "";
  return `<section class="sec und"><h2 class="block-h">Pour comprendre <small>en 30 secondes</small></h2>
    <ol class="und-l">
      <li><b>Ça a commencé ${esc(when(first.published))}</b> : « <span data-no-tr>${esc(first.title)}</span> » <small data-no-tr>${esc(first.sourceName)}</small></li>
      <li><b>Depuis, ${plural(s.sources, "média")}</b> en ont parlé${lean ? `, ${lean}` : ""}.</li>
      <li><b>Le plus récent</b> (${esc(agoShort(last.published))}) : « <span data-no-tr>${esc(last.title)}</span> » <small data-no-tr>${esc(last.sourceName)}</small></li>
    </ol></section>`;
}

// Matin express : 10 titres, la barre de chacun, et « Écouter » qui les enchaîne. Environ une minute.
async function openExpress() {
  openModal(`<div class="modal-pad"><div class="loader">Les 10 titres du matin…</div></div>`, true);
  const d = await api(`/api/feed?region=${state.region}&page=0&cat=une&lens=essentiel`).catch(() => null);
  const list = (d?.stories || []).slice(0, 10);
  const body = $("#modalBody");
  if (!body) return;
  if (!list.length) { body.innerHTML = `<div class="modal-pad"><p class="note">Les titres n'ont pas pu se charger.</p></div>`; return; }
  for (const s of list) state.stories.set(s.id, s);
  state.expressSpeech = ["Matin express : dix titres.", ...list.map((s, i) => `${i + 1}. ${s.titleFr || s.title}.`), "C'est tout. Bonne journée."];
  body.innerHTML = `<div class="modal-pad ex-sheet"><div class="kicker">Le matin</div><h2>⚡ Express <small>10 titres, 1 minute</small></h2>
    <button class="btn ex-listen" type="button" data-listen="express">${'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'}<span>Écouter</span></button>
    <ol class="ex-list">${list.map((s, i) => `<li><span class="ex-n">${i + 1}</span><div><a class="ex-t" ${openAttrs(s)} data-no-tr>${titleOf(s)}</a>${sideStrip(s)}
      <span class="ex-m">${sourcesLine(s, 1)} · <a class="link" href="${href({ h: s.id })}" data-nav data-close-modal>Comparer ›</a></span></div></li>`).join("")}</ol></div>`;
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-express]")) { e.preventDefault(); openExpress(); } });

// Le petit tutoriel des gestes : trois bulles, une seule fois, sur la première nouvelle du fil.
function coachMarks() {
  if (store.get("coach") || state.route?.view !== "feed" || $("#modal.open") || !store.get("onboarded")) return;
  const card = $("#feed .lead.hero, #feed .story");
  if (!card) return;
  const steps = [
    [$(".hero-media h2, h3 a, h2 a", card), "Touche le titre (ou la photo) pour lire l'article."],
    [$(".c2-cmp", card), "« Comparer » montre ce que la gauche, le centre et la droite en disent."],
    [$(".src-pick", card), "Touche le nom du média pour en choisir un autre."],
  ].filter(([el]) => el);
  if (!steps.length) return;
  store.set("coach", "1");
  let i = 0;
  const o = document.createElement("div");
  o.className = "coach";
  document.body.appendChild(o);
  // La bulle suit l'élément (la page peut encore bouger : images qui arrivent, bandeau qui se range).
  const place = () => {
    const [el, txt] = steps[i];
    const r = el.getBoundingClientRect(), below = r.top < innerHeight / 2;
    o.innerHTML = `<div class="coach-hole" style="left:${r.left - 8}px;top:${r.top - 6}px;width:${r.width + 16}px;height:${r.height + 12}px"></div>
      <div class="coach-tip" style="${below ? `top:${r.bottom + 16}px` : `bottom:${innerHeight - r.top + 16}px`}">
        <p>${esc(txt)}</p><div class="coach-acts"><span>${i + 1} / ${steps.length}</span>
        <button class="btn" type="button" data-coach>${i < steps.length - 1 ? "Suivant" : "Compris !"}</button></div></div>`;
  };
  const show = () => {
    steps[i][0].scrollIntoView({ block: "center" });
    setTimeout(place, 350);
  };
  const onScroll = () => requestAnimationFrame(() => { if (o.isConnected && o.innerHTML) place(); });
  addEventListener("scroll", onScroll, { passive: true });
  o.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (++i < steps.length) show(); else { o.remove(); removeEventListener("scroll", onScroll); scrollTo({ top: 0, behavior: "smooth" }); }
  });
  show();
}

/* ================= Une app de nouvelles utile : payant, opinion, ça vient d'arriver, suivre, semaine, alertes ================= */
// Les médias qui demandent souvent un abonnement pour lire (liste prudente : seulement les cas bien connus).
// Le 🔒 prévient ; quand un autre média couvre la même nouvelle gratuitement, c'est lui qui s'ouvre en premier.
const PAYWALL = new Set(`ledevoir.com lesoleil.com lenouvelliste.ca latribune.ca ledroit.com lequotidien.com lavoixdelest.ca lactualite.com
  theglobeandmail.com nationalpost.com financialpost.com montrealgazette.com ottawacitizen.com thestar.com winnipegfreepress.com vancouversun.com
  calgaryherald.com edmontonjournal.com thelogic.co hilltimes.com
  nytimes.com wsj.com washingtonpost.com ft.com economist.com bloomberg.com theatlantic.com newyorker.com latimes.com bostonglobe.com
  lemonde.fr lefigaro.fr liberation.fr mediapart.fr lesechos.fr lepoint.fr lexpress.fr courrierinternational.com nouvelobs.com
  telegraph.co.uk thetimes.co.uk thetimes.com haaretz.com`.split(/\s+/).filter(Boolean));
const isPaywall = (a) => PAYWALL.has(String(a?.domain || "").replace(/^www\./, ""));

// Opinion (chronique, éditorial, lettre, caricature) : trois indices, du plus sûr au moins sûr.
// 1. le média lui-même le dit (son fil « opinion » ou sa rubrique : champ « op » posé par le robot) ;
// 2. l'adresse de l'article passe par une rubrique d'opinion (/opinions/, /chroniques/, /editorial/…) ;
// 3. le titre l'annonce (« Chronique | … », « … | Opinion », « Lettre ouverte : … »).
// Sans indice, on n'étiquette pas : mieux vaut en manquer une que d'appeler « opinion » un reportage.
const OP_URL = /\/(opinions?|chroniques?|chroniqueurs?|editoriaux|editorial|editorials|idees-et-debats|debats|libre-opinion|lettres?(-ouvertes?)?|courrier-des-lecteurs|billets?|point-de-vue|points-de-vue|tribunes?|commentary|columnists?|columns?|op-ed|opinion-columnists|letters(-to-the-editor)?|viewpoints?|carte-blanche|humeur|cartoons?|caricatures?)(\/|$)/i;
const OP_T1 = /^\s*\[?(chronique|opinion|[ée]ditorial|lettre ouverte|lettre d'opinion|libre opinion|point de vue|tribune|billet|carte blanche|commentary|op-ed|editorial|letter|letters to the editor)\]?\s*[|:–—-]/i;
const OP_T2 = /[|–—]\s*(chronique|opinion|[ée]ditorial|lettre ouverte|point de vue|tribune|carte blanche)\s*$/i;
function isOpinion(a) {
  if (!a) return false;
  if (a._op === undefined) {
    let p = "";
    try { p = new URL(a.url).pathname; } catch { /* adresse illisible */ }
    a._op = !!a.op || OP_URL.test(p) || OP_T1.test(a.title || "") || OP_T2.test(a.title || "");
  }
  return a._op;
}
const artTags = (a) => `${isOpinion(a) ? `<span class="tg tg-op" title="Texte d'opinion : chronique, éditorial ou lettre. Ce n'est pas un reportage.">Opinion</span>` : ""}${isPaywall(a) ? `<span class="tg tg-pay" title="Ce média demande souvent un abonnement pour lire l'article">🔒 Abonnés</span>` : ""}`;

// « Ça vient d'arriver » : réservé aux vraies nouvelles importantes. Une histoire née depuis moins de 3 heures,
// couverte par 6 médias ou plus, dont au moins 3 médias reconnus (évalués par Prisme) dans les 90 dernières minutes,
// et par au moins 2 côtés du spectre. Un communiqué repris par de petits sites ou un résumé de match ne passe pas.
// Un bandeau discret, sur toutes les pages ; ✕ le range pour cette histoire.
async function checkBreaking() {
  const ed = await edition(state.region).catch(() => null);
  let el = $("#breaking");
  if (!ed) return;
  const now = Date.now();
  let best = null, bestN = 0;
  for (const s of ed.stories) {
    if ((s.sources || 0) < 6 || !(now - Date.parse(s.firstSeen || 0) < 3 * 36e5)) continue;
    const sd = sides(s.counts || {});
    if ((sd.left > 0) + (sd.center > 0) + (sd.right > 0) < 2) continue;
    const n = new Set((s.articles || []).filter((a) => a.media?.known && !isOpinion(a) && now - Date.parse(a.published || 0) < 90 * 60e3).map((a) => a.domain)).size;
    if (n >= 3 && (n > bestN || (n === bestN && (s.sources || 0) > (best?.sources || 0)))) { best = s; bestN = n; }
  }
  if (!best || store.get("brkX") === best.id || (state.route?.view === "story" && state.route.id === best.id)) { el?.remove(); return; }
  await withTitlesFr([best]);
  state.stories.set(best.id, best);
  if (!el) { el = document.createElement("aside"); el.id = "breaking"; $("#view").insertAdjacentElement("beforebegin", el); }
  el.innerHTML = `<a class="brk-a" href="${href({ h: best.id })}" data-nav><span class="brk-k">Ça vient d'arriver</span><b data-no-tr>${titleOf(best)}</b><small>${plural(best.sources, "média")} · ${esc(agoShort(best.firstSeen))}</small></a>
    <button class="brk-x" type="button" aria-label="Fermer" data-brk-x="${esc(best.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
}
document.addEventListener("click", (e) => { const x = e.target.closest("[data-brk-x]"); if (x) { store.set("brkX", x.dataset.brkX); $("#breaking")?.remove(); } });
setTimeout(checkBreaking, 3500);
setInterval(checkBreaking, 10 * 60e3);
addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") setTimeout(checkBreaking, 1500); });

// Suivre une histoire : une histoire enregistrée (★) est suivie. Quand de nouveaux médias en parlent,
// elle remonte dans une carte « Tes histoires suivies » en haut de la une, avec « +4 médias ».
const followN = {
  all() { try { return JSON.parse(store.get("followN", "{}")); } catch { return {}; } },
  get(id) { return this.all()[id]; },
  set(id, n) { const m = this.all(); m[id] = n; const keys = Object.keys(m); for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete m[k]; store.set("followN", JSON.stringify(m)); },
};
// L'histoire suivie dans l'édition du moment : le même identifiant, sinon celle qui partage le plus de mots du titre.
function matchFollowed(item, ed) {
  const same = ed.stories.find((s) => s.id === item.id);
  if (same) return same;
  const words = [...new Set(foldText(item.t || "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 5))].slice(0, 8);
  if (words.length < 3) return null;
  let best = null, bestHit = 0;
  for (const s of ed.stories) {
    const t = storyFold(s);
    const hit = words.filter((w) => hasWord(t, w)).length;
    if (hit >= Math.max(3, Math.ceil(words.length * 0.6)) && (hit > bestHit || (hit === bestHit && (s.sources || 0) > (best?.sources || 0)))) { best = s; bestHit = hit; }
  }
  return best;
}
async function fillFollowCard() {
  const el = $("#followCard");
  if (!el) return;
  const mine = favs.list().filter((x) => x.type === "s" && Date.now() - (x.at || 0) < 7 * 864e5).slice(0, 15);
  if (!mine.length) return;
  const ed = await edition(state.region).catch(() => null);
  if (!ed || !el.isConnected) return;
  const rows = [];
  for (const item of mine) {
    const s = matchFollowed(item, ed);
    if (!s) continue;
    const base = followN.get(item.id) ?? item.src ?? s.sources;
    const plus = (s.sources || 0) - base;
    if (plus >= 1) rows.push({ item, s, plus });
  }
  if (!rows.length) return;
  rows.sort((a, b) => b.plus - a.plus);
  await withTitlesFr(rows.map((r) => r.s));
  for (const r of rows) state.stories.set(r.s.id, r.s);
  el.innerHTML = `<div class="fc-h">★ Tes histoires suivies <small>du nouveau depuis ta dernière lecture</small></div>
    <ul class="fc-l">${rows.slice(0, 3).map((r) => `<li><a href="${href({ h: r.s.id })}" data-nav data-follow-seen="${esc(r.item.id)}" data-n="${r.s.sources}">
      <b class="fc-plus">+${r.plus} ${r.plus > 1 ? "médias" : "média"}</b><span data-no-tr>${titleOf(r.s)}</span></a></li>`).join("")}</ul>`;
  el.hidden = false;
}
document.addEventListener("click", (e) => { const a = e.target.closest("[data-follow-seen]"); if (a) followN.set(a.dataset.followSeen, Number(a.dataset.n) || 0); });

// « Ta semaine » : les 7 histoires les plus couvertes des 7 derniers jours (le robot en garde la mémoire jour après jour).
async function openWeek() {
  openModal(`<div class="modal-pad"><div class="loader">Ta semaine…</div></div>`, true);
  const w = await dataJson(`week-${state.region}.json`, 30 * 60e3).catch(() => null);
  const body = $("#modalBody");
  if (!body) return;
  const days = Object.entries(w?.days || {}).sort((a, b) => b[0].localeCompare(a[0]));
  const best = new Map();
  for (const [day, list] of days) for (const x of list) { const k = foldText(x.t).slice(0, 60); const p = best.get(k); if (!p || x.n > p.n) best.set(k, { ...x, day }); }
  const top = [...best.values()].sort((a, b) => b.n - a.n).slice(0, 7);
  if (!top.length) { body.innerHTML = `<div class="modal-pad"><div class="kicker">Le matin</div><h2>Ta semaine</h2><p class="note">Prisme commence tout juste à garder la mémoire de la semaine. Reviens dans quelques jours : les 7 grandes histoires seront ici.</p></div>`; return; }
  const dayLabel = (d) => new Date(`${d}T12:00`).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
  body.innerHTML = `<div class="modal-pad ex-sheet"><div class="kicker">Le matin</div><h2>Ta semaine <small>${days.length > 1 ? `les ${top.length} grandes histoires de ${days.length} jours` : "depuis aujourd'hui"}</small></h2>
    ${days.length < 5 ? `<p class="note">La mémoire de la semaine se remplit jour après jour (${days.length} ${days.length > 1 ? "jours gardés" : "jour gardé"} pour l'instant).</p>` : ""}
    <ol class="ex-list">${top.map((x, i) => `<li><span class="ex-n">${i + 1}</span><div>
      ${x.u ? `<a class="ex-t" href="${esc(safeUrl(x.u))}" target="_blank" rel="noopener noreferrer" data-no-tr>${esc(x.t)}</a>` : `<span class="ex-t" data-no-tr>${esc(x.t)}</span>`}
      ${sideStrip({ counts: x.c || {} })}
      <span class="ex-m">${plural(x.n, "média")} · ${esc(dayLabel(x.day))}${x.src ? ` · <span data-no-tr>${esc(x.src)}</span>` : ""}</span></div></li>`).join("")}</ol></div>`;
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-week]")) { e.preventDefault(); openWeek(); } });

// Alertes météo d'Environnement Canada autour de ta ville (données ouvertes, lues directement par le téléphone).
const alertCache = new Map();
const ALERT_RANK = { warning: 0, watch: 1, advisory: 2, statement: 3 };
async function cityGeo(city) {
  try { const g = JSON.parse(store.get(`geo.${city.s}`, "null")); if (g) return g; } catch { /* rien */ }
  await weather(city).catch(() => null); // la météo trouve et garde la position de la ville
  try { return JSON.parse(store.get(`geo.${city.s}`, "null")); } catch { return null; }
}
async function weatherAlerts(city) {
  const hit = alertCache.get(city.s);
  if (hit && Date.now() - hit.at < 20 * 60e3) return hit.list;
  const g = await cityGeo(city);
  if (!g) return [];
  const d = 0.02;
  const r = await fetch(`https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=10&bbox=${g.lon - d},${g.lat - d},${g.lon + d},${g.lat + d}`).then((x) => x.json());
  const now = Date.now(), seen = new Set();
  const list = (r.features || []).map((f) => f.properties || {})
    .filter((p) => !(Date.parse(p.expiration_datetime || 0) < now) && !/ended|terminé/i.test(`${p.status_en || ""} ${p.status_fr || ""}`))
    .filter((p) => { const k = p.alert_name_fr || p.alert_name_en; return k && !seen.has(k) && seen.add(k); })
    .map((p) => ({ type: p.alert_type || "statement", name: String(p.alert_name_fr || p.alert_name_en).replace(/^./, (c) => c.toUpperCase()), text: String(p.alert_text_fr || p.alert_text_en || "").trim(), colour: p.risk_colour_en || "" }))
    .sort((a, b) => (ALERT_RANK[a.type] ?? 9) - (ALERT_RANK[b.type] ?? 9));
  alertCache.set(city.s, { at: Date.now(), list });
  return list;
}
// Pannes d'Hydro-Québec à moins de 30 km de ta ville (fichier préparé par le robot à chaque passage).
async function cityOutages(city) {
  if (city.pr !== "QC") return null;
  const [p, g] = await Promise.all([dataJson("pannes.json", 10 * 60e3).catch(() => null), cityGeo(city)]);
  if (!p?.at || !g) return null;
  const rad = (x) => (x * Math.PI) / 180;
  const km = (la, lo) => { const dla = rad(la - g.lat), dlo = rad(lo - g.lon); const h = Math.sin(dla / 2) ** 2 + Math.cos(rad(g.lat)) * Math.cos(rad(la)) * Math.sin(dlo / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  const near = p.list.filter(([la, lo]) => km(la, lo) <= 30);
  return { clients: near.reduce((a, x) => a + x[2], 0), n: near.length, at: p.at };
}
// Une ligne « ⚠️ Avertissement… · ⚡ 240 clients sans courant » (carte de la ville, colonne de droite, feuille météo).
async function localNotices(city) {
  const [al, out] = await Promise.all([weatherAlerts(city).catch(() => []), cityOutages(city).catch(() => null)]);
  return { al, out };
}
function noticeLine({ al, out }) {
  const bits = [];
  if (al.length) bits.push(`<span class="nt nt-${esc(al[0].type)}">⚠️ <span>${esc(al[0].name)}</span>${al.length > 1 ? ` <small>+${al.length - 1}</small>` : ""}</span>`);
  if (out?.clients > 0) bits.push(`<span class="nt nt-out">⚡ ${out.clients.toLocaleString(LOCALE)} ${out.clients > 1 ? "clients" : "client"} sans courant à proximité</span>`);
  return bits.join("");
}
async function fillNotices(el, city) {
  if (!el || !navigator.onLine) return;
  const n = await localNotices(city).catch(() => null);
  const html = n ? noticeLine(n) : "";
  if (!html || !el.isConnected) return;
  el.innerHTML = html;
  el.dataset.wxCity = city.s;
  el.hidden = false;
  // La pastille météo du haut prévient aussi d'un avertissement en vigueur.
  if (n.al.some((a) => a.type === "warning") && city.s === wxSlug()) $("#catWx")?.classList.add("has-alert");
}

// Le Canadien : le dernier match et le prochain (fichier préparé par le robot). Éditions Québec et Canada seulement.
async function habsCard() {
  if (!["qc", "ca"].includes(state.region)) return "";
  const h = await dataJson("habs.json", 10 * 60e3).catch(() => null);
  if (!h?.at) return "";
  const nm = (t) => (t.a === "MTL" ? "Canadien" : esc(t.n || t.a));
  const when = (iso) => { const d = new Date(iso), today = new Date().toDateString(); const day = d.toDateString() === today ? "aujourd'hui" : d.toDateString() === new Date(Date.now() + 864e5).toDateString() ? "demain" : d.toDateString() === new Date(Date.now() - 864e5).toDateString() ? "hier" : d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }); return `${day}, ${clock(iso)}`; };
  const score = (g, live) => { const mtl = g.home.a === "MTL" ? g.home : g.away, opp = g.home.a === "MTL" ? g.away : g.home; const won = mtl.s > opp.s; return `<div class="hb-g"><span class="hb-k">${live ? `<span class="ck-live">En direct</span>` : `Dernier match · ${esc(when(g.at).split(",")[0])}`}</span>
      <b>${nm(mtl)} ${mtl.s} · ${nm(opp)} ${opp.s}</b><small>${live ? "" : won ? "Victoire" : "Défaite"}${g.end === "OT" ? " en prolongation" : g.end === "SO" ? " en tirs de barrage" : ""}${g.home.a === "MTL" ? " · à Montréal" : ` · à l'étranger`}</small></div>`; };
  const nx = h.next ? (() => { const opp = h.next.home.a === "MTL" ? h.next.away : h.next.home; return `<div class="hb-g"><span class="hb-k">Prochain match</span><b>${h.next.home.a === "MTL" ? "contre" : "chez"} ${nm(opp)}</b><small>${esc(when(h.next.at))}</small></div>`; })() : "";
  const cur = h.live ? score(h.live, true) : h.last ? score(h.last, false) : "";
  return cur || nx ? `<aside class="habs"><span class="hb-ico" aria-hidden="true">🏒</span><div class="hb-in">${cur}${nx}</div></aside>` : "";
}
async function fillHabs(el) {
  if (!el) return;
  const html = await habsCard().catch(() => "");
  if (html && el.isConnected) { el.innerHTML = html; el.hidden = false; }
}

// Dossier : sur la page d'un sujet, la semaine d'un coup d'œil (articles par jour) et qui en parle le plus.
function dossierHtml(r) {
  const m = r.meta, days = Array(7).fill(0), by = new Map();
  for (const id of r.ids) {
    const d = Math.min(6, Math.floor((m.age[id] * 10) / 1440));
    days[d]++;
    const k = m.dom[id];
    by.set(k, (by.get(k) || 0) + 1);
  }
  const max = Math.max(1, ...days);
  const lbl = (i) => (i === 0 ? "Auj." : i === 1 ? "Hier" : new Date(Date.now() - i * 864e5).toLocaleDateString(LOCALE, { weekday: "short" }));
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ d: m.D[k], n }));
  if (r.ids.length < 6) return "";
  return `<div class="dos"><div class="dos-h">Le dossier de la semaine <small>${plural(r.ids.length, "article")} en 7 jours</small></div>
    <div class="dos-bars" aria-label="Articles par jour">${days.map((n, i) => `<span><i style="height:${Math.round((n / max) * 100)}%" title="${n}"></i><small>${esc(lbl(i))}</small></span>`).reverse().join("")}</div>
    <p class="dos-top">Qui en parle le plus : ${top.map((x) => `<a href="${href({ m: x.d.domain })}" data-nav>${favicon(x.d.domain, x.d.name)}<span data-no-tr>${esc(cleanName(x.d.name || x.d.domain))}</span> <b>${x.n}</b></a>`).join("")}</p></div>`;
}

/* Les rangées qui défilent de côté (rubriques, tendances) : faciles à la souris et au doigt.
   Des flèches ‹ › apparaissent aux bords quand il y a plus à voir ; la molette et le glisser à la souris font défiler. */
function hScroll(el) {
  if (!el || el.dataset.hs) return;
  el.dataset.hs = "1";
  for (const k of hsLive.keys()) if (!k.isConnected) hsLive.delete(k); // les rangées des pages précédentes
  const wrap = document.createElement("div");
  wrap.className = "hs-wrap";
  el.replaceWith(wrap);
  wrap.appendChild(el);
  const mk = (dir) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = `hs-arrow hs-${dir}`; b.tabIndex = -1;
    b.setAttribute("aria-label", dir === "l" ? "Voir à gauche" : "Voir à droite");
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir === "l" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"}"/></svg>`;
    b.onclick = (e) => { e.preventDefault(); el.scrollBy({ left: (dir === "l" ? -1 : 1) * Math.max(160, el.clientWidth * 0.7), behavior: "smooth" }); };
    wrap.appendChild(b);
    return b;
  };
  const L = mk("l"), R = mk("r");
  const sync = () => {
    const more = el.scrollWidth > el.clientWidth + 4;
    L.hidden = !more || el.scrollLeft < 4;
    R.hidden = !more || el.scrollLeft + el.clientWidth > el.scrollWidth - 4;
    wrap.classList.toggle("hs-fl", !L.hidden); wrap.classList.toggle("hs-fr", !R.hidden);
  };
  el.addEventListener("scroll", sync, { passive: true });
  hsLive.set(el, sync);
  new MutationObserver(() => requestAnimationFrame(sync)).observe(el, { childList: true });
  requestAnimationFrame(sync);
  // La molette (haut / bas) fait défiler la rangée de côté.
  el.addEventListener("wheel", (e) => {
    if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const before = el.scrollLeft;
    el.scrollLeft += e.deltaY;
    if (el.scrollLeft !== before) e.preventDefault();
  }, { passive: false });
  // Glisser à la souris (le doigt glisse déjà tout seul).
  el.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" || e.button) return; hsDrag = { el, x0: e.clientX, s0: el.scrollLeft, moved: false }; });
  el.addEventListener("click", (e) => { if (el.dataset.hsMoved) { e.preventDefault(); e.stopPropagation(); delete el.dataset.hsMoved; } }, true);
}
// Un seul jeu d'écouteurs sur la fenêtre pour toutes les rangées (les rangées retirées de la page sont oubliées).
const hsLive = new Map();
let hsDrag = null;
addEventListener("resize", () => { for (const [el, sync] of hsLive) { if (el.isConnected) sync(); else hsLive.delete(el); } });
addEventListener("pointermove", (e) => {
  if (!hsDrag) return;
  const dx = e.clientX - hsDrag.x0;
  if (Math.abs(dx) > 5) { hsDrag.moved = true; hsDrag.el.classList.add("hs-drag"); hsDrag.el.scrollLeft = hsDrag.s0 - dx; }
});
addEventListener("pointerup", () => {
  if (!hsDrag) return;
  const d = hsDrag; hsDrag = null;
  if (d.moved) { d.el.dataset.hsMoved = "1"; setTimeout(() => { d.el.classList.remove("hs-drag"); delete d.el.dataset.hsMoved; }, 50); }
});

// Raccourcis de l'icône (Android) et liens directs : ?bref=une|ville|video, ?focus=search.
function bootShortcut() {
  const p = new URLSearchParams(location.search);
  const bref = p.get("bref"), focus = p.get("focus");
  if (!bref && !focus) return;
  history.replaceState({ y: 0, d: 0 }, "", "./");
  render();
  setTimeout(() => {
    if (bref === "ville") openCityBref();
    else if (bref === "video") openVideoBref();
    else if (bref) openEnBref();
    else if (focus === "search") $("#search input").focus();
  }, 400);
}

/* ---------- Le fil ---------- */
// Montrée une seule fois : comment lire un bloc du fil.
const HOWTO = `<aside class="howto" aria-label="Comment lire Prisme">
  <div class="howto-h"><span class="kicker">Comment lire Prisme</span><button class="btn" type="button" id="howtoOk">Compris</button></div>
  <ol>
    <li><b>Chaque bloc est une histoire</b>, pas un article : un même évènement, raconté par plusieurs médias. Prisme regroupe leurs articles.</li>
    <li><b>Touche le titre ou la photo</b> pour lire l'article. Le nom du média est sous le titre ; touche-le pour en choisir un autre.</li>
    <li><b>La barre de couleur</b> montre d'où viennent ces médias : <span class="sw-l">gauche</span>, <span class="sw-c">centre</span>, <span class="sw-r">droite</span>.</li>
    <li><b>« Comparer les médias »</b>, sous chaque nouvelle : ce que la gauche, le centre et la droite en disent, titre par titre.</li>
  </ol>
</aside>`;
// Noms courts des lentilles (téléphone : tout tient sur deux lignes, rien à glisser).
const LENS_SHORT = { essentiel: "Essentiel", angles: "Angles morts", gauche: "Gauche", droite: "Droite", horsradar: "Hors radar", recent: "En continu", pourtoi: "Pour toi" };
const feedKey = (r) => (r.q ? `q|${r.q.toLowerCase()}|${state.region}` : `f|${r.cat}|${r.lens}|${state.region}`);

function viewFeed(v, route) {
  if (state.refreshFeeds) { state.refreshFeeds = false; state.feeds.clear(); } // des nouvelles fraîches sont arrivées entre-temps
  const key = feedKey(route);
  const lensHtml = `<div class="lensbar">
      <span class="label">Voir par</span>
      <div class="lenses" role="group" aria-label="Lentille">${Object.entries(LENSES).filter(([k, l]) => (!l.qc || ["qc", "ca"].includes(state.region)) && (k !== "local" || route.lens === "local")).map(([k, l]) =>
        `<button type="button" data-lens="${k}" aria-pressed="${route.lens === k}">${l.sw ? `<span class="sw" style="background:${l.sw}"></span>` : ""}${k === "local" ? `📍 ${esc(prefs.cityLabel || "Ma ville")}` : `<span class="ln-l">${l.label}</span><span class="ln-s">${LENS_SHORT[k] || l.label}</span>`}</button>`).join("")}<button class="lens-help" type="button" aria-expanded="false" aria-label="Expliquer cette lentille">?</button></div>
      <div class="lens-desc" hidden>${esc(LENSES[route.lens].desc)}<div class="ld-legend">${legend()}</div></div>
    </div>`;
  v.innerHTML = `${folio(esc(CAT_LABEL[route.cat]), regionLabel())}${lensHtml}
    ${route.lens === "local" ? `<div class="city-bar" id="cityBar"></div>` : ""}
    <div class="topics" id="topics"></div>
    <div class="layout">
      <div class="main-col"><button class="new-pill" id="newPill" type="button" hidden></button><div class="feed-top"><p class="fresh" id="fresh" hidden></p><button class="sort-btn" type="button" id="sortBtn" aria-haspopup="dialog">Trier : <b>${esc(LENS_SHORT[route.lens] || LENSES[route.lens]?.label || "")}</b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button></div>${homeCards(route)}${route.cat === "sports" ? `<div id="habsFeed" hidden></div>` : ""}${installCard()}${store.get("howto") ? "" : HOWTO}<div id="feed"></div><div id="sentinel"></div><div id="feedStatus"></div></div>
      <aside class="rail" aria-label="Autour du fil"><div class="rail-in" id="rail"></div></aside>
    </div>`;
  $("#sortBtn", v).onclick = () => openSortSheet(route);
  fillHabs($("#habsFeed", v));
  $(".lens-help", v).onclick = (e) => { const d = $(".lens-desc", v); d.hidden = !d.hidden; e.currentTarget.setAttribute("aria-expanded", String(!d.hidden)); };
  const ht = $("#howtoOk", v);
  if (ht) ht.onclick = () => { store.set("howto", "1"); $(".howto", v)?.remove(); };
  if (route.lens === "local") drawCityBar($("#cityBar", v), route);
  $(".lenses", v).onclick = (e) => {
    const b = e.target.closest("[data-lens]");
    if (b) go(href({ cat: route.cat, lens: b.dataset.lens }));
  };
  mountFeed(key, { cat: route.cat, lens: route.lens });
}

// La barre « Ma ville » : la ville choisie, et une case pour en choisir une autre en tapant son nom.
function drawCityBar(el, route) {
  const has = !!prefs.city;
  el.innerHTML = `<div class="cb-main">${pin}<span>${has ? `Les nouvelles de <b>${esc(prefs.cityLabel || "ta ville")}</b> et de sa région` : "<b>Choisis ta ville</b> pour voir ses nouvelles"}</span>
      ${has ? `<a class="btn ghost" href="${href({ ville: prefs.city })}" data-nav>Page de la ville →</a>` : ""}</div>
    <label class="cb-pick${has ? " cb-closed" : ""}" id="cbPick"><span class="label">${has ? "Changer de ville" : "Ta ville"}</span>
      <input type="search" id="cbInput" list="cbVilles" placeholder="Tape le nom de ta ville (ex. Victoriaville)…" autocomplete="off"><datalist id="cbVilles"></datalist></label>
    ${has ? `<button class="link cb-change" type="button" id="cbChange">Changer de ville</button>` : ""}`;
  const ch = $("#cbChange", el);
  if (ch) ch.onclick = () => { $("#cbPick", el).classList.remove("cb-closed"); ch.remove(); $("#cbInput", el).focus(); };
  villesData().then((V) => {
    cityAuto($("#cbInput", el), V);
    $("#cbInput", el).onchange = (e) => {
      const f = foldText(e.target.value).trim();
      const hit = V.list.find((x) => foldText(villeLabel(x)) === f) || matchVilles(V, e.target.value, 1)[0];
      if (!hit) return;
      store.set("city", hit.s); store.set("cityLabel", hit.n);
      state.feeds.clear();
      toast(`${hit.n} est ta ville.`);
      render();
    };
  }).catch(() => {});
}

function mountFeed(key, params) {
  let f = state.feeds.get(key);
  if (!f) { f = { stories: [], page: -1, hasMore: true, loading: false, params }; state.feeds.set(key, f); }
  state.lastFeedKey = key; // pour « Histoire suivante »
  drawFeed(f);
  // « En bref » demandé depuis une autre page : le fil est là, on l'ouvre.
  if (state.enBrefPending && f.stories.length) { state.enBrefPending = false; setTimeout(openShorts, 60); }
  if (f.page < 0) loadMore(key); else tryResume(f, key);
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
    // Une faute de frappe corrigée : on cherche le bon mot à la place, et on le dit.
    if (d.corrected && f.params.q && feedKey(state.route) === key) {
      f.loading = false;
      state.feeds.delete(key);
      toast(`Résultats pour « ${d.corrected} » (au lieu de « ${f.params.q} »)`);
      go(href({ q: d.corrected }), { replace: true });
      return;
    }
    f.page = d.page;
    f.hasMore = d.hasMore;
    if (d.summary) { f.summary = d.summary; f.trending = d.trending; f.total = d.total; f.fresh = d.fresh || 0; f.hero = !!d.hero; f.blind = d.blind || null; if (f.blind) state.stories.set(f.blind.id, f.blind); }
    if (d.fetchedAt) f.fetchedAt = d.fetchedAt;
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
    tryResume(f, key);
    if (state.enBrefPending && f.stories.length) { state.enBrefPending = false; openShorts(); }
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
    el.innerHTML = feedRows(f, 0);
    // Repère de vitesse : le moment où les premières nouvelles sont à l'écran (lisible dans les outils du navigateur).
    if (!state.firstFeedAt) { state.firstFeedAt = Math.round(performance.now()); try { performance.mark("prisme-fil"); } catch { /* sans repères */ } }
    countUp(el);
    fillFollowCard();
    setTimeout(coachMarks, 1500);
    if ($("#rowVille", el)) setTimeout(fillCityRow, 300);
  }
  drawNewPill(f);
  drawFresh();
  drawStatus(f);
  drawTopics(f);
  drawRail(f);
}

function appendFeed(f) {
  const el = $("#feed");
  const shown = Number(el.dataset.count || 0);
  el.insertAdjacentHTML("beforeend", feedRows(f, shown));
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
  if (f.params.lens === "pourtoi" && !hasPrefs()) return `<div class="empty"><h3>Dis à Prisme ce qui t'intéresse.</h3><p>Choisis des rubriques, ta ville, suis des sujets ou des médias : ce fil se remplira avec ce qui te touche.</p><button class="btn" type="button" data-open-settings>Choisir ce qui m'intéresse</button></div>`;
  if (f.params.lens === "local" && !prefs.city) return `<div class="empty"><h3>Choisis ta ville ou ta région.</h3><p>Prisme te montrera les histoires qui en parlent.</p><button class="btn" type="button" data-open-settings>Choisir ma ville</button></div>`;
  if (f.params.lens === "local") return `<div class="empty"><h3>Rien sur ${esc(CITIES[prefs.city]?.label || "ta ville")} dans les grandes histoires en ce moment.</h3><p><a class="btn" href="${href({ ville: prefs.city })}" data-nav>Voir toutes les nouvelles de ma ville</a></p><p>Reviens plus tard, ou change de région dans les réglages.</p><button class="btn ghost" type="button" data-open-settings>Réglages</button></div>`;
  const lens = LENSES[f.params.lens];
  return `<div class="empty"><h3>Rien dans « ${esc(lens.label)} » pour l'instant.</h3>
    <p>${f.params.lens === "angles" ? "Aucune histoire n'est assez couverte d'un seul côté en ce moment. C'est plutôt bon signe." : "Essaie une autre lentille ou une autre édition."}</p>
    <a class="btn ghost" href="${href({ cat: f.params.cat, lens: "essentiel" })}" data-nav>Revenir à L'essentiel</a></div>`;
}

function skeleton() {
  const line = (w, h = 14, m = 10) => `<div class="skel" style="height:${h}px;width:${w}%;margin-top:${m}px"></div>`;
  // Des silhouettes de la vraie mise en page (la une, puis des cartes), qui scintillent pendant le chargement.
  return `<div class="sk-hero"><div class="skel sk-img"></div>${line(35, 12, 14)}${line(95, 26, 10)}${line(70, 26, 8)}${line(45, 5, 14)}</div>`
    + `<div class="sk-card"><div>${line(22, 11, 0)}${line(95, 18, 10)}${line(75, 18, 6)}${line(40, 4, 12)}${line(55, 11, 10)}</div><div class="skel sk-th"></div></div>`.repeat(4);
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
  hScroll(el);
}

function drawRail(f) {
  const el = $("#rail");
  if (!el) return;
  const sm = f.summary;
  const blinds = f.stories.filter((s) => s.blindspot).slice(0, 4);
  const maxOwner = sm?.owners?.[0]?.n || 1;
  // Une colonne aérée : la météo de ta ville, tes sujets (s'il y en a), les angles morts. Les chiffres du fil sont repliés.
  el.innerHTML = `
    ${prefs.city ? `<section class="rail-wx" id="railWx" hidden></section>` : ""}
    ${topics.list().length ? `<section>
      <h2 class="block-h">Mes sujets <small>sur cet appareil</small></h2>
      <div class="chips">${topics.list().map(topicChip).join("")}</div>
      ${"Notification" in window && Notification.permission === "default" ? `<button class="link small" type="button" id="notifBtn" style="margin-top:10px">Recevoir une alerte quand un de mes sujets bouge</button>` : ""}
    </section>` : ""}
    ${blinds.length && f.params.lens !== "angles" ? `<section>
      <h2 class="block-h">Angles morts <small>dans ce fil</small></h2>
      <ul class="mini-stories">${blinds.map((s) => `<li><span class="flag ${s.blindspot === "right" ? "r" : "l"}">Peu couvert ${s.blindspot === "right" ? "à droite" : "à gauche"}</span>
        <a href="${href({ h: s.id })}" data-nav>${esc(s.title)}</a>${bar(s.counts)}</li>`).join("")}</ul>
    </section>` : ""}
    ${sm ? `<details class="rail-more"><summary>Ce fil en chiffres <small>propriétaires, médias</small></summary><section>
      <h2 class="block-h">Qui possède ce fil <small>${plural(sm.outlets, "média")}</small></h2>
      <ul class="rank">${sm.owners.map((o) => `<li><span class="nm">${esc(o.owner.replace(/\s*\(.*\)$/, ""))}</span><span class="n">${plural(o.n, "histoire")}</span><span class="track"><span style="width:${(o.n / maxOwner) * 100}%"></span></span></li>`).join("")}</ul>
      <p class="note">Nombre d'histoires de ce fil où chaque propriétaire a au moins un média.</p>
    </section>
    <section>
      <h2 class="block-h">Les médias du fil <small>médias évalués</small></h2>
      ${bigBar(sm.counts, { rated: true })}
      <div style="margin-top:8px">${splitHtml(sm.counts)}</div>
      <p class="note">${sm.counts.unk ? `${plural(sm.counts.unk, "autre média", "autres médias")} non évalués. ` : ""}${plural(sm.sourcesOnline, "média lu", "médias lus")} directement par Prisme dans cette édition. <button class="link" type="button" data-about>Comment Prisme choisit</button></p>
    </section></details>` : ""}`;
  const nb = $("#notifBtn", el);
  if (nb) nb.onclick = async () => { await Notification.requestPermission(); drawRail(f); };
  fillRailWx($("#railWx", el));
}
// La météo de ta ville dans la colonne de droite (ordinateur) : un toucher ouvre la feuille météo.
async function fillRailWx(el) {
  if (!el || !navigator.onLine) return;
  const city = (await villesData().catch(() => null))?.bySlug.get(wxSlug());
  const w = city && await weather(city).catch(() => null);
  if (!w?.hours || !el.isConnected) return;
  const [, lbl] = WMO(w.code);
  el.innerHTML = `<button class="rw-btn" type="button" data-wx-city="${esc(city.s)}">
    <span class="rw-ico" aria-hidden="true">${wxIco(w.code, w.day)}</span>
    <span class="rw-main"><b>${w.t}°</b><span>${pin} <span data-no-tr>${esc(city.n)}</span></span><small>${esc(lbl)} · max ${w.max}° · min ${w.min}°</small></span>
    <span class="rw-go">Les prochains jours ›</span></button><p class="notices" id="railNotice" role="button" tabindex="0" hidden></p>`;
  el.hidden = false;
  fillNotices($("#railNotice", el), city);
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
  const onePer = (list) => { const seen = new Set(); return [...list].sort((a, b) => (b.published || "").localeCompare(a.published || "")).filter((a) => !seen.has(a.domain) && seen.add(a.domain)); };
  const groups = SIDES.map((side) => ({ ...side, items: onePer(s.articles.filter((a) => side.keys.includes(biasKey(a.media)))) }));
  const others = onePer(s.articles.filter((a) => !sideOf(a.media)));
  const owners = new Map();
  for (const a of s.articles) if (a.media.known) owners.set(a.media.owner, (owners.get(a.media.owner) || new Set()).add(a.domain));
  const ownerList = [...owners.entries()].map(([o, d]) => ({ owner: o, n: d.size })).sort((a, b) => b.n - a.n);
  const timeline = s.articles.filter((a) => a.published).sort((a, b) => a.published.localeCompare(b.published)).slice(0, 10);
  const back = history.length > 1 ? `<a class="back" href="./" id="backBtn">← Retour</a>` : `<a class="back" href="./" data-nav>← Le fil</a>`;

  const words = loadedWords(s);
  const marksFor = (a) => { const sd = sideOf(a.media); return sd === "left" ? words.leftSet : sd === "right" ? words.rightSet : null; };
  const hlItem = (a) => `<li>
    <div class="row"><button class="src" type="button" data-domain="${esc(a.domain)}" data-name="${esc(a.sourceName)}">${favicon(a.domain, a.sourceName)}<span>${esc(a.sourceName)}</span></button>${badge(a.media)}${langTag(a.lang)}${artTags(a)}<time>${esc(ago(a.published))}</time><span class="acts">${laterBtn(artFav(a))}${favBtn(artFav(a))}${shareBtn(artShare(a))}</span></div>
    ${artLink(a, "t", marksFor(a))} ${transLink(a)}
    ${a.prevTitle ? `<div class="was">Titre modifié · avant : <s>${esc(a.prevTitle)}</s></div>` : ""}
    ${a.media.known ? `<div class="own">${esc(a.media.owner)}</div>` : ""}
  </li>`;

  v.innerHTML = `${stickyBar(s)}${back}
    <div class="layout" style="padding-top:0">
      <div class="main-col">
        ${s.image ? `<div class="glow-wrap" aria-hidden="true"><img class="glow" src="${esc(safeUrl(s.image))}" alt="" referrerpolicy="no-referrer"></div>` : ""}
        ${s.image ? `<figure class="s-hero s-hero-top"><img src="${esc(safeUrl(s.image))}" alt="" referrerpolicy="no-referrer"><span class="credit">${esc(s.imageSource || "")}</span></figure>` : ""}
        <header class="s-head">
          <div class="kicker">${(s.categories || []).filter((c) => CAT_LABEL[c] && c !== "une").slice(0, 1).map((c) => esc(CAT_LABEL[c])).join("") || "Histoire"} · ${esc(agoShort(s.lastSeen || s.firstSeen))}</div>
          <h1 data-no-tr>${titleOf(s)}</h1>
          ${s.titleFr ? `<p class="s-orig">Titre original : <span data-no-tr>${esc(s.title)}</span></p>` : ""}
          ${readBox(s)}
          <div class="s-acts">${listenBtn(s.id)}${favBtn(storyFav(s), true)}${storyShareBtn(s)}${textSizeBtn}</div>
        </header>
        <!-- L'essentiel d'abord : le résumé, deux titres face à face, qui en parle. Le reste se déplie. -->
        ${keyPoints(s)}
        ${understandCard(s)}
        ${faceToFace(s)}

        <section class="sec" id="sxSummary" hidden></section>

        <section class="sec s-who">
          <h2 class="block-h">Qui en parle <small>${plural(s.sources, "média")}</small></h2>
          ${bigBar(s.counts)}
          <div class="s-cov">${SIDES.map((side) => `<div><b><span data-count="${pct(sd[side.key])}">${pct(sd[side.key])}</span> %</b><small><i style="background:${side.color}"></i>${side.label} · ${sd[side.key]}</small></div>`).join("")}</div>
          ${s.blindspot ? `<div class="callout ${s.blindspot === "right" ? "r" : "l"}"><b>ANGLE MORT.</b> Les médias de ${s.blindspot === "right" ? "droite" : "gauche"} en parlent très peu : ${pct(s.blindspot === "right" ? sd.right : sd.left)} % des médias évalués.</div>` : ""}
          ${s.counts.state ? `<div class="callout"><b>MÉDIAS D'ÉTAT.</b> ${plural(s.counts.state, "média contrôlé", "médias contrôlés")} par un gouvernement couvre${s.counts.state > 1 ? "nt" : ""} aussi cette histoire.</div>` : ""}
        </section>

        <details class="s-fold"${innerWidth > 1020 ? " open" : ""}>
          <summary>Tous les titres, média par média <small>${plural(s.sources, "média")}</small></summary>
          <section class="sec">
          <p class="note" style="margin:0 0 12px">Chaque ligne est l'article d'un média différent sur la même nouvelle. Touche un titre pour lire l'article.</p>
          ${words.left.length || words.right.length ? `<div class="words">
            <p class="note" style="margin:0 0 10px">Les mots surlignés n'apparaissent que d'un côté : c'est souvent là que se cache le cadrage.</p>
            <div class="words-cols">
              <div><span class="bb bb-l2">Mots de la gauche</span> ${words.left.map((w) => `<mark class="ml">${esc(w.w)}</mark>`).join(" ") || '<span class="muted small">aucun mot propre</span>'}</div>
              <div><span class="bb bb-r2">Mots de la droite</span> ${words.right.map((w) => `<mark class="mr">${esc(w.w)}</mark>`).join(" ") || '<span class="muted small">aucun mot propre</span>'}</div>
            </div>
          </div>` : ""}
          <div class="cols3">${groups.map((g) => `<section>
            <div class="col-h"><i style="background:${g.color}"></i>${g.label}<small>${plural(g.items.length, "média")}</small></div>
            ${g.items.length ? `<ul class="hl">${g.items.slice(0, 3).map(hlItem).join("")}</ul>${g.items.length > 3 ? `<ul class="hl" hidden>${g.items.slice(3).map(hlItem).join("")}</ul><button class="col-more" type="button" data-expand>Voir les ${g.items.length - 3} autres</button>` : ""}` : `<div class="col-empty">Aucun média de ${g.label.toLowerCase()} lu par Prisme n'a couvert cette histoire.</div>`}
          </section>`).join("")}</div>
        </section>

        ${others.length ? `<section class="sec">
          <h2 class="block-h">Autres sources <small>médias d'État ou non évalués</small></h2>
          <ul class="hl">${others.slice(0, 4).map(hlItem).join("")}</ul>${others.length > 4 ? `<ul class="hl" hidden>${others.slice(4).map(hlItem).join("")}</ul><button class="col-more" type="button" data-expand>Voir les ${others.length - 4} autres</button>` : ""}
        </section>` : ""}
        </details>

        ${(() => { const t = storyThread(s); return t ? `<details class="s-fold s-fold-thread"><summary>Le fil de l'histoire <small>jour après jour</small></summary>${t}</details>` : ""; })()}

        <details class="s-more s-fold"${innerWidth > 1020 ? " open" : ""}>
          <summary>Plus de contexte <small>silences, ailleurs, vidéos</small></summary>
          <section class="sec" id="sxSilent" hidden></section>
          <section class="sec" id="sxWorld" hidden></section>
          <section class="sec" id="sxVideos" hidden></section>
          <section class="sec" id="sxChanged" hidden></section>
        </details>
      </div>

      <aside class="rail"><div class="rail-in">
        <section class="r-desk">
          <h2 class="block-h">Qui possède ces médias</h2>
          ${ownerList.length ? `<ul class="rank">${ownerList.slice(0, 8).map((o) => `<li><span class="nm">${esc(o.owner.replace(/\s*\(.*\)$/, ""))}</span><span class="n">${plural(o.n, "média")}</span><span class="track"><span style="width:${(o.n / ownerList[0].n) * 100}%"></span></span></li>`).join("")}</ul>` : `<p class="note">Aucun propriétaire connu.</p>`}
        </section>
        ${timeline.length ? `<section class="r-desk">
          <h2 class="block-h">Chronologie <small>qui en a parlé en premier</small></h2>
          <ol class="timeline">${timeline.map((a) => `<li><time>${esc(clock(a.published))}</time><span><b>${esc(a.sourceName)}</b> ${tag(a.media)}</span></li>`).join("")}</ol>
        </section>` : ""}
        <section>
          <h2 class="block-h">Aller plus loin</h2>
          <p class="note" style="margin:0 0 10px">Cherche ce sujet dans tous les médias lus par Prisme, ou suis-le.</p>
          <div class="chips">${(s.keywords || keywordsOf(s)).slice(0, 4).map((k) => `<a class="chip" href="${href({ q: k })}" data-nav>${esc(k)}</a>`).join("")}</div>
        </section>
        <section>
          <h2 class="block-h">Vérifier</h2>
          <p class="note" style="margin:0 0 10px">Des vérificateurs de faits (Les Décrypteurs, AFP Factuel, et d'autres) ont-ils examiné ce sujet ?</p>
          <a class="btn ghost" href="https://toolbox.google.com/factcheck/explorer/search/${encodeURIComponent((s.keywords || keywordsOf(s)).slice(0, 2).join(" ") || s.title)};hl=fr" target="_blank" rel="noopener noreferrer">Chercher des vérifications ↗</a>
          <p class="note" style="margin:14px 0 0">Cette page mélange deux nouvelles différentes ? <a class="link" href="https://github.com/axe414/prisme/issues/new?template=signaler-un-probleme.yml&title=${encodeURIComponent(`Mauvais regroupement : ${s.title}`.slice(0, 120))}" target="_blank" rel="noopener noreferrer">Le signaler</a></p>
        </section>
      </div></aside>
    </div>`;
  const b = $("#backBtn", v);
  if (b) b.onclick = (e) => { e.preventDefault(); history.back(); };
  for (const x of $$("[data-expand]", v)) x.onclick = () => { x.previousElementSibling.hidden = false; x.remove(); };
  storySticky(v, s);
  setSeen(s, true);
  runFlip(v);
  countUp(v);
  storyReadBar(v, s);
  if (favs.has(`s:${s.id}`)) followN.set(s.id, s.sources || 0); // histoire suivie : vue jusqu'ici
  storyExtras(s, hlItem);
}

const still = (id) => state.route.view === "story" && state.route.id === id;

// Lire l'histoire : le meilleur article (dans ta langue, d'un média connu), puis le choix du média.
function readBox(s) {
  const want = LANG === "en" ? "en" : "fr";
  const ranked = rankArticles(s);
  const best = ranked[0];
  if (!best) return "";
  const meta = (a) => esc(JSON.stringify({ u: a.url, d: a.domain, n: a.sourceName, k: biasKey(a.media), o: a.media?.known ? a.media.owner : null, c: a.media?.country || null, t: a.title }));
  const rest = ranked.slice(1);
  return `<div class="s-read">
    <a class="btn btn-read" href="${esc(safeUrl(best.url))}" target="_blank" rel="noopener noreferrer" data-read="${meta(best)}">Lire l'article <span>chez ${esc(best.sourceName)}</span> ↗</a>
    ${best.lang && best.lang !== want ? `<a class="link" href="${esc(transUrl(best.url))}" target="_blank" rel="noopener noreferrer">Lire traduit en français</a>` : ""}
    ${rest.length ? `<button class="s-pick" type="button" data-pick="${esc(s.id)}">${logoStack(s, 4)}<span>Choisir un autre média <small>(${rest.length})</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>` : ""}
  </div>`;
}

// L'essentiel d'une histoire en 3 points : ce qui se passe, qui en parle, l'angle.
function keyPoints(s) {
  const sd = sides(s.counts);
  const others = s.sources - sd.left - sd.center - sd.right;
  const first = s.articles.filter((a) => a.published).sort((a, b) => a.published.localeCompare(b.published))[0];
  const angle = s.blindspot ? `Angle mort : les médias de ${s.blindspot === "right" ? "droite" : "gauche"} en parlent très peu.`
    : s.lean === "left" ? "Surtout couverte par des médias de gauche." : s.lean === "right" ? "Surtout couverte par des médias de droite."
    : s.sides === 3 ? "La gauche, le centre et la droite en parlent tous." : "Peu de médias évalués en parlent pour l'instant.";
  const ai = s.ai || state.summaries?.[s.id];
  return `<section class="s-key${ai?.summary ? " has-ai" : ""}" aria-label="L'essentiel">
    <h2 class="block-h">L'essentiel <small id="keySrc">${ai?.summary ? "✦ résumé neutre écrit par IA" : "en 3 points"}</small></h2>
    <ol>
      <li><b>Ce qui se passe.</b> <span id="keyWhat" data-no-tr>${esc(ai?.summary || s.summary || "Les titres de chaque média sont plus bas.")}</span>${!ai?.summary && s.summary ? ` <small class="key-src" id="keyFrom">Extrait de ${esc(s.summarySource || "un média")}${s.lang && s.lang !== "fr" ? `, en ${esc(LANG_NAME[s.lang] || s.lang)} · <a class="link" href="${esc(transUrl((s.articles.find((a) => a.sourceName === s.summarySource) || s.articles[0]).url))}" target="_blank" rel="noopener noreferrer">Traduire</a>` : ""}. Pas de résumé IA pour cette histoire.</small>` : ""}</li>
      <li><b>Qui en parle.</b> ${plural(s.sources, "média")} : ${sd.left} à gauche, ${sd.center} au centre, ${sd.right} à droite${others ? `, ${others} non évalué${others > 1 ? "s" : ""}` : ""}.${first ? ` En premier : <b data-no-tr>${esc(first.sourceName)}</b>, ${esc(ago(first.published))}.` : ""}</li>
      <li><b>L'angle.</b> <span id="keyAngle">${ai?.left || ai?.right ? `${ai.left ? `<span class="bb bb-l2">Gauche</span> <span data-no-tr>${esc(ai.left)}</span> ` : ""}${ai.right ? `<span class="bb bb-r2">Droite</span> <span data-no-tr>${esc(ai.right)}</span>` : ""}` : angle}</span></li>
    </ol>
    <p class="ai-note" id="keyNote"${ai?.summary ? "" : " hidden"}>✦ Ce résumé a été écrit par une IA (Gemini) à partir des titres de tous les médias, de la gauche à la droite. Elle peut se tromper : les titres de chaque média sont plus bas.</p>
  </section>`;
}

// Les à-côtés d'une histoire, chargés après l'affichage.
async function storyExtras(s, hlItem) {
  // Résumé neutre (IA), seulement si une clé est configurée. Le palier gratuit est lent : on l'annonce.
  api(`/api/summary?id=${encodeURIComponent(s.id)}&region=${state.region}`).then((r) => {
    const el = $("#sxSummary");
    if (!el || !still(s.id)) return;
    if (r.summary) {
      const kw = $("#keyWhat"); if (kw) kw.textContent = r.summary;
      $("#keyFrom")?.remove();
      const ks = $("#keySrc"); if (ks) ks.textContent = "✦ résumé neutre écrit par IA";
      const kn = $("#keyNote"); if (kn) kn.hidden = false;
      $(".s-key")?.classList.add("has-ai");
    }
    if (r.left || r.right) { const ka = $("#keyAngle"); if (ka) ka.innerHTML = `${r.left ? `<span class="bb bb-l2">Gauche</span> <span data-no-tr>${esc(r.left)}</span> ` : ""}${r.right ? `<span class="bb bb-r2">Droite</span> <span data-no-tr>${esc(r.right)}</span>` : ""}`; }
    // Le résumé est déjà en tête de page : pas de section en double.
    if (!r.configured || r.summary || !r.error) { el.hidden = true; return; }
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
  Object.assign(state.wf, { scope: "auto", hours: 0, side: "all", lang: "all", cat: "all", media: "" });
  const followed = topics.has(route.q);
  const pq = parseQuery(route.q);
  v.innerHTML = `<header class="page-h">
      <div class="kicker">Sujet · ${esc(REGIONS.find(([r]) => r === state.region)[1])}</div>
      <h1>« ${esc(route.q)} »</h1>
      ${pq.also.length ? `<p class="q-also">Prisme cherche aussi : ${pq.also.map((w) => `<b>${esc(w)}</b>`).join(", ")}</p>` : ""}
      <div class="actions">
        <button class="btn${followed ? " ghost" : ""}" type="button" id="follow">${followed ? "✓ Suivi" : "★ Suivre ce sujet"}</button>
        <a class="btn ghost" href="#wide" id="wideBtn">Voir tous les articles (7 jours)</a>
        ${shareBtn({ title: `« ${route.q} » sur Prisme`, text: `Qui parle de « ${route.q} », de la gauche à la droite`, url: absUrl(href({ q: route.q })) }, true)}
      </div>
      <details class="q-help"><summary>Astuces de recherche</summary>
        <ul>
          <li><b>"phrase exacte"</b> entre guillemets : <code>"banque du canada"</code></li>
          <li><b>-mot</b> pour exclure : <code>canadiens -hockey</code></li>
          <li>Les <b>synonymes et traductions</b> sont inclus : <code>ovni</code> trouve aussi <i>UFO</i> et <i>PAN</i>, <code>ia</code> trouve <i>AI</i>.</li>
          <li>Le <b>nom d'un média</b> (« TVA », « Le Devoir ») ouvre sa page, où tu peux fouiller ses articles.</li>
        </ul>
      </details>
    </header>
    <section id="outletHits" hidden></section>
    <section id="topArts" class="top-arts" hidden></section>
    <div class="layout">
      <div class="main-col"><div id="feed"></div><div id="sentinel"></div><div id="feedStatus"></div>
        <section id="worldStories" class="sec" hidden></section>
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
  // Peu d'histoires dans l'édition : on montre aussi celles du monde entier.
  const check = async () => {
    const ff = state.feeds.get(key);
    if (!ff || ff.error || state.route.view !== "search" || state.route.q !== route.q) return;
    if (ff.loading || ff.page < 0) return setTimeout(check, 300);
    if (ff.stories.length >= 3 || state.region === "monde") return;
    const w = await api(`/api/feed?q=${encodeURIComponent(route.q)}&region=monde&page=0`).catch(() => null);
    const el = $("#worldStories");
    const extra = (w?.stories || []).filter((s) => !ff.stories.some((x) => x.id === s.id)).slice(0, 8);
    if (!el || !extra.length || state.route.view !== "search" || state.route.q !== route.q) return;
    for (const s of extra) state.stories.set(s.id, s);
    el.hidden = false;
    el.innerHTML = `<h2 class="block-h">Histoires dans le monde entier <small>${plural(extra.length, "histoire")}</small></h2>${extra.map((s) => storyRow(s)).join("")}`;
  };
  if (f) check();
  // Tous les articles (index de 7 jours, partout) : toujours affichés sous les histoires.
  const goWide = state.pendingWide === route.q;
  state.pendingWide = null;
  loadWide(route.q, goWide);
  searchTopArticles(route.q);
  // La recherche nomme peut-être un média : on le propose en premier.
  villesData().then((V) => {
    const f = foldText(route.q).trim();
    const city = V.list.find((x) => x.f === f || x.short === f);
    const el = $("#outletHits");
    if (!city || !el || state.route.view !== "search" || state.route.q !== route.q) return;
    el.hidden = false;
    el.insertAdjacentHTML("afterbegin", `<a class="ville-card" href="${href({ ville: city.s })}" data-nav>${pin}<span><b>Toutes les nouvelles de ${esc(villeLabel(city))}</b><small>${esc(villeWhere(city))} · histoires, articles, médias locaux, villes voisines</small></span><span class="go">→</span></a>`);
  }).catch(() => {});
  searchBase().then((m) => {
    const hits = matchOutlets(m.D, route.q);
    const el = $("#outletHits");
    if (!el || !hits.length || state.route.view !== "search" || state.route.q !== route.q) return;
    el.hidden = false;
    el.insertAdjacentHTML("beforeend", `<h2 class="block-h">Médias <small>qui correspondent à « ${esc(route.q)} »</small></h2>
      <div class="outlet-hits">${hits.map((d) => `<a class="outlet-hit" href="${href({ m: d.domain })}" data-nav>
        ${favicon(d.domain, d.name)}<span class="oh-main"><b>${esc(d.name)}</b><small>${d.media.known ? esc(d.media.owner.replace(/\s*\(.*\)$/, "")) : esc(d.domain)}</small></span>
        <span class="oh-side">${badge(d.media)}<small>${plural(d.count, "article")} en 7 jours</small></span></a>`).join("")}</div>`);
  }).catch(() => {});
}

const emptySearch = (q) => `<div class="empty" style="padding-bottom:10px"><h3>Rien dans les dernières 48 heures.</h3><p>Aucune histoire de Prisme ne correspond à « ${esc(q)} ». Voici ce qu'on trouve dans tous les articles lus par Prisme.</p></div>`;

/* ---------- La page d'un média : fouiller ses articles des 7 derniers jours ---------- */
const outletFileName = (d) => `${d.toLowerCase().replace(/[^a-z0-9.-]/g, "_")}.json`;
// Les articles d'un média (archive de 7 jours du robot, avec image et extrait). Repli : l'édition en cours.
async function outletArticles(domain) {
  try {
    const raw = await dataJson(`m/${outletFileName(domain)}`, 15 * 60e3);
    if (raw._decoded) return raw._decoded;
    const [name, k, owner, country, bias, st] = raw.meta;
    const media = mediaFromKey(name, k, owner, country, bias, st);
    const items = raw.items.map(([title, url, min, lang, cats, image, summary]) => ({
      title, url, domain, sourceName: name, media, published: min ? new Date(min * 60000).toISOString() : null,
      lang, cats: cats || 0, image, summary, fold: foldText(`${title} ${summary || ""}`),
    }));
    return (raw._decoded = { domain, name, media, items, days: 7 });
  } catch {
    for (const r of [state.region, "monde"]) {
      const idx = await articlesOf(r).catch(() => null);
      const d = idx?.domains.find((x) => x.domain === domain);
      if (d) return { domain, name: d.name, media: d.media, items: idx.items.filter((a) => a.domain === domain), days: 2 };
    }
    return null;
  }
}

const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function dayLabel(key) {
  const today = dayKey(new Date().toISOString()), y = dayKey(new Date(Date.now() - 864e5).toISOString());
  if (key === today) return "Aujourd'hui";
  if (key === y) return "Hier";
  const [Y, M, D] = key.split("-").map(Number);
  const s = new Date(Y, M - 1, D).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
  return s[0].toUpperCase() + s.slice(1);
}
// Les noms propres qui reviennent le plus dans les titres d'un média.
const SUBJ_STOP = /^(Le|La|Les|Un|Une|Des|Du|De|Au|Aux|En|Et|Pour|Avec|Sur|Dans|The|A|An|In|On|Of|For|And|With|How|Why|What|Who|When|This|After|Quand|Comment|Pourquoi|Voici|Selon|Après|Avant|Il|Elle|Ils|Ce|Ces|Cette|Son|Sa|Ses|Leur|Que|Qui|Où|Is|Are|It|He|She|They|We|You|Here|Not|No|Our|Your|Their|His|Her|Its|My|VIDÉO|VIDEO|EN|DIRECT|LIVE|PHOTOS|Opinion|Chronique|Analyse|Lettre|Éditorial|Exclusive|Watch|Breaking)$/;
function outletSubjects(items, n = 12) {
  const count = new Map(), shape = new Map();
  for (const a of items) {
    const seen = new Set();
    for (const m of a.title.matchAll(/\b(\p{Lu}[\p{L}'’-]{2,}(?:\s+\p{Lu}[\p{L}'’-]{2,})?)/gu)) {
      const raw = m[1];
      if (SUBJ_STOP.test(raw.split(/\s+/)[0]) || (/^[\p{Lu}\s'’-]+$/u.test(raw) && raw.length > 4)) continue;
      const k = foldText(raw);
      if (seen.has(k)) continue;
      seen.add(k);
      count.set(k, (count.get(k) || 0) + 1);
      if (!shape.has(k)) shape.set(k, raw);
    }
  }
  return [...count.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => [shape.get(k), c]);
}

const OF_PERIODS = [["all", "7 jours"], ["24", "24 h"], ["6", "6 h"]];
async function viewOutlet(v, route) {
  v.innerHTML = `<div class="page-h">${'<div class="skel" style="height:44px;width:50%;margin-top:10px"></div>'.repeat(3)}</div>`;
  const [data, ed] = await Promise.all([outletArticles(route.m), edition(state.region).catch(() => null)]);
  if (state.route.view !== "outlet" || state.route.m !== route.m) return;
  if (!data || !data.items.length) {
    v.innerHTML = `<div class="empty"><h3>Ce média n'a rien publié dans les derniers jours.</h3><p>Prisme ne trouve aucun article récent de <b>${esc(route.m)}</b>.</p><p><button class="btn ghost" type="button" data-domain="${esc(route.m)}" data-name="${esc(route.m)}">Voir sa fiche</button></p></div>`;
    return;
  }
  const { domain, name, media: m, items } = data;
  document.title = `${name} — Prisme`;
  // Quelles histoires de l'édition contiennent ses articles ?
  const storyOf = new Map();
  for (const s of ed?.stories || []) if (s.sources >= 2) for (const a of s.articles) if (a.domain === domain) storyOf.set(a.url, s);
  const stories = [...new Set(storyOf.values())].sort((a, b) => b.sources - a.sources).slice(0, 5);
  for (const s of stories) state.stories.set(s.id, s);

  // Activité des 7 derniers jours.
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * 864e5).toISOString()));
  const perDay = Object.fromEntries(days.map((d) => [d, 0]));
  for (const a of items) if (a.published) { const k = dayKey(a.published); if (k in perDay) perDay[k]++; }
  const activeDays = Math.max(1, days.filter((d) => perDay[d]).length);
  const maxDay = Math.max(1, ...Object.values(perDay));
  const recent48 = items.filter((a) => a.published && Date.now() - Date.parse(a.published) < 48 * 36e5);
  const inStories = recent48.filter((a) => storyOf.has(a.url)).length;
  const catCount = CATS.slice(1).map(([c, l], i) => [c, l, items.filter((a) => a.cats & (1 << i)).length]).filter((x) => x[2]).sort((a, b) => b[2] - a[2]);
  const langCount = new Map();
  for (const a of items) { const l = a.lang || "fr"; langCount.set(l, (langCount.get(l) || 0) + 1); }
  const subjects = outletSubjects(items);
  const followed = follows.has(domain);

  const f = state.of && state.of.domain === domain ? state.of : (state.of = { domain, q: "", period: "all", cat: "all", lang: "all", inStory: false, sort: "new", view: store.get("ofView", "list"), shown: 40 });

  v.innerHTML = `<div class="o-page"><header class="o-hero">
      <div class="o-id">
        <span class="o-logo">${favicon(domain, name)}</span>
        <div>
          <div class="kicker">Média · ${esc(m.country ? countryName(m.country) : regionLabel())}</div>
          <h1 data-no-tr>${esc(name)}</h1>
          <p class="o-meta">${badge(m)}${m.known ? `<span>Propriété : <b>${esc(m.owner)}</b></span>` : ""}<a class="link" href="https://${esc(domain)}" target="_blank" rel="noopener noreferrer">${esc(domain)} ↗</a></p>
        </div>
      </div>
      <div class="o-actions">
        <button class="btn${followed ? " ghost" : ""}" type="button" id="oFollow">${followed ? "✓ Suivi" : "★ Suivre ce média"}</button>
        ${shareBtn({ title: `${name} sur Prisme`, text: `Les articles de ${name}, son orientation et son propriétaire`, url: absUrl(href({ m: domain })) }, true)}
        <button class="act act-l" type="button" data-domain="${esc(domain)}" data-name="${esc(name)}">${ico("plus")}<span>Fiche complète</span></button>
        <a class="act act-l" href="${href({ v: "comparer" })}&a=${encodeURIComponent(domain)}" data-nav>${svg("comparer")}<span>Comparer</span></a>
      </div>
      <div class="o-stats">
        <div><b>${items.length}</b><small>articles en ${data.days > 2 ? "7 jours" : "48 h"}</small></div>
        <div><b>${Math.round(items.length / (data.days > 2 ? activeDays : 2))}</b><small>par jour en moyenne</small></div>
        <div><b>${recent48.length ? Math.round((inStories / recent48.length) * 100) : 0} %</b><small>dans une histoire couverte par d'autres</small></div>
        <div><b>${esc(catCount[0]?.[1] || "—")}</b><small>rubrique principale</small></div>
      </div>
      ${data.days > 2 ? `<div class="o-days" role="group" aria-label="Articles par jour">${days.map((d) => `<button type="button" data-day="${d}" aria-pressed="${f.period === d}" title="${esc(dayLabel(d))} : ${plural(perDay[d], "article")}">
        <span class="od-bar"><i style="height:${(perDay[d] / maxDay) * 100}%"></i></span><span class="od-n">${perDay[d]}</span><span class="od-l">${esc(new Date(d + "T12:00").toLocaleDateString(LOCALE, { weekday: "short" }))}</span></button>`).join("")}</div>` : ""}
      ${subjects.length ? `<div class="o-subj"><span class="label">Ses sujets</span>${subjects.map(([w, c]) => `<button class="chip" type="button" data-subj="${esc(w)}">${esc(w)} <span class="muted">${c}</span></button>`).join("")}</div>` : ""}
    </header>

    ${stories.length ? `<section class="sec o-stories-sec"><h2 class="block-h">Dans les grandes histoires <small>ses articles que d'autres médias couvrent aussi</small></h2>
      <ul class="o-stories">${stories.map((s) => `<li><a href="${href({ h: s.id })}" data-nav><span class="os-t" data-no-tr>${esc(s.title)}</span><span class="os-m">${bar(s.counts)}<small>${plural(s.sources, "média")} en parlent</small></span></a></li>`).join("")}</ul></section>` : ""}

    <section class="o-browse" id="oBrowse">
      <div class="o-tools" id="oTools">
        <label class="o-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="oQ" placeholder="Chercher dans ses articles…" value="${esc(f.q)}" autocomplete="off" enterkeyhint="search">
          <button type="button" id="oClear" class="o-clear" ${f.q ? "" : "hidden"} aria-label="Effacer">×</button>
        </label>
        <div class="o-chips">
          <div class="seg" role="group" aria-label="Période">${OF_PERIODS.filter(([k]) => data.days > 2 || k !== "all").map(([k, l]) => `<button type="button" data-period="${k}" aria-pressed="${f.period === k}">${l}</button>`).join("")}${data.days <= 2 ? `<button type="button" data-period="all" aria-pressed="${f.period === "all"}">48 h</button>` : ""}</div>
          ${catCount.length > 1 ? `<select id="oCat" aria-label="Rubrique"><option value="all">Toutes les rubriques</option>${catCount.map(([c, l, n]) => `<option value="${c}" ${f.cat === c ? "selected" : ""}>${esc(l)} (${n})</option>`).join("")}</select>` : ""}
          ${langCount.size > 1 ? `<select id="oLang" aria-label="Langue"><option value="all">Toutes les langues</option>${[...langCount.entries()].map(([l, n]) => `<option value="${l}" ${f.lang === l ? "selected" : ""}>${esc(LANG_NAME[l] ? LANG_NAME[l][0].toUpperCase() + LANG_NAME[l].slice(1) : l === "fr" ? "Français" : l)} (${n})</option>`).join("")}</select>` : ""}
          <button type="button" class="tog" id="oStory" aria-pressed="${f.inStory}">Dans une histoire</button>
          <select id="oSort" aria-label="Ordre"><option value="new" ${f.sort === "new" ? "selected" : ""}>Plus récents</option><option value="old" ${f.sort === "old" ? "selected" : ""}>Plus anciens</option></select>
          <div class="seg seg-ico" role="group" aria-label="Affichage">
            <button type="button" data-view="list" aria-pressed="${f.view === "list"}" title="Liste"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
            <button type="button" data-view="cards" aria-pressed="${f.view === "cards"}" title="Cartes"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg></button>
          </div>
        </div>
      </div>
      <div class="o-count" id="oCount" aria-live="polite"></div>
      <div id="oList"></div>
    </section></div>`;

  const filtered = () => {
    const pq = f.q.trim() ? parseQuery(f.q) : null;
    const now = Date.now();
    let l = items.filter((a) => {
      if (pq && !matchQuery(a.fold, pq)) return false;
      if (f.period === "24" || f.period === "6") { if (!a.published || now - Date.parse(a.published) > Number(f.period) * 36e5) return false; }
      else if (f.period !== "all" && (!a.published || dayKey(a.published) !== f.period)) return false;
      if (f.cat !== "all" && !(a.cats & (1 << (CATS.findIndex(([c]) => c === f.cat) - 1)))) return false;
      if (f.lang !== "all" && (a.lang || "fr") !== f.lang) return false;
      if (f.inStory && !storyOf.has(a.url)) return false;
      return true;
    });
    if (f.sort === "old") l = [...l].reverse();
    return { l, marks: pq ? pq.marks : [] };
  };
  const item = (a, marks) => {
    const s = storyOf.get(a.url);
    const cat = CATS.slice(1).find((c, i) => a.cats & (1 << i));
    const meta = { u: a.url, d: domain, n: name, k: biasKey(m), o: m.known ? m.owner : null, c: m.country || null, t: a.title };
    const link = (cls, inner) => `<a class="${cls}${reads.has(a.url) ? " is-read" : ""}" data-no-tr href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${esc(JSON.stringify(meta))}">${inner}</a>`;
    const img = a.image ? `<a class="oa-img" href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><img src="${esc(safeUrl(a.image))}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>` : "";
    return `<article class="oa${a.image ? "" : " noimg"}">
      ${f.view === "cards" ? img : ""}
      <div class="oa-body">
        <div class="oa-meta"><time>${esc(f.view === "cards" ? ago(a.published) : clock(a.published))}</time>${cat ? `<span class="oa-cat">${esc(cat[1])}</span>` : ""}${langTag(a.lang)}</div>
        ${link("oa-t", markWords(a.title, marks))}
        ${a.summary ? `<p class="oa-x" data-no-tr>${markWords(a.summary, marks)}</p>` : ""}
        <div class="oa-foot">
          ${s ? `<a class="oa-story" href="${href({ h: s.id })}" data-nav>${bar(s.counts)}<span>Dans une histoire · ${plural(s.sources, "média")}</span> →</a>` : ""}
          ${transLink(a)}
          <span class="acts">${favBtn(artFav(a))}${shareBtn(artShare(a))}</span>
        </div>
      </div>
      ${f.view === "cards" ? "" : img}
    </article>`;
  };
  const draw = () => {
    const { l, marks } = filtered();
    const active = f.q || f.period !== "all" || f.cat !== "all" || f.lang !== "all" || f.inStory;
    $("#oCount").innerHTML = `<b>${plural(l.length, "article")}</b>${active ? ` sur ${items.length} · <button class="link" type="button" id="oReset">Tout effacer</button>` : ""}`;
    const list = $("#oList");
    list.className = f.view === "cards" ? "o-cards" : "o-list";
    if (!l.length) {
      list.innerHTML = `<div class="empty"><h3>Aucun article avec ces filtres.</h3><p>Essaie un autre mot, ou élargis la période.</p></div>`;
    } else {
      const shown = l.slice(0, f.shown);
      let html = "", cur = null;
      for (const a of shown) {
        const k = a.published ? dayKey(a.published) : "?";
        if (k !== cur) {
          if (cur !== null) html += "</div>";
          const n = l.filter((x) => x.published && dayKey(x.published) === k).length;
          html += `<h3 class="o-day"><span>${esc(k === "?" ? "Sans date" : dayLabel(k))}</span><small>${plural(n, "article")}</small></h3><div class="o-group">`;
          cur = k;
        }
        html += item(a, marks);
      }
      html += "</div>";
      if (l.length > f.shown) html += `<div class="more-row"><button class="btn ghost" type="button" id="oMore">Voir ${Math.min(40, l.length - f.shown)} articles de plus</button></div>`;
      list.innerHTML = html;
    }
    $$("[data-day]", v).forEach((b) => b.setAttribute("aria-pressed", f.period === b.dataset.day));
    $$("[data-period]", v).forEach((b) => b.setAttribute("aria-pressed", f.period === b.dataset.period));
  };
  const redraw = (scroll = false) => {
    f.shown = 40;
    draw();
    if (scroll) { const t = $("#oBrowse"); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: "start" }); }
  };
  let timer = null;
  $("#oQ").oninput = (e) => { f.q = e.target.value; $("#oClear").hidden = !f.q; clearTimeout(timer); timer = setTimeout(() => redraw(), 140); };
  $("#oClear").onclick = () => { f.q = ""; $("#oQ").value = ""; $("#oClear").hidden = true; redraw(); };
  $("#oCat") && ($("#oCat").onchange = (e) => { f.cat = e.target.value; redraw(true); });
  $("#oLang") && ($("#oLang").onchange = (e) => { f.lang = e.target.value; redraw(true); });
  $("#oSort").onchange = (e) => { f.sort = e.target.value; redraw(true); };
  $("#oFollow").onclick = (e) => {
    const on = follows.toggle(domain, name);
    e.target.textContent = on ? "✓ Suivi" : "★ Suivre ce média";
    e.target.classList.toggle("ghost", on);
    toast(on ? `Tu suis ${name} : ses articles apparaissent dans « Favoris ».` : `Tu ne suis plus ${name}.`);
  };
  $(".o-page", v).onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.period) { f.period = b.dataset.period; redraw(true); }
    else if (b.dataset.day) { f.period = f.period === b.dataset.day ? "all" : b.dataset.day; redraw(); $("#oBrowse").scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (b.dataset.view) { f.view = b.dataset.view; store.set("ofView", f.view); $$("[data-view]", v).forEach((x) => x.setAttribute("aria-pressed", x === b)); draw(); }
    else if (b.dataset.subj) { f.q = `"${b.dataset.subj}"`; $("#oQ").value = f.q; $("#oClear").hidden = false; redraw(); $("#oBrowse").scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (b.id === "oStory") { f.inStory = !f.inStory; b.setAttribute("aria-pressed", f.inStory); redraw(true); }
    else if (b.id === "oReset") { Object.assign(f, { q: "", period: "all", cat: "all", lang: "all", inStory: false }); state.of = null; viewOutlet(v, route); }
    else if (b.id === "oMore") { f.shown += 40; draw(); }
  };
  draw();
}

/* ---------- Favoris : histoires et articles enregistrés, médias suivis ---------- */
async function viewFavs(v, tab = store.get("favTab", "tout"), q = "") {
  document.title = "Favoris — Prisme";
  const all = favs.list();
  const fl = follows.list();
  const fq = q.trim() ? parseQuery(q) : null;
  const keep = (x) => !fq || matchQuery(foldText(`${x.t} ${x.n || ""}`), fq);
  const st = all.filter((x) => x.type === "s" && keep(x)), ar = all.filter((x) => x.type === "a" && keep(x));
  const lt = later.list().filter(keep);
  const tabs = [["plustard", "À lire", lt.length], ["tout", "Tout", st.length + ar.length], ["histoires", "Histoires", st.length], ["articles", "Articles", ar.length], ["medias", "Mes médias", fl.length]];
  const date = (ts) => new Date(ts).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
  const storyFavRow = (x) => `<li class="fv">
      ${x.img ? `<span class="fv-img"><img src="${esc(safeUrl(x.img))}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>` : ""}
      <div class="fv-body"><div class="kicker">Histoire · ${plural(x.src || 1, "média")} · enregistrée le ${esc(date(x.at))}</div>
        <a class="fv-t" data-no-tr href="${href({ h: x.id, region: x.r || state.region })}" data-nav>${esc(x.t)}</a>
        <div class="fv-foot"><span class="acts">${favBtn(x, true)}${shareBtn({ title: x.t, text: x.t, url: absUrl(href({ h: x.id, region: x.r || state.region })) }, true)}</span></div></div></li>`;
  const artFavRow = (x) => `<li class="fv">
      ${x.img ? `<span class="fv-img"><img src="${esc(safeUrl(x.img))}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>` : ""}
      <div class="fv-body"><div class="kicker">${x.d ? `<a href="${href({ m: x.d })}" data-nav>${esc(x.n || x.d)}</a>` : "Article"} · enregistré le ${esc(date(x.at))}</div>
        <a class="fv-t" data-no-tr href="${esc(safeUrl(x.u))}" target="_blank" rel="noopener noreferrer">${esc(x.t)}</a>
        <div class="fv-foot"><span class="acts">${favBtn(x, true)}${shareBtn({ title: x.t, text: x.t, url: x.u }, true)}</span></div></div></li>`;

  v.innerHTML = `<header class="page-h">
      <div class="kicker">Favoris · gardés sur cet appareil seulement</div>
      <h1>Mes favoris</h1>
      <p>Touche ★ sur une histoire ou un article pour l'enregistrer ici, et « Suivre ce média » sur la page d'un média pour voir ses derniers articles.</p>
    </header>
    <div class="fv-tools">
      <nav class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-ftab="${k}" aria-selected="${tab === k}">${l}<sup>${n}</sup></button>`).join("")}</nav>
      <label class="o-search fv-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" id="fvQ" placeholder="Chercher dans mes favoris…" value="${esc(q)}" autocomplete="off"></label>
    </div>
    <div id="fvBody"></div>`;
  const body = $("#fvBody");
  if (tab === "plustard") {
    const row = (x) => (x.type === "s" ? storyFavRow(x) : artFavRow(x)).replace('<span class="acts">', `<span class="acts">${laterBtn(x, true)}`).replace(/enregistrée? le/, "ajouté le");
    body.innerHTML = lt.length ? `<p class="note" style="margin:4px 0 12px">Ce que tu as mis de côté. Chaque histoire ou article disparaît d'ici une fois lu.</p><ul class="fv-list">${lt.map(row).join("")}</ul>`
      : `<div class="empty"><h3>${q ? "Rien ne correspond." : "Rien à lire plus tard."}</h3><p>Appuie longtemps sur une histoire et choisis « Lire plus tard », ou touche l'horloge à côté d'un article.</p><a class="btn" href="${href({})}" data-nav>Aller au fil</a></div>`;
  } else if (tab === "medias") {
    if (!fl.length) body.innerHTML = `<div class="empty"><h3>Tu ne suis aucun média pour l'instant.</h3><p>Cherche un média (par exemple « TVA » ou « Le Devoir »), ouvre sa page et touche « Suivre ce média ».</p></div>`;
    else {
      body.innerHTML = `<div class="fv-outlets">${fl.map((x) => `<a class="outlet-hit" href="${href({ m: x.d })}" data-nav>${favicon(x.d, x.n)}<span class="oh-main"><b>${esc(x.n)}</b><small>${esc(x.d)}</small></span><span class="oh-side"><small>Voir ses articles →</small></span></a>`).join("")}</div>
        <h2 class="block-h" style="margin-top:22px">Le fil de mes médias <small>leurs derniers articles</small></h2><div id="fvFeed"><div class="loader">Chargement…</div></div>`;
      const set = new Set(fl.map((x) => x.d));
      const idx = await articlesOf(state.region).catch(() => null);
      let list = (idx?.items || []).filter((a) => set.has(a.domain));
      if (state.region !== "monde" && fl.some((x) => !idx?.domains.some((d) => d.domain === x.d))) {
        const w = await articlesOf("monde").catch(() => null);
        const seen = new Set(list.map((a) => a.url));
        list = list.concat((w?.items || []).filter((a) => set.has(a.domain) && !seen.has(a.url)));
      }
      list.sort((a, b) => (b.published || "").localeCompare(a.published || ""));
      if (state.route.view !== "favoris") return;
      if (fq) list = list.filter((a) => matchQuery(a.fold, fq));
      $("#fvFeed").innerHTML = list.length ? `<ul class="arts2">${list.slice(0, 80).map((a) => artRow(a, fq ? fq.marks : [])).join("")}</ul>` : `<div class="empty"><p>Rien de neuf de ces médias dans les dernières 48 heures.</p></div>`;
    }
  } else {
    const showS = tab !== "articles" ? st : [], showA = tab !== "histoires" ? ar : [];
    if (!showS.length && !showA.length) {
      body.innerHTML = `<div class="empty"><h3>${q ? "Aucun favori ne correspond." : "Aucun favori pour l'instant."}</h3><p>${q ? "Essaie un autre mot." : "Touche l'étoile ★ à côté d'une histoire ou d'un article pour le retrouver ici, même après qu'il soit sorti du fil."}</p><a class="btn" href="${href({})}" data-nav>Aller au fil</a></div>`;
    } else {
      body.innerHTML = `${showS.length ? `${tab === "tout" ? `<h2 class="block-h">Histoires <small>${showS.length}</small></h2>` : ""}<ul class="fv-list">${showS.map(storyFavRow).join("")}</ul>` : ""}
        ${showA.length ? `${tab === "tout" ? `<h2 class="block-h" style="margin-top:22px">Articles <small>${showA.length}</small></h2>` : ""}<ul class="fv-list">${showA.map(artFavRow).join("")}</ul>` : ""}
        <p class="note" style="margin-top:18px">Une histoire enregistrée reste ici, mais sa page n'est disponible que tant qu'elle est dans l'édition (environ 48 heures).</p>`;
    }
  }
  $(".tabs", v).onclick = (e) => { const b = e.target.closest("[data-ftab]"); if (b) { store.set("favTab", b.dataset.ftab); viewFavs(v, b.dataset.ftab, $("#fvQ").value); } };
  let t = null;
  $("#fvQ").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { viewFavs(v, tab, e.target.value).then(() => { const i = $("#fvQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 200); };
}

/* ---------- Le moteur de recherche : tous les articles des 7 derniers jours, de partout ----------
   Le robot prépare un index (data/s/<n°>/). L'app ne télécharge que les morceaux utiles :
   la liste des médias (une fois), les mots cherchés, puis le détail des articles affichés. */
const S_STOP = new Set(("le la les un une des du de d l au aux et ou en a à dans sur pour par avec sans sous ce cet cette ces son sa ses leur leurs " +
  "qui que quoi dont ne pas plus moins est sont été etre être avoir a ont il elle ils elles on nous vous je tu se s y lui " +
  "the a an of to in on for and or with by from at as is are was were be been it its this that these those not but after over about into " +
  "el los las del y por con para un una que al lo se es").split(" "));
const sNorm = (w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const sWords = (text) => foldText(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && !S_STOP.has(w)).map(sNorm);
const shardOf = (w) => {
  const c = [...w];
  if (/[a-z0-9]/.test(c[0])) return c[0] + (c[1] && /[a-z0-9]/.test(c[1]) ? c[1] : "_");
  return `u${(c[0].codePointAt(0) >> 6).toString(16)}`;
};
const SEARCH = { build: null, meta: null, words: new Map(), chunks: new Map() };

async function searchBase() {
  const s = await dataJson("search.json", 10 * 60e3);
  if (SEARCH.build !== s.build) Object.assign(SEARCH, { build: s.build, meta: null, words: new Map(), chunks: new Map() });
  if (!SEARCH.meta) {
    SEARCH.meta = dataJson(`s/${s.build}/meta.json`, 864e5).then((m) => {
      const counts = new Uint32Array(m.domains.length);
      for (const d of m.dom) counts[d]++;
      m.D = m.domains.map(([domain, name, k, owner, country, bias, st], i) => ({
        domain, name, count: counts[i], fold: foldText(name), country, media: mediaFromKey(name, k, owner, country, bias, st),
        side: k === "unk" || k === "state" ? "other" : ["l2", "l1"].includes(k) ? "left" : k === "c" ? "center" : "right",
      }));
      return m;
    });
    SEARCH.meta.catch(() => { SEARCH.meta = null; });
  }
  return SEARCH.meta;
}
// Les articles qui contiennent un mot (liste triée), ou les mots proches s'il n'existe pas (fautes de frappe).
async function postings(w) {
  if (SEARCH.words.has(w)) return SEARCH.words.get(w);
  const shard = await dataJson(`s/${SEARCH.build}/w/${shardOf(w)}.json`, 864e5).catch(() => ({}));
  const gaps = shard[w];
  let ids = [];
  if (gaps) { let v = 0; ids = gaps.map((g) => (v += g)); }
  ids.shard = shard;
  SEARCH.words.set(w, ids);
  return ids;
}
const inter = (a, b) => { const out = []; let i = 0, j = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { out.push(a[i]); i++; j++; } else if (a[i] < b[j]) i++; else j++; } return out; };
const union = (lists) => [...new Set(lists.flat())].sort((x, y) => x - y);
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Cherche dans l'index. Rend les articles qui contiennent tous les mots ; sinon ceux qui en contiennent une partie.
async function indexSearch(q) {
  const meta = await searchBase();
  const pq = parseQuery(q);
  const N = meta.dom.length;
  const termIds = async (variants) => union(await Promise.all(variants.map(async (v) => {
    const ws = sWords(v);
    if (!ws.length) return [];
    let ids = await postings(ws[0]);
    for (const w of ws.slice(1)) ids = inter(ids, await postings(w));
    return ids;
  })));
  const groups = [...pq.terms.map((g) => ({ label: g[0], variants: g })), ...pq.phrases.map((p) => ({ label: `"${p}"`, variants: [p] }))]
    .filter((g) => g.variants.some((v) => sWords(v).length));
  const lists = await Promise.all(groups.map((g) => termIds(g.variants)));
  const notIds = new Set((await Promise.all(pq.not.flatMap((w) => sWords(w)).map(postings))).flat());
  let strict = lists.length ? lists.reduce((a, b) => inter(a, b)) : [];
  strict = strict.filter((id) => !notIds.has(id));
  let ids = strict, partial = false, found = [];
  if (strict.length < 8 && lists.length > 1) {
    // Pas assez d'articles avec tous les mots : on garde ceux qui ont le plus de mots, les plus rares d'abord.
    const idf = lists.map((l) => (l.length ? Math.log(N / l.length) : 0));
    const score = new Map();
    lists.forEach((l, i) => { for (const id of l) if (!notIds.has(id)) score.set(id, (score.get(id) || 0) + 1000 + idf[i]); });
    const rarest = idf.indexOf(Math.max(...idf));
    const keep = lists[rarest].length ? new Set(lists[rarest]) : null;
    ids = [...score.entries()].filter(([id]) => !keep || keep.has(id)).sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
    partial = ids.length > strict.length;
    found = groups.filter((g, i) => lists[i].length).map((g) => g.label);
  }
  // Fautes de frappe : un mot introuvable ? On cherche le mot le plus proche dans le même fichier.
  let suggestion = null;
  if (ids.length < 3) {
    let fixed = q, changed = false;
    for (const g of pq.terms) for (const v of g) for (const w of sWords(v)) {
      const p = await postings(w);
      if (p.length) continue;
      let best = null, bestN = 0;
      for (const [cand, gaps] of Object.entries(p.shard || {})) {
        const dist = lev(w, cand);
        if (dist <= (w.length > 6 ? 2 : 1) && gaps.length > bestN) { best = cand; bestN = gaps.length; }
      }
      if (best) { fixed = fixed.replace(new RegExp(reEsc(w), "i"), best); changed = true; }
    }
    if (changed && foldText(fixed) !== foldText(q)) suggestion = fixed;
  }
  return { query: q, ids, strict: strict.length, partial, found, suggestion, marks: pq.marks, also: pq.also, meta };
}
// Le détail d'articles (par blocs de 250, téléchargés au besoin).
async function docsFor(ids) {
  const meta = await searchBase();
  const C = meta.chunk;
  const need = [...new Set(ids.map((id) => Math.floor(id / C)))];
  await Promise.all(need.map((c) => {
    if (!SEARCH.chunks.has(c)) SEARCH.chunks.set(c, dataJson(`s/${SEARCH.build}/d/${c}.json`, 864e5).catch(() => []));
    return SEARCH.chunks.get(c);
  }));
  const out = [];
  for (const id of ids) {
    const row = (await SEARCH.chunks.get(Math.floor(id / C)))[id % C];
    if (!row) continue;
    const [title, url, di, min, image, summary] = row;
    const d = meta.D[di];
    const li = meta.lang[id];
    out.push({ id, title, url, domain: d.domain, sourceName: d.name, media: d.media, published: min ? new Date(min * 60000).toISOString() : null,
      image, summary, lang: li < 0 ? null : meta.langs[li] || "xx", cats: meta.cats[id], fold: foldText(`${title} ${summary || ""}`) });
  }
  return out;
}

/* ---------- Résultats de recherche : filtres, chronologie, articles ---------- */
state.wf = { scope: "auto", hours: 0, side: "all", lang: "all", cat: "all", media: "" };
const WF_PERIODS = [[6, "6 h"], [24, "24 h"], [48, "48 h"], [0, "7 jours"]];
const WF_SIDES = [["all", "Tous les côtés"], ["left", "Gauche"], ["center", "Centre"], ["right", "Droite"], ["other", "État ou non évalués"]];
const SIDE_COLOR = { left: "var(--b-l2)", center: "var(--b-c)", right: "var(--b-r2)", other: "var(--b-unk)" };

async function regionCountries(region) {
  if (region === "monde") return null;
  const ed = await edition(region).catch(() => null);
  return ed?.countries || null;
}
// Applique les filtres à une liste d'articles (sans rien télécharger de plus).
function filterIds(r, countries, f, skip = "") {
  const m = r.meta, cc = countries ? new Set(countries) : null;
  const catBit = f.cat === "all" ? 0 : 1 << (CATS.findIndex(([c]) => c === f.cat) - 1);
  return r.ids.filter((id) => {
    const d = m.D[m.dom[id]];
    if (skip !== "scope" && cc && !cc.has(d.country)) return false;
    if (skip !== "hours" && f.hours && m.age[id] * 10 > f.hours * 60) return false;
    if (skip !== "side" && f.side !== "all" && d.side !== f.side) return false;
    if (skip !== "lang" && f.lang !== "all") { const l = m.lang[id], code = l < 0 ? "fr" : m.langs[l]; if (f.lang === "autres" ? ["fr", "en"].includes(code) : code !== f.lang) return false; }
    if (skip !== "cat" && catBit && !(m.cats[id] & catBit)) return false;
    if (skip !== "media" && f.media && m.D[m.dom[id]].domain !== f.media) return false;
    return true;
  });
}

async function loadWide(q, scroll = true) {
  const el = $("#wide");
  if (!el) return;
  if (scroll) el.scrollIntoView({ behavior: "smooth", block: "start" });
  const key = `${q}`;
  if (!state.wide.has(key)) {
    el.innerHTML = `<h2 class="block-h">Tous les articles <small>7 jours · partout</small></h2><div class="loader">Recherche dans des centaines de milliers d'articles…</div>`;
    try {
      let r = await indexSearch(q);
      // Aucun résultat mais un mot proche existe : on cherche directement le mot corrigé.
      if (!r.ids.length && r.suggestion) { const r2 = await indexSearch(r.suggestion); if (r2.ids.length) { r2.correctedFrom = q; r = r2; } }
      state.wide.set(key, r);
    }
    catch (e) { el.innerHTML = `<h2 class="block-h">Tous les articles</h2><div class="empty"><p>La recherche n'est pas encore prête. Réessaie dans quelques minutes.</p></div>`; return; }
    if (state.route.view !== "search" || state.route.q !== q) return;
  }
  drawWide(el, state.wide.get(key));
}

function timelineFrom(r, ids) {
  const n = 28, step = 7 * 1440 / n; // tranches de 6 heures
  const bins = Array.from({ length: n }, () => ({ left: 0, center: 0, right: 0, other: 0 }));
  for (const id of ids) {
    const i = n - 1 - Math.floor((r.meta.age[id] * 10) / step);
    if (i >= 0 && i < n) bins[i][r.meta.D[r.meta.dom[id]].side]++;
  }
  const max = Math.max(1, ...bins.map((b) => b.left + b.center + b.right + b.other));
  const label = (i) => new Date(Date.now() - (n - 1 - i) * step * 60000).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric" });
  return `<div class="tl" role="img" aria-label="Nombre d'articles par jour">
    <div class="tl-bars">${bins.map((b, i) => { const t = b.left + b.center + b.right + b.other; return `<span class="tl-col" title="${esc(label(i))} : ${plural(t, "article")}">${["other", "right", "center", "left"].map((k) => b[k] ? `<i style="height:${(b[k] / max) * 100}%;background:${SIDE_COLOR[k]}"></i>` : "").join("")}</span>`; }).join("")}</div>
    <div class="tl-axis"><span>${esc(label(0))}</span><span>${esc(label(Math.floor(n / 2)))}</span><span>maintenant</span></div>
  </div>`;
}

async function drawWide(el, r) {
  const f = state.wf;
  const countries = await regionCountries(state.region);
  const inRegion = countries ? filterIds(r, countries, { ...f, hours: 0, side: "all", lang: "all", cat: "all" }).length : r.ids.length;
  // Au début : l'édition choisie, sauf s'il y a trop peu de résultats (alors : le monde entier).
  const scope = !countries ? "monde" : f.scope === "auto" ? (inRegion >= 5 ? "edition" : "monde") : f.scope;
  const cc = scope === "edition" ? countries : null;
  const ids = filterIds(r, cc, f);
  const m = r.meta;
  const counts = Object.fromEntries(ORDER.map((k) => [k, 0]));
  const seenD = new Set();
  for (const id of ids) { const di = m.dom[id]; if (!seenD.has(di)) { seenD.add(di); counts[biasKey(m.D[di].media)]++; } }
  const base = filterIds(r, cc, f, "lang");
  const langs = new Map();
  for (const id of base) { const l = m.lang[id], c = l < 0 || m.langs[l] === "fr" ? "fr" : m.langs[l] === "en" ? "en" : "autres"; langs.set(c, (langs.get(c) || 0) + 1); }
  const baseCat = filterIds(r, cc, f, "cat");
  const cats = CATS.slice(1).map(([c, l], i) => [c, l, baseCat.filter((id) => m.cats[id] & (1 << i)).length]).filter((x) => x[2]);
  const chip = (attr, val, cur, label, n) => `<button class="chip" type="button" data-${attr}="${val}" aria-pressed="${String(cur) === String(val)}">${label}${n != null ? ` <span class="muted">${n}</span>` : ""}</button>`;
  const regionName = regionLabel();
  const filters = `<div class="wf">
      ${f.media ? `<div class="wf-row"><span class="label">Média</span><button class="chip" type="button" aria-pressed="true" data-media="">${esc(m.D.find((d) => d.domain === f.media)?.name || f.media)} ✕</button></div>` : ""}
      ${countries ? `<div class="wf-row"><span class="label">Où</span>${chip("scope", "edition", scope, esc(regionName), inRegion)}${chip("scope", "monde", scope, "Monde entier", r.ids.length)}</div>` : ""}
      <div class="wf-row"><span class="label">Période</span>${WF_PERIODS.map(([h, l]) => chip("hours", h, f.hours, l)).join("")}</div>
      <div class="wf-row"><span class="label">Côté</span>${WF_SIDES.map(([k, l]) => chip("side", k, f.side, k === "all" ? l : `<span class="sw" style="background:${SIDE_COLOR[k]}"></span>${l}`)).join("")}</div>
      ${langs.size > 1 ? `<div class="wf-row"><span class="label">Langue</span>${chip("lang", "all", f.lang, "Toutes")}${[["fr", "Français"], ["en", "Anglais"], ["autres", "Autres"]].filter(([k]) => langs.has(k)).map(([k, l]) => chip("lang", k, f.lang, l, langs.get(k))).join("")}</div>` : ""}
      ${cats.length > 1 ? `<div class="wf-row"><span class="label">Rubrique</span>${chip("cat", "all", f.cat, "Toutes")}${cats.map(([k, l, n]) => chip("cat", k, f.cat, l, n)).join("")}</div>` : ""}
    </div>`;
  const notes = [];
  if (r.correctedFrom) notes.push(`<p class="q-fix">Résultats pour <b>${esc(r.query)}</b>. Rien ne correspondait à « ${esc(r.correctedFrom)} ».</p>`);
  else if (r.suggestion) notes.push(`<p class="q-fix">Vouliez-vous dire <a href="${href({ q: r.suggestion })}" data-nav>${esc(r.suggestion)}</a> ?</p>`);
  if (r.partial) notes.push(`<p class="q-fix">Aucun article ne contient tous les mots. Voici ceux qui contiennent <b>${r.found.map(esc).join(", ")}</b>.</p>`);
  if (countries && scope === "monde" && f.scope === "auto" && inRegion < 5 && r.ids.length) notes.push(`<p class="q-fix">${inRegion ? `Seulement ${plural(inRegion, "article")}` : "Aucun article"} dans les médias de l'édition ${esc(regionName)} : voici les résultats du monde entier.</p>`);
  if (r.light) {
    state.wideTab = "articles";
    const mName = f.media ? m.D.find((d) => d.domain === f.media)?.name || f.media : "";
    const used = f.hours || f.side !== "all" || f.lang !== "all" || f.cat !== "all";
    el.innerHTML = `<h2 class="block-h">${mName ? `<span data-no-tr>${esc(mName)}</span>` : "Les nouvelles"} <small>${plural(ids.length, "article")} · 7 jours</small></h2>
      ${mName ? `<p class="vm-sel">Seulement les articles de <b data-no-tr>${esc(mName)}</b> · <a class="link" href="${href({ m: f.media })}" data-nav>sa page ↗</a></p>` : ""}
      ${notes.join("")}
      <details class="wf-fold"${used ? " open" : ""}><summary>Filtrer ${used ? "· filtres actifs" : ""}</summary>${filters}</details>
      ${ids.length ? `<div id="widePanel"></div>` : `<div class="empty"><p>Aucun article avec ces filtres.</p></div>`}`;
    // Sans média choisi : les articles regroupés par média (les plus actifs d'abord), 3 par média.
    const pickMedia = (d) => { f.media = d; $$("[data-vmedia]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.vmedia === d)); drawWide(el, r); };
    if (ids.length > 6 && !f.media && !r.flat) {
      const by = new Map();
      for (const id of ids) { const di = m.dom[id]; if (!by.has(di)) by.set(di, []); by.get(di).push(id); }
      const groups = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
      const top = groups.slice(0, 6), rest = groups.slice(6).flatMap(([, l]) => l);
      docsFor(top.flatMap(([, l]) => l.slice(0, 3))).then((docs) => {
        const p = $("#widePanel", el);
        if (!p) return;
        p.innerHTML = top.map(([di, l]) => {
          const d = m.D[di];
          return `<section class="mgroup"><div class="mg-h">${favicon(d.domain, d.name)}<b data-no-tr>${esc(d.name)}</b><span>${plural(l.length, "article")}</span>${l.length > 3 ? `<button class="link" type="button" data-mg="${esc(d.domain)}">Voir tout →</button>` : ""}</div>
            <ul class="arts2">${docs.filter((x) => x.domain === d.domain).map((x) => artRow(x, r.marks || [])).join("")}</ul></section>`;
        }).join("") + (rest.length || groups.length > 1 ? `<div class="more-row"><button class="btn ghost" type="button" data-flat>${rest.length ? `Voir tout, du plus récent (${plural(ids.length, "article")})` : "Voir tout, du plus récent"}</button></div>` : "");
        p.onclick = (e) => {
          const g = e.target.closest("[data-mg]");
          if (g) { pickMedia(g.dataset.mg); return; }
          if (e.target.closest("[data-flat]")) { r.flat = true; drawWide(el, r); }
        };
      });
    } else if (ids.length) drawWidePanel({ r, ids, query: r.query });
    $(".wf", el).onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.scope) f.scope = b.dataset.scope;
      if (b.dataset.hours != null) f.hours = Number(b.dataset.hours);
      if (b.dataset.side) f.side = b.dataset.side;
      if (b.dataset.lang) f.lang = b.dataset.lang;
      if (b.dataset.cat) f.cat = b.dataset.cat;
      if (b.dataset.media !== undefined) { f.media = b.dataset.media; $$("[data-vmedia]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.vmedia === f.media)); }
      drawWide(el, r);
    };
    return;
  }
  const head = `<h2 class="block-h">Tous les articles <small>7 jours · ${plural(ids.length, "article")} · ${plural(seenD.size, "média")}</small></h2>
    <p class="note" style="margin:0 0 12px">Prisme fouille les titres et les textes de tous les articles lus depuis 7 jours, même ceux qui ne font pas partie d'une histoire. Du plus récent au plus ancien.</p>${notes.join("")}`;
  const tabs = [["articles", "Articles", ids.length], ["comparer", "Comparer", null], ["medias", "Médias", seenD.size], ["videos", "Vidéos", null]];
  el.innerHTML = `${head}${filters}
    ${ids.length ? `${timelineFrom(r, ids)}${bigBar(counts)}
    <nav class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${state.wideTab === k}">${l}${n != null ? `<sup>${n}</sup>` : ""}</button>`).join("")}</nav>
    <div id="widePanel"></div>` : `<div class="empty"><p>${r.ids.length ? "Aucun article avec ces filtres. Essaie « 7 jours », « Tous les côtés » ou « Monde entier »." : "Aucun article lu par Prisme dans les 7 derniers jours ne contient ces mots. Vérifie l'orthographe ou essaie un mot plus court."}</p></div>`}`;
  const fd = { r, ids, query: r.query };
  if (ids.length) {
    $(".tabs", el).onclick = (e) => {
      const b = e.target.closest("[data-tab]");
      if (!b) return;
      state.wideTab = b.dataset.tab;
      $$(".tabs button", el).forEach((x) => x.setAttribute("aria-selected", x === b));
      drawWidePanel(fd);
    };
    drawWidePanel(fd);
  }
  $(".wf", el).onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.scope) f.scope = b.dataset.scope;
    if (b.dataset.hours != null) f.hours = Number(b.dataset.hours);
    if (b.dataset.side) f.side = b.dataset.side;
    if (b.dataset.lang) f.lang = b.dataset.lang;
    if (b.dataset.cat) f.cat = b.dataset.cat;
    if (b.dataset.media !== undefined) { f.media = b.dataset.media; $$("[data-vmedia]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.vmedia === f.media)); }
    drawWide(el, r);
  };
}

// Une ligne d'article dans une liste : média, heure, titre (mots cherchés surlignés), extrait, actions.
function artRow(x, marks = []) {
  const title = marks.length ? markWords(x.title, marks) : esc(x.title);
  const meta = { u: x.url, d: x.domain, n: x.sourceName, k: biasKey(x.media), o: x.media?.known ? x.media.owner : null, c: x.media?.country || null, t: x.title };
  return `<li class="art2${x.image ? "" : " noimg"}">
    <div class="a2-main">
      <div class="a2-top"><a class="src" href="${href({ m: x.domain })}" data-nav>${favicon(x.domain, x.sourceName)}<span>${esc(x.sourceName)}</span></a>${tag(x.media)}${langTag(x.lang)}<time>${esc(ago(x.published))}</time></div>
      <a class="a2-t${reads.has(x.url) ? " is-read" : ""}" data-no-tr href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer" data-read="${esc(JSON.stringify(meta))}">${title}</a>
      ${x.summary ? `<p class="a2-x" data-no-tr>${marks.length ? markWords(x.summary, marks) : esc(x.summary)}</p>` : ""}
      <div class="a2-foot">${transLink(x)}<span class="acts">${laterBtn(artFav(x))}${favBtn(artFav(x))}${shareBtn(artShare(x))}</span></div>
    </div>
    ${x.image ? `<a class="a2-img" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><img src="${esc(safeUrl(x.image))}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>` : ""}
  </li>`;
}

async function drawWidePanel(d) {
  const p = $("#widePanel");
  if (!p) return;
  const { r, ids } = d;
  const m = r.meta;
  if (state.wideTab === "comparer") {
    p.innerHTML = `<div class="loader">Chargement…</div>`;
    const bySide = Object.fromEntries(SIDES.map((s) => [s.key, ids.filter((id) => m.D[m.dom[id]].side === s.key)]));
    const docs = await docsFor(SIDES.flatMap((s) => bySide[s.key].slice(0, 12)));
    if (state.wideTab !== "comparer" || !p.isConnected) return;
    p.innerHTML = `<div class="cols3" style="margin-top:14px">${SIDES.map((side) => {
      const items = docs.filter((x) => sideOf(x.media) === side.key);
      return `<section><div class="col-h"><i style="background:${side.color}"></i>${side.label}<small>${plural(bySide[side.key].length, "article")}</small></div>
        ${items.length ? `<ul class="hl">${items.map((x) => `<li><div class="row"><a class="src" href="${href({ m: x.domain })}" data-nav>${favicon(x.domain, x.sourceName)}<span>${esc(x.sourceName)}</span></a>${badge(x.media)}<time>${esc(ago(x.published))}</time></div>${artLink(x, "t")}</li>`).join("")}</ul>`
          : `<div class="col-empty">Aucun média de ${side.label.toLowerCase()} dans ces résultats.</div>`}</section>`;
    }).join("")}</div>`;
    return;
  }
  if (state.wideTab === "medias") {
    const by = new Map();
    for (const id of ids) { const di = m.dom[id]; by.set(di, (by.get(di) || 0) + 1); }
    const list = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([di, n]) => ({ ...m.D[di], n }));
    p.innerHTML = `<ul class="outlets" style="margin-top:10px">${list.slice(0, 150).map((x) => `<li><a class="o-row" href="${href({ m: x.domain })}" data-nav>${favicon(x.domain, x.name)}<span class="nm">${esc(x.name)}<small>${plural(x.n, "article")}${x.media.known ? " · " + esc(x.media.owner.replace(/\s*\(.*\)$/, "")) : ""}</small></span>${scaleMini(x.media)}</a></li>`).join("")}</ul>`;
    return;
  }
  if (state.wideTab === "videos") { drawVideos(p, r.query); return; }
  let shown = 0;
  p.innerHTML = `<ul class="arts2" id="wideList"></ul><div class="more-row" id="wideMoreRow"></div>`;
  const more = async () => {
    const next = ids.slice(shown, shown + 40);
    shown += next.length;
    const row = $("#wideMoreRow", p);
    row.innerHTML = `<div class="loader">Chargement…</div>`;
    const docs = await docsFor(next);
    if (!p.isConnected) return;
    $("#wideList", p).insertAdjacentHTML("beforeend", docs.map((x) => artRow(x, r.marks || [])).join(""));
    row.innerHTML = ids.length > shown ? `<button class="btn ghost" type="button">Voir ${Math.min(40, ids.length - shown)} articles de plus</button>` : "";
    const b = $("button", row);
    if (b) b.onclick = more;
  };
  more();
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
  const keep = (x) => (side === "all" || (sideOf(x.media) || "other") === side) && (!noShorts || !x.isShort);
  const list = r.videos.filter(keep);
  // Quand les vidéos de l'édition sont épuisées, on continue avec celles du reste du monde.
  let world = [];
  if (state.region !== "monde") {
    let w = state.videos.get("monde");
    if (!w) { w = await api(`/api/videos?region=monde`).catch(() => ({ videos: [] })); state.videos.set("monde", w); }
    if (state.route.view !== "videos") return;
    const here = new Set(r.videos.map((x) => x.id));
    world = w.videos.filter((x) => !here.has(x.id) && keep(x));
  }
  const all = [...list, ...world];
  const c = { l2: 0, l1: 0, c: 0, r1: 0, r2: 0, state: 0, unk: 0 };
  for (const x of r.videos) c[biasKey(x.media)]++;
  const body = $("#vidBody");
  body.innerHTML = `<div style="margin:6px 0 4px">${bigBar(c)}</div>
    <p class="note">${plural(r.videos.length, "vidéo")} de la dernière semaine, de ${plural(new Set(r.videos.map((x) => x.domain)).size, "chaîne")} de médias${world.length ? `, puis ${plural(world.length, "vidéo")} d'ailleurs dans le monde` : ""}.</p>
    <div id="vidList">${all.length ? "" : `<div class="empty"><p>Aucune vidéo de ce côté pour cette édition.</p></div>`}</div>
    <div id="vidSentinel"></div><div id="vidStatus"></div>`;
  bindVideos(body, all);
  // Défilement continu : 24 vidéos à la fois.
  let shown = 0;
  const more = () => {
    if (shown >= all.length || !$("#vidList")) return;
    const start = shown, end = Math.min(all.length, shown + 24);
    let html = "";
    if (start < list.length) html += videoGrid(all.slice(start, Math.min(end, list.length)));
    if (end > list.length) {
      if (start <= list.length) html += `<h2 class="block-h vid-world">Ailleurs dans le monde <small>les dernières vidéos des autres médias</small></h2>`;
      html += videoGrid(all.slice(Math.max(start, list.length), end));
    }
    shown = end;
    $("#vidList").insertAdjacentHTML("beforeend", html);
    $("#vidStatus").innerHTML = shown < all.length
      ? `<div class="more-row"><button class="btn ghost" type="button" id="vidMore">Plus de vidéos</button></div>`
      : `<div class="end">C'est tout : ${plural(all.length, "vidéo")} de la dernière semaine.</div>`;
    const b = $("#vidMore");
    if (b) b.onclick = more;
  };
  more();
  const sentinel = $("#vidSentinel");
  state.observer?.disconnect();
  state.observer = new IntersectionObserver((en) => { if (en.some((e) => e.isIntersecting)) more(); }, { rootMargin: "1200px 0px" });
  state.observer.observe(sentinel);
  state.onScroll = () => { if (sentinel.isConnected && sentinel.getBoundingClientRect().top < innerHeight + 1200) more(); };
}

/* ---------- Le prisme du matin ---------- */
async function viewMatin(v) {
  document.title = "Le matin — Prisme";
  const h = new Date().getHours();
  const hello = h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
  v.innerHTML = `${folio(h >= 15 ? "Ta journée" : "Le matin", regionLabel())}
    <p class="lead-note">${hello}. ${h >= 15 ? "Cinq histoires pour rattraper la journée" : "Cinq histoires pour comprendre la journée"}, chacune vue de gauche, du centre et de droite. Environ trois minutes.</p>
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
    state.matinSpeech = [`${hello}. Voici ton matin Prisme : cinq histoires.`, ...picked.flatMap((s, i) => { const sd = sides(s.counts); return [`${i + 1}. ${s.titleFr || s.title}.`, s.ai?.summary || s.summary || "", `${plural(s.sources, "média")} en parlent : ${sd.left} à gauche, ${sd.center} au centre, ${sd.right} à droite.`]; })];
    $("#matin").innerHTML = `
      <div class="matin-listen">${listenBtn("matin")}<span class="note">Écoute les cinq histoires, environ trois minutes.</span></div>
      <button class="ex-btn" type="button" data-express><b>⚡ ${new Date().getHours() >= 15 ? "Journée express" : "Matin express"}</b><span>10 titres en 1 minute, à lire ou à écouter</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
      <button class="ex-btn" type="button" data-week><b>📅 Ta semaine</b><span>Les 7 grandes histoires des 7 derniers jours</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
      <div id="habsMatin" hidden></div>
      ${reminderCard()}
      <ol class="matin-list">${picked.map((s, i) => `<li>
        <span class="num">${i + 1}</span>
        <div>
          <div class="kicker">${catKicker(s)}${reason(s)}</div>
          <h2 data-no-tr><a href="${href({ h: s.id })}" data-nav>${titleOf(s)}</a>${trTag(s)}</h2>
          ${s.ai ? aiTag : ""}${dekOf(s)}
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
    fillHabs($("#habsMatin"));
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
          <label class="o-search hist-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input type="search" id="histQ" placeholder="Chercher dans mes lectures…" autocomplete="off"></label>
          <ul class="hist" id="histList"></ul>
          <button class="btn ghost" type="button" id="forgetAll" style="margin-top:12px">Tout effacer</button>
        </section>
      </div></aside>
    </div>`;
  bindMePeriod(v);
  const drawHist = (q = "") => {
    const pq = q.trim() ? parseQuery(q) : null;
    const l = [...list].reverse().filter((r) => !pq || matchQuery(foldText(`${r.t} ${r.n || ""} ${r.o || ""}`), pq));
    $("#histList").innerHTML = l.length ? l.slice(0, pq ? 60 : 12).map((r) => `<li>
      <span class="tag"><i style="background:${(BIAS[r.k] || BIAS.unk).color}"></i>${esc(r.n || r.d)}</span>
      <a href="${esc(safeUrl(r.u))}" target="_blank" rel="noopener noreferrer" data-no-tr>${pq ? markWords(r.t, pq.marks) : esc(r.t)}</a>
      <button type="button" class="x" data-forget="${esc(r.u)}" aria-label="Oublier cette lecture" title="Oublier cette lecture">×</button>
    </li>`).join("") : `<li class="muted">Aucune lecture ne correspond.</li>`;
  };
  drawHist();
  $("#histQ").oninput = (e) => drawHist(e.target.value);

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
        .attr("font-family", isGroup ? "Newsreader, Georgia, serif" : "-apple-system, Inter, system-ui, sans-serif")
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

  return `<a class="btn dr-go" href="${href({ m: domain })}" data-nav data-close-drawer>Voir et fouiller ses articles →</a><div class="dr-head">
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
  $("#modalBody").onclick = null;
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
  const dark = cur === "dark" || cur === "oled" || (cur !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  syncThemeColor();
  store.set("theme", next);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeLayer($("#modal").classList.contains("open") ? "#modal" : "#drawer"); return; }
  if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    e.preventDefault();
    $("#search input").focus({ preventScroll: true });
  }
});

history.scrollRestoration = "manual";
startTranslation();
$("#langBtn").textContent = LANG === "en" ? "FR" : "EN";
$("#langBtn").title = LANG === "en" ? "Passer en français" : "Switch to English";
$("#langBtn").onclick = () => setLang(LANG === "en" ? "fr" : "en");
render({ scroll: history.state?.y || 0 });
window.__prismeReady = true;
syncThemeColor();
bootShortcut();
$("#prefsBtn").onclick = openSettings;
// La première fois (sur l'accueil seulement) : quelques questions pour personnaliser Prisme.
if (!store.get("onboarded") && state.route.view === "feed" && (!location.search || location.search === "?source=app")) setTimeout(openOnboarding, 600);

// App installable : le service worker garde l'app et les dernières histoires pour le mode hors ligne.
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
setTimeout(() => checkAlerts({ notify: false }), 4000);
