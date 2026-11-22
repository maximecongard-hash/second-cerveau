// Fond « Bivouac » : une scène de montagne avec un feu de camp, dessinée sur un canvas derrière l'app.
// Elle suit un score de sérieux sur les 7 derniers jours (tâches faites, échéances tenues, séances de sport).
// Score haut : crépuscule doré, feu vif, étincelles. Score bas : ciel gris, cendres, fumée, brouillard, neige.
// Préférence S.prefs.scene : 'anim' (défaut) | 'still' (image fixe) | 'off'.
import { S, ofKind, ofKindAll } from './store.js';
import { getModule, isEnabled } from './modules.js';
import { today, addDays, ymd } from './util.js';

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------
const SPORT_GOAL = 3; // séances par semaine visées quand rien n'est prévu
const clamp = v => Math.max(0, Math.min(1, v));
const dayOf = iso => ymd(new Date(iso));

// Renvoie { score 0-100, parts: [{ key, label, v 0-100, detail }] }
export function seriousness() {
  const t0 = today(), from = addDays(t0, -6);
  const inWeek = d => d && d >= from && d <= t0;
  const tasks = ofKind('task');
  const parts = [];

  // Tâches : volume fait (2 par jour = plein) et part des tâches faites face aux retards en cours
  const done = tasks.filter(t => t.status === 'done' && t.completed_at && inWeek(dayOf(t.completed_at)));
  const late = tasks.filter(t => t.status === 'active' && ((t.scheduled_date && t.scheduled_date < t0) || (t.due_date && t.due_date < t0)));
  const ratio = done.length + late.length ? done.length / (done.length + late.length) : 0.5;
  parts.push({ key: 'tasks', label: 'Tâches', v: Math.round(100 * (0.5 * clamp(done.length / 14) + 0.5 * ratio)),
    detail: `${done.length} faite${done.length > 1 ? 's' : ''}, ${late.length} en retard` });

  // Échéances : tâches dont l'échéance tombait cette semaine, faites à temps ; reports répétés pénalisés
  const due = tasks.filter(t => inWeek(t.due_date) && t.status !== 'someday');
  const onTime = due.filter(t => t.status === 'done' && t.completed_at && dayOf(t.completed_at) <= t.due_date).length;
  const pending = due.filter(t => t.status !== 'done' && t.due_date >= t0).length; // pas encore échues : neutres
  const counted = due.length - pending;
  const postponed = tasks.filter(t => t.status === 'active' && (t.meta?.postponed | 0) >= 2).length;
  const dueV = clamp((counted ? onTime / counted : 0.7) - Math.min(0.3, postponed * 0.05));
  parts.push({ key: 'due', label: 'Échéances', v: Math.round(100 * dueV),
    detail: `${onTime} tenue${onTime > 1 ? 's' : ''} sur ${counted}${postponed ? `, ${postponed} reportée${postponed > 1 ? 's' : ''} plusieurs fois` : ''}` });

  // Sport : séances faites face aux séances prévues (au moins l'objectif hebdo)
  const sport = getModule('sport');
  if (sport && isEnabled(sport)) {
    const logs = ofKindAll('workout_log').filter(w => inWeek(w.scheduled_date)).length;
    const planned = ofKind('workout').filter(w => inWeek(w.scheduled_date) && w.scheduled_date <= t0).length;
    const target = Math.max(planned, SPORT_GOAL);
    parts.push({ key: 'sport', label: 'Sport', v: Math.round(100 * clamp(logs / target)),
      detail: `${logs} séance${logs > 1 ? 's' : ''} sur ${target}` });
  }
  const score = Math.round(parts.reduce((a, p) => a + p.v, 0) / parts.length);
  return { score, parts };
}

