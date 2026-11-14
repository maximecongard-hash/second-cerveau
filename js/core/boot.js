import { sb } from './config.js';
import { empty, applyIcon } from './util.js';
import { S, restore, resetLocal, persist, persistNow } from './store.js';
import { sync } from './sync.js';
import { MODULES } from './modules.js';
import { app, render, queueRender, SH } from './ui.js';
import { clearShown } from './push.js';
import { openFromHash, openSettingsGroup } from './events.js';

// ---------------------------------------------------------------------------
// Démarrage (appelé une fois tous les modules enregistrés)
// ---------------------------------------------------------------------------
export async function init() {
  applyIcon();
  restore();
  openSettingsGroup();
  registerSW();
  clearShown();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') clearShown(); });
  // Compte connu sur cet appareil : ses données s'affichent tout de suite, la session se vérifie ensuite.
  // Hors ligne, cette vérification échoue après une longue attente : ce n'est pas une raison de demander le mot de passe.
  const cached = !!S.uid;
  if (cached) {
    S.user = { id: S.uid, email: S.email || '' };
    render();
    openFromHash();
    sync();
  }
  if (!sb) {
    if (!cached) app.innerHTML = empty('Chargement impossible', 'Vérifie ta connexion puis relance l’app.');
    return;
  }
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === 'INITIAL_SESSION') return; // traitée ci-dessous
    if (s) setUser(s.user);
    else if (ev === 'SIGNED_OUT') setUser(null);
  });
  const { data: { session }, error } = await sb.auth.getSession();
  // erreur réseau : la session reste enregistrée, elle sera rafraîchie au retour du réseau
  if (session || error?.name !== 'AuthRetryableFetchError') setUser(session?.user || null);
  render();
  if (S.user && !cached) {
    openFromHash();
    sync();
  }
}
// Service worker : quand une nouvelle version prend la main, on recharge pour l'afficher,
// mais jamais en pleine saisie ni pendant une séance en direct
const busy = () => SH.mode || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || location.hash.startsWith('#/sport-live');
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    const go = () => { persistNow(); location.reload(); };
    if (!busy()) { go(); return; }
    const wait = setInterval(() => { if (!busy()) { clearInterval(wait); go(); } }, 1000);
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }))
    .catch(() => {});
}
function setUser(u) {
  const prev = S.user?.id || null;
  S.user = u ? { id: u.id, email: u.email } : null;
  if (u && S.uid && S.uid !== u.id) resetLocal();
  if (u) { S.uid = u.id; S.email = u.email; }
  if ((u?.id || null) !== prev) {
    persist();
    queueRender();
    if (u) sync();
  }
}
