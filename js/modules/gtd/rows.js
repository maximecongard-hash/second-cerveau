import { esc, I, today, fmtDate, fmtDur, fmtAgo, plain, plural } from '../../core/util.js';
import { S, ofKind } from '../../core/store.js';
import { itemTags, hasNextAction } from './model.js';

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
  if (t.due_date) meta.push(`<span class="m-due ${t.due_date <= today() && !done ? 'late' : ''}">Échéance ${fmtDate(t.due_date).toLowerCase()}</span>`);
  if (t.recurrence) meta.push('<span>↻</span>');
  if (t.image_path) meta.push('<span>Photo</span>');
  return `<div class="row task ${done ? 'done' : ''}" data-act="edit" data-id="${t.id}">
    <button class="check" data-act="toggle" data-id="${t.id}" aria-label="${done ? 'Rouvrir' : 'Terminer'}"></button>
    <div class="row-main"><div class="row-title"><span class="rt">${esc(t.title) || '<i>Sans titre</i>'}</span></div>${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}</div>
    ${o.extra || ''}
  </div>`;
}
export function noteRow(n) {
  const snippet = plain(n.body).slice(0, 110);
  const tags = itemTags(n);
  const p = n.parent_id && S.items.get(n.parent_id);
  return `<div class="row" data-act="edit" data-id="${n.id}">
    <div class="row-icon">${I.note}</div>
    <div class="row-main"><div class="row-title">${esc(n.title) || '<i>Sans titre</i>'}</div>
    ${snippet ? `<div class="row-snippet">${esc(snippet)}</div>` : ''}
    <div class="row-meta">${p ? `<span class="m-proj">${esc(p.title)}</span>` : ''}${tags.map(t => `<span class="m-tag">#${esc(t)}</span>`).join('')}<span>${fmtAgo(n.updated_at)}</span></div></div>
    ${n.image_path ? `<img class="thumb" data-img="${esc(n.image_path)}" alt="">` : ''}
  </div>`;
}
export const starBtn = (t, day) => `<button class="star ${t.focus && t.scheduled_date === day ? 'on' : ''}" data-act="focus" data-id="${t.id}" aria-label="Top 3">${I.star}</button>`;
export function projectRow(p) {
  const n = ofKind('task').filter(t => t.parent_id === p.id && (t.status === 'active' || t.status === 'waiting')).length;
  const warn = p.status === 'active' && !hasNextAction(p);
  const toReview = p.review_date && p.review_date <= today() && p.status !== 'done';
  return `<a class="row" href="#/project/${p.id}">
    <div class="row-icon proj ${p.status}">${I.folder}</div>
    <div class="row-main"><div class="row-title">${esc(p.title) || '<i>Sans titre</i>'}</div>
    <div class="row-meta"><span>${plural(n, 'action', 'actions')}</span>${p.due_date ? `<span class="m-due ${p.due_date <= today() ? 'late' : ''}">Échéance ${fmtDate(p.due_date).toLowerCase()}</span>` : ''}${warn ? '<span class="warn">Pas de prochaine action</span>' : ''}${toReview ? '<span class="warn">À revoir</span>' : ''}</div>
    ${p.outcome ? `<div class="row-snippet">${esc(p.outcome)}</div>` : ''}</div>
    <span class="chev">${I.right}</span>
  </a>`;
}
export function anyRow(it) {
  if (it.kind === 'task') return taskRow(it, { showSched: true });
  if (it.kind === 'note') return noteRow(it);
  if (it.kind === 'project') return projectRow(it);
  const label = { inbox: 'Inbox', area: 'Domaine' }[it.kind];
  return `<div class="row" data-act="edit" data-id="${it.id}"><div class="row-main"><div class="row-title">${esc(it.title) || '<i>Sans titre</i>'}</div><div class="row-meta"><span>${label}</span></div></div></div>`;
}
export const planBtn = t => (t.scheduled_date === S.ui.day ? '' : `<button class="plan-btn" data-act="plan" data-id="${t.id}" aria-label="Prévoir aujourd'hui">${I.sun}</button>`);

