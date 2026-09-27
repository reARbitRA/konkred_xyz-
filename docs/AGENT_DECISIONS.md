# Agent decisions

Judgement calls made without stopping to ask, as instructed. Each entry records
what was decided, the evidence it rests on, what was rejected, and how hard it
would be to undo.

The standing rule when torn: implement the narrower option.

---

### D-1 — The runner is an injected-dependency Express Router in `server/`

**Decision.** `server/workflow-routes.ts` exports
`createWorkflowRouter(deps)`; every external system it touches — billing, the
run store, the gateway caller, the token verifier, the clock-free limits — is
passed in. `server.ts` constructs the real dependencies lazily and mounts the
router at `/api/workflows`, immediately before the `/api` JSON 404.

**Evidence.** `server.ts` already builds an Express app and mounts routers;
`server/gateway-proxy.ts` and `api/index.ts`, by contrast, dispatch on raw
`node:http` pathname comparisons (`grep -n "pathname ===" server/gateway-proxy.ts`).
Putting the runner in the proxy would have meant hand-rolling routing, body
parsing and param extraction. Injection is what makes
`tests/helpers/workflow-harness.ts` able to run the *real* router against
pg-mem and a stub gateway with no network and no mocking of internals.

**Alternatives rejected.** (a) Extending the raw-http proxy — more code, no
test seam. (b) A Vercel route file per endpoint — duplicates the middleware
stack and diverges from the local Express server.

**Reversibility.** Easy. The router is self-contained; deleting the mount in
`server.ts` removes the whole surface.

---

### D-2 — Public demos fail **closed** when there is no database

**Decision.** `POST /api/workflows/:slug/demo` returns
`503 DEMO_UNAVAILABLE` with `retryable:false` when no run store is configured.

**Evidence.** The demo endpoint is the only unauthenticated path that spends
real provider capacity. Its abuse ceiling is counted in SQL
(`demo_runs`). Vercel serverless instances share no memory, so an in-process
counter both resets on every cold start and is trivially bypassed by spreading
requests across instances. A limit that cannot be enforced is not a limit.

**Alternatives rejected.** (a) In-memory counter — security theatre, and the
brief forbids new infrastructure such as Redis that would make it real.
(b) Running demos uncapped without a DB — hands an anonymous caller the whole
provider budget.

**Reversibility.** Easy: one branch in `server/workflow-routes.ts`. Guard G10
in `docs/GUARD_REVERSION_PROOF.md` fails if it is removed.

---

### D-3 — No product is routed to the gateway's `extraction` task type

**Decision.** All 15 products use `architecture`, `bug-fixing`, `general` or
`summarization`.

**Evidence.** `policies.registry.json` in the gateway repo: under
`privacy:'private'` the candidate list for `extraction` loses `gemini:flash`
and `mistral:*` (both `trainsOnData:true`), and `rankCandidates` applies a −40
preference penalty that dominates the quality score, collapsing the lane to
quality-2 8B models. Sending a lease or a contract there would silently
downgrade it while still charging full price. Details in
`docs/RECON_REPORT.md` §10c.

**Alternatives rejected.** Using `extraction` for the lease and diligence
products because the name fits. The name fits; the routing does not.

**Reversibility.** Easy (a manifest field), but it should not be reverted
until the gateway's private-safe preference list for that lane is fixed — see
`docs/GATEWAY_PATCHES.md` P4.

---

### D-4 — Idempotency lives in SQL, not in process memory

**Decision.** `workflow_runs` with `UNIQUE (identity, idempotency_key)`; the
key is scoped server-side to `"<product-slug>:<client-key>"` and looked up
under the caller's own identity.

**Evidence.** Same serverless reasoning as D-2. Scoping matters for money: an
unscoped key would let one caller replay another caller's paid result, and a
key reused across products would return the wrong product's output. Both are
covered by tests (`a key belonging to another identity is never honoured`,
`the key is scoped per slug`).

**Alternatives rejected.** An in-memory LRU (wrong on serverless); trusting a
client-supplied key verbatim (cross-tenant replay).

**Reversibility.** Moderate — it is a table plus a migration, but no data is
destroyed by dropping it.

---

### D-5 — `creditsPerRun = 1 + ceil(maxInputTokens / 8000)`, published before the run

**Decision.** Every product declares its price in the manifest; the run
response echoes `credits: { perRun, charged, metered }`; the catalogue
endpoints expose `creditsPerRun` so the price is visible before committing.

**Evidence.** The brief fixes the formula. `server/metering.ts` hardcodes
`spend(identity, 1, …)`, but `Billing.spend` already accepts N
(`server/billing.ts`), so the workflow routes call `billing.spend` directly
with the product's cost and reuse only `Meter.identify`. `server/metering.ts`
is untouched, so the shipped `/api/fullkonk/generate` path keeps its existing
1-credit behaviour.

**Alternatives rejected.** Charging per actual token usage — the number is
only known after the call, so it cannot be reserved beforehand, and
reserve-then-refund is the pattern already shipped and audited.

**Reversibility.** Easy; the formula is asserted in one test.

---

### D-6 — Demo runs are not charged to the ledger

**Decision.** A demo costs 0 credits and creates no account. Abuse is bounded
by two rolling SQL windows: 5 runs per IP hash per 60 minutes, and 200 runs
globally per 24 hours, both configurable. Both counters are written **before**
the gateway call.

