import { esc, I, empty, chip, fmtDur } from '../../core/util.js';
import { S, ofKindAll } from '../../core/store.js';
import { foyerView } from './foyer.js';
import { panierView } from './panier.js';
import { KINDS, AISLES, aisleFor, metaOf, seasonOf, seasonOrder, inSeason, shopMeta, fmtQty, STORES } from './model.js';

// ---------------------------------------------------------------------------
// Banque de recettes : liste, recherche, filtres (favoris, tags, saison)
// Le filtre « Saison » propose d'abord la saison en cours (d'après la date), sans trier la liste tant qu'on ne l'a pas choisi.
// ---------------------------------------------------------------------------
export { KINDS };
const heart = on => `<button type="button" class="rc-heart ${on ? 'on' : ''}" aria-pressed="${on}" aria-label="${on ? 'Retirer des favoris' : 'Mettre en favori'}">${I.heart}</button>`;

export function recipeRow(r) {
  const m = metaOf(r), n = m.ingredients.length;
  const meta = [r.duration_min ? fmtDur(r.duration_min) : '', ...(r.tags || []).map(t => esc(t)), m.seasons.length ? esc(m.seasons.join(' / ')) : '', n ? `${n} ingrédient${n > 1 ? 's' : ''}` : ''].filter(Boolean);
  const on = (S.ui.rcSel || []).includes(r.id);
  return `<div class="row" data-act="edit" data-id="${r.id}">
    <button type="button" class="check ${on ? 'on' : ''}" data-act="rc-sel" data-id="${r.id}" aria-label="${on ? 'Retirer du panier' : 'Ajouter au panier'}"></button>
    <div class="row-main"><div class="row-title">${esc(r.title) || '<i>Sans titre</i>'}</div>
    ${meta.length ? `<div class="row-meta">${meta.map(x => `<span>${x}</span>`).join('')}</div>` : ''}</div>
    <span data-act="rc-fav" data-id="${r.id}">${heart(r.pinned)}</span>
  </div>`;
}

const matches = (r, q) => (r.title + ' ' + r.body + ' ' + (r.tags || []).join(' ') + ' ' + metaOf(r).ingredients.map(g => g.name).join(' ')).toLowerCase().includes(q);
const byFav = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.title.localeCompare(b.title, 'fr');

export function recipesList() {
  const q = S.ui.rcQuery.trim().toLowerCase(), f = S.ui.rcFilter;
  let list = ofKindAll('recipe');
  if (f === 'fav') list = list.filter(r => r.pinned);
  else if (f.startsWith('tag:')) list = list.filter(r => (r.tags || []).includes(f.slice(4)));
  else if (f === 'saison') {
    const s = S.ui.rcSeason || seasonOf();
    // la saison choisie d'abord, puis les recettes de toute l'année
    list = list.filter(r => inSeason(r, s)).sort((a, b) => (metaOf(a).seasons.length ? 0 : 1) - (metaOf(b).seasons.length ? 0 : 1) || byFav(a, b));
  }
  if (q) list = list.filter(r => matches(r, q));
  if (f !== 'saison') list.sort(byFav);
  if (list.length) return list.map(recipeRow).join('');
  return q || f !== 'all' ? empty('Aucune recette trouvée') : empty('Ta banque de recettes', 'Écris tes recettes avec leurs ingrédients : elles alimenteront la liste de courses.');
}

function filterChips() {
  const all = ofKindAll('recipe');
  const tags = [...new Set(all.flatMap(r => r.tags || []))].sort((a, b) => a.localeCompare(b, 'fr'));
  const f = S.ui.rcFilter;
  return `<div class="chips scroll">${[['all', 'Toutes'], ['fav', 'Favoris'], ...tags.map(t => ['tag:' + t, t]), ['saison', 'Saison ▾']].map(([v, l]) => chip(esc(l), f === v, 'rc-filter', v)).join('')}</div>`;
}
function seasonChips() {
  if (S.ui.rcFilter !== 'saison') return '';
  const cur = seasonOf(), sel = S.ui.rcSeason || cur;
  return `<div class="rc-seasons"><div class="rc-seasons-t">Saison · d’après la date</div><div class="chips wrap">${seasonOrder().map(s => chip(s + (s === cur ? ' · en cours' : ''), s === sel, 'rc-season-pick', s)).join('')}</div></div>`;
}

