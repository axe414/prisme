// Regroupe des articles en « histoires » d'après les mots de leurs titres (pondérés par leur rareté).
import { createHash } from "node:crypto";

const STOP = new Set(`
a au aux avec ce ces cet cette dans de des du elle en et eux il ils je la le les leur leurs lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous est sont ete etre avoir fait faire plus moins tres tout tous toute toutes apres avant depuis contre entre sans sous selon vers chez lors alors aussi encore deja comme quand comment pourquoi quoi dont ainsi cela ceci celle celui ceux selon via fois ans an jour jours hier aujourd demain veut peut doit dit dire selon nouveau nouvelle nouveaux nouvelles premier premiere grand grande quelque quelques autre autres bien non oui car donc ni soit
the of and to in on for with at by from as is are was were be been has have had it its this that these those an or but not no will would can could should may might into over after before about than then there their they them he she his her we our you your who what when where why how which while new says said say amid over more most just also up down out off all any some one two first last year years day days week news live update updates video watch report reports latest breaking
`.trim().split(/\s+/));

const DATE_W = new Set(`janvier fevrier avril juin juillet aout septembre octobre novembre decembre january february april june july august september october november december
lundi mardi mercredi jeudi vendredi samedi dimanche monday tuesday wednesday thursday friday saturday sunday`.split(/\s+/));

// Quelques équivalences français → anglais pour réunir la même histoire dans les deux langues.
const ALIAS = {
  poutine: "putin", russie: "russia", russe: "russia", russian: "russia", chine: "china", chinois: "china", chinese: "china",
  crimee: "crimea", ukrainien: "ukraine", ukrainienne: "ukraine", ukrainian: "ukraine", israel: "israel", israelien: "israel", israeli: "israel",
  iranien: "iran", iranian: "iran", liban: "lebanon", syrie: "syria", allemagne: "germany", allemand: "germany", german: "germany",
  inde: "india", japon: "japan", coree: "korea", mexique: "mexico", bresil: "brazil", venezuela: "venezuela", taiwan: "taiwan",
  etats: "us", americain: "us", americaine: "us", american: "us", canadien: "canada", canadienne: "canada", canadian: "canada",
  europeen: "europe", europeenne: "europe", european: "europe", britannique: "uk", british: "uk", francais: "france", french: "france",
  otan: "nato", onu: "un", guerre: "war", sommet: "summit", election: "election", elections: "election", pont: "bridge",
  tarif: "tariff", tarifs: "tariff", douane: "tariff", ouragan: "hurricane", seisme: "earthquake", incendie: "fire",
  attentat: "attack", attaque: "attack", sonde: "probe", zelensky: "zelensky", zelenskyy: "zelensky", netanyahou: "netanyahu",
  democrate: "democrat", republicain: "republican", senat: "senate", ministre: "minister", juge: "judge", tribunal: "court",
  birmanie: "myanmar", cij: "icj", cour: "court", genocide: "genocide", vaccin: "vaccine", rougeole: "measles", peinture: "painting", tableau: "painting",
  espion: "spy", espionnage: "spy", greve: "strike", frappe: "strike", drones: "drone", missile: "missile", nucleaire: "nuclear", petrole: "oil",
  gaz: "gas", charbon: "coal", fossile: "fossil", climatique: "climate", climat: "climate", tremblement: "earthquake", inondation: "flood",
};

export function tokens(title) {
  // Toutes les écritures (latin, cyrillique, grec, arabe, hébreu…) ; les accents sont retirés.
  const words = String(title || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, " ").split(/[^\p{L}\p{N}]+/u);
  const out = new Set();
  for (let w of words) {
    if (w.length < 3 && !/\d/.test(w)) continue;
    // Les dates (« 18 novembre 2026 ») ne disent rien de l'évènement : elles reliaient des titres sans rapport.
    if (STOP.has(w) || DATE_W.has(w) || /^\d{1,2}(er)?$/.test(w) || /^20\d\d$/.test(w)) continue;
    if (ALIAS[w]) { out.add(ALIAS[w]); continue; }
    if (w.length > 4 && /[sx]$/.test(w)) w = w.slice(0, -1);
    out.add(ALIAS[w] || w);
  }
  return out;
}

// Mots d'évènement trop généraux : ils comptent à moitié pour relier deux titres.
const WEAK = new Set(`summit meeting rencontre reunion war attack talk talks deal accord election vote court judge minister president presidential presidentielle
government gouvernement leader crisis crise peace paix plan bill law loi police report rapport declaration visit visite secret historic historique inedit
first record new nouveau premier dernier last says said dit selon after apres video live direct exclusive exclusif breaking urgent latest`.split(/\s+/));

