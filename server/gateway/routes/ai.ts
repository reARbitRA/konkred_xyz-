/**
 * Standard inference proxy.
 *
 *   POST /api/ai          → gateway POST /api/ai (x-api-key, envelope passthrough)
 *   POST /api/ai/generate → compatibility shim for the existing KONKRED client
 *                           (`services/ai.ts`), which posts
 *                           { provider, messages, config } and reads { text }.
 *
 * Both routes read the gateway URL and the x-api-key credential from server
 * environment variables only. The browser never sees a provider key, and the
 * { ok, data } / { ok, error } envelope plus status codes and Retry-After are
 * preserved verbatim.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GATEWAY_PATHS, isGatewayConfigured, readGatewayConfig, resolveUpstreamUrl } from '../config';
import { authenticateRequest } from '../auth';
import {
  fail,
  isHttpFailure,
  isOriginAllowed,
  log,
  methodNotAllowed,
  rateLimiter,
  readJsonBody,
  redactSecrets,
  requestId,
  sendJson,
} from '../http';
import { callGatewayJson, parseGatewayError } from '../upstream';

const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 200_000;
const TASK_TYPES = new Set(['general', 'code-generation', 'bug-fixing', 'architecture', 'summarization', 'translate', 'extraction']);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

interface NormalizedAiRequest {
  taskType: string;
  messages: { role: string; content: string }[];
  maxTokens?: number;
  temperature?: number;
  privacy?: string;
  skipCache?: boolean;
  model?: string;
  systemPrompt?: string;
}

/** Maps the legacy AUDITOR payload onto the gateway /api/ai contract. */
export const normalizeLegacyAiRequest = (raw: unknown): NormalizedAiRequest => {
  const body = asRecord(raw);
  const legacyConfig = asRecord(body.config);

  const messagesInput = body.messages;
  if (!Array.isArray(messagesInput) || messagesInput.length === 0) {
    throw fail(400, 'BAD_REQUEST', 'Provide a non-empty "messages" array.');
  }
  if (messagesInput.length > MAX_MESSAGES) throw fail(413, 'PAYLOAD_TOO_LARGE', `At most ${MAX_MESSAGES} messages are supported.`);

  const messages: { role: string; content: string }[] = [];
  for (const item of messagesInput) {
    const message = asRecord(item);
    const role = typeof message.role === 'string' ? message.role.toLowerCase() : 'user';
    if (!['system', 'user', 'assistant', 'developer', 'tool'].includes(role)) continue;
    const content = typeof message.content === 'string' ? message.content : '';
    if (!content.trim()) continue;
    if (content.length > MAX_MESSAGE_CHARS) throw fail(413, 'PAYLOAD_TOO_LARGE', 'A message exceeds the 200KB limit.');
    messages.push({ role, content });
  }
  if (!messages.length) throw fail(400, 'BAD_REQUEST', 'All supplied messages were empty.');

  const wantsJson = typeof legacyConfig.responseMimeType === 'string' && legacyConfig.responseMimeType.toLowerCase().includes('json');
  const taskType = wantsJson ? 'extraction' : 'general';

  const maxTokensRaw = Number(legacyConfig.maxTokens ?? body.maxTokens);
  const maxTokens = Number.isFinite(maxTokensRaw) ? Math.min(8192, Math.max(256, Math.round(maxTokensRaw))) : undefined;
  const temperatureRaw = Number(legacyConfig.temperature ?? body.temperature);
  const temperature = Number.isFinite(temperatureRaw) ? Math.min(2, Math.max(0, temperatureRaw)) : undefined;
  const model = typeof legacyConfig.defaultModel === 'string' && legacyConfig.defaultModel.trim()
    ? legacyConfig.defaultModel.trim()
    : (typeof body.model === 'string' ? body.model.trim() : '');

  return {
    taskType,
    messages,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(model ? { model } : {}),
  };
};

