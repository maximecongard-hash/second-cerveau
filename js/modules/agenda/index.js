import { esc, I, sec, today, addDays, pad, fmtDate, fmtDur, empty } from '../../core/util.js';
import { S, live, newItem, saveItem, patch, savePrefs } from '../../core/store.js';
import { registerModule, kindOwner } from '../../core/modules.js';
import { SH, sheet, showSheet, closeSheet, setField, route, render, queueRender, toast } from '../../core/ui.js';
import { DEMO } from '../../core/config.js';
import { views, untimedOn, weekSpan } from './views.js';
import './dnd.js';
import { appleActs, appleSettings, loadEvents, seedDemoEvents } from './apple.js';

// ---------------------------------------------------------------------------
// Module « Agenda » : la journée et la semaine en grille horaire.
// Il ne possède aucun type d'élément : il place à une heure les tâches du module Organisation
// via le cœur (setField est routé vers le module propriétaire).
// Les événements de Calendrier (apple.js) s'affichent à côté, en lecture seule.
// ---------------------------------------------------------------------------
let slot = null; // { day, t } de la feuille « Placer à… »

const nextActions = () => live().filter(i => i.kind === 'task' && i.status === 'active' && !i.scheduled_date)
  .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.created_at.localeCompare(b.created_at));
// Prochaine demi-heure (aujourd'hui), sinon 9 h
function defaultTime(day) {
  if (day !== today()) return '09:00';
  const d = new Date(), m = Math.min(23 * 60 + 30, Math.ceil((d.getHours() * 60 + d.getMinutes() + 1) / 30) * 30);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function openSlot(day, t) {
  SH.mode = 'ag-slot';
  slot = { day, t };
  renderSlot();
  showSheet();
}
function renderSlot() {
  const { day, t } = slot;
  const row = i => `<button class="row link-pick" data-act="ag-place" data-id="${i.id}"><div class="row-main"><div class="row-title">${esc(i.title) || '<i>Sans titre</i>'}</div>
      <div class="row-meta">${i.duration_min ? `<span>${fmtDur(i.duration_min)}</span>` : ''}${i.due_date ? `<span class="m-due">Échéance ${fmtDate(i.due_date).toLowerCase()}</span>` : ''}${(i.contexts || []).map(c => `<span class="m-ctx">${esc(c)}</span>`).join('')}</div></div></button>`;
  const untimed = untimedOn(day), next = nextActions().slice(0, 40);
  sheet.innerHTML = `<div class="sheet-head"><button class="link" data-act="close">Annuler</button><span class="sheet-kind">${esc(fmtDate(day))}</span><span></span></div>
    <div class="ag-slot-time"><label for="ag-time">Heure</label><input type="time" id="ag-time" value="${t}" step="300"></div>
    ${kindOwner('task') ? `<form class="inline-add" data-form="ag-new"><input id="ag-new" placeholder="+ Nouvelle tâche à cette heure" enterkeyhint="done" autocomplete="off"></form>` : ''}
    ${untimed.length ? sec('Prévues ce jour, sans heure', `<div class="list">${untimed.map(row).join('')}</div>`) : ''}
    ${sec('Prochaines actions', next.length ? `<div class="list">${next.map(row).join('')}</div>` : empty('Aucune prochaine action sans date'))}`;
}

const acts = {
  'ag-day': el => {
    const d = +el.dataset.d;
    const step = route().name === 'week' ? weekSpan() : 1;
    S.ui.agDay = d === 0 ? today() : addDays(S.ui.agDay, d * step);
    render();
  },
  'ag-open': el => { S.ui.agDay = el.dataset.d; location.hash = '#/agenda'; },
  'ag-slot': el => openSlot(el.dataset.d, el.dataset.t),
  'ag-place': el => {
    const id = el.dataset.id, it = S.items.get(id);
    if (!it) return;
    const { day, t } = slot;
    const prev = { scheduled_date: it.scheduled_date, scheduled_time: it.scheduled_time, day_order: it.day_order, focus: it.focus };
    if (it.scheduled_date !== day) setField(id, 'scheduled_date', day, false);
    setField(id, 'scheduled_time', t, false);
    closeSheet();
    toast(`Placé à ${t}`, () => patch(id, prev));
  },
  ...appleActs
};

const forms = {
  'ag-new': f => {
    const v = f.querySelector('input').value.trim();
    if (!v) return;
    const { day, t } = slot;
    saveItem(newItem({ kind: 'task', title: v, scheduled_date: day, scheduled_time: t, duration_min: 30 }));
    closeSheet();
    toast(`Ajouté à ${t}`);
  }
};

function onChange(t) {
  if (t.id === 'ag-time') { if (slot && t.value) slot.t = t.value; return true; }
  if (t.dataset.agpref) {
    const v = +t.value, k = t.dataset.agpref;
    if (k === 'agStart' && v >= S.prefs.agEnd) S.prefs.agEnd = Math.min(24, v + 1);
    if (k === 'agEnd' && v <= S.prefs.agStart) S.prefs.agStart = Math.max(0, v - 1);
    S.prefs[k] = v;
    savePrefs();
    return true;
  }
  return false;
}

function settings() {
  const opts = (k, from, to) => `<select data-agpref="${k}">${Array.from({ length: to - from + 1 }, (_, n) => from + n)
    .map(h => `<option value="${h}" ${S.prefs[k] === h ? 'selected' : ''}>${pad(h)} h</option>`).join('')}</select>`;
  return sec('Heures', `<div class="muted small pad">Heures affichées dans la grille. Elle s'élargit seule si un créneau en sort.</div>
    <div class="fields"><div class="f-row"><label>Début</label><div class="f-val">${opts('agStart', 0, 12)}</div></div>
    <div class="f-row"><label>Fin</label><div class="f-val">${opts('agEnd', 13, 24)}</div></div></div>`) + appleSettings();
}

// Démo : quelques créneaux (dont deux qui se chevauchent) en plus des tâches du module Organisation
function seedDemo() {
  const t0 = today(), add = f => saveItem(newItem({ kind: 'task', ...f }), { render: false });
  add({ title: 'Point avec Julie', scheduled_date: t0, scheduled_time: '10:00', duration_min: 60, contexts: ['@tél'] });
  add({ title: 'Relire le devis', scheduled_date: t0, scheduled_time: '10:30', duration_min: 30, contexts: ['@ordi'] });
  add({ title: 'Course à pied', scheduled_date: t0, scheduled_time: '12:30', duration_min: 45 });
  add({ title: 'Dentiste', scheduled_date: addDays(t0, 1), scheduled_time: '09:00', duration_min: 30, contexts: ['@dehors'] });
  add({ title: 'Atelier site perso', scheduled_date: addDays(t0, 2), scheduled_time: '14:00', duration_min: 120, contexts: ['@ordi'] });
}

registerModule({
  id: 'agenda',
  label: 'Agenda',
  icon: I.calendar,
  description: 'La journée et la semaine en grille horaire. Touche un créneau pour y placer une tâche.',
  defaultOn: true,
  home: 'agenda',
  tabs: [
    ['agenda', 'Jour', I.sun],
    ['week', 'Semaine', I.calendar]
  ],
  views, acts, forms,
  fab: () => openSlot(S.ui.agDay, defaultTime(S.ui.agDay)),
  prefs: { agStart: 7, agEnd: 22, agApple: true },
  ui: { agDay: today() },
  settings,
  settingsMeta: 'Heures · Calendrier Apple',
  seedDemo,
  onChange,
  // après chaque synchro : relit les événements de Calendrier (au plus toutes les 5 minutes)
  afterSync: () => { if (DEMO) seedDemoEvents(); else loadEvents(); return false; },
  onResume: () => {
    loadEvents();
    if (S.ui.agDay < today() && ['agenda', 'week'].includes(route().name)) S.ui.agDay = today();
    if (['agenda', 'week'].includes(route().name)) queueRender();
  }
});
