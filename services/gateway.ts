/**
 * Client for the standard Konkred Gateway inference route (POST /api/ai).
 *
 * Same-origin only. The Vercel function attaches gateway credentials
 * server-side; this module holds no credentials and contains no
 * provider-specific logic — model/provider selection lives in the gateway.
 */
import { GatewayError, readGatewayError } from '../lib/gateway-client';

export interface GatewayChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GatewayCompletionInput {
  messages: GatewayChatMessage[];
  temperature?: number;
  maxTokens?: number;
  taskType?: string;
  privacy?: 'private' | 'public';
  skipCache?: boolean;
}

interface GatewaySuccess {
  ok: true;
  data?: {
    content?: unknown;
    provider?: unknown;
    model?: unknown;
    [key: string]: unknown;
  };
}

interface GatewayFailure {
  ok: false;
  error?: unknown;
}

/** Run a standard (non-streaming) completion and resolve with the text content. */
export async function gatewayComplete(input: GatewayCompletionInput): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskType: input.taskType || 'general',
        messages: input.messages,
        maxTokens: input.maxTokens ?? 2048,
        temperature: input.temperature ?? 0.3,
        privacy: input.privacy ?? 'private',
        skipCache: input.skipCache ?? false,
      }),
    });
  } catch (error) {
    throw error instanceof DOMException && error.name === 'AbortError' ? error : new GatewayError(
      'Temporary connectivity error reaching the Konkred gateway. Check your connection and retry.',
      0,
      true,
    );
  }

  if (!response.ok) throw await readGatewayError(response);

  const payload = (await response.json()) as GatewaySuccess | GatewayFailure;
  if (payload && payload.ok === false) {
    const raw = typeof payload.error === 'string'
      ? payload.error
      : payload.error && typeof payload.error === 'object'
        ? (payload.error as { message?: string }).message
        : undefined;
    throw new GatewayError(raw || 'The Konkred gateway rejected the request.', 502, true);
  }
  const content = (payload as GatewaySuccess)?.data?.content;
  if (typeof content !== 'string' || !content) {
    throw new GatewayError('The Konkred gateway returned an empty response.', 502, true);
  }
  return content;
}

/**
 * Best-effort extraction of a JSON object/array from model text: tolerates
 * prose around the JSON and ```json fenced code blocks. Throws when no JSON
 * can be recovered, so callers never silently end up with an empty result.
 */
export function extractJsonFromText<T = unknown>(text: string): T {
  const trimmed = text.trim();
  const attempts: string[] = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.unshift(fenced[1].trim());
  const firstBrace = trimmed.search(/[[{]/);
  const lastBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (firstBrace >= 0 && lastBrace > firstBrace) attempts.unshift(trimmed.slice(firstBrace, lastBrace + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try the next recovery strategy
    }
  }
  throw new Error('The gateway response was not valid JSON as requested.');
}
