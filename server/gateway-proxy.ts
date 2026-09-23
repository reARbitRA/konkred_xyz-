/**
 * Konkred Gateway proxy core (server-only; never imported by client code).
 *
 * This module is the security boundary between the browser and the separately
 * deployed Konkred AI Ecosystem Gateway. It is deliberately framework-agnostic
 * (plain node:http req/res) so it can run inside the Vercel Node.js serverless
 * function (`api/index.ts`) and be exercised directly in tests.
 *
 * Security invariants enforced here:
 *  - The gateway base URL comes ONLY from server environment configuration
 *    (never from the browser) → no SSRF pivot.
 *  - `x-brain-key` / `x-api-key` are attached from server-only env vars; any
 *    browser-supplied copies are stripped (spoof proof).
 *  - Bodies are size-capped, shape-validated, and re-serialized from
 *    allow-listed fields (the GitHub `token` field can never transit the
 *    proxy; the gateway owns that credential).
 *  - Upstream error text is screened for the proxy's own secrets before being
 *    forwarded; network/timeout errors are generic and redacted in logs.
 *  - SSE generation is streamed incrementally (never buffered into JSON),
 *    cancels upstream when the browser disconnects, and enforces timeouts.
 *  - Upstream status codes and Retry-After are preserved.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

// ─── Limits & timeouts ──────────────────────────────────────────────────────
export const AI_MAX_BYTES = 1_000_000;            // /api/ai chat payloads
export const GENERATE_MAX_BYTES = 2_000_000;     // prompt + <=20 code attachments
export const EXPORT_MAX_BYTES = 4_000_000;       // base64-ish generated files
const JSON_ROUTE_TIMEOUT_MS = 30_000;
const GENERATE_CONNECT_TIMEOUT_MS = 15_000;
const GENERATE_IDLE_TIMEOUT_MS = 90_000;
const GENERATE_OVERALL_TIMEOUT_MS = 280_000;      // below Vercel maxDuration 300
const PROVIDER_CACHE_TTL_MS = 30_000;
/** /api/ready probes the gateway; kept short so the health check never hangs. */
const READY_PROBE_TIMEOUT_MS = 5_000;

const BUILD_MODES = new Set(['fullstack', 'frontend', 'backend', 'review']);
const ATTACHMENT_EXT = /\.(?:tsx?|jsx?|json|prisma|sql|ya?ml|sh|css|html?|md)$/i;
const OWNER_REPO_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,200}$/;
const FILE_PATH_RE = /^[\w@+.,()[\] /-]{1,240}$/;
/**
 * Repository paths an export may never write, even though the characters are
 * individually legal.
 *
 * Found by the P8 audit: the character class alone allowed `/etc/passwd`,
 * `.git/config` and `.github/workflows/ci.yml`. Writing into `.git/` can
 * rewrite remotes or credential helpers, and a file under `.github/workflows/`
 * is CODE THAT GITHUB EXECUTES on the owner's repository — a generated-content
 * feature must never be able to place either.
 */
const FORBIDDEN_PATH_PREFIXES = ['.git/', '.github/workflows/', '.github/actions/'];
const FORBIDDEN_PATH_EXACT = new Set(['.git', '.env', '.npmrc', '.netrc', '.gitmodules', '.git-credentials']);

