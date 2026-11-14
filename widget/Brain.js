// Brain : widget Scriptable « Ma journée »
// Importer ce fichier dans l'app Scriptable, puis ajouter un widget Scriptable à l'écran d'accueil (script « Brain »).
// Il met en avant ce qui compte maintenant (ou ensuite), puis le Top 3, la journée dans l'ordre (tâches faites,
// tâches prévues, événements des autres calendriers) et les jours à venir. Lancé dans l'app Scriptable : aperçu.

const APP_URL = 'https://maximecongard-hash.github.io/second-cerveau/';
const API = 'https://zqdvtbkjvfzkjqtaffbb.supabase.co';
const KEY = 'sb_publishable_JXRFdwQ2rHPpIWDs-fx2Pw_LLnUKoIp';
const TOKEN_KEY = 'brain.capture.token';

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), 'brain-widget.json');

const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
const C = {
  bg: dyn('#fafaf7', '#1a1e27'),
  card: dyn('#e2e7f3', '#1f2840'),
  text: dyn('#1a2132', '#e6e7e1'),
  muted: dyn('#676d7e', '#8d93a3'),
  faint: dyn('#a3a7b3', '#565c6b'),
  accent: dyn('#2c4c9e', '#93a9e6'),
  danger: dyn('#a9463a', '#e08a7c'),
  ok: dyn('#4f7a5a', '#8fb197'),
  star: dyn('#b08900', '#dec85a'),
};

// Largeur utile des widgets (points) selon l'écran, pour la barre de progression
const MEDIUM_W = { 375: 329, 390: 338, 393: 338, 414: 360, 428: 364, 430: 364 };
const innerWidth = () => {
  const w = Device.screenSize().width;
  const k = Object.keys(MEDIUM_W).map(Number).sort((a, b) => Math.abs(a - w) - Math.abs(b - w))[0];
  return MEDIUM_W[k] - 28;
};

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const hm = min => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
const dur = min => min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
}

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------
async function askToken() {
  const a = new Alert();
  a.title = 'Clé d’accès';
  a.message = 'Brain > Réglages > iPhone et Calendrier > Clés d’accès > Copier. Elle reste dans le Trousseau de l’iPhone.';
  a.addTextField('Clé', '');
  a.addAction('Enregistrer');
  a.addCancelAction('Annuler');
  if ((await a.present()) === -1) return null;
  const t = a.textFieldValue(0).trim();
  if (t) Keychain.set(TOKEN_KEY, t);
  return t || null;
}

async function load() {
  let token = Keychain.contains(TOKEN_KEY) ? Keychain.get(TOKEN_KEY) : null;
  if (!token && !config.runsInWidget) token = await askToken();
  if (!token) return { error: 'Ouvre le script dans Scriptable pour saisir la clé d’accès.' };
  try {
    const r = new Request(`${API}/rest/v1/rpc/widget_today`);
    r.method = 'POST';
    r.headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
    r.body = JSON.stringify({ p_token: token, p_day: ymd(new Date()) });
    r.timeoutInterval = 15;
    const data = await r.loadJSON();
    if (r.response.statusCode !== 200) {
      const bad = /Clé|Jeton/.test(data?.message || '');
      if (bad) Keychain.remove(TOKEN_KEY);
      return { error: bad ? 'Clé refusée. Relance le script pour en saisir une autre.' : (data?.message || 'Erreur ' + r.response.statusCode) };
    }
    fm.writeString(CACHE, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(CACHE)) return { ...JSON.parse(fm.readString(CACHE)), stale: true };
    return { error: 'Hors ligne.' };
  }
}

