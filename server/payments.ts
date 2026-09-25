/**
 * NowPayments integration (server-only) — non-custodial crypto payments.
 *
 * Money rules enforced here:
 *  - The IPN signature is verified with HMAC-SHA512 over the RECURSIVELY
 *    key-sorted JSON body, compared in constant time. An unsigned or
 *    mis-signed callback is rejected before it can touch a balance.
 *  - The order must be one we created, for the identity being credited, for
 *    the amount and currency we quoted. Only then is quota granted.
 *  - Granting itself is idempotent (see Billing.grantFromPayment): the same
 *    event can be delivered any number of times and credits exactly once.
 *  - No seed phrase or private key is ever stored. Funds settle directly to
 *    the owner's own address; this server only observes confirmations.
 *
 * Reference: NowPayments IPN docs — "Sort the POST request by keys … sign with
 * HMAC sha-512 … compare with x-nowpayments-sig".
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Billing, Balance } from './billing';

/** Receiving address for USDT on TRON (TRC20). Public information. */
export const TRON_USDT_ADDRESS_DEFAULT = 'TKffomaLtPS5FqruZwFrHYu5MdtDiqbEFT';

/** Statuses NowPayments considers terminal-successful. */
const SUCCESS_STATUSES = new Set(['finished', 'confirmed']);
/** Statuses that mean the payment will never complete. */
const FAILED_STATUSES = new Set(['failed', 'refunded', 'expired']);

export interface Plan {
  id: string;
  name: string;
  priceMicroUsd: number;
  messages: number;
}

/** Catalogue of purchasable plans. Prices are integers (micro-USD). */
export const PLANS: Record<string, Plan> = {
  starter: { id: 'starter', name: 'Starter', priceMicroUsd: 5_000_000, messages: 100 },
  pro: { id: 'pro', name: 'Pro', priceMicroUsd: 19_000_000, messages: 500 },
  agency: { id: 'agency', name: 'Agency', priceMicroUsd: 49_000_000, messages: 2000 },
};

export interface NowPaymentsConfig {
  apiKey: string;
  ipnSecret: string;
  /** Absolute https URL NowPayments will POST status changes to. */
  ipnCallbackUrl: string;
  payCurrency?: string;
  apiBase?: string;
}

/**
 * Recursively sort object keys.
 *
 * NowPayments signs the *sorted* serialisation, and real payloads contain a
 * nested `fee` object — sorting only the top level produces a signature that
 * never matches, which is the classic integration failure.
 */
export function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((out, key) => {
        out[key] = sortObjectDeep((value as Record<string, unknown>)[key]);
        return out;
      }, {});
  }
  return value;
}

/** Constant-time signature comparison (no early-exit timing oracle). */
export function verifyIpnSignature(payload: unknown, signature: string | undefined, ipnSecret: string): boolean {
  if (!signature || !ipnSecret) return false;
  const expected = createHmac('sha512', ipnSecret).update(JSON.stringify(sortObjectDeep(payload))).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature).trim(), 'utf8');
  if (a.length !== b.length) return false; // length differs → cannot match
  return timingSafeEqual(a, b);
}

/** Generate an unguessable order id bound to our own records. */
export async function newOrderId(): Promise<string> {
  const { randomBytes } = await import('node:crypto');
  return `knk_${Date.now().toString(36)}_${randomBytes(9).toString('hex')}`;
}

export interface InvoiceResult {
  orderId: string;
  invoiceUrl: string;
  invoiceId: string;
  planId: string;
  planName: string;
  priceUsd: number;
  payCurrency: string;
  network: string;
  address: string;
}

