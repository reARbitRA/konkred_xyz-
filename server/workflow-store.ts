/**
 * Durable state for the workflow runner (server-only).
 *
 * Two things must survive a process restart and must be shared across
 * serverless instances, so both live in PostgreSQL rather than in memory:
 *
 *   1. Idempotency. A reconnect that replays the same key must return the
 *      ORIGINAL result and cost nothing. An in-memory map (the one
 *      server/metering.ts keeps for stream retries) cannot do that: it holds
 *      no result, and a second Vercel instance has never seen it.
 *
 *   2. Anonymous demo abuse control. Per-IP and global ceilings counted in SQL
 *      for the same reason invoice throttling is — serverless instances share
 *      no memory, so an in-process counter resets on every cold start and is
 *      bypassed by spreading requests across instances.
 *
 * The record is scoped by identity: an idempotency key can only ever return a
 * result to the identity that created it, so a guessed key cannot read another
 * caller's output or be pointed at another caller's balance.
 */
import type { Pool, PoolClient } from 'pg';

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export const WORKFLOW_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS workflow_runs (
    id              SERIAL PRIMARY KEY,
    identity        TEXT NOT NULL,
    slug            TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    credits         INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL,
    result          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (identity, idempotency_key)
  );
  CREATE TABLE IF NOT EXISTS demo_runs (
    id         SERIAL PRIMARY KEY,
    ip_hash    TEXT NOT NULL,
    slug       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

export interface StoredRun {
  status: string;
  credits: number;
  result: unknown;
  createdAt: string | null;
}

export class WorkflowStore {
  private ensured: Promise<void> | null = null;

  constructor(private readonly pool: Queryable) {}

  /**
   * Create the tables if they are absent.
   *
   * Idempotent and cheap. Done lazily rather than at import time because the
   * production incident this codebase still carries scars from was caused by
   * a module doing database work at module scope.
   */
  ensureSchema(): Promise<void> {
    this.ensured ||= (async () => {
      for (const statement of WORKFLOW_SCHEMA_SQL.split(';')) {
        const sql = statement.trim();
        if (sql) await this.pool.query(sql);
      }
    })();
    return this.ensured;
  }

  /** The previous result for this identity + key, or null. */
  async findRun(identity: string, idempotencyKey: string): Promise<StoredRun | null> {
    await this.ensureSchema();
    const found = await this.pool.query(
      `SELECT status, credits, result, created_at FROM workflow_runs
        WHERE identity = $1 AND idempotency_key = $2`,
      [identity, idempotencyKey],
    );
    if (!found.rowCount) return null;
    const row = found.rows[0] as { status: string; credits: number; result: string | null; created_at: string | null };
    let result: unknown = null;
    if (row.result) {
      try { result = JSON.parse(row.result); } catch { result = null; }
    }
    return { status: row.status, credits: Number(row.credits) || 0, result, createdAt: row.created_at };
  }

  /**
   * Persist a completed run. Returns false when the key already existed, which
   * means a concurrent request won the race — the caller must then read the
   * winner's result rather than returning its own, so one logical generation
   * yields exactly one result.
   */
  async saveRun(params: {
    identity: string;
    slug: string;
    idempotencyKey: string;
    credits: number;
    status: string;
    result: unknown;
  }): Promise<boolean> {
    await this.ensureSchema();
    try {
      await this.pool.query(
        `INSERT INTO workflow_runs (identity, slug, idempotency_key, credits, status, result)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [params.identity, params.slug, params.idempotencyKey, params.credits, params.status, JSON.stringify(params.result ?? null)],
      );
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /** Anonymous demo runs from one hashed IP inside a rolling window. */
  async countDemosByIp(ipHash: string, withinMinutes: number): Promise<number> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM demo_runs
        WHERE ip_hash = $1 AND created_at > now() - ($2::text || ' minutes')::interval`,
      [ipHash, String(withinMinutes)],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  /**
   * Global demo runs inside a rolling window.
   *
   * Rolling 24 hours rather than a calendar day: a calendar ceiling lets an
   * abuser burn the whole allowance twice across a midnight boundary, and the
   * free provider tiers this protects reset on several different clocks
   * anyway (`pt-midnight` for gemini, `utc-midnight` elsewhere).
   */
  async countDemosGlobal(withinMinutes: number): Promise<number> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM demo_runs
        WHERE created_at > now() - ($1::text || ' minutes')::interval`,
      [String(withinMinutes)],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  /** Record a demo attempt. Written BEFORE the gateway call, so a failing run still counts. */
  async recordDemo(ipHash: string, slug: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(`INSERT INTO demo_runs (ip_hash, slug) VALUES ($1, $2)`, [ipHash, slug]);
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === '23505') return true;
  return /unique|duplicate/i.test((error as Error)?.message || '');
}
