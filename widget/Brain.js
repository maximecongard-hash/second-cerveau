// Brain : widget Scriptable « Ma journée »
// Variables globales Scriptable : importer ce fichier dans l'app Scriptable, puis ajouter un widget Scriptable
// à l'écran d'accueil et choisir le script « Brain ». Premier lancement dans l'app : demande le jeton de capture.
// Affiche le Top 3, les créneaux du jour (tâches et événements de Calendrier), les tâches sans heure,
// et les compteurs en retard / Inbox. Taille petite, moyenne ou grande.

const APP_URL = 'https://maximecongard-hash.github.io/second-cerveau/';
const API = 'https://zqdvtbkjvfzkjqtaffbb.supabase.co';
const KEY = 'sb_publishable_JXRFdwQ2rHPpIWDs-fx2Pw_LLnUKoIp';
const TOKEN_KEY = 'brain.capture.token';

// Couleurs de l'app (papier / encre), clair et sombre
const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
const C = {
  bg: dyn('#fafaf7', '#1a1e27'),
  text: dyn('#1a2132', '#e6e7e1'),
  muted: dyn('#676d7e', '#8d93a3'),
  accent: dyn('#2c4c9e', '#93a9e6'),
  danger: dyn('#a9463a', '#e08a7c'),
  ok: dyn('#4f7a5a', '#8fb197'),
  star: dyn('#c49a00', '#dec85a'),
};

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function askToken() {
  const a = new Alert();
  a.title = 'Jeton de capture';
  a.message = 'Brain > Réglages > Capture iPhone > Copier. Il reste dans le Trousseau de l’iPhone.';
  a.addTextField('Jeton', '');
  a.addAction('Enregistrer');
  a.addCancelAction('Annuler');
  if ((await a.present()) === -1) return null;
  const t = a.textFieldValue(0).trim();
  if (t) Keychain.set(TOKEN_KEY, t);
  return t || null;
}

async function load() {
  const cache = FileManager.local().joinPath(FileManager.local().documentsDirectory(), 'brain-widget.json');
  const fm = FileManager.local();
  let token = Keychain.contains(TOKEN_KEY) ? Keychain.get(TOKEN_KEY) : null;
  if (!token && !config.runsInWidget) token = await askToken();
  if (!token) return { error: 'Ouvre le script dans Scriptable pour saisir le jeton.' };
  try {
    const r = new Request(`${API}/rest/v1/rpc/widget_today`);
    r.method = 'POST';
    r.headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
    r.body = JSON.stringify({ p_token: token, p_day: ymd(new Date()) });
    r.timeoutInterval = 15;
    const data = await r.loadJSON();
    if (r.response.statusCode !== 200) {
      const bad = /Jeton/.test(data?.message || '');
      if (bad) Keychain.remove(TOKEN_KEY);
      return { error: bad ? 'Jeton refusé. Relance le script pour en saisir un autre.' : (data?.message || 'Erreur ' + r.response.statusCode) };
    }
    fm.writeString(cache, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(cache)) return { ...JSON.parse(fm.readString(cache)), stale: true };
    return { error: 'Hors ligne.' };
  }
}

// Lignes à afficher : Top 3, puis créneaux (tâches + événements) par heure, puis tâches sans heure
function buildRows(d) {
  const open = d.tasks.filter(t => !t.done);
  const top = open.filter(t => t.focus).sort((a, b) => a.focus - b.focus)
    .map(t => ({ title: t.title, time: t.time, star: true }));
  const timed = [
    ...open.filter(t => t.time && !t.focus).map(t => ({ title: t.title, time: t.time })),
    ...d.events.filter(e => !e.allDay).map(e => ({ title: e.title, time: e.start, event: true })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const loose = open.filter(t => !t.time && !t.focus).map(t => ({ title: t.title }));
  const allDay = d.events.filter(e => e.allDay).map(e => ({ title: e.title, event: true, allDay: true }));
  return [...allDay, ...top, ...timed, ...loose];
}

function addRow(stack, row, size) {
  const line = stack.addStack();
  line.centerAlignContent();
  line.spacing = 6;
  const mark = line.addText(row.star ? '★' : row.event ? '◦' : '·');
  mark.font = Font.systemFont(size);
  mark.textColor = row.star ? C.star : C.muted;
  if (row.time) {
    const t = line.addText(row.time);
    t.font = Font.regularMonospacedSystemFont(size - 1);
    t.textColor = row.event ? C.muted : C.accent;
  }
  const title = line.addText(row.title || 'Sans titre');
  title.font = Font.mediumSystemFont(size);
  title.textColor = row.event ? C.muted : C.text;
  title.lineLimit = 1;
}

async function build() {
  const d = await load();
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.url = APP_URL;
  w.setPadding(12, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (d.error) {
    const t = w.addText('Brain');
    t.font = Font.semiboldSystemFont(15);
    t.textColor = C.text;
    w.addSpacer(4);
    const e = w.addText(d.error);
    e.font = Font.systemFont(12);
    e.textColor = C.danger;
    return w;
  }

  const fam = config.widgetFamily || 'medium';
  const max = { small: 3, medium: 4, large: 11, extraLarge: 11 }[fam] || 4;
  const size = fam === 'small' ? 12 : 13;
  const rows = buildRows(d);
  const left = d.tasks.filter(t => !t.done).length;
  const done = d.tasks.length - left;

  // En-tête : date + avancement
  const head = w.addStack();
  head.centerAlignContent();
  const df = new DateFormatter();
  df.locale = 'fr-FR';
  df.dateFormat = fam === 'small' ? 'EEE d MMM' : 'EEEE d MMMM';
  const date = head.addText(df.string(new Date()));
  date.font = Font.semiboldSystemFont(fam === 'small' ? 13 : 15);
  date.textColor = C.text;
  date.lineLimit = 1;
  date.minimumScaleFactor = 0.7;
  head.addSpacer();
  const prog = head.addText(d.tasks.length ? `${done}/${d.tasks.length}` : '');
  prog.font = Font.regularMonospacedSystemFont(11);
  prog.textColor = left === 0 && d.tasks.length ? C.ok : C.muted;

  w.addSpacer(6);
  if (!rows.length) {
    const t = w.addText(d.tasks.length ? 'Journée terminée.' : 'Rien de prévu aujourd’hui.');
    t.font = Font.italicSystemFont(13);
    t.textColor = d.tasks.length ? C.ok : C.muted;
  }
  const shown = rows.slice(0, max);
  shown.forEach((r, i) => { addRow(w, r, size); if (i < shown.length - 1) w.addSpacer(3); });
  if (rows.length > max) {
    w.addSpacer(3);
    const more = w.addText(`+ ${rows.length - max}`);
    more.font = Font.regularMonospacedSystemFont(10);
    more.textColor = C.muted;
  }

  w.addSpacer();
  // Pied : en retard, Inbox, hors ligne
  const foot = w.addStack();
  foot.spacing = 10;
  const chip = (txt, color) => { const t = foot.addText(txt); t.font = Font.regularMonospacedSystemFont(10); t.textColor = color; };
  if (d.overdue) chip(`${d.overdue} en retard`, C.danger);
  if (d.inbox) chip(`Inbox ${d.inbox}`, C.accent);
  if (d.stale) chip('hors ligne', C.muted);
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