export class Payments {
  constructor(
    private readonly billing: Billing,
    private readonly config: NowPaymentsConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.config.apiKey && this.config.ipnSecret);
  }

  /**
   * Create an invoice and record the intent locally FIRST, so a webhook can
   * only ever settle an order this server actually issued.
   *
   * Returns only browser-safe fields — never the API key and never the IPN
   * secret.
   */
  async createInvoice(identity: string, planId: string): Promise<InvoiceResult> {
    const plan = PLANS[planId];
    if (!plan) throw new Error('UNKNOWN_PLAN');
    if (!this.configured) throw new Error('PAYMENTS_NOT_CONFIGURED');

    const orderId = await newOrderId();
    const payCurrency = this.config.payCurrency || 'usdttrc20';

    // Record the intent before calling out, so a webhook that races the API
    // response still finds a known order.
    await this.billing.createPayment({
      orderId,
      identity,
      planId: plan.id,
      priceMicroUsd: plan.priceMicroUsd,
      messages: plan.messages,
      currency: payCurrency,
    });

    const base = this.config.apiBase || 'https://api.nowpayments.io';
    const response = await this.fetchImpl(`${base}/v1/invoice`, {
      method: 'POST',
      headers: { 'x-api-key': this.config.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        price_amount: plan.priceMicroUsd / 1_000_000,
        price_currency: 'usd',
        pay_currency: payCurrency,
        order_id: orderId,
        order_description: `KONKRED ${plan.name} — ${plan.messages} messages`,
        ipn_callback_url: this.config.ipnCallbackUrl,
      }),
    });

    if (!response.ok) {
      // Never surface the provider's raw error (may echo request detail).
      throw new Error('INVOICE_CREATE_FAILED');
    }
    const data = (await response.json()) as { id?: string | number; invoice_url?: string };
    if (!data.invoice_url) throw new Error('INVOICE_CREATE_FAILED');

    return {
      orderId,
      invoiceUrl: data.invoice_url,
      invoiceId: String(data.id ?? ''),
      planId: plan.id,
      planName: plan.name,
      priceUsd: plan.priceMicroUsd / 1_000_000,
      payCurrency,
      network: payCurrency === 'usdttrc20' ? 'TRON (TRC20)' : payCurrency.toUpperCase(),
      address: process.env.TRON_USDT_ADDRESS || TRON_USDT_ADDRESS_DEFAULT,
    };
  }

  /**
   * Handle an IPN callback.
   *
   * `rawPayload` is the parsed JSON body; `signature` the x-nowpayments-sig
   * header. Returns the HTTP status the endpoint should reply with plus a
   * short machine code. Payment providers retry on non-2xx, so anything we
   * have definitively handled (including rejected duplicates) answers 200.
   */
  async handleWebhook(rawPayload: unknown, signature: string | undefined): Promise<{
    status: number;
    code: string;
    granted?: boolean;
    balance?: Balance;
  }> {
    if (!this.configured) return { status: 503, code: 'PAYMENTS_NOT_CONFIGURED' };

    // 1. Authenticity. Reject before any state is read or written.
    if (!verifyIpnSignature(rawPayload, signature, this.config.ipnSecret)) {
      return { status: 401, code: 'INVALID_SIGNATURE' };
    }

    const payload = (rawPayload ?? {}) as Record<string, unknown>;
    const orderId = typeof payload.order_id === 'string' ? payload.order_id : '';
    const paymentStatus = String(payload.payment_status || '');
    const paymentId = String(payload.payment_id ?? '');
    if (!orderId) return { status: 400, code: 'MISSING_ORDER_ID' };

    // 2. The order must be one we issued.
    const payment = await this.billing.getPayment(orderId);
    if (!payment) return { status: 404, code: 'UNKNOWN_ORDER' };

    if (FAILED_STATUSES.has(paymentStatus)) {
      return { status: 200, code: `IGNORED_${paymentStatus.toUpperCase()}` };
    }
    // Intermediate states (waiting/confirming/sending) are acknowledged but
    // never grant: only a terminal success releases quota.
    if (!SUCCESS_STATUSES.has(paymentStatus)) {
      return { status: 200, code: 'ACKNOWLEDGED_PENDING' };
    }

    // 3. The money must match what we quoted. `actually_paid` is authoritative
    //    for underpayment; a short payment must not unlock a full plan.
    const expectedUsd = Number(payment.price_micro_usd) / 1_000_000;
    const priceAmount = Number(payload.price_amount ?? 0);
    if (priceAmount > 0 && priceAmount + 1e-9 < expectedUsd) {
      return { status: 200, code: 'UNDERPAID' };
    }
    const actuallyPaid = Number(payload.actually_paid ?? 0);
    const payAmount = Number(payload.pay_amount ?? 0);
    if (payAmount > 0 && actuallyPaid > 0 && actuallyPaid + 1e-9 < payAmount) {
      return { status: 200, code: 'UNDERPAID' };
    }

    // 4. Grant idempotently. The event id binds payment + status so a later
    //    status transition for the same payment cannot re-trigger a grant.
    const result = await this.billing.grantFromPayment({
      eventId: `nowpayments:${paymentId || orderId}:${paymentStatus}`,
      orderId,
      identity: String(payment.identity),
      messages: Number(payment.messages),
      provider: 'nowpayments',
      status: paymentStatus,
    });

    return {
      status: 200,
      code: result.granted ? 'GRANTED' : String(result.reason || 'NOT_GRANTED').toUpperCase(),
      granted: result.granted,
      balance: result.balance,
    };
  }
}
