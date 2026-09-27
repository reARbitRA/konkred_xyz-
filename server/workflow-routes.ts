/**
 * Catalogue + runner HTTP surface (server-only).
 *
 *   GET  /api/workflows              list all 36 catalogue items
 *   GET  /api/workflows/:slug        one item, both schemas included
 *   POST /api/workflows/:slug/run    metered execution via the gateway
 *   POST /api/workflows/:slug/demo   fixture run, anonymous, rate limited
 *
 * Every response is JSON — success and failure alike — in the site's existing
 * envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
 * No route in this file can emit HTML, and no error carries a stack trace, an
 * upstream payload, a provider key or an internal path.
 *
 * Built as an express.Router taking injected dependencies so the whole surface
 * can be mounted against pg-mem and a fake gateway in tests, and against the
 * real pool and the real gateway in server.ts, with no divergence between them.
 */
import express from 'express';
import type { IncomingMessage } from 'node:http';
import { Billing, type Surface } from './billing.ts';
import { Meter, paywallBody } from './metering.ts';
import { WorkflowStore } from './workflow-store.ts';
import {
  executeWorkflow,
  serialiseInput,
  type CallGateway,
  type RunProvenance,
} from './workflow-run.ts';
import { FIXTURES } from '../catalog/fixtures.ts';
import {
  getCatalogueItem,
  listCatalogueItems,
  resolveCatalogueEntry,
  resolveProduct,
  searchCatalogue,
  catalogueCategories,
} from '../catalog/runtime.ts';
import type { ProductRecord } from '../catalog/types.ts';

export interface WorkflowRouteDeps {
  /** Absent when the deployment has no DATABASE_URL: runs are unmetered. */
  billing?: Billing;
  /** Absent when the deployment has no DATABASE_URL: demos are refused. */
  store?: WorkflowStore;
  anonSalt: string;
  verifyIdToken?: (token: string) => Promise<string | null>;
  /** Absent when KONKRED_GATEWAY_URL / KONKRED_GATEWAY_API_KEY are unset. */
  callGateway?: CallGateway;
  demoIpWindowMinutes?: number;
  demoIpMax?: number;
  demoGlobalWindowMinutes?: number;
  demoGlobalMax?: number;
  chunkThresholdTokens?: number;
  log?: (event: string, meta?: Record<string, unknown>) => void;
  now?: () => number;
}

const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,128}$/;

const DEMO_NOTICE =
  'DEMO // NOT_FOR_PRODUCTION_DECISION — run against a synthetic-public fixture, not your data. ' +
  'Output is unvalidated model text and must not be used for any business, legal or financial decision.';

const RUN_NOTICE =
  'Decision support only. A qualified human owner must review and approve this output before any ' +
  'business, legal or financial action. No validation report exists for this product yet.';

function ok(res: express.Response, status: number, data: unknown): void {
  res.status(status).type('application/json').json({ ok: true, data });
}

function fail(
  res: express.Response,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): void {
  res.status(status).type('application/json').json({ ok: false, error: { code, message, ...extra } });
}

/** Stable per-run identifier. Not a secret; safe to show the user for support. */
function runId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Hashed client IP. Never store or log the raw address. */
async function hashIp(req: express.Request, salt: string): Promise<string> {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
    req.socket?.remoteAddress ||
    'unknown';
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(`${salt}:demo:${ip}`).digest('hex').slice(0, 32);
}

/** Public projection of a product: both schemas, no internal fields. */
function productDetail(product: ProductRecord) {
  return {
    productSlug: product.slug,
    id: product.id,
    name: product.name,
    category: product.category,
    status: product.status,
    risk: product.risk,
    // Forced. The manifest value is not trusted and the model never sets it.
    humanApprovalRequired: true,
    shortDescription: product.shortDescription,
    description: product.description,
    buyer: product.buyer,
    taskType: product.taskType,
    privacy: product.privacy,
    maxInputTokens: product.maxInputTokens,
    maxOutputTokens: product.maxOutputTokens,
    creditsPerRun: product.creditsPerRun,
    runnable: product.runnable,
    runnableForAnon: product.runnableForAnon,
    inputSchema: product.inputSchema,
    outputSchema: product.outputSchema,
    fixture: product.fixture,
    demoStatus: product.demoStatus,
    validationReport: product.validationReport,
    pricing: product.pricing,
    limitations: product.limitations,
  };
}

