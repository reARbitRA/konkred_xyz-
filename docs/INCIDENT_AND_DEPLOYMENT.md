# konkred.xyz — Production incident report & deployment runbook

**Date:** 2026-09-22
**Scope:** `reARbitRA/konkred_xyz-` (website + Vercel API proxy)
**Status:** website-side defects fixed, tested and ready to deploy. Gateway
deployment and payment/quota work remain outstanding (see §7).

---

## 1. Observed failures

Reproduced live before any change:

| Route | Observed | Notes |
|---|---|---|
| `https://www.konkred.xyz/` | HTML loads, then hangs on the loading screen | `Production Uplink Active` / `INITIALIZING_CORE` / `UPLINK: SECURE`, progress stuck at 25% |
| `https://www.konkred.xyz/api/health` | `500 FUNCTION_INVOCATION_FAILED` | Vercel HTML error page, not JSON |
| `https://www.konkred.xyz/api/fullkonk/providers` | `500 FUNCTION_INVOCATION_FAILED` | same |

The decisive clue: **`/api/health` also failed.** That route needs no gateway,
no database and no configuration — it only returns a literal object. If even it
returns `FUNCTION_INVOCATION_FAILED`, the request never reached route handling.
The *invocation itself* is dying, so no application-level error contract can run
and Vercel substitutes its own HTML error page.

---

## 2. Root causes

### RC-1 — The serverless handler could crash before producing a response

`api/index.ts` forwarded every non-proxied `/api/*` request — **including
`/api/health`** — to a 4.1 MB bundled Express app (`lib/fullkonk-server.cjs`).
That bundle performs real work at *module scope*, i.e. during `import()`:

```ts
// server.ts, executed at import time
if (!getAdminApps().length) initAdmin({ projectId: firebaseConfig.projectId });
const adminAuth = getAdminAuth();
const adminDb   = getAdminFirestore();
// src/db/index.ts — also at import time
const pool = createPool();            // pg Pool from SQL_HOST / SQL_USER / ...
export const db = drizzle(pool, { schema });
```

Any throw here rejects the import. The previous code caught that rejection but
still had uncaught paths: `app(request, response)` was called as
`return void app(...)` with no `try`, so a synchronous Express throw escaped,
and nothing wrapped the outer `await gatewayHandler(...)`. An escaped
throw/rejection in a Vercel Node function is precisely
`FUNCTION_INVOCATION_FAILED`.

This also explains the blast radius: because `/api/health` was delegated to that
fragile bundle, a single initialisation failure took down *every* API route at
once — which is exactly what was observed.

> Verified: the handler and the bundle both load cleanly in this sandbox, so the
> trigger is environment-specific (absent/incorrect `SQL_*` or Firebase
> credentials in the Vercel project, or the bundle missing from the deployment).
> The fix makes the outcome a controlled JSON error either way, so the cause of
> the initialisation failure can no longer take the site down.

### RC-2 — Health could not report anything during an incident

`/api/health` returned a hard-coded `{status:"ok"}` from the legacy bundle. It
could not say whether the gateway was configured or reachable, and it shared
fate with the very component most likely to fail. There was no `/api/ready`.

### RC-3 — The boot could hang forever on Firebase

`contexts/AuthContext.tsx` gated the whole app on `auth.isLoading`, set false
only inside the `onAuthStateChanged` success callback. That callback **never
fires** if Firebase cannot reach its backend (blocked network, non-whitelisted
domain, bad project config), and there was **no error callback and no timeout**.
`App.tsx` then renders `<AuthLoadingScreen />` indefinitely — the infinite
`INITIALIZING_CORE` / `UPLINK: SECURE` screen.

### RC-4 — FullKonk provider discovery had no terminal failure state

In `pages/FullKonkPage.tsx` the provider `fetch` ended in `.catch(() => undefined)`
and only set `providersLoaded` on some paths. On network failure or a hang the
selector stayed on `LOADING…` forever, with no timeout, no message and no retry.

### RC-5 — StrictMode remount could freeze the UI

`mountedRef` was initialised `true` and only ever set to `false` in cleanup.
Under React StrictMode the cleanup runs once on mount, so every later
`setState` guarded by `mountedRef.current` was silently dropped.

---

## 3. Fixes (files changed)

