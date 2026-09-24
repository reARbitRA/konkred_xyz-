/**
 * Lazy, crash-safe construction of the billing/payment stack from environment.
 *
 * Deliberately lazy: the production incident was caused by a module that built
 * a PostgreSQL pool and initialised firebase-admin at import time, so a bad
 * environment killed the whole serverless function. Nothing here runs until a
 * payment route is actually called, and a failure yields `null` (→ a controlled
 * 503) rather than an exception during module evaluation.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Billing } from './billing';
import { Payments } from './payments';
import { createPaymentRoutes } from './payment-routes';
import { createInternalQuotaRoutes } from './internal-quota-routes';

export interface BillingRuntimeEnv {
  DATABASE_URL?: string;
  NOWPAYMENTS_API_KEY?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  NOWPAYMENTS_IPN_CALLBACK_URL?: string;
  /** Override the provider base URL (local verification only; never in prod). */
  NOWPAYMENTS_API_BASE?: string;
  ANON_SALT?: string;
  /** Escape hatch for a self-signed DB certificate. Never set in production. */
  DATABASE_SSL_INSECURE?: string;
  /** Shared secret the Telegram bot presents to /api/internal/*. */
  INTERNAL_API_KEY?: string;
  TRIAL_MESSAGES?: string;
  TRIAL_ENABLED?: string;
  DAILY_FREE_MESSAGES?: string;
  DAILY_MODE?: string;
  FIREBASE_PROJECT_ID?: string;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

/**
 * TLS settings for the database connection.
 *
 * Certificate verification is ON by default. This carries payment and quota
 * records, so an unverified connection would let a man-in-the-middle read or
 * alter balances. Every managed provider this is likely to run against (Neon,
 * Supabase, Railway, RDS, Render) presents a publicly-trusted certificate, so
 * verification simply works.
 *
 * `DATABASE_SSL_INSECURE=true` is the deliberate, documented escape hatch for
 * a self-signed certificate on a private network — it must never be set for a
 * database reachable over the public internet.
 */
function sslConfigFor(dsn: string, env: BillingRuntimeEnv): false | { rejectUnauthorized: boolean } {
  // A unix socket or loopback connection never leaves the machine.
  if (/localhost|127\.0\.0\.1|host=\/|sslmode=disable/.test(dsn)) return false;
  if (env.DATABASE_SSL_INSECURE === 'true') {
    console.warn('[billing] event=warn.tls_verification_disabled — DATABASE_SSL_INSECURE is set; do not use this over the public internet');
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

let cached: Handler | null | undefined;

/** True when the deployment has enough configuration to bill anyone. */
export function billingConfigured(env: BillingRuntimeEnv = process.env): boolean {
  return Boolean(env.DATABASE_URL);
}

/**
 * Verify a Firebase ID token using firebase-admin, imported lazily.
 *
 * Returning null (rather than throwing) on any failure means an invalid token
 * simply degrades to an anonymous identity instead of erroring the request.
 */
async function verifyIdTokenFactory(projectId?: string): Promise<((token: string) => Promise<string | null>) | undefined> {
  if (!projectId) return undefined;
  try {
    const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/auth'),
    ]);
    if (!getApps().length) initializeApp({ projectId });
    const auth = getAuth();
    return async (token: string) => {
      try {
        const decoded = await auth.verifyIdToken(token);
        return decoded.uid || null;
      } catch {
        return null; // expired / forged / wrong audience
      }
    };
  } catch {
    return undefined; // firebase-admin unavailable → anonymous only
  }
}

/**
 * Build (once) the payment route handler, or return null when the deployment
 * is not configured for billing. Callers translate null into a 503.
 */
