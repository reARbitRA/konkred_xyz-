/**
 * BFF router — the Vercel function's front door for gateway-owned routes.
 *
 * Deployment shape (discovered during the repository audit): this repo is a Vite
 * SPA plus a single Vercel Node.js function (`api/index.ts`, see vercel.json).
 * It is not a Next.js project, so there is no `app/api/**\/route.ts` tree. These
 * modules are the equivalent route files: each route owns one URL, and
 * `api/index.ts` (plus the local dev server) dispatches into them.
 *
 *   GET  /api/fullkonk/providers      → gateway provider discovery
 *   POST /api/fullkonk/generate       → gateway SSE generation (streamed)
 *   POST /api/fullkonk/github/export  → gateway GitHub export
 *   POST /api/ai                      → gateway standard inference
 *   POST /api/ai/generate             → legacy-shaped inference (compat shim)
 *
 * `handleGatewayRequest` returns `false` when a request is not owned by the BFF
 * (unknown path, or the gateway is unconfigured and the legacy in-repo engine is
 * allowed to serve it), which lets `api/index.ts` fall through unchanged.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isGatewayConfigured, readGatewayConfig } from './config';
import { handleProviders } from './routes/providers';
import { handleGenerate } from './routes/generate';
import { handleGitHubExport } from './routes/github-export';
import { handleAi, handleLegacyAiGenerate } from './routes/ai';
import { fail, log, sendFailure } from './http';

export type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

export interface GatewayRoute {
  method: string;
  path: string;
  handler: RouteHandler;
  /** Does the in-repo Express app also serve this path (fallback owner)? */
  legacyEquivalent: boolean;
  /** What the route does — surfaced in the diagnostics response. */
  description: string;
}

export const GATEWAY_ROUTES: readonly GatewayRoute[] = Object.freeze([
  {
    method: 'GET',
    path: '/api/fullkonk/providers',
    handler: handleProviders,
    legacyEquivalent: true,
    description: 'Provider discovery proxy (x-brain-key injected server-side).',
  },
  {
    method: 'POST',
    path: '/api/fullkonk/generate',
    handler: handleGenerate,
    legacyEquivalent: true,
    description: 'SSE generation proxy — streamed, never buffered.',
  },
  {
    method: 'POST',
    path: '/api/fullkonk/github/export',
    handler: handleGitHubExport,
    legacyEquivalent: true,
    description: 'GitHub export proxy — token stays server-side.',
  },
  {
    method: 'POST',
    path: '/api/ai',
    handler: handleAi,
    legacyEquivalent: false,
    description: 'Standard inference proxy (x-api-key injected server-side).',
  },
  {
    method: 'POST',
    path: '/api/ai/generate',
    handler: handleLegacyAiGenerate,
    legacyEquivalent: true,
    description: 'Legacy /api/ai/generate shim normalised onto the gateway contract.',
  },
]);

const GATEWAY_OWNED_PATHS = new Set(GATEWAY_ROUTES.map((route) => route.path));

export const isGatewayOwnedPath = (pathname: string): boolean => GATEWAY_OWNED_PATHS.has(pathname);

/**
 * Handles gateway-owned routes.
 * @returns true when the request was answered here (or rejected with a
 *          configuration error); false when the caller should fall through to
 *          the legacy application.
 */
export const handleGatewayRequest = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
  const pathname = normalizePath(req.url);
  const route = GATEWAY_ROUTES.find((candidate) => candidate.path === pathname && candidate.method === req.method)
    ?? GATEWAY_ROUTES.find((candidate) => candidate.path === pathname);

  if (!route) return false;

  const config = readGatewayConfig();

  if (!isGatewayConfigured(config)) {
    // No gateway on this deployment. Local development keeps the in-repo engine
    // (and its BYOK flow); production fails loudly instead of silently serving a
    // different brain than the operator configured.
    if (config.legacyEngineFallback && route.legacyEquivalent) {
      log.warn('bff.router', `gateway not configured — delegating ${route.path} to the in-repo engine`);
      return false;
    }
    sendFailure(
      res,
      fail(
        503,
        'GATEWAY_NOT_CONFIGURED',
        'The Konkred Gateway is not configured on this deployment. Set KONKRED_GATEWAY_URL (and FULLKONK_KEY) in the Vercel environment.',
      ),
    );
    return true;
  }

  if (req.method !== route.method) {
    await route.handler(req, res); // the handler answers 405 with an Allow header
    return true;
  }

  await route.handler(req, res);
  return true;
};

const normalizePath = (url: string | undefined): string => {
  const raw = (url ?? '/').split('?')[0].split('#')[0];
  if (raw.length > 1 && raw.endsWith('/')) return raw.replace(/\/+$/, '') || '/';
  return raw || '/';
};

/** Non-secret diagnostics used by tests and by the deployment smoke check. */
export const describeGatewayRoutes = (): { path: string; method: string; legacyEquivalent: boolean }[] =>
  GATEWAY_ROUTES.map(({ path, method, legacyEquivalent }) => ({ path, method, legacyEquivalent }));

export default handleGatewayRequest;
