/**
 * Upstream transport for the Konkred Gateway BFF.
 *
 * All gateway calls go through here so that timeouts, abort propagation and
 * error normalisation stay in one place. The upstream host always comes from
 * server configuration (`config.gatewayUrl`) — never from the request.
 */
import { fail, isEventStream, redactSecrets } from './http';
import type { HttpFailure } from './http';
import type { GatewayConfig } from './config';

export interface UpstreamResponse {
  status: number;
  contentType: string;
  retryAfter: string | null;
  requestId: string | null;
  body: Buffer;
}

export interface GatewayErrorInfo {
  code: string;
  message: string;
  retryAfterSec?: number;
}

const RETRY_AFTER_MAX_SEC = 3_600;

/** Parses Retry-After (seconds or HTTP-date) into a bounded second count. */
export const parseRetryAfter = (value: string | null | undefined): number | undefined => {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) return Math.min(RETRY_AFTER_MAX_SEC, Math.max(1, Number.parseInt(trimmed, 10)));
  const date = Date.parse(trimmed);
  if (!Number.isFinite(date)) return undefined;
  const seconds = Math.ceil((date - Date.now()) / 1000);
  return seconds > 0 ? Math.min(RETRY_AFTER_MAX_SEC, seconds) : 1;
};

/** Reads at most `limit` bytes from an upstream body — never unbounded. */
export const readBounded = async (body: ReadableStream<Uint8Array> | null, limit: number): Promise<Buffer> => {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    /* Truncated upstream bodies are returned as-is; callers treat them as text. */
  }
  return Buffer.concat(chunks);
};

export interface JsonCallOptions {
  config: GatewayConfig;
  url: string;
  method?: 'GET' | 'POST';
  /** Credentials are injected here from server env only. */
  credential?: { header: 'x-api-key' | 'x-brain-key'; value: string };
  body?: unknown;
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
}

/**
 * Outcome of a gateway JSON call. Kept as a single (non-union) shape so the
 * result is unambiguous regardless of the project's TS strictness settings:
 * `ok: true` always carries `response`, failures always carry `failure`.
 */
export interface JsonCallOutcome {
  ok: boolean;
  response?: UpstreamResponse;
  failure?: HttpFailure;
}

/**
 * Non-streaming gateway call used by /api/ai, /api/fullkonk/providers and the
 * GitHub export route. Upstream status codes and Retry-After are preserved.
 */
export const callGatewayJson = async (options: JsonCallOptions): Promise<JsonCallOutcome> => {
  const { config, url, method = 'GET', credential, body, signal } = options;
  const timeoutMs = options.timeoutMs ?? config.connectTimeoutMs;
  const maxBytes = options.maxBytes ?? config.maxUpstreamErrorBytes;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('gateway timeout')), timeoutMs);
  const onExternalAbort = (): void => controller.abort(new Error('client aborted'));
  if (signal) {
    if (signal.aborted) onExternalAbort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (credential?.value) headers[credential.header] = credential.value;

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: 'manual',
    });

    const payload = await readBounded(response.body, maxBytes);
    return {
      ok: true,
      response: {
        status: response.status,
        contentType: response.headers.get('content-type') || 'application/json; charset=utf-8',
        retryAfter: response.headers.get('retry-after'),
        requestId: response.headers.get('x-request-id'),
        body: payload,
      },
    };
  } catch (error) {
    if (controller.signal.aborted && !(signal?.aborted)) {
      return { ok: false, failure: fail(504, 'GATEWAY_TIMEOUT', 'The Konkred Gateway did not respond in time. Try again shortly.') };
    }
    return { ok: false, failure: upstreamUnavailable(error) };
  } finally {
    clearTimeout(timer);
  }
};

/** 502 with a non-revealing message; the real cause is logged (redacted). */
export const upstreamUnavailable = (error: unknown): HttpFailure => {
  const detail = redactSecrets(error instanceof Error ? error.message : String(error ?? 'unknown error'));
  return fail(502, 'GATEWAY_UNAVAILABLE', `The Konkred Gateway is unreachable (${detail}). Try again shortly.`);
};

/**
 * Extracts a { ok:false, error:{code,message} } envelope (or the fullKONK
 * { error } shape) from an upstream error body without leaking credentials.
 */
