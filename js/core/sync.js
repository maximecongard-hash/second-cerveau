import { DEMO, sb } from './config.js';
import { nowIso } from './util.js';
import { S, FIELDS, DEFAULT_PREFS, persist, isMine, saveItem } from './store.js';
import { MODULES } from './modules.js';
import { queueRender } from './ui.js';

// ---------------------------------------------------------------------------
// Synchronisation Supabase
// ---------------------------------------------------------------------------
let syncTimer = null;
export function scheduleSync(delay = 800) {
  if (DEMO) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, delay);
  setSyncState();
}
function toRow(it) {
  const r = {};
  for (const f of FIELDS) r[f] = it[f] ?? null;
  r.user_id = it.user_id || S.user.id; // un invité garde le propriétaire d'origine
  r.contexts = it.contexts || [];
  r.tags = it.tags || [];
  r.links = it.links || [];
  r.pinned = !!it.pinned;
  r.title = it.title || '';
  r.body = it.body || '';
  r.source = it.source || 'app';
  return r;
}
function fromRow(r) {
  return {
    ...r,
    contexts: r.contexts || [], tags: r.tags || [], links: r.links || [], pinned: !!r.pinned, body: r.body || '',
    scheduled_time: r.scheduled_time ? r.scheduled_time.slice(0, 5) : null
  };
}
export async function sync() {
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
    // 3b. partages et comptes connus ; ce qui n'est plus accessible disparaît de l'appareil
    if (await pullSharing()) changed = true;
    if (await pruneForeign()) changed = true;
    // 4. initialisations propres à chaque module (données par défaut, migrations)
    for (const m of MODULES) if (m.afterSync?.()) changed = true;
    S.lastError = null;
    S.lastSync = nowIso();
  } catch (e) {
    console.error('sync', e);
    S.lastError = /column|schema cache|violates check/i.test(e.message || '')
      ? `base de données à mettre à jour (supabase/005 à 010, dans l'ordre) · détail : ${e.message}`
      : (e.message || String(e));
  } finally {
    S.syncing = false;
    persist();
    setSyncState();
    if (changed) queueRender(true);
    if ((S.dirty.size || S.prefsDirty) && !S.lastError) scheduleSync(300);
  }
}
// Tant que 007_partage.sql n'est pas passée, les tables manquent : l'app reste utilisable seule
async function pullSharing() {
  const [sh, pe] = await Promise.all([sb.from('shares').select('*'), sb.from('profiles').select('id, email, name, is_admin')]);
  if (sh.error || pe.error) return false;
  const people = Object.fromEntries(pe.data.map(p => [p.id, p]));
  const changed = JSON.stringify(sh.data) !== JSON.stringify(S.shares) || JSON.stringify(people) !== JSON.stringify(S.people);
  S.shares = sh.data;
  S.people = people;
  return changed;
}
// Retire les éléments d'autrui qu'on ne peut plus lire (partage retiré) ; mes tâches qui y étaient rangées sont détachées
async function pruneForeign() {
  const foreign = [...S.items.values()].filter(i => !isMine(i));
  if (!foreign.length) return false;
  const { data, error } = await sb.from('items').select('id').neq('user_id', S.user.id).limit(1000);
  if (error) throw error;
  if (data.length >= 1000) return false;
  const ok = new Set(data.map(r => r.id));
  const gone = new Set(foreign.filter(i => !ok.has(i.id)).map(i => i.id));
  if (!gone.size) return false;
  for (const id of gone) { S.items.delete(id); S.dirty.delete(id); }
  for (const it of S.items.values()) if (isMine(it) && gone.has(it.parent_id)) { it.parent_id = null; saveItem(it, { render: false }); }
  return true;
}
export function syncClass() {
  if (DEMO) return 'demo';
  if (!navigator.onLine) return 'off';
  if (S.lastError) return 'err';
  if (S.syncing || S.dirty.size || S.prefsDirty) return 'busy';
  return 'ok';
}
export function syncLabel() {
  return { demo: 'Mode démo (local)', off: 'Hors ligne : modifications gardées sur le téléphone', err: 'Erreur de synchro : ' + S.lastError,
    busy: 'Synchronisation…', ok: 'Synchronisé' }[syncClass()];
}
export function setSyncState() {
  document.querySelectorAll('.sync').forEach(el => { el.className = 'sync ' + syncClass(); el.title = syncLabel(); });
}
