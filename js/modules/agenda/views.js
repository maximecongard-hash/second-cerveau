import { esc, I, cap, pad, today, addDays, parseYmd, fmtDate, fmtDur, plural, FMT_LONG } from '../../core/util.js';
import { S, live } from '../../core/store.js';
import { kindLabel } from '../../core/links.js';
import { eventsOn, allDayOn, span } from './apple.js';

// ---------------------------------------------------------------------------
// Agenda visuel : grille horaire d'un jour ou de plusieurs jours côte à côte
// Lit tous les éléments datés avec une heure, quel que soit leur module.
// ---------------------------------------------------------------------------
export const PX_MIN = 0.8;              // 48 px par heure
export const DEFAULT_DUR = 30;         // durée affichée d'un élément sans durée
export const MIN_H = 22;               // hauteur minimale d'un bloc (px)
const FMT_COL = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });

export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const hhmm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const shown = i => i.status !== 'someday';

// Éléments placés à une heure ce jour-là, et éléments du jour sans heure (tâches) ou à échéance
export const timedOn = day => live().filter(i => i.scheduled_date === day && i.scheduled_time && shown(i));
export const untimedOn = day => live().filter(i => i.kind === 'task' && i.scheduled_date === day && !i.scheduled_time && (i.status === 'active' || i.status === 'waiting'));
export const dueOn = day => live().filter(i => i.kind === 'task' && i.due_date === day && i.scheduled_date !== day && i.status === 'active');

// Nombre de jours de la vue semaine selon la place restante (barre latérale et panneau de tâches déduits) :
// 7 sur grand écran, 5 sur tablette, 3 sur téléphone
export const weekSpan = () => {
  const w = innerWidth;
  if (w < 700) return 3;
  const room = w - (w >= 900 ? 260 : 0) - 270;
  return room >= 800 ? 7 : 5;
};
// Premier jour affiché : le lundi sur 7 jours, le jour choisi sur 3 jours
export function weekStart(day, span) {
  if (span !== 7) return day;
  const d = parseYmd(day);
  return addDays(day, -((d.getDay() + 6) % 7));
}

// Colonnes pour les éléments qui se chevauchent : groupes contigus, première colonne libre
function layout(evs) {
  const out = [];
  let group = [], end = -1;
  const flush = () => {
    const cols = [];
    for (const e of group) {
      let c = cols.findIndex(last => last <= e.s);
      if (c < 0) { c = cols.length; cols.push(0); }
      cols[c] = e.e;
      e.col = c;
    }
    group.forEach(e => { e.n = cols.length; });
    out.push(...group);
    group = [];
  };
  for (const e of evs) {
    if (group.length && e.s >= end) { flush(); end = -1; }
    group.push(e);
    end = Math.max(end, e.e);
  }
  if (group.length) flush();
  return out;
}

// Plage horaire : réglage de l'utilisateur, élargie si un élément en sort
function range(days) {
  let a = S.prefs.agStart * 60, b = S.prefs.agEnd * 60;
  const fit = (s, e) => { a = Math.min(a, Math.floor(s / 60) * 60); b = Math.min(24 * 60, Math.max(b, Math.ceil(e / 60) * 60)); };
  for (const d of days) {
    for (const i of timedOn(d)) { const s = toMin(i.scheduled_time); fit(s, s + (i.duration_min || DEFAULT_DUR)); }
    for (const e of eventsOn(d)) fit(...span(e));
  }
  return [a, b];
}

function block(i, a, compact) {
  const done = i.status === 'done';
  const dur = i.duration_min || DEFAULT_DUR;
  const h = Math.max(MIN_H, dur * PX_MIN - 2);
  const label = i.kind === 'task' ? '' : `<span class="ag-kind">${esc(kindLabel(i.kind))}</span>`;
  return `<button class="ag-ev ${done ? 'done' : ''} ${i.focus ? 'top' : ''} ${h < 40 ? 'short' : ''}" data-act="edit" data-id="${i.id}" data-drag
      style="top:${(i._s - a) * PX_MIN + 1}px;height:${h}px;left:calc(${(i.col / i.n) * 100}% + 1px);width:calc(${100 / i.n}% - 2px)">
    <span class="ag-time">${i.scheduled_time}${!compact && i.duration_min ? ` · ${fmtDur(i.duration_min)}` : ''}</span>
    <span class="ag-title">${label}${esc(i.title) || '<i>Sans titre</i>'}</span>
    <span class="ag-rs" aria-hidden="true"></span>
  </button>`;
}

