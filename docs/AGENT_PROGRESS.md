# Agent progress

**Last updated:** 2026-09-27 (end of session)

**Status:** Phases 0–6 complete on branch `arena/01a0e3f5-konkred-xyz`.
Nothing deployed — by instruction.

**Phases complete:**

| Phase | What | Evidence |
|---|---|---|
| P0 Recon | 10 questions answered with paths and excerpts | `docs/RECON_REPORT.md` |
| P1 Read-only routes | `GET /api/workflows`, `GET /api/workflows/:slug` | `tests/workflow-catalogue.test.ts` (22) |
| P2 Runner | `POST /:slug/run` (12 steps), `POST /:slug/demo` | `tests/workflow-runner.test.ts` (49) |
| P3 Manifest | 7 execution fields in both manifests + `catalog/types.ts` | `tests/workflow-manifest-sync.test.ts` (21) |
| P4 Fixes | gateway patch list, chunking, privacy reality check, demo limits | `docs/GATEWAY_PATCHES.md`, guards G8–G11 |
| P5 Route audit | per-route table with a `metered` column | `docs/ROUTE_AUDIT.md` (P5 section) |
| P6 Proof | per-product tests + guard reversion with raw output | `tests/workflow-products.test.ts` (80), `docs/GUARD_REVERSION_PROOF.md` |

**Phase in progress:** none.

**Blockers:** none in code. Two things only a human can do:

1. Deploy (explicitly out of scope here) — runbook in `docs/PHASE_STATUS.md`.
2. Apply `docs/GATEWAY_PATCHES.md` to `reARbitRA/konkred-AI-ecosystem`, which
   this session may not modify.

**Numbers (each from a named command):**

| Metric | Value | Command |
|---|---|---|
| Tests before | 313 (307 passed, 6 skipped) | `npm test` at `657b07b` |
| Tests after | 485 (479 passed, 6 skipped without a DB) | `npm test` |
| Tests after, with a database | **485 passed, 0 skipped** | `TEST_DATABASE_URL=… npx vitest run` |
| New tests | **+172** | difference of the two counts |
| Type check | clean | `npm run lint` |
| Guards proven by reversion | **14 of 14** | `node scripts/dev/prove-guards.mjs` |
| Catalogue items served | **36** | `curl -s localhost:3000/api/workflows` |

**Resume command:**

```bash
cd /home/user/konkred_xyz- && git checkout arena/01a0e3f5-konkred-xyz
npm ci
npm test && npm run lint
node scripts/dev/prove-guards.mjs

# full local stack (three terminals)
/tmp/pgvenv/bin/python scripts/dev/start-postgres.py
node scripts/dev/mock-gateway.mjs 5055
DATABASE_URL="postgresql://postgres@localhost/postgres?host=/tmp/pgdata" \
KONKRED_GATEWAY_URL=http://127.0.0.1:5055 KONKRED_GATEWAY_API_KEY=local-dev-key \
ANON_SALT=local-dev-salt npm run dev
```

**Open decisions:** none outstanding. D-1 … D-12 are recorded in
`docs/AGENT_DECISIONS.md`. The two that a reviewer is most likely to want to
overturn:

* **D-7** — `/run` proceeds unmetered when `DATABASE_URL` is unset, matching
  the existing gateway proxy. If that is wrong, it is one condition to change,
  but `/api/fullkonk/generate` should change with it.
* **D-12** — the API exposes both `status` (portfolio, 6 values) and
  `runStatus` (manifest, 4 values). Unifying the two enums is a data migration
  outside this brief.
