import { esc, I, sec, empty, chip, today, addDays, parseYmd, fmtDate, fmtDur, cap, plural, FMT_DAY } from '../../core/util.js';
import { S } from '../../core/store.js';
import { SH, sheet, showSheet } from '../../core/ui.js';
import { SPORTS, icon, label, summary, estimate, onDay, unplaced, missed, templates, programs, doneList, doneDay, monday, sortWhen, human } from './model.js';
import { weekAgg, progressHTML } from './stats.js';

// ---------------------------------------------------------------------------
// Lignes et vues : Semaine, Modèles, Historique
// ---------------------------------------------------------------------------
export function workoutRow(it, o = {}) {
  const done = it.status === 'done';
  const when = !o.noDate && it.scheduled_date ? fmtDate(it.scheduled_date) + (it.scheduled_time ? ` ${it.scheduled_time}` : '') : (o.noDate && it.scheduled_time ? it.scheduled_time : '');
  const dur = it.duration_min ? fmtDur(it.duration_min) : '';
  const sum = summary(it);
  const running = !!it.timer_started_at;
  const start = o.start && !done ? `<button type="button" class="icon-btn sp-go ${running ? 'on' : ''}" data-act="sp-start" data-id="${it.id}" aria-label="${running ? 'Reprendre la séance' : 'Démarrer la séance'}">${I.play}</button>` : '';
  const row = `<div class="row sp-row-w ${done ? 'done' : ''}" data-act="edit" data-id="${it.id}">
    <div class="row-icon">${done ? I.checkCircle : icon(it)}</div>
    <div class="row-main"><div class="row-title">${esc(it.title) || '<i>Sans titre</i>'}</div>
      <div class="row-meta"><span class="m-sport">${esc(label(it))}</span>${when ? `<span>${esc(when)}</span>` : ''}${dur ? `<span>${esc(dur)}</span>` : ''}${sum ? `<span>${esc(sum)}</span>` : ''}${it.remind_at ? `<span class="m-bell">${I.bell}</span>` : ''}</div>
      ${o.postpone ? `<div class="quick"><button type="button" class="chip" data-act="sp-postpone" data-id="${it.id}">Reporter à demain</button><button type="button" class="chip" data-act="sp-finish" data-id="${it.id}">Je l'ai faite</button></div>` : ''}</div>
    ${start}</div>`;
  return row;
}
const tplRow = t => {
  const e = estimate(t);
  return `<div class="row" data-act="edit" data-id="${t.id}"><div class="row-icon">${icon(t)}</div>
    <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-meta"><span class="m-sport">${esc(label(t))}</span>${e.sec ? `<span>${esc(fmtDur(Math.round(e.sec / 60)))}</span>` : ''}${summary(t) ? `<span>${esc(summary(t))}</span>` : ''}</div></div>
    <button type="button" class="chip" data-act="sp-plan-tpl" data-id="${t.id}">Planifier</button></div>`;
};

// Feuille « Nouvelle séance » : type, ou départ d'un modèle ; day / time préremplis (bouton + d'un jour, Agenda)
export function openNew(preset = {}) {
  S.ui.spNew = preset;
  SH.mode = 'sp-new';
  renderNew();
  showSheet();
}
export function renderNew() {
  const p = S.ui.spNew || {}, tpls = templates();
  const when = p.day ? `${cap(fmtDate(p.day).toLowerCase())}${p.time ? ' ' + p.time : ''}` : 'Sans date';
  sheet.innerHTML = `<div class="sheet-head"><button class="link" data-act="close">Annuler</button><span class="sheet-kind">Nouvelle séance</span><span></span></div>
    <div class="muted small pad">${esc(when)}</div>
    ${sec('Type', `<div class="chips wrap">${Object.entries(SPORTS).map(([k, s]) => `<button type="button" class="chip" data-act="sp-create" data-sport="${k}">${s.label}</button>`).join('')}</div>`)}
    ${sec('Partir d’un modèle', tpls.length ? `<div class="list">${tpls.map(t => `<button type="button" class="row link-pick" data-act="sp-create" data-tpl="${t.id}"><div class="row-icon">${icon(t)}</div><div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-meta"><span>${esc(label(t))}</span>${summary(t) ? `<span>${esc(summary(t))}</span>` : ''}</div></div></button>`).join('')}</div>` : '<div class="muted small pad">Aucun modèle. Enregistre une séance comme modèle depuis son éditeur.</div>')}`;
}

export const views = {};

// ---- Semaine ---------------------------------------------------------------
views.sport = () => {
  const t0 = today(), mon = S.ui.spWeek || monday(t0), isCur = mon === monday(t0);
  const agg = weekAgg(mon), goal = S.prefs.sportGoal || 3;
  const end = addDays(mon, 6);
  const FMT_S = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const pct = Math.min(100, Math.round(agg.n / goal * 100));
  let html = `<div class="daynav">
      <button class="icon-btn" data-act="sp-week" data-d="-1" aria-label="Semaine précédente">${I.left}</button>
      <button class="daylabel" data-act="sp-week" data-d="0">${isCur ? 'Cette semaine' : 'Semaine du ' + FMT_S.format(parseYmd(mon))}<small>${FMT_S.format(parseYmd(mon))} – ${FMT_S.format(parseYmd(end))}</small></button>
      <button class="icon-btn" data-act="sp-week" data-d="1" aria-label="Semaine suivante">${I.right}</button></div>
    <div class="sp-goal-bar"><div class="sp-goal-t"><b>${agg.n}</b> / ${goal} séances${agg.sec ? ` · ${esc(fmtDur(Math.round(agg.sec / 60)))}` : ''}${agg.plannedN ? ` · ${plural(agg.plannedN, 'à venir', 'à venir')}` : ''}</div><div class="sp-bar"><i style="width:${pct}%"></i></div></div>`;
  const late = missed();
  if (isCur && late.length) html += sec('À reporter', `<div class="list">${late.map(w => workoutRow(w, { postpone: true })).join('')}</div>`);
  let cards = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i), list = onDay(d);
    cards += `<div class="sp-day ${d === t0 ? 'is-today' : ''}"><div class="sp-day-h"><span>${esc(cap(FMT_DAY.format(parseYmd(d))))}</span><button type="button" class="icon-btn" data-act="sp-new" data-d="${d}" aria-label="Ajouter une séance le ${esc(fmtDate(d))}">${I.plus}</button></div>
      ${list.length ? list.map(w => workoutRow(w, { start: true, noDate: true })).join('') : '<div class="sp-rest">Repos</div>'}</div>`;
  }
  html += `<div class="sp-days">${cards}</div>`;
  const free = unplaced();
  if (free.length) html += sec('Sans date', `<div class="list">${free.map(w => workoutRow(w, { start: true })).join('')}</div>`);
  if (!agg.n && !agg.plannedN && !free.length && !late.length) html += `<div class="muted small pad">Une semaine vide. Touche + pour préparer une séance, ou pars d’un modèle.</div>`;
  return { title: 'Sport', html, fab: 'workout' };
};

