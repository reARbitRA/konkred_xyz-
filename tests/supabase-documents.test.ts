import { describe, it, expect, vi } from 'vitest';
import { addDoc, collection, doc, getDoc, getDocs, query, where, limit, orderBy, setDoc, updateDoc, Timestamp } from '../services/documents';
import type { SupabaseClient } from '@supabase/supabase-js';
function harness(result: any = { data: null, error: null }) {
  const chain: any = {};
  for (const method of ['select','eq','gte','order','limit','maybeSingle','insert']) chain[method] = vi.fn(() => chain);
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  const client = { from: vi.fn(() => chain), rpc: vi.fn(async () => result) };
  return { store: () => client as unknown as SupabaseClient, client, chain };
}
describe('Supabase document repository', () => {
  it('revives application timestamps without a vendor SDK', async () => {
    const h = harness({ data: { id: 'project', data: { updatedAt: { seconds: 123 }, files: [] } }, error: null });
    const result = await getDoc(doc(h.store, 'fk_projects', 'project'));
    expect(result.exists()).toBe(true);
    expect(result.data().updatedAt).toBeInstanceOf(Timestamp);
    expect(result.data().updatedAt.toMillis()).toBe(123000);
    expect(result.data().updatedAt.toDate()).toEqual(new Date(123000));
  });
  it('keeps an absent row absent', async () => {
    const h = harness();
    expect((await getDoc(doc(h.store, 'fk_projects', 'missing'))).exists()).toBe(false);
  });
  it('inserts lead forms without requiring anonymous read/update privileges', async () => {
    const h = harness();
    const result = await addDoc(collection(h.store, 'waitlist'), { email: 'lead@example.invalid' });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.chain.insert).toHaveBeenCalledWith(expect.objectContaining({ collection: 'waitlist' }));
    expect(h.chain.select).not.toHaveBeenCalled();
    expect(h.client.rpc).not.toHaveBeenCalled();
  });
  it('merges settings atomically through an invoker-rights RPC', async () => {
    const h = harness();
    await setDoc(doc(h.store, 'users/user-a/settings/ai'), { stream: true }, { merge: true });
    expect(h.client.rpc).toHaveBeenCalledWith('write_app_document', {
      p_collection: 'users/user-a/settings', p_id: 'ai', p_data: { stream: true }, p_merge: true,
    });
  });
  it('updates a profile without triggering auth-only profile creation', async () => {
    const h = harness();
    await setDoc(doc(h.store, 'users', 'user-a'), { displayName: 'New name' }, { merge: true });
    expect(h.client.rpc).toHaveBeenCalledWith('update_app_document', expect.objectContaining({ p_collection: 'users' }));
  });
  it('scopes and limits a user history query in Postgres', async () => {
    const h = harness({ data: [], error: null });
    await getDocs(query(collection(h.store, 'fk_sessions'), where('userId', '==', 'user-a'), orderBy('updatedAt', 'desc'), limit(20)));
    expect(h.chain.eq).toHaveBeenCalledWith('data->>userId', 'user-a');
    expect(h.chain.limit).toHaveBeenCalledWith(20);
    expect(h.chain.order).toHaveBeenCalledWith('data->updatedAt->>seconds', { ascending: false });
  });
  it('surfaces RLS and database failures rather than pretending a write succeeded', async () => {
    const error = { message: 'permission denied', code: '42501' };
    const h = harness({ data: null, error });
    await expect(addDoc(collection(h.store, 'waitlist'), { email: 'lead@example.invalid' })).rejects.toEqual(error);
    await expect(updateDoc(doc(h.store, 'users', 'user-a'), { role: 'admin' })).rejects.toEqual(error);
  });
});
