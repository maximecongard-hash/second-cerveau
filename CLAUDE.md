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

## Où en est le projet (8 novembre 2026)

- Version **0.36.0** (commitée), cache SW `sc-0.36.0`, schéma **25** (à recoller : widget Sport) ; schéma 24 = : statut agent (`agent_grants`, `row_role` étendu), accès total lecture/écriture du compte agent aux éléments du propriétaire, à activer par une requête dans le SQL Editor (commentaire en section 7 de `schema.sql`). Non appliqué tant que l'utilisateur n'a pas collé le schéma.
- **0.36.0** : mode démo supprimé (`?demo=1`, `seedDemo`, `DEMO` dans `config.js` et partout), car plus à jour. Non testé en connexion réelle : seulement la syntaxe et le chargement de la page de connexion.
- **0.35.0** : widget, constante `OPEN_SHORTCUT` (false par défaut) : à true, un toucher lance le raccourci « Ouvrir Brain » (action Ouvrir l'app) au lieu d'ouvrir Safari. À tester sur l'iPhone.
- **0.34.0** : page Récap d'activité (`#/recap`, menu Organisation > Récap d'activité, `views.recap` dans `gtd/views.js`) : 7 derniers jours, tâches terminées par jour, temps chronométré, séances, projets les plus avancés, retards. Sans schéma. Testé en démo.
- **0.33.0** : widget Scriptable : séances de sport du jour et à venir (`widget_today` renvoie `kind in ('task','workout')` avec `sport`, schéma 25 à recoller ; affichées en vert, ♥), créneaux proches dessinés en colonnes au lieu de se recouvrir (`le` dans `layout`), le toucher ouvre Aujourd'hui et l'Inbox ouvre l'Inbox. **Non testé sur l'iPhone** : recoller `schema.sql`, recopier le code du widget (Réglages > iPhone et Calendrier > Widget). Une PWA iOS s'ouvre parfois dans Safari : limite d'iOS.
- **0.32.0** : Agenda, panneau de tâches à placer groupé par Échéance, Projet ou Contexte (`S.ui.agGroup`, acte `ag-group`, `panel` dans `agenda/views.js`) ; page Projet : au-delà de 14 actions affichées, sections repliées au départ (`big` dans `frise.js`, `data-open` / `data-any` lus par `sec-toggle` et `sec-all`). Testé en démo.
- **0.31.0** : Courses, ajouter à la main un produit déjà dans la liste ouvre sa fiche au lieu de créer un doublon (`findOnList` dans `shop.js`, `sh-add` dans `index.js`). Non testé dans le navigateur (module Courses absent de la démo). Les recettes prévues à cocher existaient déjà (onglet Semaine).
- **0.30.0** : tâches répétées cachées des listes (Actions, sélecteur) tant que leur date est à plus de 7 jours (`hiddenRepeat` dans `model.js`, visibles dans l'Agenda et le projet) ; Agenda : boutons chrono et Terminer directement sur le créneau d'une tâche (`ag-acts`, `views.js`). Testé en démo.
- **0.29.0** : page Projet, bouton ⇄ sur chaque action ouverte (si le projet a des sections) : feuille « Déplacer vers » (`openMove` dans `sheets.js`, actes `move-open` / `move-to`, annulable). Trier l'Inbox : choix du Projet puis de la Section avant de classer (`clarPlace` dans `views.js`, `meta.sec` gardé par `clarify`, effacé si l'élément devient un projet). Testé en démo seulement.
- **0.28.0** : page Projet refaite, sans schéma. Sections et sous-sections dépliables (kind `section`, `meta.sup` = section parente ; l'action reste rattachée au projet, `meta.sec` = sa section), actions terminées masquées derrière un interrupteur (`S.ui.showDone`), compteurs et barres, Frise (kind `plog` : titre, recap dans `body`, `meta` = `{ types[], date, version }`, types `feature` vert / `code` bleu / `fix` rouge / `design` ambre, filtre par type). Code dans `js/modules/gtd/frise.js`. `scripts/brain-write.sh` écrit désormais actions, sections, entrées de frise et coche des actions d'un projet existant (`"project": "titre"`). À valider sur l'iPhone et sur les vraies données.
- **0.27.0** : l'Historique Sport n'est plus fait de séances mais d'objets figés `workout_log` (copie du contenu tel que fait + `meta.result`, sans `tpl` ni `parent_id`), créés à la fin d'une séance (`logWorkout`, id déterministe `logIdOf` : pas de doublon entre appareils), à l'import, ou par migration unique `migrateLogs` (afterSync) des anciennes séances `done`. La séance prévue reste en base (status done), masquée de la Semaine qui montre le log ; `onDay` et `doneList` lisent les logs. Éditeur d'un log : date, résultat, note ; contenu en lecture seule ; « Refaire cette séance » crée une séance prévue. Les logs ne sont plus dans la grille Agenda (non `schedulable`). Migration à valider sur les vraies données au premier lancement.
- **0.26.0** : import FIT en plus de TCX/GPX (`js/modules/sport/fit.js`, décodeur maison du message session, validé sur un vrai export COROS PACE Pro) ; sport exact, durée en mouvement, FC moyenne et max, kcal, D+ gardés dans `meta.result` (`max_hr`, `kcal`, `asc_m`) et affichés sous le titre de la carte. Raccourci **Importer séance** (feuille de partage de COROS) : dépose le fichier dans `captures/inbox/<clé>/`, la fonction `capture_activity` l'inscrit dans `activity_inbox` ; l'app lit, importe et supprime à l'ouverture (`pullActivityInbox` dans `import.js`). Schéma 23 (à recoller). **Non testé sur l'iPhone** : COROS doit proposer le raccourci dans sa feuille de partage.
- **0.25.0** : chrono corrigeable dans la fiche d'une tâche : champs Début (chrono en cours, `timer_start`) et Déjà cumulé en minutes (`timer_base`), traités dans `setField` (`sheets.js`) ; pas d'historique de sessions (idée A, journal façon Clockify, écartée pour l'instant). Version non commitée.
- **0.24.0** : Sport > Historique, bouton Importer : fichiers TCX/GPX exportés de l'app COROS, lus dans le navigateur (`js/modules/sport/import.js`, ni serveur ni schéma). Dédoublonnage par `meta.result.ext_id` (`file:<heure de départ>`), rapprochement avec la séance prévue du même jour et sport, `meta.result.source:'coros'`. **Strava abandonné** : API réservée aux abonnés ; le code serveur (route `strava`, table `strava_link`, schéma 23) est parqué dans `git stash` (« strava 0.24 parqué »). FIT lu depuis la 0.26.0.
- **0.23.0** : Sport > Historique refait : barres en HTML (plus de SVG étiré), séances en cartes à 3 chiffres (distance/durée/FC ou durée/tonnage/RPE, résultat réel), filtre remis à zéro si vide. Import COROS prévu via Strava (étape suivante, route `strava` de `brain`).
- **0.22.0** : chrono seulement sur les tâches placées dans l'Agenda (heure prévue) ou déjà chronométrées ; compteur de reports `meta.postponed` (incrémenté dans `patch` quand une date échue est repoussée), fond ocre dès 2 reports, rouge et titre gras dès 4 ; Actions : Grouper par Projet ou Date (`S.ui.group`).
- **0.21.0** : Courses, onglet Semaine (recettes envoyées depuis le panier, à cocher quand faites, pref `rcWeek`, reset le lundi), objectif 18 portions affiché à la sélection, au panier et dans l'onglet ; champ Prix (€/kg) sur les produits.
- **0.20.0** : Courses, un toucher coche un produit, appui long pour sa fiche, tri par rayon ou par magasin (schéma 21 : `widget_today` renvoie les jours à venir).
- **0.20.3** : Courses, même logique que la liste pour les recettes (toucher = panier, appui long ou ⋯ = fiche) et pour les lignes du panier (toucher = Déjà là / Acheter).
- **0.20.2** : Courses, magasin par produit (Inter, Lidl, Leclerc, `meta.store`, puces dans la fiche), tri Magasin = un bloc par magasin avec tous ses rayons ; plus de prix au kilo (inutile, retiré avant publication).
- **0.20.1** : widget Scriptable refait (créneau en cours, grille horaire, Top 3, jours à venir, calendrier des événements), schéma 22. Reste à valider sur l'iPhone.
- **Schéma** : recoller `supabase/schema.sql` dans le SQL Editor Supabase à chaque montée de schéma (22 pour le widget).
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
  - 0.19.3 : synchro, relecture complète au moins une fois par heure.
  - 0.20.0 : Courses, toucher coche, fiche par appui long, promos au kilo et magasin. 0.20.1 : widget refait.

## Pistes ouvertes

- **Fiabilité 0.19** : confirmée par l'utilisateur sur son installation réelle (4 novembre 2026). Tests de synchro sur un faux serveur local et SQL sur un Postgres WASM, hors dépôt : rien d'automatisé à relancer.
- **Courses, suite** : 0.20 partage du foyer avec la conjointe et validation du partage 0.11 en vrai ; 0.21 mode magasin. Ensuite : planning de repas dans l'Agenda, import par URL.
- **Widget Scriptable** (`widget/Brain.js`, fonction `widget_today`, README partie 5) : 0.20.1, créneau en cours ou suivant, Top 3, grille horaire du jour (tâches, faits estompés, événements des autres calendriers), jours à venir ; code copiable depuis Réglages > iPhone et Calendrier > Widget ; schéma 22 (`calendar` et `upcoming` dans `widget_today`, `schema.sql` à recoller). Non testé sur iPhone.
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

Ouvrir `http://localhost:5173/` : le mode démo a été supprimé (0.36.0). Tester avec le compte agent, jamais avec le mot de passe saisi par Claude : l'utilisateur se connecte lui-même dans le navigateur de la session ; les écritures de test sont marquées « TEST agent » et mises à la corbeille.
Pas de tests automatisés de l'interface : vérifier à la main en largeur mobile (~390 px), en mode sombre, et dans la console.

## Rappels qui reviennent souvent

- **Visuel : preview d'abord, aucun code avant validation.** Pour tout ce que l'utilisateur voit (widget, écran, composant, couleurs), proposer au moins deux maquettes différentes, attendre son choix, puis coder. Détail dans AGENTS.md, « Travail visuel ». Une seule preview seulement s'il demande un changement très précis.

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
