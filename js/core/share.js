import { DEMO, sb } from './config.js';
import { esc, I, uuid, empty, chip } from './util.js';
import { S, isMine, roleOf, persist } from './store.js';
import { ACTS } from './modules.js';
import { SH, sheet, showSheet, closeSheet, openEditor, toast, queueRender } from './ui.js';

// ---------------------------------------------------------------------------
// Partage de projets, tâches et notes avec d'autres comptes (table shares, droits 'edit' ou 'view').
// Un projet partagé donne aussi accès à ses tâches. Seul le propriétaire partage et gère les droits.
// En mode démo, tout reste local avec des comptes fictifs.
// ---------------------------------------------------------------------------
const SHAREABLE = new Set(['project', 'task', 'note']);
const ROLES = { edit: 'Peut modifier', view: 'Lecture seule' };
const meId = () => S.user?.id || S.uid;
let back = false;

export const personName = id => (id === meId() ? 'toi' : S.people[id]?.name || S.people[id]?.email || 'un autre membre');
export const firstName = id => (S.people[id] || id === meId() ? personName(id).split(/[\s@]/)[0] : personName(id));
export const sharesOf = id => S.shares.filter(s => s.item_id === id && s.owner_id === meId());
// Éléments d'autrui partagés directement avec moi
export const sharedWithMe = () => S.shares.filter(s => s.user_id === meId()).map(s => S.items.get(s.item_id)).filter(i => i && i.status !== 'trashed');

// Pastille des listes : « de Camille » pour un élément reçu, nombre d'invités pour un élément donné
export function shareMeta(it) {
  if (!isMine(it)) return `<span class="m-share" title="Partagé par ${esc(personName(it.user_id))}">${I.users}${esc(firstName(it.user_id))}</span>`;
  const n = sharesOf(it.id);
  return n.length ? `<span class="m-share" title="Partagé avec ${esc(n.map(s => personName(s.user_id)).join(', '))}">${I.users}${n.length}</span>` : '';
}

// Bloc de l'éditeur
export function shareBlock(it) {
  if (!SHAREABLE.has(it.kind)) return '';
  if (isMine(it)) {
    const n = sharesOf(it.id);
    return `<div class="sub-list"><div class="sub-title">Partage${n.length ? ` (${n.length})` : ''}</div>
      ${n.map(s => `<div class="sub-item">${esc(personName(s.user_id))} <span class="muted small">${ROLES[s.role]}</span></div>`).join('')}
      <button class="link small-link" data-act="share-open" data-id="${it.id}">${n.length ? 'Gérer le partage' : '+ Partager…'}</button></div>`;
  }
  const direct = S.shares.some(s => s.item_id === it.id && s.user_id === meId());
  return `<div class="sub-list"><div class="sub-title">Partage</div>
    <div class="sub-item">De ${esc(personName(it.user_id))} <span class="muted small">${roleOf(it) === 'view' ? ROLES.view : ROLES.edit}</span></div>
    ${direct ? `<button class="link small-link danger" data-act="share-leave" data-id="${it.id}">Quitter ce partage</button>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Feuille « Partager »
// ---------------------------------------------------------------------------
function shareSheet(id) {
  const it = S.items.get(id);
  const list = sharesOf(id);
  const role = S.ui.shareRole || 'edit';
  const shared = new Set(list.map(s => s.user_id));
  const others = Object.values(S.people).filter(p => p.id !== meId() && !shared.has(p.id)).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'fr'));
  sheet.innerHTML = `<div class="sheet-head"><button class="link" data-act="share-back">${back ? 'Retour' : 'Fermer'}</button><span class="sheet-kind">Partager</span><span></span></div>
    <div class="pad"><b>${esc(it?.title) || '<i>Sans titre</i>'}</b>
      <div class="muted small">${it?.kind === 'project' ? 'Les tâches du projet sont partagées avec lui.' : 'Seul cet élément est partagé.'}</div></div>
    <div class="list">${list.length ? list.map(s => `<div class="row"><div class="row-main"><div class="row-title">${esc(personName(s.user_id))}</div>
        <div class="row-meta"><span>${esc(S.people[s.user_id]?.email || '')}</span></div></div>
        <button class="chip" data-act="share-role" data-id="${s.id}">${ROLES[s.role]}</button>
        <button class="x link-x" data-act="share-del" data-id="${s.id}" aria-label="Retirer le partage">×</button></div>`).join('')
      : empty('Pas encore partagé')}</div>
    ${others.length ? `<div class="sub-title pad">Partager avec</div>
      <div class="chips wrap pad">${chip(ROLES.edit, role === 'edit', 'share-new-role', 'edit')}${chip(ROLES.view, role === 'view', 'share-new-role', 'view')}</div>
      <div class="list">${others.map(p => `<button class="row" data-act="share-pick" data-id="${id}" data-v="${esc(p.id)}"><div class="row-icon">${I.user}</div><div class="row-main"><div class="row-title">${esc(p.name || p.email)}</div></div><span class="chev">${I.plus}</span></button>`).join('')}</div>`
      : '<div class="muted small pad">Aucun autre compte à qui partager.</div>'}`;
}
export function openShare(id) {
  back = SH.mode === 'editor';
  SH.mode = 'share';
  SH.shareId = id;
  shareSheet(id);
  showSheet();
  sheet.scrollTop = 0;
}
const refresh = () => { if (SH.mode === 'share') shareSheet(SH.shareId); queueRender(); persist(); };

