import { I, uuid, pad, ymd, today, addDays, parseYmd, nowIso, fmtDur, fmtDate, esc } from '../../core/util.js';
import { S, live, ofKind, newItem, saveItem, patch } from '../../core/store.js';
import { restFor } from './exercises.js';

// ---------------------------------------------------------------------------
// Modèle des séances. Une séance est un élément `workout` ; son contenu vit dans `meta` :
//   { sport, goal, blocks: [...], exercises: [...], result: {...}, tpl, manualDur }
// blocs (course, vélo, natation) : { id, type, label, dur_s, dist_m, target: {kind, lo, hi}, repeat, children }
// exercices (renfo) : { id, name, note, rest_s, sets: [{ reps, w, done }] }
// ---------------------------------------------------------------------------
export const SPORTS = {
  run: { label: 'Course', icon: I.run, endurance: true },
  strength: { label: 'Renfo', icon: I.dumbbell },
  bike: { label: 'Vélo', icon: I.timer, endurance: true },
  swim: { label: 'Natation', icon: I.heart, endurance: true },
  hike: { label: 'Rando', icon: I.run, endurance: true },
  mobility: { label: 'Mobilité', icon: I.heart },
  other: { label: 'Autre', icon: I.flame }
};
export const sportOf = it => SPORTS[it.meta?.sport] || SPORTS.other;
export const isEndurance = it => !!sportOf(it).endurance;
export const isStrength = it => it.meta?.sport === 'strength';
export const BLOCK_TYPES = { warmup: 'Échauffement', work: 'Effort', rest: 'Récupération', cooldown: 'Retour au calme', repeat: 'Répétitions' };
export const TARGETS = { '': 'Aucune', pace: 'Allure', hr: 'Fréquence cardiaque', rpe: 'Ressenti (RPE)' };
const sid = () => uuid().slice(0, 8);

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------
export function clock(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
// Durée en toutes lettres : 45 s, 3 min, 1 min 30, 1 h 05
export function human(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec} s`;
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (h) return `${h} h ${pad(m)}`;
  return s ? `${m} min ${pad(s)}` : `${m} min`;
}
// Saisie d'une durée : « 10 » = 10 min, « 3:30 » = 3 min 30, « 1:05:00 » = 1 h 05
export function parseClock(v) {
  v = String(v || '').trim().replace(',', '.');
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(parseFloat(v) * 60);
  const p = v.split(':').map(Number);
  if (p.some(n => !Number.isFinite(n))) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0);
}
export const fmtKm = m => (m >= 1000 ? `${String(+(m / 1000).toFixed(2)).replace('.', ',')} km` : `${Math.round(m)} m`);
export const kmInput = m => (m ? String(+(m / 1000).toFixed(3)).replace('.', ',') : '');
export const parseKm = v => { const n = parseFloat(String(v || '').replace(',', '.')); return n > 0 ? Math.round(n * 1000) : null; };
export const paceStr = s => `${Math.floor(s / 60)}:${pad(Math.round(s % 60))}`;
export function fmtTarget(t) {
  if (!t?.kind) return '';
  const rng = (lo, hi, f = x => x) => (hi && hi !== lo ? `${f(lo)}–${f(hi)}` : f(lo));
  if (t.kind === 'pace') return `${rng(t.lo, t.hi, paceStr)}/km`;
  if (t.kind === 'hr') return `${rng(t.lo, t.hi)} bpm`;
  return `RPE ${rng(t.lo, t.hi)}`;
}
// Valeur d'un champ de cible : l'allure s'écrit 4:30, le reste est un nombre
export const parseTargetVal = (kind, v) => {
  v = String(v || '').trim();
  if (!v) return null;
  if (kind === 'pace') { const s = parseClock(v.includes(':') ? v : v + ':00'); return s || null; }
  const n = parseInt(v, 10);
  return n > 0 ? n : null;
};
export const targetInput = (kind, n) => (n == null ? '' : kind === 'pace' ? paceStr(n) : String(n));

// ---------------------------------------------------------------------------
// Estimations
// ---------------------------------------------------------------------------
const midPace = t => (t?.kind === 'pace' && t.lo ? (t.lo + (t.hi || t.lo)) / 2 : 0);
export function blockSec(b) {
  if (b.type === 'repeat') return (b.repeat || 1) * (b.children || []).reduce((s, c) => s + blockSec(c), 0);
  if (b.dur_s) return b.dur_s;
  const p = midPace(b.target);
  return b.dist_m && p ? Math.round(b.dist_m / 1000 * p) : 0;
}
// Distance d'un bloc : saisie, ou déduite de la durée et de l'allure ; `ok` = false quand elle reste inconnue (hors récupération)
function distInfo(b) {
  if (b.type === 'repeat') {
    let d = 0, ok = true;
    for (const c of b.children || []) { const r = distInfo(c); d += r.d; ok = ok && r.ok; }
    return { d: d * (b.repeat || 1), ok };
  }
  if (b.dist_m) return { d: b.dist_m, ok: true };
  const p = midPace(b.target);
  if (b.dur_s && p) return { d: Math.round(b.dur_s / p * 1000), ok: true };
  return { d: 0, ok: b.type === 'rest' };
}
export const blockDist = b => distInfo(b).d;
export const setsOf = ex => ex.sets || [];
export function estimate(it) {
  const m = it.meta || {};
  if (m.sport === 'strength' || (m.exercises?.length && !m.blocks?.length)) {
    const ex = m.exercises || [];
    const sets = ex.reduce((s, e) => s + setsOf(e).length, 0);
    const sec = ex.reduce((s, e) => s + setsOf(e).length * (40 + (e.rest_s || 0)), 0);
    const tonnage = ex.reduce((s, e) => s + setsOf(e).reduce((a, x) => a + (x.reps || 0) * (x.w || 0), 0), 0);
    return { sec, dist: 0, sets, exercises: ex.length, tonnage };
  }
  const bl = m.blocks || [];
  let intervals = 0;
  for (const b of bl) if (b.type === 'repeat') intervals += b.repeat || 1;
  const di = bl.map(distInfo);
  return { sec: bl.reduce((s, b) => s + blockSec(b), 0), dist: di.every(x => x.ok) ? di.reduce((a, x) => a + x.d, 0) : 0, sets: 0, exercises: 0, tonnage: 0, intervals };
}
// Une ligne de résumé : « 6 × 3 min · 12 km » ou « 5 exercices · 18 séries »
export function summary(it) {
  const e = estimate(it), r = it.meta?.result;
  const parts = [];
  if (isStrength(it) || e.exercises) {
    if (e.exercises) parts.push(`${e.exercises} exercice${e.exercises > 1 ? 's' : ''}`, `${e.sets} séries`);
    if (e.tonnage) parts.push(`${Math.round(e.tonnage).toLocaleString('fr-FR')} kg`);
  } else {
    const rep = (it.meta?.blocks || []).find(b => b.type === 'repeat');
    if (rep) { const w = (rep.children || []).find(c => c.type === 'work'); parts.push(`${rep.repeat} × ${w ? (w.dur_s ? human(w.dur_s) : fmtKm(w.dist_m || 0)) : ''}`.trim()); }
    if (e.dist) parts.push(`~${fmtKm(e.dist)}`);
  }
  if (r?.rpe) parts.push(`RPE ${r.rpe}`);
  return parts.filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Contenu par défaut, presets et mutations
// ---------------------------------------------------------------------------
const blk = (type, o = {}) => ({ id: sid(), type, label: '', ...o });
export const PRESETS = {
  footing: ['Footing', () => [blk('work', { label: 'Footing', dur_s: 2400, target: { kind: 'rpe', lo: 3, hi: 4 } })]],
  long: ['Sortie longue', () => [blk('warmup', { dur_s: 600 }), blk('work', { label: 'Sortie longue', dur_s: 4800, target: { kind: 'rpe', lo: 4, hi: 5 } }), blk('cooldown', { dur_s: 300 })]],
  short: ['Fractionné court', () => [blk('warmup', { dur_s: 900 }), blk('repeat', { repeat: 8, children: [blk('work', { dur_s: 30, target: { kind: 'rpe', lo: 8, hi: 9 } }), blk('rest', { dur_s: 30 })] }), blk('cooldown', { dur_s: 600 })]],
  interval: ['Fractionné long', () => [blk('warmup', { dur_s: 900 }), blk('repeat', { repeat: 6, children: [blk('work', { dur_s: 180, target: { kind: 'rpe', lo: 7, hi: 8 } }), blk('rest', { dur_s: 90 })] }), blk('cooldown', { dur_s: 600 })]],
  tempo: ['Tempo / seuil', () => [blk('warmup', { dur_s: 900 }), blk('work', { label: 'Seuil', dur_s: 1200, target: { kind: 'rpe', lo: 7, hi: 7 } }), blk('cooldown', { dur_s: 600 })]],
  hills: ['Côtes', () => [blk('warmup', { dur_s: 900 }), blk('repeat', { repeat: 8, children: [blk('work', { label: 'Côte', dur_s: 45, target: { kind: 'rpe', lo: 8, hi: 9 } }), blk('rest', { label: 'Descente trot', dur_s: 90 })] }), blk('cooldown', { dur_s: 600 })]]
};
export function defaultMeta(sport = 'run') {
  if (sport === 'strength') return { sport, goal: '', exercises: [] };
  if (SPORTS[sport]?.endurance) return { sport, goal: '', blocks: sport === 'run' ? PRESETS.footing[1]() : [blk('work', { label: SPORTS[sport].label, dur_s: 2700 })] };
  return { sport, goal: '', blocks: [blk('work', { label: SPORTS[sport]?.label || 'Séance', dur_s: 1800 })] };
}
export const newBlock = (type, o) => blk(type, o);
export const newSet = (ex, last) => ({ reps: last?.reps ?? 8, w: last?.w ?? 0, done: false });
export const newExercise = name => ({ id: sid(), name, note: '', rest_s: restFor(name), sets: [newSet(), newSet(), newSet()] });
export const clone = o => JSON.parse(JSON.stringify(o ?? null));
// Copie d'un contenu : nouveaux identifiants, séries remises à faire, pas de résultat
export function freshMeta(meta) {
  const m = clone(meta) || defaultMeta();
  delete m.result; delete m.manualDur;
  const reid = bs => (bs || []).forEach(b => { b.id = sid(); reid(b.children); });
  reid(m.blocks);
  (m.exercises || []).forEach(e => { e.id = sid(); (e.sets || []).forEach(s => { s.done = false; }); });
  return m;
}
// Retrouve un bloc (ou un enfant de répétition) : { list, i, b }
export function findBlock(meta, id) {
  const walk = list => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { list, i, b: list[i] };
      const r = list[i].children && walk(list[i].children);
      if (r) return r;
    }
    return null;
  };
  return walk(meta.blocks || []);
}
export const findEx = (meta, id) => (meta.exercises || []).find(e => e.id === id);

// Écrit un contenu modifié ; la durée suit le contenu tant qu'elle n'a pas été fixée à la main
export function mutate(id, fn) {
  const it = S.items.get(id);
  if (!it) return;
  const meta = clone(it.meta) || defaultMeta();
  fn(meta);
  const p = { meta };
  const probe = { ...it, meta };
  if (!meta.manualDur && it.kind !== 'program') { const e = estimate(probe); p.duration_min = e.sec ? Math.max(5, Math.round(e.sec / 300) * 5) : it.duration_min; }
  patch(id, p);
}

// ---------------------------------------------------------------------------
// Création, copie
// ---------------------------------------------------------------------------
export function createWorkout({ sport = 'run', tpl = null, day = null, time = null, title = null } = {}) {
  const src = tpl ? S.items.get(tpl) : null;
  const meta = src ? freshMeta(src.meta) : defaultMeta(sport);
  if (src) meta.tpl = src.id;
  const base = { kind: 'workout', title: title || src?.title || SPORTS[meta.sport]?.label || 'Séance', meta, scheduled_date: day, scheduled_time: time, duration_min: src?.duration_min || null, body: src?.body || '', tags: [...(src?.tags || [])] };
  const it = newItem(base);
  if (!it.duration_min) { const e = estimate(it); it.duration_min = e.sec ? Math.max(5, Math.round(e.sec / 300) * 5) : null; }
  return saveItem(it);
}
export function duplicate(id, day) {
  const src = S.items.get(id);
  if (!src) return null;
  const meta = freshMeta(src.meta);
  return saveItem(newItem({ kind: 'workout', title: src.title, body: src.body, meta, duration_min: src.duration_min, tags: [...(src.tags || [])], scheduled_date: day ?? null, parent_id: src.parent_id }));
}
export function saveAsTemplate(id) {
  const src = S.items.get(id);
  if (!src) return null;
  return saveItem(newItem({ kind: 'workout_tpl', title: src.title, body: src.body, meta: freshMeta(src.meta), duration_min: src.duration_min, tags: [...(src.tags || [])] }));
}

// ---------------------------------------------------------------------------
// Semaine, historique
// ---------------------------------------------------------------------------
export const monday = day => { const d = parseYmd(day); return addDays(day, -((d.getDay() + 6) % 7)); };
export const workouts = () => ofKind('workout');
export const templates = () => ofKind('workout_tpl').sort((a, b) => a.title.localeCompare(b.title, 'fr'));
export const programs = () => ofKind('program').sort((a, b) => a.title.localeCompare(b.title, 'fr'));
export const sortWhen = (a, b) => (a.scheduled_date || '9999').localeCompare(b.scheduled_date || '9999') || (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99') || a.created_at.localeCompare(b.created_at);
export const onDay = d => workouts().filter(w => w.scheduled_date === d && w.status !== 'someday').sort(sortWhen);
export const doneList = () => workouts().filter(w => w.status === 'done').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
export const doneDay = w => (w.completed_at ? ymd(new Date(w.completed_at)) : w.scheduled_date) || today();
export const unplaced = () => workouts().filter(w => w.status === 'active' && !w.scheduled_date).sort((a, b) => a.created_at.localeCompare(b.created_at));
export const missed = () => workouts().filter(w => w.status === 'active' && w.scheduled_date && w.scheduled_date < today()).sort(sortWhen);
// Dernières séries faites d'un exercice (hors séance donnée)
export function lastPerf(name, exceptId) {
  const k = name.trim().toLowerCase();
  for (const w of doneList()) {
    if (w.id === exceptId) continue;
    const ex = (w.meta?.exercises || []).find(e => e.name.trim().toLowerCase() === k);
    const sets = ex && setsOf(ex).filter(s => s.done);
    if (sets?.length) return { day: doneDay(w), sets };
  }
  return null;
}
export const perfText = p => {
  const g = [];
  for (const s of p.sets) { const key = `${s.reps}×${s.w || 'PdC'}`; const last = g[g.length - 1]; if (last?.key === key) last.n++; else g.push({ key, n: 1, s }); }
  return g.map(x => `${x.n > 1 ? x.n + ' × ' : ''}${x.s.reps} ${x.s.w ? `à ${fmtW(x.s.w)}` : 'au poids du corps'}`).join(', ');
};
export const fmtW = w => `${String(+(+w).toFixed(2)).replace('.', ',')} kg`;
export const e1rm = (w, reps) => (w > 0 && reps > 0 ? w * (1 + reps / 30) : 0);

// ---------------------------------------------------------------------------
// Rappel : même convention que les tâches (instant ISO, saisie en heure locale)
// ---------------------------------------------------------------------------
export const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fromLocalInput = v => (v ? new Date(v).toISOString() : null);
export function remindPreset(it, v) {
  if (v === 'clear') return null;
  const day = it.scheduled_date || today();
  const start = new Date(`${day}T${it.scheduled_time || '09:00'}`);
  if (v === 'start') return start.toISOString();
  if (v === 'before30') return new Date(+start - 30 * 60e3).toISOString();
  if (v === 'before60') return new Date(+start - 60 * 60e3).toISOString();
  if (v === 'eve') return fromLocalInput(`${addDays(day, -1)}T20:00`);
  return null;
}

// ---------------------------------------------------------------------------
// Texte à recopier dans l'app de la montre
// ---------------------------------------------------------------------------
function blockText(b) {
  if (b.type === 'repeat') return `${b.repeat} × (${(b.children || []).map(blockText).join(', ')})`;
  const what = b.dur_s ? human(b.dur_s) : b.dist_m ? fmtKm(b.dist_m) : '';
  const name = b.label || BLOCK_TYPES[b.type];
  const t = fmtTarget(b.target);
  return `${b.type === 'work' && b.label ? '' : name + ' '}${what}${t ? ` @ ${t}` : ''}`.trim();
}
export function exportText(it) {
  const m = it.meta || {};
  const head = `${it.title}${it.scheduled_date ? ` · ${fmtDate(it.scheduled_date).toLowerCase()}${it.scheduled_time ? ' ' + it.scheduled_time : ''}` : ''}`;
  const lines = [head, m.goal].filter(Boolean);
  if (m.exercises?.length) for (const e of m.exercises) {
    const ss = setsOf(e), same = ss.every(s => s.reps === ss[0]?.reps && s.w === ss[0]?.w);
    lines.push(`- ${e.name} : ${same && ss.length ? `${ss.length} × ${ss[0].reps}${ss[0].w ? ` à ${fmtW(ss[0].w)}` : ''}` : ss.map(s => `${s.reps}${s.w ? `×${fmtW(s.w)}` : ''}`).join(' / ')}${e.rest_s ? `, repos ${human(e.rest_s)}` : ''}`);
  }
  else for (const b of m.blocks || []) lines.push(`- ${blockText(b)}`);
  const e = estimate(it);
  if (e.sec) lines.push(`Durée estimée : ${fmtDur(Math.round(e.sec / 60))}${e.dist ? ` · ~${fmtKm(e.dist)}` : ''}`);
  if (it.body?.trim()) lines.push('', it.body.trim());
  return lines.join('\n');
}

export const icon = it => sportOf(it).icon;
export const label = it => sportOf(it).label;
export { esc, nowIso };
