// Brain : widget Scriptable « Ma journée »
// Importer ce fichier dans l'app Scriptable, puis ajouter un widget Scriptable à l'écran d'accueil (script « Brain »).
// Grand format : en-tête, Top 3, grille horaire du jour (tâches et événements de Calendrier), pied avec compteurs.
// Petit et moyen format : liste courte. Lancé dans l'app Scriptable : menu de réglages (clé, fond transparent).
// Fond transparent : iOS n'en offre pas ; le script découpe une capture de l'écran d'accueil derrière le widget.

const APP_URL = 'https://maximecongard-hash.github.io/second-cerveau/';
const API = 'https://zqdvtbkjvfzkjqtaffbb.supabase.co';
const KEY = 'sb_publishable_JXRFdwQ2rHPpIWDs-fx2Pw_LLnUKoIp';
const TOKEN_KEY = 'brain.capture.token';

const fm = FileManager.local();
const file = n => fm.joinPath(fm.documentsDirectory(), n);
const BG_FILE = 'brain-widget-bg.png';
const CFG_FILE = 'brain-widget-cfg.json';
const CACHE_FILE = 'brain-widget.json';

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = min => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
}

// ---------------------------------------------------------------------------
// Réglages locaux et palettes
// ---------------------------------------------------------------------------
const readCfg = () => fm.fileExists(file(CFG_FILE)) ? JSON.parse(fm.readString(file(CFG_FILE))) : {};
const writeCfg = c => fm.writeString(file(CFG_FILE), JSON.stringify(c));
const hasBg = () => fm.fileExists(file(BG_FILE));

const palette = () => {
  const dark = readCfg().textDark;
  if (hasBg()) return dark
    ? { text: '#1a2132', muted: '#4a5163', accent: '#2c4c9e', danger: '#a9463a', ok: '#3f6b4a', star: '#8a6d00', ink: true }
    : { text: '#f2f2ee', muted: '#c4cad8', accent: '#aebdf0', danger: '#f0a094', ok: '#a6c6ad', star: '#dec85a', ink: false };
  return { text: '#e6e7e1', muted: '#8d93a3', accent: '#93a9e6', danger: '#e08a7c', ok: '#8fb197', star: '#dec85a', ink: false, solid: '#1a1e27' };
};

// Tailles de widget en points (guide Apple) selon la largeur d'écran, et position du premier widget
const SIZES = {
  375: { small: 155, mw: 329, lh: 345, top: 71 },
  390: { small: 158, mw: 338, lh: 354, top: 77 },
  393: { small: 158, mw: 338, lh: 354, top: 80 },
  414: { small: 169, mw: 360, lh: 379, top: 76 },
  428: { small: 170, mw: 364, lh: 382, top: 82 },
  430: { small: 170, mw: 364, lh: 382, top: 84 },
};
const phone = () => {
  const w = Device.screenSize().width;
  const k = Object.keys(SIZES).map(Number).sort((a, b) => Math.abs(a - w) - Math.abs(b - w))[0];
  return { ...SIZES[k], sw: w, sh: Device.screenSize().height };
};

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------
async function askToken() {
  const a = new Alert();
  a.title = 'Clé d’accès';
  a.message = 'Brain > Réglages > iPhone et Calendrier > Clés d’accès > Copier. Il reste dans le Trousseau de l’iPhone.';
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
      return { error: bad ? 'Clé refusée. Relance le script pour en saisir un autre.' : (data?.message || 'Erreur ' + r.response.statusCode) };
    }
    fm.writeString(file(CACHE_FILE), JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(file(CACHE_FILE))) return { ...JSON.parse(fm.readString(file(CACHE_FILE))), stale: true };
    return { error: 'Hors ligne.' };
  }
}

// ---------------------------------------------------------------------------
// Grille horaire dessinée (une image) : tâches datées + événements
// ---------------------------------------------------------------------------
function timelineItems(d) {
  const items = [];
  for (const t of d.tasks) {
    if (!t.time) continue;
    const s = toMin(t.time);
    items.push({ title: t.title, s, e: s + (t.duration || 30), task: true, star: !!t.focus, done: t.done });
  }
  for (const e of d.events) {
    if (e.allDay) continue;
    const s = toMin(e.start), en = toMin(e.end);
    items.push({ title: e.title, s, e: Math.max(en, s + 20) });
  }
  return items.sort((a, b) => a.s - b.s || b.e - a.e);
}

