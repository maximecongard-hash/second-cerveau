# Brain (Second Cerveau) — récap projet

Point d'entrée de toute conversation sur ce projet. Lire ensuite **[AGENTS.md](AGENTS.md)** : stack,
architecture, règles de code, DA, sécurité et Git y sont détaillés et ne sont pas répétés ici.
Le [README.md](README.md) s'adresse à l'utilisateur final (installation Supabase, raccourcis iOS).

## Ce qu'on construit

« Brain » est le nom d'usage de l'app ; le dépôt et le code s'appellent **Second Cerveau**.
PWA personnelle, mono-utilisateur, installée en plein écran sur iPhone : un second cerveau organisé
en **modules** (thèmes) dans une barre latérale.

- **Organisation** (`gtd`) : le cœur actuel. Capture rapide (app, bouton Action, Siri, partage, photo),
  tri de l'Inbox, prochaines actions par contexte, projets, Top 3 du jour, agenda, revue du soir et revue hebdo.
- **Agenda** (`agenda`) : grille horaire jour / semaine des tâches qui ont une heure, placement d'une tâche sur un créneau.
- **Notes** (`notes`) : notes Markdown, signets à lire / lus, épinglés, liés aux tâches et projets.
- **Sport** et **Courses** : coquilles en aperçu, désactivées par défaut. Contenu prévu en phase 2.

Stack : HTML + CSS + modules ES natifs, sans build ni npm. Données dans Supabase (table unique `items`,
RLS), hors ligne via localStorage + service worker.

## Où en est le projet (31 octobre 2026)

- Version **0.7.0**, cache SW `sc-v10`. Migrations 003 et 004 passées sur Supabase (31/10/2026). La 0.7 n'en demande aucune.
- Dépôt : https://github.com/maximecongard-hash/second-cerveau
- En ligne (GitHub Pages, branche `main`) : https://maximecongard-hash.github.io/second-cerveau/
- `.gitignore` : `.DS_Store`, fichiers de l'import Notion, sorties d'outils locaux.
- Historique :
  1. Prototype GTD PWA + synchro Supabase.
  2. Pack 1 : Top 3 du jour, revue du soir, projets enrichis, nouveaux domaines (migration `002_pack1.sql`).
  3. Phase 1 (PR #1, fusionnée) : découpage en modules avec barre latérale.
  4. AGENTS.md pour les agents de code.
  5. 0.4.0 : DA « carnet » (papier, encre, surligneur ; Newsreader / Instrument Sans / IBM Plex Mono).
  6. 0.4.1 : correctif de mise à jour de l'app installée.
  7. 0.4.2 : nouvelle icône (cerveau + réseau d'idées qui dessine une coche), en deux versions au choix
     dans Réglages > Icône : Encre (fond bleu-noir, par défaut) et Papier (fond crème).
  8. 0.4.3 : l'app s'affiche sous le nom « Brain » (logotype « Brain. » en Newsreader italique, point
     au surligneur) ; l'icône de la barre latérale et de la connexion suit le choix des Réglages.
  9. 0.5.0 : liens entre éléments de tous les modules (colonne `links`, `core/links.js`) : bloc « Liés » dans
     les éditeurs, feuille « Lier à… », section « Liés » sur la fiche projet, « + Action liée » depuis une note,
     `[[wikiliens]]` vers notes, projets et tâches, épingle des notes (colonne `pinned`).
  10. 0.6.0 : module Notes séparé (`js/modules/notes`) avec notes, signets (kind `bookmark`) et épinglés ;
     choix « Signet » au tri de l'Inbox ; bouton + routé par module (`fab`) ; migration 004 qui ouvre `kind`.
  11. 0.7.0 : module Agenda (`js/modules/agenda`) : grille jour, semaine (3 jours sur iPhone, 7 sur grand écran),
     blocs = `scheduled_time` + `duration_min`, chevauchements en colonnes, feuille « Placer à… » sur un créneau,
     heures affichées dans les Réglages, lien « Voir la grille » depuis Aujourd'hui.

## Pistes ouvertes

- **Feuille de route issue de l'étude du Notion** (31/10/2026) : 0.8 flux ICS vers Apple Calendar puis import des événements par Raccourci. À clarifier :
  agenda source iCloud ou Google (les Procédures IA du Notion parlent de Google Agenda).
- **Phase 2** : remplir les modules Sport et Courses.
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
- Raccourcis iOS : fichiers signés dans `raccourcis/`, refaits sur Mac par `python3 raccourcis/build.py`
  (jeton demandé à l'installation, jamais dans les fichiers). Images du README : `python3 docs/build_images.py docs`,
  à garder identiques aux raccourcis. Si `capture()`, l'URL ou la clé publique changent, refaire les deux.
- Committer et pousser seulement sur demande.

## Tenir ce fichier à jour

À la fin d'une conversation qui change l'état du projet (nouvelle version, module livré, piste close
ou ouverte), mettre à jour les sections « Où en est le projet » et « Pistes ouvertes ».
