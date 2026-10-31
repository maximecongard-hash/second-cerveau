'use strict';
(() => {
const VERSION = '0.2.0';
const CFG = window.SC_CONFIG || {};
const DEMO = new URLSearchParams(location.search).has('demo');
const LS_KEY = DEMO ? 'sc.demo.v1' : 'sc.v1';
const sb = !DEMO && window.supabase ? window.supabase.createClient(CFG.url, CFG.key) : null;

const DEFAULT_PREFS = {
  contexts: ['@maison', '@bureau', '@ordi', '@tél', '@courses', '@dehors'],
  lastReview: null,
  reminderShortcut: 'Rappel GTD',
  lastEvening: null,
  seeded: false,
  areasV2: false
};
const DEFAULT_AREAS = ['Sport', 'Finance', 'Travail / Carrière', 'Maison & Administratif', 'Santé',
  'Apprentissage', 'Relations', 'Loisirs & Voyages', 'Cuisine'];
const FIELDS = ['id', 'user_id', 'kind', 'status', 'title', 'body', 'url', 'image_path', 'parent_id',
  'contexts', 'tags', 'duration_min', 'energy', 'due_date', 'scheduled_date', 'scheduled_time',
  'day_order', 'waiting_for', 'recurrence', 'focus', 'outcome', 'review_date', 'source', 'completed_at', 'created_at'];
const TEXT_FIELDS = new Set(['title', 'body', 'waiting_for', 'tags', 'url', 'outcome']);
const NULLABLE = new Set(['parent_id', 'due_date', 'scheduled_date', 'scheduled_time', 'energy', 'recurrence', 'url', 'waiting_for', 'outcome', 'review_date']);

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => crypto.randomUUID();
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const nowIso = () => new Date().toISOString();
const FMT_DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const FMT_LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const FMT_TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function fmtDate(s) {
  if (!s) return '';
  const t = today();
  if (s === t) return "Aujourd'hui";
  if (s === addDays(t, 1)) return 'Demain';
  if (s === addDays(t, -1)) return 'Hier';
  return FMT_DAY.format(parseYmd(s));
}
function fmtDur(m) {
  if (!m) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h} h ${pad(r)}` : `${h} h`) : `${r} min`;
}
function fmtAgo(iso) {
  const ms = Date.now() - Date.parse(iso);
  const d = Math.floor(ms / 864e5);
  if (d <= 0) { const h = Math.floor(ms / 36e5); return h <= 0 ? "à l'instant" : `il y a ${h} h`; }
  return d === 1 ? 'hier' : `il y a ${d} j`;
}
function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } }
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

const I = {
  inbox: '<svg viewBox="0 0 24 24"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  list: '<svg viewBox="0 0 24 24"><circle cx="5" cy="6" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="5" cy="18" r="1.4"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'
};

// ---------------------------------------------------------------------------
// État local + persistance
// ---------------------------------------------------------------------------
const S = {
  user: null,
  uid: null,
  items: new Map(),
  prefs: { ...DEFAULT_PREFS },
  dirty: new Set(),
  prefsDirty: false,
  cursor: null,
  syncing: false,
  lastSync: null,
  lastError: null,
  ui: { day: today(), ctx: 'all', reorder: false, noteTag: null, noteQuery: '', search: '', preview: false, review: new Set(), tokens: undefined }
};

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 150);
}
function persistNow() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      uid: S.uid, items: [...S.items.values()], prefs: S.prefs, dirty: [...S.dirty],
      prefsDirty: S.prefsDirty, cursor: S.cursor, lastSync: S.lastSync
    }));
  } catch (e) { console.warn('persist', e); }
}
function restore() {
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
function resetLocal() {
  S.items = new Map(); S.dirty = new Set(); S.prefs = { ...DEFAULT_PREFS };
  S.prefsDirty = false; S.cursor = null; S.lastSync = null;
}

// ---------------------------------------------------------------------------
// Modèle
// ---------------------------------------------------------------------------
function newItem(fields = {}) {
  const now = nowIso();
  return {
    id: uuid(), user_id: S.user?.id || null, kind: 'inbox', status: 'active', title: '', body: '',
    url: null, image_path: null, parent_id: null, contexts: [], tags: [], duration_min: null,
    energy: null, due_date: null, scheduled_date: null, scheduled_time: null, day_order: null,
    waiting_for: null, recurrence: null, focus: null, outcome: null, review_date: null, source: 'app', completed_at: null,
    created_at: now, updated_at: now, ...fields
  };
}
function saveItem(it, { render = true } = {}) {
  it.updated_at = nowIso();
  S.items.set(it.id, it);
  S.dirty.add(it.id);
  persist();
  scheduleSync();
  if (render) queueRender();
  return it;
}
function patch(id, p, opts) {
  const it = S.items.get(id);
  if (!it) return null;
  Object.assign(it, p);
  return saveItem(it, opts);
}
function savePrefs() {
  S.prefsDirty = true;
  persist();
  scheduleSync();
  queueRender();
}

const live = () => [...S.items.values()].filter(i => i.status !== 'trashed');
const ofKind = k => live().filter(i => i.kind === k);
const byTitle = (a, b) => a.title.localeCompare(b.title, 'fr');
const inboxItems = () => ofKind('inbox').sort((a, b) => a.created_at.localeCompare(b.created_at));
const areas = () => ofKind('area').sort(byTitle);
const projectsBy = st => ofKind('project').filter(p => p.status === st).sort(byTitle);
function projectBlocked(t) {
  const p = t.parent_id && S.items.get(t.parent_id);
  return !!p && p.kind === 'project' && ['someday', 'done', 'trashed'].includes(p.status);
}
const nextActions = () => ofKind('task').filter(t => t.status === 'active' && !projectBlocked(t));
const hasNextAction = p => ofKind('task').some(t => t.parent_id === p.id && t.status === 'active');
function nextOrder(day) {
  const os = ofKind('task').filter(t => t.scheduled_date === day && t.day_order != null).map(t => t.day_order);
  return os.length ? Math.max(...os) + 1 : 1;
}
const topOf = day => ofKind('task').filter(t => t.scheduled_date === day && t.focus).sort((a, b) => a.focus - b.focus);
function toggleFocus(id, day) {
  const t = S.items.get(id);
  if (!t) return;
  if (t.focus && t.scheduled_date === day) { patch(id, { focus: null }); return; }
  const used = topOf(day).filter(x => x.id !== id).map(x => x.focus);
  const free = [1, 2, 3].find(n => !used.includes(n));
  if (!free) { toast('Top 3 déjà complet : retire d’abord une étoile'); return; }
  patch(id, { focus: free, scheduled_date: day, day_order: t.scheduled_date === day ? t.day_order : nextOrder(day) });
}
function migrateAreas() {
  const RENAME = { Pro: 'Travail / Carrière', Finances: 'Finance', Maison: 'Maison & Administratif' };
  const used = id => ofKind('project').some(p => p.parent_id === id);
  for (const a of areas()) {
    if (RENAME[a.title]) patch(a.id, { title: RENAME[a.title] }, { render: false });
    else if (a.title === 'Perso' && !used(a.id)) patch(a.id, { status: 'trashed' }, { render: false });
  }
  const have = new Set(areas().map(a => a.title));
  DEFAULT_AREAS.filter(t => !have.has(t)).forEach(t => saveItem(newItem({ kind: 'area', title: t }), { render: false }));
}
function itemTags(it) {
  const set = new Set(it.tags || []);
  for (const m of (it.body || '').matchAll(/(^|\s)#([\p{L}\d_-]+)/gu)) set.add(m[2]);
  return [...set];
}
function sortTasks(a, b) {
  const da = a.due_date || '9999', db = b.due_date || '9999';
  if (da !== db) return da.localeCompare(db);
  const sa = a.scheduled_date || '9999', sb2 = b.scheduled_date || '9999';
  if (sa !== sb2) return sa.localeCompare(sb2);
  return a.created_at.localeCompare(b.created_at);
}

function nextOccurrence(s, rec) {
  const d = parseYmd(s);
  switch (rec) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekdays': do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': {
      const day = d.getDate();
      d.setDate(1); d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      break;
    }
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  return ymd(d);
}
function spawnNext(t) {
  const base = t.scheduled_date || t.due_date || today();
  const next = nextOccurrence(base, t.recurrence);
  const shift = s => (s ? addDays(s, daysBetween(base, next)) : null);
  const copy = newItem({
    ...t, id: uuid(), status: 'active', completed_at: null, day_order: null, focus: null, created_at: nowIso(),
    scheduled_date: shift(t.scheduled_date), due_date: shift(t.due_date)
  });
  if (!t.scheduled_date && !t.due_date) copy.scheduled_date = next;
  saveItem(copy);
  return copy;
}
function complete(id) {
  const t = S.items.get(id);
  if (!t) return;
  if (t.status === 'done') { patch(id, { status: 'active', completed_at: null }); return; }
  const prev = t.status;
  patch(id, { status: 'done', completed_at: nowIso() });
  const spawned = t.recurrence ? spawnNext(t) : null;
  toast(spawned ? `Terminé · prochaine le ${fmtDate(spawned.scheduled_date || spawned.due_date)}` : 'Terminé', () => {
    patch(id, { status: prev, completed_at: null });
    if (spawned) patch(spawned.id, { status: 'trashed' });
  });
}

// ---------------------------------------------------------------------------
// Synchronisation Supabase
// ---------------------------------------------------------------------------
let syncTimer = null;
function scheduleSync(delay = 800) {
  if (DEMO) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, delay);
  setSyncState();
}
function toRow(it) {
  const r = {};
  for (const f of FIELDS) r[f] = it[f] ?? null;
  r.user_id = S.user.id;
  r.contexts = it.contexts || [];
  r.tags = it.tags || [];
  r.title = it.title || '';
  r.body = it.body || '';
  r.source = it.source || 'app';
  return r;
}
function fromRow(r) {
  return {
    ...r,
    contexts: r.contexts || [], tags: r.tags || [], body: r.body || '',
    scheduled_time: r.scheduled_time ? r.scheduled_time.slice(0, 5) : null
  };
}
async function sync() {
  if (DEMO || !sb || !S.user || S.syncing) return;
  if (!navigator.onLine) { setSyncState(); return; }
  S.syncing = true;
  setSyncState();
  let changed = false;
  try {
    // 1. envoi des modifications locales
    if (S.dirty.size) {
      const snap = new Map([...S.dirty].map(id => [id, S.items.get(id)?.updated_at]));
      const rows = [...snap.keys()].map(id => S.items.get(id)).filter(Boolean).map(toRow);
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from('items').upsert(rows.slice(i, i + 200));
        if (error) throw error;
      }
      for (const [id, v] of snap) if (S.items.get(id)?.updated_at === v) S.dirty.delete(id);
    }
    // 2. préférences
    if (S.prefsDirty) {
      const { error } = await sb.from('prefs').upsert({ user_id: S.user.id, data: S.prefs, updated_at: nowIso() });
      if (error) throw error;
      S.prefsDirty = false;
    } else {
      const { data, error } = await sb.from('prefs').select('data').maybeSingle();
      if (error) throw error;
      if (data?.data && JSON.stringify(data.data) !== JSON.stringify(S.prefs)) {
        S.prefs = { ...DEFAULT_PREFS, ...data.data };
        changed = true;
      }
    }
    // 3. réception des changements distants (avec 10 s de recouvrement)
    let since = S.cursor ? new Date(Date.parse(S.cursor) - 10000).toISOString() : null;
    for (;;) {
      let q = sb.from('items').select('*').order('updated_at', { ascending: true }).limit(1000);
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q;
      if (error) throw error;
      for (const r of data) {
        if (!S.cursor || r.updated_at > S.cursor) S.cursor = r.updated_at;
        if (S.dirty.has(r.id)) continue;
        const cur = S.items.get(r.id);
        if (cur && cur.updated_at === r.updated_at) continue;
        S.items.set(r.id, fromRow(r));
        changed = true;
      }
      if (data.length < 1000) break;
      since = data[data.length - 1].updated_at;
    }
    // 4. premier lancement : domaines par défaut
    if (!S.prefs.seeded) {
      if (!areas().length) DEFAULT_AREAS.forEach(t => saveItem(newItem({ kind: 'area', title: t }), { render: false }));
      S.prefs.seeded = true;
      S.prefs.areasV2 = true;
      S.prefsDirty = true;
      changed = true;
    }
    if (!S.prefs.areasV2) {
      migrateAreas();
      S.prefs.areasV2 = true;
      S.prefsDirty = true;
      changed = true;
    }
    S.lastError = null;
    S.lastSync = nowIso();
  } catch (e) {
    console.error('sync', e);
    S.lastError = /column|schema cache|violates check/i.test(e.message || '')
      ? 'base de données à mettre à jour (supabase/002_pack1.sql)'
      : (e.message || String(e));
  } finally {
    S.syncing = false;
    persist();
    setSyncState();
    if (changed) queueRender(true);
    if ((S.dirty.size || S.prefsDirty) && !S.lastError) scheduleSync(300);
  }
}
function syncClass() {
  if (DEMO) return 'demo';
  if (!navigator.onLine) return 'off';
  if (S.lastError) return 'err';
  if (S.syncing || S.dirty.size || S.prefsDirty) return 'busy';
  return 'ok';
}
function syncLabel() {
  return { demo: 'Mode démo (local)', off: 'Hors ligne : modifications gardées sur le téléphone', err: 'Erreur de synchro : ' + S.lastError,
    busy: 'Synchronisation…', ok: 'Synchronisé' }[syncClass()];
}
function setSyncState() {
  document.querySelectorAll('.sync').forEach(el => { el.className = 'sync ' + syncClass(); el.title = syncLabel(); });
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
const urlCache = new Map();
async function imageURL(path) {
  if (!path) return null;
  if (path.startsWith('data:')) return path;
  if (!sb) return null;
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await sb.storage.from('captures').createSignedUrl(path, 3600);
  if (error) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3500e3 });
  return data.signedUrl;
}
function hydrateImages(root) {
  root.querySelectorAll('img[data-img]').forEach(async img => {
    const u = await imageURL(img.dataset.img);
    if (u) img.src = u; else img.classList.add('missing');
  });
}
function resizeImage(file, max = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('Conversion impossible'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}
async function uploadImage(file) {
  const blob = await resizeImage(file, DEMO ? 800 : 1600);
  if (DEMO) return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  if (!navigator.onLine) throw new Error('Hors ligne : impossible d’envoyer la photo');
  const path = `${S.user.id}/${uuid()}.jpg`;
  const { error } = await sb.storage.from('captures').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

// ---------------------------------------------------------------------------
// Markdown minimal (titres, gras, italique, listes, liens, [[wikiliens]], #tags)
// ---------------------------------------------------------------------------
function inlineMd(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[\[([^\]]+)\]\]/g, (m, t) => `<a class="wiki" data-act="wiki" data-title="${t}">${t}</a>`)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/(^|\s)#([\p{L}\d_-]+)/gu, '$1<span class="tag">#$2</span>');
}
function md(src) {
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of esc(src || '').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { close(); out.push(`<h${m[1].length + 2}>${inlineMd(m[2])}</h${m[1].length + 2}>`); }
    else if ((m = line.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)$/i))) {
      if (list !== 'ul') { close(); out.push('<ul class="todo">'); list = 'ul'; }
      out.push(`<li class="${m[1] === ' ' ? '' : 'checked'}">${inlineMd(m[2])}</li>`);
    }
    else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inlineMd(m[1])}</li>`); }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inlineMd(m[1])}</li>`); }
    else if (!line.trim()) { close(); }
    else { close(); out.push(`<p>${inlineMd(line)}</p>`); }
  }
  close();
  return out.join('');
}
const plain = s => (s || '').replace(/[#*`>\[\]]/g, '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Composants
// ---------------------------------------------------------------------------
const empty = (title, sub = '') => `<div class="empty"><div class="empty-title">${title}</div>${sub ? `<div class="empty-sub">${sub}</div>` : ''}</div>`;
const sec = (title, inner, right = '') => `<section class="sec"><div class="sec-head"><h2>${title}</h2>${right}</div>${inner}</section>`;

