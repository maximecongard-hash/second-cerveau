import { LS_KEY, DEMO } from './config.js';
import { uuid, nowIso } from './util.js';
import { scheduleSync } from './sync.js';
import { queueRender, toast } from './ui.js';
import { S, DEFAULT_PREFS } from './state.js';
import { notifiesEnd } from './modules.js';
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
      uid: S.uid, items: [...S.items.values()], shares: S.shares, people: S.people, prefs: S.prefs, dirty: [...S.dirty],
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
    S.shares = d.shares || [];
    S.people = d.people || {};
    S.prefs = { ...DEFAULT_PREFS, ...(d.prefs || {}) };
    S.dirty = new Set(d.dirty || []);
    S.prefsDirty = !!d.prefsDirty;
    S.cursor = d.cursor || null;
    S.lastSync = d.lastSync || null;
  } catch (e) { console.warn('restore', e); }
}
export function resetLocal() {
  S.items = new Map(); S.shares = []; S.people = {}; S.dirty = new Set(); S.prefs = { ...DEFAULT_PREFS };
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
    waiting_for: null, recurrence: null, focus: null, outcome: null, review_date: null, links: [], pinned: false, remind_at: null, spent_sec: 0, timer_started_at: null, end_at: null, completed_by: null, meta: null,
    source: 'app', completed_at: null,
    created_at: now, updated_at: now, ...fields
  };
}
// ---------------------------------------------------------------------------
// Partage : mes éléments, ceux des autres qui m'ont été partagés, et mon droit sur chacun
// ---------------------------------------------------------------------------
export const meId = () => S.user?.id || S.uid;
export const isMine = it => !it.user_id || it.user_id === meId();
// 'owner' (à moi, ou tâche d'un invité dans mon projet), 'edit', 'view' ou null
export function roleOf(it) {
  if (isMine(it)) return 'owner';
  const mine = id => S.shares.find(s => s.item_id === id && s.user_id === meId());
  const s = mine(it.id) || (it.parent_id && mine(it.parent_id));
  if (s) return s.role;
  return it.parent_id && S.items.get(it.parent_id)?.user_id === meId() ? 'owner' : null;
}
export const canEdit = it => ['owner', 'edit'].includes(roleOf(it));
const denied = () => toast('Lecture seule : ce partage ne permet pas de modifier');

// Instant de fin d'un créneau (heure locale de l'appareil) pour la notification de fin ; null s'il n'y a rien à notifier
export function endAt(it) {
  if (!S.prefs.endNotify || !notifiesEnd(it) || !['active', 'waiting'].includes(it.status) || !it.scheduled_date || !it.scheduled_time || !isMine(it)) return null;
  const [y, m, d] = it.scheduled_date.split('-').map(Number), [h, mi] = it.scheduled_time.split(':').map(Number);
  const end = new Date(y, m - 1, d, h, mi + (it.duration_min || 30));
  return end.getTime() > Date.now() ? end.toISOString() : null;
}
export const sameInstant = (a, b) => (a ? +new Date(a) : null) === (b ? +new Date(b) : null);

// Mode démo : petit journal local, comme le trigger log_item_event du serveur
const snaps = new Map();
function demoLog(it, known) {
  if (!DEMO || !['task', 'project'].includes(it.kind)) return;
  const prev = snaps.get(it.id);
  snaps.set(it.id, { status: it.status, title: it.title, parent_id: it.parent_id });
  const proj = it.kind === 'project' ? it.id : it.parent_id;
  const add = (project_id, action, detail = '') => project_id && action && (S.ui.demoEvents ??= []).unshift({ id: uuid(), project_id, item_id: it.id, kind: it.kind, actor: meId(), action, title: it.title, detail, at: nowIso() });
  if (!prev) { if (!known) add(proj, 'created'); return; }
  if (prev.status !== it.status) add(proj, it.status === 'trashed' ? 'trashed' : prev.status === 'trashed' ? 'restored' : it.status === 'done' ? 'done' : prev.status === 'done' ? 'reopened' : null);
  if (prev.title !== it.title && prev.title) add(proj, 'renamed', prev.title);
  if (it.kind === 'task' && prev.parent_id !== it.parent_id) {
    add(it.parent_id, 'moved_in', S.items.get(prev.parent_id)?.title || '');
    add(prev.parent_id, 'moved_out', S.items.get(it.parent_id)?.title || '');
  }
}

export function saveItem(it, { render = true } = {}) {
  const known = S.items.get(it.id);
  const parent = it.parent_id && S.items.get(it.parent_id);
  if (known ? !canEdit(known) : parent && !canEdit(parent)) { denied(); return it; }
  if (isMine(it)) it.end_at = endAt(it);
  demoLog(it, known);
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
  if (!canEdit(it)) { denied(); return it; }
  Object.assign(it, p);
  return saveItem(it, opts);
}
export function savePrefs() {
  S.prefsDirty = true;
  persist();
  scheduleSync();
  queueRender();
}

// live / ofKind : mes éléments (planification personnelle) ; liveAll / ofKindAll y ajoutent ceux qu'on m'a partagés
export const liveAll = () => [...S.items.values()].filter(i => i.status !== 'trashed');
export const live = () => liveAll().filter(isMine);
export const ofKind = k => live().filter(i => i.kind === k);
export const ofKindAll = k => liveAll().filter(i => i.kind === k);
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
