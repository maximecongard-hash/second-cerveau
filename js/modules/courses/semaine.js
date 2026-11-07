import { esc, I, empty, parseYmd, addDays, today, fmtDur } from '../../core/util.js';
import { S, savePrefs } from '../../core/store.js';
import { metaOf } from './model.js';

// ---------------------------------------------------------------------------
// Semaine : les recettes prévues cette semaine (envoyées depuis le panier), à cocher quand elles sont faites.
// Stockée dans les préférences (S.prefs.rcWeek = { w: lundi de la semaine, l: [{ id, parts, done }] }) : repart à zéro chaque lundi.
// ---------------------------------------------------------------------------
export const WEEK_GOAL = 18; // portions minimum pour la semaine
const monday = () => addDays(today(), -((parseYmd(today()).getDay() + 6) % 7));
const fmtShort = s => parseYmd(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

export const weekEntries = () => {
  const w = S.prefs.rcWeek;
  if (!w || w.w !== monday()) return [];
  return (w.l || []).filter(e => { const r = S.items.get(e.id); return r && r.status !== 'trashed'; });
};
const save = l => { S.prefs.rcWeek = { w: monday(), l }; savePrefs(); };
export const inWeek = id => weekEntries().some(e => e.id === id);
// Portions de la semaine, en comptant à la place de leur entrée les recettes de `sel` ([{ id, parts }]) en cours de sélection
export const weekParts = (sel = []) => weekEntries().filter(e => !sel.some(s => s.id === e.id)).reduce((n, e) => n + e.parts, 0) + sel.reduce((n, s) => n + s.parts, 0);
export const partsLabel = n => `${n} / ${WEEK_GOAL} portions`;

export function addToWeek(list) {
  const cur = weekEntries();
  for (const { id, parts } of list) {
    const e = cur.find(x => x.id === id);
    if (e) e.parts = parts; else cur.push({ id, parts, done: false });
  }
  save(cur);
}
export function toggleWeek(id) {
  const cur = weekEntries(), r = S.items.get(id);
  if (!r) return;
  save(inWeek(id) ? cur.filter(e => e.id !== id) : [...cur, { id, parts: metaOf(r).servings, done: false }]);
}
export const toggleDone = id => save(weekEntries().map(e => (e.id === id ? { ...e, done: !e.done } : e)));
export const clearDone = () => save(weekEntries().filter(e => !e.done));

function weekRow(e) {
  const r = S.items.get(e.id);
  const meta = [`${e.parts} parts`, r.duration_min ? fmtDur(r.duration_min) : ''].filter(Boolean).join(' · ');
  return `<div class="row wk-row ${e.done ? 'done' : ''}" data-act="wk-done" data-long="edit" data-id="${e.id}">
    <button type="button" class="check ${e.done ? 'on' : ''}" aria-label="${e.done ? 'Remettre à cuisiner' : 'Marquer comme faite'}"></button>
    <div class="row-main"><div class="row-title">${esc(r.title) || '<i>Sans titre</i>'}</div><div class="sh-from">${esc(meta)}</div></div>
    <button type="button" class="icon-btn sh-more" data-act="edit" data-id="${e.id}" aria-label="Détails de ${esc(r.title)}">${I.menu}</button>
  </div>`;
}

export function semaineView() {
  const es = weekEntries(), todo = es.filter(e => !e.done), done = es.filter(e => e.done), mon = monday();
  const n = weekParts(), ok = n >= WEEK_GOAL;
  const head = `<p class="wk-head muted small">${esc(fmtShort(mon))} au ${esc(fmtShort(addDays(mon, 6)))} · ${done.length} sur ${es.length} faites · <span class="${ok ? 'wk-ok' : ''}">${partsLabel(n)}</span></p>`;
  if (!es.length) return { title: 'Semaine', html: empty('Rien de prévu', 'Coche des recettes dans la banque, puis prépare les courses : elles arrivent ici.') };
  return {
    title: 'Semaine',
    html: head
      + (todo.length ? `<section class="sec"><div class="sec-head"><h2>À cuisiner</h2><span class="muted small">${todo.length}</span></div>${todo.map(weekRow).join('')}</section>` : '')
      + (done.length ? `<section class="sec"><div class="sec-head"><h2>Faites</h2><button class="link" data-act="wk-clear">Vider</button></div>${done.map(weekRow).join('')}</section>` : '')
  };
}
