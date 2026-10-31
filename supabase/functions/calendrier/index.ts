// Brain : flux d'agenda (ICS) pour l'abonnement de Calendrier sur iPhone et Mac
// Edge Function Supabase « calendrier », déployée avec « Verify JWT » désactivé :
//   https://<projet>.supabase.co/functions/v1/calendrier?token=<jeton calendrier>
// Le jeton est vérifié par la fonction SQL calendar_feed (supabase/005_calendrier.sql),
// appelée avec la clé publique : la fonction ne voit rien de plus qu'un raccourci.

const SUPABASE_URL = 'https://zqdvtbkjvfzkjqtaffbb.supabase.co';
const PUBLIC_KEY = 'sb_publishable_JXRFdwQ2rHPpIWDs-fx2Pw_LLnUKoIp';
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
  let cur = '', size = 0, max = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > max) { out.push(cur); cur = ' '; size = 1; max = 75; }
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

async function handle(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return new Response('Lien d’agenda invalide', { status: 404 });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/calendar_feed`, {
    method: 'POST',
    headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
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

// Deno (Supabase) sert la fonction ; Node l'importe seulement pour tester buildIcs
(globalThis as any).Deno?.serve(handle);
