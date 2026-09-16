/**
 * konkred.xyz Vercel Node.js function — the server-side edge for /fullkonk.
 *
 * Request flow (see docs/fullkonk/GATEWAY_INTEGRATION.md):
 *
 *   browser → this function (same-origin) → Konkred Gateway (Render/VM) → providers
 *
 *   1. Gateway-owned routes (`/api/fullkonk/providers`, `/api/fullkonk/generate`,
 *      `/api/fullkonk/github/export`, `/api/ai`, `/api/ai/generate`) are handled
 *      by server/gateway/router.ts, which injects x-brain-key / x-api-key from
 *      server-only environment variables and streams SSE responses untouched.
 *   2. Everything else (`/api/demo/run`, `/api/auth/github/*`, `/api/health`,
 *      `/api/fullkonk/{health,sessions,usage,analytics,optimize-prompt}` …) is
 *      served by the bundled in-repo Express app, unchanged.
 *
 * No gateway, provider, GitHub or Redis credential is ever sent to the browser
 * from this file.
 */
import type { Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGatewayRequest } from '../server/gateway/router';
import { log, redactSecrets, sendJson } from '../server/gateway/http';

let legacyAppPromise: Promise<Express> | undefined;

const legacyApp = (): Promise<Express> => {
  legacyAppPromise ||= import('../lib/fullkonk-server.cjs').then((module) => {
    const createApp = module.createApp || module.default?.createApp;
    if (typeof createApp !== 'function') throw new Error('Bundled server did not export createApp.');
    return createApp();
  });
  return legacyAppPromise;
};

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    if (await handleGatewayRequest(request, response)) return;
  } catch (error) {
    // A failure inside the BFF must never surface internals or a fake success.
    log.error('bff.entry', 'gateway route failed', {
      detail: redactSecrets(error instanceof Error ? error.stack ?? error.message : String(error)),
    });
    if (!response.headersSent && !response.writableEnded) {
      sendJson(response, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: 'The platform API failed to process this request.' } });
    } else if (!response.writableEnded) {
      response.end();
    }
    return;
  }

  try {
    const app = await legacyApp();
    return void app(request, response);
  } catch (error) {
    legacyAppPromise = undefined;
    log.error('bff.entry', 'legacy server initialization failed', {
      detail: redactSecrets(error instanceof Error ? error.message : String(error)),
    });
    sendJson(response, 500, { error: 'Server initialization failed.' });
  }
}
