import { describe, it, expect, afterEach } from 'vitest';
import { startHarness, gatewaySpy, replyWith, minimalValidOutput, type Harness } from './helpers/workflow-harness.ts';
import { PRODUCTS } from '../catalog/products.ts';
import { FIXTURES } from '../catalog/fixtures.ts';
import { validateDemoInput, validateDemoOutput } from '../catalog/validate.ts';
import { WORKFLOWS } from '../content/catalogue/portfolio.ts';

/**
 * One pass per product, through the real router, with the real validators.
 *
 * The gateway is the only stub. Everything else — slug resolution, the status
 * gate, input validation, metering, JSON extraction, output validation, the
 * forced approval flag — is the shipping code path.
 *
 * What this proves: for all 15 products a shipped fixture is accepted, and a
 * schema-minimal model reply is accepted. What it does NOT prove: that a real
 * model produces good output. No accuracy claim is made anywhere in this file.
 */

let h: Harness;
afterEach(async () => { if (h) await h.close(); });

/** Portfolio route slug for a manifest product (both forms resolve; use the public one). */
function routeSlug(productSlug: string): string {
  const entry = WORKFLOWS.find((w) => w.legacySlug === productSlug);
  return entry ? entry.slug : productSlug;
}

describe('every product ships a fixture its own validator accepts', () => {
  for (const product of PRODUCTS) {
    it(`${product.slug}: fixture passes validateDemoInput`, () => {
      const fixture = FIXTURES[product.slug];
      expect(fixture, `no fixture for ${product.slug}`).toBeTruthy();
      expect(validateDemoInput(product, fixture)).toEqual([]);
    });
  }
});

describe('every product accepts a schema-minimal model reply', () => {
  for (const product of PRODUCTS) {
    it(`${product.slug}: minimal output passes validateDemoOutput`, () => {
      const output = minimalValidOutput(product.outputSchema as Record<string, any>);
      expect(validateDemoOutput(product, output)).toEqual([]);
    });
  }
});

describe('fixture → run → validate, through the real pipeline', () => {
  for (const product of PRODUCTS) {
    const slug = routeSlug(product.slug);
    const enterprise = product.status === 'ENTERPRISE_INTEGRATION';

    it(`${product.slug}: ${enterprise ? 'is gated to contact, never run' : 'runs and returns validated output'}`, async () => {
      const output = minimalValidOutput(product.outputSchema as Record<string, any>);
      const gateway = gatewaySpy(replyWith(JSON.stringify(output)));
      h = await startHarness({ gateway, trialMessages: 200 });

      const res = await h.post(`/api/workflows/${slug}/run`, { input: FIXTURES[product.slug] }, {
        authorization: 'Bearer valid-tester',
      });

      if (enterprise) {
        expect(res.status).toBe(403);
        expect(res.json.error.code).toBe('CONTACT_REQUIRED');
        expect(gateway.requests).toHaveLength(0);
        return;
      }

      expect(res.status, `${product.slug}: ${res.text.slice(0, 400)}`).toBe(200);
      expect(res.json.ok).toBe(true);
      expect(res.json.data.productSlug).toBe(product.slug);
      expect(res.json.data.slug).toBe(slug);
      expect(res.json.data.status).toBe('COMPLETE');

      // The returned output survives the product's own output validator.
      expect(validateDemoOutput(product, res.json.data.output)).toEqual([]);

      // Approval is forced on, for every product, without exception.
      expect(res.json.data.humanApprovalRequired).toBe(true);
      expect(res.json.data.output.humanApprovalRequired).toBe(true);

      // The published price is what was charged.
      expect(res.json.data.credits.perRun).toBe(product.creditsPerRun);
      expect(res.json.data.credits.charged).toBe(product.creditsPerRun);

      // The product's own routing decisions reached the gateway.
      const sent = gateway.requests[0].request;
      expect(sent.taskType).toBe(product.taskType);
      expect(sent.privacy).toBe('private');
      expect(sent.systemPrompt).toBe(product.prompt);

      // No provider identity, key, or internal path is echoed to the caller.
      expect(res.text).not.toMatch(/api[_-]?key|sk-|\/home\/|node_modules/i);
    });
  }
});

