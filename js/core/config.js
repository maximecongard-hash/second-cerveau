// Configuration globale (clés publiques Supabase dans config.js à la racine)
export const VERSION = '0.9.1';
export const CFG = window.SC_CONFIG || {};
export const DEMO = new URLSearchParams(location.search).has('demo');
export const LS_KEY = DEMO ? 'sc.demo.v1' : 'sc.v1';
export const sb = !DEMO && window.supabase ? window.supabase.createClient(CFG.url, CFG.key) : null;
