import { DEMO, sb, CFG, SCHEMA_VERSION } from './config.js';
import { nowIso, same, FMT_TIME } from './util.js';
import { S, FIELDS, DEFAULT_PREFS, persist, isMine, patch, canEdit } from './store.js';
import { ITEM_DEFAULTS } from './state.js';
import { MODULES } from './modules.js';
import { queueRender, toast } from './ui.js';

// ---------------------------------------------------------------------------
// Synchronisation Supabase
//   1. envoi : seuls les champs modifiés, fusionnés avec la version du serveur
//   2. préférences : fusion clé par clé
//   3. réception : ce qui a changé depuis le curseur (updated_at)
// Une ligne refusée est mise de côté (S.stuck) sans bloquer le reste ; une panne réseau arrête le cycle sans rien perdre.
// ---------------------------------------------------------------------------
const TRASH_DAYS = 30; // comme brain_purge() de supabase/schema.sql
const FULL_READ_MS = 36e5; // au plus une heure entre deux relectures complètes

let syncTimer = null;
export function scheduleSync(delay = 800) {
  if (DEMO) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, delay);
  setSyncState();
}
function toRow(it) {
  // un invité garde le propriétaire d'origine ; un élément ancien du cache peut ne pas avoir tous les champs
  const r = { id: it.id, user_id: it.user_id || S.user.id, created_at: it.created_at ?? null };
  for (const [f, d] of Object.entries(ITEM_DEFAULTS)) r[f] = it[f] ?? d;
  return r;
}
function fromRow(r) {
  return {
    ...r,
    contexts: r.contexts || [], tags: r.tags || [], links: r.links || [], pinned: !!r.pinned, body: r.body || '',
    scheduled_time: r.scheduled_time ? r.scheduled_time.slice(0, 5) : null
  };
}
// Même contenu, à la mise en forme des dates près (le serveur renvoie ses instants à sa façon)
const sameValue = (x, y) => same(x, y) || (typeof x === 'string' && typeof y === 'string' && /T\d\d:/.test(x) && Date.parse(x) === Date.parse(y));
function sameRow(a, b) {
  const ra = toRow(a), rb = toRow(b);
  return FIELDS.every(f => sameValue(ra[f], rb[f]));
}

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------
function asError({ error, status }) {
  return Object.assign(new Error(error.message), { status, code: error.code });
}
function must(res) {
  if (res.error) throw asError(res);
  return res.data;
}
// Réseau coupé, délai dépassé ou serveur en panne : on réessaiera, rien n'est perdu
const isNetwork = e => e.status === 0 || e.status >= 500 || e.status === 408 || e.status === 429;
// Colonne ou table inconnue : la base est en retard sur l'app
const isSchema = e => /^(PGRST20\d|42703|42P01)$/.test(e.code || '') || /schema cache/i.test(e.message || '');
const isRefused = e => e.code === '42501' || /row-level security|permission denied/i.test(e.message || '');
// Ces erreurs concernent tout le cycle, pas une ligne
const isGlobal = e => isNetwork(e) || isSchema(e) || e.status === 401;

// ---------------------------------------------------------------------------
// 1. Envoi
// ---------------------------------------------------------------------------
// Une ligne déjà sur le serveur : sa version actuelle, plus mes seuls champs modifiés
async function rowsFor(ids) {
  const partial = ids.filter(id => S.dirty.get(id) && S.items.has(id));
  const server = new Map();
  for (let i = 0; i < partial.length; i += 100) {
    for (const r of must(await sb.from('items').select('*').in('id', partial.slice(i, i + 100)))) server.set(r.id, r);
  }
  const rows = ids.map(id => S.items.get(id)).filter(Boolean).map(it => {
    const fields = S.dirty.get(it.id), srv = fields && server.get(it.id);
    return toRow(srv ? { ...fromRow(srv), ...Object.fromEntries([...fields].map(f => [f, it[f]])) } : it);
  });
  // les parents d'abord : un lot ne doit pas citer un élément du lot suivant
  const byId = new Map(rows.map(r => [r.id, r]));
  const depth = r => { let d = 0; for (let p = byId.get(r.parent_id); p && d < 5; p = byId.get(p.parent_id)) d++; return d; };
  return rows.sort((a, b) => depth(a) - depth(b));
}
async function upsertRows(rows, refused) {
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    const res = await sb.from('items').upsert(part);
    if (!res.error) continue;
    if (isGlobal(asError(res))) throw asError(res);
    // au moins une ligne fautive : on les essaie une par une, les autres passent
    for (const r of part) {
      const one = await sb.from('items').upsert(r);
      if (!one.error) continue;
      const e = asError(one);
      if (isGlobal(e)) throw e;
      if (isRefused(e)) refused.add(r.id); else S.stuck.set(r.id, e.message);
    }
  }
}
async function pushItems() {
  const ids = [...S.dirty.keys()].filter(id => !S.stuck.has(id));
  if (!ids.length) return false;
  let changed = false;
  // droits à jour d'abord : un partage passé en lecture seule ne doit pas bloquer l'envoi
  if (ids.some(id => { const it = S.items.get(id); return it && !isMine(it); }) && await pullSharing()) changed = true;
  const refused = new Set(ids.filter(id => { const it = S.items.get(id); return it && !canEdit(it); }));
  const todo = ids.filter(id => !refused.has(id));
  const snap = new Map(todo.map(id => [id, S.items.get(id)?.updated_at]));
  await upsertRows(await rowsFor(todo), refused);
  for (const [id, v] of snap) if (!refused.has(id) && !S.stuck.has(id) && S.items.get(id)?.updated_at === v) S.dirty.delete(id);
  // modifications refusées par la base : on les abandonne et on reprend la version du serveur
  for (const id of refused) { await takeServer(id); changed = true; }
  if (refused.size) toast('Lecture seule : ' + refused.size + ' modification(s) refusée(s), version du propriétaire rétablie');
  return changed;
}
async function takeServer(id) {
  S.dirty.delete(id);
  S.stuck.delete(id);
  const data = must(await sb.from('items').select('*').eq('id', id).maybeSingle());
  if (data) S.items.set(id, fromRow(data)); else S.items.delete(id);
}
// Réglages > Données : abandonner ma version d'une ligne bloquée
export async function dropStuck(id) {
  await takeServer(id);
  persist();
  setSyncState();
  queueRender();
}

