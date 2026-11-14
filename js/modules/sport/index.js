import { esc, I, sec, today, addDays, plural, fmtDate, fmtDur, switchBtn } from '../../core/util.js';
import { S, newItem, saveItem, patch, savePrefs } from '../../core/store.js';
import { registerModule } from '../../core/modules.js';
import { SH, sheet, showSheet, closeSheet, render, toast, openEditor, sheetHead } from '../../core/ui.js';
import { DEFAULT_EXERCISES, GROUPS, TIMED_GROUPS, library, restFor } from './exercises.js';
import {
  SPORTS, PRESETS, createWorkout, freshMeta, monday, onDay, templates, newExercise, defaultMeta, doneDay, label, migrateLogs
} from './model.js';
import { weekAgg } from './stats.js';
import { views, workoutRow, openNew, renderNew } from './views.js';
import { editorHTML, logEditorHTML, setField as setWorkoutField, onChange as editorChange, editorActs, editorForms } from './editor.js';
import { programEditor, programSetField, programChange, programActs, createProgram } from './programs.js';
import { importFiles, pullActivityInbox } from './import.js';
import { liveViews, liveActs, liveForms, liveTick } from './live.js';

// ---------------------------------------------------------------------------
// Module « Sport » : préparer des séances (course en blocs, renfo en séries), les caler dans
// l'Agenda, les faire en direct, garder l'historique et la progression.
// Types d'éléments : workout (séance), workout_tpl (modèle), program (semaine type).
// Le contenu d'une séance vit dans la colonne `meta` (voir model.js). L'Agenda place les séances
// comme des tâches grâce à `schedulable` ; la notification de fin de créneau vient de `endNotify`.
// ---------------------------------------------------------------------------
const KINDS = ['workout', 'workout_log', 'workout_tpl', 'program'];

const acts = {
  ...editorActs, ...programActs, ...liveActs,
  'sp-week': el => {
    const d = +el.dataset.d, cur = monday(today());
    S.ui.spWeek = d === 0 ? null : addDays(S.ui.spWeek || cur, 7 * d);
    if (S.ui.spWeek === cur) S.ui.spWeek = null;
    render();
  },
  'sp-new': el => openNew({ day: el.dataset.d || null }),
  'sp-create': el => {
    const p = S.ui.spNew || {};
    const it = createWorkout({ sport: el.dataset.sport || 'run', tpl: el.dataset.tpl || null, day: p.day || null, time: p.time || null });
    closeSheet();
    SH.draftId = it.id;
    openEditor(it.id);
  },
  'sp-plan-tpl': el => {
    S.ui.spPlan = { tpl: el.dataset.id, day: today(), time: '' };
    SH.mode = 'sp-plan';
    renderPlan();
    showSheet();
  },
  'sp-tpl-new': () => {
    const it = saveItem(newItem({ kind: 'workout_tpl', title: 'Nouveau modèle', meta: defaultMeta('run') }));
    SH.draftId = it.id;
    openEditor(it.id);
  },
  'sp-prog-new': () => createProgram(),
  // Barre de l'historique : saute à la semaine ; filtre levé si le sport filtré n'y a rien
  'sp-goweek': el => {
    const go = () => {
      const t = document.getElementById('sp-w-' + el.dataset.mon);
      if (!t) return false;
      t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1400);
      return true;
    };
    if (!go() && S.ui.spFilter) { S.ui.spFilter = ''; render(); go(); }
  },
  'sp-filter': el => { S.ui.spFilter = el.dataset.v; render(); },
  'sp-sound': () => { S.prefs.sportSound = S.prefs.sportSound === false; savePrefs(); },
  'sp-lib-del': el => {
    const before = S.prefs.sportExercises;
    S.prefs.sportExercises = library().filter((_, i) => i !== +el.dataset.i);
    savePrefs();
    toast('Exercice retiré', () => { S.prefs.sportExercises = before; savePrefs(); });
  },
  'sp-lib-reset': () => { S.prefs.sportExercises = null; savePrefs(); }
};

function renderPlan() {
  const p = S.ui.spPlan, t = S.items.get(p?.tpl);
  if (!t) return;
  sheet.innerHTML = `${sheetHead('Planifier', { cancel: true, ok: null })}
    <form data-form="sp-plan-save"><div class="title-static">${esc(t.title)}</div>
    <div class="fields"><div class="f-row"><label for="pl-day">Jour</label><div class="f-val"><input type="date" id="pl-day" value="${p.day}"></div></div>
    <div class="f-row"><label for="pl-time">Heure</label><div class="f-val"><input type="time" id="pl-time" value="${p.time}"></div></div></div>
    <button class="btn primary block" type="submit">Placer dans l’agenda</button></form>`;
}

const forms = {
  ...editorForms, ...liveForms,
  'sp-plan-save': () => {
    const day = document.getElementById('pl-day').value || today(), time = document.getElementById('pl-time').value || null;
    const it = createWorkout({ tpl: S.ui.spPlan.tpl, day, time });
    closeSheet();
    toast(`Placée ${fmtDate(day).toLowerCase()}${time ? ' à ' + time : ''}`, () => patch(it.id, { status: 'trashed' }));
  },
  'sp-lib-add': f => {
    const name = f.querySelector('input').value.trim(), group = f.querySelector('select').value;
    if (!name || library().some(e => e.name.toLowerCase() === name.toLowerCase())) return;
    S.prefs.sportExercises = [...library(), { name, group, rest: S.prefs.sportRest || 90, ...(TIMED_GROUPS.includes(group) ? { unit: 's' } : {}) }].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    savePrefs();
  }
};

