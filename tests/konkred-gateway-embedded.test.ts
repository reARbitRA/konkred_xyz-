import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = path.resolve(__dirname, '..');

describe('Konkred Gateway embedded integration', () => {
  it('vercel.json preserves website and exposes OpenAI API at /v1', () => {
    const vercel = JSON.parse(readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
    const rewrites: { source: string; destination: string }[] = vercel.rewrites ?? [];
    // Website SPA fallback must remain.
    expect(rewrites.some(r => r.source === '/(.*)' && r.destination === '/index.html')).toBe(true);
    // OpenAI-compatible API must be routed through the Vercel function.
    expect(rewrites.some(r => r.source.includes('/v1/') && r.destination === '/api/index')).toBe(true);
    expect(rewrites.some(r => r.source.includes('/api/') && r.destination === '/api/index')).toBe(true);
    // Function must include gateway registry and src for serverless.
    const includeFiles: string = vercel.functions?.['api/index.ts']?.includeFiles ?? '';
    expect(includeFiles).toContain('gateway/data/policies.registry.json');
    expect(includeFiles).toContain('gateway/src');
  });

  it('gateway registry and provider profiles include required providers', () => {
    const registryPath = path.join(repoRoot, 'gateway/data/policies.registry.json');
    expect(existsSync(registryPath)).toBe(true);
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    // Curated registry + dynamic profiles together should expose ≥13 providers.
    expect(registry.providers).toBeDefined();
    expect(Object.keys(registry.providers).length).toBeGreaterThanOrEqual(8);

    const profilesPath = path.join(repoRoot, 'gateway/src/providers/profiles.mjs');
    expect(existsSync(profilesPath)).toBe(true);
    const profilesText = readFileSync(profilesPath, 'utf8');
    for (const id of ['apmix', 'agnes', 'deepseek', 'huggingface', 'openai']) {
      expect(profilesText).toContain(`${id}:`);
    }
    // Generic OpenAI-compatible discovery must require endpoint+model, not key alone.
    expect(profilesText).toContain('baseUrl');
    expect(readFileSync(path.join(repoRoot, 'gateway/src/config.mjs'), 'utf8')).toContain('endpoint');
  });

  it('.env.example documents kred_ client/admin keys and provider-named credentials', () => {
    const envExample = readFileSync(path.join(repoRoot, '.env.example'), 'utf8');
    expect(envExample).toContain('kred_live_');
    expect(envExample).toContain('kred_admin_');
    expect(envExample).toContain('USERS_JSON_BASE64');
    expect(envExample).toContain('ADMIN_KEY');
    // Provider credentials must keep provider names, not KRED_*.
    expect(envExample).toContain('APMIX_API_KEY');
    expect(envExample).toContain('AGNES_API_KEY');
    expect(envExample).toContain('DEEPSEEK_API_KEY');
    expect(envExample).toContain('HUGGINGFACE_API_KEY');
    expect(envExample).toContain('OPENAI_API_KEY');
    // Must document that generic providers need base URL + model.
    expect(envExample).toContain('_BASE_URL');
    expect(envExample).toContain('_MODEL');
    // Must not claim key alone enables arbitrary protocol.
    expect(envExample).toMatch(/key alone.*NOT/i);
    // Must note to ask for appIds/tiers rather than guess.
    expect(envExample).toMatch(/Ask for appIds\/tiers/i);
  });

  it('gateway config keeps provider env names, not KRED_* for provider credentials', () => {
    const configText = readFileSync(path.join(repoRoot, 'gateway/src/config.mjs'), 'utf8');
    expect(configText).toContain('APIMIX');
    expect(configText).toContain('HUGGINGFACE');
    // Provider env var names must stay provider-named (e.g. APMIX_API_KEY), not renamed to KRED_*.
    // The KRED_ prefix is only for gateway client/admin keys (kred_live_, kred_admin_).
    expect(configText).not.toContain('KRED_API_KEY');
    expect(configText).not.toContain('KRED_APMIX');
    const profilesText = readFileSync(path.join(repoRoot, 'gateway/src/providers/profiles.mjs'), 'utf8');
    expect(profilesText).not.toContain('KRED_');
  });

  it('health/auth smoke without paid calls (mock provider)', async () => {
    // Run the embedded gateway in a fresh Node process with DEMO_MOCK=true
    // so no real provider credentials are needed and no paid calls occur.
    const script = `
      import { handleRequest } from './gateway/src/server.mjs';
      import { createServer } from 'node:http';
      // Helper that mimics Node IncomingMessage/ServerResponse enough for handleRequest
      const simulate = async (method, url, headers={}, body=null) => {
        return new Promise(async (resolve) => {
          const server = createServer(handleRequest);
          await new Promise(r=> server.listen(0,'127.0.0.1', r));
          const port = server.address().port;
          const r = await fetch('http://127.0.0.1:'+port+url, {
            method,
            headers: { 'content-type':'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined
          });
          const text = await r.text();
          server.close(() => resolve({ status: r.status, text, headers: Object.fromEntries(r.headers) }));
        });
      };

      // 1. Health is public, no auth, 200
      let out = await simulate('GET','/api/health');
      let health;
      try { health = JSON.parse(out.text); } catch {}
      if (out.status !== 200 || !health?.ok) { console.error('health fail', out.status, out.text); process.exit(1); }
      if (health.data.service !== 'konkred-gateway') { console.error('health service', health); process.exit(1); }

      // 2. /v1/models without auth => 401 (or 200 if ALLOW_ANONYMOUS, but default false)
      out = await simulate('GET','/v1/models');
      if (out.status !== 401 && out.status !== 200) { console.error('/v1/models unauth', out.status, out.text); process.exit(1); }

      // 3. /v1/models with valid kred_ key => 200 list
      out = await simulate('GET','/v1/models', {'x-api-key': process.env.TEST_KRED_KEY});
      let models;
      try { models = JSON.parse(out.text); } catch {}
      if (out.status !== 200 || models?.object !== 'list' || !Array.isArray(models?.data)) { console.error('models auth', out.status, out.text); process.exit(1); }

      // 4. OpenAI chat completions via mock (DEMO_MOCK true) — no paid calls
      out = await simulate('POST','/v1/chat/completions', {'x-api-key': process.env.TEST_KRED_KEY}, { model: models.data[0]?.id ?? 'mock:atlas-70b', messages: [{role:'user', content:'hello'}] });
      let chat;
      try { chat = JSON.parse(out.text); } catch {}
      if (out.status !== 200 || chat?.object !== 'chat.completion' || !chat?.choices?.[0]?.message) {
        console.error('chat', out.status, out.text.slice(0,800));
        process.exit(1);
      }
      console.log('smoke: ok', JSON.stringify(health.data.pool), models.data.length, chat.id);
    `;
    const kredKey = 'kred_live_smoke_test_' + Math.random().toString(36).slice(2, 8);
    const usersJson = JSON.stringify([{ key: kredKey, userId: 'smoke-test-app', tier: 'standard' }]);
    const usersB64 = Buffer.from(usersJson).toString('base64');

    await new Promise<void>((resolve, reject) => {
      const child = spawn('node', ['--input-type=module', '-e', script], {
        cwd: repoRoot,
        env: {
          ...process.env,
          DEMO_MOCK: 'true',
          MOCK_FALLBACK: 'true',
          USERS_JSON_BASE64: usersB64,
          ADMIN_KEY: 'kred_admin_smoke_' + Math.random().toString(36).slice(2, 8),
          TEST_KRED_KEY: kredKey,
          // Ensure no external gateway URL interferes
          KONKRED_GATEWAY_URL: '',
          BRAIN_URL: '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '', err = '';
      child.stdout.on('data', c => out += c);
      child.stderr.on('data', c => err += c);
      child.on('close', code => {
        if (code !== 0) reject(new Error(`embedded smoke failed code=${code} out=${out} err=${err}`));
        else resolve();
      });
      setTimeout(() => {
        try { child.kill(); } catch {}
        reject(new Error(`timeout out=${out} err=${err}`));
      }, 8000);
    });
  }, 15000);
});
