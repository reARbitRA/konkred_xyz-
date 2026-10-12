/**
 * Server-Sent Events parser for the fullKONK stream.
 *
 * Shared by the browser (pages/FullKonkPage.tsx, which renders the stream) and
 * by the test-suite (tests/sse.test.ts, tests/gateway-proxy.test.ts) so the wire
 * format is verified in exactly one place.
 *
 * Robustness requirements this parser satisfies:
 *   • one network read is never assumed to be one event — state is kept between
 *     push() calls, including a trailing CR that may be the first half of CRLF;
 *   • several events may arrive in a single chunk;
 *   • LF, CRLF and lone CR line terminators are all accepted;
 *   • multiple `data:` lines in one event are joined with "\n" (per spec);
 *   • comment lines (`: keep-alive`) are ignored;
 *   • `[DONE]` sentinels and malformed payloads never throw — malformed JSON is
 *     reported as null so the UI can skip it instead of crashing.
 */
import type { GeneratedFile, StreamChunk } from '../types';

export interface SseEvent {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export class SseParser {
  private buffer = '';
  private dataLines: string[] = [];
  private eventName = '';
  private id: string | undefined;
  private retry: number | undefined;

  /** Feeds a chunk of text; returns every complete event it produced. */
  push(chunk: string): SseEvent[] {
    if (!chunk) return [];
    this.buffer += chunk;
    const events: SseEvent[] = [];

    let index = 0;
    let lineStart = 0;
    while (index < this.buffer.length) {
      const char = this.buffer[index];
      if (char !== '\n' && char !== '\r') {
        index += 1;
        continue;
      }
      // A trailing CR could be the first half of a CRLF split across chunks —
      // wait for the next chunk instead of emitting a phantom blank line.
      if (char === '\r' && index === this.buffer.length - 1) break;
      const end = index;
      let next = index + 1;
      if (char === '\r' && this.buffer[next] === '\n') next += 1;
      this.consumeLine(this.buffer.slice(lineStart, end), events);
      index = next;
      lineStart = next;
    }

    this.buffer = this.buffer.slice(lineStart);
    return events;
  }

  /** Call once the stream ends to dispatch any unterminated final event. */
  flush(): SseEvent[] {
    const events: SseEvent[] = [];
    if (this.buffer) {
      this.consumeLine(this.buffer, events);
      this.buffer = '';
    }
    this.dispatch(events);
    return events;
  }

  private consumeLine(line: string, events: SseEvent[]): void {
    if (line === '') {
      this.dispatch(events);
      return;
    }
    if (line.startsWith(':')) return; // comment / keep-alive
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'data':
        this.dataLines.push(value);
        break;
      case 'event':
        this.eventName = value;
        break;
      case 'id':
        this.id = value;
        break;
      case 'retry': {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) this.retry = parsed;
        break;
      }
      default:
        break; // unknown fields are ignored, per spec
    }
  }

  private dispatch(events: SseEvent[]): void {
    if (!this.dataLines.length) {
      this.eventName = '';
      this.id = undefined;
      this.retry = undefined;
      return;
    }
    events.push({
      event: this.eventName || 'message',
      data: this.dataLines.join('\n'),
      ...(this.id !== undefined ? { id: this.id } : {}),
      ...(this.retry !== undefined ? { retry: this.retry } : {}),
    });
    this.dataLines = [];
    this.eventName = '';
    this.id = undefined;
    this.retry = undefined;
  }
}

export const isStreamChunk = (value: unknown): value is StreamChunk => {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && type.length > 0;
};

/**
 * Decodes one SSE payload. Returns null for `[DONE]`, comments, truncated JSON
 * and unknown event types — malformed input is skipped, never thrown.
 */
export const decodeStreamChunk = (data: string): StreamChunk | null => {
  const payload = data.trim();
  if (!payload || payload === '[DONE]' || payload === 'DONE') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isStreamChunk(parsed)) return null;
  switch (parsed.type) {
    case 'stage':
      return typeof (parsed as { stage?: unknown }).stage === 'string' ? parsed : null;
    case 'delta':
      return typeof (parsed as { content?: unknown }).content === 'string' ? parsed : null;
    case 'provider': {
      const provider = parsed as { provider?: unknown; model?: unknown };
      if (typeof provider.provider !== 'string') return null;
      return { type: 'provider', provider: provider.provider, model: typeof provider.model === 'string' ? provider.model : '' };
    }
    case 'failover': {
      const failover = parsed as { from?: unknown; to?: unknown; error?: unknown };
      if (typeof failover.from !== 'string') return null;
      return {
        type: 'failover',
        from: failover.from,
        ...(typeof failover.to === 'string' ? { to: failover.to } : {}),
        ...(typeof failover.error === 'string' ? { error: failover.error } : {}),
      };
    }
    case 'metrics': {
      const metrics = parsed as { data?: unknown };
      const data_ = metrics.data && typeof metrics.data === 'object' ? (metrics.data as Record<string, unknown>) : {};
      return {
        type: 'metrics',
        data: {
          tokensPerSecond: Number(data_.tokensPerSecond) || 0,
          totalTokens: Number(data_.totalTokens) || 0,
          provider: typeof data_.provider === 'string' ? data_.provider : '',
        },
      };
    }
    case 'reset': {
      const reset = parsed as { characters?: unknown };
      const characters = Number(reset.characters);
      if (!Number.isFinite(characters) || characters < 0) return null;
      return { type: 'reset', characters: Math.min(characters, 10 ** 7) };
    }
    case 'file': {
      const file = (parsed as { file?: unknown }).file;
      if (!file || typeof file !== 'object') return null;
      const candidate = file as { path?: unknown; content?: unknown; language?: unknown; isTest?: unknown };
      if (typeof candidate.path !== 'string' || typeof candidate.content !== 'string') return null;
      const language = typeof candidate.language === 'string' ? candidate.language.toLowerCase() : 'text';
      const generated: GeneratedFile = {
        path: candidate.path,
        content: candidate.content,
        language,
        ...(typeof candidate.isTest === 'boolean' ? { isTest: candidate.isTest } : {}),
      };
      return { type: 'file', file: generated };
    }
    case 'done':
      return { type: 'done' };
    case 'error': {
      const error = parsed as { error?: unknown; kind?: unknown; retryable?: unknown };
      const message = typeof error.error === 'string' && error.error ? error.error : 'The gateway reported a failure.';
      const kind = error.kind === 'configuration' ? 'configuration' : 'provider';
      return {
        type: 'error',
        error: message,
        kind,
        retryable: typeof error.retryable === 'boolean' ? error.retryable : kind !== 'configuration',
      };
    }
    default:
      return null;
  }
};
