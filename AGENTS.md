# AGENTS.md — Second Cerveau

Instructions pour les agents de code (Claude Code, Codex, Cursor…) qui travaillent sur ce dépôt.
Le README s'adresse à l'utilisateur final ; ce fichier s'adresse à l'agent.

## Le projet en bref

PWA personnelle de type « second cerveau », pensée d'abord pour l'iPhone installé en plein écran.
L'app est organisée en **modules** affichés dans une barre latérale :

- **Organisation** (`gtd`) : capture rapide (app, raccourcis iOS, partage), tri de l'Inbox, prochaines actions
  par contexte, projets, planification de la journée (Top 3, agenda), revues du soir et hebdo.
- **Agenda** (`agenda`) : grille horaire jour / semaine. Ne possède aucun kind : il lit tous les éléments datés
  avec une heure et place les tâches via `setField()` du cœur (routé vers le module propriétaire).
  `dnd.js` : glisser-déposer et redimensionnement des créneaux (pointer events, attributs `data-drag`, `.ag-rs`).
  `apple.js` : événements de Calendrier (table `events`, lecture seule, cache localStorage à part des éléments)
  et lien d'abonnement ICS (groupe Réglages > iPhone et Calendrier, hook `accessSettings`).
- **Notes** (`notes`) : notes Markdown, signets (`bookmark`, statut `active` = à lire, `done` = lu), épinglés.
  Reliés aux tâches et projets par les liens du cœur.
- **Sport** (`sport`, désactivé par défaut) : séances en blocs (course, vélo, natation, rando : presets et cibles propres à chaque sport) et en exercices
  (renfo, mobilité : séances types, bibliothèque par groupe, exercices chronométrés `time` en secondes), modèles, semaines types, mode direct (chrono, minuteur de repos), historique et progression.
  Kinds `workout` (séance), `workout_tpl` (modèle), `program` (semaine type). Le contenu vit dans la colonne `meta` (jsonb) :
  `{ sport, goal, blocks | exercises, result, tpl, manualDur }` (détail en tête de `js/modules/sport/model.js`). L'Agenda place
  les séances comme des tâches via les hooks `schedulable` et `createAt`. Fichiers : `model.js` (données, estimations, export texte),
  `editor.js`, `views.js`, `live.js`, `programs.js`, `stats.js`, `exercises.js`. Prévu ensuite : suivi COROS via Strava, envoi à la montre.
- **Courses** (`courses`, désactivé par défaut) : banque de recettes. Kind `recipe` : étapes dans `body`, tags dans `tags` (Rapide, Batch cooking en raccourcis), favori dans `pinned`, durée dans `duration_min`, `meta` = `{ servings, seasons, ingredients: [{ id, qty, unit, name }] }` (`seasons` vide = toute l'année, saison courante calculée par `seasonOf()`). Liste de courses : kind `shop_item` (nom dans `title`, `status` active / done, `meta` = `{ qty, unit, aisle, stage }`, rayon deviné par `guessAisle()`). Fichiers : `model.js` (saisons, `parseIngredient`, rayons), `views.js`, `editor.js`, `starters.js` (recettes de départ, utilisées par `seedDemo` seulement). Foyer : kind `foyer` (`foyer.js`), racine partageable dont dépendent recettes et produits (`parent_id`) ; un seul partage couvre tout. Panier (`panier.js`) : sélection `S.ui.rcSel`, page `#/panier` (parts, fusion par `productKey()`, tri « Déjà là / Acheter »), envoi via `addShop()` de `shop.js` (fusion des quantités, `meta.from` = recettes d'origine) ; le placard (`S.prefs.rcHave`, clés de produit) est pré-coché la fois suivante.
  Écriture par l'agent : `scripts/brain-write.sh [--dry] fichier.json` ajoute des recettes dans le foyer avec le compte agent (même `.env.local` que `brain-read.sh`) ; la base n'autorise que ce qui est partagé en « Peut modifier ».

