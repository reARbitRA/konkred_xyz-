# RECON REPORT — Phase 0

All ten questions answered from source. Every claim below is backed by a file
path plus a verbatim excerpt or raw command output. Nothing here is inferred
from documentation.

Commands used for the raw numbers:

```
npm ci --no-audit --no-fund      # 732 packages (node_modules was absent)
npm test                         # vitest run
npm run lint                     # tsc --noEmit
gh api repos/reARbitRA/konkred-AI-ecosystem/contents/<path>   # read-only gateway cross-read
```

---

## 1 · Validator API — `catalog/validate.ts`

**Four value exports and three type exports. Nothing throws; every validator
returns an array (empty = valid). There is no `(output, outputSchema)` overload
— the output validator takes the whole `ProductRecord`, not a bare schema.**

Verbatim export signatures (`catalog/validate.ts`):

```ts
export const PRODUCT_STATUSES: ProductStatus[] = [ ... ];

export const PRODUCT_CATEGORIES = [ ... ] as const;

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validateManifest(manifest: ProductManifest): ValidationIssue[]

export interface InquiryFormValues { name: string; email: string; company?: string; message?: string; acceptedTerms: boolean; }

export function validateInquiryForm(values: InquiryFormValues): string[]

export function validateDemoInput(product: ProductRecord, payload: unknown): string[]

export function validateDemoOutput(product: ProductRecord, output: unknown): string[]
```

Consequences for Phase 2:

* Step 3 (input validation) uses `validateDemoInput(product, body)`. It already
  enforces `required`, primitive `type`, and `minLength` — verbatim:

  ```ts
  if (prop.type === 'string' && typeof value[key] === 'string' && prop.minLength && value[key].length < prop.minLength) {
    errors.push(`Field "${key}" must be at least ${prop.minLength} characters.`);
  }
  ```

* Step 9 (output validation) uses `validateDemoOutput(product, output)`. It
  validates top-level `required`, primitive types, `enum`, and recurses **one
  level** into `array.items` (`required`, primitive types, `enum` on item
  properties). It does **not** recurse into nested objects beyond that, and it
  does not validate `minLength` on output. That is the ceiling of what
  `502 OUTPUT_SCHEMA_VIOLATION` can detect; no deeper guarantee is claimed.

* A non-empty array is the failure signal. No try/catch is required around
  either validator.

---

## 2 · Where are the other 21 suites?

**File: `content/catalogue/portfolio-36.json`, loaded by `content/catalogue/portfolio.ts`.**

```
$ python3 - <<'PY'
suites 21 workflows 15
suite demo values: {"<class 'NoneType'>"}
suites with demo non-null: []
wf demo keys: ['available','fixturePath','fixtureSource','fixtureLabel','prompt','inputSchema','outputSchema','legacyPricing','legacyLimitations']
```

**Answer to the critical question: the 21 suites are metadata-only. Every one
of them has `"demo": null`. They carry no `prompt`, no `inputSchema` and no
`outputSchema`. They are therefore `runnable: false` and no prompt has been
invented for them.**

Verbatim suite record shape (`content/catalogue/types.ts`, mirrored 1:1 by the
JSON — the first suite `customer-support-control` has exactly these keys):

```ts
export interface PortfolioEntry {
  id: string; slug: string; type: PortfolioEntryType; title: string;
  parentId: string | null; parentRoute?: string; route: string;
  legacySlug: string | null; category: string; buyer: string | null;
  humanApprover: string | null; humanApprovalRequired: boolean;
  status: PortfolioStatus; staticDesignScore: number | null;
  validationStatus: ValidationStatus; publicDemo: boolean;
  experiencePattern: string; jobToBeDone: string | null; definition: string | null;
  modules: string[]; useCases: string[]; exclusions: string[];
  inputSummary: string[]; outputSummary: string[]; validators: string[];
  controlRequirements: string[]; failureModes: string[]; runbook: string[];
  productBoundary: string | null; buyerValue: string | null;
  publicValidation: PortfolioValidation; autonomousActions: never[];
  validationReport: string | null; promptReference: string | null;
  pricing: PortfolioPricing; demo: PortfolioDemo | null; updatedAt: string;
}
```

