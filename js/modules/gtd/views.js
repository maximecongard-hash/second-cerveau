import { esc, I, empty, sec, chip, md, today, ymd, parseYmd, addDays, daysBetween, cap, domain, plural, fmtDate, fmtDur, fmtAgo, FMT_LONG } from '../../core/util.js';
import { S, live, liveAll, ofKind, ofKindAll, byTitle, canEdit, isMine } from '../../core/store.js';
import { kindOwner, viewOwner, isEnabled } from '../../core/modules.js';
import { inboxItems, areas, projectsBy, nextActions, hasNextAction, topOf, sortTasks, timeStats } from './model.js';
import { historyHTML } from './history.js';
import { taskRow, starBtn, projectRow, planBtn } from './rows.js';
import { linkedSection, itemRow } from '../../core/links.js';
import { sharedWithMe, shareMeta, personName } from '../../core/share.js';

// ---------------------------------------------------------------------------
// Vues GTD (adresses inchangées : #/inbox, #/today, #/project/<id>…)
// ---------------------------------------------------------------------------
export const views = {};

views.inbox = () => {
  const list = inboxItems();
  const html = list.length
    ? `<a class="btn primary block" href="#/clarify">Trier l'Inbox (${list.length})</a>
       <div class="list">${list.map(it => `<div class="row" data-act="clarify-one" data-id="${it.id}">
          <div class="row-main"><div class="row-title">${esc(it.title) || '<i>Sans titre</i>'}</div>
          <div class="row-meta">${it.url ? `<span>${esc(domain(it.url))}</span>` : ''}${it.source === 'shortcut' ? '<span>Raccourci</span>' : ''}<span>${fmtAgo(it.created_at)}</span></div></div>
          ${it.image_path ? `<img class="thumb" data-img="${esc(it.image_path)}" alt="">` : ''}
        </div>`).join('')}</div>`
    : empty('Inbox vide', 'Capture une idée avec le raccourci iPhone ou le bouton +.');
  return { title: 'Inbox', html, fab: 'capture' };
};

views.clarify = arg => {
  const list = inboxItems();
  if (!list.length) return { title: 'Trier', html: empty('Tout est trié', '<a class="btn primary" href="#/today">Planifier ma journée</a>') };
  const it = (arg && list.find(i => i.id === arg)) || list[0];
  const btn = (v, label, sub, cls = '') => `<button class="clar ${cls}" data-act="clar" data-v="${v}" data-id="${it.id}"><b>${label}</b><span>${sub}</span></button>`;
  return {
    title: 'Trier',
    html: `<div class="clarify">
      <div class="muted small center">${plural(list.length, 'élément', 'éléments')} à trier</div>
      <div class="card">
        <textarea class="clar-title" rows="2" data-inline="title" data-id="${it.id}" aria-label="Titre">${esc(it.title)}</textarea>
        ${it.body ? `<div class="md">${md(it.body)}</div>` : ''}
        ${it.url ? `<a class="link-card" href="${esc(it.url)}" target="_blank" rel="noopener">${I.link}<span>${esc(domain(it.url))}</span></a>` : ''}
        ${it.image_path ? `<img class="cap-img" data-img="${esc(it.image_path)}" alt="">` : ''}
        <div class="muted small">Capturé ${fmtAgo(it.created_at)}${it.source === 'shortcut' ? ' · raccourci' : ''}</div>
      </div>
      <h3 class="q">Qu'est-ce que c'est ?</h3>
      <div class="clar-grid">
        ${btn('done', 'Fait', 'moins de 2 min, fais-le')}
        ${btn('today', "Aujourd'hui", 'à faire dans la journée')}
        ${btn('task', 'Prochaine action', 'à faire bientôt')}
        ${btn('project', 'Projet', 'plusieurs étapes')}
        ${btn('waiting', 'En attente', 'quelqu’un d’autre')}
        ${btn('someday', 'Un jour', 'peut-être, plus tard')}
        ${kindOwner('note') ? btn('note', 'Note', 'idée, référence') : ''}
        ${kindOwner('bookmark') ? btn('bookmark', 'Signet', 'lien à lire, à garder', it.url ? 'suggest' : '') : ''}
        ${btn('trash', 'Supprimer', 'pas utile', 'danger wide')}
      </div>
    </div>`
  };
};

