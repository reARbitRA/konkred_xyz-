/**
 * POST /api/fullkonk/generate — streaming (SSE) generation proxy.
 *
 * Browser → this Vercel route → ${KONKRED_GATEWAY_URL}/api/fullkonk/generate
 *
 * The gateway emits `data: {json}\n\n` events (stage / provider / failover /
 * metrics / delta / file / reset / done / error). This route is a byte-level
 * pass-through: it never buffers the whole response, never rewrites the event
 * protocol, propagates client aborts upstream, and enforces connect / idle /
 * overall timeouts. If the stream dies mid-flight it emits a synthetic `error`
 * event so the UI shows a failure instead of an empty success.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GATEWAY_PATHS, isGatewayConfigured, readGatewayConfig, resolveUpstreamUrl } from '../config';
import type { GatewayConfig } from '../config';
import { authenticateRequest } from '../auth';
import {
  fail,
  isEventStream,
  isHttpFailure,
  isOriginAllowed,
  log,
  methodNotAllowed,
  rateLimiter,
  readJsonBody,
  redactSecrets,
  requestId,
  sendFullkonkError,
  sendJson,
} from '../http';
import { openGatewayStream, parseGatewayError } from '../upstream';

const MODES = new Set(['fullstack', 'frontend', 'backend', 'review']);
const MAX_PROMPT_CHARS = 40_000;
const MAX_SYSTEM_PROMPT_CHARS = 12_000;
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_BYTES = 500 * 1024;
const MAX_ATTACHMENT_PATH = 240;
const SAFE_IDENTIFIER = /^[A-Za-z0-9._:@/-]{1,128}$/;

export interface NormalizedGenerateRequest {
  prompt: string;
  mode: string;
  model?: string;
  temperature: number;
  maxTokens?: number;
  systemPrompt?: string;
  attachedFiles: { path: string; content: string }[];
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * Validates the fullKONK payload and normalises it to the gateway contract.
 * Only the fields the gateway understands survive; everything else (for example
 * the legacy `projectId`, which the gateway does not expand) is dropped.
 */
export const normalizeGenerateRequest = (raw: unknown): NormalizedGenerateRequest => {
  const body = asRecord(raw);

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) throw fail(400, 'BAD_REQUEST', 'A prompt is required.');
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw fail(400, 'BAD_REQUEST', `The prompt exceeds ${MAX_PROMPT_CHARS} characters.`);
  }

  const mode = typeof body.mode === 'string' && MODES.has(body.mode) ? body.mode : 'fullstack';

  const requestedModel = typeof body.model === 'string' ? body.model.trim() : '';
  if (requestedModel && !SAFE_IDENTIFIER.test(requestedModel)) {
    throw fail(400, 'BAD_REQUEST', 'The requested model id is not valid.');
  }

  const temperatureInput = typeof body.temperature === 'number' ? body.temperature : Number.parseFloat(String(body.temperature ?? ''));
  const temperature = Number.isFinite(temperatureInput) ? Math.min(2, Math.max(0, temperatureInput)) : 0.4;

  let maxTokens: number | undefined;
  if (body.maxTokens !== undefined && body.maxTokens !== null && body.maxTokens !== '') {
    const parsed = Math.round(Number(body.maxTokens));
    if (!Number.isFinite(parsed)) throw fail(400, 'BAD_REQUEST', 'maxTokens must be a number.');
    maxTokens = Math.min(8192, Math.max(256, parsed));
  }

  const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, MAX_SYSTEM_PROMPT_CHARS) : '';

  const attachedFiles: { path: string; content: string }[] = [];
  const attached = body.attachedFiles;
  if (attached !== undefined && attached !== null) {
    if (!Array.isArray(attached)) throw fail(400, 'BAD_REQUEST', 'attachedFiles must be an array.');
    if (attached.length > MAX_ATTACHMENTS) throw fail(400, 'BAD_REQUEST', `At most ${MAX_ATTACHMENTS} attachments are allowed.`);
    let totalBytes = 0;
    for (const item of attached) {
      const file = asRecord(item);
      const path = typeof file.path === 'string' ? file.path.trim() : '';
      if (!path || path.length > MAX_ATTACHMENT_PATH || path.includes('..')) {
        throw fail(400, 'BAD_REQUEST', 'Attachment paths must be relative and must not escape the workspace.');
      }
      const base64 = typeof file.contentBase64 === 'string' ? file.contentBase64 : '';
      if (!base64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) throw fail(400, 'BAD_REQUEST', `Attachment ${path} is not valid base64.`);
      const decoded = Buffer.from(base64, 'base64');
      totalBytes += decoded.byteLength;
      if (totalBytes > MAX_ATTACHMENT_BYTES) {
        throw fail(413, 'PAYLOAD_TOO_LARGE', 'Attachments exceed the 500KB limit.');
      }
      attachedFiles.push({ path, content: decoded.toString('utf8') });
    }
  }

  return {
    prompt,
    mode,
    ...(requestedModel ? { model: requestedModel } : {}),
    temperature,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(systemPrompt ? { systemPrompt } : {}),
    attachedFiles,
  };
};

