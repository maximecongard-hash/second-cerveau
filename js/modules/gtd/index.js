import { esc, I, sec, today, addDays, switchBtn } from '../../core/util.js';
import { S, newItem, saveItem, ofKind, touchPrefs } from '../../core/store.js';
import { registerModule } from '../../core/modules.js';
import { queueRender, route } from '../../core/ui.js';
import { refreshEndAt, fmtClock, spentSec, DEFAULT_AREAS, inboxItems, areas, migrateAreas, somedayItems } from './model.js';
import { anyRow } from './rows.js';
import { views } from './views.js';
import { editorHTML, setField } from './sheets.js';
import { acts, forms, fab, onChange } from './actions.js';

// ---------------------------------------------------------------------------
// Module « Organisation » : le GTD d'origine (inbox, aujourd'hui, actions, projets)
// Les notes et signets vivent dans le module Notes (js/modules/notes)
// ---------------------------------------------------------------------------
function settings() {
  return sec('Contextes', `<div class="chips wrap">${S.prefs.contexts.map(c => `<span class="chip on">${esc(c)}<button class="x" data-act="ctx-del" data-v="${esc(c)}" aria-label="Retirer">×</button></span>`).join('')}</div>
      <form class="inline-add" data-form="ctx-add"><input id="ctx-add" placeholder="+ Nouveau contexte (ex. @voiture)" autocomplete="off"></form>`) +
    sec('Domaines de vie', areas().map(a => `<div class="row" data-act="edit" data-id="${a.id}"><div class="row-main"><div class="row-title">${esc(a.title)}</div></div><span class="chev">${I.right}</span></div>`).join('') +
      `<form class="inline-add" data-form="area-add"><input id="area-add" placeholder="+ Nouveau domaine" autocomplete="off"></form>`);
}

const notifSettings = () => `<div class="kv"><span class="row-main"><span class="row-title">Fin de créneau</span><span class="muted small">Une notification quand le créneau d’une tâche (heure + durée) se termine.</span></span>${switchBtn(S.prefs.endNotify, 'end-notify', 'Notification de fin de créneau')}</div>`;

// Premier lancement : domaines par défaut ; anciens comptes : migration des domaines
function afterSync() {
  let changed = false;
  if (!S.prefs.seeded) {
    if (!areas().length) DEFAULT_AREAS.forEach(t => saveItem(newItem({ kind: 'area', title: t }), { render: false }));
    S.prefs.seeded = true;
    S.prefs.areasV2 = true;
    touchPrefs();
    changed = true;
  }
  if (!S.prefs.areasV2) {
    migrateAreas();
    S.prefs.areasV2 = true;
    touchPrefs();
    changed = true;
  }
  // fin de créneau : l'instant de fin suit la date, l'heure, la durée et le réglage
  refreshEndAt();
  return changed;
}

// Chronomètres affichés (lignes et éditeur) : mis à jour chaque seconde
setInterval(() => {
  for (const el of document.querySelectorAll('[data-timer]')) {
    const t = S.items.get(el.dataset.timer);
    if (t) el.textContent = fmtClock(spentSec(t));
  }
}, 1000);

registerModule({
  id: 'gtd',
  label: 'Organisation',
  icon: I.checkCircle,
  description: 'Inbox, journée, prochaines actions et projets (méthode GTD).',
  defaultOn: true,
  home: 'today',
  tabs: [
    ['inbox', 'Inbox', I.inbox, () => inboxItems().length],
    ['today', "Aujourd'hui", I.sun],
    ['actions', 'Actions', I.list],
    ['projects', 'Projets', I.folder]
  ],
  tabOf: { clarify: 'inbox', project: 'projects', evening: 'today' },
  kinds: ['inbox', 'task', 'project', 'area', 'section', 'plog'],
  kindLabel: { inbox: 'Inbox', task: 'Tâche', project: 'Projet', area: 'Domaine', section: 'Section', plog: 'Frise' },
  views, acts, forms, fab,
  prefs: {
    contexts: ['@maison', '@bureau', '@ordi', '@tél', '@courses', '@dehors'],
    lastReview: null,
    lastEvening: null,
    seeded: false,
    areasV2: false,
    endNotify: true
  },
  ui: { day: today(), ctx: 'all', group: 'none', reorder: false, review: new Set() },
  badge: () => inboxItems().length,
  menu: () => [
    ['#/evening', 'Revue du soir'],
    ['#/waiting', 'En attente', ofKind('task').filter(t => t.status === 'waiting').length],
    ['#/someday', 'Un jour / peut-être', somedayItems().length],
    ['#/review', 'Revue hebdo'],
    ['#/recap', 'Récap d’activité'],
    ['#/logbook', 'Terminé']
  ],
  editor: editorHTML,
  setField,
  row: anyRow,
  searchable: it => !['area', 'section', 'plog'].includes(it.kind),
  settings,
  settingsMeta: 'Contextes · domaines',
  notifSettings,
  afterSync,
  onChange,
  onResume: () => { if (S.ui.day < today() && route().name === 'today') { S.ui.day = today(); queueRender(); } }
});