function taskRow(t, o = {}) {
  const done = t.status === 'done';
  const meta = [];
  const p = t.parent_id && S.items.get(t.parent_id);
  if (p && p.status !== 'trashed' && !o.noProject) meta.push(`<span class="m-proj">${esc(p.title)}</span>`);
  if (t.status === 'waiting') meta.push(`<span class="m-wait">Attend : ${esc(t.waiting_for || '?')}</span>`);
  for (const c of t.contexts || []) meta.push(`<span class="m-ctx">${esc(c)}</span>`);
  if (o.showTime && t.scheduled_time) meta.push(`<span>${t.scheduled_time}</span>`);
  if (o.showSched && t.scheduled_date) meta.push(`<span class="${t.scheduled_date < today() && !done ? 'late' : ''}">Prévu ${fmtDate(t.scheduled_date).toLowerCase()}</span>`);
  if (t.duration_min) meta.push(`<span>${fmtDur(t.duration_min)}</span>`);
  if (t.due_date) meta.push(`<span class="m-due ${t.due_date <= today() && !done ? 'late' : ''}">Échéance ${fmtDate(t.due_date).toLowerCase()}</span>`);
  if (t.recurrence) meta.push('<span>↻</span>');
  if (t.image_path) meta.push('<span>Photo</span>');
  return `<div class="row task ${done ? 'done' : ''}" data-act="edit" data-id="${t.id}">
    <button class="check" data-act="toggle" data-id="${t.id}" aria-label="${done ? 'Rouvrir' : 'Terminer'}"></button>
    <div class="row-main"><div class="row-title">${esc(t.title) || '<i>Sans titre</i>'}</div>${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}</div>
    ${o.extra || ''}
  </div>`;
}
function noteRow(n) {
  const snippet = plain(n.body).slice(0, 110);
  const tags = itemTags(n);
  const p = n.parent_id && S.items.get(n.parent_id);
  return `<div class="row" data-act="edit" data-id="${n.id}">
    <div class="row-icon">${I.note}</div>
    <div class="row-main"><div class="row-title">${esc(n.title) || '<i>Sans titre</i>'}</div>
    ${snippet ? `<div class="row-snippet">${esc(snippet)}</div>` : ''}
    <div class="row-meta">${p ? `<span class="m-proj">${esc(p.title)}</span>` : ''}${tags.map(t => `<span class="m-tag">#${esc(t)}</span>`).join('')}<span>${fmtAgo(n.updated_at)}</span></div></div>
    ${n.image_path ? `<img class="thumb" data-img="${esc(n.image_path)}" alt="">` : ''}
  </div>`;
}
const starBtn = (t, day) => `<button class="star ${t.focus && t.scheduled_date === day ? 'on' : ''}" data-act="focus" data-id="${t.id}" aria-label="Top 3">${I.star}</button>`;
function projectRow(p) {
  const n = ofKind('task').filter(t => t.parent_id === p.id && (t.status === 'active' || t.status === 'waiting')).length;
  const warn = p.status === 'active' && !hasNextAction(p);
  const toReview = p.review_date && p.review_date <= today() && p.status !== 'done';
  return `<a class="row" href="#/project/${p.id}">
    <div class="row-icon proj ${p.status}">${I.folder}</div>
    <div class="row-main"><div class="row-title">${esc(p.title) || '<i>Sans titre</i>'}</div>
    <div class="row-meta"><span>${plural(n, 'action', 'actions')}</span>${p.due_date ? `<span class="m-due ${p.due_date <= today() ? 'late' : ''}">Échéance ${fmtDate(p.due_date).toLowerCase()}</span>` : ''}${warn ? '<span class="warn">Pas de prochaine action</span>' : ''}${toReview ? '<span class="warn">À revoir</span>' : ''}</div>
    ${p.outcome ? `<div class="row-snippet">${esc(p.outcome)}</div>` : ''}</div>
    <span class="chev">${I.right}</span>
  </a>`;
}
function anyRow(it) {
  if (it.kind === 'task') return taskRow(it, { showSched: true });
  if (it.kind === 'note') return noteRow(it);
  if (it.kind === 'project') return projectRow(it);
  const label = { inbox: 'Inbox', area: 'Domaine' }[it.kind];
  return `<div class="row" data-act="edit" data-id="${it.id}"><div class="row-main"><div class="row-title">${esc(it.title) || '<i>Sans titre</i>'}</div><div class="row-meta"><span>${label}</span></div></div></div>`;
}
const chip = (label, on, act, v, extra = '') => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}">${label}${extra}</button>`;

// ---------------------------------------------------------------------------
// Vues
// ---------------------------------------------------------------------------
const VIEWS = {};

VIEWS.inbox = () => {
  const list = inboxItems();
  const html = list.length
    ? `<a class="btn primary block" href="#/clarify">Trier l'Inbox (${list.length})</a>
       <div class="list">${list.map(it => `<div class="row" data-act="clarify-one" data-id="${it.id}">
          <div class="row-main"><div class="row-title">${esc(it.title) || '<i>Sans titre</i>'}</div>
          <div class="row-meta">${it.url ? `<span>${esc(domain(it.url))}</span>` : ''}${it.source === 'shortcut' ? '<span>Raccourci</span>' : ''}<span>${fmtAgo(it.created_at)}</span></div></div>
          ${it.image_path ? `<img class="thumb" data-img="${esc(it.image_path)}" alt="">` : ''}
        </div>`).join('')}</div>`
    : empty('Inbox vide', 'Capture une idée avec le raccourci iPhone ou le bouton +.');
  return { title: 'Inbox', html, fab: 'capture' };
};

VIEWS.clarify = arg => {
  const list = inboxItems();
  if (!list.length) return { title: 'Trier', html: empty('Tout est trié', '<a class="btn primary" href="#/today">Planifier ma journée</a>') };
  const it = (arg && list.find(i => i.id === arg)) || list[0];
  const btn = (v, label, sub, cls = '') => `<button class="clar ${cls}" data-act="clar" data-v="${v}" data-id="${it.id}"><b>${label}</b><span>${sub}</span></button>`;
  return {
    title: 'Trier',
    html: `<div class="clarify">
      <div class="muted small center">${plural(list.length, 'élément', 'éléments')} à trier</div>
      <div class="card">
        <textarea class="clar-title" rows="2" data-inline="title" data-id="${it.id}" aria-label="Titre">${esc(it.title)}</textarea>
        ${it.body ? `<div class="md">${md(it.body)}</div>` : ''}
        ${it.url ? `<a class="link-card" href="${esc(it.url)}" target="_blank" rel="noopener">${I.link}<span>${esc(domain(it.url))}</span></a>` : ''}
        ${it.image_path ? `<img class="cap-img" data-img="${esc(it.image_path)}" alt="">` : ''}
        <div class="muted small">Capturé ${fmtAgo(it.created_at)}${it.source === 'shortcut' ? ' · raccourci' : ''}</div>
      </div>
      <h3 class="q">Qu'est-ce que c'est ?</h3>
      <div class="clar-grid">
        ${btn('done', 'Fait', 'moins de 2 min, fais-le')}
        ${btn('today', "Aujourd'hui", 'à faire dans la journée')}
        ${btn('task', 'Prochaine action', 'à faire bientôt')}
        ${btn('project', 'Projet', 'plusieurs étapes')}
        ${btn('waiting', 'En attente', 'quelqu’un d’autre')}
        ${btn('someday', 'Un jour', 'peut-être, plus tard')}
        ${btn('note', 'Note', 'idée, référence')}
        ${btn('trash', 'Supprimer', 'pas utile', 'danger')}
      </div>
    </div>`
  };
};

VIEWS.today = () => {
  const day = S.ui.day, t0 = today(), isToday = day === t0;
  const ts = ofKind('task');
  const late = isToday ? ts.filter(t => t.status === 'active' && t.scheduled_date && t.scheduled_date < day).sort(sortTasks) : [];
  const due = isToday ? ts.filter(t => t.status === 'active' && t.due_date && t.due_date <= day && t.scheduled_date !== day && !(t.scheduled_date && t.scheduled_date < day)).sort(sortTasks) : [];
  const planned = ts.filter(t => t.scheduled_date === day && (t.status === 'active' || t.status === 'waiting'));
  const top = topOf(day).filter(t => t.status !== 'someday');
  const timed = planned.filter(t => t.scheduled_time && !t.focus).sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
  const untimed = planned.filter(t => !t.scheduled_time && !t.focus).sort((a, b) => (a.day_order ?? 1e15) - (b.day_order ?? 1e15) || a.created_at.localeCompare(b.created_at));
  const doneDay = ts.filter(t => t.status === 'done' && !(t.focus && t.scheduled_date === day) && (t.scheduled_date === day || (t.completed_at && ymd(new Date(t.completed_at)) === day)));
  const total = planned.reduce((s, t) => s + (t.duration_min || 0), 0);

  let html = `<div class="daynav">
      <button class="icon-btn" data-act="day" data-d="-1" aria-label="Jour précédent">${I.left}</button>
      <button class="daylabel" data-act="day" data-d="0">${cap(FMT_LONG.format(parseYmd(day)))}${isToday ? '' : `<small>${fmtDate(day)}</small>`}</button>
      <button class="icon-btn" data-act="day" data-d="1" aria-label="Jour suivant">${I.right}</button>
    </div>
    <div class="summary">${plural(planned.length, 'tâche', 'tâches')}${total ? ` · ${fmtDur(total)} estimées` : ''}${doneDay.length ? ` · ${doneDay.length} faite${doneDay.length > 1 ? 's' : ''}` : ''}</div>`;

  const inboxN = inboxItems().length;
  if (isToday && inboxN) html += `<a class="banner" href="#/clarify">${plural(inboxN, 'élément', 'éléments')} dans l'Inbox à trier</a>`;
  const lr = S.prefs.lastReview;
  if (isToday && (!lr || daysBetween(lr, t0) >= 7)) html += `<a class="banner soft" href="#/review">Revue hebdo ${lr ? `(dernière ${fmtAgo(parseYmd(lr).toISOString())})` : 'jamais faite'}</a>`;
  if (isToday && new Date().getHours() >= 17 && S.prefs.lastEvening !== t0) html += `<a class="banner evening" href="#/evening">${I.moon} Revue du soir · 5 min</a>`;

  const topDone = top.filter(t => t.status === 'done').length;
  html += sec(`Top 3${top.length ? ` <small>${topDone}/${top.length}</small>` : ''}`,
    top.length ? `<div class="top3">${top.map(t => taskRow(t, { showTime: true, extra: starBtn(t, day) })).join('')}</div>`
      : `<div class="muted pad small">Les 3 tâches qui feront de ${isToday ? 'cette journée' : 'ce jour'} une réussite. Touche l’étoile d’une tâche.</div>`);
  if (late.length) html += sec('En retard', late.map(t => taskRow(t, { showSched: true })).join(''), `<button class="link" data-act="carry">Tout mettre aujourd'hui</button>`);
  if (due.length) html += sec('Échéances', due.map(t => taskRow(t, { extra: planBtn(t) })).join(''));
  if (timed.length) html += sec('Agenda', `<div class="timeline">${timed.map(t => `<div class="slot"><div class="slot-time">${t.scheduled_time}</div>${taskRow(t, { extra: starBtn(t, day) })}</div>`).join('')}</div>`);

  const reorderBtn = untimed.length > 1 ? `<button class="link" data-act="reorder">${S.ui.reorder ? 'OK' : 'Réordonner'}</button>` : '';
  const rows = untimed.map((t, i) => taskRow(t, {
    extra: !S.ui.reorder ? starBtn(t, day) : `<div class="reorder"><button class="icon-btn" data-act="move" data-dir="-1" data-id="${t.id}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">${I.up}</button><button class="icon-btn" data-act="move" data-dir="1" data-id="${t.id}" ${i === untimed.length - 1 ? 'disabled' : ''} aria-label="Descendre">${I.down}</button></div>`
  })).join('');
  html += sec('À faire', (rows || `<div class="muted pad">Rien de prévu. Choisis parmi tes prochaines actions.</div>`) +
    `<form class="inline-add" data-form="add-day"><input id="add-day" placeholder="+ Ajouter une tâche pour ce jour" enterkeyhint="done" autocomplete="off"></form>
     <button class="btn block" data-act="pick-open">Choisir dans mes prochaines actions</button>`, reorderBtn);

  if (doneDay.length) html += `<details class="done-sec"><summary>${plural(doneDay.length, 'tâche terminée', 'tâches terminées')}</summary>${doneDay.map(t => taskRow(t)).join('')}</details>`;
  return { title: isToday ? "Aujourd'hui" : fmtDate(day), html, fab: 'today' };
};
const planBtn = t => (t.scheduled_date === S.ui.day ? '' : `<button class="plan-btn" data-act="plan" data-id="${t.id}" aria-label="Prévoir aujourd'hui">${I.sun}</button>`);

VIEWS.actions = () => {
  const ctx = S.ui.ctx;
  const all = nextActions();
  let list = all;
  if (ctx === 'none') list = list.filter(t => !t.contexts.length);
  else if (ctx !== 'all') list = list.filter(t => t.contexts.includes(ctx));
  list = list.sort(sortTasks);
  const count = c => all.filter(t => t.contexts.includes(c)).length;
  const ctxs = [...new Set([...S.prefs.contexts, ...all.flatMap(t => t.contexts)])];
  const chips = `<div class="chips scroll">${chip('Toutes', ctx === 'all', 'ctx-filter', 'all', ` <small>${all.length}</small>`)}${ctxs.map(c => chip(esc(c), ctx === c, 'ctx-filter', c, ` <small>${count(c)}</small>`)).join('')}${chip('Sans contexte', ctx === 'none', 'ctx-filter', 'none')}</div>`;
  const t0 = today();
  const rows = list.map(t => taskRow(t, { showSched: t.scheduled_date !== t0, extra: t.scheduled_date === t0 ? '<span class="today-tag">Auj.</span>' : `<button class="plan-btn" data-act="plan-today" data-id="${t.id}" aria-label="Prévoir aujourd'hui">${I.sun}</button>` })).join('');
  return { title: 'Prochaines actions', html: chips + (rows ? `<div class="list">${rows}</div>` : empty('Aucune action ici', 'Trie ton Inbox ou ajoute une action avec +.')), fab: 'task' };
};

VIEWS.projects = () => {
  const act = projectsBy('active');
  const groups = areas().map(a => [a, act.filter(p => p.parent_id === a.id)]).filter(([, ps]) => ps.length);
  const orphan = act.filter(p => !p.parent_id || !S.items.get(p.parent_id) || S.items.get(p.parent_id).kind !== 'area' || S.items.get(p.parent_id).status === 'trashed');
  const clar = projectsBy('clarify');
  let html = clar.length ? sec('À clarifier', clar.map(projectRow).join('')) : '';
  html += groups.map(([a, ps]) => sec(esc(a.title), ps.map(projectRow).join(''))).join('');
  if (orphan.length) html += sec(groups.length ? 'Sans domaine' : 'Projets actifs', orphan.map(projectRow).join(''));
  if (!act.length && !clar.length) html += empty('Aucun projet actif', 'Un projet = tout résultat qui demande plus d’une action.');
  const some = projectsBy('someday'), done = projectsBy('done');
  if (some.length) html += `<details class="done-sec"><summary>Un jour / peut-être (${some.length})</summary>${some.map(projectRow).join('')}</details>`;
  if (done.length) html += `<details class="done-sec"><summary>Terminés (${done.length})</summary>${done.map(projectRow).join('')}</details>`;
  return { title: 'Projets', html, fab: 'project' };
};

VIEWS.project = id => {
  const p = S.items.get(id);
  if (!p || p.status === 'trashed') return { title: 'Projet', html: empty('Projet introuvable', '<a class="btn" href="#/projects">Retour aux projets</a>') };
  const ts = ofKind('task').filter(t => t.parent_id === id);
  const active = ts.filter(t => t.status === 'active').sort(sortTasks);
  const waiting = ts.filter(t => t.status === 'waiting');
  const some = ts.filter(t => t.status === 'someday');
  const done = ts.filter(t => t.status === 'done').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
  const notes = ofKind('note').filter(n => n.parent_id === id).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const area = p.parent_id && S.items.get(p.parent_id);
  const statusLabel = { active: 'Actif', someday: 'Un jour', done: 'Terminé', waiting: 'En attente', clarify: 'À clarifier' }[p.status];
  let html = `<a class="back" href="#/projects">${I.left} Projets</a>
    <div class="proj-head">
      <h2 class="proj-title">${esc(p.title) || '<i>Sans titre</i>'}</h2>
      <div class="row-meta"><span>${statusLabel}</span>${area ? `<span class="m-proj">${esc(area.title)}</span>` : ''}${p.due_date ? `<span class="m-due">Échéance ${fmtDate(p.due_date).toLowerCase()}</span>` : ''}${p.review_date ? `<span class="${p.review_date <= today() ? 'warn' : ''}">Revue ${fmtDate(p.review_date).toLowerCase()}</span>` : ''}</div>
      ${p.outcome ? `<div class="outcome"><span>Résultat attendu</span>${esc(p.outcome)}</div>` : ''}
      ${p.body ? `<div class="md">${md(p.body)}</div>` : ''}
      <div class="btn-row"><button class="btn" data-act="edit" data-id="${p.id}">Modifier</button>${p.status !== 'done' ? `<button class="btn" data-act="proj-done" data-id="${p.id}">Projet terminé</button>` : ''}</div>
    </div>`;
  if (p.status === 'clarify') html += `<div class="banner warn">À clarifier : précise le résultat attendu et la prochaine action, puis passe le projet en Actif. <button class="link" data-act="proj-activate" data-id="${p.id}">Activer</button></div>`;
  else if (p.status === 'active' && !active.length) html += `<div class="banner warn">Aucune prochaine action : quelle est la prochaine étape concrète ?</div>`;
  html += sec('Actions', active.map(t => taskRow(t, { noProject: true, showSched: true })).join('') +
    `<form class="inline-add" data-form="add-proj" data-id="${p.id}"><input id="add-proj" placeholder="+ Ajouter une action" enterkeyhint="done" autocomplete="off"></form>`);
  if (waiting.length) html += sec('En attente', waiting.map(t => taskRow(t, { noProject: true })).join(''));
  if (some.length) html += sec('Un jour / peut-être', some.map(t => taskRow(t, { noProject: true })).join(''));
  html += sec('Notes', notes.map(noteRow).join('') || '<div class="muted pad">Aucune note.</div>', `<button class="link" data-act="new-note" data-id="${p.id}">+ Note</button>`);
  if (done.length) html += `<details class="done-sec"><summary>${plural(done.length, 'action terminée', 'actions terminées')}</summary>${done.map(t => taskRow(t, { noProject: true })).join('')}</details>`;
  return { title: 'Projet', html, fab: 'proj-task:' + p.id };
};

function notesList() {
  const q = S.ui.noteQuery.trim().toLowerCase();
  let list = ofKind('note');
  if (S.ui.noteTag) list = list.filter(n => itemTags(n).includes(S.ui.noteTag));
  if (q) list = list.filter(n => (n.title + ' ' + n.body + ' ' + itemTags(n).join(' ')).toLowerCase().includes(q));
  list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return list.length ? list.map(noteRow).join('') : empty(q || S.ui.noteTag ? 'Aucune note trouvée' : 'Aucune note', q ? '' : 'Ton second cerveau commence ici : idées, références, apprentissages.');
}
VIEWS.notes = () => {
  const tags = [...new Set(ofKind('note').flatMap(itemTags))].sort((a, b) => a.localeCompare(b, 'fr'));
  return {
    title: 'Notes',
    html: `<input id="note-q" class="search" type="search" placeholder="Rechercher dans les notes" value="${esc(S.ui.noteQuery)}" data-live="notes" autocomplete="off">
      ${tags.length ? `<div class="chips scroll">${tags.map(t => chip('#' + esc(t), S.ui.noteTag === t, 'note-tag', t)).join('')}</div>` : ''}
      <div id="notes-list" class="list">${notesList()}</div>`,
    fab: 'note'
  };
};

VIEWS.waiting = () => {
  const list = ofKind('task').filter(t => t.status === 'waiting').sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { title: 'En attente', html: list.length ? `<div class="list">${list.map(t => taskRow(t, { extra: `<span class="muted small">${fmtAgo(t.created_at)}</span>` })).join('')}</div>` : empty('Rien en attente', 'Ce que tu as délégué ou attends de quelqu’un apparaîtra ici.') };
};

VIEWS.someday = () => {
  const list = live().filter(i => i.status === 'someday' && (i.kind === 'task' || i.kind === 'project')).sort(byTitle);
  const act = it => `<button class="link" data-act="activate" data-id="${it.id}">Activer</button>`;
  return {
    title: 'Un jour / peut-être',
    html: list.length ? `<div class="list">${list.map(it => it.kind === 'task' ? taskRow(it, { extra: act(it) }) : `<div class="row-wrap">${projectRow(it)}${act(it)}</div>`).join('')}</div>` : empty('Liste vide', 'Les envies et idées « plus tard » arriveront ici.')
  };
};

VIEWS.logbook = () => {
  const list = live().filter(i => i.status === 'done' && i.completed_at).sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, 150);
  const groups = new Map();
  for (const it of list) { const d = ymd(new Date(it.completed_at)); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(it); }
  const html = [...groups].map(([d, its]) => sec(cap(fmtDate(d)), its.map(it => it.kind === 'project' ? projectRow(it) : taskRow(it)).join(''))).join('');
  return { title: 'Terminé', html: html || empty('Rien de terminé pour l’instant') };
};

