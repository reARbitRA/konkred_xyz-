
import React, { useState } from 'react';
import { X, ArrowRight, CheckCircle2, Github, Mail, Sparkles, ArrowLeft, Loader2, Lock, Check } from 'lucide-react';
import { PageView } from '../types';
import { useAuth } from '../contexts/AuthContext.tsx';

interface JoinNetworkProps {
  onNavigate: (page: PageView) => void;
  onComplete: (email: string) => void;
}

const JoinNetwork: React.FC<JoinNetworkProps> = ({ onNavigate, onComplete }) => {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedCopyright, setAcceptedCopyright] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!acceptedCopyright) {
      setError("You must agree to the KONKRED Copyright Rules to proceed.");
      return;
    }

    setStatus('loading');
    setError(null);
    try {
      const userEmail = await signup(email, password, name, acceptedCopyright);
      if (userEmail) {
        onComplete(userEmail);
      } else {
        onNavigate('catalogue');
      }
    } catch (err: any) {
      setError(err.message || "Signup failed.");
      setStatus('idle');
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-void-gradient animate-in fade-in duration-500">
      <div className="absolute inset-0 z-0 opacity-[0.03] grid-bg pointer-events-none scale-150 animate-[pulse_8s_ease-in-out_infinite]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/90 z-0 pointer-events-none" />
      
      <button 
        onClick={() => onNavigate('landing')}
        className="absolute top-8 left-8 z-50 text-ghost hover:text-white flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] transition-all group"
      >
        <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
        EXIT_PROTOCOL
      </button>

      <div className="relative w-full max-w-md concrete-card border border-white/10 shadow-2xl p-1 animate-in zoom-in-95 duration-200">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-cyan to-transparent opacity-50"></div>
        
        <div className="p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-neon-cyan/10 border border-neon-cyan/20 rounded-2xl flex items-center justify-center mb-6 animate-pulse">
            <Sparkles className="text-neon-cyan" size={32} />
          </div>

          <h2 className="text-3xl font-display font-bold text-white tracking-tight mb-2">Create Your Node</h2>
          <p className="text-ghost text-sm mb-8 leading-relaxed">
            Join the executive network and begin deploying structural AI capital.
          </p>

          <form onSubmit={handleSubmit} className="w-full space-y-5">
            {error && (
              <div className="bg-neon-red/10 border border-neon-red/20 text-neon-red p-3 rounded text-[10px] font-mono tracking-widest uppercase animate-in fade-in">
                [ERROR] {error}
              </div>
            )}
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-mono text-ghost uppercase tracking-widest ml-1">Identity Designation</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ari Eshghi"
                className="w-full bg-void-200 concrete-card px-4 py-4 text-sm text-white placeholder-ghost outline-none transition-all rounded-xl font-mono"
                required
              />
            </div>

            <div className="space-y-2 text-left">
              <label className="text-[10px] font-mono text-ghost uppercase tracking-widest ml-1">Communication Uplink</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ari@konkred.xyz"
                className="w-full bg-void-200 concrete-card px-4 py-4 text-sm text-white placeholder-ghost outline-none transition-all rounded-xl font-mono"
                required
              />
            </div>

            <div className="space-y-2 text-left">
              <label className="text-[10px] font-mono text-ghost uppercase tracking-widest ml-1">Access Key</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-void-200 concrete-card px-4 py-4 text-sm text-white placeholder-ghost outline-none transition-all rounded-xl font-mono"
                required
              />
            </div>

            <div 
              className="flex items-start gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer hover:bg-white/[0.04] transition-all" 
              onClick={() => setAcceptedCopyright(!acceptedCopyright)}
            >
                <div className={`mt-1 w-4 h-4 border rounded flex items-center justify-center transition-all ${acceptedCopyright ? 'bg-neon-cyan border-neon-cyan' : 'border-white/20'}`}>
                    {acceptedCopyright && <Check size={10} className="text-black" />}
                </div>
                <div className="text-left">
                    <p className="text-[9px] text-ghost leading-tight font-mono uppercase tracking-wider">
                        I agree to the precise terms and conditions of <span className="text-neon-cyan font-bold underline">KONKRED copyright rules</span>. 
                    </p>
                    <p className="text-[8px] text-ghost/60 font-mono mt-1 leading-relaxed">
                        Only verified members with precise permission can generate and publish HTML briefings.
                    </p>
                </div>
            </div>
            
            <button 
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-neon-cyan hover:shadow-neon-cyan text-black font-black py-4 rounded-xl text-xs tracking-[0.2em] flex items-center justify-center gap-3 transition-all mt-6 uppercase disabled:opacity-50"
            >
              {status === 'loading' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Initialize Node <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 flex items-center gap-4 w-full opacity-30">
            <div className="h-px bg-white/10 flex-grow"></div>
            <span className="text-[9px] text-ghost font-mono uppercase tracking-[0.3em]">System v2.84</span>
            <div className="h-px bg-white/10 flex-grow"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinNetwork;
