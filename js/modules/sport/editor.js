import { esc, I, fRow, seg, sel, chip, today, addDays, nowIso, fmtDate, fmtDur } from '../../core/util.js';
import { S, patch, ofKind, byTitle, newItem, saveItem } from '../../core/store.js';
import { SH, render, renderEditor, toast, closeSheet, openEditor } from '../../core/ui.js';
import { linksBlock } from '../../core/links.js';
import { pushHint } from '../../core/push.js';
import { library, restFor } from './exercises.js';
import {
  SPORTS, BLOCK_TYPES, TARGETS, PRESETS, sportOf, isStrength, isEndurance, estimate, summary, human, clock, parseClock, kmInput, parseKm, fmtKm, targetInput, parseTargetVal,
  defaultMeta, newBlock, newSet, newExercise, findBlock, findEx, mutate, clone, setsOf, lastPerf, perfText, fmtW, createWorkout, duplicate, saveAsTemplate,
  toLocalInput, fromLocalInput, remindPreset, exportText, icon, label
} from './model.js';

// ---------------------------------------------------------------------------
// Éditeur d'une séance ou d'un modèle : résumé, actions, puis sections repliables
// ---------------------------------------------------------------------------
const secOpen = k => ((S.ui.spSecs ??= { contenu: true })[k] ?? false);
function edSec(k, title, inner, hint = '', raw = false) {
  const open = secOpen(k);
  return `<div class="ed-sec ${open ? 'open' : ''}"><button type="button" class="ed-sec-h" data-act="sp-sec" data-v="${k}"><span class="ed-sec-t">${title}</span><span class="ed-sec-hint">${hint}</span><span class="chev">${I.right}</span></button>${open ? (raw ? `<div class="ed-sec-b">${inner}</div>` : `<div class="fields">${inner}</div>`) : ''}</div>`;
}
export const refresh = () => (SH.mode === 'editor' ? renderEditor() : render());

const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
const projectOptions = cur => [['', 'Aucun'], ...ofKind('project').filter(p => ['active', 'someday'].includes(p.status) || p.id === cur).sort(byTitle).map(p => [p.id, p.title])];

