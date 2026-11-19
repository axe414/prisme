// Biais indicatif : -2 gauche, -1 centre-gauche, 0 centre, 1 centre-droit, 2 droite, null = non applicable.
// Estimations basées sur les évaluations publiques (AllSides, Media Bias/Fact Check, Ad Fontes) — à réviser au besoin.
// type : public | État | privé | OBNL | coopérative | agence | indépendant
const M = (domains, name, bias, country, type, owner, extra = {}) => ({ domains, name, bias, country, type, owner, ...extra });

export const MEDIA = [
  // Québec / Canada
  M(["radio-canada.ca"], "Radio-Canada", -1, "CA", "public", "Société Radio-Canada (société d'État fédérale)"),
  M(["cbc.ca"], "CBC News", -1, "CA", "public", "Société Radio-Canada (société d'État fédérale)"),
  M(["lapresse.ca"], "La Presse", -1, "CA", "OBNL", "Fiducie de soutien à La Presse (OBNL depuis 2018)"),
  M(["ledevoir.com"], "Le Devoir", -1, "CA", "indépendant", "Indépendant, sans actionnaire de contrôle"),
  M(["journaldemontreal.com"], "Le Journal de Montréal", 1, "CA", "privé", "Québecor (famille Péladeau)"),
  M(["journaldequebec.com"], "Le Journal de Québec", 1, "CA", "privé", "Québecor (famille Péladeau)"),
  M(["tvanouvelles.ca", "qub.ca"], "TVA Nouvelles", 0, "CA", "privé", "Québecor (famille Péladeau)"),
  M(["noovo.info"], "Noovo Info", 0, "CA", "privé", "Bell Média (BCE)"),
  M(["985fm.ca", "cogecomedia.com"], "98.5 Montréal", 0, "CA", "privé", "Cogeco Média"),
  M(["lesoleil.com"], "Le Soleil", 0, "CA", "coopérative", "Coopérative nationale de l'information indépendante (CN2i)"),
  M(["ledroit.com"], "Le Droit", 0, "CA", "coopérative", "Coopérative nationale de l'information indépendante (CN2i)"),
  M(["latribune.ca"], "La Tribune", 0, "CA", "coopérative", "Coopérative nationale de l'information indépendante (CN2i)"),
  M(["lenouvelliste.ca"], "Le Nouvelliste", 0, "CA", "coopérative", "Coopérative nationale de l'information indépendante (CN2i)"),
  M(["theglobeandmail.com"], "The Globe and Mail", 0, "CA", "privé", "Woodbridge Company (famille Thomson)"),
  M(["nationalpost.com"], "National Post", 1, "CA", "privé", "Postmedia (Chatham Asset Management, actionnaire majoritaire)"),
  M(["torontosun.com"], "Toronto Sun", 2, "CA", "privé", "Postmedia (Chatham Asset Management, actionnaire majoritaire)"),
  M(["montrealgazette.com"], "Montreal Gazette", 0, "CA", "privé", "Postmedia (Chatham Asset Management, actionnaire majoritaire)"),
  M(["thestar.com"], "Toronto Star", -1, "CA", "privé", "NordStar Capital (Jordan Bitove)"),
  M(["globalnews.ca"], "Global News", 0, "CA", "privé", "Corus Entertainment"),
  M(["ctvnews.ca"], "CTV News", 0, "CA", "privé", "Bell Média (BCE)"),
  M(["macleans.ca"], "Maclean's", 0, "CA", "privé", "St. Joseph Communications"),
  M(["thecanadianpress.com"], "La Presse Canadienne", 0, "CA", "agence", "La Presse Canadienne"),
  M(["thetyee.ca"], "The Tyee", -2, "CA", "indépendant", "Indépendant (financé par les lecteurs)"),
  M(["lactualite.com"], "L'actualité", 0, "CA", "privé", "Mishmash Média (à vérifier)"),
  M(["lesaffaires.com"], "Les Affaires", 1, "CA", "privé", "Mishmash Média (à vérifier)"),
  M(["journalmetro.com"], "Métro", 0, "CA", "privé", "Métro Média (à vérifier)"),
  M(["pivot.quebec"], "Pivot", -2, "CA", "OBNL", "Pivot (média indépendant sans but lucratif)"),
  M(["therover.ca"], "The Rover", -1, "CA", "indépendant", "Indépendant (financé par les lecteurs)"),
  M(["citynews.ca"], "CityNews", 0, "CA", "privé", "Rogers Sports & Media (Rogers Communications)"),
  M(["aptnnews.ca"], "APTN News", 0, "CA", "OBNL", "Aboriginal Peoples Television Network (sans but lucratif)"),
  M(["thenarwhal.ca"], "The Narwhal", -1, "CA", "OBNL", "Organisme sans but lucratif"),
  M(["thehub.ca"], "The Hub", 1, "CA", "indépendant", "Indépendant"),
  M(["westernstandard.news"], "Western Standard", 2, "CA", "privé", "Western Standard New Media"),
  M(["rebelnews.com"], "Rebel News", 2, "CA", "privé", "Rebel News Network (Ezra Levant)"),

  // France / francophonie
  M(["lemonde.fr"], "Le Monde", -1, "FR", "privé", "Groupe Le Monde"),
  M(["lefigaro.fr"], "Le Figaro", 1, "FR", "privé", "Groupe Dassault (famille Dassault)"),
  M(["liberation.fr"], "Libération", -2, "FR", "OBNL", "Fonds de dotation pour une presse indépendante"),
  M(["mediapart.fr"], "Mediapart", -2, "FR", "indépendant", "Fonds pour une presse libre"),
  M(["humanite.fr"], "L'Humanité", -2, "FR", "privé", "Société nouvelle du journal L'Humanité (historiquement lié au PCF)"),
  M(["nouvelobs.com"], "L'Obs", -1, "FR", "privé", "Groupe Le Monde"),
  M(["huffingtonpost.fr"], "HuffPost France", -1, "FR", "privé", "Groupe Le Monde"),
  M(["courrierinternational.com"], "Courrier international", 0, "FR", "privé", "Groupe Le Monde"),
  M(["leparisien.fr"], "Le Parisien", 0, "FR", "privé", "LVMH (Bernard Arnault)"),
  M(["lesechos.fr"], "Les Échos", 1, "FR", "privé", "LVMH (Bernard Arnault)"),
  M(["lepoint.fr"], "Le Point", 1, "FR", "privé", "Artémis (famille Pinault)"),
  M(["lexpress.fr"], "L'Express", 0, "FR", "privé", "Alain Weill"),
  M(["valeursactuelles.com"], "Valeurs actuelles", 2, "FR", "privé", "Groupe Valmonde"),
  M(["cnews.fr"], "CNews", 2, "FR", "privé", "Groupe Canal+ (famille Bolloré, actionnaire principal)"),
  M(["lejdd.fr"], "Le JDD", 2, "FR", "privé", "Lagardère (groupe Bolloré)"),
  M(["europe1.fr"], "Europe 1", 2, "FR", "privé", "Lagardère (groupe Bolloré)"),
  M(["bfmtv.com"], "BFMTV", 0, "FR", "privé", "CMA CGM (Rodolphe Saadé)"),
  M(["tf1info.fr"], "TF1 Info", 0, "FR", "privé", "Groupe TF1 (Bouygues)"),
  M(["francetvinfo.fr"], "franceinfo", 0, "FR", "public", "France Télévisions / Radio France (État français)"),
  M(["radiofrance.fr", "franceinter.fr"], "Radio France", -1, "FR", "public", "Radio France (État français)"),
  M(["france24.com"], "France 24", 0, "FR", "public", "France Médias Monde (État français)"),
  M(["rfi.fr"], "RFI", 0, "FR", "public", "France Médias Monde (État français)"),
  M(["20minutes.fr"], "20 Minutes", 0, "FR", "privé", "Groupe Rossel / SIPA Ouest-France"),
  M(["ouest-france.fr"], "Ouest-France", 0, "FR", "OBNL", "SIPA Ouest-France (association)"),
  M(["la-croix.com"], "La Croix", 0, "FR", "privé", "Groupe Bayard (congrégation des Augustins de l'Assomption)"),
  M(["afp.com"], "AFP", 0, "FR", "agence", "Agence France-Presse (statut autonome, financement public partiel)"),
  M(["reporterre.net"], "Reporterre", -2, "FR", "OBNL", "Association sans but lucratif"),
  M(["causeur.fr"], "Causeur", 2, "FR", "privé", "Causeur SAS"),
  M(["bvoltaire.fr"], "Boulevard Voltaire", 2, "FR", "privé", "Boulevard Voltaire SAS"),
  M(["rtbf.be"], "RTBF", 0, "BE", "public", "Radio-télévision belge de la Communauté française (public)"),
  M(["lesoir.be"], "Le Soir", 0, "BE", "privé", "Groupe Rossel"),
  M(["rts.ch"], "RTS", 0, "CH", "public", "SRG SSR (service public suisse)"),
  M(["letemps.ch"], "Le Temps", 0, "CH", "OBNL", "Fondation Aventinus"),

  // États-Unis
  M(["nytimes.com"], "The New York Times", -1, "US", "privé", "The New York Times Company (famille Sulzberger)"),
  M(["washingtonpost.com"], "The Washington Post", -1, "US", "privé", "Jeff Bezos (Nash Holdings)"),
  M(["wsj.com"], "The Wall Street Journal", 1, "US", "privé", "News Corp (famille Murdoch)"),
  M(["nypost.com"], "New York Post", 1, "US", "privé", "News Corp (famille Murdoch)"),
  M(["foxnews.com", "foxbusiness.com"], "Fox News", 2, "US", "privé", "Fox Corporation (famille Murdoch)"),
  M(["cnn.com"], "CNN", -1, "US", "privé", "Warner Bros. Discovery (restructuration en cours)"),
  M(["msnbc.com", "ms.now"], "MS NOW (ex-MSNBC)", -2, "US", "privé", "Versant (scission de Comcast)"),
  M(["cnbc.com"], "CNBC", 0, "US", "privé", "Versant (scission de Comcast)"),
  M(["nbcnews.com"], "NBC News", -1, "US", "privé", "Comcast (NBCUniversal)"),
  M(["abcnews.go.com", "abcnews.com"], "ABC News", -1, "US", "privé", "The Walt Disney Company"),
  M(["cbsnews.com"], "CBS News", -1, "US", "privé", "Paramount Skydance (famille Ellison)"),
  M(["thefp.com"], "The Free Press", 1, "US", "privé", "Paramount Skydance (famille Ellison)"),
  M(["npr.org"], "NPR", -1, "US", "OBNL", "National Public Radio (sans but lucratif)"),
  M(["pbs.org"], "PBS", 0, "US", "OBNL", "Public Broadcasting Service (sans but lucratif)"),
  M(["apnews.com"], "Associated Press", 0, "US", "agence", "Coopérative de médias américains (sans but lucratif)"),
  M(["reuters.com"], "Reuters", 0, "GB", "agence", "Thomson Reuters (famille Thomson)"),
  M(["bloomberg.com"], "Bloomberg", 0, "US", "privé", "Bloomberg L.P. (Michael Bloomberg)"),
  M(["politico.com", "politico.eu"], "Politico", -1, "US", "privé", "Axel Springer"),
  M(["axios.com"], "Axios", 0, "US", "privé", "Cox Enterprises"),
  M(["thehill.com"], "The Hill", 0, "US", "privé", "Nexstar Media Group"),
  M(["usatoday.com"], "USA Today", -1, "US", "privé", "Gannett"),
  M(["latimes.com"], "Los Angeles Times", -1, "US", "privé", "Patrick Soon-Shiong"),
  M(["theatlantic.com"], "The Atlantic", -1, "US", "privé", "Laurene Powell Jobs (Emerson Collective)"),
  M(["newyorker.com"], "The New Yorker", -2, "US", "privé", "Condé Nast (Advance Publications)"),
  M(["time.com"], "TIME", -1, "US", "privé", "Marc et Lynne Benioff"),
  M(["newsweek.com"], "Newsweek", 0, "US", "privé", "Newsweek Publishing"),
  M(["forbes.com"], "Forbes", 0, "US", "privé", "Integrated Whale Media"),
  M(["vox.com"], "Vox", -2, "US", "privé", "Vox Media"),
  M(["huffpost.com"], "HuffPost", -2, "US", "privé", "BuzzFeed Inc."),
  M(["slate.com"], "Slate", -2, "US", "privé", "Graham Holdings"),
  M(["motherjones.com"], "Mother Jones", -2, "US", "OBNL", "Foundation for National Progress (sans but lucratif)"),
  M(["thenation.com"], "The Nation", -2, "US", "privé", "The Nation Company"),
  M(["jacobin.com"], "Jacobin", -2, "US", "indépendant", "Indépendant"),
  M(["theintercept.com"], "The Intercept", -2, "US", "OBNL", "Organisme sans but lucratif"),
  M(["propublica.org"], "ProPublica", -1, "US", "OBNL", "Organisme sans but lucratif"),
  M(["semafor.com"], "Semafor", 0, "US", "privé", "Semafor Inc."),
  M(["reason.com"], "Reason", 1, "US", "OBNL", "Reason Foundation (libertarien)"),
  M(["realclearpolitics.com"], "RealClearPolitics", 1, "US", "privé", "RealClear Media"),
  M(["washingtonexaminer.com"], "Washington Examiner", 1, "US", "privé", "Clarity Media (Philip Anschutz)"),
  M(["washingtontimes.com"], "The Washington Times", 2, "US", "privé", "Operations Holdings (Église de l'Unification)"),
  M(["nationalreview.com"], "National Review", 2, "US", "privé", "National Review, Inc."),
  M(["thefederalist.com"], "The Federalist", 2, "US", "privé", "FDRLST Media"),
  M(["dailycaller.com"], "The Daily Caller", 2, "US", "privé", "Daily Caller, Inc."),
  M(["dailywire.com"], "The Daily Wire", 2, "US", "privé", "Daily Wire (Bentkey Ventures)"),
  M(["breitbart.com"], "Breitbart", 2, "US", "privé", "Breitbart News Network"),
  M(["newsmax.com"], "Newsmax", 2, "US", "privé", "Newsmax Media (Christopher Ruddy)"),

  // Royaume-Uni
  M(["bbc.com", "bbc.co.uk"], "BBC", 0, "GB", "public", "British Broadcasting Corporation (service public)"),
  M(["theguardian.com"], "The Guardian", -1, "GB", "OBNL", "Scott Trust (sans but lucratif)"),
  M(["independent.co.uk"], "The Independent", -1, "GB", "privé", "Evgeny Lebedev et Sultan Muhammad Abuljadayel"),
  M(["mirror.co.uk"], "Daily Mirror", -2, "GB", "privé", "Reach plc"),
  M(["newstatesman.com"], "New Statesman", -1, "GB", "privé", "Mike Danson"),
  M(["ft.com"], "Financial Times", 0, "GB", "privé", "Nikkei Inc."),
  M(["economist.com"], "The Economist", 0, "GB", "privé", "The Economist Group (Exor, famille Agnelli, principal actionnaire)"),
  M(["news.sky.com"], "Sky News", 0, "GB", "privé", "Comcast"),
  M(["thetimes.com", "thetimes.co.uk"], "The Times", 1, "GB", "privé", "News Corp (famille Murdoch)"),
  M(["telegraph.co.uk"], "The Telegraph", 1, "GB", "privé", "Propriété en transition depuis 2024 (vérifier)"),
  M(["spectator.co.uk"], "The Spectator", 1, "GB", "privé", "Paul Marshall"),
  M(["dailymail.co.uk"], "Daily Mail", 2, "GB", "privé", "DMGT (famille Rothermere)"),
  M(["thesun.co.uk"], "The Sun", 2, "GB", "privé", "News Corp (famille Murdoch)"),
  M(["gbnews.com"], "GB News", 2, "GB", "privé", "Paul Marshall et Legatum"),

  // International
  M(["dw.com"], "Deutsche Welle", 0, "DE", "public", "Service public allemand"),
  M(["spiegel.de"], "Der Spiegel", -1, "DE", "privé", "Employés (50,5 %), Gruner + Jahr, famille Augstein"),
  M(["faz.net"], "Frankfurter Allgemeine", 1, "DE", "OBNL", "Fazit-Stiftung (fondation)"),
  M(["elpais.com"], "El País", -1, "ES", "privé", "Grupo PRISA"),
  M(["elmundo.es"], "El Mundo", 1, "ES", "privé", "Unidad Editorial (RCS MediaGroup)"),
  M(["euronews.com"], "Euronews", 0, "FR", "privé", "Alpac Capital"),
  M(["haaretz.com"], "Haaretz", -1, "IL", "privé", "Famille Schocken et M. DuMont Schauberg"),
  M(["timesofisrael.com"], "The Times of Israel", 0, "IL", "privé", "The Times of Israel Ltd."),
  M(["jpost.com"], "The Jerusalem Post", 1, "IL", "privé", "Eli Azur"),
  M(["kyivindependent.com"], "The Kyiv Independent", 0, "UA", "indépendant", "Propriété de l'équipe (financement par les lecteurs)"),
  M(["meduza.io"], "Meduza", -1, "LV", "indépendant", "Média russe indépendant en exil"),
  M(["themoscowtimes.com"], "The Moscow Times", 0, "NL", "indépendant", "Média indépendant en exil"),
  M(["scmp.com"], "South China Morning Post", 0, "HK", "privé", "Alibaba Group"),

  // Médias d'État (le gauche/droite ne s'applique pas : ligne alignée sur le gouvernement)
  M(["aljazeera.com", "aljazeera.net"], "Al Jazeera", null, "QA", "État", "Al Jazeera Media Network (financé par l'État du Qatar)", { state: "Qatar" }),
  M(["rt.com"], "RT", null, "RU", "État", "TV-Novosti (État russe)", { state: "Russie" }),
  M(["sputnikglobe.com", "sputniknews.com"], "Sputnik", null, "RU", "État", "Rossiya Segodnya (État russe)", { state: "Russie" }),
  M(["tass.com", "tass.ru"], "TASS", null, "RU", "État", "Agence de presse d'État russe", { state: "Russie" }),
  M(["ria.ru"], "RIA Novosti", null, "RU", "État", "Rossiya Segodnya (État russe)", { state: "Russie" }),
  M(["cgtn.com"], "CGTN", null, "CN", "État", "China Media Group (État chinois)", { state: "Chine" }),
  M(["news.cn", "xinhuanet.com"], "Xinhua", null, "CN", "État", "Agence de presse d'État chinoise", { state: "Chine" }),
  M(["globaltimes.cn"], "Global Times", null, "CN", "État", "Quotidien du Peuple (Parti communiste chinois)", { state: "Chine" }),
  M(["chinadaily.com.cn"], "China Daily", null, "CN", "État", "Département de la propagande du PCC", { state: "Chine" }),
  M(["presstv.ir"], "Press TV", null, "IR", "État", "IRIB (État iranien)", { state: "Iran" }),
  M(["trtworld.com"], "TRT World", null, "TR", "État", "TRT (État turc)", { state: "Turquie" }),
];

