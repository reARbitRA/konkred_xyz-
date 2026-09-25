/**
 * HTTP surface for quota and payments (server-only).
 *
 *   GET  /api/quota                          → the caller's current balance
 *   GET  /api/payments/plans                 → public plan catalogue
 *   POST /api/payments/create                → create a NowPayments invoice
 *   GET  /api/payments/status?orderId=…      → poll a payment
 *   POST /api/payments/nowpayments/webhook   → provider callback (signed)
 *
 * Every handler returns JSON and never throws: a database outage or a missing
 * configuration becomes a controlled status code, in keeping with the health
 * contract established during the production incident.
 *
 * Identity is ALWAYS derived server-side (see resolveIdentity). A caller may
 * not name the account it spends from, otherwise quota could be bypassed by
 * rotating identities or charged to somebody else.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Billing, anonymousIdentity, assertIdentity, IdentityError } from './billing';
import { Payments, PLANS } from './payments';

const WEBHOOK_MAX_BYTES = 64 * 1024; // IPN bodies are small; cap to resist DoS.
const CREATE_MAX_BYTES = 8 * 1024;
/** Payment intents one identity may create per hour before being throttled. */
const MAX_PAYMENTS_PER_HOUR = 10;

export interface PaymentRoutesDeps {
  billing: Billing;
  payments: Payments;
  /**
   * Verifies a Firebase ID token and returns its uid, or null when the token is
   * absent/invalid. Injected so the route layer never imports firebase-admin
   * directly (keeping it testable and cold-start friendly).
   */
  verifyIdToken?: (token: string) => Promise<string | null>;
  /** Salt for anonymous identity hashing; rotating it resets anonymous trials. */
  anonSalt: string;
  log?: (event: string, meta?: Record<string, unknown>) => void;
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<{ ok: true; raw: string } | { ok: false }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) { rejected = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(rejected ? { ok: false } : { ok: true, raw: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', () => resolve({ ok: false }));
  });
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function createPaymentRoutes(deps: PaymentRoutesDeps) {
  const { billing, payments, anonSalt } = deps;
  const log = deps.log || (() => undefined);

  /**
   * Resolve the caller's canonical identity, server-side only.
   *
   * Order of trust: a verified Firebase ID token, then a salted hash of the
   * client IP. A browser-supplied identity header is deliberately ignored —
   * honouring one would let anyone spend another user's quota or mint fresh
   * free trials at will.
   */
  async function resolveIdentity(req: IncomingMessage): Promise<string> {
    const authorization = req.headers.authorization;
    if (deps.verifyIdToken && typeof authorization === 'string' && /^Bearer\s+\S+/i.test(authorization)) {
      const token = authorization.replace(/^Bearer\s+/i, '').trim();
      try {
        const uid = await deps.verifyIdToken(token);
        if (uid) return assertIdentity(`fb:${uid}`);
      } catch {
        // Fall through to anonymous; an invalid token is not fatal, it simply
        // does not confer an authenticated identity.
        log('auth.token_rejected');
      }
    }
    return anonymousIdentity(clientIp(req), anonSalt);
  }

  /** Public plan catalogue — safe for anyone, contains no secrets. */
  function handlePlans(res: ServerResponse): void {
    sendJson(res, 200, {
      plans: Object.values(PLANS).map((plan) => ({
        id: plan.id,
        name: plan.name,
        priceUsd: plan.priceMicroUsd / 1_000_000,
        messages: plan.messages,
        currency: 'USDT',
        network: 'TRON (TRC20)',
      })),
      // Shown before payment; wrong-network transfers are unrecoverable.
      networkWarning:
        'دقیقاً همان شبکه‌ای را انتخاب کنید که در صورت‌حساب نمایش داده می‌شود. ارسال در شبکهٔ اشتباه می‌تواند باعث از دست رفتن دائمی وجه شود.',
    });
  }

  async function handleQuota(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const identity = await resolveIdentity(req);
    const balance = await billing.getBalance(identity);
    sendJson(res, 200, {
      // The opaque identity is returned so the UI can show "signed in" vs
      // "anonymous trial", but it is a hash — never the raw IP.
      authenticated: identity.startsWith('fb:'),
      plan: balance.plan,
      trialRemaining: balance.trialRemaining,
      paidRemaining: balance.paidRemaining,
      dailyRemaining: balance.dailyRemaining,
      totalRemaining: balance.totalRemaining,
      exhausted: balance.totalRemaining <= 0,
    });
  }

  async function handleCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req, CREATE_MAX_BYTES);
    if (!body.ok) return sendJson(res, 413, { error: 'Request body too large.', code: 'BODY_TOO_LARGE' });

    let parsed: { planId?: unknown };
    try { parsed = JSON.parse(body.raw || '{}'); } catch { return sendJson(res, 400, { error: 'Invalid JSON body.', code: 'BAD_JSON' }); }

    const planId = typeof parsed.planId === 'string' ? parsed.planId : '';
    if (!PLANS[planId]) return sendJson(res, 400, { error: 'Unknown plan.', code: 'UNKNOWN_PLAN' });

    if (!payments.configured) {
      return sendJson(res, 503, {
        error: 'پرداخت در حال حاضر در دسترس نیست. لطفاً با پشتیبانی تماس بگیرید.',
        code: 'PAYMENTS_NOT_CONFIGURED',
      });
    }

    const identity = await resolveIdentity(req);

    // Throttle invoice creation. Without this, anyone can spam this endpoint to
    // fill the payments table (fatal on a small free-tier database) and hammer
    // the provider's API. Counted in SQL, not memory, because serverless
    // instances do not share state and a cold start would reset a local
    // counter. Unpaid intents are harmless rows, so the limit is generous.
    try {
      const recent = await billing.recentPaymentCount(identity, 60);
      if (recent >= MAX_PAYMENTS_PER_HOUR) {
        log('payment.rate_limited', { recent });
        res.setHeader('retry-after', '600');
        return sendJson(res, 429, {
          error: 'تعداد درخواست‌های پرداخت بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.',
          code: 'TOO_MANY_PAYMENT_ATTEMPTS',
          retryable: true,
        });
      }
    } catch (error) {
      // A counting failure must not block a legitimate purchase.
      log('error.payment_rate_check', { name: (error as Error)?.name || 'Error' });
    }

    try {
      const invoice = await payments.createInvoice(identity, planId);
      log('payment.invoice_created', { planId });
      // Only browser-safe fields; the API key and IPN secret never leave here.
      sendJson(res, 200, {
        orderId: invoice.orderId,
        invoiceUrl: invoice.invoiceUrl,
        plan: { id: invoice.planId, name: invoice.planName },
        priceUsd: invoice.priceUsd,
        currency: 'USDT',
        network: invoice.network,
        address: invoice.address,
        warning:
          'دقیقاً همان شبکه‌ای را انتخاب کنید که در صورت‌حساب نمایش داده می‌شود. ارسال در شبکهٔ اشتباه می‌تواند باعث از دست رفتن دائمی وجه شود.',
      });
    } catch (error) {
      const code = (error as Error)?.message === 'UNKNOWN_PLAN' ? 'UNKNOWN_PLAN' : 'INVOICE_CREATE_FAILED';
      log('error.invoice_create', { code });
      sendJson(res, code === 'UNKNOWN_PLAN' ? 400 : 502, {
        error: 'ایجاد صورت‌حساب ممکن نشد. لطفاً دوباره تلاش کنید.',
        code,
        retryable: code !== 'UNKNOWN_PLAN',
      });
    }
  }

  /** Poll a payment. Only the owner of the order may read it. */
  async function handleStatus(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const orderId = url.searchParams.get('orderId') || '';
    if (!orderId) return sendJson(res, 400, { error: 'orderId is required.', code: 'MISSING_ORDER_ID' });

    const identity = await resolveIdentity(req);
    const payment = await billing.getPayment(orderId);
    // Same response for "missing" and "not yours" so order ids cannot be probed.
    if (!payment || payment.identity !== identity) {
      return sendJson(res, 404, { error: 'Payment not found.', code: 'NOT_FOUND' });
    }
    const balance = await billing.getBalance(identity);
    sendJson(res, 200, {
      orderId,
      status: payment.status,
      granted: Boolean(payment.granted_at),
      plan: payment.plan_id,
      priceUsd: Number(payment.price_micro_usd) / 1_000_000,
      totalRemaining: balance.totalRemaining,
    });
  }

  /**
   * Provider callback. Authenticated purely by signature — never by identity,
   * origin or IP, because NowPayments calls this server-to-server.
   */
  async function handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req, WEBHOOK_MAX_BYTES);
    if (!body.ok) return sendJson(res, 413, { error: 'Body too large.' });

    let payload: unknown;
    try { payload = JSON.parse(body.raw || '{}'); } catch { return sendJson(res, 400, { error: 'Invalid JSON.' }); }

    const signature = req.headers['x-nowpayments-sig'];
    const result = await payments.handleWebhook(payload, typeof signature === 'string' ? signature : undefined);
    log('payment.webhook', { code: result.code, granted: Boolean(result.granted) });
    // The response body is intentionally minimal — the provider needs only an
    // acknowledgement, and a verbose body would leak account state publicly.
    sendJson(res, result.status, { ok: result.status < 400, code: result.code });
  }

  /**
   * Route dispatcher. Returns true when the request was handled, so the caller
   * can fall through to other routing when it was not.
   */
  return async function paymentRoutes(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const rawUrl = req.url || '/';
    const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = (req.method || 'GET').toUpperCase();

    const routes: Record<string, string> = {
      '/api/quota': 'GET',
      '/api/payments/plans': 'GET',
      '/api/payments/create': 'POST',
      '/api/payments/status': 'GET',
      '/api/payments/nowpayments/webhook': 'POST',
    };
    const expected = routes[pathname];
    if (!expected) return false;
    if (method !== expected) {
      sendJson(res, 405, { error: `Method ${method} not allowed.` }, { allow: expected });
      return true;
    }

    try {
      if (pathname === '/api/payments/plans') handlePlans(res);
      else if (pathname === '/api/quota') await handleQuota(req, res);
      else if (pathname === '/api/payments/create') await handleCreate(req, res);
      else if (pathname === '/api/payments/status') await handleStatus(req, res, url);
      else await handleWebhook(req, res);
    } catch (error) {
      // A database outage must not crash the function or leak internals.
      if (error instanceof IdentityError) {
        sendJson(res, 400, { error: 'Invalid identity.', code: 'BAD_IDENTITY' });
      } else {
        log('error.payment_route', { path: pathname, name: (error as Error)?.name || 'Error' });
        sendJson(res, 503, {
          error: 'سرویس پرداخت موقتاً در دسترس نیست. لطفاً دوباره تلاش کنید.',
          code: 'BILLING_UNAVAILABLE',
          retryable: true,
        });
      }
    }
    return true;
  };
}
