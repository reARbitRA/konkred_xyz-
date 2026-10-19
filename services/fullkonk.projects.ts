import { db } from './supabase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from './documents';
import { FKProject, GeneratedFile } from '../types';

export interface ProjectInput {
  userId: string;
  name: string;
  description: string;
  stack: string[];
  files: GeneratedFile[];
  sessions: string[];
}

function mapProject(id: string, data: Record<string, unknown>): FKProject {
  const toMillis = (value: unknown): number => value instanceof Timestamp ? value.toMillis() : 0;
  return {
    id,
    userId: typeof data.userId === 'string' ? data.userId : '',
    name: typeof data.name === 'string' ? data.name : 'Untitled project',
    description: typeof data.description === 'string' ? data.description : '',
    stack: Array.isArray(data.stack) ? data.stack.filter((item): item is string => typeof item === 'string') : [],
    files: Array.isArray(data.files) ? data.files as GeneratedFile[] : [],
    sessions: Array.isArray(data.sessions) ? data.sessions.filter((item): item is string => typeof item === 'string') : [],
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

export async function saveProject(input: ProjectInput, projectId?: string): Promise<string> {
  const payload = {
    ...input,
    updatedAt: serverTimestamp(),
  };
  if (projectId) {
    const ref = doc(db, 'fk_projects', projectId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) throw new Error('Project no longer exists.');
    await setDoc(ref, payload, { merge: true });
    return projectId;
  }
  const ref = await addDoc(collection(db, 'fk_projects'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getProject(projectId: string): Promise<FKProject | null> {
  const snapshot = await getDoc(doc(db, 'fk_projects', projectId));
  return snapshot.exists() ? mapProject(snapshot.id, snapshot.data()) : null;
}

export async function getUserProjects(userId: string, count = 20): Promise<FKProject[]> {
  try {
    const snapshot = await getDocs(query(
      collection(db, 'fk_projects'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc'),
      limit(count),
    ));
    return snapshot.docs.map(item => mapProject(item.id, item.data()));
  } catch (primaryError) {
    try {
      const snapshot = await getDocs(query(
        collection(db, 'fk_projects'),
        where('userId', '==', userId),
        limit(count),
      ));
      return snapshot.docs
        .map(item => mapProject(item.id, item.data()))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      throw primaryError;
    }
  }
}
