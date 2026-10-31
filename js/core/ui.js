import { $, esc, I, iconChoice, logo } from './util.js';
import { S, patch } from './store.js';
import { syncClass, syncLabel } from './sync.js';
import { hydrateImages } from './images.js';
import { VIEWS, enabledModules, viewOwner, kindOwner, getModule, isEnabled } from './modules.js';
import { viewLogin } from './views.js';

// ---------------------------------------------------------------------------
// Routage : #/vue/argument. Les vues GTD gardent leurs adresses d'origine.
// ---------------------------------------------------------------------------
export const app = $('#app');
export function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const owner = viewOwner(name);
  if (VIEWS[name] && (!owner || isEnabled(owner))) return { name, arg };
  return { name: enabledModules()[0]?.home || 'settings', arg: undefined };
}
// Module affiché : celui de la vue, sinon le dernier ouvert (pour Recherche, Réglages…)
export function activeModule(r = route()) {
  const owner = viewOwner(r.name);
  if (owner) return owner;
  const last = getModule(S.ui.mod);
  return last && isEnabled(last) ? last : enabledModules()[0];
}

// ---------------------------------------------------------------------------
// Rendu principal
// ---------------------------------------------------------------------------
let renderQueued = false, pendingSyncRender = false, lastRouteKey = '';
export function queueRender(fromSync = false) {
  if (fromSync) {
    const a = document.activeElement;
    if (a && app.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { pendingSyncRender = true; return; }
  }
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
export function flushPendingRender() {
  if (pendingSyncRender) { pendingSyncRender = false; setTimeout(() => queueRender(true), 50); }
}

const CORE_LINKS = [['search', 'Recherche', I.search], ['modules', 'Modules', I.grid], ['settings', 'Réglages', I.sliders]];
const badgeHtml = (n, cls) => (n ? `<b class="${cls}">${n}</b>` : '');

function sidebar(r, mod) {
  const mods = enabledModules().map(m => {
    const on = m === mod && !!viewOwner(r.name);
    const tab = m.tabOf?.[r.name] || r.name;
    const sub = m === mod && m.tabs.length > 1
      ? `<div class="side-sub">${m.tabs.map(([k, l, ic, badge]) => `<a href="#/${k}" class="${on && tab === k ? 'on' : ''}">${ic}<span>${l}</span>${badgeHtml(badge?.(), 'side-badge')}</a>`).join('')}</div>`
      : '';
    return `<a href="#/${m.home}" class="side-mod ${on ? 'on' : ''}">${m.icon}<span>${esc(m.label)}</span>${m === mod ? '' : badgeHtml(m.badge?.(), 'side-badge')}</a>${sub}`;
  }).join('');
  const core = CORE_LINKS.map(([k, l, ic]) => `<a href="#/${k}" class="side-mod ${r.name === k ? 'on' : ''}">${ic}<span>${l}</span></a>`).join('');
  return `<aside class="side" aria-label="Thèmes">
      <div class="side-head"><img src="${iconChoice().touch}" alt=""><b>${logo()}</b></div>
      <div class="side-label">Thèmes</div>
      <nav class="side-nav">${mods}</nav>
      <nav class="side-nav side-foot">${core}</nav>
    </aside>
    <div class="side-scrim" data-act="side-close"></div>`;
}

export function render() {
  if (!S.user) { app.innerHTML = viewLogin(); return; }
  const r = route();
  const mod = activeModule(r);
  if (viewOwner(r.name)) S.ui.mod = mod.id;
  const key = r.name + '/' + (r.arg || '');
  const v = VIEWS[r.name](r.arg);
  const keep = key === lastRouteKey ? window.scrollY : 0;
  const focusId = document.activeElement && app.contains(document.activeElement) ? document.activeElement.id : null;
  const tabs = viewOwner(r.name) && mod.tabs.length > 1 ? mod.tabs : [];
  const active = mod.tabOf?.[r.name] || r.name;
  app.innerHTML = `${sidebar(r, mod)}
    <div class="page ${tabs.length ? '' : 'no-tabs'}">
      <header class="top"><button class="icon-btn side-btn" data-act="side-open" aria-label="Thèmes">${I.burger}</button><h1>${esc(v.title)}</h1><div class="top-actions">
        <span class="sync ${syncClass()}" title="${esc(syncLabel())}"></span>
        <a class="icon-btn" href="#/search" aria-label="Rechercher">${I.search}</a>
        <button class="icon-btn" data-act="menu" aria-label="Menu">${I.menu}</button></div></header>
      <main id="main">${v.html}</main>
      ${v.fab ? `<button class="fab" data-act="fab" data-v="${esc(v.fab)}" aria-label="Ajouter">${I.plus}</button>` : ''}
      ${tabs.length ? `<nav class="tabs">${tabs.map(([k, l, ic, badge]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}">${ic}<span>${l}</span>${badgeHtml(badge?.(), 'badge')}</a>`).join('')}</nav>` : ''}
    </div>`;
  hydrateImages(app);
  window.scrollTo(0, keep);
  lastRouteKey = key;
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus({ preventScroll: true }); }
}

// Tiroir des thèmes sur mobile (sur grand écran la barre est toujours visible)
export const openSide = () => document.body.classList.add('side-open');
export const closeSide = () => document.body.classList.remove('side-open');

// ---------------------------------------------------------------------------
// Feuilles (éditeur, menu, et feuilles propres aux modules)
// ---------------------------------------------------------------------------
// mode : 'editor' | 'menu' | 'link' | autre valeur choisie par un module
// onSubmit : action lancée par Cmd/Ctrl + Entrée
// linkFrom, linkBack : feuille « Lier à… » (élément d'origine, retour à son éditeur)
export const SH = { mode: null, editingId: null, draftId: null, onSubmit: null, linkFrom: null, linkBack: false };
export const sheet = $('#sheet');
const sheetWrap = $('#sheet-wrap');
let sheetGen = 0;
export function showSheet() {
  sheetGen++;
  sheetWrap.hidden = false;
  requestAnimationFrame(() => sheetWrap.classList.add('open'));
  document.body.classList.add('noscroll');
}
export function closeSheet() {
  if ((SH.mode === 'editor' || SH.mode === 'link') && SH.draftId) {
    const d = S.items.get(SH.draftId);
    if (d && !d.title.trim() && !d.body.trim() && !d.image_path && !d.url) patch(d.id, { status: 'trashed' }, { render: false });
  }
  SH.draftId = null;
  const gen = ++sheetGen;
  sheetWrap.classList.remove('open');
  document.body.classList.remove('noscroll');
  setTimeout(() => { if (gen === sheetGen) { sheetWrap.hidden = true; sheet.innerHTML = ''; } }, 220);
  SH.mode = null; SH.editingId = null; SH.onSubmit = null;
  queueRender();
}

// L'éditeur est fourni par le module qui gère le type de l'élément
export function renderEditor() {
  const it = S.items.get(SH.editingId);
  const m = it && kindOwner(it.kind);
  if (!m) { closeSheet(); return; }
  const st = sheet.scrollTop;
  sheet.innerHTML = m.editor(it);
  sheet.scrollTop = st;
  hydrateImages(sheet);
}
export function openEditor(id, { focus } = {}) {
  SH.mode = 'editor';
  SH.editingId = id;
  renderEditor();
  showSheet();
  const it = S.items.get(id);
  const f = focus ? document.getElementById('f-' + focus) : (!it?.title ? document.getElementById('f-title') : null);
  if (f) f.focus();
}
export function setField(id, f, v, rerender) {
  const it = S.items.get(id);
  if (!it) return;
  kindOwner(it.kind)?.setField(id, f, v);
  if (rerender) renderEditor();
}

export function openMenu() {
  SH.mode = 'menu';
  const mod = activeModule();
  const item = (href, label, count = '') => `<a class="row" href="${href}" data-act="close-go"><div class="row-main"><div class="row-title">${label}</div></div>${count !== '' ? `<span class="muted">${count}</span>` : ''}<span class="chev">${I.right}</span></a>`;
  const own = mod?.menu?.() || [];
  sheet.innerHTML = `<div class="sheet-head"><span></span><span class="sheet-kind">${esc(mod?.label || 'Menu')}</span><button class="link strong" data-act="close">Fermer</button></div>
    <div class="list">${own.map(([h, l, c]) => item(h, l, c)).join('')}${CORE_LINKS.map(([k, l]) => item('#/' + k, l)).join('')}</div>`;
  showSheet();
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = null, lastUndo = null;
export function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-act="undo">Annuler</button>' : ''}`;
  t.hidden = false;
  lastUndo = undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; lastUndo = null; }, 4000);
}
export function runUndo() {
  lastUndo?.();
  lastUndo = null;
  $('#toast').hidden = true;
}