| File | Change |
|---|---|
| `api/index.ts` | Rewritten defensively. Nothing can escape the handler: legacy-import rejection → `503 LEGACY_APP_UNAVAILABLE`; Express dispatch throw → `500 LEGACY_DISPATCH_FAILED`; invalid config → `503 GATEWAY_MISCONFIGURED`; anything else → `500 UNHANDLED_ERROR`. `safeJson()` never double-sends. Failed imports are discarded so a later request retries. |
| `server/gateway-proxy.ts` | `/api/health` + `/api/ready` are now owned by the proxy and answered **before** any fallback, so liveness no longer depends on the legacy bundle. `/api/ready` probes the gateway with a 5 s timeout and degrades to `503`. Reports configuration as **booleans only**. |
| `contexts/AuthContext.tsx` | Added the `onAuthStateChanged` error callback and an 8 s watchdog; boot always settles (as signed-out in the worst case). Idempotent `settle()`; watchdog cleared on unmount. |
| `pages/FullKonkPage.tsx` | Provider discovery has success / configured-error / network / 12 s-timeout terminal states, a Persian error banner, and a RETRY button. `mountedRef` re-armed on mount. |
| `server.ts` | `/api/health` + `/api/ready` mirror the Vercel contract so local verification matches production. |
| `tests/gateway-proxy.test.ts` | +8 regression tests for the health contract. |
| `scripts/dev/mock-gateway.mjs` | Offline gateway stand-in (dev only, no credentials). |

### The health contract

`GET /api/health` — **liveness**, always `200` if the function runs at all:

```json
{"status":"ok","service":"konkred-website","runtime":"vercel-node",
 "time":"...","configured":{"gatewayUrl":true,"gatewayApiKey":true,"fullkonkKey":true}}
```

`GET /api/ready` — **readiness**, `200` healthy / `503` degraded with a code of
`GATEWAY_NOT_CONFIGURED`, `GATEWAY_UNREACHABLE`, `GATEWAY_TIMEOUT` or
`GATEWAY_UNHEALTHY`.

`configured` exposes **booleans only** — never a key, never the gateway URL —
so the owner can diagnose a bad Vercel environment from a browser safely. The
gateway's own health body is deliberately *not* echoed to the client.

---

## 4. Environment variables (Vercel project)

Server-only. No `VITE_` prefix — anything `VITE_`-prefixed is compiled into
browser JavaScript and is therefore public.

```text
KONKRED_GATEWAY_URL=https://<your-gateway-host>     # https, never localhost
KONKRED_GATEWAY_API_KEY=fullkonk-server-key         # sent as x-api-key to /api/ai
FULLKONK_KEY=<same value as the gateway FULLKONK_KEY>
```

Legacy aliases `BRAIN_URL` / `BRAIN_KEY` are still read as fallbacks; the
explicit names win. Set these for **Production and Preview**.

`configFromEnv()` rejects a non-http(s) URL, credentials embedded in the URL,
and (in production) `http:` or a `localhost`/`127.0.0.1` host. A rejected config
is now a controlled `503 GATEWAY_MISCONFIGURED`, not a crash.

Provider keys (Gemini, Groq, Cerebras, Mistral, OpenRouter, Cloudflare…) belong
**only on the gateway**, never in the Vercel project.

---

## 5. Deployment order

1. Deploy the gateway (`reARbitRA/konkred-AI-ecosystem`, `render.yaml` blueprint)
   and confirm it is public: `curl -sS https://<gateway>/api/health`.
2. Set the three variables above in the Vercel project (Production + Preview).
3. Redeploy the website **with the build cache cleared** (the API bundle
   `lib/fullkonk-server.cjs` is produced by `npm run build:vercel`).
4. Verify with §6. Roll back by reverting the deployment if `/api/health` is not `200`.

---

## 6. Verification commands

```bash
# 1. Liveness — must be 200 JSON even if nothing else is configured.
curl -sS -o /dev/null -w '%{http_code}\n' https://www.konkred.xyz/api/health
curl -sS https://www.konkred.xyz/api/health | jq

# 2. Readiness — 200 when the gateway answers, else a 503 with a code.
curl -sS https://www.konkred.xyz/api/ready | jq

# 3. Providers — provider JSON, or a controlled 503, never a Vercel 500 page.
curl -sS -o /dev/null -w '%{http_code}\n' https://www.konkred.xyz/api/fullkonk/providers

# 4. No route may return Vercel's HTML crash page.
for p in /api/health /api/ready /api/fullkonk/providers; do
  printf '%-32s ' "$p"
  curl -sS "https://www.konkred.xyz$p" | head -c 80; echo
done   # every line must be JSON, never "<!DOCTYPE html>"

# 5. Pages must respond 200.
for p in / /fullkonk /pricing; do
  printf '%-12s ' "$p"
  curl -sS -o /dev/null -w '%{http_code}\n' "https://www.konkred.xyz$p"
done

# 6. Secret hygiene — must print nothing.
curl -sS https://www.konkred.xyz/api/health | grep -Ei 'sk-|brain-key|api-key'
```

