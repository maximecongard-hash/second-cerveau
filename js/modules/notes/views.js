import { esc, I, empty, chip, plain, domain, fmtAgo } from '../../core/util.js';
import { S, live, ofKind, linkedIds, itemTags } from '../../core/store.js';

// ---------------------------------------------------------------------------
// Lignes et vues du module Notes : notes, signets, épinglés
// ---------------------------------------------------------------------------
export const KINDS = ['note', 'bookmark'];
const byPin = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated_at.localeCompare(a.updated_at);
const pinMark = it => (it.pinned ? `<span class="pin-mark" aria-label="Épinglé">${I.pin}</span>` : '');
const linkMeta = it => { const n = linkedIds(it.id).length; return n ? `<span class="m-link" title="Éléments liés">${I.link}${n}</span>` : ''; };
const projMeta = it => { const p = it.parent_id && S.items.get(it.parent_id); return p && p.status !== 'trashed' ? `<span class="m-proj">${esc(p.title)}</span>` : ''; };
const tagsMeta = it => itemTags(it).map(t => `<span class="m-tag">#${esc(t)}</span>`).join('');
export const bmTitle = b => esc(b.title) || (b.url ? esc(domain(b.url)) : '<i>Sans titre</i>');

export function noteRow(n) {
  const snippet = plain(n.body).slice(0, 110);
  return `<div class="row" data-act="edit" data-id="${n.id}">
    <div class="row-icon">${I.note}</div>
    <div class="row-main"><div class="row-title">${pinMark(n)}${esc(n.title) || '<i>Sans titre</i>'}</div>
    ${snippet ? `<div class="row-snippet">${esc(snippet)}</div>` : ''}
    <div class="row-meta">${projMeta(n)}${tagsMeta(n)}${linkMeta(n)}<span>${fmtAgo(n.updated_at)}</span></div></div>
    ${n.image_path ? `<img class="thumb" data-img="${esc(n.image_path)}" alt="">` : ''}
  </div>`;
}
export function bookmarkRow(b) {
  const read = b.status === 'done';
  const snippet = plain(b.body).slice(0, 90);
  return `<div class="row bm ${read ? 'read' : ''}" data-act="edit" data-id="${b.id}">
    <div class="row-icon">${I.link}</div>
    <div class="row-main"><div class="row-title">${pinMark(b)}${bmTitle(b)}</div>
    ${snippet ? `<div class="row-snippet">${esc(snippet)}</div>` : ''}
    <div class="row-meta">${b.url && b.title ? `<span>${esc(domain(b.url))}</span>` : ''}${read ? '<span>Lu</span>' : ''}${projMeta(b)}${tagsMeta(b)}${linkMeta(b)}</div></div>
    ${b.url ? `<a class="icon-btn open-btn" data-act="open-url" href="${esc(b.url)}" target="_blank" rel="noopener" aria-label="Ouvrir le lien">${I.external}</a>` : ''}
  </div>`;
}
export const anyRow = it => (it.kind === 'bookmark' ? bookmarkRow(it) : noteRow(it));

// ---------------------------------------------------------------------------
// Listes (rafraîchies seules pendant la saisie d'une recherche)
// ---------------------------------------------------------------------------
const matches = (it, q) => (it.title + ' ' + it.body + ' ' + (it.url || '') + ' ' + itemTags(it).join(' ')).toLowerCase().includes(q);
const tagChips = (list, cur, act) => {
  const tags = [...new Set(list.flatMap(itemTags))].sort((a, b) => a.localeCompare(b, 'fr'));
  return tags.length ? `<div class="chips scroll">${tags.map(t => chip('#' + esc(t), cur === t, act, t)).join('')}</div>` : '';
};

export function notesList() {
  const q = S.ui.noteQuery.trim().toLowerCase();
  let list = ofKind('note');
  if (S.ui.noteTag) list = list.filter(n => itemTags(n).includes(S.ui.noteTag));
  if (q) list = list.filter(n => matches(n, q));
  list.sort(byPin);
  return list.length ? list.map(noteRow).join('') : empty(q || S.ui.noteTag ? 'Aucune note trouvée' : 'Aucune note', q ? '' : 'Ton second cerveau commence ici : idées, références, apprentissages.');
}
export function bookmarksList() {
  const q = S.ui.bmQuery.trim().toLowerCase();
  let list = ofKind('bookmark');
  if (S.ui.bmFilter === 'todo') list = list.filter(b => b.status !== 'done');
  if (S.ui.bmFilter === 'done') list = list.filter(b => b.status === 'done');
  if (S.ui.bmTag) list = list.filter(b => itemTags(b).includes(S.ui.bmTag));
  if (q) list = list.filter(b => matches(b, q));
  list.sort(byPin);
  if (list.length) return list.map(bookmarkRow).join('');
  return q || S.ui.bmTag ? empty('Aucun signet trouvé')
    : S.ui.bmFilter === 'todo' ? empty('Rien à lire', 'Partage une page vers Brain, puis choisis « Signet » au tri de l’Inbox.')
    : empty('Aucun signet');
}

// ---------------------------------------------------------------------------
// Vues
// ---------------------------------------------------------------------------
export const views = {};

views.notes = () => ({
  title: 'Notes',
  html: `<input id="note-q" class="search" type="search" placeholder="Rechercher dans les notes" value="${esc(S.ui.noteQuery)}" data-live="notes" autocomplete="off">
    ${tagChips(ofKind('note'), S.ui.noteTag, 'note-tag')}
    <div id="notes-list" class="list">${notesList()}</div>`,
  fab: 'note'
});

views.bookmarks = () => {
  const all = ofKind('bookmark');
  const todo = all.filter(b => b.status !== 'done').length;
  const filters = [['todo', 'À lire', todo], ['done', 'Lus', all.length - todo], ['all', 'Tous', all.length]];
  return {
    title: 'Signets',
    html: `<input id="bm-q" class="search" type="search" placeholder="Rechercher dans les signets" value="${esc(S.ui.bmQuery)}" data-live="bookmarks" autocomplete="off">
      <div class="chips scroll">${filters.map(([v, l, n]) => chip(l, S.ui.bmFilter === v, 'bm-filter', v, ` <small>${n}</small>`)).join('')}</div>
      ${tagChips(all, S.ui.bmTag, 'bm-tag')}
      <div id="bm-list" class="list">${bookmarksList()}</div>`,
    fab: 'bookmark'
  };
};

views.pinned = () => {
  const list = live().filter(i => KINDS.includes(i.kind) && i.pinned).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return {
    title: 'Épinglés',
    html: list.length ? `<div class="list">${list.map(anyRow).join('')}</div>`
      : empty('Rien d’épinglé', 'Dans une note ou un signet, touche « Épingler » pour le garder sous la main.'),
    fab: 'note'
  };
};
