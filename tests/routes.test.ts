import { describe, it, expect } from 'vitest';
import { getPageFromPath, getPathForPage } from '../utils/routes.ts';
import { ENTRIES, SUITES, WORKFLOWS, getEntryBySlug, getEntryByLegacySlug } from '../content/catalogue/portfolio.ts';

/**
 * Routing contract for the 36-entry catalogue era.
 * - 21 canonical /suites/:slug routes render suite_detail
 * - 15 canonical /tools/:slug routes render workflow_detail
 * - 15 legacy /products/:slug paths redirect to their canonical /tools route
 * - platform routes are real pages; purged marketplace routes 404
 */
describe('portfolio routing', () => {
  it('every suite maps to a suite_detail route', () => {
    for (const suite of SUITES) {
      const match = getPageFromPath(`/suites/${suite.slug}`);
      expect(match.page).toBe('suite_detail');
      expect(match.slug).toBe(suite.slug);
      expect(match.redirectedFrom).toBeUndefined();
    }
  });

  it('every workflow maps to a workflow_detail route', () => {
    for (const wf of WORKFLOWS) {
      const match = getPageFromPath(`/tools/${wf.slug}`);
      expect(match.page).toBe('workflow_detail');
      expect(match.slug).toBe(wf.slug);
    }
  });

  it('every workflow kit slug maps to a kit_detail route', () => {
    for (const wf of WORKFLOWS) {
      expect(getPageFromPath(`/kits/${wf.slug}`).page).toBe('kit_detail');
    }
  });

  it('legacy /products/:slug redirects to the canonical /tools/:slug', () => {
    for (const wf of WORKFLOWS) {
      expect(wf.legacySlug, `${wf.slug} needs a legacy slug`).toBeTruthy();
      const match = getPageFromPath(`/products/${wf.legacySlug}`);
      expect(match.page).toBe('workflow_detail');
      expect(match.slug).toBe(wf.slug);
      expect(match.redirectedFrom).toBe(`/products/${wf.legacySlug}`);
      expect(getPathForPage('workflow_detail', wf.slug)).toBe(`/tools/${wf.slug}`);
    }
  });

  it('legacy slug lookup resolves every old product URL', () => {
    for (const wf of WORKFLOWS) {
      expect(getEntryByLegacySlug(wf.legacySlug as string)?.slug).toBe(wf.slug);
    }
  });

  it('catalogue route resolves for /catalogue and redirects /products, /marketplace, /ktools', () => {
    expect(getPageFromPath('/catalogue').page).toBe('catalogue');
    expect(getPageFromPath('/products')).toMatchObject({ page: 'catalogue', redirectedFrom: '/products' });
    expect(getPageFromPath('/marketplace')).toMatchObject({ page: 'catalogue', redirectedFrom: '/marketplace' });
    expect(getPageFromPath('/ktools').page).toBe('catalogue');
  });

  it('platform routes are real pages', () => {
    expect(getPageFromPath('/pricing').page).toBe('pricing');
    expect(getPageFromPath('/sprint').page).toBe('sprint');
    expect(getPageFromPath('/enterprise').page).toBe('enterprise');
    expect(getPageFromPath('/partners').page).toBe('partners');
    expect(getPageFromPath('/validation').page).toBe('validation');
  });

  it('unknown suite/tool slugs resolve to 404, never a fake page', () => {
    expect(getPageFromPath('/suites/not-a-suite').page).toBe('not_found');
    expect(getPageFromPath('/tools/not-a-tool').page).toBe('not_found');
    expect(getPageFromPath('/kits/not-a-kit').page).toBe('not_found');
    expect(getPageFromPath('/products/unknown-slug').page).toBe('not_found');
  });

  it('purged marketplace routes stay 404', () => {
    // '/checkout' is deliberately NOT in this list any more: it is now a real,
    // implemented billing page backed by /api/payments/*, not a mock storefront.
    for (const p of ['/wallet', '/seller-dashboard', '/buyer-dashboard', '/admin', '/dispute', '/affiliate', '/listing', '/wizard']) {
      expect(getPageFromPath(p).page, `${p} should 404`).toBe('not_found');
    }
  });

  it('/checkout resolves to the real billing page', () => {
    expect(getPageFromPath('/checkout').page).toBe('checkout');
  });

  it('preserved flagship routes still resolve', () => {
    expect(getPageFromPath('/forge-audit').page).toBe('forge_audit');
    expect(['forge_audit', 'audit']).toContain(getPageFromPath('/audit').page); // both render AUDITOR
    expect(getPageFromPath('/auditor').page).toBe('forge_audit');
    expect(getPageFromPath('/fullkonk').page).toBe('fullkonk');
    expect(getPageFromPath('/redaeye').page).toBe('redaeye');
  });

  it('all 36 entries have unique route paths in the manifest', () => {
    const routes = ENTRIES.map((e) => e.route);
    expect(new Set(routes).size).toBe(36);
  });

  it('getEntryBySlug resolves all 36 canonical slugs', () => {
    for (const e of ENTRIES) {
      expect(getEntryBySlug(e.slug)?.id).toBe(e.id);
    }
  });
});
