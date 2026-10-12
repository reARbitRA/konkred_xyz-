/**
 * Runtime catalogue layer — the single place that joins the two data sources
 * behind the 36-item catalogue and derives every execution property from them.
 *
 * Two manifests exist and both are canonical for different things:
 *
 *   content/catalogue/portfolio-36.json  — all 36 entries (21 SUITE + 15
 *       WORKFLOW). The SUITE entries are metadata-only: every one of them has
 *       `demo: null` and carries no prompt or schema, so none of them is
 *       executable. No prompt has been invented for them.
 *
 *   catalog/product-manifest.json        — the 15 executable workflow products
 *       with prompt, inputSchema, outputSchema, fixture, taskType, privacy,
 *       creditsPerRun and the runnable flags.
 *
 * A WORKFLOW entry's `legacySlug` is the product's `slug`; that is the join.
 * Both slugs address the same item through the API, so neither the canonical
 * catalogue URLs nor the older product URLs break.
 *
 * Client-safe: imports JSON only, no node built-ins, no secrets.
 */
import { ENTRIES, getEntryBySlug, getEntryByLegacySlug } from '../content/catalogue/portfolio.ts';
import type { PortfolioEntry } from '../content/catalogue/types.ts';
import { PRODUCTS, getProductBySlug } from './products.ts';
import type { GatewayTaskType, ProductRecord, ProductStatus } from './types.ts';

/** Verbatim from the gateway's TASK_PREFERENCES (gateway/src/policy-store.mjs). */
export const GATEWAY_TASK_TYPES: readonly GatewayTaskType[] = [
  'general',
  'code-generation',
  'bug-fixing',
  'architecture',
  'summarization',
  'translate',
  'extraction',
] as const;

/**
 * Runnability derived from the manifest status legend. This is the ONLY
 * definition; the manifest fields are asserted against it by a test so the
 * stored value can never drift from the rule.
 */
export function runnabilityForStatus(status: ProductStatus): { runnable: boolean; runnableForAnon: boolean } {
  switch (status) {
    case 'PUBLIC_DEMO':
      return { runnable: true, runnableForAnon: true };
    case 'STANDARD_KIT':
    case 'SUPERVISED_PILOT':
      return { runnable: true, runnableForAnon: false };
    case 'ENTERPRISE_INTEGRATION':
      return { runnable: false, runnableForAnon: false };
    default: {
      // Unknown status must never accidentally become self-serve.
      const exhaustive: never = status;
      void exhaustive;
      return { runnable: false, runnableForAnon: false };
    }
  }
}

/**
 * Published credit formula: `1 + ceil(maxInputTokens / 8000)`.
 *
 * One credit is the base cost of a metered run; every further 8,000 tokens of
 * accepted input adds one, because long inputs consume a proportionally larger
 * share of a shared free-tier token budget and may require more than one
 * upstream call (chunk-then-synthesise). Long-input legal and M&A products
 * therefore carry a visibly higher number — `ma-due-diligence-workbench` is 16
 * against `executive-flash-brief`'s 2 — and that number is returned by
 * `GET /api/workflows` and `GET /api/workflows/:slug` before anything is run.
 */
export function expectedCreditsPerRun(maxInputTokens: number): number {
  return 1 + Math.ceil(maxInputTokens / 8000);
}

/**
 * Tokens above which a single request cannot be trusted to fit a private-safe
 * provider context, so the runner chunks instead of sending one call.
 *
 * Under `privacy: 'private'` the surviving models top out at a 131,072-token
 * window (groq) and drop as low as 65,536 (cerebras:qwen3-235b) — and one
 * entry, cerebras:gpt-oss-120b, is registered at 8,192, which would silently
 * trim the document (see docs/GATEWAY_PATCH_LIST.md). 48,000 leaves room for
 * the system prompt, the JSON envelope and the output budget inside the
 * smallest plausible real window.
 */
export const CHUNK_THRESHOLD_TOKENS = 48_000;

export type CatalogueItemType = 'SUITE' | 'WORKFLOW';

