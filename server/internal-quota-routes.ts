/**
 * Internal quota API — the contract that makes quota SHARED across surfaces.
 *
 * The Telegram bot (a separate service, in reARbitRA/konkred-AI-ecosystem) must
 * spend from the same balance as the website. Two designs were possible:
 *
 *   A. Give the bot direct PostgreSQL credentials.
 *   B. Expose a narrow, authenticated HTTP contract owned by this service.
 *
 * (B) is implemented. Direct database access from a second service would mean
 * two copies of the spend/refund rules that must be kept in lockstep forever,
 * and a second place credentials can leak. Here the billing rules stay in
 * exactly one implementation (server/billing.ts) and the bot holds only a
 * service token that grants nothing but quota operations.
 *
 *   POST /api/internal/quota/spend    { identity, amount?, reference? }
 *   GET  /api/internal/quota/balance?identity=telegram:123
 *   POST /api/internal/quota/refund   { identity, amount?, reference? }
 *
 * Auth: a constant-time comparison against INTERNAL_API_KEY. These routes are
 * service-to-service only and are never called from a browser, so there is no
 * CORS allowance and no cookie/session path into them.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Billing, assertIdentity, IdentityError, type Surface } from './billing';

const MAX_BODY_BYTES = 8 * 1024;
/** Surfaces a service token may spend on behalf of. */
const ALLOWED_SURFACES = new Set<Surface>(['telegram', 'api', 'web', 'system']);

export interface InternalQuotaDeps {
  billing: Billing;
  /** Shared secret presented by the bot as `x-internal-key`. */
  internalKey: string;
  log?: (event: string, meta?: Record<string, unknown>) => void;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

/** Constant-time secret comparison; never leaks length via early exit. */
function secretMatches(presented: string, expected: string): boolean {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readBody(req: IncomingMessage): Promise<{ ok: true; raw: string } | { ok: false }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { tooBig = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(tooBig ? { ok: false } : { ok: true, raw: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', () => resolve({ ok: false }));
  });
}

export function createInternalQuotaRoutes(deps: InternalQuotaDeps) {
  const { billing, internalKey } = deps;
  const log = deps.log || (() => undefined);

  return async function internalQuotaRoutes(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    if (!pathname.startsWith('/api/internal/')) return false;

    // Refuse to run at all when unconfigured. Without this an empty
    // INTERNAL_API_KEY would make every secret comparison trivially pass.
    if (!internalKey) {
      log('error.internal_key_missing');
      sendJson(res, 503, { error: 'Internal API is not configured.', code: 'INTERNAL_NOT_CONFIGURED' });
      return true;
    }

    const presented = req.headers['x-internal-key'];
    if (!secretMatches(typeof presented === 'string' ? presented : '', internalKey)) {
      log('internal.unauthorized', { path: pathname });
      // Deliberately terse: no hint about which part was wrong.
      sendJson(res, 401, { error: 'Unauthorized.', code: 'UNAUTHORIZED' });
      return true;
    }

    const method = (req.method || 'GET').toUpperCase();

    try {
      if (pathname === '/api/internal/quota/balance' && method === 'GET') {
        const identity = assertIdentity(url.searchParams.get('identity') || '');
        const balance = await billing.getBalance(identity);
        sendJson(res, 200, { ...balance, exhausted: balance.totalRemaining <= 0 });
        return true;
      }

      if ((pathname === '/api/internal/quota/spend' || pathname === '/api/internal/quota/refund') && method === 'POST') {
        const body = await readBody(req);
        if (!body.ok) { sendJson(res, 413, { error: 'Body too large.', code: 'BODY_TOO_LARGE' }); return true; }

        let parsed: { identity?: unknown; amount?: unknown; reference?: unknown; surface?: unknown };
        try { parsed = JSON.parse(body.raw || '{}'); }
        catch { sendJson(res, 400, { error: 'Invalid JSON.', code: 'BAD_JSON' }); return true; }

        const identity = assertIdentity(typeof parsed.identity === 'string' ? parsed.identity : '');
        const amount = parsed.amount === undefined ? 1 : Number(parsed.amount);
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
          sendJson(res, 400, { error: 'amount must be an integer between 1 and 100.', code: 'BAD_AMOUNT' });
          return true;
        }
        const requested = typeof parsed.surface === 'string' ? (parsed.surface as Surface) : 'telegram';
        const surface: Surface = ALLOWED_SURFACES.has(requested) ? requested : 'telegram';
        const reference = typeof parsed.reference === 'string' ? parsed.reference.slice(0, 128) : undefined;

        if (pathname.endsWith('/refund')) {
          const balance = await billing.grantRefund(identity, amount, reference);
          log('internal.refund', { amount });
          sendJson(res, 200, { ok: true, ...balance });
          return true;
        }

        const result = await billing.spend(identity, amount, surface, reference);
        if (!result.ok) {
          log('internal.quota_exhausted');
          // 402 mirrors the website contract so both surfaces behave alike.
          sendJson(res, 402, {
            ok: false,
            code: 'QUOTA_EXHAUSTED',
            upgradeUrl: '/checkout',
            ...result.balance,
          });
          return true;
        }
        sendJson(res, 200, { ok: true, ...result.balance });
        return true;
      }

      sendJson(res, 404, { error: 'Unknown internal route.', code: 'ROUTE_NOT_FOUND' });
      return true;
    } catch (error) {
      if (error instanceof IdentityError) {
        sendJson(res, 400, { error: 'Invalid identity.', code: 'BAD_IDENTITY' });
        return true;
      }
      log('error.internal_quota', { name: (error as Error)?.name || 'Error' });
      sendJson(res, 503, { error: 'Quota service unavailable.', code: 'BILLING_UNAVAILABLE', retryable: true });
      return true;
    }
  };
}
