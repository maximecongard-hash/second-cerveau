# Brain (Second Cerveau) — récap projet

Point d'entrée de toute conversation sur ce projet. Lire ensuite **[AGENTS.md](AGENTS.md)** : stack,
architecture, règles de code, DA, sécurité et Git y sont détaillés et ne sont pas répétés ici.
Le [README.md](README.md) s'adresse à l'utilisateur final (installation Supabase, raccourcis iOS).

## Ce qu'on construit

« Brain » est le nom d'usage de l'app ; le dépôt et le code s'appellent **Second Cerveau**.
PWA personnelle, mono-utilisateur, installée en plein écran sur iPhone : un second cerveau organisé
en **modules** dans une barre latérale.

- **Organisation** (`gtd`) : le cœur actuel. Capture rapide (app, bouton Action, Siri, partage, photo),
  tri de l'Inbox, prochaines actions par contexte, projets, Top 3 du jour, agenda, revue du soir et revue hebdo.
- **Agenda** (`agenda`) : grille horaire jour / semaine des tâches qui ont une heure, placement d'une tâche sur un créneau.
- **Notes** (`notes`) : notes Markdown, signets à lire / lus, épinglés, liés aux tâches et projets.
- **Sport** (`sport`, désactivé par défaut, à activer dans Réglages > Modules) : préparer des séances de course et de renfo, les caler dans
  l'Agenda, les faire en direct (chrono, minuteur de repos), historique et progression.
- **Courses** (`courses`, désactivé par défaut) : banque de recettes, panier de la semaine, liste de courses, foyer partageable.

Stack : HTML + CSS + modules ES natifs, sans build ni npm. Données dans Supabase (table unique `items`,
RLS), hors ligne via localStorage + service worker.

## Où en est le projet (4 novembre 2026)

