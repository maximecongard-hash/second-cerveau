# Second Cerveau

PWA personnelle de type GTD : capture rapide depuis l'iPhone, tri de l'Inbox, prochaines actions par contexte, projets, notes liées et planification de la journée. Les données sont synchronisées avec Supabase et l'app fonctionne hors ligne.

- **App** : https://maximecongard-hash.github.io/second-cerveau/
- **Démo sans compte** : https://maximecongard-hash.github.io/second-cerveau/?demo=1 (données fictives, stockées seulement dans le navigateur)
- **Code** : https://github.com/maximecongard-hash/second-cerveau

L'app est servie par GitHub Pages depuis la branche `main` : chaque push y est publié en quelques minutes.

---

## 1. Préparer Supabase (une seule fois)

1. Supabase > **SQL Editor** > **New query**.
2. Colle tout le contenu de [`supabase/schema.sql`](supabase/schema.sql) puis clique sur **Run**. Le message attendu est « Success. No rows returned ».
3. Vérifie que ton utilisateur existe bien (Authentication > Users) et que les inscriptions sont désactivées (Authentication > Sign In / Providers > « Allow new users to sign up » décoché).

Le script crée :

| Élément | Rôle |
|---|---|
| table `items` | inbox, tâches, projets, notes et domaines |
| table `prefs` | contextes, date de la dernière revue… |
| table `capture_tokens` | jetons secrets utilisés par les raccourcis iPhone |
| fonction `capture()` | ajoute un élément dans l'Inbox à partir d'un jeton |
| bucket `captures` | photos (privé) |

Chaque table est protégée par des règles RLS : seul ton compte connecté voit ses données. Les raccourcis ne peuvent qu'**ajouter** dans l'Inbox, et seulement avec un jeton valide.

Base créée avant la version 0.2 : colle aussi [`supabase/002_pack1.sql`](supabase/002_pack1.sql) (Top 3, résultat attendu, date de revue). Le script peut être relancé sans risque. Une installation neuve n'en a pas besoin, `schema.sql` est déjà à jour.

## 2. Installer l'app sur l'iPhone

1. Ouvre https://maximecongard-hash.github.io/second-cerveau/ dans **Safari**.
2. Connecte-toi avec l'email et le mot de passe créés dans Supabase.
3. Facultatif : menu **⋯** > **Réglages** > **Icône**, choisis **Encre** (fond sombre) ou **Papier** (fond clair). iOS fige l'icône au moment de l'ajout : pour en changer plus tard, supprime l'app de l'écran d'accueil et ajoute-la de nouveau.
4. Bouton **Partager** > **Sur l'écran d'accueil** > **Ajouter**.
5. Ouvre l'app depuis l'icône : elle s'affiche en plein écran, comme une app native.

## 3. Générer ton jeton de capture

Dans l'app : menu **⋯** > **Réglages** > **Capture iPhone** > **Générer un jeton**, puis **Copier**.

Ce jeton permet d'ajouter des éléments dans ton Inbox. Garde-le pour toi ; s'il fuit, révoque-le dans les Réglages et génères-en un autre.

Valeurs dont tu auras besoin dans les raccourcis (boutons « Copier » dans les Réglages) :

- **URL du projet** : `https://zqdvtbkjvfzkjqtaffbb.supabase.co`
- **Clé publique** : `sb_publishable_…`
- **Jeton** : celui que tu viens de générer

## 4. Raccourci « Capturer » (texte, dictée, liens)

App **Raccourcis** > **+** > nomme-le **Capturer**.

1. Touche le **ⓘ** en bas et active **Afficher dans la feuille de partage**.
   En haut du raccourci apparaît « Recevoir **N'importe quoi** de **Feuille de partage** ». Touche « N'importe quoi » et garde seulement **Texte** et **URL**.
   Touche ensuite « Si aucune entrée » et choisis **Demander** > **Texte**. Sans partage, le raccourci te demandera de taper ou dicter ton idée.
2. Ajoute l'action **Obtenir le contenu de l'URL** :
   - URL : `https://zqdvtbkjvfzkjqtaffbb.supabase.co/rest/v1/rpc/capture`
   - Touche **Afficher plus** :
     - Méthode : **POST**
     - En-têtes : ajoute `apikey` = ta clé publique
     - Corps de la requête : **JSON**, avec deux champs de type Texte :
       - `p_token` = ton jeton
       - `p_text` = variable **Entrée du raccourci**
3. Ajoute **Afficher la notification** avec le texte « Ajouté à l'Inbox ✓ ».

Utilisation :

- **Bouton Action** (iPhone 15 Pro et plus) : Réglages > Bouton Action > Raccourci > Capturer.
- **Siri** : « Dis Siri, Capturer ».
- **Widget** sur l'écran d'accueil ou l'écran verrouillé.
- **Partage** depuis Safari, YouTube, X… : Partager > Capturer. Le lien arrive dans l'Inbox.

Un lien seul est reconnu automatiquement. Pour un texte sur plusieurs lignes, la première ligne devient le titre et le reste les détails.

## 5. Raccourci « Capturer photo »

Nouveau raccourci **Capturer photo**, avec **Afficher dans la feuille de partage** activé et le type **Images** seulement (« Si aucune entrée » : **Continuer**).

1. **Si** [Entrée du raccourci] **n'a aucune valeur** :
   - **Prendre une photo** (ou **Sélectionner des photos**)
   - **Définir la variable** `Photo` sur le résultat
   - **Sinon** : **Définir la variable** `Photo` sur Entrée du raccourci
   - **Fin si**