// Événement de Calendrier : gris, en lecture seule, il ouvre sa fiche
function extBlock(x, a, compact) {
  const h = Math.max(MIN_H, (x.e - x.s) * PX_MIN - 2);
  return `<button class="ag-ev ext ${h < 40 ? 'short' : ''}" data-act="ag-event" data-eid="${esc(x.ev.id)}"
      style="top:${(x.s - a) * PX_MIN + 1}px;height:${h}px;left:calc(${(x.col / x.n) * 100}% + 1px);width:calc(${100 / x.n}% - 2px)">
    <span class="ag-time">${hhmm(x.s)}${!compact && x.ev.calendar ? ` · ${esc(x.ev.calendar)}` : ''}</span>
    <span class="ag-title">${esc(x.ev.title) || '<i>Sans titre</i>'}</span>
  </button>`;
}

// Une colonne de jour : cases de 30 min cliquables, blocs, ligne de l'heure actuelle
function column(day, a, b, compact) {
  const own = timedOn(day).map(i => Object.assign(Object.create(i), { _s: toMin(i.scheduled_time), s: toMin(i.scheduled_time), e: toMin(i.scheduled_time) + (i.duration_min || DEFAULT_DUR) }));
  const ext = eventsOn(day).map(ev => { const [s, e] = span(ev); return { ev, s, e }; });
  const evs = layout([...own, ...ext].sort((x, y) => x.s - y.s || y.e - x.e));
  let cells = '';
  for (let m = a; m < b; m += 30) cells += `<div class="ag-cell ${m % 60 ? 'half' : ''}" data-act="ag-slot" data-d="${day}" data-t="${hhmm(m)}" style="top:${(m - a) * PX_MIN}px" aria-label="Placer à ${hhmm(m)}"></div>`;
  let now = '';
  if (day === today()) {
    const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
    if (m >= a && m <= b) now = `<div class="ag-now" style="top:${(m - a) * PX_MIN}px"></div>`;
  }
  return `<div class="ag-col ${day === today() ? 'is-today' : ''}" data-day="${day}" data-a="${a}" style="height:${(b - a) * PX_MIN}px">${cells}${evs.map(i => (i.ev ? extBlock(i, a, compact) : block(i, a, compact))).join('')}${now}</div>`;
}

function gutter(a, b) {
  let h = '';
  for (let m = a; m < b; m += 60) h += `<div class="ag-hour" style="top:${(m - a) * PX_MIN}px">${pad(m / 60)}</div>`;
  return `<div class="ag-gutter" style="height:${(b - a) * PX_MIN}px">${h}</div>`;
}

const chipOf = (i, extra = '') => `<button class="ag-chip ${i.focus ? 'top' : ''}" data-act="edit" data-id="${i.id}">${extra}${esc(i.title) || '<i>Sans titre</i>'}</button>`;
const extChip = e => `<button class="ag-chip ext" data-act="ag-event" data-eid="${esc(e.id)}">${esc(e.title) || '<i>Sans titre</i>'}</button>`;

// Panneau de tâches à glisser dans la grille (tablette et ordinateur, masqué sur téléphone par le CSS)
const planned = () => live().filter(i => i.kind === 'task' && i.status === 'active' && !i.scheduled_time);
function card(i) {
  const meta = [i.duration_min ? fmtDur(i.duration_min) : '', i.due_date ? `éch. ${fmtDate(i.due_date).toLowerCase()}` : '', ...(i.contexts || [])].filter(Boolean).map(esc).join(' · ');
  return `<div class="ag-task ${i.focus ? 'top' : ''}" data-drag data-act="edit" data-id="${i.id}"><div class="ag-task-title">${esc(i.title) || '<i>Sans titre</i>'}</div>${meta ? `<div class="ag-task-meta">${meta}</div>` : ''}</div>`;
}
function panel(day) {
  const here = day ? untimedOn(day) : [], ids = new Set(here.map(i => i.id));
  const rest = planned().filter(i => !ids.has(i.id) && !i.scheduled_date)
    .sort((x, y) => (x.due_date || '9999').localeCompare(y.due_date || '9999') || x.created_at.localeCompare(y.created_at)).slice(0, 80);
  return `<aside class="ag-side" aria-label="Tâches à placer"><div class="ag-side-title">Tâches à placer</div>
    <div class="ag-side-hint">Glisse une tâche sur la grille. Tire le bas d'un créneau pour changer sa durée, dépose-le ici pour retirer l'heure.</div>
    ${here.length ? `<div class="ag-side-sub">Prévues ce jour</div>${here.map(card).join('')}` : ''}
    <div class="ag-side-sub">Prochaines actions</div>${rest.length ? rest.map(card).join('') : '<div class="muted small">Aucune action sans date.</div>'}</aside>`;
}