/** True when a validated-looking path is still unsafe to write. */
function isUnsafeExportPath(candidate: string): boolean {
  // Absolute paths escape the repository root entirely.
  if (candidate.startsWith('/')) return true;
  // Leading "./" and doubled slashes normalise away and can mask a prefix.
  if (candidate.startsWith('./') || candidate.includes('//')) return true;
  const lower = candidate.toLowerCase();
  if (FORBIDDEN_PATH_EXACT.has(lower)) return true;
  if (FORBIDDEN_PATH_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  // Any path segment that is exactly ".env" or sits inside a .git directory.
  return lower.split('/').some((segment) => segment === '.git' || segment === '.env');
}

export interface GatewayConfig {
  /** Root URL of the Konkred Gateway, e.g. https://gateway.example.com (env-only). */
  gatewayUrl: string;
  /** Value for x-api-key on POST /api/ai (KONKRED_GATEWAY_API_KEY). */
  gatewayApiKey: string;
  /** Value for x-brain-key on /api/fullkonk/* (FULLKONK_KEY). */
  fullkonkKey: string;
}

export interface ProxyLogger {
  (event: string, meta?: Record<string, unknown>): void;
}

export interface ProxyDeps {
  config: GatewayConfig;
  fetchImpl?: typeof fetch;
  /** Wall clock (injectable for tests). */
  now?: () => number;
  /** Redacted server-side logger; must never receive headers or bodies. */
  log?: ProxyLogger;
  /** Fixed-window request limits per route per client IP, per 60s window. */
  limits?: Partial<Record<RouteName, number>>;
  /** Provider discovery cache (pass a fresh Map in tests). */
  cache?: Map<string, ProviderCacheEntry>;
  /** Override timeouts (mainly for tests; defaults suit Vercel maxDuration 300). */
  timeouts?: { jsonMs?: number; connectMs?: number; idleMs?: number; overallMs?: number };
  /** Fallback for every route not owned by the gateway (the legacy Express app). */
  fallback?: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  /**
   * Optional quota hook for paid generation.
   *
   * Injected rather than imported so the proxy stays independent of the
   * database: when it is absent (or the deployment has no DATABASE_URL)
   * generation is simply unmetered instead of failing closed. Returning
   * `allowed:false` makes the route answer 402 with `body`.
   */
  meter?: (req: IncomingMessage) => Promise<{
    allowed: boolean;
    body?: unknown;
    /** Called when the generation produced nothing, so it is not charged. */
    refund?: () => Promise<void>;
  }>;
}

type RouteName = 'providers' | 'generate' | 'export' | 'ai';

interface ProviderCacheEntry {
  expires: number;
  status: number;
  contentType: string;
  retryAfter: string | null;
  body: Buffer;
}

type ValidationResult =
  | { ok: true; body: string }
  | { ok: false; status: number; error: string; retryAfter?: number };

const DEFAULT_LIMITS: Record<RouteName, number> = {
  providers: 60,
  generate: 24,
  ai: 60,
  export: 10,
};

/** Production-safe default logger: structured, redacted, never prints secrets. */
export const defaultLogger: ProxyLogger = (event, meta) => {
  const line = [`[gateway-proxy] event=${event}`];
  for (const [key, value] of Object.entries(meta || {})) {
    if (value === undefined || value === null) continue;
    line.push(`${key}=${String(value)}`);
  }
  if (event.startsWith('error')) console.error(line.join(' '));
  else console.log(line.join(' '));
};

/** Best-effort fixed-window limiter; no external dependency (serverless local state). */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();

  constructor(private readonly windowMs = 60_000, private readonly now: () => number = Date.now) {}

  /** Returns Retry-After seconds when the window is exhausted, otherwise null. */
  check(key: string, limit: number): number | null {
    const t = this.now();
    const bucket = this.hits.get(key);
    if (!bucket || bucket.reset <= t) {
      this.hits.set(key, { count: 1, reset: t + this.windowMs });
      return null;
    }
    bucket.count += 1;
    if (bucket.count <= limit) return null;
    return Math.max(1, Math.ceil((bucket.reset - t) / 1000));
  }
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim() || 'unknown';
  return req.socket?.remoteAddress || 'unknown';
}

/** Browsers send Origin on same-origin POSTs; a mismatched Origin is a CSRF signal. */
function sameOriginAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser client (server-to-server / curl)
  const host = req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  if (res.writableEnded || res.destroyed) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<{ ok: true; buffer: Buffer } | { ok: false; status: number; error: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    const onData = (chunk: Buffer): void => {
      size += chunk.length;
      if (size > maxBytes) {
        // Keep draining the upload (no buffering) so the client receives a
        // clean 413 response instead of a connection reset / deadlock.
        rejected = true;
        chunks.length = 0;
        return;
      }
      if (!rejected) chunks.push(chunk);
    };
    const onEnd = (): void => resolve(rejected
      ? { ok: false, status: 413, error: `Request body is larger than the ${maxBytes} byte limit.` }
      : { ok: true, buffer: Buffer.concat(chunks) });
    const onError = (): void => resolve({ ok: false, status: 400, error: 'The request body could not be read.' });
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
  });
}

