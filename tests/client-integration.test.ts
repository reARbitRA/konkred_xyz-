import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Frontend integration guarantees (static, dependency-free):
 *  - the browser bundle never names gateway secrets, secret-bearing headers
 *    or a gateway host — all uplinks are same-origin relative URLs;
 *  - client code cannot import the server-only proxy module;
 *  - generation/export cannot be double-submitted while a request is active;
 *  - the GitHub modal never collects or transmits a token.
 */
const ROOT = process.cwd();
const CLIENT_DIRS = ['App.tsx', 'index.tsx', 'pages', 'components', 'contexts', 'hooks', 'utils', 'services', 'lib', 'catalog'];

function walk(dir: string, cb: (file: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else if (/\.(ts|tsx)$/.test(entry.name)) cb(full);
  }
}

function collect(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  for (const entry of CLIENT_DIRS) {
    const p = path.join(ROOT, entry);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) walk(p, (file) => out.push({ file, source: fs.readFileSync(file, 'utf8') }));
    else out.push({ file: p, source: fs.readFileSync(p, 'utf8') });
  }
  // The server-only proxy and the Vercel entry are never client modules.
  return out.filter(({ file }) => !file.includes(path.join('server', 'gateway-proxy.ts')) && !file.includes(path.join('api', 'index.ts')));
}

const CLIENT = collect();

describe('client gateway integration', () => {
  it('never references gateway secret variable names or secret-bearing headers', () => {
    const forbidden = [
      'KONKRED_GATEWAY_API_KEY',
      'KONKRED_GATEWAY_URL',
      'FULLKONK_KEY',
      'BRAIN_URL',
      'BRAIN_KEY',
      'x-brain-key',
      'x-api-key',
    ];
    const offenders: string[] = [];
    for (const { file, source } of CLIENT) {
      for (const token of forbidden) {
        if (source.includes(token)) offenders.push(`${file} → ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never imports the server-only proxy or Vercel function', () => {
    const offenders: string[] = [];
    for (const { file, source } of CLIENT) {
      if (/from\s+['"][^'"]*(server\/gateway-proxy|api\/index)/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('talks to the gateway only through same-origin relative /api URLs', () => {
    const page = fs.readFileSync(path.join(ROOT, 'pages/FullKonkPage.tsx'), 'utf8');
    expect(page).toContain("fetch('/api/fullkonk/providers'");
    expect(page).toContain("fetch('/api/fullkonk/generate'");
    expect(page).not.toMatch(/https?:\/\/[a-z0-9.-]+\/api\/fullkonk/);
    const gatewayClient = fs.readFileSync(path.join(ROOT, 'services/gateway.ts'), 'utf8');
    expect(gatewayClient).toContain("fetch('/api/ai'");
  });

  it('prevents duplicate generation submissions while streaming', () => {
    const page = fs.readFileSync(path.join(ROOT, 'pages/FullKonkPage.tsx'), 'utf8');
    expect(page).toMatch(/if\s*\(!prompt\s*\|\|\s*streaming\)\s*return/);
    // controls are disabled while streaming
    expect(page).toMatch(/disabled=\{streaming\}/);
    // an abort controller exists for cancellation
    expect(page).toContain('AbortController');
  });

  it('GitHub export never collects or sends a browser token', () => {
    const modal = fs.readFileSync(path.join(ROOT, 'components/fullkonk/GitHubExportModal.tsx'), 'utf8');
    expect(modal).not.toContain('ghp_');
    expect(modal).not.toContain('setToken');
    expect(modal).not.toContain('token:');
    expect(modal).toContain('normalizeGitHubExportResult');
    expect(modal).toMatch(/if\s*\(loading\)\s*return/);
  });

  it('uses the hardened SSE parser on the generation stream', () => {
    const page = fs.readFileSync(path.join(ROOT, 'pages/FullKonkPage.tsx'), 'utf8');
    expect(page).toContain('new SSEParser()');
    expect(page).toContain("item.kind === 'done'");
    expect(page).toContain("item.kind === 'malformed'");
  });
});
