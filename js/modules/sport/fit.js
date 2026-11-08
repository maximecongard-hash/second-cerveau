// ---------------------------------------------------------------------------
// Lecteur de fichiers FIT (export COROS, Garmin…) : ne garde que le résumé de chaque séance (message « session »)
// et la fréquence cardiaque des points si le résumé n'en a pas. Sans dépendance, sans accès réseau.
// Format : en-tête, puis des messages précédés d'une définition (champs, tailles, types).
// ---------------------------------------------------------------------------
const FIT_EPOCH = 631065600; // 1989-12-31, en secondes depuis 1970
const SIZES = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 1, 8: 4, 9: 8, 10: 1, 11: 2, 12: 4, 13: 1, 14: 8, 15: 8, 16: 8 };
// Valeur « absente » de chaque type entier (le fichier la met quand le capteur n'a rien mesuré)
const INVALID = { 0: 0xff, 1: 0x7f, 2: 0xff, 3: 0x7fff, 4: 0xffff, 5: 0x7fffffff, 6: 0xffffffff, 10: 0, 11: 0, 12: 0, 13: 0xff };

export const isFit = bytes => bytes.length > 12 && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === '.FIT';

// Sport FIT (message session : champ 5) et sous-sport (champ 6) vers les sports de Brain
export function fitSport(sport, sub) {
  if (sub === 20) return 'strength'; // strength_training
  if (sub === 43 || sub === 44) return 'mobility'; // yoga, pilates
  return { 1: 'run', 2: 'bike', 5: 'swim', 11: 'hike', 17: 'hike' }[sport] || 'other';
}

function decode(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const head = bytes[0], end = Math.min(bytes.length, head + dv.getUint32(4, true));
  const defs = [], sessions = [], hrs = [];
  let p = head;
  while (p < end) {
    const h = bytes[p++];
    let local, def;
    if (h & 0x80) { local = (h >> 5) & 3; def = defs[local]; } // horodatage compressé : message de données
    else if (h & 0x40) { // définition
      local = h & 15;
      const little = bytes[p + 1] === 0;
      const global = dv.getUint16(p + 2, little), n = bytes[p + 4];
      p += 5;
      const fields = [];
      for (let i = 0; i < n; i++, p += 3) fields.push({ num: bytes[p], size: bytes[p + 1], type: bytes[p + 2] & 0x1f });
      let dev = 0;
      if (h & 0x20) { const m = bytes[p++]; for (let i = 0; i < m; i++, p += 3) dev += bytes[p + 1]; }
      defs[local] = { global, little, fields, dev };
      continue;
    } else { local = h & 15; def = defs[local]; }
    if (!def) throw new Error('fichier FIT illisible');
    const msg = {};
    let q = p;
    for (const f of def.fields) {
      const t = f.type, sz = SIZES[t] || 1;
      if (t === 7) { let s = ''; for (let i = 0; i < f.size && bytes[q + i]; i++) s += String.fromCharCode(bytes[q + i]); msg[f.num] = s; }
      else if (f.size === sz) {
        let v;
        if (t === 1) v = dv.getInt8(q); else if (t === 3) v = dv.getInt16(q, def.little); else if (t === 5) v = dv.getInt32(q, def.little);
        else if (t === 4 || t === 11) v = dv.getUint16(q, def.little); else if (t === 6 || t === 12) v = dv.getUint32(q, def.little);
        else if (t === 8) v = dv.getFloat32(q, def.little); else if (t === 9) v = dv.getFloat64(q, def.little);
        else if (sz === 1) v = bytes[q]; else v = undefined; // entiers 64 bits : sans intérêt ici
        if (v !== undefined && v !== INVALID[t]) msg[f.num] = v;
      }
      q += f.size;
    }
    p = q + def.dev;
    if (def.global === 18) sessions.push(msg);
    else if (def.global === 20 && msg[3] > 0) hrs.push(msg[3]);
  }
  return { sessions, hrs };
}

// Séances d'un fichier FIT : { sport, name, start, dur_s, dist_m, avg_hr, max_hr, kcal, asc_m }
export function parseFit(bytes) {
  if (!isFit(bytes)) throw new Error('ce n’est pas un fichier FIT');
  const { sessions, hrs } = decode(bytes);
  if (!sessions.length) throw new Error('aucune séance dans ce fichier FIT');
  const hrAvg = hrs.length ? Math.round(hrs.reduce((s, x) => s + x, 0) / hrs.length) : null;
  return sessions.map(s => ({
    sport: fitSport(s[5], s[6]),
    name: s[110] || '',
    start: new Date((s[2] ?? s[253]) * 1000 + FIT_EPOCH * 1000),
    dur_s: Math.round((s[8] ?? s[7] ?? 0) / 1000),
    dist_m: Math.round((s[9] ?? 0) / 100),
    avg_hr: s[16] ?? hrAvg,
    max_hr: s[17] ?? null,
    kcal: s[11] ?? null,
    asc_m: s[22] ?? null
  }));
}
