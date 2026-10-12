/**
 * Server-side HTTP primitives for the Konkred Gateway BFF.
 *
 * Nothing here is imported by browser code. Logging deliberately accepts only
 * structured, pre-redacted metadata: request/response headers are never logged,
 * so `x-api-key`, `x-brain-key`, `authorization` and provider/GitHub
 * credentials cannot leak into Vercel logs.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';

export type HttpErrorCode =
  | 'BAD_REQUEST'
  | 'INVALID_JSON'
  | 'CLIENT_CLOSED'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'AUTH_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'GATEWAY_NOT_CONFIGURED'
  | 'GATEWAY_UNAVAILABLE'
  | 'GATEWAY_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

export interface HttpFailure {
  status: number;
  code: HttpErrorCode | string;
  message: string;
  retryAfterSec?: number;
}

export const fail = (status: number, code: HttpErrorCode, message: string, retryAfterSec?: number): HttpFailure => ({
  status,
  code,
  message,
  ...(retryAfterSec ? { retryAfterSec } : {}),
});

export const isHttpFailure = (value: unknown): value is HttpFailure =>
  Boolean(value) && typeof value === 'object' && typeof (value as HttpFailure).status === 'number';

/* ------------------------------------------------------------------ *
 * Redaction — defence in depth for any string we log or return
 * ------------------------------------------------------------------ */
const SECRET_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9_]{10,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{10,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[0-9A-Za-z_-]{16,}\b/g,
  /\bgsk_[A-Za-z0-9]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /((?:x-api-key|x-brain-key|x-admin-key|api[_-]?key|token|secret|password)\s*[=:]\s*)["']?[^\s"',}]{6,}/gi,
  /(rediss?:\/\/[^:@\s]+:)[^@\s]+@/gi,
];

/** Environment names whose *values* must never appear in a log or error body. */
const SECRET_ENV_NAMES = [
  'FULLKONK_KEY',
  'BRAIN_KEY',
  'FULLKONK_BRAIN_KEY',
  'KONKRED_GATEWAY_API_KEY',
  'GATEWAY_API_KEY',
  'BRAIN_API_KEY',
  'FULLKONK_GITHUB_EXPORT_TOKEN',
  'GITHUB_CLIENT_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
];

/** Literal secret values configured on this deployment (short values ignored). */
const configuredSecrets = (): string[] => {
  const values: string[] = [];
  for (const name of SECRET_ENV_NAMES) {
    const value = (process.env[name] ?? '').trim();
    if (value.length >= 8) values.push(value);
  }
  return values;
};

/**
 * Removes credential-shaped substrings — plus the literal values of this
 * deployment's own secrets — from any text that could reach a log or a client.
 */
export const redactSecrets = (input: string, extraSecrets: string[] = []): string => {
  let output = String(input ?? '');
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, (_match, prefix) => (prefix ? `${prefix}[REDACTED]` : '[REDACTED]'));
  for (const secret of [...configuredSecrets(), ...extraSecrets]) {
    if (secret.length >= 8) output = output.split(secret).join('[REDACTED]');
  }
  return output;
};

/* ------------------------------------------------------------------ *
 * Logging — structured, redacted, header-free
 * ------------------------------------------------------------------ */
export interface LogMeta {
  [key: string]: string | number | boolean | null | undefined;
}

const emit = (level: 'info' | 'warn' | 'error', scope: string, message: string, meta?: LogMeta): void => {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${redactSecrets(message)}`;
  const detail = meta
    ? Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${redactSecrets(String(value))}`)
        .join(' ')
    : '';
  const full = detail ? `${line} ${detail}` : line;
  if (level === 'error') console.error(full);
  else if (level === 'warn') console.warn(full);
  else console.log(full);
};

export const log = {
  info: (scope: string, message: string, meta?: LogMeta) => emit('info', scope, message, meta),
  warn: (scope: string, message: string, meta?: LogMeta) => emit('warn', scope, message, meta),
  error: (scope: string, message: string, meta?: LogMeta) => emit('error', scope, message, meta),
};

/* ------------------------------------------------------------------ *
 * Request helpers
 * ------------------------------------------------------------------ */
