import { DEMO, sb } from './config.js';
import { empty } from './util.js';
import { S, restore, resetLocal, persist } from './store.js';
import { sync } from './sync.js';
import { MODULES } from './modules.js';
import { app, render, queueRender } from './ui.js';

// ---------------------------------------------------------------------------
// Démarrage (appelé une fois tous les modules enregistrés)
// ---------------------------------------------------------------------------
export async function init() {
  restore();
  registerSW();
  if (DEMO) {
    S.user = { id: 'demo', email: 'Mode démo (données locales)' };
    if (!S.items.size) MODULES.forEach(m => m.seedDemo?.());
    MODULES.forEach(m => m.afterSync?.());
    persist();
    render();
    return;
  }
  if (!sb) { app.innerHTML = empty('Chargement impossible', 'Vérifie ta connexion puis relance l’app.'); return; }
  const { data: { session } } = await sb.auth.getSession();
  setUser(session?.user || null);
  sb.auth.onAuthStateChange((_ev, s) => setUser(s?.user || null));
  render();
}
// Service worker : quand une nouvelle version prend la main, on recharge une fois pour l'afficher
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }))
    .catch(() => {});
}
function setUser(u) {
  const prev = S.user?.id || null;
  S.user = u ? { id: u.id, email: u.email } : null;
  if (u && S.uid && S.uid !== u.id) resetLocal();
  if (u) S.uid = u.id;
  if ((u?.id || null) !== prev) {
    persist();
    queueRender();
    if (u) sync();
  }
}
