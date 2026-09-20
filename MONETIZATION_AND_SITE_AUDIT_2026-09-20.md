# KONKRED — Monetization & Site Audit

**Audited:** 2026-09-20 (UTC)  
**Scope:** React SPA, Express/API surface, public routes, dynamic catalogue, commercial flows, and visual system.  
**Method:** source and route-map review, manifest validation, direct HTTP route sweep, lint/build, and the repository’s automated suite. A browser screenshot pass was attempted, but Playwright Chromium could not be downloaded in this environment; visual review is therefore source/CSS based and should be repeated in a staging browser before launch.

## Executive decision

**KONKRED is suitable now as a controlled AI-product sales and lead-generation platform, not yet as a self-serve monetized SaaS.**

The underlying offer is credible: a typed, validated catalogue of **36 products** (21 suites and 15 workflows), real sign-in and Firestore persistence, an AI audit experience, a fullKONK generation gateway, and clear human-approval constraints. The current monetization path deliberately stops at an inquiry. That is the right honest state today.

It is **not ready to charge cards/crypto or promise recurring subscriptions** until billing, entitlement, provisioning, abuse controls, and commercial operations are implemented and tested.

### Readiness scorecard

| Area | Status | Assessment |
|---|---:|---|
| Product discovery and positioning | **Strong** | Catalogue, suite, tool and kit paths are structured around a specific job, input, output, scope and limitation. |
| Sales-assisted monetization | **Ready with setup** | Inquiry forms, pricing ranges, sprint/pilot offers and contact routing exist. Confirm Firestore/CRM delivery in production before campaigns. |
| Self-serve kit purchase | **Not ready** | No payment provider, order record, fulfilment/download, licence acceptance, tax, refund, or customer receipt flow. |
| Subscription SaaS | **Not ready** | The fullKONK tiers are explicitly planned. There is no Stripe customer/subscription, entitlement enforcement, metering limit, or billing portal. |
| Enterprise sales | **Promising** | Enterprise page names the right controls; needs security pack, DPA, procurement flow, SLA terms and a staffed follow-up operation. |
| AI cost / abuse control | **Blocking before paid launch** | Standard AI routes should require an authenticated identity, per-user quota/rate limits, provider spend caps and audit logs. Client-side auth checks alone are insufficient. |
| Legal/commercial readiness | **Needs work** | Add terms, privacy, DPA/subprocessor list, acceptable-use policy, data retention/deletion policy, refund/cancellation terms and a human escalation process. |

## What was audited

### Canonical public and account pages

| Page group | Routes reviewed | Result |
|---|---|---|
| Conversion surface | `/`, `/catalogue`, `/pricing`, `/sprint`, `/enterprise`, `/partners`, `/validation` | Coherent offer ladder. Pricing correctly says planning ranges/test-mode rather than claiming checkout. |
| Flagship products | `/forge-audit`, `/fullkonk`, `/redaeye` | Product routes are present. Audit requires sign-in in the client; fullKONK and demo availability depend on configured server credentials. |
| Content and support | `/academy`, `/intel`, `/network`, `/advisory`, `/docs`, `/career`, `/resources`, `/contact` | Reachable. Global Chalk & Signal system now applies; contact content was corrected to describe inquiry-only commercial routing. |
| Authentication/account | `/login`, `/join`, `/verify-email`, `/account` | Existing Firebase flows retained. Billing section correctly shows no payment methods/configuration. |
| System routes | `/style-guide`, `/404` | Reachable. |
| Product detail matrix | 21 `/suites/:slug`, 15 `/tools/:slug`, 15 `/kits/:slug` | All **51 dynamic routes** returned HTTP 200 in the direct route sweep. |
| Retired/legacy commerce | `/checkout`, wallet/seller/buyer/admin/dispute aliases | Intentionally resolve to 404 via the router. No fake checkout was restored. |

### API and product delivery

| Capability | Finding |
|---|---|
| `/api/health` | Responds successfully in local verification. |
| fullKONK gateway | Real same-origin server route/proxy architecture exists, with server-only credentials and SSE support. It returns configuration errors when providers are absent, which is preferable to fake output. |
| Product demos | Gated on a server feature flag and server-side key; unavailable demos produce an honest controlled-pilot state. |
| Inquiry persistence | Uses Firestore helpers. Production rules, Firebase configuration and an operations inbox/CRM handoff must be verified before paid traffic. |
| Payments | No live payment endpoint or provider configuration exists. This is now consistently documented as inquiry-only. |
| Legacy REDAEYE static page | Previously exposed a separate crypto checkout page. It has been replaced by a themed redirect/fallback and `/redaeye` now falls through to the React diagnostic route. |