// ---------------------------------------------------------------------------
// 2. Préférences : seules les clés changées ici depuis la dernière lecture écrasent celles du serveur
// ---------------------------------------------------------------------------
async function syncPrefs() {
  const gen = S.prefsGen;
  const row = must(await sb.from('prefs').select('data').maybeSingle());
  const server = row?.data || {};
  let next = server;
  if (S.prefsDirty) {
    const base = S.prefsBase || DEFAULT_PREFS;
    next = { ...server };
    for (const [k, v] of Object.entries(S.prefs)) if (!same(v, base[k])) next[k] = v;
    must(await sb.from('prefs').upsert({ user_id: S.user.id, data: next, updated_at: nowIso() }));
  }
  S.prefsBase = next;
  // changées pendant l'échange : on garde la saisie, le prochain cycle la fusionne
  if (gen !== S.prefsGen) return false;
  S.prefsDirty = false;
  const merged = { ...DEFAULT_PREFS, ...next };
  if (same(merged, S.prefs)) return false;
  S.prefs = merged;
  return true;
}

// ---------------------------------------------------------------------------
// 3. Réception (avec 10 s de recouvrement)
//    Le curseur ne voit pas une ligne supprimée ailleurs (Corbeille vidée, purge) : la relecture complète aligne le cache sur le serveur.
// ---------------------------------------------------------------------------
async function pullItems() {
  let changed = false;
  const full = !S.cursor || !S.lastFullRead || Date.now() - Date.parse(S.lastFullRead) > FULL_READ_MS;
  const seen = full ? new Set() : null;
  let since = full ? null : new Date(Date.parse(S.cursor) - 10000).toISOString();
  for (;;) {
    let q = sb.from('items').select('*').order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(1000);
    if (since) q = q.gte('updated_at', since);
    const data = must(await q);
    for (const r of data) {
      seen?.add(r.id);
      if (!S.cursor || r.updated_at > S.cursor) S.cursor = r.updated_at;
      if (S.dirty.has(r.id)) continue;
      const cur = S.items.get(r.id);
      if (cur && cur.updated_at === r.updated_at) continue;
      const next = fromRow(r);
      if (!cur || !sameRow(cur, next)) changed = true;
      S.items.set(r.id, next);
    }
    const last = data[data.length - 1]?.updated_at;
    if (data.length < 1000 || last === since) break;
    since = last;
  }
  if (seen) {
    // Ce que le serveur n'a plus disparaît aussi ici. Une réponse vide est suspecte : on ne vide pas le cache sur cette seule foi.
    // Les éléments d'autrui sont laissés à pruneForeign, qui détache aussi mes tâches rangées dedans.
    if (seen.size) for (const [id, it] of [...S.items]) if (!seen.has(id) && !S.dirty.has(id) && isMine(it)) { S.items.delete(id); changed = true; }
    S.lastFullRead = nowIso();
  }
  return changed;
}
// Partages et comptes connus. Sans erreur si le serveur ne répond pas : l'app reste utilisable seule
async function pullSharing() {
  const [sh, pe] = await Promise.all([sb.from('shares').select('*').order('id'), sb.from('profiles').select('id, email, name, is_admin')]);
  if (sh.error || pe.error) return false;
  const people = Object.fromEntries(pe.data.map(p => [p.id, p]));
  const changed = !same(sh.data, S.shares) || !same(people, S.people);
  S.shares = sh.data;
  S.people = people;
  return changed;
}
// Retire les éléments d'autrui qu'on ne peut plus lire (partage retiré) ; mes tâches qui y étaient rangées sont détachées
async function pruneForeign() {
  const foreign = [...S.items.values()].filter(i => !isMine(i));
  if (!foreign.length) return false;
  const data = must(await sb.from('items').select('id').neq('user_id', S.user.id).limit(1000));
  if (data.length >= 1000) return false;
  const ok = new Set(data.map(r => r.id));
  const gone = new Set(foreign.filter(i => !ok.has(i.id)).map(i => i.id));
  if (!gone.size) return false;
  for (const id of gone) { S.items.delete(id); S.dirty.delete(id); S.stuck.delete(id); }
  for (const it of [...S.items.values()]) if (isMine(it) && gone.has(it.parent_id)) patch(it.id, { parent_id: null }, { render: false });
  return true;
}
// La corbeille de plus de 30 jours ne garde plus de place sur l'appareil
function pruneTrash() {
  const limit = Date.now() - TRASH_DAYS * 864e5;
  for (const it of [...S.items.values()]) if (it.status === 'trashed' && !S.dirty.has(it.id) && Date.parse(it.updated_at) < limit) S.items.delete(it.id);
}

