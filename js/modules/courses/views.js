import { esc, I, empty, chip, fmtDur } from '../../core/util.js';
import { S, ofKind } from '../../core/store.js';
import { KINDS, metaOf, seasonOf, seasonOrder, inSeason } from './model.js';

// ---------------------------------------------------------------------------
// Banque de recettes : liste, recherche, filtres (favoris, tags, saison)
// Le filtre « Saison » propose d'abord la saison en cours (d'après la date), sans trier la liste tant qu'on ne l'a pas choisi.
// ---------------------------------------------------------------------------
export { KINDS };
const heart = on => `<button type="button" class="rc-heart ${on ? 'on' : ''}" aria-pressed="${on}" aria-label="${on ? 'Retirer des favoris' : 'Mettre en favori'}">${I.heart}</button>`;

export function recipeRow(r) {
  const m = metaOf(r), n = m.ingredients.length;
  const meta = [r.duration_min ? fmtDur(r.duration_min) : '', ...(r.tags || []).map(t => esc(t)), m.seasons.length ? esc(m.seasons.join(' / ')) : '', n ? `${n} ingrédient${n > 1 ? 's' : ''}` : ''].filter(Boolean);
  return `<div class="row" data-act="edit" data-id="${r.id}">
    <div class="row-main"><div class="row-title">${esc(r.title) || '<i>Sans titre</i>'}</div>
    ${meta.length ? `<div class="row-meta">${meta.map(x => `<span>${x}</span>`).join('')}</div>` : ''}</div>
    <span data-act="rc-fav" data-id="${r.id}">${heart(r.pinned)}</span>
  </div>`;
}

const matches = (r, q) => (r.title + ' ' + r.body + ' ' + (r.tags || []).join(' ') + ' ' + metaOf(r).ingredients.map(g => g.name).join(' ')).toLowerCase().includes(q);
const byFav = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.title.localeCompare(b.title, 'fr');

export function recipesList() {
  const q = S.ui.rcQuery.trim().toLowerCase(), f = S.ui.rcFilter;
  let list = ofKind('recipe');
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
  const all = ofKind('recipe');
  const tags = [...new Set(all.flatMap(r => r.tags || []))].sort((a, b) => a.localeCompare(b, 'fr'));
  const f = S.ui.rcFilter;
  return `<div class="chips scroll">${[['all', 'Toutes'], ['fav', 'Favoris'], ...tags.map(t => ['tag:' + t, t]), ['saison', 'Saison ▾']].map(([v, l]) => chip(esc(l), f === v, 'rc-filter', v)).join('')}</div>`;
}
function seasonChips() {
  if (S.ui.rcFilter !== 'saison') return '';
  const cur = seasonOf(), sel = S.ui.rcSeason || cur;
  return `<div class="rc-seasons"><div class="rc-seasons-t">Saison · d’après la date</div><div class="chips wrap">${seasonOrder().map(s => chip(s + (s === cur ? ' · en cours' : ''), s === sel, 'rc-season-pick', s)).join('')}</div></div>`;
}

export const views = {};
views.recettes = () => ({
  title: 'Recettes',
  html: `<input id="rc-q" class="search" type="search" placeholder="Rechercher une recette ou un ingrédient" value="${esc(S.ui.rcQuery)}" data-live="recipes" autocomplete="off">
    ${filterChips()}${seasonChips()}
    <div id="rc-list" class="list">${recipesList()}</div>`,
  fab: 'recipe'
});
views.courses = () => ({
  title: 'Listes',
  html: empty('Bientôt ici', 'Les recettes cochées alimenteront un panier à trier, puis la liste de courses partagée avec ton foyer.')
});
