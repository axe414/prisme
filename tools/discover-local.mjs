// Trouve et vérifie les flux des médias locaux et régionaux (Québec d'abord, puis le reste du Canada).
// Chaque média est testé : on cherche son flux RSS (lien dans la page, puis adresses habituelles),
// et on le garde seulement s'il a des articles récents (moins de 21 jours).
// Écrit :
//   data/sources-local.json   médias locaux { domaine: { name, cc, lang, feed, region } }
//   data/feeds-regional.json  fils régionaux des grands réseaux { domaine: [urls] } (CBC, Global, CityNews, Radio-Canada…)
// Usage : node tools/discover-local.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

// [domaine, nom, région administrative (comme dans villes.json), langue]
const LOCAL = [
  // Montréal et Laval
  ["journalmetro.com", "Métro", "Montréal", "fr"], ["24heures.ca", "24 heures", "Montréal", "fr"], ["mtlblog.com", "MTL Blog", "Montréal", "en"],
  ["journaldesvoisins.com", "Journal des voisins", "Montréal", "fr"], ["courrierlaval.com", "Courrier Laval", "Laval", "fr"], ["lechodelaval.ca", "L'Écho de Laval", "Laval", "fr"],
  ["cultmtl.com", "Cult MTL", "Montréal", "en"], ["thesuburban.com", "The Suburban", "Montréal", "en"], ["westmountindependent.com", "Westmount Independent", "Montréal", "en"],
  ["lavantpost.ca", "L'Avant-Post", "Montréal", "fr"], ["journaldelest.com", "Journal de l'Est", "Montréal", "fr"],
  // Montérégie
  ["lecourrier.qc.ca", "Le Courrier de Saint-Hyacinthe", "Montérégie", "fr"], ["canadafrancais.com", "Le Canada Français", "Montérégie", "fr"],
  ["granbyexpress.com", "Granby Express", "Montérégie", "fr"], ["lavoixdelest.ca", "La Voix de l'Est", "Montérégie", "fr"], ["lereflet.qc.ca", "Le Reflet", "Montérégie", "fr"],
  ["lecourrierdusud.ca", "Le Courrier du Sud", "Montérégie", "fr"], ["journaldechambly.com", "Journal de Chambly", "Montérégie", "fr"], ["leclairon.qc.ca", "Le Clairon", "Montérégie", "fr"],
  ["soreltracy.com", "Sorel-Tracy Express", "Montérégie", "fr"], ["les2rives.com", "Les 2 Rives", "Montérégie", "fr"], ["oeilregional.com", "L'Œil Régional", "Montérégie", "fr"],
  ["gravitemedia.com", "Gravité Média", "Montérégie", "fr"], ["monsaintlambert.com", "Mon Saint-Lambert", "Montérégie", "fr"], ["journalleveil.com", "L'Éveil", "Laurentides", "fr"],
  ["infosuroit.com", "Info Suroît", "Montérégie", "fr"], ["leseclaireurs.com", "Les Éclaireurs", "Montérégie", "fr"], ["lerichelieu.ca", "Le Richelieu", "Montérégie", "fr"],
  // Capitale-Nationale et Chaudière-Appalaches
  ["quebechebdo.com", "Québec Hebdo", "Capitale-Nationale", "fr"], ["monquartier.quebec", "Monquartier", "Capitale-Nationale", "fr"], ["courrierdeportneuf.com", "Courrier de Portneuf", "Capitale-Nationale", "fr"],
  ["leplacoteux.com", "Le Placoteux", "Bas-Saint-Laurent", "fr"], ["journaldelevis.com", "Journal de Lévis", "Chaudière-Appalaches", "fr"], ["enbeauce.com", "EnBeauce.com", "Chaudière-Appalaches", "fr"],
  ["beaucemedia.ca", "Beauce Média", "Chaudière-Appalaches", "fr"], ["monthetford.com", "Mon Thetford", "Chaudière-Appalaches", "fr"], ["lepeuplelotbiniere.ca", "Le Peuple Lotbinière", "Chaudière-Appalaches", "fr"],
  ["ckiafm.org", "CKIA", "Capitale-Nationale", "fr"], ["radiox.com", "Radio X", "Capitale-Nationale", "fr"], ["chau.tv", "CHAU TVA", "Bas-Saint-Laurent", "fr"],
  // Estrie, Centre-du-Québec, Mauricie
  ["estrieplus.com", "EstriePlus", "Estrie", "fr"], ["latribune.ca", "La Tribune", "Estrie", "fr"], ["journaldesherbrooke.com", "Journal de Sherbrooke", "Estrie", "fr"],
  ["monmagog.com", "Mon Magog", "Estrie", "fr"], ["lereflet.qc.ca", "Le Reflet du lac", "Estrie", "fr"], ["sherbrookerecord.com", "The Sherbrooke Record", "Estrie", "en"],
  ["journalexpress.ca", "L'Express (Drummondville)", "Centre-du-Québec", "fr"], ["lanouvelle.net", "La Nouvelle Union", "Centre-du-Québec", "fr"], ["vingt55.ca", "Vingt55", "Centre-du-Québec", "fr"],
  ["ledrummondvillois.com", "Le Drummondvillois", "Centre-du-Québec", "fr"], ["lhebdojournal.com", "L'Hebdo du Saint-Maurice", "Mauricie", "fr"], ["lenouvelliste.ca", "Le Nouvelliste", "Mauricie", "fr"],
  ["lechodelatuque.com", "L'Écho de La Tuque", "Mauricie", "fr"], ["infoshawinigan.com", "Info Shawinigan", "Mauricie", "fr"], ["cognitive.ca", "Le Bulletin des Chenaux", "Mauricie", "fr"],
  // Saguenay–Lac-Saint-Jean, Côte-Nord, Nord-du-Québec
  ["lequotidien.com", "Le Quotidien", "Saguenay--Lac-Saint-Jean", "fr"], ["leprogres.net", "Le Progrès", "Saguenay--Lac-Saint-Jean", "fr"], ["informationdulac.com", "L'Étoile du Lac", "Saguenay--Lac-Saint-Jean", "fr"],
  ["latribuneregionale.com", "La Tribune régionale", "Saguenay--Lac-Saint-Jean", "fr"], ["lelacstjean.com", "Le Lac-Saint-Jean", "Saguenay--Lac-Saint-Jean", "fr"], ["monsaguenay.ca", "Mon Saguenay", "Saguenay--Lac-Saint-Jean", "fr"],
  ["cbjfm.com", "CBJ Saguenay", "Saguenay--Lac-Saint-Jean", "fr"], ["lenord-cotier.com", "Le Nord-Côtier", "Côte-Nord", "fr"], ["lemanic.ca", "Le Manic", "Côte-Nord", "fr"],
  ["cilefm.com", "CILE", "Côte-Nord", "fr"], ["cfmf.fm", "CFMF", "Côte-Nord", "fr"], ["cibl.ca", "Le Courrier Laurentien", "Laurentides", "fr"], ["nordinfo.com", "Nord Info", "Laurentides", "fr"],
  // Bas-Saint-Laurent, Gaspésie–Îles
  ["lavantage.qc.ca", "L'Avantage", "Bas-Saint-Laurent", "fr"], ["infodimanche.com", "Info Dimanche", "Bas-Saint-Laurent", "fr"], ["cimt.teleinterrives.com", "CIMT", "Bas-Saint-Laurent", "fr"],
  ["lepeuple.ca", "Le Peuple", "Bas-Saint-Laurent", "fr"], ["radiogaspesie.ca", "Radio Gaspésie", "Gaspésie--Îles-de-la-Madeleine", "fr"], ["graffici.ca", "Graffici", "Gaspésie--Îles-de-la-Madeleine", "fr"],
  ["specs.ca", "Spec", "Gaspésie--Îles-de-la-Madeleine", "fr"], ["cfim.ca", "CFIM", "Gaspésie--Îles-de-la-Madeleine", "fr"], ["lerdc.ca", "Le Radar", "Gaspésie--Îles-de-la-Madeleine", "fr"],
  ["gaspesienouvelles.ca", "Gaspésie Nouvelles", "Gaspésie--Îles-de-la-Madeleine", "fr"], ["journalleclaireur.com", "L'Éclaireur Progrès", "Chaudière-Appalaches", "fr"],
  // Abitibi-Témiscamingue
  ["abitibiexpress.ca", "Abitibi Express", "Abitibi-Témiscamingue", "fr"], ["lafrontiere.ca", "La Frontière", "Abitibi-Témiscamingue", "fr"], ["ici-abitibi.ca", "Ici l'Abitibi", "Abitibi-Témiscamingue", "fr"],
  ["indicebohemien.org", "L'Indice bohémien", "Abitibi-Témiscamingue", "fr"], ["citeboreal.com", "Cité boréale", "Abitibi-Témiscamingue", "fr"], ["lecitoyenrouynnoranda.ca", "Le Citoyen", "Abitibi-Témiscamingue", "fr"],
  ["ckrnfm.ca", "CKRN", "Abitibi-Témiscamingue", "fr"], ["radio-temiscamingue.ca", "Radio Témiscamingue", "Abitibi-Témiscamingue", "fr"],
  // Outaouais
  ["ledroit.com", "Le Droit", "Outaouais", "fr"], ["info07.com", "Info07", "Outaouais", "fr"], ["laraquetteoutaouais.com", "La Raquette", "Outaouais", "fr"],
  ["lapetitenation.com", "La Petite-Nation", "Outaouais", "fr"], ["lebulletin.ca", "Le Bulletin d'Aylmer", "Outaouais", "fr"], ["theequity.ca", "The Equity", "Outaouais", "en"],
  // Laurentides et Lanaudière
  ["monjoliette.com", "Mon Joliette", "Lanaudière", "fr"], ["lexpressmontcalm.com", "L'Express Montcalm", "Lanaudière", "fr"], ["laction.com", "L'Action", "Lanaudière", "fr"],
  ["larevue.qc.ca", "La Revue de Terrebonne", "Lanaudière", "fr"], ["hebdorivenord.com", "L'Hebdo Rive Nord", "Lanaudière", "fr"], ["journalletrait.com", "Le Trait d'union", "Lanaudière", "fr"],
  ["infolaurentides.com", "Info Laurentides", "Laurentides", "fr"], ["linformationdunordmonttremblant.ca", "L'Information du Nord", "Laurentides", "fr"],
  ["journalaccesslaurentides.com", "Le Journal Accès", "Laurentides", "fr"], ["lenord.qc.ca", "Le Nord", "Laurentides", "fr"], ["tremblantexpress.ca", "Tremblant Express", "Laurentides", "fr"],
  ["neomedia.com", "Néomédia", "Montérégie", "fr"], ["cignfm.ca", "CIGN", "Montérégie", "fr"],
];

