import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Front-end integration guarantees for /fullkonk.
 *
 * These are source/bundle-level assertions (this repo has no DOM test stack, so
 * the stream itself is exercised in tests/gateway-proxy.test.ts against a real
 * mocked gateway). They prove that the browser only ever talks to same-origin
 * Vercel routes and that no backend secret can reach the client.
 */
const ROOT = process.cwd();
const PAGE = path.join(ROOT, 'pages/FullKonkPage.tsx');
const EXPORT_MODAL = path.join(ROOT, 'components/fullkonk/GitHubExportModal.tsx');
const CHAT_PANEL = path.join(ROOT, 'components/fullkonk/ChatPanel.tsx');

const read = (file: string): string => fs.readFileSync(file, 'utf8');

const CLIENT_DIRS = ['App.tsx', 'pages', 'components', 'contexts', 'hooks', 'utils', 'services', 'lib', 'catalog', 'content', 'constants.ts', 'index.tsx', 'types.ts'];

const collectClientSource = (): string => {
  let out = '';
  const walk = (target: string): void => {
    const full = path.join(ROOT, target);
    if (!fs.existsSync(full)) return;
    if (fs.statSync(full).isDirectory()) {
      for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(target, entry.name));
        else if (/\.(ts|tsx)$/.test(entry.name)) out += fs.readFileSync(path.join(full, entry.name), 'utf8') + '\n';
      }
      return;
    }
    out += fs.readFileSync(full, 'utf8') + '\n';
  };
  for (const entry of CLIENT_DIRS) walk(entry);
  return out;
};

