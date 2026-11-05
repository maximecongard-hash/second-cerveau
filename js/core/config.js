// Configuration globale (clés publiques Supabase dans config.js à la racine)
export const VERSION = '0.20.3';
export const SCHEMA_VERSION = 22; // à augmenter avec brain_status() de supabase/schema.sql
export const CFG = window.SC_CONFIG || {};
export const DEMO = new URLSearchParams(location.search).has('demo');
export const LS_KEY = DEMO ? 'sc.demo.v1' : 'sc.v1';
// Une requête à la base ne reste jamais suspendue (iOS peut figer un appel pendant la mise en veille) ; les envois de photos gardent leur rythme
const timedFetch = (url, opts = {}) => fetch(url, String(url).includes('/rest/v1/') && !opts.signal && AbortSignal.timeout ? { ...opts, signal: AbortSignal.timeout(30000) } : opts);
export const sb = !DEMO && window.supabase ? window.supabase.createClient(CFG.url, CFG.key, { global: { fetch: timedFetch } }) : null;
