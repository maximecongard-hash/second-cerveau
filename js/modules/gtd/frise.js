import { esc, I, sec, plural, switchBtn, fmtDate, fRow, today } from '../../core/util.js';
import { S, ofKindAll, patch } from '../../core/store.js';
import { taskRow } from './rows.js';

// ---------------------------------------------------------------------------
// Sections, sous-sections et frise d'un projet (sans changement de schéma)
//  - section  : kind `section`, parent_id = projet, meta.sup = id de la section parente (sous-section)
//  - action   : reste rattachée au projet (parent_id), meta.sec = id de sa section
//  - entrée de frise : kind `plog`, parent_id = projet, title, body = recap,
//    meta = { types: ['feature'|'code'|'fix'|'design'], date: 'YYYY-MM-DD', version }
// ---------------------------------------------------------------------------
export const TYPES = [['feature', 'Fonctionnalité'], ['code', 'Code'], ['fix', 'Correction'], ['design', 'Design']];
export const typeLabel = Object.fromEntries(TYPES);

export const sectionsOf = pid => ofKindAll('section').filter(s => s.parent_id === pid);
const subsOf = (pid, sid) => sectionsOf(pid).filter(s => (s.meta?.sup || null) === sid).sort((a, b) => a.created_at.localeCompare(b.created_at));
const secOf = (t, ids) => (t.meta?.sec && ids.has(t.meta.sec) ? t.meta.sec : null);

// Options du champ « Section » de la fiche d'une action
export function sectionOptions(pid) {
  const out = [['', 'Aucune']];
  const walk = (sid, depth) => subsOf(pid, sid).forEach(s => { out.push([s.id, '— '.repeat(depth) + s.title]); walk(s.id, depth + 1); });
  walk(null, 0);
  return out;
}
// Mise à jour d'un champ de meta sans écraser les autres
export const setMeta = (id, f, v) => patch(id, { meta: { ...(S.items.get(id)?.meta || {}), [f]: v } });

// ---------------------------------------------------------------------------
// Actions : arbre de sections, terminées masquées derrière un interrupteur
// ---------------------------------------------------------------------------
export function actionsHTML(p, tasks, ro) {
  const pid = p.id;
  const ids = new Set(sectionsOf(pid).map(s => s.id));
  const showDone = !!S.ui.showDone?.[pid];
  const shown = tasks.filter(t => t.status === 'active' || (showDone && t.status === 'done'));
  const doneN = tasks.filter(t => t.status === 'done').length;
  const big = shown.length > 14; // gros projet : sections repliées au départ, pour rester lisible
  const count = sid => {
    const own = tasks.filter(t => (t.status === 'active' || t.status === 'done') && secOf(t, ids) === sid);
    return subsOf(pid, sid).reduce((a, s) => { const c = count(s.id); return [a[0] + c[0], a[1] + c[1]]; }, [own.length, own.filter(t => t.status === 'done').length]);
  };
  const row = t => taskRow(t, { noProject: true, showSched: true, extra: ro || t.status === 'done' || !ids.size ? '' : `<button class="mv-btn" data-act="move-open" data-id="${t.id}" aria-label="Déplacer vers une section">⇄</button>` });
  const form = (sid, ph) => ro ? '' : `<form class="inline-add" data-form="add-proj" data-id="${pid}" data-sec="${sid || ''}"><input placeholder="${ph}" enterkeyhint="done" autocomplete="off"></form>`;
  const node = (s, depth) => {
    const [n, d] = count(s.id), open = S.ui.secOpen?.[s.id] ?? !big;
    const mine = shown.filter(t => secOf(t, ids) === s.id).sort((a, b) => (a.status === 'done') - (b.status === 'done'));
    return `<div class="psec ${depth ? 'sub' : ''}">
      <div class="psec-h"><button class="psec-t" data-act="sec-toggle" data-id="${s.id}" data-open="${open}" aria-expanded="${open}"><span class="psec-chev ${open ? 'open' : ''}">${I.right}</span><span class="psec-name">${esc(s.title) || '<i>Sans titre</i>'}</span><span class="psec-count">${d} / ${n}</span></button>${ro ? '' : `<button class="psec-edit" data-act="edit" data-id="${s.id}" aria-label="Modifier la section">⋯</button>`}</div>
      <div class="psec-bar"><i style="width:${n ? Math.round(d / n * 100) : 0}%"></i></div>
      ${open ? `<div class="psec-body">${mine.map(row).join('')}${subsOf(pid, s.id).map(x => node(x, depth + 1)).join('')}${form(s.id, '+ Action')}${ro ? '' : `<form class="inline-add" data-form="add-sec" data-id="${pid}" data-sup="${s.id}"><input placeholder="+ Sous-section" enterkeyhint="done" autocomplete="off"></form>`}</div>` : ''}
    </div>`;
  };
  const loose = shown.filter(t => !secOf(t, ids)).sort((a, b) => (a.status === 'done') - (b.status === 'done'));
  const top = subsOf(pid, null);
  const [total, done] = [tasks.filter(t => t.status === 'active' || t.status === 'done').length, doneN];
  const bar = total ? `<div class="pcard-bar" aria-hidden="true"><i style="width:${Math.round(done / total * 100)}%"></i></div>` : '';
  const tools = `<div class="ptools"><span class="muted small">${plural(tasks.filter(t => t.status === 'active').length, 'action ouverte', 'actions ouvertes')}${top.length ? ` · ${plural(sectionsOf(pid).length, 'section', 'sections')}` : ''}</span>
    ${top.length ? `<button class="link" data-act="sec-all" data-id="${pid}" data-any="${top.some(x => (S.ui.secOpen?.[x.id] ?? !big))}">Tout replier / déplier</button>` : ''}</div>
    ${doneN ? `<div class="ptools"><span class="muted small">Afficher les terminées (${doneN})</span>${switchBtn(showDone, 'done-show', 'Afficher les terminées', pid)}</div>` : ''}`;
  return sec('Actions', tools + bar + loose.map(row).join('') + top.map(s => node(s, 0)).join('') +
    form(null, '+ Ajouter une action') +
    (ro ? '' : `<form class="inline-add" data-form="add-sec" data-id="${pid}" data-sup=""><input placeholder="+ Nouvelle section" enterkeyhint="done" autocomplete="off"></form>`));
}

