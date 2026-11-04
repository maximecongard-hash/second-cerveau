import { esc, I, fRow, chip } from '../../core/util.js';
import { S, newItem, saveItem, patch } from '../../core/store.js';
import { SH, renderEditor, openEditor, sheetHead } from '../../core/ui.js';
import { linksBlock } from '../../core/links.js';
import { inFoyer, foyerEditor } from './foyer.js';
import { SEASONS, QUICK_TAGS, UNITS, metaOf, shopMeta, fmtQty, parseQty, parseIngredient } from './model.js';

// ---------------------------------------------------------------------------
// Éditeur d'une recette : titre, favori, parts, durée, tags, saisons, ingrédients, étapes
// ---------------------------------------------------------------------------
const DURS = [10, 15, 20, 30, 45, 60, 90, 120, 180];
const durOptions = cur => [['', '—'], ...[...new Set([...DURS, ...(cur ? [cur] : [])])].sort((a, b) => a - b).map(n => [n, n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ' ' + String(n % 60).padStart(2, '0') : ''}` : `${n} min`])];

function ingredientRow(g) {
  const f = (k, val, cls, ph, attrs = '') => `<input class="${cls}" data-rc="ing" data-id="${g.id}" data-k="${k}" value="${esc(val)}" placeholder="${ph}" autocomplete="off" ${attrs}>`;
  return `<div class="rc-ing">${f('qty', fmtQty(g.qty), 'rc-q', 'Qté', 'inputmode="decimal"')}${f('unit', g.unit, 'rc-u', 'Unité', 'list="rc-units"')}${f('name', g.name, 'rc-n', 'Ingrédient')}
    <button type="button" class="icon-btn" data-act="rc-ing-del" data-id="${g.id}" aria-label="Retirer l’ingrédient">${I.minus}</button></div>`;
}

// Produit de la liste de courses
function shopEditor(it) {
  const m = shopMeta(it), done = it.status === 'done';
  return `${sheetHead('Produit')}
    <input class="title-input" data-f="title" id="f-title" value="${esc(it.title)}" placeholder="Produit" autocomplete="off">
    <div class="fields">
      ${fRow('Quantité', `<div class="rc-ing" style="margin:0"><input class="rc-q" data-rc="shop" data-k="qty" value="${esc(fmtQty(m.qty))}" placeholder="Qté" inputmode="decimal" autocomplete="off"><input class="rc-u" data-rc="shop" data-k="unit" value="${esc(m.unit)}" placeholder="Unité" list="rc-units" autocomplete="off"></div><datalist id="rc-units">${UNITS.map(u => `<option value="${esc(u)}"></option>`).join('')}</datalist>`)}
      ${fRow('Statut', `<button type="button" class="chip ${done ? 'on' : ''}" data-act="sh-check" data-id="${it.id}">${done ? 'Pris' : 'À prendre'}</button>`)}
    </div>`;
}

export function editorHTML(it) {
  if (it.kind === 'shop_item') return shopEditor(it);
  if (it.kind === 'foyer') return foyerEditor(it);
  const m = metaOf(it);
  const head = sheetHead('Recette');
  const title = `<input class="title-input" data-f="title" id="f-title" value="${esc(it.title)}" placeholder="Nom de la recette" autocomplete="off">`;
  const tags = it.tags || [];
  const fields = `${fRow('Favori', `<button type="button" class="chip ${it.pinned ? 'on' : ''}" data-act="rc-fav" data-id="${it.id}">${I.heart}${it.pinned ? 'Dans les favoris' : 'Mettre en favori'}</button>`)}
    ${fRow('Pour', `<div class="rc-parts"><input type="number" min="1" max="99" inputmode="numeric" data-rc="servings" value="${m.servings}" aria-label="Nombre de parts"><span>parts</span></div>`)}
    ${fRow('Durée', `<select data-f="duration_min">${durOptions(it.duration_min).map(([v, l]) => `<option value="${v}" ${String(it.duration_min ?? '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    ${fRow('Tags', `<div class="chips wrap">${QUICK_TAGS.map(t => chip(esc(t), tags.includes(t), 'rc-tag', t)).join('')}</div>
      <input data-f="tags" value="${esc(tags.filter(t => !QUICK_TAGS.includes(t)).join(', '))}" placeholder="autres tags, séparés par des virgules" autocomplete="off">`)}
    ${fRow('Saisons', `<div class="chips wrap">${SEASONS.map(s => chip(s, m.seasons.includes(s), 'rc-season', s)).join('')}</div><div class="muted small">Rien de coché : toute l’année.</div>`)}`;
  const ings = `<datalist id="rc-units">${UNITS.map(u => `<option value="${esc(u)}"></option>`).join('')}</datalist>
    <div class="rc-ings">${m.ingredients.map(ingredientRow).join('') || '<div class="muted small pad">Aucun ingrédient. Écris-en un ci-dessous, par exemple « 250 g de farine ».</div>'}</div>
    <form class="inline-add" data-form="rc-ing-add" data-id="${it.id}"><input id="rc-ing-new" placeholder="+ Ingrédient (250 g de farine)" enterkeyhint="done" autocomplete="off"></form>`;
  return head + title +
    `<div class="fields">${fields}</div>
    <div class="sec-head rc-h"><h2>Ingrédients</h2></div>${ings}
    <div class="sec-head rc-h"><h2>Étapes et notes</h2></div>
    <textarea class="notes-input big" data-f="body" rows="8" placeholder="Étapes, astuces, source…">${esc(it.body)}</textarea>
    ${linksBlock(it, '')}`;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------
// Modifie une copie de meta puis l'enregistre
export function editMeta(id, fn) {
  const it = S.items.get(id);
  if (!it) return;
  const m = structuredClone(metaOf(it));
  fn(m);
  patch(id, { meta: m }, { render: false });
}
export function setField(id, f, v) {
  const it = S.items.get(id);
  if (!it) return;
  let val = v;
  if (f === 'tags') val = [...(it.tags || []).filter(t => QUICK_TAGS.includes(t)), ...v.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean)];
  else if (f === 'duration_min') val = v ? +v : null;
  patch(id, { [f]: val });
}
export function toggleIn(id, field, value) {
  const it = S.items.get(id);
  if (!it) return;
  if (field === 'tags') {
    const t = it.tags || [];
    patch(id, { tags: t.includes(value) ? t.filter(x => x !== value) : [...t, value] });
  } else editMeta(id, m => { m.seasons = m.seasons.includes(value) ? m.seasons.filter(x => x !== value) : [...m.seasons, value]; });
  renderEditor();
}
export function addIngredient(id, text) {
  const g = parseIngredient(text);
  editMeta(id, m => m.ingredients.push(g));
  renderEditor();
}
export function delIngredient(id, gid) { editMeta(id, m => { m.ingredients = m.ingredients.filter(g => g.id !== gid); }); renderEditor(); }
// Saisie dans une ligne d'ingrédient ou le nombre de parts (enregistrée à la sortie du champ)
export function editorChange(t) {
  if (t.dataset.rc === 'servings') {
    const n = Math.max(1, Math.min(99, Math.round(+t.value) || 4));
    editMeta(SH.editingId, m => { m.servings = n; });
    return true;
  }
  if (t.dataset.rc === 'shop') {
    const k = t.dataset.k;
    editMeta(SH.editingId, m => { m[k] = k === 'qty' ? parseQty(t.value) : t.value.trim(); });
    if (k === 'qty') t.value = fmtQty(parseQty(t.value));
    return true;
  }
  if (t.dataset.rc !== 'ing') return false;
  const { id, k } = t.dataset;
  editMeta(SH.editingId, m => {
    const g = m.ingredients.find(x => x.id === id);
    if (!g) return;
    if (k === 'qty') g.qty = parseQty(t.value);
    else g[k] = t.value.trim();
  });
  if (k === 'qty') t.value = fmtQty(parseQty(t.value));
  return true;
}

export function createAndEdit(fields = {}) {
  const it = saveItem(newItem({ kind: 'recipe', meta: { servings: 4, seasons: [], ingredients: [] }, ...inFoyer(), ...fields }));
  SH.draftId = it.id;
  openEditor(it.id, { focus: 'title' });
}