Autres repères :

- Plusieurs comptes (0.11), inscriptions désactivées côté Supabase : l'administrateur (`profiles.is_admin`, le premier compte créé) ajoute les comptes via la fonction `brain`, route `add-user`. Chaque compte a ses données ; on se rejoint par le partage de projets / tâches / notes.
- Données synchronisées avec Supabase, l'app fonctionne hors ligne (localStorage + service worker).
- Interface et textes **en français**, tutoiement dans le README, ton calme et sans culpabilisation dans l'app.
- Version courante : `VERSION` dans `js/core/config.js`.

## Stack et contraintes

- **Aucun build, aucune dépendance npm.** HTML + CSS + modules ES natifs (`<script type="module">`), servis tels quels.
  Ne pas introduire de framework, bundler, TypeScript ou package.json sans demande explicite.
- Seule dépendance externe : `@supabase/supabase-js` en UMD, version épinglée (`2.49.4`) chargée depuis jsDelivr
  dans `index.html` **et** listée dans `SHELL` de `sw.js`. Si la version change, modifier les deux.
- Cible principale : Safari iOS (PWA standalone). Tester aussi Chrome desktop (barre latérale fixe sur grand écran).
  Prévoir `env(safe-area-inset-*)`.

## Lancer l'app

Les modules ES imposent un serveur HTTP (pas de `file://`). Depuis la racine du dépôt :

```bash
python3 -m http.server 5173
```

Puis ouvrir :

- `http://localhost:5173/?demo=1` : **mode démo**, données fictives en localStorage (`seedDemo()` de chaque module),
  sans Supabase. C'est le mode à utiliser pour tester l'interface. Ne jamais se connecter au compte réel pour tester.
- `http://localhost:5173/` : mode normal, demande une connexion Supabase.

Le service worker ne s'enregistre qu'en HTTPS : en local, pas de cache à vider.

Avant un commit : `python3 scripts/check.py` (`SHELL`, imports et noms exportés, syntaxe, version, numéro de schéma).
Il n'y a pas de tests automatisés de l'interface : vérifier à la main dans le navigateur (mode démo), en largeur
mobile (~390 px) et en mode sombre, puis regarder la console (une erreur d'import casse toute l'app).

## Fichiers

| Chemin | Rôle |
|---|---|
| `index.html` | coquille : `#app`, feuille modale `#sheet`, `#toast`, scripts |
| `styles.css` | styles et tokens de couleur (`:root` + `prefers-color-scheme: dark`) |
| `config.js` | URL et clé **publique** Supabase (`window.SC_CONFIG`) |
| `js/main.js` | point d'entrée : importe le cœur, puis les modules (ordre = ordre par défaut de la barre), puis `init()` |
| `js/core/` | cœur commun, voir ci-dessous |
| `js/modules/<id>/` | un dossier par module (`gtd`, `agenda`, `notes`, `sport`, `courses`) |
| `sw.js` | cache de la version : tous les fichiers de l'app viennent de là (jamais de mélange de versions), mise à jour d'un bloc à l'installation d'un nouveau `sw.js`. Liste `SHELL` de tous les fichiers |
| `manifest.webmanifest`, `manifest-papier.webmanifest`, `icons/` | installation sur l'écran d'accueil ; deux icônes au choix (Encre par défaut, Papier), sources SVG dans `icons/src/`, choix appliqué par `applyIcon()` de `util.js` |
| `supabase/schema.sql` | toute la base, idempotent : seul fichier SQL, à coller pour installer comme pour mettre à jour |
| `supabase/functions/brain/index.ts` | fonction unique, déployée à la main par l'utilisateur, « Verify JWT » désactivé. Routes `ping`, `calendrier?token=`, `reminders` (secret du cron, ou essai connecté), `add-user` (vérifie lui-même l'administrateur). URL et clés lues dans l'environnement |
| `scripts/check.py` | vérifications sans dépendance, à lancer avant un commit |

