// Tout ce qu'un groupe possède selon Wikidata : on part des médias que Prisme connaît, on remonte à leurs
// propriétaires (et un cran plus haut), puis on redescend : ce que ces propriétaires contrôlent, et ce que
// leurs filiales contrôlent. Plusieurs petites requêtes rapides plutôt qu'une grosse (Wikidata coupe à 60 s).
import { fetchWithTimeout } from "./http.mjs";
import { cleanDomain } from "./media-db.mjs";

const SPARQL = "https://query.wikidata.org/sparql?format=json&query=";
const qid = (uri) => (uri || "").split("/").pop();

// Wikidata limite le rythme (429) et peut être lent : on patiente et on réessaie, poliment.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sparql(query, ms = 30000, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchWithTimeout(SPARQL + encodeURIComponent(query), { headers: { Accept: "application/sparql-results+json" } }, ms);
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 5000 * (i + 1);
        await sleep(Math.min(wait, 60000));
        continue;
      }
      if (!res.ok) throw new Error(`Wikidata ${res.status}`);
      return (await res.json()).results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(4000 * (i + 1));
    }
  }
  throw new Error("Wikidata indisponible");
}

const siteVariants = (domains) => [...new Set(domains.flatMap((d) => [d, `www.${d}`]))]
  .flatMap((h) => ["https", "http"].flatMap((s) => [`<${s}://${h}/>`, `<${s}://${h}>`]));
const values = (ids) => ids.map((id) => `wd:${id}`).join(" ");

// Les sortes de médias qu'on garde (d'après le libellé du type Wikidata, en français ou en anglais).
const KINDS = [
  ["tele", /t[ée]l[ée]vis|television|tv channel|cha[iî]ne de t|channel|broadcast|diffuseur|network/i],
  ["radio", /radio/i],
  ["journal", /journal|newspaper|quotidien|daily|hebdomadaire|weekly|tabloïd|tabloid|gazette/i],
  ["magazine", /magazine|périodique|periodical|revue/i],
  ["agence", /agence de presse|news agency/i],
  ["web", /site web|website|portail|web portal|média en ligne|online/i],
];
const COMPANY = /entreprise|company|société|filiale|subsidiary|business|holding|conglom|groupe|group|corporation|division|organisation|organization/i;
const kindOf = (types) => (KINDS.find(([, re]) => re.test(types)) || [null])[0];

// Ce que contrôlent directement des propriétaires (une seule étape, rapide).
async function children(ownerIds) {
  if (!ownerIds.length) return [];
  return sparql(`
SELECT ?o ?oLabel ?t ?own (SAMPLE(?s) AS ?site) (SAMPLE(?cLabel) AS ?country) WHERE {
  VALUES ?own { ${values(ownerIds)} }
  ?o p:P127|p:P749 ?st . ?st ps:P127|ps:P749 ?own . FILTER NOT EXISTS { ?st pq:P582 ?e }
  FILTER NOT EXISTS { ?o wdt:P576 ?dissolved }
  ?o wdt:P31 ?t .
  OPTIONAL { ?o wdt:P856 ?s }
  OPTIONAL { ?o wdt:P17 ?c }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?o rdfs:label ?oLabel . ?c rdfs:label ?cLabel . }
} GROUP BY ?o ?oLabel ?t ?own LIMIT 1500`);
}

async function typeLabels(typeIds) {
  if (!typeIds.length) return new Map();
  const rows = await sparql(`SELECT ?t ?tLabel WHERE { VALUES ?t { ${values(typeIds)} } SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?t rdfs:label ?tLabel . } }`);
  return new Map(rows.map((r) => [qid(r.t), r.tLabel]));
}

export async function empire(domains) {
  // 1) Les médias connus → leurs propriétaires actuels, et les propriétaires de ces propriétaires.
  const owners = await sparql(`
SELECT DISTINCT ?item ?own ?ownLabel ?up ?upLabel WHERE {
  VALUES ?site { ${siteVariants(domains).join(" ")} }
  ?item wdt:P856 ?site .
  ?item p:P127|p:P749 ?st . ?st ps:P127|ps:P749 ?own . FILTER NOT EXISTS { ?st pq:P582 ?e }
  OPTIONAL { ?own p:P127|p:P749 ?st2 . ?st2 ps:P127|ps:P749 ?up . FILTER NOT EXISTS { ?st2 pq:P582 ?e2 } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?own rdfs:label ?ownLabel . ?up rdfs:label ?upLabel . }
} LIMIT 60`);
  // On écarte les propriétaires trop vastes (États, fonds d'investissement) : ils possèdent de tout.
  const tooBroad = /gouvernement|government|^état|state of|république|republic|vanguard|blackrock|fidelity|actionnaires|shareholders|public$|rundfunk|^saarland/i;
  const ownerIds = new Map();
  for (const r of owners) {
    if (r.own && !tooBroad.test(r.ownLabel || "")) ownerIds.set(qid(r.own), r.ownLabel);
    if (r.up && !tooBroad.test(r.upLabel || "")) ownerIds.set(qid(r.up), r.upLabel);
  }
  const known = new Set(owners.map((r) => qid(r.item)));
  if (!ownerIds.size) return { owners: [], items: [] };
  const ownerName = new Map(ownerIds);

  // 2) Premier niveau, puis les filiales (entreprises) du premier niveau.
  const lvl1 = await children([...ownerIds.keys()].slice(0, 10));
  const types1 = await typeLabels([...new Set(lvl1.map((r) => qid(r.t)))].slice(0, 400));
  const subs = new Map();
  for (const r of lvl1) {
    const id = qid(r.o);
    if (!ownerIds.has(id) && COMPANY.test(types1.get(qid(r.t)) || "")) subs.set(id, r.oLabel);
  }
  const lvl2 = subs.size ? await children([...subs.keys()].slice(0, 30)).catch(() => []) : [];
  const types = new Map([...types1, ...(await typeLabels([...new Set(lvl2.map((r) => qid(r.t)))].filter((t) => !types1.has(t)).slice(0, 400)).catch(() => new Map()))]);
  for (const [id, name] of subs) ownerName.set(id, name);

  // 3) On regroupe par élément et on ne garde que les médias.
  const byId = new Map();
  for (const r of [...lvl1, ...lvl2]) {
    const id = qid(r.o);
    if (known.has(id) || ownerIds.has(id) || /^Q\d+$/.test(r.oLabel)) continue;
    const e = byId.get(id) || { id, name: r.oLabel, types: new Set(), domain: null, country: r.country || null, via: ownerName.get(qid(r.own)) || null, url: `https://www.wikidata.org/wiki/${id}` };
    e.types.add(types.get(qid(r.t)) || "");
    if (!e.domain && r.site) e.domain = cleanDomain(r.site);
    byId.set(id, e);
  }
  const items = [];
  for (const e of byId.values()) {
    const kind = kindOf([...e.types].join(" | "));
    if (kind) items.push({ ...e, kind, types: [...e.types].filter(Boolean).slice(0, 2) });
  }
  const order = { tele: 0, radio: 1, journal: 2, magazine: 3, web: 4, agence: 5 };
  items.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, "fr"));
  return { owners: [...ownerIds.values()], subsidiaries: [...subs.values()].slice(0, 30), items };
}
