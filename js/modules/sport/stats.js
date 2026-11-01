import { esc, today, addDays, plural, fmtDur, fmtDate } from '../../core/util.js';
import { S } from '../../core/store.js';
import { SPORTS, workouts, doneList, doneDay, monday, estimate, e1rm, setsOf, fmtKm, fmtW } from './model.js';

// ---------------------------------------------------------------------------
// Agrégats locaux : volume par semaine, série de semaines tenues, records, mini-graphes SVG
// Les valeurs viennent du résultat saisi en fin de séance, à défaut du contenu prévu.
// ---------------------------------------------------------------------------
const secOf = w => (w.meta?.result?.dur_s ?? (w.spent_sec >= 60 ? w.spent_sec : 0)) || (w.duration_min || 0) * 60;
const distOf = w => w.meta?.result?.dist_m ?? estimate(w).dist;
export function tonnageOf(w) {
  return (w.meta?.exercises || []).reduce((s, e) => s + setsOf(e).filter(x => x.done).reduce((a, x) => a + (x.reps || 0) * (x.w || 0), 0), 0);
}

// Une semaine commençant ce lundi : séances faites, prévues, temps, distance, tonnage, par sport
export function weekAgg(mon) {
  const end = addDays(mon, 6);
  const inWeek = d => d >= mon && d <= end;
  const done = doneList().filter(w => inWeek(doneDay(w)));
  const planned = workouts().filter(w => w.status === 'active' && w.scheduled_date && inWeek(w.scheduled_date));
  const bySport = {};
  for (const w of done) { const s = w.meta?.sport || 'other'; bySport[s] = (bySport[s] || 0) + secOf(w); }
  return {
    mon, done, planned, n: done.length, plannedN: planned.length,
    sec: done.reduce((s, w) => s + secOf(w), 0),
    dist: done.reduce((s, w) => s + (SPORTS[w.meta?.sport]?.endurance ? distOf(w) : 0), 0),
    tonnage: done.reduce((s, w) => s + tonnageOf(w), 0),
    bySport
  };
}
export const lastWeeks = (n, from = monday(today())) => Array.from({ length: n }, (_, i) => weekAgg(addDays(from, -7 * (n - 1 - i))));

// Semaines consécutives où l'objectif de séances est tenu ; la semaine en cours ne casse pas la série
export function streak() {
  const goal = S.prefs.sportGoal || 3;
  let cur = monday(today()), n = 0;
  if (weekAgg(cur).n >= goal) n++;
  cur = addDays(cur, -7);
  for (let k = 0; k < 104; k++, cur = addDays(cur, -7)) { if (weekAgg(cur).n >= goal) n++; else break; }
  return n;
}

// Records : meilleure charge estimée par exercice, séance la plus longue, plus grande distance
export function records() {
  const ex = new Map();
  let longest = null, farthest = null, heaviest = null;
  for (const w of doneList()) {
    const day = doneDay(w);
    for (const e of w.meta?.exercises || []) {
      for (const s of setsOf(e).filter(x => x.done && x.w > 0)) {
        const v = e1rm(s.w, s.reps), cur = ex.get(e.name);
        if (!cur || v > cur.e1rm) ex.set(e.name, { name: e.name, e1rm: v, w: s.w, reps: s.reps, day });
      }
    }
    if (SPORTS[w.meta?.sport]?.endurance) {
      const d = distOf(w), s = secOf(w);
      if (d && (!farthest || d > farthest.v)) farthest = { v: d, day, title: w.title };
      if (s && (!longest || s > longest.v)) longest = { v: s, day, title: w.title };
    }
    const t = tonnageOf(w);
    if (t && (!heaviest || t > heaviest.v)) heaviest = { v: t, day, title: w.title };
  }
  return { lifts: [...ex.values()].sort((a, b) => b.e1rm - a.e1rm), longest, farthest, heaviest };
}

