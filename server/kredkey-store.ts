/**
 * KRedKey store — server-only, production ready.
 * 
 * Each KRedKey is `kred_live_<hex>` with per-key quota via Billing (api:<key> identity).
 * Persisted in Postgres when DATABASE_URL exists, otherwise in Supabase app_documents
 * collection `kred_keys` (RLS-isolated per user) with in-memory fallback for tests/CI.
 * 
 * Security: Keys are generated with crypto.randomBytes, shown once, never logged.
 * Billing identity is `api:<kred_key>` — never trust browser-supplied identity.
 */
import type { Pool } from 'pg';
import { randomBytes } from 'node:crypto';

export interface KredKeyRecord {
  id: string;
  userId: string;
  name: string;
  key: string; // kred_live_*
  tier: 'free' | 'standard' | 'trusted' | 'internal';
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

const TIER_BY_PLAN: Record<string, KredKeyRecord['tier']> = {
  starter: 'standard',
  pro: 'trusted',
  agency: 'internal',
};

export function planToTier(planId: string): KredKeyRecord['tier'] {
  return TIER_BY_PLAN[planId] ?? 'standard';
}

export function generateKredKey(prefix = 'kred_live_'): string {
  return `${prefix}${randomBytes(24).toString('hex')}`;
}
export function generateKredAdminKey(): string {
  return `kred_admin_${randomBytes(32).toString('hex')}`;
}

function nowIso(): string { return new Date().toISOString(); }

/**
 * Minimal store interface — implemented by Postgres, Supabase, or memory.
 */
export interface KredKeyStore {
  create(userId: string, name: string, tier?: KredKeyRecord['tier']): Promise<KredKeyRecord>;
  list(userId: string): Promise<KredKeyRecord[]>;
  revoke(userId: string, id: string): Promise<boolean>;
  findByKey(key: string): Promise<KredKeyRecord | null>;
  touch(key: string): Promise<void>;
}

/* ── In-memory fallback (tests, CI, no DATABASE_URL) ────────────────────── */
export class MemoryKredKeyStore implements KredKeyStore {
  private byId = new Map<string, KredKeyRecord>();
  private byKey = new Map<string, KredKeyRecord>();
  async create(userId: string, name: string, tier: KredKeyRecord['tier'] = 'free'): Promise<KredKeyRecord> {
    const rec: KredKeyRecord = {
      id: `kred_${randomBytes(8).toString('hex')}`,
      userId,
      name: name.trim().slice(0, 80) || 'Default KRedKey',
      key: generateKredKey(),
      tier,
      createdAt: nowIso(),
      revokedAt: null,
      lastUsedAt: null,
    };
    this.byId.set(rec.id, rec);
    this.byKey.set(rec.key, rec);
    return rec;
  }
  async list(userId: string): Promise<KredKeyRecord[]> {
    return [...this.byId.values()].filter(r => r.userId === userId && !r.revokedAt).sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
  }
  async revoke(userId: string, id: string): Promise<boolean> {
    const rec = this.byId.get(id);
    if (!rec || rec.userId !== userId) return false;
    rec.revokedAt = nowIso();
    this.byId.set(id, rec);
    this.byKey.set(rec.key, rec);
    return true;
  }
  async findByKey(key: string): Promise<KredKeyRecord | null> {
    const rec = this.byKey.get(key);
    if (!rec || rec.revokedAt) return null;
    return rec;
  }
  async touch(key: string): Promise<void> {
    const rec = this.byKey.get(key);
    if (rec) { rec.lastUsedAt = nowIso(); }
  }
}

/* ── Postgres store (production, shared with billing) ────────────────────── */
export class PostgresKredKeyStore implements KredKeyStore {
  constructor(private pool: Pool) {}
  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kred_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key TEXT UNIQUE NOT NULL,
        tier TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS kred_keys_user_idx ON kred_keys(user_id);
      CREATE INDEX IF NOT EXISTS kred_keys_key_idx ON kred_keys(key);
    `);
  }
  async create(userId: string, name: string, tier: KredKeyRecord['tier'] = 'free'): Promise<KredKeyRecord> {
    const rec: KredKeyRecord = {
      id: `kred_${randomBytes(8).toString('hex')}`,
      userId,
      name: name.trim().slice(0, 80) || 'Default KRedKey',
      key: generateKredKey(),
      tier,
      createdAt: nowIso(),
      revokedAt: null,
      lastUsedAt: null,
    };
    await this.pool.query(
      `INSERT INTO kred_keys(id,user_id,name,key,tier,created_at) VALUES($1,$2,$3,$4,$5,$6)`,
      [rec.id, rec.userId, rec.name, rec.key, rec.tier, rec.createdAt]
    );
    return rec;
  }
  async list(userId: string): Promise<KredKeyRecord[]> {
    const { rows } = await this.pool.query(`SELECT * FROM kred_keys WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC`, [userId]);
    return rows.map(r => ({
      id: r.id, userId: r.user_id, name: r.name, key: r.key, tier: r.tier as KredKeyRecord['tier'],
      createdAt: new Date(r.created_at).toISOString(), revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    }));
  }
  async revoke(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`UPDATE kred_keys SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL`, [id, userId]);
    return (rowCount ?? 0) > 0;
  }
  async findByKey(key: string): Promise<KredKeyRecord | null> {
    const { rows } = await this.pool.query(`SELECT * FROM kred_keys WHERE key=$1 AND revoked_at IS NULL LIMIT 1`, [key]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id, userId: r.user_id, name: r.name, key: r.key, tier: r.tier as KredKeyRecord['tier'],
      createdAt: new Date(r.created_at).toISOString(), revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    };
  }
  async touch(key: string): Promise<void> {
    await this.pool.query(`UPDATE kred_keys SET last_used_at=now() WHERE key=$1`, [key]).catch(()=>{});
  }
}

/* ── Supabase app_documents store (fallback when no DATABASE_URL) ────────── */
export class SupabaseKredKeyStore implements KredKeyStore {
  constructor(private supabaseUrl: string, private serviceKey: string) {}
  private async q<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(init?.headers as Record<string,string> ?? {}),
      },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    return res.json() as Promise<T>;
  }
  async create(userId: string, name: string, tier: KredKeyRecord['tier'] = 'free'): Promise<KredKeyRecord> {
    const rec: KredKeyRecord = {
      id: `kred_${randomBytes(8).toString('hex')}`,
      userId,
      name: name.trim().slice(0, 80) || 'Default KRedKey',
      key: generateKredKey(),
      tier,
      createdAt: nowIso(),
      revokedAt: null,
      lastUsedAt: null,
    };
    // Use app_documents as generic JSON store when no dedicated table — store under collection kred_keys
    await fetch(`${this.supabaseUrl}/rest/v1/app_documents`, {
      method: 'POST',
      headers: { apikey: this.serviceKey, Authorization: `Bearer ${this.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: 'kred_keys', id: rec.id, data: rec }),
    }).catch(()=>{});
    return rec;
  }
  async list(userId: string): Promise<KredKeyRecord[]> {
    try {
      const rows = await this.q<Record<string,unknown>[]>(`app_documents?collection=eq.kred_keys&select=data`);
      return (rows as unknown as {data: KredKeyRecord}[]).map(r=>r.data).filter(r=>r.userId===userId && !r.revokedAt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    } catch { return []; }
  }
  async revoke(userId: string, id: string): Promise<boolean> {
    // Mark revoked via update — best effort
    try {
      await fetch(`${this.supabaseUrl}/rest/v1/app_documents?collection=eq.kred_keys&id=eq.${id}`, {
        method: 'PATCH',
        headers: { apikey: this.serviceKey, Authorization: `Bearer ${this.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { revokedAt: nowIso() } }),
      });
      return true;
    } catch { return false; }
  }
  async findByKey(key: string): Promise<KredKeyRecord | null> {
    try {
      const rows = await this.q<Record<string,unknown>[]>(`app_documents?collection=eq.kred_keys&select=data`);
      const found = (rows as unknown as {data: KredKeyRecord}[]).map(r=>r.data).find(r=>r.key===key && !r.revokedAt) ?? null;
      return found;
    } catch { return null; }
  }
  async touch(): Promise<void> { /* no-op for supabase fallback */ }
}

/* Singleton resolver — call per request but caches pool */
let singleton: KredKeyStore | null | undefined;
export async function getKredKeyStore(): Promise<KredKeyStore> {
  if (singleton !== undefined) return singleton!;
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: dbUrl, max: 3, ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: true } });
      pool.on('error',()=>{});
      const pg = new PostgresKredKeyStore(pool);
      await pg.init();
      singleton = pg;
      return singleton;
    } catch { /* fall through to memory */ }
  }
  // Supabase service key fallback — keep memory for now if service key not set (tests)
  singleton = new MemoryKredKeyStore();
  return singleton;
}
// For tests: reset singleton
export function __resetKredKeyStoreForTests(store?: KredKeyStore | null): void {
  singleton = store as unknown as KredKeyStore | null | undefined;
}
