// services/fullkonk.analytics.ts

import { db } from './supabase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from './documents';

export interface UsageEvent {
  id:         string;
  userId:     string;
  provider:   string;
  model:      string;
  mode:       string;
  stage:      string;
  tokens:     number;
  durationMs: number;
  success:    boolean;
  createdAt:  number;
}

export interface UsageSummary {
  totalGenerations: number;
  totalTokens:      number;
  totalDurationMs:  number;
  byProvider:       Record<string, { count: number; tokens: number }>;
  byMode:           Record<string, number>;
  failoverCount:    number;
  avgDurationMs:    number;
}

// Log a usage event
export async function logUsage(data: Omit<UsageEvent, 'id' | 'createdAt'>): Promise<void> {
  try {
    await addDoc(collection(db, 'fk_usage'), {
      ...data,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Telemetry must never interrupt a generation.
  }
}

// Get usage summary for a user over N days
export async function getUserUsageSummary(userId: string, days = 30): Promise<UsageSummary> {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  let events: Omit<UsageEvent, 'id'>[] = [];

  try {
    const q = query(
      collection(db, 'fk_usage'),
      where('userId', '==', userId),
      where('createdAt', '>=', Timestamp.fromMillis(since)),
      orderBy('createdAt', 'desc'),
      limit(1000),
    );
    const snap = await getDocs(q);
    events = snap.docs.map(d => d.data() as Omit<UsageEvent, 'id'>);
  } catch (err) {
    // Fallback if composite index is missing
    const fallbackQ = query(
      collection(db, 'fk_usage'),
      where('userId', '==', userId),
      limit(1000),
    );
    const snap = await getDocs(fallbackQ);
    events = snap.docs
      .map(d => d.data() as Omit<UsageEvent, 'id'>)
      .filter(e => {
        const createdAt = e.createdAt as unknown;
        const ms = createdAt instanceof Timestamp ? createdAt.toMillis() : 0;
        return ms >= since;
      });
  }

  const summary: UsageSummary = {
    totalGenerations: events.length,
    totalTokens:      0,
    totalDurationMs:  0,
    byProvider:       {},
    byMode:           {},
    failoverCount:    0,
    avgDurationMs:    0,
  };

  for (const e of events) {
    summary.totalTokens     += e.tokens      ?? 0;
    summary.totalDurationMs += e.durationMs  ?? 0;

    if (!summary.byProvider[e.provider]) {
      summary.byProvider[e.provider] = { count: 0, tokens: 0 };
    }
    summary.byProvider[e.provider].count  += 1;
    summary.byProvider[e.provider].tokens += e.tokens ?? 0;

    summary.byMode[e.mode] = (summary.byMode[e.mode] ?? 0) + 1;
  }

  summary.avgDurationMs = events.length
    ? Math.round(summary.totalDurationMs / events.length)
    : 0;

  return summary;
}

// Get recent events
export async function getRecentEvents(userId: string, count = 10): Promise<UsageEvent[]> {
  try {
    const q = query(
      collection(db, 'fk_usage'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(count),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id:         d.id,
      ...(d.data() as Omit<UsageEvent, 'id'>),
      createdAt: (d.data().createdAt as Timestamp)?.toMillis?.() ?? 0,
    }));
  } catch (err) {
    // Fallback if composite index is missing
    const fallbackQ = query(
      collection(db, 'fk_usage'),
      where('userId', '==', userId),
      limit(count * 2),
    );
    const snap = await getDocs(fallbackQ);
    const list = snap.docs.map(d => ({
      id:         d.id,
      ...(d.data() as Omit<UsageEvent, 'id'>),
      createdAt: (d.data().createdAt as Timestamp)?.toMillis?.() ?? 0,
    }));
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list.slice(0, count);
  }
}