VIEWS.review = () => {
  const r = S.ui.review;
  const noNext = projectsBy('active').filter(p => !hasNextAction(p));
  const clar = projectsBy('clarify');
  const dueReview = ofKind('project').filter(p => p.review_date && p.review_date <= today() && p.status !== 'done');
  const waitingN = ofKind('task').filter(t => t.status === 'waiting').length;
  const someN = live().filter(i => i.status === 'someday').length;
  const lateN = ofKind('task').filter(t => t.status === 'active' && ((t.scheduled_date && t.scheduled_date < today()) || (t.due_date && t.due_date < today()))).length;
  const step = (k, title, desc) => `<div class="step ${r.has(k) ? 'ok' : ''}"><button class="check" data-act="review-check" data-v="${k}" aria-label="Valider"></button><div class="row-main"><div class="row-title">${title}</div><div class="step-desc">${desc}</div></div></div>`;
  const steps = [
    step('collect', 'Rassembler', 'Notes papier, mails, messages, idées en tête : tout dans l’Inbox.'),
    step('inbox', 'Vider l’Inbox', `${plural(inboxItems().length, 'élément', 'éléments')} à trier. <a href="#/clarify">Trier</a>`),
    step('late', 'Retards et échéances', `${plural(lateN, 'tâche', 'tâches')} en retard ou échue(s). <a href="#/today">Voir</a>`),
    step('calendar', 'Calendrier', 'Revois la semaine passée et les 2 semaines à venir : quelque chose à préparer ?'),
    step('actions', 'Prochaines actions', 'Coche ce qui est fait, supprime ce qui n’a plus de sens. <a href="#/actions">Voir</a>'),
    step('projects', 'Projets', [
      noNext.length ? `Sans prochaine action : ${noNext.map(p => `<a href="#/project/${p.id}">${esc(p.title)}</a>`).join(', ')}` : 'Chaque projet actif a une prochaine action.',
      clar.length ? `À clarifier : ${clar.map(p => `<a href="#/project/${p.id}">${esc(p.title)}</a>`).join(', ')}` : '',
      dueReview.length ? `Date de revue atteinte : ${dueReview.map(p => `<a href="#/project/${p.id}">${esc(p.title)}</a>`).join(', ')}` : ''
    ].filter(Boolean).join('<br>')),
    step('waiting', 'En attente', `${waitingN} élément(s). Faut-il relancer quelqu’un ? <a href="#/waiting">Voir</a>`),
    step('someday', 'Un jour / peut-être', `${someN} élément(s). Quelque chose à activer ? <a href="#/someday">Voir</a>`),
    step('ideas', 'Nouvelles idées', 'Une dernière minute pour capturer ce qui te vient.')
  ].join('');
  const last = S.prefs.lastReview ? `Dernière revue : ${fmtDate(S.prefs.lastReview).toLowerCase()}` : 'Première revue';
  return { title: 'Revue hebdo', html: `<div class="muted small pad">${last}</div><div class="list">${steps}</div><button class="btn primary block" data-act="review-done">Revue terminée</button>` };
};

