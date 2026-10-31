import { S, patch } from '../../core/store.js';
import { setField, render, toast } from '../../core/ui.js';
import { fmtDur } from '../../core/util.js';
import { PX_MIN, DEFAULT_DUR, MIN_H, toMin, hhmm } from './views.js';

// ---------------------------------------------------------------------------
// Glisser-déposer dans la grille, aux pointeurs (souris, doigt, stylet) :
//   une tâche du panneau ou un créneau de la grille (data-drag) se déplace sur un jour et une heure,
//   la poignée du bas d'un créneau (.ag-rs) change sa durée, le panneau retire l'heure.
// Souris : le glissement démarre après quelques pixels. Doigt : appui long, pour garder le défilement.
// ---------------------------------------------------------------------------
const SNAP = 15;     // minutes
const HOLD = 280;    // ms d'appui long au doigt
const SLOP = 6;      // px avant de considérer un glissement
const EDGE = 70;     // px du bord de l'écran où la page défile

let st = null;       // glissement en cours
let noClick = false; // le clic qui suit un glissement ne doit pas ouvrir l'éditeur

const snap = m => Math.round(m / SNAP) * SNAP;

document.addEventListener('pointerdown', e => {
  if (st || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const rs = e.target.closest('.ag-rs');
  const el = rs ? rs.closest('[data-drag]') : e.target.closest('[data-drag]');
  const it = el && S.items.get(el.dataset.id);
  if (!it) return;
  const touch = e.pointerType !== 'mouse';
  const rect = el.getBoundingClientRect();
  st = {
    mode: rs ? 'resize' : 'move', id: it.id, el, pid: e.pointerId, touch,
    x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
    block: el.classList.contains('ag-ev'), grab: el.classList.contains('ag-ev') ? e.clientY - rect.top : 10,
    dur: it.duration_min || DEFAULT_DUR, start: it.scheduled_time ? toMin(it.scheduled_time) : null,
    started: false, target: null, timer: null
  };
  if (touch && !rs) st.timer = setTimeout(begin, HOLD);
});

function begin() {
  if (!st || st.started) return;
  clearTimeout(st.timer);
  st.started = true;
  document.body.classList.add('ag-dragging');
  st.el.classList.add('ag-lifted');
  if (st.mode === 'move') {
    const g = st.ghost = document.createElement('div');
    g.className = 'ag-ghost';
    g.textContent = S.items.get(st.id)?.title || '';
    document.body.append(g);
  }
  navigator.vibrate?.(8);
  tick();
}

document.addEventListener('pointermove', e => {
  if (!st || e.pointerId !== st.pid) return;
  st.x = e.clientX; st.y = e.clientY;
  if (!st.started) {
    if (Math.hypot(st.x - st.x0, st.y - st.y0) <= SLOP) return;
    if (st.touch && st.mode === 'move') cancel(); // le doigt défile avant l'appui long : ce n'est pas un glissement
    else begin();
    return;
  }
  e.preventDefault();
  update();
});
// Une fois le glissement lancé au doigt, la page ne doit plus défiler
document.addEventListener('touchmove', e => { if (st?.started) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if (st?.touch && e.target.closest('[data-drag]')) e.preventDefault(); });
document.addEventListener('pointerup', e => { if (st && e.pointerId === st.pid) finish(true); });
document.addEventListener('pointercancel', e => { if (st && e.pointerId === st.pid) finish(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && st) finish(false); });
document.addEventListener('click', e => { if (noClick) { e.preventDefault(); e.stopPropagation(); } }, true);

function cancel() { clearTimeout(st?.timer); st = null; }

// Défilement automatique près des bords, et mise à jour même sans mouvement du pointeur
function tick() {
  if (!st?.started) return;
  if (st.y < EDGE) scrollBy(0, -14);
  else if (st.y > innerHeight - EDGE) scrollBy(0, 14);
  update();
  requestAnimationFrame(tick);
}

function clearDrop() {
  document.querySelector('.ag-drop')?.remove();
  document.querySelector('.ag-side.over')?.classList.remove('over');
}

function update() {
  if (!st?.started) return;
  if (st.mode === 'resize') {
    const start = st.start, max = Math.min(24 * 60 - start, 12 * 60);
    st.newDur = Math.max(SNAP, Math.min(max, snap(st.dur + (st.y - st.y0) / PX_MIN)));
    st.el.style.height = Math.max(MIN_H, st.newDur * PX_MIN - 2) + 'px';
    const t = st.el.querySelector('.ag-time');
    if (t) t.textContent = `${hhmm(start)} · ${fmtDur(st.newDur)}`;
    return;
  }
  st.ghost.style.transform = `translate(${st.x + 12}px, ${st.y + 12}px)`;
  const hit = document.elementFromPoint(st.x, st.y);
  const col = hit?.closest('.ag-col');
  clearDrop();
  if (col) {
    const a = +col.dataset.a, top = col.getBoundingClientRect().top;
    const room = col.offsetHeight / PX_MIN;
    const start = Math.max(a, Math.min(snap(a + (st.y - st.grab - top) / PX_MIN), a + room - SNAP, 24 * 60 - st.dur));
    st.target = { day: col.dataset.day, start };
    const d = document.createElement('div');
    d.className = 'ag-drop';
    d.style.cssText = `top:${(start - a) * PX_MIN}px;height:${Math.max(MIN_H, st.dur * PX_MIN)}px`;
    d.textContent = hhmm(start);
    col.append(d);
  } else if (hit?.closest('.ag-side') && S.items.get(st.id)?.scheduled_time) {
    st.target = { unplan: true };
    hit.closest('.ag-side').classList.add('over');
  } else st.target = null;
}

function finish(apply) {
  if (!st) return;
  const s = st;
  st = null;
  clearTimeout(s.timer);
  if (!s.started) return;
  s.ghost?.remove();
  s.el.classList.remove('ag-lifted');
  document.body.classList.remove('ag-dragging');
  clearDrop();
  noClick = true;
  setTimeout(() => { noClick = false; }, 60);
  const it = S.items.get(s.id);
  if (!it) return;
  if (s.mode === 'resize') {
    if (!apply || !s.newDur || s.newDur === s.dur) return render();
    const prev = it.duration_min;
    setField(s.id, 'duration_min', String(s.newDur), false);
    toast(`Durée ${fmtDur(s.newDur)}`, () => patch(s.id, { duration_min: prev }));
    return;
  }
  const t = s.target;
  if (!apply || !t) return;
  const prev = { scheduled_date: it.scheduled_date, scheduled_time: it.scheduled_time, day_order: it.day_order, focus: it.focus };
  if (t.unplan) {
    setField(s.id, 'scheduled_time', '', false);
    toast('Heure retirée', () => patch(s.id, prev));
    return;
  }
  const time = hhmm(t.start);
  if (it.scheduled_date !== t.day) setField(s.id, 'scheduled_date', t.day, false);
  setField(s.id, 'scheduled_time', time, false);
  toast(`Placé à ${time}`, () => patch(s.id, prev));
}