/** Writes a chunk, honouring backpressure without unbounded buffering. */
const writeChunk = (res: ServerResponse, chunk: Buffer): Promise<boolean> => {
  if (res.writableEnded || res.destroyed) return Promise.resolve(false);
  let flushed = false;
  try {
    flushed = res.write(chunk);
  } catch {
    return Promise.resolve(false);
  }
  if (flushed) return Promise.resolve(true);
  return new Promise((resolve) => {
    const cleanup = (): void => {
      res.off('drain', onDrain);
      res.off('close', onClose);
    };
    const onDrain = (): void => {
      cleanup();
      resolve(true);
    };
    const onClose = (): void => {
      cleanup();
      resolve(false);
    };
    res.once('drain', onDrain);
    res.once('close', onClose);
  });
};

const sseErrorEvent = (message: string, kind = 'pipeline'): Buffer =>
  Buffer.from(`data: ${JSON.stringify({ type: 'error', error: redactSecrets(message), kind, retryable: kind !== 'configuration' })}\n\n`, 'utf8');

export const handleGenerate = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const id = requestId();
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST');
    return;
  }

  const config: GatewayConfig = readGatewayConfig();
  if (!isGatewayConfigured(config)) {
    sendFullkonkError(res, fail(503, 'GATEWAY_NOT_CONFIGURED', 'Generation is not configured on this deployment.'));
    return;
  }
  if (!isOriginAllowed(req, config.allowedOrigins)) {
    log.warn('bff.generate', `origin rejected id=${id}`);
    sendFullkonkError(res, fail(403, 'FORBIDDEN', 'This origin is not allowed to start a build.'));
    return;
  }

  const caller = await authenticateRequest(req, config);
  if (isHttpFailure(caller)) {
    sendFullkonkError(res, caller);
    return;
  }

  const limit = rateLimiter.check(`generate:${caller.id}`, config.rateLimits.generate);
  if (!limit.ok) {
    log.warn('bff.generate', `rate limited id=${id}`);
    sendFullkonkError(res, fail(429, 'RATE_LIMITED', 'Too many builds in the last minute. Wait for the current quota window.', limit.retryAfterSec));
    return;
  }

  let payload: NormalizedGenerateRequest;
  try {
    payload = normalizeGenerateRequest(await readJsonBody(req, config.maxBodyBytes));
  } catch (error) {
    if (isHttpFailure(error)) sendFullkonkError(res, error);
    else sendFullkonkError(res, fail(400, 'BAD_REQUEST', 'The request could not be read.'));
    return;
  }

  // Abort the upstream request as soon as the browser goes away.
  const clientAbort = new AbortController();
  const onClientClose = (): void => {
    if (!res.writableEnded) clientAbort.abort();
  };
  req.once('aborted', onClientClose);
  res.once('close', onClientClose);

  const started = Date.now();
  const stream = await openGatewayStream({
    config,
    url: resolveUpstreamUrl(config, GATEWAY_PATHS.generate),
    body: payload,
    credential: { header: 'x-brain-key', value: config.fullkonkKey },
    signal: clientAbort.signal,
  });

  if (!stream.ok || !stream.handle) {
    const failure = stream.failure ?? fail(502, 'GATEWAY_UNAVAILABLE', 'The Konkred Gateway is unreachable. Try again shortly.');
    req.off('aborted', onClientClose);
    if (failure.status !== 499) {
      log.warn('bff.generate', `stream open failed id=${id} code=${failure.code} ms=${Date.now() - started}`);
    }
    if (!clientAbort.signal.aborted) sendFullkonkError(res, failure);
    else if (!res.writableEnded) res.end();
    return;
  }

  const streamHandle = stream.handle;
  const response = streamHandle.response;

  // Upstream answered with JSON (401 / 403 / 413 / 429 / 5xx) instead of SSE.
  if (!isEventStream(response.headers.get('content-type'))) {
    const raw = Buffer.from(await response.arrayBuffer().catch(() => new ArrayBuffer(0)));
    const error = parseGatewayError(raw.slice(0, config.maxUpstreamErrorBytes), response.status);
    const retryAfterSec = response.headers.get('retry-after');
    log.warn('bff.generate', `gateway rejected id=${id} status=${response.status} code=${error.code}`);
    req.off('aborted', onClientClose);
    if (!res.writableEnded) {
      sendJson(
        res,
        response.status,
        { error: error.message, code: error.code },
        {
          'cache-control': 'no-store',
          ...(retryAfterSec ? { 'retry-after': retryAfterSec } : {}),
        },
      );
    }
    streamHandle.abort('gateway error body consumed');
    streamHandle.release();
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    ...(response.headers.get('x-request-id') ? { 'x-konkred-request-id': String(response.headers.get('x-request-id')) } : {}),
  });
  res.flushHeaders?.();

  const reader = response.body?.getReader();
  if (!reader) {
    if (!res.writableEnded) res.write(sseErrorEvent('The gateway returned an empty stream.'));
    res.end();
    return;
  }

  let abortReason: 'idle' | 'total' | 'client' | null = null;
  let bytes = 0;
  let idleTimer: NodeJS.Timeout | null = null;
  let totalTimer: NodeJS.Timeout | null = null;

  const clearTimers = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    if (totalTimer) clearTimeout(totalTimer);
    idleTimer = null;
    totalTimer = null;
  };
  const abortUpstream = (reason: 'idle' | 'total' | 'client'): void => {
    if (abortReason) return;
    abortReason = reason;
    streamHandle.abort(reason);
  };
  const armIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => abortUpstream('idle'), config.idleTimeoutMs);
  };

  totalTimer = setTimeout(() => abortUpstream('total'), config.streamTimeoutMs);
  armIdle();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = Buffer.from(value);
      bytes += chunk.byteLength;
      armIdle();
      const written = await writeChunk(res, chunk);
      if (!written) {
        abortUpstream('client');
        break;
      }
    }
    if (!abortReason && clientAbort.signal.aborted) abortReason = 'client';
    if (!abortReason && !res.writableEnded) res.end();
  } catch (error) {
    if (clientAbort.signal.aborted) abortReason = 'client';
    else abortUpstream('idle');
    const message = redactSecrets(error instanceof Error ? error.message : 'stream failure');
    log.warn('bff.generate', `stream interrupted id=${id} reason=${abortReason ?? 'unknown'} detail=${message}`);
    if (!res.writableEnded) {
      const text = abortReason === 'total'
        ? 'The build exceeded the maximum stream duration. Partial output was kept — retry to continue.'
        : 'The Konkred Gateway connection was interrupted. Partial output was kept — retry to continue.';
      await writeChunk(res, sseErrorEvent(text));
      res.end();
    }
  } finally {
    clearTimers();
    reader.cancel().catch(() => undefined);
    streamHandle.release();
    req.off('aborted', onClientClose);
    res.off('close', onClientClose);
    log.info('bff.generate', `stream closed id=${id} bytes=${bytes} ms=${Date.now() - started} abort=${abortReason ?? 'none'}`);
  }
};
