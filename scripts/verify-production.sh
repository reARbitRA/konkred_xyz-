#!/usr/bin/env bash
#
# Post-deploy verification. Run this immediately after deploying.
#
#   bash scripts/verify-production.sh https://www.konkred.xyz
#
# Exits non-zero if any check fails, so it can gate a release. Every check is
# read-only and safe against production: nothing is purchased, and the one
# webhook call sends a deliberately unsigned payload that MUST be rejected.
#
set -uo pipefail

SITE="${1:-https://www.konkred.xyz}"
SITE="${SITE%/}"
PASS=0
FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# curl already prints "000" on a connection failure AND exits non-zero, so a
# `|| echo 000` fallback concatenates into "000000" and every status comparison
# silently fails. Capture the output instead and default only when it is empty.
code() { local c; c="$(curl -sS -o /dev/null -w '%{http_code}' -m 25 "$@" 2>/dev/null)"; echo "${c:-000}"; }
body() { curl -sS -m 25 "$@" 2>/dev/null || true; }

# An unreachable host returns an empty body, which must not be mistaken for a
# valid JSON response — otherwise a totally dead site "passes" the HTML check.
is_json() {
  case "$1" in
    '')                      return 1 ;;   # no response at all
    *'<!DOCTYPE'*|*'<html'*) return 1 ;;   # SPA shell instead of the API
    *'{'*)                   return 0 ;;
    *)                       return 1 ;;
  esac
}

echo "Verifying $SITE"

head_ "1. Liveness"
H="$(body "$SITE/api/health")"
if [ "$(code "$SITE/api/health")" = "200" ]; then ok "/api/health is 200"; else bad "/api/health is not 200 — the function is down"; fi
case "$H" in
  *'"status":"ok"'*) ok "reports status ok" ;;
  *'<!DOCTYPE'*|*'<html'*) bad "returned HTML, not JSON — the deploy is broken" ;;
  *) bad "unexpected health body" ;;
esac
for flag in gatewayUrl gatewayApiKey fullkonkKey; do
  case "$H" in
    *"\"$flag\":true"*)  ok "$flag configured" ;;
    *"\"$flag\":false"*) bad "$flag NOT set in the environment" ;;
  esac
done

head_ "2. Readiness (gateway reachable)"
R="$(body "$SITE/api/ready")"
case "$R" in
  *'"status":"ok"'*)        ok "gateway reachable" ;;
  *GATEWAY_NOT_CONFIGURED*) bad "KONKRED_GATEWAY_URL is not set" ;;
  *GATEWAY_UNREACHABLE*)    bad "gateway is down or the URL is wrong" ;;
  *GATEWAY_TIMEOUT*)        bad "gateway timed out (cold start? retry once)" ;;
  *GATEWAY_UNHEALTHY*)      bad "gateway answered but is unhealthy" ;;
  *)                        bad "unexpected /api/ready body" ;;
esac

head_ "3. No API route may return HTML"
for p in /api/health /api/ready /api/quota /api/payments/plans /api/fullkonk/providers /api/definitely-not-a-route; do
  B="$(body "$SITE$p")"
  if is_json "$B"; then ok "$p returns JSON"
  elif [ -z "$B" ]; then bad "$p returned nothing — host unreachable"
  else bad "$p returned HTML instead of JSON"; fi
done
[ "$(code "$SITE/api/definitely-not-a-route")" = "404" ] \
  && ok "unknown API route is 404" || bad "unknown API route should be 404"

head_ "4. Billing"
case "$(body "$SITE/api/payments/plans")" in
  *'"plans"'*) ok "plan catalogue served" ;;
  *BILLING_NOT_CONFIGURED*) bad "DATABASE_URL is not set" ;;
  *) bad "plan catalogue unavailable" ;;
esac
case "$(body "$SITE/api/quota")" in
  *totalRemaining*) ok "quota endpoint works" ;;
  *) bad "quota endpoint not working" ;;
esac

head_ "5. Security"
WH="$(code -X POST -H 'content-type: application/json' \
  -d '{"order_id":"verify-probe","payment_status":"finished"}' \
  "$SITE/api/payments/nowpayments/webhook")"
[ "$WH" = "401" ] \
  && ok "unsigned webhook rejected (401)" \
  || bad "unsigned webhook returned $WH — expected 401. QUOTA COULD BE MINTED."

IQ="$(code "$SITE/api/internal/quota/balance?identity=telegram:1")"
{ [ "$IQ" = "401" ] || [ "$IQ" = "503" ]; } \
  && ok "internal quota API refuses unauthenticated callers ($IQ)" \
  || bad "internal quota API returned $IQ — expected 401/503"

ACAO="$(curl -sS -m 25 -i -H 'Origin: https://evil.example' "$SITE/api/quota" 2>/dev/null | grep -ci 'access-control-allow-origin' || true)"
[ "$ACAO" = "0" ] \
  && ok "billing routes are not cross-origin readable" \
  || bad "billing routes expose Access-Control-Allow-Origin"

for s in sk- gsk_ ghp_ postgres:// NOWPAYMENTS; do
  case "$(body "$SITE/api/health")$(body "$SITE/api/ready")" in
    *"$s"*) bad "health output contains '$s' — possible secret leak" ;;
    *)      ok "no '$s' in health output" ;;
  esac
done

head_ "6. Pages"
for p in / /fullkonk /pricing /checkout; do
  C="$(code "$SITE$p")"
  [ "$C" = "200" ] && ok "$p is 200" || bad "$p returned $C"
done

printf '\n\033[1mResult: %d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Deployment is NOT healthy. See docs/DEPLOY_RUNBOOK.md §7."
  exit 1
fi
echo "All checks passed. Remaining manual step: one real payment (runbook §9)."