function selBar() {
  const n = (S.ui.rcSel || []).length;
  return n ? `<div class="rc-bar"><span class="muted small">${n} recette${n > 1 ? 's' : ''}</span><button class="link" data-act="rc-sel-clear">Vider</button><button class="btn primary" data-act="rc-prepare">Préparer les courses</button></div>` : '';
}
export const views = {};
views.recettes = () => ({
  title: 'Recettes',
  html: `<input id="rc-q" class="search" type="search" placeholder="Rechercher une recette ou un ingrédient" value="${esc(S.ui.rcQuery)}" data-live="recipes" autocomplete="off">
    ${filterChips()}${seasonChips()}
    <div id="rc-list" class="list">${recipesList()}</div>${selBar()}`,
  fab: (S.ui.rcSel || []).length ? undefined : 'recipe'
});
views.panier = panierView;
// ---------------------------------------------------------------------------
// Liste de courses : produits par rayon, ajout libre, cocher en magasin
// ---------------------------------------------------------------------------
export function shopRow(it) {
  const m = shopMeta(it), done = it.status === 'done';
  const q = [fmtQty(m.qty), m.unit].filter(Boolean).join(' '), promo = S.ui.shSort === 'store' ? '' : m.store;
  // toute la ligne coche ; la fiche s'ouvre par appui long ou par le bouton ⋯ (pas de zone morte entre les deux)
  return `<div class="row sh-row ${done ? 'done' : ''}" data-act="sh-check" data-long="edit" data-id="${it.id}">
    <button type="button" class="check ${done ? 'on' : ''}" aria-label="${done ? 'Remettre dans la liste' : 'Marquer comme pris'}"></button>
    <div class="row-main"><div class="row-title">${esc(it.title)}${q ? ` <span class="sh-q">${esc(q)}</span>` : ''}</div>${promo ? `<div class="sh-promo">${esc(promo)}</div>` : ''}${m.from?.length ? `<div class="sh-from">${esc(m.from.join(', '))}</div>` : ''}</div>
    <button type="button" class="icon-btn sh-more" data-act="edit" data-id="${it.id}" aria-label="Détails de ${esc(it.title)}">${I.menu}</button>
  </div>`;
}
const byName = (a, b) => a.title.localeCompare(b.title, 'fr');
const SORTS = [['aisle', 'Rayon'], ['store', 'Magasin']];
const sortChips = () => `<div class="chips scroll">${SORTS.map(([v, l]) => chip(l, (S.ui.shSort || 'aisle') === v, 'sh-sort', v)).join('')}</div>`;

// Rayons d'une liste de produits, dans l'ordre des rayons ; un rayon inconnu retombe dans Autre
function byAisle(list) {
  const groups = AISLES.map(a => [a, list.filter(i => aisleFor(i.title, shopMeta(i).aisle) === a).sort(byName)]).filter(([, l]) => l.length);
  const known = new Set(groups.flatMap(([, l]) => l.map(i => i.id)));
  const rest = list.filter(i => !known.has(i.id));
  if (rest.length) { const g = groups.find(([a]) => a === 'Autre'); if (g) g[1].push(...rest); else groups.push(['Autre', rest]); }
  return groups;
}
const aisleSec = ([a, l]) => `<section class="sec"><div class="sec-head"><h2>${esc(a)}</h2><span class="muted small">${l.length}</span></div>${l.map(shopRow).join('')}</section>`;

export function shopList() {
  const all = ofKindAll('shop_item');
  const todo = all.filter(i => i.status !== 'done'), done = all.filter(i => i.status === 'done').sort(byName);
  if (!all.length) return empty('Liste vide', 'Ajoute un produit ci-dessus, par exemple « 2 l de lait ».');
  let html;
  if (S.ui.shSort === 'store') {
    // un bloc par magasin, avec tous ses rayons ; puis les produits sans magasin
    const names = [...STORES, ...new Set(todo.map(i => shopMeta(i).store).filter(s => s && !STORES.includes(s)))];
    const blocks = [...names.map(s => [s, todo.filter(i => shopMeta(i).store === s)]), ['Sans magasin', todo.filter(i => !shopMeta(i).store)]].filter(([, l]) => l.length);
    html = blocks.map(([s, l]) => `<div class="sh-store"><h2 class="sh-store-h">${esc(s)}<span class="muted small">${l.length}</span></h2>${byAisle(l).map(aisleSec).join('')}</div>`).join('');
  } else html = byAisle(todo).map(aisleSec).join('');
  return html + (done.length ? `<section class="sec"><div class="sec-head"><h2>Pris</h2><button class="link" data-act="sh-clear">Vider</button></div>${done.map(shopRow).join('')}</section>` : '');
}

views.foyer = foyerView;
views.courses = () => ({
  title: 'Courses',
  html: `<form class="inline-add" data-form="sh-add"><input id="sh-new" placeholder="+ Ajouter un produit (2 l de lait)" enterkeyhint="done" autocomplete="off"></form>
    ${sortChips()}
    <div id="sh-list">${shopList()}</div>`
});
