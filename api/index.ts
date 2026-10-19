/**
 * Vercel Node.js serverless entry point for konkred.xyz.
 *
 * Routing (see vercel.json rewrites; every /api/* request lands here):
 *
 *   GET  /api/health                    ┐ owned by the proxy itself; answered
 *   GET  /api/ready                     ┘ without touching the legacy bundle
 *
 *   GET  /api/fullkonk/providers        ┐
 *   POST /api/fullkonk/generate (SSE)   ├─ securely proxied to the Konkred
 *   POST /api/fullkonk/github/export    │  AI Ecosystem Gateway (env-only URL,
 *   POST /api/ai                        ┘  x-brain-key / x-api-key added here)
 *
 *   every other /api/*                 → the bundled legacy Express app
 *                                        (lib/fullkonk-server.cjs): Supabase
 *                                        auth/session/analytics routes,
 *                                        /api/ai/generate, OAuth, demo, etc.
 *
 * The browser only ever calls same-origin /api routes. No provider key,
 * gateway key, FULLKONK_KEY or GitHub token is ever exposed to the client.
 *
 * ── INCIDENT HARDENING (why this file looks defensive) ──────────────────────
 * Production returned `500 FUNCTION_INVOCATION_FAILED` on EVERY /api/* route,
 * including routes that need no configuration at all. That signature means the
 * invocation itself died — an exception escaping the handler, or a rejected
 * promise/throw raised while loading the 4.1 MB bundled legacy Express app
 * (which runs `initializeApp()` for Supabase Auth and builds a pg Pool at
 * module scope). Vercel renders its own HTML error page in that case, so the
 * carefully written JSON error contracts inside the proxy never got a chance
 * to run and the browser saw an opaque 500.
 *
 * Therefore: every path out of this function is wrapped. The handler catches
 * synchronous throws, awaited rejections, and late/async failures, and always
 * emits a controlled JSON body. A missing or malformed configuration is a 503
 * with a machine-readable `code`, never a crash.
 */
import type { Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { configFromEnv, createGatewayHandler, defaultLogger } from '../server/gateway-proxy';
import { authenticateRequest } from '../server/gateway/auth';
import { readGatewayConfig } from '../server/gateway/config';
import { isGatewayOwnedPath } from '../server/gateway/router';
import { isHttpFailure, sendFailure } from '../server/gateway/http';
import { billingConfigured, getMeter, getPaymentRoutes } from '../server/billing-runtime';

/* ── Embedded Konkred Gateway (central backend) ────────────────────────────
 * The gateway lives in ./gateway/src/server.mjs (copied from
 * reARbitRA/konkred-AI-ecosystem). It is loaded lazily so a deployment
 * without a registry file or with an external KONKRED_GATEWAY_URL proxy
 * still works. The Vercel function includes gateway/data/policies.registry.json
 * via vercel.json includeFiles.
 *
 * Routes owned by the embedded gateway (see gateway/src/server.mjs):
 *   GET  /api/health, /healthz, /api/ready, /readyz  → enriched health
 *   GET  /api/models, /api/status, /api/admin/cache/flush
 *   POST /api/ai, GET/POST /api/fullkonk/*, /v1/chat/completions, /v1/models
 * Root "/" stays the SPA — the gateway dashboard is disabled via
 * DASHBOARD_ENABLED=false (env) so the website is never replaced.
 */
type EmbeddedModule = typeof import('../gateway/src/server.mjs');
let embeddedMod: EmbeddedModule | null | undefined;
let embeddedLoadError: string | null = null;
const embeddedPaths = new Set<string>([
  '/api/health',
  '/healthz',
  '/api/ready',
  '/readyz',
  '/api/models',
  '/api/status',
  '/api/admin/cache/flush',
  '/api/ai',
  '/api/fullkonk/providers',
  '/api/fullkonk/generate',
  '/api/fullkonk/github/export',
  '/v1/chat/completions',
  '/v1/models',
]);
const BILLABLE_EMBEDDED = new Set<string>([
  '/api/ai',
  '/api/fullkonk/generate',
  '/v1/chat/completions',
  '/v1/models',
]);
const tryLoadEmbedded = async (): Promise<EmbeddedModule | null> => {
  if (embeddedMod !== undefined) return embeddedMod;
  try {
    // Dynamic ESM import — works in Vercel Node.js runtime (package.json type:module)
    // @ts-ignore — TypeScript cannot resolve .mjs without explicit allowJs
    const mod = (await import('../gateway/src/server.mjs')) as EmbeddedModule;
    embeddedMod = mod;
    return mod;
  } catch (e) {
    embeddedLoadError = (e as Error)?.message ?? String(e);
    embeddedMod = null;
    return null;
  }
};
const isEmbeddedPath = (pathname: string): boolean => embeddedPaths.has(pathname) || pathname.startsWith('/v1/');
const shouldUseEmbedded = (): boolean => {
  const extUrl = (process.env.KONKRED_GATEWAY_URL || process.env.BRAIN_URL || '').trim();
  if (extUrl) return false;
  return true;
};

// ── KRedKey billing metering for embedded gateway (persistent quota) ──────
async function billEmbeddedCall(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!BILLABLE_EMBEDDED.has((req.url || '/').split('?')[0])) return true;
  if (!billingConfigured()) return true; // no DB → unmetered, but tier limits still apply via userLimiter
  try {
    const { getWorkflowDeps } = await import('../server/billing-runtime');
    const deps = await getWorkflowDeps().catch(()=>undefined);
    const billing = (deps as unknown as { billing?: import('../server/billing').Billing })?.billing;
    if (!billing) return true;
    // Resolve identity: kred_live_ key → api:<key>, else fb:<uid> via Supabase token
    let identity: string | null = null;
    const apiKey = (req.headers['x-api-key'] as string) || (req.headers.authorization as string)?.replace(/^Bearer\s+/i, '').trim();
    if (apiKey && typeof apiKey === 'string' && apiKey.startsWith('kred_live_')) {
      identity = `api:${apiKey}`;
    } else if (req.headers.authorization) {
      const token = (req.headers.authorization as string).replace(/^Bearer\s+/i, '').trim();
      if (token && token.length > 20) {
        try {
          const { verifySession } = await import('../server/supabase');
          const uid = await verifySession(token);
          if (uid) identity = `fb:${uid}`;
        } catch {}
      }
    }
    if (!identity) {
      // fallback to anon via IP (has daily 10 free)
      const fwd = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'unknown';
      const { anonymousIdentity } = await import('../server/billing');
      identity = await anonymousIdentity(fwd.split(',')[0].trim() || 'unknown', process.env.ANON_SALT || 'konkred-default-anon-salt');
    }
    const result = await billing.spend(identity, 1, 'api');
    if (!result.ok) {
      safeJson(res, 402, {
        error: 'Quota exhausted. Upgrade your KRedKey to continue.',
        code: 'QUOTA_EXHAUSTED',
        balance: result.balance,
        upgradeUrl: '/checkout',
      });
      return false;
    }
    // Touch kred key lastUsed
    if (identity.startsWith('api:kred_live_')) {
      import('../server/kredkey-store').then(m=> m.getKredKeyStore().then(s=> s.touch(identity.slice(4)))).catch(()=>{});
    }
    return true;
  } catch {
    return true; // fail open — don't block AI on billing glitch
  }
}