/** Maps the canonical gateway payload through, validating only our own guards. */
export const normalizeCanonicalAiRequest = (raw: unknown): NormalizedAiRequest => {
  const body = asRecord(raw);
  const taskType = typeof body.taskType === 'string' ? body.taskType.trim().toLowerCase() : 'general';
  if (!TASK_TYPES.has(taskType)) {
    throw fail(400, 'BAD_REQUEST', `Unsupported taskType. Valid: ${[...TASK_TYPES].join(', ')}.`);
  }
  const messagesInput = Array.isArray(body.messages) ? body.messages : null;
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!messagesInput && !prompt) throw fail(400, 'BAD_REQUEST', 'Provide "messages" or a "prompt".');
  if (messagesInput && messagesInput.length > MAX_MESSAGES) throw fail(413, 'PAYLOAD_TOO_LARGE', `At most ${MAX_MESSAGES} messages are supported.`);

  const messages: { role: string; content: string }[] = [];
  for (const item of messagesInput ?? []) {
    const message = asRecord(item);
    const role = typeof message.role === 'string' ? message.role.toLowerCase() : 'user';
    const content = typeof message.content === 'string' ? message.content : '';
    if (!content.trim()) continue;
    if (content.length > MAX_MESSAGE_CHARS) throw fail(413, 'PAYLOAD_TOO_LARGE', 'A message exceeds the 200KB limit.');
    messages.push({ role, content });
  }
  if (!messages.length && !prompt) throw fail(400, 'BAD_REQUEST', 'All supplied messages were empty.');

  const maxTokensRaw = Number(body.maxTokens);
  const temperatureRaw = Number(body.temperature);
  const privacy = typeof body.privacy === 'string' && ['private', 'any', 'training-ok'].includes(body.privacy) ? body.privacy : undefined;

  return {
    taskType,
    messages: messages.length ? messages : [{ role: 'user', content: prompt }],
    ...(Number.isFinite(maxTokensRaw) ? { maxTokens: Math.min(8192, Math.max(16, Math.round(maxTokensRaw))) } : {}),
    ...(Number.isFinite(temperatureRaw) ? { temperature: Math.min(2, Math.max(0, temperatureRaw)) } : {}),
    ...(privacy ? { privacy } : {}),
    ...(body.skipCache === true ? { skipCache: true } : {}),
    ...(typeof body.model === 'string' && body.model.trim() ? { model: body.model.trim() } : {}),
    ...(typeof body.systemPrompt === 'string' && body.systemPrompt.trim() ? { systemPrompt: body.systemPrompt.trim().slice(0, 12_000) } : {}),
  };
};

/** Shared admission: config, origin, auth, rate limit, body. */
const admit = async (
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  limitPerMinute: number,
): Promise<{ ok: true; body: unknown } | { ok: false }> => {
  const config = readGatewayConfig();
  if (!isGatewayConfigured(config)) {
    sendJson(res, 503, {
      ok: false,
      error: { code: 'GATEWAY_NOT_CONFIGURED', message: 'Inference is not configured on this deployment.' },
    });
    return { ok: false };
  }
  if (!config.gatewayApiKey) {
    sendJson(res, 503, {
      ok: false,
      error: { code: 'GATEWAY_CREDENTIAL_MISSING', message: 'The inference credential is not configured on this deployment.' },
    });
    return { ok: false };
  }
  if (!isOriginAllowed(req, config.allowedOrigins)) {
    log.warn('bff.ai', `origin rejected id=${id}`);
    sendJson(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'This origin is not allowed to call inference.' } });
    return { ok: false };
  }
  const caller = await authenticateRequest(req, config);
  if (isHttpFailure(caller)) {
    sendJson(res, caller.status, { ok: false, error: { code: caller.code, message: caller.message } });
    return { ok: false };
  }
  const limit = rateLimiter.check(`ai:${caller.id}`, limitPerMinute);
  if (!limit.ok) {
    log.warn('bff.ai', `rate limited id=${id}`);
    sendJson(
      res,
      429,
      { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many inference requests. Try again shortly.' } },
      { 'retry-after': String(limit.retryAfterSec) },
    );
    return { ok: false };
  }
  try {
    return { ok: true, body: await readJsonBody(req, config.maxBodyBytes) };
  } catch (error) {
    const failure = isHttpFailure(error) ? error : fail(400, 'BAD_REQUEST', 'The request could not be read.');
    sendJson(res, failure.status, { ok: false, error: { code: failure.code, message: failure.message } });
    return { ok: false };
  }
};