function parseJsonBody(buffer: Buffer): Record<string, unknown> | null {
  if (buffer.length === 0) return null;
  try {
    const value = JSON.parse(buffer.toString('utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null;
}

function validateAi(body: Record<string, unknown> | null): ValidationResult {
  if (!body) return { ok: false, status: 400, error: 'A JSON request body is required.' };
  const messagesInput = body.messages;
  if (!Array.isArray(messagesInput) || messagesInput.length === 0 || messagesInput.length > 50) {
    return { ok: false, status: 400, error: 'messages must be a non-empty array of at most 50 entries.' };
  }
  let totalChars = 0;
  const messages = [];
  for (const item of messagesInput) {
    if (!item || typeof item !== 'object') return { ok: false, status: 400, error: 'Each message must be an object with role and content.' };
    const m = item as Record<string, unknown>;
    if (m.role !== 'system' && m.role !== 'user' && m.role !== 'assistant') {
      return { ok: false, status: 400, error: 'message.role must be system, user, or assistant.' };
    }
    if (typeof m.content !== 'string' || !m.content.trim()) return { ok: false, status: 400, error: 'message.content must be a non-empty string.' };
    totalChars += m.content.length;
    if (totalChars > 200_000) return { ok: false, status: 413, error: 'Combined message content is too large.' };
    messages.push({ role: m.role, content: m.content });
  }
  const taskType = body.taskType === undefined ? 'general' : asString(body.taskType, 40);
  if (!taskType) return { ok: false, status: 400, error: 'taskType must be a short string.' };
  const maxTokens = body.maxTokens === undefined ? 2048 : body.maxTokens;
  if (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32_768) {
    return { ok: false, status: 400, error: 'maxTokens must be an integer between 1 and 32768.' };
  }
  const temperature = body.temperature === undefined ? 0.3 : body.temperature;
  if (typeof temperature !== 'number' || Number.isNaN(temperature) || temperature < 0 || temperature > 2) {
    return { ok: false, status: 400, error: 'temperature must be a number between 0 and 2.' };
  }
  const privacy = body.privacy === undefined ? 'private' : body.privacy;
  if (privacy !== 'private' && privacy !== 'public') return { ok: false, status: 400, error: 'privacy must be "private" or "public".' };
  const skipCache = body.skipCache === undefined ? false : body.skipCache;
  if (typeof skipCache !== 'boolean') return { ok: false, status: 400, error: 'skipCache must be a boolean.' };
  return { ok: true, body: JSON.stringify({ taskType, messages, maxTokens, temperature, privacy, skipCache }) };
}

function validateGenerate(body: Record<string, unknown> | null): ValidationResult {
  if (!body) return { ok: false, status: 400, error: 'A JSON request body is required.' };
  const prompt = asString(body.prompt, 20_000)?.trim();
  if (!prompt) return { ok: false, status: 400, error: 'prompt is required (1–20000 characters).' };
  const mode = typeof body.mode === 'string' && BUILD_MODES.has(body.mode) ? body.mode : 'fullstack';
  const out: Record<string, unknown> = { prompt, mode };
  if (body.provider !== undefined) {
    const provider = asString(body.provider, 64);
    if (!provider) return { ok: false, status: 400, error: 'provider must be a short identifier string.' };
    out.provider = provider;
  }
  if (body.model !== undefined) {
    const model = asString(body.model, 120);
    if (!model) return { ok: false, status: 400, error: 'model must be a short identifier string.' };
    out.model = model;
  }
  const temperature = body.temperature === undefined ? 0.4 : body.temperature;
  if (typeof temperature !== 'number' || Number.isNaN(temperature) || temperature < 0 || temperature > 2) {
    return { ok: false, status: 400, error: 'temperature must be a number between 0 and 2.' };
  }
  out.temperature = temperature;
  const maxTokens = body.maxTokens === undefined ? 8192 : body.maxTokens;
  if (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens < 256 || maxTokens > 32_768) {
    return { ok: false, status: 400, error: 'maxTokens must be an integer between 256 and 32768.' };
  }
  out.maxTokens = maxTokens;
  if (body.systemPrompt !== undefined && body.systemPrompt !== null) {
    const systemPrompt = asString(body.systemPrompt, 12_000);
    if (systemPrompt === null) return { ok: false, status: 400, error: 'systemPrompt must be a string of at most 12000 characters.' };
    if (systemPrompt) out.systemPrompt = systemPrompt;
  }
  if (body.projectId !== undefined && body.projectId !== null) {
    const projectId = asString(body.projectId, 120);
    if (!projectId || /[^\w.-]/.test(projectId)) return { ok: false, status: 400, error: 'projectId is invalid.' };
    out.projectId = projectId;
  }
  if (body.attachedFiles !== undefined && body.attachedFiles !== null) {
    if (!Array.isArray(body.attachedFiles) || body.attachedFiles.length > 20) {
      return { ok: false, status: 400, error: 'attachedFiles must contain at most 20 entries.' };
    }
    let total = 0;
    const attachedFiles = [];
    for (const item of body.attachedFiles) {
      if (!item || typeof item !== 'object') return { ok: false, status: 400, error: 'An attachment is malformed.' };
      const f = item as Record<string, unknown>;
      const fpath = asString(f.path, 240);
      if (!fpath || !ATTACHMENT_EXT.test(fpath) || fpath.includes('..')) {
        return { ok: false, status: 400, error: `Attachment path or extension is not allowed: ${fpath || '(empty)'}.` };
      }
      if (typeof f.contentBase64 !== 'string' || typeof f.size !== 'number' || f.size < 0) {
        return { ok: false, status: 400, error: `Attachment payload is invalid: ${fpath}.` };
      }
      if (f.contentBase64.length > 1_000_000) return { ok: false, status: 413, error: `Attachment is too large: ${fpath}.` };
      total += f.size;
      if (total > 800_000) return { ok: false, status: 413, error: 'Attachments exceed the 800KB limit.' };
      attachedFiles.push({ path: fpath, contentBase64: f.contentBase64, size: f.size });
    }
    out.attachedFiles = attachedFiles;
  }
  return { ok: true, body: JSON.stringify(out) };
}

function validateExport(body: Record<string, unknown> | null): ValidationResult {
  if (!body) return { ok: false, status: 400, error: 'A JSON request body is required.' };
  const filesInput = body.files;
  if (!Array.isArray(filesInput) || filesInput.length === 0) return { ok: false, status: 400, error: 'files must be a non-empty array.' };
  if (filesInput.length > 100) return { ok: false, status: 413, error: 'At most 100 files can be exported per request.' };
  const files = [];
  for (const item of filesInput) {
    if (!item || typeof item !== 'object') return { ok: false, status: 400, error: 'Each file must be an object.' };
    const f = item as Record<string, unknown>;
    const fpath = asString(f.path, 240);
    if (!fpath || !FILE_PATH_RE.test(fpath) || fpath.includes('..') || isUnsafeExportPath(fpath)) {
      return { ok: false, status: 400, error: `File path is not allowed: ${fpath || '(empty)'}.` };
    }
    if (typeof f.content !== 'string' || f.content.length > 1_000_000) {
      return { ok: false, status: 400, error: `File content is invalid or too large: ${fpath}.` };
    }
    const outFile: Record<string, unknown> = { path: fpath, content: f.content };
    if (f.language !== undefined) {
      const language = asString(f.language, 40);
      if (language === null) return { ok: false, status: 400, error: `File language is invalid: ${fpath}.` };
      outFile.language = language;
    }
    if (f.isTest !== undefined) {
      if (typeof f.isTest !== 'boolean') return { ok: false, status: 400, error: `File isTest flag must be boolean: ${fpath}.` };
      outFile.isTest = f.isTest;
    }
    files.push(outFile);
  }
  const owner = asString(body.owner, 100);
  const repo = asString(body.repo, 100);
  if (!owner || !OWNER_REPO_RE.test(owner)) return { ok: false, status: 400, error: 'A valid GitHub owner or organization name is required.' };
  if (!repo || !OWNER_REPO_RE.test(repo)) return { ok: false, status: 400, error: 'A valid GitHub repository name is required.' };
  const branch = asString(body.branch, 200) || 'fullkonk-output';
  if (!BRANCH_RE.test(branch) || branch.includes('..') || branch.startsWith('refs/')) {
    return { ok: false, status: 400, error: 'Invalid branch name.' };
  }
  const message = asString(body.message, 200) ?? 'Generated by fullKONK_>';
  // NOTE: body.token is intentionally dropped here, always. The gateway owns
  // the GitHub credential; a browser-supplied token can never be injected.
  return { ok: true, body: JSON.stringify({ files, owner, repo, branch, message }) };
}

/** True if any secret value (split-safe across chunk boundaries) appears. */
function makeSecretGuard(secrets: string[]): (chunk: Buffer, flush?: boolean) => boolean {
  const needles = secrets.filter((s) => s.length >= 8).map((s) => Buffer.from(s));
  let tail = Buffer.alloc(0);
  return (chunk: Buffer): boolean => {
    const haystack = Buffer.concat([tail, chunk]);
    for (const needle of needles) {
      if (haystack.includes(needle)) return true;
    }
    // Keep the final (maxNeedle-1) bytes so a split needle is still detected.
    const maxTail = Math.max(0, ...needles.map((n) => n.length - 1));
    tail = maxTail > 0 ? haystack.subarray(Math.max(0, haystack.length - maxTail)) : Buffer.alloc(0);
    return false;
  };
}

function timers(ms: number, fn: () => void): { unref?: () => void } {
  return typeof setTimeout === 'function' ? setTimeout(fn, ms) : { unref: undefined };
}

/**
 * Detect genuine client disconnection.
 *
 * NB: in modern Node a fully-read IncomingMessage reports destroyed=true even
 * while the client is happily waiting for its response, so req 'close' /
 * req.destroyed are NOT abort signals. The reliable signal is the response
 * closing before it was finished (plus the legacy request 'aborted' event).
 */
function bindCancellation(
  req: IncomingMessage,
  res: ServerResponse,
  controller: AbortController,
): { isClientGone: () => boolean; cleanup: () => void } {
  let clientGone = false;
  const onClose = (): void => {
    if (!res.writableEnded) {
      clientGone = true;
      controller.abort();
    }
  };
  res.once('close', onClose);
  req.once('aborted', onClose);
  return {
    isClientGone: () => clientGone,
    cleanup: () => {
      res.removeListener('close', onClose);
      req.removeListener('aborted', onClose);
    },
  };
}

export function createGatewayHandler(deps: ProxyDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { config, fallback, log = defaultLogger } = deps;
  const fetchImpl = deps.fetchImpl || fetch;
  const now = deps.now || Date.now;
  const limiter = new RateLimiter(60_000, now);
  const limits = { ...DEFAULT_LIMITS, ...deps.limits };
  const cache = deps.cache || new Map<string, ProviderCacheEntry>();
  const timeouts = {
    jsonMs: deps.timeouts?.jsonMs ?? JSON_ROUTE_TIMEOUT_MS,
    connectMs: deps.timeouts?.connectMs ?? GENERATE_CONNECT_TIMEOUT_MS,
    idleMs: deps.timeouts?.idleMs ?? GENERATE_IDLE_TIMEOUT_MS,
    overallMs: deps.timeouts?.overallMs ?? GENERATE_OVERALL_TIMEOUT_MS,
  };
  const gatewayUrl = config.gatewayUrl.replace(/\/+$/, '');
  const secrets = [config.gatewayApiKey, config.fullkonkKey].filter(Boolean) as string[];

  function baseHeaders(kind: 'brain' | 'api', req: IncomingMessage, contentType = 'application/json'): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': contentType,
      accept: kind === 'brain' ? 'application/json, text/event-stream' : 'application/json',
      // Never copy these from the incoming request — server env always wins.
      [kind === 'brain' ? 'x-brain-key' : 'x-api-key']: kind === 'brain' ? config.fullkonkKey : config.gatewayApiKey,
    };
    const authorization = req.headers.authorization;
    if (typeof authorization === 'string' && /^Bearer\s+\S+/i.test(authorization)) {
      headers.authorization = authorization; // Firebase ID token → gateway user binding
    }
    const ip = clientIp(req);
    if (ip !== 'unknown') headers['x-forwarded-for'] = ip;
    return headers;
  }

  function requireConfig(res: ServerResponse, need: 'url' | 'api-key' | 'brain-key'): boolean {
    if (need === 'url' && gatewayUrl) return true;
    if (need === 'api-key' && config.gatewayApiKey) return true;
    if (need === 'brain-key' && config.fullkonkKey) return true;
    sendJson(res, 503, {
      error: 'The Konkred Gateway integration is not configured on this deployment. Contact the site administrator.',
      code: 'GATEWAY_NOT_CONFIGURED',
    });
    log('error.config_missing', { need });
    return false;
  }

  /**
   * Health / readiness.
   *
   *  GET /api/health → liveness. ALWAYS 200 when the serverless function can
   *    execute at all. It reports which server-only variables are configured
   *    (booleans only — never values) so an operator can diagnose a bad Vercel
   *    environment from the browser without any secret leaking.
   *
   *  GET /api/ready → readiness. Additionally probes the gateway's own
   *    /api/health with a short timeout. A gateway outage yields a controlled
   *    503 JSON body, never an invocation crash and never a hanging request.
   */
  async function handleHealth(req: IncomingMessage, res: ServerResponse, deep: boolean): Promise<void> {
    const configured = {
      gatewayUrl: Boolean(gatewayUrl),
      gatewayApiKey: Boolean(config.gatewayApiKey),
      fullkonkKey: Boolean(config.fullkonkKey),
    };
    const base = {
      status: 'ok' as string,
      service: 'konkred-website',
      runtime: 'vercel-node',
      time: new Date().toISOString(),
      configured,
    };

    if (!deep) {
      sendJson(res, 200, base);
      return;
    }

    if (!gatewayUrl) {
      sendJson(res, 503, {
        ...base,
        status: 'degraded',
        code: 'GATEWAY_NOT_CONFIGURED',
        gateway: { reachable: false, reason: 'not_configured' },
        error: 'The Konkred Gateway integration is not configured on this deployment.',
      });
      return;
    }

    const controller = new AbortController();
    const timer = timers(READY_PROBE_TIMEOUT_MS, () => controller.abort());
    if (typeof timer.unref === 'function') timer.unref();
    const started = now();
    try {
      const upstream = await fetchImpl(`${gatewayUrl}/api/health`, {
        method: 'GET',
        headers: { accept: 'application/json', 'x-brain-key': config.fullkonkKey },
        signal: controller.signal,
      });
      const ms = now() - started;
      // The gateway's body is deliberately NOT echoed: it may contain provider
      // or key-pool detail that is not safe for an unauthenticated browser.
      if (!upstream.ok) {
        log('health.gateway_unhealthy', { status: upstream.status, ms });
        sendJson(res, 503, { ...base, status: 'degraded', code: 'GATEWAY_UNHEALTHY', gateway: { reachable: true, status: upstream.status, ms } });
        return;
      }
      sendJson(res, 200, { ...base, gateway: { reachable: true, status: upstream.status, ms } });
    } catch (error) {
      const aborted = (error as Error)?.name === 'AbortError';
      log('health.gateway_unreachable', { ms: now() - started, reason: aborted ? 'timeout' : 'network' });
      sendJson(res, 503, {
        ...base,
        status: 'degraded',
        code: aborted ? 'GATEWAY_TIMEOUT' : 'GATEWAY_UNREACHABLE',
        gateway: { reachable: false, reason: aborted ? 'timeout' : 'network' },
      });
    } finally {
      clearTimeout(timer as unknown as ReturnType<typeof setTimeout>);
    }
  }

  async function forwardJson(
    req: IncomingMessage,
    res: ServerResponse,
    route: RouteName,
    upstreamPath: string,
    keyKind: 'brain' | 'api',
    validated: { body: string },
    timeoutMs: number,
    cacheable = false,
  ): Promise<void> {
    const controller = new AbortController();
    const cancellation = bindCancellation(req, res, controller);
    const timer = timers(timeoutMs, () => controller.abort());
    if (typeof timer.unref === 'function') timer.unref();
    const started = now();
    try {
      const upstream = await fetchImpl(`${gatewayUrl}${upstreamPath}`, {
        method: 'POST',
        headers: baseHeaders(keyKind, req),
        body: validated.body,
        signal: controller.signal,
      });
      const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
      const retryAfter = upstream.headers.get('retry-after');
      const buffer = Buffer.from(await upstream.arrayBuffer());
      // Defense in depth: never relay our own gateway credentials.
      if (secrets.some((secret) => buffer.includes(Buffer.from(secret)))) {
        log('error.secret_in_upstream_body', { route, status: upstream.status });
        sendJson(res, 502, { error: 'The Konkred Gateway returned a response that failed safety screening.' });
        return;
      }
      const headers: Record<string, string> = {};
      if (retryAfter) headers['retry-after'] = retryAfter;
      if (cacheable && upstream.ok && contentType.includes('json')) {
        headers['cache-control'] = 'private, max-age=30';
        cache.set(upstreamPath, { expires: now() + PROVIDER_CACHE_TTL_MS, status: upstream.status, contentType, retryAfter, body: buffer });
      }
      if (res.writableEnded || res.destroyed) return;
      res.statusCode = upstream.status;
      res.setHeader('content-type', contentType);
      res.setHeader('cache-control', headers['cache-control'] || 'no-store');
      for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
      res.end(buffer);
      log('route.complete', { route, status: upstream.status, ms: now() - started });
    } catch (error) {
      handleUpstreamFailure(req, res, route, error, controller, log, started, now);
    } finally {
      clearTimeout(timer as unknown as ReturnType<typeof setTimeout>);
      cancellation.cleanup();
    }
  }

  async function handleProviders(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const cached = cache.get('/api/fullkonk/providers');
    if (cached && cached.expires > now()) {
      res.statusCode = cached.status;
      res.setHeader('content-type', cached.contentType);
      res.setHeader('cache-control', 'private, max-age=30');
      res.end(cached.body);
      log('route.cache', { route: 'providers' });
      return;
    }
    const controller = new AbortController();
    const cancellation = bindCancellation(req, res, controller);
    const timer = timers(timeouts.jsonMs, () => controller.abort());
    if (typeof timer.unref === 'function') timer.unref();
    const started = now();
    try {
      const upstream = await fetchImpl(`${gatewayUrl}/api/fullkonk/providers`, {
        method: 'GET',
        headers: (() => {
          const h = baseHeaders('brain', req);
          delete h['content-type'];
          h.accept = 'application/json';
          return h;
        })(),
        signal: controller.signal,
      });
      const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
      const retryAfter = upstream.headers.get('retry-after');
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (secrets.some((secret) => buffer.includes(Buffer.from(secret)))) {
        log('error.secret_in_upstream_body', { route: 'providers', status: upstream.status });
        sendJson(res, 502, { error: 'The Konkred Gateway returned a response that failed safety screening.' });
        return;
      }
      if (upstream.ok && contentType.includes('json')) {
        cache.set('/api/fullkonk/providers', { expires: now() + PROVIDER_CACHE_TTL_MS, status: upstream.status, contentType, retryAfter, body: buffer });
      }
      if (res.writableEnded || res.destroyed) return;
      res.statusCode = upstream.status;
      res.setHeader('content-type', contentType);
      res.setHeader('cache-control', upstream.ok ? 'private, max-age=30' : 'no-store');
      if (retryAfter) res.setHeader('retry-after', retryAfter);
      res.end(buffer);
      log('route.complete', { route: 'providers', status: upstream.status, ms: now() - started });
    } catch (error) {
      handleUpstreamFailure(req, res, 'providers', error, controller, log, started, now);
    } finally {
      clearTimeout(timer as unknown as ReturnType<typeof setTimeout>);
      cancellation.cleanup();
    }
  }

  async function handleGenerate(
    req: IncomingMessage,
    res: ServerResponse,
    validated: { body: string },
    refund?: () => Promise<void>,
  ): Promise<void> {
    // Refund at most once, and only when the user received nothing of value.
    let refunded = false;
    const refundOnce = async (reason: string): Promise<void> => {
      if (!refund || refunded) return;
      refunded = true;
      log('meter.refund', { route: 'generate', reason });
      try { await refund(); } catch { log('error.refund_failed', { route: 'generate' }); }
    };
    const controller = new AbortController();
    const cancellation = bindCancellation(req, res, controller);
    const clientGone = (): boolean => cancellation.isClientGone();
    let connectTimer = timers(timeouts.connectMs, () => controller.abort());
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const overallTimer = setTimeout(() => controller.abort(), timeouts.overallMs);
    overallTimer.unref?.();
    if (typeof (connectTimer as { unref?: () => void }).unref === 'function') (connectTimer as { unref: () => void }).unref();
    const resetIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), timeouts.idleMs);
      idleTimer.unref?.();
    };
    const started = now();
    let headWritten = false;
    try {
      const headers = baseHeaders('brain', req, 'application/json');
      // BYOK: the caller's own provider key for the selected provider. This is
      // the ONLY browser-supplied credential accepted, and only on generate;
      // it is length-bounded and never logged or stored by the proxy.
      const providerKey = req.headers['x-provider-key'];
      if (typeof providerKey === 'string' && providerKey.trim() && providerKey.length <= 400) {
        headers['x-provider-key'] = providerKey.trim();
      }
      const upstream = await fetchImpl(`${gatewayUrl}/api/fullkonk/generate`, {
        method: 'POST',
        headers,
        body: validated.body,
        signal: controller.signal,
      });
      clearTimeout(connectTimer as unknown as ReturnType<typeof setTimeout>);
      connectTimer = undefined as unknown as ReturnType<typeof setTimeout>;
      const contentType = upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8';
      const isStream = contentType.includes('text/event-stream');
      if (res.writableEnded || res.destroyed) return;
      res.statusCode = upstream.status;
      res.setHeader('content-type', contentType);
      if (isStream && upstream.ok) {
        res.setHeader('cache-control', 'no-cache, no-transform');
        res.setHeader('connection', 'keep-alive');
        res.setHeader('x-accel-buffering', 'no');
      } else {
        res.setHeader('cache-control', 'no-store');
      }
      const retryAfter = upstream.headers.get('retry-after');
      if (retryAfter) res.setHeader('retry-after', retryAfter);
      const requestId = upstream.headers.get('x-request-id');
      if (requestId) res.setHeader('x-request-id', requestId);
      res.flushHeaders?.();
      headWritten = true;
      // Upstream refused (4xx/5xx): the user got no generation, so refund.
      if (!upstream.ok) await refundOnce(`upstream_${upstream.status}`);
      if (!upstream.body) {
        if (upstream.ok) await refundOnce('empty_body');
        res.end();
        return;
      }
      let streamedBytes = 0;
      const guard = makeSecretGuard(secrets);
      const reader = upstream.body.getReader();
      resetIdle();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdle();
        if (!value) continue;
        const chunk = Buffer.from(value);
        if (guard(chunk)) {
          log('error.secret_in_upstream_stream', { route: 'generate' });
          controller.abort();
          break;
        }
        if (clientGone() || res.destroyed || res.writableEnded) { controller.abort(); break; }
        streamedBytes += chunk.length;
        res.write(chunk);
      }
      // A successful connection that produced no content is still a failure
      // from the user's point of view; do not charge for it.
      if (upstream.ok && streamedBytes === 0) await refundOnce('no_content');
      if (!clientGone() && !res.destroyed && !res.writableEnded) res.end();
      log('route.complete', { route: 'generate', status: upstream.status, ms: now() - started });
    } catch (error) {
      if (!headWritten) {
        // Nothing was delivered at all — always refund.
        await refundOnce('upstream_failure');
        handleUpstreamFailure(req, res, 'generate', error, controller, log, started, now);
      } else {
        // Mid-stream failure: terminate cleanly; the client treats a truncated
        // stream as a retryable pipeline error rather than a fake success.
        log('error.stream_interrupted', { route: 'generate', ms: now() - started, name: (error as Error)?.name || 'Error' });
        if (!clientGone() && !res.destroyed && !res.writableEnded) {
          try { res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: 'The gateway stream was interrupted. Please retry.', kind: 'provider', retryable: true })}\n\n`); } catch { /* gone */ }
          res.end();
        }
      }
    } finally {
      clearTimeout(connectTimer as unknown as ReturnType<typeof setTimeout>);
      if (idleTimer) clearTimeout(idleTimer);
      clearTimeout(overallTimer);
      cancellation.cleanup();
    }
  }

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawUrl = req.url || '/';
    const pathname = rawUrl.split('?')[0];
    const method = req.method || 'GET';

    // ── Health contract (Phase 1) ───────────────────────────────────────────
    // These routes are owned by the proxy itself and MUST NOT depend on the
    // bundled legacy Express app, a database, Firebase, or the gateway being
    // reachable. They are the only thing that can prove "the Vercel function is
    // alive" during an incident, so they must never throw.
    if (pathname === '/api/health' || pathname === '/api/ready') {
      await handleHealth(req, res, pathname === '/api/ready');
      return;
    }

    const routeMatch =
      pathname === '/api/fullkonk/providers' ? { name: 'providers' as RouteName, method: 'GET', upstream: '/api/fullkonk/providers', kind: 'brain' as const, max: 0, validate: null }
      : pathname === '/api/fullkonk/generate' ? { name: 'generate' as RouteName, method: 'POST', upstream: '/api/fullkonk/generate', kind: 'brain' as const, max: GENERATE_MAX_BYTES, validate: validateGenerate }
      : pathname === '/api/fullkonk/github/export' ? { name: 'export' as RouteName, method: 'POST', upstream: '/api/fullkonk/github/export', kind: 'brain' as const, max: EXPORT_MAX_BYTES, validate: validateExport }
      : pathname === '/api/ai' ? { name: 'ai' as RouteName, method: 'POST', upstream: '/api/ai', kind: 'api' as const, max: AI_MAX_BYTES, validate: validateAi }
      : null;

    if (!routeMatch) {
      if (fallback) return void (await fallback(req, res));
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }

    if (method !== routeMatch.method) {
      sendJson(res, 405, { error: `Method ${method} not allowed.` }, { allow: routeMatch.method });
      return;
    }
    if (method === 'POST' && !sameOriginAllowed(req)) {
      log('error.cross_origin_denied', { route: routeMatch.name });
      sendJson(res, 403, { error: 'Cross-origin requests are not permitted.' });
      return;
    }
    if (!requireConfig(res, 'url')) return;
    if (!requireConfig(res, routeMatch.kind === 'api' ? 'api-key' : 'brain-key')) return;

    const retryAfter = limiter.check(`${routeMatch.name}:${clientIp(req)}`, limits[routeMatch.name]);
    if (retryAfter !== null) {
      log('error.rate_limited', { route: routeMatch.name });
      sendJson(res, 429, { error: 'Too many requests. Please slow down and retry shortly.', retryable: true, retryAfter }, { 'retry-after': String(retryAfter) });
      return;
    }

    if (routeMatch.name === 'providers') {
      await handleProviders(req, res);
      return;
    }

    const read = await readBody(req, routeMatch.max);
    if (read.ok === false) {
      const failed = read as { ok: false; status: number; error: string };
      sendJson(res, failed.status, { error: failed.error, retryable: false });
      return;
    }
    const rawBuffer = (read as { ok: true; buffer: Buffer }).buffer;
    const parsed = parseJsonBody(rawBuffer);
    if (parsed === null) {
      sendJson(res, 400, { error: 'Request body must be a valid JSON object.' });
      return;
    }
    const validation = routeMatch.validate!(parsed);
    if (validation.ok === false) {
      const failed = validation as { ok: false; status: number; error: string; retryAfter?: number };
      sendJson(res, failed.status, { error: failed.error, retryable: false }, failed.retryAfter ? { 'retry-after': String(failed.retryAfter) } : {});
      return;
    }
    const safe = validation as { ok: true; body: string };
    if (routeMatch.name === 'generate') {
      // Meter BEFORE contacting the gateway: an exhausted user must never
      // consume provider credit. A metering failure is deliberately non-fatal
      // (fail-open) so a database blip cannot take generation offline.
      let refund: (() => Promise<void>) | undefined;
      if (deps.meter) {
        try {
          const decision = await deps.meter(req);
          if (!decision.allowed) {
            log('route.quota_exhausted', { route: 'generate' });
            sendJson(res, 402, decision.body ?? { error: 'Quota exhausted.', code: 'QUOTA_EXHAUSTED', upgradeUrl: '/checkout' });
            return;
          }
          refund = decision.refund;
        } catch (error) {
          log('error.meter_failed', { name: (error as Error)?.name || 'Error' });
        }
      }
      await handleGenerate(req, res, safe, refund);
    } else {
      await forwardJson(req, res, routeMatch.name, routeMatch.upstream, routeMatch.kind, safe, timeouts.jsonMs);
    }
  };
}

function handleUpstreamFailure(
  _req: IncomingMessage,
  res: ServerResponse,
  route: RouteName,
  error: unknown,
  controller: AbortController,
  log: ProxyLogger,
  started: number,
  now: () => number,
): void {
  // Browser disconnected before the response started: normal cancellation, no page.
  const clientGone = !res.writableEnded && res.destroyed;
  if (clientGone) return;
  const aborted = (error as Error)?.name === 'AbortError';
  // An abort only happens via our timeout controllers while the client is connected.
  const timedOut = aborted && controller.signal.aborted;
  const status = timedOut ? 504 : 502;
  const message = timedOut
    ? 'The Konkred Gateway timed out while handling the request. Please retry.'
    : 'The Konkred Gateway is temporarily unreachable. Please retry in a moment.';
  // Server-side diagnostic only: error name/code, never headers, bodies or URLs with credentials.
  log('error.upstream', {
    route,
    ms: now() - started,
    name: (error as Error)?.name || 'Error',
    code: (error as { code?: string })?.code || 'none',
  });
  sendJson(res, status, { error: message, retryable: true });
}

/**
 * Resolve gateway configuration from server-only environment variables.
 * Legacy BRAIN_URL / BRAIN_KEY names remain supported because existing Vercel
 * projects may already be configured with them; the explicit names win.
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const rawUrl = env.KONKRED_GATEWAY_URL || env.BRAIN_URL || '';
  const gatewayUrl = rawUrl.replace(/\/+$/, '');
  if (gatewayUrl) {
    let parsed: URL;
    try {
      parsed = new URL(gatewayUrl);
    } catch {
      throw new Error('KONKRED_GATEWAY_URL is not a valid URL.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('KONKRED_GATEWAY_URL must use http or https.');
    }
    // Credentials must travel via headers, never the URL (prevents leakage in logs).
    if (parsed.username || parsed.password) {
      throw new Error('KONKRED_GATEWAY_URL must not contain credentials.');
    }
    if (env.NODE_ENV === 'production') {
      if (parsed.protocol !== 'https:') throw new Error('KONKRED_GATEWAY_URL must be https in production.');
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        throw new Error('KONKRED_GATEWAY_URL must not point to localhost in production.');
      }
    }
  }
  return {
    gatewayUrl,
    gatewayApiKey: env.KONKRED_GATEWAY_API_KEY || '',
    fullkonkKey: env.FULLKONK_KEY || env.BRAIN_KEY || '',
  };
}