The UI filters live in `pages/CataloguePage.tsx:249-256`:

```tsx
{(['all', 'SUITE', 'WORKFLOW'] as const).map((t) => (
  ... {t === 'all' ? `All ${ENTRIES.length}` : t === 'SUITE' ? `Suites ${SUITES.length}` : `Workflows ${WORKFLOWS.length}`}
```

Each of the 15 WORKFLOW entries carries a `legacySlug` that maps onto a product
in `catalog/product-manifest.json` (e.g. `contract-review` → `contract-review-copilot`).
That mapping is the bridge the new routes use, so all 36 are reachable from one
endpoint.

The suites use a **different status enum** from the products:

```
statuses suites:    ['INTERNAL_CONTROLLED_PILOT', 'PUBLIC_CATALOGUE_SUPERVISED']
statuses workflows: ['CONDITIONAL_VALIDATION','ENTERPRISE_INTEGRATION','PUBLIC_CATALOGUE_SUPERVISED','PUBLIC_DEMO','WORKFLOW_KIT']
```

versus the product manifest's four: `PUBLIC_DEMO | STANDARD_KIT | SUPERVISED_PILOT | ENTERPRISE_INTEGRATION`.
The runner gates on the **product manifest** status, because that is the enum
the brief's status legend refers to. Both are exposed in the API response
(`status` = catalogue status, `runStatus` = manifest status) so neither is lost.

---

## 3 · Manifest duplication

```
$ md5sum catalog/product-manifest.json agent/PRODUCT_MANIFEST.json
5abcf4f77abaf81054fea30c3a96e9f4  catalog/product-manifest.json
5abcf4f77abaf81054fea30c3a96e9f4  agent/PRODUCT_MANIFEST.json
```

* **Canonical:** `agent/PRODUCT_MANIFEST.json`, per `agent/IMPLEMENTATION_PLAN.md:18`:
  > `agent/PRODUCT_MANIFEST.json` is the canonical 15-product manifest. The runtime imports a byte-identical copy at `catalog/product-manifest.json` (a test asserts equality).
* **Runtime import:** only the `catalog/` copy is imported (`catalog/products.ts:6`, `server.ts:16`).
* **Enforced?** Partly. `tests/manifest.test.ts:15` asserts deep equality:
  ```ts
  it('agent/PRODUCT_MANIFEST.json and catalog/product-manifest.json are byte-identical', () => {
    expect(CATALOG_MANIFEST).toEqual(AGENT_MANIFEST);
  });
  ```
* **`catalog/types.ts` sync: NOT enforced by anything.** `ProductRecord` is a
  hand-written mirror. A field could be added to the JSON and never typed, or
  typed and never present. **This gap is closed in Phase 6** by
  `tests/workflow-manifest-sync.test.ts`, which asserts the key set of every
  product record equals the key set declared in `catalog/types.ts`
  (parsed from source), in both directions.
* **Generator?** `scripts/build-portfolio-manifest.mjs` reads
  `catalog/product-manifest.json` and *produces* `content/catalogue/portfolio-36.json`
  (`scripts/build-portfolio-manifest.mjs:16`). It does **not** produce either
  product-manifest copy; those two are maintained by hand and kept identical by
  the test above.

---

## 4 · Route inventory

Two deploy targets share one route surface:

* **Vercel**: `api/index.ts` → `server/gateway-proxy.ts` owns 6 paths; billing
  owns 6; **everything else falls through to the bundled legacy Express app**
  (`lib/fullkonk-server.cjs`, built from `server.ts`).
* **Node/local**: `start.ts` → `server.ts` `createApp()`.

