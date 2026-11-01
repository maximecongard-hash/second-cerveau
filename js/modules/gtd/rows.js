import { esc, I, today, fmtDate, fmtDur, plural } from '../../core/util.js';
import { S, meId, ofKindAll, linkedIds } from '../../core/store.js';
import { shareMeta, firstName } from '../../core/share.js';
import { hasNextAction, spentSec, fmtClock } from './model.js';

// ---------------------------------------------------------------------------
// Lignes de liste GTD
// ---------------------------------------------------------------------------
export function taskRow(t, o = {}) {
  const done = t.status === 'done';
  const meta = [];
  const p = t.parent_id && S.items.get(t.parent_id);
  if (p && p.status !== 'trashed' && !o.noProject) meta.push(`<span class="m-proj">${esc(p.title)}</span>`);
  if (t.status === 'waiting') meta.push(`<span class="m-wait">Attend : ${esc(t.waiting_for || '?')}</span>`);
  for (const c of t.contexts || []) meta.push(`<span class="m-ctx">${esc(c)}</span>`);
  if (o.showTime && t.scheduled_time) meta.push(`<span>${t.scheduled_time}</span>`);
  if (o.showSched && t.scheduled_date) meta.push(`<span class="${t.scheduled_date < today() && !done ? 'late' : ''}">Prévu ${fmtDate(t.scheduled_date).toLowerCase()}</span>`);
  if (t.duration_min) meta.push(`<span>${fmtDur(t.duration_min)}</span>`);
  if (t.timer_started_at) meta.push(`<span class="m-timer" data-timer="${t.id}">${fmtClock(spentSec(t))}</span>`);
  else if (t.spent_sec > 0) meta.push(`<span class="m-timer paused">${fmtClock(t.spent_sec)}</span>`);
  if (t.due_date) meta.push(`<span class="m-due ${t.due_date <= today() && !done ? 'late' : ''}">Échéance ${fmtDate(t.due_date).toLowerCase()}</span>`);
  if (t.recurrence) meta.push('<span>↻</span>');
  if (t.remind_at && !done && t.remind_at > new Date().toISOString()) meta.push(`<span class="m-bell" title="Rappel">${I.bell}</span>`);
  if (t.image_path) meta.push('<span>Photo</span>');
  if (done && t.completed_by && t.completed_by !== meId()) meta.push(`<span class="m-by">Terminé par ${esc(firstName(t.completed_by))}</span>`);
  const sm = shareMeta(t);
  if (sm) meta.push(sm);
  const lm = linkMeta(t);
  if (lm) meta.push(lm);
  return `<div class="row task ${done ? 'done' : ''}" data-act="edit" data-id="${t.id}">
    <button class="check" data-act="toggle" data-id="${t.id}" aria-label="${done ? 'Rouvrir' : 'Terminer'}"></button>
    <div class="row-main"><div class="row-title"><span class="rt">${esc(t.title) || '<i>Sans titre</i>'}</span></div>${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}</div>
    ${o.extra || ''}${done ? '' : timerBtn(t)}
  </div>`;
}
const timerBtn = t => `<button class="timer-btn ${t.timer_started_at ? 'on' : ''}" data-act="timer-toggle" data-id="${t.id}" aria-label="${t.timer_started_at ? 'Pause du chrono' : 'Lancer le chrono'}">${t.timer_started_at ? I.pause : I.play}</button>`;
const linkMeta = it => { const n = linkedIds(it.id).length; return n ? `<span class="m-link" title="Éléments liés">${I.link}${n}</span>` : ''; };
export const starBtn = (t, day) => `<button class="star ${t.focus && t.scheduled_date === day ? 'on' : ''}" data-act="focus" data-id="${t.id}" aria-label="Top 3">${I.star}</button>`;
export function projectRow(p) {
  const n = ofKindAll('task').filter(t => t.parent_id === p.id && (t.status === 'active' || t.status === 'waiting')).length;
  const warn = p.status === 'active' && !hasNextAction(p);
  const toReview = p.review_date && p.review_date <= today() && p.status !== 'done';
  return `<a class="row" href="#/project/${p.id}">
    <div class="row-icon proj ${p.status}">${I.folder}</div>
    <div class="row-main"><div class="row-title">${esc(p.title) || '<i>Sans titre</i>'}</div>
    <div class="row-meta"><span>${plural(n, 'action', 'actions')}</span>${shareMeta(p)}${p.due_date ? `<span class="m-due ${p.due_date <= today() ? 'late' : ''}">Échéance ${fmtDate(p.due_date).toLowerCase()}</span>` : ''}${warn ? '<span class="warn">Pas de prochaine action</span>' : ''}${toReview ? '<span class="warn">À revoir</span>' : ''}</div>
    ${p.outcome ? `<div class="row-snippet">${esc(p.outcome)}</div>` : ''}</div>
    <span class="chev">${I.right}</span>
  </a>`;
}
export function anyRow(it) {
  if (it.kind === 'task') return taskRow(it, { showSched: true });
  if (it.kind === 'project') return projectRow(it);
  const label = { inbox: 'Inbox', area: 'Domaine' }[it.kind];
  return `<div class="row" data-act="edit" data-id="${it.id}"><div class="row-main"><div class="row-title">${esc(it.title) || '<i>Sans titre</i>'}</div><div class="row-meta"><span>${label}</span></div></div></div>`;
}
export const planBtn = t => (t.scheduled_date === S.ui.day ? '' : `<button class="plan-btn" data-act="plan" data-id="${t.id}" aria-label="Prévoir aujourd'hui">${I.sun}</button>`);

