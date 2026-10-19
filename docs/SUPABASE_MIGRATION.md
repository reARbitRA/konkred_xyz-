# Supabase migration — 2026-10-19

## Current backend

Project: **konkred-xyz** (`rwuyuhjkitcnekpwmoml`, Free, us-east-1).
Dashboard: https://supabase.com/dashboard/project/rwuyuhjkitcnekpwmoml

Firebase SDKs, configuration, initialization, rules and the custom GitHub token
exchange have been removed. Historical audit reports describe the old backend;
this document supersedes their setup instructions.

Supabase Auth handles password login, confirmation emails, refresh, logout and
Google/GitHub OAuth redirects. Email confirmation remains required. An auth.users
trigger provisions profiles. Boot has an eight-second watchdog so auth outages
cannot trap visitors on the loading screen. Server routes verify access tokens
with auth.getUser(token), never by decoding an unverified JWT. Database clients
use the caller's token and remain subject to RLS; no service-role key is needed.
FULLKONK_REQUIRE_AUTH=true requires sessions for gateway-owned routes; project,
session and analytics access always requires authentication.

## Persistence and permissions

public.app_documents stores existing JSON payload shapes in Supabase Postgres.
services/documents.ts is a small application repository with atomic merge RPCs.
Profiles, projects, sessions, usage, audits, blogs, AI settings, waitlist,
contacts and product leads now use it. RLS isolates user records/settings.
Anonymous visitors can insert size-limited forms but cannot read submissions.
Blogs are publicly readable; writes require server-managed app_metadata.role
of admin. Profile edits allow only name and terms acceptance; users cannot
self-promote, grant blog access or change balances/tier. Client usage telemetry
is not authoritative billing data. The existing server SQL ledger still owns
payment/quota accounting.

Schema: supabase/migrations/202610190001_app_documents.sql. Applied to the new
project with the connector. Apply once to a different project, not again to the
already initialized project.

## Environment

Vercel project konkred.xyz has VITE_SUPABASE_URL and
VITE_SUPABASE_PUBLISHABLE_KEY configured for Production, Preview and Development.
These are public by design; RLS protects records. The server uses the same
variables, with optional SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY overrides.
Never use a service-role/secret key in a VITE_ variable. Ignored .env.local is
configured for local use and loaded by both Vite and the standalone server.

Site URL: https://www.konkred.xyz
Allowed redirects:
- https://www.konkred.xyz
- https://konkred-template2.vercel.app
- http://localhost:3000

Add exact preview origins in Supabase Auth URL Configuration before testing
OAuth/email confirmations there. Avoid wildcards over shared domains.

## Remaining operator/deployment steps

1. Deploy this updated branch. Environment changes do not update existing
   deployments. No production deployment was triggered during this migration.
2. Enable Google/GitHub in Supabase Auth Providers and enter their OAuth app
   credentials there. Both providers are currently disabled. Provider callback:
   https://rwuyuhjkitcnekpwmoml.supabase.co/auth/v1/callback
3. Configure production SMTP. Default Supabase email sending is restrictive;
   confirmation-email delivery has not been tested here.
4. Existing Firebase accounts, password hashes, sessions and cloud data were
   NOT imported. Use a separate controlled export/import or re-registration.
   No remote Firebase project was deleted; keep it until exports are complete.
5. The AI gateway is still undeployed. It needs KONKRED_GATEWAY_URL,
   KONKRED_GATEWAY_API_KEY and FULLKONK_KEY with matching gateway credentials.
6. Billing still needs DATABASE_URL, existing ledger migrations, ANON_SALT,
   INTERNAL_API_KEY and payment-provider configuration. The document schema
   does not initialize that separate billing schema.
7. For blog administrators, set app_metadata.role to admin through trusted
   administration and set the profile canGenerateBlogs flag in the SQL
   dashboard. Refresh the session. Never grant rights via user_metadata.

## Verification

Run npm run typecheck, npm run build:vercel and npm test.
New regression tests: tests/supabase-auth.test.ts and
 tests/supabase-documents.test.ts.

A transaction against the actual Supabase database verified profile creation,
owner-only visibility, denial of cross-owner writes and profile self-promotion,
atomic settings merges, and anonymous lead insertion without read access. All
fixtures were rolled back. Live email/OAuth redirects and browser-to-Supabase
network access were not exercised in the sandbox.

Pre-existing broken merge remnants in the API entry, fullKONK UI and gateway
tests were repaired. The gateway test file was split without dropping either
suite. npm is the deployment package manager; the obsolete Bun lock was removed
so it cannot reinstall old Firebase SDKs.