function nav(label, sub) {
  return `<div class="daynav">
    <button class="icon-btn" data-act="ag-day" data-d="-1" aria-label="Précédent">${I.left}</button>
    <button class="daylabel" data-act="ag-day" data-d="0">${label}${sub ? `<small>${sub}</small>` : ''}</button>
    <button class="icon-btn" data-act="ag-day" data-d="1" aria-label="Suivant">${I.right}</button>
  </div>`;
}

// ---------------------------------------------------------------------------
// Vues
// ---------------------------------------------------------------------------
export const views = {};

views.agenda = () => {
  const day = S.ui.agDay;
  const [a, b] = range([day]);
  const timed = timedOn(day), untimed = untimedOn(day), due = dueOn(day), ext = eventsOn(day), allDay = allDayOn(day);
  const total = timed.filter(i => i.status !== 'done').reduce((s, i) => s + (i.duration_min || DEFAULT_DUR), 0);
  let band = '';
  if (untimed.length || due.length || allDay.length) band = `<div class="ag-band"><div class="ag-band-title">Sans heure</div>
    <div class="ag-chips">${allDay.map(extChip).join('')}${untimed.map(i => chipOf(i)).join('')}${due.map(i => chipOf(i, '<span class="ag-due">Échéance</span>')).join('')}</div></div>`;
  return {
    title: 'Agenda',
    html: `<div class="ag-layout"><div class="ag-main">` + nav(cap(FMT_LONG.format(parseYmd(day))), day === today() ? '' : fmtDate(day)) +
      `<div class="summary">${plural(timed.length, 'créneau', 'créneaux')}${total ? ` · ${fmtDur(total)} occupées` : ''}${untimed.length ? ` · ${untimed.length} sans heure` : ''}${ext.length + allDay.length ? ` · ${plural(ext.length + allDay.length, 'événement', 'événements')} Calendrier` : ''}</div>
      ${band}
      <div class="ag-grid one">${gutter(a, b)}<div class="ag-cols">${column(day, a, b, false)}</div></div></div>${panel(day)}</div>`,
    fab: 'slot'
  };
};

views.week = () => {
  const span = weekSpan();
  const start = weekStart(S.ui.agDay, span);
  const days = Array.from({ length: span }, (_, k) => addDays(start, k));
  const [a, b] = range(days);
  const fmtShort = d => FMT_COL.format(parseYmd(d)).replace('.', '');
  const heads = days.map(d => {
    const n = untimedOn(d).length, all = allDayOn(d);
    const sub = all.length ? esc(all[0].title) + (all.length > 1 ? ` +${all.length - 1}` : '') : n ? `${n} sans heure` : '';
    return `<button class="ag-head ${d === today() ? 'is-today' : ''}" data-act="ag-open" data-d="${d}">${fmtShort(d)}${sub ? `<small class="${all.length ? 'ext' : ''}">${sub}</small>` : ''}</button>`;
  }).join('');
  const label = `${fmtShort(days[0])} – ${fmtShort(days[span - 1])}`;
  return {
    title: 'Semaine',
    html: `<div class="ag-layout"><div class="ag-main">` + nav(cap(label), days.includes(today()) ? '' : fmtDate(days[0])) +
      `<div class="ag-grid multi" style="--ag-n:${span}"><div class="ag-gutter-head"></div><div class="ag-heads">${heads}</div>
        ${gutter(a, b)}<div class="ag-cols">${days.map(d => column(d, a, b, true)).join('')}</div></div></div>${panel(null)}</div>`,
    fab: 'slot'
  };
};
