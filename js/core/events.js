import { TEXT_FIELDS } from './state.js';
import { S, patch, persistNow } from './store.js';
import { sync, setSyncState } from './sync.js';
import { MODULES, ACTS, FORMS } from './modules.js';
import { app, render, flushPendingRender, SH, closeSheet, openEditor, renderEditor, setField, openMenu, openSide, closeSide, runUndo, activeModule, toast } from './ui.js';
import { liveSearch } from './views.js';
import { liveLinkSearch } from './links.js';

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
  // bouton + : géré par le module de la vue affichée
  fab: el => activeModule().fab?.(el.dataset.v),
  trash: el => {
    const id = el.dataset.id;
    const prev = S.items.get(id)?.status;
    if (!prev) return;
    if (SH.draftId === id) SH.draftId = null;
    patch(id, { status: 'trashed' });
    closeSheet();
    toast('Supprimé', () => patch(id, { status: prev }));
  },
  // lien externe dans une ligne cliquable : laisse le navigateur l'ouvrir
  'open-url': () => {},
  'side-open': () => openSide(),
  'side-close': () => closeSide()
});

// Appui long sur une ligne [data-long] : ouvre la fiche (data-id). Le toucher bref garde l'action de la ligne.
let longTimer = 0, longStart = null, longFired = 0;
const longCancel = () => { clearTimeout(longTimer); longTimer = 0; };
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-long]');
  if (!el || e.target.closest('.icon-btn') || (e.pointerType === 'mouse' && e.button !== 0)) return;
  longStart = [e.clientX, e.clientY];
  longCancel();
  longTimer = setTimeout(() => {
    longTimer = 0;
    longFired = Date.now();
    navigator.vibrate?.(15);
    openEditor(el.dataset.id);
  }, 500);
});
document.addEventListener('pointermove', e => { if (longTimer && Math.hypot(e.clientX - longStart[0], e.clientY - longStart[1]) > 8) longCancel(); });
['pointerup', 'pointercancel', 'scroll'].forEach(t => document.addEventListener(t, longCancel, { capture: true, passive: true }));
document.addEventListener('contextmenu', e => { if (e.target.closest('[data-long]')) e.preventDefault(); });
// le relâchement qui suit un appui long ne doit pas déclencher l'action de la ligne
document.addEventListener('click', e => { if (Date.now() - longFired < 600) { e.stopPropagation(); e.preventDefault(); } }, true);

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
  if (t.dataset.live === 'link') { liveLinkSearch(t.value); return; }
  if (MODULES.some(m => m.onInput?.(t))) return;
  if (t.dataset.inline && t.dataset.id) { patch(t.dataset.id, { [t.dataset.inline]: t.value }, { render: false }); return; }
  if (SH.mode === 'editor' && t.dataset.f && TEXT_FIELDS.has(t.dataset.f)) setField(SH.editingId, t.dataset.f, t.value, false);
});
// Sur iOS, un sélecteur date / heure envoie « change » encore ouvert : redessiner l'éditeur le fermerait.
// On enregistre tout de suite et on redessine à la sortie du champ.
const isPicker = t => /^(date|time|datetime-local)$/.test(t.type);
let pickerDirty = false;
document.addEventListener('change', e => {
  const t = e.target;
  if (MODULES.some(m => m.onChange?.(t))) return;
  if (SH.mode !== 'editor' || !t.dataset.f || TEXT_FIELDS.has(t.dataset.f)) return;
  const wait = isPicker(t) && document.activeElement === t;
  setField(SH.editingId, t.dataset.f, t.value, !wait);
  if (wait) pickerDirty = true;
});
document.addEventListener('focusout', e => {
  // passage direct à un autre sélecteur : attendre qu'il se ferme aussi
  if (!pickerDirty || !isPicker(e.target) || (e.relatedTarget && isPicker(e.relatedTarget))) return;
  pickerDirty = false;
  if (SH.mode === 'editor') setTimeout(renderEditor, 0);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (SH.mode) closeSheet(); else closeSide(); }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && SH.onSubmit) SH.onSubmit();
});
app.addEventListener('focusout', flushPendingRender);
window.addEventListener('hashchange', () => { if (openFromHash()) return; openSettingsGroup(); closeSide(); if (SH.mode) closeSheet(); else render(); });
// #/settings/<groupe> ouvre directement ce groupe de Réglages
export function openSettingsGroup() {
  const m = location.hash.match(/^#\/settings\/([\w-]+)/);
  if (!m) return;
  S.ui.fold = m[1];
  setTimeout(() => document.querySelector('.fold[open]')?.scrollIntoView({ block: 'start' }), 100); // une fois redessiné
}
// Lien d'une notification : #/open/<id> ouvre l'élément par-dessus l'écran d'accueil
export function openFromHash() {
  const m = location.hash.match(/^#\/open\/([\w-]+)/);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + location.search + '#/');
  if (SH.mode) closeSheet();
  render();
  if (S.items.has(m[1])) openEditor(m[1]);
  return true;
}
// Notification touchée alors que l'app était déjà ouverte (message du service worker)
navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.open) location.hash = '#/open/' + e.data.open; });
window.addEventListener('online', () => { setSyncState(); sync(); });
window.addEventListener('offline', setSyncState);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') MODULES.forEach(m => m.onResume?.());
  // au passage en arrière-plan, iOS peut couper l'app à tout moment : on écrit tout de suite
  else persistNow();
  sync();
});
window.addEventListener('pagehide', persistNow);
setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60000);
