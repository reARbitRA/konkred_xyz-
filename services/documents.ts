/** Document-shaped application records backed exclusively by Supabase Postgres.
 * Access is enforced in SQL by RLS, including when a caller supplies a userId.
 * This small repository API preserves existing application payload shapes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
type Store = () => SupabaseClient;
type Ref = { store: Store; collection: string; id?: string; filters?: Filter[] };
type Filter = { kind: string; field?: string; op?: string; value: any };
export class Timestamp {
  constructor(public seconds: number) {}
  static fromMillis(ms: number) { return new Timestamp(ms / 1000); }
  toMillis() { return this.seconds * 1000; }
  toDate() { return new Date(this.toMillis()); }
}
export const serverTimestamp = () => Timestamp.fromMillis(Date.now());
function revive(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (typeof value.seconds === 'number' && Object.keys(value).length === 1) return new Timestamp(value.seconds);
  if (Array.isArray(value)) return value.map(revive);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
}
export function collection(store: Store, path: string): Ref { return { store, collection: path }; }
export function doc(store: Store, ...parts: string[]): Ref {
  const path = parts.join('/').split('/');
  const id = path.pop();
  if (!id || path.length % 2 !== 1) throw new Error('Invalid record path.');
  return { store, collection: path.join('/'), id };
}
export const where = (field: string, op: string, value: any): Filter => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, direction = 'asc'): Filter => ({ kind: 'order', field, value: direction });
export const limit = (count: number): Filter => ({ kind: 'limit', value: Math.max(1, Math.min(count, 1000)) });
export const query = (ref: Ref, ...filters: Filter[]): Ref => ({ ...ref, filters });
const snapshot = (row: any) => ({ id: row?.id as string, exists: () => !!row, data: (): Record<string, any> => revive(row?.data || {}) });
export async function getDoc(ref: Ref) {
  const { data, error } = await ref.store().from('app_documents').select('id,data').eq('collection', ref.collection).eq('id', ref.id!).maybeSingle();
  if (error) throw error;
  return snapshot(data);
}
export async function getDocs(ref: Ref) {
  let request = ref.store().from('app_documents').select('id,data').eq('collection', ref.collection);
  for (const filter of ref.filters || []) {
    if (filter.kind === 'where') {
      const field = `data->>${filter.field}`;
      if (filter.op === '==') request = request.eq(field, filter.value);
      else if (filter.op === '>=') request = request.gte(`data->${filter.field}->>seconds`, filter.value.seconds);
      else throw new Error('Unsupported query operator.');
    }
    if (filter.kind === 'order') request = request.order(`data->${filter.field}->>seconds`, { ascending: filter.value !== 'desc' });
    if (filter.kind === 'limit') request = request.limit(filter.value);
  }
  const { data, error } = await request;
  if (error) throw error;
  return { docs: (data || []).map(snapshot) };
}
export async function setDoc(ref: Ref, data: object, options?: { merge?: boolean }) {
  if (ref.collection === 'users') return updateDoc(ref, data);
  // Merge is performed atomically in Postgres, not as a read/overwrite race.
  const { error } = await ref.store().rpc('write_app_document', {
    p_collection: ref.collection, p_id: ref.id, p_data: JSON.parse(JSON.stringify(data)), p_merge: !!options?.merge,
  });
  if (error) throw error;
}
export async function addDoc(ref: Ref, data: object) {
  const id = crypto.randomUUID();
  const { error } = await ref.store().from('app_documents').insert({ collection: ref.collection, id, data: JSON.parse(JSON.stringify(data)) });
  if (error) throw error;
  return { id };
}
export async function updateDoc(ref: Ref, data: object) {
  const { error } = await ref.store().rpc('update_app_document', {
    p_collection: ref.collection, p_id: ref.id, p_data: JSON.parse(JSON.stringify(data)),
  });
  if (error) throw error;
}
export async function deleteDoc(ref: Ref) {
  const { error } = await ref.store().from('app_documents').delete().eq('collection', ref.collection).eq('id', ref.id!);
  if (error) throw error;
}