VIEWS.evening = () => {
  const t0 = today();
  const open = ofKind('task').filter(t => (t.status === 'active' || t.status === 'waiting') && t.scheduled_date && t.scheduled_date <= t0)
    .sort((a, b) => (a.focus || 9) - (b.focus || 9) || a.scheduled_date.localeCompare(b.scheduled_date) || (a.day_order ?? 1e15) - (b.day_order ?? 1e15));
  const doneToday = ofKind('task').filter(t => t.status === 'done' && t.completed_at && ymd(new Date(t.completed_at)) === t0);
  const top = topOf(t0);
  const inboxN = inboxItems().length;
  const card = t => `<div class="ev-card">${taskRow(t, { showSched: t.scheduled_date < t0 })}
    <div class="ev-actions">
      <button class="chip" data-act="ev" data-v="done" data-id="${t.id}">Fait</button>
      <button class="chip" data-act="ev" data-v="tomorrow" data-id="${t.id}">Demain</button>
      <button class="chip" data-act="ev" data-v="next" data-id="${t.id}">Sans date</button>
      <button class="chip" data-act="ev" data-v="waiting" data-id="${t.id}">En attente</button>
      <input type="date" class="ev-date" data-evdate="${t.id}" min="${addDays(t0, 1)}" aria-label="Autre date">
    </div></div>`;
  let html = `<div class="ev-summary"><div><b>${doneToday.length}</b><span>faite${doneToday.length > 1 ? 's' : ''}</span></div>
      <div><b>${top.filter(t => t.status === 'done').length}/${top.length || 0}</b><span>Top 3</span></div>
      <div><b>${open.length}</b><span>restante${open.length > 1 ? 's' : ''}</span></div></div>`;
  html += sec('1. Ce qui reste', open.length ? open.map(card).join('') + (open.length > 1 ? `<button class="btn block" data-act="ev-all">Tout reporter à demain</button>` : '')
    : '<div class="muted pad">Tout est traité ✓</div>');
  html += sec('2. Inbox', inboxN ? `<a class="btn block" href="#/clarify">Trier ${plural(inboxN, 'élément', 'éléments')}</a>` : '<div class="muted pad">Inbox vide ✓</div>');
  html += sec('3. Demain', `<div class="muted pad small">${plural(ofKind('task').filter(t => t.scheduled_date === addDays(t0, 1) && t.status === 'active').length, 'tâche prévue', 'tâches prévues')}. Choisis ton Top 3 dès maintenant pour démarrer vite.</div>
    <button class="btn block" data-act="plan-tomorrow">Préparer demain</button>`);
  html += `<button class="btn primary block" data-act="evening-done">Revue du soir terminée</button>`;
  return { title: 'Revue du soir', html };
};

