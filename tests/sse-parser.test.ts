import { describe, it, expect } from 'vitest';
import { SSEParser, parseStreamChunk } from '../lib/sse';

/**
 * The SSE parser must survive every transport reality of the proxied
 * FullKONK stream: events split mid-frame, multiple events per chunk, CRLF /
 * CR line endings, heartbeat comments, repeated data: lines, the [DONE]
 * sentinel, and malformed JSON frames (which must never crash the UI).
 */
describe('SSEParser', () => {
  it('parses a complete single event', () => {
    const parser = new SSEParser();
    const out = parser.feed('data: {"type":"stage","stage":"architect"}\n\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'message', message: { data: '{"type":"stage","stage":"architect"}' } });
  });

  it('handles an event split across arbitrary network chunks', () => {
    const parser = new SSEParser();
    const full = 'data: {"type":"delta","content":"hello world"}\n\n';
    let events = 0;
    for (let i = 0; i < full.length; i += 3) {
      events += parser.feed(full.slice(i, i + 3)).length;
    }
    expect(events).toBe(1);
    const flushed = parser.flush();
    expect(flushed).toHaveLength(0);
  });

  it('parses several events delivered in one chunk', () => {
    const parser = new SSEParser();
    const chunk = [
      'data: {"type":"stage","stage":"frontend"}',
      '',
      'data: {"type":"delta","content":"a"}',
      '',
      'data: {"type":"delta","content":"b"}',
      '',
    ].join('\n') + '\n';
    const out = parser.feed(chunk);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.kind)).toEqual(['message', 'message', 'message']);
  });

  it('normalizes CRLF and bare CR line endings', () => {
    const parser = new SSEParser();
    const crlf = parser.feed('data: {"type":"done"}\r\n\r\n');
    expect(crlf).toHaveLength(1);
    const parser2 = new SSEParser();
    const cr = parser2.feed('data: {"type":"done"}\r\r');
    expect(cr).toHaveLength(1);
  });

  it('ignores SSE comment/heartbeat lines starting with ":"', () => {
    const parser = new SSEParser();
    const out = parser.feed(': heartbeat\n\n: another\ndata: {"type":"metrics","data":{}}\n\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'message' });
  });

  it('joins repeated data: lines with a newline and preserves event/id fields', () => {
    const parser = new SSEParser();
    const out = parser.feed('event: delta\nid: 42\ndata: line1\ndata: line2\n\n');
    expect(out).toHaveLength(1);
    if (out[0].kind !== 'message') throw new Error('expected message');
    expect(out[0].message).toEqual({ event: 'delta', id: '42', data: 'line1\nline2' });
  });

  it('strips exactly one leading space after the colon', () => {
    const parser = new SSEParser();
    const out = parser.feed('data:{"noSpace":1}\n\n');
    if (out[0].kind !== 'message') throw new Error('expected message');
    expect(out[0].message.data).toBe('{"noSpace":1}');
  });

  it('emits a done result for the [DONE] sentinel', () => {
    const parser = new SSEParser();
    const out = parser.feed('data: [DONE]\n\n');
    expect(out).toEqual([{ kind: 'done' }]);
  });

  it('flush() returns an unterminated trailing event', () => {
    const parser = new SSEParser();
    parser.feed('data: {"type":"done"}');
    const out = parser.flush();
    expect(out).toHaveLength(1);
    if (out[0].kind !== 'message') throw new Error('expected message');
    expect(out[0].message.data).toBe('{"type":"done"}');
  });

  it('holds a partial frame in the buffer until more bytes arrive', () => {
    const parser = new SSEParser();
    expect(parser.feed('data: {"type":"delta"')).toEqual([]);
    const out = parser.feed(',"content":"x"}\n\n');
    expect(out).toHaveLength(1);
  });

  it('carries escaped JSON through unchanged', () => {
    const parser = new SSEParser();
    const payload = '{"type":"delta","content":"newline\\n and a \\"quote\\""}';
    const out = parser.feed(`data: ${payload}\n\n`);
    if (out[0].kind !== 'message') throw new Error('expected message');
    const parsed = parseStreamChunk(out[0].message.data);
    expect(parsed.ok).toBe(true);
  });

  it('parseStreamChunk reports (never throws) malformed JSON', () => {
    expect(parseStreamChunk('{broken').ok).toBe(false);
    expect(parseStreamChunk('{"ok":true}').ok).toBe(true);
  });
});
