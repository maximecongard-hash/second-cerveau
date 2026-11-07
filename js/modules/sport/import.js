import { ymd, pad, plural } from '../../core/util.js';
import { S, newItem, saveItem, patch } from '../../core/store.js';
import { render, toast } from '../../core/ui.js';
import { SPORTS, EXERCISE_SPORTS } from './model.js';

// ---------------------------------------------------------------------------
// Import de séances faites depuis un fichier TCX ou GPX (export de l'app COROS), lu dans l'appareil :
// rien n'est envoyé ailleurs qu'à la base de Brain, comme n'importe quelle séance saisie.
// Chaque séance importée garde meta.result.ext_id (« file: » + heure de départ) : la déposer deux fois ne la double pas.
// ---------------------------------------------------------------------------
const named = (root, name) => [...root.getElementsByTagNameNS('*', name)];
const text = (root, name) => named(root, name)[0]?.textContent?.trim() || '';
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// Sport d'après le texte d'un type de fichier (TCX : Running, Biking ; GPX : running, cycling…)
export function guessSport(s = '') {
  s = s.toLowerCase();
  if (/run|course|trail|jog/.test(s)) return 'run';
  if (/bik|cycl|ride|v[ée]lo/.test(s)) return 'bike';
  if (/swim|nata/.test(s)) return 'swim';
  if (/hik|walk|rando|marche/.test(s)) return 'hike';
  if (/strength|weight|gym|muscu|renfo/.test(s)) return 'strength';
  if (/yoga|pilates|mobil|stretch/.test(s)) return 'mobility';
  return 'other';
}

const hav = (a, b) => {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const mean = xs => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

function fromTcx(doc) {
  return named(doc, 'Activity').map(act => {
    const laps = named(act, 'Lap');
    const dur = laps.reduce((s, l) => s + num(text(l, 'TotalTimeSeconds')), 0);
    const dist = laps.reduce((s, l) => s + num(text(l, 'DistanceMeters')), 0);
    // FC moyenne : celle des tours pondérée par leur durée, à défaut les points du tracé
    let hrW = 0, hrT = 0;
    for (const l of laps) {
      const h = num(named(l, 'AverageHeartRateBpm')[0]?.textContent), t = num(text(l, 'TotalTimeSeconds'));
      if (h && t) { hrW += h * t; hrT += t; }
    }
    const hr = hrT ? Math.round(hrW / hrT) : mean(named(act, 'HeartRateBpm').map(x => num(x.textContent)).filter(Boolean));
    const start = new Date(text(act, 'Id') || laps[0]?.getAttribute('StartTime') || '');
    return { sport: guessSport(act.getAttribute('Sport') || ''), name: text(act, 'Notes'), start, dur_s: Math.round(dur), dist_m: Math.round(dist), avg_hr: hr };
  });
}

function fromGpx(doc) {
  return named(doc, 'trk').map(trk => {
    const pts = named(trk, 'trkpt').map(p => ({ lat: num(p.getAttribute('lat')), lon: num(p.getAttribute('lon')), t: new Date(text(p, 'time')), hr: num(text(p, 'hr')) }));
    const timed = pts.filter(p => !isNaN(p.t));
    const start = timed[0]?.t || new Date(text(doc, 'time') || '');
    const dur = timed.length > 1 ? (timed[timed.length - 1].t - timed[0].t) / 1000 : 0;
    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += hav(pts[i - 1], pts[i]);
    const type = text(trk, 'type'), name = text(trk, 'name');
    return { sport: guessSport(type || name), name, start, dur_s: Math.round(dur), dist_m: Math.round(dist), avg_hr: mean(pts.map(p => p.hr).filter(Boolean)) };
  });
}

// Lit un fichier TCX ou GPX : liste d'activités { sport, name, start, dur_s, dist_m, avg_hr }
export function parseActivities(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('fichier illisible');
  const root = doc.documentElement.localName;
  if (root === 'TrainingCenterDatabase') return fromTcx(doc);
  if (root === 'gpx') return fromGpx(doc);
  throw new Error('format non pris en charge (TCX ou GPX attendu)');
}

const doneWorkouts = () => [...S.items.values()].filter(i => i.kind === 'workout');

// Range une activité : complète la séance prévue du même jour et du même sport, sinon crée une séance faite
export function importActivity(a) {
  if (isNaN(a.start) || (a.dur_s < 60 && !a.dist_m)) return 'skip';
  const ext = 'file:' + a.start.toISOString();
  const all = doneWorkouts();
  if (all.some(w => w.meta?.result?.ext_id === ext)) return 'dup';
  const endurance = !!SPORTS[a.sport]?.endurance;
  const result = { dur_s: a.dur_s || null, dist_m: endurance && a.dist_m ? a.dist_m : null, avg_hr: a.avg_hr || null, rpe: null, feeling: null, note: '', source: 'coros', ext_id: ext };
  const day = ymd(a.start), time = `${pad(a.start.getHours())}:${pad(a.start.getMinutes())}`;
  const planned = all.filter(w => w.status === 'active' && w.scheduled_date === day && w.meta?.sport === a.sport)
    .sort((x, y) => (x.scheduled_time || '').localeCompare(y.scheduled_time || ''))[0];
  if (planned) {
    patch(planned.id, { status: 'done', completed_at: a.start.toISOString(), meta: { ...planned.meta, result } }, { render: false });
    return 'matched';
  }
  const meta = { sport: a.sport, goal: '', result };
  if (EXERCISE_SPORTS.includes(a.sport)) meta.exercises = []; else meta.blocks = [];
  saveItem(newItem({
    kind: 'workout', status: 'done', title: a.name || SPORTS[a.sport].label, scheduled_date: day, scheduled_time: time,
    duration_min: Math.max(1, Math.round((a.dur_s || 60) / 60)), completed_at: a.start.toISOString(), source: 'import', meta
  }), { render: false });
  return 'added';
}

// Champ fichier de l'Historique : un ou plusieurs fichiers d'un coup
export async function importFiles(input) {
  const files = [...input.files];
  input.value = '';
  const n = { added: 0, matched: 0, dup: 0, skip: 0 }, errors = [];
  for (const f of files) {
    try { for (const a of parseActivities(await f.text())) n[importActivity(a)]++; }
    catch (e) { errors.push(`${f.name} : ${e.message || e}`); }
  }
  render(); // les écritures ci-dessus sont sans rendu : un seul rendu à la fin
  const parts = [];
  if (n.added) parts.push(plural(n.added, 'séance ajoutée', 'séances ajoutées'));
  if (n.matched) parts.push(plural(n.matched, 'rapprochée d’une séance prévue', 'rapprochées de séances prévues'));
  if (n.dup) parts.push(plural(n.dup, 'déjà importée', 'déjà importées'));
  if (n.skip) parts.push(plural(n.skip, 'ignorée', 'ignorées'));
  toast(errors.length ? 'Erreur : ' + errors[0] : parts.join(', ') || 'Aucune séance trouvée');
}

export const importButton = () => `<div class="sp-import"><label class="btn">Importer des séances<input type="file" id="sp-import-file" multiple hidden></label>
  <div class="muted small">Dans l’app COROS, ouvre une séance, exporte-la en TCX ou GPX, puis choisis le fichier ici.</div></div>`;
