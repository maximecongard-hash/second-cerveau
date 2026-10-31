# AGENTS.md — Second Cerveau

Instructions pour les agents de code (Claude Code, Codex, Cursor…) qui travaillent sur ce dépôt.
Le README s'adresse à l'utilisateur final ; ce fichier s'adresse à l'agent.

## Le projet en bref

PWA personnelle de type « second cerveau », pensée d'abord pour l'iPhone installé en plein écran.
L'app est organisée en **modules** (thèmes) affichés dans une barre latérale :

- **Organisation** (`gtd`) : capture rapide (app, raccourcis iOS, partage), tri de l'Inbox, prochaines actions
  par contexte, projets, planification de la journée (Top 3, agenda), revues du soir et hebdo.
- **Agenda** (`agenda`) : grille horaire jour / semaine. Ne possède aucun kind : il lit tous les éléments datés
  avec une heure et place les tâches via `setField()` du cœur (routé vers le module propriétaire).
  `apple.js` : événements de Calendrier (table `events`, lecture seule, cache localStorage à part des éléments)
  et réglages du lien d'abonnement ICS.
- **Notes** (`notes`) : notes Markdown, signets (`bookmark`, statut `active` = à lire, `done` = lu), épinglés.
  Reliés aux tâches et projets par les liens du cœur.
- **Sport** et **Courses** : en aperçu, désactivés par défaut, contenu prévu en phase 2.

Autres repères :

- Un seul utilisateur (le propriétaire). Inscriptions désactivées côté Supabase.
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

Il n'y a pas de tests automatisés. Vérifier à la main dans le navigateur (mode démo), en largeur mobile (~390 px)
et en mode sombre, puis regarder la console (une erreur d'import casse toute l'app).

## Fichiers

| Chemin | Rôle |
|---|---|
| `index.html` | coquille : `#app`, feuille modale `#sheet`, `#toast`, scripts |
| `styles.css` | styles et tokens de couleur (`:root` + `prefers-color-scheme: dark`) |
| `config.js` | URL et clé **publique** Supabase (`window.SC_CONFIG`) |
| `js/main.js` | point d'entrée : importe le cœur, puis les modules (ordre = ordre par défaut de la barre), puis `init()` |
| `js/core/` | cœur commun, voir ci-dessous |
| `js/modules/<id>/` | un dossier par module (`gtd`, `agenda`, `notes`, `sport`, `courses`) |
| `sw.js` | cache hors ligne, stratégie stale-while-revalidate, liste `SHELL` de tous les fichiers |
| `manifest.webmanifest`, `manifest-papier.webmanifest`, `icons/` | installation sur l'écran d'accueil ; deux icônes au choix (Encre par défaut, Papier), sources SVG dans `icons/src/`, choix appliqué par `applyIcon()` de `util.js` |
| `supabase/schema.sql` | schéma complet, idempotent |
| `supabase/00X_*.sql` | migrations incrémentales, idempotentes |
| `supabase/functions/calendrier/index.ts` | Edge Function du flux ICS (abonnement Calendrier), déployée à la main par l'utilisateur, « Verify JWT » désactivé ; `buildIcs` testable avec node |

### Cœur (`js/core/`)

| Fichier | Rôle |
|---|---|
| `config.js` | `VERSION`, `CFG`, `DEMO`, client `sb`, clé localStorage |
| `state.js` | état partagé `S`, `DEFAULT_PREFS`, `FIELDS` / `TEXT_FIELDS` / `NULLABLE`. Module feuille : n'importe rien |
| `store.js` | persistance locale, `newItem()`, `saveItem()`, `patch()`, sélecteurs (`ofKind`…) |
| `sync.js` | synchronisation Supabase et pastille d'état |
| `modules.js` | registre : `registerModule()`, `VIEWS`, `ACTS`, `FORMS`, ordre et activation des modules |
| `ui.js` | routage, rendu, barre latérale, feuille modale (`SH`, `openEditor`…), toast + undo |
| `views.js` | vues communes : recherche, réglages, modules, connexion |
| `events.js` | écouteurs globaux et actions communes |
| `util.js` | dates, formats, `esc()`, `md()`, icônes `I`, petits gabarits (`sec`, `empty`) |
| `images.js` | redimensionnement, upload et URL signées des photos |
| `links.js` | liens entre éléments de tous les modules : bloc « Liés » des éditeurs, section de page, feuille « Lier à… », `[[wikiliens]]`, épingle |
| `boot.js` | `init()` : restauration, mode démo ou session Supabase, premier rendu |

## Architecture

- **Modules** : chaque module appelle `registerModule({...})` dans son `index.js`. La liste complète des propriétés
  (`id`, `label`, `home`, `tabs`, `views`, `acts`, `forms`, `kinds`, `editor`, `prefs`, `ui`, `afterSync`, `seedDemo`…)
  est documentée en tête de `js/core/modules.js`. Modèle minimal : `js/modules/sport/index.js`.
- **Imports** : le cœur ne doit jamais importer un module. Les modules importent le cœur, jamais un autre module.
  `state.js` reste sans import pour éviter les cycles.
- **État global unique `S`** : `items` (Map id → item), `prefs`, `dirty` (ids à envoyer), `cursor` de synchro, `ui`.
  Un module ajoute ses préférences et son état d'affichage via `prefs` / `ui` dans `registerModule`, pas en modifiant `S` au chargement.