views.today = () => {
  const day = S.ui.day, t0 = today(), isToday = day === t0;
  const ts = ofKind('task');
  const late = isToday ? ts.filter(t => t.status === 'active' && t.scheduled_date && t.scheduled_date < day).sort(sortTasks) : [];
  const due = isToday ? ts.filter(t => t.status === 'active' && t.due_date && t.due_date <= day && t.scheduled_date !== day && !(t.scheduled_date && t.scheduled_date < day)).sort(sortTasks) : [];
  const planned = ts.filter(t => t.scheduled_date === day && (t.status === 'active' || t.status === 'waiting'));
  const top = topOf(day).filter(t => t.status !== 'someday');
  const timed = planned.filter(t => t.scheduled_time && !t.focus).sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
  const untimed = planned.filter(t => !t.scheduled_time && !t.focus).sort((a, b) => (a.day_order ?? 1e15) - (b.day_order ?? 1e15) || a.created_at.localeCompare(b.created_at));
  const doneDay = ts.filter(t => t.status === 'done' && !(t.focus && t.scheduled_date === day) && (t.scheduled_date === day || (t.completed_at && ymd(new Date(t.completed_at)) === day)));
  const total = planned.reduce((s, t) => s + (t.duration_min || 0), 0);

  let html = `<div class="daynav">
      <button class="icon-btn" data-act="day" data-d="-1" aria-label="Jour précédent">${I.left}</button>
      <button class="daylabel" data-act="day" data-d="0">${cap(FMT_LONG.format(parseYmd(day)))}${isToday ? '' : `<small>${fmtDate(day)}</small>`}</button>
      <button class="icon-btn" data-act="day" data-d="1" aria-label="Jour suivant">${I.right}</button>
    </div>
    <div class="summary">${plural(planned.length, 'tâche', 'tâches')}${total ? ` · ${fmtDur(total)} estimées` : ''}${doneDay.length ? ` · ${doneDay.length} faite${doneDay.length > 1 ? 's' : ''}` : ''}</div>`;

  const inboxN = inboxItems().length;
  if (isToday && inboxN) html += `<a class="banner" href="#/clarify">${plural(inboxN, 'élément', 'éléments')} dans l'Inbox à trier</a>`;
  const lr = S.prefs.lastReview;
  if (isToday && (!lr || daysBetween(lr, t0) >= 7)) html += `<a class="banner soft" href="#/review">Revue hebdo ${lr ? `(dernière ${fmtAgo(parseYmd(lr).toISOString())})` : 'jamais faite'}</a>`;
  if (isToday && new Date().getHours() >= 17 && S.prefs.lastEvening !== t0) html += `<a class="banner evening" href="#/evening">${I.moon} Revue du soir · 5 min</a>`;

  const topDone = top.filter(t => t.status === 'done').length;
  html += sec(`Top 3${top.length ? ` <small>${topDone}/${top.length}</small>` : ''}`,
    top.length ? `<div class="top3">${top.map(t => taskRow(t, { showTime: true, extra: starBtn(t, day) })).join('')}</div>`
      : `<div class="muted pad small">Les 3 tâches qui feront de ${isToday ? 'cette journée' : 'ce jour'} une réussite. Touche l’étoile d’une tâche.</div>`);
  if (late.length) html += sec('En retard', late.map(t => taskRow(t, { showSched: true })).join(''), `<button class="link" data-act="carry">Tout mettre aujourd'hui</button>`);
  if (due.length) html += sec('Échéances', due.map(t => taskRow(t, { extra: planBtn(t) })).join(''));
  // module Agenda actif : lien vers la grille du même jour
  const ag = viewOwner('agenda');
  const agLink = ag && isEnabled(ag) ? `<a class="link" href="#/agenda" data-act="ag-open" data-d="${day}">Voir la grille</a>` : '';
  if (timed.length) html += sec('Agenda', `<div class="timeline">${timed.map(t => `<div class="slot"><div class="slot-time">${t.scheduled_time}</div>${taskRow(t, { extra: starBtn(t, day) })}</div>`).join('')}</div>`, agLink);

  const reorderBtn = untimed.length > 1 ? `<button class="link" data-act="reorder">${S.ui.reorder ? 'OK' : 'Réordonner'}</button>` : '';
  const rows = untimed.map((t, i) => taskRow(t, {
    extra: !S.ui.reorder ? starBtn(t, day) : `<div class="reorder"><button class="icon-btn" data-act="move" data-dir="-1" data-id="${t.id}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">${I.up}</button><button class="icon-btn" data-act="move" data-dir="1" data-id="${t.id}" ${i === untimed.length - 1 ? 'disabled' : ''} aria-label="Descendre">${I.down}</button></div>`
  })).join('');
  html += sec('À faire', (rows || `<div class="muted pad">Rien de prévu. Choisis parmi tes prochaines actions.</div>`) +
    `<form class="inline-add" data-form="add-day"><input id="add-day" placeholder="+ Ajouter une tâche pour ce jour" enterkeyhint="done" autocomplete="off"></form>
     <button class="btn block" data-act="pick-open">Choisir dans mes prochaines actions</button>`, reorderBtn);

  if (doneDay.length) html += `<details class="done-sec"><summary>${plural(doneDay.length, 'tâche terminée', 'tâches terminées')}</summary>${doneDay.map(t => taskRow(t)).join('')}</details>`;
  return { title: isToday ? "Aujourd'hui" : fmtDate(day), html, fab: 'today' };
};

