// Brain : la seule Edge Function du projet. À déployer sous le nom « brain », « Verify JWT » désactivé :
// le flux de Calendrier et pg_cron n'envoient pas de JWT, chaque route vérifie elle-même qui appelle.
//
//   GET  /brain/ping                  fonction en place (lu par Réglages > Installation)
//   GET  /brain/calendrier?token=…    flux ICS pour l'abonnement de Calendrier (jeton calendrier)
//   POST /brain/reminders             envoi des notifications, chaque minute par pg_cron (x-cron-secret)
//   POST /brain/reminders {test:true} notification d'essai depuis l'app (compte connecté)
//   POST /brain/add-user              création d'un compte (administrateur connecté)
//
// Aucune dépendance et rien à configurer : URL et clés viennent de l'environnement de Supabase,
// les clés VAPID sont créées au premier passage et rangées dans la table push_config.

const env = (k: string) => (globalThis as any).Deno.env.get(k) as string;
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = env('SUPABASE_ANON_KEY') || SERVICE_KEY;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Accès à la base avec la clé de service (contourne RLS : réservé à cette fonction)
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) }
  });
  if (!res.ok) throw new Error(`${path} : ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// Compte qui appelle, d'après son JWT ; null si la connexion n'est pas valable
async function caller(req: Request) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: req.headers.get('Authorization') ?? '' }
  });
  return res.ok ? await res.json() as { id: string } : null;
}

// ---------------------------------------------------------------------------
// Flux ICS (Calendrier)
// ---------------------------------------------------------------------------
const DEFAULT_DUR = 30; // minutes, comme la grille de l'Agenda

type Row = {
  id: string;
  kind: string;
  status: string;
  title: string;
  body: string;
  scheduled_date: string; // 2026-11-02
  scheduled_time: string; // 09:30:00
  duration_min: number | null;
  project: string | null;
  updated_at: string;
};

// Texte d'une propriété : \ ; , et retours à la ligne échappés (RFC 5545, 3.3.11)
const escText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lignes de 75 octets au plus, suite précédée d'un espace, sans couper un caractère
function fold(line: string) {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '', size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > 75) { out.push(cur); cur = ' '; size = 1; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

const pad = (n: number) => String(n).padStart(2, '0');
// Heure « flottante » : sans fuseau, lue à l'heure locale de l'appareil, comme dans Brain
const floating = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
const utcStamp = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? floating(new Date()) + 'Z' : d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
};

export function buildIcs(rows: Row[]) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Brain//Second Cerveau//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Brain',
    'X-WR-CALDESC:Créneaux planifiés dans Brain',
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H'
  ];
  for (const r of rows) {
    const [y, m, d] = r.scheduled_date.split('-').map(Number);
    const [h, mi] = r.scheduled_time.split(':').map(Number);
    // calcul en UTC pour qu'un changement d'heure ne décale rien
    const start = new Date(Date.UTC(y, m - 1, d, h, mi));
    const end = new Date(+start + (r.duration_min || DEFAULT_DUR) * 60000);
    const title = (r.title || '').trim() || 'Sans titre';
    const desc = [r.project ? `Projet : ${r.project}` : '', (r.body || '').trim()].filter(Boolean).join('\n\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@brain`,
      `DTSTAMP:${utcStamp(r.updated_at)}`,
      `LAST-MODIFIED:${utcStamp(r.updated_at)}`,
      `DTSTART:${floating(start)}`,
      `DTEND:${floating(end)}`,
      `SUMMARY:${escText(r.status === 'done' ? `✓ ${title}` : title)}`
    );
    if (desc) lines.push(`DESCRIPTION:${escText(desc)}`);
    lines.push('TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// Appelle calendar_feed avec la clé publique : la fonction ne voit rien de plus qu'un raccourci
async function calendrier(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return new Response('Lien d’agenda invalide', { status: 404 });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/calendar_feed`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token })
  });
  if (!res.ok) return new Response('Agenda indisponible', { status: 502 });
  const rows = await res.json() as Row[];
  return new Response(req.method === 'HEAD' ? null : buildIcs(rows), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="brain.ics"',
      'Cache-Control': 'private, max-age=300'
    }
  });
}

// ---------------------------------------------------------------------------
// Web Push (RFC 8291 + VAPID RFC 8292), fait à la main avec WebCrypto
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
export const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// Nouvelle paire VAPID : clé publique brute (base64url, pour l'app) et clé privée JWK (pour signer)
export async function newVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    public_key: b64url(await crypto.subtle.exportKey('raw', kp.publicKey)),
    private_jwk: await crypto.subtle.exportKey('jwk', kp.privateKey)
  };
}

async function vapidHeader(endpoint: string, publicKey: string, privateJwk: JsonWebKey) {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: SUPABASE_URL
  })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${publicKey}`;
}

// Chiffrement aes128gcm du message pour un abonné (RFC 8291)
export async function encrypt(payload: Uint8Array, p256dh: string, auth: string, salt?: Uint8Array, local?: CryptoKeyPair) {
  const uaPublic = unb64url(p256dh);
  local ??= await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const prkKey = await hmac(unb64url(auth), shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  salt ??= crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  new DataView(header.buffer).setUint32(16, 4096);
  header.set(salt, 0);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

type Vapid = { public_key: string, private_jwk: JsonWebKey };

async function sendPush(sub: { endpoint: string, p256dh: string, auth: string }, message: unknown, vapid: Vapid) {
  const body = await encrypt(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
      Authorization: await vapidHeader(sub.endpoint, vapid.public_key, vapid.private_jwk)
    },
    body
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
async function config() {
  const [cfg] = await db('push_config?id=eq.1&select=public_key,private_jwk,cron_secret');
  if (!cfg) throw new Error('push_config vide : colle supabase/schema.sql');
  if (!cfg.public_key) {
    const keys = await newVapidKeys();
    await db('push_config?id=eq.1', { method: 'PATCH', body: JSON.stringify(keys) });
    return { ...cfg, ...keys };
  }
  return cfg;
}

// Envoie à tous les appareils d'un utilisateur ; oublie les abonnements expirés
async function notifyUser(userId: string, message: unknown, vapid: Vapid) {
  const subs = await db(`push_subscriptions?user_id=eq.${userId}&select=id,endpoint,p256dh,auth`);
  let sent = 0;
  for (const s of subs) {
    const res = await sendPush(s, message, vapid).catch(e => ({ ok: false, status: 0, text: () => String(e) }));
    if (res.ok) sent++;
    else if (res.status === 404 || res.status === 410) await db(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' });
    else console.error('push', res.status, await res.text());
  }
  return { devices: subs.length, sent };
}

const firstLine = (s: string | null) => (s || '').split('\n').map(l => l.trim()).find(Boolean)?.slice(0, 140) || '';

// Créneaux qui viennent de finir (10 min de tolérance : un créneau ancien ne réveille personne)
async function endedSlots(now: string, cfg: Vapid) {
  const since = new Date(Date.now() - 10 * 60000).toISOString();
  const rows = await db(`items?select=id,user_id,title&end_at=lte.${now}&end_at=gte.${since}&end_notified_at=is.null&status=in.(active,waiting)&limit=100`);
  if (!rows.length) return 0;
  await db(`items?id=in.(${rows.map((i: { id: string }) => i.id).join(',')})`, { method: 'PATCH', body: JSON.stringify({ end_notified_at: now }), headers: { Prefer: 'return=minimal' } });
  for (const it of rows) {
    await notifyUser(it.user_id, { title: it.title || 'Créneau', body: 'Le créneau est terminé.', tag: `end-${it.id}`, url: `./#/open/${it.id}` }, cfg);
  }
  return rows.length;
}

async function reminders(req: Request) {
  const cfg = await config();
  const input = await req.json().catch(() => ({}));

  // Notification d'essai depuis l'app (Réglages)
  if (input.test) {
    const user = await caller(req);
    if (!user) return json({ error: 'Connexion requise' }, 401);
    return json(await notifyUser(user.id, { title: 'Brain', body: 'Les notifications fonctionnent.', tag: 'test', url: './#/settings/notif' }, cfg));
  }

  if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'Accès refusé' }, 403);

  const now = new Date().toISOString();
  const due = await db(`items?select=id,user_id,title,body,kind,parent_id&remind_at=lte.${now}&reminded_at=is.null&status=not.in.(done,trashed)&order=remind_at&limit=100`);
  const ended = await endedSlots(now, cfg);
  if (!due.length) return json({ due: 0, ended });
  // Marqué avant l'envoi : une notification ne part jamais deux fois
  await db(`items?id=in.(${due.map((i: { id: string }) => i.id).join(',')})`, { method: 'PATCH', body: JSON.stringify({ reminded_at: now }), headers: { Prefer: 'return=minimal' } });
  let sent = 0;
  for (const it of due) {
    const r = await notifyUser(it.user_id, {
      title: it.title || 'Rappel',
      body: firstLine(it.body) || 'Rappel Brain',
      tag: it.id,
      url: `./#/open/${it.id}`
    }, cfg);
    sent += r.sent;
  }
  return json({ due: due.length, sent, ended });
}

// ---------------------------------------------------------------------------
// Création d'un compte : réservée à l'administrateur (profiles.is_admin).
// Le compte est confirmé tout de suite, le mot de passe est provisoire.
// Le profil est créé par le trigger on_auth_user_created.
// ---------------------------------------------------------------------------
async function addUser(req: Request) {
  if (req.method !== 'POST') return json({ error: 'Méthode non permise' }, 405);
  const user = await caller(req);
  if (!user) return json({ error: 'Connexion requise' }, 401);
  const [prof] = await db(`profiles?id=eq.${user.id}&select=is_admin`);
  if (!prof?.is_admin) return json({ error: 'Réservé à l’administrateur' }, 403);

  let body: { email?: string; password?: string; name?: string };
  try { body = await req.json(); } catch { return json({ error: 'Requête invalide' }, 400); }
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim().slice(0, 80);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Email invalide' }, 400);
  if (password.length < 8) return json({ error: 'Mot de passe trop court (8 caractères minimum)' }, 400);

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: name ? { name } : {} })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(data.msg || data.message || data.error_description || data.error || 'Création impossible');
    const dup = /already|registered|exists/i.test(msg + ' ' + (data.error_code || ''));
    return json({ error: dup ? 'Un compte existe déjà avec cet email' : msg }, dup ? 409 : 400);
  }
  return json({ id: data.id, email });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export async function handle(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    switch (new URL(req.url).pathname.split('/').filter(Boolean).pop()) {
      case 'ping': return json({ ok: true });
      case 'calendrier': return await calendrier(req);
      case 'reminders': return await reminders(req);
      case 'add-user': return await addUser(req);
      default: return json({ error: 'Route inconnue' }, 404);
    }
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
}

// Deno (Supabase) sert la fonction ; Node l'importe seulement pour la tester
(globalThis as any).Deno.serve?.(handle);
