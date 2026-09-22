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

export interface BillingRuntimeEnv {
  DATABASE_URL?: string;
  NOWPAYMENTS_API_KEY?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  NOWPAYMENTS_IPN_CALLBACK_URL?: string;
  ANON_SALT?: string;
  TRIAL_MESSAGES?: string;
  TRIAL_ENABLED?: string;
  DAILY_FREE_MESSAGES?: string;
  DAILY_MODE?: string;
  FIREBASE_PROJECT_ID?: string;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

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
      ssl: /localhost|127\.0\.0\.1/.test(env.DATABASE_URL) ? undefined : { rejectUnauthorized: false },
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
    });

    cached = createPaymentRoutes({
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
}
