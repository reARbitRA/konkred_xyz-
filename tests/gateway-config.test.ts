import { describe, it, expect } from 'vitest';
import {
  GATEWAY_PATHS,
  isGatewayConfigured,
  normalizeGatewayUrl,
  readGatewayConfig,
  resolveUpstreamUrl,
} from '../server/gateway/config.ts';
import { redactSecrets } from '../server/gateway/http.ts';

/**
 * Configuration + SSRF unit tests for the gateway BFF. No network, no secrets:
 * every value below is a placeholder.
 */

describe('gateway configuration', () => {
  it('prefers the canonical KONKRED_GATEWAY_URL name', () => {
    const config = readGatewayConfig({
      KONKRED_GATEWAY_URL: 'https://gateway.example.com',
      GATEWAY_URL: 'https://wrong.example.com',
      BRAIN_URL: 'https://also-wrong.example.com',
    });
    expect(config.gatewayUrl).toBe('https://gateway.example.com');
    expect(isGatewayConfigured(config)).toBe(true);
  });

  it('keeps the legacy BRAIN_URL / BRAIN_KEY deployment working', () => {
    const config = readGatewayConfig({ BRAIN_URL: 'https://legacy.example.com/', BRAIN_KEY: 'brain-legacy' });
    expect(config.gatewayUrl).toBe('https://legacy.example.com');
    expect(config.fullkonkKey).toBe('brain-legacy');
  });

  it('reads credentials, auth flag, limits and timeouts from the environment', () => {
    const config = readGatewayConfig({
      KONKRED_GATEWAY_URL: 'https://gateway.example.com',
      KONKRED_GATEWAY_API_KEY: 'gw-key',
      FULLKONK_KEY: 'brain-key',
      FULLKONK_GITHUB_EXPORT_TOKEN: 'github_pat_placeholder',
      FULLKONK_REQUIRE_AUTH: 'true',
      FULLKONK_ALLOWED_ORIGINS: 'https://preview.example.com , https://www.konkred.xyz/',
      FULLKONK_MAX_BODY_BYTES: '65536',
      FULLKONK_STREAM_TIMEOUT_MS: '1000',
      FULLKONK_RATE_LIMIT_GENERATE_PER_MIN: '7',
      NODE_ENV: 'production',
    });
    expect(config.gatewayApiKey).toBe('gw-key');
    expect(config.fullkonkKey).toBe('brain-key');
    expect(config.githubExportToken).toBe('github_pat_placeholder');
    expect(config.requireAuth).toBe(true);
    expect(config.allowedOrigins).toEqual(['https://preview.example.com', 'https://www.konkred.xyz']);
    expect(config.maxBodyBytes).toBe(65536);
    // Stream timeout is clamped to stay below the 300s Vercel function limit.
    expect(config.streamTimeoutMs).toBe(5000);
    expect(config.rateLimits.generate).toBe(7);
    expect(config.legacyEngineFallback).toBe(false);
  });

  it('defaults to the in-repo engine outside production only', () => {
    expect(readGatewayConfig({ NODE_ENV: 'development' }).legacyEngineFallback).toBe(true);
    expect(readGatewayConfig({ NODE_ENV: 'production' }).legacyEngineFallback).toBe(false);
    expect(readGatewayConfig({ NODE_ENV: 'production', FULLKONK_LEGACY_ENGINE_FALLBACK: 'true' }).legacyEngineFallback).toBe(true);
  });

  it('does not alias the GitHub Models provider key into the export token', () => {
    const config = readGatewayConfig({ GITHUB_TOKEN: FAKE_GITHUB_TOKEN });
    expect(config.githubExportToken).toBe('');
  });

  it.each([
    ['not-a-url', ''],
    ['ftp://gateway.example.com', ''],
    ['javascript:alert(1)', ''],
    ['https://user:pass@gateway.example.com', ''],
    ['https://gateway.example.com/?redirect=evil', ''],
    ['//gateway.example.com', ''],
  ])('rejects unusable gateway URL %s', (value, expected) => {
    expect(normalizeGatewayUrl(value)).toBe(expected);
  });

  it('keeps a base path but drops the trailing slash', () => {
    expect(normalizeGatewayUrl('https://gateway.example.com/edge/')).toBe('https://gateway.example.com/edge');
  });
});

describe('SSRF guard', () => {
  const config = readGatewayConfig({ KONKRED_GATEWAY_URL: 'https://gateway.example.com' });

  it('only ever builds URLs from the fixed gateway paths', () => {
    expect(resolveUpstreamUrl(config, GATEWAY_PATHS.generate)).toBe('https://gateway.example.com/api/fullkonk/generate');
    expect(resolveUpstreamUrl(config, GATEWAY_PATHS.ai)).toBe('https://gateway.example.com/api/ai');
  });

  it.each(['//evil.example.com/x', '/http://evil.example.com', '/../../etc/passwd', 'http://evil.example.com'])(
    'refuses hostile path %s',
    (path) => {
      expect(() => resolveUpstreamUrl(config, path)).toThrow();
    },
  );

  it('refuses to build a URL when the gateway is not configured', () => {
    const empty = readGatewayConfig({});
    expect(() => resolveUpstreamUrl(empty, GATEWAY_PATHS.ai)).toThrow(/not configured/i);
  });
});

/**
 * Credential fixtures are assembled at runtime so this file never contains a
 * credential-shaped literal — tests/secrets.test.ts scans the repository for
 * exactly the patterns these strings mimic.
 */
const credential = (prefix: string, length: number): string => `${prefix}${'k'.repeat(length)}`;
const FAKE_GITHUB_TOKEN = credential('ghp_', 32);
const FAKE_OPENAI_KEY = credential('sk-', 24);

describe('secret redaction', () => {
  it('scrubs credential shapes from logs and error strings', () => {
    const samples = [
      credential('github_pat_', 24),
      FAKE_GITHUB_TOKEN,
      FAKE_OPENAI_KEY,
      credential('AIza', 35),
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
      'x-api-key=super-secret-gateway-key',
      'rediss://default:supersecretpassword@redis.example.com:6379',
    ];
    for (const sample of samples) {
      const redacted = redactSecrets(`failure: ${sample}`);
      expect(redacted).not.toContain(sample);
      expect(redacted).toContain('REDACTED');
    }
  });

  it('leaves ordinary messages untouched', () => {
    expect(redactSecrets('Gateway returned HTTP 503')).toBe('Gateway returned HTTP 503');
  });
});