## Principal findings and launch priorities

### P0 — before accepting money or running paid acquisition

1. **Protect AI inference against cost abuse.** The standard AI generation path needs verified server-side user identity, rate limits, request-size/token limits by plan, provider budgets, and monitoring/alerting. Do not rely on the client’s sign-in gate.
2. **Choose and implement one payments architecture.** Build server-created checkout sessions, verified webhooks, idempotent order records, entitlements, receipts, failed-payment handling, refunds/cancellations, and product fulfilment. Never expose a wallet address as an unverified checkout replacement.
3. **Make lead delivery operational.** Verify Firestore write failures are surfaced, route every inquiry to a staffed inbox/CRM, define response ownership and publish no response-time promise until measured.
4. **Publish commercial and data documents.** Terms, privacy, DPA, AUP, security overview, retention/deletion, subprocessors, licence terms, and escalation contact are needed for enterprise credibility and compliant selling.

### P1 — first 30–60 days of revenue

1. Instrument the funnel: landing → catalogue → product → offer → inquiry → qualified opportunity → closed/won. Track source, product, company size and outcome, not just CTA clicks.
2. Publish 3–5 evidence-backed use cases with sanitized before/after artefacts, scope, approval role, time-to-value and what was not automated.
3. Pick a focused initial ICP and sell one motion first: **workflow kits**, **validation sprints**, or **enterprise pilots**. The current breadth is useful for discovery but too wide for an unqualified homepage promise.
4. Add a real delivery workspace: order/engagement status, approved artefacts, human review queue, release notes and renewal checkpoints.

### P2 — scale only after the above is measured

1. Enforce plan entitlements and user/team quotas for fullKONK.
2. Add SSO/RBAC, tenant isolation evidence, export/deletion controls and a security-review packet.
3. Introduce channel/OEM pricing only after direct-sales margin, support load, and repeatability are known.

## Changes applied in this pass

### Chalk & Signal system

- Replaced the old multi-accent/cyan/amber visual language with warm-black `#0a0908`, ash surfaces, warm whites and the single red signal family.
- Added the required font roles: **Archivo Black** for displays, **Special Elite** for human prose and **JetBrains Mono** for machine labels.
- Added global chalk grain, panel grain, scanlines, blueprint grid, hazard tape, mechanical transitions, red ignition hover behavior, keyboard focus styling, reduced-motion support, and touch/native-cursor fallback.
- Added hardware primitives and global UI chrome: octagonal/riveted frames, keycaps, stamps, pointer reticle and ambient signal glow.
- Rebuilt the landing page around the factory-floor metaphor: clear benches, named inputs/outputs, offer depth and conversion paths.
- Rebuilt global navigation and the AUDITOR page with the shared system; updated workflow TV chrome and normalised legacy lazy-loaded modules into the same palette.
- Removed the light-theme fork: the supplied system has one controlled dark canvas, so the site no longer offers an off-brand paper mode.

### Monetization integrity

- Replaced the stale public REDAEYE crypto checkout with a safe themed redirect and removed the Express route that served it at `/redaeye`.
- Removed seeded fake wallet balance, sales, ratings, KYC and payout fields from new GitHub OAuth user records.
- Corrected contact-page copy from crypto/automated-settlement claims to explicit inquiry-only commercial routing.
- Corrected `SYSTEM_DOCUMENTATION.md` and `metadata.json` to state that payments are not configured.

## Verification completed

```text
npm run lint                 PASS (TypeScript, no errors)
npm test                     PASS (13 files, 163 tests)
npm run build:client         PASS (manifest validation + Vite production build)
24 canonical SPA routes      HTTP 200 in local direct route sweep
51 dynamic product routes    HTTP 200 in local direct route sweep
GET /api/health              HTTP 200
```

The production build still reports the pre-existing large-chunk warning (notably fullKONK). It is not a release blocker for the redesign, but code splitting should be part of the P1 performance work.
