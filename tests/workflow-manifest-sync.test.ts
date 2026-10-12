import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCTS, PRODUCT_MANIFEST } from '../catalog/products.ts';
import { ENTRIES, SUITES, WORKFLOWS } from '../content/catalogue/portfolio.ts';
import {
  GATEWAY_TASK_TYPES,
  expectedCreditsPerRun,
  runnabilityForStatus,
  listCatalogueItems,
  resolveProduct,
} from '../catalog/runtime.ts';
import { validateManifest } from '../catalog/validate.ts';

/**
 * Sync is enforced here, not by discipline.
 *
 * Three artefacts describe the same 15 products and nothing previously stopped
 * them drifting apart:
 *
 *   agent/PRODUCT_MANIFEST.json   (canonical)
 *   catalog/product-manifest.json (runtime copy — deep equality already tested)
 *   catalog/types.ts              (hand-written ProductRecord — NOT tested)
 *
 * The third gap is what this file closes: the key set of every product record
 * is asserted against the field list declared in catalog/types.ts, in both
 * directions, by parsing the interface out of the source.
 */

const ROOT = process.cwd();
const TYPES_SRC = fs.readFileSync(path.join(ROOT, 'catalog/types.ts'), 'utf8');

/** Field names declared on an exported interface, read from the source file. */
function declaredFields(source: string, interfaceName: string): string[] {
  const start = source.indexOf(`export interface ${interfaceName} {`);
  if (start < 0) throw new Error(`interface ${interfaceName} not found in catalog/types.ts`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const body = source.slice(open + 1, end);
  const fields: string[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\??\s*:/.exec(line);
    if (match) fields.push(match[1]);
  }
  return fields;
}

describe('manifest ↔ types.ts sync (enforced, not assumed)', () => {
  it('agent and catalog manifest copies remain byte-identical', () => {
    const a = fs.readFileSync(path.join(ROOT, 'agent/PRODUCT_MANIFEST.json'), 'utf8');
    const b = fs.readFileSync(path.join(ROOT, 'catalog/product-manifest.json'), 'utf8');
    expect(a).toBe(b);
  });

  it('every field on ProductRecord exists on every product record', () => {
    const declared = declaredFields(TYPES_SRC, 'ProductRecord');
    expect(declared.length).toBeGreaterThan(20);
    for (const product of PRODUCTS) {
      for (const field of declared) {
        expect(
          Object.prototype.hasOwnProperty.call(product, field),
          `product "${product.slug}" is missing declared field "${field}"`,
        ).toBe(true);
      }
    }
  });

  it('every field on every product record is declared on ProductRecord', () => {
    const declared = new Set(declaredFields(TYPES_SRC, 'ProductRecord'));
    for (const product of PRODUCTS) {
      for (const field of Object.keys(product)) {
        expect(
          declared.has(field),
          `product "${product.slug}" has undeclared field "${field}" — add it to catalog/types.ts`,
        ).toBe(true);
      }
    }
  });

  it('every manifest-header field is declared on ProductManifest', () => {
    const declared = new Set(declaredFields(TYPES_SRC, 'ProductManifest'));
    // The nested `manifest` block is declared inline; check it by name.
    expect(declared.has('manifest')).toBe(true);
    expect(declared.has('products')).toBe(true);
    for (const key of ['creditPolicy', 'privacyPolicy', 'runnabilityLegend', 'statuses', 'statusLegend']) {
      expect(
        TYPES_SRC.includes(`${key}:`),
        `manifest header field "${key}" is not declared in catalog/types.ts`,
      ).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(PRODUCT_MANIFEST.manifest, key), key).toBe(true);
    }
  });

  it('the manifest still passes its own validator with zero issues', () => {
    expect(validateManifest(PRODUCT_MANIFEST)).toEqual([]);
  });
});

