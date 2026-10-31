import { esc, I, sec, today, addDays } from '../../core/util.js';
import { S, newItem, saveItem, ofKind } from '../../core/store.js';
import { registerModule } from '../../core/modules.js';
import { queueRender, route } from '../../core/ui.js';
import { DEFAULT_AREAS, inboxItems, areas, migrateAreas, somedayItems } from './model.js';
import { anyRow } from './rows.js';
import { views } from './views.js';
import { editorHTML, setField } from './sheets.js';
import { acts, forms, onInput, onChange } from './actions.js';

// ---------------------------------------------------------------------------
// Module « Organisation » : le GTD d'origine (inbox, aujourd'hui, actions, projets, notes)
// ---------------------------------------------------------------------------
function settings() {
  return sec('Contextes', `<div class="chips wrap">${S.prefs.contexts.map(c => `<span class="chip on">${esc(c)}<button class="x" data-act="ctx-del" data-v="${esc(c)}" aria-label="Retirer">×</button></span>`).join('')}</div>
      <form class="inline-add" data-form="ctx-add"><input id="ctx-add" placeholder="+ Nouveau contexte (ex. @voiture)" autocomplete="off"></form>`) +
    sec('Domaines de vie', areas().map(a => `<div class="row" data-act="edit" data-id="${a.id}"><div class="row-main"><div class="row-title">${esc(a.title)}</div></div><span class="chev">${I.right}</span></div>`).join('') +
      `<form class="inline-add" data-form="area-add"><input id="area-add" placeholder="+ Nouveau domaine" autocomplete="off"></form>`) +
    sec('Rappels Apple', `<div class="muted small pad">Nom du raccourci qui crée un rappel :</div>
      <form class="inline-add" data-form="reminder-name"><input id="reminder-name" value="${esc(S.prefs.reminderShortcut)}" autocomplete="off"></form>`);
}

// Premier lancement : domaines par défaut ; anciens comptes : migration des domaines
function afterSync() {
  let changed = false;
  if (!S.prefs.seeded) {
    if (!areas().length) DEFAULT_AREAS.forEach(t => saveItem(newItem({ kind: 'area', title: t }), { render: false }));
    S.prefs.seeded = true;
    S.prefs.areasV2 = true;
    S.prefsDirty = true;
    changed = true;
  }
  if (!S.prefs.areasV2) {
    migrateAreas();
    S.prefs.areasV2 = true;
    S.prefsDirty = true;
    changed = true;
  }
  return changed;
}

function seedDemo() {
  const t0 = today();
  const a = DEFAULT_AREAS.map(t => saveItem(newItem({ kind: 'area', title: t }), { render: false }));
  const p1 = saveItem(newItem({ kind: 'project', title: 'Préparer les vacances de Noël', parent_id: a[7].id, outcome: 'Billets et logement réservés avant le 15/11.' }), { render: false });
  const p2 = saveItem(newItem({ kind: 'project', title: 'Refaire le site perso', parent_id: a[2].id, review_date: t0 }), { render: false });
  saveItem(newItem({ kind: 'project', title: 'Changer de mutuelle', status: 'clarify', parent_id: a[4].id }), { render: false });
  const add = f => saveItem(newItem(f), { render: false });
  add({ kind: 'inbox', title: 'Idée : podcast sur la productivité', source: 'shortcut' });
  add({ kind: 'inbox', title: 'https://example.com/article-gtd', url: 'https://example.com/article-gtd', source: 'shortcut' });
  add({ kind: 'inbox', title: 'Appeler le garagiste pour le contrôle technique' });
  add({ kind: 'task', title: 'Comparer les prix des billets de train', parent_id: p1.id, contexts: ['@ordi'], duration_min: 30, scheduled_date: t0, day_order: 1, focus: 1 });
  add({ kind: 'task', title: 'Courses pour le dîner', contexts: ['@courses'], scheduled_date: t0, scheduled_time: '18:30', duration_min: 45 });
  add({ kind: 'task', title: 'Répondre au mail de Julie', contexts: ['@ordi'], scheduled_date: t0, day_order: 2, duration_min: 15 });
  add({ kind: 'task', title: 'Payer la facture d’électricité', contexts: ['@ordi'], due_date: addDays(t0, 2), recurrence: 'monthly' });
  add({ kind: 'task', title: 'Choisir un thème pour le site', parent_id: p2.id, contexts: ['@ordi'], energy: 'high' });
  add({ kind: 'task', title: 'Devis du plombier', status: 'waiting', waiting_for: 'M. Durand', contexts: [] });
  add({ kind: 'task', title: 'Apprendre la guitare', status: 'someday' });
  add({ kind: 'note', title: 'Principes GTD', body: '# Les 5 étapes\n1. **Capturer**\n2. Clarifier\n3. Organiser\n4. Réfléchir (revue)\n5. Agir\n\nVoir aussi [[Idées de projets]] #productivité' });
  add({ kind: 'note', title: 'Idées de projets', body: '- Newsletter mensuelle\n- [ ] Atelier photo\n\n#idées' });
  S.prefs.seeded = true;
  S.prefs.areasV2 = true;
}

registerModule({
  id: 'gtd',
  label: 'Organisation',
  icon: I.checkCircle,
  description: 'Inbox, journée, prochaines actions, projets et notes (méthode GTD).',
  defaultOn: true,
  home: 'today',
  tabs: [
    ['inbox', 'Inbox', I.inbox, () => inboxItems().length],
    ['today', "Aujourd'hui", I.sun],
    ['actions', 'Actions', I.list],
    ['projects', 'Projets', I.folder],
    ['notes', 'Notes', I.note]
  ],
  tabOf: { clarify: 'inbox', project: 'projects', evening: 'today' },
  kinds: ['inbox', 'task', 'project', 'note', 'area'],
  views, acts, forms,
  prefs: {
    contexts: ['@maison', '@bureau', '@ordi', '@tél', '@courses', '@dehors'],
    lastReview: null,
    reminderShortcut: 'Rappel GTD',
    lastEvening: null,
    seeded: false,
    areasV2: false
  },
  ui: { day: today(), ctx: 'all', reorder: false, noteTag: null, noteQuery: '', preview: false, review: new Set() },
  badge: () => inboxItems().length,
  menu: () => [
    ['#/evening', 'Revue du soir'],
    ['#/waiting', 'En attente', ofKind('task').filter(t => t.status === 'waiting').length],
    ['#/someday', 'Un jour / peut-être', somedayItems().length],
    ['#/review', 'Revue hebdo'],
    ['#/logbook', 'Terminé']
  ],
  editor: editorHTML,
  setField,
  row: anyRow,
  searchable: it => it.kind !== 'area',
  settings,
  afterSync,
  seedDemo,
  onInput,
  onChange,
  onResume: () => { if (S.ui.day < today() && route().name === 'today') { S.ui.day = today(); queueRender(); } }
});
