import { VERSION, CFG, DEMO, sb } from './config.js';
import { $, esc, I, empty, sec, today, nowIso, FMT_TIME, ICONS, iconChoice, setIcon, logo } from './util.js';
import { S, live, savePrefs, resetLocal, persistNow } from './store.js';
import { sync, syncClass, syncLabel } from './sync.js';
import { hydrateImages } from './images.js';
import { pushSettings } from './push.js';
import { VIEWS, ACTS, FORMS, moduleOrder, enabledModules, getModule, kindOwner } from './modules.js';
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

// Liste des modules : activation et ordre, affichée dans les Réglages
function modulesList() {
  const list = moduleOrder();
  return `<div class="muted small pad">Thèmes affichés dans la barre latérale et leur ordre. Le premier s'ouvre au lancement. Désactiver un module masque ses écrans, sans effacer ses données.</div>` +
    list.map((x, i) => {
      const m = getModule(x.id);
      return `<div class="row mod-row ${x.on ? '' : 'off'}">
      <div class="row-icon mod-icon">${m.icon}</div>
      <div class="row-main"><div class="row-title">${esc(m.label)}${m.preview ? ' <span class="pill">Aperçu</span>' : ''}</div>
        <div class="row-snippet">${esc(m.description || '')}</div></div>
      <div class="reorder">
        <button class="icon-btn" data-act="mod-move" data-v="${m.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">${I.up}</button>
        <button class="icon-btn" data-act="mod-move" data-v="${m.id}" data-dir="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Descendre">${I.down}</button>
      </div>
      <button class="switch ${x.on ? 'on' : ''}" data-act="mod-toggle" data-v="${m.id}" role="switch" aria-checked="${x.on}" aria-label="Activer ${esc(m.label)}"></button>
    </div>`;
    }).join('');
}

// Groupe repliable : l'état ouvert vit dans S.ui.folds, le rendu reconstruit le DOM
const fold = (id, icon, title, meta, inner) => `<details class="fold" ${S.ui.folds[id] ? 'open' : ''}>
    <summary data-act="fold" data-v="${id}"><span class="fold-icon">${icon}</span><span class="fold-main"><span class="fold-title">${title}</span>${meta ? `<span class="fold-meta">${meta}</span>` : ''}</span><span class="fold-chev">${I.down}</span></summary>
    <div class="fold-body">${inner}</div>
  </details>`;

VIEWS.settings = () => {
  if (!DEMO && S.ui.tokens === undefined) { S.ui.tokens = null; loadTokens(); }
  const tokens = S.ui.tokens;
  const tokenHtml = DEMO ? '<div class="muted pad">Indisponible en mode démo.</div>'
    : tokens === null ? '<div class="muted pad">Chargement…</div>'
    : (tokens.length ? tokens.map(t => `<div class="kv"><code class="token">${esc(t.token)}</code><div class="btn-row"><button class="btn" data-act="copy" data-v="${esc(t.token)}">Copier</button><button class="btn danger" data-act="token-del" data-v="${esc(t.token)}">Révoquer</button></div></div>`).join('')
      : '<div class="muted pad">Aucun jeton. Génère-en un pour tes raccourcis.</div>') +
      `<button class="btn block" data-act="token-new">Générer un jeton</button>${S.ui.tokenErr ? `<div class="err pad">${esc(S.ui.tokenErr)}</div>` : ''}`;
  const html =
    fold('account', I.user, 'Compte', esc(DEMO ? 'Mode démo' : S.user.email),
      `<div class="kv"><span>${esc(S.user.email)}</span><span class="sync ${syncClass()}"></span></div>
      <div class="muted small pad">${syncLabel()}${S.lastSync ? ` · dernière synchro ${FMT_TIME.format(new Date(S.lastSync))}` : ''}</div>
      ${DEMO ? '' : '<div class="btn-row"><button class="btn" data-act="sync-now">Synchroniser</button><button class="btn danger" data-act="logout">Se déconnecter</button></div>'}`) +
    fold('notif', I.bell, 'Notifications', 'Rappels des tâches', pushSettings()) +
    fold('modules', I.grid, 'Modules', enabledModules().map(m => esc(m.label)).join(' · '), modulesList()) +
    enabledModules().filter(m => m.settings).map(m => fold('mod-' + m.id, m.icon, esc(m.label), esc(m.settingsMeta || ''), m.settings())).join('') +
    fold('capture', I.inbox, 'Capture iPhone', 'Raccourcis et jeton',
      `<div class="muted small pad">Valeurs à coller dans tes raccourcis (voir le guide).</div>
      <div class="kv"><span>URL du projet</span><button class="btn" data-act="copy" data-v="${esc(CFG.url)}">Copier</button></div>
      <div class="kv"><span>Clé publique</span><button class="btn" data-act="copy" data-v="${esc(CFG.key)}">Copier</button></div>
      <div class="muted small pad">Jeton de capture (secret, ne le partage pas) :</div>${tokenHtml}`) +
    fold('icon', I.image, 'Icône', iconChoice().label, iconSettings()) +
    fold('data', I.save, 'Données', 'Export · version ' + VERSION,
      `<div class="btn-row"><button class="btn" data-act="export">Exporter (JSON)</button></div>
      <div class="muted small pad">Version ${VERSION}${DEMO ? ' · mode démo' : ''}</div>`);
  return { title: 'Réglages', html: `<div class="folds">${html}</div>` };
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
  const { data, error } = await sb.from('capture_tokens').select('token, created_at').order('created_at');
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
  fold: el => { S.ui.folds[el.dataset.v] = !S.ui.folds[el.dataset.v]; render(); },
  'sync-now': () => { S.lastError = null; sync(); },
  logout: async () => {
    if ((S.dirty.size || S.prefsDirty) && !confirm('Des modifications ne sont pas encore synchronisées et seront perdues. Se déconnecter quand même ?')) return;
    await sb.auth.signOut();
    resetLocal(); S.uid = null; persistNow();
  },
  copy: async el => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Copié'); } catch { toast('Copie impossible'); } },
  'token-new': async () => {
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await sb.from('capture_tokens').insert({ token });
    if (error) { toast('Erreur : ' + error.message); return; }
    S.ui.tokens = undefined; render(); toast('Jeton créé');
  },
  'token-del': async el => {
    if (!confirm('Révoquer ce jeton ? Les raccourcis qui l’utilisent ne marcheront plus.')) return;
    const { error } = await sb.from('capture_tokens').delete().eq('token', el.dataset.v);
    if (error) { toast('Erreur : ' + error.message); return; }
    S.ui.tokens = undefined; render();
  },
  'icon-set': el => { setIcon(el.dataset.v); render(); toast('Icône choisie'); },
  export: () => exportJSON()
});

Object.assign(FORMS, {
  login: async f => {
    const err = $('#login-err');
    err.textContent = '';
    const btn = f.querySelector('button'); btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-pass').value });
    btn.disabled = false;
    if (error) err.textContent = error.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : error.message;
  }
});