// ---------------------------------------------------------------------------
// Ce qui compte : une seule liste ordonnée de la journée, et le créneau à mettre en avant
// ---------------------------------------------------------------------------
function plan(d, now) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const items = [];
  for (const t of d.tasks) {
    if (!t.time) continue;
    const s = toMin(t.time);
    items.push({ title: t.title, s, e: s + (t.duration || 30), task: true, sport: !!t.sport, star: !!t.focus, done: t.done });
  }
  for (const e of d.events) {
    if (e.allDay) continue;
    const s = toMin(e.start);
    items.push({ title: e.title, s, e: Math.max(toMin(e.end), s + 15), cal: e.calendar });
  }
  items.sort((a, b) => a.s - b.s || a.e - b.e);
  for (const it of items) it.state = it.done || it.e <= nowMin ? 'past' : it.s <= nowMin ? 'now' : 'next';

  const top = [1, 2, 3].map(n => d.tasks.find(t => t.focus === n));
  const loose = d.tasks.filter(t => !t.time);
  let focus = items.find(i => i.state === 'now') || items.find(i => i.state === 'next');
  if (!focus) {
    const t = top.find(x => x && !x.done) || loose.find(x => !x.done);
    if (t) focus = { title: t.title, task: true, star: !!t.focus, state: 'open' };
  }
  return { nowMin, items, top, loose, focus, allDay: d.events.filter(e => e.allDay) };
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
const txt = (stack, s, size, color, kind) => {
  const t = stack.addText(s);
  t.font = kind === 'mono' ? Font.regularMonospacedSystemFont(size) : kind === 'bold' ? Font.semiboldSystemFont(size) : Font.mediumSystemFont(size);
  t.textColor = color;
  return t;
};

function focusCard(w, f, nowMin) {
  const card = w.addStack();
  card.layoutVertically();
  card.backgroundColor = C.card;
  card.cornerRadius = 10;
  card.setPadding(8, 10, 8, 10);
  let label, sub = '';
  if (f.state === 'now') { label = 'MAINTENANT'; sub = `jusqu’à ${hm(f.e)}`; }
  else if (f.state === 'next') { label = 'ENSUITE'; const m = f.s - nowMin; sub = m < 60 ? `dans ${m} min` : `à ${hm(f.s)}`; }
  else { label = 'À FAIRE'; }
  const top = card.addStack();
  txt(top, label, 9, C.accent, 'mono');
  top.addSpacer();
  if (sub) txt(top, sub, 10, C.muted, 'mono');
  card.addSpacer(2);
  const t = txt(card, `${f.star ? '★ ' : ''}${f.title || 'Sans titre'}`, 15, C.text, 'bold');
  t.lineLimit = 2;
  t.minimumScaleFactor = 0.8;
  if (f.state === 'now') {
    card.addSpacer(5);
    const W = innerWidth() - 20, frac = Math.max(0.04, Math.min(1, (nowMin - f.s) / (f.e - f.s)));
    const bar = card.addStack();
    bar.size = new Size(W, 4);
    bar.backgroundColor = C.faint;
    bar.cornerRadius = 2;
    const fill = bar.addStack();
    fill.size = new Size(W * frac, 4);
    fill.backgroundColor = C.accent;
    fill.cornerRadius = 2;
    bar.addSpacer();
  }
}

function itemRow(w, it) {
  const line = w.addStack();
  line.centerAlignContent();
  line.spacing = 6;
  const past = it.state === 'past', now = it.state === 'now';
  const color = past ? C.faint : C.text;
  txt(line, it.done ? '✓' : it.sport ? '♥' : it.task ? (it.star ? '★' : '•') : '◦', 11, it.done ? C.ok : it.star && !past ? C.star : past ? C.faint : C.muted);
  txt(line, hm(it.s), 11, now ? C.accent : past ? C.faint : C.muted, 'mono');
  const title = txt(line, it.title || 'Sans titre', 12, now ? C.accent : color);
  title.lineLimit = 1;
  if (it.cal) { line.addSpacer(); const c = txt(line, it.cal, 9, C.faint, 'mono'); c.lineLimit = 1; }
  w.addSpacer(3);
}

// Grille horaire dessinée en une image : blocs en colonnes quand ils se chevauchent, passé estompé, trait rouge pour maintenant
function layout(items) {
  // le bloc dessiné est au moins aussi haut qu'une ligne de texte : il occupe la place jusqu'à `le`, sinon deux créneaux proches se recouvrent
  let cluster = [], end = -1;
  const flush = () => { const n = Math.max(1, ...cluster.map(x => x.lane + 1)); cluster.forEach(x => x.lanes = n); cluster = []; };
  for (const it of items) {
    if (cluster.length && it.s >= end) { flush(); end = -1; }
    const used = cluster.filter(x => x.le > it.s).map(x => x.lane);
    it.lane = 0;
    while (used.includes(it.lane)) it.lane++;
    cluster.push(it);
    end = Math.max(end, it.le);
  }
  flush();
}

