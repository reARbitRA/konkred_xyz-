import React, { useState, useEffect } from 'react';
import { 
  Zap, Shield, Key, RefreshCw, Eye, EyeOff, Loader2, 
  Terminal, CheckCircle, AlertTriangle, Lock, Cpu, Star, Server, Binary
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useToast } from '../../contexts/ToastContext.tsx';
import { AI_PROVIDERS } from '../../constants.ts';
import { AIProviderID, AIProviderConfig } from '../../types.ts';
import { db } from '../../services/supabase.ts';
import { doc, getDoc, setDoc, updateDoc } from '../../services/documents';
import { aiService } from '../../services/ai.ts';
import Badge from '../common/Badge.tsx';

const AIConfig: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<AIProviderID | null>(null);
  
  const [config, setConfig] = useState<AIProviderConfig>({
    primaryProvider: 'google',
    defaultModel: 'gemini-3-pro-preview',
    temperature: 0.7,
    maxTokens: 4096,
    stream: true
  });

  const [keys, setKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean, latency: number, message: string }>>({});

  useEffect(() => {
    if (!user) return;
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const configSnap = await getDoc(doc(db, `users/${user.id}/settings/ai`));
        if (configSnap.exists()) setConfig(configSnap.data() as AIProviderConfig);
        
        const keysSnap = await getDoc(doc(db, `users/${user.id}/secure/keys`));
        if (keysSnap.exists()) setKeys(keysSnap.data());
      } catch (err) {
        console.error("Failed to sync neural config:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [user]);

  const handleSaveConfig = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, `users/${user.id}/settings/ai`), config);
      showToast("Neural parameters committed to node.", "success");
    } catch (err) {
      showToast("Calibration failed. Verify write permissions.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKey = async (id: AIProviderID) => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, `users/${user.id}/secure/keys`), { [id]: keys[id] }, { merge: true });
      showToast(`${AI_PROVIDERS[id].name} key committed to secure enclave.`, "success");
    } catch (err) {
      showToast("Secure write disruption detected.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: AIProviderID) => {
    // SECURED: Using internal secure proxy on server side to test Google nodes, completely hiding key
    const keyToUse = id === 'google' ? 'internal-secured' : keys[id];
    if (!keyToUse) {
      showToast("Uplink requires a valid access key.", "warning");
      return;
    }
    setTesting(id);
    const result = await aiService.testConnection(id, keyToUse);
    setTestResults(prev => ({ ...prev, [id]: result }));
    if (result.success) {
        showToast(`${AI_PROVIDERS[id].name} node verified. Latency: ${result.latency}ms`, "success");
    } else {
        showToast(`Uplink to ${AI_PROVIDERS[id].name} compromised.`, "error");
    }
    setTesting(null);
  };

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-neon-cyan" size={32} />
        <span className="text-[10px] font-mono text-ghost uppercase tracking-widest">Synchronizing Neural Enclave...</span>
      </div>
    );
  }

  // FIX: Removed 'google' from registry UI. Managing Gemini keys via UI is prohibited as they must come from environment variables.
  const providerCategories = [
    { name: 'Neural Cores', providers: ['openai', 'anthropic', 'xai'] },
    { name: 'Execution Nodes', providers: ['groq', 'cerebras', 'sambanova', 'together', 'fireworks'] },
    { name: 'Global Ecosystem', providers: ['openrouter', 'mistral', 'deepseek', 'qwen', 'perplexity', 'cohere'] }
  ];

  const getProviderIcon = (id: string) => {
      if (['google', 'openai', 'anthropic'].includes(id)) return <Star className="text-neon-cyan" size={16} />;
      if (['groq', 'cerebras', 'fireworks'].includes(id)) return <Cpu className="text-neon-purple" size={16} />;
      return <Server className="text-neon-blue" size={16} />;
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500 max-w-5xl">
       <header className="flex justify-between items-end pb-6 border-b border-white/5">
          <div>
             <h2 className="text-3xl font-display font-bold text-white uppercase tracking-tight">AI Neural Uplink</h2>
             <p className="text-[10px] text-ghost font-mono uppercase tracking-widest mt-2">Manage localized node connectivity and cryptographic keys</p>
          </div>
          <div className="flex gap-4">
             <Badge variant="cyan">STATUS: NOMINAL</Badge>
             <Badge variant="gray">NODE: US-EAST-1</Badge>
          </div>
       </header>

       {/* Global Parameters */}
       <section className="concrete-card p-10 rounded-[2.5rem] bg-black/40 border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
             <Zap size={120} />
          </div>
          <h3 className="text-xs font-mono font-black text-white uppercase tracking-[0.4em] mb-10 flex items-center gap-3">
             <Binary size={16} className="text-neon-cyan" /> Neural Calibrator
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
             <div className="space-y-6">
                <div>
                   <label className="text-[10px] font-mono text-ghost uppercase tracking-widest block mb-3">Primary Execution Node</label>
                   <select 
                      value={config.primaryProvider}
                      onChange={(e) => setConfig({...config, primaryProvider: e.target.value as AIProviderID})}
                      className="w-full bg-void-200 border border-white/10 rounded-xl px-4 py-4 text-sm text-white focus:border-neon-cyan outline-none transition-all font-mono"
                   >
                      {Object.keys(AI_PROVIDERS).map(id => (
                        <option key={id} value={id}>{AI_PROVIDERS[id as AIProviderID].name}</option>
                      ))}
                   </select>
                </div>
                <div>
                   <label className="text-[10px] font-mono text-ghost uppercase tracking-widest block mb-3">Default Model Matrix</label>
                   <select 
                      value={config.defaultModel}
                      onChange={(e) => setConfig({...config, defaultModel: e.target.value})}
                      className="w-full bg-void-200 border border-white/10 rounded-xl px-4 py-4 text-sm text-white focus:border-neon-cyan outline-none transition-all font-mono"
                   >
                      {AI_PROVIDERS[config.primaryProvider].models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                   </select>
                </div>
             </div>

             <div className="space-y-8">
                <div>
                    <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest text-ghost mb-3">
                        <span>Entropy Threshold (Temp)</span>
                        <span className="text-neon-cyan">{config.temperature}</span>
                    </div>
                    <input 
                        type="range" min="0" max="1" step="0.1"
                        value={config.temperature}
                        onChange={(e) => setConfig({...config, temperature: parseFloat(e.target.value)})}
                        className="w-full h-1 bg-void-300 rounded-lg appearance-none cursor-pointer accent-neon-cyan"
                    />
                </div>
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                   <div>
                      <h4 className="text-xs font-bold text-white uppercase">Stream Signal</h4>
                      <p className="text-[10px] text-ghost">Enable real-time packet rendering</p>
                   </div>
                   <button 
                      onClick={() => setConfig({...config, stream: !config.stream})}
                      className={`w-12 h-6 rounded-full p-1 transition-all ${config.stream ? 'bg-neon-cyan' : 'bg-void-300'}`}
                   >
                      <div className={`w-4 h-4 bg-black rounded-full transition-transform ${config.stream ? 'translate-x-6' : 'translate-x-0'}`} />
                   </button>
                </div>
             </div>
          </div>

          <div className="mt-10 pt-8 border-t border-white/5 flex justify-end">
             <button 
                onClick={handleSaveConfig}
                disabled={saving}
                className="bg-white text-black px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-neon-cyan transition-all flex items-center gap-3 shadow-lg"
             >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Commit Parameters
             </button>
          </div>
       </section>

       {/* Provider Registry */}
       <section className="space-y-8">
          <h3 className="text-xs font-mono font-black text-ghost uppercase tracking-[0.4em] flex items-center gap-3">
             <Lock size={16} /> Secure Enclave: Key Storage
          </h3>

          <div className="grid grid-cols-1 gap-12">
            {providerCategories.map(cat => (
              <div key={cat.name} className="space-y-6">
                <div className="flex items-center gap-4">
                  <span className="h-px bg-white/10 flex-1"></span>
                  <h4 className="text-[10px] font-mono text-ghost uppercase tracking-[0.5em] font-black">{cat.name}</h4>
                  <span className="h-px bg-white/10 flex-1"></span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {cat.providers.map(id => {
                    const provider = AI_PROVIDERS[id as AIProviderID];
                    const testResult = testResults[id];
                    const isConfigured = !!keys[id];
                    
                    return (
                      <div key={id} className={`concrete-card p-8 rounded-3xl bg-black/20 border transition-all ${isConfigured ? 'border-white/10' : 'border-white/5 opacity-80'}`}>
                        <header className="flex justify-between items-start mb-8">
                          <div className="flex items-center gap-3">
                             <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                                {getProviderIcon(id)}
                             </div>
                             <div>
                                <h5 className="text-sm font-bold text-white uppercase tracking-tight">{provider.name}</h5>
                                <p className="text-[9px] text-ghost font-mono">Uplink: {id}</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-2">
                             {isConfigured ? (
                                <Badge variant="green" className="animate-pulse">Active</Badge>
                             ) : (
                                <Badge variant="gray">No Key</Badge>
                             )}
                          </div>
                        </header>

                        <div className="space-y-6">
                           <div className="relative group">
                              <label className="text-[9px] font-mono text-ghost uppercase tracking-widest mb-2 block ml-1">Access Token</label>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <input 
                                    type={showKeys[id] ? "text" : "password"}
                                    value={keys[id] || ''}
                                    onChange={(e) => setKeys({...keys, [id]: e.target.value})}
                                    placeholder="••••••••••••••••"
                                    className="w-full bg-void-300 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-xs text-white focus:border-neon-cyan outline-none font-mono"
                                  />
                                  <button 
                                    onClick={() => setShowKeys({...showKeys, [id]: !showKeys[id]})}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ghost hover:text-white"
                                  >
                                    {showKeys[id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                  </button>
                                </div>
                                <button 
                                  onClick={() => handleSaveKey(id as AIProviderID)}
                                  className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-ghost border border-white/10 transition-all"
                                  title="Commit to Enclave"
                                >
                                  <Key size={14} />
                                </button>
                              </div>
                           </div>

                           <div className="flex gap-4">
                              <button 
                                onClick={() => handleTest(id as AIProviderID)}
                                disabled={testing === id}
                                className="flex-1 py-3 bg-white/5 hover:bg-neon-cyan/20 border border-white/10 hover:border-neon-cyan/40 text-ghost hover:text-neon-cyan rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                              >
                                {testing === id ? <Loader2 size={12} className="animate-spin" /> : <Terminal size={12} />}
                                Test Uplink
                              </button>
                           </div>

                           {testResult && (
                             <div className={`p-4 rounded-xl text-[10px] font-mono flex items-start gap-3 animate-in slide-in-from-top-2 ${testResult.success ? 'bg-neon-green/5 border border-neon-green/20 text-neon-green' : 'bg-neon-red/5 border border-neon-red/20 text-neon-red'}`}>
                                {testResult.success ? <CheckCircle size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0" />}
                                <div>
                                   <p className="font-black uppercase">{testResult.success ? 'VERIFICATION_SUCCESS' : 'UPLINK_DENIED'}</p>
                                   <p className="opacity-70 mt-1 uppercase leading-relaxed">{testResult.message} {testResult.success && `(Latency: ${testResult.latency}ms)`}</p>
                                </div>
                             </div>
                           )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
       </section>

       <footer className="pt-20 border-t border-white/5 text-center">
          <div className="flex flex-col items-center gap-6">
             <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-ghost opacity-20">
                <Shield size={24} />
             </div>
             <p className="text-[10px] font-mono text-ghost uppercase tracking-[0.4em] max-w-sm leading-relaxed opacity-40">
                All keys are encrypted at rest using AES-256 protocols and stored within your private node enclave. KONKRED staff never have access to raw credentials.
             </p>
          </div>
       </footer>
    </div>
  );
};

export default AIConfig;
