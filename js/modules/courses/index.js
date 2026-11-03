import { $, I } from '../../core/util.js';
import { S, newItem, saveItem, patch, ofKindAll } from '../../core/store.js';
import { registerModule } from '../../core/modules.js';
import { SH, render, renderEditor, toast } from '../../core/ui.js';
import { KINDS, views, recipesList, recipeRow, shopRow } from './views.js';
import { editorHTML, setField, createAndEdit, toggleIn, addIngredient, delIngredient, editorChange } from './editor.js';
import { parseIngredient, shopFields, shopMeta, sameProduct } from './model.js';
import { STARTERS } from './starters.js';
import { createFoyer, inFoyer } from './foyer.js';

// ---------------------------------------------------------------------------
// Module « Courses » : banque de recettes (0.17). Panier, tri et liste partagée suivent.
// ---------------------------------------------------------------------------
const acts = {
  'rc-fav': el => {
    const it = S.items.get(el.dataset.id);
    if (!it) return;
    patch(it.id, { pinned: !it.pinned });
    if (SH.mode === 'editor') renderEditor();
  },
  'rc-filter': el => { const v = el.dataset.v; S.ui.rcFilter = S.ui.rcFilter === v ? 'all' : v; if (v === 'saison') S.ui.rcSeason = null; render(); },
  'rc-season-pick': el => { S.ui.rcSeason = el.dataset.v; render(); },
  'rc-tag': el => toggleIn(SH.editingId, 'tags', el.dataset.v),
  'rc-season': el => toggleIn(SH.editingId, 'seasons', el.dataset.v),
  'rc-ing-del': el => delIngredient(SH.editingId, el.dataset.id),
  'rc-starters': () => { const n = addStarters(); render(); toast(n ? `${n} recettes ajoutées` : 'Déjà là'); },
  'fy-create': () => { createFoyer(); render(); toast('Foyer créé'); },
  // liste de courses
  'sh-check': el => {
    const it = S.items.get(el.dataset.id);
    if (!it) return;
    patch(it.id, { status: it.status === 'done' ? 'active' : 'done', completed_at: it.status === 'done' ? null : new Date().toISOString() });
    if (SH.mode === 'editor') renderEditor();
  },
  'sh-clear': () => {
    const done = ofKindAll('shop_item').filter(i => i.status === 'done');
    done.forEach(i => patch(i.id, { status: 'trashed' }, { render: false }));
    render();
    toast(`${done.length} produit${done.length > 1 ? 's' : ''} retiré${done.length > 1 ? 's' : ''}`, () => { done.forEach(i => patch(i.id, { status: 'done' }, { render: false })); render(); });
  }
};

const forms = {
  'rc-ing-add': f => {
    const input = f.querySelector('input'), v = input.value.trim();
    if (!v) return;
    addIngredient(f.dataset.id, v);
    $('#rc-ing-new')?.focus();
  },
  'sh-add': f => {
    const input = f.querySelector('input'), v = input.value.trim();
    if (!v) return;
    addProduct(v);
    input.value = '';
    render();
  }
};

// Ajoute un produit ; un produit déjà à prendre avec la même unité voit sa quantité augmenter
function addProduct(text) {
  const fields = shopFields(text), m = fields.meta;
  const twin = ofKindAll('shop_item').find(i => i.status !== 'done' && sameProduct(i.title, fields.title) && shopMeta(i).unit === m.unit);
  if (!twin) { saveItem(newItem({ ...fields, ...inFoyer() }), { render: false }); return; }
  const tm = shopMeta(twin);
  if (m.qty != null && tm.qty != null) patch(twin.id, { meta: { ...tm, qty: Math.round((tm.qty + m.qty) * 100) / 100 } }, { render: false });
  else toast('Déjà dans la liste');
}
// Recettes de départ : ajoute celles dont le titre n'existe pas encore
function addStarters() {
  const have = new Set(ofKindAll('recipe').map(r => r.title.toLowerCase()));
  let n = 0;
  for (const [title, min, tags, seasons, ings, body] of STARTERS) {
    if (have.has(title.toLowerCase())) continue;
    saveItem(newItem({ kind: 'recipe', ...inFoyer(), title, duration_min: min, tags, body, meta: { servings: 4, seasons, ingredients: ings.map(parseIngredient) } }), { render: false });
    n++;
  }
  return n;
}

function onInput(t) {
  if (t.dataset.live !== 'recipes') return false;
  S.ui.rcQuery = t.value;
  $('#rc-list').innerHTML = recipesList();
  return true;
}
const fab = () => createAndEdit(S.ui.rcFilter.startsWith('tag:') ? { tags: [S.ui.rcFilter.slice(4)] } : {});

// Démo : la banque de départ (quelques favoris) et une liste en cours
function seedDemo() {
  addStarters();
  for (const r of ofKindAll('recipe')) if (['Lasagnes maison', 'Poulet curry coco', 'Chili sin carne'].includes(r.title)) patch(r.id, { pinned: true }, { render: false });
  for (const t of ['2 l de lait', '6 œufs', '1 kg de pommes de terre', 'pain', '400 g de bœuf haché', 'papier toilette']) addProduct(t);
}

registerModule({
  id: 'courses',
  label: 'Courses',
  icon: I.cart,
  description: 'Recettes, panier à trier et liste de courses partagée avec ton foyer.',
  defaultOn: false,
  home: 'recettes',
  tabs: [['recettes', 'Recettes', I.heart], ['courses', 'Listes', I.cart]],
  kinds: KINDS,
  kindLabel: { recipe: 'Recette', shop_item: 'Produit', foyer: 'Foyer' },
  tabOf: { foyer: 'courses' },
  menu: () => [['#/foyer', 'Foyer et partage']],
  views, acts, forms, fab,
  ui: { rcQuery: '', rcFilter: 'all', rcSeason: null },
  editor: editorHTML,
  setField,
  row: it => (it.kind === 'shop_item' ? shopRow(it) : recipeRow(it)),
  searchable: it => it.kind !== 'foyer',
  seedDemo,
  onInput,
  onChange: editorChange
});