describe('fullKONK client wiring', () => {
  it('loads providers and starts generation through same-origin routes', () => {
    const page = read(PAGE);
    expect(page).toContain("fetch('/api/fullkonk/providers'");
    expect(page).toContain("fetch('/api/fullkonk/generate'");
    expect(page).not.toContain('KONKRED_GATEWAY_URL');
    expect(page).not.toContain('BRAIN_URL');
    expect(page).not.toContain('BRAIN_KEY');
    expect(page).not.toContain('FULLKONK_KEY');
  });

  it('never builds an absolute gateway/provider URL in browser code', () => {
    const source = collectClientSource();
    // Client code must not hardcode gateway/provider endpoints it would call
    // directly: everything goes through /api/* on the same origin.
    expect(source).not.toMatch(/fetch\(\s*['"`]https?:\/\/(?!github\.com|api\.github\.com)/);
    expect(source).not.toMatch(/https?:\/\/[^\s'"`]*(?:konkred-gateway|onrender\.com)/i);
  });

  it('uses no public-prefixed secret variables', () => {
    const source = collectClientSource();
    expect(source).not.toMatch(/import\.meta\.env\.VITE_(?:GATEWAY|BRAIN|FULLKONK|GEMINI|OPENAI|ANTHROPIC|GITHUB)/);
    expect(source).not.toMatch(/process\.env\.NEXT_PUBLIC_/);
  });

  it('guards against duplicate submissions, supports cancellation and cannot update state after unmount', () => {
    const page = read(PAGE);
    expect(page).toMatch(/if \(!prompt \|\| streaming \|\| abortRef\.current\) return;/);
    expect(page).toContain('abortRef.current?.abort()');
    expect(page).toContain('mountedRef.current = false');
    expect(page).toMatch(/if \(!mountedRef\.current\) return;/);
    // Cancellation still wires the STOP control to the in-flight request.
    expect(page).toContain('onStop={() => abortRef.current?.abort()}');
  });

  it('preserves loading, progress, provider, failover, metrics, done and error rendering', () => {
    const page = read(PAGE);
    for (const marker of ['setStage', 'setStageText', 'setMetrics', 'setFiles', 'setStreaming']) {
      expect(page).toContain(marker);
    }
    const pipeline = read(path.join(ROOT, 'components/fullkonk/PipelineStatus.tsx'));
    for (const label of ['ARCHITECT', 'FRONTEND', 'BACKEND', 'VERIFY', 'TEST', 'COMPLETE', 'ERROR']) {
      expect(pipeline).toContain(label);
    }
    expect(page).toContain('RetryablePipelineError');
    expect(page).toContain('retry-after');
  });

  it('parses the stream with the shared parser instead of ad-hoc chunk splitting', () => {
    const page = read(PAGE);
    expect(page).toContain("import { SseParser, decodeStreamChunk } from '../utils/sse'");
    expect(page).toContain('parser.push(text)');
    expect(page).not.toContain("pending.split('\\n\\n')");
  });

  it('surfaces Retry-After from the gateway on rate-limited generation', () => {
    const page = read(PAGE);
    expect(page).toContain("response.headers.get('retry-after')");
    expect(page).toContain('Retry in');
  });

  it('keeps the AI Studio style provider probe resilient to gateway outages', () => {
    const page = read(PAGE);
    const probeStart = page.indexOf("fetch('/api/fullkonk/providers'");
    expect(probeStart).toBeGreaterThan(-1);
    const probe = page.slice(probeStart, probeStart + 1200);
    expect(probe).toContain('.catch(');
    // A failed probe must never be reported as "no providers configured".
    expect(probe).toContain('never claim');
  });
});

describe('GitHub export modal', () => {
  it('sends the user’s token only to the same-origin export route', () => {
    const modal = read(EXPORT_MODAL);
    expect(modal).toContain("fetch('/api/fullkonk/github/export'");
    expect(modal).not.toMatch(/api\.github\.com/);
    expect(modal).not.toContain('localStorage');
    expect(modal).not.toContain('sessionStorage');
  });

  it('attaches the Firebase session token when the user is signed in', () => {
    const modal = read(EXPORT_MODAL);
    expect(modal).toContain('getIdToken');
    expect(modal).toContain('Authorization');
  });

  it('clears the token from component state when the modal closes', () => {
    const modal = read(EXPORT_MODAL);
    expect(modal).toMatch(/setToken\(''\)/);
  });
});

describe('production client bundle', () => {
  const assetsDir = path.join(ROOT, 'dist/assets');
  const assets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter((file) => file.endsWith('.js')) : [];

  it.skipIf(assets.length === 0)('ships no gateway URL, credential name or provider key to the browser', () => {
    const banned = [
      'KONKRED_GATEWAY_URL', 'KONKRED_GATEWAY_API_KEY', 'FULLKONK_KEY', 'BRAIN_URL', 'BRAIN_KEY',
      'FULLKONK_GITHUB_EXPORT_TOKEN', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'CLOUDFLARE_API_TOKEN',
      'FULLKONK_REQUIRE_AUTH', 'FIREBASE_SERVICE_ACCOUNT_JSON',
    ];
    for (const file of assets) {
      const bundle = fs.readFileSync(path.join(assetsDir, file), 'utf8');
      for (const marker of banned) {
        expect(bundle, `${file} must not reference ${marker}`).not.toContain(marker);
      }
      expect(bundle).not.toMatch(/sk-[A-Za-z0-9]{24,}|gh[pousr]_[A-Za-z0-9]{30,}/);
    }
  });

  it.skipIf(assets.length === 0)('contains no absolute gateway hostname', () => {
    for (const file of assets) {
      const bundle = fs.readFileSync(path.join(assetsDir, file), 'utf8');
      expect(bundle).not.toMatch(/onrender\.com|konkred-gateway|KONKRED_GATEWAY/i);
    }
  });
});

describe('gateway connectivity in the client source', () => {
  it('uses only /api/fullkonk and /api/ai paths', () => {
    const page = read(PAGE);
    const chat = read(CHAT_PANEL);
    const calledPaths = [...`${page}\n${chat}`.matchAll(/fetch\('([^']+)'/g)].map((match) => match[1]);
    for (const target of calledPaths) expect(target.startsWith('/api/')).toBe(true);
  });
});