// ---------------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------------
const R = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { t = clamp(t); const x = hx(a), y = hx(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; };
const mod = (a, n) => ((a % n) + n) % n;

function glow(c, x, y, r, col, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
  c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
}
const ridge = (x, h, y0, L) => h * y0 + Math.sin(x * 0.006 + L * 2) * h * 0.05 + Math.sin(x * 0.017 + L) * h * 0.025;

// Plan fixe (ciel, soleil, montagnes, sol, tente) : redessiné seulement quand la taille ou le score changent
function drawStatic(c, w, h, t, g) {
  const u = 1 - t;
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, mix('#6c7075', '#24204a', t)); sky.addColorStop(0.55, mix('#8d9094', '#c4607a', t)); sky.addColorStop(1, mix('#a3a5a7', '#f2a35a', t));
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  if (t > 0.4) { glow(c, g.sun, g.horizon, h * 0.12, '255,225,160', (t - 0.4) * 0.8); c.fillStyle = `rgba(255,230,170,${(t - 0.4) * 1.4})`; c.beginPath(); c.arc(g.sun, g.horizon, Math.max(14, h * 0.025), 0, 7); c.fill(); }
  [[0.62, '#4b4e53', '#5a3f66'], [0.72, '#3c3f43', '#3b2a4a'], [0.82, '#2f3235', '#22192e']].forEach(([y0, bad, good], L) => {
    c.fillStyle = mix(bad, good, t); c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) c.lineTo(x, ridge(x, h, y0, L));
    c.lineTo(w, h); c.fill();
    if (t < 0.35 && L < 2) { // neige sur les crêtes
      c.fillStyle = `rgba(240,242,245,${0.6 * (0.35 - t) / 0.35 + 0.2})`;
      for (let x = 0; x <= w; x += 8) { const y = ridge(x, h, y0, L); if (y < h * y0 - h * 0.02) c.fillRect(x, y, 8, 4); }
    }
  });
  c.fillStyle = mix('#5a5650', '#1a1210', t); c.fillRect(0, g.ground, w, h - g.ground);
  const tx = g.tent, ts = g.k;
  c.fillStyle = mix('#7b7a74', '#c45a32', t);
  c.beginPath(); c.moveTo(tx - 34 * ts, g.ground); c.lineTo(tx, g.ground - (42 - u * 8) * ts); c.lineTo(tx + 34 * ts, g.ground); c.fill();
  c.fillStyle = t > 0.5 ? `rgba(255,200,110,${(t - 0.5) * 1.2})` : 'rgba(40,40,40,.4)';
  c.beginPath(); c.moveTo(tx - 8 * ts, g.ground); c.lineTo(tx, g.ground - 24 * ts); c.lineTo(tx + 8 * ts, g.ground); c.fill();
}

