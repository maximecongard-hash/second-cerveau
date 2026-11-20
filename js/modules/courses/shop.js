import { newItem, saveItem, patch, ofKindAll } from '../../core/store.js';
import { toast } from '../../core/ui.js';
import { inFoyer } from './foyer.js';
import { shopFields, shopMeta, sameProduct } from './model.js';

// ---------------------------------------------------------------------------
// Ajout à la liste de courses : un produit déjà à prendre avec la même unité voit sa quantité augmenter
// `from` : titres des recettes d'où vient le produit (affichés sous son nom)
// ---------------------------------------------------------------------------
export function addShop({ title, meta, from = [] }) {
  const twin = ofKindAll('shop_item').find(i => i.status !== 'done' && sameProduct(i.title, title) && shopMeta(i).unit === meta.unit);
  if (!twin) { saveItem(newItem({ kind: 'shop_item', title, meta: { ...meta, from }, ...inFoyer() }), { render: false }); return; }
  const tm = shopMeta(twin), mf = [...new Set([...(tm.from || []), ...from])];
  const qty = meta.qty != null && tm.qty != null ? Math.round((tm.qty + meta.qty) * 100) / 100 : tm.qty;
  if (meta.qty != null && tm.qty != null || mf.length !== (tm.from || []).length) patch(twin.id, { meta: { ...tm, qty, from: mf } }, { render: false });
  else toast('Déjà dans la liste');
}
// Produit déjà à prendre sous ce nom (toute unité) : sert à ouvrir sa fiche plutôt que d'ajouter un doublon
export const findOnList = text => { const n = shopFields(text).title; return ofKindAll('shop_item').find(i => i.status !== 'done' && sameProduct(i.title, n)); };
export const addProduct = text => addShop(shopFields(text));
