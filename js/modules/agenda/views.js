import { esc, I, cap, pad, today, addDays, parseYmd, fmtDate, fmtDur, plural, FMT_LONG } from '../../core/util.js';
import { S, live } from '../../core/store.js';
import { kindLabel } from '../../core/links.js';

// ---------------------------------------------------------------------------
// Agenda visuel : grille horaire d'un jour ou de plusieurs jours côte à côte
// Lit tous les éléments datés avec une heure, quel que soit leur module.
// ---------------------------------------------------------------------------
const PX_MIN = 0.8;              // 48 px par heure
const DEFAULT_DUR = 30;          // durée affichée d'un élément sans durée
const MIN_H = 22;                // hauteur minimale d'un bloc (px)
const FMT_COL = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const shown = i => i.status !== 'someday';

// Éléments placés à une heure ce jour-là, et éléments du jour sans heure (tâches) ou à échéance
export const timedOn = day => live().filter(i => i.scheduled_date === day && i.scheduled_time && shown(i));
export const untimedOn = day => live().filter(i => i.kind === 'task' && i.scheduled_date === day && !i.scheduled_time && (i.status === 'active' || i.status === 'waiting'));
export const dueOn = day => live().filter(i => i.kind === 'task' && i.due_date === day && i.scheduled_date !== day && i.status === 'active');

// Nombre de jours de la vue semaine : 7 sur grand écran, 3 sur téléphone
export const weekSpan = () => (matchMedia('(min-width: 700px)').matches ? 7 : 3);
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
  for (const d of days) for (const i of timedOn(d)) {
    const s = toMin(i.scheduled_time);
    a = Math.min(a, Math.floor(s / 60) * 60);
    b = Math.min(24 * 60, Math.max(b, Math.ceil((s + (i.duration_min || DEFAULT_DUR)) / 60) * 60));
  }
  return [a, b];
}

function block(i, a, compact) {
  const done = i.status === 'done';
  const dur = i.duration_min || DEFAULT_DUR;
  const h = Math.max(MIN_H, dur * PX_MIN - 2);
  const label = i.kind === 'task' ? '' : `<span class="ag-kind">${esc(kindLabel(i.kind))}</span>`;
  return `<button class="ag-ev ${done ? 'done' : ''} ${i.focus ? 'top' : ''} ${h < 40 ? 'short' : ''}" data-act="edit" data-id="${i.id}"
      style="top:${(i._s - a) * PX_MIN + 1}px;height:${h}px;left:calc(${(i.col / i.n) * 100}% + 1px);width:calc(${100 / i.n}% - 2px)">
    <span class="ag-time">${i.scheduled_time}${!compact && i.duration_min ? ` · ${fmtDur(i.duration_min)}` : ''}</span>
    <span class="ag-title">${label}${esc(i.title) || '<i>Sans titre</i>'}</span>
  </button>`;
}

// Une colonne de jour : cases de 30 min cliquables, blocs, ligne de l'heure actuelle
function column(day, a, b, compact) {
  const evs = layout(timedOn(day)
    .map(i => Object.assign(Object.create(i), { _s: toMin(i.scheduled_time), s: toMin(i.scheduled_time), e: toMin(i.scheduled_time) + (i.duration_min || DEFAULT_DUR) }))
    .sort((x, y) => x.s - y.s || y.e - x.e));
  let cells = '';
  for (let m = a; m < b; m += 30) cells += `<div class="ag-cell ${m % 60 ? 'half' : ''}" data-act="ag-slot" data-d="${day}" data-t="${hhmm(m)}" style="top:${(m - a) * PX_MIN}px" aria-label="Placer à ${hhmm(m)}"></div>`;
  let now = '';
  if (day === today()) {
    const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
    if (m >= a && m <= b) now = `<div class="ag-now" style="top:${(m - a) * PX_MIN}px"></div>`;
  }
  return `<div class="ag-col ${day === today() ? 'is-today' : ''}" style="height:${(b - a) * PX_MIN}px">${cells}${evs.map(i => block(i, a, compact)).join('')}${now}</div>`;
}

function gutter(a, b) {
  let h = '';
  for (let m = a; m < b; m += 60) h += `<div class="ag-hour" style="top:${(m - a) * PX_MIN}px">${pad(m / 60)}</div>`;
  return `<div class="ag-gutter" style="height:${(b - a) * PX_MIN}px">${h}</div>`;
}

const chipOf = (i, extra = '') => `<button class="ag-chip ${i.focus ? 'top' : ''}" data-act="edit" data-id="${i.id}">${extra}${esc(i.title) || '<i>Sans titre</i>'}</button>`;

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
  const timed = timedOn(day), untimed = untimedOn(day), due = dueOn(day);
  const total = timed.filter(i => i.status !== 'done').reduce((s, i) => s + (i.duration_min || DEFAULT_DUR), 0);
  let band = '';
  if (untimed.length || due.length) band = `<div class="ag-band"><div class="ag-band-title">Sans heure</div>
    <div class="ag-chips">${untimed.map(i => chipOf(i)).join('')}${due.map(i => chipOf(i, '<span class="ag-due">Échéance</span>')).join('')}</div></div>`;
  return {
    title: 'Agenda',
    html: nav(cap(FMT_LONG.format(parseYmd(day))), day === today() ? '' : fmtDate(day)) +
      `<div class="summary">${plural(timed.length, 'créneau', 'créneaux')}${total ? ` · ${fmtDur(total)} occupées` : ''}${untimed.length ? ` · ${untimed.length} sans heure` : ''}</div>
      ${band}
      <div class="ag-grid one">${gutter(a, b)}<div class="ag-cols">${column(day, a, b, false)}</div></div>`,
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
    const n = untimedOn(d).length;
    return `<button class="ag-head ${d === today() ? 'is-today' : ''}" data-act="ag-open" data-d="${d}">${fmtShort(d)}${n ? `<small>${n} sans heure</small>` : ''}</button>`;
  }).join('');
  const label = `${fmtShort(days[0])} – ${fmtShort(days[span - 1])}`;
  return {
    title: 'Semaine',
    html: nav(cap(label), days.includes(today()) ? '' : fmtDate(days[0])) +
      `<div class="ag-grid multi" style="--ag-n:${span}"><div class="ag-gutter-head"></div><div class="ag-heads">${heads}</div>
        ${gutter(a, b)}<div class="ag-cols">${days.map(d => column(d, a, b, true)).join('')}</div></div>`,
    fab: 'slot'
  };
};