function drawFire(c, x, y, k, T, t, h) {
  const u = 1 - t;
  glow(c, x, y, h * (0.18 + 0.5 * t) * (1 + 0.05 * Math.sin(T * 3.1) + 0.03 * Math.sin(T * 7)), '255,140,50', 0.55 * t);
  c.fillStyle = mix('#6a655f', '#2e1c12', t);
  [-0.28, 0.28, 0].forEach((a, i) => { c.save(); c.translate(x, y - 2 - i * 3 * k); c.rotate(a); c.fillRect(-26 * k, -4 * k, 52 * k, 8 * k); c.restore(); });
  for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(255,${120 + i * 12},40,${0.8 * Math.max(0, t - 0.05)})`; c.beginPath(); c.arc(x + (R(i + 5) - 0.5) * 40 * k, y - 2, 2.5 * k, 0, 7); c.fill(); }
  const fh0 = 90 * k;
  if (t > 0.12) for (let L = 0; L < 3; L++) for (let i = 0; i < 6; i++) {
    const fx = x + (i - 2.5) * 6 * k * (1 - L * 0.2), fh = fh0 * t * (1 - L * 0.28) * (0.6 + 0.4 * Math.sin(T * (5 + L) + i * 1.9));
    c.fillStyle = ['rgba(230,80,30,', 'rgba(255,150,40,', 'rgba(255,225,120,'][L] + (0.75 * t) + ')';
    c.beginPath(); c.moveTo(fx - 8 * k, y - 4);
    c.quadraticCurveTo(fx + Math.sin(T * 3 + i) * 7 * k, y - 4 - fh * 0.6, fx + Math.sin(T * 4.3 + i) * 5 * k, y - 4 - fh);
    c.quadraticCurveTo(fx + 6 * k, y - 4 - fh * 0.45, fx + 8 * k, y - 4); c.fill();
  }
  const rise = Math.min(h * 0.6, 260 * k);
  for (let i = 0; i < Math.round(t * 55); i++) {
    const p = mod(R(i + 70) + T * (0.1 + R(i + 71) * 0.16), 1);
    c.fillStyle = `rgba(255,${170 + (R(i) * 60 | 0)},90,${(1 - p) * t})`;
    c.fillRect(x + (R(i + 72) - 0.5) * 36 * k + Math.sin(T * 2 + i) * p * 30 * k, y - 8 - p * rise, 2, 2);
  }
  for (let i = 0; i < Math.round(u * 16); i++) {
    const p = mod(R(i + 80) + T * 0.035, 1);
    c.fillStyle = `rgba(${t < 0.5 ? '110,112,115' : '190,190,190'},${0.32 * (1 - p)})`;
    c.beginPath(); c.arc(x + Math.sin(T * 0.4 + i) * 28 * k * p + (R(i + 81) - 0.5) * 24 * k, y - 10 - p * rise * 1.4, (7 + p * 34) * k, 0, 7); c.fill();
  }
}

function drawFog(c, w, h, T, a) {
  if (a <= 0) return;
  const r = Math.max(170, w * 0.25);
  for (let i = 0; i < 6; i++) {
    const y = h * (0.5 + i * 0.08), x = mod(T * (6 + i * 2) + i * w * 0.2, w + 2 * r) - r;
    glow(c, x, y, r, '200,203,207', a * 0.5);
  }
}
function drawSnow(c, w, h, T, n) {
  c.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < n; i++) c.fillRect(mod(R(i + 100) * w + Math.sin(T * 0.7 + i) * 10, w), mod(R(i + 101) * h + T * (18 + R(i + 102) * 14), h), 2, 2);
}

// ---------------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------------
let cv = null, ctx = null, layer = null, layerKey = '', raf = 0, lastDraw = 0;
let target = 0.5, cur = null, lastScore = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mode = () => S.prefs.scene || 'anim';

function geom(w, h) {
  const narrow = w < 700;
  const k = narrow ? 0.8 : Math.min(1.4, Math.max(1, w / 1200));
  const ground = h - (narrow ? 70 : 40) * (narrow ? 1 : k); // sur téléphone, au-dessus de la barre d'onglets
  // Sur grand écran, feu et tente dans la marge libre à droite du contenu quand elle est assez large
  const box = document.querySelector('main')?.getBoundingClientRect();
  const free = box ? w - box.right : 0;
  const side = !narrow && free > 170;
  return {
    k, ground, horizon: h * 0.58,
    sun: side ? box.right + free * 0.6 : w * 0.25,
    fire: side ? box.right + free * 0.42 : narrow ? w * 0.5 : w * 0.56,
    tent: side ? box.left - Math.min(free * 0.5, box.left - 300) : narrow ? w * 0.18 : w * 0.72 // marge gauche, hors barre latérale
  };
}

function frame(ms) {
  raf = 0;
  if (!cv || mode() === 'off') return;
  const still = mode() === 'still' || reduced.matches;
  if (!still && ms - lastDraw < 33) { raf = requestAnimationFrame(frame); return; } // 30 images par seconde suffisent
  lastDraw = ms;
  const w = innerWidth, h = innerHeight, d = Math.min(devicePixelRatio || 1, w < 700 ? 1.5 : 2);
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); layerKey = ''; }
  cur = cur == null || still ? target : cur + (target - cur) * 0.02; // passage doux quand le score change
  const t = cur, g = geom(w, h);
  const key = `${w}x${h}@${d}:${Math.round(t * 50)}:${Math.round(g.fire)}`;
  if (key !== layerKey) {
    layer ||= document.createElement('canvas');
    layer.width = cv.width; layer.height = cv.height;
    const lc = layer.getContext('2d'); lc.setTransform(d, 0, 0, d, 0, 0);
    drawStatic(lc, w, h, t, g);
    layerKey = key;
  }
  const T = still ? 12 : ms / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer, 0, 0);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  drawFire(ctx, g.fire, g.ground + 3, g.k, T, t, h);
  drawFog(ctx, w, h, T, (1 - t) * 1.2);
  if (t < 0.3) drawSnow(ctx, w, h, T, Math.round((0.3 - t) * Math.min(900, w * h / 900)));
  if (!still && !document.hidden) raf = requestAnimationFrame(frame);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

// Appelé après chaque rendu de l'app
export function updateScene() {
  const on = !!S.user && mode() !== 'off';
  document.body.classList.toggle('scene', on);
  if (!on) { if (cv) { cancelAnimationFrame(raf); raf = 0; cv.remove(); cv = null; } return; }
  if (!cv) {
    cv = document.createElement('canvas'); cv.id = 'scene'; cv.setAttribute('aria-hidden', 'true');
    document.body.prepend(cv); ctx = cv.getContext('2d'); layerKey = '';
  }
  const now = Date.now();
  if (now - lastScore > 10000 || cur == null) { target = seriousness().score / 100; lastScore = now; }
  if (S.ui.sceneTest != null) target = S.ui.sceneTest; // essai dans la console : S.ui.sceneTest = 0.1
  kick();
}
export const sceneDirty = () => { lastScore = 0; };

addEventListener('resize', () => { layerKey = ''; kick(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
reduced.addEventListener?.('change', kick);
