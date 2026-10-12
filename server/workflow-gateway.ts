/**
 * The workflow runner's one outbound dependency: POST {GATEWAY}/api/ai.
 *
 * Server-only. The gateway URL and key come from environment variables and are
 * never accepted from a request, so there is no SSRF pivot. The upstream body
 * is never forwarded to the browser — only a normalised outcome — so a provider
 * error string can never leak a key or an internal host.
 *
 * This is a plain JSON call, not SSE. These are report-producing workflows; the
 * gateway's streaming contract is deliberately untouched.
 */
import type { CallGateway, GatewayAttempt, GatewayOutcome, GatewayRequest } from './workflow-run.ts';

export interface WorkflowGatewayConfig {
  gatewayUrl: string;
  gatewayApiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  log?: (event: string, meta?: Record<string, unknown>) => void;
}

/** Below the Vercel maxDuration of 300s, above the gateway's 90s per attempt. */
const DEFAULT_TIMEOUT_MS = 240_000;

/** Resolve the runner's gateway config, or null when the deployment has none. */
export function workflowGatewayFromEnv(env: NodeJS.ProcessEnv = process.env): WorkflowGatewayConfig | null {
  const gatewayUrl = (env.KONKRED_GATEWAY_URL || env.BRAIN_URL || '').replace(/\/+$/, '');
  const gatewayApiKey = env.KONKRED_GATEWAY_API_KEY || '';
  if (!gatewayUrl || !gatewayApiKey) return null;
  try {
    const parsed = new URL(gatewayUrl);
    if (parsed.username || parsed.password) return null;
    if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { gatewayUrl, gatewayApiKey };
}

export function createGatewayCaller(config: WorkflowGatewayConfig): CallGateway {
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = config.log ?? (() => undefined);

  return async function callGateway(request: GatewayRequest, idempotencyKey: string): Promise<GatewayOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await doFetch(`${config.gatewayUrl}/api/ai`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Server-only credential. Any browser-supplied copy was never read.
          'x-api-key': config.gatewayApiKey,
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          taskType: request.taskType,
          systemPrompt: request.systemPrompt,
          messages: request.messages,
          privacy: request.privacy,
          maxTokens: request.maxTokens,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { parsed = null; }

      if (!response.ok || !parsed || parsed.ok !== true) {
        // The upstream message is logged (redacted of nothing sensitive: only
        // the code) and NEVER returned to the caller.
        const code = String(((parsed?.error as Record<string, unknown>)?.code) ?? `HTTP_${response.status}`);
        log('error.gateway_rejected', { status: response.status, code });
        const retryAfterHeader = response.headers?.get?.('retry-after');
        return {
          ok: false,
          status: response.status >= 500 ? 503 : 502,
          code,
          retryAfter: retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined,
        };
      }

      const data = (parsed.data ?? {}) as Record<string, unknown>;
      const attempts: GatewayAttempt[] = Array.isArray(data.attempts)
        ? (data.attempts as Record<string, unknown>[]).map((a) => ({
            modelId: typeof a.modelId === 'string' ? a.modelId : null,
            provider: typeof a.provider === 'string' ? a.provider : null,
            status: typeof a.status === 'number' ? a.status : null,
            errorClass: typeof a.errorClass === 'string' ? a.errorClass : null,
            latencyMs: typeof a.latencyMs === 'number' ? a.latencyMs : 0,
          }))
        : [];

      return {
        ok: true,
        content: typeof data.content === 'string' ? data.content : '',
        provider: typeof data.provider === 'string' ? data.provider : 'unknown',
        model: typeof data.model === 'string' ? data.model : 'unknown',
        modelId: typeof data.modelId === 'string' ? data.modelId : 'unknown',
        cached: Boolean(data.cached),
        latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : Date.now() - started,
        attempts,
      };
    } catch (error) {
      // Name only: never the message, which can contain the URL.
      log('error.gateway_unreachable', { name: (error as Error)?.name || 'Error' });
      return { ok: false, status: 503, code: 'GATEWAY_UNREACHABLE' };
    } finally {
      clearTimeout(timer);
    }
  };
}
