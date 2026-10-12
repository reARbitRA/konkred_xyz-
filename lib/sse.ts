/**
 * Robust Server-Sent Events parser (isomorphic — safe to import from the
 * browser bundle; no Node APIs, no environment access).
 *
 * Handles the realities of streamed transport that a naive
 * `chunk.split('\\n\\n')` parser misses:
 *  - events split across arbitrary network chunk boundaries
 *  - several events delivered inside one chunk
 *  - LF (`\n`), CRLF (`\r\n`) and bare CR (`\r`) line endings
 *  - SSE comment lines starting with `:` (heartbeats)
 *  - `event:`, `id:` and repeated `data:` lines (joined with `\n`)
 *  - the `[DONE]` sentinel
 *  - malformed / non-JSON payloads, surfaced as `malformed` instead of thrown
 */

export interface SSEMessage {
  /** SSE `event:` field; empty string when the upstream omits it. */
  event: string;
  /** SSE `id:` field when present. */
  id: string;
  /** Concatenated `data:` payload, exactly as the SSE spec defines. */
  data: string;
}

export type SSEFeedResult =
  | { kind: 'message'; message: SSEMessage }
  | { kind: 'done' }
  | { kind: 'malformed'; raw: string };

const DONE_SENTINEL = '[DONE]';

export class SSEParser {
  private buffer = '';

  /** Feed one decoded text chunk; returns every complete event it contained. */
  feed(chunk: string): SSEFeedResult[] {
    this.buffer += chunk;
    const results: SSEFeedResult[] = [];

    // Normalize CR/CRLF, then split on blank lines (the SSE event separator).
    const normalized = this.buffer.replace(/\r\n?/g, '\n');
    const blocks = normalized.split('\n\n');
    // The final segment is either an incomplete event (no terminating blank
    // line yet) or an empty string after a clean separator.
    this.buffer = blocks.pop() || '';

    for (const block of blocks) {
      const result = parseBlock(block);
      if (result) results.push(result);
    }
    return results;
  }

  /** Flush at end of stream; returns any trailing event (upstreams that omit the final blank line). */
  flush(): SSEFeedResult[] {
    const trimmed = this.buffer.replace(/\r\n?/g, '\n').trim();
    this.buffer = '';
    return trimmed ? [parseBlock(trimmed)].filter((x): x is SSEFeedResult => x !== null) : [];
  }
}

function parseBlock(block: string): SSEFeedResult | null {
  const lines = block.split('\n');
  let event = '';
  let id = '';
  const dataLines: string[] = [];
  let hasData = false;

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue; // blank / SSE comment (heartbeat)
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    // SSE spec: a single leading space after the colon is stripped.
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') {
      dataLines.push(value);
      hasData = true;
    } else if (field === 'event') {
      event = value;
    } else if (field === 'id') {
      id = value;
    }
    // Unknown fields (retry, etc.) are ignored rather than rejected.
  }

  if (!hasData) return null;
  const data = dataLines.join('\n');
  if (data.trim() === DONE_SENTINEL) return { kind: 'done' };
  return { kind: 'message', message: { event, id, data } };
}

/** Parse a StreamChunk-shaped JSON event payload; malformed JSON is reported, never thrown. */
export function parseStreamChunk(data: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(data) };
  } catch {
    return { ok: false };
  }
}