| Method | Path | Owner | Auth | Metered |
|---|---|---|---|---|
| GET | `/api/health`, `/api/ready` | proxy + express | public | n/a |
| GET | `/api/auth/github/url` | express | public | n/a |
| GET | `/auth/callback` | express | OAuth code | n/a |
| POST | `/api/ai` | proxy → gateway | same-origin | **yes** (`METERED_ROUTES`) |
| GET | `/api/fullkonk/providers` | proxy → gateway | same-origin | no (read-only) |
| POST | `/api/fullkonk/generate` | proxy → gateway | same-origin | **yes** |
| POST | `/api/fullkonk/github/export` | proxy → gateway | same-origin | no (not inference) |
| POST | `/api/ai/generate` | **express (legacy)** | **none** | **NO — see below** |
| POST | `/api/fullkonk/optimize-prompt` | express (legacy) | Firebase bearer | **NO — see below** |
| POST | `/api/fullkonk/generate` (legacy dup) | express (legacy) | Firebase bearer | no |
| GET | `/api/fullkonk/sessions/:userId` | express | Firebase bearer | n/a |
| POST | `/api/fullkonk/usage` | express | Firebase bearer | n/a |
| GET | `/api/fullkonk/analytics/:userId` | express | Firebase bearer | n/a |
| POST | `/api/fullkonk/github/export` (legacy dup) | express | Firebase bearer | n/a |
| POST | `/api/demo/run` | express | **none** | **NO — see below** |
| GET | `/api/quota` | billing | server-derived identity | n/a |
| GET | `/api/payments/plans` | billing | public | n/a |
| POST | `/api/payments/create` | billing | server-derived identity | rate-limited in SQL |
| GET | `/api/payments/status` | billing | owner-scoped | n/a |
| POST | `/api/payments/nowpayments/webhook` | billing | HMAC signature | n/a |
| ALL | `/api/internal/*` | billing | `INTERNAL_API_KEY` | n/a |
| ALL | `/api/<unknown>` | express | public | 404 JSON |

### Unmetered paid-inference routes — FLAGGED

Three routes perform paid inference and take no quota. This is the same class
of bug as the `/api/ai` paywall bypass already found once.

1. **`POST /api/ai/generate`** (`server.ts:343`) — completely unauthenticated
   fan-out to Gemini, Anthropic, OpenAI, OpenRouter, Groq, DeepSeek, Mistral,
   xAI, Cerebras, SambaNova, Together, Fireworks and Perplexity using
   server-side keys, with a caller-chosen `provider`, `model`, `maxTokens` and
   free-text `messages`. No auth, no metering, no rate limit. On Vercel it is
   reachable because the proxy falls through to the legacy app. **This is a
   larger hole than the one already fixed**, because it is not behind the
   gateway at all and the caller picks the model.
2. **`POST /api/demo/run`** (`server.ts:823`) — unauthenticated Gemini
   `generateContent` per request, gated only by `ENABLE_PRODUCT_DEMOS` and the
   presence of `GEMINI_API_KEY`. No per-IP limit, no daily ceiling.
3. **`POST /api/fullkonk/optimize-prompt`** (`server.ts:523`) — authenticated
   but unmetered orchestrator call.

These are **reported, not silently fixed**: the brief scopes this session to the
workflow runner and forbids refactoring `fullkonk`. The new
`/api/workflows/:slug/run` and `/api/workflows/:slug/demo` routes are metered
and rate-limited from the first line of code. The three findings above are
carried into `docs/ROUTE_AUDIT.md` with a recommended fix each.

---

## 5 · Test baseline

```
$ npm test
 Test Files  20 passed | 1 skipped (21)
      Tests  307 passed | 6 skipped (313)
   Duration  25.22s
EXIT=0

$ npm run lint
> tsc --noEmit
LINT_EXIT=0
```

