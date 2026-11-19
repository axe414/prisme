# Contribuer à Prisme / Contributing

Merci ! Prisme s'améliore surtout grâce à de meilleures données sur les médias.
*Thanks! Prisme mostly improves through better data about news outlets.*

## Le plus utile / Most helpful

1. **Corriger une orientation ou un propriétaire** — ouvre une demande avec le formulaire « Corriger un média » et une source (AllSides, Media Bias/Fact Check, article, rapport annuel…).
   *Correct a leaning or owner — use the “Correct an outlet” form and include a source.*
2. **Ajouter un média** — le formulaire « Ajouter un média » : nom, site, flux RSS si tu le connais, pays, propriétaire.
   *Add an outlet — the “Add an outlet” form: name, website, RSS feed if known, country, owner.*
3. **Signaler un problème** — un regroupement d'histoires raté, un affichage cassé, une traduction manquante.
   *Report a problem — a wrong story grouping, a broken layout, a missing translation.*

## Où sont les choses / Where things live

| Fichier | Rôle |
|---|---|
| `lib/media-db.mjs` | Les médias connus : orientation (−2 gauche … +2 droite, `null` = média d'État), pays, type, propriétaire |
| `lib/sources.mjs` | Les flux RSS des médias de base, et leurs chaînes YouTube |
| `data/sources-auto.json` | Les médias découverts automatiquement (`node tools/discover-sources.mjs`) |
| `lib/cluster.mjs` | Le regroupement des articles en histoires |
| `lib/edition.mjs` | Le classement (lentilles) et les éditions |
| `public/` | L'app (HTML, CSS, JavaScript sans dépendance) ; `public/i18n.js` pour l'anglais |

Pour une modification de code : `npm install`, `npm run dev`, vérifie sur http://localhost:8888, puis ouvre une *pull request* qui explique le changement.
*For code changes: run it locally, check it, then open a pull request explaining the change.*

## Principes / Principles

- **Transparence** : toute règle de classement doit pouvoir s'expliquer en une phrase dans « Comment Prisme choisit ».
- **Une voix par média** : pas de pondération cachée.
- **Sources vérifiables** pour toute orientation ou tout propriétaire.
- **Respect des médias** : titres, court extrait et lien vers l'article d'origine, jamais l'article complet.
