/**
 * Vercel Node.js serverless entry point for konkred.xyz.
 *
 * Routing (see vercel.json rewrites; every /api/* request lands here):
 *
 *   GET  /api/fullkonk/providers        ┐
 *   POST /api/fullkonk/generate (SSE)   ├─ securely proxied to the Konkred
 *   POST /api/fullkonk/github/export    │  AI Ecosystem Gateway (env-only URL,
 *   POST /api/ai                        ┘  x-brain-key / x-api-key added here)
 *
 *   every other /api/*                 → the bundled legacy Express app
 *                                        (lib/fullkonk-server.cjs): Firebase
 *                                        auth/session/analytics routes,
 *                                        /api/ai/generate, OAuth, demo, etc.
 *
 * The browser only ever calls same-origin /api routes. No provider key,
 * gateway key, FULLKONK_KEY or GitHub token is ever exposed to the client.
 */
import type { Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { configFromEnv, createGatewayHandler, defaultLogger } from '../server/gateway-proxy';

// Runtime: Node.js (Express + streaming require it; this is not an Edge function).
export const config = {
  runtime: 'nodejs',
};

let legacyAppPromise: Promise<Express> | undefined;

const legacyApp = (): Promise<Express> => {
  legacyAppPromise ||= import('../lib/fullkonk-server.cjs').then((module) => {
    const createApp = module.createApp || module.default?.createApp;
    if (typeof createApp !== 'function') throw new Error('Bundled server did not export createApp.');
    return createApp();
  });
  return legacyAppPromise;
};

const fallback = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  try {
    const app = await legacyApp();
    return void app(request, response);
  } catch (error) {
    legacyAppPromise = undefined;
    defaultLogger('error.legacy_init', { name: (error as Error)?.name || 'Error' });
    response.statusCode = 500;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify({ error: 'Server initialization failed.' }));
  }
};

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  // Read env per invocation so Vercel environment changes (and tests of missing
  // configuration) never require a cold start.
  let gatewayHandler;
  try {
    gatewayHandler = createGatewayHandler({ config: configFromEnv(process.env), fallback, log: defaultLogger });
  } catch (error) {
    defaultLogger('error.invalid_config', { name: (error as Error)?.name || 'Error' });
    response.statusCode = 503;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify({ error: 'The Konkred Gateway integration is misconfigured on this deployment.' }));
    return;
  }
  await gatewayHandler(request, response);
}