### Cœur (`js/core/`)

| Fichier | Rôle |
|---|---|
| `config.js` | `VERSION`, `SCHEMA_VERSION`, `CFG`, `DEMO`, client `sb` (délai de 30 s sur `/rest/v1/`), clé localStorage |
| `state.js` | état partagé `S`, `DEFAULT_PREFS`, `ITEM_DEFAULTS` (colonnes et valeurs par défaut, d'où découlent `FIELDS`, `newItem()`, `toRow()`), `TEXT_FIELDS` / `NULLABLE`. Module feuille : n'importe rien |
| `store.js` | persistance locale, `newItem()`, `saveItem()`, `patch()`, sélecteurs (`ofKind`…) |
| `sync.js` | synchronisation Supabase, pastille d'état, `checkInstall()` (`brain_status()`) |
| `modules.js` | registre : `registerModule()`, `VIEWS`, `ACTS`, `FORMS`, ordre et activation des modules |
| `ui.js` | routage, rendu, barre latérale, feuille modale (`SH`, `sheetHead()`, `openEditor`…), toast + undo |
| `views.js` | vues communes : recherche, réglages (un groupe ouvert à la fois, `S.ui.fold`, `#/settings/<groupe>`), connexion |
| `events.js` | écouteurs globaux et actions communes |
| `util.js` | dates, formats, `esc()`, `md()`, icônes `I`, petits gabarits (`sec`, `empty`) |
| `images.js` | redimensionnement, upload et URL signées des photos |
| `links.js` | liens entre éléments de tous les modules : bloc « Liés » des éditeurs, section de page, feuille « Lier à… », `[[wikiliens]]`, épingle |
| `share.js` | partage : feuille « Partager », `shareBlock()` (éditeur), `shareMeta()` (lignes), `sharedWithMe()`, quitter un partage ; simulé en mode démo |
| `users.js` | Réglages > Compte (prénom, mot de passe) et > Utilisateurs (ajout par l'administrateur) |
| `boot.js` | `init()` : restauration, mode démo ou session Supabase, premier rendu |

## Architecture

- **Modules** : chaque module appelle `registerModule({...})` dans son `index.js`. La liste complète des propriétés
  (`id`, `label`, `home`, `tabs`, `views`, `acts`, `forms`, `kinds`, `editor`, `prefs`, `ui`, `afterSync`, `seedDemo`…)
  est documentée en tête de `js/core/modules.js`. Modèle minimal : `js/modules/courses/index.js`. Hooks qui laissent un module alimenter
  les vues du cœur sans import croisé : `schedulable` (placement dans l'Agenda), `endNotify` (`end_at`), `createAt`, `todayRows`, `reviewStep`, `eveningHtml`, `notifSettings`, `accessSettings`
  (appelés par `fromModules()` / `isSchedulable()` / `notifiesEnd()` de `modules.js`).
- **Imports** : le cœur ne doit jamais importer un module. Les modules importent le cœur, jamais un autre module.
  `state.js` reste sans import pour éviter les cycles.
- **État global unique `S`** : `items` (Map id → item), `prefs`, `dirty` (Map id → champs à envoyer, `null` = ligne entière), `stuck` (lignes refusées par la base), `cursor` de synchro, `ui`.
  Un module ajoute ses préférences et son état d'affichage via `prefs` / `ui` dans `registerModule`, pas en modifiant `S` au chargement.
- **Une seule table `items`** pour tout : `kind` (`inbox | task | project | area` pour le GTD, `note | bookmark` pour Notes ;
  la base accepte tout type en minuscules, un nouveau module n'a pas besoin de migration pour ses kinds),
  `status` ∈ `active | waiting | someday | done | trashed | clarify`. La hiérarchie passe par `parent_id`
  (tâche → projet → domaine). La suppression est logique (`status: 'trashed'`). Chaque `kind` appartient à un module
  (`kinds`, `kindOwner()`, libellé via `kindLabel`).
- **Partage** (0.11) : table `shares` (élément, propriétaire, invité, droit `edit` | `view`), créée via la fonction `share_item(item, email, role)` qui « touche » l'élément et ses enfants pour que l'invité les reçoive (le curseur de synchro est `updated_at`). Un projet partagé couvre ses tâches (`parent_id`). RLS de `items` : `row_role()` ; `user_id` ne change jamais (trigger), un invité qui modifie renvoie le `user_id` d'origine (`toRow`). Côté client : `live()` / `ofKind()` ne renvoient que **mes** éléments (planification personnelle), `liveAll()` / `ofKindAll()` y ajoutent les éléments reçus (page projet, « Partagés avec moi »). `roleOf()` / `canEdit()` de `store.js` bloquent l'écriture en lecture seule (toast) et l'éditeur désactive ses champs. `sync.js` charge `shares` et `profiles` et retire de l'appareil ce qui n'est plus accessible. Un invité ne peut pas planifier (date, Top 3) un élément qui n'est pas à lui dans ses listes perso.
- **Liens entre éléments** (0.5) : colonne `links uuid[]`, stockée d'un seul côté et lue dans les deux sens.
  Toujours passer par `linkedIds()`, `linked()`, `link()`, `unlink()` de `store.js`. `mentionsOf()` donne les
  éléments qui citent `[[titre]]`, `findByTitle()` résout un wikilien. L'interface commune (bloc « Liés »,
  section de page, feuille « Lier à… ») est dans `core/links.js` : c'est par là qu'un module montre les éléments
  d'un autre module, sans l'importer.
- **Écrire une donnée** : toujours via `newItem()` + `saveItem()` pour un élément neuf, `patch(id, champs)` pour un élément existant.
  `patch` note les champs modifiés : seuls ceux-là écrasent le serveur. `saveItem(it)` sur un élément existant sans `{ fields }` renvoie la ligne
  entière et peut écraser un autre appareil. Ne jamais modifier `S.items` à la main.
- **Routage** : par hash `#/vue/arg`. Une vue est une fonction de `views` qui renvoie `{ title, html }`.
  `route()` retombe sur la vue d'accueil du premier module actif si la vue est inconnue ou son module désactivé.
  Rendu groupé par `queueRender()`.
- **Événements** : délégation globale. Clics via `data-act="…"` (+ `data-id`, `data-v`…) résolus dans `ACTS` ;
  formulaires via `data-form="…"` dans `FORMS`. Pour une nouvelle action, ajouter l'entrée dans `acts` / `forms`
  du module, pas d'écouteur par élément.
- **Échappement** : tout texte utilisateur inséré dans du HTML passe par `esc()`. Le Markdown passe par `md()`.
- **Undo** : les actions destructives ou de tri affichent `toast(message, undoFn)`.
- **Feuilles** : en-tête par `sheetHead()`. Les éditeurs enregistrent au fil de la saisie, ils n'ont que « OK » à droite ; « Supprimer » est ajouté en bas par `renderEditor()` (`keepKinds` pour l'éviter).
- **Démarrage** (`boot.js`) : le cache s'affiche d'abord (`S.uid`, `S.email`), la session se vérifie ensuite. Écran de connexion seulement si la session est réellement invalide, jamais sur une erreur réseau.
- **Synchro** (`sync.js`) : rien ne part sans session valide (sinon la base répondrait « rien » à une requête sans compte, ce qui ressemblerait à des suppressions).
  1) envoi des items dirty : lignes partielles relues sur le serveur et fusionnées avec mes champs, puis upsert par lots de 200 ; une ligne refusée va dans `S.stuck`, le reste passe. 2) prefs fusionnées clé par clé contre `S.prefsBase` ; modifier les prefs passe par `savePrefs()` ou `touchPrefs()`.
  3) pull des lignes dont `updated_at` dépasse le curseur (10 s de recouvrement), sans écraser un item encore dirty ; relecture complète après 25 jours d'absence pour retirer ce que la purge a effacé. 4) `afterSync()` de chaque module.
  Une erreur réseau arrête le cycle sans rien perdre. `updated_at` est fixé par un trigger serveur et sert de curseur : ne pas le contourner.