VIEWS.search = () => ({
  title: 'Recherche',
  html: `<input id="search-q" class="search" type="search" placeholder="Tâches, projets, notes…" value="${esc(S.ui.search)}" data-live="search" autocomplete="off">
    <div id="search-results" class="list">${searchResults()}</div>`
});
function searchResults() {
  const q = S.ui.search.trim().toLowerCase();
  if (!q) return '<div class="muted pad">Tape pour chercher partout.</div>';
  const res = live().filter(i => i.kind !== 'area' && (i.title + ' ' + i.body + ' ' + (i.tags || []).join(' ') + ' ' + (i.url || '')).toLowerCase().includes(q))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 80);
  return res.length ? res.map(anyRow).join('') : empty('Aucun résultat');
}

VIEWS.settings = () => {
  if (!DEMO && S.ui.tokens === undefined) { S.ui.tokens = null; loadTokens(); }
  const tokens = S.ui.tokens;
  const tokenHtml = DEMO ? '<div class="muted pad">Indisponible en mode démo.</div>'
    : tokens === null ? '<div class="muted pad">Chargement…</div>'
    : (tokens.length ? tokens.map(t => `<div class="kv"><code class="token">${esc(t.token)}</code><div class="btn-row"><button class="btn" data-act="copy" data-v="${esc(t.token)}">Copier</button><button class="btn danger" data-act="token-del" data-v="${esc(t.token)}">Révoquer</button></div></div>`).join('')
      : '<div class="muted pad">Aucun jeton. Génère-en un pour tes raccourcis.</div>') +
      `<button class="btn block" data-act="token-new">Générer un jeton</button>${S.ui.tokenErr ? `<div class="err pad">${esc(S.ui.tokenErr)}</div>` : ''}`;
  const html =
    sec('Compte', `<div class="kv"><span>${esc(S.user.email)}</span><span class="sync ${syncClass()}"></span></div>
      <div class="muted small pad">${syncLabel()}${S.lastSync ? ` · dernière synchro ${FMT_TIME.format(new Date(S.lastSync))}` : ''}</div>
      <div class="btn-row">${DEMO ? '' : '<button class="btn" data-act="sync-now">Synchroniser</button><button class="btn danger" data-act="logout">Se déconnecter</button>'}</div>`) +
    sec('Contextes', `<div class="chips wrap">${S.prefs.contexts.map(c => `<span class="chip on">${esc(c)}<button class="x" data-act="ctx-del" data-v="${esc(c)}" aria-label="Retirer">×</button></span>`).join('')}</div>
      <form class="inline-add" data-form="ctx-add"><input id="ctx-add" placeholder="+ Nouveau contexte (ex. @voiture)" autocomplete="off"></form>`) +
    sec('Domaines de vie', areas().map(a => `<div class="row" data-act="edit" data-id="${a.id}"><div class="row-main"><div class="row-title">${esc(a.title)}</div></div><span class="chev">${I.right}</span></div>`).join('') +
      `<form class="inline-add" data-form="area-add"><input id="area-add" placeholder="+ Nouveau domaine" autocomplete="off"></form>`) +
    sec('Capture iPhone', `<div class="muted small pad">Valeurs à coller dans tes raccourcis (voir le guide).</div>
      <div class="kv"><span>URL du projet</span><button class="btn" data-act="copy" data-v="${esc(CFG.url)}">Copier</button></div>
      <div class="kv"><span>Clé publique</span><button class="btn" data-act="copy" data-v="${esc(CFG.key)}">Copier</button></div>
      <div class="muted small pad">Jeton de capture (secret, ne le partage pas) :</div>${tokenHtml}`) +
    sec('Rappels Apple', `<div class="muted small pad">Nom du raccourci qui crée un rappel :</div>
      <form class="inline-add" data-form="reminder-name"><input id="reminder-name" value="${esc(S.prefs.reminderShortcut)}" autocomplete="off"></form>`) +
    sec('Données', `<div class="btn-row"><button class="btn" data-act="export">Exporter (JSON)</button><a class="btn" href="#/logbook">Terminé</a></div>
      <div class="muted small pad">Version ${VERSION}${DEMO ? ' · mode démo' : ''}</div>`);
  return { title: 'Réglages', html };
};
async function loadTokens() {
  const { data, error } = await sb.from('capture_tokens').select('token, created_at').order('created_at');
  S.ui.tokens = error ? [] : data;
  S.ui.tokenErr = error ? error.message : null;
  queueRender();
}

function viewLogin(msg = '') {
  return `<div class="login">
    <div class="login-logo"><img src="icons/icon-192.png" alt=""></div>
    <h1>Second Cerveau</h1>
    <p class="muted">Capture. Trie. Planifie.</p>
    <form data-form="login">
      <input type="email" id="login-email" autocomplete="username" placeholder="Email" required>
      <input type="password" id="login-pass" autocomplete="current-password" placeholder="Mot de passe" required>
      <button class="btn primary block" type="submit">Se connecter</button>
      <p class="err" id="login-err">${esc(msg)}</p>
    </form>
  </div>`;
}

// ---------------------------------------------------------------------------
// Rendu principal
// ---------------------------------------------------------------------------
const app = $('#app');
const TABS = [['inbox', 'Inbox', I.inbox], ['today', "Aujourd'hui", I.sun], ['actions', 'Actions', I.list], ['projects', 'Projets', I.folder], ['notes', 'Notes', I.note]];
const TAB_OF = { clarify: 'inbox', project: 'projects', evening: 'today' };
function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: VIEWS[name] ? name : 'today', arg };
}
let renderQueued = false, pendingSyncRender = false, lastRouteKey = '';
function queueRender(fromSync = false) {
  if (fromSync) {
    const a = document.activeElement;
    if (a && app.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { pendingSyncRender = true; return; }
  }
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
function render() {
  if (!S.user) { app.innerHTML = viewLogin(); return; }
  const r = route();
  const key = r.name + '/' + (r.arg || '');
  const v = VIEWS[r.name](r.arg);
  const keep = key === lastRouteKey ? window.scrollY : 0;
  const focusId = document.activeElement && app.contains(document.activeElement) ? document.activeElement.id : null;
  const inboxN = inboxItems().length;
  const active = TAB_OF[r.name] || r.name;
  app.innerHTML = `<header class="top"><h1>${esc(v.title)}</h1><div class="top-actions">
      <span class="sync ${syncClass()}" title="${esc(syncLabel())}"></span>
      <a class="icon-btn" href="#/search" aria-label="Rechercher">${I.search}</a>
      <button class="icon-btn" data-act="menu" aria-label="Menu">${I.menu}</button></div></header>
    <main id="main">${v.html}</main>
    ${v.fab ? `<button class="fab" data-act="fab" data-v="${v.fab}" aria-label="Ajouter">${I.plus}</button>` : ''}
    <nav class="tabs">${TABS.map(([k, l, ic]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}">${ic}<span>${l}</span>${k === 'inbox' && inboxN ? `<b class="badge">${inboxN}</b>` : ''}</a>`).join('')}</nav>`;
  hydrateImages(app);
  window.scrollTo(0, keep);
  lastRouteKey = key;
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus({ preventScroll: true }); }
}
app.addEventListener('focusout', () => { if (pendingSyncRender) { pendingSyncRender = false; setTimeout(() => queueRender(true), 50); } });

// ---------------------------------------------------------------------------
// Feuilles (éditeur, capture, sélection, menu)
// ---------------------------------------------------------------------------
let sheetMode = null, editingId = null, sheetGen = 0, capPreset = null, pickSel = new Set(), draftId = null;
const sheet = $('#sheet'), sheetWrap = $('#sheet-wrap');
function showSheet() {
  sheetGen++;
  sheetWrap.hidden = false;
  requestAnimationFrame(() => sheetWrap.classList.add('open'));
  document.body.classList.add('noscroll');
}
function closeSheet() {
  if (sheetMode === 'editor' && draftId) {
    const d = S.items.get(draftId);
    if (d && !d.title.trim() && !d.body.trim() && !d.image_path) patch(d.id, { status: 'trashed' }, { render: false });
  }
  draftId = null;
  const gen = ++sheetGen;
  sheetWrap.classList.remove('open');
  document.body.classList.remove('noscroll');
  setTimeout(() => { if (gen === sheetGen) { sheetWrap.hidden = true; sheet.innerHTML = ''; } }, 220);
  sheetMode = null; editingId = null;
  queueRender();
}

const fRow = (label, inner) => `<div class="f-row"><label>${label}</label><div class="f-val">${inner}</div></div>`;
const seg = (f, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(cur ?? '') === String(v) ? 'on' : ''}" data-act="set" data-f="${f}" data-v="${v}">${l}</button>`).join('')}</div>`;
const sel = (f, cur, opts) => `<select data-f="${f}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

