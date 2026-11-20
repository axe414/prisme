// L'archive de Prisme : chaque article lu est gardé 7 jours (les flux RSS, eux, n'en montrent que quelques jours).
// Elle sert à deux choses :
//   - la page de chaque média (data/m/<domaine>.json) : ses articles des 7 derniers jours, avec image et extrait ;
//   - la recherche sur 7 jours (data/older-<région>.json) : les articles plus vieux que l'édition (48 h).
// Le robot la garde d'une fois à l'autre dans .data/archive.json ; le serveur local s'en sert s'il la trouve.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { biasKey } from "./cluster.mjs";
import { REGION_COUNTRIES } from "./edition.mjs";

export const CATEGORIES = ["politique", "international", "economie", "environnement", "techno", "science", "sante", "culture", "sports"];
export const catMask = (cats = []) => cats.reduce((m, c) => { const i = CATEGORIES.indexOf(c); return i >= 0 ? m | (1 << i) : m; }, 0);
const DAYS = 7;
const minuteOf = (iso) => (iso ? Math.round(Date.parse(iso) / 60000) : 0);
const clip = (t, n) => (t && t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t || null);

// Un média : [nom, orientation (clé), propriétaire, pays, biais, État]
export const domainMeta = (a) => {
  const m = a.media;
  return [a.sourceName || a.domain, biasKey(m), m.known ? m.owner : null, m.country || null, m.known ? m.bias : null, m.state || null];
};
// Un article : [titre, lien, domaine, minute de publication, langue, rubriques (bits), image, extrait]
export const recordOf = (a) => [a.title, a.url, a.domain, minuteOf(a.published), a.lang || null, catMask(a.categories), a.image || null, clip(a.summary, 170)];

export function loadArchive(file) {
  try { if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")); } catch { /* archive illisible : on repart */ }
  return { domains: {}, items: {} };
}

// Ajoute les articles du moment et oublie ceux de plus de 7 jours.
export function mergeArchive(arch, index) {
  for (const a of index.articles) {
    if (!a.url) continue;
    arch.domains[a.domain] = domainMeta(a);
    const prev = arch.items[a.url];
    const rec = recordOf(a);
    if (prev && prev[3] && (!rec[3] || prev[3] < rec[3])) rec[3] = prev[3]; // garde la première date vue
    arch.items[a.url] = rec;
  }
  const cutoff = Date.now() / 60000 - DAYS * 1440;
  for (const [u, r] of Object.entries(arch.items)) if (r[3] && r[3] < cutoff) delete arch.items[u];
  return arch;
}
export const saveArchive = (file, arch) => writeFileSync(file, JSON.stringify(arch));

// Archive « à la volée » pour le serveur local quand il n'y a pas encore d'archive : seulement l'édition en cours.
export const archiveFromIndex = (index) => mergeArchive({ domains: {}, items: {} }, index);

export const outletFileName = (domain) => `${domain.toLowerCase().replace(/[^a-z0-9.-]/g, "_")}.json`;

// Les fichiers de chaque média, d'un seul passage dans l'archive.
export function outletFiles(arch, max = 500) {
  const by = new Map();
  for (const r of Object.values(arch.items)) {
    let l = by.get(r[2]);
    if (!l) by.set(r[2], (l = []));
    l.push(r);
  }
  const out = [];
  for (const [domain, list] of by) {
    const meta = arch.domains[domain];
    if (!meta) continue;
    list.sort((x, y) => y[3] - x[3]);
    out.push([domain, { domain, meta, builtAt: new Date().toISOString(), items: list.slice(0, max).map((r) => [r[0], r[1], r[3], r[4], r[5], r[6], r[7]]) }]);
  }
  return out;
}

export function outletFile(arch, domain, max = 500) {
  const meta = arch.domains[domain];
  if (!meta) return null;
  const items = Object.values(arch.items).filter((r) => r[2] === domain).sort((x, y) => y[3] - x[3]).slice(0, max);
  return { domain, meta, builtAt: new Date().toISOString(), items: items.map((r) => [r[0], r[1], r[3], r[4], r[5], r[6], r[7]]) };
}

// Pour la recherche sur 7 jours : les articles d'une région plus vieux que l'édition en cours (pas de doublons).
// Même format que articles-<région>.json (domains + items) pour que l'app les traite pareil.
export function olderFile(arch, region, currentUrls, maxItems = 90000) {
  const countries = REGION_COUNTRIES[region];
  const dIdx = new Map(), domains = [], items = [];
  const list = Object.values(arch.items).filter((r) => !currentUrls.has(r[1]) && (!countries || countries.includes(arch.domains[r[2]]?.[3])));
  list.sort((x, y) => y[3] - x[3]);
  for (const r of list.slice(0, maxItems)) {
    if (!dIdx.has(r[2])) {
      const m = arch.domains[r[2]];
      dIdx.set(r[2], domains.length);
      domains.push([r[2], m[0], m[1], m[2], m[3], m[4], m[5]]);
    }
    items.push([r[0], r[1], dIdx.get(r[2]), r[3], r[4], r[5]]);
  }
  return { region, builtAt: new Date().toISOString(), domains, items };
}
