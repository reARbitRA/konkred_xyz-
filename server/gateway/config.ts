/**
 * Server-only configuration for the Konkred Gateway backend-for-frontend (BFF).
 *
 * Everything in this file runs on the Vercel Node.js function (or the local dev
 * server) — never in the browser. It reads the gateway location and credentials
 * exclusively from server environment variables so that:
 *
 *   • the browser can never choose an upstream host (SSRF guard), and
 *   • no gateway/provider credential is ever serialized to a client.
 *
 * Naming: KONKRED_GATEWAY_* / FULLKONK_KEY are the canonical names. The legacy
 * names already deployed (BRAIN_URL / BRAIN_KEY) and the generic ones
 * (GATEWAY_URL / GATEWAY_API_KEY) keep working as documented aliases.
 */

export interface GatewayRateLimits {
  /** Requests per minute per caller for the SSE generation route. */
  generate: number;
  /** Requests per minute per caller for the standard inference route. */
  ai: number;
  /** Requests per minute per caller for the GitHub export route. */
  export: number;
  /** Requests per minute per caller for provider discovery. */
  providers: number;
}

export interface GatewayConfig {
  /** Gateway origin, no trailing slash. Empty string when not configured. */
  gatewayUrl: string;
  /** Shared secret for POST /api/ai (forwarded as x-api-key). */
  gatewayApiKey: string;
  /** fullKONK brain shared secret (forwarded as x-brain-key). */
  fullkonkKey: string;
  /**
   * Optional server-owned GitHub token for the export route. When set, the
   * browser can never inject its own token on a deployment.
   */
  githubExportToken: string;
  /** When true, gateway routes require a verified Firebase ID token. */
  requireAuth: boolean;
  /** Extra browser origins allowed to call the BFF (same-origin is always ok). */
  allowedOrigins: string[];
  /**
   * When the gateway is not configured, delegate /api/fullkonk/* to the
   * in-repo legacy engine instead of returning a configuration error. Defaults
   * to true outside production so local development keeps working unchanged.
   */
  legacyEngineFallback: boolean;
  maxBodyBytes: number;
  connectTimeoutMs: number;
  idleTimeoutMs: number;
  streamTimeoutMs: number;
  maxUpstreamErrorBytes: number;
  rateLimits: GatewayRateLimits;
  nodeEnv: string;
  /** Service account JSON for Firebase ID-token verification (server-only). */
  firebaseServiceAccountJson: string;
  firebaseProjectId: string;
}

/* Vercel Node.js functions cap the request body at ~4.5 MB; the gateway's own
 * REQUEST_BODY_LIMIT_BYTES defaults to 2 MB, so we mirror the tighter value. */
const HARD_MAX_BODY_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