- **Dates** : chaînes `YYYY-MM-DD` locales via `ymd()`, `today()`, `parseYmd()`, `addDays()` de `util.js`.
  Pas de `toISOString()` pour une date du jour (décalage de fuseau). Formats d'affichage via les `Intl.DateTimeFormat` `fr-FR` existants.

## Ajouter un module

1. Créer `js/modules/<id>/index.js` avec `registerModule({...})`, découpé comme `gtd` si besoin
   (`model.js`, `views.js`, `rows.js`, `sheets.js`, `actions.js`).
2. L'importer dans `js/main.js` (sa position fixe l'ordre par défaut dans la barre).
3. Ajouter **chaque** nouveau fichier à `SHELL` dans `sw.js` et changer `CACHE`.
4. Fournir `seedDemo()` pour que le mode démo montre le module rempli.
5. Si le module stocke de nouveaux champs, suivre la section suivante.

## Changer le modèle de données

Une nouvelle colonne demande **toutes** ces étapes :

1. Dans `supabase/schema.sql`, le seul fichier SQL : ajouter à `create table` **et** un `add column if not exists`,
   pour monter depuis n'importe quelle version. Tout y reste idempotent : il doit pouvoir être relancé sans risque.
2. Augmenter le numéro dans `brain_status()` de `schema.sql` et `SCHEMA_VERSION` dans `js/core/config.js` : l'app signale alors le retard elle-même.
3. Dans `js/core/state.js` : ajouter le champ à `ITEM_DEFAULTS`, et à `TEXT_FIELDS` / `NULLABLE` si besoin.

