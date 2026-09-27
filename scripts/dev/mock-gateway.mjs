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
import { readFileSync } from 'node:fs';

const port = Number(process.argv[2] || 5055);

// The 15 workflow products, used only to answer POST /api/ai with an object
// that satisfies the requesting product's declared output schema. The content
// is obviously synthetic placeholder text — this mock knows nothing and
// asserts nothing. It exists so the run pipeline can be exercised offline.
const PRODUCTS = JSON.parse(readFileSync(new URL('../../catalog/product-manifest.json', import.meta.url), 'utf8')).products;

function sampleFor(prop, key) {
  if (!prop) return `sample ${key}`;
  switch (prop.type) {
    case 'string': return Array.isArray(prop.enum) && prop.enum.length ? prop.enum[0] : `SYNTHETIC placeholder for ${key}`;
    case 'number': return 1;
    case 'boolean': return true;
    case 'object': return { note: `SYNTHETIC placeholder for ${key}` };
    case 'array': {
      const items = prop.items;
      if (!items || typeof items !== 'object') return ['SYNTHETIC placeholder'];
      if (items.type === 'string') return [Array.isArray(items.enum) && items.enum.length ? items.enum[0] : 'SYNTHETIC placeholder'];
      if (items.type === 'number') return [1];
      if (items.type === 'boolean') return [true];
      const item = {};
      for (const [k, v] of Object.entries(items.properties || {})) item[k] = sampleFor(v, k);
      return [item];
    }
    default: return `SYNTHETIC placeholder for ${key}`;
  }
}

function minimalOutput(schema) {
  const out = {};
  for (const [key, prop] of Object.entries(schema.properties || {})) out[key] = sampleFor(prop, key);
  return out;
}

const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
});

const PROVIDERS = [
  { id: 'groq', name: 'Groq', hasKey: true, models: [{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' }] },
  { id: 'cerebras', name: 'Cerebras', hasKey: true, models: [{ id: 'llama3.1-8b', label: 'Llama 3.1 8B' }] },
  { id: 'google', name: 'Google AI Studio', hasKey: false, models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }] },
];

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];

  // Standard inference endpoint, mirroring the real gateway's contract:
  //   401 MISSING_API_KEY · 400 UNKNOWN_TASK_TYPE · 200 {ok,requestId,data,meta}
  if (path === '/api/ai' && req.method === 'POST') {
    if (!req.headers['x-api-key']) {
      return json(res, 401, { ok: false, error: { code: 'MISSING_API_KEY', message: 'x-api-key is required.' } });
    }
    const body = await readBody(req);
    const TASK_TYPES = ['general', 'code-generation', 'bug-fixing', 'architecture', 'summarization', 'translate', 'extraction'];
    if (body.taskType && !TASK_TYPES.includes(body.taskType)) {
      return json(res, 400, { ok: false, error: { code: 'UNKNOWN_TASK_TYPE', message: `Unknown taskType ${body.taskType}.` } });
    }
    // Identify the product by its system prompt so the reply fits its schema.
    const product = PRODUCTS.find((p) => p.prompt && body.systemPrompt === p.prompt);
    const content = product
      ? JSON.stringify(minimalOutput(product.outputSchema))
      : JSON.stringify({ note: 'SYNTHETIC placeholder from the mock gateway.' });
    return json(res, 200, {
      ok: true,
      requestId: `mock-${Date.now().toString(36)}`,
      data: {
        content,
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
      },
      meta: { cached: false, attempts: 1, mock: true },
    });
  }

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