// Évolution d'un exercice : meilleure charge estimée par séance faite
export function liftSeries(name) {
  const k = name.trim().toLowerCase();
  return doneList().slice().reverse().map(w => {
    const e = (w.meta?.exercises || []).find(x => x.name.trim().toLowerCase() === k);
    const v = e ? Math.max(0, ...setsOf(e).filter(s => s.done).map(s => e1rm(s.w, s.reps))) : 0;
    return v ? { day: doneDay(w), v } : null;
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Graphes
// ---------------------------------------------------------------------------
// Barres par semaine ; la dernière est la semaine en cours
export function bars(weeks, pick, fmt) {
  const max = Math.max(1, ...weeks.map(pick));
  const w = 100 / weeks.length;
  const rects = weeks.map((x, i) => {
    const v = pick(x), h = Math.round(v / max * 54);
    return `<g><rect x="${i * w + w * 0.18}" y="${60 - h}" width="${w * 0.64}" height="${Math.max(h, v ? 2 : 0)}" rx="1.5" class="${i === weeks.length - 1 ? 'cur' : ''}"/>
      <text x="${i * w + w / 2}" y="73" text-anchor="middle">${new Date(x.mon + 'T00:00').getDate()}</text></g>`;
  }).join('');
  const last = pick(weeks[weeks.length - 1]);
  return `<svg class="sp-bars" viewBox="0 0 100 76" preserveAspectRatio="none" role="img" aria-label="Volume par semaine, dernière semaine : ${esc(fmt(last))}">${rects}</svg>`;
}
export function spark(points) {
  if (points.length < 2) return '';
  const vs = points.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const pts = points.map((p, i) => `${(i / (points.length - 1) * 100).toFixed(1)},${(26 - (p.v - lo) / span * 22).toFixed(1)}`).join(' ');
  return `<svg class="sp-spark" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
}

// Bloc « Progression » de la vue Historique
export function progressHTML() {
  const weeks = lastWeeks(8), cur = weeks[weeks.length - 1];
  const goal = S.prefs.sportGoal || 3, st = streak(), rec = records();
  const stat = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  const rows = [];
  if (rec.lifts.length) rows.push(...rec.lifts.slice(0, 6).map(r => {
    const ser = liftSeries(r.name);
    return `<div class="sp-rec"><div class="sp-rec-main"><div class="row-title">${esc(r.name)}</div><div class="row-meta"><span>${fmtW(r.w)} × ${r.reps}</span><span>≈ ${fmtW(Math.round(r.e1rm * 2) / 2)} sur 1 rép.</span></div></div>${spark(ser)}</div>`;
  }));
  const extra = [
    rec.farthest && `<div class="sp-rec"><div class="sp-rec-main"><div class="row-title">Plus longue distance</div><div class="row-meta"><span>${fmtKm(rec.farthest.v)}</span><span>${esc(fmtDate(rec.farthest.day).toLowerCase())}</span></div></div></div>`,
    rec.longest && `<div class="sp-rec"><div class="sp-rec-main"><div class="row-title">Séance d'endurance la plus longue</div><div class="row-meta"><span>${fmtDur(Math.round(rec.longest.v / 60))}</span><span>${esc(fmtDate(rec.longest.day).toLowerCase())}</span></div></div></div>`,
    rec.heaviest && `<div class="sp-rec"><div class="sp-rec-main"><div class="row-title">Plus gros tonnage</div><div class="row-meta"><span>${Math.round(rec.heaviest.v).toLocaleString('fr-FR')} kg</span><span>${esc(fmtDate(rec.heaviest.day).toLowerCase())}</span></div></div></div>`
  ].filter(Boolean);
  return `<div class="ev-summary">${stat(cur.n + '/' + goal, 'cette semaine')}${stat(fmtDur(Math.round(cur.sec / 60)) || '0', 'de sport')}${stat(st, st > 1 ? 'semaines tenues' : 'semaine tenue')}</div>
    <div class="sp-chart"><div class="sp-chart-t">Temps par semaine <small>8 dernières semaines</small></div>${bars(weeks, x => x.sec, v => fmtDur(Math.round(v / 60)))}</div>
    <div class="sp-chart"><div class="sp-chart-t">Séances par semaine</div>${bars(weeks, x => x.n, v => plural(v, 'séance', 'séances'))}</div>
    ${rows.length || extra.length ? `<h2 class="sp-h">Records</h2><div class="sp-recs">${rows.join('')}${extra.join('')}</div>` : ''}`;
}