// ---------------------------------------------------------------------------
// État de l'installation (une fois par lancement ; Réglages > Installation peut relancer)
// ---------------------------------------------------------------------------
export async function checkInstall() {
  const { data, error, status } = await sb.rpc('brain_status');
  if (error && (status === 0 || status >= 500)) return; // réseau : au prochain cycle
  S.ui.install = error ? { schema: 0 } : data;
  // l'administrateur donne au cron l'adresse du projet : rien à écrire dans le SQL
  if (data && !data.url && S.people[S.user.id]?.is_admin) {
    const r = await sb.rpc('brain_setup', { p_url: CFG.url });
    if (!r.error) data.url = CFG.url;
  }
}
export const schemaBehind = () => !!S.ui.install && S.ui.install.schema < SCHEMA_VERSION;
export const SCHEMA_MSG = 'Base à mettre à jour : recolle supabase/schema.sql dans Supabase (voir le README).';

// ---------------------------------------------------------------------------
// Le cycle
// ---------------------------------------------------------------------------
const hasPending = () => S.prefsDirty || [...S.dirty.keys()].some(id => !S.stuck.has(id));

export async function sync() {
  if (DEMO || !sb || !S.user || S.syncing) return;
  if (!navigator.onLine) { setSyncState(); return; }
  S.syncing = true;
  setSyncState();
  let changed = false;
  const stuckBefore = S.stuck.size;
  try {
    // Sans session valide, les requêtes partiraient sans compte : la base répondrait « rien » et refuserait tout,
    // ce qui ressemblerait à des suppressions. On n'échange rien tant que la session n'est pas confirmée.
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      S.netDown = true;
      return;
    }
    if (await pushItems()) changed = true;
    if (await syncPrefs()) changed = true;
    if (await pullItems()) changed = true;
    if (await pullSharing()) changed = true;
    if (await pruneForeign()) changed = true;
    pruneTrash();
    // initialisations propres à chaque module (données par défaut, reprises)
    for (const m of MODULES) if (m.afterSync?.()) changed = true;
    if (!S.ui.install) await checkInstall();
    S.lastError = null;
    S.netDown = false;
    S.lastSync = nowIso();
  } catch (e) {
    console.error('sync', e);
    S.netDown = isNetwork(e);
    S.lastError = S.netDown ? null : isSchema(e) ? `${SCHEMA_MSG} Détail : ${e.message}` : (e.message || String(e));
  } finally {
    S.syncing = false;
    persist();
    setSyncState();
    if (changed || S.stuck.size !== stuckBefore) queueRender(true);
    if (hasPending() && !S.lastError && !S.netDown) scheduleSync(300);
  }
}
export function syncClass() {
  if (DEMO) return 'demo';
  if (!navigator.onLine || S.netDown) return 'off';
  if (S.lastError || S.stuck.size || S.ui.storageFull || schemaBehind()) return 'err';
  if (S.syncing || hasPending()) return 'busy';
  return 'ok';
}
export function syncLabel() {
  const err = () => (S.lastError ? 'Erreur de synchro : ' + S.lastError
    : schemaBehind() ? SCHEMA_MSG
    : S.stuck.size ? `${S.stuck.size} élément${S.stuck.size > 1 ? 's' : ''} non envoyé${S.stuck.size > 1 ? 's' : ''} : voir Réglages > Données`
    : 'Stockage du téléphone plein : voir Réglages > Données');
  return { demo: () => 'Mode démo (local)', off: () => (navigator.onLine ? 'Serveur injoignable' : 'Hors ligne') + ' : modifications gardées sur le téléphone', err,
    busy: () => 'Synchronisation…', ok: () => 'Synchronisé' }[syncClass()]();
}
export const syncLine = () => syncLabel() + (S.lastSync ? ` · dernière synchro ${FMT_TIME.format(new Date(S.lastSync))}` : '');
export function setSyncState() {
  document.querySelectorAll('.sync').forEach(el => { el.className = 'sync ' + syncClass(); el.title = syncLabel(); });
  document.querySelectorAll('.sync-line').forEach(el => { el.textContent = syncLine(); });
}
