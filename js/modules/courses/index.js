import { $, I } from '../../core/util.js';
import { S, newItem, saveItem, patch } from '../../core/store.js';
import { registerModule } from '../../core/modules.js';
import { SH, render, renderEditor } from '../../core/ui.js';
import { KINDS, views, recipesList, recipeRow } from './views.js';
import { editorHTML, setField, createAndEdit, toggleIn, addIngredient, delIngredient, editorChange } from './editor.js';
import { parseIngredient } from './model.js';

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
  'rc-ing-del': el => delIngredient(SH.editingId, el.dataset.id)
};

const forms = {
  'rc-ing-add': f => {
    const input = f.querySelector('input'), v = input.value.trim();
    if (!v) return;
    addIngredient(f.dataset.id, v);
    $('#rc-ing-new')?.focus();
  }
};

function onInput(t) {
  if (t.dataset.live !== 'recipes') return false;
  S.ui.rcQuery = t.value;
  $('#rc-list').innerHTML = recipesList();
  return true;
}
const fab = () => createAndEdit(S.ui.rcFilter.startsWith('tag:') ? { tags: [S.ui.rcFilter.slice(4)] } : {});

// Démo : une petite banque de saison
function seedDemo() {
  const add = (title, min, tags, seasons, ings, body, fav = false) => saveItem(newItem({
    kind: 'recipe', title, duration_min: min, tags, body, pinned: fav,
    meta: { servings: 4, seasons, ingredients: ings.map(parseIngredient) }
  }), { render: false });
  add('Lasagnes maison', 90, ['Batch cooking'], [], ['250 g de feuilles de lasagne', '400 g de bœuf haché', '2 oignons', '500 g de tomates concassées', '50 cl de béchamel', '250 g de mozzarella', '60 g de parmesan'], 'Faire revenir les oignons et la viande, ajouter les tomates, monter les couches et cuire 35 min à 190 °C.', true);
  add('Soupe de potimarron', 25, ['Rapide', 'Batch cooking'], ['Automne', 'Hiver'], ['1 kg de potimarron', '2 oignons', '1 gousse d’ail', '20 cl de crème', '1 l de bouillon', 'sel', 'poivre'], 'Cuire le potimarron dans le bouillon, mixer, finir avec la crème.');
  add('Poulet curry coco', 30, ['Rapide'], [], ['600 g de poulet', '40 cl de lait de coco', '2 c. à c. de curry', '1 oignon', '200 g de riz'], 'Dorer le poulet, ajouter le curry puis le lait de coco, laisser mijoter 15 min.', true);
  add('Gratin dauphinois', 70, [], ['Automne', 'Hiver'], ['1 kg de pommes de terre', '30 cl de crème', '20 cl de lait', '1 gousse d’ail', '1 pincée de noix de muscade'], 'Couper les pommes de terre en fines rondelles, couvrir de crème et de lait, cuire 1 h à 160 °C.');
  add('Chili sin carne', 50, ['Batch cooking'], ['Automne', 'Hiver'], ['400 g de haricots rouges', '500 g de tomates concassées', '1 poivron', '1 oignon', '2 c. à c. de paprika'], 'Tout mijoter 35 min, servir avec du riz.', true);
  add('Salade de lentilles', 15, ['Rapide'], ['Été', 'Printemps'], ['250 g de lentilles vertes', '2 tomates', '1 oignon rouge', '3 c. à s. d’huile d’olive', 'persil'], 'Cuire les lentilles, assaisonner tièdes.');
  add('Tarte aux fraises', 40, [], ['Printemps', 'Été'], ['1 pâte sablée', '500 g de fraises', '25 cl de crème pâtissière'], 'Garnir le fond cuit, ranger les fraises.');
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
  kindLabel: { recipe: 'Recette' },
  views, acts, forms, fab,
  ui: { rcQuery: '', rcFilter: 'all', rcSeason: null },
  editor: editorHTML,
  setField,
  row: recipeRow,
  searchable: () => true,
  seedDemo,
  onInput,
  onChange: editorChange
});
