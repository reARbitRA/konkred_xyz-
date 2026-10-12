import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createGatewayHandler, configFromEnv, type GatewayConfig } from '../server/gateway-proxy';
import { assertIdentity } from '../server/billing';
import { verifyIpnSignature, sortObjectDeep } from '../server/payments';
import { createHmac } from 'node:crypto';

/**
 * P8 security audit, expressed as executable adversarial tests.
 *
 * Each block corresponds to a threat from the brief. Reading the code and
 * declaring it safe is not evidence; these actually mount the handler and
 * attack it.
 */

const ROOT = process.cwd();
const CONFIG: GatewayConfig = {
  gatewayUrl: 'https://gateway.konkred.test',
  gatewayApiKey: 'sk-gw-secret-0123456789',
  fullkonkKey: 'brain-secret-0123456789',
};

async function mount(
  upstream: typeof fetch = (async () =>
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch,
) {
  const calls: string[] = [];
  const wrapped: typeof fetch = async (url: unknown, init?: RequestInit) => {
    calls.push(String(url));
    return upstream(url as string, init);
  };
  const handler = createGatewayHandler({
    config: CONFIG,
    fetchImpl: wrapped,
    log: () => undefined,
    cache: new Map(),
    timeouts: { jsonMs: 4000, connectMs: 1000, idleMs: 1000, overallMs: 4000 },
    // Raised so a long list of attack payloads exercises validation rather
    // than tripping the rate limiter (which is covered by its own test).
    limits: { export: 500, generate: 500, ai: 500, providers: 500 },
  });
  const server: Server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const postJson = (base: string, p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

/* ── Path traversal ───────────────────────────────────────────────────────── */
describe('path traversal in GitHub export', () => {
  const exportBody = (filePath: string) => ({
    owner: 'acme', repo: 'demo', files: [{ path: filePath, content: 'x' }],
  });

  it('rejects traversal, absolute paths and control characters', async () => {
    const h = await mount();
    try {
      const attacks = [
        '../../../../etc/passwd',
        '..%2f..%2fetc%2fpasswd',
        '/etc/passwd',
        'src/../../.git/config',
        'a/../../b',
        '.git/config\u0000.txt',
        'src/\u0000evil.ts',
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
        'src/evil\n.ts',
        // Found by this audit: individually-legal characters that still let an
        // export overwrite git internals, CI workflows or secrets.
        '.git/config',
        '.git/hooks/pre-commit',
        '.github/workflows/ci.yml',
        '.github/actions/run/action.yml',
        '.env',
        'nested/.env',
        './src/index.ts',
        '//evil.com/payload.js',
        'a//b.ts',
        '.GIT/config',
      ];
      for (const attack of attacks) {
        const res = await postJson(h.baseUrl, '/api/fullkonk/github/export', exportBody(attack));
        expect(res.status, `should reject: ${JSON.stringify(attack)}`).toBe(400);
      }
      // Nothing reached the gateway.
      expect(h.calls).toHaveLength(0);
    } finally { await h.close(); }
  });

  it('accepts ordinary project paths', async () => {
    const h = await mount();
    try {
      for (const good of ['src/index.ts', 'README.md', 'app/(main)/page.tsx', 'a/b/c/d.json']) {
        const res = await postJson(h.baseUrl, '/api/fullkonk/github/export', exportBody(good));
        expect(res.status, `should accept: ${good}`).toBe(200);
      }
    } finally { await h.close(); }
  });

  it('rejects malicious owner, repo and branch values', async () => {
    const h = await mount();
    try {
      const bad = [
        { owner: '../../etc', repo: 'demo', branch: 'main' },
        { owner: 'acme', repo: '../../../tmp', branch: 'main' },
        { owner: 'acme', repo: 'demo', branch: 'refs/heads/../../evil' },
        { owner: 'acme', repo: 'demo', branch: '../../../main' },
        { owner: 'acme/../other', repo: 'demo', branch: 'main' },
      ];
      for (const attack of bad) {
        const res = await postJson(h.baseUrl, '/api/fullkonk/github/export', {
          ...attack, files: [{ path: 'a.ts', content: 'x' }],
        });
        expect(res.status, `should reject ${JSON.stringify(attack)}`).toBe(400);
      }
    } finally { await h.close(); }
  });
});

/* ── Credential injection ─────────────────────────────────────────────────── */
describe('credential injection', () => {
  it('drops a browser-supplied GitHub token instead of forwarding it', async () => {
    let forwarded = '';
    const h = await mount((async (_url: string, init?: RequestInit) => {
      forwarded = String(init?.body || '');
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch);
    try {
      // Built at runtime so this file never contains a literal that matches a
      // real GitHub token pattern — tests/secrets.test.ts scans the repository
      // for exactly that shape, and a hard-coded fixture would trip it.
      const fakeToken = `ghp_${'a'.repeat(36)}`;
      await postJson(h.baseUrl, '/api/fullkonk/github/export', {
        owner: 'acme', repo: 'demo', files: [{ path: 'a.ts', content: 'x' }],
        token: fakeToken,
      });
      // The gateway owns the GitHub credential; a client token must never pass.
      expect(forwarded).not.toContain(fakeToken);
      expect(forwarded).not.toContain('token');
    } finally { await h.close(); }
  });

  it('never echoes gateway secrets to the browser', async () => {
    const h = await mount((async () =>
      // A hostile/compromised upstream tries to reflect the secret back.
      new Response(JSON.stringify({ leaked: CONFIG.gatewayApiKey }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch);
    try {
      const res = await fetch(`${h.baseUrl}/api/fullkonk/providers`);
      const raw = await res.text();
      expect(raw).not.toContain(CONFIG.gatewayApiKey);
      expect(raw).not.toContain(CONFIG.fullkonkKey);
    } finally { await h.close(); }
  });
});

/* ── SSRF ─────────────────────────────────────────────────────────────────── */
describe('SSRF', () => {
  it('never lets client input influence the upstream URL', async () => {
    const h = await mount();
    try {
      await fetch(`${h.baseUrl}/api/fullkonk/providers?url=http://169.254.169.254/latest/meta-data/`);
      await postJson(h.baseUrl, '/api/fullkonk/github/export', {
        owner: 'acme', repo: 'demo', files: [{ path: 'a.ts', content: 'x' }],
        gatewayUrl: 'http://169.254.169.254/', upstream: 'http://127.0.0.1:22',
      });
      // Every upstream call must target the configured gateway only.
      for (const call of h.calls) {
        expect(call.startsWith(CONFIG.gatewayUrl), `unexpected upstream: ${call}`).toBe(true);
        expect(call).not.toContain('169.254.169.254');
      }
    } finally { await h.close(); }
  });

  it('refuses a gateway URL pointing at localhost in production', () => {
    const prod = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    for (const bad of ['http://localhost:3000', 'http://127.0.0.1:8080', 'http://[::1]:8080']) {
      expect(() => configFromEnv({ ...prod, KONKRED_GATEWAY_URL: bad, KONKRED_GATEWAY_API_KEY: 'k' }),
        `should reject ${bad}`).toThrow();
    }
  });

  it('refuses credentials embedded in the gateway URL', () => {
    expect(() => configFromEnv({
      NODE_ENV: 'production',
      KONKRED_GATEWAY_URL: 'https://user:pass@gateway.example.com',
      KONKRED_GATEWAY_API_KEY: 'k',
    } as NodeJS.ProcessEnv)).toThrow();
  });
});

/* ── Quota bypass / identity forgery ──────────────────────────────────────── */
describe('quota bypass', () => {
  it('rejects every forged or malformed identity', () => {
    const attacks = [
      'fb:', 'admin', '../fb:1', 'fb:1 OR 1=1', "fb:1'; DROP TABLE accounts;--",
      'fb:' + 'x'.repeat(200), '', 'unknown:1', 'fb:a\u0000b', 'fb:a b',
    ];
    for (const attack of attacks) {
      expect(() => assertIdentity(attack), `should reject ${JSON.stringify(attack)}`).toThrow();
    }
  });

  it('accepts only the four canonical prefixes', () => {
    for (const good of ['fb:abc', 'telegram:123', 'api:key1', 'anon:deadbeef']) {
      expect(assertIdentity(good)).toBe(good);
    }
  });
});

/* ── Webhook replay / forgery ─────────────────────────────────────────────── */
describe('payment webhook hardening', () => {
  const SECRET = 'ipn-secret';
  const body = { payment_id: 1, payment_status: 'finished', order_id: 'o1', fee: { serviceFee: 0 } };
  const good = createHmac('sha512', SECRET).update(JSON.stringify(sortObjectDeep(body))).digest('hex');

  it('rejects forged, truncated, empty and case-shifted signatures', () => {
    expect(verifyIpnSignature(body, good, SECRET)).toBe(true);
    expect(verifyIpnSignature(body, good.slice(0, -2), SECRET)).toBe(false);
    expect(verifyIpnSignature(body, '', SECRET)).toBe(false);
    expect(verifyIpnSignature(body, good.toUpperCase(), SECRET)).toBe(false);
    expect(verifyIpnSignature(body, 'a'.repeat(128), SECRET)).toBe(false);
    expect(verifyIpnSignature(body, good, 'wrong-secret')).toBe(false);
  });

  it('cannot be verified when no secret is configured', () => {
    // An unset IPN secret must never make verification succeed.
    expect(verifyIpnSignature(body, good, '')).toBe(false);
  });
});

/* ── Log and bundle hygiene ───────────────────────────────────────────────── */
describe('secret hygiene in source', () => {
  const serverFiles = fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.ts'));

  it('logs no secret values anywhere in the server code', () => {
    for (const file of serverFiles) {
      const source = fs.readFileSync(path.join(ROOT, 'server', file), 'utf8');
      // Catch console logging of a variable that holds a credential.
      expect(source, `${file} logs a key`).not.toMatch(/console\.(log|error|warn)\([^)]*\b(apiKey|ipnSecret|internalKey|gatewayApiKey|fullkonkKey)\b/);
    }
  });

  it('keeps DATABASE_URL and provider keys out of client-reachable code', () => {
    for (const dir of ['pages', 'components', 'contexts', 'lib']) {
      const full = path.join(ROOT, dir);
      if (!fs.existsSync(full)) continue;
      for (const file of fs.readdirSync(full).filter((f) => /\.tsx?$/.test(f))) {
        const source = fs.readFileSync(path.join(full, file), 'utf8');
        for (const forbidden of ['DATABASE_URL', 'NOWPAYMENTS_IPN_SECRET', 'NOWPAYMENTS_API_KEY', 'INTERNAL_API_KEY', 'KONKRED_GATEWAY_API_KEY']) {
          expect(source, `${dir}/${file} references ${forbidden}`).not.toContain(forbidden);
        }
      }
    }
  });
});

/* ── CORS scoping ─────────────────────────────────────────────────────────── */
describe('CORS policy on private endpoints', () => {
  /**
   * Regression guard for a finding of this audit: the app used bare `cors()`,
   * emitting `Access-Control-Allow-Origin: *` on EVERY route. Once billing was
   * added that meant any website could read a visitor's quota or drive their
   * purchase flow from the browser.
   */
  let app: import('express').Express;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const { createApp } = await import('../server.ts');
    app = await createApp();
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('does not grant cross-origin access to quota or payment routes', async () => {
    for (const p of ['/api/quota', '/api/payments/plans', '/api/internal/quota/balance?identity=telegram:1']) {
      const res = await fetch(`${base}${p}`, { headers: { origin: 'https://evil.example' } });
      expect(res.headers.get('access-control-allow-origin'), `${p} must not allow any origin`).toBeNull();
    }
  });

  it('refuses a cross-origin preflight against a private route', async () => {
    const res = await fetch(`${base}/api/payments/create`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(res.status).toBe(403);
  });

  it('still allows public API routes to be read cross-origin', async () => {
    const res = await fetch(`${base}/api/health`, { headers: { origin: 'https://partner.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

/* ── Quota bypass via an unmetered inference route ────────────────────────── */
describe('every paid inference route is metered', () => {
  /**
   * Regression guard for a real bypass found by auditing rather than reading:
   * only /api/fullkonk/generate was metered, so a user who hit the 402 paywall
   * could POST the same chat messages to /api/ai and keep getting inference
   * for free. Both routes forward to the gateway and cost provider credit, so
   * both must consult the meter.
   */
  async function mountMetered(allowed: boolean) {
    const seen: string[] = [];
    const handler = createGatewayHandler({
      config: CONFIG,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ ok: true, data: { content: 'hi' } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch,
      log: () => undefined,
      cache: new Map(),
      timeouts: { jsonMs: 4000, connectMs: 1000, idleMs: 1000, overallMs: 4000 },
      limits: { ai: 500, generate: 500, export: 500, providers: 500 },
      meter: async (req) => {
        seen.push(req.url || '');
        return { allowed, body: { code: 'QUOTA_EXHAUSTED', upgradeUrl: '/checkout' } };
      },
    });
    const server: Server = createServer((req, res) => { void handler(req, res); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return {
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      seen,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  }

  const aiBody = { messages: [{ role: 'user', content: 'hello' }] };
  const genBody = { prompt: 'Build a todo app', mode: 'fullstack', provider: 'groq', model: 'llama', temperature: 0.4, maxTokens: 4096 };

  it('consults the meter for BOTH /api/ai and /api/fullkonk/generate', async () => {
    const h = await mountMetered(true);
    try {
      await postJson(h.baseUrl, '/api/ai', aiBody);
      await postJson(h.baseUrl, '/api/fullkonk/generate', genBody);
      expect(h.seen).toHaveLength(2);
    } finally { await h.close(); }
  });

  it('refuses /api/ai with 402 once quota is exhausted (the bypass)', async () => {
    const h = await mountMetered(false);
    try {
      const res = await postJson(h.baseUrl, '/api/ai', aiBody);
      expect(res.status).toBe(402);
      expect((await res.json()).code).toBe('QUOTA_EXHAUSTED');
    } finally { await h.close(); }
  });

  it('does not meter read-only or non-inference routes', async () => {
    const h = await mountMetered(true);
    try {
      await fetch(`${h.baseUrl}/api/fullkonk/providers`);
      await postJson(h.baseUrl, '/api/fullkonk/github/export', {
        owner: 'acme', repo: 'demo', files: [{ path: 'a.ts', content: 'x' }],
      });
      // Discovery and export cost no inference, so they must not spend quota.
      expect(h.seen).toHaveLength(0);
    } finally { await h.close(); }
  });

  it('refunds an /api/ai call the gateway failed to serve', async () => {
    let refunds = 0;
    const handler = createGatewayHandler({
      config: CONFIG,
      fetchImpl: (async () => new Response('{"error":"down"}', {
        status: 503, headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch,
      log: () => undefined,
      cache: new Map(),
      timeouts: { jsonMs: 4000, connectMs: 1000, idleMs: 1000, overallMs: 4000 },
      meter: async () => ({ allowed: true, refund: async () => { refunds += 1; } }),
    });
    const server: Server = createServer((req, res) => { void handler(req, res); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      await postJson(base, '/api/ai', aiBody);
      expect(refunds).toBe(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