views.actions = () => {
  const ctx = S.ui.ctx;
  const all = nextActions();
  let list = all;
  if (ctx === 'none') list = list.filter(t => !t.contexts.length);
  else if (ctx !== 'all') list = list.filter(t => t.contexts.includes(ctx));
  list = list.sort(sortTasks);
  const count = c => all.filter(t => t.contexts.includes(c)).length;
  const ctxs = [...new Set([...S.prefs.contexts, ...all.flatMap(t => t.contexts)])];
  const chips = `<div class="chips scroll">${chip('Toutes', ctx === 'all', 'ctx-filter', 'all', ` <small>${all.length}</small>`)}${ctxs.map(c => chip(esc(c), ctx === c, 'ctx-filter', c, ` <small>${count(c)}</small>`)).join('')}${chip('Sans contexte', ctx === 'none', 'ctx-filter', 'none')}</div>`;
  const t0 = today();
  const rows = list.map(t => taskRow(t, { showSched: t.scheduled_date !== t0, extra: t.scheduled_date === t0 ? '<span class="today-tag">Auj.</span>' : `<button class="plan-btn" data-act="plan-today" data-id="${t.id}" aria-label="Prévoir aujourd'hui">${I.sun}</button>` })).join('');
  return { title: 'Prochaines actions', html: chips + (rows ? `<div class="list">${rows}</div>` : empty('Aucune action ici', 'Trie ton Inbox ou ajoute une action avec +.')), fab: 'task' };
};

views.projects = () => {
  const act = projectsBy('active');
  const groups = areas().map(a => [a, act.filter(p => p.parent_id === a.id)]).filter(([, ps]) => ps.length);
  const orphan = act.filter(p => !p.parent_id || !S.items.get(p.parent_id) || S.items.get(p.parent_id).kind !== 'area' || S.items.get(p.parent_id).status === 'trashed');
  const clar = projectsBy('clarify');
  let html = clar.length ? sec('À clarifier', clar.map(projectRow).join('')) : '';
  html += groups.map(([a, ps]) => sec(esc(a.title), ps.map(projectRow).join(''))).join('');
  if (orphan.length) html += sec(groups.length ? 'Sans domaine' : 'Projets actifs', orphan.map(projectRow).join(''));
  const shared = sharedWithMe();
  if (shared.length) html += sec('Partagés avec moi', shared.map(itemRow).join(''));
  if (!act.length && !clar.length && !shared.length) html += empty('Aucun projet actif', 'Un projet = tout résultat qui demande plus d’une action.');
  const some = projectsBy('someday'), done = projectsBy('done');
  if (some.length) html += `<details class="done-sec"><summary>Un jour / peut-être (${some.length})</summary>${some.map(projectRow).join('')}</details>`;
  if (done.length) html += `<details class="done-sec"><summary>Terminés (${done.length})</summary>${done.map(projectRow).join('')}</details>`;
  return { title: 'Projets', html, fab: 'project' };
};

