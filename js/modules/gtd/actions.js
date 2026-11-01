import { $, today, addDays, fmtDate, nowIso } from '../../core/util.js';
import { S, newItem, saveItem, patch, savePrefs, ofKind, endAt, sameInstant } from '../../core/store.js';
import { SH, render, queueRender, route, openEditor, renderEditor, setField, closeSheet, toast } from '../../core/ui.js';
import { complete, clarify, moveInDay, evening, remindPreset, nextOrder, toggleFocus, timerStart, timerPause, timerReset } from './model.js';
import { createAndEdit, openCapture, saveCapture, openPicker, renderPicker, pickSel } from './sheets.js';

// ---------------------------------------------------------------------------
// Actions GTD (data-act) et formulaires (data-form)
// ---------------------------------------------------------------------------
// Bouton + des vues GTD
export function fab(v) {
  if (v === 'capture') openCapture();
  else if (v === 'today') openCapture({ kind: 'task', scheduled_date: S.ui.day, day_order: nextOrder(S.ui.day), label: `Tâche · ${fmtDate(S.ui.day)}` });
  else if (v === 'task') openCapture({ kind: 'task', contexts: S.ui.ctx !== 'all' && S.ui.ctx !== 'none' ? [S.ui.ctx] : [], label: 'Prochaine action' });
  else if (v === 'project') createAndEdit({ kind: 'project' });
  else if (v.startsWith('proj-task:')) openCapture({ kind: 'task', parent_id: v.split(':')[1], label: 'Action du projet' });
}

export const acts = {
  toggle: el => complete(el.dataset.id),
  kind: el => {
    const it = S.items.get(SH.editingId);
    const kind = el.dataset.v;
    const p = { kind };
    if (kind === 'project' && it.status === 'waiting') p.status = 'active';
    if (kind === 'project' && it.parent_id && S.items.get(it.parent_id)?.kind !== 'area') p.parent_id = null;
    if (kind !== 'project' && it.parent_id && S.items.get(it.parent_id)?.kind === 'area') p.parent_id = null;
    if (kind !== 'project' && it.status === 'clarify') p.status = 'active';
    if (kind !== 'task') p.focus = null;
    patch(SH.editingId, p);
    renderEditor();
  },
  ctx: el => {
    const it = S.items.get(SH.editingId);
    const c = el.dataset.v;
    const cs = it.contexts.includes(c) ? it.contexts.filter(x => x !== c) : [...it.contexts, c];
    patch(SH.editingId, { contexts: cs });
    renderEditor();
  },
  sched: el => {
    const v = el.dataset.v;
    setField(SH.editingId, 'scheduled_date', v === 'clear' ? '' : addDays(today(), +v), true);
  },
  remind: el => {
    const it = S.items.get(SH.editingId);
    patch(SH.editingId, { remind_at: remindPreset(it, el.dataset.v) });
    renderEditor();
  },
  'end-notify': () => { S.prefs.endNotify = !S.prefs.endNotify; for (const t of ofKind('task')) {
      const e = endAt(t);
      if (!sameInstant(t.end_at, e)) { t.end_at = e; saveItem(t, { render: false }); }
    }
    savePrefs();
  },
  'timer-toggle': el => {
    const t = S.items.get(el.dataset.id);
    if (t?.timer_started_at) timerPause(t.id); else if (t) timerStart(t.id);
  },
  'timer-start': () => { timerStart(SH.editingId); renderEditor(); },
  'timer-pause': () => { timerPause(SH.editingId); renderEditor(); },
  'timer-reset': () => { timerReset(SH.editingId); renderEditor(); },
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
  move: el => { if (moveInDay(el.dataset.id, +el.dataset.dir)) queueRender(); },
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
    const it = S.items.get(SH.editingId);
    toggleFocus(SH.editingId, it.scheduled_date || today());
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
  activate: el => { patch(el.dataset.id, { status: 'active' }); toast('Activé'); },
  'proj-done': el => { patch(el.dataset.id, { status: 'done', completed_at: nowIso() }); toast('Projet terminé', () => patch(el.dataset.id, { status: 'active', completed_at: null })); },
  'review-check': el => { const k = el.dataset.v; S.ui.review.has(k) ? S.ui.review.delete(k) : S.ui.review.add(k); render(); },
  'review-done': () => { S.prefs.lastReview = today(); S.ui.review.clear(); savePrefs(); toast('Revue enregistrée'); location.hash = '#/today'; },
  'ctx-del': el => { S.prefs.contexts = S.prefs.contexts.filter(c => c !== el.dataset.v); savePrefs(); },
  'cap-save': () => saveCapture()
};

export const forms = {
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
    if (SH.mode === 'editor') { renderEditor(); $('#ed-next')?.focus(); }
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
  }
};

// Saisies propres au module (renvoient true si traitées)
export function onChange(t) {
  if (t.id === 'cap-file') { $('#cap-file-name').textContent = t.files[0] ? t.files[0].name : ''; return true; }
  if (t.dataset.evdate && t.value) { patch(t.dataset.evdate, { scheduled_date: t.value, day_order: nextOrder(t.value), focus: null }); toast(`Prévu ${fmtDate(t.value).toLowerCase()}`); return true; }
  return false;
}
