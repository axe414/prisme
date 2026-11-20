// Langue de l'interface (français ou anglais). L'app est écrite en français ; en anglais, chaque texte affiché
// est traduit au vol à partir de ce dictionnaire (les articles, eux, restent dans la langue de leur média).
export const LANG = (() => {
  try { return localStorage.getItem("prisme.lang") || ((navigator.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en"); }
  catch { return "fr"; }
})();
export const LOCALE = LANG === "en" ? "en-CA" : "fr-CA";
export function setLang(l) { try { localStorage.setItem("prisme.lang", l); } catch { /* stockage indisponible */ } location.reload(); }

const s = (n) => (Number(n) > 1 ? "s" : "");
const EXACT = {
  // Navigation
  "À la une": "Top stories", "Politique": "Politics", "International": "World", "Économie": "Business", "Environnement": "Environment",
  "Techno": "Tech", "Science": "Science", "Santé": "Health", "Culture": "Culture", "Sports": "Sports",
  "Le matin": "Morning brief", "Vidéos": "Videos", "Mon prisme": "My prism", "Qui possède quoi": "Who owns what", "Devine le média": "Guess the outlet",
  "Plus": "More", "Chercher un sujet": "Search a topic", "Aller au contenu": "Skip to content", "Édition": "Edition",
  "Comment Prisme choisit": "How Prisme chooses", "Changer le thème": "Switch theme", "Thème clair ou sombre": "Light or dark theme",
  // Éditions
  "Québec": "Quebec", "États-Unis": "United States", "Royaume-Uni": "United Kingdom", "Amérique latine": "Latin America", "Afrique": "Africa",
  "Moyen-Orient": "Middle East", "Asie": "Asia", "Océanie": "Oceania", "Monde entier": "Whole world", "Monde": "World",
  // Lentilles
  "Voir par": "View by", "L'essentiel": "Essentials", "Angles morts": "Blindspots", "Bulle de gauche": "Left bubble", "Bulle de droite": "Right bubble",
  "Hors radar": "Under the radar", "En continu": "Live feed",
  "Les histoires couvertes par le plus de médias, avec un bonus quand la gauche, le centre et la droite en parlent tous. Les plus récentes passent devant.": "The stories covered by the most outlets, with a bonus when left, center and right all cover them. The most recent come first.",
  "Des histoires qu'un côté du spectre couvre beaucoup et que l'autre ignore presque.": "Stories one side of the spectrum covers a lot while the other almost ignores them.",
  "Ce que les médias de gauche couvrent le plus en ce moment, et que la droite couvre peu ou pas.": "What left-leaning outlets cover most right now, and the right barely covers.",
  "Ce que les médias de droite couvrent le plus en ce moment, et que la gauche couvre peu ou pas.": "What right-leaning outlets cover most right now, and the left barely covers.",
  "Des histoires couvertes par un ou deux médias seulement : enquêtes, sujets locaux, médias indépendants.": "Stories covered by only one or two outlets: investigations, local issues, independent media.",
  "Tout ce que Prisme lit, du plus récent au plus ancien, sans aucun tri.": "Everything Prisme reads, newest first, with no sorting at all.",
  // Orientation
  "Orientation des médias": "Outlet leaning", "Gauche": "Left", "Centre-gauche": "Center-left", "Centre": "Center", "Centre-droit": "Center-right",
  "Droite": "Right", "Média d'État": "State media", "Médias d'État": "State media", "Non évalué": "Not rated", "Non évalués": "Not rated", "État": "State",
  "Aucun média évalué": "No rated outlet",
  "Peu couvert à droite": "Barely covered on the right", "Peu couvert à gauche": "Barely covered on the left", "Surtout à gauche": "Mostly left",
  "Surtout à droite": "Mostly right", "Lu": "Read", "des 3 côtés": "from all 3 sides", "2 côtés": "2 sides", "Traduire": "Translate",
  // Fil et colonne
  "En ce moment": "Trending", "Mes sujets": "My topics", "sur cet appareil": "on this device", "Suivre": "Follow",
  "Suis un sujet (une personne, une ville, un enjeu) pour le retrouver ici en un clic.": "Follow a topic (a person, a city, an issue) to find it here in one click.",
  "Recevoir une alerte quand un de mes sujets bouge": "Alert me when one of my topics moves", "Alertes activées pour tes sujets.": "Alerts are on for your topics.",
  "dans ce fil": "in this feed", "Qui possède ce fil": "Who owns this feed", "Les médias du fil": "Outlets in this feed",
  "Nombre d'histoires de ce fil où chaque propriétaire a au moins un média.": "Number of stories in this feed where each owner has at least one outlet.",
  "ton angle mort": "your blindspot", "Voir Mon prisme": "See My prism", "Voir mon portrait": "See my profile",
  "Ouvre des articles depuis Prisme : il te montrera de quel côté tu penches et ce que tu rates de l'autre côté. Tout reste sur cet appareil.": "Open articles from Prisme: it will show which side you lean and what you miss on the other side. Everything stays on this device.",
  "Lectures plutôt équilibrées.": "Fairly balanced reading.",
  "Plus d'histoires": "More stories", "Chargement des histoires suivantes…": "Loading more stories…", "C'est tout pour cette lentille.": "That's all for this lens.",
  "Essaie": "Try", "pour tout voir.": "to see everything.", "Le fil n'a pas pu se charger.": "The feed couldn't load.", "Réessayer": "Retry",
  "Revenir à L'essentiel": "Back to Essentials", "Essaie une autre lentille ou une autre édition.": "Try another lens or edition.",
  "Aucune histoire n'est assez couverte d'un seul côté en ce moment. C'est plutôt bon signe.": "No story is covered mostly by one side right now. That's a good sign.",
  // Histoire
  "← Retour": "← Back", "← Le fil": "← Feed", "Histoire": "Story", "révélée par": "first reported by", "Histoire introuvable.": "Story not found.",
  "Qui couvre cette histoire": "Who covers this story", "une voix par média": "one voice per outlet", "Comment ils le titrent": "How they headline it",
  "Les mots surlignés n'apparaissent que d'un côté : c'est souvent là que se cache le cadrage.": "Highlighted words appear on only one side: that's often where the framing hides.",
  "Mots de la gauche": "Left's words", "Mots de la droite": "Right's words", "aucun mot propre": "no distinctive words",
  "Autres sources": "Other sources", "médias d'État ou non évalués": "state or unrated outlets", "Qui possède ces médias": "Who owns these outlets",
  "Aucun propriétaire connu.": "No known owner.", "Chronologie": "Timeline", "qui en a parlé en premier": "who reported it first", "Aller plus loin": "Go further",
  "Cherche ce sujet dans tous les médias lus par Prisme, ou suis-le.": "Search this topic across every outlet Prisme reads, or follow it.",
  "Qui n'en parle pas": "Who's silent",
  "Ces médias publient beaucoup en ce moment, mais rien sur cette histoire dans leurs flux des dernières 48 heures. Ils peuvent en parler ailleurs (télé, papier, plus tard).": "These outlets are publishing a lot right now, but nothing on this story in their feeds over the last 48 hours. They may cover it elsewhere (TV, print, later).",
  "État ou non évalués": "State or not rated", "Vu d'ici, vu d'ailleurs": "Seen from here and abroad", "Canada et Québec": "Canada & Quebec",
  "France, Belgique, Suisse": "France, Belgium, Switzerland", "Ailleurs et médias d'État": "Elsewhere & state media", "En vidéo": "On video",
  "chaînes YouTube des médias": "outlets' YouTube channels", "Titres modifiés": "Changed headlines", "depuis leur publication": "since publication",
  "Résumé neutre": "Neutral summary", "écrit par IA à partir de tous les titres": "written by AI from all the headlines", "À gauche": "On the left", "À droite": "On the right",
  "ANGLE MORT.": "BLINDSPOT.", "MÉDIAS D'ÉTAT.": "STATE MEDIA.", "Ils ont changé leur titre": "They changed their headline",
  // Sujet et recherche élargie
  "Sujet": "Topic", "Les histoires des dernières 48 heures, dans les médias que Prisme lit directement.": "Stories from the last 48 hours, in the outlets Prisme reads directly.",
  "★ Suivre ce sujet": "★ Follow this topic", "✓ Suivi": "✓ Following", "Chercher dans tous les articles (48 h)": "Search all articles (48 h)", "Tous les articles": "All articles",
  "48 h": "48 h", "Recherche dans des milliers de médias…": "Searching thousands of outlets…",
  "Ici, Prisme cherche dans chaque article publié par les médias de cette édition depuis 48 heures, même ceux qui ne font pas partie d'une histoire. Aucun tri : du plus récent au plus ancien.": "Here Prisme searches every article published by this edition's outlets in the last 48 hours, even those not part of a story. No sorting: newest first.",
  "Aucun article des médias lus par Prisme ne contient tous ces mots. Essaie un mot plus court ou une autre édition (Monde entier cherche partout).": "No article from the outlets Prisme reads contains all these words. Try a shorter word or another edition (Whole world searches everywhere).",
  "Un sujet, un média…": "A topic, an outlet…", "Chercher un sujet ou un média": "Search a topic or an outlet",
  "Recherches récentes": "Recent searches", "Effacer": "Clear", "Histoires": "Stories", "Les histoires sur ce sujet": "Stories on this topic",
  "Cherche un sujet (une personne, une ville, un enjeu) ou le nom d'un média, comme « TVA » ou « Le Devoir ».": "Search a topic (a person, a city, an issue) or an outlet's name, like “CBC” or “Le Devoir”.",
  "Couvert par": "Covered by", "en parlent": "cover it", "en parle": "covers it",
  "Comment lire Prisme": "How to read Prisme", "Compris": "Got it",
  "Chaque bloc est une histoire": "Each block is a story", "« 6 médias en parlent »": "“6 outlets cover it”", "La barre de couleur": "The color bar", "Touche le titre": "Tap the headline",
  ", pas un article : un même évènement, raconté par plusieurs médias. Prisme regroupe leurs articles.": ", not an article: one event, told by several outlets. Prisme groups their articles.",
  " : six médias différents ont publié un article sur cette histoire. Leurs noms sont écrits en dessous (« Couvert par… ») ; touche un nom pour voir ce média.": ": six different outlets published an article on this story. Their names are written below (“Covered by…”); tap a name to see that outlet.",
  "montre d'où viennent ces médias :": "shows where those outlets come from:", "gauche": "left", "centre": "center", "droite": "right",
  "pour comparer : chaque article, média par média, les mots de chaque côté et qui possède ces médias.": "to compare: every article, outlet by outlet, each side's words and who owns those outlets.",
  "qui correspondent à": "matching", "Ses histoires du moment": "Its current stories", "celles que d'autres médias couvrent aussi": "the ones other outlets cover too",
  "Ses derniers articles": "Its latest articles", "Fiche complète (propriétaire, groupe)": "Full profile (owner, group)", "Voir sa fiche": "See its profile",
  "Ce média n'a rien publié dans les dernières 48 heures.": "This outlet published nothing in the last 48 hours.", "Propriété :": "Owned by:",
  "La recherche élargie": "Search",
  // Favoris, partage, page média, recherche avancée
  "Favoris": "Saved", "Mes favoris": "My saved items", "Enregistrer": "Save", "Enregistré": "Saved", "Partager": "Share",
  "Enregistrer dans mes favoris": "Save to my list", "Retirer des favoris": "Remove from saved",
  "Enregistré dans tes favoris ★": "Saved ★", "Retiré de tes favoris": "Removed from saved", "Lien copié : tu peux le coller où tu veux.": "Link copied: paste it anywhere.",
  "Les histoires et articles enregistrés, et les médias que tu suis.": "Saved stories and articles, and the outlets you follow.",
  "Favoris · gardés sur cet appareil seulement": "Saved · kept on this device only",
  "Touche ★ sur une histoire ou un article pour l'enregistrer ici, et « Suivre ce média » sur la page d'un média pour voir ses derniers articles.": "Tap ★ on a story or article to save it here, and “Follow this outlet” on an outlet's page to see its latest articles.",
  "Tout": "All", "Mes médias": "My outlets", "Chercher dans mes favoris…": "Search my saved items…", "Aucun favori pour l'instant.": "Nothing saved yet.", "Aucun favori ne correspond.": "No saved item matches.",
  "Touche l'étoile ★ à côté d'une histoire ou d'un article pour le retrouver ici, même après qu'il soit sorti du fil.": "Tap the ★ next to a story or article to find it here, even after it leaves the feed.",
  "Essaie un autre mot.": "Try another word.", "Tu ne suis aucun média pour l'instant.": "You don't follow any outlet yet.",
  "Cherche un média (par exemple « TVA » ou « Le Devoir »), ouvre sa page et touche « Suivre ce média ».": "Search an outlet (for example “CBC” or “Le Devoir”), open its page and tap “Follow this outlet”.",
  "Le fil de mes médias": "My outlets' feed", "leurs derniers articles": "their latest articles", "Voir ses articles →": "See its articles →",
  "Rien de neuf de ces médias dans les dernières 48 heures.": "Nothing new from these outlets in the last 48 hours.",
  "Une histoire enregistrée reste ici, mais sa page n'est disponible que tant qu'elle est dans l'édition (environ 48 heures).": "A saved story stays here, but its page is only available while it's in the edition (about 48 hours).",
  "★ Suivre ce média": "★ Follow this outlet", "Fiche complète": "Full profile", "Voir et fouiller ses articles →": "See and search its articles →",
  "par jour en moyenne": "per day on average", "dans une histoire couverte par d'autres": "in a story others also cover", "rubrique principale": "main section",
  "articles en 7 jours": "articles in 7 days", "articles en 48 h": "articles in 48 h", "Ses sujets": "Its topics",
  "Dans les grandes histoires": "In the big stories", "ses articles que d'autres médias couvrent aussi": "its articles other outlets also cover",
  "Chercher dans ses articles…": "Search its articles…", "Toutes les rubriques": "All sections", "Toutes les langues": "All languages",
  "Dans une histoire": "In a story", "Plus récents": "Newest", "Plus anciens": "Oldest", "Aujourd'hui": "Today", "Hier": "Yesterday",
  "Aucun article avec ces filtres.": "No article with these filters.", "Essaie un autre mot, ou élargis la période.": "Try another word, or widen the period.",
  "Tout effacer": "Clear all", "Sans date": "No date", "Ce média n'a rien publié dans les derniers jours.": "This outlet published nothing in recent days.",
  "Prisme cherche aussi :": "Prisme also searches:", "Astuces de recherche": "Search tips", "Chercher dans tous les articles": "Search all articles",
  "Période": "Period", "Côté": "Side", "Rubrique": "Section", "Tous les côtés": "All sides", "Toutes": "All", "Français": "French", "Anglais": "English", "Autres": "Others",
  "7 jours": "7 days", "maintenant": "now", "Chercher dans mes lectures…": "Search my reads…", "Aucune lecture ne correspond.": "No read matches.",
  "Prisme fouille chaque article publié par les médias de cette édition, même ceux qui ne font pas partie d'une histoire. Aucun tri : du plus récent au plus ancien.": "Prisme searches every article published by this edition's outlets, even those not part of a story. No sorting: newest first.",
  "Aucun article avec ces filtres. Essaie « 7 jours » ou « Tous les côtés ».": "No article with these filters. Try “7 days” or “All sides”.",
  "Liste": "List", "Cartes": "Cards",
  "Rien dans les dernières 48 heures.": "Nothing in the last 48 hours.", "Articles": "Articles", "Comparer": "Compare", "Médias": "Outlets",
  "Recherche dans des centaines de médias…": "Searching hundreds of outlets…",
  "Ici, Prisme cherche le sujet dans tous les médias qu'il lit, puis dans GDELT, qui surveille la presse du monde entier. Les résultats sont simplement classés du plus récent au plus ancien.": "Here Prisme searches every outlet it reads, then GDELT, which monitors the world's press. Results are simply sorted newest first.",
  // Vidéos
  "Toutes": "All", "Sans les Shorts": "No Shorts", "Chargement des chaînes…": "Loading channels…", "Recherche de vidéos…": "Searching videos…",
  "Les dernières vidéos des chaînes YouTube des médias, lues directement : pas d'algorithme YouTube, pas de recommandations. Chaque vidéo porte l'orientation de son média.": "The latest videos from news outlets' YouTube channels, read directly: no YouTube algorithm, no recommendations. Each video shows its outlet's leaning.",
  "Aucune vidéo de ce côté pour cette édition.": "No video from this side for this edition.",
  // Le matin
  "Bonjour.": "Good morning.", "Bon après-midi.": "Good afternoon.", "Bonsoir.": "Good evening.",
  "Cinq histoires pour comprendre la journée, chacune vue de gauche, du centre et de droite. Environ trois minutes.": "Five stories to understand the day, each seen from the left, center and right. About three minutes.",
  "On prépare ton édition…": "Preparing your edition…", "L'angle mort du jour": "Today's blindspot", "Ce que ta bulle rate": "What your bubble misses",
  "D'après Mon prisme, tu lis peu l'autre côté. Voici ce qu'il couvre.": "According to My prism, you rarely read the other side. Here's what it covers.",
  "La question du jour": "Question of the day", "Un titre, trois choix : gauche, centre ou droite ? Entraîne ton œil à repérer le cadrage.": "One headline, three choices: left, center or right? Train your eye to spot framing.",
  "Jouer à Devine le média": "Play Guess the outlet",
  // Quiz
  "Un vrai titre publié aujourd'hui. Gauche, centre ou droite ? Le média est révélé après ta réponse.": "A real headline published today. Left, center or right? The outlet is revealed after you answer.",
  "On choisit des titres…": "Picking headlines…", "Bien vu.": "Nice.", "Raté.": "Missed.", "C'est": "It's", "Titre suivant": "Next headline", "Voir mon score": "See my score",
  "Résultat": "Result", "Rejouer avec d'autres titres": "Play again with other headlines",
  "Bel œil : tu repères bien le cadrage.": "Sharp eye: you spot framing well.", "Pas mal. Le centre est souvent le plus difficile à deviner.": "Not bad. The center is often the hardest to guess.",
  "Pas facile ! Beaucoup de titres se ressemblent d'un camp à l'autre, et c'est une bonne nouvelle.": "Not easy! Many headlines look alike across camps, and that's good news.",
  // Mon prisme
  "Ton angle mort": "Your blindspot", "7 jours": "7 days", "30 jours": "30 days", "Tout": "All",
  "Chaque article que tu ouvres depuis Prisme est noté ici, avec l'orientation et le propriétaire de son média. Rien n'est envoyé ailleurs : tout reste dans ce navigateur.": "Every article you open from Prisme is logged here, with its outlet's leaning and owner. Nothing is sent anywhere: it all stays in this browser.",
  "Ton portrait se construit en lisant.": "Your profile builds as you read.", "Aller au fil": "Go to the feed",
  "Tu lis surtout des médias de gauche.": "You mostly read left-leaning outlets.", "Tu lis surtout des médias de droite.": "You mostly read right-leaning outlets.",
  "Tes lectures sont plutôt équilibrées.": "Your reading is fairly balanced.", "Toi": "You", "La une du jour": "Today's front page",
  "Ce que tu lis": "What you read", "une lecture = un article ouvert": "one read = one article opened", "PAS D'ANGLE MORT MARQUÉ.": "NO CLEAR BLINDSPOT.",
  "À qui appartient ce que tu lis": "Who owns what you read", "Tes médias": "Your outlets", "Historique": "History", "Tout effacer": "Clear all",
  "Oublier cette lecture": "Forget this read", "Rien de neuf de ce côté pour l'instant.": "Nothing new from that side for now.",
  // Qui possède quoi
  "La carte": "The map", "La liste": "The list", "Tous": "All", "Royaume-Uni ": "United Kingdom",
  "Les médias que Prisme connaît, regroupés par propriétaire. Quand une famille contrôle plusieurs entreprises, elles sont réunies. Touche un média pour sa fiche complète.": "The outlets Prisme knows, grouped by owner. When a family controls several companies, they're combined. Tap an outlet for its full profile.",
  "Les groupes qui possèdent plusieurs médias": "Groups that own several outlets", "← Tous les propriétaires": "← All owners", "Propriétaire": "Owner",
  "Propriétaire unique": "Single owner", "Pays": "Country", "par pays": "by country",
  // Fiche média
  "Orientation": "Leaning", "Qui le possède": "Who owns it", "Média": "Outlet", "Propriétaire (Prisme)": "Owner (Prisme)",
  "Propriétaire selon Wikidata": "Owner according to Wikidata", "Contrôlé ultimement par": "Ultimately controlled by", "Fiche": "Profile",
  "Type": "Type", "Fondé en": "Founded", "Orientation (Wikidata)": "Leaning (Wikidata)", "Idéologie (Wikidata)": "Ideology (Wikidata)",
  "Même propriétaire": "Same owner", "Le même groupe possède aussi": "The same group also owns", "Recherche du propriétaire…": "Looking up the owner…",
  "Service public": "Public broadcaster", "Contrôlé par un État": "State-controlled", "Privé": "Private", "Sans but lucratif": "Non-profit",
  "Coopérative": "Co-op", "Agence de presse": "News agency", "Indépendant": "Independent",
  "La ligne éditoriale suit celle du gouvernement. Le spectre gauche/droite ne s'applique pas.": "The editorial line follows the government's. The left/right spectrum doesn't apply.",
  // Plus / installation
  "Les médias regroupés par propriétaire, et la toile des familles.": "Outlets grouped by owner, and the map of families.",
  "Un titre : gauche, centre ou droite ?": "One headline: left, center or right?", "Les sources, les lentilles et les limites.": "Sources, lenses and limits.",
  "Installer Prisme sur l'écran d'accueil": "Install Prisme on your home screen", "Une icône comme une vraie app, en plein écran.": "An icon like a real app, full screen.",
  "Langue": "Language", "Signaler une erreur ↗": "Report an error ↗", "Code source (libre, MIT)": "Source code (free, MIT)",
  "Prisme lit directement les flux publics de ses médias et choisit ses histoires avec des règles visibles. Orientations indicatives, propriété selon la base Prisme et Wikidata.": "Prisme reads its outlets' public feeds directly and picks stories with visible rules. Indicative leanings, ownership from Prisme's database and Wikidata.",
  "L'orientation est une estimation indicative inspirée des évaluations publiques (AllSides, Media Bias/Fact Check, Ad Fontes). La propriété vient de la base Prisme et de Wikidata, une source collaborative qui peut être incomplète ou en retard.": "The leaning is an indicative estimate inspired by public ratings (AllSides, Media Bias/Fact Check, Ad Fontes). Ownership comes from Prisme's database and Wikidata, a collaborative source that may be incomplete or out of date.",
};

// Textes avec un nombre ou un nom à l'intérieur.
const PATTERNS = [
  [/^(\d+) médias?$/, (m, n) => `${n} outlet${s(n)}`],
  [/^(\d+) articles?$/, (m, n) => `${n} article${s(n)}`],
  [/^(\d+) histoires?$/, (m, n) => `${n} stor${n > 1 ? "ies" : "y"}`],
  [/^(\d+) lectures?$/, (m, n) => `${n} read${s(n)}`],
  [/^(\d+) vidéos?$/, (m, n) => `${n} video${s(n)}`],
  [/^(\d+) articles? lus?$/, (m, n) => `${n} article${s(n)} read`],
  [/^(\d+) médias? lus? directement par Prisme dans cette édition\.$/, (m, n) => `${n} outlet${s(n)} read directly by Prisme in this edition.`],
  [/^(\d+) (?:autres? médias?) non évalués\. (\d+) médias? lus? directement par Prisme dans cette édition\.$/, (m, a, b) => `${a} other outlets not rated. ${b} outlets read directly by Prisme in this edition.`],
  [/^(\d+) autres? médias?$/, (m, n) => `${n} other outlet${s(n)}`],
  [/^médias évalués$/, () => "rated outlets"],
  [/^(\d+) médias? actifs? silencieux$/, (m, n) => `${n} active outlet${s(n)} silent`],
  [/^(\d+) médias? dans le monde$/, (m, n) => `${n} outlet${s(n)} worldwide`],
  [/^Résumé : (.+)$/, (m, x) => `Summary: ${x}`],
  [/^Aucun média de (gauche|centre|droite) lu par Prisme n'a couvert cette histoire\.$/, (m, x) => `No ${{ gauche: "left-leaning", centre: "centrist", droite: "right-leaning" }[x]} outlet read by Prisme covered this story.`],
  [/^Aucun média de (gauche|centre|droite) lu par Prisme n'en parle\.$/, (m, x) => `No ${{ gauche: "left-leaning", centre: "centrist", droite: "right-leaning" }[x]} outlet read by Prisme covers it.`],
  [/^Aucun média de (gauche|centre|droite) n'en parle\.$/, (m, x) => `No ${{ gauche: "left-leaning", centre: "centrist", droite: "right-leaning" }[x]} outlet covers it.`],
  [/^Aucun média de (gauche|centre|droite) dans ces résultats\.$/, (m, x) => `No ${{ gauche: "left-leaning", centre: "centrist", droite: "right-leaning" }[x]} outlet in these results.`],
  [/^Titre (\d+) sur (\d+)$/, (m, a, b) => `Headline ${a} of ${b}`],
  [/^(\d+) bonnes? réponses?$/, (m, n) => `${n} correct`],
  [/^(\d+) sur (\d+)$/, (m, a, b) => `${a} out of ${b}`],
  [/^Rien dans « (.+) » pour l'instant\.$/, (m, x) => `Nothing in “${tr(x)}” for now.`],
  [/^Avant : (.*)$/, (m, x) => `Before: ${x}`],
  [/^Maintenant : (.*)$/, (m, x) => `Now: ${x}`],
  [/^Titre modifié · avant :$/, () => "Headline changed · before:"],
  [/^Via (.+)$/, (m, x) => `Via ${x}`],
  [/^Et (\d+) médias à propriétaire unique$/, (m, n) => `And ${n} single-owner outlets`],
  [/^Les autres \((\d+)\)$/, (m, n) => `Others (${n})`],
  [/^Pour sortir de ta bulle : ce que la (gauche|droite) couvre$/, (m, x) => `To leave your bubble: what the ${x === "gauche" ? "left" : "right"} covers`],
  [/^Pour élargir : les angles morts du moment$/, () => "To widen: today's blindspots"],
  [/^Ton angle mort : la (gauche|droite)\.?$/, (m, x) => `Your blindspot: the ${x === "gauche" ? "left" : "right"}.`],
  [/^Tu penches à (gauche|droite|centre)\.$/, (m, x) => `You lean ${{ gauche: "left", droite: "right", centre: "center" }[x]}.`],
  [/^(\d+) jours?$/, (m, n) => `${n} day${s(n)}`],
  [/^et (\d+) autres?$/, (m, n) => `and ${n} other${s(n)}`],
  [/^Dans une histoire · (\d+) médias?$/, (m, n) => `In a story · ${n} outlet${s(n)}`],
  [/^Voir (\d+) articles de plus$/, (m, n) => `See ${n} more articles`],
  [/^(?:Histoire|Article) · .*enregistrée? le (.+)$/, (m) => m.replace(/enregistrée? le/, "saved").replace(/^Histoire/, "Story").replace(/médias?/, "outlets")],
  [/^sur (\d+)$/, (m, n) => `of ${n}`],
  [/^Tu suis (.+) : ses articles apparaissent dans « Favoris »\.$/, (m, x) => `You follow ${x}: its articles appear in “Saved”.`],
  [/^Tu ne suis plus (.+)\.$/, (m, x) => `You no longer follow ${x}.`],
  [/^(\d+) articles? en 48 h$/, (m, n) => `${n} article${s(n)} in 48 h`],
  [/^Aucune histoire de Prisme ne correspond à « (.+) »\. Voici ce qu'on trouve dans tous les articles lus par Prisme\.$/, (m, x) => `No Prisme story matches “${x}”. Here's what turns up in every article Prisme reads.`],
  [/^Chercher « (.+) » dans tous les articles \(48 h\)$/, (m, x) => `Search “${x}” in all articles (48 h)`],
  [/^Média · (.+)$/, (m, x) => `Outlet · ${tr(x)}`],
];

export function tr(text) {
  if (LANG !== "en" || !text) return text;
  const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
  const core = text.trim();
  if (!core) return text;
  if (EXACT[core]) return lead + EXACT[core] + trail;
  for (const [re, fn] of PATTERNS) { const m = core.match(re); if (m) return lead + fn(...m) + trail; }
  // Morceaux séparés par « · » (ex. « Économie · 4 médias · des 3 côtés »), y compris en début ou en fin.
  if (core.includes("·")) {
    const out = core.split(/(\s*·\s*)/).map((p) => (/^\s*·\s*$/.test(p) || !p ? p : tr(p))).join("");
    if (out !== core) return lead + out + trail;
  }
  // Libellé suivi de « : » (ex. « Ailleurs et médias d'État : »)
  const colon = core.match(/^(.+?)\s*:$/);
  if (colon && EXACT[colon[1]]) return lead + EXACT[colon[1]] + ":" + trail;
  return text;
}

const ATTRS = ["placeholder", "title", "aria-label"];
function translateTree(root) {
  if (root.nodeType === 3) { const t = tr(root.data); if (t !== root.data) root.data = t; return; }
  if (root.nodeType !== 1 || root.closest?.("[data-no-tr]")) return;
  for (const a of ATTRS) if (root.hasAttribute?.(a)) { const v = root.getAttribute(a), t = tr(v); if (t !== v) root.setAttribute(a, t); }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === 3) { if (n.parentElement?.closest("[data-no-tr], script, style")) continue; const t = tr(n.data); if (t !== n.data) n.data = t; }
    else for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), t = tr(v); if (t !== v) n.setAttribute(a, t); }
  }
}

// En anglais : traduit l'affichage existant, puis tout ce qui s'ajoute ensuite.
export function startTranslation() {
  document.documentElement.lang = LANG;
  if (LANG !== "en") return;
  document.title = tr(document.title);
  translateTree(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") translateTree(m.target);
      else for (const node of m.addedNodes) translateTree(node);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
