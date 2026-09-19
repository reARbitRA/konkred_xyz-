import { ENTRIES, getEntryBySlug } from '../content/catalogue/portfolio.ts';
import type { PortfolioEntry } from '../content/catalogue/types.ts';

export type CatalogueType = 'ALL' | 'SUITE' | 'WORKFLOW';

export interface CatalogueEntry {
  number: number;
  source: PortfolioEntry;
  parent?: PortfolioEntry;
  input: string;
  output: string;
}

/**
 * Canonical catalogue model.
 *
 * The 36 entries are deliberately not assigned to product surfaces such as
 * fullKONK, AUDITOR, or REDAEYE. They are a separate portfolio: 21 canonical
 * ARB suites (each consolidating related enterprise prompt families) plus 15
 * narrower validated workflows that point to a parent suite.
 */
export const CATALOGUE_ENTRIES: CatalogueEntry[] = ENTRIES.map((source, index) => ({
  number: index + 1,
  source,
  parent: source.parentId ? ENTRIES.find((entry) => entry.id === source.parentId) : undefined,
  input: source.inputSummary[0] ?? 'Versioned source material and owner context',
  output: source.outputSummary[0] ?? 'Structured review artifact with source references',
}));

export const SUITE_ENTRIES = CATALOGUE_ENTRIES.filter((entry) => entry.source.type === 'SUITE');
export const WORKFLOW_ENTRIES = CATALOGUE_ENTRIES.filter((entry) => entry.source.type === 'WORKFLOW');

export const catalogueEntryForSlug = (slug: string) => {
  const source = getEntryBySlug(slug);
  return source ? CATALOGUE_ENTRIES.find((entry) => entry.source.id === source.id) : undefined;
};
