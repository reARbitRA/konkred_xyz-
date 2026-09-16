/**
 * Optional server-side authorization for the BFF.
 *
 * konkred.xyz already has users (Firebase Auth). When FULLKONK_REQUIRE_AUTH=true
 * the gateway routes require a Firebase ID token and all rate limiting is bound
 * to the verified uid. Leaving it false keeps the public /fullkonk experience
 * working (rate limited per IP) — see docs/fullkonk/GATEWAY_INTEGRATION.md.
 *
 * firebase-admin is imported lazily so the dependency is only touched when the
 * operator opts in to enforcement.
 */
import type { IncomingMessage } from 'node:http';
import { bearerToken, clientIp, fail, isHttpFailure, log } from './http';
import type { HttpFailure } from './http';
import type { GatewayConfig } from './config';

export interface Caller {
  /** Rate-limit / audit key. */
  id: string;
  authenticated: boolean;
  uid?: string;
}

let cachedAuth: { verifyIdToken: (token: string, checkRevoked?: boolean) => Promise<{ uid: string }> } | null = null;

const loadAdminAuth = async (config: GatewayConfig) => {
  if (cachedAuth) return cachedAuth;
  const appModule = await import('firebase-admin/app');
  const authModule = await import('firebase-admin/auth');

  let app = appModule.getApps()[0];
  if (!app) {
    if (config.firebaseServiceAccountJson) {
      let credentials: Record<string, unknown>;
      try {
        credentials = JSON.parse(config.firebaseServiceAccountJson) as Record<string, unknown>;
      } catch {
        throw fail(503, 'AUTH_UNAVAILABLE', 'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
      }
      app = appModule.initializeApp({
        credential: appModule.cert(credentials as Parameters<typeof appModule.cert>[0]),
        projectId: config.firebaseProjectId || (typeof credentials.project_id === 'string' ? credentials.project_id : undefined),
      });
    } else if (config.firebaseProjectId) {
      // Application Default Credentials (Vercel OIDC / GOOGLE_APPLICATION_CREDENTIALS).
      app = appModule.initializeApp({ projectId: config.firebaseProjectId }, 'konkred-bff');
    } else {
      throw fail(503, 'AUTH_UNAVAILABLE', 'FULLKONK_REQUIRE_AUTH is on but no Firebase credentials are configured for token verification.');
    }
  }
  cachedAuth = authModule.getAuth(app) as unknown as typeof cachedAuth;
  return cachedAuth;
};

/**
 * Resolves the calling identity. Returns a Caller on success or an HttpFailure
 * (401 / 503) that the route must return verbatim — never a downgraded identity.
 */
export const authenticateRequest = async (
  req: IncomingMessage,
  config: GatewayConfig,
): Promise<Caller | HttpFailure> => {
  const fallback: Caller = { id: `ip:${clientIp(req)}`, authenticated: false };
  if (!config.requireAuth) return fallback;

  const token = bearerToken(req);
  if (!token) return fail(401, 'UNAUTHORIZED', 'Sign in to use this endpoint.');

  let auth: Awaited<ReturnType<typeof loadAdminAuth>>;
  try {
    auth = await loadAdminAuth(config);
  } catch (error) {
    if (isHttpFailure(error)) return error;
    log.error('bff.auth', 'firebase admin initialization failed', { reason: String(error) });
    return fail(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
  }

  try {
    const decoded = await auth.verifyIdToken(token, true);
    if (!decoded?.uid) return fail(401, 'UNAUTHORIZED', 'The supplied session is not valid.');
    return { id: `uid:${decoded.uid}`, authenticated: true, uid: decoded.uid };
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    log.warn('bff.auth', 'id token rejected', { code });
    if (code === 'auth/id-token-expired' || code === 'auth/id-token-revoked') {
      return fail(401, 'UNAUTHORIZED', 'Your session expired — sign in again.');
    }
    if (code === 'auth/argument-error' || code === 'auth/invalid-id-token') {
      return fail(401, 'UNAUTHORIZED', 'The supplied session is not valid.');
    }
    return fail(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
  }
};

/** Test seam — clears the memoized Firebase Auth instance. */
export const resetAuthCache = (): void => {
  cachedAuth = null;
};
