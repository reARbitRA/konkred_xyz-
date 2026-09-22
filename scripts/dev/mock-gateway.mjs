/**
 * Local stand-in for the Konkred AI Ecosystem Gateway.
 *
 * Development and verification aid ONLY — it is never imported by the website,
 * never bundled, and holds no credentials. It implements just enough of the
 * real contract (health, readiness, provider discovery, SSE generation) to
 * exercise the Vercel proxy's success, failure and streaming paths offline.
 *
 * Usage: node scripts/dev/mock-gateway.mjs [port]
 */
import http from 'node:http';

const port = Number(process.argv[2] || 5055);

const PROVIDERS = [
  { id: 'groq', name: 'Groq', hasKey: true, models: [{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' }] },
  { id: 'cerebras', name: 'Cerebras', hasKey: true, models: [{ id: 'llama3.1-8b', label: 'Llama 3.1 8B' }] },
  { id: 'google', name: 'Google AI Studio', hasKey: false, models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }] },
];

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];

  if (path === '/api/health') return json(res, 200, { status: 'ok', service: 'konkred-gateway-mock' });
  if (path === '/api/ready') return json(res, 200, { status: 'ok', providers: PROVIDERS.filter(p => p.hasKey).length });
  if (path === '/api/fullkonk/providers') return json(res, 200, { providers: PROVIDERS });

  if (path === '/api/fullkonk/generate') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('stage', { type: 'stage', stage: 'planning', text: 'Planning the build' });
    send('provider', { type: 'provider', provider: 'groq', model: 'llama-3.3-70b-versatile' });
    let sent = 0;
    const chunks = ['# Demo\n', '```ts\n', '// src/index.ts\n', 'export const hello = () => "world";\n', '```\n'];
    const timer = setInterval(() => {
      if (sent >= chunks.length) {
        clearInterval(timer);
        send('metrics', { type: 'metrics', totalTokens: 42, tokensPerSecond: 21 });
        send('done', { type: 'done' });
        return res.end();
      }
      send('delta', { type: 'delta', content: chunks[sent++] });
    }, 60);
    req.on('close', () => clearInterval(timer));
    return undefined;
  }

  if (path === '/api/fullkonk/github/export') return json(res, 200, { ok: true, url: 'https://github.com/example/demo', written: 1 });

  return json(res, 404, { error: 'Not found in mock gateway.' });
}).listen(port, '127.0.0.1', () => console.log(`mock gateway on http://127.0.0.1:${port}`));
