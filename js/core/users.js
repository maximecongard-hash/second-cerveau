import { DEMO, sb } from './config.js';
import { esc } from './util.js';
import { S, persist } from './store.js';
import { ACTS, FORMS } from './modules.js';
import { render, toast } from './ui.js';
import { sync } from './sync.js';

// ---------------------------------------------------------------------------
// Comptes : nom et mot de passe de chacun, ajout d'utilisateurs par l'administrateur.
// L'ajout passe par l'Edge Function add-user (clé de service côté serveur, jamais dans l'app).
// ---------------------------------------------------------------------------
export const me = () => S.people[S.user?.id] || null;
export const isAdmin = () => !DEMO && !!me()?.is_admin;

// Mot de passe provisoire lisible (sans 0/O ni 1/l/I)
function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(12))].map(b => abc[b % abc.length]).join('');
}

// Contenu du groupe « Compte » (sous l'email et la synchro)
export function accountForms() {
  if (DEMO) return '';
  return `<form class="inline-add" data-form="profile-name"><input id="profile-name" value="${esc(me()?.name || '')}" placeholder="Ton pseudo, affiché dans la liste de partage" autocomplete="name"></form>
    <form class="inline-add" data-form="password-change"><input id="new-pass" type="password" minlength="8" placeholder="Nouveau mot de passe (8 caractères minimum)" autocomplete="new-password"></form>`;
}

// Contenu du groupe « Utilisateurs » (administrateur seulement)
export function usersSettings() {
  const nu = S.ui.newUser;
  const people = Object.values(S.people).sort((a, b) => a.email.localeCompare(b.email));
  return `<div class="muted small pad">Chaque compte a ses propres données. On se retrouve en partageant un projet ou une tâche.</div>
    ${people.map(p => `<div class="kv"><span>${esc(p.name || p.email)} <span class="muted small">${esc(p.email)}</span>${p.is_admin ? ' <span class="pill">Admin</span>' : ''}</span></div>`).join('')}
    ${nu ? `<div class="card pad"><b>Compte créé</b>
      <div class="muted small">Transmets ces identifiants à la personne. Le mot de passe n’est plus affiché ensuite : elle peut le changer dans Réglages > Compte.</div>
      <div class="kv"><span>${esc(nu.email)}</span><button class="btn" data-act="copy" data-v="${esc(nu.email)}">Copier</button></div>
      <div class="kv"><code class="token">${esc(nu.password)}</code><button class="btn" data-act="copy" data-v="${esc(nu.password)}">Copier</button></div>
      <button class="link" data-act="user-new-close">J’ai transmis les identifiants</button></div>` : ''}
    <form class="inline-add" data-form="user-add">
      <input id="user-name" placeholder="Pseudo (facultatif)" autocomplete="off">
      <input id="user-email" type="email" placeholder="+ Email du nouvel utilisateur" autocomplete="off" autocapitalize="off" required>
      <button class="btn block" type="submit">Créer le compte</button>
    </form>
    ${S.ui.userErr ? `<div class="err pad">${esc(S.ui.userErr)}</div>` : ''}`;
}

Object.assign(ACTS, {
  'user-new-close': () => { S.ui.newUser = null; render(); }
});
Object.assign(FORMS, {
  'profile-name': async f => {
    const name = f.querySelector('input').value.trim().slice(0, 80);
    const { data, error } = await sb.from('profiles').update({ name }).eq('id', S.user.id).select('id, email, name, is_admin');
    if (error) { toast('Erreur : ' + error.message); return; }
    if (!data?.length) { toast('Pseudo non enregistré : profil introuvable ou droit refusé'); return; }
    S.people[S.user.id] = data[0];
    persist();
    toast('Pseudo enregistré');
  },
  'password-change': async f => {
    const input = f.querySelector('input');
    if (input.value.length < 8) { toast('8 caractères minimum'); return; }
    const { error } = await sb.auth.updateUser({ password: input.value });
    if (error) { toast('Erreur : ' + error.message); return; }
    input.value = '';
    toast('Mot de passe changé');
  },
  'user-add': async f => {
    const email = f.querySelector('#user-email').value.trim().toLowerCase();
    const name = f.querySelector('#user-name').value.trim();
    const btn = f.querySelector('button[type=submit]');
    const password = tempPassword();
    btn.disabled = true;
    S.ui.userErr = null;
    const { error } = await sb.functions.invoke('add-user', { body: { email, name, password } });
    if (error) {
      let msg = error.message;
      try { const b = await error.context.json(); msg = b.error || b.message || msg; } catch { /* corps illisible */ }
      S.ui.userErr = /not.?found|Failed to send/i.test(msg) ? 'Fonction add-user introuvable : déploie-la dans Supabase (voir le README).' : msg;
      render();
      return;
    }
    S.ui.newUser = { email, password };
    S.lastError = null;
    sync();
    render();
  }
});
