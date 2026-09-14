import { describe, it, expect } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { createGatewayHandler, type GatewayConfig } from '../server/gateway-proxy';
import { SSEParser, parseStreamChunk } from '../lib/sse';
import type { StreamChunk } from '../types';

/**
 * Full request-path integration test over real TCP:
 *
 *   simulated browser fetch → node server running the Vercel proxy handler
 *   → real global fetch → in-process mock Konkred Gateway
 *   → deliberately fragmented SSE bytes → browser-style SSEParser
 *   → the same StreamChunk event sequence the FullKONK UI renders.
 *
 * No live Gemini/Groq/GitHub/Redis credentials are involved.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function startMockGateway(): Promise<{ server: Server; url: string; seenHeaders: Record<string, Record<string, string>> }> {
  const seenHeaders: Record<string, Record<string, string>> = {};
  const capture = (req: IncomingMessage) => {
    seenHeaders[req.url || ''] = {
      'x-brain-key': String(req.headers['x-brain-key'] || ''),
      'x-api-key': String(req.headers['x-api-key'] || ''),
      'x-provider-key': String(req.headers['x-provider-key'] || ''),
      authorization: String(req.headers.authorization || ''),
    };
  };
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    capture(req);
    if (req.method === 'GET' && req.url === '/api/fullkonk/providers') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ providers: [{ id: 'groq', name: 'Groq', hasKey: true, models: [{ id: 'llama', label: 'Llama' }] }] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/fullkonk/generate') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      });
      // 1. event deliberately split across TCP writes
      res.write('data: {"type":"sta');
      await sleep(40);
      res.write('ge","stage":"architect"}\n\n');
      // 2. two events coalesced into a single network write (LF)
      res.write('data: {"type":"provider","provider":"groq","model":"llama"}\n\ndata: {"type":"delta","content":"hi"}\n\n');
      await sleep(40);
      // 3. CRLF framing + file event
      res.write('data: {"type":"file","file":{"path":"src/a.ts","content":"x","language":"typescript"}}\r\n\r\n');
      // 4. failover / metrics / reset + a heartbeat comment
      res.write('data: {"type":"failover","from":"groq","to":"cerebras"}\n\n');
      res.write('data: {"type":"metrics","data":{"tokensPerSecond":10,"totalTokens":5,"provider":"cerebras"}}\n\n');
      res.write('data: {"type":"reset","characters":1}\n\n');
      res.write(': keepalive\n\n');
      await sleep(40);
      // 5. done + [DONE] sentinel
      res.write('data: {"type":"done"}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    if (req.method === 'POST' && req.url === '/api/ai') {
      const body = await readJson(req);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data: { content: 'pong', provider: 'gemini', model: body.taskType } }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/fullkonk/github/export') {
      const body = await readJson(req);
      res.writeHead(200, { 'content-type': 'application/json' });
      if ('token' in body) {
        res.end(JSON.stringify({ ok: false, error: 'token must never reach the gateway' }));
        return;
      }
      res.end(JSON.stringify({ ok: true, data: { success: true, filesUploaded: body.files.length, prUrl: 'https://github.test/o/r/pull/1', errors: [] } }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { server, url, seenHeaders };
}

async function startProxy(gatewayUrl: string, configOverrides: Partial<GatewayConfig> = {}) {
  const config: GatewayConfig = {
    gatewayUrl,
    gatewayApiKey: 'integration-api-key-0123456789',
    fullkonkKey: 'integration-brain-key-0123456789',
    ...configOverrides,
  };
  const handler = createGatewayHandler({ config });
  const proxy: Server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  return { baseUrl, close: () => new Promise<void>((resolve) => proxy.close(() => resolve())) };
}

describe('browser → Vercel proxy → Konkred Gateway (end-to-end with mock gateway)', () => {
  it('runs provider discovery, fragmented SSE generation, inference, and GitHub export', async () => {
    const gateway = await startMockGateway();
    const proxy = await startProxy(gateway.url);
    try {
      // ── providers ──────────────────────────────────────────────────────
      const providersRes = await fetch(`${proxy.baseUrl}/api/fullkonk/providers`, {
        headers: { 'x-brain-key': 'browser-spoof', 'x-api-key': 'browser-spoof' },
      });
      expect(providersRes.status).toBe(200);
      const providers = await providersRes.json();
      expect(providers.providers[0].id).toBe('groq');
      expect(gateway.seenHeaders['/api/fullkonk/providers']['x-brain-key']).toBe('integration-brain-key-0123456789');
      expect(gateway.seenHeaders['/api/fullkonk/providers']['x-api-key']).toBe('');

      // ── generation (fragmented SSE) ────────────────────────────────────
      const genRes = await fetch(`${proxy.baseUrl}/api/fullkonk/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-provider-key': 'gsk_byok', authorization: 'Bearer firebase-id-token' },
        body: JSON.stringify({ prompt: 'Build it', mode: 'fullstack', temperature: 0.4, maxTokens: 2048 }),
      });
      expect(genRes.status).toBe(200);
      expect(genRes.headers.get('content-type')).toContain('text/event-stream');
      expect(genRes.headers.get('cache-control')).toContain('no-transform');

      // Feed received bytes to the browser parser in deliberately tiny
      // slices so every kind of chunk boundary is exercised client-side too.
      const parser = new SSEParser();
      const types: string[] = [];
      const reader = genRes.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value, { stream: true });
        for (let i = 0; i < text.length; i += 4) {
          for (const item of parser.feed(text.slice(i, i + 4))) {
            if (item.kind === 'done') { types.push('sentinel-done'); continue; }
            if (item.kind === 'malformed') throw new Error('malformed frame in happy path');
            const parsed = parseStreamChunk(item.message.data);
            if (parsed.ok) types.push((parsed.value as StreamChunk).type);
          }
        }
      }
      for (const item of parser.flush()) {
        if (item.kind === 'message') {
          const parsed = parseStreamChunk(item.message.data);
          if (parsed.ok) types.push((parsed.value as StreamChunk).type);
        }
      }
      expect(types).toEqual([
        'stage', 'provider', 'delta', 'file', 'failover', 'metrics', 'reset', 'done', 'sentinel-done',
      ]);
      expect(gateway.seenHeaders['/api/fullkonk/generate']['x-brain-key']).toBe('integration-brain-key-0123456789');
      expect(gateway.seenHeaders['/api/fullkonk/generate']['x-provider-key']).toBe('gsk_byok');
      expect(gateway.seenHeaders['/api/fullkonk/generate'].authorization).toBe('Bearer firebase-id-token');

      // ── standard inference envelope ────────────────────────────────────
      const aiRes = await fetch(`${proxy.baseUrl}/api/ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'general', messages: [{ role: 'user', content: 'ping' }], maxTokens: 64, temperature: 0 }),
      });
      expect(aiRes.status).toBe(200);
      const ai = await aiRes.json();
      expect(ai).toMatchObject({ ok: true, data: { content: 'pong' } });
      expect(gateway.seenHeaders['/api/ai']['x-api-key']).toBe('integration-api-key-0123456789');
      expect(gateway.seenHeaders['/api/ai']['x-brain-key']).toBe('');

      // ── GitHub export: token stays out of the request entirely ─────────
      const exportRes = await fetch(`${proxy.baseUrl}/api/fullkonk/github/export`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: 'ghp_browser_token_should_be_dropped_0000000000',
          owner: 'octocat',
          repo: 'hello-world',
          branch: 'fullkonk-output',
          files: [{ path: 'src/a.ts', content: 'x', language: 'typescript' }],
        }),
      });
      expect(exportRes.status).toBe(200);
      const exported = await exportRes.json();
      expect(exported.ok).toBe(true);
      expect(exported.data.filesUploaded).toBe(1);
      expect(gateway.seenHeaders['/api/fullkonk/github/export']['x-brain-key']).toBe('integration-brain-key-0123456789');
    } finally {
      await proxy.close();
      await new Promise<void>((resolve) => gateway.server.close(() => resolve()));
    }
  }, 20_000);
});