describe('derived execution fields are correct, not merely present', () => {
  it('taskType is one of the seven the gateway routes on', () => {
    for (const p of PRODUCTS) {
      expect(GATEWAY_TASK_TYPES, p.slug).toContain(p.taskType);
    }
  });

  it('no product is routed to `extraction`, whose private-safe lane is quality 2', () => {
    // See docs/RECON_REPORT.md §10c and docs/AGENT_DECISIONS.md D-3: under
    // privacy:'private' the extraction preference list loses gemini:flash and
    // collapses to 8B quality-2 models. Assigning a legal product there would
    // silently downgrade it.
    for (const p of PRODUCTS) expect(p.taskType, p.slug).not.toBe('extraction');
  });

  it('privacy is private for all 15', () => {
    for (const p of PRODUCTS) expect(p.privacy, p.slug).toBe('private');
  });

  it('creditsPerRun equals 1 + ceil(maxInputTokens / 8000) for all 15', () => {
    for (const p of PRODUCTS) {
      expect(p.creditsPerRun, p.slug).toBe(expectedCreditsPerRun(p.maxInputTokens));
    }
  });

  it('long-input legal and M&A products carry a visibly higher cost', () => {
    const credits = (slug: string) => PRODUCTS.find((p) => p.slug === slug)!.creditsPerRun;
    expect(credits('ma-due-diligence-workbench')).toBe(16);
    expect(credits('govcon-rfp-compliance-workbench')).toBe(6);
    expect(credits('commercial-lease-abstraction')).toBe(6);
    expect(credits('contract-review-copilot')).toBe(4);
    expect(credits('executive-flash-brief')).toBe(2);
    // and the expensive ones really are more expensive than the cheap ones
    expect(credits('ma-due-diligence-workbench')).toBeGreaterThan(credits('executive-flash-brief'));
  });

  it('the cost formula is published in the manifest where users can see it', () => {
    expect(PRODUCT_MANIFEST.manifest.creditPolicy).toContain('1 + ceil(maxInputTokens / 8000)');
    expect(PRODUCT_MANIFEST.manifest.creditPolicy).toContain('BEFORE the run');
  });

  it('runnable and runnableForAnon match the status legend exactly', () => {
    for (const p of PRODUCTS) {
      const expected = runnabilityForStatus(p.status);
      expect({ runnable: p.runnable, runnableForAnon: p.runnableForAnon }, p.slug).toEqual(expected);
    }
  });

  it('only PUBLIC_DEMO products are open to anonymous callers', () => {
    for (const p of PRODUCTS) {
      if (p.runnableForAnon) expect(p.status, p.slug).toBe('PUBLIC_DEMO');
    }
  });

  it('ENTERPRISE_INTEGRATION products are not self-serve', () => {
    for (const p of PRODUCTS) {
      if (p.status === 'ENTERPRISE_INTEGRATION') expect(p.runnable, p.slug).toBe(false);
    }
  });

  it('maxOutputTokens never exceeds the gateway hard cap of 8192', () => {
    // gateway/src/config.mjs: hardMaxTokens: int('HARD_MAX_TOKENS', 8192)
    for (const p of PRODUCTS) {
      expect(p.maxOutputTokens, p.slug).toBeGreaterThan(0);
      expect(p.maxOutputTokens, p.slug).toBeLessThanOrEqual(8192);
    }
  });

  it('products that can be chunked say so in their limitations', () => {
    for (const p of PRODUCTS) {
      if (p.maxInputTokens > 48_000) {
        expect(p.limitations.join(' '), p.slug).toContain('chunk');
      }
    }
  });
});

describe('all 36 catalogue items are reachable from data', () => {
  it('21 suites + 15 workflows = 36, with no duplicates', () => {
    expect(ENTRIES).toHaveLength(36);
    expect(SUITES).toHaveLength(21);
    expect(WORKFLOWS).toHaveLength(15);
    expect(new Set(ENTRIES.map((e) => e.slug)).size).toBe(36);
  });

  it('listCatalogueItems returns exactly 36 items', () => {
    expect(listCatalogueItems()).toHaveLength(36);
  });

  it('every WORKFLOW entry joins to a manifest product via legacySlug', () => {
    for (const wf of WORKFLOWS) {
      expect(wf.legacySlug, `${wf.slug} has no legacySlug`).toBeTruthy();
      expect(resolveProduct(wf.slug), wf.slug).toBeTruthy();
    }
  });

  it('every manifest product is claimed by exactly one WORKFLOW entry', () => {
    for (const product of PRODUCTS) {
      const owners = WORKFLOWS.filter((w) => w.legacySlug === product.slug);
      expect(owners, product.slug).toHaveLength(1);
    }
  });

  it('no SUITE entry carries an executable prompt or schema', () => {
    for (const suite of SUITES) {
      expect(suite.demo, suite.slug).toBeNull();
    }
  });
});