const firstDefined = (env: NodeJS.ProcessEnv, names: string[]): string => {
  for (const name of names) {
    const value = env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const intEnv = (env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(env[name] ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const boolEnv = (env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean => {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
};

/**
 * Accept only an absolute http(s) origin. Anything else (javascript:, file:,
 * data:, credentials-in-URL, protocol-relative) is rejected and treated as
 * "not configured" so a bad value can never become a live upstream.
 */
export const normalizeGatewayUrl = (value: string): string => {
  const candidate = (value || '').trim();
  if (!candidate) return '';
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.username || url.password) return '';
  if (url.search || url.hash) return '';
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
};

/** Reads the BFF configuration. Pure — safe to call per request and in tests. */
export const readGatewayConfig = (env: NodeJS.ProcessEnv = process.env): GatewayConfig => {
  const nodeEnv = firstDefined(env, ['NODE_ENV']) || 'development';
  const isProduction = nodeEnv === 'production';
  const rawUrl = firstDefined(env, ['KONKRED_GATEWAY_URL', 'GATEWAY_URL', 'BRAIN_URL']);

  return {
    gatewayUrl: normalizeGatewayUrl(rawUrl),
    gatewayApiKey: firstDefined(env, ['KONKRED_GATEWAY_API_KEY', 'GATEWAY_API_KEY', 'BRAIN_API_KEY']),
    fullkonkKey: firstDefined(env, ['FULLKONK_KEY', 'BRAIN_KEY', 'FULLKONK_BRAIN_KEY']),
    // Deliberately NOT aliased to GITHUB_TOKEN: that variable is a provider
    // credential for GitHub Models in this deployment and must not silently
    // become a repository write token.
    githubExportToken: firstDefined(env, ['FULLKONK_GITHUB_EXPORT_TOKEN']),
    requireAuth: boolEnv(env, 'FULLKONK_REQUIRE_AUTH', false),
    allowedOrigins: firstDefined(env, ['FULLKONK_ALLOWED_ORIGINS'])
      .split(/[\s,;]+/)
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    // Explicit setting wins; otherwise production fails loudly, dev keeps the
    // in-repo engine so BYOK local development is unchanged.
    legacyEngineFallback: boolEnv(env, 'FULLKONK_LEGACY_ENGINE_FALLBACK', !isProduction),
    maxBodyBytes: intEnv(env, 'FULLKONK_MAX_BODY_BYTES', DEFAULT_MAX_BODY_BYTES, 1024, HARD_MAX_BODY_BYTES),
    connectTimeoutMs: intEnv(env, 'FULLKONK_CONNECT_TIMEOUT_MS', 20_000, 1_000, 120_000),
    idleTimeoutMs: intEnv(env, 'FULLKONK_IDLE_TIMEOUT_MS', 90_000, 1_000, 300_000),
    streamTimeoutMs: intEnv(env, 'FULLKONK_STREAM_TIMEOUT_MS', 280_000, 5_000, 290_000),
    maxUpstreamErrorBytes: intEnv(env, 'FULLKONK_MAX_ERROR_BYTES', 256 * 1024, 1024, 1024 * 1024),
    rateLimits: {
      generate: intEnv(env, 'FULLKONK_RATE_LIMIT_GENERATE_PER_MIN', 30, 0, 10_000),
      ai: intEnv(env, 'FULLKONK_RATE_LIMIT_AI_PER_MIN', 60, 0, 10_000),
      export: intEnv(env, 'FULLKONK_RATE_LIMIT_EXPORT_PER_MIN', 10, 0, 10_000),
      providers: intEnv(env, 'FULLKONK_RATE_LIMIT_PROVIDERS_PER_MIN', 120, 0, 10_000),
    },
    nodeEnv,
    firebaseServiceAccountJson: firstDefined(env, ['FIREBASE_SERVICE_ACCOUNT_JSON']),
    firebaseProjectId: firstDefined(env, ['FIREBASE_PROJECT_ID', 'GCLOUD_PROJECT']),
  };
};

export const isGatewayConfigured = (config: GatewayConfig): boolean => Boolean(config.gatewayUrl);

/**
 * Builds the upstream URL. The path is always one of the fixed constants below
 * — request data can never influence the destination host or path.
 */
export const resolveUpstreamUrl = (config: GatewayConfig, path: string): string => {
  if (!isGatewayConfigured(config)) throw new Error('KONKRED_GATEWAY_URL is not configured.');
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || path.includes('..')) {
    throw new Error('Upstream path must be a fixed, absolute gateway path.');
  }
  return `${config.gatewayUrl}${path}`;
};

export const GATEWAY_PATHS = Object.freeze({
  ai: '/api/ai',
  models: '/api/models',
  providers: '/api/fullkonk/providers',
  generate: '/api/fullkonk/generate',
  githubExport: '/api/fullkonk/github/export',
});

/** Routes owned by this BFF. Everything else falls through to the legacy app. */
export const BFF_ROUTES = Object.freeze([
  { method: 'GET', path: '/api/fullkonk/providers' },
  { method: 'POST', path: '/api/fullkonk/generate' },
  { method: 'POST', path: '/api/fullkonk/github/export' },
  { method: 'POST', path: '/api/ai' },
  { method: 'POST', path: '/api/ai/generate' },
] as const);

export default readGatewayConfig;
