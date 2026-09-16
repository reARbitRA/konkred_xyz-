import { describe, it, expect } from 'vitest';
import { SseParser, decodeStreamChunk, isStreamChunk } from '../utils/sse.ts';
import { extractFiles } from '../utils/codeFiles.ts';
import { createStreamState, reduceStreamChunk, foldStream } from '../utils/streamState.ts';

/**
 * Stream-parser tests. The gateway speaks `data: {json}\n\n`; the browser must
 * survive anything a network can do to those bytes.
 */

const parserOf = (): SseParser => new SseParser();

describe('SseParser framing', () => {
  it('handles an event split across network chunks', () => {
    const parser = parserOf();
    expect(parser.push('data: {"type":"del')).toEqual([]);
    expect(parser.push('ta","content":"hi"}\n')).toEqual([]);
    const events = parser.push('\n');
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('{"type":"delta","content":"hi"}');
  });

  it('handles several events in one network chunk', () => {
    const parser = parserOf();
    const events = parser.push('data: {"type":"stage","stage":"build"}\n\ndata: {"type":"delta","content":"a"}\n\ndata: {"type":"done"}\n\n');
    expect(events.map((event) => JSON.parse(event.data).type)).toEqual(['stage', 'delta', 'done']);
  });

  it('accepts CRLF, LF and a CRLF split across chunks', () => {
    const crlf = parserOf().push('data: {"type":"done"}\r\n\r\n');
    expect(crlf).toHaveLength(1);

    const split = parserOf();
    expect(split.push('data: {"type":"done"}\r')).toEqual([]);
    expect(split.push('\n\r\n')).toHaveLength(1);
  });

  it('joins multi-line data fields and skips comments/keep-alives', () => {
    const parser = parserOf();
    const events = parser.push(': fullkonk brain online\n\ndata: line one\ndata: line two\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('line one\nline two');
  });

  it('exposes named events, ids and retry hints', () => {
    const parser = parserOf();
    const events = parser.push('event: ping\nid: 7\nretry: 2500\ndata: {}\n\n');
    expect(events[0]).toMatchObject({ event: 'ping', id: '7', retry: 2500 });
  });

  it('dispatches a trailing event on flush() when the stream ends without a blank line', () => {
    const parser = parserOf();
    expect(parser.push('data: {"type":"done"}')).toEqual([]);
    expect(parser.flush()).toHaveLength(1);
  });

  it('ignores blocks without data fields', () => {
    const parser = parserOf();
    expect(parser.push('event: ping\n\n')).toEqual([]);
  });
});

describe('decodeStreamChunk', () => {
  it('decodes every event type the gateway emits', () => {
    expect(decodeStreamChunk('{"type":"stage","stage":"architect","content":"ARCHITECT"}')).toEqual({ type: 'stage', stage: 'architect', content: 'ARCHITECT' });
    expect(decodeStreamChunk('{"type":"delta","content":"x"}')).toEqual({ type: 'delta', content: 'x' });
    expect(decodeStreamChunk('{"type":"provider","provider":"gemini","model":"gemini-2.5-flash"}')).toEqual({ type: 'provider', provider: 'gemini', model: 'gemini-2.5-flash' });
    expect(decodeStreamChunk('{"type":"failover","from":"groq","to":"gemini"}')).toMatchObject({ type: 'failover', from: 'groq', to: 'gemini' });
    expect(decodeStreamChunk('{"type":"metrics","data":{"tokensPerSecond":10,"totalTokens":5,"provider":"gemini"}}')).toMatchObject({ type: 'metrics', data: { tokensPerSecond: 10, totalTokens: 5 } });
    expect(decodeStreamChunk('{"type":"reset","characters":12}')).toEqual({ type: 'reset', characters: 12 });
    expect(decodeStreamChunk('{"type":"file","file":{"path":"a.ts","content":"x","language":"TS"}}')).toMatchObject({ type: 'file', file: { path: 'a.ts', language: 'ts' } });
    expect(decodeStreamChunk('{"type":"done"}')).toEqual({ type: 'done' });
    expect(decodeStreamChunk('{"type":"error","error":"boom","kind":"configuration"}')).toMatchObject({ type: 'error', kind: 'configuration', retryable: false });
    expect(decodeStreamChunk('{"type":"error","error":"boom","kind":"pipeline"}')).toMatchObject({ type: 'error', kind: 'provider', retryable: true });
  });

  it('handles escaped JSON content', () => {
    const content = 'const re = "\\d+";\nnewline\ttab "quoted"';
    const frame = JSON.stringify({ type: 'delta', content });
    const decoded = decodeStreamChunk(frame);
    expect(decoded).toEqual({ type: 'delta', content });
  });

  it('returns null for [DONE], malformed JSON, truncation and unknown types', () => {
    expect(decodeStreamChunk('[DONE]')).toBeNull();
    expect(decodeStreamChunk('data: nope')).toBeNull();
    expect(decodeStreamChunk('{"type":"delta","content":')).toBeNull();
    expect(decodeStreamChunk('{"type":"quantum-leap"}')).toBeNull();
    expect(decodeStreamChunk('{"type":"delta"}')).toBeNull();
    expect(decodeStreamChunk('')).toBeNull();
  });

  it('validates the chunk shape', () => {
    expect(isStreamChunk({ type: 'done' })).toBe(true);
    expect(isStreamChunk({ type: 42 })).toBe(false);
    expect(isStreamChunk(null)).toBe(false);
    expect(isStreamChunk('done')).toBe(false);
  });
});

describe('reducer', () => {
  it('accumulates text, files, provider, failover and metrics', () => {
    const seed = createStreamState({ mode: 'fullstack' });
    const { state } = foldStream(seed, [
      { type: 'stage', stage: 'frontend' },
      { type: 'provider', provider: 'gemini', model: 'gemini-2.5-flash' },
      { type: 'failover', from: 'groq', to: 'gemini' },
      { type: 'metrics', data: { tokensPerSecond: 12, totalTokens: 99, provider: 'gemini' } },
      { type: 'delta', content: 'file: src/index.ts\n```ts\nexport const a = 1;\n```\n' },
      { type: 'file', file: { path: 'README.md', content: '# hi', language: 'md' } },
      { type: 'done' },
    ]);
    expect(state.completed).toBe(true);
    expect(state.stage).toBe('done');
    expect(state.provider).toBe('gemini');
    expect(state.metrics).toMatchObject({ totalTokens: 99, tokensPerSecond: 12, transition: 'groq → gemini' });
    expect(state.text).toContain('export const a = 1;');
    expect(state.files.map((file) => file.path).sort()).toEqual(['README.md', 'src/index.ts']);
    expect(state.failure).toBeNull();
  });

  it('keeps explicit file events when later deltas or resets arrive', () => {
    const seed = createStreamState({ mode: 'fullstack' });
    const { state } = foldStream(seed, [
      { type: 'stage', stage: 'frontend' },
      { type: 'file', file: { path: 'kept.ts', content: 'x', language: 'ts' } },
      { type: 'delta', content: 'file: generated/a.ts\n```ts\nlet a;\n```\n' },
      { type: 'reset', characters: 1 },
    ]);
    expect(state.files.map((file) => file.path).sort()).toEqual(['generated/a.ts', 'kept.ts']);
  });

  it('does not let architect-stage output overwrite generated files', () => {
    const base = extractFiles('file: keep.ts\n```ts\nlet keep = 1;\n```\n');
    const seed = createStreamState({ mode: 'fullstack', baseFiles: base });
    const { state } = foldStream(seed, [
      { type: 'delta', content: '## plan\nfile: not-a-file.ts\n' },
    ]);
    expect(state.files.map((file) => file.path)).toEqual(['keep.ts']);
    expect(state.text).toBe('');
  });

  it('records a retryable failure without clearing partial work', () => {
    const seed = createStreamState({ mode: 'frontend' });
    const { state } = foldStream(seed, [
      { type: 'stage', stage: 'frontend' },
      { type: 'delta', content: 'partial' },
      { type: 'error', error: 'All 6 attempts failed', kind: 'provider' },
    ]);
    expect(state.failure).toMatchObject({ kind: 'provider', retryable: true });
    expect(state.text).toBe('partial');
    expect(state.completed).toBe(false);
  });

  it('marks a configuration failure as non-retryable', () => {
    const { state } = reduceStreamChunk(createStreamState({ mode: 'fullstack' }), {
      type: 'error', error: 'No AI providers available', kind: 'configuration',
    });
    expect(state.failure).toMatchObject({ retryable: false });
  });

  it('reports message operations so the chat history stays incremental', () => {
    const seed = createStreamState({ mode: 'fullstack' });
    const appended = reduceStreamChunk({ ...seed, stage: 'frontend' }, { type: 'delta', content: 'hello' });
    expect(appended.ops).toEqual([{ type: 'append', content: 'hello', stage: 'frontend' }]);
    const trimmed = reduceStreamChunk({ ...seed, stage: 'frontend' }, { type: 'reset', characters: 3 });
    expect(trimmed.ops).toEqual([{ type: 'trimLast', characters: 3, stage: 'frontend' }]);
  });
});
