# Second Cerveau

PWA personnelle de type GTD : capture rapide depuis l'iPhone, tri de l'Inbox, prochaines actions par contexte, projets, notes et signets liés aux tâches, et planification de la journée. Les données sont synchronisées avec Supabase et l'app fonctionne hors ligne.

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
| table `items` | inbox, tâches, projets, domaines, notes et signets |
| table `prefs` | contextes, date de la dernière revue… |
| table `capture_tokens` | jetons secrets utilisés par les raccourcis iPhone |
| fonction `capture()` | ajoute un élément dans l'Inbox à partir d'un jeton |
| bucket `captures` | photos (privé) |

Chaque table est protégée par des règles RLS : seul ton compte connecté voit ses données. Les raccourcis ne peuvent qu'**ajouter** dans l'Inbox, et seulement avec un jeton valide.

Base créée avant une mise à jour : colle aussi, dans l'ordre, les migrations qui manquent. Chaque script peut être relancé sans risque. Une installation neuve n'en a pas besoin, `schema.sql` est déjà à jour.

- Avant la version 0.2 : [`supabase/002_pack1.sql`](supabase/002_pack1.sql) (Top 3, résultat attendu, date de revue).
- Avant la version 0.5 : [`supabase/003_liens.sql`](supabase/003_liens.sql) (liens entre tâches, notes et projets, épingle). Sans elle, la pastille de synchro passe en erreur.
- Avant la version 0.6 : [`supabase/004_signets.sql`](supabase/004_signets.sql) (signets, et types d'éléments ouverts aux nouveaux modules). Sans elle, enregistrer un signet échoue.

## 2. Installer l'app sur l'iPhone

1. Ouvre https://maximecongard-hash.github.io/second-cerveau/ dans **Safari**.
2. Connecte-toi avec l'email et le mot de passe créés dans Supabase.
3. Facultatif : menu **⋯** > **Réglages** > **Icône**, choisis **Encre** (fond sombre) ou **Papier** (fond clair). iOS fige l'icône au moment de l'ajout : pour en changer plus tard, supprime l'app de l'écran d'accueil et ajoute-la de nouveau.
4. Bouton **Partager** (*Share*) > **Sur l'écran d'accueil** (*Add to Home Screen*) > **Ajouter** (*Add*).
5. Ouvre l'app depuis l'icône : elle s'affiche en plein écran, comme une app native.

## 3. Générer ton jeton de capture

Dans l'app : menu **⋯** > **Réglages** > **Capture iPhone** > **Générer un jeton**, puis **Copier**.

Ce jeton permet d'ajouter des éléments dans ton Inbox. Garde-le pour toi ; s'il fuit, révoque-le dans les Réglages et génères-en un autre.

Valeurs dont tu auras besoin dans les raccourcis (boutons « Copier » dans les Réglages) :

- **URL du projet** : `https://zqdvtbkjvfzkjqtaffbb.supabase.co`
- **Clé publique** : `sb_publishable_…`
- **Jeton** : celui que tu viens de générer

> Les noms des actions et des menus sont donnés en français, avec entre parenthèses leur nom quand l'iPhone est en anglais : **Obtenir le contenu de l'URL** (*Get Contents of URL*). Dans l'app Raccourcis, tape ce nom dans la recherche d'actions pour la trouver.

## 4. Raccourci « Capturer » (texte, dictée, liens)

App **Raccourcis** (*Shortcuts*) > **+** > nomme-le **Capturer**.

1. Touche le **ⓘ** en bas et active **Afficher dans la feuille de partage** (*Show in Share Sheet*).
   En haut du raccourci apparaît « Recevoir **N'importe quoi** de **Feuille de partage** » (*Receive Any input from Share Sheet*). Touche « N'importe quoi » (*Any*) et garde seulement **Texte** (*Text*) et **URL** (*URLs*).
   Touche ensuite « Si aucune entrée » (*If there's no input*) et choisis **Demander** (*Ask For*) > **Texte** (*Text*). Sans partage, le raccourci te demandera de taper ou dicter ton idée.
2. Ajoute l'action **Obtenir le contenu de l'URL** (*Get Contents of URL*) :
   - URL : `https://zqdvtbkjvfzkjqtaffbb.supabase.co/rest/v1/rpc/capture`
   - Touche **Afficher plus** (*Show More*) :
     - Méthode (*Method*) : **POST**
     - En-têtes (*Headers*) : ajoute `apikey` = ta clé publique
     - Corps de la requête (*Request Body*) : **JSON**, avec deux champs de type Texte (*Text*) :
       - `p_token` = ton jeton
       - `p_text` = variable **Entrée du raccourci** (*Shortcut Input*)
3. Ajoute **Afficher la notification** (*Show Notification*) avec le texte « Ajouté à l'Inbox ✓ ».

Utilisation :

- **Bouton Action** (*Action Button*, iPhone 15 Pro et plus) : Réglages > Bouton Action > Raccourci > Capturer (*Settings > Action Button > Shortcut > Capturer*).
- **Siri** : « Dis Siri, Capturer » (*« Hey Siri, Capturer »*).
- **Widget** sur l'écran d'accueil ou l'écran verrouillé.
- **Partage** depuis Safari, YouTube, X… : Partager > Capturer (*Share > Capturer*). Le lien arrive dans l'Inbox.

Un lien seul est reconnu automatiquement. Pour un texte sur plusieurs lignes, la première ligne devient le titre et le reste les détails.

## 5. Raccourci « Capturer photo »

Nouveau raccourci **Capturer photo**, avec **Afficher dans la feuille de partage** (*Show in Share Sheet*) activé et le type **Images** seulement (« Si aucune entrée » : **Continuer**, soit *If there's no input: Continue*).

1. **Si** [Entrée du raccourci] **n'a aucune valeur** (*If [Shortcut Input] does not have any value*) :
   - **Prendre une photo** (*Take Photo*) ou **Sélectionner des photos** (*Select Photos*)
   - **Définir la variable** (*Set Variable*) `Photo` sur le résultat
   - **Sinon** (*Otherwise*) : **Définir la variable** `Photo` sur Entrée du raccourci (*Shortcut Input*)
   - **Fin si** (*End If*)
2. **Redimensionner l'image** (*Resize Image*) `Photo` : largeur 1600 (hauteur automatique).
3. **Convertir l'image** (*Convert Image*) en **JPEG**, qualité (*Quality*) 70 %.
4. **Date actuelle** (*Current Date*), puis **Formater la date** (*Format Date*) : format personnalisé (*Custom*) `yyyyMMdd-HHmmss`.
5. **Texte** (*Text*) : `inbox/TON_JETON/` suivi de la date formatée et de `.jpg`.
   Exemple de résultat : `inbox/3f9a…/20261031-104512.jpg`.
   **Définir la variable** (*Set Variable*) `Chemin` sur ce texte.
6. **Obtenir le contenu de l'URL** (*Get Contents of URL*) :
   - URL : `https://zqdvtbkjvfzkjqtaffbb.supabase.co/storage/v1/object/captures/` suivie de la variable `Chemin`
   - Méthode (*Method*) **POST**
   - En-têtes (*Headers*) : `apikey` = ta clé publique, et `Content-Type` = `image/jpeg`
   - Corps de la requête (*Request Body*) : **Fichier** (*File*) = l'image convertie
7. **Demander une entrée** (*Ask for Input*), type Texte (*Text*) : « Légende ? » (tu peux laisser vide).
8. **Obtenir le contenu de l'URL** (*Get Contents of URL*) :
   - URL : `https://zqdvtbkjvfzkjqtaffbb.supabase.co/rest/v1/rpc/capture`
   - Méthode (*Method*) **POST**, en-tête (*Headers*) `apikey` = ta clé publique
   - Corps (*Request Body*) **JSON** : `p_token` = ton jeton, `p_text` = la réponse à l'étape 7, `p_image_path` = la variable `Chemin`
9. **Afficher la notification** (*Show Notification*) : « Photo ajoutée ✓ ».

## 6. Raccourci « Rappel GTD » (notifications)

Dans l'éditeur d'une tâche qui a une date, le bouton **Créer un rappel Apple** lance ce raccourci avec le titre, la date et l'heure.

Nouveau raccourci, nommé exactement **Rappel GTD** (ou change le nom dans Réglages > Rappels Apple).

Voici le raccourci terminé (iPhone en anglais) :

![Raccourci Rappel GTD terminé](docs/raccourci-rappel-gtd.svg)

Étapes (noms des actions en anglais) :

1. **Receive** : laisse « Any from Nowhere » et « If there's no input: Continue ».
2. **Get Dictionary from Input** : la valeur doit être **Shortcut Input**.
3. **Get Dictionary Value** : Value for `titre` in **Dictionary**.
4. **Get Dictionary Value** : Value for `date` in **Dictionary**.
5. **Get Dates from Input** : choisis la sortie de l'étape 4.
6. **Get Dictionary Value** : Value for `notes` in **Dictionary**.
7. **Add New Reminder** :
   - Remplace « Reminder » par la sortie de l'étape 3.
   - Touche la flèche **⌄** de l'action pour afficher les options.
   - **Notes** : la sortie de l'étape 6.
   - **Alert** : **At Time**, puis la sortie de l'étape 5.

Aux étapes 3, 4 et 6, le champ après « in » doit toujours être **Dictionary**, c'est-à-dire la sortie de l'étape 2. Pour le choisir, touche ce champ, puis **Select Variable**, puis touche l'action « Get dictionary from ».

Renommer les sorties (facultatif) évite de confondre les trois « Dictionary Value ». Touche la puce orange d'une sortie là où elle est utilisée, choisis **Rename**, puis tape `Titre`, `Date texte`, `Quand` ou `Notes`.

Pour tester, crée dans l'app une tâche avec une date et une heure, puis touche **Créer un rappel Apple**. Un rappel doit apparaître dans l'app Rappels. Sans heure dans l'app, le rappel sonne à 9 h 00.

## 7. Utilisation au quotidien

- **Dans la journée** : tu captures tout avec le bouton Action, Siri ou le partage. Pas besoin de trier.
- **Le soir** : onglet Inbox > **Trier**. Pour chaque élément : fait, aujourd'hui, prochaine action, projet, en attente, un jour, note, signet ou suppression. Un élément partagé avec un lien propose d'emblée « Signet ».
- **Le matin ou la veille** : onglet Aujourd'hui > **Choisir dans mes prochaines actions**. Ajoute une heure aux tâches qui doivent tomber à un moment précis ; elles passent dans l'Agenda.
- **Chaque semaine** : menu **⋯** > **Revue hebdo**.

Le point en haut à droite indique la synchro : vert = synchronisé, orange = en cours, gris = hors ligne (tes modifications restent sur le téléphone et partent au retour du réseau), rouge = erreur (détail dans Réglages).

## 8. Modules (thèmes)

L'app est organisée en modules, affichés dans une barre latérale : fixe sur grand écran, ouverte avec le bouton ☰ sur iPhone.

- **Organisation** : le GTD (Inbox, Aujourd'hui, Actions, Projets).
- **Notes** : notes en Markdown, signets à lire ou lus, éléments épinglés. Chaque note ou signet peut être lié à des tâches et des projets (« Liés », « + Lier à… », « + Action liée »).
- **Sport** et **Courses** : en aperçu, désactivés par défaut.

Menu **Modules** (dans la barre ou les Réglages) : active ou masque chaque module et change leur ordre. Le premier module s'ouvre au lancement. Ce choix est enregistré dans tes préférences et synchronisé entre tes appareils.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css` | page et styles |
| `js/main.js` | point d'entrée : charge le cœur puis les modules |
| `js/core/` | cœur commun : état, synchro Supabase, rendu, barre latérale, réglages, recherche |
| `js/core/modules.js` | registre des modules (la liste des propriétés d'un module y est décrite) |
| `js/modules/<module>/` | un dossier par module (`gtd`, `notes`, `sport`, `courses`) |
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
