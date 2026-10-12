/**
 * Server-side metering for AI generation (server-only).
 *
 * Quota MUST be enforced here, not in the browser: the client can be modified,
 * and /api/fullkonk/generate is the endpoint that actually costs money. This
 * module is deliberately separate from the gateway proxy so that a deployment
 * without a database keeps working (metering simply becomes a no-op) instead of
 * failing closed and taking the product offline.
 *
 * Charging policy — chosen to never bill a user for our own failures:
 *   1. RESERVE before the request: refuse with 402 when the balance is empty.
 *   2. Only reserve once per logical generation; a reconnect that supplies the
 *      same idempotency key does not charge twice.
 *   3. REFUND if the generation produced nothing (upstream error, no tokens).
 */
import type { IncomingMessage } from 'node:http';
import { Billing, anonymousIdentity, assertIdentity, type Balance, type Surface } from './billing';

export interface MeterDecision {
  /** False when the caller has no quota left; the route must answer 402. */
  allowed: boolean;
  identity: string;
  balance: Balance;
  /** Call when the generation failed and should not be charged. */
  refund?: () => Promise<void>;
  /** True when this request reused an existing reservation (stream retry). */
  deduplicated?: boolean;
}

export interface MeterDeps {
  billing: Billing;
  anonSalt: string;
  verifyIdToken?: (token: string) => Promise<string | null>;
  /** Window in which an identical retry reuses the original charge. */
  dedupWindowMs?: number;
  now?: () => number;
  log?: (event: string, meta?: Record<string, unknown>) => void;
}

/** Recent charges, so a stream reconnect is not billed twice. */
interface Reservation { identity: string; at: number; }

export class Meter {
  private readonly recent = new Map<string, Reservation>();

  constructor(private readonly deps: MeterDeps) {}

  /**
   * Resolve the caller's identity from server-verifiable material only.
   * A browser-supplied identity header is never honoured.
   */
  async identify(req: IncomingMessage): Promise<string> {
    const authorization = req.headers.authorization;
    if (this.deps.verifyIdToken && typeof authorization === 'string' && /^Bearer\s+\S+/i.test(authorization)) {
      try {
        const uid = await this.deps.verifyIdToken(authorization.replace(/^Bearer\s+/i, '').trim());
        if (uid) return assertIdentity(`fb:${uid}`);
      } catch { /* fall through to anonymous */ }
    }
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown';
    return anonymousIdentity(ip, this.deps.anonSalt);
  }

  /**
   * Reserve one message for this request.
   *
   * `idempotencyKey` (supplied by the client per logical generation) collapses
   * retries of the same generation onto one charge. It is NOT trusted for
   * identity — it is scoped under the server-derived identity, so it can only
   * ever suppress a charge for the same account, never redirect one.
   */
  async reserve(req: IncomingMessage, surface: Surface = 'web', idempotencyKey?: string): Promise<MeterDecision> {
    const identity = await this.identify(req);
    const now = this.deps.now?.() ?? Date.now();
    const windowMs = this.deps.dedupWindowMs ?? 120_000;

    // Drop expired reservations so the map cannot grow without bound.
    for (const [key, value] of this.recent) if (now - value.at > windowMs) this.recent.delete(key);

    const dedupKey = idempotencyKey ? `${identity}:${idempotencyKey}` : '';
    if (dedupKey) {
      const existing = this.recent.get(dedupKey);
      if (existing && now - existing.at <= windowMs) {
        this.deps.log?.('meter.dedup');
        return { allowed: true, identity, balance: await this.deps.billing.getBalance(identity), deduplicated: true };
      }
    }

    const result = await this.deps.billing.spend(identity, 1, surface, idempotencyKey);
    if (!result.ok) {
      this.deps.log?.('meter.quota_exhausted');
      return { allowed: false, identity, balance: result.balance };
    }
    if (dedupKey) this.recent.set(dedupKey, { identity, at: now });

    return {
      allowed: true,
      identity,
      balance: result.balance,
      refund: async () => {
        // Return the message and drop the dedup entry so a genuine retry is
        // able to reserve again.
        if (dedupKey) this.recent.delete(dedupKey);
        try {
          await this.deps.billing.grantRefund(identity, 1, idempotencyKey);
          this.deps.log?.('meter.refunded');
        } catch {
          this.deps.log?.('error.refund_failed');
        }
      },
    };
  }
}

/** Body returned to the browser on 402, shaped for the paywall UI. */
export function paywallBody(balance: Balance): Record<string, unknown> {
  return {
    error: 'سهمیهٔ رایگان شما به پایان رسیده است. برای ادامه یکی از بسته‌ها را تهیه کنید.',
    code: 'QUOTA_EXHAUSTED',
    upgradeUrl: '/checkout',
    trialRemaining: balance.trialRemaining,
    paidRemaining: balance.paidRemaining,
    totalRemaining: balance.totalRemaining,
  };
}
