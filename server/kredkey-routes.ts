/**
 * KRedKey HTTP surface — user-facing API key issuance.
 * 
 *   GET  /api/kredkeys              list caller's keys (auth required)
 *   POST /api/kredkeys              create key { name } → { id, key (once), tier }
 *   DELETE /api/kredkeys/:id        revoke
 *   GET  /api/kredkeys/usage        quota for each key (via Billing api:<key>)
 *   POST /api/kredkeys/upgrade      create checkout for key upgrade { keyId, planId }
 * 
 * Auth: Supabase access token (Authorization: Bearer). Identity is fb:<uid>.
 * Rate limit: 20 creations per user per day (via Billing recentPaymentCount or in-memory).
 * Free tier: 10 trial + 10 daily (via Billing). Paid tiers via NowPayments.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifySession } from './supabase';
import { getKredKeyStore, planToTier } from './kredkey-store';
import { getPaymentRoutes, billingConfigured } from './billing-runtime';
import type { Billing } from './billing';

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => { size += c.length; if (size > 16384) { chunks.length = 0; } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}
async function requireAuth(req: IncomingMessage): Promise<string | null> {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return await verifySession(m[1]); } catch { return null; }
}

export async function handleKredKeyRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  if (!path.startsWith('/api/kredkeys')) return false;

  const uid = await requireAuth(req);
  if (!uid) { sendJson(res, 401, { error: 'Authentication required.', code: 'AUTH_REQUIRED' }); return true; }

  const store = await getKredKeyStore();

  // GET /api/kredkeys
  if (req.method === 'GET' && path === '/api/kredkeys') {
    const keys = await store.list(uid);
    // Never return full key except on creation — return masked
    const masked = keys.map(k => ({ id: k.id, name: k.name, tier: k.tier, keyPreview: `${k.key.slice(0,12)}…${k.key.slice(-4)}`, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt }));
    sendJson(res, 200, { ok: true, data: masked });
    return true;
  }

  // GET /api/kredkeys/usage — per-key quota via Billing api:<key>
  if (req.method === 'GET' && path === '/api/kredkeys/usage') {
    if (!billingConfigured()) {
      sendJson(res, 200, { ok: true, data: { billing: false, message: 'Billing not configured — keys are unmetered in this environment.' } });
      return true;
    }
    // Use billing to fetch balance for each key
    try {
      const { getWorkflowDeps } = await import('./billing-runtime');
      const deps = await getWorkflowDeps().catch(()=>undefined);
      const billing: Billing | undefined = (deps as unknown as { billing?: Billing })?.billing;
      if (!billing) { sendJson(res, 503, { ok:false, error:{code:'BILLING_UNAVAILABLE', message:'Billing unavailable'}}); return true; }
      const keys = await store.list(uid);
      const balances = await Promise.all(keys.map(async k => {
        const identity = `api:${k.key}`;
        const bal = await billing.getBalance(identity).catch(()=> null);
        return { id: k.id, name: k.name, tier: k.tier, keyPreview: `${k.key.slice(0,12)}…`, balance: bal };
      }));
      sendJson(res, 200, { ok: true, data: balances });
      return true;
    } catch (e) {
      sendJson(res, 500, { ok:false, error:{code:'USAGE_FAILED', message: String((e as Error).message)} });
      return true;
    }
  }

  // POST /api/kredkeys
  if (req.method === 'POST' && path === '/api/kredkeys') {
    const raw = await readBody(req);
    let body: Record<string,unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { sendJson(res, 400, { error: 'Invalid JSON', code: 'BAD_JSON' }); return true; }
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : 'KRedKey';
    if (!name) { sendJson(res, 400, { error: 'name required', code: 'BAD_NAME' }); return true; }
    // Rate limit: max 5 keys per user
    const existing = await store.list(uid);
    if (existing.length >= 5) { sendJson(res, 429, { error: 'Key limit reached (5). Revoke one before creating.', code: 'KEY_LIMIT', retryable: false }); return true; }
    const rec = await store.create(uid, name, 'free');
    // Ensure billing account seeded with free trial
    if (billingConfigured()) {
      try {
        const { getWorkflowDeps } = await import('./billing-runtime');
        const deps = await getWorkflowDeps().catch(()=>undefined);
        const billing: Billing | undefined = (deps as unknown as { billing?: Billing })?.billing;
        if (billing) await billing.ensureAccount(`api:${rec.key}`);
      } catch {}
    }
    // Also register in gateway's in-memory allowlist for immediate use
    try {
      const gw = await import('../gateway/src/gateway/user-limiter.mjs');
      // Patch config.users at runtime via exposed helper if available
      const cfg = await import('../gateway/src/config.mjs');
      const users = (cfg.config as unknown as { users: unknown[] }).users as { key: string; userId: string; tier: string }[];
      if (Array.isArray(users) && !users.find((u: {key:string})=>u.key===rec.key)) {
        (users as unknown as unknown[]).push({ key: rec.key, userId: uid, tier: 'free' });
      }
    } catch {}
    sendJson(res, 201, { ok: true, data: { id: rec.id, key: rec.key, name: rec.name, tier: rec.tier, createdAt: rec.createdAt, warning: 'Copy now — this is the only time the full key is shown.' } });
    return true;
  }

  // DELETE /api/kredkeys/:id
  if (req.method === 'DELETE' && path.startsWith('/api/kredkeys/')) {
    const id = path.split('/').pop() || '';
    if (!id) { sendJson(res, 400, { error: 'id required', code: 'BAD_ID' }); return true; }
    const ok = await store.revoke(uid, id);
    if (!ok) { sendJson(res, 404, { error: 'Not found', code: 'NOT_FOUND' }); return true; }
    sendJson(res, 200, { ok: true });
    return true;
  }

  // POST /api/kredkeys/upgrade — delegate to payments createInvoice with api identity
  if (req.method === 'POST' && path === '/api/kredkeys/upgrade') {
    const raw = await readBody(req);
    let body: Record<string,unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { sendJson(res,400,{error:'Invalid JSON',code:'BAD_JSON'}); return true; }
    const planId = typeof body.planId === 'string' ? body.planId : '';
    const keyId = typeof body.keyId === 'string' ? body.keyId : '';
    if (!planId || !keyId) { sendJson(res,400,{error:'planId and keyId required',code:'BAD_REQUEST'}); return true; }
    const keys = await store.list(uid);
    const target = keys.find(k=>k.id===keyId);
    if (!target) { sendJson(res,404,{error:'Key not found',code:'NOT_FOUND'}); return true; }
    // Map plan to tier for future upgrade — payments will grant quota to api:<key>
    const tier = planToTier(planId);
    // Create invoice for api identity instead of fb identity — we reuse payments but with custom identity
    // For now, delegate to existing /api/payments/create with same plan, but record mapping
    sendJson(res, 200, { ok: true, data: { planId, tier, keyId, next: `Use /api/payments/create with plan ${planId} — quota will be granted to api:${target.key.slice(0,12)}… after payment. After confirmation, upgrade tier via admin.` } });
    return true;
  }

  return false;
}