L'agent ne peut pas exécuter le SQL sur Supabase : il le prépare et dit à l'utilisateur de recoller `schema.sql` dans le SQL Editor.

## Publier une nouvelle version

L'app se sert depuis le cache de sa version : **sans nouvelle version, personne ne reçoit les changements.**

- Changer `VERSION` dans `js/core/config.js` et `CACHE` dans `sw.js` (`sc-0.19.0` → `sc-0.19.1`…). Le numéro reste écrit dans `sw.js` : c'est la modification de ce fichier qui déclenche la mise à jour sur iOS.
- Lancer `python3 scripts/check.py` : il vérifie que les deux concordent et que `SHELL` liste tous les fichiers de `js/`.

## Accès de l'agent aux données (compte agent)

L'agent a un compte Brain dédié, distinct de celui de l'utilisateur. Il ne voit et n'écrit que ce que l'utilisateur lui partage dans Brain.
Identifiants dans `.env.local` à la racine (`BRAIN_AGENT_EMAIL`, `BRAIN_AGENT_PASSWORD`), ignoré par git : ne jamais les afficher, les recopier ni les committer.

- **Lire** : `scripts/brain-read.sh [since ISO8601]` écrit en JSON tous les éléments partagés avec le compte agent (hors corbeille). Ex. lister les tâches d'un projet : filtrer sur `kind`, `status`, `parent_id`.
- **Écrire** : `scripts/brain-write.sh [--dry] fichier.json` ajoute des recettes (ou des produits `shop_item`) dans le foyer. Format du fichier en tête du script. Toujours un `--dry` d'abord, montrer le résultat à l'utilisateur, puis écrire. Une recette au titre déjà présent est ignorée.
- Fichiers temporaires (JSON de recette, sorties) dans le dossier scratchpad, pas dans le dépôt.
- Les droits sont ceux du partage : lecture seule ou « Peut modifier », imposés par la base (RLS). Un refus veut dire que l'élément n'est pas partagé en écriture : le dire à l'utilisateur, ne pas contourner.
- Ne jamais tester sur le compte réel de l'utilisateur ni modifier ses données sans demande ; pour l'interface, utiliser `?demo=1`.