const index = new Map();
for (const m of MEDIA) for (const d of m.domains) index.set(d, m);

const TLD_COUNTRY = { fr: "FR", ca: "CA", uk: "GB", be: "BE", ch: "CH", de: "DE", es: "ES", it: "IT", ru: "RU", cn: "CN", ir: "IR", il: "IL", ua: "UA", au: "AU", in: "IN", jp: "JP", br: "BR", mx: "MX", ie: "IE", nz: "NZ", za: "ZA", qa: "QA", tr: "TR" };

export function cleanDomain(input) {
  if (!input) return "";
  let h = String(input).trim().toLowerCase();
  try { if (h.includes("/")) h = new URL(h.startsWith("http") ? h : "https://" + h).hostname; } catch { /* garde tel quel */ }
  return h.replace(/^www\d?\./, "").replace(/^m\./, "");
}

export function lookupMedia(domain) {
  let d = cleanDomain(domain);
  while (d) {
    const hit = index.get(d);
    if (hit) return hit;
    const i = d.indexOf(".");
    if (i < 0) break;
    d = d.slice(i + 1);
  }
  return null;
}

export function guessCountry(domain) {
  const tld = cleanDomain(domain).split(".").pop();
  return TLD_COUNTRY[tld] || null;
}

// Google News nomme parfois un média sans donner son domaine (articles liés) : on retrouve le domaine par le nom.
const normName = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^(the|le|la|les|l')\s*/, "").replace(/[^a-z0-9]+/g, "");
const byName = new Map();
for (const m of MEDIA) byName.set(normName(m.name), m.domains[0]);
export function domainForName(name) {
  return byName.get(normName(name)) || null;
}

export function directory() {
  return MEDIA.map((m) => ({ domain: m.domains[0], name: m.name, bias: m.bias, country: m.country, type: m.type, owner: m.owner, state: m.state || null }));
}

export function mediaSummary(domain) {
  const m = lookupMedia(domain);
  if (!m) return { known: false, country: guessCountry(domain) };
  return { known: true, name: m.name, bias: m.bias, country: m.country, type: m.type, owner: m.owner, state: m.state || null };
}
