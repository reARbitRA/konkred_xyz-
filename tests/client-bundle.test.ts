import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Builds the actual browser bundle with Vite and asserts that no gateway
 * secret names, secret-bearing headers, server-only modules, or gateway hosts
 * leak into client JavaScript. Runs without any live credentials.
 */
const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

function buildClient(): string[] {
  execSync('npx vite build', { cwd: ROOT, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } });
  const assetsDir = path.join(DIST, 'assets');
  return fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js')).map((f) => path.join(assetsDir, f));
}

describe('production client bundle secret hygiene', () => {
  it('contains no gateway secret names, secret headers, or server proxy code', () => {
    const files = buildClient();
    expect(files.length).toBeGreaterThan(0);
    const forbidden = [
      'KONKRED_GATEWAY_API_KEY',
      'KONKRED_GATEWAY_URL',
      'FULLKONK_KEY',
      'BRAIN_URL',
      'BRAIN_KEY',
      'x-brain-key',
      'x-api-key',
      'GATEWAY_NOT_CONFIGURED',
      'gateway-proxy',
    ];
    const offenders: string[] = [];
    let bundle = '';
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      bundle += content;
      for (const token of forbidden) {
        if (content.includes(token)) offenders.push(`${path.basename(file)} → ${token}`);
      }
    }
    expect(offenders).toEqual([]);
    // Positive controls: same-origin uplinks are present.
    expect(bundle).toContain('/api/fullkonk/generate');
    expect(bundle).toContain('/api/fullkonk/providers');
    expect(bundle).toContain('/api/ai');
  }, 120_000);
});
