// État partagé (module feuille : n'importe rien, pour éviter les cycles d'import)
// Préférences par défaut : chaque module y ajoute les siennes (registerModule)
export const DEFAULT_PREFS = {
  modules: null // [{ id, on }] dans l'ordre de la barre latérale ; null = ordre par défaut
};
// Colonnes d'un élément et leur valeur par défaut : la seule liste à compléter quand une colonne s'ajoute à items.
// newItem() et l'envoi au serveur en découlent (updated_at est fixé par le serveur).
export const ITEM_DEFAULTS = {
  kind: 'inbox', status: 'active', title: '', body: '', url: null, image_path: null, parent_id: null,
  contexts: [], tags: [], duration_min: null, energy: null, due_date: null, scheduled_date: null, scheduled_time: null,
  day_order: null, waiting_for: null, recurrence: null, focus: null, outcome: null, review_date: null,
  links: [], pinned: false, remind_at: null, spent_sec: 0, timer_started_at: null, end_at: null, completed_by: null,
  meta: null, source: 'app', completed_at: null
};
export const FIELDS = ['id', 'user_id', ...Object.keys(ITEM_DEFAULTS), 'created_at'];
export const TEXT_FIELDS = new Set(['title', 'body', 'waiting_for', 'tags', 'url', 'outcome']);
export const NULLABLE = new Set(['parent_id', 'due_date', 'scheduled_date', 'scheduled_time', 'energy', 'recurrence', 'url', 'waiting_for', 'outcome', 'review_date', 'remind_at', 'timer_started_at', 'end_at', 'completed_by']);

export const S = {
  user: null,
  uid: null,
  email: null,
  items: new Map(),
  shares: [], // partages visibles (donnés ou reçus), table shares
  grants: [], // propriétaires qui m'ont désigné compte agent (table agent_grants) : je modifie tout chez eux
  people: {}, // comptes connus : id -> { id, email, name, is_admin }
  prefs: { ...DEFAULT_PREFS },
  dirty: new Map(), // id -> champs à envoyer (Set), ou null pour la ligne entière
  stuck: new Map(), // id -> raison : lignes refusées par la base, gardées de côté (réessayées à chaque lancement)
  prefsDirty: false,
  prefsBase: null, // dernières préférences lues sur le serveur : base de la fusion clé par clé
  prefsGen: 0, // augmente à chaque changement : repère ce qui change pendant un envoi
  netDown: false, // serveur injoignable au dernier essai
  cursor: null,
  lastFullRead: null, // dernière relecture complète ; null : à refaire au prochain cycle
  syncing: false,
  lastSync: null,
  lastError: null,
  // état d'affichage ; les modules y ajoutent leurs champs (registerModule)
  ui: { mod: null, search: '', tokens: undefined, tokenErr: null, tokenEdit: null, fold: null }
};