## Sécurité

- `config.js` ne contient que la clé **publishable**. Ne jamais y mettre, ni committer, une clé `service_role` / secret.
- Toute nouvelle table : `enable row level security` + politique `user_id = auth.uid()` (les éléments partagés passent par `row_role()`, voir Partage). `profiles` ne laisse modifier que `name` (grant par colonne) ; `is_admin` ne se change que dans le SQL Editor. La clé `service_role` n'existe que dans la fonction `brain`, jamais dans l'app.
- Les raccourcis iOS passent par la fonction `capture()` (security definer, clé d'accès dans `capture_tokens`, comptée par `use_token()`) et ne peuvent
  qu'ajouter dans l'Inbox. Seules autres portes `anon`, toutes derrière un secret : `sync_events()` (clé d'accès,
  remplace la copie des événements de Calendrier dans `events`), `widget_today()` (clé d'accès, résumé du jour) et `calendar_feed()` (jeton de `calendar_tokens`,
  lecture des créneaux pour le flux ICS). Ne pas élargir ce que l'accès `anon` peut faire au-delà.
- Le bucket `captures` est privé ; les images s'affichent via URL signée (`js/core/images.js`).
- Ne jamais afficher ni recopier une clé d'accès ou un lien de calendrier réel dans le code, les logs ou les commits.

## Style de code

- Suivre le style existant : JS compact, fonctions courtes, fonctions fléchées pour les sélecteurs,
  gabarits HTML en template strings, sections séparées par `// ---`, commentaires brefs **en français**.
- Exports nommés uniquement. Chemins d'import relatifs avec l'extension `.js`.
- CSS : utiliser les variables de `:root` (`--bg`, `--surface`, `--text`, `--muted`, `--line`, `--accent`…).
  Pas de couleur en dur dans les règles de composants. Chaque nouveau token a sa valeur claire **et** sombre.
- Textes d'interface : verbes d'action courts (« Noter », « Trier », « Reporter à demain »), pas de point d'exclamation,
  pas de vocabulaire culpabilisant.

## Direction artistique

La DA « carnet » est appliquée depuis la version 0.4.0. Document de référence :
https://claude.ai/artifact/GDJhpTebTDvzqBzd2wZQ3g

- **Couleurs** : papier mat (`--bg`), feuille (`--surface`), encre bleu-noir (`--text`), encre bleue (`--accent`)
  réservée à ce qui se clique, surligneur (`--hl`) réservé au Top 3. Pas de rouge pour les compteurs.
- **Typo** : Newsreader (`--f-display`) pour les titres d'écran, les notes, la capture et les questions de tri ;
  Instrument Sans (`--f-ui`) pour l'interface ; IBM Plex Mono (`--f-mono`) pour les heures, durées, contextes,
  compteurs et en-têtes de section (petites capitales espacées). Polices chargées depuis Google Fonts dans
  `index.html` et mises en cache par `sw.js`.
- **Formes** : filets fins plutôt que cartes, rayon 8 px maximum, ombres discrètes. Action principale en encre pleine
  (`.btn.primary`, `.fab`), filtres actifs en encre pleine (`.chip.on`).
- Le surligneur ne s'anime que sur la classe `.hl.draw` : le rendu reconstruit le DOM à chaque changement,
  une animation permanente rejouerait à chaque saisie.

## Git

- Branche principale : `main`, remote `origin` sur GitHub. Les grosses évolutions passent par une branche `feat/…` et une PR.
- Messages de commit courts, en français, à l'impératif ou sous forme de titre (« Phase 1 : app en modules… »).
- Ne pas committer `.DS_Store`.
- Ne committer ou pousser que sur demande.
