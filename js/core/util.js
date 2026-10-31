// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uuid = () => crypto.randomUUID();
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const nowIso = () => new Date().toISOString();
export const FMT_DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
export const FMT_LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const FMT_TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function fmtDate(s) {
  if (!s) return '';
  const t = today();
  if (s === t) return "Aujourd'hui";
  if (s === addDays(t, 1)) return 'Demain';
  if (s === addDays(t, -1)) return 'Hier';
  return FMT_DAY.format(parseYmd(s));
}
export function fmtDur(m) {
  if (!m) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h} h ${pad(r)}` : `${h} h`) : `${r} min`;
}
export function fmtAgo(iso) {
  const ms = Date.now() - Date.parse(iso);
  const d = Math.floor(ms / 864e5);
  if (d <= 0) { const h = Math.floor(ms / 36e5); return h <= 0 ? "à l'instant" : `il y a ${h} h`; }
  return d === 1 ? 'hier' : `il y a ${d} j`;
}
export function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } }
export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

export const I = {
  inbox: '<svg viewBox="0 0 24 24"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  list: '<svg viewBox="0 0 24 24"><circle cx="5" cy="6" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="5" cy="18" r="1.4"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/></svg>',
  external: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5H5V6h5"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  burger: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9.5" cy="9.5" r="1.5"/><path d="M20 15l-4.5-4.5L6 20"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  checkCircle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/></svg>'
};

// ---------------------------------------------------------------------------
// Markdown minimal (titres, gras, italique, listes, liens, [[wikiliens]], #tags)
// ---------------------------------------------------------------------------
function inlineMd(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[\[([^\]]+)\]\]/g, (m, t) => `<a class="wiki" data-act="wiki" data-title="${t}">${t}</a>`)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/(^|\s)#([\p{L}\d_-]+)/gu, '$1<span class="tag">#$2</span>');
}
export function md(src) {
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of esc(src || '').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { close(); out.push(`<h${m[1].length + 2}>${inlineMd(m[2])}</h${m[1].length + 2}>`); }
    else if ((m = line.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)$/i))) {
      if (list !== 'ul') { close(); out.push('<ul class="todo">'); list = 'ul'; }
      out.push(`<li class="${m[1] === ' ' ? '' : 'checked'}">${inlineMd(m[2])}</li>`);
    }
    else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inlineMd(m[1])}</li>`); }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inlineMd(m[1])}</li>`); }
    else if (!line.trim()) { close(); }
    else { close(); out.push(`<p>${inlineMd(line)}</p>`); }
  }
  close();
  return out.join('');
}
export const plain = s => (s || '').replace(/[#*`>\[\]]/g, '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Composants HTML partagés
// ---------------------------------------------------------------------------
export const empty = (title, sub = '') => `<div class="empty"><div class="empty-title">${title}</div>${sub ? `<div class="empty-sub">${sub}</div>` : ''}</div>`;
export const sec = (title, inner, right = '') => `<section class="sec"><div class="sec-head"><h2>${title}</h2>${right}</div>${inner}</section>`;
export const chip = (label, on, act, v, extra = '') => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}">${label}${extra}</button>`;
export const fRow = (label, inner) => `<div class="f-row"><label>${label}</label><div class="f-val">${inner}</div></div>`;
export const seg = (f, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(cur ?? '') === String(v) ? 'on' : ''}" data-act="set" data-f="${f}" data-v="${v}">${l}</button>`).join('')}</div>`;
export const sel = (f, cur, opts) => `<select data-f="${f}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

// ---------------------------------------------------------------------------
// Icône de l'écran d'accueil (choix propre à l'appareil, lu par iOS au moment de l'ajout)
// ---------------------------------------------------------------------------
export const ICONS = [
  { id: 'encre', label: 'Encre', touch: 'icons/icon-180.png', manifest: 'manifest.webmanifest' },
  { id: 'papier', label: 'Papier', touch: 'icons/papier-180.png', manifest: 'manifest-papier.webmanifest' }
];
const ICON_KEY = 'sc.icon';
export const iconChoice = () => {
  let id = null;
  try { id = localStorage.getItem(ICON_KEY); } catch {}
  return ICONS.find(i => i.id === id) || ICONS[0];
};
export function setIcon(id) {
  try { localStorage.setItem(ICON_KEY, id); } catch {}
  applyIcon();
}
// Logotype « Brain. » (point final au surligneur)
export const logo = () => 'Brain<span class="logo-dot">.</span>';
export function applyIcon() {
  const ic = iconChoice();
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', ic.touch);
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', ic.manifest);
}
