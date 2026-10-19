// services/fullkonk.sessions.ts

import { db } from './supabase';
import {
  collection,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from './documents';
import { FKMessage, GeneratedFile, BuildMode } from '../types';

export interface FKSession {
  id:         string;
  userId:     string;
  title:      string;
  mode:       BuildMode;
  provider:   string;
  model:      string;
  messages:   FKMessage[];
  files:      GeneratedFile[];
  createdAt:  number;
  updatedAt:  number;
  tokenCount: number;
  stage:      string;
}

export interface FKSessionCreate {
  userId:   string;
  title:    string;
  mode:     BuildMode;
  provider: string;
  model:    string;
}

// Create new session
export async function createSession(data: FKSessionCreate): Promise<string> {
  const ref = await addDoc(collection(db, 'fk_sessions'), {
    ...data,
    messages:   [],
    files:      [],
    tokenCount: 0,
    stage:      'idle',
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  });
  return ref.id;
}

// Update session with messages and files
export async function updateSession(
  sessionId: string,
  data: Partial<Pick<FKSession, 'messages' | 'files' | 'stage' | 'tokenCount' | 'title'>>
): Promise<void> {
  const ref = doc(db, 'fk_sessions', sessionId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('Session no longer exists. Start a new session.');
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// Get sessions for a user
export async function getUserSessions(userId: string, count = 20): Promise<FKSession[]> {
  try {
    const q = query(
      collection(db, 'fk_sessions'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc'),
      limit(count),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id:         d.id,
        userId:     data.userId,
        title:      data.title,
        mode:       data.mode,
        provider:   data.provider,
        model:      data.model,
        messages:   data.messages ?? [],
        files:      data.files ?? [],
        tokenCount: data.tokenCount ?? 0,
        stage:      data.stage ?? 'idle',
        createdAt:  (data.createdAt as Timestamp)?.toMillis?.() ?? 0,
        updatedAt:  (data.updatedAt as Timestamp)?.toMillis?.() ?? 0,
      } satisfies FKSession;
    });
  } catch (err) {
    // Fallback if composite index on userId + updatedAt is missing
    const fallbackQ = query(
      collection(db, 'fk_sessions'),
      where('userId', '==', userId),
      limit(count * 2),
    );
    const snap = await getDocs(fallbackQ);
    const list = snap.docs.map(d => {
      const data = d.data();
      return {
        id:         d.id,
        userId:     data.userId,
        title:      data.title,
        mode:       data.mode,
        provider:   data.provider,
        model:      data.model,
        messages:   data.messages ?? [],
        files:      data.files ?? [],
        tokenCount: data.tokenCount ?? 0,
        stage:      data.stage ?? 'idle',
        createdAt:  (data.createdAt as Timestamp)?.toMillis?.() ?? 0,
        updatedAt:  (data.updatedAt as Timestamp)?.toMillis?.() ?? 0,
      } satisfies FKSession;
    });
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list.slice(0, count);
  }
}

// Get single session
export async function getSession(sessionId: string): Promise<FKSession | null> {
  const snap = await getDoc(doc(db, 'fk_sessions', sessionId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id:         snap.id,
    userId:     data.userId,
    title:      data.title,
    mode:       data.mode,
    provider:   data.provider,
    model:      data.model,
    messages:   data.messages ?? [],
    files:      data.files ?? [],
    tokenCount: data.tokenCount ?? 0,
    stage:      data.stage ?? 'idle',
    createdAt:  (data.createdAt as Timestamp)?.toMillis?.() ?? 0,
    updatedAt:  (data.updatedAt as Timestamp)?.toMillis?.() ?? 0,
  };
}

// Generate title from first user message
export function generateSessionTitle(prompt: string): string {
  return prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt;
}