export function idfTable(docs) {
  const df = new Map();
  for (const t of docs) for (const w of t) df.set(w, (df.get(w) || 0) + 1);
  const n = docs.length || 1;
  return { idf: (w) => Math.log(1 + n / (df.get(w) || 1)) * (WEAK.has(w) ? 0.5 : 1), df, n };
}

// Similarité entre deux ensembles de mots : part du poids commun, sur le plus petit des deux titres.
function sim(a, b, idf, ignore) {
  let shared = 0, wa = 0, wb = 0, count = 0;
  for (const w of a) { if (ignore.has(w)) continue; const v = idf(w); wa += v; if (b.has(w)) { shared += v; count += WEAK.has(w) ? 0.5 : 1; } }
  for (const w of b) if (!ignore.has(w)) wb += idf(w);
  const min = Math.min(wa, wb);
  return { score: min ? shared / min : 0, count };
}

/**
 * Regroupe les articles. `links` : paires d'index déjà connues comme liées (ex. articles liés par Google).
 * `ignore` : mots à ignorer (ex. les mots de la recherche, présents partout).
 */
export function cluster(articles, { links = [], ignore = new Set(), threshold = 0.5, minShared = 2, maxHours = 0 } = {}) {
  const toks = articles.map((a) => tokens(a.title));
  const { idf, df, n } = idfTable(toks);
  // Un mot présent dans plus de 40 % des titres (ou dans plus de 3 % d'un gros corpus) ne distingue rien.
  const common = new Set(ignore);
  if (n >= 10) for (const [w, c] of df) if (c / n > 0.4 || (n > 500 && c / n > 0.03)) common.add(w);

  const parent = articles.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[b] = a; };
  for (const [i, j] of links) union(i, j);

  // On ne compare que les titres qui partagent au moins un mot distinctif (index inversé).
  const post = new Map();
  toks.forEach((t, i) => { for (const w of t) if (!common.has(w)) { if (!post.has(w)) post.set(w, []); post.get(w).push(i); } });
  const time = articles.map((a) => Date.parse(a.published) || 0);
  // Pour chaque titre, on compte combien de mots distinctifs il partage avec les titres suivants (compteur
  // réutilisé, sans liste de paires) ; on ne calcule la similarité que pour ceux qui en partagent au moins deux.
  // Un mot présent dans des centaines de titres ne distingue rien : il est ignoré.
  const MAX_POST = 300;
  const shared = new Int32Array(articles.length);
  const touched = [];
  toks.forEach((t, i) => {
    for (const w of t) {
      const list = post.get(w);
      if (!list || list.length < 2 || list.length > MAX_POST) continue;
      for (const j of list) if (j > i) { if (shared[j] === 0) touched.push(j); shared[j]++; }
    }
    for (const j of touched) {
      if (shared[j] >= minShared && find(i) !== find(j) &&
        !(maxHours && time[i] && time[j] && Math.abs(time[i] - time[j]) > maxHours * 36e5)) {
        const s = sim(toks[i], toks[j], idf, common);
        if (s.count >= minShared && s.score >= threshold) union(i, j);
      }
      shared[j] = 0;
    }
    touched.length = 0;
  });

  const groups = new Map();
  articles.forEach((a, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });

  // Contrôle anti-dérive : dans un grand groupe, chaque article doit partager au moins 2 mots
  // avec le « cœur » du groupe (les mots présents dans au moins 20 % de ses titres). Sinon, il sort.
  const out = [];
  const linked = new Set(links.flat());
  for (const idx of groups.values()) {
    if (idx.length < 5) { out.push(idx); continue; }
    const freq = new Map();
    for (const i of idx) for (const w of toks[i]) if (!common.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
    const core = new Set([...freq.entries()].filter(([, n]) => n >= Math.max(2, idx.length * 0.2)).map(([w]) => w));
    const keep = [], drop = [];
    for (const i of idx) {
      let n = 0;
      for (const w of toks[i]) if (core.has(w)) n += WEAK.has(w) ? 0.5 : 1;
      (n >= 2 || linked.has(i) ? keep : drop).push(i);
    }
    if (keep.length) out.push(keep);
    for (const i of drop) out.push([i]);
  }
  return out.map((idx) => ({ idx, toks, idf, common }));
}

