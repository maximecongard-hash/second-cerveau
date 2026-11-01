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

- Version **0.13.0**, cache SW `sc-v21`. La 0.13 demande `009_fin_creneau.sql` **et** le redéploiement de `send-reminders`. La 0.12 demande `008_chrono.sql` (à coller par l'utilisateur). La 0.11 demande `007_partage.sql` **et** le déploiement de la fonction `add-user` (JWT activé), à faire par l'utilisateur. Migrations 003 et 004 passées sur Supabase (31/10/2026). La 0.8 demande
  `005_calendrier.sql` et le déploiement de l'Edge Function `calendrier` (à faire par l'utilisateur).
  La 0.9 demande `006_notifications.sql` **et** le déploiement de la fonction `send-reminders` (README, partie 7).
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
  12. 0.8.0 : Calendrier Apple (iCloud), lecture seule dans les deux sens. Brain vers Calendrier : flux ICS servi par
     l'Edge Function `supabase/functions/calendrier` (jeton dans `calendar_tokens`, fonction `calendar_feed`).
     Calendrier vers Brain : raccourci « Agenda Apple » qui envoie les prochains événements à `sync_events`
     (jeton de capture), table `events`, blocs gris dans la grille (`js/modules/agenda/apple.js`).
  13. Raccourcis iOS prêts à installer (`raccourcis/`, signés par `build.py`), Capturer demande un titre pour un lien,
     vibration au lieu des notifications.
  14. 0.9.0 : notifications de Brain (Web Push) à la place du raccourci « Rappel GTD » : champ `remind_at` dans
     les tâches, `js/core/push.js` (abonnement, Réglages > Notifications), push dans `sw.js`, fonction
     `supabase/functions/send-reminders` (Web Push fait main en WebCrypto, testé sur le vecteur RFC 8291) appelée
     chaque minute par pg_cron ; clés VAPID créées par la fonction et rangées dans `push_config` (pas de RLS ouverte).
  15. 0.9.1 : Réglages en groupes repliables (Compte, Notifications, Modules, un groupe par module actif, Capture,
     Icône, Données) ; la liste des modules vit dans les Réglages, plus de lien « Modules » dans la barre latérale.
     Sélecteurs date / heure de l'éditeur : l'éditeur se redessine à leur fermeture (sinon iOS les refermait).
  16. 0.9.2 : répétitions « le 25 de chaque mois » (`monthday:25`) et « 1er samedi du mois » (`nth:1:6`), proposées dans
     « Répéter » d'après la date de la tâche ; une tâche terminée en retard saute au prochain créneau futur (`nextFuture`).
  17. 0.10.0 : Agenda sur tablette et ordinateur (≥ 700 px) : panneau « Tâches à placer » à côté de la grille, glisser-déposer aux
     pointeurs (`js/modules/agenda/dnd.js`, appui long au doigt), poignée en bas d'un créneau pour changer la durée
     (pas de 15 min), dépôt sur le panneau pour retirer l'heure. Semaine : 7 jours si la place le permet, sinon 5.
  18. 0.11.0 : plusieurs comptes et partage. Table `profiles` (le plus ancien compte = administrateur), Edge Function `add-user`
     (Réglages > Utilisateurs : email + mot de passe provisoire), tables `shares` + `share_item()`, RLS `row_role()`, droits
     modifier / lecture seule, section « Partagés avec moi » dans Projets, `core/share.js` et `core/users.js`.

  19. 0.12.0 : chronomètre sur les tâches (éditeur > Chrono, un seul chrono à la fois, arrêté à la fin de la tâche), temps réel
     affiché dans les listes, comparaison réel / prévu dans la revue hebdo. Colonnes `spent_sec` et `timer_started_at`.
     0.11.2 : le vrai message d'erreur de `add-user` s'affiche. Accès agent : compte dédié + partage lecture seule,
     lu par `scripts/brain-read.sh` (identifiants dans `.env.local`, ignoré par git).
  20. 0.13.0 : bouton lecture / pause du chrono sur les lignes de tâches, logo de la barre latérale gardé d'un rendu à l'autre
     (fin du clignotement), notification de fin de créneau (colonne `end_at` calculée par l'app, envoyée par `send-reminders`,
     réglage dans Réglages > Organisation).

## Pistes ouvertes

- **Calendrier 0.8 à valider sur l'iPhone** : raccourci « Agenda Apple » (identifiants d'actions non testés sur
  l'appareil) et abonnement ICS une fois l'Edge Function déployée.
- **Partage 0.11 à valider en vrai** : migration 007 + fonction `add-user` non testées sur Supabase (testé en mode démo seulement). Pistes : assigner une tâche partagée, notification à l'invité, planifier un élément reçu.
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
  (jeton demandé à l'installation, jamais dans les fichiers). Le raccourci « Rappel GTD » n'existe plus (remplacé par les notifications). Si `capture()`, l'URL ou la clé publique changent, refaire les raccourcis.
- Committer et pousser seulement sur demande.

## Tenir ce fichier à jour

À la fin d'une conversation qui change l'état du projet (nouvelle version, module livré, piste close
ou ouverte), mettre à jour les sections « Où en est le projet » et « Pistes ouvertes ».
