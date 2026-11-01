import { $, esc, I, chip, fRow, seg, sel, plural, today, fmtDate, fmtDur, domain, nowIso, empty } from '../../core/util.js';
import { S, meId, NULLABLE, newItem, saveItem, patch, ofKind, byTitle } from '../../core/store.js';
import { uploadImage } from '../../core/images.js';
import { SH, sheet, showSheet, closeSheet, openEditor, toast } from '../../core/ui.js';
import { linksBlock } from '../../core/links.js';
import { shareBlock } from '../../core/share.js';
import { kindOwner } from '../../core/modules.js';
import { spentSec, fmtClock, areas, nextActions, nextOrder, sortTasks, spawnNext, recOptions, recText, slotEnd, recDraftFor, WEEK_DAYS, NTH, toLocalInput, fromLocalInput } from './model.js';
import { loadEvents, historyHTML } from './history.js';
import { firstName } from '../../core/share.js';
import { pushHint } from '../../core/push.js';

// ---------------------------------------------------------------------------
// Feuilles GTD : éditeur, capture rapide, sélection des tâches du jour
// ---------------------------------------------------------------------------
let capPreset = null;
export let pickSel = new Set();

function projectOptions(cur) {
  const ps = ofKind('project').filter(p => ['active', 'someday', 'clarify'].includes(p.status) || p.id === cur).sort(byTitle);
  const shared = cur && !ps.some(p => p.id === cur) ? S.items.get(cur) : null; // projet partagé par quelqu'un d'autre
  return [['', 'Aucun'], ...(shared ? [shared] : []).concat(ps).map(p => [p.id, p.title + (p.status === 'someday' ? ' (un jour)' : '')])];
}
function media(it) {
  return `${it.image_path ? `<img class="cap-img" data-img="${esc(it.image_path)}" alt="">` : ''}${it.url ? `<a class="link-card" href="${esc(it.url)}" target="_blank" rel="noopener">${I.link}<span>${esc(domain(it.url))}</span></a>` : ''}`;
}
function editorHead(it) {
  const kinds = [['task', 'Tâche'], ['project', 'Projet'], ...(kindOwner('note') ? [['note', 'Note']] : [])];
  const mid = it.kind === 'area' ? '<span class="sheet-kind">Domaine</span>'
    : `<div class="seg small">${kinds.map(([v, l]) => `<button class="${it.kind === v ? 'on' : ''}" data-act="kind" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<div class="sheet-head"><button class="link strong" data-act="close">OK</button>${mid}<button class="link danger" data-act="trash" data-id="${it.id}">Supprimer</button></div>`;
}
export function editorHTML(it) {
  const head = editorHead(it);
  const title = ph => `<input class="title-input" data-f="title" id="f-title" value="${esc(it.title)}" placeholder="${ph}" autocomplete="off">`;
  const tagsF = fRow('Tags', `<input data-f="tags" value="${esc((it.tags || []).join(', '))}" placeholder="séparés par des virgules" autocomplete="off">`);
  const urlF = fRow('Lien', `<input type="url" data-f="url" value="${esc(it.url || '')}" placeholder="https://" autocomplete="off">`);

  if (it.kind === 'area') {
    const n = ofKind('project').filter(p => p.parent_id === it.id).length;
    return head + title('Nom du domaine') + `<div class="muted small pad">${plural(n, 'projet', 'projets')}</div>`;
  }
  if (it.kind === 'inbox') {
    return head + title('Idée') + `<textarea class="notes-input" data-f="body" rows="4" placeholder="Détails">${esc(it.body)}</textarea>${media(it)}
      <div class="fields">${urlF}</div><a class="btn primary block" href="#/clarify/${it.id}" data-act="close-go">Trier maintenant</a>`;
  }
  if (it.kind === 'project') {
    const ts = ofKind('task').filter(t => t.parent_id === it.id && t.status === 'active');
    return head + title('Nom du projet (résultat voulu)') +
      `<textarea class="outcome-input" data-f="outcome" rows="2" placeholder="Résultat attendu : à quoi ressemble « terminé » ?">${esc(it.outcome || '')}</textarea>
      <textarea class="notes-input" data-f="body" rows="3" placeholder="Notes, idées (markdown)">${esc(it.body)}</textarea>${media(it)}
      <div class="fields">
        ${fRow('Statut', seg('status', it.status, [['clarify', 'À clarifier'], ['active', 'Actif'], ['someday', 'Un jour'], ['done', 'Terminé']]))}
        ${fRow('Domaine', sel('parent_id', it.parent_id, [['', 'Aucun'], ...areas().map(a => [a.id, a.title])]))}
        ${fRow('Échéance', `<input type="date" data-f="due_date" value="${it.due_date || ''}">`)}
        ${fRow('Revue le', `<input type="date" data-f="review_date" value="${it.review_date || ''}">`)}
        ${tagsF}
      </div>
      <div class="sub-list"><div class="sub-title">Actions (${ts.length})</div>${ts.map(t => `<div class="sub-item">${esc(t.title)}</div>`).join('')}
        <form class="inline-add" data-form="add-proj" data-id="${it.id}"><input id="ed-next" placeholder="+ Prochaine action" enterkeyhint="done" autocomplete="off"></form></div>
      ${linksBlock(it)}
      ${shareBlock(it)}
      <a class="btn block" href="#/project/${it.id}" data-act="close-go">Ouvrir le projet</a>`;
  }
  // tâche : résumé en haut, puis sections repliables (état gardé dans S.ui.edSecs)
  const ctxs = [...new Set([...S.prefs.contexts, ...(it.contexts || [])])];
  const quand = `
      ${fRow('Prévu le', `<div class="date-line"><input type="date" data-f="scheduled_date" value="${it.scheduled_date || ''}"><input type="time" data-f="scheduled_time" value="${it.scheduled_time || ''}"></div>
        <div class="quick">${[['0', "Aujourd'hui"], ['1', 'Demain'], ['7', '+1 sem.'], ['clear', 'Effacer']].map(([v, l]) => `<button class="chip" data-act="sched" data-v="${v}">${l}</button>`).join('')}</div>`)}
      ${fRow('Durée', sel('duration_min', it.duration_min, [['', '—'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [180, '3 h'], [240, '4 h']]))}
      ${fRow('Échéance', `<input type="date" data-f="due_date" value="${it.due_date || ''}">`)}
      ${fRow('Rappel', `<div class="date-line"><input type="datetime-local" data-f="remind_at" value="${toLocalInput(it.remind_at)}"></div>
        <div class="quick">${[['sched', it.scheduled_date || it.due_date ? 'Heure prévue' : 'Aujourd’hui 9 h'], ['hour', 'Dans 1 h'], ['tomorrow', 'Demain 9 h'], ['clear', 'Effacer']].map(([v, l]) => `<button class="chip" data-act="remind" data-v="${v}">${l}</button>`).join('')}</div>
        ${it.remind_at ? pushHint() : ''}`)}
      ${fRow('Répéter', recField(it))}`;
  const ou = `
      ${fRow('Statut', seg('status', it.status, [['active', 'À faire'], ['waiting', 'En attente'], ['someday', 'Un jour'], ['done', 'Fait']]))}
      ${it.status === 'waiting' ? fRow('Attendu de', `<input data-f="waiting_for" id="f-waiting_for" value="${esc(it.waiting_for || '')}" placeholder="Personne, organisme…" autocomplete="off">`) : ''}
      ${fRow('Projet', sel('parent_id', it.parent_id, projectOptions(it.parent_id)))}
      ${fRow('Contextes', `<div class="chips wrap">${ctxs.map(c => chip(esc(c), (it.contexts || []).includes(c), 'ctx', c)).join('')}</div>`)}
      ${fRow('Top 3', `<button class="chip ${it.focus ? 'on' : ''}" data-act="focus-ed">${I.star} ${it.focus ? `n° ${it.focus} · ${fmtDate(it.scheduled_date).toLowerCase()}` : `Ajouter (${fmtDate(it.scheduled_date || today()).toLowerCase()})`}</button>`)}
      ${fRow('Énergie', seg('energy', it.energy, [['low', 'Faible'], ['medium', 'Moyenne'], ['high', 'Forte']]))}`;
  const plus = `<div class="fields">${tagsF}${urlF}</div>${linksBlock(it)}${shareBlock(it)}`;
  return head + title('Nouvelle tâche') +
    `<textarea class="notes-input" data-f="body" rows="3" placeholder="Notes">${esc(it.body)}</textarea>${media(it)}` + summaryHTML(it) +
    `${edSec('quand', 'Quand', quand, hintQuand(it))}
    ${edSec('ou', 'Où et comment', ou, hintOu(it))}
    ${edSec('plus', 'Plus', plus, '', true)}
    ${edSec('histo', 'Historique', historyHTML(it.parent_id, it.id), '', true)}
`;
}

// ---------------------------------------------------------------------------
// Fiche d'une tâche : résumé et sections repliables
// ---------------------------------------------------------------------------
const secOpen = k => ((S.ui.edSecs ??= { quand: true })[k] ?? false);
function edSec(k, label, inner, hint = '', raw = false) {
  const open = secOpen(k);
  return `<div class="ed-sec ${open ? 'open' : ''}"><button type="button" class="ed-sec-h" data-act="ed-sec" data-v="${k}"><span class="ed-sec-t">${label}</span><span class="ed-sec-hint">${hint}</span><span class="chev">${I.right}</span></button>${open ? (raw ? `<div class="ed-sec-b">${inner}</div>` : `<div class="fields">${inner}</div>`) : ''}</div>`;
}
const hintQuand = it => esc([it.scheduled_date ? fmtDate(it.scheduled_date).toLowerCase() + (it.scheduled_time ? ' ' + it.scheduled_time : '') : '', it.recurrence ? '↻' : ''].filter(Boolean).join(' · '));
const hintOu = it => esc([it.parent_id && S.items.get(it.parent_id)?.title, (it.contexts || []).join(' ')].filter(Boolean).join(' · '));

function summaryHTML(it) {
  const p = it.parent_id && S.items.get(it.parent_id);
  const row = (k, v) => `<div class="ed-sum-row"><span>${k}</span><span>${v}</span></div>`;
  const when = it.scheduled_date
    ? esc(fmtDate(it.scheduled_date)) + (it.scheduled_time ? ` ${it.scheduled_time} → ${slotEnd(it.scheduled_time, it.duration_min)}` : '') + (it.duration_min ? ` · ${esc(fmtDur(it.duration_min))}` : '')
    : '';
  const run = !!it.timer_started_at, s = spentSec(it);
  const by = it.status === 'done' && it.completed_by && it.completed_by !== meId() ? `Terminé par ${esc(firstName(it.completed_by))}` : '';
  return `<div class="ed-sum">
    ${p ? row('Projet', esc(p.title)) : ''}${when ? row('Prévu', when) : ''}${it.due_date ? row('Échéance', esc(fmtDate(it.due_date).toLowerCase())) : ''}
    ${it.recurrence ? row('Répète', esc(recText(it.recurrence).toLowerCase())) : ''}${by ? row('Statut', by) : ''}
    <div class="ed-sum-row"><span>Chrono</span><span class="ed-timer"><span class="timer-val ${!run && s ? 'paused' : ''}" data-timer="${it.id}">${fmtClock(s)}</span>
      <button class="chip ${run ? 'on' : ''}" data-act="${run ? 'timer-pause' : 'timer-start'}">${run ? 'Pause' : s ? 'Reprendre' : 'Démarrer'}</button>${s ? '<button class="chip" data-act="timer-reset">Remettre à zéro</button>' : ''}</span></div>
  </div>`;
}

// Répétition : options simples ; « Personnalisée… » ouvre le choix du jour du mois ou du Nème jour de semaine
function recField(it) {
  const d = S.ui.recDraft?.id === it.id ? S.ui.recDraft : null;
  const opts = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('');
  const days = Array.from({ length: 31 }, (_, i) => [i + 1, i === 0 ? '1er' : String(i + 1)]);
  const custom = d ? `<div class="rec-custom">
      <div class="seg small"><button type="button" class="${d.mode === 'monthday' ? 'on' : ''}" data-act="rec-mode" data-v="monthday">Jour du mois</button><button type="button" class="${d.mode === 'nth' ? 'on' : ''}" data-act="rec-mode" data-v="nth">Jour de semaine</button></div>
      <div class="date-line">${d.mode === 'monthday'
        ? `<span class="rec-lbl">Chaque mois, le</span><select data-rec="day">${opts(days, d.day)}</select>`
        : `<span class="rec-lbl">Chaque mois, le</span><select data-rec="n">${opts(NTH, d.n)}</select><select data-rec="wd">${opts(WEEK_DAYS, d.wd)}</select>`}</div>
      <div class="quick"><button class="chip on" data-act="rec-apply">Appliquer</button><button class="chip" data-act="rec-cancel">Annuler</button></div></div>` : '';
  return sel('recurrence', it.recurrence, recOptions(it.recurrence)) + custom;
}

export function createAndEdit(fields) {
  const it = saveItem(newItem(fields));
  SH.draftId = it.id;
  openEditor(it.id);
}

// Le cœur relance l'éditeur après coup (setField de core/ui.js)
export function setField(id, f, v) {
  const it = S.items.get(id);
  if (!it) return;
  if (f === 'recurrence') {
    if (v === 'custom') { S.ui.recDraft = recDraftFor(it); return; }
    S.ui.recDraft = null;
  }
  if (f === 'energy' && it.energy === v) v = ''; // retoucher l'énergie choisie la retire
  let val = v;
  if (f === 'tags') val = v.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
  else if (f === 'duration_min') val = v ? parseInt(v, 10) : null;
  else if (f === 'remind_at') val = fromLocalInput(v);
  else if (NULLABLE.has(f)) val = v || null;
  const p = { [f]: val };
  if (f === 'scheduled_date') {
    if (it.scheduled_date !== val) p.focus = null;
    if (val && it.scheduled_date !== val) p.day_order = nextOrder(val);
    if (!val) p.scheduled_time = null;
  }
  if (f === 'scheduled_time' && val && !it.scheduled_date) { p.scheduled_date = S.ui.day; p.day_order = nextOrder(S.ui.day); }
  if (f === 'status') {
    if (val === 'done') {
      if (it.status !== 'done') { p.completed_at = nowIso(); p.completed_by = meId(); }
      if (it.timer_started_at) Object.assign(p, { spent_sec: spentSec(it), timer_started_at: null });
    }
    else { p.completed_at = null; p.completed_by = null; }
  }
  const wasDone = it.status === 'done';
  patch(id, p);
  if (f === 'status' && val === 'done' && !wasDone && it.recurrence && it.kind === 'task') spawnNext(it);
}

export function openCapture(preset = {}) {
  SH.mode = 'capture';
  SH.onSubmit = saveCapture;
  capPreset = preset;
  sheet.innerHTML = `<div class="sheet-head"><button class="link" data-act="close">Annuler</button><span class="sheet-kind">${esc(preset.label || 'Capturer')}</span><button class="link strong" data-act="cap-save">Ajouter</button></div>
    <textarea id="cap-text" class="cap-text" rows="5" placeholder="${preset.kind === 'task' ? 'Tâche… (1re ligne = titre)' : 'Idée, tâche, note… (1re ligne = titre)'}"></textarea>
    <div class="cap-tools"><label class="btn">${I.camera} Photo<input type="file" accept="image/*" id="cap-file" hidden></label><span id="cap-file-name" class="muted small"></span></div>`;
  showSheet();
  $('#cap-text').focus();
}
export async function saveCapture() {
  const text = $('#cap-text').value.trim();
  const file = $('#cap-file').files[0];
  if (!text && !file) { closeSheet(); return; }
  let image_path = null;
  if (file) {
    const b = $('[data-act="cap-save"]'); b.disabled = true; b.textContent = 'Envoi…';
    try { image_path = await uploadImage(file); }
    catch (e) { toast(e.message || 'Envoi de la photo impossible'); b.disabled = false; b.textContent = 'Ajouter'; return; }
  }
  let title = text, body = '', url = null;
  const nl = text.indexOf('\n');
  if (nl > -1) { title = text.slice(0, nl).trim(); body = text.slice(nl + 1).trim(); }
  if (/^https?:\/\/\S+$/.test(title) && !body) { url = title; }
  if (!title) title = file ? 'Photo' : '';
  const { label, ...fields } = capPreset || {};
  saveItem(newItem({ kind: 'inbox', title, body, url, image_path, ...fields }));
  closeSheet();
  toast(fields.kind === 'task' ? 'Tâche ajoutée' : 'Ajouté à l’Inbox');
}

export function openPicker() {
  SH.mode = 'picker';
  pickSel = new Set();
  renderPicker();
  showSheet();
}
export function renderPicker() {
  const day = S.ui.day;
  const list = nextActions().filter(t => t.scheduled_date !== day).sort(sortTasks);
  sheet.innerHTML = `<div class="sheet-head"><button class="link" data-act="close">Annuler</button><span class="sheet-kind">Pour ${fmtDate(day).toLowerCase()}</span><button class="link strong" data-act="pick-save">Ajouter${pickSel.size ? ` (${pickSel.size})` : ''}</button></div>
    ${list.length ? `<div class="list">${list.map(t => `<div class="row pick ${pickSel.has(t.id) ? 'on' : ''}" data-act="pick" data-id="${t.id}">
      <span class="check ${pickSel.has(t.id) ? 'on' : ''}"></span>
      <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-meta">${t.parent_id && S.items.get(t.parent_id) ? `<span class="m-proj">${esc(S.items.get(t.parent_id).title)}</span>` : ''}${t.contexts.map(c => `<span class="m-ctx">${esc(c)}</span>`).join('')}${t.duration_min ? `<span>${fmtDur(t.duration_min)}</span>` : ''}${t.scheduled_date ? `<span>Prévu ${fmtDate(t.scheduled_date).toLowerCase()}</span>` : ''}${t.due_date ? `<span class="m-due">Échéance ${fmtDate(t.due_date).toLowerCase()}</span>` : ''}</div></div>
    </div>`).join('')}</div>` : empty('Aucune prochaine action disponible')}`;
}
