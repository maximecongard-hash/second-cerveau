import { uuid } from '../../core/util.js';

// ---------------------------------------------------------------------------
// Modèle des recettes. Une recette est un élément `recipe` ; les étapes vivent dans `body`,
// les tags dans `tags`, le favori dans `pinned`, la durée dans `duration_min`, le reste dans `meta` :
//   { servings, seasons: ['Automne', ...], ingredients: [{ id, qty, unit, name }] }
// `seasons` vide = toute l'année. `qty` est un nombre ou null (« sel », « un peu de »).
// ---------------------------------------------------------------------------
export const KINDS = ['recipe'];
export const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
export const QUICK_TAGS = ['Rapide', 'Batch cooking'];
export const UNITS = ['g', 'kg', 'mg', 'ml', 'cl', 'l', 'c. à s.', 'c. à c.', 'pincée', 'sachet', 'boîte', 'gousse', 'tranche', 'botte'];

// Saison d'une date : bascules aux 20 mars, 21 juin, 22 septembre, 21 décembre
export function seasonOf(d = new Date()) {
  const v = (d.getMonth() + 1) * 100 + d.getDate();
  return v >= 1221 || v < 320 ? 'Hiver' : v < 621 ? 'Printemps' : v < 922 ? 'Été' : 'Automne';
}
// Saison en cours d'abord, puis les suivantes dans l'ordre de l'année
export function seasonOrder(d = new Date()) {
  const i = SEASONS.indexOf(seasonOf(d));
  return [...SEASONS.slice(i), ...SEASONS.slice(0, i)];
}

export const defaultMeta = () => ({ servings: 4, seasons: [], ingredients: [] });
export const metaOf = it => ({ ...defaultMeta(), ...(it.meta || {}) });
export const ingredientsOf = it => metaOf(it).ingredients;
export const newIngredient = (name = '', qty = null, unit = '') => ({ id: uuid().slice(0, 8), qty, unit, name });

export const fmtQty = n => (n == null ? '' : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
export const parseQty = v => {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return null;
  const f = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  const n = f ? +f[1] / +f[2] : parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
export const ingredientText = g => [fmtQty(g.qty), g.unit, g.name].filter(Boolean).join(' ');

const UNIT_ALIAS = { cs: 'c. à s.', càs: 'c. à s.', cc: 'c. à c.', càc: 'c. à c.' };
const UNIT_RE = 'kg|mg|g|ml|cl|l|c\\. ?à ?s\\.?|c\\. ?à ?c\\.?|cs|cc|càs|càc|pincées?|sachets?|boîtes?|gousses?|tranches?|bottes?';
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
// « 250 g de farine » → { qty: 250, unit: 'g', name: 'farine' } ; « sel » → { qty: null, unit: '', name: 'sel' }
export function parseIngredient(text) {
  const t = text.trim();
  const m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?(?:\\s*/\\s*\\d+)?|[½¼¾])?\\s*(?:(${UNIT_RE})(?=\\s|$))?\\s*(?:de |d['’] ?|du |des )?(.*)$`, 'i'));
  if (!m) return newIngredient(t);
  let qty = m[1] ? (FRAC[m[1]] ?? parseQty(m[1])) : null;
  let unit = (m[2] || '').toLowerCase().replace(/\s+/g, ' ');
  unit = UNIT_ALIAS[unit.replace(/[ .]/g, '')] || unit.replace(/(s)$/, '').replace(/^c\.?à\.?s\.?$/, 'c. à s.').replace(/^c\.?à\.?c\.?$/, 'c. à c.');
  if (/^c\. ?à ?s/.test(unit)) unit = 'c. à s.';
  if (/^c\. ?à ?c/.test(unit)) unit = 'c. à c.';
  const name = m[3].trim();
  if (!name) return newIngredient(t);
  return newIngredient(name, qty, qty == null ? '' : unit);
}

// Recette visible pour une saison : elle la cite, ou elle n'a pas de saison (toute l'année)
export const inSeason = (it, s) => { const ss = metaOf(it).seasons; return !ss.length || ss.includes(s); };