**313 total (307 passing, 6 skipped — `tests/billing-postgres.test.ts` skips
without a live PostgreSQL). `docs/PHASE_STATUS.md` is correct; the README is
wrong.** The README claims 317 in three places (`README.md:23`, `:231`, `:310`)
and in the metrics SVG alt text (`README.md:30`). Corrected in this session.

---

## 6 · Deployment state

```
$ git log --oneline -20
657b07b Create README.md

$ git branch -a
* arena/01a0e3f5-konkred-xyz
  main
  remotes/origin/HEAD -> origin/main
  remotes/origin/main
```

The clone is **shallow** (`.git/shallow` present), so only the tip commit of
`main` is visible; the 20-commit history referenced by `docs/PHASE_STATUS.md`
is not in this checkout. Work is on the session branch
`arena/01a0e3f5-konkred-xyz`, branched from `657b07b`. `docs/PHASE_STATUS.md`
references a *different* branch (`arena/01a0cb39-konkred-xyz`) that does not
exist here — that earlier session's work is present in the tree but its branch
is not. **Nothing has been deployed by this session, and nothing will be.**

---

## 7 · Environment contract (read from code, not docs)

| Variable | Read at | Purpose |
|---|---|---|
| `KONKRED_GATEWAY_URL` (fallback `BRAIN_URL`) | `server/gateway-proxy.ts:configFromEnv`, `server.ts:121` | gateway root URL; must be https + non-localhost when `NODE_ENV=production` |
| `KONKRED_GATEWAY_API_KEY` | `configFromEnv` | sent as `x-api-key` on `POST /api/ai` |
| `FULLKONK_KEY` (fallback `BRAIN_KEY`) | `configFromEnv` | sent as `x-brain-key` on `/api/fullkonk/*` |
| `DATABASE_URL` | `server/billing-runtime.ts:billingConfigured`, `getPaymentRoutes`, `getMeter` | PostgreSQL DSN; absent ⇒ billing 503 and metering no-op |
| `DATABASE_SSL_INSECURE` | `sslConfigFor` | documented escape hatch only |
| `ANON_SALT` | `getPaymentRoutes`, `getMeter` | anon identity hashing salt |
| `FIREBASE_PROJECT_ID` | `verifyIdTokenFactory` | enables `fb:` identities |
| `INTERNAL_API_KEY` | `createInternalQuotaRoutes` | Telegram bot service token |
| `TRIAL_MESSAGES`, `TRIAL_ENABLED`, `DAILY_FREE_MESSAGES`, `DAILY_MODE` | `Billing` options | allowance policy |
| `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_IPN_CALLBACK_URL`, `NOWPAYMENTS_API_BASE` | `Payments` | payments |
| `GEMINI_API_KEY` / `API_KEY` | `server.ts:343`, `:823` | legacy direct-Gemini routes |
| `ENABLE_PRODUCT_DEMOS` | `server.ts:823` | legacy demo flag |
| `GITHUB_CLIENT_ID/SECRET`, `GITHUB_TOKEN` | `server.ts` | OAuth + export |
| `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD` | `src/db/index.ts` | legacy Drizzle user table (separate from billing) |

New in this session (both optional, both with safe defaults):

| Variable | Default | Purpose |
|---|---|---|
| `WORKFLOW_DEMO_DAILY_MAX` | `200` | global anonymous demo ceiling per UTC day |
| `WORKFLOW_DEMO_IP_HOURLY_MAX` | `5` | per-IP anonymous demo limit per rolling hour |

`.env.example` documents `KONKRED_GATEWAY_URL`, `KONKRED_GATEWAY_API_KEY` and
`FULLKONK_KEY` correctly but **does not document `DATABASE_URL`, `ANON_SALT`,
`INTERNAL_API_KEY` or any `NOWPAYMENTS_*` variable**. That omission is fixed in
this session.

---

## 8 · Fixtures

All 15 products have a fixture and all 15 files exist:

