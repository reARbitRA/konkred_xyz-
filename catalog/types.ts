/**
 * KONKRED product catalogue types.
 * These mirror catalog/product-manifest.json (canonical copy: agent/PRODUCT_MANIFEST.json).
 */

export type ProductStatus = 'PUBLIC_DEMO' | 'STANDARD_KIT' | 'SUPERVISED_PILOT' | 'ENTERPRISE_INTEGRATION';

export type ProductRisk = 'low' | 'medium' | 'high';

/**
 * The seven task types the Konkred Gateway routes on.
 *
 * Verbatim from the gateway's own TASK_PREFERENCES map
 * (konkred-AI-ecosystem → gateway/src/policy-store.mjs). An unknown value is
 * rejected upstream with 400 UNKNOWN_TASK_TYPE, so this union must stay in
 * sync with that file. It is declared explicitly rather than inferred from
 * `category`, because category is a marketing axis and task type is a routing
 * decision — see docs/AGENT_DECISIONS.md D-3.
 */
export type GatewayTaskType =
  | 'general'
  | 'code-generation'
  | 'bug-fixing'
  | 'architecture'
  | 'summarization'
  | 'translate'
  | 'extraction';

/**
 * Privacy class sent to the gateway. `private` makes the gateway skip every
 * provider flagged `trainsOnData: true`. Every workflow product is `private`.
 */
export type ProductPrivacy = 'private' | 'any' | 'training-ok';

export interface ProductFixtureRef {
  path: string;
  label: string;
  source: string;
}

export interface ProductDemoStatus {
  available: boolean;
  fixturePath: string | null;
  note: string;
}

export interface ProductValidationReport {
  status: 'pending' | 'available';
  path: string | null;
  note: string;
}

export interface ProductPricing {
  kitUsd: number | null;
  validationSprintUsd: number | null;
  enterprisePilot: 'contact' | null;
  currency: string;
  proposed: boolean;
}

export interface ProductRecord {
  id: string;
  slug: string;
  name: string;
  category: string;
  status: ProductStatus;
  risk: ProductRisk;
  humanApprovalRequired: boolean;
  shortDescription: string;
  description: string;
  buyer: string;
  prompt: string;
  /** Gateway routing lane. Explicit per product; never inferred from category. */
  taskType: GatewayTaskType;
  /** Always 'private' for workflow products (customer documents). */
  privacy: ProductPrivacy;
  /** Largest input this product accepts, in tokens. Drives chunking + cost. */
  maxInputTokens: number;
  /** Output budget sent as `maxTokens`. Capped by the gateway at 8192. */
  maxOutputTokens: number;
  /** Credits reserved per run: 1 + ceil(maxInputTokens / 8000). */
  creditsPerRun: number;
  /** Derived from status: ENTERPRISE_INTEGRATION is not self-serve. */
  runnable: boolean;
  /** Derived from status: only PUBLIC_DEMO is open to anonymous callers. */
  runnableForAnon: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  fixture: ProductFixtureRef | null;
  demoStatus: ProductDemoStatus;
  validationReport: ProductValidationReport;
  pricing: ProductPricing;
  limitations: string[];
}

export interface ProductManifest {
  manifest: {
    name: string;
    version: string;
    generatedAt: string;
    purpose: string;
    statusLegend: Record<ProductStatus, string>;
    integrityNote: string;
    statuses: ProductStatus[];
    /** Published cost formula; shown to users before a run is charged. */
    creditPolicy: string;
    /** Why every product is routed with privacy:'private'. */
    privacyPolicy: string;
    runnabilityLegend: Record<ProductStatus, string>;
  };
  products: ProductRecord[];
}