function projectOptions(cur) {
  const ps = ofKind('project').filter(p => ['active', 'someday', 'clarify'].includes(p.status) || p.id === cur).sort(byTitle);
  return [['', 'Aucun'], ...ps.map(p => [p.id, p.title + (p.status === 'someday' ? ' (un jour)' : '')])];
}
function media(it) {
  return `${it.image_path ? `<img class="cap-img" data-img="${esc(it.image_path)}" alt="">` : ''}${it.url ? `<a class="link-card" href="${esc(it.url)}" target="_blank" rel="noopener">${I.link}<span>${esc(domain(it.url))}</span></a>` : ''}`;
}
function editorHead(it) {
  const kinds = [['task', 'Tâche'], ['project', 'Projet'], ['note', 'Note']];
  const mid = it.kind === 'area' ? '<span class="sheet-kind">Domaine</span>'
    : `<div class="seg small">${kinds.map(([v, l]) => `<button class="${it.kind === v ? 'on' : ''}" data-act="kind" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<div class="sheet-head"><button class="link strong" data-act="close">OK</button>${mid}<button class="link danger" data-act="trash" data-id="${it.id}">Supprimer</button></div>`;
}
function editorHTML(it) {
  const head = editorHead(it);
  const title = ph => `<input class="title-input" data-f="title" id="f-title" value="${esc(it.title)}" placeholder="${ph}" autocomplete="off">`;
  const tagsF = fRow('Tags', `<input data-f="tags" value="${esc((it.tags || []).join(', '))}" placeholder="séparés par des virgules" autocomplete="off">`);
  const urlF = fRow('Lien', `<input type="url" data-f="url" value="${esc(it.url || '')}" placeholder="https://" autocomplete="off">`);

  if (it.kind === 'area') {
    const n = ofKind('project').filter(p => p.parent_id === it.id).length;
    return head + title('Nom du domaine') + `<div class="muted small pad">${plural(n, 'projet', 'projets')}</div>`;
  }
  if (it.kind === 'inbox') {
    return head + title('Idée') + `<textarea class="notes-input" data-f="body" rows="4" placeholder="Détails">${esc(it.body)}</textarea>${media(it)}
      <div class="fields">${urlF}</div><a class="btn primary block" href="#/clarify/${it.id}" data-act="close-go">Trier maintenant</a>`;
  }
  if (it.kind === 'project') {
    const ts = ofKind('task').filter(t => t.parent_id === it.id && t.status === 'active');
    return head + title('Nom du projet (résultat voulu)') +
      `<textarea class="outcome-input" data-f="outcome" rows="2" placeholder="Résultat attendu : à quoi ressemble « terminé » ?">${esc(it.outcome || '')}</textarea>
      <textarea class="notes-input" data-f="body" rows="3" placeholder="Notes, idées (markdown)">${esc(it.body)}</textarea>${media(it)}
      <div class="fields">
        ${fRow('Statut', seg('status', it.status, [['clarify', 'À clarifier'], ['active', 'Actif'], ['someday', 'Un jour'], ['done', 'Terminé']]))}
        ${fRow('Domaine', sel('parent_id', it.parent_id, [['', 'Aucun'], ...areas().map(a => [a.id, a.title])]))}
        ${fRow('Échéance', `<input type="date" data-f="due_date" value="${it.due_date || ''}">`)}
        ${fRow('Revue le', `<input type="date" data-f="review_date" value="${it.review_date || ''}">`)}
        ${tagsF}
      </div>
      <div class="sub-list"><div class="sub-title">Actions (${ts.length})</div>${ts.map(t => `<div class="sub-item">${esc(t.title)}</div>`).join('')}
        <form class="inline-add" data-form="add-proj" data-id="${it.id}"><input id="ed-next" placeholder="+ Prochaine action" enterkeyhint="done" autocomplete="off"></form></div>
      <a class="btn block" href="#/project/${it.id}" data-act="close-go">Ouvrir le projet</a>`;
  }
  if (it.kind === 'note') {
    const backlinks = ofKind('note').filter(n => n.id !== it.id && it.title && n.body.toLowerCase().includes(`[[${it.title.toLowerCase()}]]`));
    return head + title('Titre de la note') +
      `<div class="seg small mode">${[['0', 'Écrire'], ['1', 'Aperçu']].map(([v, l]) => `<button class="${(S.ui.preview ? '1' : '0') === v ? 'on' : ''}" data-act="preview" data-v="${v}">${l}</button>`).join('')}</div>
      ${S.ui.preview ? `<div class="md note-preview">${md(it.body) || '<p class="muted">Vide</p>'}</div>`
        : `<textarea class="notes-input big" data-f="body" rows="12" placeholder="Écris librement… [[Autre note]] pour lier, #tag pour classer">${esc(it.body)}</textarea>`}
      ${media(it)}
      <div class="fields">${fRow('Projet', sel('parent_id', it.parent_id, projectOptions(it.parent_id)))}${tagsF}${urlF}</div>
      ${backlinks.length ? `<div class="sub-list"><div class="sub-title">Mentionnée dans</div>${backlinks.map(n => `<button class="sub-item link" data-act="edit" data-id="${n.id}">${esc(n.title)}</button>`).join('')}</div>` : ''}`;
  }
  // tâche
  const ctxs = [...new Set([...S.prefs.contexts, ...(it.contexts || [])])];
  return head + title('Nouvelle tâche') +
    `<textarea class="notes-input" data-f="body" rows="3" placeholder="Notes">${esc(it.body)}</textarea>${media(it)}
    <div class="fields">
      ${fRow('Statut', seg('status', it.status, [['active', 'À faire'], ['waiting', 'En attente'], ['someday', 'Un jour'], ['done', 'Fait']]))}
      ${fRow('Top 3', `<button class="chip ${it.focus ? 'on' : ''}" data-act="focus-ed">${I.star} ${it.focus ? `n° ${it.focus} · ${fmtDate(it.scheduled_date).toLowerCase()}` : `Ajouter (${fmtDate(it.scheduled_date || today()).toLowerCase()})`}</button>`)}
      ${it.status === 'waiting' ? fRow('Attendu de', `<input data-f="waiting_for" id="f-waiting_for" value="${esc(it.waiting_for || '')}" placeholder="Personne, organisme…" autocomplete="off">`) : ''}
      ${fRow('Projet', sel('parent_id', it.parent_id, projectOptions(it.parent_id)))}
      ${fRow('Contextes', `<div class="chips wrap">${ctxs.map(c => chip(esc(c), (it.contexts || []).includes(c), 'ctx', c)).join('')}</div>`)}
      ${fRow('Prévu le', `<div class="date-line"><input type="date" data-f="scheduled_date" value="${it.scheduled_date || ''}"><input type="time" data-f="scheduled_time" value="${it.scheduled_time || ''}"></div>
        <div class="quick">${[['0', "Aujourd'hui"], ['1', 'Demain'], ['7', '+1 sem.'], ['clear', 'Effacer']].map(([v, l]) => `<button class="chip" data-act="sched" data-v="${v}">${l}</button>`).join('')}</div>`)}
      ${fRow('Échéance', `<input type="date" data-f="due_date" value="${it.due_date || ''}">`)}
      ${fRow('Durée', sel('duration_min', it.duration_min, [['', '—'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [180, '3 h'], [240, '4 h']]))}
      ${fRow('Énergie', seg('energy', it.energy, [['low', 'Faible'], ['medium', 'Moyenne'], ['high', 'Forte']]))}
      ${fRow('Répéter', sel('recurrence', it.recurrence, [['', 'Jamais'], ['daily', 'Chaque jour'], ['weekdays', 'Jours ouvrés'], ['weekly', 'Chaque semaine'], ['monthly', 'Chaque mois'], ['yearly', 'Chaque année']]))}
      ${tagsF}${urlF}
    </div>
    ${it.scheduled_date || it.due_date ? `<button class="btn block" data-act="reminder" data-id="${it.id}">${I.bell} Créer un rappel Apple</button>` : '<div class="muted small pad center">Ajoute une date pour pouvoir créer un rappel Apple.</div>'}`;
}
function renderEditor() {
  const it = S.items.get(editingId);
  if (!it) { closeSheet(); return; }
  const st = sheet.scrollTop;
  sheet.innerHTML = editorHTML(it);
  sheet.scrollTop = st;
  hydrateImages(sheet);
}
function openEditor(id, { focus } = {}) {
  sheetMode = 'editor';
  editingId = id;
  renderEditor();
  showSheet();
  const it = S.items.get(id);
  const f = focus ? document.getElementById('f-' + focus) : (!it.title ? document.getElementById('f-title') : null);
  if (f) f.focus();
}
function createAndEdit(fields) {
  const it = saveItem(newItem(fields));
  draftId = it.id;
  openEditor(it.id);
}

function setField(id, f, v, rerender) {
  const it = S.items.get(id);
  if (!it) return;
  let val = v;
  if (f === 'tags') val = v.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
  else if (f === 'duration_min') val = v ? parseInt(v, 10) : null;
  else if (NULLABLE.has(f)) val = v || null;
  const p = { [f]: val };
  if (f === 'scheduled_date') {
    if (it.scheduled_date !== val) p.focus = null;
    if (val && it.scheduled_date !== val) p.day_order = nextOrder(val);
    if (!val) p.scheduled_time = null;
  }
  if (f === 'scheduled_time' && val && !it.scheduled_date) { p.scheduled_date = S.ui.day; p.day_order = nextOrder(S.ui.day); }
  if (f === 'status') {
    if (val === 'done') { if (it.status !== 'done') p.completed_at = nowIso(); }
    else p.completed_at = null;
  }
  const wasDone = it.status === 'done';
  patch(id, p);
  if (f === 'status' && val === 'done' && !wasDone && it.recurrence && it.kind === 'task') spawnNext(it);
  if (rerender) renderEditor();
}

function openCapture(preset = {}) {
  sheetMode = 'capture';
  capPreset = preset;
  sheet.innerHTML = `<div class="sheet-head"><button class="link" data-act="close">Annuler</button><span class="sheet-kind">${esc(preset.label || 'Capturer')}</span><button class="link strong" data-act="cap-save">Ajouter</button></div>
    <textarea id="cap-text" class="cap-text" rows="5" placeholder="${preset.kind === 'task' ? 'Tâche… (1re ligne = titre)' : 'Idée, tâche, note… (1re ligne = titre)'}"></textarea>
    <div class="cap-tools"><label class="btn">${I.camera} Photo<input type="file" accept="image/*" id="cap-file" hidden></label><span id="cap-file-name" class="muted small"></span></div>`;
  showSheet();
  $('#cap-text').focus();
}
async function saveCapture() {
  const text = $('#cap-text').value.trim();
  const file = $('#cap-file').files[0];
  if (!text && !file) { closeSheet(); return; }
  let image_path = null;
  if (file) {
    const b = $('[data-act="cap-save"]'); b.disabled = true; b.textContent = 'Envoi…';
    try { image_path = await uploadImage(file); }
    catch (e) { toast(e.message || 'Envoi de la photo impossible'); b.disabled = false; b.textContent = 'Ajouter'; return; }
  }
  let title = text, body = '', url = null;
  const nl = text.indexOf('\n');
  if (nl > -1) { title = text.slice(0, nl).trim(); body = text.slice(nl + 1).trim(); }
  if (/^https?:\/\/\S+$/.test(title) && !body) { url = title; }
  if (!title) title = file ? 'Photo' : '';
  const { label, ...fields } = capPreset || {};
  saveItem(newItem({ kind: 'inbox', title, body, url, image_path, ...fields }));
  closeSheet();
  toast(fields.kind === 'task' ? 'Tâche ajoutée' : 'Ajouté à l’Inbox');
}

function openPicker() {
  sheetMode = 'picker';
  pickSel = new Set();
  renderPicker();
  showSheet();
}
function renderPicker() {
  const day = S.ui.day;
  const list = nextActions().filter(t => t.scheduled_date !== day).sort(sortTasks);
  sheet.innerHTML = `<div class="sheet-head"><button class="link" data-act="close">Annuler</button><span class="sheet-kind">Pour ${fmtDate(day).toLowerCase()}</span><button class="link strong" data-act="pick-save">Ajouter${pickSel.size ? ` (${pickSel.size})` : ''}</button></div>
    ${list.length ? `<div class="list">${list.map(t => `<div class="row pick ${pickSel.has(t.id) ? 'on' : ''}" data-act="pick" data-id="${t.id}">
      <span class="check ${pickSel.has(t.id) ? 'on' : ''}"></span>
      <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-meta">${t.parent_id && S.items.get(t.parent_id) ? `<span class="m-proj">${esc(S.items.get(t.parent_id).title)}</span>` : ''}${t.contexts.map(c => `<span class="m-ctx">${esc(c)}</span>`).join('')}${t.duration_min ? `<span>${fmtDur(t.duration_min)}</span>` : ''}${t.scheduled_date ? `<span>Prévu ${fmtDate(t.scheduled_date).toLowerCase()}</span>` : ''}${t.due_date ? `<span class="m-due">Échéance ${fmtDate(t.due_date).toLowerCase()}</span>` : ''}</div></div>
    </div>`).join('')}</div>` : empty('Aucune prochaine action disponible')}`;
}

function openMenu() {
  sheetMode = 'menu';
  const n = {
    waiting: ofKind('task').filter(t => t.status === 'waiting').length,
    someday: live().filter(i => i.status === 'someday').length
  };
  const item = (href, label, count = '') => `<a class="row" href="${href}" data-act="close-go"><div class="row-main"><div class="row-title">${label}</div></div>${count !== '' ? `<span class="muted">${count}</span>` : ''}<span class="chev">${I.right}</span></a>`;
  sheet.innerHTML = `<div class="sheet-head"><span></span><span class="sheet-kind">Menu</span><button class="link strong" data-act="close">Fermer</button></div>
    <div class="list">${item('#/evening', 'Revue du soir')}${item('#/waiting', 'En attente', n.waiting)}${item('#/someday', 'Un jour / peut-être', n.someday)}${item('#/review', 'Revue hebdo')}${item('#/logbook', 'Terminé')}${item('#/search', 'Recherche')}${item('#/settings', 'Réglages')}</div>`;
  showSheet();
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = null, lastUndo = null;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-act="undo">Annuler</button>' : ''}`;
  t.hidden = false;
  lastUndo = undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; lastUndo = null; }, 4000);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
