import { createClient } from '@supabase/supabase-js';
export interface SupabaseEnv { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string; VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }
export function supabaseConfig(env: SupabaseEnv = process.env) {
  return { url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '', key: env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || '' };
}
export function sessionClient(token: string, env: SupabaseEnv = process.env) {
  const { url, key } = supabaseConfig(env);
  if (!url || !key) throw new Error('Supabase authentication is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
}
/** Validates against Supabase Auth; never trusts a locally decoded JWT. */
export async function verifySession(token: string, env: SupabaseEnv = process.env): Promise<string | null> {
  const client = sessionClient(token, env);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || !data.user.email_confirmed_at) return null;
  return data.user.id;
}
