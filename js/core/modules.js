import { S, DEFAULT_PREFS } from './state.js';

// ---------------------------------------------------------------------------
// Registre des modules (thèmes de la barre latérale)
//
// Un module est un objet :
//   id, label, icon, description   identité affichée dans la barre et les réglages
//   defaultOn, preview             activé par défaut ? encore en aperçu ?
//   home                           vue ouverte quand on choisit le module
//   tabs                           [[vue, libellé, icône, badge?()]] onglets du module
//   tabOf                          { vue: onglet } pour les sous-vues
//   views, acts, forms             vues (#/nom/arg), actions data-act, formulaires data-form
//   fab(v)                         bouton + des vues du module (la vue renvoie { fab: v })
//   kinds                          types d'éléments dont il gère l'éditeur et l'affichage
//   kindLabel                      { kind: libellé } affiché dans les liens (« Tâche », « Note »…)
//   editor(it), setField(id, f, v) éditeur des éléments de ses kinds
//   row(it), searchable(it)        ligne de résultat de recherche
//   prefs, ui                      valeurs par défaut ajoutées à S.prefs et S.ui
//   badge(), menu(), settings()    pastille, entrées du menu ⋯, contenu du groupe du module dans les réglages
//   settingsMeta                   résumé affiché sous le titre de ce groupe replié
//   afterSync(), seedDemo()        initialisations (renvoie true si quelque chose a changé)
//   onInput(el), onChange(el)      saisies propres au module (renvoie true si traité)
//   onResume()                     retour au premier plan
//   schedulable                    kinds que l'Agenda peut placer comme des tâches (['workout'])
//   endNotify                      kinds qui reçoivent une notification de fin de créneau (end_at)
//   todayRows(day)                 HTML ajouté à « Aujourd'hui » (section du module)
//   reviewStep()                   { key, title, desc } étape ajoutée à la revue hebdo
//   createAt(kind, day, t)         crée un élément de ce module à une heure (bouton « + » de la feuille « Placer à… » de l'Agenda)
//   eveningHtml()                  HTML ajouté à la revue du soir
// ---------------------------------------------------------------------------
export const MODULES = [];
export const VIEWS = {};
export const ACTS = {};
export const FORMS = {};
const VIEW_OWNER = {};

export function registerModule(m) {
  MODULES.push(m);
  for (const [name, fn] of Object.entries(m.views || {})) { VIEWS[name] = fn; VIEW_OWNER[name] = m; }
  Object.assign(ACTS, m.acts || {});
  Object.assign(FORMS, m.forms || {});
  Object.assign(DEFAULT_PREFS, m.prefs || {});
  Object.assign(S.ui, m.ui || {});
}

export const getModule = id => MODULES.find(m => m.id === id) || null;
export const viewOwner = name => VIEW_OWNER[name] || null;
export const kindOwner = kind => MODULES.find(m => m.kinds?.includes(kind)) || null;

// Ordre et activation choisis par l'utilisateur, complétés par les modules ajoutés depuis
export function moduleOrder() {
  const saved = (S.prefs.modules || []).filter(x => getModule(x.id));
  for (const m of MODULES) if (!saved.some(x => x.id === m.id)) saved.push({ id: m.id, on: !!m.defaultOn });
  return saved.map(x => ({ ...x }));
}
export function enabledModules() {
  const on = moduleOrder().filter(x => x.on).map(x => getModule(x.id));
  return on.length ? on : MODULES.slice(0, 1);
}
export const isEnabled = m => enabledModules().includes(m);
// Kinds que l'Agenda sait placer : les tâches, plus ceux que déclare un module actif (schedulable)
export const isSchedulable = it => it.kind === 'task' || (kindOwner(it.kind)?.schedulable?.includes(it.kind) && isEnabled(kindOwner(it.kind)));
export const notifiesEnd = it => it.kind === 'task' || !!kindOwner(it.kind)?.endNotify?.includes(it.kind);
// Contributions des modules actifs à une vue du cœur : `hook(m)` renvoie du HTML ou rien
export const fromModules = (name, ...args) => enabledModules().map(m => m[name]?.(...args)).filter(Boolean);
