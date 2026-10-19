import React, { useEffect, useState, useCallback } from 'react';
import { Key, Copy, Trash2, Plus, RefreshCw, Loader2, AlertTriangle, CheckCircle, CreditCard, Zap, Shield, Eye, EyeOff } from 'lucide-react';
import { getAccessToken } from '../../services/supabase.ts';

interface KredKeyRow {
  id: string;
  name: string;
  preview: string;
  tier: string;
  quota: { totalRemaining: number; trialRemaining: number; paidRemaining: number; dailyRemaining: number; exhausted?: boolean; plan?: string };
  createdAt: string;
  lastUsedAt: string | null;
}

interface Usage { totalRemaining: number; trialRemaining: number; paidRemaining: number; dailyRemaining: number; exhausted: boolean; plan?: string; }

const KredKeys: React.FC = () => {
  const [keys, setKeys] = useState<KredKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [lastCreated, setLastCreated] = useState<{ key: string; id: string } | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Array<{ id: string; name: string; priceUsd: number; messages: number }>>([]);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string,string>> => {
    try { const t = await getAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; }
  }, []);

  const fetchKeys = useCallback(async () => {
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/kredkeys', { headers });
      if (!res.ok) {
        const j = await res.json().catch(()=>({ error: res.statusText }));
        throw new Error(j.error || `Failed to load keys (${res.status})`);
      }
      const data = await res.json();
      setKeys(data.keys || []);
      // also fetch plans
      try {
        const pr = await fetch('/api/payments/plans');
        if (pr.ok) { const pj = await pr.json(); setPlans(pj.plans || []); }
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async () => {
    setCreating(true); setError(null);
    try {
      const headers = { ...(await authHeaders()), 'content-type': 'application/json' };
      const res = await fetch('/api/kredkeys', { method: 'POST', headers, body: JSON.stringify({ name: newName.trim() || undefined }) });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.error || `Create failed (${res.status})`);
      setLastCreated({ key: data.key, id: data.id });
      setNewName('');
      await fetchKeys();
    } catch (e) {
      setError((e as Error).message);
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Revoke this key? This cannot be undone.')) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/kredkeys/${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('Delete failed');
      setKeys(k => k.filter(x => x.id !== id));
    } catch (e) { setError((e as Error).message); }
  };

  const handleCopy = async (val: string, id: string) => {
    try { await navigator.clipboard.writeText(val); setCopied(id); setTimeout(()=>setCopied(null), 2000); }
    catch { /* fallback */ }
  };

  const handleCheckout = async (planId: string) => {
    setCheckoutLoading(planId); setError(null);
    try {
      const headers = { ...(await authHeaders()), 'content-type': 'application/json' };
      const res = await fetch('/api/payments/create', { method: 'POST', headers, body: JSON.stringify({ planId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.invoiceUrl) window.open(data.invoiceUrl, '_blank', 'noopener');
      else if (data.orderId) setError(`Order ${data.orderId} created — complete payment at provider.`);
    } catch (e) { setError((e as Error).message); } finally { setCheckoutLoading(null); }
  };

  if (loading) {
    return <div className="h-64 flex flex-col items-center justify-center gap-4"><Loader2 className="animate-spin text-neon-cyan" size={28}/><span className="text-[10px] font-mono text-ghost uppercase tracking-widest">Loading KRedKeys…</span></div>;
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex justify-between items-end pb-6 border-b border-white/5">
        <div>
          <h2 className="text-2xl font-display font-bold text-white uppercase tracking-tight flex items-center gap-3"><Key size={22} className="text-neon-cyan"/> KRedKeys</h2>
          <p className="text-[10px] text-ghost font-mono uppercase tracking-widest mt-2">Self-serve API keys — kred_live_… — for your own apps. Works with api.konkred.xyz/v1 (OpenAI-compatible).</p>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 border border-white/10 rounded-full px-3 py-1">{keys.length}/5 keys</span>
      </header>

      {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-mono flex gap-2"><AlertTriangle size={16}/> <span>{error}</span></div>}

      {lastCreated && (
        <div className="concrete-card p-6 rounded-2xl bg-neon-cyan/10 border-neon-cyan/30 border">
          <h3 className="text-xs font-mono font-black text-white uppercase tracking-widest flex items-center gap-2"><CheckCircle size={14} className="text-neon-cyan"/> Key created — copy now (shown once)</h3>
          <div className="mt-4 flex gap-3">
            <code className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-neon-cyan font-mono break-all">{lastCreated.key}</code>
            <button onClick={()=>handleCopy(lastCreated.key, lastCreated.id)} className="px-4 py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest">{copied===lastCreated.id?'Copied':'Copy'}</button>
          </div>
          <p className="text-[10px] text-ghost font-mono mt-3">Store this securely — it will not be shown again. Treat like a password. Keys are kept server-side in sensitive env (USERS_JSON_BASE64) and app_documents.</p>
        </div>
      )}

      <section className="concrete-card p-8 rounded-2xl bg-white/[0.02] border-white/10 space-y-6">
        <h3 className="text-xs font-mono font-black text-white uppercase tracking-[0.3em] flex items-center gap-2"><Plus size={14}/> Create new key</h3>
        <div className="flex gap-3">
          <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="my-app (optional)" className="flex-1 bg-void-300 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-neon-cyan outline-none font-mono" maxLength={60} />
          <button onClick={handleCreate} disabled={creating || keys.length>=5} className="px-6 py-3 bg-neon-cyan text-black rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-2">
            {creating ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} Create
          </button>
        </div>
        <p className="text-[10px] font-mono text-zinc-500">Free tier: limited free tokens (10 workflows + daily trial) then 402 paywall. Upgrade below for paid quota.</p>
      </section>

      <section className="space-y-4">
        <h3 className="text-xs font-mono font-black text-ghost uppercase tracking-[0.4em]">Your keys</h3>
        {keys.length===0 ? (
          <div className="concrete-card p-10 rounded-2xl border-white/10 text-center"><Key size={24} className="mx-auto text-ghost mb-3"/><p className="text-xs font-mono text-ghost">No keys yet — create one above.</p><p className="text-[10px] text-zinc-500 font-mono mt-2">Example: <code className="text-neon-cyan">curl https://api.konkred.xyz/v1/models -H &quot;Authorization: Bearer kred_live_xxx&quot;</code></p></div>
        ) : (
          <div className="grid gap-4">
            {keys.map(k=>(
              <div key={k.id} className="concrete-card p-6 rounded-2xl bg-black/20 border border-white/10 flex flex-col gap-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white">
                      {k.name || 'Untitled'} <span className="ml-2 text-[10px] font-mono px-2 py-1 rounded-full bg-white/10 border border-white/10">{k.tier}</span>
                    </h4>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="text-xs font-mono text-zinc-400 truncate">{k.preview}</code>
                      <button onClick={()=>handleCopy(k.preview, k.id)} className="text-ghost hover:text-white"><Copy size={12}/></button>
                    </div>
                    <p className="text-[10px] font-mono text-zinc-500 mt-1">Created {new Date(k.createdAt).toLocaleString()} {k.lastUsedAt ? `· Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : '· Never used'}</p>
                  </div>
                  <button onClick={()=>handleDelete(k.id)} className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 hover:bg-red-500/20"><Trash2 size={14}/></button>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest"><span className="text-ghost">Quota remaining</span><span className={k.quota.exhausted ? 'text-red-400':'text-neon-cyan'}>{k.quota.totalRemaining} messages · trial {k.quota.trialRemaining} · paid {k.quota.paidRemaining} · daily {k.quota.dailyRemaining}</span></div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-neon-cyan" style={{ width: `${Math.min(100, Math.max(4, (k.quota.totalRemaining/20)*100))}%` }}/></div>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-ghost font-mono text-[10px] uppercase tracking-widest">Usage & upgrade</summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plans.map(p=>(
                      <button key={p.id} onClick={()=>handleCheckout(p.id)} disabled={!!checkoutLoading} className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-[10px] font-mono text-white flex items-center gap-2">
                        {checkoutLoading===p.id ? <Loader2 size={12} className="animate-spin"/> : <CreditCard size={12}/>} {p.name} — ${p.priceUsd} · {p.messages} msgs
                      </button>
                    ))}
                    {plans.length===0 && <span className="text-[10px] font-mono text-zinc-500">Plans unavailable (payments not configured).</span>}
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="concrete-card p-8 rounded-2xl bg-amber-500/10 border-amber-500/20 border space-y-4">
        <h3 className="text-xs font-mono font-black text-amber-400 uppercase tracking-widest flex items-center gap-2"><Zap size={14}/> How to use</h3>
        <pre className="bg-black/60 border border-white/10 rounded-xl p-4 text-[11px] font-mono text-zinc-300 overflow-x-auto">{`# OpenAI-compatible endpoint — use anywhere (curl, Python, Node)
curl https://api.konkred.xyz/v1/chat/completions \\
  -H "Authorization: Bearer kred_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"hello"}]}'

# Python (openai SDK)
from openai import OpenAI
client = OpenAI(base_url="https://api.konkred.xyz/v1", api_key="kred_live_...")`}</pre>
        <p className="text-[10px] font-mono text-zinc-400">Keys are server-only sensitive env vars — never exposed in Vite bundle. Revoke anytime above.</p>
      </section>
    </div>
  );
};

export default KredKeys;