// Fils régionaux des grands réseaux (on garde ceux qui répondent).
const REGIONAL = {
  "cbc.ca": ["montreal", "toronto", "ottawa", "calgary", "edmonton", "britishcolumbia", "manitoba", "saskatchewan", "saskatoon", "newbrunswick", "novascotia", "pei", "newfoundland", "north",
    "kitchenerwaterloo", "hamiltonnews", "london", "windsor", "sudbury", "thunderbay"].map((c) => `https://www.cbc.ca/webfeed/rss/rss-canada-${c}`),
  "globalnews.ca": ["montreal", "toronto", "calgary", "edmonton", "winnipeg", "halifax", "bc", "okanagan", "regina", "saskatoon", "lethbridge", "guelph", "kingston", "london", "peterborough", "hamilton", "ottawa"]
    .map((c) => `https://globalnews.ca/${c}/feed/`),
  "citynews.ca": ["toronto", "vancouver", "calgary", "edmonton", "winnipeg", "ottawa", "halifax", "kitchener"].map((c) => `https://${c}.citynews.ca/feed/`),
  "neomedia.com": ["vaudreuil-soulanges", "argenteuil", "deux-montagnes", "thérèse-de-blainville", "mirabel", "haute-yamaska", "rive-sud", "vallee-du-richelieu", "chateauguay", "beauharnois", "salaberry-de-valleyfield", "saint-jerome", "saint-sauveur", "brome-missisquoi", "longueuil"]
    .map((c) => `https://www.neomedia.com/${c}/rss`),
};