```
contract-review-copilot          catalog/fixtures/contract-review-sample.json      exists=True
iac-security-copilot             catalog/fixtures/iac-security-sample.json         exists=True
ma-due-diligence-workbench       catalog/fixtures/ma-due-diligence-sample.json     exists=True
incident-learning-postmortem     catalog/fixtures/incident-sample.json             exists=True
grc-evidence-request-triage      catalog/fixtures/grc-requests-sample.json         exists=True
reconciliation-copilot           catalog/fixtures/reconciliation-sample.json       exists=True
rfp-response-copilot             catalog/fixtures/rfp-response-sample.json         exists=True
govcon-rfp-compliance-workbench  catalog/fixtures/govcon-rfp-sample.json           exists=True
fpa-variance-analysis            catalog/fixtures/fpa-sample.json                  exists=True
executive-flash-brief            catalog/fixtures/executive-brief-sample.json      exists=True
commercial-lease-abstraction     catalog/fixtures/commercial-lease-sample.json     exists=True
seo-content-opportunity-planner  catalog/fixtures/seo-sample.json                  exists=True
evidence-backed-prd-generator    catalog/fixtures/prd-sample.json                  exists=True
customer-health-churn-copilot    catalog/fixtures/customer-health-sample.json      exists=True
ab-experiment-interpretation     catalog/fixtures/ab-test-sample.json              exists=True
```

**No product is missing a fixture.** Shape: each file is a flat JSON object
whose keys are the product's `inputSchema` properties, plus one extra
descriptive key `sampleLabel` present in all 15:

```
ab-test-sample.json          ['sampleLabel','testName','hypothesis','metrics']
commercial-lease-sample.json ['sampleLabel','leaseText']
contract-review-sample.json  ['sampleLabel','jurisdiction','contractText']
customer-health-sample.json  ['sampleLabel','accounts']
executive-brief-sample.json  ['sampleLabel','items']
fpa-sample.json              ['sampleLabel','period','lines']
govcon-rfp-sample.json       ['sampleLabel','solicitationExcerpt']
grc-requests-sample.json     ['sampleLabel','requests']
iac-security-sample.json     ['sampleLabel','manifests']
incident-sample.json         ['sampleLabel','context','timeline']
ma-due-diligence-sample.json ['sampleLabel','documents','playbook']
prd-sample.json              ['sampleLabel','productContext','evidence']
reconciliation-sample.json   ['sampleLabel','bankTransactions','ledgerEntries']
rfp-response-sample.json     ['sampleLabel','questions','contentLibrary']
seo-sample.json              ['sampleLabel','keywords','existingContent']
```

`sampleLabel` is not in any `inputSchema`; `validateDemoInput` ignores
undeclared keys, so fixtures validate unchanged. Typed loader:
`catalog/fixtures.ts` exports `FIXTURES: Record<string, unknown>` keyed by the
**legacy product slug**.

---

## 9 · Does any product need a multi-stage pipeline?

**No. All 15 are single call + validation.** Determined by reading every
`prompt` and `outputSchema` in `catalog/product-manifest.json`:

* No prompt references a prior stage's output, a retrieval step, a tool call,
  or an external validator.
* Every `outputSchema` is one flat object of scalars and one-level arrays; none
  contains a field that could only be produced by a second model pass.
* Every prompt is self-contained and terminates in a single structured
  document (`issueRegister`, `clauseFindings`, `requirements`, `variances`, …).

The only multi-call need is **size**, not **structure**: four products can
receive input larger than a single private-safe context window
(`ma-due-diligence-workbench`, `govcon-rfp-compliance-workbench`,
`commercial-lease-abstraction`, `contract-review-copilot`). Those are handled by
the chunk-then-synthesise path in Phase 4 — the same single-stage prompt applied
per chunk plus one merge pass — **not** by a bespoke pipeline per product.

---

## 10 · Gateway cross-read (read-only)

