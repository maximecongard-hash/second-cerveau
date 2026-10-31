import { uuid, today, parseYmd, addDays, daysBetween, ymd, nowIso, fmtDate } from '../../core/util.js';
import { S, newItem, saveItem, patch, live, ofKind, byTitle } from '../../core/store.js';
import { toast, route, openEditor } from '../../core/ui.js';

// ---------------------------------------------------------------------------
// Modèle GTD : inbox, tâches, projets, notes, domaines
// ---------------------------------------------------------------------------
export const DEFAULT_AREAS = ['Sport', 'Finance', 'Travail / Carrière', 'Maison & Administratif', 'Santé',
  'Apprentissage', 'Relations', 'Loisirs & Voyages', 'Cuisine'];

export const inboxItems = () => ofKind('inbox').sort((a, b) => a.created_at.localeCompare(b.created_at));
export const areas = () => ofKind('area').sort(byTitle);
export const projectsBy = st => ofKind('project').filter(p => p.status === st).sort(byTitle);
function projectBlocked(t) {
  const p = t.parent_id && S.items.get(t.parent_id);
  return !!p && p.kind === 'project' && ['someday', 'done', 'trashed'].includes(p.status);
}
export const nextActions = () => ofKind('task').filter(t => t.status === 'active' && !projectBlocked(t));
export const hasNextAction = p => ofKind('task').some(t => t.parent_id === p.id && t.status === 'active');
export function nextOrder(day) {
  const os = ofKind('task').filter(t => t.scheduled_date === day && t.day_order != null).map(t => t.day_order);
  return os.length ? Math.max(...os) + 1 : 1;
}
export const topOf = day => ofKind('task').filter(t => t.scheduled_date === day && t.focus).sort((a, b) => a.focus - b.focus);
export function toggleFocus(id, day) {
  const t = S.items.get(id);
  if (!t) return;
  if (t.focus && t.scheduled_date === day) { patch(id, { focus: null }); return; }
  const used = topOf(day).filter(x => x.id !== id).map(x => x.focus);
  const free = [1, 2, 3].find(n => !used.includes(n));
  if (!free) { toast('Top 3 déjà complet : retire d’abord une étoile'); return; }
  patch(id, { focus: free, scheduled_date: day, day_order: t.scheduled_date === day ? t.day_order : nextOrder(day) });
}
export function migrateAreas() {
  const RENAME = { Pro: 'Travail / Carrière', Finances: 'Finance', Maison: 'Maison & Administratif' };
  const used = id => ofKind('project').some(p => p.parent_id === id);
  for (const a of areas()) {
    if (RENAME[a.title]) patch(a.id, { title: RENAME[a.title] }, { render: false });
    else if (a.title === 'Perso' && !used(a.id)) patch(a.id, { status: 'trashed' }, { render: false });
  }
  const have = new Set(areas().map(a => a.title));
  DEFAULT_AREAS.filter(t => !have.has(t)).forEach(t => saveItem(newItem({ kind: 'area', title: t }), { render: false }));
}
export function sortTasks(a, b) {
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
export function spawnNext(t) {
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
export function complete(id) {
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

export function clarify(id, v) {
  const it = S.items.get(id);
  if (!it) return;
  switch (v) {
    case 'done': patch(id, { kind: 'task', status: 'done', completed_at: nowIso() }); toast('Fait', () => patch(id, { kind: 'inbox', status: 'active', completed_at: null })); break;
    case 'today': patch(id, { kind: 'task', status: 'active', scheduled_date: today(), day_order: nextOrder(today()) }); openEditor(id); break;
    case 'task': patch(id, { kind: 'task', status: 'active' }); openEditor(id); break;
    case 'waiting': patch(id, { kind: 'task', status: 'waiting' }); openEditor(id, { focus: 'waiting_for' }); break;
    case 'project': patch(id, { kind: 'project', status: 'active' }); openEditor(id); document.getElementById('ed-next')?.focus(); break;
    case 'note': patch(id, { kind: 'note', status: 'active' }); openEditor(id); break;
    // un titre qui n'est que l'adresse est vidé : le signet affiche le domaine en attendant un vrai titre
    case 'bookmark': patch(id, { kind: 'bookmark', status: 'active', title: it.url && it.title.trim() === it.url ? '' : it.title }); openEditor(id); break;
    case 'someday': patch(id, { kind: 'task', status: 'someday' }); toast('Rangé dans Un jour', () => patch(id, { kind: 'inbox', status: 'active' })); break;
    case 'trash': patch(id, { status: 'trashed' }); toast('Supprimé', () => patch(id, { status: 'active' })); break;
  }
  if (route().arg) history.replaceState(null, '', '#/clarify');
}
export function moveInDay(id, dir) {
  const day = S.ui.day;
  const list = ofKind('task').filter(t => t.scheduled_date === day && !t.scheduled_time && (t.status === 'active' || t.status === 'waiting'))
    .sort((a, b) => (a.day_order ?? 1e15) - (b.day_order ?? 1e15) || a.created_at.localeCompare(b.created_at));
  const i = list.findIndex(t => t.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((t, k) => { if (t.day_order !== k + 1) { t.day_order = k + 1; saveItem(t, { render: false }); } });
  return true;
}
export function evening(id, v) {
  const t = S.items.get(id);
  if (!t) return;
  const prev = { status: t.status, scheduled_date: t.scheduled_date, scheduled_time: t.scheduled_time, day_order: t.day_order, focus: t.focus };
  const undo = () => patch(id, prev);
  if (v === 'done') { complete(id); return; }
  if (v === 'tomorrow') { const d = addDays(today(), 1); patch(id, { scheduled_date: d, day_order: nextOrder(d), focus: null }); toast('Reporté à demain', undo); }
  if (v === 'next') { patch(id, { status: 'active', scheduled_date: null, scheduled_time: null, day_order: null, focus: null }); toast('Remis en prochaine action', undo); }
  if (v === 'waiting') { patch(id, { status: 'waiting', scheduled_date: null, scheduled_time: null, day_order: null, focus: null }); openEditor(id, { focus: 'waiting_for' }); }
}
export function createReminder(id) {
  const t = S.items.get(id);
  const date = t.scheduled_date || t.due_date;
  const payload = JSON.stringify({ titre: t.title, date: `${date} ${t.scheduled_time || '09:00'}`, notes: t.body || '' });
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(S.prefs.reminderShortcut || 'Rappel GTD')}&input=text&text=${encodeURIComponent(payload)}`;
}
export const somedayItems = () => live().filter(i => i.status === 'someday');