export async function getPaymentRoutes(env: BillingRuntimeEnv = process.env): Promise<Handler | null> {
  if (cached !== undefined) return cached;
  try {
    if (!env.DATABASE_URL) { cached = null; return cached; }

    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      // Serverless: keep the footprint small and fail fast rather than hanging.
      max: 3,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 10_000,
      ssl: sslConfigFor(env.DATABASE_URL, env),
    });
    // A pool-level error must never become an unhandled exception.
    pool.on('error', () => undefined);

    const trialEnabled = (env.TRIAL_ENABLED ?? 'true') !== 'false';
    const billing = new Billing(pool, {
      trialMessages: trialEnabled ? Number(env.TRIAL_MESSAGES || 10) : 0,
      dailyFreeMessages: Number(env.DAILY_FREE_MESSAGES || 10),
      dailyMode: env.DAILY_MODE === 'true',
    });

    const payments = new Payments(billing, {
      apiKey: env.NOWPAYMENTS_API_KEY || '',
      ipnSecret: env.NOWPAYMENTS_IPN_SECRET || '',
      ipnCallbackUrl: env.NOWPAYMENTS_IPN_CALLBACK_URL || '',
      apiBase: env.NOWPAYMENTS_API_BASE || undefined,
    });

    const internalRoutes = createInternalQuotaRoutes({
      billing,
      internalKey: env.INTERNAL_API_KEY || '',
      log: (event, meta) => console.log(`[internal] event=${event}` + Object.entries(meta || {}).map(([k, v]) => ` ${k}=${String(v)}`).join('')),
    });

    const publicRoutes = createPaymentRoutes({
      billing,
      payments,
      // Falls back to a per-deployment constant; rotating it resets anon trials.
      anonSalt: env.ANON_SALT || 'konkred-default-anon-salt',
      verifyIdToken: await verifyIdTokenFactory(env.FIREBASE_PROJECT_ID),
      log: (event, meta) => {
        const line = [`[billing] event=${event}`];
        for (const [k, v] of Object.entries(meta || {})) line.push(`${k}=${String(v)}`);
        if (event.startsWith('error')) console.error(line.join(' '));
        else console.log(line.join(' '));
      },
    });

    // Internal (service-to-service) routes are matched first; they own the
    // /api/internal/* prefix exclusively and never fall through to public
    // handlers, so the bot's surface can never be reached from a browser path.
    cached = async (req, res) => {
      if (await internalRoutes(req, res)) return true;
      return publicRoutes(req, res);
    };
    return cached;
  } catch (error) {
    console.error('[billing] event=error.init name=' + ((error as Error)?.name || 'Error'));
    cached = null;
    return cached;
  }
}

/** Test seam: drop the memoised handler. */
export function resetPaymentRoutes(): void {
  cached = undefined;
  cachedMeter = undefined;
}

/**
 * Build the generation meter for the gateway proxy, or `undefined` when this
 * deployment has no database (generation then runs unmetered rather than
 * failing closed).
 *
 * Kept separate from getPaymentRoutes() so the proxy never needs to know about
 * payments, and so a metering failure can be contained independently.
 */
let cachedMeter: ((req: IncomingMessage) => Promise<{ allowed: boolean; body?: unknown; refund?: () => Promise<void> }>) | null | undefined;

export async function getMeter(env: BillingRuntimeEnv = process.env) {
  if (cachedMeter !== undefined) return cachedMeter ?? undefined;
  try {
    if (!env.DATABASE_URL) { cachedMeter = null; return undefined; }

    const [{ Pool }, { Meter, paywallBody }] = await Promise.all([import('pg'), import('./metering')]);
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 10_000,
      ssl: sslConfigFor(env.DATABASE_URL, env),
    });
    pool.on('error', () => undefined);

    const trialEnabled = (env.TRIAL_ENABLED ?? 'true') !== 'false';
    const billing = new Billing(pool, {
      trialMessages: trialEnabled ? Number(env.TRIAL_MESSAGES || 10) : 0,
      dailyFreeMessages: Number(env.DAILY_FREE_MESSAGES || 10),
      dailyMode: env.DAILY_MODE === 'true',
    });
    const meter = new Meter({
      billing,
      anonSalt: env.ANON_SALT || 'konkred-default-anon-salt',
      verifyIdToken: await verifyIdTokenFactory(env.FIREBASE_PROJECT_ID),
      log: (event) => console.log(`[meter] event=${event}`),
    });

    cachedMeter = async (req: IncomingMessage) => {
      // The client supplies an idempotency key per logical generation so a
      // stream reconnect is not billed twice. It is scoped under the
      // server-derived identity inside Meter, so it cannot be abused.
      const header = req.headers['x-idempotency-key'];
      const key = typeof header === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(header) ? header : undefined;
      const decision = await meter.reserve(req, 'web', key);
      return {
        allowed: decision.allowed,
        body: decision.allowed ? undefined : paywallBody(decision.balance),
        refund: decision.refund,
      };
    };
    return cachedMeter;
  } catch (error) {
    console.error('[meter] event=error.init name=' + ((error as Error)?.name || 'Error'));
    cachedMeter = null;
    return undefined;
  }
}
