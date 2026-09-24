#!/usr/bin/env bash
#
# Apply the billing migration and prove it worked.
#
#   DATABASE_URL=postgres://... bash scripts/setup-database.sh
#   # or, if .env.production.local already has DATABASE_URL:
#   bash scripts/setup-database.sh
#
# Safe to re-run: the migration is idempotent and this script only reads
# afterwards. Uses the `pg` driver already in node_modules, so `psql` is not
# required.
#
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ] && [ -f .env.production.local ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.production.local | cut -d= -f2- || true)"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "✗ DATABASE_URL is not set."
  echo "  Put it in .env.production.local, or pass it inline:"
  echo "    DATABASE_URL=postgres://... bash scripts/setup-database.sh"
  exit 1
fi

export DATABASE_URL
node -e '
const { Pool } = require("pg");
const fs = require("fs");

(async () => {
  const dsn = process.env.DATABASE_URL;
  const local = /localhost|127\.0\.0\.1|host=\/tmp/.test(dsn);
  const pool = new Pool({
    connectionString: dsn,
    connectionTimeoutMillis: 15000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });

  try {
    await pool.query("SELECT 1");
    console.log("✓ connected");
  } catch (error) {
    console.error("✗ cannot connect:", error.message);
    console.error("  Check the host, credentials and that your IP is allowed.");
    process.exit(1);
  }

  await pool.query(fs.readFileSync("src/db/migrations/0001_billing.sql", "utf8"));
  console.log("✓ migration applied");

  const expected = ["accounts", "payments", "plans", "usage_ledger", "webhook_events"];
  const { rows } = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename", ["public"]
  );
  const present = rows.map((r) => r.tablename);
  const missing = expected.filter((t) => !present.includes(t));
  if (missing.length) {
    console.error("✗ missing tables:", missing.join(", "));
    process.exit(1);
  }
  console.log("✓ tables:", expected.join(", "));

  // The UNIQUE constraints are what make payments single-grant and identities
  // one-per-account. Verify they actually exist rather than assuming.
  const { rows: idx } = await pool.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = $1", ["public"]
  );
  const names = idx.map((r) => r.indexname).join(" ");
  for (const [label, needle] of [
    ["accounts.identity UNIQUE", "accounts_identity"],
    ["payments.order_id UNIQUE", "payments_order_id"],
    ["webhook_events.event_id UNIQUE", "webhook_events_event_id"],
  ]) {
    if (!names.includes(needle)) {
      console.error(`✗ missing constraint: ${label} — replay protection would NOT hold`);
      process.exit(1);
    }
    console.log(`✓ ${label}`);
  }

  const { rows: plans } = await pool.query("SELECT id, messages FROM plans ORDER BY price_micro_usd");
  console.log("✓ plans:", plans.map((p) => `${p.id}/${p.messages}`).join(", ") || "(none)");

  await pool.end();
  console.log("\nDatabase is ready. Next: set the Vercel variables and deploy.");
})().catch((error) => { console.error("✗ failed:", error.message); process.exit(1); });
'