describe('the six PUBLIC_DEMO products run anonymously via /demo', () => {
  const publicDemos = PRODUCTS.filter((p) => p.status === 'PUBLIC_DEMO');

  it('there are exactly six of them', () => {
    expect(publicDemos.map((p) => p.slug).sort()).toEqual([
      'ab-experiment-interpretation',
      'contract-review-copilot',
      'evidence-backed-prd-generator',
      'executive-flash-brief',
      'incident-learning-postmortem',
      'seo-content-opportunity-planner',
    ]);
  });

  for (const product of publicDemos) {
    it(`${product.slug}: anonymous demo returns a labelled, validated result`, async () => {
      const output = minimalValidOutput(product.outputSchema as Record<string, any>);
      const gateway = gatewaySpy(replyWith(JSON.stringify(output)));
      h = await startHarness({ gateway });

      const res = await h.post(`/api/workflows/${routeSlug(product.slug)}/demo`);
      expect(res.status, `${product.slug}: ${res.text.slice(0, 400)}`).toBe(200);
      expect(res.json.data.demo).toBe(true);
      expect(res.json.data.credits.charged).toBe(0);
      expect(validateDemoOutput(product, res.json.data.output)).toEqual([]);
      expect(res.json.data.output.humanApprovalRequired).toBe(true);
      expect(res.json.data.notice).toContain('NOT_FOR_PRODUCTION_DECISION');
    });
  }
});

describe('the nine non-public products refuse the anonymous demo route', () => {
  for (const product of PRODUCTS.filter((p) => p.status !== 'PUBLIC_DEMO')) {
    it(`${product.slug}: /demo is 403 DEMO_NOT_AVAILABLE and calls no provider`, async () => {
      const gateway = gatewaySpy(replyWith('{}'));
      h = await startHarness({ gateway });
      const res = await h.post(`/api/workflows/${routeSlug(product.slug)}/demo`);
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe('DEMO_NOT_AVAILABLE');
      expect(gateway.requests).toHaveLength(0);
    });
  }
});

describe('no product claims a metric it has not measured', () => {
  const FABRICATION = /\b\d{2,3}(\.\d+)?\s*%\s*(accura|precision|recall|f1|uptime|success)/i;

  for (const product of PRODUCTS) {
    it(`${product.slug}: no accuracy percentage in copy, and validation status is honest`, () => {
      const copy = [product.shortDescription, product.description, ...(product.limitations ?? [])].join(' ');
      expect(copy).not.toMatch(FABRICATION);
      // validationReport.status must be one the manifest actually supports;
      // "available" means a real report exists at the stated path.
      if (product.validationReport?.status === 'available') {
        expect(product.validationReport.path, product.slug).toBeTruthy();
      }
    });
  }
});

describe('regression: string arrays are valid output (catalog/validate.ts)', () => {
  // Before the fix, validateDemoOutput treated EVERY declared item schema as
  // an object schema, so a correct ["..."] for a `items: { type: 'string' }`
  // field was rejected with `must be an object`. Ten of the fifteen
  // products have at least one such field, meaning they could never return a
  // valid result. Found by tests/workflow-products.test.ts, not by review.
  const ab = PRODUCTS.find((p) => p.slug === 'ab-experiment-interpretation')!;

  it('accepts an array of strings where the schema says items: string', () => {
    const output = minimalValidOutput(ab.outputSchema as Record<string, any>);
    output.significanceCaveats = ['Sample size was not pre-registered.'];
    expect(validateDemoOutput(ab, output)).toEqual([]);
  });

  it('still rejects the wrong scalar type inside such an array', () => {
    const output = minimalValidOutput(ab.outputSchema as Record<string, any>);
    output.significanceCaveats = [42];
    expect(validateDemoOutput(ab, output)).toContain('Output field "significanceCaveats[0]" must be a string.');
  });

  it('still rejects a non-object inside an object-item array', () => {
    const contract = PRODUCTS.find((p) => p.slug === 'contract-review-copilot')!;
    const output = minimalValidOutput(contract.outputSchema as Record<string, any>);
    output.clauseFindings = ['not an object'];
    expect(validateDemoOutput(contract, output)).toContain('Output field "clauseFindings[0]" must be an object.');
  });

  it('ten of the fifteen products declare a string-array output field', () => {
    const affected = PRODUCTS.filter((p) => {
      const props = ((p.outputSchema as any).properties ?? {}) as Record<string, any>;
      return Object.values(props).some((prop) => prop?.type === 'array' && prop?.items?.type === 'string');
    });
    expect(affected.length).toBe(10);
  });
});
