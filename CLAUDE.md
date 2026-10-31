# Brain (Second Cerveau) — récap projet

Point d'entrée de toute conversation sur ce projet. Lire ensuite **[AGENTS.md](AGENTS.md)** : stack,
architecture, règles de code, DA, sécurité et Git y sont détaillés et ne sont pas répétés ici.
Le [README.md](README.md) s'adresse à l'utilisateur final (installation Supabase, raccourcis iOS).

## Ce qu'on construit

« Brain » est le nom d'usage de l'app ; le dépôt et le code s'appellent **Second Cerveau**.
PWA personnelle, mono-utilisateur, installée en plein écran sur iPhone : un second cerveau organisé
en **modules** (thèmes) dans une barre latérale.

- **Organisation** (`gtd`) : le cœur actuel. Capture rapide (app, bouton Action, Siri, partage, photo),
  tri de l'Inbox, prochaines actions par contexte, projets, notes Markdown liées, Top 3 du jour, agenda,
  revue du soir et revue hebdo.
- **Sport** et **Courses** : coquilles en aperçu, désactivées par défaut. Contenu prévu en phase 2.

Stack : HTML + CSS + modules ES natifs, sans build ni npm. Données dans Supabase (table unique `items`,
RLS), hors ligne via localStorage + service worker.

## Où en est le projet (31 octobre 2026)

- Version **0.4.1**, cache SW `sc-v5`, branche `main` à jour avec `origin`.
- Dépôt : https://github.com/maximecongard-hash/second-cerveau
- Historique :
  1. Prototype GTD PWA + synchro Supabase.
  2. Pack 1 : Top 3 du jour, revue du soir, projets enrichis, nouveaux domaines (migration `002_pack1.sql`).
  3. Phase 1 (PR #1, fusionnée) : découpage en modules avec barre latérale.
  4. AGENTS.md pour les agents de code.
  5. 0.4.0 : DA « carnet » (papier, encre, surligneur ; Newsreader / Instrument Sans / IBM Plex Mono).
  6. 0.4.1 : correctif de mise à jour de l'app installée.

## Pistes ouvertes

- **Phase 2** : remplir les modules Sport et Courses.
- **Nouvelle icône** de l'app : explorée dans une conversation, non intégrée dans `icons/`.
- **Import Notion** : un script ponctuel (`build.py` → `import-notion.sql`) a généré l'import des tâches
  Notion ouvertes. Il contient des données personnelles et n'est volontairement pas dans le dépôt.

## Lancer

```bash
python3 -m http.server 5173
```

Ouvrir `http://localhost:5173/?demo=1` (données fictives). Ne jamais tester sur le compte réel.
Pas de tests automatisés : vérifier à la main en largeur mobile (~390 px), en mode sombre, et dans la console.

## Rappels qui reviennent souvent

- Chaque nouvelle version : `VERSION` dans `js/core/config.js` **et** `CACHE` dans `sw.js`.
- Chaque nouveau fichier JS : l'ajouter à `SHELL` dans `sw.js`.
- Changement de schéma : préparer le SQL, l'utilisateur le colle lui-même dans le SQL Editor Supabase.
- Interface en français, ton calme, pas de point d'exclamation.
- Committer et pousser seulement sur demande.

## Tenir ce fichier à jour

À la fin d'une conversation qui change l'état du projet (nouvelle version, module livré, piste close
ou ouverte), mettre à jour les sections « Où en est le projet » et « Pistes ouvertes ».