Local verification (no credentials needed):

```bash
npm ci
npm run lint          # tsc --noEmit
npm test              # 171 unit/integration tests
npm run build:vercel  # client bundle + API bundle
node scripts/dev/mock-gateway.mjs 5055 &
KONKRED_GATEWAY_URL=http://127.0.0.1:5055 \
KONKRED_GATEWAY_API_KEY=dev-api-key \
FULLKONK_KEY=dev-brain-key npm run dev
curl -s localhost:3000/api/health | jq && curl -s localhost:3000/api/ready | jq
```

---

## 7. Test results & remaining risks

**Passing:** `tsc --noEmit` clean · **171/171** vitest tests (8 new) ·
`npm run build:vercel` succeeds · no secret name found in `dist/assets/**`.

**Verified behaviours:** unconfigured deployment → `/api/health` `200`,
`/api/ready` `503 GATEWAY_NOT_CONFIGURED`, providers `503`; healthy gateway →
all `200` with real provider data; gateway down → health stays `200`, ready
`503 GATEWAY_UNREACHABLE`, providers `502`; no exception ever escaped the
handler in any case.

**Remaining risks / not done.** These were in the brief but are *not* delivered,
and the site should not be described as feature-complete until they are:

1. **The gateway is not deployed by this change.** Until `KONKRED_GATEWAY_URL`
   points at a live gateway, AI features return controlled "not configured"
   errors — visibly, not as a crash.
2. **Payments, quotas and PostgreSQL persistence are not implemented here.** No
   NowPayments integration, webhook idempotency, plan storage or `402` paywall
   exists in this repository yet.
3. **Telegram bot parity** (shared identity/quota) is untouched; it lives in the
   ecosystem repo.
4. **Browser testing was not possible in this sandbox** — Playwright's Chromium
   download is network-blocked, so mobile-Chrome checks in §6 must be run
   manually after deploy.
5. The legacy Express bundle still initialises firebase-admin and a `pg` pool at
   module scope. That is now *contained* rather than fatal; moving it to lazy
   initialisation is the real long-term fix.

---

## 8. راهنمای عملیاتی (Persian operational guide)

**اگر سایت بالا نیامد یا صفحه بارگذاری گیر کرد:**

۱. سلامت سرویس را بررسی کنید:

```bash
curl -sS https://www.konkred.xyz/api/health
```

- اگر `200` و `"status":"ok"` گرفتید، تابع Vercel سالم است.
- اگر صفحهٔ HTML خطا دیدید، استقرار (deployment) مشکل دارد؛ آخرین نسخه را
  دوباره منتشر کنید (با پاک‌کردن build cache).

۲. در پاسخ بالا بخش `configured` را ببینید. هر مقداری که `false` باشد یعنی آن
متغیر در تنظیمات Vercel وارد نشده است:

- `gatewayUrl` → `KONKRED_GATEWAY_URL`
- `gatewayApiKey` → `KONKRED_GATEWAY_API_KEY`
- `fullkonkKey` → `FULLKONK_KEY`

۳. برای بررسی اتصال به Gateway:

```bash
curl -sS https://www.konkred.xyz/api/ready
```

- `"status":"ok"` یعنی همه‌چیز سالم است.
- `GATEWAY_NOT_CONFIGURED` یعنی آدرس Gateway وارد نشده است.
- `GATEWAY_UNREACHABLE` یا `GATEWAY_TIMEOUT` یعنی Gateway خاموش یا کند است؛
  ابتدا سرویس Gateway را بررسی کنید.

**نکات امنیتی مهم:**

- کلیدهای ارائه‌دهنده‌ها (Gemini، Groq، Cerebras و…) فقط روی Gateway قرار
  می‌گیرند، هرگز در تنظیمات سایت و هرگز در گیت.
- هیچ متغیر محرمانه‌ای نباید با پیشوند `VITE_` تعریف شود؛ این مقادیر داخل
  فایل‌های جاوااسکریپت مرورگر قرار می‌گیرند و برای همه قابل مشاهده‌اند.
- خروجی `/api/health` فقط «بله/خیر» بودنِ تنظیمات را نشان می‌دهد و هیچ‌وقت
  مقدار کلیدها را فاش نمی‌کند.
