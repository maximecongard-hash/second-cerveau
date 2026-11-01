import { esc, I, chip, today, addDays, nowIso, fmtDate, fmtDur } from '../../core/util.js';
import { S, patch } from '../../core/store.js';
import { SH, sheet, showSheet, closeSheet, render, renderEditor, route, toast } from '../../core/ui.js';
import { restFor } from './exercises.js';
import {
  isStrength, estimate, human, clock, parseClock, parseKm, kmInput, fmtKm, fmtTarget, BLOCK_TYPES, setsOf, findEx, mutate, clone, lastPerf, perfText, fmtW, isEndurance, icon
} from './model.js';
import { stepper } from './editor.js';

// ---------------------------------------------------------------------------
// Mode direct : chrono de la séance, séries à cocher avec minuteur de repos (renfo),
// bloc par bloc avec compte à rebours (course, vélo, natation), fin de séance.
// L'état de la séance vit dans l'élément (séries cochées, chrono) : rien ne se perd si l'app se ferme.
// ---------------------------------------------------------------------------
const spent = it => (it.spent_sec || 0) + (it.timer_started_at ? Math.max(0, Math.round((Date.now() - Date.parse(it.timer_started_at)) / 1000)) : 0);
const pausePatch = it => (it.timer_started_at ? { spent_sec: spent(it), timer_started_at: null } : {});

