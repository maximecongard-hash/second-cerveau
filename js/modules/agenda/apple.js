import { DEMO, CFG, LS_KEY, sb } from '../../core/config.js';
import { esc, sec, today, addDays, fmtDate, FMT_TIME } from '../../core/util.js';
import { S, live, savePrefs } from '../../core/store.js';
import { SH, sheet, showSheet, render, queueRender, toast } from '../../core/ui.js';

// ---------------------------------------------------------------------------
// Calendrier Apple, dans les deux sens et en lecture seule :
//   Brain vers Calendrier : lien d'abonnement ICS (Edge Function « calendrier », jeton calendrier)
//   Calendrier vers Brain : table events, remplie par le raccourci « Agenda Apple »
// Les événements sont gardés à part des éléments : ils ne se modifient que dans Calendrier.
// ---------------------------------------------------------------------------
const EV_KEY = LS_KEY + '.events';
const EVERY = 5 * 60 * 1000;   // relecture au plus toutes les 5 minutes
const EV = { list: [], at: 0, uid: null, loading: false, missing: false };

try {
  const d = JSON.parse(localStorage.getItem(EV_KEY) || 'null');
  if (d) Object.assign(EV, { list: d.list || [], uid: d.uid || null, fetched: d.fetched || null });
} catch { /* cache illisible : il sera relu */ }

const save = () => { try { localStorage.setItem(EV_KEY, JSON.stringify({ uid: EV.uid, list: EV.list, fetched: EV.fetched })); } catch { /* plein */ } };

export async function loadEvents(force = false) {
  if (DEMO || !sb || !S.user || EV.loading) return;
  if (!force && Date.now() - EV.at < EVERY) return;
  EV.loading = true; EV.at = Date.now();
  const { data, error } = await sb.from('events').select('id, calendar, title, location, starts_at, ends_at, all_day')
    .gte('starts_at', addDays(today(), -31)).order('starts_at').limit(3000);
  EV.loading = false;
  if (error) {
    // table absente tant que supabase/005_calendrier.sql n'est pas passé : on se tait
    EV.missing = /events|schema cache|does not exist/i.test(error.message || '');
    if (!EV.missing) console.warn('events', error);
    return;
  }
  EV.missing = false;
  EV.list = data; EV.uid = S.user.id; EV.fetched = new Date().toISOString();
  save();
  queueRender();
}

// ---------------------------------------------------------------------------
// Lecture par jour
// ---------------------------------------------------------------------------
const dayOf = ts => ts.slice(0, 10);
const timeOf = ts => ts.slice(11, 16);
const all = () => (S.prefs.agApple === false || (!DEMO && EV.uid && S.user && EV.uid !== S.user.id) ? [] : EV.list);
// Un créneau de Brain revenu par l'abonnement (calendrier renommé) : on ne l'affiche pas deux fois
const twin = (e, day) => live().some(i => i.scheduled_date === day && i.scheduled_time?.slice(0, 5) === timeOf(e.starts_at)
  && (i.title || '').trim().toLowerCase() === e.title.trim().toLowerCase());

export const eventById = id => EV.list.find(e => e.id === id);
// Événements à une heure qui commencent ce jour-là (coupés à minuit dans la grille)
export const eventsOn = day => all().filter(e => !e.all_day && dayOf(e.starts_at) === day && !twin(e, day));
// Journées entières qui couvrent ce jour (la fin d'Apple tombe à minuit le lendemain ou à 23:59)
export const allDayOn = day => all().filter(e => {
  if (!e.all_day) return false;
  let end = dayOf(e.ends_at);
  if (end > dayOf(e.starts_at) && timeOf(e.ends_at) === '00:00') end = addDays(end, -1);
  return dayOf(e.starts_at) <= day && day <= end;
});
// Minutes depuis minuit, fin bornée à 24 h
export function span(e) {
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const s = toMin(timeOf(e.starts_at));
  const end = dayOf(e.ends_at) > dayOf(e.starts_at) ? 24 * 60 : toMin(timeOf(e.ends_at));
  return [s, Math.max(end, s + 15)];
}

// ---------------------------------------------------------------------------
// Fiche d'un événement (lecture seule)
// ---------------------------------------------------------------------------
export function openEvent(id) {
  const e = eventById(id);
  if (!e) return;
  SH.mode = 'ag-event';
  const d = dayOf(e.starts_at);
  const when = e.all_day ? 'Journée entière'
    : `${timeOf(e.starts_at)} – ${dayOf(e.ends_at) > d ? `${fmtDate(dayOf(e.ends_at)).toLowerCase()} ` : ''}${timeOf(e.ends_at)}`;
  sheet.innerHTML = `<div class="sheet-head"><span></span><span class="sheet-kind">Calendrier</span><button class="link strong" data-act="close">Fermer</button></div>
    <h2 class="ag-ev-title">${esc(e.title) || '<i>Sans titre</i>'}</h2>
    <div class="fields">
      <div class="f-row"><label>Date</label><div class="f-val">${esc(fmtDate(d))}</div></div>
      <div class="f-row"><label>Heure</label><div class="f-val">${esc(when)}</div></div>
      ${e.location ? `<div class="f-row"><label>Lieu</label><div class="f-val">${esc(e.location)}</div></div>` : ''}
      ${e.calendar ? `<div class="f-row"><label>Agenda</label><div class="f-val">${esc(e.calendar)}</div></div>` : ''}
    </div>
    <div class="muted small pad">Événement de Calendrier, en lecture seule. Modifie-le dans l’app Calendrier : Brain le reprendra au prochain passage du raccourci.</div>`;
  showSheet();
}

