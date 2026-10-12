/**
 * Test harness for the workflow surface.
 *
 * Boots the real express.Router from server/workflow-routes.ts against a
 * pg-mem PostgreSQL and a scripted gateway, so the tests exercise the same
 * code path production does — no mocks of our own modules, only of the two
 * things we legitimately do not own (the database engine and the gateway).
 */
import express from 'express';
import type { Server } from 'node:http';
import { newDb } from 'pg-mem';
import { Billing } from '../../server/billing.ts';
import { WorkflowStore } from '../../server/workflow-store.ts';
import { createWorkflowRouter, type WorkflowRouteDeps } from '../../server/workflow-routes.ts';
import type { CallGateway, GatewayOutcome, GatewayRequest } from '../../server/workflow-run.ts';
import { apiJsonErrorHandler } from '../../server/api-error-handler.ts';
import { BILLING_SCHEMA_SQL } from './billing-schema.ts';

export interface GatewaySpy {
  call: CallGateway;
  requests: { request: GatewayRequest; idempotencyKey: string }[];
  /** Replace the scripted reply for the next and subsequent calls. */
  reply: (outcome: GatewayOutcome | ((n: number) => GatewayOutcome)) => void;
}

/** A gateway that returns whatever the test tells it to. */
export function gatewaySpy(initial: GatewayOutcome | ((n: number) => GatewayOutcome)): GatewaySpy {
  let script = initial;
  const requests: GatewaySpy['requests'] = [];
  return {
    requests,
    reply(next) { script = next; },
    call: async (request, idempotencyKey) => {
      requests.push({ request, idempotencyKey });
      return typeof script === 'function' ? script(requests.length) : script;
    },
  };
}

/** A successful gateway reply carrying `content` verbatim. */
export function replyWith(content: string, overrides: Partial<Extract<GatewayOutcome, { ok: true }>> = {}): GatewayOutcome {
  return {
    ok: true,
    content,
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    modelId: 'groq:llama-70b',
    cached: false,
    latencyMs: 42,
    attempts: [{ modelId: 'groq:llama-70b', provider: 'groq', status: 200, errorClass: null, latencyMs: 42 }],
    ...overrides,
  };
}

export interface Harness {
  baseUrl: string;
  billing: Billing;
  store: WorkflowStore;
  gateway: GatewaySpy;
  close: () => Promise<void>;
  post: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<HttpResult>;
  get: (path: string, headers?: Record<string, string>) => Promise<HttpResult>;
}

export interface HttpResult {
  status: number;
  contentType: string;
  text: string;
  json: any;
}

export interface HarnessOptions extends Partial<Omit<WorkflowRouteDeps, 'billing' | 'store' | 'callGateway'>> {
  /** Set false to simulate a deployment with no DATABASE_URL. */
  withDatabase?: boolean;
  /** Set false to simulate a deployment with no gateway configured. */
  withGateway?: boolean;
  gateway?: GatewaySpy;
  trialMessages?: number;
}

export async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
  const withDatabase = options.withDatabase !== false;
  const withGateway = options.withGateway !== false;

  const db = newDb();
  db.public.none(BILLING_SCHEMA_SQL);
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  const billing = new Billing(pool as never, { trialMessages: options.trialMessages ?? 100 });
  const store = new WorkflowStore(pool as never);
  const gateway = options.gateway ?? gatewaySpy(replyWith('{}'));

  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use(
    '/api/workflows',
    createWorkflowRouter({
      billing: withDatabase ? billing : undefined,
      store: withDatabase ? store : undefined,
      anonSalt: 'test-salt',
      callGateway: withGateway ? gateway.call : undefined,
      verifyIdToken: async (token) => (token.startsWith('valid-') ? token.replace('valid-', '') : null),
      demoIpMax: options.demoIpMax,
      demoGlobalMax: options.demoGlobalMax,
      chunkThresholdTokens: options.chunkThresholdTokens,
      log: () => undefined,
    }),
  );
  // Mirrors server.ts: an unknown /api path is JSON, never the SPA shell.
  app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, error: { code: 'ROUTE_NOT_FOUND', message: 'No such route.', path: req.path } });
  });
  // Mirrors server.ts: the terminal JSON error handler, registered last.
  app.use(apiJsonErrorHandler);

  let server: Server;
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const address = server!.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  const request = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<HttpResult> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, contentType: res.headers.get('content-type') || '', text, json };
  };

  return {
    baseUrl,
    billing,
    store,
    gateway,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    post: (path, body, headers) => request('POST', path, body, headers),
    get: (path, headers) => request('GET', path, undefined, headers),
  };
}

/**
 * Build the smallest object that satisfies a product's output schema.
 *
 * Used as the fake model reply in the per-product suite. It is generated from
 * the schema itself rather than hand-written per product, so the test proves
 * the pipeline honours all 15 schemas rather than 15 hand-tuned fixtures.
 */
export function minimalValidOutput(schema: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = (schema.properties || {}) as Record<string, any>;
  for (const key of (schema.required || []) as string[]) {
    out[key] = sampleFor(props[key], key);
  }
  // Every declared property, not just the required ones: an optional field
  // with an unsatisfiable schema is still a field the model will emit, and we
  // want the test to see it. (This is how the string-array bug in
  // catalog/validate.ts was found.)
  for (const [key, prop] of Object.entries(props)) {
    if (out[key] === undefined) out[key] = sampleFor(prop, key);
  }
  return out;
}

function sampleFor(prop: any, key: string): unknown {
  if (!prop) return `sample ${key}`;
  switch (prop.type) {
    case 'string':
      return Array.isArray(prop.enum) && prop.enum.length ? prop.enum[0] : `sample ${key}`;
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'array': {
      const items = prop.items;
      if (!items || typeof items !== 'object') return ['sample'];
      if (items.type === 'string') return [Array.isArray(items.enum) && items.enum.length ? items.enum[0] : 'sample'];
      const item: Record<string, unknown> = {};
      for (const req of (items.required || []) as string[]) {
        item[req] = sampleFor((items.properties || {})[req], req);
      }
      // Include every declared property so enum constraints are exercised.
      for (const [k, v] of Object.entries((items.properties || {}) as Record<string, any>)) {
        if (item[k] === undefined) item[k] = sampleFor(v, k);
      }
      return [item];
    }
    case 'object':
      return { note: `sample ${key}` };
    default:
      return `sample ${key}`;
  }
}