// ---- sons et écran allumé ----------------------------------------------------
let ctx = null;
export function unlockAudio() {
  try { ctx ??= new (window.AudioContext || window.webkitAudioContext)(); ctx.resume?.(); } catch {}
}
function beep(n = 2) {
  if (S.prefs.sportSound === false || !ctx) return;
  try {
    for (let k = 0; k < n; k++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + k * 0.28;
      o.type = 'sine'; o.frequency.value = k === n - 1 && n > 1 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.25);
    }
  } catch {}
}
let lock = null;
async function wake() {
  try {
    if (lock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch {}
}
const unwake = () => { try { lock?.release?.(); } catch {} lock = null; };

// ---- démarrage ---------------------------------------------------------------
export function startWorkout(id) {
  const it = S.items.get(id);
  if (!it) return;
  unlockAudio();
  const p = {};
  if (!it.timer_started_at) p.timer_started_at = nowIso();
  if (!it.scheduled_date) p.scheduled_date = today();
  if (Object.keys(p).length) patch(id, p, { render: false });
  S.ui.spLive = { id };
  S.ui.spRest = null;
  S.ui.spEx = null;
  S.ui.spStep = { i: 0, acc: 0, at: Date.now() };
  if (SH.mode) closeSheet();
  location.hash = '#/sport-live/' + id;
  render();
}

// ---- étapes d'endurance (répétitions dépliées) ------------------------------------
function steps(it) {
  const out = [];
  const add = (b, round) => out.push({ type: b.type, label: b.label || BLOCK_TYPES[b.type], dur_s: b.dur_s || 0, dist_m: b.dist_m || 0, target: b.target, round });
  for (const b of it.meta?.blocks || []) {
    if (b.type === 'repeat') for (let r = 1; r <= (b.repeat || 1); r++) for (const c of b.children || []) add(c, `${r}/${b.repeat || 1}`);
    else add(b);
  }
  return out;
}
const stepElapsed = () => { const s = S.ui.spStep; return s ? s.acc + (s.at ? Date.now() - s.at : 0) : 0; };

// ---- vue ---------------------------------------------------------------------
const header = it => {
  const run = !!it.timer_started_at;
  return `<div class="sp-live-h"><div class="sp-live-title">${esc(it.title)}</div>
    <div class="sp-clock ${run ? '' : 'paused'}" data-spclock="${it.id}">${clock(spent(it))}</div></div>`;
};
const footer = it => {
  const run = !!it.timer_started_at;
  return `<div class="sp-live-f"><button type="button" class="btn" data-act="sp-live-pause" data-id="${it.id}">${run ? 'Pause' : 'Reprendre'}</button>
    <button type="button" class="btn primary" data-act="sp-finish" data-id="${it.id}">Terminer</button>
    <button type="button" class="btn" data-act="sp-live-quit" data-id="${it.id}">Quitter</button></div>`;
};

function currentEx(it) {
  const ex = it.meta?.exercises || [];
  return ex.find(e => e.id === S.ui.spEx) || ex.find(e => setsOf(e).some(s => !s.done)) || ex[ex.length - 1] || null;
}
function strengthLive(it) {
  const exs = it.meta?.exercises || [], ex = currentEx(it);
  const all = exs.reduce((n, e) => n + setsOf(e).length, 0), done = exs.reduce((n, e) => n + setsOf(e).filter(s => s.done).length, 0);
  if (!ex) return '<div class="muted pad">Cette séance n’a pas d’exercice. Ajoute-en depuis l’éditeur.</div>';
  const last = lastPerf(ex.name, it.id);
  const rest = S.ui.spRest && S.ui.spRest.until > Date.now() ? S.ui.spRest : null;
  return `<div class="sp-prog"><div class="sp-bar"><i style="width:${all ? Math.round(done / all * 100) : 0}%"></i></div><span>${done}/${all} séries</span></div>
    ${rest ? `<div class="sp-rest-box"><div><small>Repos</small><b data-sprest>${clock(Math.ceil((rest.until - Date.now()) / 1000))}</b></div>
      <div class="sp-rest-b"><button type="button" class="chip" data-act="sp-rest-add" data-d="-15">−15 s</button><button type="button" class="chip" data-act="sp-rest-add" data-d="15">+15 s</button><button type="button" class="chip on" data-act="sp-rest-skip">Passer</button></div>
      <div class="sp-bar"><i data-sprestbar style="width:${Math.max(0, Math.round((rest.until - Date.now()) / (rest.total * 10)))}%"></i></div></div>` : ''}
    <div class="sp-ex live"><div class="sp-ex-h"><div class="sp-ex-title">${esc(ex.name)}</div></div>
      ${last ? `<div class="sp-last">Dernière fois (${esc(fmtDate(last.day).toLowerCase())}) : ${esc(perfText(last))}</div>` : ''}
      ${ex.note ? `<div class="sp-last">${esc(ex.note)}</div>` : ''}
      <div class="sp-sets">${setsOf(ex).map((s, i) => `<div class="sp-set ${s.done ? 'done' : ''}"><span class="sp-n">${i + 1}</span>${stepper(ex.id, i, 'reps', s.reps, 1)}<span class="sp-x">×</span>${stepper(ex.id, i, 'w', s.w, 2.5)}<span class="sp-u">kg</span>
        <button type="button" class="sp-check ${s.done ? 'on' : ''}" data-act="sp-set-check" data-ex="${ex.id}" data-i="${i}" aria-label="${s.done ? 'Série faite' : 'Valider la série'}">${I.check}</button></div>`).join('')}</div>
      <div class="sp-ex-f"><button type="button" class="chip" data-act="sp-set-add" data-ex="${ex.id}">+ Série</button></div></div>
    <div class="chips scroll sp-exnav">${exs.map(e => `<button type="button" class="chip ${e.id === ex.id ? 'on' : ''} ${setsOf(e).length && setsOf(e).every(s => s.done) ? 'ok' : ''}" data-act="sp-ex-go" data-ex="${e.id}">${esc(e.name)}</button>`).join('')}</div>`;
}
function enduranceLive(it) {
  const list = steps(it), s = S.ui.spStep || { i: 0 };
  if (!list.length) return '<div class="muted pad">Cette séance n’a pas de bloc. Ajoute-en depuis l’éditeur.</div>';
  const i = Math.min(s.i, list.length - 1), cur = list[i], next = list[i + 1];
  const rem = cur.dur_s ? Math.max(0, cur.dur_s - Math.floor(stepElapsed() / 1000)) : null;
  const total = list.reduce((n, x) => n + x.dur_s, 0), t = fmtTarget(cur.target);
  return `<div class="sp-prog"><div class="sp-bar"><i style="width:${Math.round(i / list.length * 100)}%"></i></div><span>Étape ${i + 1}/${list.length}</span></div>
    <div class="sp-step-box t-${cur.type}"><div class="sp-step-type">${esc(cur.label)}${cur.round ? ` · ${cur.round}` : ''}</div>
      <div class="sp-step-time" data-spstep>${rem != null ? clock(rem) : cur.dist_m ? esc(fmtKm(cur.dist_m)) : '—'}</div>
      ${t ? `<div class="sp-step-target">${esc(t)}</div>` : ''}${cur.dur_s && cur.dist_m ? `<div class="sp-step-target">${esc(fmtKm(cur.dist_m))}</div>` : ''}</div>
    ${next ? `<div class="sp-next">Ensuite : ${esc(next.label)} ${next.dur_s ? human(next.dur_s) : next.dist_m ? fmtKm(next.dist_m) : ''}${fmtTarget(next.target) ? ' · ' + esc(fmtTarget(next.target)) : ''}</div>` : '<div class="sp-next">Dernière étape.</div>'}
    <div class="sp-live-nav"><button type="button" class="btn" data-act="sp-step-go" data-d="-1" ${i === 0 ? 'disabled' : ''}>Précédente</button><button type="button" class="btn primary" data-act="sp-step-go" data-d="1">${next ? 'Suivante' : 'Terminer'}</button></div>
    <div class="muted small pad">${total ? `Durée prévue ${esc(human(total))}. ` : ''}Le chrono tourne en haut ; la séance se termine avec « Terminer ».</div>`;
}

export const liveViews = {
  'sport-live': id => {
    const it = S.items.get(id || S.ui.spLive?.id);
    if (!it || it.kind !== 'workout') return { title: 'Séance', html: '<div class="muted pad">Séance introuvable. <a href="#/sport">Retour</a></div>' };
    if (it.status === 'done') return { title: it.title, html: `<div class="muted pad">Cette séance est terminée. <a href="#/sport">Retour à la semaine</a></div>` };
    S.ui.spLive = { id: it.id };
    return { title: it.title, html: `<div class="sp-live">${header(it)}${isStrength(it) ? strengthLive(it) : enduranceLive(it)}${footer(it)}</div>` };
  }
};

// ---- tic de 500 ms : horloges, repos, compte à rebours, écran allumé ---------------
export function liveTick() {
  const on = route().name === 'sport-live';
  if (!on) { unwake(); return; }
  wake();
  const it = S.items.get(S.ui.spLive?.id);
  if (!it) return;
  document.querySelectorAll('[data-spclock]').forEach(el => { el.textContent = clock(spent(it)); });
  const rest = S.ui.spRest;
  if (rest) {
    const left = Math.ceil((rest.until - Date.now()) / 1000);
    document.querySelectorAll('[data-sprest]').forEach(el => { el.textContent = clock(left); });
    document.querySelectorAll('[data-sprestbar]').forEach(el => { el.style.width = Math.max(0, Math.round((rest.until - Date.now()) / (rest.total * 10))) + '%'; });
    if (left <= 0) { S.ui.spRest = null; beep(3); render(); }
  }
  if (!isStrength(it) && it.timer_started_at) {
    const list = steps(it), i = S.ui.spStep?.i ?? 0, cur = list[i];
    if (cur?.dur_s) {
      const left = cur.dur_s - Math.floor(stepElapsed() / 1000);
      document.querySelectorAll('[data-spstep]').forEach(el => { el.textContent = clock(Math.max(0, left)); });
      if (left <= 0 && i < list.length - 1) { gotoStep(i + 1); beep(2); render(); }
      else if (left === 3 || left === 2 || left === 1) { if (S.ui.spStep.warn !== left) { S.ui.spStep.warn = left; beep(1); } }
    }
  }
}
function gotoStep(i) { S.ui.spStep = { i, acc: 0, at: S.ui.spStep?.at === null ? null : Date.now() }; }

// ---- fin de séance -----------------------------------------------------------
export function openFinish(id) {
  const it = S.items.get(id);
  if (!it) return;
  const r = it.meta?.result || {};
  S.ui.spFin = { id, rpe: r.rpe || it.meta?.rpeTarget || null, feeling: r.feeling || null, dur: r.dur_s || spent(it) || (it.duration_min || 0) * 60, dist: r.dist_m || estimate(it).dist || null, hr: r.avg_hr || null, note: r.note || '' };
  SH.mode = 'sp-finish';
  renderFinish();
  showSheet();
}
function readFin() {
  const f = S.ui.spFin, g = i => document.getElementById(i);
  if (!f || !g('fin-dur')) return;
  f.dur = parseClock(g('fin-dur').value) ?? f.dur;
  if (g('fin-dist')) f.dist = parseKm(g('fin-dist').value);
  if (g('fin-hr')) f.hr = parseInt(g('fin-hr').value, 10) || null;
  f.note = g('fin-note')?.value ?? f.note;
}
export function renderFinish() {
  const f = S.ui.spFin, it = S.items.get(f?.id);
  if (!it) return;
  const scale = (k, from, to, labels) => `<div class="chips wrap">${Array.from({ length: to - from + 1 }, (_, n) => from + n).map(v => `<button type="button" class="chip ${f[k] === v ? 'on' : ''}" data-act="sp-fin-set" data-k="${k}" data-v="${v}">${labels?.[v] ?? v}</button>`).join('')}</div>`;
  sheet.innerHTML = `<div class="sheet-head"><button class="link" data-act="close">Annuler</button><span class="sheet-kind">Séance terminée</span><span></span></div>
    <form data-form="sp-finish-save"><div class="title-static">${esc(it.title)}</div>
    <div class="fields">
      <div class="f-row"><label for="fin-dur">Durée</label><div class="f-val"><input id="fin-dur" inputmode="numeric" value="${f.dur ? clock(f.dur) : ''}" placeholder="mm:ss"></div></div>
      ${isEndurance(it) ? `<div class="f-row"><label for="fin-dist">Distance (km)</label><div class="f-val"><input id="fin-dist" inputmode="decimal" value="${kmInput(f.dist)}"></div></div>
      <div class="f-row"><label for="fin-hr">FC moyenne</label><div class="f-val"><input id="fin-hr" inputmode="numeric" value="${f.hr || ''}" placeholder="bpm"></div></div>` : ''}
    </div>
    <div class="sp-q">Effort ressenti (1 facile · 10 maximal)</div>${scale('rpe', 1, 10)}
    <div class="sp-q">Comment c’était ?</div>${scale('feeling', 1, 5, { 1: 'Pénible', 2: 'Moyen', 3: 'Correct', 4: 'Bien', 5: 'Excellent' })}
    <textarea id="fin-note" class="notes-input" rows="3" placeholder="Note (sensations, météo…)">${esc(f.note)}</textarea>
    <button class="btn primary block" type="submit">Enregistrer</button></form>`;
  SH.onSubmit = () => saveFinish();
}
function saveFinish() {
  readFin();
  const f = S.ui.spFin, it = S.items.get(f?.id);
  if (!it) return;
  const before = { meta: clone(it.meta), status: it.status, completed_at: it.completed_at, spent_sec: it.spent_sec, timer_started_at: it.timer_started_at, scheduled_date: it.scheduled_date };
  const meta = clone(it.meta) || {};
  meta.result = { dur_s: f.dur || null, dist_m: f.dist || null, avg_hr: f.hr || null, rpe: f.rpe || null, feeling: f.feeling || null, note: (f.note || '').trim(), source: 'manual', ext_id: null };
  // séance de renfo marquée faite sans avoir coché de série : on la compte comme réalisée telle que prévue
  if (isStrength(it) && !(meta.exercises || []).some(e => setsOf(e).some(s => s.done))) (meta.exercises || []).forEach(e => setsOf(e).forEach(s => { s.done = true; }));
  patch(it.id, { meta, status: 'done', completed_at: nowIso(), spent_sec: f.dur || spent(it), timer_started_at: null, scheduled_date: it.scheduled_date || today() }, { render: false });
  S.ui.spRest = null; S.ui.spLive = null; S.ui.spFin = null;
  closeSheet();
  if (route().name === 'sport-live') location.hash = '#/sport';
  toast('Séance enregistrée', () => patch(it.id, before));
}

// ---- actions -----------------------------------------------------------------
export const liveActs = {
  'sp-start': el => startWorkout(el.dataset.id),
  'sp-finish': el => openFinish(el.dataset.id),
  'sp-fin-set': el => { readFin(); const f = S.ui.spFin; f[el.dataset.k] = f[el.dataset.k] === +el.dataset.v ? null : +el.dataset.v; renderFinish(); },
  'sp-reopen': el => {
    const id = el.dataset.id, it = S.items.get(id);
    if (!it) return;
    patch(id, { status: 'active', completed_at: null });
    if (SH.mode === 'editor') renderEditor(); else render();
  },
  'sp-postpone': el => {
    const it = S.items.get(el.dataset.id);
    if (!it) return;
    const prev = { scheduled_date: it.scheduled_date, scheduled_time: it.scheduled_time };
    patch(it.id, { scheduled_date: addDays(today(), 1) });
    toast('Reportée à demain', () => patch(it.id, prev));
  },
  'sp-live-pause': el => {
    const it = S.items.get(el.dataset.id);
    if (!it) return;
    const s = S.ui.spStep;
    if (it.timer_started_at) { patch(it.id, pausePatch(it), { render: false }); if (s?.at) { s.acc += Date.now() - s.at; s.at = null; } }
    else { patch(it.id, { timer_started_at: nowIso() }, { render: false }); if (s) s.at = Date.now(); unlockAudio(); }
    render();
  },
  'sp-live-quit': el => {
    const it = S.items.get(el.dataset.id);
    if (it?.timer_started_at) patch(it.id, pausePatch(it), { render: false });
    S.ui.spRest = null;
    location.hash = '#/sport';
  },
  'sp-ex-go': el => { S.ui.spEx = el.dataset.ex; render(); },
  'sp-set-check': el => {
    unlockAudio();
    const id = S.ui.spLive?.id, it = S.items.get(id);
    if (!it) return;
    let started = null;
    mutate(id, m => {
      const e = findEx(m, el.dataset.ex), s = e?.sets[+el.dataset.i];
      if (!s) return;
      s.done = !s.done;
      if (s.done) {
        const rest = e.rest_s || restFor(e.name), allDone = m.exercises.every(x => setsOf(x).every(y => y.done));
        if (!allDone && rest) started = { until: Date.now() + rest * 1000, total: rest };
      }
    });
    S.ui.spRest = started;
    S.ui.spEx = null; // retombe sur le premier exercice non terminé
    const ex = findEx(S.items.get(id).meta, el.dataset.ex);
    if (ex && setsOf(ex).some(s => !s.done)) S.ui.spEx = ex.id;
    render();
  },
  'sp-rest-add': el => {
    const r = S.ui.spRest;
    if (!r) return;
    r.until += +el.dataset.d * 1000;
    r.total = Math.max(r.total, Math.ceil((r.until - Date.now()) / 1000));
    render();
  },
  'sp-rest-skip': () => { S.ui.spRest = null; render(); },
  'sp-step-go': el => {
    const it = S.items.get(S.ui.spLive?.id);
    if (!it) return;
    const list = steps(it), i = S.ui.spStep?.i ?? 0, d = +el.dataset.d;
    if (d > 0 && i >= list.length - 1) { openFinish(it.id); return; }
    unlockAudio();
    gotoStep(Math.max(0, Math.min(list.length - 1, i + d)));
    render();
  }
};
export const liveForms = { 'sp-finish-save': () => saveFinish() };
