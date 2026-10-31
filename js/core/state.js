// État partagé (module feuille : n'importe rien, pour éviter les cycles d'import)
// Préférences par défaut : chaque module y ajoute les siennes (registerModule)
export const DEFAULT_PREFS = {
  modules: null // [{ id, on }] dans l'ordre de la barre latérale ; null = ordre par défaut
};
export const FIELDS = ['id', 'user_id', 'kind', 'status', 'title', 'body', 'url', 'image_path', 'parent_id',
  'contexts', 'tags', 'duration_min', 'energy', 'due_date', 'scheduled_date', 'scheduled_time',
  'day_order', 'waiting_for', 'recurrence', 'focus', 'outcome', 'review_date', 'links', 'pinned', 'remind_at', 'source', 'completed_at', 'created_at'];
export const TEXT_FIELDS = new Set(['title', 'body', 'waiting_for', 'tags', 'url', 'outcome']);
export const NULLABLE = new Set(['parent_id', 'due_date', 'scheduled_date', 'scheduled_time', 'energy', 'recurrence', 'url', 'waiting_for', 'outcome', 'review_date', 'remind_at']);

export const S = {
  user: null,
  uid: null,
  items: new Map(),
  shares: [], // partages visibles (donnés ou reçus), table shares
  people: {}, // comptes connus : id -> { id, email, name, is_admin }
  prefs: { ...DEFAULT_PREFS },
  dirty: new Set(),
  prefsDirty: false,
  cursor: null,
  syncing: false,
  lastSync: null,
  lastError: null,
  // état d'affichage ; les modules y ajoutent leurs champs (registerModule)
  ui: { mod: null, search: '', tokens: undefined, tokenErr: null, folds: {} }
};