// Appel serveur, ou simulation locale en mode démo
async function addShare(id, email, role) {
  if (DEMO) {
    let p = Object.values(S.people).find(x => x.email === email);
    if (!p) { p = { id: 'u-' + email, email, name: email.split('@')[0] }; S.people[p.id] = p; }
    return { id: uuid(), item_id: id, owner_id: meId(), user_id: p.id, role };
  }
  const { data, error } = await sb.rpc('share_item', { p_item: id, p_email: email, p_role: role });
  if (error) throw new Error(/function .*share_item|schema cache/i.test(error.message) ? 'Partage indisponible : lance d’abord supabase/007_partage.sql' : error.message);
  S.people[data.user_id] = { ...S.people[data.user_id], id: data.user_id, email: data.email, name: data.name };
  return data;
}
const putShare = s => { S.shares = [...S.shares.filter(x => !(x.item_id === s.item_id && x.user_id === s.user_id)), { id: s.id, item_id: s.item_id, owner_id: s.owner_id, user_id: s.user_id, role: s.role }]; };

Object.assign(ACTS, {
  'share-open': el => openShare(el.dataset.id),
  'share-back': () => { const id = SH.shareId; if (back) openEditor(id); else closeSheet(); },
  'share-new-role': el => { S.ui.shareRole = el.dataset.v; shareSheet(SH.shareId); },
  'share-role': async el => {
    const s = S.shares.find(x => x.id === el.dataset.id);
    if (!s) return;
    try { putShare(await addShare(s.item_id, S.people[s.user_id]?.email || '', s.role === 'edit' ? 'view' : 'edit')); refresh(); }
    catch (e) { toast(e.message); }
  },
  'share-del': async el => {
    const s = S.shares.find(x => x.id === el.dataset.id);
    if (!s) return;
    if (!DEMO) {
      const { error } = await sb.from('shares').delete().eq('id', s.id);
      if (error) { toast('Erreur : ' + error.message); return; }
    }
    S.shares = S.shares.filter(x => x.id !== s.id);
    refresh();
    toast(`Partage retiré pour ${personName(s.user_id)}`);
  },
  'share-leave': async el => {
    const it = S.items.get(el.dataset.id);
    const s = S.shares.find(x => x.item_id === el.dataset.id && x.user_id === meId());
    if (!it || !s || !confirm(`Quitter « ${it.title || 'ce partage'} » ? Il disparaîtra de ton compte, sans être supprimé chez ${personName(it.user_id)}.`)) return;
    if (!DEMO) {
      const { error } = await sb.from('shares').delete().eq('id', s.id);
      if (error) { toast('Erreur : ' + error.message); return; }
    }
    S.shares = S.shares.filter(x => x.id !== s.id);
    for (const x of [...S.items.values()]) if (!isMine(x) && (x.id === it.id || x.parent_id === it.id)) { S.items.delete(x.id); S.dirty.delete(x.id); }
    closeSheet();
    persist();
    toast('Partage quitté');
    if (location.hash.startsWith('#/project/')) location.hash = '#/projects';
  }
});
Object.assign(ACTS, {
  'share-pick': async el => {
    const who = S.people[el.dataset.v];
    if (!who) return;
    try {
      const s = await addShare(el.dataset.id, who.email, S.ui.shareRole || 'edit');
      putShare(s);
      refresh();
      toast(`Partagé avec ${personName(s.user_id)}`);
    } catch (e) { toast(e.message); }
  }
});
