import { $, I, esc, sec } from '../../core/util.js';
import { S, newItem, saveItem, patch, ofKindAll, savePrefs } from '../../core/store.js';
import { registerModule } from '../../core/modules.js';
import { SH, render, renderEditor, toast, openEditor } from '../../core/ui.js';
import { KINDS, views, recipesList, recipeRow, shopRow } from './views.js';
import { editorHTML, setField, createAndEdit, toggleIn, addIngredient, delIngredient, editorChange } from './editor.js';

const aisleOpts = cur => AISLES.map(a => `<option ${a === cur ? 'selected' : ''}>${esc(a)}</option>`).join('');
import { parseIngredient, AISLES, productKey } from './model.js';
import { addProduct, findOnList } from './shop.js';
import { panierActs } from './panier.js';
import { STARTERS } from './starters.js';
import { createFoyer, inFoyer } from './foyer.js';
import { toggleDone, toggleWeek, clearDone } from './semaine.js';

// ---------------------------------------------------------------------------
// Module « Courses » : banque de recettes, panier, liste de courses, foyer partagé.
// ---------------------------------------------------------------------------
let shLast = { id: '', t: 0 };
const acts = {
  ...panierActs,
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
  'rc-have-del': el => {
    const before = S.prefs.rcHave;
    S.prefs.rcHave = before.filter(x => x !== el.dataset.v);
    savePrefs();
    toast('Retiré du placard', () => { S.prefs.rcHave = before; savePrefs(); });
  },
  'rc-aisle-del': el => {
    const before = S.prefs.rcAisles || {}, next = { ...before };
    delete next[el.dataset.v];
    S.prefs.rcAisles = next;
    savePrefs();
    toast('Rayon oublié', () => { S.prefs.rcAisles = before; savePrefs(); });
  },
  'fy-create': () => { createFoyer(); render(); toast('Foyer créé'); },
  // liste de courses
  'wk-done': el => { toggleDone(el.dataset.id); render(); },
  'wk-clear': () => { clearDone(); render(); },
  'wk-toggle': el => { toggleWeek(el.dataset.id); renderEditor(); },
  'sh-sort': el => { S.ui.shSort = el.dataset.v; render(); },
  'sh-check': el => {
    const it = S.items.get(el.dataset.id);
    if (!it) return;
    // la ligne se déplace après un cochage : un second toucher trop rapide ne doit pas la redécocher
    if (shLast.id === it.id && Date.now() - shLast.t < 300) return;
    shLast = { id: it.id, t: Date.now() };
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
  'rc-aisle-add': f => {
    const input = f.querySelector('input'), name = input.value.trim();
    if (!name) return;
    const key = productKey(name);
    if (!key) return;
    S.prefs.rcAisles = { ...(S.prefs.rcAisles || {}), [key]: { n: name, a: f.querySelector('select').value } };
    savePrefs();
    input.value = '';
    toast('Rayon retenu');
  },
  'sh-add': f => {
    const input = f.querySelector('input'), v = input.value.trim();
    if (!v) return;
    const twin = findOnList(v);
    input.value = '';
    if (twin) { toast('Déjà dans la liste : fiche ouverte'); openEditor(twin.id); return; }
    addProduct(v);
    render();
  }
};

function settings() {
  const have = S.prefs.rcHave || [], aisles = Object.entries(S.prefs.rcAisles || {}).sort((a, b) => a[1].n.localeCompare(b[1].n, 'fr'));
  return sec('Foyer', `<div class="muted small pad">Recettes et liste de courses, à partager avec les personnes de ton choix.</div>
      <div class="btn-row"><a class="btn" href="#/foyer">Foyer et partage</a></div>`) +
    sec('Rayons', `<div class="muted small pad">Le rayon est deviné d’après le nom du produit. Ici, tu imposes un rayon pour un produit : il sera retenu, au pluriel comme au singulier.</div>
      <form class="inline-add" data-form="rc-aisle-add"><input placeholder="+ Produit (courgette)" autocomplete="off"><select>${aisleOpts('Autre')}</select><button class="btn" type="submit">Ajouter</button></form>
      ${aisles.map(([k, v]) => `<div class="f-row"><label>${esc(v.n)}</label><div class="f-val"><select data-rc="aisle-map" data-k="${esc(k)}">${aisleOpts(v.a)}</select><button type="button" class="icon-btn" data-act="rc-aisle-del" data-v="${esc(k)}" aria-label="Oublier ${esc(v.n)}">${I.minus}</button></div></div>`).join('') || '<div class="muted pad">Aucun rayon imposé.</div>'}`) +
    sec('Placard', `<div class="muted small pad">Produits marqués « Déjà là » dans le panier : ils y seront pré-cochés la prochaine fois.</div>
      ${have.length ? `<div class="chips wrap">${have.map(x => `<button type="button" class="chip" data-act="rc-have-del" data-v="${esc(x)}">${esc(x)} ×</button>`).join('')}</div>` : '<div class="muted pad">Rien pour l’instant.</div>'}`);
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
  for (const [title, min, tags, seasons, ings, body] of STARTERS) {
    saveItem(newItem({ kind: 'recipe', ...inFoyer(), title, duration_min: min, tags, body, meta: { servings: 4, seasons, ingredients: ings.map(parseIngredient) } }), { render: false });
  }
  for (const r of ofKindAll('recipe')) if (['Lasagnes maison', 'Poulet curry coco', 'Chili sin carne'].includes(r.title)) patch(r.id, { pinned: true }, { render: false });
  for (const t of ['2 l de lait', '6 œufs', '1 kg de pommes de terre', 'pain', '400 g de bœuf haché', 'papier toilette']) addProduct(t);
}

registerModule({
  id: 'courses',
  label: 'Courses',
  icon: I.cart,
  description: 'Banque de recettes, panier de la semaine et liste de courses, à partager avec ton foyer.',
  defaultOn: false,
  home: 'recettes',
  tabs: [['recettes', 'Recettes', I.heart], ['semaine', 'Semaine', I.calendar], ['courses', 'Liste', I.cart]],
  kinds: KINDS,
  kindLabel: { recipe: 'Recette', shop_item: 'Produit', foyer: 'Foyer' },
  tabOf: { foyer: 'courses', panier: 'recettes' },
  menu: () => [['#/foyer', 'Foyer et partage']],
  views, acts, forms, fab,
  prefs: { rcHave: [], rcAisles: {}, rcWeek: { w: '', l: [] } },
  ui: { rcQuery: '', rcFilter: 'all', rcSeason: null, rcSel: [], rcParts: {}, pnHave: {}, shSort: 'aisle' },
  editor: editorHTML,
  setField,
  row: it => (it.kind === 'shop_item' ? shopRow(it) : recipeRow(it)),
  searchable: it => it.kind !== 'foyer',
  keepKinds: ['foyer'],
  settings,
  settingsMeta: 'Foyer · rayons · placard',
  seedDemo,
  onInput,
  onChange: t => {
    if (t.dataset.rc === 'aisle-map') {
      const cur = (S.prefs.rcAisles || {})[t.dataset.k];
      if (cur) { S.prefs.rcAisles = { ...S.prefs.rcAisles, [t.dataset.k]: { ...cur, a: t.value } }; savePrefs(); }
      return true;
    }
    return editorChange(t);
  }
});