// Runtime: Node.js (Express + streaming require it; this is not an Edge function).
export const config = {
  runtime: 'nodejs',
};

/** Emit a controlled JSON response, but only if nothing has been sent yet. */
function safeJson(response: ServerResponse, status: number, payload: unknown): void {
  try {
    if (response.writableEnded || response.destroyed) return;
    if (!response.headersSent) {
      response.statusCode = status;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
    }
    response.end(JSON.stringify(payload));
  } catch {
    // The socket is already gone; nothing further can or should be done.
  }
}

let legacyAppPromise: Promise<Express> | undefined;

const legacyApp = (): Promise<Express> => {
  legacyAppPromise ||= import('../lib/fullkonk-server.cjs').then((module) => {
    const createApp = module.createApp || module.default?.createApp;
    if (typeof createApp !== 'function') throw new Error('Bundled server did not export createApp.');
    return createApp();
  });
  return legacyAppPromise;
};

/**
 * Legacy Express fallback.
 *
 * The bundled app initialises Supabase Auth and a PostgreSQL pool at module
 * scope, so importing it can reject on a deployment whose SQL_ / Supabase
 * variables are absent. That rejection is contained here: the failed promise is
 * discarded (so a later request can retry a cold import) and the caller gets a
 * controlled 503 instead of an invocation crash.
 *
 * Express itself can also throw synchronously while dispatching, and an error
 * thrown inside one of its async route handlers surfaces as an unhandled
 * rejection — which is exactly what kills a serverless invocation. Both are
 * trapped below.
 */
/** Paths owned by the billing layer; matched before the legacy app sees them. */
const BILLING_PATHS = new Set([
  '/api/quota',
  '/api/payments/plans',
  '/api/payments/create',
  '/api/payments/status',
  '/api/payments/nowpayments/webhook',
]);

