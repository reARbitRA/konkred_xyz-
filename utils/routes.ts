import { PageView } from '../types.ts';
import { getEntryBySlug, getEntryByLegacySlug } from '../content/catalogue/portfolio.ts';

export interface RouteMatch {
  page: PageView;
  listingId?: string;
  slug?: string;
}

/**
 * Route map for the KONKRED platform (36-entry portfolio era).
 *
 * Canonical catalogue routes:
 *   /catalogue            — 36-entry index (21 suites + 15 workflows)
 *   /suites/:slug         — canonical ARB suite page
 *   /tools/:slug          — validated workflow page
 *   /kits/:slug           — workflow kit offer page
 *   /pricing /sprint /enterprise /partners /validation — platform pages
 *
 * Legacy routes redirect and never render fake pages:
 *   /products, /marketplace, /ktools, /sell            -> /catalogue
 *   /products/:legacySlug                              -> /tools/:slug
 *   purged marketplace routes                          -> /404
 */
export const PAGE_ROUTES: Record<PageView, string> = {
  landing: '/',
  forge_audit: '/forge-audit',
  audit: '/audit',
  fullkonk: '/fullkonk',
  redaeye: '/redaeye',
  redaeye_sandbox: '/redaeye-sandbox',
  catalogue: '/catalogue',
  suite_detail: '/suites/:slug',
  workflow_detail: '/tools/:slug',
  kit_detail: '/kits/:slug',
  pricing: '/pricing',
  sprint: '/sprint',
  enterprise: '/enterprise',
  partners: '/partners',
  validation: '/validation',
  not_found: '/404',
  academy: '/academy',
  intel: '/intel',
  network: '/network',
  advisory: '/advisory',
  documentation: '/docs',
  career: '/career',
  resources: '/resources',
  enter: '/login',
  join_network: '/join',
  account: '/account',
  contact: '/contact',
  style_guide: '/style-guide',
  verify_email: '/verify-email',
  checkout: '/checkout',
};

/** Legacy pathnames that intentionally redirect to a real page. */
const REDIRECTS: Record<string, PageView> = {
  '/marketplace': 'catalogue',
  '/ktools': 'catalogue',
  '/sell': 'catalogue',
  '/forge': 'fullkonk', // The Forge merged into fullKONK_>
  '/forge-audit-old': 'forge_audit',
  '/redaeye_sandbox': 'redaeye', // dev alias -> canonical
  '/wizard': 'not_found',
  // '/checkout' is no longer purged: it is now the real Persian billing page.
  '/wallet': 'not_found',
  '/enclave': 'not_found',
  '/library': 'not_found',
  '/usage': 'not_found',
  '/seller-dashboard': 'not_found',
  '/buyer-dashboard': 'not_found',
  '/affiliate': 'not_found',
  '/admin': 'not_found',
  '/dispute': 'not_found',
  '/metrics': 'not_found',
  '/usage-metrics': 'not_found',
  '/playgrounds': 'not_found',
  '/intel-report': 'not_found',
  '/listing': 'not_found',
};

/**
 * Get clean URL path for a given page and optional slug parameter.
 */
export function getPathForPage(page: PageView, slug?: string): string {
  if (page === 'suite_detail' && slug) return `/suites/${encodeURIComponent(slug)}`;
  if (page === 'workflow_detail' && slug) return `/tools/${encodeURIComponent(slug)}`;
  if (page === 'kit_detail' && slug) return `/kits/${encodeURIComponent(slug)}`;
  if (page === 'forge_audit') return '/forge-audit';
  return PAGE_ROUTES[page] || '/';
}

/**
 * Parse pathname into PageView and optional slug parameter.
 * Redirects for legacy/purged routes are resolved here; callers should replace
 * the URL with the resolved path when a redirect is returned.
 */
export function getPageFromPath(path: string): RouteMatch & { redirectedFrom?: string } {
  const cleanPath = path.split('?')[0].toLowerCase().replace(/\/$/, '') || '/';

  if (cleanPath === '' || cleanPath === '/') {
    return { page: 'landing' };
  }

  const segment = (prefix: string) =>
    cleanPath.startsWith(prefix) ? decodeURIComponent(cleanPath.replace(prefix, '').split('/')[0]) : null;

  // Canonical suite route: /suites/:slug (only real manifest slugs render)
  const suiteSlug = segment('/suites/');
  if (suiteSlug !== null) {
    if (!suiteSlug) return { page: 'catalogue', redirectedFrom: cleanPath };
    return getEntryBySlug(suiteSlug)?.type === 'SUITE'
      ? { page: 'suite_detail', slug: suiteSlug }
      : { page: 'not_found', redirectedFrom: cleanPath };
  }

  // Canonical workflow route: /tools/:slug
  const toolSlug = segment('/tools/');
  if (toolSlug !== null) {
    if (!toolSlug) return { page: 'catalogue', redirectedFrom: cleanPath };
    return getEntryBySlug(toolSlug)?.type === 'WORKFLOW'
      ? { page: 'workflow_detail', slug: toolSlug }
      : { page: 'not_found', redirectedFrom: cleanPath };
  }

  // Kit offer route: /kits/:slug (workflows only)
  const kitSlug = segment('/kits/');
  if (kitSlug !== null) {
    if (!kitSlug) return { page: 'catalogue', redirectedFrom: cleanPath };
    const entry = getEntryBySlug(kitSlug);
    return entry && entry.type === 'WORKFLOW'
      ? { page: 'kit_detail', slug: kitSlug }
      : { page: 'not_found', redirectedFrom: cleanPath };
  }

  // Legacy product detail: /products/:slug -> canonical /tools/:slug
  const legacySlug = segment('/products/');
  if (legacySlug !== null) {
    if (!legacySlug) return { page: 'catalogue', redirectedFrom: cleanPath };
    const entry = getEntryByLegacySlug(legacySlug) ?? getEntryBySlug(legacySlug);
    if (entry?.type === 'WORKFLOW') return { page: 'workflow_detail', slug: entry.slug, redirectedFrom: cleanPath };
    return { page: 'not_found', redirectedFrom: cleanPath };
  }

  // Purged marketplace listing details: /listing/:id -> 404
  if (cleanPath.startsWith('/listing/')) {
    return { page: 'not_found', redirectedFrom: cleanPath };
  }

  // Exact route match
  for (const [pageKey, routePath] of Object.entries(PAGE_ROUTES)) {
    if (cleanPath === routePath) {
      return { page: pageKey as PageView };
    }
  }

  // Legacy catalogue pathname -> /catalogue
  if (cleanPath === '/products') return { page: 'catalogue', redirectedFrom: cleanPath };
  if (cleanPath === '/audit' || cleanPath === '/auditor') return { page: 'forge_audit' };
  if (cleanPath === '/forum') return { page: 'network' };
  if (cleanPath === '/consulting') return { page: 'advisory' };
  if (cleanPath === '/documentation') return { page: 'documentation' };
  if (cleanPath === '/enter') return { page: 'enter' };
  if (cleanPath === '/join-network') return { page: 'join_network' };

  // Intentional redirects for purged routes
  const redirect = REDIRECTS[cleanPath];
  if (redirect) {
    return { page: redirect, redirectedFrom: cleanPath };
  }

  // Unknown -> 404
  return { page: 'not_found' };
}