views.project = id => {
  const p = S.items.get(id);
  if (!p || p.status === 'trashed') return { title: 'Projet', html: empty('Projet introuvable', '<a class="btn" href="#/projects">Retour aux projets</a>') };
  const ts = ofKindAll('task').filter(t => t.parent_id === id);
  const ro = !canEdit(p);
  const active = ts.filter(t => t.status === 'active').sort(sortTasks);
  const waiting = ts.filter(t => t.status === 'waiting');
  const some = ts.filter(t => t.status === 'someday');
  const done = ts.filter(t => t.status === 'done').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
  // notes et signets rattachés au projet (module Notes, affichés via le registre)
  const notes = liveAll().filter(n => (n.kind === 'note' || n.kind === 'bookmark') && n.parent_id === id).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const area = p.parent_id && S.items.get(p.parent_id);
  const statusLabel = { active: 'Actif', someday: 'Un jour', done: 'Terminé', waiting: 'En attente', clarify: 'À clarifier' }[p.status];
  let html = `<a class="back" href="#/projects">${I.left} Projets</a>
    <div class="proj-head">
      <h2 class="proj-title">${esc(p.title) || '<i>Sans titre</i>'}</h2>
      <div class="row-meta"><span>${statusLabel}</span>${area ? `<span class="m-proj">${esc(area.title)}</span>` : ''}${p.due_date ? `<span class="m-due">Échéance ${fmtDate(p.due_date).toLowerCase()}</span>` : ''}${p.review_date ? `<span class="${p.review_date <= today() ? 'warn' : ''}">Revue ${fmtDate(p.review_date).toLowerCase()}</span>` : ''}${shareMeta(p)}${ro ? '<span>Lecture seule</span>' : ''}</div>
      ${p.outcome ? `<div class="outcome"><span>Résultat attendu</span>${esc(p.outcome)}</div>` : ''}
      ${p.body ? `<div class="md">${md(p.body)}</div>` : ''}
      <div class="btn-row"><button class="btn" data-act="edit" data-id="${p.id}">${ro ? 'Détails' : 'Modifier'}</button>${isMine(p) ? `<button class="btn" data-act="share-open" data-id="${p.id}">Partager</button>` : ''}${p.status !== 'done' && !ro ? `<button class="btn" data-act="proj-done" data-id="${p.id}">Projet terminé</button>` : ''}</div>
    </div>`;
  if (!isMine(p)) html += `<div class="banner soft">Projet de ${esc(personName(p.user_id))}</div>`;
  if (p.status === 'clarify') html += `<div class="banner warn">À clarifier : précise le résultat attendu et la prochaine action, puis passe le projet en Actif. <button class="link" data-act="proj-activate" data-id="${p.id}">Activer</button></div>`;
  else if (p.status === 'active' && !active.length) html += `<div class="banner warn">Aucune prochaine action : quelle est la prochaine étape concrète ?</div>`;
  html += sec('Actions', active.map(t => taskRow(t, { noProject: true, showSched: true })).join('') +
    (ro ? '' : `<form class="inline-add" data-form="add-proj" data-id="${p.id}"><input id="add-proj" placeholder="+ Ajouter une action" enterkeyhint="done" autocomplete="off"></form>`));
  if (waiting.length) html += sec('En attente', waiting.map(t => taskRow(t, { noProject: true })).join(''));
  if (some.length) html += sec('Un jour / peut-être', some.map(t => taskRow(t, { noProject: true })).join(''));
  if (kindOwner('note')) html += sec('Notes', notes.map(itemRow).join('') || '<div class="muted pad">Aucune note.</div>', `<button class="link" data-act="new-note" data-id="${p.id}">+ Note</button>`);
  html += linkedSection(p, new Set([...ts, ...notes].map(x => x.id)));
  if (done.length) html += `<details class="done-sec"><summary>${plural(done.length, 'action terminée', 'actions terminées')}</summary>${done.map(t => taskRow(t, { noProject: true })).join('')}</details>`;
  const hOpen = S.ui.histOpen?.[id];
  html += `<section class="sec"><div class="sec-head"><h2>Historique</h2><button class="link" data-act="hist-toggle" data-id="${id}">${hOpen ? 'Masquer' : 'Afficher'}</button></div>${hOpen ? historyHTML(id) : ''}</section>`;
  return { title: 'Projet', html, fab: ro ? undefined : 'proj-task:' + p.id };
};


