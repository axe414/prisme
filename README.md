# Prisme

**L'actualité de partout, de la gauche à la droite, et qui possède les médias.**

Prisme lit directement les flux publics de près de 3 000 médias dans environ 70 pays, regroupe leurs articles en histoires et montre, pour chacune, quels médias la couvrent (gauche, centre, droite, médias d'État), qui les possède, qui se tait, et comment chaque camp la titre.

## Comment ça marche

- **Le robot** (`.github/workflows/edition.yml`) tourne toutes les 30 minutes sur GitHub Actions : il lit les médias (`lib/ingest.mjs`), regroupe les articles en histoires (`lib/cluster.mjs`), prépare les éditions (`lib/edition.mjs`) et publie le site sur GitHub Pages.
- **L'app** (`public/`) n'a besoin d'aucun serveur : elle lit les fichiers d'édition tout prêts (`data/*.json`).
- **Les sources** : environ 130 médias de base avec orientation et propriétaire connus (`lib/media-db.mjs`, `lib/sources.mjs`), et des milliers de médias découverts automatiquement (`data/sources-auto.json`, créé par `tools/discover-sources.mjs`).
- **Résumés neutres** : optionnels, avec une clé Gemini (secret `GEMINI_API_KEY` du dépôt).

## En local

```
npm install
npm run dev
```

Puis ouvrir http://localhost:8888 (ou double-cliquer sur `Lancer Prisme.cmd` sous Windows).

## Limites

Les orientations sont indicatives et résument un média entier, pas chaque article. Les médias découverts automatiquement sont « non évalués ». La propriété vient de la base de Prisme et de Wikidata, qui peut être incomplet ou en retard.