const fallback = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  // ── Billing / payments ────────────────────────────────────────────────────
  // Handled here (rather than inside the gateway proxy) because these routes
  // are owned by this deployment's own database, not by the AI gateway.
  const pathname = (request.url || '/').split('?')[0];
  // /api/internal/* is the service-to-service quota contract used by the
  // Telegram bot; it is authenticated by INTERNAL_API_KEY inside the handler.
  if (BILLING_PATHS.has(pathname) || pathname.startsWith('/api/internal/')) {
    if (!billingConfigured()) {
      safeJson(response, 503, {
        error: 'سرویس پرداخت هنوز پیکربندی نشده است. لطفاً با پشتیبانی تماس بگیرید.',
        code: 'BILLING_NOT_CONFIGURED',
      });
      return;
    }
    const routes = await getPaymentRoutes();
    if (!routes) {
      safeJson(response, 503, {
        error: 'سرویس پرداخت موقتاً در دسترس نیست. لطفاً دوباره تلاش کنید.',
        code: 'BILLING_UNAVAILABLE',
        retryable: true,
      });
      return;
    }
    if (await routes(request, response)) return;
  }

  let app: Express;
  try {
    app = await legacyApp();
  } catch (error) {
    legacyAppPromise = undefined; // allow a retry on the next invocation
    defaultLogger('error.legacy_init', { name: (error as Error)?.name || 'Error' });
    safeJson(response, 503, {
      error: 'This endpoint is temporarily unavailable on this deployment.',
      code: 'LEGACY_APP_UNAVAILABLE',
    });
    return;
  }

  try {
    app(request, response);
  } catch (error) {
    defaultLogger('error.legacy_dispatch', { name: (error as Error)?.name || 'Error' });
    safeJson(response, 500, { error: 'The request could not be completed.', code: 'LEGACY_DISPATCH_FAILED' });
  }
};

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    // ── 0. Embedded Gateway fast-path (OpenAI-compatible API Gateway) ───────
    // When no external KONKRED_GATEWAY_URL is set, the central gateway runs
    // inside this deployment. This keeps the website (/* → index.html) intact
    // while exposing the OpenAI-compatible API at /v1/* via the same Vercel
    // function (see vercel.json rewrites). The external BFF proxy is kept for
    // backward compatibility when KONKRED_GATEWAY_URL is present (existing tests).
    const rawPath = (request.url || '/').split('?')[0];
    // KRedKey routes are handled first — they live in Supabase/Postgres, not the legacy bundle
    if (rawPath.startsWith('/api/kredkeys')) {
      const { handleKredKeyRequest } = await import('../server/kredkey-routes');
      if (await handleKredKeyRequest(request, response)) return;
    }
    if (typeof request.url === 'string' && request.url.startsWith('/api/v1')) {
      request.url = request.url.replace(/^\/api\/v1(?=\/|$|\?)/, '/v1');
    }
    const pathname = (request.url || '/').split('?')[0];

    if (shouldUseEmbedded() && isEmbeddedPath(pathname)) {
      // Persistent quota check before inference (free tier → paywall)
      if (BILLABLE_EMBEDDED.has(pathname)) {
        const allowed = await billEmbeddedCall(request, response);
        if (!allowed) return;
      }
      const mod = await tryLoadEmbedded();
      if (mod) {
        const before = response.writableEnded;
        await mod.handleRequest(request as unknown as Parameters<typeof mod.handleRequest>[0], response as unknown as Parameters<typeof mod.handleRequest>[1]);
        if (response.writableEnded || response.headersSent) return;
        if (!before && !response.headersSent) {
          // fall through
        } else {
          return;
        }
      } else if (embeddedLoadError) {
        defaultLogger('error.embedded_load', { error: embeddedLoadError });
      }
    }

    // ── 1. BFF Proxy (legacy external gateway) ──────────────────────────────
    // Read env per invocation so Vercel environment changes (and tests of
    // missing configuration) never require a cold start.
    let gatewayHandler;
    try {
      gatewayHandler = createGatewayHandler({
        config: configFromEnv(process.env),
        fallback,
        log: defaultLogger,
        // Enforces the free-tier limit on paid generation. Resolves to
        // undefined without a database, leaving generation unmetered rather
        // than offline.
        meter: await getMeter(),
      });
    } catch (error) {
      // Invalid configuration (bad URL, http in production, credentials in the
      // URL...). This is an operator error and must read as one — not a crash.
      defaultLogger('error.invalid_config', { name: (error as Error)?.name || 'Error' });
      safeJson(response, 503, {
        error: 'The Konkred Gateway integration is misconfigured on this deployment.',
        code: 'GATEWAY_MISCONFIGURED',
      });
      return;
    }
    if (isGatewayOwnedPath(rawPath)) {
      const caller = await authenticateRequest(request, readGatewayConfig());
      if (isHttpFailure(caller)) { sendFailure(response, caller); return; }
    }
    await gatewayHandler(request, response);
  } catch (error) {
    // Last line of defence: nothing may escape the serverless handler.
    defaultLogger('error.unhandled', { name: (error as Error)?.name || 'Error' });
    safeJson(response, 500, { error: 'The request could not be completed.', code: 'UNHANDLED_ERROR' });
  }
}
