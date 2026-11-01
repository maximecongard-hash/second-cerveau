import { esc, fRow, sel, today, addDays, fmtDate, plural } from '../../core/util.js';
import { S, newItem, saveItem, patch } from '../../core/store.js';
import { SH, renderEditor, toast, openEditor } from '../../core/ui.js';
import { templates, freshMeta, monday, estimate, workouts, doneDay } from './model.js';

// ---------------------------------------------------------------------------
// Semaine type : un `program` dont meta = { plan: [{ wd, tpl, time }], weeks, start }
// « Générer » crée les séances datées (parent_id = la semaine type), sans doubler celles qui existent déjà.
// ---------------------------------------------------------------------------
const DAYS = [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [0, 'Dimanche']];
const WEEKS = [2, 3, 4, 6, 8, 12].map(n => [n, `${n} semaines`]);

export function createProgram() {
  const it = saveItem(newItem({ kind: 'program', title: 'Ma semaine type', meta: { plan: [], weeks: 4, start: monday(today()) } }));
  SH.draftId = it.id;
  openEditor(it.id);
}
const planOf = it => it.meta?.plan || [];
function mutateProg(id, fn) {
  const it = S.items.get(id);
  if (!it) return;
  const meta = JSON.parse(JSON.stringify(it.meta || { plan: [], weeks: 4 }));
  fn(meta);
  patch(id, { meta });
}
const dateOf = (start, w, wd) => addDays(monday(start), w * 7 + (wd + 6) % 7);
const generated = id => workouts().filter(w => w.parent_id === id);

export function programEditor(it) {
  const tpls = templates(), plan = planOf(it);
  const m = it.meta || {};
  const head = `<div class="sheet-head"><button class="link strong" data-act="close">OK</button><span class="sheet-kind">Semaine type</span><button class="link danger" data-act="trash" data-id="${it.id}">Supprimer</button></div>`;
  const rows = plan.map((p, i) => `<div class="sp-plan"><select data-sprog="wd" data-i="${i}" aria-label="Jour">${DAYS.map(([v, l]) => `<option value="${v}" ${+p.wd === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select data-sprog="tpl" data-i="${i}" aria-label="Modèle">${tpls.map(t => `<option value="${t.id}" ${p.tpl === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select>
      <input type="time" data-sprog="time" data-i="${i}" value="${p.time || ''}" aria-label="Heure">
      <button type="button" class="icon-btn" data-act="sp-prog-del" data-i="${i}" aria-label="Retirer">−</button></div>`).join('');
  const g = generated(it.id), future = g.filter(w => w.status === 'active' && w.scheduled_date >= today());
  return head + `<input class="title-input" data-f="title" id="f-title" value="${esc(it.title)}" placeholder="Nom de la semaine type" autocomplete="off">
    <div class="muted small pad">Choisis les jours et les modèles. « Générer » place les séances dans l’Agenda, semaine après semaine.</div>
    <div class="fields">${fRow('Début', `<input type="date" data-sprog="start" value="${m.start || ''}">`)}${fRow('Durée', sel('sprog_weeks', m.weeks || 4, WEEKS))}</div>
    <div class="sp-plans">${rows || '<div class="muted small pad">Aucune séance dans la semaine.</div>'}</div>
    ${tpls.length ? `<div class="quick"><button type="button" class="chip" data-act="sp-prog-add">+ Séance</button></div>` : '<div class="muted small pad">Crée d’abord un modèle (une séance enregistrée comme modèle).</div>'}
    <button type="button" class="btn primary block" data-act="sp-prog-gen" data-id="${it.id}" ${plan.length ? '' : 'disabled'}>Générer les séances</button>
    ${g.length ? `<div class="muted small pad">${plural(g.length, 'séance générée', 'séances générées')} · ${future.length} à venir. ${future.length ? '<button type="button" class="link danger" data-act="sp-prog-clear" data-id="' + it.id + '">Retirer les séances à venir</button>' : ''}</div>` : ''}`;
}

export function programSetField(id, f, v) {
  if (f === 'sprog_weeks') { mutateProg(id, m => { m.weeks = +v || 4; }); return; }
  if (f === 'title') { patch(id, { title: v }); return; }
  patch(id, { [f]: v });
}
export function programChange(t) {
  const k = t.dataset.sprog;
  if (!k) return false;
  const id = SH.editingId;
  mutateProg(id, m => {
    if (k === 'start') { m.start = t.value || monday(today()); return; }
    const p = m.plan[+t.dataset.i];
    if (!p) return;
    if (k === 'wd') p.wd = +t.value;
    else if (k === 'tpl') p.tpl = t.value;
    else if (k === 'time') p.time = t.value || null;
  });
  renderEditor();
  return true;
}

export const programActs = {
  'sp-prog-add': () => {
    const t = templates()[0];
    if (!t) return;
    mutateProg(SH.editingId, m => { (m.plan ??= []).push({ wd: 1, tpl: t.id, time: '18:30' }); });
    renderEditor();
  },
  'sp-prog-del': el => { mutateProg(SH.editingId, m => { m.plan.splice(+el.dataset.i, 1); }); renderEditor(); },
  'sp-prog-gen': el => {
    const prog = S.items.get(el.dataset.id);
    if (!prog) return;
    const m = prog.meta || {}, have = new Set(generated(prog.id).map(w => `${w.scheduled_date}|${w.meta?.tpl}`));
    const made = [];
    for (let w = 0; w < (m.weeks || 4); w++) for (const p of m.plan || []) {
      const tpl = S.items.get(p.tpl), day = dateOf(m.start || today(), w, +p.wd);
      if (!tpl || tpl.status === 'trashed' || day < today() || have.has(`${day}|${tpl.id}`)) continue;
      const meta = freshMeta(tpl.meta);
      meta.tpl = tpl.id;
      const it = newItem({ kind: 'workout', title: tpl.title, body: tpl.body, meta, duration_min: tpl.duration_min, tags: [...(tpl.tags || [])], scheduled_date: day, scheduled_time: p.time || null, parent_id: prog.id });
      made.push(saveItem(it, { render: false }));
    }
    renderEditorSafe();
    toast(made.length ? `${plural(made.length, 'séance placée', 'séances placées')}` : 'Rien de nouveau à placer', made.length ? () => { made.forEach(x => patch(x.id, { status: 'trashed' }, { render: false })); renderEditorSafe(); } : undefined);
  },
  'sp-prog-clear': el => {
    const gone = generated(el.dataset.id).filter(w => w.status === 'active' && w.scheduled_date >= today());
    gone.forEach(w => patch(w.id, { status: 'trashed' }, { render: false }));
    renderEditorSafe();
    toast(`${plural(gone.length, 'séance retirée', 'séances retirées')}`, () => { gone.forEach(w => patch(w.id, { status: 'active' }, { render: false })); renderEditorSafe(); });
  }
};
function renderEditorSafe() { if (SH.mode === 'editor') renderEditor(); }
