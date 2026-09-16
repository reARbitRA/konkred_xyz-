# Repository audit — fullKONK_> gateway integration (2026-09-16)

Performed before any code was written; every statement below was verified by
reading the repository.

## Project shape

| Item | Finding |
| --- | --- |
| Framework | **Vite 6 + React 19 + TypeScript 5.8 SPA** — not Next.js |
| Router | hand-rolled `utils/routes.ts` (history based); `/fullkonk` → `pages/FullKonkPage.tsx` (lazy) |
| Package manager | npm (`package-lock.json`); a stale `bun.lock` is present but unused by the build |
| Build | `npm run build:vercel` = `validate:portfolio` → `vite build` → `bundle:api` (esbuild `server.ts` → `lib/fullkonk-server.cjs`) |
| Serverless entry | `api/index.ts` — one Vercel Node function, `maxDuration: 300`, `vercel.json` rewrites `/api/(.*)` → `/api/index`, `/(.*)` → `/index.html` |
| Runtime choice | Node (not Edge): the proxy needs Node streams, `Buffer`, abort propagation and the bundled Express fallback |

## API surface (pre-existing)

`GET /api/health` · `GET /api/auth/github/url` · `GET /auth/callback` ·
`POST /api/ai/generate` (Gemini) · `GET /api/fullkonk/providers` ·
`GET /api/fullkonk/health` · `POST /api/fullkonk/optimize-prompt` (Groq) ·
`POST /api/fullkonk/generate` (SSE) · `GET /api/fullkonk/sessions/:userId` ·
`POST /api/fullkonk/usage` · `GET /api/fullkonk/analytics/:userId` ·
`POST /api/fullkonk/github/export` · `POST /api/demo/run` · `GET /redaeye`.

Before this change, `api/index.ts` forwarded every `/api/fullkonk/*` path to
`BRAIN_URL` with `x-brain-key: BRAIN_KEY`, **relaying the browser's `x-provider-key`
and `authorization` headers and echoing raw upstream error text**, and no
`/api/ai` route existed.

## fullKONK front end

* `pages/FullKonkPage.tsx` — the console: prompt box, mode buttons, provider/model
  pickers, BYOK key, pipeline status, chat, code output, live Sandpack preview,
  analytics dashboard, session sidebar, GitHub export modal, cancel + retry.
* Components consuming gateway data: `PipelineStatus` (stage/metrics/provider/stop),
  `ChatPanel` (delta text), `CodeOutput` (file events), `LiveEnvironment`
  (Sandpack), `AnalyticsDashboard` + `SessionSidebar` (usage/sessions),
  `GitHubExportModal` (export).
* SSE: `POST /api/fullkonk/generate` consumed with `fetch` + `ReadableStream`;
  frames were split with a naive `buffer.split('\n\n')` in the page.
* Auth: Firebase client SDK (`contexts/AuthContext.tsx`, `services/firebase.ts`);
  ID tokens attached as `Authorization: Bearer …`; server verifies via
  `firebase-admin` (`authenticatedIdentity` in `server.ts`).
* Env vars visible to the client: only `VITE_APP_NAME`, `VITE_API_URL`,
  `VITE_TRUST_WALLET_USDT_TRON` (`tests/secrets.test.ts` enforces the rule).

## Integrations that had to keep working

1. The entire existing `/fullkonk` UI and its states.
2. The legacy Express app: demo runner, GitHub OAuth, health, prompt optimisation,
   sessions/usage/analytics, and the BYOK in-repo orchestrator used in local dev.
3. `services/ai.ts` → `POST /api/ai/generate` → `{ text }` for AI Studio panels.
4. Firestore-backed sessions/projects/analytics.

## Test inventory (before)

`vitest.config.ts` → `tests/**/*.test.ts`, node environment, 30s timeout;
8 suites (`api`, `manifest`, `no-fakes`, `portfolio`, `prompt-library`, `routes`,
`secrets`, `validate`) + Playwright `tests/e2e/platform.spec.ts`
(baseURL `http://localhost:3000`, boots `npm run dev`).
Commands: `npm test`, `npm run lint` (= `tsc --noEmit`), `npm run test:e2e`,
`npm run build:vercel`.