function drawTimeline(p, W, H) {
  const dark = Device.isUsingDarkAppearance();
  const K = dark
    ? { text: '#e6e7e1', muted: '#8d93a3', faint: '#565c6b', accent: '#93a9e6', danger: '#e08a7c', ok: '#8fb197' }
    : { text: '#1a2132', muted: '#676d7e', faint: '#a3a7b3', accent: '#2c4c9e', danger: '#a9463a', ok: '#4f7a5a' };
  const items = p.items;
  const first = Math.min(9 * 60, ...items.map(i => i.s), p.nowMin - 30);
  const last = Math.max(18 * 60, ...items.map(i => i.e));
  const h0 = Math.max(0, Math.floor(first / 60)), h1 = Math.min(24, Math.ceil(last / 60));
  const pxh = H / (h1 - h0);
  const y = min => (min - h0 * 60) / 60 * pxh;
  const LW = 26;
  items.forEach(i => { i.le = Math.max(i.e, i.s + 17 * 60 / pxh); });
  layout(items);

  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFont(Font.regularMonospacedSystemFont(9));
  ctx.setTextColor(new Color(K.muted));
  ctx.setTextAlignedLeft();
  for (let h = h0; h < h1; h++) {
    ctx.setFillColor(new Color(K.muted, 0.3));
    ctx.fillRect(new Rect(LW, Math.round(y(h * 60)), W - LW, 0.5));
    ctx.drawTextInRect(`${h}h`, new Rect(0, y(h * 60) - 1, LW, 12));
  }
  const BW = W - LW - 4;
  for (const it of items) {
    const top = y(it.s) + 1, h = Math.max(15, y(it.e) - y(it.s) - 2);
    const lw = BW / it.lanes, x = LW + 4 + it.lane * lw;
    const past = it.state === 'past', base = it.sport ? K.ok : it.task ? K.accent : K.muted;
    ctx.setFillColor(new Color(base, past ? 0.1 : it.state === 'now' ? 0.4 : 0.24));
    const path = new Path();
    path.addRoundedRect(new Rect(x, top, lw - 2, h), 4, 4);
    ctx.addPath(path);
    ctx.fillPath();
    ctx.setFillColor(new Color(base, past ? 0.4 : 1));
    ctx.fillRect(new Rect(x, top + 2, 2, h - 4));
    ctx.setFont(Font.mediumSystemFont(10));
    ctx.setTextColor(new Color(past ? K.faint : K.text));
    ctx.drawTextInRect(`${it.done ? '✓ ' : it.star ? '★ ' : ''}${it.title || 'Sans titre'}`, new Rect(x + 6, top + 2, lw - 10, h - 3));
  }
  if (p.nowMin >= h0 * 60 && p.nowMin <= h1 * 60) {
    const yy = y(p.nowMin);
    ctx.setFillColor(new Color(K.danger));
    ctx.fillRect(new Rect(LW, yy - 0.75, W - LW, 1.5));
    ctx.fillEllipse(new Rect(LW - 3, yy - 3, 6, 6));
  }
  return ctx.getImage();
}

function upcomingRows(d, n) {
  const df = new DateFormatter();
  df.locale = 'fr-FR';
  df.dateFormat = 'EEE d';
  return (d.upcoming || []).slice(0, n).map(u => {
    const [y, m, j] = u.date.split('-').map(Number);
    return { title: u.title, time: u.time, star: !!u.focus, day: df.string(new Date(y, m - 1, j)) };
  });
}

