import { $, esc, empty, sec } from './util.js';
import { S, newItem, saveItem, live, linked, linkedIds, link, unlink, mentionsOf, findByTitle } from './store.js';
import { ACTS, kindOwner } from './modules.js';
import { SH, sheet, showSheet, closeSheet, openEditor, renderEditor, toast } from './ui.js';

// ---------------------------------------------------------------------------
// Liens entre éléments : bloc de l'éditeur, section de page, feuille « Lier à… »
// Le cœur affiche les éléments de tous les modules via le registre, sans importer de module.
// ---------------------------------------------------------------------------
export const kindLabel = k => kindOwner(k)?.kindLabel?.[k] || k;
const titleOf = x => esc(x.title) || '<i>Sans titre</i>';
const linkable = i => !['inbox', 'area'].includes(i.kind) && kindOwner(i.kind)?.searchable?.(i) !== false;

// Bloc « Liés » + « Mentionné dans » d'un éditeur ; extra : HTML ajouté par le module (ex. « + Action liée »)
export function linksBlock(it, extra = '') {
  const ls = linked(it.id);
  const ids = new Set(ls.map(x => x.id));
  const ms = mentionsOf(it).filter(x => !ids.has(x.id));
  const row = x => `<div class="link-item"><button class="sub-item link" data-act="edit" data-id="${x.id}"><span class="link-kind">${esc(kindLabel(x.kind))}</span>${titleOf(x)}</button><button class="x" data-act="link-del" data-id="${x.id}" aria-label="Retirer le lien">×</button></div>`;
  return `<div class="sub-list"><div class="sub-title">Liés${ls.length ? ` (${ls.length})` : ''}</div>${ls.map(row).join('')}
      <button class="link small-link" data-act="link-open" data-id="${it.id}">+ Lier à…</button>${extra}</div>
    ${ms.length ? `<div class="sub-list"><div class="sub-title">Mentionné dans</div>${ms.map(x => `<button class="sub-item link" data-act="edit" data-id="${x.id}"><span class="link-kind">${esc(kindLabel(x.kind))}</span>${titleOf(x)}</button>`).join('')}</div>` : ''}`;
}

// Section « Liés » d'une page (fiche projet…), avec les lignes propres à chaque module
export const itemRow = x => (kindOwner(x.kind)?.row || (y => `<div class="row" data-act="edit" data-id="${y.id}"><div class="row-main"><div class="row-title">${titleOf(y)}</div></div></div>`))(x);
export function linkedSection(it, skip = new Set()) {
  const ls = linked(it.id).filter(x => !skip.has(x.id));
  return sec('Liés', ls.map(itemRow).join('') || '<div class="muted pad">Aucun lien.</div>', `<button class="link" data-act="link-open" data-id="${it.id}">+ Lier</button>`);
}

// ---------------------------------------------------------------------------
// Feuille « Lier à… »
// ---------------------------------------------------------------------------
function linkResults(q) {
  const have = new Set(linkedIds(SH.linkFrom));
  q = q.trim().toLowerCase();
  let res = live().filter(i => i.id !== SH.linkFrom && !have.has(i.id) && linkable(i));
  if (q) res = res.filter(i => (i.title + ' ' + i.body + ' ' + (i.url || '')).toLowerCase().includes(q));
  res = res.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 40);
  return res.length ? res.map(i => `<button class="row link-pick" data-act="link-add" data-id="${i.id}"><div class="row-main"><div class="row-title">${titleOf(i)}</div>
      <div class="row-meta"><span>${esc(kindLabel(i.kind))}</span>${i.status === 'done' ? '<span>Terminé</span>' : ''}${i.status === 'someday' ? '<span>Un jour</span>' : ''}</div></div></button>`).join('')
    : empty(q ? 'Aucun résultat' : 'Rien à lier pour l’instant');
}
export function openLinkPicker(from) {
  SH.linkBack = SH.mode === 'editor';
  SH.mode = 'link';
  SH.linkFrom = from;
  sheet.innerHTML = `<div class="sheet-head"><button class="link" data-act="link-back">${SH.linkBack ? 'Retour' : 'Annuler'}</button><span class="sheet-kind">Lier à…</span><span></span></div>
    <input id="link-q" class="search" type="search" placeholder="Tâche, projet, note…" data-live="link" autocomplete="off">
    <div id="link-results" class="list">${linkResults('')}</div>`;
  showSheet();
  sheet.scrollTop = 0;
  $('#link-q').focus();
}
export function liveLinkSearch(q) {
  const box = $('#link-results');
  if (box) box.innerHTML = linkResults(q);
}
function leavePicker() {
  if (SH.linkBack) openEditor(SH.linkFrom);
  else closeSheet();
}

Object.assign(ACTS, {
  'link-open': el => openLinkPicker(el.dataset.id),
  'link-back': () => leavePicker(),
  'link-add': el => {
    link(SH.linkFrom, el.dataset.id);
    toast('Lien ajouté');
    leavePicker();
  },
  'link-del': el => {
    const from = SH.editingId, to = el.dataset.id;
    unlink(from, to);
    renderEditor();
    toast('Lien retiré', () => { link(from, to); if (SH.editingId === from) renderEditor(); });
  },
  // [[Titre]] : ouvre l'élément de ce titre, sinon crée la note
  wiki: el => {
    const t = el.dataset.title;
    const hit = findByTitle(t);
    if (hit) { openEditor(hit.id); return; }
    if (!kindOwner('note')) { toast(`Aucun élément « ${t} »`); return; }
    openEditor(saveItem(newItem({ kind: 'note', title: t })).id);
  },
  pin: el => {
    const it = S.items.get(el.dataset.id);
    if (!it) return;
    it.pinned = !it.pinned;
    saveItem(it);
    if (SH.mode === 'editor') renderEditor();
  }
});
