import { esc, I, fRow, seg, sel, md, domain, nowIso } from '../../core/util.js';
import { S, NULLABLE, newItem, saveItem, patch, ofKind, byTitle } from '../../core/store.js';
import { kindOwner } from '../../core/modules.js';
import { SH, openEditor } from '../../core/ui.js';
import { linksBlock } from '../../core/links.js';
import { shareBlock } from '../../core/share.js';

// ---------------------------------------------------------------------------
// Éditeur des notes et des signets
// ---------------------------------------------------------------------------
function projectOptions(cur) {
  const ps = ofKind('project').filter(p => ['active', 'someday', 'clarify'].includes(p.status) || p.id === cur).sort(byTitle);
  return [['', 'Aucun'], ...ps.map(p => [p.id, p.title + (p.status === 'someday' ? ' (un jour)' : '')])];
}
const linkCard = url => `<a class="link-card" href="${esc(url)}" target="_blank" rel="noopener">${I.external}<span>${esc(domain(url))}</span></a>`;

export function editorHTML(it) {
  const isBm = it.kind === 'bookmark';
  const head = `<div class="sheet-head"><button class="link strong" data-act="close">OK</button>
    <div class="seg small">${[['note', 'Note'], ['bookmark', 'Signet']].map(([v, l]) => `<button class="${it.kind === v ? 'on' : ''}" data-act="note-kind" data-v="${v}">${l}</button>`).join('')}</div>
    <button class="link danger" data-act="trash" data-id="${it.id}">Supprimer</button></div>`;
  const title = `<input class="title-input" data-f="title" id="f-title" value="${esc(it.title)}" placeholder="${isBm ? 'Titre (facultatif)' : 'Titre de la note'}" autocomplete="off">`;
  const urlF = fRow('Lien', `<input type="url" data-f="url" id="f-url" value="${esc(it.url || '')}" placeholder="https://" autocomplete="off">`);
  const common = `${fRow('Projet', sel('parent_id', it.parent_id, projectOptions(it.parent_id)))}
    ${fRow('Tags', `<input data-f="tags" value="${esc((it.tags || []).join(', '))}" placeholder="séparés par des virgules" autocomplete="off">`)}
    ${fRow('Épingle', `<button class="chip ${it.pinned ? 'on' : ''}" data-act="pin" data-id="${it.id}">${it.pinned ? 'Épinglé' : 'Épingler en haut'}</button>`)}`;
  const linkTask = kindOwner('task') ? `<form class="inline-add" data-form="note-task" data-id="${it.id}"><input id="ed-note-task" placeholder="+ Action liée" enterkeyhint="done" autocomplete="off"></form>` : '';
  const img = it.image_path ? `<img class="cap-img" data-img="${esc(it.image_path)}" alt="">` : '';

  if (isBm) {
    return head + title +
      `<div class="fields">${urlF}</div>
      ${it.url ? linkCard(it.url) : ''}
      <textarea class="notes-input" data-f="body" rows="4" placeholder="Pourquoi le garder, extrait, résumé…">${esc(it.body)}</textarea>${img}
      <div class="fields">
        ${fRow('Statut', seg('status', it.status === 'done' ? 'done' : 'active', [['active', 'À lire'], ['done', 'Lu']]))}
        ${common}
      </div>
      ${linksBlock(it, linkTask)}
      ${shareBlock(it)}`;
  }
  return head + title +
    `<div class="seg small mode">${[['0', 'Écrire'], ['1', 'Aperçu']].map(([v, l]) => `<button class="${(S.ui.preview ? '1' : '0') === v ? 'on' : ''}" data-act="note-preview" data-v="${v}">${l}</button>`).join('')}</div>
    ${S.ui.preview ? `<div class="md note-preview">${md(it.body) || '<p class="muted">Vide</p>'}</div>`
      : `<textarea class="notes-input big" data-f="body" rows="12" placeholder="Écris librement… [[Titre]] pour citer une note, une tâche ou un projet, #tag pour classer">${esc(it.body)}</textarea>`}
    ${img}${it.url ? linkCard(it.url) : ''}
    <div class="fields">${common}${urlF}</div>
    ${linksBlock(it, linkTask)}
    ${shareBlock(it)}`;
}

// Le cœur relance l'éditeur après coup (setField de core/ui.js)
export function setField(id, f, v) {
  const it = S.items.get(id);
  if (!it) return;
  let val = v;
  if (f === 'tags') val = v.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
  else if (NULLABLE.has(f)) val = v || null;
  const p = { [f]: val };
  if (f === 'status') p.completed_at = val === 'done' ? (it.completed_at || nowIso()) : null;
  patch(id, p);
}

export function createAndEdit(fields) {
  const it = saveItem(newItem(fields));
  SH.draftId = it.id;
  openEditor(it.id, { focus: fields.kind === 'bookmark' ? 'url' : 'title' });
}