**Evidence.** Charging an anonymous identity would create an account row for
every visitor and make the demo indistinguishable from a paid run in the
ledger. Recording after the call would let an attacker farm unlimited attempts
by forcing failures — covered by the test `a failing run still consumes the
allowance`.

**Alternatives rejected.** Giving anonymous callers trial credits (pollutes
the ledger and the funnel); per-IP only (a botnet defeats it, hence the global
ceiling).

**Reversibility.** Easy.

---

### D-7 — `/run` without `DATABASE_URL` proceeds **unmetered**

**Decision.** When no ledger is configured the run executes and the response
says `credits: { metered: false }`.

**Evidence.** This matches the existing, already-audited behaviour of
`server/gateway-proxy.ts`, which serves generations when billing is
unconfigured. Diverging would mean `/api/workflows/*` is dead on any
deployment where `/api/fullkonk/generate` still works, which is the current
production state.

**Note on the asymmetry with D-2.** Deliberate. `/run` requires a verified
identity for everything except the six PUBLIC_DEMO products, so an unmetered
run still has a named caller behind it. `/demo` has no caller at all, so it
fails closed. The response never claims to have charged when it has not.

**Reversibility.** Easy — one condition.

---

### D-8 — Oversized input is chunked and synthesised, never truncated

**Decision.** Above `CHUNK_THRESHOLD_TOKENS = 48_000` the input is split on
its largest field, each chunk is run, and a final synthesis call merges the
partial results. Above the product's declared `maxInputTokens` the request is
refused with `400 INPUT_TOO_LARGE` naming the estimate, the limit, and the
remedy.

**Evidence.** The failure this replaces is the dangerous one: silently
dropping the second half of a contract and returning a confident review of the
first half. `splitString`/`splitArray` are tested to reconstruct their input
exactly, so no clause is lost at a boundary. No product needs a multi-stage
pipeline for *semantic* reasons (`docs/RECON_REPORT.md` §9) — only size forces
multiple calls.

**Alternatives rejected.** Truncating to fit (silently wrong); rejecting
everything oversized (blocks the M&A and lease products, whose whole value is
long documents).

**Reversibility.** Easy; guard G11 proves the refusal path.

---

### D-9 — One app-wide JSON error handler for `/api`

**Decision.** `server/api-error-handler.ts` is registered last in
`createApp()`.

**Evidence.** Found by writing "an API route never returns HTML" as an attack
rather than an assertion: `POST /api/<anything>` with the body `{not json`
makes `express.json()` throw, Express's **default** error handler runs, and
the client receives `text/html; charset=utf-8`. Every hand-written JSON error
contract in the codebase was bypassed by a single malformed byte. Raw evidence
in `docs/GUARD_REVERSION_PROOF.md` G12.

**Alternatives rejected.** A per-router handler — it would not cover the other
`/api` routes, and body-parser errors surface above the router anyway.

**Reversibility.** Easy, but it should not be reverted; it is a live bug fix.

---

### D-10 — `validateDemoOutput` was fixed, not worked around

**Decision.** `catalog/validate.ts` now checks scalar array items as scalars.

**Evidence.** The validator treated *every* declared `items` schema as an
object schema, so a correct `["…"]` for a field declared
`items: { type: 'string' }` was rejected with `must be an object`. Ten of the
fifteen products declare at least one such field, so under the new runner they
would have returned `502 OUTPUT_SCHEMA_VIOLATION` on every single run — the
product would have looked broken to every user. Found by
`tests/workflow-products.test.ts`, not by reading the code.

**Alternatives rejected.** Loosening the runner to ignore validation errors
(hides bad output); rewriting the affected schemas to use object items
(changes the published product contract to work around a validator bug).

**Reversibility.** Easy; guards G13 and the two adjacent negative tests pin
the behaviour in both directions.

---

### D-11 — The synthetic `ProductRecord` in `WorkflowDetailPage.tsx` was removed

**Decision.** The page now reads the real manifest record via
`getProductBySlug(entry.legacySlug)`.

**Evidence.** The shim constructed a fake record with `status:'PUBLIC_DEMO'`,
`risk:'low'` and `validationReport.status:'available'` hard-coded for **every**
workflow. Only six products are PUBLIC_DEMO and most have no validation
report, so the page asserted an availability and an assurance level that do not
exist — exactly the fabricated-metric class the brief forbids.

**Alternatives rejected.** Leaving it and fixing only the API (the browser is
where a buyer reads the claim).

**Reversibility.** Easy.

---

### D-12 — Two status fields are exposed, not one

**Decision.** The catalogue API returns `status` (the 6-value portfolio status)
and `runStatus` (the 4-value manifest status). Gating uses `runStatus`.

**Evidence.** `content/catalogue/types.ts` and `catalog/types.ts` define
different enums for the same products. Collapsing them would silently reclassify
products; picking one would break either the existing UI or the run gate. The
join is by `legacySlug` and both slug forms resolve
(`resolveCatalogueEntry`).

**Alternatives rejected.** Unifying the enums — a data migration across both
manifests and the portfolio file, well beyond this brief, and the portfolio
status is load-bearing in the existing UI.

**Reversibility.** Moderate; it is a published response shape.