// Colonnes pour les blocs qui se chevauchent
function layout(items) {
  let cluster = [], end = -1;
  const flush = () => { const n = Math.max(0, ...cluster.map(x => x.lane + 1)); cluster.forEach(x => x.lanes = n); cluster = []; };
  for (const it of items) {
    if (cluster.length && it.s >= end) { flush(); end = -1; }
    const used = cluster.filter(x => x.e > it.s).map(x => x.lane);
    it.lane = 0;
    while (used.includes(it.lane)) it.lane++;
    cluster.push(it);
    end = Math.max(end, it.e);
  }
  flush();
}

function drawTimeline(d, W, H, P) {
  const items = timelineItems(d);
  layout(items);
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const first = Math.min(9 * 60, ...items.map(i => i.s));
  const last = Math.max(18 * 60, ...items.map(i => i.e));
  const h0 = Math.max(0, Math.floor(first / 60)), h1 = Math.min(24, Math.ceil(last / 60));
  const pxh = H / (h1 - h0);
  const y = min => (min - h0 * 60) / 60 * pxh;
  const LW = 26;

  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  ctx.setFont(Font.regularMonospacedSystemFont(9));
  ctx.setTextColor(new Color(P.muted));
  ctx.setTextAlignedLeft();
  for (let h = h0; h < h1; h++) {
    ctx.setFillColor(new Color(P.muted, 0.28));
    ctx.fillRect(new Rect(LW, Math.round(y(h * 60)), W - LW, 0.5));
    ctx.drawTextInRect(`${h}h`, new Rect(0, y(h * 60) - 1, LW, 12));
  }

  const BW = W - LW - 4;
  for (const it of items) {
    const top = y(it.s) + 1, h = Math.max(16, y(it.e) - y(it.s) - 2);
    const lw = BW / it.lanes, x = LW + 4 + it.lane * lw;
    const base = it.task ? P.accent : P.muted;
    ctx.setFillColor(new Color(base, it.done ? 0.12 : 0.26));
    const p = new Path();
    p.addRoundedRect(new Rect(x, top, lw - 2, h), 4, 4);
    ctx.addPath(p);
    ctx.fillPath();
    ctx.setFillColor(new Color(base, it.done ? 0.4 : 1));
    ctx.fillRect(new Rect(x, top + 2, 2, h - 4));
    ctx.setFont(Font.mediumSystemFont(10));
    ctx.setTextColor(new Color(it.done ? P.muted : P.text));
    ctx.drawTextInRect(`${it.star ? '★ ' : ''}${it.title || 'Sans titre'}`, new Rect(x + 6, top + 2, lw - 10, h - 3));
  }

  if (nowMin >= h0 * 60 && nowMin <= h1 * 60) {
    const yy = y(nowMin);
    ctx.setFillColor(new Color(P.danger));
    ctx.fillRect(new Rect(LW, yy - 0.75, W - LW, 1.5));
    ctx.fillEllipse(new Rect(LW - 3, yy - 3, 6, 6));
  }
  return ctx.getImage();
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------
function styleBackground(w, P) {
  if (hasBg()) w.backgroundImage = fm.readImage(file(BG_FILE));
  else w.backgroundColor = new Color(P.solid || '#1a1e27');
}

const txt = (stack, s, size, color, weight) => {
  const t = stack.addText(s);
  t.font = weight === 'mono' ? Font.regularMonospacedSystemFont(size) : weight === 'bold' ? Font.semiboldSystemFont(size) : Font.mediumSystemFont(size);
  t.textColor = new Color(color);
  return t;
};

function buildRows(d) {
  const open = d.tasks.filter(t => !t.done);
  const top = open.filter(t => t.focus).sort((a, b) => a.focus - b.focus).map(t => ({ title: t.title, time: t.time, star: true }));
  const timed = [
    ...open.filter(t => t.time && !t.focus).map(t => ({ title: t.title, time: t.time })),
    ...d.events.filter(e => !e.allDay).map(e => ({ title: e.title, time: e.start, event: true })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const loose = open.filter(t => !t.time && !t.focus).map(t => ({ title: t.title }));
  return [...top, ...timed, ...loose];
}

// Tâches des jours suivants (champ absent tant que le schéma n'est pas à jour)
function upcomingRows(d, n) {
  const df = new DateFormatter();
  df.locale = 'fr-FR';
  df.dateFormat = 'EEE d';
  return (d.upcoming || []).slice(0, n).map(u => {
    const [y, m, j] = u.date.split('-').map(Number);
    return { title: u.title, time: u.time, star: !!u.focus, day: df.string(new Date(y, m - 1, j)) };
  });
}

function addUpcoming(stack, r, P, size) {
  const line = stack.addStack();
  line.centerAlignContent();
  line.spacing = 6;
  txt(line, r.day, size - 1, P.muted, 'mono');
  if (r.time) txt(line, r.time, size - 1, P.accent, 'mono');
  const t = txt(line, `${r.star ? '★ ' : ''}${r.title || 'Sans titre'}`, size, P.text);
  t.lineLimit = 1;
  stack.addSpacer(3);
}

async function build(family) {
  const d = await load();
  const P = palette();
  const w = new ListWidget();
  styleBackground(w, P);
  w.url = APP_URL;
  w.setPadding(12, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000); // iOS décide du rythme réel (souvent 5 à 15 min)

  if (d.error) {
    txt(w, 'Brain', 15, P.text, 'bold');
    w.addSpacer(4);
    txt(w, d.error, 12, P.danger);
    return w;
  }

  const now = new Date();
  const left = d.tasks.filter(t => !t.done).length, done = d.tasks.length - left;
  const df = new DateFormatter();
  df.locale = 'fr-FR';
  df.dateFormat = family === 'small' ? 'EEE d MMM' : 'EEEE d MMMM';

  const head = w.addStack();
  head.centerAlignContent();
  const dt = txt(head, df.string(now), family === 'small' ? 13 : 16, P.text, 'bold');
  dt.lineLimit = 1;
  dt.minimumScaleFactor = 0.7;
  head.addSpacer();
  txt(head, `${d.tasks.length ? done + '/' + d.tasks.length + ' · ' : ''}S${isoWeek(now)}`, 11, left === 0 && d.tasks.length ? P.ok : P.muted, 'mono');
  w.addSpacer(6);

  if (family === 'large') {
    // Top 3 : trois emplacements
    const slots = [1, 2, 3].map(n => d.tasks.find(t => t.focus === n));
    for (const t of slots) {
      const line = w.addStack();
      line.centerAlignContent();
      line.spacing = 6;
      txt(line, t ? (t.done ? '✓' : '★') : '☆', 12, t && !t.done ? P.star : P.muted);
      const title = txt(line, t ? t.title : 'libre', 13, t ? (t.done ? P.muted : P.text) : P.muted);
      title.lineLimit = 1;
      if (t?.time) { line.addSpacer(); txt(line, t.time, 11, P.muted, 'mono'); }
      w.addSpacer(3);
    }
    const allDay = d.events.filter(e => e.allDay).map(e => e.title).join(' · ');
    if (allDay) { const a = txt(w, allDay, 11, P.muted); a.lineLimit = 1; }
    w.addSpacer(6);

    const next = upcomingRows(d, 4);
    const p = phone();
    const iw = p.mw - 28, ih = p.lh - 24 - 20 - 3 * 20 - (allDay ? 14 : 0) - 24 - 14 - (next.length ? 18 + next.length * 17 : 0);
    const img = w.addImage(drawTimeline(d, iw, ih, P));
    img.imageSize = new Size(iw, ih);
    if (next.length) {
      w.addSpacer(6);
      txt(w, 'À VENIR', 9, P.muted, 'mono');
      w.addSpacer(2);
      next.forEach(r => addUpcoming(w, r, P, 12));
    }
    w.addSpacer();
  } else {
    const max = family === 'small' ? 3 : 4;
    const rows = buildRows(d);
    if (!rows.length) txt(w, d.tasks.length ? 'Journée terminée.' : 'Rien de prévu aujourd’hui.', 13, d.tasks.length ? P.ok : P.muted);
    rows.slice(0, max).forEach((r, i) => {
      const line = w.addStack();
      line.centerAlignContent();
      line.spacing = 6;
      txt(line, r.star ? '★' : r.event ? '◦' : '·', 12, r.star ? P.star : P.muted);
      if (r.time) txt(line, r.time, 11, r.event ? P.muted : P.accent, 'mono');
      const t = txt(line, r.title || 'Sans titre', 12, r.event ? P.muted : P.text);
      t.lineLimit = 1;
      w.addSpacer(3);
    });
    if (rows.length > max) txt(w, `+ ${rows.length - max}`, 10, P.muted, 'mono');
    // Place restante en moyen : la suite des jours à venir
    const room = family === 'medium' ? Math.max(0, max - rows.length) : 0;
    const next = upcomingRows(d, room);
    next.forEach(r => addUpcoming(w, r, P, 12));
    w.addSpacer();
  }

  const foot = w.addStack();
  foot.spacing = 10;
  const sansHeure = d.tasks.filter(t => !t.done && !t.time && !t.focus).length;
  if (d.overdue) txt(foot, `${d.overdue} en retard`, 10, P.danger, 'mono');
  if (d.inbox) txt(foot, `Inbox ${d.inbox}`, 10, P.accent, 'mono');
  if (family === 'large' && sansHeure) txt(foot, `sans heure : ${sansHeure}`, 10, P.muted, 'mono');
  if (d.stale) txt(foot, 'hors ligne', 10, P.muted, 'mono');
  return w;
}

// ---------------------------------------------------------------------------
// Réglage du fond transparent (à lancer dans l'app Scriptable)
// ---------------------------------------------------------------------------
async function menu(title, message, options) {
  const a = new Alert();
  a.title = title;
  if (message) a.message = message;
  options.forEach(o => a.addAction(o));
  a.addCancelAction('Annuler');
  const i = await a.present();
  return i === -1 ? null : i;
}

function crop(img, p, pos, dy) {
  const sc = Device.screenScale();
  const gap = Math.round(p.sw * 0.098);
  const y = p.top + (pos === 1 ? p.small + gap : 0) + dy;
  const x = (p.sw - p.mw) / 2;
  const ctx = new DrawContext();
  ctx.size = new Size(Math.round(p.mw * sc), Math.round(p.lh * sc));
  ctx.opaque = false;
  ctx.drawImageAtPoint(img, new Point(-Math.round(x * sc), -Math.round(y * sc)));
  return ctx.getImage();
}

async function setupBackground() {
  const p = phone();
  const go = await menu('Fond transparent',
    'Sur l’écran d’accueil, appuie longtemps sur le fond, va sur une page vide (ou retire les icônes de la zone du widget), puis fais une capture d’écran. Reviens ici et choisis cette capture.',
    ['Choisir la capture']);
  if (go === null) return;
  let img;
  try { img = await Photos.fromLibrary(); } catch (e) { return; }
  const sc = Device.screenScale();
  if (Math.abs(img.size.height - p.sh * sc) > 4 || Math.abs(img.size.width - p.sw * sc) > 4) {
    const a = new Alert();
    a.title = 'Capture non reconnue';
    a.message = `Attendu ${Math.round(p.sw * sc)} × ${Math.round(p.sh * sc)} px, reçu ${Math.round(img.size.width)} × ${Math.round(img.size.height)}. Utilise une capture d’écran plein écran de cet iPhone.`;
    a.addAction('OK');
    await a.present();
    return;
  }
  const pos = await menu('Emplacement du grand widget', 'Première ou deuxième rangée de widgets.', ['En haut', 'En bas']);
  if (pos === null) return;
  let dy = 0;
  for (;;) {
    const out = crop(img, p, pos, dy);
    await QuickLook.present(out, false);
    const c = await menu('Alignement', `Décalage vertical : ${dy} pt. Le fond doit se raccorder à l’écran.`, ['Valider', 'Monter de 4 pt', 'Descendre de 4 pt']);
    if (c === null) return;
    if (c === 0) { fm.writeImage(file(BG_FILE), out); break; }
    dy += c === 1 ? -4 : 4;
  }
  const t = await menu('Couleur du texte', 'Selon la luminosité de ton fond d’écran.', ['Clair (fond sombre)', 'Sombre (fond clair)']);
  const cfg = readCfg();
  cfg.textDark = t === 1;
  writeCfg(cfg);
}

// ---------------------------------------------------------------------------
if (config.runsInWidget) {
  Script.setWidget(await build(config.widgetFamily || 'medium'));
} else {
  for (;;) {
    const c = await menu('Brain', hasBg() ? 'Fond transparent actif.' : 'Fond uni (pas de fond transparent).',
      ['Aperçu grand format', 'Aperçu moyen', 'Configurer le fond transparent', 'Retirer le fond transparent', 'Changer la clé']);
    if (c === null) break;
    if (c === 0) await (await build('large')).presentLarge();
    else if (c === 1) await (await build('medium')).presentMedium();
    else if (c === 2) await setupBackground();
    else if (c === 3) { if (hasBg()) fm.remove(file(BG_FILE)); }
    else if (c === 4) { Keychain.remove(TOKEN_KEY); await askToken(); }
  }
}
Script.complete();
