import { esc, empty } from '../../core/util.js';
import { newItem, saveItem, patch, ofKind, ofKindAll, isMine } from '../../core/store.js';
import { shareBlock } from '../../core/share.js';

// ---------------------------------------------------------------------------
// Foyer : élément racine `foyer`. Recettes et produits de courses y sont rattachés (`parent_id`),
// donc un seul partage (droit « modifier ») donne accès à tout : conjoint, compte agent.
// ---------------------------------------------------------------------------
export const foyer = () => ofKindAll('foyer').sort((a, b) => a.created_at.localeCompare(b.created_at))[0] || null;
// Champs de rattachement pour un nouvel élément du module
export const inFoyer = () => { const f = foyer(); return f ? { parent_id: f.id } : {}; };

// Crée le foyer et y rattache les recettes et produits que j'ai déjà
export function createFoyer() {
  if (foyer()) return foyer();
  const f = saveItem(newItem({ kind: 'foyer', title: 'Foyer' }), { render: false });
  for (const i of [...ofKind('recipe'), ...ofKind('shop_item')]) if (!i.parent_id) patch(i.id, { parent_id: f.id }, { render: false });
  return f;
}

export function foyerEditor(it) {
  return `<div class="sheet-head"><button class="link strong" data-act="close">OK</button><span class="sheet-kind">Foyer</span><span></span></div>
    <input class="title-input" data-f="title" id="f-title" value="${esc(it.title)}" placeholder="Nom du foyer" autocomplete="off">
    <div class="pad muted small">Les recettes et la liste de courses sont rangées dans le foyer. Les personnes avec qui tu le partages (conjoint, Claude) voient et modifient tout.</div>
    ${shareBlock(it)}`;
}

export function foyerView() {
  const f = foyer();
  const html = f
    ? `<div class="pad">${esc(f.title)} · ${isMine(f) ? 'tu en es le propriétaire' : 'partagé avec toi'}</div>
       ${shareBlock(f)}
       <div class="pad"><button class="btn" data-act="edit" data-id="${f.id}">Ouvrir le foyer</button></div>`
    : empty('Pas encore de foyer', 'Crée-le pour partager tes recettes et ta liste de courses avec ta femme ou avec Claude.<br><button class="btn primary" data-act="fy-create">Créer le foyer</button>');
  return { title: 'Foyer', html };
}
