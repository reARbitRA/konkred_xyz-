#!/usr/bin/env bash
#
# Generate the secrets this deployment needs.
#
# Writes to .env.production.local, which is gitignored. The values are NEVER
# printed to the terminal, so they cannot end up in shell history, CI logs or a
# chat transcript — copy them from the file straight into the Vercel dashboard.
#
#   bash scripts/setup-secrets.sh
#
set -euo pipefail

OUT=".env.production.local"

if [ -f "$OUT" ]; then
  echo "✗ $OUT already exists."
  echo "  Refusing to overwrite: regenerating ANON_SALT would reset every"
  echo "  anonymous trial, and regenerating INTERNAL_API_KEY would break the"
  echo "  Telegram bot until you update it there too."
  echo "  Delete the file deliberately if that is what you intend."
  exit 1
fi

command -v openssl >/dev/null || { echo "✗ openssl is required"; exit 1; }

ANON_SALT="$(openssl rand -hex 32)"
INTERNAL_API_KEY="$(openssl rand -hex 32)"
FULLKONK_KEY="$(openssl rand -hex 32)"
ADMIN_KEY="$(openssl rand -hex 32)"

umask 077   # owner-readable only, before the file is created
cat > "$OUT" <<EOF
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) by scripts/setup-secrets.sh
# GITIGNORED — never commit this file.
#
# ── Website (Vercel → Settings → Environment Variables) ────────────────────
ANON_SALT=$ANON_SALT
INTERNAL_API_KEY=$INTERNAL_API_KEY
FULLKONK_KEY=$FULLKONK_KEY

# ── Gateway (Render → Environment) ─────────────────────────────────────────
# FULLKONK_KEY must be IDENTICAL on both services.
ADMIN_KEY=$ADMIN_KEY
USERS_JSON=[{"key":"fullkonk-server-key","userId":"fullkonk","tier":"trusted"}]

# ── Telegram bot service ───────────────────────────────────────────────────
# INTERNAL_API_KEY must be IDENTICAL to the website's value above.
KONKRED_SITE_URL=https://www.konkred.xyz

# ── Fill these in yourself (they come from external accounts) ──────────────
DATABASE_URL=
KONKRED_GATEWAY_URL=
KONKRED_GATEWAY_API_KEY=fullkonk-server-key
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
NOWPAYMENTS_IPN_CALLBACK_URL=https://www.konkred.xyz/api/payments/nowpayments/webhook
FIREBASE_PROJECT_ID=aerobic-effect-wfbwx
TRIAL_ENABLED=true
TRIAL_MESSAGES=10
DAILY_MODE=false
EOF

echo "✓ Secrets written to $OUT (permissions $(stat -c '%a' "$OUT" 2>/dev/null || echo 600))"
echo
echo "Generated for you:  ANON_SALT · INTERNAL_API_KEY · FULLKONK_KEY · ADMIN_KEY"
echo "Still to fill in:   DATABASE_URL · KONKRED_GATEWAY_URL · NOWPAYMENTS_API_KEY · NOWPAYMENTS_IPN_SECRET"
echo
echo "Next: bash scripts/setup-database.sh   (after DATABASE_URL is set)"