// ---- Modèles et semaines types ----------------------------------------------
views['sport-tpl'] = () => {
  const tpls = templates(), progs = programs();
  const html = sec('Modèles', tpls.length ? `<div class="list">${tpls.map(tplRow).join('')}</div>` : empty('Aucun modèle', 'Enregistre une séance comme modèle pour la replanifier en un geste.'),
      `<button class="link" data-act="sp-tpl-new">+ Modèle</button>`) +
    sec('Semaines types', progs.length ? `<div class="list">${progs.map(p => `<div class="row" data-act="edit" data-id="${p.id}"><div class="row-icon">${I.calendar}</div><div class="row-main"><div class="row-title">${esc(p.title)}</div><div class="row-meta"><span>${plural((p.meta?.plan || []).length, 'séance', 'séances')} par semaine</span><span>${p.meta?.weeks || 4} sem.</span></div></div></div>`).join('')}</div>`
      : '<div class="muted small pad">Une semaine type place tes séances habituelles (lundi, jeudi…) sur plusieurs semaines d’un coup.</div>', `<button class="link" data-act="sp-prog-new">+ Semaine type</button>`);
  return { title: 'Modèles', html, fab: 'template' };
};

// ---- Historique et progression ---------------------------------------------
views['sport-hist'] = () => {
  const f = S.ui.spFilter || '';
  const used = [...new Set(doneList().map(w => w.meta?.sport || 'other'))];
  const list = doneList().filter(w => !f || (w.meta?.sport || 'other') === f);
  const groups = new Map();
  for (const w of list) { const m = monday(doneDay(w)); (groups.get(m) || groups.set(m, []).get(m)).push(w); }
  const FMT_S = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
  const filters = used.length > 1 ? `<div class="chips scroll">${chip('Tout', !f, 'sp-filter', '')}${used.map(k => chip(SPORTS[k]?.label || k, f === k, 'sp-filter', k)).join('')}</div>` : '';
  const body = [...groups].map(([m, ws]) => sec(`Semaine du ${FMT_S.format(parseYmd(m))}`, `<div class="list">${ws.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')).map(w => workoutRow(w)).join('')}</div>`)).join('');
  return { title: 'Historique', html: (doneList().length ? progressHTML() : '') + filters + (body || empty('Aucune séance terminée', 'Elles apparaissent ici, avec ta progression, dès la première.')) };
};
