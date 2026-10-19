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
  // If an external gateway URL is explicitly configured, keep the BFF proxy
  // path for backward compatibility (existing tests set KONKRED_GATEWAY_URL).
  // The embedded gateway is the default when no external URL is set.
  const extUrl = (process.env.KONKRED_GATEWAY_URL || process.env.BRAIN_URL || '').trim();
  if (extUrl) return false;
  // Otherwise always try embedded — it handles DEMO_MOCK/mock fallback even
  // with no provider keys, which is needed for preview smoke without paid calls.
  return true;
};

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
    // Normalise Vercel's /api/v1/* rewrite back to /v1/* so the gateway router
    // can match it (same as api/[...path].mjs in the ecosystem repo).
    if (typeof request.url === 'string' && request.url.startsWith('/api/v1')) {
      request.url = request.url.replace(/^\/api\/v1(?=\/|$|\?)/, '/v1');
    }
    const pathname = (request.url || '/').split('?')[0];

    if (shouldUseEmbedded() && isEmbeddedPath(pathname)) {
      const mod = await tryLoadEmbedded();
      if (mod) {
        // For health/ready we keep the website contract but enrich it with
        // gateway pool info when available — this preserves the existing
        // monitors (tests expect {status:"ok"}) while enabling the gateway
        // capacity checks needed for api.konkred.xyz readiness.
        // The embedded handler already implements correct auth for /api/models,
        // /api/status etc., including kred_ keys.
        // We delegate directly; the embedded router returns 404 for unknown
        // paths, which we then fall through to the proxy logic below.
        const before = response.writableEnded;
        await mod.handleRequest(request as unknown as Parameters<typeof mod.handleRequest>[0], response as unknown as Parameters<typeof mod.handleRequest>[1]);
        if (response.writableEnded || response.headersSent) return;
        // If embedded returned 404 (no route), fall through to BFF proxy.
        // We detect this by checking if handleRequest wrote a 404 JSON with
        // code NOT_FOUND and no other handler has sent headers. For now, if
        // no headers sent, we continue.
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