Source: `reARbitRA/konkred-AI-ecosystem` → `gateway/data/policies.registry.json`,
`gateway/src/policy-store.mjs`, `gateway/src/gateway/router.mjs`,
`gateway/src/gateway/gateway.mjs`, `gateway/src/config.mjs`. **Nothing in that
repository was modified.**

### 10a · Context windows

| model id | provider | contextWindow | quality | rpm | rpd | tpm | tpd |
|---|---|---|---|---|---|---|---|
| gemini:flash | gemini | 1048576 | 4 | 15 | 1500 | 1000000 | — |
| gemini:flash-lite | gemini | 1048576 | 3 | 30 | 1500 | 1000000 | — |
| groq:gpt-oss-120b | groq | 131072 | 4 | 30 | 1000 | 8000 | 200000 |
| groq:llama-70b | groq | 131072 | 4 | 30 | 1000 | 12000 | 100000 |
| groq:llama-8b | groq | 131072 | 2 | 30 | 14400 | 6000 | 500000 |
| groq:qwen3-32b | groq | 131072 | 3 | 60 | 1000 | 6000 | 500000 |
| groq:kimi-k2 | groq | 131072 | 4 | 60 | 1000 | 10000 | 300000 |
| groq:llama-4-scout | groq | 131072 | 3 | 30 | 1000 | 30000 | 500000 |
| **cerebras:gpt-oss-120b** | cerebras | **8192** | 4 | 30 | 10000 | 60000 | 1000000 |
| **cerebras:llama-8b** | cerebras | **8192** | 2 | 30 | 10000 | 60000 | 1000000 |
| cerebras:qwen3-235b | cerebras | 65536 | 5 | 10 | 100 | 20000 | 500000 |
| mistral:small | mistral | 128000 | 3 | 60 | — | 50000 | — |
| mistral:codestral | mistral | 256000 | 4 | 60 | — | 40000 | — |
| openrouter:free-auto | openrouter | 32768 | 3 | 20 | 50 | — | — |
| **cloudflare:llama-8b** | cloudflare | **8192** | 2 | 300 | 400 | 100000 | — |
| github:gpt-4o | github | 128000 | 5 | 10 | 50 | 8000 | — |
| github:gpt-4o-mini | github | 128000 | 3 | 15 | 150 | 10000 | — |
| mock:atlas-70b | mock | 131072 | 4 | 100 | 10000 | 500000 | 5000000 |
| mock:sparrow-8b | mock | 131072 | 2 | 100 | 10000 | 500000 | 5000000 |

**Implausible for their model class:**

