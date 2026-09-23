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
 *                                        (lib/fullkonk-server.cjs): Firebase
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
 * (which runs `initializeApp()` for firebase-admin and builds a pg Pool at
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
import { billingConfigured, getMeter, getPaymentRoutes } from '../server/billing-runtime';

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
 * The bundled app initialises firebase-admin and a PostgreSQL pool at module
 * scope, so importing it can reject on a deployment whose SQL_ / Firebase
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
    await gatewayHandler(request, response);
  } catch (error) {
    // Last line of defence: nothing may escape the serverless handler.
    defaultLogger('error.unhandled', { name: (error as Error)?.name || 'Error' });
    safeJson(response, 500, { error: 'The request could not be completed.', code: 'UNHANDLED_ERROR' });
  }
}
