import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  client = createClient(url, key);
  return client;
}
export const db = () => getSupabase();
export async function getAccessToken(): Promise<string> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session?.access_token || '';
}
export enum OperationType { CREATE='create', UPDATE='update', DELETE='delete', LIST='list', GET='get', WRITE='write' }
export function handleDatabaseError(_error: unknown, _operation: OperationType, _path: string | null): never {
  throw new Error('Database request failed. Please try again.');
}

/** Optional session binding for public APIs that also support anonymous callers. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try { const token = await getAccessToken(); return token ? { Authorization: `Bearer ${token}` } : {}; }
  catch { return {}; }
}