async function build(family) {
  const d = await load();
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.url = APP_URL + '#/today';
  w.setPadding(12, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000); // iOS décide du rythme réel (souvent 5 à 15 min)

  if (d.error) {
    txt(w, 'Brain', 15, C.text, 'bold');
    w.addSpacer(4);
    txt(w, d.error, 12, C.danger);
    return w;
  }

  const now = new Date();
  const p = plan(d, now);
  const total = d.tasks.length, done = d.tasks.filter(t => t.done).length;

  // En-tête : date, avancement
  const head = w.addStack();
  head.centerAlignContent();
  const df = new DateFormatter();
  df.locale = 'fr-FR';
  df.dateFormat = family === 'small' ? 'EEE d MMM' : 'EEEE d MMMM';
  const dt = txt(head, df.string(now), family === 'small' ? 13 : 16, C.text, 'bold');
  dt.lineLimit = 1;
  dt.minimumScaleFactor = 0.7;
  head.addSpacer();
  txt(head, `${total ? done + '/' + total + ' · ' : ''}S${isoWeek(now)}`, 11, total && done === total ? C.ok : C.muted, 'mono');
  w.addSpacer(6);

  // Le plus important
  if (p.focus) focusCard(w, p.focus, p.nowMin);
  else txt(w, total ? 'Journée terminée.' : 'Rien de prévu aujourd’hui.', 13, total ? C.ok : C.muted);
  w.addSpacer(6);

  if (family === 'large') {
    // Top 3 sur une ligne, puis la grille horaire de la journée, puis les jours à venir
    const tl = w.addStack();
    tl.spacing = 8;
    p.top.forEach(t => {
      const s = txt(tl, `${t ? (t.done ? '✓' : '★') : '☆'} ${t ? t.title : 'libre'}`, 11, t ? (t.done ? C.faint : C.text) : C.faint);
      s.lineLimit = 1;
    });
    w.addSpacer(6);
    const allDay = p.allDay.map(e => e.title).join(' · ');
    if (allDay) { const a = txt(w, allDay, 11, C.muted); a.lineLimit = 1; w.addSpacer(4); }
    const next = upcomingRows(d, 2);
    const iw = innerWidth();
    const ih = Math.max(90, 354 - 24 - 28 - 66 - 18 - 18 - 14 - (allDay ? 16 : 0) - (next.length ? 14 + next.length * 17 : 0));
    const img = w.addImage(drawTimeline(p, iw, ih));
    img.imageSize = new Size(iw, ih);
    if (next.length) {
      w.addSpacer(6);
      txt(w, 'À VENIR', 9, C.faint, 'mono');
      w.addSpacer(2);
      next.forEach(r => {
        const line = w.addStack();
        line.centerAlignContent();
        line.spacing = 6;
        txt(line, r.day, 10, C.muted, 'mono');
        if (r.time) txt(line, r.time, 10, C.accent, 'mono');
        const t = txt(line, `${r.star ? '★ ' : ''}${r.title || 'Sans titre'}`, 12, C.text);
        t.lineLimit = 1;
        w.addSpacer(3);
      });
    }
  } else if (family === 'medium') {
    // Deux lignes de la journée : on retire d'abord le passé le plus ancien si la place manque
    const focusIsItem = p.focus && p.focus.state !== 'open';
    let list = p.items.filter(i => !(focusIsItem && i === p.focus));
    const first = list.findIndex(i => i.state !== 'past');
    const skip = Math.min(Math.max(0, list.length - 2), first < 0 ? list.length : first);
    list = list.slice(skip, skip + 2);
    list.forEach(i => itemRow(w, i));
    const hidden = p.items.length - (focusIsItem ? 1 : 0) - list.length;
    if (hidden > 0) { const m = txt(w, `+ ${hidden}`, 10, C.faint, 'mono'); m.lineLimit = 1; w.addSpacer(3); }
  }

  w.addSpacer();
  const foot = w.addStack();
  foot.spacing = 10;
  if (d.overdue) txt(foot, `${d.overdue} en retard`, 10, C.danger, 'mono');
  if (d.inbox) { const ib = foot.addStack(); ib.url = APP_URL + '#/inbox'; txt(ib, `Inbox ${d.inbox}`, 10, C.accent, 'mono'); }
  if (d.stale) txt(foot, 'hors ligne', 10, C.muted, 'mono');
  return w;
}

// ---------------------------------------------------------------------------
if (config.runsInWidget) {
  Script.setWidget(await build(config.widgetFamily || 'medium'));
} else {
  const a = new Alert();
  a.title = 'Brain';
  a.addAction('Aperçu grand format');
  a.addAction('Aperçu moyen');
  a.addAction('Changer la clé d’accès');
  a.addCancelAction('Fermer');
  const i = await a.present();
  if (i === 0) await (await build('large')).presentLarge();
  else if (i === 1) await (await build('medium')).presentMedium();
  else if (i === 2) { Keychain.remove(TOKEN_KEY); await askToken(); }
}
Script.complete();