// ---------------------------------------------------------------------------
// Réglages > Agenda > Calendrier Apple
// ---------------------------------------------------------------------------
const feedUrl = t => `${CFG.url}/functions/v1/calendrier?token=${t}`;

async function loadCalTokens() {
  const { data, error } = await sb.from('calendar_tokens').select('token, created_at').order('created_at');
  S.ui.calTokens = error ? [] : data;
  S.ui.calErr = error ? (/calendar_tokens|schema cache/i.test(error.message) ? 'Base à mettre à jour : passe supabase/005_calendrier.sql.' : error.message) : null;
  queueRender();
}

export function appleSettings() {
  const on = S.prefs.agApple !== false;
  let feed;
  if (DEMO) feed = '<div class="muted pad">Indisponible en mode démo.</div>';
  else {
    if (S.ui.calTokens === undefined) { S.ui.calTokens = null; loadCalTokens(); }
    const ts = S.ui.calTokens;
    feed = ts === null ? '<div class="muted pad">Chargement…</div>'
      : ts.length ? ts.map(t => `<div class="kv"><code class="token">${esc(feedUrl(t.token).replace(/token=.*/, 'token=…'))}</code>
          <div class="btn-row"><a class="btn" href="${esc(feedUrl(t.token).replace(/^https:/, 'webcal:'))}">S’abonner</a>
          <button class="btn" data-act="copy" data-v="${esc(feedUrl(t.token))}">Copier</button>
          <button class="btn danger" data-act="cal-token-del" data-v="${esc(t.token)}">Révoquer</button></div></div>`).join('')
      : `<button class="btn block" data-act="cal-token-new">Créer le lien d’abonnement</button>`;
    if (S.ui.calErr) feed += `<div class="err pad">${esc(S.ui.calErr)}</div>`;
  }
  const n = EV.list.filter(e => dayOf(e.starts_at) >= today()).length;
  const status = DEMO ? `${n} événements d’exemple`
    : EV.missing ? 'Base à mettre à jour : passe supabase/005_calendrier.sql.'
    : EV.fetched ? `${n} événement${n > 1 ? 's' : ''} à venir · relu à ${FMT_TIME.format(new Date(EV.fetched))}`
    : 'Aucun événement reçu pour l’instant.';
  return sec('Calendrier Apple', `<div class="muted small pad">Brain dans Calendrier : tes créneaux avec une heure apparaissent dans un calendrier « Brain », mis à jour toutes les heures. Touche « S’abonner » sur l’iPhone, ou colle le lien dans Calendrier > Fichier > Nouvel abonnement sur Mac.</div>
    ${feed}
    <div class="muted small pad">Calendrier dans Brain : le raccourci « Agenda Apple » envoie tes prochains événements. Lance-le chaque matin par une automatisation (voir le guide).</div>
    <div class="kv"><span>${esc(status)}</span>${DEMO ? '' : '<button class="btn" data-act="cal-refresh">Relire</button>'}</div>
    <div class="kv"><span>Afficher dans la grille</span><button class="switch ${on ? 'on' : ''}" data-act="cal-toggle" role="switch" aria-checked="${on}" aria-label="Afficher les événements de Calendrier"></button></div>`);
}

export const appleActs = {
  'ag-event': el => openEvent(el.dataset.eid),
  'cal-toggle': () => { S.prefs.agApple = S.prefs.agApple === false; savePrefs(); },
  'cal-refresh': async () => { await loadEvents(true); toast(EV.missing ? 'Base à mettre à jour' : 'Événements relus'); render(); },
  'cal-token-new': async () => {
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await sb.from('calendar_tokens').insert({ token });
    if (error) { toast('Erreur : ' + error.message); return; }
    S.ui.calTokens = undefined; render(); toast('Lien créé');
  },
  'cal-token-del': async el => {
    if (!confirm('Révoquer ce lien ? Le calendrier « Brain » se videra dans Calendrier.')) return;
    const { error } = await sb.from('calendar_tokens').delete().eq('token', el.dataset.v);
    if (error) { toast('Erreur : ' + error.message); return; }
    S.ui.calTokens = undefined; render();
  }
};

// Démo : quelques événements de Calendrier autour d'aujourd'hui (jamais enregistrés)
export function seedDemoEvents() {
  const t0 = today(), d = k => addDays(t0, k);
  const ev = (id, day, a, b, title, calendar, location = '', all_day = false) =>
    ({ id: 'demo-ev-' + id, calendar, title, location, starts_at: `${day}T${a}:00`, ends_at: `${b.includes('T') ? b : `${day}T${b}`}:00`, all_day });
  EV.list = [
    ev(1, d(0), '08:30', '09:15', 'Réunion d’équipe', 'Travail', 'Salle 2'),
    ev(2, d(0), '13:00', '14:00', 'Déjeuner avec Claire', 'Perso', 'Café du coin'),
    ev(3, d(1), '18:30', '20:00', 'Cours de yoga', 'Perso'),
    ev(4, d(2), '00:00', `${d(3)}T00:00`, 'Anniversaire de Léa', 'Anniversaires', '', true),
    ev(5, d(2), '09:30', '11:00', 'Revue de sprint', 'Travail')
  ];
  EV.fetched = new Date().toISOString();
  return EV.list;
}