2. **Redimensionner l'image** `Photo` : largeur 1600 (hauteur automatique).
3. **Convertir l'image** en **JPEG**, qualité 70 %.
4. **Date actuelle**, puis **Formater la date** : format personnalisé `yyyyMMdd-HHmmss`.
5. **Texte** : `inbox/TON_JETON/` suivi de la date formatée et de `.jpg`.
   Exemple de résultat : `inbox/3f9a…/20261031-104512.jpg`.
   **Définir la variable** `Chemin` sur ce texte.
6. **Obtenir le contenu de l'URL** :
   - URL : `https://zqdvtbkjvfzkjqtaffbb.supabase.co/storage/v1/object/captures/` suivie de la variable `Chemin`
   - Méthode **POST**
   - En-têtes : `apikey` = ta clé publique, et `Content-Type` = `image/jpeg`
   - Corps de la requête : **Fichier** = l'image convertie
7. **Demander une entrée** (Texte) : « Légende ? » (tu peux laisser vide).
8. **Obtenir le contenu de l'URL** :
   - URL : `https://zqdvtbkjvfzkjqtaffbb.supabase.co/rest/v1/rpc/capture`
   - Méthode **POST**, en-tête `apikey` = ta clé publique
   - Corps **JSON** : `p_token` = ton jeton, `p_text` = la réponse à l'étape 7, `p_image_path` = la variable `Chemin`
9. **Afficher la notification** : « Photo ajoutée ✓ ».

## 6. Raccourci « Rappel GTD » (notifications)

Dans l'éditeur d'une tâche qui a une date, le bouton **Créer un rappel Apple** lance ce raccourci avec le titre, la date et l'heure.

Nouveau raccourci, nommé exactement **Rappel GTD** (ou change le nom dans Réglages > Rappels Apple) :

1. **Obtenir le dictionnaire de** [Entrée du raccourci].
2. **Obtenir la valeur pour** `titre` dans le Dictionnaire. **Définir la variable** `Titre`.
3. **Obtenir la valeur pour** `date` dans le Dictionnaire, puis **Obtenir les dates de** cette valeur. **Définir la variable** `Quand`.
4. **Obtenir la valeur pour** `notes` dans le Dictionnaire. **Définir la variable** `Notes`.
5. **Ajouter un nouveau rappel** : titre `Titre`, notes `Notes`, active **Alerte** et choisis la variable `Quand`.

Sans heure dans l'app, le rappel sonne à 9 h 00.

## 7. Utilisation au quotidien

- **Dans la journée** : tu captures tout avec le bouton Action, Siri ou le partage. Pas besoin de trier.
- **Le soir** : onglet Inbox > **Trier**. Pour chaque élément : fait, aujourd'hui, prochaine action, projet, en attente, un jour, note ou suppression.
- **Le matin ou la veille** : onglet Aujourd'hui > **Choisir dans mes prochaines actions**. Ajoute une heure aux tâches qui doivent tomber à un moment précis ; elles passent dans l'Agenda.
- **Chaque semaine** : menu **⋯** > **Revue hebdo**.

Le point en haut à droite indique la synchro : vert = synchronisé, orange = en cours, gris = hors ligne (tes modifications restent sur le téléphone et partent au retour du réseau), rouge = erreur (détail dans Réglages).

## 8. Modules (thèmes)

L'app est organisée en modules, affichés dans une barre latérale : fixe sur grand écran, ouverte avec le bouton ☰ sur iPhone.

- **Organisation** : le GTD (Inbox, Aujourd'hui, Actions, Projets, Notes).
- **Sport** et **Courses** : en aperçu, désactivés par défaut.

Menu **Modules** (dans la barre ou les Réglages) : active ou masque chaque module et change leur ordre. Le premier module s'ouvre au lancement. Ce choix est enregistré dans tes préférences et synchronisé entre tes appareils.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css` | page et styles |
| `js/main.js` | point d'entrée : charge le cœur puis les modules |
| `js/core/` | cœur commun : état, synchro Supabase, rendu, barre latérale, réglages, recherche |
| `js/core/modules.js` | registre des modules (la liste des propriétés d'un module y est décrite) |
| `js/modules/<module>/` | un dossier par module (`gtd`, `sport`, `courses`) |
| `config.js` | URL et clé publique Supabase |
| `sw.js` | cache hors ligne : change `CACHE` à chaque nouvelle version et ajoute chaque nouveau fichier de `js/` à `SHELL` |
| `manifest.webmanifest`, `icons/` | installation sur l'écran d'accueil |
| `supabase/schema.sql` | base de données complète (installation neuve) |
| `supabase/00N_*.sql` | migrations pour une base existante |
| `AGENTS.md`, `CLAUDE.md` | consignes pour les agents de code |

### Ajouter un module

1. Crée `js/modules/<nom>/index.js` et appelle `registerModule({...})` (voir `js/modules/sport/index.js`).
2. Importe-le dans `js/main.js`.
3. Ajoute ses fichiers à `SHELL` dans `sw.js` et incrémente `CACHE`.

### Tester en local

```bash
python3 -m http.server 5173
```

Puis ouvre `http://localhost:5173/?demo=1`.

### Publier une nouvelle version

1. Incrémente `VERSION` dans `js/core/config.js` **et** `CACHE` dans `sw.js` (sinon l'iPhone garde l'ancienne version).
2. Pousse sur `main` : GitHub Pages publie l'app.
3. À la prochaine ouverture, l'app installée récupère la nouvelle version et se recharge d'elle-même.