const forward = async (
  res: ServerResponse,
  id: string,
  body: NormalizedAiRequest,
  legacyMode: boolean,
): Promise<void> => {
  const config = readGatewayConfig();
  const started = Date.now();
  const result = await callGatewayJson({
    config,
    url: resolveUpstreamUrl(config, GATEWAY_PATHS.ai),
    method: 'POST',
    credential: { header: 'x-api-key', value: config.gatewayApiKey },
    body,
    timeoutMs: Math.min(config.connectTimeoutMs * 4, 180_000),
    maxBytes: 4 * 1024 * 1024,
  });

  if (!result.ok || !result.response) {
    const failure = result.failure ?? fail(502, 'GATEWAY_UNAVAILABLE', 'The Konkred Gateway is unreachable. Try again shortly.');
    log.warn('bff.ai', `upstream unreachable id=${id} code=${failure.code} ms=${Date.now() - started}`);
    sendJson(res, failure.status, { ok: false, error: { code: failure.code, message: failure.message } });
    return;
  }

  const response = result.response;
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(response.body.toString('utf8')) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(response.retryAfter ? { 'retry-after': response.retryAfter } : {}),
  };

  if (response.status >= 400 || parsed?.ok === false) {
    const error = parseGatewayError(response.body, response.status);
    log.warn('bff.ai', `gateway error id=${id} status=${response.status} code=${error.code}`);
    const payload = legacyMode
      ? { error: redactSecrets(error.message), code: error.code, ok: false }
      : { ok: false, error: { code: error.code, message: redactSecrets(error.message) } };
    sendJson(res, response.status >= 400 ? response.status : 502, payload, headers);
    return;
  }

  if (!legacyMode) {
    // Canonical envelope passes through untouched.
    res.writeHead(response.status, { ...headers, 'content-length': String(response.body.byteLength) });
    res.end(response.body);
    return;
  }

  // Legacy client (`services/ai.ts`) expects { text } and parses it as JSON.
  const data = asRecord(parsed?.data);
  const text = typeof data.content === 'string' ? data.content : '';
  if (!text) {
    sendJson(res, 502, { error: 'The gateway returned an empty completion.', code: 'UPSTREAM_ERROR' }, headers);
    return;
  }
  sendJson(
    res,
    200,
    {
      text,
      provider: typeof data.provider === 'string' ? data.provider : '',
      model: typeof data.model === 'string' ? data.model : '',
      usage: data.usage ?? {},
      cached: Boolean(data.cached),
      attemptCount: Number(data.attemptCount ?? 0),
      groundingChunks: [],
    },
    headers,
  );
  log.info('bff.ai', `inference id=${id} status=200 ms=${Date.now() - started} bytes=${response.body.byteLength}`);
};

export const handleAi = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const id = requestId();
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST');
    return;
  }
  const admitted = await admit(req, res, id, readGatewayConfig().rateLimits.ai);
  if (!admitted.ok) return;
  let body: NormalizedAiRequest;
  try {
    body = normalizeCanonicalAiRequest(admitted.body);
  } catch (error) {
    const failure = isHttpFailure(error) ? error : fail(400, 'BAD_REQUEST', 'The request is not valid.');
    sendJson(res, failure.status, { ok: false, error: { code: failure.code, message: failure.message } });
    return;
  }
  await forward(res, id, body, false);
};

export const handleLegacyAiGenerate = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const id = requestId();
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST');
    return;
  }
  const admitted = await admit(req, res, id, readGatewayConfig().rateLimits.ai);
  if (!admitted.ok) return;
  let body: NormalizedAiRequest;
  try {
    body = normalizeLegacyAiRequest(admitted.body);
  } catch (error) {
    const failure = isHttpFailure(error) ? error : fail(400, 'BAD_REQUEST', 'The request is not valid.');
    sendJson(res, failure.status, { error: failure.message, code: failure.code });
    return;
  }
  await forward(res, id, body, true);
};