function onChange(t) {
  if (t.id === 'sp-import-file') { importFiles(t); return true; }
  if (t.dataset.sppref) {
    S.prefs[t.dataset.sppref] = +t.value;
    savePrefs();
    return true;
  }
  return editorChange(t) || programChange(t);
}

function fab(v) {
  if (v === 'template') { acts['sp-tpl-new'](); return; }
  const w = S.ui.spWeek;
  openNew({ day: w && w !== monday(today()) ? w : today() });
}

function settings() {
  const lib = library();
  return sec('Objectifs', `<div class="fields">
      <div class="f-row"><label>Séances par semaine</label><div class="f-val"><select data-sppref="sportGoal">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${(S.prefs.sportGoal || 3) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
      <div class="f-row"><label>Repos entre séries</label><div class="f-val"><select data-sppref="sportRest">${[45, 60, 75, 90, 120, 150, 180].map(n => `<option value="${n}" ${(S.prefs.sportRest || 90) === n ? 'selected' : ''}>${n} s</option>`).join('')}</select></div></div>
      <div class="f-row"><label>Son du minuteur</label><div class="f-val">${switchBtn(S.prefs.sportSound !== false, 'sp-sound', 'Son du minuteur')}</div></div>
    </div>`) +
    sec('Exercices', `<div class="muted small pad">Proposés quand tu ajoutes un exercice. Le repos par défaut suit l’exercice.</div>
      <div class="chips wrap">${lib.map((e, i) => `<button type="button" class="chip" data-act="sp-lib-del" data-i="${i}" title="${esc(e.group)} · repos ${e.rest} s">${esc(e.name)} ×</button>`).join('')}</div>
      <form class="inline-add" data-form="sp-lib-add"><input placeholder="+ Nouvel exercice" enterkeyhint="done" autocomplete="off"><select aria-label="Groupe">${GROUPS.map(g => `<option>${g}</option>`).join('')}</select></form>
      ${S.prefs.sportExercises ? '<button class="link" data-act="sp-lib-reset">Rétablir la liste de départ</button>' : ''}`);
}

// ---------------------------------------------------------------------------
// Contributions aux vues du cœur
// ---------------------------------------------------------------------------
const todayRows = day => {
  const list = onDay(day);
  return list.length ? sec('Sport', `<div class="list">${list.map(w => workoutRow(w, { start: true, noDate: true })).join('')}</div>`, '<a class="link" href="#/sport">Semaine</a>') : '';
};
const reviewStep = () => {
  const mon = monday(today()), cur = weekAgg(mon), nxt = weekAgg(addDays(mon, 7)), goal = S.prefs.sportGoal || 3;
  return { key: 'sport', title: 'Sport', desc: `Cette semaine : ${cur.n}/${goal} séances faites${cur.sec ? ` (${fmtDur(Math.round(cur.sec / 60))})` : ''}. Semaine prochaine : ${plural(nxt.plannedN, 'séance prévue', 'séances prévues')}. <a href="#/sport">Préparer</a>` };
};
const eveningHtml = () => {
  const list = onDay(addDays(today(), 1)).filter(w => w.status === 'active');
  return list.length ? `<div class="banner soft">Demain, sport : ${list.map(w => esc(w.title) + (w.scheduled_time ? ' à ' + w.scheduled_time : '')).join(', ')}</div>` : '';
};

// ---------------------------------------------------------------------------
// Démo : modèles, une semaine type, la semaine en cours et six semaines d'historique
registerModule({
  id: 'sport',
  label: 'Sport',
  icon: I.dumbbell,
  description: 'Prépare tes séances de course et de renfo, cale-les dans l’agenda, fais-les en direct et suis ta progression.',
  defaultOn: false,
  home: 'sport',
  tabs: [['sport', 'Semaine', I.calendar], ['sport-tpl', 'Modèles', I.list], ['sport-hist', 'Historique', I.trophy]],
  tabOf: { 'sport-live': 'sport' },
  kinds: KINDS,
  kindLabel: { workout: 'Séance', workout_log: 'Séance faite', workout_tpl: 'Modèle', program: 'Semaine type' },
  views: { ...views, ...liveViews },
  acts, forms, fab,
  prefs: { sportGoal: 3, sportRest: 90, sportSound: true, sportExercises: null },
  ui: { spWeek: null, spFilter: '', spNew: null, spPlan: null, spFin: null, spLive: null, spRest: null, spStep: null, spEx: null, spSecs: { contenu: true } },
  schedulable: ['workout'],
  endNotify: ['workout'],
  createAt: (kind, day, t) => openNew({ day, time: t }),
  editor: it => (it.kind === 'program' ? programEditor(it) : it.kind === 'workout_log' ? logEditorHTML(it) : editorHTML(it)),
  setField: (id, f, v) => (S.items.get(id)?.kind === 'program' ? programSetField(id, f, v) : setWorkoutField(id, f, v)),
  row: it => workoutRow(it),
  searchable: () => true,
  settings,
  settingsMeta: 'Objectif · repos · exercices',
  afterSync: () => { pullActivityInbox(); return migrateLogs(); },
  todayRows, reviewStep, eveningHtml,
  onChange
});

// Chrono, minuteur de repos et compte à rebours de la vue « séance en direct »
setInterval(() => { try { liveTick(); } catch (e) { console.warn('sport tick', e); } }, 500);
