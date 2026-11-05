# Second Cerveau (Brain)

PWA personnelle pensée pour l'iPhone : un second cerveau organisé en modules. Le cœur est un GTD complet (capture rapide, tri, prochaines actions, projets, journée), complété par un agenda en grille horaire, des notes et signets, un suivi de sport et des courses, le tout lié entre eux. Les données sont synchronisées avec Supabase et l'app fonctionne hors ligne.

- **App** : https://maximecongard-hash.github.io/second-cerveau/
- **Démo sans compte** : https://maximecongard-hash.github.io/second-cerveau/?demo=1 (données fictives, stockées seulement dans le navigateur)
- **Code** : https://github.com/maximecongard-hash/second-cerveau

Stack : HTML, CSS et modules ES natifs, sans build ni npm. Hébergement GitHub Pages (branche `main`). Base, comptes, photos et fonctions : Supabase.

## Sommaire

1. [Comment ça marche](#1-comment-ça-marche)
2. [Installer](#2-installer) : huit étapes, à faire une fois
3. [Mettre à jour](#3-mettre-à-jour)
4. [Reprendre le projet à ton compte](#4-reprendre-le-projet-à-ton-compte)
5. [Sur l'iPhone : raccourcis et widget](#5-sur-liphone--raccourcis-et-widget)
6. [Calendrier Apple](#6-calendrier-apple)
7. [Notifications](#7-notifications)
8. [Au quotidien](#8-au-quotidien)
9. [Comptes et partage](#9-comptes-et-partage)
10. [Risques connus](#10-risques-connus)
11. [Développement](#11-développement)

---

## 1. Comment ça marche

Tout ce que tu notes est un **élément** dans une table unique de Supabase (`items`). Son type décide de son rôle : capturé, tâche, projet, domaine de vie, note, signet, séance, recette, produit. Un élément peut être lié à d'autres, et `[[titre]]` dans une note crée un lien.

```
iPhone (raccourcis, partage, Siri)  ──►  capture()  ──►  Inbox
App (PWA)  ◄──── synchro ────►  Supabase (table items, RLS)
Calendrier Apple  ◄── abonnement ICS ──  fonction brain
Calendrier Apple  ── raccourci Agenda Apple ──►  Brain (lecture seule)
pg_cron (chaque minute)  ──►  fonction brain  ──►  notification Web Push
```

### Hors ligne et synchro

L'app et tes données restent sur le téléphone : tout marche sans réseau, et l'app s'ouvre tout de suite, même si ta session a expiré entre-temps. Les modifications partent au retour du réseau, **champ par champ** : changer le titre sur l'iPhone et le statut sur le Mac conserve les deux.

Le point en haut à droite indique l'état : vert = synchronisé, orange = en cours, gris = hors ligne, rouge = à regarder (détail dans Réglages). Si la base refuse un élément, il est mis de côté dans Réglages > Données et le reste continue de passer.

### Sécurité

Chaque table est protégée par des règles RLS : chaque compte ne voit que ses données, plus ce qu'un autre compte a partagé avec lui. La clé publique de `config.js` est sans danger dans le navigateur. Les raccourcis et le widget n'utilisent pas ton mot de passe : ils passent par une **clé d'accès** qui ne permet que d'ajouter dans l'Inbox, de remplacer la copie de tes événements de Calendrier et de lire le résumé du jour. Elle se révoque à tout moment.

### Les modules

Une barre latérale (fixe sur grand écran, ouverte par ☰ sur iPhone) donne accès aux modules. Réglages > **Modules** : activer, masquer, réordonner. Le premier s'ouvre au lancement.

| Module | Ce qu'il fait |
|---|---|
| **Organisation** | **Inbox** et tri, **Aujourd'hui** (Top 3, revue du soir), **Actions** par contexte, **Projets** par domaine, revue hebdo. Une tâche peut avoir échéance, date, heure et durée, contexte, énergie, répétition (dont « le 25 de chaque mois », « 1er samedi du mois »), rappel et chronomètre |
| **Agenda** | grille jour et semaine. Toute tâche avec une heure devient un bloc. Touche un créneau vide pour y placer une tâche. Sur grand écran : glisser-déposer. Les événements de Calendrier Apple s'ajoutent en gris |
| **Notes** | notes en Markdown, signets (à lire / lus), épinglés, liés aux tâches et aux projets |
| **Sport** (désactivé par défaut) | séances de course, vélo, natation, rando, renfo et mobilité ; modèles et semaines types ; mode direct (chrono, minuteur de repos) ; historique et progression |
| **Courses** (désactivé par défaut) | banque de recettes, panier de la semaine (parts, ingrédients fusionnés, « Déjà là / Acheter »), liste de courses, foyer à partager |

Recherche partout, thème clair et sombre automatique, icône au choix, export JSON et Corbeille (30 jours) dans Réglages > Données.

---

## 2. Installer

À faire une seule fois, sur ordinateur de préférence. Pour ton propre projet, fais d'abord un fork du dépôt et lis la [partie 4](#4-reprendre-le-projet-à-ton-compte).

### Étape 1 : créer le projet Supabase

Compte sur https://supabase.com, puis **New project** (région proche, mot de passe de base à garder). Dans **Project Settings** > **API**, note l'**URL** du projet et la clé **publishable** (ancienne « anon »). Ne copie jamais la clé `secret` / `service_role`.

### Étape 2 : créer la base

**SQL Editor** > **New query**, colle tout [`supabase/schema.sql`](supabase/schema.sql), puis **Run**. C'est le seul fichier SQL : il contient tous les modules et peut être relancé sans risque.

Le script active `pg_cron` et `pg_net`. Si une erreur les mentionne : **Database** > **Extensions**, active-les à la main, puis relance-le.

### Étape 3 : créer ton compte

**Authentication** > **Users** > **Add user** > **Create new user** : ton email, un mot de passe, coche **Auto Confirm User**. Le premier compte créé devient administrateur.

### Étape 4 : fermer les inscriptions

**Authentication** > **Sign In / Providers** : décoche **Allow new users to sign up**. Les comptes suivants s'ajoutent depuis Réglages > Utilisateurs.

### Étape 5 : déployer la fonction `brain`

Une seule fonction fait tout : abonnement Calendrier, envoi des rappels, ajout de comptes.

1. **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Nom exact : `brain`, tout en minuscules, **avant le premier déploiement**. L'adresse se fixe à la création et distingue les majuscules : renommer la fonction ensuite ne change que le nom affiché. Efface le code d'exemple, colle [`supabase/functions/brain/index.ts`](supabase/functions/brain/index.ts), puis **Deploy function**.
3. Onglet **Details** de la fonction : **désactive** « Verify JWT with legacy secret » (ou « Enforce JWT verification ») et enregistre. Calendrier et pg_cron n'envoient pas de clé : chaque route vérifie elle-même son jeton ou le compte de l'appelant.

### Étape 6 : brancher l'app

Dans [`config.js`](config.js) à la racine, remplace `url` et `key` par ceux de l'étape 1. Ces deux valeurs sont publiques.

### Étape 7 : publier

Dépôt GitHub > **Settings** > **Pages** > **Deploy from a branch** > `main` / `/ (root)`. L'adresse devient `https://<ton-compte>.github.io/<ton-dépôt>/`.

### Étape 8 : installer sur l'iPhone

À refaire pour chaque iPhone ou iPad.

1. Ouvre l'adresse dans **Safari** (seul Safari sait ajouter à l'écran d'accueil et recevoir les notifications) et connecte-toi.
2. Facultatif : **Réglages** > **Icône**. iOS la fige à l'ajout : pour en changer ensuite, supprime l'app de l'écran d'accueil et ajoute-la de nouveau.
3. Bouton **Partager** > **Sur l'écran d'accueil** > **Ajouter**, puis ouvre l'app depuis son icône.
4. **Réglages** > **Notifications** > **Activer les notifications**, **Autoriser**, puis **Envoyer un essai**.
5. Les raccourcis et le widget sont en [partie 5](#5-sur-liphone--raccourcis-et-widget).

### Vérifier

Dans l'app : **Réglages** > **Installation** (visible par l'administrateur) montre l'état de chaque pièce et ce qu'il reste à faire.

| Ligne | Vert si | Sinon |
|---|---|---|
| Base de données | le schéma est à jour | recolle `schema.sql` |
| Fonction brain | la fonction répond | étape 5, en vérifiant « Verify JWT » et que l'URL de la fonction finit par `/functions/v1/brain`. Si elle a une majuscule, supprime la fonction et recrée-la |
| Rappels | la tâche de chaque minute existe et connaît l'adresse du projet | active `pg_cron` et `pg_net`, recolle `schema.sql` ; l'adresse se remplit à la première ouverture de l'app par l'administrateur |
| Notifications | les clés de chiffrement existent | créées une minute après le déploiement de la fonction |
| Nettoyage | la purge de nuit de la corbeille existe | active `pg_cron`, recolle `schema.sql` |

---

## 3. Mettre à jour

**Recolle [`supabase/schema.sql`](supabase/schema.sql) dans le SQL Editor**, quelle que soit la version de départ : il ajoute ce qui manque sans toucher aux données. Si la base est en retard sur l'app, Réglages te le dit. Si `supabase/functions/brain/index.ts` a changé, recolle-le aussi dans la fonction.

L'app se met à jour seule : la nouvelle version se télécharge en arrière-plan et s'installe d'un bloc, au moment où aucune saisie n'est en cours.

### Passer d'une version antérieure à la 0.19

Les anciennes migrations numérotées et les trois fonctions (`calendrier`, `send-reminders`, `add-user`) sont remplacées. Dans cet ordre :

1. Déploie la fonction `brain` (étape 5).
2. Colle `schema.sql` : il reprend tout seul l'adresse du projet et applique ce qui manquerait. Il redirige aussi les rappels vers `brain` : sans la fonction, ils ne partent plus (les rappels en retard partiront d'un coup au déploiement, les fins de créneau trop anciennes sont perdues).
3. Ouvre l'app, vérifie que Réglages > Installation est au vert.
4. Supprime `send-reminders` et `add-user`. Si Calendrier est déjà abonné, garde l'ancienne fonction `calendrier` : le lien reste valable. Pour la retirer, crée un nouveau lien dans Réglages > iPhone et Calendrier, abonne-toi avec, puis supprime-la.

Rien à refaire pour les raccourcis ni le widget.

---

## 4. Reprendre le projet à ton compte

Après le fork, trois endroits portent l'adresse et la clé publique de ton projet :

| Fichier | À faire |
|---|---|
| [`config.js`](config.js) | `url` et `key` (étape 6) |
| [`widget/Brain.js`](widget/Brain.js) | les deux constantes en tête du fichier |
| `raccourcis/*.shortcut` | sur un Mac : `python3 raccourcis/build.py`. Il relit `config.js` et signe les fichiers |

Les scripts `scripts/brain-read.sh` et `brain-write.sh` relisent `config.js` eux aussi.

---

## 5. Sur l'iPhone : raccourcis et widget

### Créer une clé d'accès

**Réglages** > **iPhone et Calendrier** > **Clés d'accès** : donne un nom (iPhone, widget…), **Créer**, puis **Copier**. Chaque clé affiche son nombre d'utilisations, d'où l'intérêt d'en créer une par appareil. Si elle fuit : **Révoquer**, puis réinstalle les raccourcis avec une nouvelle.

### Installer les raccourcis

Dans le même groupe de Réglages, touche **Installer** sur l'iPhone, pour chacun :

| Raccourci | Rôle |
|---|---|
| **Capturer** | idée (texte ou dictée) ou lien partagé, vers l'Inbox |
| **Capturer photo** | photo prise ou partagée, avec légende, vers l'Inbox |
| **Agenda Apple** | envoie tes prochains événements de Calendrier à Brain |

Safari demande de télécharger le fichier : touche l'icône de téléchargement dans la barre d'adresse, puis le fichier. Dans Raccourcis, **Configurer le raccourci**, colle ta clé, **Ajouter le raccourci**. Au premier lancement, l'iPhone demande l'accès à `supabase.co` : **Toujours autoriser**.

### Capturer au quotidien

- **Bouton Action** (iPhone 15 Pro et plus) : Réglages iPhone > Bouton Action > Raccourci > Capturer.
- **Siri** : « Dis Siri, Capturer ».
- **Widget** Raccourcis sur l'écran d'accueil ou verrouillé.
- **Partage** depuis Safari, YouTube, X… : Partager > Capturer.

Pour un lien, le raccourci demande « Titre ou note ? » : la première ligne devient le titre, les suivantes la note, le lien reste attaché ; laisse vide pour garder le lien seul. Une vibration confirme l'envoi.

### Widget Scriptable « Ma journée »

En grand format : date, avancement, Top 3, grille horaire du jour, les tâches des 7 jours suivants (« À venir »), compteurs. En petit et moyen : liste courte, complétée par les tâches à venir s'il reste de la place. « À venir » demande le `schema.sql` à jour (schéma 21) : recolle-le dans le SQL Editor.

1. Installe l'app **Scriptable** (gratuite), crée un script « Brain » et colles-y le code : **Réglages > iPhone et Calendrier > Widget > Copier le code** (ou [`widget/Brain.js`](widget/Brain.js)).
2. Lance-le dans Scriptable : il demande une clé d'accès et la garde dans le Trousseau.
3. Écran d'accueil > ajoute un widget Scriptable > Script : Brain. iOS le rafraîchit toutes les 5 à 15 minutes (lui seul décide).
4. Fond transparent (grand format) : fais une capture d'une page sans icône sous le widget, puis menu du script > « Configurer le fond transparent ». À refaire si tu changes de fond d'écran.

---

## 6. Calendrier Apple

Brain et Calendrier se voient l'un l'autre, en lecture seule dans les deux sens : chaque élément se modifie là où il a été créé.

### Voir Brain dans Calendrier

1. **Réglages** > **iPhone et Calendrier** > **Calendrier Apple** > **Créer le lien d'abonnement**.
2. Sur l'iPhone, touche **S'abonner**. Sur Mac : **Copier le lien**, puis Calendrier > Fichier > **Nouvel abonnement au calendrier**, emplacement **iCloud** pour le retrouver partout.
3. Dans les réglages de l'abonnement, actualisation **toutes les heures**.

Le lien donne accès à tes créneaux : garde-le pour toi. **Révoquer** le coupe.

### Voir Calendrier dans Brain

Le raccourci **Agenda Apple** envoie tes 150 prochains événements (sauf le calendrier « Brain »). Ils s'affichent en gris dans la grille ; **Réglages** > **Agenda** montre combien sont arrivés et permet de les masquer.

Pour qu'il tourne seul : app Raccourcis > **Automatisation** > **+** > **Heure de la journée** (6 h, chaque jour), **Exécuter immédiatement**, action **Exécuter le raccourci** > Agenda Apple. Ajoutes-en une seconde à midi.

---

## 7. Notifications

Brain envoie lui-même une notification à l'heure choisie, même app fermée. Sur iPhone, elles ne marchent que depuis l'app **installée sur l'écran d'accueil** (iOS 16.4 ou plus), et s'activent appareil par appareil.

Dans une tâche, champ **Rappel** : date et heure, ou **Heure prévue**, **Dans 1 h**, **Demain 9 h**. Toucher la notification ouvre la tâche. Pour une tâche répétée, le rappel suit la répétition. **Réglages** > **Notifications** règle aussi la notification de fin de créneau.

---

## 8. Au quotidien

- **Dans la journée** : capture tout (bouton Action, Siri, partage). Pas besoin de trier.
- **Le soir** : Inbox > **Trier**, puis la **revue du soir** dans Aujourd'hui.
- **Le matin ou la veille** : Aujourd'hui > **Choisir dans mes prochaines actions** pour fixer le Top 3. Ajoute une heure aux tâches qui doivent tomber à un moment précis : elles passent dans l'Agenda.
- **Chaque semaine** : **⋯** > **Revue hebdo**.

Un élément supprimé reste 30 jours dans **Réglages** > **Données** > **Corbeille**, puis il est effacé.

---

## 9. Comptes et partage

- **Ajouter un compte** (administrateur) : Réglages > Utilisateurs, saisis l'email, **Créer le compte**. Brain affiche une fois l'email et un mot de passe provisoire à transmettre ; la personne le change dans Réglages > Compte et y choisit son pseudo. Pour supprimer un compte : Supabase > Authentication > Users.
- **Partager** : bouton **Partager** sur la page d'un projet, ou bloc « Partage » de l'éditeur d'une tâche ou d'une note. Choisis le compte et le droit : **Peut modifier** ou **Lecture seule**. Un projet partagé donne aussi accès à ses tâches et notes.
- **Foyer** (Courses) : Réglages > Courses > Foyer et partage. Un seul partage couvre toutes les recettes et la liste.
- **Côté invité** : les projets reçus apparaissent dans Projets > « Partagés avec moi ». Ils n'entrent pas dans tes listes personnelles. « Quitter ce partage » est dans l'éditeur.
- Seul le propriétaire partage, change les droits ou retire un partage.

---

## 10. Risques connus

Choix assumés, faibles pour un usage entre comptes de confiance :

- **Clé dans le chemin des photos** : une photo capturée par raccourci a la clé d'accès dans son chemin de stockage, donc un invité qui reçoit cet élément pourrait la lire. Le corriger demanderait de refaire les raccourcis.
- **Photos partagées** : un invité ne voit pas les photos d'un élément partagé.
- **Double répétition** : une tâche répétée terminée hors ligne sur deux appareils crée deux occurrences.
- **Photos orphelines** : la purge de la corbeille efface l'élément, pas sa photo dans le stockage.
- **Corbeille vidée à la main** : un autre appareil garde la copie dans sa corbeille jusqu'à sa propre purge ; la restaurer là-bas recrée l'élément.

---

## 11. Développement

### Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css` | page et styles |
| `config.js` | URL et clé publique Supabase |
| `js/main.js` | point d'entrée : charge le cœur puis les modules |
| `js/core/` | cœur : état, synchro, rendu, réglages, recherche, liens, notifications |
| `js/modules/<module>/` | un dossier par module (`gtd`, `agenda`, `notes`, `sport`, `courses`) |
| `sw.js` | cache de l'app et réception des notifications |
| `supabase/schema.sql` | toute la base, pour installer comme pour mettre à jour |
| `supabase/functions/brain/` | la fonction unique |
| `raccourcis/`, `widget/` | raccourcis iOS signés et leur script ; widget Scriptable |
| `scripts/check.py` | vérifications avant un commit |
| `AGENTS.md`, `CLAUDE.md` | consignes pour les agents de code |

### Tester en local

```bash
python3 -m http.server 5173
```

Ouvre `http://localhost:5173/?demo=1` (données fictives, jamais le compte réel). Vérifie à la main en largeur mobile (~390 px), en mode sombre, et dans la console. Avant un commit :

```bash
python3 scripts/check.py
```

### Publier une nouvelle version

L'app se sert depuis son cache : **sans nouvelle version, personne ne reçoit les changements.**

1. Change `VERSION` dans `js/core/config.js` **et** `CACHE` dans `sw.js`.
2. Ajoute chaque nouveau fichier JS à `SHELL` dans `sw.js`.
3. Lance `scripts/check.py`, puis pousse sur `main`.

### Ajouter un module

1. Crée `js/modules/<nom>/index.js` et appelle `registerModule({...})`.
2. Importe-le dans `js/main.js`, ajoute ses fichiers à `SHELL`.

### Refaire les raccourcis

Sur un Mac : `python3 raccourcis/build.py`. Le script les signe avec l'outil `shortcuts`. La clé d'accès est demandée à l'installation, jamais écrite dans les fichiers. À refaire si `capture()`, l'URL Supabase ou la clé publique changent.
