"""
Local PostgreSQL for development and verification (dev only).

Runs a real PostgreSQL server via `pgserver`, so billing logic is exercised
against genuine transactions, row locks and UNIQUE constraints rather than an
emulator. An in-memory emulator was found to hide a real connection-pool
deadlock, so the real server is what the billing tests should run against.

Setup (once):
    python3 -m venv /tmp/pgvenv && /tmp/pgvenv/bin/pip install pgserver

Run:
    /tmp/pgvenv/bin/python scripts/dev/start-postgres.py

The data directory lives under /tmp deliberately: it is disposable, and must
never be committed. Apply the schema afterwards with:

    psql "$DATABASE_URL" -f src/db/migrations/0001_billing.sql
"""
import pathlib
import time

import pgserver

DATA_DIR = pathlib.Path("/tmp/pgdata")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # cleanup_mode=None keeps the server alive after this process is signalled,
    # so it survives for the lifetime of the dev session.
    server = pgserver.get_server(DATA_DIR, cleanup_mode=None)
    print(f"URI: {server.get_uri()}", flush=True)
    print(
        "DATABASE_URL=postgresql://postgres@localhost/postgres?host=/tmp/pgdata",
        flush=True,
    )
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