views.waiting = () => {
  const list = ofKind('task').filter(t => t.status === 'waiting').sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { title: 'En attente', html: list.length ? `<div class="list">${list.map(t => taskRow(t, { extra: `<span class="muted small">${fmtAgo(t.created_at)}</span>` })).join('')}</div>` : empty('Rien en attente', 'Ce que tu as délégué ou attends de quelqu’un apparaîtra ici.') };
};

views.someday = () => {
  const list = live().filter(i => i.status === 'someday' && (i.kind === 'task' || i.kind === 'project')).sort(byTitle);
  const act = it => `<button class="link" data-act="activate" data-id="${it.id}">Activer</button>`;
  return {
    title: 'Un jour / peut-être',
    html: list.length ? `<div class="list">${list.map(it => it.kind === 'task' ? taskRow(it, { extra: act(it) }) : `<div class="row-wrap">${projectRow(it)}${act(it)}</div>`).join('')}</div>` : empty('Liste vide', 'Les envies et idées « plus tard » arriveront ici.')
  };
};

views.logbook = () => {
  const list = live().filter(i => i.status === 'done' && i.completed_at && (i.kind === 'task' || i.kind === 'project')).sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, 150);
  const groups = new Map();
  for (const it of list) { const d = ymd(new Date(it.completed_at)); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(it); }
  const html = [...groups].map(([d, its]) => sec(cap(fmtDate(d)), its.map(it => it.kind === 'project' ? projectRow(it) : taskRow(it)).join(''))).join('');
  return { title: 'Terminé', html: html || empty('Rien de terminé pour l’instant') };
};

function timeDesc() {
  const { n, real, planned } = timeStats();
  if (!n) return 'Chronomètre une tâche estimée (éditeur > Chrono) pour comparer le réel au prévu.';
  return `${plural(n, 'tâche chronométrée', 'tâches chronométrées')} cette semaine : ${fmtDur(real)} réel pour ${fmtDur(planned)} prévu (${Math.round(real / planned * 100)} %).`;
}
views.review = () => {
  const r = S.ui.review;
  const noNext = projectsBy('active').filter(p => !hasNextAction(p));
  const clar = projectsBy('clarify');
  const dueReview = ofKind('project').filter(p => p.review_date && p.review_date <= today() && p.status !== 'done');
  const waitingN = ofKind('task').filter(t => t.status === 'waiting').length;
  const someN = live().filter(i => i.status === 'someday').length;
  const lateN = ofKind('task').filter(t => t.status === 'active' && ((t.scheduled_date && t.scheduled_date < today()) || (t.due_date && t.due_date < today()))).length;
  const step = (k, title, desc) => `<div class="step ${r.has(k) ? 'ok' : ''}"><button class="check" data-act="review-check" data-v="${k}" aria-label="Valider"></button><div class="row-main"><div class="row-title">${title}</div><div class="step-desc">${desc}</div></div></div>`;
  const steps = [
    step('collect', 'Rassembler', 'Notes papier, mails, messages, idées en tête : tout dans l’Inbox.'),
    step('inbox', 'Vider l’Inbox', `${plural(inboxItems().length, 'élément', 'éléments')} à trier. <a href="#/clarify">Trier</a>`),
    step('late', 'Retards et échéances', `${plural(lateN, 'tâche', 'tâches')} en retard ou échue(s). <a href="#/today">Voir</a>`),
    step('time', 'Temps réel', timeDesc()),
    step('calendar', 'Calendrier', 'Revois la semaine passée et les 2 semaines à venir : quelque chose à préparer ?'),
    step('actions', 'Prochaines actions', 'Coche ce qui est fait, supprime ce qui n’a plus de sens. <a href="#/actions">Voir</a>'),
    step('projects', 'Projets', [
      noNext.length ? `Sans prochaine action : ${noNext.map(p => `<a href="#/project/${p.id}">${esc(p.title)}</a>`).join(', ')}` : 'Chaque projet actif a une prochaine action.',
      clar.length ? `À clarifier : ${clar.map(p => `<a href="#/project/${p.id}">${esc(p.title)}</a>`).join(', ')}` : '',
      dueReview.length ? `Date de revue atteinte : ${dueReview.map(p => `<a href="#/project/${p.id}">${esc(p.title)}</a>`).join(', ')}` : ''
    ].filter(Boolean).join('<br>')),
    step('waiting', 'En attente', `${waitingN} élément(s). Faut-il relancer quelqu’un ? <a href="#/waiting">Voir</a>`),
    step('someday', 'Un jour / peut-être', `${someN} élément(s). Quelque chose à activer ? <a href="#/someday">Voir</a>`),
    step('ideas', 'Nouvelles idées', 'Une dernière minute pour capturer ce qui te vient.')
  ].join('');
  const last = S.prefs.lastReview ? `Dernière revue : ${fmtDate(S.prefs.lastReview).toLowerCase()}` : 'Première revue';
  return { title: 'Revue hebdo', html: `<div class="muted small pad">${last}</div><div class="list">${steps}</div><button class="btn primary block" data-act="review-done">Revue terminée</button>` };
};

