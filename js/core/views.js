import { VERSION, SCHEMA_VERSION, CFG, DEMO, sb } from './config.js';
import { $, esc, I, empty, sec, today, nowIso, plain, ICONS, iconChoice, setIcon, logo, switchBtn, newToken } from './util.js';
import { S, live, savePrefs, patch, persist, isMine, resetLocal, persistNow } from './store.js';
import { sync, syncClass, syncLine, dropStuck, checkInstall, schemaBehind, SCHEMA_MSG } from './sync.js';
import { hydrateImages } from './images.js';
import { pushSettings } from './push.js';
import { accountForms, usersSettings, isAdmin } from './users.js';
import { VIEWS, ACTS, FORMS, moduleOrder, enabledModules, getModule, kindOwner, fromModules } from './modules.js';
import { queueRender, render, toast } from './ui.js';

// ---------------------------------------------------------------------------
// Vues communes à tous les modules
// ---------------------------------------------------------------------------
function genericRow(it) {
  return `<div class="row" data-act="edit" data-id="${it.id}"><div class="row-main"><div class="row-title">${esc(it.title) || '<i>Sans titre</i>'}</div></div></div>`;
}
function searchResults() {
  const q = S.ui.search.trim().toLowerCase();
  if (!q) return '<div class="muted pad">Tape pour chercher partout.</div>';
  const res = live()
    .filter(i => kindOwner(i.kind)?.searchable?.(i) !== false)
    .filter(i => (i.title + ' ' + i.body + ' ' + (i.tags || []).join(' ') + ' ' + (i.url || '')).toLowerCase().includes(q))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 80);
  return res.length ? res.map(i => (kindOwner(i.kind)?.row || genericRow)(i)).join('') : empty('Aucun résultat');
}
VIEWS.search = () => ({
  title: 'Recherche',
  html: `<input id="search-q" class="search" type="search" placeholder="Tâches, projets, notes…" value="${esc(S.ui.search)}" data-live="search" autocomplete="off">
    <div id="search-results" class="list">${searchResults()}</div>`
});

// ---------------------------------------------------------------------------
// Réglages : un groupe ouvert à la fois (S.ui.fold), le contenu n'est calculé que pour celui-là.
// #/settings/<groupe> ouvre directement un groupe.
// ---------------------------------------------------------------------------
const fold = (id, icon, title, meta, body) => `<details class="fold" ${S.ui.fold === id ? 'open' : ''}>
    <summary data-act="fold" data-v="${id}"><span class="fold-icon">${icon}</span><span class="fold-main"><span class="fold-title">${title}</span>${meta ? `<span class="fold-meta">${meta}</span>` : ''}</span><span class="fold-chev">${I.down}</span></summary>
    <div class="fold-body">${S.ui.fold === id ? body() : ''}</div>
  </details>`;

function accountBody() {
  return `<div class="kv"><span>${esc(S.user.email)}</span><span class="sync ${syncClass()}"></span></div>
    <div class="muted small pad sync-line">${esc(syncLine())}</div>
    ${DEMO ? '' : '<div class="btn-row"><button class="btn" data-act="sync-now">Synchroniser</button></div>'}
    ${accountForms()}
    ${DEMO ? '' : '<div class="btn-row"><button class="btn danger" data-act="logout">Se déconnecter</button></div>'}`;
}

// Activation et ordre des modules
function modulesBody() {
  const list = moduleOrder();
  return `<div class="muted small pad">Modules affichés dans la barre latérale et leur ordre. Le premier s’ouvre au lancement. Désactiver un module masque ses écrans, sans effacer ses données.</div>` +
    list.map((x, i) => {
      const m = getModule(x.id);
      return `<div class="row mod-row ${x.on ? '' : 'off'}">
      <div class="row-icon mod-icon">${m.icon}</div>
      <div class="row-main"><div class="row-title">${esc(m.label)}</div>
        <div class="row-snippet">${esc(m.description || '')}</div></div>
      <div class="reorder">
        <button class="icon-btn" data-act="mod-move" data-v="${m.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">${I.up}</button>
        <button class="icon-btn" data-act="mod-move" data-v="${m.id}" data-dir="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Descendre">${I.down}</button>
      </div>
      ${switchBtn(x.on, 'mod-toggle', 'Activer ' + m.label, m.id)}
    </div>`;
    }).join('');
}

const notifBody = () => pushSettings() + fromModules('notifSettings').join('');

