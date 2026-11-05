import { esc, empty } from '../../core/util.js';
import { S, savePrefs } from '../../core/store.js';
import { render, toast } from '../../core/ui.js';
import { AISLES, metaOf, fmtQty, guessAisle, productKey } from './model.js';
import { addShop } from './shop.js';

// ---------------------------------------------------------------------------
// Panier : les recettes cochées, leurs ingrédients fusionnés, puis le tri « déjà là / à acheter » avant la liste.
// Les produits marqués « déjà là » sont retenus (S.prefs.rcHave) et pré-cochés la fois suivante.
// ---------------------------------------------------------------------------
export const selected = () => (S.ui.rcSel || []).map(id => S.items.get(id)).filter(r => r && r.status !== 'trashed');
const partsOf = r => S.ui.rcParts[r.id] ?? metaOf(r).servings;

export function basketLines() {
  const map = new Map();
  for (const r of selected()) {
    const m = metaOf(r), k = partsOf(r) / (m.servings || 1);
    for (const g of m.ingredients) {
      const key = productKey(g.name) + '|' + (g.unit || '');
      const l = map.get(key) || { key, name: g.name, unit: g.unit || '', qty: null, from: [] };
      if (g.qty != null) l.qty = (l.qty ?? 0) + g.qty * k;
      if (!l.from.includes(r.title)) l.from.push(r.title);
      map.set(key, l);
    }
  }
  const rank = l => AISLES.indexOf(l.aisle);
  return [...map.values()].map(l => ({ ...l, qty: l.qty == null ? null : Math.round(l.qty * 100) / 100, aisle: guessAisle(l.name) }))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'fr'));
}
const haveOf = l => S.ui.pnHave[l.key] ?? (S.prefs.rcHave || []).includes(productKey(l.name));

function line(l) {
  const have = haveOf(l), q = [fmtQty(l.qty), l.unit].filter(Boolean).join(' ');
  return `<div class="pn-line ${have ? 'have' : ''}" data-act="pn-toggle" data-k="${esc(l.key)}"><div class="row-main"><div class="row-title">${esc(l.name)}${q ? ` <span class="sh-q">${esc(q)}</span>` : ''}</div><div class="sh-from">${esc(l.from.join(', '))}</div></div>
    <div class="seg small"><button type="button" class="${have ? 'on' : ''}" data-act="pn-set" data-k="${esc(l.key)}" data-v="1">Déjà là</button><button type="button" class="${have ? '' : 'on'}" data-act="pn-set" data-k="${esc(l.key)}" data-v="0">Acheter</button></div></div>`;
}

export function panierView() {
  const recipes = selected();
  if (!recipes.length) return { title: 'Panier', html: empty('Panier vide', 'Coche des recettes dans la banque, puis prépare les courses.') };
  const lines = basketLines(), buy = lines.filter(l => !haveOf(l)).length;
  const groups = AISLES.map(a => [a, lines.filter(l => l.aisle === a)]).filter(([, l]) => l.length);
  return {
    title: 'Panier',
    html: `<section class="sec"><div class="sec-head"><h2>Recettes</h2></div>${recipes.map(r => `<div class="pn-rec"><div class="row-main"><div class="row-title">${esc(r.title)}</div></div>
        <span class="pn-step"><button type="button" class="icon-btn" data-act="pn-parts" data-id="${r.id}" data-d="-1" aria-label="Moins de parts">−</button><span>${partsOf(r)} parts</span><button type="button" class="icon-btn" data-act="pn-parts" data-id="${r.id}" data-d="1" aria-label="Plus de parts">+</button></span>
        <button type="button" class="link" data-act="rc-sel" data-id="${r.id}">Retirer</button></div>`).join('')}</section>
      <div class="muted small pad">Indique ce que tu as déjà : seul le reste ira dans la liste.</div>
      ${groups.map(([a, l]) => `<section class="sec"><div class="sec-head"><h2>${esc(a)}</h2></div>${l.map(line).join('')}</section>`).join('')}
      <div class="rc-bar"><span class="muted small">${buy} à acheter · ${lines.length - buy} déjà là</span><button class="btn primary" data-act="pn-send">Envoyer à la liste</button></div>`
  };
}

export const panierActs = {
  'rc-sel': el => {
    const id = el.dataset.id, sel = S.ui.rcSel || [];
    S.ui.rcSel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
    render();
  },
  'rc-sel-clear': () => { S.ui.rcSel = []; render(); },
  'rc-prepare': () => { S.ui.pnHave = {}; location.hash = '#/panier'; },
  'pn-parts': el => {
    const r = S.items.get(el.dataset.id);
    if (r) S.ui.rcParts[r.id] = Math.max(1, Math.min(99, partsOf(r) + +el.dataset.d));
    render();
  },
  // toute la ligne bascule entre « Déjà là » et « Acheter »
  'pn-toggle': el => { const l = basketLines().find(x => x.key === el.dataset.k); if (l) S.ui.pnHave[l.key] = !haveOf(l); render(); },
  'pn-set': el => { S.ui.pnHave[el.dataset.k] = el.dataset.v === '1'; render(); },
  'pn-send': () => {
    const have = new Set(S.prefs.rcHave || []);
    let n = 0;
    for (const l of basketLines()) {
      const pk = productKey(l.name);
      if (haveOf(l)) { have.add(pk); continue; }
      have.delete(pk);
      addShop({ title: l.name, meta: { qty: l.qty, unit: l.unit, aisle: l.aisle, stage: 'list' }, from: l.from });
      n++;
    }
    S.prefs.rcHave = [...have];
    S.ui.rcSel = []; S.ui.rcParts = {}; S.ui.pnHave = {};
    savePrefs();
    location.hash = '#/courses';
    toast(n ? `${n} produit${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} à la liste` : 'Rien à acheter');
  }
};
