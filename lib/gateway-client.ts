/**
 * Browser-side helpers for the same-origin Konkred Gateway proxy routes
 * (/api/ai, /api/fullkonk/*). This module is part of the client bundle, so it
 * must never read environment secrets or hold any gateway/provider key. It
 * only performs relative `fetch()` calls; credentials are attached server-side.
 */

export class GatewayError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, retryable: boolean, retryAfterSeconds?: number) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface RawErrorEnvelope {
  error?: unknown;
  retryable?: unknown;
  retryAfter?: unknown;
}

function envelopeError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const root = payload as RawErrorEnvelope;
  // { ok:false, error:{ message } } as well as { error:"..." }
  const candidate = root.error;
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  if (candidate && typeof candidate === 'object') {
    const message = (candidate as { message?: unknown; error?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return undefined;
}

function friendlyMessage(status: number, upstream: string | undefined, retryAfterSeconds: number | undefined): { message: string; retryable: boolean } {
  const timing = retryAfterSeconds ? ` Retry in about ${Math.ceil(retryAfterSeconds)} second${retryAfterSeconds === 1 ? '' : 's'}.` : '';
  switch (status) {
    case 400:
      return { message: upstream || 'The request was rejected by the gateway. Check the prompt and attachments, then retry.', retryable: false };
    case 401:
    case 403:
      return { message: 'Authorization or gateway configuration error. The request could not be authenticated.', retryable: false };
    case 402:
      // Payment required: an expected business state, not a fault. Retrying
      // without buying would fail identically, so it is not retryable.
      return {
        message: upstream || 'سهمیهٔ شما به پایان رسیده است. برای ادامه یکی از بسته‌ها را تهیه کنید.',
        retryable: false,
      };
    case 404:
      return { message: 'The requested gateway route was not found.', retryable: false };
    case 413:
      return { message: 'The request is too large. Shorten the prompt or remove attachments and retry.', retryable: false };
    case 429:
      return { message: `Rate limit reached.${timing || ' Please wait a moment before retrying.'}`, retryable: true };
    case 500:
    case 502:
    case 503:
    case 504:
      return { message: `The Konkred AI gateway is temporarily unavailable (${status}). Please retry shortly.${timing}`, retryable: true };
    default:
      return { message: upstream || `The gateway request failed (${status}).`, retryable: status >= 500 };
  }
}

/** Build a normalized, non-empty GatewayError from any non-ok proxy response. */
export async function readGatewayError(response: Response): Promise<GatewayError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  const envelope = payload as RawErrorEnvelope | undefined;
  const retryAfterHeader = Number(response.headers.get('retry-after'));
  const retryAfter = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
    ? retryAfterHeader
    : typeof envelope?.retryAfter === 'number'
      ? envelope.retryAfter
      : undefined;
  const { message, retryable } = friendlyMessage(response.status, envelopeError(payload), retryAfter);
  return new GatewayError(message, response.status, envelope?.retryable === true || retryable, retryAfter);
}

export function networkGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new GatewayError('Request cancelled.', 0, false);
  }
  return new GatewayError('Temporary connectivity error reaching the Konkred gateway. Check your connection and retry.', 0, true);
}