/** One row of GET /api/workflows. Suites and workflows share this shape. */
export interface CatalogueItem {
  slug: string;
  /** The product-manifest slug for workflows; null for suites. */
  productSlug: string | null;
  type: CatalogueItemType;
  name: string;
  category: string;
  /** Catalogue status (portfolio-36 enum, 6 values). */
  status: string;
  /** Product-manifest status (4 values) that the runner gates on; null for suites. */
  runStatus: ProductStatus | null;
  risk: 'low' | 'medium' | 'high' | null;
  humanApprovalRequired: boolean;
  demoAvailable: boolean;
  runnable: boolean;
  runnableForAnon: boolean;
  taskType: GatewayTaskType | null;
  privacy: string | null;
  creditsPerRun: number | null;
  maxInputTokens: number | null;
  route: string;
  shortDescription: string;
  /** Present so a metadata-only suite explains itself instead of looking broken. */
  notRunnableReason: string | null;
}

const SUITE_REASON =
  'Suite entries are catalogue metadata: they carry no prompt, input schema or output schema, ' +
  'so there is nothing to execute. Delivery is a controlled engagement, not a self-serve run.';

const ENTERPRISE_REASON =
  'This product is ENTERPRISE_INTEGRATION: it requires security review and a signed engagement ' +
  'before it can be run. Contact is the only self-serve action.';

function summarise(entry: PortfolioEntry, product: ProductRecord | undefined): CatalogueItem {
  if (!product) {
    return {
      slug: entry.slug,
      productSlug: null,
      type: entry.type,
      name: entry.title,
      category: entry.category,
      status: entry.status,
      runStatus: null,
      risk: null,
      humanApprovalRequired: entry.humanApprovalRequired,
      demoAvailable: false,
      runnable: false,
      runnableForAnon: false,
      taskType: null,
      privacy: null,
      creditsPerRun: null,
      maxInputTokens: null,
      route: entry.route,
      shortDescription: entry.jobToBeDone || entry.definition || entry.title,
      notRunnableReason: SUITE_REASON,
    };
  }
  return {
    slug: entry.slug,
    productSlug: product.slug,
    type: entry.type,
    name: product.name,
    category: product.category,
    status: entry.status,
    runStatus: product.status,
    risk: product.risk,
    // Never reported as optional. Forced true on responses as well as here.
    humanApprovalRequired: true,
    demoAvailable: Boolean(product.demoStatus?.available && product.fixture),
    runnable: product.runnable,
    runnableForAnon: product.runnableForAnon,
    taskType: product.taskType,
    privacy: product.privacy,
    creditsPerRun: product.creditsPerRun,
    maxInputTokens: product.maxInputTokens,
    route: entry.route,
    shortDescription: product.shortDescription,
    notRunnableReason: product.runnable ? null : ENTERPRISE_REASON,
  };
}

/** All 36 catalogue items, suites and workflows, in manifest order. */
export function listCatalogueItems(): CatalogueItem[] {
  return ENTRIES.map((entry) =>
    summarise(entry, entry.legacySlug ? getProductBySlug(entry.legacySlug) : undefined),
  );
}

/** Resolve by canonical catalogue slug OR by legacy product slug. */
export function resolveCatalogueEntry(slug: string): PortfolioEntry | undefined {
  const key = (slug || '').trim().toLowerCase();
  if (!key) return undefined;
  return getEntryBySlug(key) ?? getEntryByLegacySlug(key);
}

/** Resolve the executable product behind a slug, if there is one. */
export function resolveProduct(slug: string): ProductRecord | undefined {
  const key = (slug || '').trim().toLowerCase();
  if (!key) return undefined;
  const entry = resolveCatalogueEntry(key);
  if (entry?.legacySlug) return getProductBySlug(entry.legacySlug);
  // A product may exist without a catalogue entry only if the two drift; the
  // sync test forbids that, but resolving directly costs nothing.
  return getProductBySlug(key);
}

/** Catalogue item for one slug (canonical or legacy). */
export function getCatalogueItem(slug: string): CatalogueItem | undefined {
  const entry = resolveCatalogueEntry(slug);
  if (!entry) return undefined;
  return summarise(entry, entry.legacySlug ? getProductBySlug(entry.legacySlug) : undefined);
}

/** Distinct categories across all 36 items, sorted. */
export function catalogueCategories(): string[] {
  return [...new Set(listCatalogueItems().map((i) => i.category))].sort();
}

/** Free-text search over the 36 items (name, description, category, slug). */
export function searchCatalogue(query: string, items = listCatalogueItems()): CatalogueItem[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) =>
      i.name.toLowerCase().includes(q) ||
      i.shortDescription.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      i.slug.includes(q) ||
      (i.productSlug || '').includes(q),
  );
}

/** Sanity accessor used by tests: the 15 executable products. */
export const EXECUTABLE_PRODUCTS: ProductRecord[] = PRODUCTS;