// ---------------------------------------------------------------------------
// Frise : entrées du projet, plus récentes d'abord, filtre par type
// ---------------------------------------------------------------------------
export const logDate = e => e.meta?.date || e.created_at.slice(0, 10);
export const logsOf = pid => ofKindAll('plog').filter(e => e.parent_id === pid).sort((a, b) => logDate(b).localeCompare(logDate(a)) || b.created_at.localeCompare(a.created_at));

const tag = t => `<span class="ptag t-${t}">${typeLabel[t] || esc(t)}</span>`;
export function friseHTML(p, ro) {
  const pid = p.id, f = S.ui.friseF?.[pid] || 'all';
  const all = logsOf(pid);
  const list = all.filter(e => f === 'all' || (e.meta?.types || []).includes(f));
  const chips = `<div class="chips scroll"><button class="chip ${f === 'all' ? 'on' : ''}" data-act="frise-f" data-id="${pid}" data-v="all">Tout</button>${TYPES.map(([v, l]) => `<button class="chip t-${v} ${f === v ? 'on' : ''}" data-act="frise-f" data-id="${pid}" data-v="${v}"><i class="pdot"></i>${l}</button>`).join('')}</div>`;
  const items = list.map(e => `<div class="fev t-${(e.meta?.types || [])[0] || 'code'}" data-act="edit" data-id="${e.id}">
      <i class="pdot big"></i>
      <div class="fev-h"><b>${esc(e.title) || '<i>Sans titre</i>'}</b> <span class="muted small">${e.meta?.version ? esc(e.meta.version) + ' · ' : ''}${esc(fmtDate(logDate(e)).toLowerCase())}</span></div>
      ${e.body ? `<p class="fev-p">${esc(e.body)}</p>` : ''}
      <div>${(e.meta?.types || []).map(tag).join('')}</div></div>`).join('');
  const add = ro ? '' : `<button class="link" data-act="plog-new" data-id="${pid}">+ Entrée</button>`;
  return sec('Frise', (all.length ? chips : '') + (items ? `<div class="ftl">${items}</div>` : `<div class="muted pad">${all.length ? 'Aucune entrée de ce type.' : 'Aucune entrée : la frise se remplit à chaque commit.'}</div>`), add);
}

// Éditeur d'une section et d'une entrée de frise
export function sectionEditor(it) {
  const pid = it.parent_id, n = pid ? ofKindAll('task').filter(t => t.parent_id === pid && t.meta?.sec === it.id && t.status !== 'trashed').length : 0;
  return `<input class="title-input" data-f="title" id="f-title" value="${esc(it.title)}" placeholder="Nom de la section" autocomplete="off">
    <div class="muted small pad">${plural(n, 'action', 'actions')} dans cette section</div>`;
}
export function logEditor(it) {
  const m = it.meta || {}, types = m.types || [];
  return `<input class="title-input" data-f="title" id="f-title" value="${esc(it.title)}" placeholder="Titre court" autocomplete="off">
    <textarea class="notes-input" data-f="body" rows="3" placeholder="Recap en une ou deux phrases">${esc(it.body)}</textarea>
    <div class="fields">
      ${fRow('Types', `<div class="chips wrap">${TYPES.map(([v, l]) => `<button class="chip t-${v} ${types.includes(v) ? 'on' : ''}" data-act="plog-type" data-v="${v}"><i class="pdot"></i>${l}</button>`).join('')}</div>`)}
      ${fRow('Date', `<input type="date" data-f="pl_date" value="${m.date || today()}">`)}
      ${fRow('Version', `<input data-f="pl_version" value="${esc(m.version || '')}" placeholder="0.28.0" autocomplete="off">`)}
    </div>`;
}
