import { DEMO, sb } from './config.js';
import { I } from './util.js';
import { S } from './store.js';
import { ACTS } from './modules.js';
import { render, toast } from './ui.js';

// ---------------------------------------------------------------------------
// Notifications de Brain (Web Push). L'envoi se fait côté Supabase :
// fonction supabase/functions/send-reminders, appelée chaque minute par pg_cron.
// Sur iPhone, il faut l'app installée sur l'écran d'accueil (iOS 16.4 ou plus).
// ---------------------------------------------------------------------------
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const installed = () => navigator.standalone || matchMedia('(display-mode: standalone)').matches;
export const pushOn = () => supported() && Notification.permission === 'granted' && S.ui.pushSub === true;

const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));

// Cet appareil est-il abonné ? (lu une fois, puis gardé dans S.ui.pushSub)
async function checkSub() {
  try {
    const reg = await navigator.serviceWorker.ready;
    S.ui.pushSub = !!(await reg.pushManager.getSubscription());
  } catch { S.ui.pushSub = false; }
  render();
}

async function enable() {
  const perm = await Notification.requestPermission(); // doit suivre directement le toucher
  if (perm !== 'granted') { toast('Notifications refusées. Réglages iPhone > Notifications > Brain pour les autoriser.'); render(); return; }
  try {
    const { data: key, error } = await sb.rpc('push_public_key');
    if (error) throw error;
    if (!key) { toast('Serveur pas encore prêt : réessaie dans une minute.'); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64url(key) });
    const j = sub.toJSON();
    const { error: e2 } = await sb.from('push_subscriptions').upsert(
      { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: navigator.platform || null },
      { onConflict: 'endpoint' });
    if (e2) throw e2;
    S.ui.pushSub = true;
    toast('Notifications activées');
  } catch (e) {
    toast('Erreur : ' + (e.message || e));
  }
  render();
}

async function disable() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) { toast('Erreur : ' + (e.message || e)); }
  S.ui.pushSub = false;
  render();
}

async function test() {
  const { data, error } = await sb.functions.invoke('send-reminders', { body: { test: true } });
  if (error) { toast('Erreur : ' + (error.message || error)); return; }
  toast(data?.sent ? 'Notification envoyée' : 'Aucun appareil abonné');
}

// Ouvrir l'app efface les notifications déjà affichées : rien ne traîne dans le centre de notifications
export async function clearShown() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    (await reg?.getNotifications?.() || []).forEach(n => n.close());
  } catch { /* pas pris en charge */ }
}

export function pushSettings() {
  let body;
  if (DEMO) body = '<div class="muted pad">Indisponible en mode démo.</div>';
  else if (!supported()) body = `<div class="muted small pad">${installed() ? 'Cet appareil ne prend pas en charge les notifications (iOS 16.4 ou plus requis).' : 'Pour recevoir les notifications, installe d’abord l’app : Safari > Partager > Sur l’écran d’accueil, puis ouvre-la depuis son icône.'}</div>`;
  else {
    if (S.ui.pushSub === undefined) { S.ui.pushSub = null; checkSub(); }
    const on = pushOn();
    body = `<div class="kv"><span>${I.bell} Sur cet appareil</span><span class="muted">${on ? 'activées' : Notification.permission === 'denied' ? 'refusées' : 'désactivées'}</span></div>
      <div class="muted small pad">${on ? 'Les tâches avec un rappel t’envoient une notification à l’heure choisie, même app fermée.'
        : Notification.permission === 'denied' ? 'Autorise-les dans Réglages iPhone > Notifications > Brain.'
        : 'Active-les pour recevoir les rappels de tes tâches, même app fermée.'}</div>
      <div class="btn-row">${on ? '<button class="btn" data-act="push-test">Envoyer un essai</button><button class="btn" data-act="push-off">Désactiver</button>'
        : Notification.permission === 'denied' ? '' : '<button class="btn" data-act="push-on">Activer les notifications</button>'}</div>`;
  }
  return body;
}

Object.assign(ACTS, {
  'push-on': () => enable(),
  'push-off': () => disable(),
  'push-test': () => test()
});

// Petite ligne sous le champ Rappel quand cet appareil ne recevra pas la notification
export function pushHint() {
  if (DEMO || !supported()) return '';
  if (S.ui.pushSub === undefined) { S.ui.pushSub = null; checkSub(); }
  if (S.ui.pushSub === null || pushOn()) return '';
  return '<div class="muted small">Notifications désactivées sur cet appareil : <a href="#/settings" data-act="close-go">les activer</a>.</div>';
}
