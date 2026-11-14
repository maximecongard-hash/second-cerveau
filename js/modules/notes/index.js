import { $, I } from '../../core/util.js';
import { S, newItem, saveItem, patch, findByTitle } from '../../core/store.js';
import { registerModule } from '../../core/modules.js';
import { SH, render, renderEditor, toast } from '../../core/ui.js';
import { hydrateImages } from '../../core/images.js';
import { KINDS, views, anyRow, notesList, bookmarksList } from './views.js';
import { editorHTML, setField, createAndEdit } from './editor.js';

// ---------------------------------------------------------------------------
// Module « Notes » : notes Markdown, signets à lire, éléments épinglés
// Les liens avec les tâches et projets passent par le cœur (core/links.js).
// ---------------------------------------------------------------------------
const acts = {
  'note-kind': el => {
    const it = S.items.get(SH.editingId);
    const kind = el.dataset.v;
    if (!it || it.kind === kind) return;
    // un signet « lu » redevient une note active, et inversement
    patch(it.id, { kind, status: 'active', completed_at: null });
    renderEditor();
  },
  'note-preview': el => { S.ui.preview = el.dataset.v === '1'; renderEditor(); },
  'note-tag': el => { S.ui.noteTag = S.ui.noteTag === el.dataset.v ? null : el.dataset.v; render(); },
  'bm-tag': el => { S.ui.bmTag = S.ui.bmTag === el.dataset.v ? null : el.dataset.v; render(); },
  'bm-filter': el => { S.ui.bmFilter = el.dataset.v; render(); }
};

const forms = {
  // prochaine action liée à la note ou au signet (et rattachée à son projet)
  'note-task': f => {
    const input = f.querySelector('input'), v = input.value.trim();
    const it = S.items.get(f.dataset.id);
    if (!v || !it) return;
    const p = it.parent_id && S.items.get(it.parent_id);
    saveItem(newItem({ kind: 'task', title: v, links: [it.id], parent_id: p?.kind === 'project' ? p.id : null }));
    input.value = '';
    toast('Action ajoutée');
    if (SH.mode === 'editor') { renderEditor(); $('#ed-note-task')?.focus(); }
  }
};

function onInput(t) {
  const live = t.dataset.live;
  if (live !== 'notes' && live !== 'bookmarks') return false;
  const box = $(live === 'notes' ? '#notes-list' : '#bm-list');
  if (live === 'notes') { S.ui.noteQuery = t.value; box.innerHTML = notesList(); }
  else { S.ui.bmQuery = t.value; box.innerHTML = bookmarksList(); }
  hydrateImages(box);
  return true;
}

function fab(v) {
  if (v === 'bookmark') createAndEdit({ kind: 'bookmark', tags: S.ui.bmTag ? [S.ui.bmTag] : [] });
  else createAndEdit({ kind: 'note', tags: S.ui.noteTag ? [S.ui.noteTag] : [] });
}

registerModule({
  id: 'notes',
  label: 'Notes',
  icon: I.note,
  description: 'Notes en Markdown, signets à lire, éléments épinglés. Reliés aux tâches et aux projets.',
  defaultOn: true,
  home: 'notes',
  tabs: [
    ['notes', 'Notes', I.note],
    ['bookmarks', 'Signets', I.link],
    ['pinned', 'Épinglés', I.pin]
  ],
  kinds: KINDS,
  kindLabel: { note: 'Note', bookmark: 'Signet' },
  views, acts, forms, fab,
  ui: { noteTag: null, noteQuery: '', preview: false, bmFilter: 'todo', bmTag: null, bmQuery: '' },
  editor: editorHTML,
  setField,
  row: anyRow,
  searchable: () => true,
  onInput
});
