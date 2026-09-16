/**
 * GET /api/fullkonk/providers — server-side provider discovery proxy.
 *
 * Browser → this Vercel route → ${KONKRED_GATEWAY_URL}/api/fullkonk/providers
 *
 * The gateway location and the x-brain-key shared secret are read from server
 * environment variables only; the browser cannot influence either.
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
  requestId,
  sendFullkonkError,
  sendJson,
} from '../http';
import { callGatewayJson, parseGatewayError, type GatewayErrorInfo } from '../upstream';

/** Provider discovery is safe to cache briefly; failures never are. */
const SUCCESS_CACHE = 'public, max-age=30, s-maxage=60, stale-while-revalidate=120';

export const handleProviders = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const id = requestId();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    methodNotAllowed(res, 'GET');
    return;
  }

  const config = readGatewayConfig();
  if (!isGatewayConfigured(config)) {
    sendFullkonkError(res, fail(503, 'GATEWAY_NOT_CONFIGURED', 'Provider discovery is not configured on this deployment.'));
    return;
  }
  if (!isOriginAllowed(req, config.allowedOrigins)) {
    log.warn('bff.providers', `origin rejected id=${id}`);
    sendFullkonkError(res, fail(403, 'FORBIDDEN', 'This origin is not allowed to call the platform API.'));
    return;
  }

  const caller = await authenticateRequest(req, config);
  if (isHttpFailure(caller)) {
    sendFullkonkError(res, caller);
    return;
  }

  const limit = rateLimiter.check(`providers:${caller.id}`, config.rateLimits.providers);
  if (!limit.ok) {
    log.warn('bff.providers', `rate limited id=${id}`);
    sendFullkonkError(res, fail(429, 'RATE_LIMITED', 'Too many provider lookups. Try again shortly.', limit.retryAfterSec));
    return;
  }

  const started = Date.now();
  const result = await callGatewayJson({
    config,
    url: resolveUpstreamUrl(config, GATEWAY_PATHS.providers),
    method: 'GET',
    credential: { header: 'x-brain-key', value: config.fullkonkKey },
    timeoutMs: config.connectTimeoutMs,
    maxBytes: config.maxUpstreamErrorBytes,
  });

  if (!result.ok || !result.response) {
    const failure = result.failure ?? fail(502, 'GATEWAY_UNAVAILABLE', 'The Konkred Gateway is unreachable. Try again shortly.');
    log.warn('bff.providers', `upstream unreachable id=${id} ms=${Date.now() - started}`, { code: failure.code });
    sendFullkonkError(res, failure);
    return;
  }

  const response = result.response;
  if (response.status === 200) {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(response.body.byteLength),
      'cache-control': SUCCESS_CACHE,
      ...(response.requestId ? { 'x-konkred-request-id': response.requestId } : {}),
    });
    res.end(response.body);
    return;
  }

  // Preserve the upstream status (401 / 403 / 429 / 5xx) and Retry-After, but
  // never echo an unredacted upstream body.
  const error: GatewayErrorInfo = parseGatewayError(response.body, response.status);
  log.warn('bff.providers', `upstream status=${response.status} id=${id} code=${error.code}`);
  const retryAfterSec = parseRetryAfterSec(response.retryAfter);
  sendJson(
    res,
    response.status,
    { error: error.message, code: error.code, ok: false },
    {
      'cache-control': 'no-store',
      ...(retryAfterSec ? { 'retry-after': String(retryAfterSec) } : {}),
    },
  );
};

const parseRetryAfterSec = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
};
