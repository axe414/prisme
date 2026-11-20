// La liste des villes de Prisme (public/villes.json) :
//  - toutes les municipalités du Québec, d'après le Répertoire officiel des municipalités (données ouvertes du MAMH) ;
//  - les villes de 10 000 habitants et plus du reste du Canada, d'après Wikidata.
// Usage : node tools/build-villes.mjs   (à relancer de temps en temps ; le fichier est versionné)
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "villes.json");
const fold = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (t) => fold(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Lecture d'un CSV simple (guillemets, virgules).
function csv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// 1) Québec : toutes les municipalités (sauf territoires non organisés).
const raw = (await (await fetch("https://donneesouvertes.affmunqc.net/repertoire/MUN.csv")).text()).replace(/^﻿/, "");
const [head, ...rows] = csv(raw);
const col = (name) => head.indexOf(name);
const villes = [];
for (const r of rows) {
  const name = r[col("munnom")], des = r[col("mdes")], pop = Number(r[col("mpopul")]) || 0;
  if (!name || /territoire non organis/i.test(des)) continue;
  villes.push({
    s: slug(name), n: name, pr: "QC", p: pop,
    r: (r[col("regadm")] || "").replace(/\s*\(\d+\)\s*$/, ""), // région administrative
    m: (r[col("mrc")] || "").replace(/\s*\(\d+\)\s*$/, ""),     // MRC
    d: des,
  });
}
console.log(`Québec : ${villes.length} municipalités`);

// 2) Reste du Canada : villes de 10 000 habitants et plus (Wikidata).
const PROV = { "Ontario": "ON", "Colombie-Britannique": "BC", "Alberta": "AB", "Manitoba": "MB", "Saskatchewan": "SK", "Nouvelle-Écosse": "NS", "Nouveau-Brunswick": "NB",
  "Terre-Neuve-et-Labrador": "NL", "Île-du-Prince-Édouard": "PE", "Yukon": "YT", "Territoires du Nord-Ouest": "NT", "Nunavut": "NU" };
const query = `SELECT ?item ?itemLabel (MAX(?pop) AS ?p) ?provLabel WHERE {
  ?item wdt:P17 wd:Q16 ; wdt:P1082 ?pop ; wdt:P131+ ?prov .
  VALUES ?prov { ${["Q1904", "Q1973", "Q1951", "Q1948", "Q1989", "Q1952", "Q1965", "Q2003", "Q1979", "Q2009", "Q2007", "Q2023"].map((q) => `wd:${q}`).join(" ")} }
  ?item wdt:P31/wdt:P279* wd:Q15284 .
  FILTER(?pop >= 10000)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
} GROUP BY ?item ?itemLabel ?provLabel`;
try {
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { "User-Agent": "Prisme/1.0 (projet libre)", Accept: "application/sparql-results+json" } });
  const j = await res.json();
  const seen = new Set(villes.map((v) => v.s));
  let n = 0;
  for (const b of j.results.bindings) {
    const name = b.itemLabel.value, pr = PROV[b.provLabel.value];
    if (!pr || /^Q\d+$/.test(name) || /^(municipalité régionale|district régional|comté|regional municipality|county)/i.test(name)) continue;
    const s = `${slug(name)}-${pr.toLowerCase()}`;
    if (seen.has(s)) continue;
    seen.add(s);
    villes.push({ s, n: name, pr, p: Math.round(Number(b.p.value)), r: b.provLabel.value, m: "" });
    n++;
  }
  console.log(`Reste du Canada : ${n} villes`);
} catch (e) { console.log(`Wikidata indisponible (${e.message}) : Québec seulement.`); }

villes.sort((a, b) => b.p - a.p);
// Homonymes (deux Saint-Lambert, deux Clermont…) : le plus peuplé garde le nom simple, les autres ajoutent leur région.
const used = new Set();
for (const v of villes) {
  if (used.has(v.s)) v.s = `${v.s}-${slug(v.m || v.r)}`;
  used.add(v.s);
}
writeFileSync(OUT, JSON.stringify(villes));
console.log(`${villes.length} villes écrites dans public/villes.json`);
