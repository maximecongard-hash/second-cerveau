import { DEMO, sb } from '../../core/config.js';
import { esc, FMT_TIME, ymd, fmtDate } from '../../core/util.js';
import { S, meId } from '../../core/store.js';
import { SH, queueRender, renderEditor } from '../../core/ui.js';
import { firstName } from '../../core/share.js';

// ---------------------------------------------------------------------------
// Historique d'un projet : évènements écrits par le trigger log_item_event (supabase/011_historique.sql)
// ---------------------------------------------------------------------------
const DONE = { created: 'créé', done: 'terminé', reopened: 'rouvert', trashed: 'mis à la corbeille', restored: 'restauré', deleted: 'supprimé définitivement',
  renamed: 'renommé', moved_in: 'rangé dans ce projet', moved_out: 'retiré de ce projet' };

// Évènements en cache, par projet : S.ui.events[projectId] = { rows, loading, err }
export function loadEvents(projectId) {
  const ev = (S.ui.events ??= {});
  if (ev[projectId]?.loading) return;
  ev[projectId] = { ...ev[projectId], loading: true, err: null };
  const done = (rows, err) => {
    ev[projectId] = { rows: rows || ev[projectId]?.rows || [], loading: false, err };
    if (SH.mode === 'editor') renderEditor(); else queueRender();
  };
  if (DEMO) { done((S.ui.demoEvents || []).filter(e => e.project_id === projectId)); return; }
  sb.from('item_events').select('*').eq('project_id', projectId).order('at', { ascending: false }).limit(100).then(({ data, error }) => {
    done(data, error ? (/item_events|schema cache/i.test(error.message) ? 'Historique indisponible : passe supabase/011_historique.sql.' : error.message) : null);
  });
}

function line(e) {
  const who = !e.actor ? 'Quelqu’un' : e.actor === meId() ? 'Tu' : firstName(e.actor);
  const aux = e.actor === meId() ? 'as' : 'a';
  const d = new Date(e.at);
  const when = `${fmtDate(ymd(d)).toLowerCase()} ${FMT_TIME.format(d)}`;
  const extra = e.action === 'renamed' && e.detail ? ` <span class="muted">(avant : ${esc(e.detail)})</span>`
    : e.action === 'moved_in' && e.detail ? ` <span class="muted">(depuis ${esc(e.detail)})</span>`
    : e.action === 'moved_out' && e.detail ? ` <span class="muted">(vers ${esc(e.detail)})</span>` : '';
  return `<div class="hist-row"><div>${esc(who)} ${aux} ${DONE[e.action] || esc(e.action)} « ${esc(e.title) || '<i>sans titre</i>'} »${extra}</div><div class="muted small">${when}</div></div>`;
}

// itemId : ne garder que les évènements d'une tâche (fiche d'action) ; sinon tout le projet
export function historyHTML(projectId, itemId) {
  if (!projectId) return '<div class="muted small pad">Pas d’historique : la tâche n’est dans aucun projet.</div>';
  const st = S.ui.events?.[projectId];
  if (!st || (st.loading && !st.rows)) return '<div class="muted small pad">Chargement…</div>';
  if (st.err) return `<div class="err pad">${esc(st.err)}</div>`;
  const rows = itemId ? st.rows.filter(e => e.item_id === itemId) : st.rows;
  return rows.length ? `<div class="hist">${rows.map(line).join('')}</div>` : '<div class="muted small pad">Rien pour l’instant.</div>';
}