* **`cerebras:gpt-oss-120b` at `8192`** — a 120B-class model registered with an
  8K window. This is the entry the brief predicted. `gpt-oss-120b` ships with a
  131,072-token context. Consequence in code (`gateway/src/gateway/gateway.mjs:288-293`):
  ```js
  if (decision.decision === DECISION.TRIM_CONTEXT) {
    const budget = Math.max(512, Math.floor((candidate.model.contextWindow ?? 8192) * config.contextTrimRatio));
    const trimmed = trimMessages(workingMessages, budget, { dropRatio: config.contextTrimRatio });
  ```
  With `contextTrimRatio = 0.45` (`gateway/src/config.mjs:136`) the budget
  becomes **3,686 tokens ≈ 14 KB of text**, and `trimMessages` silently
  truncates the tail of the customer document
  (`gateway/src/gateway/fusion.mjs`, "Last resort: truncate the final turn
  itself"). A 40-page contract would be reviewed on its last ~14 KB with no
  error returned. This is a **correctness-critical** registry error.
* **`cerebras:llama-8b` at `8192`** — llama-3.1-8b is a 128K model on Cerebras.
  Lower impact (quality 2, rarely selected for these products) but wrong.
* **`cloudflare:llama-8b` at `8192`** — plausible-but-conservative; Workers AI
  exposes 8K on some deployments. Flagged as *verify*, not *wrong*.
* `cerebras:qwen3-235b` at `65536` is plausible (Cerebras caps this model
  below the native window on the free tier). Flagged as *verify*.

The exact patch is in `docs/GATEWAY_PATCH_LIST.md`. **Not applied — that repo
is out of scope for edits.**

### 10b · Providers flagged `trainsOnData: true`

```
gemini      True
groq        False
cerebras    False
mistral     True
openrouter  False
cloudflare  False
github      False
mock        False
```

**Exactly two: `gemini` and `mistral`.**

### 10c · Capacity under `privacy: 'private'`

Enforcement point (`gateway/src/gateway/router.mjs`):

```js
const requirePrivate = String(privacy).toLowerCase() === 'private';
...
if (requirePrivate && provider.trainsOnData) continue;
```

Excluding `gemini`, `mistral` and `mock` (mock only runs with `DEMO_MOCK`/
`MOCK_FALLBACK` enabled), **13 model entries survive** across 5 providers:
groq (6), cerebras (3), openrouter (1), cloudflare (1), github (2).

**Requests/day remaining: 40,150 rpd** (sum of `rpd` across the 13 surviving
entries, per key). **Tokens/day remaining: 4,600,000 tpd** counting only the 9
entries that declare an explicit `tpd`; the other 4 (openrouter, cloudflare,
github ×2) declare no daily token cap and are bounded by `rpd` and `tpm`
instead.

**Quality-4-or-better models that survive `private`: 6** —
`groq:gpt-oss-120b` (4), `groq:llama-70b` (4), `groq:kimi-k2` (4),
`cerebras:gpt-oss-120b` (4), `cerebras:qwen3-235b` (5), `github:gpt-4o` (5).

**Honest reading of that number — the bad news is in the task routing, not the
headline capacity.** `gateway/src/policy-store.mjs` hard-codes the preference
list per task type, and the scoring in `router.mjs` gives an explicit
preference a −40 bonus that dominates quality. Under `privacy: 'private'`:

| taskType | preference list after removing gemini/mistral | best surviving quality |
|---|---|---|
| `general` | groq:llama-70b, cerebras:gpt-oss-120b | **4** |
| `summarization` | groq:llama-70b, cerebras:gpt-oss-120b, groq:llama-8b | **4** |
| `architecture` | cerebras:qwen3-235b, github:gpt-4o, groq:kimi-k2 | **5** |
| `bug-fixing` | groq:gpt-oss-120b, cerebras:gpt-oss-120b, github:gpt-4o | **4** |
| `code-generation` | groq:gpt-oss-120b, cerebras:gpt-oss-120b, github:gpt-4o | **4** |
| **`extraction`** | **groq:llama-8b, cerebras:llama-8b** | **2** |
| `translate` | groq:llama-8b, cerebras:llama-8b, cloudflare:llama-8b | 2 |

**`extraction` collapses to quality-2 8B models once `private` is enforced**,
because its only high-quality preferred model is `gemini:flash`. Mapping
contract review or lease abstraction to `extraction` — the intuitive choice —
would silently route high-risk legal work to an 8B model. **This session
therefore assigns no product to `extraction`** (see `docs/AGENT_DECISIONS.md`
D-3) and recommends a two-line gateway patch adding the private-safe q4/q5
models to that preference list.

**Effective throughput for the catalogue.** With `creditsPerRun` between 2 and
16 and one gateway request per credit-bearing chunk, the binding constraint is
`tpm`, not `rpd`. The q4/q5 private lane sums to roughly
**600,000 tokens/day** (`groq:gpt-oss-120b` 200k + `groq:llama-70b` 100k +
`groq:kimi-k2` 300k) plus `cerebras:gpt-oss-120b` 1,000,000 tpd on an 8K
context — usable only after the context-window patch. At a realistic
12,000 tokens in + 3,000 out per workflow run, that is **≈40 high-quality runs
per day per provider key** before the ceiling drops the request onto quality-3
or quality-2 models. See §9 of `docs/FINAL_REPORT.md` for what that means
commercially.