export function createWorkflowRouter(deps: WorkflowRouteDeps): express.Router {
  const router = express.Router();
  const log = deps.log ?? (() => undefined);
  const demoIpWindow = deps.demoIpWindowMinutes ?? 60;
  const demoIpMax = deps.demoIpMax ?? 5;
  const demoGlobalWindow = deps.demoGlobalWindowMinutes ?? 1440;
  const demoGlobalMax = deps.demoGlobalMax ?? 200;

  const meter = deps.billing
    ? new Meter({ billing: deps.billing, anonSalt: deps.anonSalt, verifyIdToken: deps.verifyIdToken })
    : null;

  /**
   * Server-derived identity. Reuses the existing Meter.identify() so this
   * surface can never disagree with the metered gateway routes about who a
   * caller is. A browser-supplied identity header is ignored, exactly as there.
   */
  async function identify(req: express.Request): Promise<string> {
    if (meter) return meter.identify(req as unknown as IncomingMessage);
    // No database: still derive an identity, still never trust a header.
    const { anonymousIdentity } = await import('./billing.ts');
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
      req.socket?.remoteAddress ||
      'unknown';
    return anonymousIdentity(ip, deps.anonSalt);
  }

  // ── GET /api/workflows ────────────────────────────────────────────────────
  router.get('/', (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const type = typeof req.query.type === 'string' ? req.query.type.toUpperCase() : '';

    let items = listCatalogueItems();
    if (type === 'SUITE' || type === 'WORKFLOW') items = items.filter((i) => i.type === type);
    if (category && category !== 'all') items = items.filter((i) => i.category === category);
    items = searchCatalogue(q, items);

    ok(res, 200, {
      count: items.length,
      total: listCatalogueItems().length,
      categories: catalogueCategories(),
      filters: { category: category || null, q: q || null, type: type || null },
      items,
    });
  });

  // ── GET /api/workflows/:slug ──────────────────────────────────────────────
  router.get('/:slug', (req, res) => {
    const item = getCatalogueItem(req.params.slug);
    if (!item) {
      return fail(res, 404, 'PRODUCT_NOT_FOUND', `No catalogue item exists with slug "${String(req.params.slug).slice(0, 80)}".`);
    }
    const entry = resolveCatalogueEntry(req.params.slug)!;
    const product = item.productSlug ? resolveProduct(item.productSlug) : undefined;
    return ok(res, 200, {
      ...item,
      entry: {
        id: entry.id,
        type: entry.type,
        parentId: entry.parentId,
        route: entry.route,
        jobToBeDone: entry.jobToBeDone,
        definition: entry.definition,
        modules: entry.modules,
        useCases: entry.useCases,
        exclusions: entry.exclusions,
        inputSummary: entry.inputSummary,
        outputSummary: entry.outputSummary,
        validators: entry.validators,
        controlRequirements: entry.controlRequirements,
        failureModes: entry.failureModes,
        productBoundary: entry.productBoundary,
        publicValidation: entry.publicValidation,
        pricing: entry.pricing,
      },
      product: product ? productDetail(product) : null,
    });
  });

  // ── POST /api/workflows/:slug/run ─────────────────────────────────────────
  router.post('/:slug/run', async (req, res) => {
    const slug = String(req.params.slug || '');

    // 1 ── resolve
    const product = resolveProduct(slug);
    if (!product) {
      return fail(res, 404, 'PRODUCT_NOT_FOUND', `No runnable product exists with slug "${slug.slice(0, 80)}".`);
    }

    // 2 ── status gate
    if (!product.runnable) {
      return fail(
        res,
        403,
        'CONTACT_REQUIRED',
        'This product is delivered as an enterprise integration and is not self-serve. ' +
          'It requires a security review and a signed engagement before it can be run.',
        { contactRoute: '/contact', status: product.status },
      );
    }

    const identity = await identify(req);
    if (!product.runnableForAnon && identity.startsWith('anon:')) {
      return fail(
        res,
        401,
        'AUTH_REQUIRED',
        'Sign in to run this product. Only PUBLIC_DEMO products are available to anonymous callers.',
        { status: product.status },
      );
    }

    // 3 ── input schema (before any charge)
    const input = (req.body as Record<string, unknown> | undefined)?.input;
    const { validateDemoInput } = await import('../catalog/validate.ts');
    const inputErrors = validateDemoInput(product, input);
    if (inputErrors.length > 0) {
      return fail(res, 400, 'INVALID_INPUT', 'The request body does not satisfy this product\'s input schema.', {
        details: inputErrors,
        inputSchema: product.inputSchema,
      });
    }

    // 5 ── idempotency, scoped server-side to identity + slug
    const header = req.headers['x-idempotency-key'];
    const supplied = typeof header === 'string' && IDEMPOTENCY_RE.test(header) ? header : null;
    const scopedKey = `${product.slug}:${supplied ?? runId()}`;

    if (deps.store && supplied) {
      try {
        const prior = await deps.store.findRun(identity, scopedKey);
        if (prior && prior.status === 'ok') {
          log('workflow.replay', { slug: product.slug });
          return ok(res, 200, {
            ...(prior.result as Record<string, unknown>),
            replay: true,
            credits: { perRun: product.creditsPerRun, charged: 0, metered: Boolean(deps.billing) },
          });
        }
      } catch (error) {
        log('error.idempotency_lookup', { name: (error as Error)?.name || 'Error' });
      }
    }

    // 7 ── the gateway is the only inference path
    if (!deps.callGateway) {
      return fail(
        res,
        503,
        'GATEWAY_NOT_CONFIGURED',
        'The inference gateway is not configured on this deployment, so nothing can be run. ' +
          'No credits were reserved.',
        { retryable: false },
      );
    }

    // 6 ── reserve
    const credits = product.creditsPerRun;
    let refund: (() => Promise<void>) | null = null;
    if (deps.billing) {
      let spend;
      try {
        spend = await deps.billing.spend(identity, credits, 'web' as Surface, scopedKey);
      } catch (error) {
        log('error.reserve_failed', { name: (error as Error)?.name || 'Error' });
        return fail(res, 503, 'METERING_UNAVAILABLE', 'The quota ledger is temporarily unavailable. Nothing was charged. Please retry.', { retryable: true });
      }
      if (spend.ok === false) {
        const body = paywallBody(spend.balance) as Record<string, unknown>;
        log('workflow.quota_exhausted', { slug: product.slug });
        return fail(res, 402, 'QUOTA_EXHAUSTED', String(body.error), {
          upgradeUrl: '/checkout',
          creditsRequired: credits,
          trialRemaining: body.trialRemaining,
          paidRemaining: body.paidRemaining,
          totalRemaining: body.totalRemaining,
        });
      }
      refund = async () => {
        try {
          await deps.billing!.grantRefund(identity, credits, scopedKey);
          log('workflow.refunded', { slug: product.slug, credits });
        } catch {
          log('error.refund_failed', { slug: product.slug });
        }
      };
    }

    // 7–11 ── execute
    const outcome = await executeWorkflow({
      product,
      input,
      idempotencyKey: scopedKey,
      callGateway: deps.callGateway,
      demo: false,
      now: deps.now,
      chunkThresholdTokens: deps.chunkThresholdTokens,
    });

    // 12 ── refund on any failure in steps 3–9
    if (outcome.ok === false) {
      if (refund) await refund();
      log('workflow.failed', { slug: product.slug, code: outcome.code });
      return fail(res, outcome.status, outcome.code, outcome.message, {
        details: outcome.details,
        creditsCharged: 0,
        provenance: publicProvenance(outcome.provenance, 0),
      });
    }

    const payload = {
      runId: runId(),
      slug: resolveCatalogueEntry(slug)?.slug ?? product.slug,
      productSlug: product.slug,
      name: product.name,
      status: 'COMPLETE' as const,
      demo: false,
      // Forced true regardless of what the model returned (step 10).
      humanApprovalRequired: true,
      output: outcome.output,
      provenance: publicProvenance(outcome.provenance, credits),
      limitations: product.limitations,
      notice: RUN_NOTICE,
    };

    // Persist for replay. A lost race means another request already produced
    // the canonical result for this key, so return that one instead.
    if (deps.store && supplied) {
      try {
        const stored = await deps.store.saveRun({
          identity,
          slug: product.slug,
          idempotencyKey: scopedKey,
          credits,
          status: 'ok',
          result: payload,
        });
        if (!stored) {
          const winner = await deps.store.findRun(identity, scopedKey);
          if (winner?.result) {
            if (refund) await refund();
            return ok(res, 200, {
              ...(winner.result as Record<string, unknown>),
              replay: true,
              credits: { perRun: credits, charged: 0, metered: Boolean(deps.billing) },
            });
          }
        }
      } catch (error) {
        log('error.run_persist', { name: (error as Error)?.name || 'Error' });
      }
    }

    return ok(res, 200, {
      ...payload,
      replay: false,
      credits: { perRun: credits, charged: deps.billing ? credits : 0, metered: Boolean(deps.billing) },
    });
  });

  // ── POST /api/workflows/:slug/demo ────────────────────────────────────────
  router.post('/:slug/demo', async (req, res) => {
    const slug = String(req.params.slug || '');
    const product = resolveProduct(slug);
    if (!product) {
      return fail(res, 404, 'PRODUCT_NOT_FOUND', `No runnable product exists with slug "${slug.slice(0, 80)}".`);
    }
    if (!product.runnableForAnon || !product.demoStatus?.available) {
      return fail(
        res,
        403,
        'DEMO_NOT_AVAILABLE',
        'This product has no public fixture demo. Sign in to run it, or request a supervised pilot.',
        { status: product.status },
      );
    }
    const fixture = FIXTURES[product.slug];
    if (!fixture) {
      return fail(res, 503, 'FIXTURE_MISSING', 'The shipped fixture for this product could not be loaded.');
    }

    /*
     * Abuse control is counted in SQL, never in memory: serverless instances
     * share no memory, so an in-process counter resets on every cold start and
     * is bypassed by spreading requests across instances. Without a database
     * the limit cannot be enforced at all, so the demo fails CLOSED rather than
     * handing anonymous traffic an uncapped provider budget.
     */
    if (!deps.store) {
      return fail(
        res,
        503,
        'DEMO_UNAVAILABLE',
        'Public demos are disabled on this deployment because the abuse-control ledger is not configured.',
        { retryable: false },
      );
    }
    const ipHash = await hashIp(req, deps.anonSalt);
    try {
      const globalCount = await deps.store.countDemosGlobal(demoGlobalWindow);
      if (globalCount >= demoGlobalMax) {
        log('demo.global_ceiling');
        return fail(
          res,
          429,
          'DEMO_DAILY_LIMIT',
          'The public demo allowance for the last 24 hours is spent. Sign in to run this product with your own quota.',
          { retryAfter: 3600, upgradeUrl: '/checkout' },
        );
      }
      const ipCount = await deps.store.countDemosByIp(ipHash, demoIpWindow);
      if (ipCount >= demoIpMax) {
        log('demo.ip_limit');
        return fail(
          res,
          429,
          'DEMO_RATE_LIMIT',
          `Public demos are limited to ${demoIpMax} per hour from one address. Sign in to run more.`,
          { retryAfter: 900, upgradeUrl: '/checkout' },
        );
      }
      // Counted before the call so a failing run still consumes the allowance;
      // otherwise an attacker gets unlimited attempts by forcing failures.
      await deps.store.recordDemo(ipHash, product.slug);
    } catch (error) {
      log('error.demo_limit', { name: (error as Error)?.name || 'Error' });
      return fail(res, 503, 'DEMO_UNAVAILABLE', 'The demo abuse-control ledger is temporarily unavailable. Please retry.', { retryable: true });
    }

    if (!deps.callGateway) {
      return fail(res, 503, 'GATEWAY_NOT_CONFIGURED', 'The inference gateway is not configured on this deployment, so the demo cannot run.', { retryable: false });
    }

    const outcome = await executeWorkflow({
      product,
      input: fixture,
      idempotencyKey: `${product.slug}:demo:${runId()}`,
      callGateway: deps.callGateway,
      demo: true,
      now: deps.now,
      chunkThresholdTokens: deps.chunkThresholdTokens,
    });

    if (outcome.ok === false) {
      return fail(res, outcome.status, outcome.code, outcome.message, {
        details: outcome.details,
        demo: true,
        provenance: publicProvenance(outcome.provenance, 0),
      });
    }

    return ok(res, 200, {
      runId: runId(),
      slug: resolveCatalogueEntry(slug)?.slug ?? product.slug,
      productSlug: product.slug,
      name: product.name,
      status: 'COMPLETE' as const,
      demo: true,
      humanApprovalRequired: true,
      output: outcome.output,
      provenance: publicProvenance(outcome.provenance, 0),
      fixture: product.fixture,
      limitations: product.limitations,
      notice: DEMO_NOTICE,
      credits: { perRun: product.creditsPerRun, charged: 0, metered: false },
    });
  });

  // ── method guards: a wrong verb must still be JSON, never HTML ────────────
  router.all('/:slug/run', (_req, res) => fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST for this route.'));
  router.all('/:slug/demo', (_req, res) => fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST for this route.'));

  return router;
}

/** Provenance is safe to return: model identity and timings, never payloads. */
function publicProvenance(p: RunProvenance, creditsCharged: number) {
  return {
    provider: p.provider,
    model: p.model,
    attempts: p.attempts,
    cached: p.cached,
    demo: p.demo,
    latencyMs: p.latencyMs,
    chunked: p.chunked,
    chunkCount: p.chunkCount,
    upstreamCalls: p.upstreamCalls,
    repaired: p.repaired,
    taskType: p.taskType,
    privacy: p.privacy,
    creditsCharged,
  };
}

export { serialiseInput };