function clarify(id, v) {
  const it = S.items.get(id);
  if (!it) return;
  switch (v) {
    case 'done': patch(id, { kind: 'task', status: 'done', completed_at: nowIso() }); toast('Fait', () => patch(id, { kind: 'inbox', status: 'active', completed_at: null })); break;
    case 'today': patch(id, { kind: 'task', status: 'active', scheduled_date: today(), day_order: nextOrder(today()) }); openEditor(id); break;
    case 'task': patch(id, { kind: 'task', status: 'active' }); openEditor(id); break;
    case 'waiting': patch(id, { kind: 'task', status: 'waiting' }); openEditor(id, { focus: 'waiting_for' }); break;
    case 'project': patch(id, { kind: 'project', status: 'active' }); openEditor(id); $('#ed-next')?.focus(); break;
    case 'note': patch(id, { kind: 'note', status: 'active' }); openEditor(id); break;
    case 'someday': patch(id, { kind: 'task', status: 'someday' }); toast('Rangé dans Un jour', () => patch(id, { kind: 'inbox', status: 'active' })); break;
    case 'trash': patch(id, { status: 'trashed' }); toast('Supprimé', () => patch(id, { status: 'active' })); break;
  }
  if (route().arg) history.replaceState(null, '', '#/clarify');
}
function moveInDay(id, dir) {
  const day = S.ui.day;
  const list = ofKind('task').filter(t => t.scheduled_date === day && !t.scheduled_time && (t.status === 'active' || t.status === 'waiting'))
    .sort((a, b) => (a.day_order ?? 1e15) - (b.day_order ?? 1e15) || a.created_at.localeCompare(b.created_at));
  const i = list.findIndex(t => t.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((t, k) => { if (t.day_order !== k + 1) { t.day_order = k + 1; saveItem(t, { render: false }); } });
  queueRender();
}
function evening(id, v) {
  const t = S.items.get(id);
  if (!t) return;
  const prev = { status: t.status, scheduled_date: t.scheduled_date, scheduled_time: t.scheduled_time, day_order: t.day_order, focus: t.focus };
  const undo = () => patch(id, prev);
  if (v === 'done') { complete(id); return; }
  if (v === 'tomorrow') { const d = addDays(today(), 1); patch(id, { scheduled_date: d, day_order: nextOrder(d), focus: null }); toast('Reporté à demain', undo); }
  if (v === 'next') { patch(id, { status: 'active', scheduled_date: null, scheduled_time: null, day_order: null, focus: null }); toast('Remis en prochaine action', undo); }
  if (v === 'waiting') { patch(id, { status: 'waiting', scheduled_date: null, scheduled_time: null, day_order: null, focus: null }); openEditor(id, { focus: 'waiting_for' }); }
}
function createReminder(id) {
  const t = S.items.get(id);
  const date = t.scheduled_date || t.due_date;
  const payload = JSON.stringify({ titre: t.title, date: `${date} ${t.scheduled_time || '09:00'}`, notes: t.body || '' });
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(S.prefs.reminderShortcut || 'Rappel GTD')}&input=text&text=${encodeURIComponent(payload)}`;
}
function exportJSON() {
  const blob = new Blob([JSON.stringify({ exported_at: nowIso(), prefs: S.prefs, items: [...S.items.values()] }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `second-cerveau-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const ACTS = {
  close: () => closeSheet(),
  'close-go': (el, e) => { e.preventDefault(); const href = el.getAttribute('href'); closeSheet(); location.hash = href; },
  menu: () => openMenu(),
  undo: () => { lastUndo?.(); lastUndo = null; $('#toast').hidden = true; },
  fab: el => {
    const v = el.dataset.v;
    if (v === 'capture') openCapture();
    else if (v === 'today') openCapture({ kind: 'task', scheduled_date: S.ui.day, day_order: nextOrder(S.ui.day), label: `Tâche · ${fmtDate(S.ui.day)}` });
    else if (v === 'task') openCapture({ kind: 'task', contexts: S.ui.ctx !== 'all' && S.ui.ctx !== 'none' ? [S.ui.ctx] : [], label: 'Prochaine action' });
    else if (v === 'project') createAndEdit({ kind: 'project' });
    else if (v === 'note') createAndEdit({ kind: 'note', tags: S.ui.noteTag ? [S.ui.noteTag] : [] });
    else if (v.startsWith('proj-task:')) openCapture({ kind: 'task', parent_id: v.split(':')[1], label: 'Action du projet' });
  },
  toggle: el => complete(el.dataset.id),
  edit: el => openEditor(el.dataset.id),
  set: el => {
    const it = S.items.get(editingId);
    let v = el.dataset.v;
    if (el.dataset.f === 'energy' && it.energy === v) v = '';
    setField(editingId, el.dataset.f, v, true);
  },
  kind: el => {
    const it = S.items.get(editingId);
    const kind = el.dataset.v;
    const p = { kind };
    if (kind === 'project' && it.status === 'waiting') p.status = 'active';
    if (kind === 'project' && it.parent_id && S.items.get(it.parent_id)?.kind !== 'area') p.parent_id = null;
    if (kind !== 'project' && it.parent_id && S.items.get(it.parent_id)?.kind === 'area') p.parent_id = null;
    if (kind !== 'project' && it.status === 'clarify') p.status = 'active';
    if (kind !== 'task') p.focus = null;
    patch(editingId, p);
    renderEditor();
  },
  ctx: el => {
    const it = S.items.get(editingId);
    const c = el.dataset.v;
    const cs = it.contexts.includes(c) ? it.contexts.filter(x => x !== c) : [...it.contexts, c];
    patch(editingId, { contexts: cs });
    renderEditor();
  },
  sched: el => {
    const v = el.dataset.v;
    setField(editingId, 'scheduled_date', v === 'clear' ? '' : addDays(today(), +v), true);
  },
  trash: el => {
    const id = el.dataset.id;
    const prev = S.items.get(id).status;
    if (draftId === id) draftId = null;
    patch(id, { status: 'trashed' });
    closeSheet();
    toast('Supprimé', () => patch(id, { status: prev }));
  },
  reminder: el => createReminder(el.dataset.id),
  preview: el => { S.ui.preview = el.dataset.v === '1'; renderEditor(); },
  wiki: el => {
    const t = el.dataset.title;
    const n = ofKind('note').find(x => x.title.toLowerCase() === t.toLowerCase());
    if (n) openEditor(n.id);
    else { const it = saveItem(newItem({ kind: 'note', title: t })); openEditor(it.id); }
  },
  'new-note': el => createAndEdit({ kind: 'note', parent_id: el.dataset.id }),
  clar: el => clarify(el.dataset.id, el.dataset.v),
  'clarify-one': el => { location.hash = '#/clarify/' + el.dataset.id; },
  day: el => {
    const d = +el.dataset.d;
    S.ui.day = d === 0 ? today() : addDays(S.ui.day, d);
    S.ui.reorder = false;
    render();
  },
  reorder: () => { S.ui.reorder = !S.ui.reorder; render(); },
  move: el => moveInDay(el.dataset.id, +el.dataset.dir),
  carry: () => {
    const t0 = today();
    ofKind('task').filter(t => t.status === 'active' && t.scheduled_date && t.scheduled_date < t0)
      .forEach(t => { t.scheduled_date = t0; t.day_order = nextOrder(t0); t.focus = null; saveItem(t, { render: false }); });
    queueRender();
  },
  plan: el => patch(el.dataset.id, { scheduled_date: S.ui.day, day_order: nextOrder(S.ui.day) }),
  'plan-today': el => { patch(el.dataset.id, { scheduled_date: today(), day_order: nextOrder(today()) }); toast("Prévu aujourd'hui"); },
  'pick-open': () => openPicker(),
  focus: el => toggleFocus(el.dataset.id, S.items.get(el.dataset.id)?.scheduled_date === S.ui.day || route().name === 'today' ? S.ui.day : today()),
  'focus-ed': () => {
    const it = S.items.get(editingId);
    toggleFocus(editingId, it.scheduled_date || today());
    renderEditor();
  },
  ev: el => evening(el.dataset.id, el.dataset.v),
  'ev-all': () => {
    const t0 = today(), t1 = addDays(t0, 1);
    let o = nextOrder(t1);
    ofKind('task').filter(t => (t.status === 'active' || t.status === 'waiting') && t.scheduled_date && t.scheduled_date <= t0)
      .forEach(t => { t.scheduled_date = t1; t.day_order = o++; t.focus = null; saveItem(t, { render: false }); });
    queueRender();
    toast('Tout est reporté à demain');
  },
  'plan-tomorrow': () => { S.ui.day = addDays(today(), 1); location.hash = '#/today'; },
  'evening-done': () => { S.prefs.lastEvening = today(); savePrefs(); toast('Bonne soirée ✓'); location.hash = '#/today'; },
  'proj-activate': el => { patch(el.dataset.id, { status: 'active' }); toast('Projet activé'); },
  pick: el => { const id = el.dataset.id; pickSel.has(id) ? pickSel.delete(id) : pickSel.add(id); renderPicker(); },
  'pick-save': () => {
    const day = S.ui.day;
    let o = nextOrder(day);
    for (const id of pickSel) { const t = S.items.get(id); t.scheduled_date = day; t.day_order = o++; saveItem(t, { render: false }); }
    closeSheet();
  },
  'ctx-filter': el => { S.ui.ctx = el.dataset.v; render(); },
  'note-tag': el => { S.ui.noteTag = S.ui.noteTag === el.dataset.v ? null : el.dataset.v; render(); },
  activate: el => { patch(el.dataset.id, { status: 'active' }); toast('Activé'); },
  'proj-done': el => { patch(el.dataset.id, { status: 'done', completed_at: nowIso() }); toast('Projet terminé', () => patch(el.dataset.id, { status: 'active', completed_at: null })); },
  'review-check': el => { const k = el.dataset.v; S.ui.review.has(k) ? S.ui.review.delete(k) : S.ui.review.add(k); render(); },
  'review-done': () => { S.prefs.lastReview = today(); S.ui.review.clear(); savePrefs(); toast('Revue enregistrée'); location.hash = '#/today'; },
  'sync-now': () => { S.lastError = null; sync(); },
  logout: async () => {
    if ((S.dirty.size || S.prefsDirty) && !confirm('Des modifications ne sont pas encore synchronisées et seront perdues. Se déconnecter quand même ?')) return;
    await sb.auth.signOut();
    resetLocal(); S.uid = null; persistNow();
  },
  copy: async el => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Copié'); } catch { toast('Copie impossible'); } },
  'token-new': async () => {
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await sb.from('capture_tokens').insert({ token });
    if (error) { toast('Erreur : ' + error.message); return; }
    S.ui.tokens = undefined; render(); toast('Jeton créé');
  },
  'token-del': async el => {
    if (!confirm('Révoquer ce jeton ? Les raccourcis qui l’utilisent ne marcheront plus.')) return;
    const { error } = await sb.from('capture_tokens').delete().eq('token', el.dataset.v);
    if (error) { toast('Erreur : ' + error.message); return; }
    S.ui.tokens = undefined; render();
  },
  'ctx-del': el => { S.prefs.contexts = S.prefs.contexts.filter(c => c !== el.dataset.v); savePrefs(); },
  export: () => exportJSON(),
  'cap-save': () => saveCapture()
};

const FORMS = {
  login: async f => {
    const err = $('#login-err');
    err.textContent = '';
    const btn = f.querySelector('button'); btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-pass').value });
    btn.disabled = false;
    if (error) err.textContent = error.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : error.message;
  },
  'add-day': f => {
    const input = f.querySelector('input'), v = input.value.trim();
    if (!v) return;
    saveItem(newItem({ kind: 'task', title: v, scheduled_date: S.ui.day, day_order: nextOrder(S.ui.day) }));
    input.value = '';
  },
  'add-proj': f => {
    const input = f.querySelector('input'), v = input.value.trim();
    if (!v) return;
    saveItem(newItem({ kind: 'task', title: v, parent_id: f.dataset.id }));
    input.value = '';
    if (sheetMode === 'editor') { renderEditor(); $('#ed-next')?.focus(); }
  },
  'ctx-add': f => {
    const input = f.querySelector('input');
    let v = input.value.trim();
    if (!v) return;
    if (!v.startsWith('@')) v = '@' + v;
    if (!S.prefs.contexts.includes(v)) S.prefs.contexts = [...S.prefs.contexts, v];
    input.value = '';
    savePrefs();
  },
  'area-add': f => {
    const input = f.querySelector('input'), v = input.value.trim();
    if (!v) return;
    saveItem(newItem({ kind: 'area', title: v }));
    input.value = '';
  },
  'reminder-name': f => { S.prefs.reminderShortcut = f.querySelector('input').value.trim() || 'Rappel GTD'; savePrefs(); toast('Enregistré'); }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTS[el.dataset.act];
  if (!fn) return;
  if (el.tagName !== 'A' || el.dataset.act === 'close-go') e.preventDefault();
  fn(el, e);
});
document.addEventListener('submit', e => {
  const fn = FORMS[e.target.dataset.form];
  if (!fn) return;
  e.preventDefault();
  fn(e.target);
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.live === 'notes') { S.ui.noteQuery = t.value; $('#notes-list').innerHTML = notesList(); hydrateImages($('#notes-list')); return; }
  if (t.dataset.live === 'search') { S.ui.search = t.value; $('#search-results').innerHTML = searchResults(); hydrateImages($('#search-results')); return; }
  if (t.dataset.inline && t.dataset.id) { patch(t.dataset.id, { [t.dataset.inline]: t.value }, { render: false }); return; }
  if (sheetMode === 'editor' && t.dataset.f && TEXT_FIELDS.has(t.dataset.f)) setField(editingId, t.dataset.f, t.value, false);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'cap-file') { $('#cap-file-name').textContent = t.files[0] ? t.files[0].name : ''; return; }
  if (t.dataset.evdate && t.value) { patch(t.dataset.evdate, { scheduled_date: t.value, day_order: nextOrder(t.value), focus: null }); toast(`Prévu ${fmtDate(t.value).toLowerCase()}`); return; }
  if (sheetMode === 'editor' && t.dataset.f && !TEXT_FIELDS.has(t.dataset.f)) setField(editingId, t.dataset.f, t.value, true);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheetMode) closeSheet();
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && sheetMode === 'capture') saveCapture();
});
window.addEventListener('hashchange', () => { if (sheetMode) closeSheet(); else render(); });
window.addEventListener('online', () => { setSyncState(); sync(); });
window.addEventListener('offline', setSyncState);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (S.ui.day < today() && route().name === 'today') { S.ui.day = today(); queueRender(); }
    sync();
  }
});
setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60000);

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
function seedDemo() {
  const t0 = today();
  const a = DEFAULT_AREAS.map(t => saveItem(newItem({ kind: 'area', title: t }), { render: false }));
  const p1 = saveItem(newItem({ kind: 'project', title: 'Préparer les vacances de Noël', parent_id: a[7].id, outcome: 'Billets et logement réservés avant le 15/11.' }), { render: false });
  const p2 = saveItem(newItem({ kind: 'project', title: 'Refaire le site perso', parent_id: a[2].id, review_date: t0 }), { render: false });
  saveItem(newItem({ kind: 'project', title: 'Changer de mutuelle', status: 'clarify', parent_id: a[4].id }), { render: false });
  const add = f => saveItem(newItem(f), { render: false });
  add({ kind: 'inbox', title: 'Idée : podcast sur la productivité', source: 'shortcut' });
  add({ kind: 'inbox', title: 'https://example.com/article-gtd', url: 'https://example.com/article-gtd', source: 'shortcut' });
  add({ kind: 'inbox', title: 'Appeler le garagiste pour le contrôle technique' });
  add({ kind: 'task', title: 'Comparer les prix des billets de train', parent_id: p1.id, contexts: ['@ordi'], duration_min: 30, scheduled_date: t0, day_order: 1, focus: 1 });
  add({ kind: 'task', title: 'Courses pour le dîner', contexts: ['@courses'], scheduled_date: t0, scheduled_time: '18:30', duration_min: 45 });
  add({ kind: 'task', title: 'Répondre au mail de Julie', contexts: ['@ordi'], scheduled_date: t0, day_order: 2, duration_min: 15 });
  add({ kind: 'task', title: 'Payer la facture d’électricité', contexts: ['@ordi'], due_date: addDays(t0, 2), recurrence: 'monthly' });
  add({ kind: 'task', title: 'Choisir un thème pour le site', parent_id: p2.id, contexts: ['@ordi'], energy: 'high' });
  add({ kind: 'task', title: 'Devis du plombier', status: 'waiting', waiting_for: 'M. Durand', contexts: [] });
  add({ kind: 'task', title: 'Apprendre la guitare', status: 'someday' });
  add({ kind: 'note', title: 'Principes GTD', body: '# Les 5 étapes\n1. **Capturer**\n2. Clarifier\n3. Organiser\n4. Réfléchir (revue)\n5. Agir\n\nVoir aussi [[Idées de projets]] #productivité' });
  add({ kind: 'note', title: 'Idées de projets', body: '- Newsletter mensuelle\n- [ ] Atelier photo\n\n#idées' });
  S.prefs.seeded = true;
  S.prefs.areasV2 = true;
}

async function init() {
  restore();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (DEMO) {
    S.user = { id: 'demo', email: 'Mode démo (données locales)' };
    if (!S.items.size) seedDemo();
    if (!S.prefs.areasV2) { migrateAreas(); S.prefs.areasV2 = true; }
    persist();
    render();
    return;
  }
  if (!sb) { app.innerHTML = empty('Chargement impossible', 'Vérifie ta connexion puis relance l’app.'); return; }
  const { data: { session } } = await sb.auth.getSession();
  setUser(session?.user || null);
  sb.auth.onAuthStateChange((_ev, s) => setUser(s?.user || null));
  render();
}
function setUser(u) {
  const prev = S.user?.id || null;
  S.user = u ? { id: u.id, email: u.email } : null;
  if (u && S.uid && S.uid !== u.id) resetLocal();
  if (u) S.uid = u.id;
  if ((u?.id || null) !== prev) {
    persist();
    queueRender();
    if (u) sync();
  }
}

init();
})();
