import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCTS } from '../catalog/products.ts';

/**
 * Stage 1 purge verification: no fake marketplace/demo modules may remain in
 * the source tree, and no banned claims may appear in the catalogue.
 */
const ROOT = process.cwd();

const MUST_NOT_EXIST = [
  'data.ts',
  'services/payments.ts',
  'services/gemini.ts',
  'lib/enterpriseTools.ts',
  'pages/MarketplacePage.tsx',
  'pages/ListingPage.tsx',
  'pages/ListingWizard.tsx',
  'pages/WalletPage.tsx',
  'pages/SellerDashboard.tsx',
  'pages/BuyerDashboard.tsx',
  'pages/UsageDashboard.tsx',
  'pages/AffiliatePage.tsx',
  'pages/DisputePage.tsx',
  'pages/AdminPage.tsx',
  'pages/KToolsPage.tsx',
  'pages/ForgePage.tsx',
  'pages/PricingPage.tsx',
  'pages/PlaygroundsPage.tsx',
  'pages/IntelReportPage.tsx',
  'components/marketplace',
  'components/seller',
  'components/buyer',
  'components/enclave',
  'components/forge',
  'components/modals',
  'components/landing',
  'components/ProtocolCard.tsx',
  'components/ProtocolDetails.tsx',
  'components/Protocols.tsx',
  'components/Tools.tsx',
  'components/ToolCard.tsx',
  'components/ValuationTerminal.tsx',
  'components/AcquirersList.tsx',
  'components/DemoView.tsx',
  'components/common/AppTester.tsx',
  'hooks/useGlobalStats.ts',
];

describe('no fake marketplace data in source', () => {
  it.each(MUST_NOT_EXIST)('purged path %s does not exist', (p) => {
    expect(fs.existsSync(path.join(ROOT, p)), `${p} still exists`).toBe(false);
  });

  it('source tree contains no MOCK_LISTINGS usage', () => {
    const src = collectSource();
    // Match usage (assignment/import/export/reference), not prose comments.
    expect(src).not.toMatch(/MOCK_LISTINGS\s*[=:[]/);
    expect(src).not.toMatch(/import[^;]*MOCK_LISTINGS/);
    expect(src).not.toMatch(/MOCK_PROTOCOLS/);
  });

  it('catalogue records contain no fake sellers, ratings or scores', () => {
    for (const product of PRODUCTS) {
      expect(JSON.stringify(product)).not.toMatch(/"seller"/i);
      expect(JSON.stringify(product)).not.toMatch(/"rating"/i);
      expect(JSON.stringify(product)).not.toMatch(/"salesCount"/i);
      expect(JSON.stringify(product)).not.toMatch(/"auditScore"/i);
    }
  });

  it('new platform source contains no unsupported claims', () => {
    const files = [
      'pages/CataloguePage.tsx',
      'pages/SuiteDetailPage.tsx',
      'pages/WorkflowDetailPage.tsx',
      'pages/PlatformPages.tsx',
      'components/catalog/MicroTool.tsx',
      'components/catalog/ProductInquiryModal.tsx',
      'components/portfolio/Evidence.tsx',
      'components/portfolio/ScopeReviewPanel.tsx',
      'components/portfolio/CtaRail.tsx',
      'components/portfolio/patterns/suites-a.tsx',
      'components/portfolio/patterns/suites-b.tsx',
      'components/portfolio/patterns/workflows.tsx',
      'pages/NotFoundPage.tsx',
    ];
    for (const file of files) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(content, `${file} contains unsupported claim`).not.toMatch(/bug-free|deploy-ready|autonomous production|100% accurate|zero-hallucination/i);
    }
  });

  it('portfolio manifest contains no fake sellers, ratings, reviews or sales counts', () => {
    const manifest = fs.readFileSync(path.join(ROOT, 'content/catalogue/portfolio-36.json'), 'utf8');
    for (const banned of [/"seller"/i, /"rating"/i, /"salesCount"/i, /"reviewCount"/i, /"customers"/i, /"testimonial"/i]) {
      expect(manifest, `portfolio manifest matches ${banned}`).not.toMatch(banned);
    }
  });

  it('portfolio pages never claim certification or measured accuracy', () => {
    const dirs = ['pages', 'components/portfolio'];
    let src = '';
    for (const d of dirs) {
      walk(path.join(ROOT, d), (f) => { src += fs.readFileSync(f, 'utf8'); });
    }
    expect(src).not.toMatch(/certified compliant|production-approved|guaranteed savings|zero false positives|98% accurate/i);
  });
});

function collectSource(): string {
  const dirs = ['App.tsx', 'pages', 'components', 'services', 'catalog', 'utils', 'contexts', 'hooks'];
  let out = '';
  for (const entry of dirs) {
    const p = path.join(ROOT, entry);
    if (fs.statSync(p).isDirectory()) {
      walk(p, outFile => { out += fs.readFileSync(outFile, 'utf8'); });
    } else {
      out += fs.readFileSync(p, 'utf8');
    }
  }
  return out;
}

function walk(dir: string, cb: (file: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else if (/\.(ts|tsx)$/.test(entry.name)) cb(full);
  }
}

/**
 * pages/CheckoutPage.tsx was previously on the purged list because the old one
 * was a mock storefront with invented balances and fake "purchases".
 *
 * The current file is the opposite: it renders only data returned by the real
 * /api/payments/* and /api/quota endpoints, which are backed by PostgreSQL and
 * signed NowPayments callbacks. These assertions pin that distinction so the
 * mock version can never quietly return.
 */
describe('checkout page is real, not a mock storefront', () => {
  const source = fs.readFileSync(path.join(ROOT, 'pages/CheckoutPage.tsx'), 'utf8');

  it('drives itself from the real billing API', () => {
    expect(source).toContain('/api/payments/plans');
    expect(source).toContain('/api/payments/create');
    expect(source).toContain('/api/payments/status');
    expect(source).toContain('/api/quota');
  });

  it('hard-codes no prices, balances or fake wallet state', () => {
    // Prices and balances must come from the server, never from the bundle.
    expect(source).not.toMatch(/balance\s*[:=]\s*\{?\s*(fiat|crypto)/i);
    expect(source).not.toMatch(/\bmockPlans\b|\bfakeInvoice\b|\bdemoBalance\b/i);
  });

  it('shows the wrong-network warning before payment', () => {
    expect(source).toContain('warning');
    expect(source).toMatch(/شبکه/);
  });

  it('gives every async state a terminal outcome and a retry control', () => {
    expect(source).toContain('AbortError');   // timeout handling
    expect(source).toContain('تلاش دوباره');  // retry button
    expect(source).toMatch(/setPlansStatus\('error'\)/);
  });
});
