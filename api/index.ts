/**
 * konkred.xyz edge proxy — makes the Konkred AI ecosystem the brain of /fullkonk.
 *   /api/fullkonk/*  → streamed to BRAIN_URL (the deployed gateway), authed by BRAIN_KEY.
 *   any other /api/* → the template's original bundled server (unchanged).
 */
import type { Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';

const BRAIN_URL = (process.env.BRAIN_URL || '').replace(/\/+$/, '');
const BRAIN_KEY = process.env.BRAIN_KEY || '';

let legacyAppPromise: Promise<Express> | undefined;

const legacyApp = (): Promise<Express> => {
  legacyAppPromise ||= import('../lib/fullkonk-server.cjs').then((module) => {
    const createApp = module.createApp || module.default?.createApp;
    if (typeof createApp !== 'function') throw new Error('Bundled server did not export createApp.');
    return createApp();
  });
  return legacyAppPromise;
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(data));
  });

const json = (res: ServerResponse, status: number, payload: unknown): void => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = request.url || '/';
  if (!url.startsWith('/api/fullkonk/')) {
    try {
      const app = await legacyApp();
      return void app(request, response);
    } catch (error) {
      legacyAppPromise = undefined;
      return json(response, 500, { error: error instanceof Error ? error.message : 'Server initialization failed.' });
    }
  }

  if (!BRAIN_URL) return json(response, 503, { error: 'BRAIN_URL is not configured on this Vercel project.' });

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (BRAIN_KEY) headers['x-brain-key'] = BRAIN_KEY;
  const providerKey = request.headers['x-provider-key'];
  if (providerKey) headers['x-provider-key'] = String(providerKey);
  const authorization = request.headers.authorization;
  if (authorization) headers.authorization = String(authorization);

  const body = request.method === 'POST' || request.method === 'PUT' ? await readBody(request) : undefined;
  try {
    const upstream = await fetch(BRAIN_URL + url, { method: request.method || 'GET', headers, body });
    response.statusCode = upstream.status;
    response.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-cache, no-transform');
    response.setHeader('x-accel-buffering', 'no');
    if (!upstream.body) { response.end(); return; }
    const reader = upstream.body.getReader();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value) response.write(Buffer.from(chunk.value));
    }
    response.end();
  } catch (error) {
    json(response, 502, { error: error instanceof Error ? error.message : 'Brain unreachable' });
  }
}