- **Une seule table `items`** pour tout : `kind` (`inbox | task | project | area` pour le GTD, `note | bookmark` pour Notes ;
  depuis la migration 004 la base accepte tout type en minuscules, un nouveau module n'a pas besoin de migration pour ses kinds),
  `status` ∈ `active | waiting | someday | done | trashed | clarify`. La hiérarchie passe par `parent_id`
  (tâche → projet → domaine). La suppression est logique (`status: 'trashed'`). Chaque `kind` appartient à un module
  (`kinds`, `kindOwner()`, libellé via `kindLabel`).
- **Liens entre éléments** (0.5) : colonne `links uuid[]`, stockée d'un seul côté et lue dans les deux sens.
  Toujours passer par `linkedIds()`, `linked()`, `link()`, `unlink()` de `store.js`. `mentionsOf()` donne les
  éléments qui citent `[[titre]]`, `findByTitle()` résout un wikilien. L'interface commune (bloc « Liés »,
  section de page, feuille « Lier à… ») est dans `core/links.js` : c'est par là qu'un module montre les éléments
  d'un autre module, sans l'importer.
- **Écrire une donnée** : toujours via `newItem()`, `saveItem()` ou `patch()` de `store.js`. Ces fonctions mettent
  `updated_at`, marquent l'item `dirty`, persistent en localStorage et planifient la synchro. Ne jamais modifier `S.items` à la main.
- **Routage** : par hash `#/vue/arg`. Une vue est une fonction de `views` qui renvoie `{ title, html }`.
  `route()` retombe sur la vue d'accueil du premier module actif si la vue est inconnue ou son module désactivé.
  Rendu groupé par `queueRender()`.
- **Événements** : délégation globale. Clics via `data-act="…"` (+ `data-id`, `data-v`…) résolus dans `ACTS` ;
  formulaires via `data-form="…"` dans `FORMS`. Pour une nouvelle action, ajouter l'entrée dans `acts` / `forms`
  du module, pas d'écouteur par élément.
- **Échappement** : tout texte utilisateur inséré dans du HTML passe par `esc()`. Le Markdown passe par `md()`.
- **Undo** : les actions destructives ou de tri affichent `toast(message, undoFn)`.
- **Synchro** (`sync.js`) : 1) upsert des items dirty par lots de 200, 2) prefs, 3) pull des lignes dont `updated_at`
  dépasse le curseur (10 s de recouvrement), sans écraser un item encore dirty, 4) `afterSync()` de chaque module.
  `updated_at` est fixé par un trigger serveur et sert de curseur : ne pas le contourner.
- **Dates** : chaînes `YYYY-MM-DD` locales via `ymd()`, `today()`, `parseYmd()`, `addDays()` de `util.js`.
  Pas de `toISOString()` pour une date du jour (décalage de fuseau). Formats d'affichage via les `Intl.DateTimeFormat` `fr-FR` existants.

## Ajouter un module

1. Créer `js/modules/<id>/index.js` avec `registerModule({...})`, découpé comme `gtd` si besoin
   (`model.js`, `views.js`, `rows.js`, `sheets.js`, `actions.js`).
2. L'importer dans `js/main.js` (sa position fixe l'ordre par défaut dans la barre).
3. Ajouter **chaque** nouveau fichier à `SHELL` dans `sw.js` et incrémenter `CACHE`.
4. Fournir `seedDemo()` pour que le mode démo montre le module rempli.
5. Si le module stocke de nouveaux champs, suivre la section suivante.

## Changer le modèle de données

Une nouvelle colonne demande **toutes** ces étapes :

1. Nouveau fichier `supabase/00N_nom.sql` idempotent (`add column if not exists`, `drop constraint if exists`…),
   terminé par `notify pgrst, 'reload schema';`.
2. Reporter le changement dans `supabase/schema.sql` pour qu'une installation neuve soit à jour.
3. Dans `js/core/state.js` : ajouter le champ à `FIELDS`, et à `TEXT_FIELDS` / `NULLABLE` si besoin.
   Dans `js/core/store.js` : valeur par défaut dans `newItem()`.
4. Mettre à jour le message d'erreur de schéma dans `js/core/sync.js` pour qu'il pointe vers la nouvelle migration.
5. Documenter la migration à lancer dans le README.

L'agent ne peut pas exécuter le SQL sur Supabase : il le prépare et dit à l'utilisateur quoi coller dans le SQL Editor.

## Publier une nouvelle version

- Incrémenter `VERSION` dans `js/core/config.js`.
- **Incrémenter `CACHE` dans `sw.js`** (`sc-v3` → `sc-v4`…), sinon les iPhone gardent l'ancienne version.
- Vérifier que `SHELL` liste tous les fichiers de `js/` (un fichier oublié manque hors ligne et casse l'import).

## Sécurité

- `config.js` ne contient que la clé **publishable**. Ne jamais y mettre, ni committer, une clé `service_role` / secret.
- Toute nouvelle table : `enable row level security` + politique `user_id = auth.uid()`.
- Les raccourcis iOS passent par la fonction `capture()` (security definer, jeton dans `capture_tokens`) et ne peuvent
  qu'ajouter dans l'Inbox. Seules autres portes `anon`, toutes derrière un jeton : `sync_events()` (jeton de capture,
  remplace la copie des événements de Calendrier dans `events`) et `calendar_feed()` (jeton de `calendar_tokens`,
  lecture des créneaux pour le flux ICS). Ne pas élargir ce que l'accès `anon` peut faire au-delà.
- Le bucket `captures` est privé ; les images s'affichent via URL signée (`js/core/images.js`).
- Ne jamais afficher ni recopier un jeton de capture ou de calendrier réel dans le code, les logs ou les commits.

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