const get = async (url, ms = 12000) => {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
};
// Un flux valide : au moins 3 articles, le plus récent de moins de 21 jours.
function checkFeed(xml) {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) return null;
  const items = xml.match(/<(item|entry)[\s>]/gi) || [];
  const dates = [...xml.matchAll(/<(pubDate|published|updated|dc:date)>([^<]+)</gi)].map((m) => Date.parse(m[2])).filter(Boolean);
  const last = dates.length ? Math.max(...dates) : 0;
  if (items.length < 3 || !last || Date.now() - last > 21 * 864e5) return null;
  return { items: items.length, ageH: Math.round((Date.now() - last) / 36e5) };
}
async function discover(domain) {
  const tries = [];
  try {
    const html = await get(`https://${domain}/`);
    for (const m of html.matchAll(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*>/gi)) {
      const href = (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
      if (href && !/comments?\/feed|\/comments/i.test(href)) tries.push(new URL(href.replace(/&amp;/g, "&"), `https://${domain}/`).href);
    }
  } catch { /* page d'accueil inaccessible : on essaie les adresses habituelles */ }
  tries.push(`https://${domain}/feed/`, `https://${domain}/rss`, `https://${domain}/rss.xml`, `https://www.${domain}/feed/`, `https://www.${domain}/rss.xml`, `https://${domain}/arc/outboundfeeds/rss/?outputType=xml`);
  for (const url of [...new Set(tries)]) {
    try { const ok = checkFeed(await get(url)); if (ok) return { feed: url, ...ok }; } catch { /* suivant */ }
  }
  return null;
}
async function pool(list, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]); } })); return out; }