// iPhone : clés d'accès, raccourcis, widget, et ce que les modules y ajoutent (abonnement Calendrier)
const SHORTCUTS = [
  ['Capturer', 'idée, dictée ou lien partagé vers l’Inbox'],
  ['Capturer photo', 'photo prise ou partagée vers l’Inbox'],
  ['Agenda Apple', 'envoie tes prochains événements de Calendrier à Brain']
];
function tokensHtml() {
  if (DEMO) return '<div class="muted pad">Indisponible en mode démo.</div>';
  if (S.ui.tokens === undefined) { S.ui.tokens = null; loadTokens(); }
  if (S.ui.tokens === null) return '<div class="muted pad">Chargement…</div>';
  const DOORS = { capture: 'capture', agenda: 'agenda', widget: 'widget' };
  const useLine = t => {
    const u = t.uses || {};
    const parts = Object.entries(DOORS).filter(([k]) => u[k]).map(([k, l]) => `${u[k]} ${l}`);
    const total = Object.values(u).reduce((n, v) => n + (+v || 0), 0);
    return total ? `${total} utilisation${total > 1 ? 's' : ''} (${parts.join(' · ')})${t.last_used_at ? ` · dernière ${new Date(t.last_used_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Jamais utilisée';
  };
  const row = t => (S.ui.tokenEdit === t.token
    ? `<form class="inline-add with-btn" data-form="token-rename" data-token="${esc(t.token)}"><input value="${esc(t.name || '')}" placeholder="Nom de cette clé" autocomplete="off" aria-label="Nom de cette clé"><button class="btn" type="submit">OK</button></form>`
    : `<div class="kv"><span class="row-main"><span class="row-title">${esc(t.name || 'Sans nom')}</span><span class="muted small">${esc(useLine(t))}</span></span><div class="btn-row"><button class="btn" data-act="copy" data-v="${esc(t.token)}">Copier</button><button class="btn" data-act="token-name" data-v="${esc(t.token)}">Renommer</button><button class="btn danger" data-act="token-del" data-v="${esc(t.token)}">Révoquer</button></div></div>`);
  return S.ui.tokens.map(row).join('') +
    `<form class="inline-add with-btn" data-form="token-new"><input placeholder="Nouvelle clé (ex. iPhone, widget)" autocomplete="off" aria-label="Nom de la nouvelle clé"><button class="btn" type="submit">Créer</button></form>
    ${S.ui.tokenErr ? `<div class="err pad">${esc(S.ui.tokenErr)}</div>` : ''}`;
}
function iphoneBody() {
  return sec('Clés d’accès', `<div class="muted small pad">Les raccourcis et le widget s’identifient avec une clé secrète. Crée-en une par appareil ou par usage, pour voir ce qui s’en sert.</div>${tokensHtml()}`) +
    sec('Raccourcis', `<div class="muted small pad">Ouvre le lien sur l’iPhone. Le raccourci demande une clé d’accès à l’installation : copie-la d’abord.</div>
      ${SHORTCUTS.map(([name, what]) => `<div class="kv"><span class="row-main"><span class="row-title">${name}</span><span class="muted small">${what}</span></span><a class="btn" href="raccourcis/${encodeURIComponent(name)}.shortcut">Installer</a></div>`).join('')}`) +
    sec('Widget', `<div class="muted small pad">Dans l’app Scriptable : nouveau script, colle le code copié ici, puis lance-le : il demande une clé d’accès. Le code garde l’adresse de ton Brain.</div>
      <div class="kv"><span class="row-main"><span class="row-title">Widget « Ma journée »</span><span class="muted small">Top 3, grille horaire du jour, fond transparent</span></span><div class="btn-row"><button class="btn" data-act="widget-copy">Copier le code</button><a class="btn" href="widget/Brain.js" target="_blank" rel="noopener">Voir</a></div></div>`) +
    fromModules('accessSettings').join('');
}

// Données
const trashed = () => [...S.items.values()]
  .filter(i => i.status === 'trashed' && isMine(i) && (i.title || i.body || i.image_path || i.url))
  .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
function storageLine() {
  let chars = 0;
  try { for (let i = 0; i < localStorage.length; i++) chars += (localStorage.getItem(localStorage.key(i)) || '').length; } catch { /* stockage indisponible */ }
  const ko = Math.round(chars * 2 / 1024); // UTF-16 : deux octets par caractère
  return `${ko < 1024 ? ko + ' Ko' : (ko / 1024).toFixed(1).replace('.', ',') + ' Mo'} sur environ 5 Mo`;
}
function dataBody() {
  const trash = trashed(), shown = trash.slice(0, 30);
  const kindOf = i => kindOwner(i.kind)?.kindLabel?.[i.kind] || '';
  const stuck = [...S.stuck].map(([id, why]) => `<div class="kv"><span class="row-main"><span class="row-title">${esc(S.items.get(id)?.title || 'Sans titre')}</span><span class="err small">${esc(why)}</span></span><button class="btn" data-act="stuck-drop" data-v="${id}">Reprendre la version du serveur</button></div>`).join('');
  return (stuck ? sec('Non envoyés', `<div class="muted small pad">La base refuse ces éléments. Le reste se synchronise normalement.</div>${stuck}<div class="btn-row"><button class="btn" data-act="sync-now">Réessayer</button></div>`) : '') +
    sec('Corbeille', `<div class="muted small pad">Les éléments supprimés sont gardés 30 jours, puis effacés.</div>
      ${shown.map(i => `<div class="kv trash-row"><span class="row-main"><span class="row-title">${esc(i.title || plain(i.body).slice(0, 60)) || '<i>Sans titre</i>'}</span><span class="muted small">${esc(kindOf(i))}</span></span><button class="btn" data-act="trash-restore" data-v="${i.id}">Restaurer</button></div>`).join('') || '<div class="muted pad">Corbeille vide.</div>'}
      ${trash.length > shown.length ? `<div class="muted small pad">Et ${trash.length - shown.length} de plus.</div>` : ''}
      ${trash.length ? '<div class="btn-row"><button class="btn danger" data-act="trash-empty">Vider la corbeille</button></div>' : ''}`) +
    sec('Sur cet appareil', `${S.ui.storageFull ? '<div class="err pad">Stockage plein : tes derniers changements ne sont pas gardés hors ligne. Reste en ligne le temps de synchroniser, puis vide la corbeille.</div>' : ''}
      <div class="kv"><span>Espace utilisé</span><span class="muted">${storageLine()}</span></div>
      <div class="kv"><span>Version</span><span class="muted">${VERSION}${DEMO ? ' · mode démo' : ''}</span></div>
      <div class="btn-row"><button class="btn" data-act="export">Exporter (JSON)</button></div>`);
}

// Installation (administrateur) : l'état de chaque pièce et quoi faire si elle manque
async function pingFunction() {
  let state;
  try {
    const res = await fetch(`${CFG.url}/functions/v1/brain/ping`, { signal: AbortSignal.timeout(15000) });
    state = res.status === 200 ? 'ok' : res.status === 401 ? 'jwt' : 'absent';
  } catch { state = 'unreachable'; }
  S.ui.fnState = state;
  queueRender();
}
const check = (state, title, detail) => `<div class="check-row ${state}"><span class="check-dot"></span><div><div class="row-title">${title}</div><div class="muted small">${detail}</div></div></div>`;
function installBody() {
  if (S.ui.fnState === undefined) { S.ui.fnState = null; pingFunction(); }
  const st = S.ui.install;
  const fn = {
    ok: ['ok', 'Déployée et accessible.'],
    jwt: ['todo', 'Déployée, mais « Verify JWT » est activé : désactive-le dans Supabase > Edge Functions > brain > Details.'],
    absent: ['todo', 'Introuvable : crée la fonction brain avec supabase/functions/brain/index.ts (README, Installer, étape 5).'],
    unreachable: ['todo', 'Injoignable : fonction absente, « Verify JWT » activé, ou réseau coupé (README, Installer, étape 5).']
  }[S.ui.fnState] || ['', 'Vérification…'];
  const unknown = ['', 'Vérifié à la prochaine synchro.'];
  const row = (cond, ok, todo) => (!st ? unknown : cond ? ['ok', ok] : ['todo', todo]);
  const base = row(st?.schema >= SCHEMA_VERSION, `À jour (schéma ${st?.schema}).`, 'Recolle supabase/schema.sql dans Supabase > SQL Editor.');
  const cron = row(st?.cron && st?.url, 'Passage chaque minute.', 'Active pg_cron et pg_net dans Supabase > Database > Extensions, puis recolle supabase/schema.sql.');
  const vapid = row(st?.vapid, 'Clés créées.', 'Créées au premier passage des rappels : attends une minute une fois la fonction déployée.');
  const purge = row(st?.purge, 'Corbeille vidée chaque nuit après 30 jours.', 'Active pg_cron, puis recolle supabase/schema.sql.');
  return check(base[0], 'Base de données', base[1]) + check(fn[0], 'Fonction brain', fn[1]) + check(cron[0], 'Rappels', cron[1]) +
    check(vapid[0], 'Notifications', vapid[1]) + check(purge[0], 'Nettoyage', purge[1]) +
    '<div class="btn-row"><button class="btn" data-act="install-check">Vérifier à nouveau</button></div>';
}

VIEWS.settings = () => {
  const banner = schemaBehind() ? `<a class="banner soft" href="#/settings/install">${esc(SCHEMA_MSG)}</a>` : '';
  const trash = trashed().length;
  const html =
    fold('account', I.user, 'Compte', esc(DEMO ? 'Mode démo' : (S.people[S.user.id]?.name || S.user.email)), accountBody) +
    (isAdmin() ? fold('users', I.users, 'Utilisateurs', Object.keys(S.people).length + ' compte(s)', usersSettings) : '') +
    fold('modules', I.grid, 'Modules', enabledModules().map(m => esc(m.label)).join(' · '), modulesBody) +
    enabledModules().filter(m => m.settings).map(m => fold('mod-' + m.id, m.icon, esc(m.label), esc(m.settingsMeta || ''), m.settings)).join('') +
    fold('notif', I.bell, 'Notifications', 'Rappels · fin de créneau', notifBody) +
    fold('iphone', I.phone, 'iPhone et Calendrier', 'Clés d’accès · raccourcis · widget', iphoneBody) +
    fold('icon', I.image, 'Icône', iconChoice().label, iconSettings) +
    fold('data', I.save, 'Données', (S.stuck.size ? 'Éléments non envoyés · ' : '') + (trash ? `Corbeille (${trash}) · ` : 'Corbeille · ') + 'export', dataBody) +
    (isAdmin() ? fold('install', I.checkCircle, 'Installation', schemaBehind() ? 'À mettre à jour' : 'Base · fonction · rappels', installBody) : '');
  return { title: 'Réglages', html: `${banner}<div class="folds">${html}</div>` };
};
// iOS lit l'icône au moment de « Sur l'écran d'accueil » puis la fige
function iconSettings() {
  const cur = iconChoice().id;
  const installed = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  return `<div class="icon-pick">${ICONS.map(i => `<button class="icon-opt ${i.id === cur ? 'on' : ''}" data-act="icon-set" data-v="${i.id}" aria-pressed="${i.id === cur}"><img src="${i.touch}" alt="" width="60" height="60"><span>${i.label}</span></button>`).join('')}</div>
    <div class="muted small pad">${installed
      ? 'L’icône est fixée à l’ajout sur l’écran d’accueil. Pour en changer : choisis-la ici, supprime l’app de l’écran d’accueil, puis ajoute-la à nouveau depuis Safari. Tes données restent synchronisées.'
      : 'Choisis l’icône avant de faire Partager > Sur l’écran d’accueil dans Safari.'}</div>`;
}
async function loadTokens() {
  const { data, error } = await sb.from('capture_tokens').select('token, name, uses, last_used_at, created_at').order('created_at');
  S.ui.tokens = error ? [] : data;
  S.ui.tokenErr = error ? error.message : null;
  queueRender();
}

export function viewLogin(msg = '') {
  return `<div class="login">
    <div class="login-logo"><img src="${iconChoice().touch}" alt=""></div>
    <h1>${logo()}</h1>
    <p class="muted">Capture. Trie. Planifie.</p>
    <form data-form="login">
      <input type="email" id="login-email" autocomplete="username" placeholder="Email" required>
      <input type="password" id="login-pass" autocomplete="current-password" placeholder="Mot de passe" required>
      <button class="btn primary block" type="submit">Se connecter</button>
      <p class="err" id="login-err">${esc(msg)}</p>
    </form>
  </div>`;
}

function exportJSON() {
  const blob = new Blob([JSON.stringify({ exported_at: nowIso(), prefs: S.prefs, items: [...S.items.values()] }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `second-cerveau-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function liveSearch(value) {
  S.ui.search = value;
  $('#search-results').innerHTML = searchResults();
  hydrateImages($('#search-results'));
}

// ---------------------------------------------------------------------------
// Actions communes
// ---------------------------------------------------------------------------
function saveModules(list) {
  S.prefs.modules = list;
  savePrefs();
}
Object.assign(ACTS, {
  'mod-toggle': el => {
    const list = moduleOrder();
    const x = list.find(m => m.id === el.dataset.v);
    if (x.on && list.filter(m => m.on).length === 1) { toast('Garde au moins un module actif'); return; }
    x.on = !x.on;
    saveModules(list);
  },
  'mod-move': el => {
    const list = moduleOrder();
    const i = list.findIndex(m => m.id === el.dataset.v), j = i + +el.dataset.dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    saveModules(list);
  },
  fold: el => {
    S.ui.fold = S.ui.fold === el.dataset.v ? null : el.dataset.v;
    render();
    document.querySelector('.fold[open]')?.scrollIntoView({ block: 'start' });
  },
  // demande explicite : tout relire, sans attendre la prochaine relecture complète
  'sync-now': async () => { S.lastError = null; S.stuck.clear(); S.lastFullRead = null; render(); await sync(); render(); },
  'stuck-drop': el => dropStuck(el.dataset.v),
  'trash-restore': el => { patch(el.dataset.v, { status: 'active' }); toast('Restauré'); },
  'trash-empty': async () => {
    const ids = trashed().map(i => i.id);
    if (!ids.length || !confirm(`Effacer définitivement ${ids.length} élément${ids.length > 1 ? 's' : ''} ? Impossible à annuler.`)) return;
    if (!DEMO) for (let i = 0; i < ids.length; i += 100) {
      const { error } = await sb.from('items').delete().in('id', ids.slice(i, i + 100));
      if (error) { toast('Erreur : ' + error.message); return; }
    }
    for (const id of ids) { S.items.delete(id); S.dirty.delete(id); S.stuck.delete(id); }
    persist();
    render();
    toast('Corbeille vidée');
  },
  'install-check': async () => {
    S.ui.fnState = undefined; S.ui.install = null;
    render();
    await checkInstall();
    render();
  },
  logout: async () => {
    if ((S.dirty.size || S.prefsDirty) && !confirm('Des modifications ne sont pas encore synchronisées et seront perdues. Se déconnecter quand même ?')) return;
    // cet appareil seulement : les autres restent connectés
    const { error } = await sb.auth.signOut({ scope: 'local' });
    if (error) { toast('Déconnexion impossible hors ligne : réessaie avec du réseau'); return; }
    resetLocal(); S.uid = null; S.email = null; persistNow();
    location.reload(); // repart d'un état d'affichage vierge
  },
  'widget-copy': async () => {
    // Promesse donnée au presse-papiers : iOS accepte la copie malgré l'attente du réseau
    const code = fetch('widget/Brain.js', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(t => (DEMO ? t : t.replace(/const APP_URL = '[^']*'/, `const APP_URL = '${new URL('./', location.href).href}'`)
        .replace(/const API = '[^']*'/, `const API = '${CFG.url}'`).replace(/const KEY = '[^']*'/, `const KEY = '${CFG.key}'`)));
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': code.then(t => new Blob([t], { type: 'text/plain' })) })]);
      toast('Code copié');
    } catch {
      try { await navigator.clipboard.writeText(await code); toast('Code copié'); } catch { toast('Copie impossible'); }
    }
  },
  copy: async el => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Copié'); } catch { toast('Copie impossible'); } },
  'token-name': el => { S.ui.tokenEdit = el.dataset.v; render(); document.querySelector('[data-form="token-rename"] input')?.focus(); },
  'token-del': async el => {
    if (!confirm('Révoquer cette clé ? Les raccourcis et widgets qui l’utilisent ne marcheront plus.')) return;
    const { error } = await sb.from('capture_tokens').delete().eq('token', el.dataset.v);
    if (error) { toast('Erreur : ' + error.message); return; }
    S.ui.tokens = undefined; render();
  },
  'icon-set': el => { setIcon(el.dataset.v); render(); toast('Icône choisie'); },
  export: () => exportJSON()
});

Object.assign(FORMS, {
  'token-new': async f => {
    const name = f.querySelector('input').value.trim();
    const { error } = await sb.from('capture_tokens').insert({ token: newToken(), name: name || null });
    if (error) { toast('Erreur : ' + error.message); return; }
    S.ui.tokens = undefined; render(); toast('Clé créée');
  },
  'token-rename': async f => {
    const { error } = await sb.from('capture_tokens').update({ name: f.querySelector('input').value.trim() || null }).eq('token', f.dataset.token);
    if (error) { toast('Erreur : ' + error.message); return; }
    S.ui.tokens = undefined; S.ui.tokenEdit = null; render();
  },
  login: async f => {
    const err = $('#login-err');
    err.textContent = '';
    const btn = f.querySelector('button'); btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-pass').value });
    btn.disabled = false;
    if (error) err.textContent = error.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : error.message;
  }
});