// ---------------------------------------------------------------------------
// Contenu : course / vélo / natation (blocs)
// ---------------------------------------------------------------------------
function blockCard(b, depth = 0) {
  const f = (k, label, val, ph = '', attrs = '') => `<label class="sp-f"><span>${label}</span><input data-sp="blk" data-id="${b.id}" data-k="${k}" value="${esc(val)}" placeholder="${ph}" autocomplete="off" ${attrs}></label>`;
  const types = depth ? [['work', 'Effort'], ['rest', 'Récupération']] : Object.entries(BLOCK_TYPES).filter(([k]) => k !== 'repeat');
  const t = b.target || {};
  const head = `<div class="sp-blk-h">
      ${b.type === 'repeat' ? '<span class="sp-blk-type">Répétitions</span>' : `<select data-sp="blk" data-id="${b.id}" data-k="type" aria-label="Type de bloc">${types.map(([v, l]) => `<option value="${v}" ${b.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`}
      <span class="sp-blk-btns"><button type="button" class="icon-btn" data-act="sp-blk-up" data-id="${b.id}" aria-label="Monter">${I.up}</button><button type="button" class="icon-btn" data-act="sp-blk-down" data-id="${b.id}" aria-label="Descendre">${I.down}</button><button type="button" class="icon-btn" data-act="sp-blk-dup" data-id="${b.id}" aria-label="Dupliquer">${I.plus}</button><button type="button" class="icon-btn" data-act="sp-blk-del" data-id="${b.id}" aria-label="Supprimer">${I.minus}</button></span></div>`;
  if (b.type === 'repeat') {
    return `<div class="sp-blk t-repeat">${head}
      <div class="sp-row">${f('repeat', 'Fois', b.repeat || 1, '6', 'inputmode="numeric"')}</div>
      <div class="sp-sub">${(b.children || []).map(c => blockCard(c, 1)).join('')}</div>
      <div class="quick"><button type="button" class="chip" data-act="sp-blk-add" data-v="work" data-p="${b.id}">+ Effort</button><button type="button" class="chip" data-act="sp-blk-add" data-v="rest" data-p="${b.id}">+ Récup</button></div></div>`;
  }
  return `<div class="sp-blk t-${b.type}">${head}
    <div class="sp-row">${f('label', 'Nom', b.label, BLOCK_TYPES[b.type])}</div>
    <div class="sp-row">${f('dur', 'Durée', b.dur_s ? clock(b.dur_s) : '', 'mm:ss', 'inputmode="numeric"')}${f('dist', 'Distance (km)', kmInput(b.dist_m), '', 'inputmode="decimal"')}</div>
    <div class="sp-row"><label class="sp-f"><span>Cible</span><select data-sp="blk" data-id="${b.id}" data-k="tkind">${Object.entries(TARGETS).map(([v, l]) => `<option value="${v}" ${(t.kind || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${t.kind ? f('tlo', t.kind === 'pace' ? 'De (min/km)' : 'De', targetInput(t.kind, t.lo), t.kind === 'pace' ? '4:30' : '', 'inputmode="numeric"') + f('thi', 'À', targetInput(t.kind, t.hi), '', 'inputmode="numeric"') : ''}</div></div>`;
}
function enduranceContent(it) {
  const bl = it.meta?.blocks || [], e = estimate(it);
  return `<div class="chips scroll">${Object.entries(PRESETS).map(([k, [l]]) => `<button type="button" class="chip" data-act="sp-preset" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="sp-blocks">${bl.map(b => blockCard(b)).join('') || '<div class="muted small pad">Aucun bloc. Choisis un modèle ci-dessus ou ajoute un bloc.</div>'}</div>
    <div class="quick sp-add">${[['warmup', '+ Échauffement'], ['work', '+ Effort'], ['rest', '+ Récup'], ['repeat', '+ Répétitions'], ['cooldown', '+ Retour au calme']].map(([v, l]) => `<button type="button" class="chip" data-act="sp-blk-add" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="sp-total">${e.sec ? `${human(e.sec)}${e.dist ? ` · ~${fmtKm(e.dist)}` : ''}${e.intervals ? ` · ${e.intervals} répétitions` : ''}` : 'Ajoute des durées pour obtenir un total.'}</div>`;
}

// ---------------------------------------------------------------------------
// Contenu : renforcement (exercices et séries)
// ---------------------------------------------------------------------------
export const stepper = (exId, i, k, val, step) => `<div class="sp-step"><button type="button" class="icon-btn" data-act="sp-step" data-ex="${exId}" data-i="${i}" data-k="${k}" data-d="-${step}" aria-label="Moins">${I.minus}</button><input inputmode="decimal" data-sp="set" data-ex="${exId}" data-i="${i}" data-k="${k}" value="${esc(String(val ?? 0).replace('.', ','))}" aria-label="${k === 'w' ? 'Charge' : 'Répétitions'}"><button type="button" class="icon-btn" data-act="sp-step" data-ex="${exId}" data-i="${i}" data-k="${k}" data-d="${step}" aria-label="Plus">${I.plus}</button></div>`;
function exerciseCard(ex, it) {
  const last = lastPerf(ex.name, it.id);
  return `<div class="sp-ex"><div class="sp-ex-h"><input class="sp-ex-name" data-sp="ex" data-ex="${ex.id}" data-k="name" value="${esc(ex.name)}" list="sp-lib" autocomplete="off" aria-label="Exercice">
      <span class="sp-blk-btns"><button type="button" class="icon-btn" data-act="sp-ex-up" data-ex="${ex.id}" aria-label="Monter">${I.up}</button><button type="button" class="icon-btn" data-act="sp-ex-down" data-ex="${ex.id}" aria-label="Descendre">${I.down}</button><button type="button" class="icon-btn" data-act="sp-ex-del" data-ex="${ex.id}" aria-label="Supprimer l'exercice">${I.minus}</button></span></div>
    ${last ? `<div class="sp-last">Dernière fois (${esc(fmtDate(last.day).toLowerCase())}) : ${esc(perfText(last))} <button type="button" class="link" data-act="sp-ex-last" data-ex="${ex.id}">Reprendre</button></div>` : ''}
    <div class="sp-sets">${setsOf(ex).map((s, i) => `<div class="sp-set"><span class="sp-n">${i + 1}</span>${stepper(ex.id, i, 'reps', s.reps, 1)}<span class="sp-x">×</span>${stepper(ex.id, i, 'w', s.w, 2.5)}<span class="sp-u">kg</span><button type="button" class="icon-btn" data-act="sp-set-del" data-ex="${ex.id}" data-i="${i}" aria-label="Supprimer la série">${I.minus}</button></div>`).join('')}</div>
    <div class="sp-ex-f"><button type="button" class="chip" data-act="sp-set-add" data-ex="${ex.id}">+ Série</button>
      <label class="sp-f inline"><span>Repos</span><input inputmode="numeric" data-sp="ex" data-ex="${ex.id}" data-k="rest" value="${ex.rest_s ? clock(ex.rest_s) : ''}" placeholder="01:30"></label></div>
    <input class="sp-note" data-sp="ex" data-ex="${ex.id}" data-k="note" value="${esc(ex.note || '')}" placeholder="Note (tempo, variante…)" autocomplete="off"></div>`;
}
function strengthContent(it) {
  const ex = it.meta?.exercises || [], e = estimate(it);
  return `<datalist id="sp-lib">${library().map(x => `<option value="${esc(x.name)}"></option>`).join('')}</datalist>
    ${ex.map(x => exerciseCard(x, it)).join('') || '<div class="muted small pad">Aucun exercice.</div>'}
    <form class="inline-add" data-form="sp-ex-add" data-id="${it.id}"><input id="sp-ex-new" list="sp-lib" placeholder="+ Exercice (choisis ou écris)" enterkeyhint="done" autocomplete="off"></form>
    <div class="sp-total">${e.sets ? `${e.exercises} exercice${e.exercises > 1 ? 's' : ''} · ${e.sets} séries · ${Math.round(e.tonnage).toLocaleString('fr-FR')} kg · ~${fmtDur(Math.round(e.sec / 60))}` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Éditeur
// ---------------------------------------------------------------------------
const DURS = [15, 20, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240];
const durOptions = cur => [['', '—'], ...[...new Set([...DURS, ...(cur ? [cur] : [])])].sort((a, b) => a - b).map(n => [n, fmtDur(n)])];

export function editorHTML(it) {
  const tpl = it.kind === 'workout_tpl', done = it.status === 'done';
  const m = it.meta || (it.meta = defaultMeta());
  const head = `<div class="sheet-head"><button class="link strong" data-act="close">OK</button><span class="sheet-kind">${tpl ? 'Modèle' : 'Séance'}</span><button class="link danger" data-act="trash" data-id="${it.id}">Supprimer</button></div>`;
  const types = `<div class="chips scroll">${Object.entries(SPORTS).map(([k, s]) => chip(s.label, m.sport === k, 'sp-sport', k)).join('')}</div>`;
  const e = estimate(it);
  const sum = `<div class="ed-sum">
    ${!tpl && it.scheduled_date ? `<div class="ed-sum-row"><span>Prévu</span><span>${esc(fmtDate(it.scheduled_date))}${it.scheduled_time ? ` ${it.scheduled_time}` : ''}${it.duration_min ? ` · ${esc(fmtDur(it.duration_min))}` : ''}</span></div>` : ''}
    ${summary(it) ? `<div class="ed-sum-row"><span>Contenu</span><span>${esc(summary(it))}</span></div>` : ''}
    ${done && m.result ? `<div class="ed-sum-row"><span>Résultat</span><span>${esc([m.result.dur_s ? human(m.result.dur_s) : '', m.result.dist_m ? fmtKm(m.result.dist_m) : '', m.result.avg_hr ? m.result.avg_hr + ' bpm' : '', m.result.feeling ? 'ressenti ' + m.result.feeling + '/5' : ''].filter(Boolean).join(' · '))}</span></div>` : ''}
  </div>
  <div class="sp-actions">
    ${!tpl && !done ? `<button type="button" class="btn primary" data-act="sp-start" data-id="${it.id}">${it.timer_started_at || it.spent_sec ? 'Reprendre' : 'Démarrer'}</button><button type="button" class="btn" data-act="sp-finish" data-id="${it.id}">Marquer faite</button>` : ''}
    ${!tpl && done ? `<button type="button" class="btn" data-act="sp-reopen" data-id="${it.id}">Remettre à faire</button>` : ''}
    ${tpl ? `<button type="button" class="btn primary" data-act="sp-plan-tpl" data-id="${it.id}">Planifier…</button>` : ''}
    <button type="button" class="btn" data-act="sp-copy" data-id="${it.id}">Copier pour la montre</button>
  </div>`;

  const quand = tpl ? '' : `
    ${fRow('Prévu le', `<div class="date-line"><input type="date" data-f="scheduled_date" value="${it.scheduled_date || ''}"><input type="time" data-f="scheduled_time" value="${it.scheduled_time || ''}"></div>
      <div class="quick">${[['0', "Aujourd'hui"], ['1', 'Demain'], ['7', '+1 sem.'], ['clear', 'Effacer']].map(([v, l]) => `<button type="button" class="chip" data-act="sp-sched" data-v="${v}">${l}</button>`).join('')}</div>`)}
    ${fRow('Durée', sel('duration_min', it.duration_min, durOptions(it.duration_min)) + (m.manualDur ? '<button type="button" class="chip" data-act="sp-dur-auto">Calcul auto</button>' : e.sec ? '<span class="muted small"> calculée</span>' : ''))}
    ${fRow('Rappel', `<div class="date-line"><input type="datetime-local" data-f="remind_at" value="${toLocalInput(it.remind_at)}"></div>
      <div class="quick">${[['before30', '30 min avant'], ['before60', '1 h avant'], ['eve', 'La veille 20 h'], ['clear', 'Effacer']].map(([v, l]) => `<button type="button" class="chip" data-act="sp-remind" data-v="${v}">${l}</button>`).join('')}</div>${it.remind_at ? pushHint() : ''}`)}`;

  const contenu = isStrength(it) ? strengthContent(it) : enduranceContent(it);
  const r = m.result || {};
  const resultat = `
    ${fRow('Durée réelle', `<input data-sp="res" data-k="dur" inputmode="numeric" value="${r.dur_s ? clock(r.dur_s) : ''}" placeholder="mm:ss">`)}
    ${isEndurance(it) ? fRow('Distance (km)', `<input data-sp="res" data-k="dist" inputmode="decimal" value="${kmInput(r.dist_m)}">`) + fRow('FC moyenne', `<input data-sp="res" data-k="hr" inputmode="numeric" value="${r.avg_hr || ''}" placeholder="bpm">`) : ''}
    ${fRow('Effort (RPE)', sel('res_rpe', r.rpe, [['', '—'], ...Array.from({ length: 10 }, (_, i) => [i + 1, String(i + 1)])]))}
    ${fRow('Ressenti', sel('res_feeling', r.feeling, [['', '—'], [1, '1 · Pénible'], [2, '2 · Moyen'], [3, '3 · Correct'], [4, '4 · Bien'], [5, '5 · Excellent']]))}
    ${fRow('Note', `<input data-sp="res" data-k="note" value="${esc(r.note || '')}" placeholder="Sensations, météo…" autocomplete="off">`)}`;
  const plus = `<div class="fields">
      ${fRow('Statut', tpl ? '<span class="muted">Modèle</span>' : seg('status', it.status, [['active', 'Prévue'], ['done', 'Faite']]))}
      ${tpl ? '' : fRow('Projet', sel('parent_id', it.parent_id, projectOptions(it.parent_id)))}
      ${fRow('Tags', `<input data-f="tags" value="${esc((it.tags || []).join(', '))}" placeholder="séparés par des virgules" autocomplete="off">`)}
      ${fRow('Effort visé', `<input data-f="rpeTarget" inputmode="numeric" value="${m.rpeTarget || ''}" placeholder="Effort visé (1-10)">`)}
      ${!tpl && m.tpl && S.items.get(m.tpl) ? fRow('Modèle', `<span>${esc(S.items.get(m.tpl).title)}</span>`) : ''}
    </div>${linksBlock(it)}
    <div class="sp-actions">${tpl ? '' : '<button type="button" class="btn" data-act="sp-tpl-save" data-id="' + it.id + '">Enregistrer comme modèle</button>'}<button type="button" class="btn" data-act="sp-dup" data-id="${it.id}">Dupliquer</button></div>`;

  return head + `<input class="title-input" data-f="title" id="f-title" value="${esc(it.title)}" placeholder="Nom de la séance" autocomplete="off">` + types +
    `<input class="sp-goal" data-f="goal" value="${esc(m.goal || '')}" placeholder="Objectif en une ligne (ex. allure aisée, 4 × 8 lourd)" autocomplete="off">
    <textarea class="notes-input" data-f="body" rows="2" placeholder="Notes (markdown)">${esc(it.body)}</textarea>` + sum +
    (tpl ? '' : edSec('quand', 'Quand', quand, esc(it.scheduled_date ? fmtDate(it.scheduled_date).toLowerCase() + (it.scheduled_time ? ' ' + it.scheduled_time : '') : ''))) +
    edSec('contenu', 'Contenu', contenu, esc(estimateHint(it)), true) +
    (done || m.result ? edSec('resultat', 'Résultat', resultat, '') : '') +
    edSec('plus', 'Plus', plus, '', true);
}
const estimateHint = it => { const e = estimate(it); return e.sec ? human(e.sec) : ''; };

// ---------------------------------------------------------------------------
// Écriture d'un champ (éditeur, Agenda, glisser-déposer)
// ---------------------------------------------------------------------------
export function setField(id, f, v) {
  const it = S.items.get(id);
  if (!it) return;
  if (f === 'goal') { mutate(id, m => { m.goal = v; }); return; }
  if (f === 'rpeTarget') { mutate(id, m => { m.rpeTarget = parseInt(v, 10) || null; }); return; }
  if (f === 'res_rpe' || f === 'res_feeling') { mutate(id, m => { (m.result ??= {})[f === 'res_rpe' ? 'rpe' : 'feeling'] = parseInt(v, 10) || null; }); return; }
  let val = v;
  if (f === 'tags') val = v.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
  else if (f === 'duration_min') {
    val = parseInt(v, 10) || null;
    mutate(id, m => { m.manualDur = !!val; });
    patch(id, { duration_min: val });
    return;
  }
  else if (f === 'remind_at') val = fromLocalInput(v);
  else if (['parent_id', 'scheduled_date', 'scheduled_time'].includes(f)) val = v || null;
  const p = { [f]: val };
  if (f === 'scheduled_date' && !val) p.scheduled_time = null;
  if (f === 'scheduled_date' && val && !it.scheduled_time && it.kind === 'workout') p.scheduled_time = null;
  if (f === 'status') {
    p.completed_at = val === 'done' ? (it.completed_at || nowIso()) : null;
    if (val === 'done' && it.timer_started_at) { p.spent_sec = (it.spent_sec || 0) + Math.round((Date.now() - Date.parse(it.timer_started_at)) / 1000); p.timer_started_at = null; }
    if (val === 'done' && !it.scheduled_date) p.scheduled_date = today();
  }
  patch(id, p);
}

// ---------------------------------------------------------------------------
// Saisies des champs `data-sp` (déclenchées à la sortie du champ)
// ---------------------------------------------------------------------------
export function onChange(t) {
  const kind = t.dataset.sp;
  if (!kind) return false;
  const id = SH.editingId, v = t.value;
  if (!id && kind !== 'set') return true;
  if (kind === 'blk') {
    const k = t.dataset.k;
    mutate(id, m => {
      const r = findBlock(m, t.dataset.id);
      if (!r) return;
      const b = r.b;
      if (k === 'label') b.label = v.trim();
      else if (k === 'type') b.type = v;
      else if (k === 'dur') b.dur_s = parseClock(v);
      else if (k === 'dist') b.dist_m = parseKm(v);
      else if (k === 'repeat') b.repeat = Math.max(1, parseInt(v, 10) || 1);
      else if (k === 'tkind') b.target = v ? { kind: v, lo: null, hi: null } : null;
      else if (k === 'tlo' || k === 'thi') { b.target = b.target || { kind: 'rpe' }; b.target[k === 'tlo' ? 'lo' : 'hi'] = parseTargetVal(b.target.kind, v); }
    });
    refresh();
    return true;
  }
  if (kind === 'ex') {
    const k = t.dataset.k;
    mutate(id, m => {
      const e = findEx(m, t.dataset.ex);
      if (!e) return;
      if (k === 'name') { e.name = v.trim() || e.name; if (!e.rest_s) e.rest_s = restFor(e.name); }
      else if (k === 'rest') e.rest_s = parseClock(v) || 0;
      else if (k === 'note') e.note = v.trim();
    });
    refresh();
    return true;
  }
  if (kind === 'set') {
    const k = t.dataset.k, i = +t.dataset.i;
    mutate(SH.editingId || S.ui.spLive?.id, m => {
      const e = findEx(m, t.dataset.ex), s = e?.sets[i];
      if (s) s[k] = Math.max(0, num(v));
    });
    refresh();
    return true;
  }
  if (kind === 'res') {
    const k = t.dataset.k;
    mutate(id, m => {
      const r = (m.result ??= {});
      if (k === 'dur') r.dur_s = parseClock(v);
      else if (k === 'dist') r.dist_m = parseKm(v);
      else if (k === 'hr') r.avg_hr = parseInt(v, 10) || null;
      else if (k === 'note') r.note = v.trim();
    });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const cur = () => S.items.get(SH.editingId);
function move(list, i, d) {
  const j = i + d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}
function stepSet(id, exId, i, k, d) {
  mutate(id, m => {
    const s = findEx(m, exId)?.sets[i];
    if (!s) return;
    s[k] = Math.max(0, Math.round((num(s[k]) + d) * 100) / 100);
  });
}

export const editorActs = {
  'sp-sec': el => { const s = (S.ui.spSecs ??= { contenu: true }); s[el.dataset.v] = !s[el.dataset.v]; renderEditor(); },
  'sp-sport': el => {
    const it = cur(); if (!it) return;
    const sport = el.dataset.v;
    if (it.meta?.sport === sport) return;
    // le contenu est refait quand l'ancien n'avait pas été touché ; sinon on garde les blocs et on change juste le type
    const m = it.meta || {};
    const untouched = !(m.exercises?.length) && (m.blocks || []).length <= 1;
    mutate(it.id, x => {
      const fresh = defaultMeta(sport);
      x.sport = sport;
      if (untouched || (sport === 'strength') !== (m.sport === 'strength')) { x.blocks = fresh.blocks; x.exercises = fresh.exercises; if (!fresh.blocks) delete x.blocks; if (!fresh.exercises) delete x.exercises; }
    });
    if (/^(Course|Renfo|Vélo|Natation|Rando|Mobilité|Autre|Séance)$/.test(it.title)) patch(it.id, { title: SPORTS[sport].label });
    renderEditor();
  },
  'sp-sched': el => {
    const v = el.dataset.v;
    setField(SH.editingId, 'scheduled_date', v === 'clear' ? '' : addDays(today(), +v));
    renderEditor();
  },
  'sp-remind': el => { patch(SH.editingId, { remind_at: remindPreset(cur(), el.dataset.v) }); renderEditor(); },
  'sp-dur-auto': () => { mutate(SH.editingId, m => { delete m.manualDur; }); renderEditor(); },
  'sp-preset': el => {
    const it = cur(), key = el.dataset.v;
    if (!it) return;
    const prev = clone(it.meta), title = it.title;
    mutate(it.id, m => { m.blocks = PRESETS[key][1](); delete m.manualDur; });
    if (/^(Course|Vélo|Natation|Rando|Autre|Séance|Footing|Sortie longue|Fractionné court|Fractionné long|Tempo \/ seuil|Côtes)$/.test(title)) patch(it.id, { title: PRESETS[key][0] });
    renderEditor();
    toast(PRESETS[key][0] + ' appliqué', () => { patch(it.id, { meta: prev, title }); refresh(); });
  },
  'sp-blk-add': el => {
    mutate(SH.editingId, m => {
      const type = el.dataset.v, b = newBlock(type, type === 'repeat' ? { repeat: 4, children: [newBlock('work', { dur_s: 120 }), newBlock('rest', { dur_s: 60 })] } : { dur_s: type === 'work' ? 600 : 300 });
      const parent = el.dataset.p && findBlock(m, el.dataset.p)?.b;
      if (parent) (parent.children ??= []).push(b);
      else if (type === 'warmup') (m.blocks ??= []).unshift(b);
      else (m.blocks ??= []).push(b);
    });
    renderEditor();
  },
  'sp-blk-del': el => { mutate(SH.editingId, m => { const r = findBlock(m, el.dataset.id); if (r) r.list.splice(r.i, 1); }); renderEditor(); },
  'sp-blk-up': el => { mutate(SH.editingId, m => { const r = findBlock(m, el.dataset.id); if (r) move(r.list, r.i, -1); }); renderEditor(); },
  'sp-blk-down': el => { mutate(SH.editingId, m => { const r = findBlock(m, el.dataset.id); if (r) move(r.list, r.i, 1); }); renderEditor(); },
  'sp-blk-dup': el => {
    mutate(SH.editingId, m => {
      const r = findBlock(m, el.dataset.id);
      if (!r) return;
      const c = clone(r.b), reid = b => { b.id = newBlock('work').id; (b.children || []).forEach(reid); };
      reid(c);
      r.list.splice(r.i + 1, 0, c);
    });
    renderEditor();
  },
  'sp-ex-del': el => { mutate(SH.editingId, m => { m.exercises = (m.exercises || []).filter(e => e.id !== el.dataset.ex); }); renderEditor(); },
  'sp-ex-up': el => { mutate(SH.editingId, m => { const l = m.exercises || []; move(l, l.findIndex(e => e.id === el.dataset.ex), -1); }); renderEditor(); },
  'sp-ex-down': el => { mutate(SH.editingId, m => { const l = m.exercises || []; move(l, l.findIndex(e => e.id === el.dataset.ex), 1); }); renderEditor(); },
  'sp-ex-last': el => {
    const it = cur();
    const ex = it && findEx(it.meta, el.dataset.ex), last = ex && lastPerf(ex.name, it.id);
    if (!last) return;
    mutate(it.id, m => { findEx(m, el.dataset.ex).sets = last.sets.map(s => ({ reps: s.reps, w: s.w, done: false })); });
    renderEditor();
  },
  'sp-set-add': el => {
    mutate(SH.editingId || S.ui.spLive?.id, m => { const e = findEx(m, el.dataset.ex); e.sets.push(newSet(e, e.sets[e.sets.length - 1])); });
    refresh();
  },
  'sp-set-del': el => {
    mutate(SH.editingId || S.ui.spLive?.id, m => { findEx(m, el.dataset.ex).sets.splice(+el.dataset.i, 1); });
    refresh();
  },
  'sp-step': el => {
    stepSet(SH.editingId || S.ui.spLive?.id, el.dataset.ex, +el.dataset.i, el.dataset.k, +el.dataset.d);
    refresh();
  },
  'sp-copy': async el => {
    const it = S.items.get(el.dataset.id);
    if (!it) return;
    const text = exportText(it);
    try {
      if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) await navigator.share({ title: it.title, text });
      else { await navigator.clipboard.writeText(text); toast('Séance copiée'); }
    } catch (e) { if (e?.name !== 'AbortError') toast('Copie impossible sur cet appareil'); }
  },
  'sp-dup': el => {
    const c = duplicate(el.dataset.id);
    if (!c) return;
    toast('Séance dupliquée', () => patch(c.id, { status: 'trashed' }));
    closeSheet();
    openEditor(c.id);
  },
  'sp-tpl-save': el => {
    const c = saveAsTemplate(el.dataset.id);
    if (c) toast('Modèle enregistré', () => patch(c.id, { status: 'trashed' }));
  }
};

export const editorForms = {
  'sp-ex-add': f => {
    const input = f.querySelector('input'), name = input.value.trim();
    if (!name) return;
    mutate(f.dataset.id, m => { (m.exercises ??= []).push(newExercise(name)); });
    renderEditor();
    document.getElementById('sp-ex-new')?.focus();
  }
};
