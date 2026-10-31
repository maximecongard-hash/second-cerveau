# Second Cerveau (Brain)

PWA personnelle, mono-utilisateur, pensée pour l'iPhone : un second cerveau organisé en modules. Le cœur est un GTD complet (capture rapide, tri, prochaines actions, projets, planification de la journée), complété par un agenda en grille horaire, des notes Markdown et des signets, le tout lié entre eux. Les données sont synchronisées avec Supabase et l'app fonctionne hors ligne.

- **App** : https://maximecongard-hash.github.io/second-cerveau/
- **Démo sans compte** : https://maximecongard-hash.github.io/second-cerveau/?demo=1 (données fictives, stockées seulement dans le navigateur)
- **Code** : https://github.com/maximecongard-hash/second-cerveau

Stack : HTML, CSS et modules ES natifs, sans build ni npm. Hébergement GitHub Pages (branche `main`, chaque push est publié en quelques minutes). Base, authentification, stockage et fonctions : Supabase.

## Sommaire

1. [Fonctionnement global](#1-fonctionnement-global)
2. [Initialiser le projet (Supabase, GitHub Pages)](#2-initialiser-le-projet)
3. [Installer sur un nouvel appareil mobile](#3-installer-sur-un-nouvel-appareil-mobile)
4. [Les raccourcis iPhone](#4-les-raccourcis-iphone)
5. [Calendrier Apple](#5-calendrier-apple-icloud)
6. [Notifications de rappel](#6-notifications-de-rappel)
7. [Utilisation au quotidien](#7-utilisation-au-quotidien)
8. [Développement](#8-développement)

---

## 1. Fonctionnement global

### Le principe

Tout ce que tu notes est un **élément** (`item`) dans une table unique de Supabase. Son type (`kind`) décide de son rôle : `inbox` (capturé, pas encore trié), `task`, `project`, `area` (domaine de vie), `note`, `bookmark`. Un même élément peut être lié à d'autres (une note à un projet, une tâche à une note…), et `[[titre]]` dans une note crée un lien vers une note, un projet ou une tâche.

```
iPhone (raccourcis, partage, Siri)  ──►  fonction capture()  ──►  Inbox
App (PWA)  ◄──── synchro ────►  Supabase (table items, RLS)
Calendrier Apple  ◄── flux ICS (calendrier) ──  Brain
Calendrier Apple  ── raccourci Agenda Apple ──►  Brain (lecture seule)
pg_cron (chaque minute)  ──►  send-reminders  ──►  notification Web Push
```

### Synchro et hors ligne

Les données sont copiées dans le `localStorage` du téléphone et un service worker garde l'app en cache : tout marche sans réseau. Les modifications faites hors ligne partent au retour du réseau. Le point en haut à droite indique l'état : vert = synchronisé, orange = en cours, gris = hors ligne, rouge = erreur (détail dans Réglages).

### Sécurité

Chaque table est protégée par des règles RLS : seul ton compte connecté voit ses données. La clé publique de `config.js` est sans danger dans le navigateur. Les raccourcis n'utilisent pas ton mot de passe : ils passent par un **jeton de capture** qui ne permet que d'ajouter dans l'Inbox et de remplacer la copie de tes événements de Calendrier. Il se révoque à tout moment dans les Réglages.

### Les modules

Une barre latérale (fixe sur grand écran, ouverte par ☰ sur iPhone) donne accès aux modules. Réglages > **Modules** : activer, masquer, réordonner. Le premier module s'ouvre au lancement. Ce choix est synchronisé entre tes appareils.

**Organisation** (GTD)

| Vue | Rôle |
|---|---|
| **Inbox** | tout ce qui est capturé. Bouton **Trier** : pour chaque élément, fait, aujourd'hui, prochaine action, projet, en attente, un jour, note, signet ou suppression |
| **Aujourd'hui** | le **Top 3** du jour, les tâches du jour et en retard, la **revue du soir** |
| **Actions** | prochaines actions filtrées par **contexte** (`@ordi`, `@courses`…, modifiables) |
| **Projets** | projets avec résultat attendu, date de revue, actions liées et éléments « Liés », rangés par domaine |
| **Revue hebdo** | menu ⋯ : passe en revue Inbox, projets, en attente et « un jour » |

Une tâche peut avoir une date d'échéance, une date prévue, une heure et une durée, un contexte, un niveau d'énergie, un statut (prochaine, en attente de quelqu'un, un jour), une **répétition** (quotidienne, hebdomadaire, mensuelle, « le 25 de chaque mois », « 1er samedi du mois »…) et un **rappel** (notification). Terminer une tâche répétée la fait sauter au prochain créneau futur.

**Agenda** : grille horaire jour et semaine (3 jours sur iPhone, 7 sur grand écran). Toute tâche qui a une heure y devient un bloc, de la hauteur de sa durée (30 min par défaut), avec des colonnes en cas de chevauchement. Touche un créneau vide pour y placer une tâche ou en créer une. Les événements de Calendrier Apple s'ajoutent en gris.

**Notes** : notes en Markdown, signets (à lire / lus) et épinglés. Chaque note ou signet se lie à des tâches et des projets (« Liés », « + Lier à… », « + Action liée »).

**Sport** et **Courses** : coquilles en aperçu, désactivées par défaut.

### Autres fonctions

- **Capture partout** : bouton **+** (routé selon le module), bouton Action, Siri, widget, partage depuis Safari ou toute app, photo.
- **Recherche** dans tous les éléments.
- **Thème** clair et sombre automatique, icône au choix (Encre ou Papier).
- **Export** de toutes les données en JSON : Réglages > Données.

---

## 2. Initialiser le projet

À faire une seule fois, sur ordinateur de préférence. Pour reprendre le projet à ton compte, fais d'abord un fork du dépôt, puis suis les étapes dans l'ordre.

### 2.1 Créer le projet Supabase

1. Crée un compte sur https://supabase.com puis **New project** (région proche, mot de passe de base de données à garder).
2. **Project Settings** > **API** : note l'**URL** du projet et la clé **publishable** (ancienne « anon »). Ne copie jamais la clé `secret` / `service_role`.

### 2.2 Créer la base

1. **SQL Editor** > **New query**.
2. Colle tout [`supabase/schema.sql`](supabase/schema.sql) puis **Run**. Message attendu : « Success. No rows returned ».

Ce script est complet et à jour : il contient aussi les migrations `002` à `006`, tu n'as rien d'autre à coller sur une installation neuve. Il crée :

| Élément | Rôle |
|---|---|
| table `items` | inbox, tâches, projets, domaines, notes, signets |
| table `prefs` | contextes, modules, date de la dernière revue… |
| table `capture_tokens`, fonction `capture()` | jetons des raccourcis iPhone, ajout dans l'Inbox |
| bucket `captures` (privé) | photos |
| table `calendar_tokens`, fonction `calendar_feed()` | lien d'abonnement de Calendrier |
| table `events`, fonction `sync_events()` | événements de Calendrier envoyés par le raccourci |
| colonnes `remind_at`, `reminded_at` | rappels |
| tables `push_subscriptions`, `push_config`, fonction `push_public_key()` | notifications Web Push |
| tâche `pg_cron` `brain-reminders` | appelle `send-reminders` chaque minute |

Le script active les extensions `pg_cron` et `pg_net`. Si une erreur les mentionne : **Database** > **Extensions**, active-les à la main, puis relance le script (il peut être relancé sans risque).

### 2.3 Créer ton compte et fermer les inscriptions

1. **Authentication** > **Users** > **Add user** > **Create new user** : ton email, un mot de passe, coche **Auto Confirm User**.
2. **Authentication** > **Sign In / Providers** : décoche **Allow new users to sign up**. L'app est mono-utilisateur, personne d'autre ne doit pouvoir créer de compte.

### 2.4 Déployer les deux Edge Functions

Pour chacune : **Edge Functions** > **Deploy a new function** > **Via Editor**, efface le code d'exemple, colle le fichier, puis **Deploy function**. Ensuite, onglet **Details** (ou **Settings**) de la fonction : **désactive** « Verify JWT with legacy secret » (ou « Enforce JWT verification ») et enregistre. Calendrier et pg_cron n'envoient pas de clé, c'est un jeton secret qui protège l'accès.

| Nom (exact) | Code à coller | Rôle |
|---|---|---|
| `calendrier` | [`supabase/functions/calendrier/index.ts`](supabase/functions/calendrier/index.ts) | flux ICS de tes tâches pour Calendrier |
| `send-reminders` | [`supabase/functions/send-reminders/index.ts`](supabase/functions/send-reminders/index.ts) | envoi des notifications ; crée seule ses clés VAPID au premier passage (compte une minute) |

### 2.5 Brancher l'app sur ton projet

Dans [`config.js`](config.js) à la racine, remplace `url` et `key` par ceux de l'étape 2.1. Ces deux valeurs sont publiques. Si tu changes l'URL ou la clé, les raccourcis doivent être refaits (voir 8).

### 2.6 Publier avec GitHub Pages

Dépôt GitHub > **Settings** > **Pages** > **Deploy from a branch** > `main` / `/ (root)`. L'adresse publique devient `https://<ton-compte>.github.io/<ton-dépôt>/`. Si elle diffère de celle du projet d'origine, remplace-la aussi dans les liens des raccourcis ci-dessous.

### 2.7 Checklist

- [ ] `schema.sql` exécuté sans erreur
- [ ] utilisateur créé, inscriptions fermées
- [ ] fonctions `calendrier` et `send-reminders` déployées, JWT désactivé
- [ ] `config.js` pointe vers ton projet
- [ ] GitHub Pages actif, l'app s'ouvre et la connexion marche

### Mettre à jour une base existante

Base créée avant une version : colle, dans l'ordre, les migrations qui manquent. Chacune peut être relancée sans risque.

| Avant la version | Migration | Apporte |
|---|---|---|
| 0.2 | [`002_pack1.sql`](supabase/002_pack1.sql) | Top 3, résultat attendu, date de revue |
| 0.5 | [`003_liens.sql`](supabase/003_liens.sql) | liens entre éléments, épingle (sans elle, la synchro passe en erreur) |
| 0.6 | [`004_signets.sql`](supabase/004_signets.sql) | signets et types d'éléments ouverts (sans elle, enregistrer un signet échoue) |
| 0.8 | [`005_calendrier.sql`](supabase/005_calendrier.sql) | Calendrier Apple (+ fonction `calendrier`) |
| 0.9 | [`006_notifications.sql`](supabase/006_notifications.sql) | notifications (+ fonction `send-reminders`) |

---

## 3. Installer sur un nouvel appareil mobile

À refaire pour chaque iPhone ou iPad. Compte environ cinq minutes.

### 3.1 Installer l'app

1. Ouvre https://maximecongard-hash.github.io/second-cerveau/ dans **Safari** (pas dans un autre navigateur : seul Safari sait ajouter à l'écran d'accueil et recevoir les notifications).
2. Connecte-toi avec l'email et le mot de passe créés dans Supabase.
3. Facultatif : **⋯** > **Réglages** > **Icône**, choisis **Encre** (fond sombre) ou **Papier** (fond clair). iOS fige l'icône à l'ajout : pour en changer, supprime l'app de l'écran d'accueil et ajoute-la de nouveau.
4. Bouton **Partager** (*Share*) > **Sur l'écran d'accueil** (*Add to Home Screen*) > **Ajouter**.
5. Ouvre l'app depuis son icône : elle s'affiche en plein écran. Les mises à jour se récupèrent seules à l'ouverture.

Les données se synchronisent à la connexion : rien d'autre à transférer.

### 3.2 Générer un jeton de capture

Dans l'app installée : **⋯** > **Réglages** > **Capture iPhone** > **Générer un jeton**, puis **Copier**. Un jeton peut servir sur plusieurs appareils. Garde-le pour toi ; s'il fuit, **révoque**-le puis génères-en un autre, et réinstalle les raccourcis avec le nouveau.

### 3.3 Télécharger et installer les raccourcis

**Sur l'iPhone, dans Safari**, pour chaque lien :

| Raccourci | Lien | Rôle |
|---|---|---|
| **Capturer** | [Capturer.shortcut](https://maximecongard-hash.github.io/second-cerveau/raccourcis/Capturer.shortcut) | idée (texte ou dictée) ou lien partagé, vers l'Inbox |
| **Capturer photo** | [Capturer photo.shortcut](https://maximecongard-hash.github.io/second-cerveau/raccourcis/Capturer%20photo.shortcut) | photo prise ou partagée, avec légende, vers l'Inbox |
| **Agenda Apple** | [Agenda Apple.shortcut](https://maximecongard-hash.github.io/second-cerveau/raccourcis/Agenda%20Apple.shortcut) | envoie tes prochains événements de Calendrier à Brain |

1. Touche le lien, puis **Télécharger** (*Download*) quand Safari demande.
2. Touche l'icône de téléchargement (flèche dans la barre d'adresse), puis le fichier : l'app Raccourcis s'ouvre.
3. **Configurer le raccourci** (*Set Up Shortcut*) : colle le jeton de l'étape 3.2.
4. **Ajouter le raccourci** (*Add Shortcut*).

Au premier lancement, l'iPhone demande l'accès à `supabase.co` (et à tes photos ou à ton Calendrier) : **Toujours autoriser** (*Always Allow*).

Si tu avais d'anciens raccourcis construits à la main (« CAPTURER », « Rappel BRAIN »…), supprime-les : app Raccourcis, appui long > **Supprimer**.

### 3.4 Activer les notifications

Dans l'app installée sur l'écran d'accueil : **⋯** > **Réglages** > **Notifications** > **Activer les notifications**, **Autoriser**, puis **Envoyer un essai**. À refaire sur chaque appareil. Le prérequis côté Supabase est décrit en 2.4 et 6.

### 3.5 Vérifier

- **Capturer** : lance-le, tape « test », valide. Vibration, puis « test » apparaît dans l'Inbox.
- **Capturer photo** : prends une photo, légende vide. Elle apparaît dans l'Inbox.
- **Notifications** : « Envoyer un essai » fait arriver une notification.

---

## 4. Les raccourcis iPhone

### Capturer au quotidien

- **Bouton Action** (iPhone 15 Pro et plus) : Réglages > Bouton Action > Raccourci > Capturer.
- **Siri** : « Dis Siri, Capturer ».
- **Widget** Raccourcis sur l'écran d'accueil ou l'écran verrouillé.
- **Partage** depuis Safari, YouTube, X… : Partager > Capturer. Le lien arrive dans l'Inbox.

Pour un lien partagé, le raccourci demande « Titre ou note ? » : la première ligne devient le titre, les suivantes la note, le lien reste attaché ; laisse vide pour garder le lien seul. Pour une idée tapée ou dictée sur plusieurs lignes, la première ligne devient le titre et le reste les détails. Une vibration confirme chaque envoi (pas de notification, pour ne rien laisser dans le centre de notifications).

### Agenda Apple

Voir la partie 5.

---

## 5. Calendrier Apple (iCloud)

Brain et Calendrier se voient l'un l'autre, en lecture seule dans les deux sens : chaque élément se modifie là où il a été créé.

### Voir Brain dans Calendrier

Tes tâches qui ont une heure apparaissent dans un calendrier « Brain », sur l'iPhone et le Mac. Prérequis : fonction `calendrier` déployée (2.4).

1. Dans l'app : **Réglages** > **Calendrier Apple** > **Créer le lien d'abonnement**.
2. Sur l'iPhone, touche **S'abonner**, puis **S'abonner** à nouveau dans Calendrier. Sur Mac : **Copier**, puis Calendrier > Fichier > **Nouvel abonnement au calendrier**, colle le lien, emplacement **iCloud** pour le retrouver partout.
3. Dans les réglages de l'abonnement, actualisation **toutes les heures**.

Le lien donne accès à tes créneaux : garde-le pour toi. **Révoquer** le coupe.

### Voir Calendrier dans Brain

Le raccourci **Agenda Apple** lit tes 150 prochains événements (tous les calendriers, sauf « Brain ») et les envoie à l'app. Ils s'affichent en gris dans la grille de l'Agenda, les journées entières dans le bandeau « Sans heure ». Touche un événement pour voir heure, lieu et calendrier.

1. Installe le raccourci (3.3) et lance-le une fois.
2. Pour qu'il tourne seul : app Raccourcis > **Automatisation** > **+** > **Heure de la journée** (par exemple 6 h 00, chaque jour), **Exécuter immédiatement**, action **Exécuter le raccourci** > Agenda Apple. Ajoute une seconde automatisation à midi pour les changements de la journée.
3. L'app relit les événements à chaque ouverture (au plus toutes les 5 minutes). **Réglages** > **Calendrier Apple** montre combien sont arrivés et permet de les masquer.

Si tu renommes le calendrier « Brain », l'app reconnaît quand même ses créneaux et ne les double pas.

---

## 6. Notifications de rappel

Brain envoie lui-même une notification (Web Push) à l'heure choisie, même app fermée, sans passer par l'app Raccourcis. pg_cron appelle la fonction `send-reminders` chaque minute.

Prérequis côté Supabase : `schema.sql` exécuté (2.2) et fonction `send-reminders` déployée, JWT désactivé (2.4). Attends une minute après le déploiement : la fonction crée alors ses clés de chiffrement. Puis active les notifications sur chaque appareil (3.4). Sur iPhone, les notifications ne marchent que depuis l'app **installée sur l'écran d'accueil** (iOS 16.4 ou plus).

**Utilisation** : dans une tâche, champ **Rappel** : date et heure, ou un raccourci (**Heure prévue**, **Dans 1 h**, **Demain 9 h**). Une petite cloche apparaît dans la liste. À l'heure dite la notification arrive ; la toucher ouvre la tâche. Ouvrir l'app efface les notifications déjà affichées. Pour une tâche répétée, le rappel suit la répétition.

---

## 7. Utilisation au quotidien

- **Dans la journée** : capture tout (bouton Action, Siri, partage). Pas besoin de trier.
- **Le soir** : Inbox > **Trier**, puis la **revue du soir** dans Aujourd'hui. Un élément partagé avec un lien propose d'emblée « Signet ».
- **Le matin ou la veille** : Aujourd'hui > **Choisir dans mes prochaines actions** pour fixer le Top 3. Ajoute une heure aux tâches qui doivent tomber à un moment précis : elles passent dans l'Agenda.
- **Chaque semaine** : **⋯** > **Revue hebdo**.

---

## 8. Développement

### Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css` | page et styles |
| `config.js` | URL et clé publique Supabase |
| `js/main.js` | point d'entrée : charge le cœur puis les modules |
| `js/core/` | cœur : état, synchro, rendu, barre latérale, réglages, recherche, liens, notifications |
| `js/core/modules.js` | registre des modules |
| `js/modules/<module>/` | un dossier par module (`gtd`, `agenda`, `notes`, `sport`, `courses`) |
| `sw.js` | cache hors ligne et réception des push |
| `manifest.webmanifest`, `icons/` | installation sur l'écran d'accueil |
| `supabase/schema.sql` | base complète (installation neuve) |
| `supabase/00N_*.sql` | migrations d'une base existante |
| `supabase/functions/` | Edge Functions `calendrier` et `send-reminders` |
| `raccourcis/` | raccourcis iOS signés (`.shortcut`) et leur script de fabrication |
| `AGENTS.md`, `CLAUDE.md` | consignes pour les agents de code |

### Tester en local

```bash
python3 -m http.server 5173
```

Ouvre `http://localhost:5173/?demo=1` (données fictives, jamais le compte réel). Pas de tests automatisés : vérifie à la main en largeur mobile (~390 px), en mode sombre, et dans la console.

### Publier une nouvelle version

1. Incrémente `VERSION` dans `js/core/config.js` **et** `CACHE` dans `sw.js` (sinon l'iPhone garde l'ancienne version).
2. Ajoute chaque nouveau fichier JS à `SHELL` dans `sw.js`.
3. Pousse sur `main` : GitHub Pages publie, l'app installée se met à jour à la prochaine ouverture.

### Ajouter un module

1. Crée `js/modules/<nom>/index.js` et appelle `registerModule({...})` (modèle : `js/modules/sport/index.js`).
2. Importe-le dans `js/main.js`.
3. Ajoute ses fichiers à `SHELL` dans `sw.js` et incrémente `CACHE`.

### Refaire les raccourcis

Les fichiers de `raccourcis/` sont fabriqués par [`raccourcis/build.py`](raccourcis/build.py), sur un Mac : `python3 raccourcis/build.py`. Le script les signe avec l'outil `shortcuts` du Mac, ce qui permet de les installer sur n'importe quel iPhone. Le jeton est demandé à l'installation, jamais écrit dans les fichiers. À refaire si `capture()`, l'URL Supabase ou la clé publique changent.