views.evening = () => {
  const t0 = today();
  const open = ofKind('task').filter(t => (t.status === 'active' || t.status === 'waiting') && t.scheduled_date && t.scheduled_date <= t0)
    .sort((a, b) => (a.focus || 9) - (b.focus || 9) || a.scheduled_date.localeCompare(b.scheduled_date) || (a.day_order ?? 1e15) - (b.day_order ?? 1e15));
  const doneToday = ofKind('task').filter(t => t.status === 'done' && t.completed_at && ymd(new Date(t.completed_at)) === t0);
  const top = topOf(t0);
  const inboxN = inboxItems().length;
  const card = t => `<div class="ev-card">${taskRow(t, { showSched: t.scheduled_date < t0 })}
    <div class="ev-actions">
      <button class="chip" data-act="ev" data-v="done" data-id="${t.id}">Fait</button>
      <button class="chip" data-act="ev" data-v="tomorrow" data-id="${t.id}">Demain</button>
      <button class="chip" data-act="ev" data-v="next" data-id="${t.id}">Sans date</button>
      <button class="chip" data-act="ev" data-v="waiting" data-id="${t.id}">En attente</button>
      <input type="date" class="ev-date" data-evdate="${t.id}" min="${addDays(t0, 1)}" aria-label="Autre date">
    </div></div>`;
  let html = `<div class="ev-summary"><div><b>${doneToday.length}</b><span>faite${doneToday.length > 1 ? 's' : ''}</span></div>
      <div><b>${top.filter(t => t.status === 'done').length}/${top.length || 0}</b><span>Top 3</span></div>
      <div><b>${open.length}</b><span>restante${open.length > 1 ? 's' : ''}</span></div></div>`;
  html += sec('1. Ce qui reste', open.length ? open.map(card).join('') + (open.length > 1 ? `<button class="btn block" data-act="ev-all">Tout reporter à demain</button>` : '')
    : '<div class="muted pad">Tout est traité ✓</div>');
  html += sec('2. Inbox', inboxN ? `<a class="btn block" href="#/clarify">Trier ${plural(inboxN, 'élément', 'éléments')}</a>` : '<div class="muted pad">Inbox vide ✓</div>');
  html += sec('3. Demain', `<div class="muted pad small">${plural(ofKind('task').filter(t => t.scheduled_date === addDays(t0, 1) && t.status === 'active').length, 'tâche prévue', 'tâches prévues')}. Choisis ton Top 3 dès maintenant pour démarrer vite.</div>
    <button class="btn block" data-act="plan-tomorrow">Préparer demain</button>`);
  html += `<button class="btn primary block" data-act="evening-done">Revue du soir terminée</button>`;
  return { title: 'Revue du soir', html };
};