const KEY_BY_BIAS = { "-2": "l2", "-1": "l1", "0": "c", "1": "r1", "2": "r2" };
export const biasKey = (m) => (!m || !m.known ? "unk" : m.bias === null || m.bias === undefined ? "state" : KEY_BY_BIAS[m.bias] || "unk");

// Les mots qui résument une histoire (servent à chercher plus de couverture).
export function keywords(group, max = 6) {
  const score = new Map();
  for (const i of group.idx) for (const w of group.toks[i]) {
    if (group.common.has(w)) continue;
    score.set(w, (score.get(w) || 0) + group.idf(w));
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

export function storyFrom(articles, { lead = null, prefer = null } = {}) {
  const list = [...articles].sort((a, b) => (a.published || "9").localeCompare(b.published || "9"));
  const counts = { l2: 0, l1: 0, c: 0, r1: 0, r2: 0, state: 0, unk: 0 };
  // Compte une fois par média : 5 articles de La Presse ne font pas 5 voix.
  const byDomain = new Map();
  for (const a of list) if (!byDomain.has(a.domain || a.sourceName)) byDomain.set(a.domain || a.sourceName, a);
  for (const a of byDomain.values()) counts[biasKey(a.media)]++;
  const left = counts.l2 + counts.l1, right = counts.r1 + counts.r2, center = counts.c, pol = left + right + center;

  let blindspot = null;
  if (pol >= 5) {
    if (left / pol <= 0.15 && right / pol >= 0.4) blindspot = "left";
    else if (right / pol <= 0.15 && left / pol >= 0.4) blindspot = "right";
  }

  const owners = new Map();
  for (const a of byDomain.values()) if (a.media.known) owners.set(a.media.owner, (owners.get(a.media.owner) || 0) + 1);

  // Titre d'ouverture : celui donné, sinon le titre le plus représentatif parmi les médias connus.
  const head = lead || pickLead(list, prefer);
  const id = createHash("sha1").update(head.url || head.title).digest("base64url").slice(0, 10);
  const dated = list.filter((a) => a.published);

  // Image et résumé : ceux du média d'ouverture, sinon du premier média connu qui en fournit.
  const withImg = [head, ...list.filter((a) => a.media?.known), ...list].find((a) => a.image);
  // Le chapeau doit parler de la même chose que le titre : celui du titre d'ouverture, sinon un article au titre très proche.
  const headToks = tokens(head.title);
  const close = (a) => { if (a === head) return true; const t = tokens(a.title); let n = 0; for (const w of headToks) if (t.has(w)) n++; return headToks.size && n / headToks.size >= 0.45; };
  const withSum = [head, ...list.filter((a) => a.lang === head.lang && close(a))].find((a) => a.summary && a.summary.length > 40);
  // Rubriques : celles que partagent au moins 30 % des articles.
  const catCount = new Map();
  for (const a of list) for (const c of a.categories || []) catCount.set(c, (catCount.get(c) || 0) + 1);
  const categories = [...catCount.entries()].filter(([, n]) => n / list.length >= 0.3).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);

  return {
    id,
    title: head.title,
    leadSource: head.sourceName,
    leadDomain: head.domain,
    summary: withSum?.summary || null,
    summarySource: withSum?.sourceName || null,
    image: withImg?.image || null,
    imageSource: withImg?.sourceName || null,
    categories,
    lang: head.lang || null,
    sources: byDomain.size,
    articleCount: list.length,
    counts,
    split: { left, center, right, pol },
    blindspot,
    owners: [...owners.entries()].sort((a, b) => b[1] - a[1]).map(([owner, n]) => ({ owner, n })),
    firstSeen: dated[0]?.published || null,
    lastSeen: dated.at(-1)?.published || null,
    firstBy: dated[0]?.sourceName || null,
    articles: list,
  };
}

function pickLead(list, prefer = null) {
  const toks = list.map((a) => tokens(a.title));
  let best = 0, bestScore = -1;
  toks.forEach((t, i) => {
    let s = 0;
    toks.forEach((u, j) => { if (i !== j) for (const w of t) if (u.has(w)) s++; });
    if (list[i].media?.known) s *= 1.5;
    // Dans une édition francophone, un titre en français passe devant.
    if (prefer && list[i].lang === prefer) s = s * 1.8 + 1;
    const title = list[i].title || "";
    if (/^(vid[ée]o|en direct|direct|live|photos?|podcast)\b/i.test(title)) s *= 0.4;
    if (/^le fil\b|en bref|revue de presse|newsletter|ce qu.il faut retenir/i.test(title)) s *= 0.3;
    if (title.length > 140) s *= 0.7;
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return list[best];
}
