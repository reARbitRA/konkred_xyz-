import type { IncomingMessage } from 'node:http';
import { bearerToken, clientIp, fail } from './http';
import type { HttpFailure } from './http';
import type { GatewayConfig } from './config';
import { verifySession } from '../supabase';
export interface Caller { id: string; authenticated: boolean; uid?: string }
export async function authenticateRequest(req: IncomingMessage, config: GatewayConfig): Promise<Caller | HttpFailure> {
  if (!config.requireAuth) return { id: `ip:${clientIp(req)}`, authenticated: false };
  const token = bearerToken(req);
  if (!token) return config.requireAuth ? fail(401, 'UNAUTHORIZED', 'Sign in to use this endpoint.') : { id: `ip:${clientIp(req)}`, authenticated: false };
  if (!config.supabaseUrl || !config.supabasePublishableKey) return fail(503, 'AUTH_UNAVAILABLE', 'Supabase authentication is not configured.');
  try {
    const uid = await verifySession(token, { SUPABASE_URL: config.supabaseUrl, SUPABASE_PUBLISHABLE_KEY: config.supabasePublishableKey });
    return uid ? { id: `uid:${uid}`, authenticated: true, uid } : fail(401, 'UNAUTHORIZED', 'Your session is invalid or expired. Sign in again.');
  } catch { return fail(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.'); }
}
export const resetAuthCache = (): void => {};
