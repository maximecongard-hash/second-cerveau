import { LS_KEY } from './config.js';
import { uuid, nowIso } from './util.js';
import { scheduleSync } from './sync.js';
import { queueRender } from './ui.js';
import { S, DEFAULT_PREFS } from './state.js';
export { S, DEFAULT_PREFS, FIELDS, TEXT_FIELDS, NULLABLE } from './state.js';

// ---------------------------------------------------------------------------
// Persistance locale
// ---------------------------------------------------------------------------
let persistTimer = null;
export function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 150);
}
export function persistNow() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      uid: S.uid, items: [...S.items.values()], prefs: S.prefs, dirty: [...S.dirty],
      prefsDirty: S.prefsDirty, cursor: S.cursor, lastSync: S.lastSync
    }));
  } catch (e) { console.warn('persist', e); }
}
export function restore() {
  S.prefs = { ...DEFAULT_PREFS };
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (!d) return;
    S.uid = d.uid || null;
    S.items = new Map((d.items || []).map(i => [i.id, i]));
    S.prefs = { ...DEFAULT_PREFS, ...(d.prefs || {}) };
    S.dirty = new Set(d.dirty || []);
    S.prefsDirty = !!d.prefsDirty;
    S.cursor = d.cursor || null;
    S.lastSync = d.lastSync || null;
  } catch (e) { console.warn('restore', e); }
}
export function resetLocal() {
  S.items = new Map(); S.dirty = new Set(); S.prefs = { ...DEFAULT_PREFS };
  S.prefsDirty = false; S.cursor = null; S.lastSync = null;
}

// ---------------------------------------------------------------------------
// Modèle commun à tous les modules
// ---------------------------------------------------------------------------
export function newItem(fields = {}) {
  const now = nowIso();
  return {
    id: uuid(), user_id: S.user?.id || null, kind: 'inbox', status: 'active', title: '', body: '',
    url: null, image_path: null, parent_id: null, contexts: [], tags: [], duration_min: null,
    energy: null, due_date: null, scheduled_date: null, scheduled_time: null, day_order: null,
    waiting_for: null, recurrence: null, focus: null, outcome: null, review_date: null, links: [], pinned: false, remind_at: null,
    source: 'app', completed_at: null,
    created_at: now, updated_at: now, ...fields
  };
}
export function saveItem(it, { render = true } = {}) {
  it.updated_at = nowIso();
  S.items.set(it.id, it);
  S.dirty.add(it.id);
  persist();
  scheduleSync();
  if (render) queueRender();
  return it;
}
export function patch(id, p, opts) {
  const it = S.items.get(id);
  if (!it) return null;
  Object.assign(it, p);
  return saveItem(it, opts);
}
export function savePrefs() {
  S.prefsDirty = true;
  persist();
  scheduleSync();
  queueRender();
}

export const live = () => [...S.items.values()].filter(i => i.status !== 'trashed');
export const ofKind = k => live().filter(i => i.kind === k);
export const byTitle = (a, b) => a.title.localeCompare(b.title, 'fr');
// Tags d'un élément : champ tags + #mots du texte
export function itemTags(it) {
  const set = new Set(it.tags || []);
  for (const m of (it.body || '').matchAll(/(^|\s)#([\p{L}\d_-]+)/gu)) set.add(m[2]);
  return [...set];
}

// ---------------------------------------------------------------------------
// Liens entre éléments, tous modules confondus : stockés d'un seul côté, lus dans les deux sens
// ---------------------------------------------------------------------------
export function linkedIds(id) {
  const out = new Set(S.items.get(id)?.links || []);
  for (const x of S.items.values()) if (x.links?.includes(id)) out.add(x.id);
  out.delete(id);
  return [...out];
}
export const linked = id => linkedIds(id).map(i => S.items.get(i)).filter(i => i && i.status !== 'trashed');
export function link(a, b) {
  const it = S.items.get(a);
  if (!it || a === b || !S.items.has(b) || linkedIds(a).includes(b)) return;
  patch(a, { links: [...(it.links || []), b] });
}
export function unlink(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const it = S.items.get(x);
    if (it?.links?.includes(y)) patch(x, { links: it.links.filter(i => i !== y) });
  }
}
// Éléments dont le texte cite [[titre]]
export function mentionsOf(it) {
  const key = it.title && `[[${it.title.toLowerCase()}]]`;
  return key ? live().filter(x => x.id !== it.id && x.body?.toLowerCase().includes(key)) : [];
}
// Cible d'un [[wikilien]] : titre exact, de préférence une note, puis un projet, puis le reste
const WIKI_ORDER = ['note', 'project', 'task'];
export function findByTitle(t) {
  const k = t.trim().toLowerCase();
  const rank = i => { const r = WIKI_ORDER.indexOf(i.kind); return r < 0 ? WIKI_ORDER.length : r; };
  return live().filter(i => i.kind !== 'area' && i.title.trim().toLowerCase() === k).sort((a, b) => rank(a) - rank(b))[0] || null;
}
