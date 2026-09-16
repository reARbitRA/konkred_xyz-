# fullKONK_> deployment note

* Front end + BFF: Vercel (this repository). `npm run build:vercel` builds the SPA
  and bundles the legacy Express app; `api/index.ts` is the single Node function
  (`maxDuration: 300`) and dispatches gateway routes through
  `server/gateway/router.ts`.
* Brain: the **Konkred AI Ecosystem Gateway**
  (`reARbitRA/konkred-AI-ecosystem`, `gateway/`) is deployed **separately**
  (Docker Compose / Render / Koyeb / Fly). It is not part of this repository or
  this deployment.
* Required Vercel variables (server-only, Production scope):
  `KONKRED_GATEWAY_URL`, `KONKRED_GATEWAY_API_KEY`, `FULLKONK_KEY`.
  Optional: `FULLKONK_GITHUB_EXPORT_TOKEN`, `FULLKONK_REQUIRE_AUTH`,
  `FIREBASE_PROJECT_ID`/`FIREBASE_SERVICE_ACCOUNT_JSON`,
  `FULLKONK_ALLOWED_ORIGINS`, timeouts and rate limits.
* Streaming requires a plan whose function timeout matches
  `FULLKONK_STREAM_TIMEOUT_MS` (280s by default; `vercel.json` asks for 300s).
* Rollout order: deploy the gateway → verify `GET {gateway}/api/health` → set the
  Vercel variables → redeploy → smoke test
  `GET /api/fullkonk/providers` and a short `POST /api/fullkonk/generate`.
* Rollback: redeploy the previous Vercel deployment, or unset
  `KONKRED_GATEWAY_URL` (the BFF then fails closed with 503 and can fall back to
  the in-repo engine via `FULLKONK_LEGACY_ENGINE_FALLBACK=true`).

Full detail: [GATEWAY_INTEGRATION.md](./GATEWAY_INTEGRATION.md).
