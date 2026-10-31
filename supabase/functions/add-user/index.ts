// Supabase Edge Function « add-user » : crée un compte depuis les Réglages de Brain.
//
// - Réservée aux administrateurs (profiles.is_admin) : l'appelant est identifié par son JWT.
// - Corps : { email, password, name? }. Le compte est confirmé tout de suite, le mot de passe
//   est provisoire (la personne le change dans Réglages > Compte).
// - Le profil est créé par le trigger on_auth_user_created (007_partage.sql).
// À déployer avec « Verify JWT » activé (réglage par défaut).

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Méthode non permise' }, 405);

  // qui appelle ?
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return reply({ error: 'Connexion requise' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!prof?.is_admin) return reply({ error: 'Réservé à l’administrateur' }, 403);

  let body: { email?: string; password?: string; name?: string };
  try { body = await req.json(); } catch { return reply({ error: 'Requête invalide' }, 400); }
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim().slice(0, 80);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply({ error: 'Email invalide' }, 400);
  if (password.length < 8) return reply({ error: 'Mot de passe trop court (8 caractères minimum)' }, 400);

  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: name ? { name } : {}
  });
  if (error) {
    const dup = /already|registered|exists/i.test(error.message);
    return reply({ error: dup ? 'Un compte existe déjà avec cet email' : error.message }, dup ? 409 : 400);
  }
  return reply({ id: data.user.id, email });
});