export const parseGatewayError = (raw: Buffer, status: number): GatewayErrorInfo => {
  const text = raw.toString('utf8').trim();
  if (text) {
    try {
      const parsed = JSON.parse(text) as { error?: unknown; code?: unknown; message?: unknown; retryAfter?: number };
      const nested = parsed.error;
      if (nested && typeof nested === 'object') {
        const envelope = nested as { code?: unknown; message?: unknown };
        return {
          code: typeof envelope.code === 'string' ? envelope.code : `HTTP_${status}`,
          // Provider errors frequently echo the credential they rejected.
          message: redactSecrets(typeof envelope.message === 'string' ? envelope.message : 'Gateway request failed.'),
        };
      }
      if (typeof nested === 'string' && nested) {
        return { code: typeof parsed.code === 'string' ? parsed.code : `HTTP_${status}`, message: redactSecrets(nested) };
      }
      if (typeof parsed.message === 'string' && parsed.message) {
        return { code: typeof parsed.code === 'string' ? parsed.code : `HTTP_${status}`, message: redactSecrets(parsed.message) };
      }
    } catch {
      /* fall through to the raw-text path */
    }
    // Non-JSON bodies: keep them short and redacted.
    return { code: `HTTP_${status}`, message: redactSecrets(text.slice(0, 300)) };
  }
  return { code: `HTTP_${status}`, message: `Gateway returned HTTP ${status}.` };
};

export interface StreamHandle {
  response: Response;
  /** Aborts the upstream request (used for client disconnects and timeouts). */
  abort: (reason?: string) => void;
  /**
   * Detaches the caller's abort signal. Must be called once the stream has been
   * fully consumed/aborted, otherwise a browser disconnect would keep aborting
   * an already-finished request (and, worse, would stop aborting a live one if
   * the listener were removed too early).
   */
  release: () => void;
  /** True when the caller (browser) went away. */
  readonly clientAborted: boolean;
}

export interface StreamOutcome {
  ok: boolean;
  handle?: StreamHandle;
  failure?: HttpFailure;
}

/**
 * Opens the SSE stream. The response headers must arrive within
 * `connectTimeoutMs`; after that the route owns idle/overall timeouts because
 * the body is consumed incrementally.
 */
export const openGatewayStream = async (options: {
  config: GatewayConfig;
  url: string;
  body: unknown;
  credential?: { header: 'x-api-key' | 'x-brain-key'; value: string };
  signal?: AbortSignal;
}): Promise<StreamOutcome> => {
  const { config, url, body, credential, signal } = options;
  const controller = new AbortController();
  let clientAborted = false;
  const timer = setTimeout(() => controller.abort(new Error('gateway connect timeout')), config.connectTimeoutMs);

  const onExternalAbort = (): void => {
    clientAborted = true;
    controller.abort(new Error('client aborted'));
  };
  const detach = (): void => signal?.removeEventListener('abort', onExternalAbort);
  if (signal) {
    if (signal.aborted) onExternalAbort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'text/event-stream, application/json',
    };
    if (credential?.value) headers[credential.header] = credential.value;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'manual',
    });
    if (!isEventStream(response.headers.get('content-type')) && !response.body) {
      detach();
      return { ok: false, failure: fail(502, 'UPSTREAM_ERROR', 'The Konkred Gateway returned an unusable response.') };
    }
    return {
      ok: true,
      handle: {
        response,
        abort: (reason?: string) => controller.abort(new Error(reason ?? 'aborted')),
        release: detach,
        get clientAborted() {
          return clientAborted;
        },
      },
    };
  } catch (error) {
    detach();
    if (controller.signal.aborted) {
      if (clientAborted) {
        return { ok: false, failure: fail(499, 'CLIENT_CLOSED', 'Request cancelled by the client.') };
      }
      return { ok: false, failure: fail(504, 'GATEWAY_TIMEOUT', 'The Konkred Gateway did not start streaming in time. Try again shortly.') };
    }
    return { ok: false, failure: upstreamUnavailable(error) };
  } finally {
    // The listener stays attached on success: the caller detaches it via
    // handle.release() once the stream is fully consumed, so a browser
    // disconnect mid-stream still aborts the upstream request.
    clearTimeout(timer);
  }
};