- Version **0.19.3** (synchro : relecture complète au moins une fois par heure et sur « Synchroniser », pour retirer d'un appareil ce qu'un autre a supprimé pour de bon, et récupérer une ligne manquée), cache SW `sc-0.19.3`, schéma 20 (lecture des photos du raccourci corrigée : `inbox_key_is_mine`, fonction présente sur Supabase, correctif confirmé par l'utilisateur le 4 novembre 2026).
- La 0.19 est une remise à plat, sans nouveau module :
  - **Installation** : `supabase/schema.sql` est le seul fichier SQL (installe et met à jour, idempotent) ; une seule Edge Function `brain` (routes `ping`, `calendrier`, `reminders`, `add-user`, Verify JWT désactivé) ; premier compte = administrateur ; purge de la corbeille après 30 jours (`brain-purge`) ; `brain_status()` et `SCHEMA_VERSION`.
  - **Synchro** : démarrage immédiat sur le cache, connexion demandée seulement si la session est invalide ; envoi par champ (`S.dirty` = Map id → champs) ; ligne refusée isolée (`S.stuck`) ; préférences fusionnées clé par clé ; rien n'est échangé sans session ; service worker servi depuis le cache de la version.
  - **Réglages** : un groupe ouvert à la fois, `#/settings/<groupe>`, Corbeille, Installation, clés d'accès sans `prompt()` ; `sheetHead()` commun, Supprimer en bas des feuilles.
  - **Code** : `ITEM_DEFAULTS` dans `state.js`, `scripts/check.py`.
- **Passage à la 0.19 (4 novembre 2026)** : PR #6 fusionnée, 0.19.0 publiée, `schema.sql` collé sur Supabase, fonction `brain` déployée. Réglages > Installation et le reste confirmés par l'utilisateur, **sauf le Calendrier, pas encore traité** : la fonction `calendrier` n'existe plus sur Supabase, donc un ancien lien d'abonnement ne marche plus ; créer un nouveau lien dans Réglages > iPhone et Calendrier, puis retirer l'ancien abonnement dans Calendrier. `send-reminders` et `add-user` répondaient encore le 4 novembre : plus appelées par l'app, à supprimer sur Supabase.
- Dépôt : https://github.com/maximecongard-hash/second-cerveau
- En ligne (GitHub Pages, branche `main`) : https://maximecongard-hash.github.io/second-cerveau/
- `.gitignore` : `.DS_Store`, fichiers de l'import Notion, sorties d'outils locaux.
- Historique condensé :
  - 0.1 à 0.3 : prototype GTD + synchro, Top 3 et revue du soir, découpage en modules.
  - 0.4 : DA « carnet », nom « Brain », icônes Encre et Papier.
  - 0.5 à 0.7 : liens entre éléments, module Notes, module Agenda.
  - 0.8 à 0.10 : Calendrier Apple (ICS + raccourci), notifications Web Push faites main (vecteur RFC 8291), glisser-déposer sur grand écran.
  - 0.11 à 0.14 : comptes et partage (`shares`, `row_role`), chrono, fin de créneau, fiche repliable, historique par projet.
  - 0.15 et 0.16 : module Sport, contenu par type de séance, Projets en cartes.
  - 0.17 et 0.18 : module Courses (recettes, liste, foyer, clés d'accès nommées), panier.
  - 0.19 : remise à plat (voir ci-dessus).
  - 0.19.1 : lecture des photos du raccourci par une fonction security definer.
  - 0.19.2 : Courses, rayons imposés par produit dans Réglages > Courses > Rayons (pref `rcAisles`, prioritaires sur `guessAisle`), champ Rayon retiré de la fiche produit.

## Pistes ouvertes

- **Fiabilité 0.19** : confirmée par l'utilisateur sur son installation réelle (4 novembre 2026). Tests de synchro sur un faux serveur local et SQL sur un Postgres WASM, hors dépôt : rien d'automatisé à relancer.
- **Courses, suite** : 0.20 partage du foyer avec la conjointe et validation du partage 0.11 en vrai ; 0.21 mode magasin. Ensuite : planning de repas dans l'Agenda, import par URL.
- **Widget Scriptable** (`widget/Brain.js`, fonction `widget_today`, README partie 5) : non testé sur iPhone.
- **Sport, partie 2** : suivi des séances faites via COROS vers Strava (route `strava` de la fonction `brain`, OAuth une fois, webhook), rapprochement avec la séance prévue (`meta.result.source` / `ext_id` déjà prévus). **Partie 3** : envoi des séances vers la montre (export texte aujourd'hui ; FIT ou API non officielle à étudier).
- **Sport à valider en vrai** : rien testé sur iPhone (écran allumé, son du minuteur).
- **Calendrier à refaire et à valider sur l'iPhone** : nouveau lien d'abonnement à créer (voir plus haut), raccourci « Agenda Apple » (identifiants d'actions non testés sur l'appareil).
- **Partage à valider en vrai** : testé en mode démo seulement. Pistes : assigner une tâche partagée, notification à l'invité, planifier un élément reçu.
- **Risques connus** (README partie 10) : clé dans le chemin des photos, photos non visibles par l'invité, double répétition hors ligne, photos orphelines après purge.
- **Import Notion** : un script ponctuel (`build.py` → `import-notion.sql`) a généré l'import des tâches
  Notion ouvertes. Il contient des données personnelles et n'est volontairement pas dans le dépôt.

## Lancer

```bash
python3 -m http.server 5173
```

Ouvrir `http://localhost:5173/?demo=1` (données fictives). Ne jamais tester sur le compte réel.
Pas de tests automatisés de l'interface : vérifier à la main en largeur mobile (~390 px), en mode sombre, et dans la console.

## Rappels qui reviennent souvent

- Chaque nouvelle version : `VERSION` dans `js/core/config.js` **et** `CACHE` dans `sw.js`. L'app se sert depuis le cache : sans nouvelle version, personne ne reçoit les changements.
- Chaque nouveau fichier JS : l'ajouter à `SHELL` dans `sw.js`. `python3 scripts/check.py` vérifie tout ça.
- Changement de schéma : modifier `supabase/schema.sql` (seul fichier SQL) et `SCHEMA_VERSION` ; l'utilisateur le recolle lui-même dans le SQL Editor Supabase.
- Edge Function : l'adresse se fixe à la création et distingue les majuscules. Renommer dans Details ne change que le nom affiché : `Brain` répond 404 sur `/brain`, il faut supprimer et recréer.
- Interface en français, ton calme, pas de point d'exclamation.
- Raccourcis iOS : fichiers signés dans `raccourcis/`, refaits sur Mac par `python3 raccourcis/build.py`
  (clé d'accès demandée à l'installation, jamais dans les fichiers). Si `capture()`, l'URL ou la clé publique changent, refaire les raccourcis.
- **Compte agent** : l'agent peut lire et écrire dans Brain avec son propre compte (identifiants dans `.env.local`, jamais affichés). Lire : `scripts/brain-read.sh` (JSON des éléments partagés avec lui). Ajouter des recettes : `scripts/brain-write.sh [--dry] fichier.json`, toujours un `--dry` d'abord. Détail dans AGENTS.md, « Accès de l'agent aux données ».
- Committer et pousser seulement sur demande.

## Tenir ce fichier à jour

À la fin d'une conversation qui change l'état du projet (nouvelle version, module livré, piste close
ou ouverte), mettre à jour les sections « Où en est le projet » et « Pistes ouvertes ».
