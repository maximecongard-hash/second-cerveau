// Configuration globale (clés publiques Supabase dans config.js à la racine)
export const VERSION = '0.36.0';
export const SCHEMA_VERSION = 25; // à augmenter avec brain_status() de supabase/schema.sql
export const CFG = window.SC_CONFIG || {};
export const LS_KEY = 'sc.v1';
// Une requête à la base ne reste jamais suspendue (iOS peut figer un appel pendant la mise en veille) ; les envois de photos gardent leur rythme
const timedFetch = (url, opts = {}) => fetch(url, String(url).includes('/rest/v1/') && !opts.signal && AbortSignal.timeout ? { ...opts, signal: AbortSignal.timeout(30000) } : opts);
export const sb = window.supabase ? window.supabase.createClient(CFG.url, CFG.key, { global: { fetch: timedFetch } }) : null;