export const readRawBody = (req: IncomingMessage, limitBytes: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (error: unknown, value?: Buffer): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value ?? Buffer.alloc(0));
    };

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        finish(fail(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds the ${Math.floor(limitBytes / 1024)}KB limit.`));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(null, Buffer.concat(chunks)));
    req.on('aborted', () => finish(fail(400, 'BAD_REQUEST', 'Request aborted before the body was received.')));
    req.on('error', () => finish(fail(400, 'BAD_REQUEST', 'Request stream failed.')));
  });

export const readJsonBody = async (req: IncomingMessage, limitBytes: number): Promise<unknown> => {
  const raw = await readRawBody(req, limitBytes);
  if (!raw.length) return {};
  let text: string;
  try {
    text = raw.toString('utf8');
  } catch {
    throw fail(400, 'INVALID_JSON', 'Request body must be valid UTF-8 JSON.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw fail(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
};

/* ------------------------------------------------------------------ *
 * Response helpers
 * ------------------------------------------------------------------ */
const applyHeaders = (res: ServerResponse, headers: Record<string, string>): void => {
  for (const [key, value] of Object.entries(headers)) {
    if (value) res.setHeader(key, value);
  }
};

export const sendJson = (
  res: ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
): void => {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
};

/**
 * Error envelope for the existing fullKONK client, which reads
 * `payload.error` as a *string* (`pages/FullKonkPage.tsx`). The machine-readable
 * `code` rides alongside it without changing that contract.
 */
export const sendFullkonkError = (
  res: ServerResponse,
  failure: HttpFailure,
  headers: Record<string, string> = {},
): void => {
  sendJson(
    res,
    failure.status,
    {
      error: redactSecrets(failure.message),
      code: failure.code,
      ...(failure.retryAfterSec ? { retryAfter: failure.retryAfterSec } : {}),
    },
    {
      ...(failure.retryAfterSec ? { 'retry-after': String(failure.retryAfterSec) } : {}),
      ...headers,
    },
  );
};

export const sendFailure = (res: ServerResponse, failure: HttpFailure, extra: Record<string, string> = {}): void => {
  sendFullkonkError(res, failure, extra);
};

export const methodNotAllowed = (res: ServerResponse, allowed: string): void =>
  sendFullkonkError(res, fail(405, 'METHOD_NOT_ALLOWED', `Use ${allowed} for this endpoint.`), { allow: allowed });

/* ------------------------------------------------------------------ *
 * Origin / CSRF guard
 * ------------------------------------------------------------------ */
/**
 * The BFF is same-origin only. A request without an Origin header (server to
 * server, curl, tests) is allowed; a browser request must match the deployment
 * host or an explicitly allow-listed origin. This blocks cross-site form/fetch
 * CSRF against the credential-bearing routes without needing cookie tokens.
 */
export const isOriginAllowed = (req: IncomingMessage, allowedOrigins: string[]): boolean => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (!origin || origin === 'null') return origin === '';
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const forwardedHost = typeof req.headers['x-forwarded-host'] === 'string' ? req.headers['x-forwarded-host'] : '';
  const host = (forwardedHost || (typeof req.headers.host === 'string' ? req.headers.host : '')).split(',')[0].trim();
  if (host && parsed.host === host) return true;
  const normalized = origin.replace(/\/+$/, '');
  return allowedOrigins.some((allowed) => allowed === normalized);
};

/* ------------------------------------------------------------------ *
 * Rate limiting (per-instance, dependency-free)
 * ------------------------------------------------------------------ */
interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window limiter. Vercel functions are horizontally scaled, so this is a
 * per-instance guard that stops a single client from hammering one instance —
 * it is defence in depth, not a global quota (the gateway enforces the real
 * per-caller budget).
 */
export class RateLimiter {
  private windows = new Map<string, Window>();

  private static readonly MAX_KEYS = 5_000;

  check(key: string, limitPerMinute: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    if (limitPerMinute <= 0) return { ok: true, retryAfterSec: 0 };
    if (this.windows.size > RateLimiter.MAX_KEYS) this.sweep(now);
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + 60_000 });
      return { ok: true, retryAfterSec: 0 };
    }
    if (existing.count >= limitPerMinute) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
    }
    existing.count += 1;
    return { ok: true, retryAfterSec: 0 };
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
    if (this.windows.size > RateLimiter.MAX_KEYS) this.windows.clear();
  }

  reset(): void {
    this.windows.clear();
  }
}

export const rateLimiter = new RateLimiter();

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */
export const requestId = (): string => crypto.randomUUID().slice(0, 18);

export const clientIp = (req: IncomingMessage): string => {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = typeof raw === 'string' ? raw.split(',')[0].trim() : '';
  return first || (typeof req.socket?.remoteAddress === 'string' ? req.socket.remoteAddress : 'unknown');
};

export const bearerToken = (req: IncomingMessage): string => {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  const match = typeof value === 'string' ? value.match(/^Bearer\s+(.+)$/i) : null;
  return match ? match[1].trim() : '';
};

export const isEventStream = (contentType: string | null | undefined): boolean =>
  typeof contentType === 'string' && contentType.toLowerCase().includes('text/event-stream');
