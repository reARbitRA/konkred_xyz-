import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage } from 'node:http';
const { getUser, createClient } = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
import { verifySession, sessionClient } from '../server/supabase';
import { authenticateRequest } from '../server/gateway/auth';
import { readGatewayConfig } from '../server/gateway/config';
const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
const request = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {}, socket: { remoteAddress: '127.0.0.1' } } as IncomingMessage);
beforeEach(() => { vi.resetAllMocks(); createClient.mockReturnValue({ auth: { getUser } }); });
describe('Supabase server identity', () => {
  it('validates the token with the auth server, with no privileged client', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-a', email_confirmed_at: '2026-10-19' } }, error: null });
    expect(await verifySession('access-token', env)).toBe('user-a');
    expect(getUser).toHaveBeenCalledWith('access-token');
    expect(createClient).toHaveBeenCalledWith(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, expect.objectContaining({
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: 'Bearer access-token' } },
    }));
  });
  it('rejects invalid or expired sessions', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } });
    expect(await verifySession('expired', env)).toBeNull();
  });
  it('rejects unconfirmed identities', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'unverified' } }, error: null });
    expect(await verifySession('unverified', env)).toBeNull();
  });
  it('does not silently initialize a dummy project when configuration is missing', () => {
    expect(() => sessionClient('token', {})).toThrow('not configured');
    expect(createClient).not.toHaveBeenCalled();
  });
});
describe('Supabase gateway authentication', () => {
  const config = () => readGatewayConfig({ ...env, FULLKONK_REQUIRE_AUTH: 'true' });
  it('returns 401 before making an auth request if the token is missing', async () => {
    expect(await authenticateRequest(request(), config())).toMatchObject({ status: 401 });
    expect(getUser).not.toHaveBeenCalled();
  });
  it('binds the verified uid to the caller identity', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-a', email_confirmed_at: '2026-10-19' } }, error: null });
    expect(await authenticateRequest(request('valid'), config())).toEqual({ id: 'uid:user-a', uid: 'user-a', authenticated: true });
  });
  it('fails closed on invalid tokens and outages', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    expect(await authenticateRequest(request('invalid'), config())).toMatchObject({ status: 401 });
    getUser.mockRejectedValue(new Error('network failure'));
    expect(await authenticateRequest(request('valid'), config())).toMatchObject({ status: 503 });
  });
  it('reports missing configuration rather than accepting an unverified token', async () => {
    expect(await authenticateRequest(request('valid'), readGatewayConfig({ FULLKONK_REQUIRE_AUTH: 'true' }))).toMatchObject({ status: 503 });
  });
});