// Tous les journaux, hebdos et télés du Canada connus de Wikidata (avec site web et lieu), ajoutés à la liste.
const fold = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const villes = JSON.parse(readFileSync(join(ROOT, "public", "villes.json"), "utf8"));
const byName = new Map();
for (const v of villes) if (!byName.has(fold(v.n))) byName.set(fold(v.n), v);
const wdQuery = (cls) => `SELECT DISTINCT ?item ?itemLabel ?site ?placeLabel ?provLabel ?langCode WHERE {
  ?item wdt:P31/wdt:P279* wd:${cls} ; wdt:P17 wd:Q16 ; wdt:P856 ?site .
  FILTER NOT EXISTS { ?item wdt:P576 ?end }
  OPTIONAL { ?item wdt:P291|wdt:P159|wdt:P131 ?place . OPTIONAL { ?place wdt:P131* ?prov . ?prov wdt:P31 wd:Q11828004 . } }
  OPTIONAL { ?item wdt:P407 ?lang . ?lang wdt:P218 ?langCode . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}`;
for (const cls of ["Q11032", "Q1616075", "Q1153191", "Q1684600"]) { // journaux, télévisions, journaux en ligne, magazines d'actualité
  try {
    const r = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(wdQuery(cls))}`, { headers: { "User-Agent": "Prisme/1.0 (projet libre de nouvelles)", Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(120000) });
    for (const b of (await r.json()).results.bindings) {
      let host;
      try { host = new URL(b.site.value).hostname.replace(/^www\./, "").toLowerCase(); } catch { continue; }
      if (!host || /facebook|twitter|instagram|youtube|wikipedia/.test(host) || LOCAL.some(([d]) => d === host)) continue;
      // La région : la ville du média (liste officielle), sinon sa province.
      const v = b.placeLabel ? byName.get(fold(b.placeLabel.value)) : null;
      const region = v ? v.r : b.provLabel ? b.provLabel.value : "";
      const lang = b.langCode?.value === "en" ? "en" : b.langCode?.value === "fr" ? "fr" : v?.pr === "QC" ? "fr" : "en";
      LOCAL.push([host, b.itemLabel.value, region, lang]);
    }
  } catch (e) { console.log(`Wikidata ${cls} : ${e.message}`); }
}
console.log(`${LOCAL.length} médias à essayer`);

const local = {};
const seen = new Set();
const rows = await pool(LOCAL.filter(([d]) => !seen.has(d) && seen.add(d)), 14, async ([domain, name, region, lang]) => {
  const r = await discover(domain);
  console.log(r ? `✓ ${name} (${domain}) · ${r.items} articles, dernier il y a ${r.ageH} h` : `✗ ${name} (${domain})`);
  return r && [domain, { name, cc: "CA", lang, feed: r.feed, region }];
});
for (const r of rows) if (r) local[r[0]] = r[1];

const regional = {};
for (const [domain, urls] of Object.entries(REGIONAL)) {
  const ok = (await pool(urls, 6, async (u) => { try { return checkFeed(await get(u)) ? u : null; } catch { return null; } })).filter(Boolean);
  regional[domain] = ok;
  console.log(`${domain} : ${ok.length}/${urls.length} fils régionaux valides`);
}
writeFileSync(join(ROOT, "data", "sources-local.json"), JSON.stringify({ builtAt: new Date().toISOString(), sources: local }, null, 1));
writeFileSync(join(ROOT, "data", "feeds-regional.json"), JSON.stringify(regional, null, 1));
console.log(`\n${Object.keys(local).length} médias locaux valides sur ${seen.size} essayés.`);
