import { TEXT_FIELDS } from './state.js';
import { patch } from './store.js';
import { sync, setSyncState } from './sync.js';
import { MODULES, ACTS, FORMS } from './modules.js';
import { app, render, flushPendingRender, SH, closeSheet, openEditor, setField, openMenu, openSide, closeSide, runUndo } from './ui.js';
import { liveSearch } from './views.js';

// ---------------------------------------------------------------------------
// Actions communes (les modules ajoutent les leurs via registerModule)
// ---------------------------------------------------------------------------
Object.assign(ACTS, {
  close: () => closeSheet(),
  'close-go': (el, e) => { e.preventDefault(); const href = el.getAttribute('href'); closeSheet(); location.hash = href; },
  menu: () => openMenu(),
  undo: () => runUndo(),
  edit: el => openEditor(el.dataset.id),
  set: el => setField(SH.editingId, el.dataset.f, el.dataset.v, true),
  'side-open': () => openSide(),
  'side-close': () => closeSide()
});

document.addEventListener('click', e => {
  if (e.target.closest('.side a')) closeSide();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTS[el.dataset.act];
  if (!fn) return;
  if (el.tagName !== 'A' || el.dataset.act === 'close-go') e.preventDefault();
  fn(el, e);
});
document.addEventListener('submit', e => {
  const fn = FORMS[e.target.dataset.form];
  if (!fn) return;
  e.preventDefault();
  fn(e.target);
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.live === 'search') { liveSearch(t.value); return; }
  if (MODULES.some(m => m.onInput?.(t))) return;
  if (t.dataset.inline && t.dataset.id) { patch(t.dataset.id, { [t.dataset.inline]: t.value }, { render: false }); return; }
  if (SH.mode === 'editor' && t.dataset.f && TEXT_FIELDS.has(t.dataset.f)) setField(SH.editingId, t.dataset.f, t.value, false);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (MODULES.some(m => m.onChange?.(t))) return;
  if (SH.mode === 'editor' && t.dataset.f && !TEXT_FIELDS.has(t.dataset.f)) setField(SH.editingId, t.dataset.f, t.value, true);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (SH.mode) closeSheet(); else closeSide(); }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && SH.onSubmit) SH.onSubmit();
});
app.addEventListener('focusout', flushPendingRender);
window.addEventListener('hashchange', () => { closeSide(); if (SH.mode) closeSheet(); else render(); });
window.addEventListener('online', () => { setSyncState(); sync(); });
window.addEventListener('offline', setSyncState);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    MODULES.forEach(m => m.onResume?.());
    sync();
  }
});
setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60000);
