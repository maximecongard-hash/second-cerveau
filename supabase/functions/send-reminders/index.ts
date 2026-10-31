// Supabase Edge Function « send-reminders » : envoie les notifications de Brain.
//
// - Appelée chaque minute par pg_cron (voir supabase/005_notifications.sql), avec l'en-tête x-cron-secret.
// - Appelée par l'app avec { test: true } (utilisateur connecté) pour envoyer une notification d'essai.
// - Les clés VAPID sont créées au premier appel et rangées dans la table push_config :
//   personne n'a de clé secrète à copier.
//
// Aucune dépendance : Web Push (RFC 8291 + VAPID RFC 8292) fait à la main avec WebCrypto.
// À déployer avec « Verify JWT » désactivé (pg_cron n'envoie pas de JWT).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CONTACT = 'https://maximecongard-hash.github.io/second-cerveau/';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// ---------- Web Push (début) ----------
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
    sub: CONTACT
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

export async function sendPush(sub: { endpoint: string, p256dh: string, auth: string },
  message: unknown, vapid: { public_key: string, private_jwk: JsonWebKey }) {
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
// ---------- Web Push (fin) ----------

// Accès à la base avec la clé de service (contourne RLS : réservé à cette fonction)
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) }
  });
  if (!res.ok) throw new Error(`${path} : ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function config() {
  const [cfg] = await db('push_config?id=eq.1&select=public_key,private_jwk,cron_secret');
  if (!cfg) throw new Error('push_config vide : lance supabase/005_notifications.sql');
  if (!cfg.public_key) {
    const keys = await newVapidKeys();
    await db('push_config?id=eq.1', { method: 'PATCH', body: JSON.stringify(keys) });
    return { ...cfg, ...keys };
  }
  return cfg;
}

// Envoie à tous les appareils d'un utilisateur ; oublie les abonnements expirés
async function notifyUser(userId: string, message: unknown, vapid: { public_key: string, private_jwk: JsonWebKey }) {
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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const cfg = await config();
    const input = await req.json().catch(() => ({}));

    // Notification d'essai depuis l'app (Réglages)
    if (input.test) {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
      const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${jwt}` } });
      if (!who.ok) return json({ error: 'Connexion requise' }, 401);
      const user = await who.json();
      const r = await notifyUser(user.id, { title: 'Brain', body: 'Les notifications fonctionnent.', tag: 'test', url: './#/settings' }, cfg);
      return json(r);
    }

    if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'Accès refusé' }, 403);

    const now = new Date().toISOString();
    const due = await db(`items?select=id,user_id,title,body,kind,parent_id&remind_at=lte.${now}&reminded_at=is.null&status=not.in.(done,trashed)&order=remind_at&limit=100`);
    if (!due.length) return json({ due: 0 });
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
    return json({ due: due.length, sent });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
