
import React, { useState } from 'react';
import { X, User, Mail, Lock, Shield, ChevronRight, Fingerprint, Loader2 } from 'lucide-react';
import Button from '../common/Button.tsx';

interface SignupModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const SignupModal: React.FC<SignupModalProps> = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const handleNext = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep(prev => prev + 1);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-void/90 backdrop-blur-xl">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg concrete-card border border-white/10 p-12 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 duration-500 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-purple to-transparent opacity-50" />
        
        <button onClick={onClose} className="absolute top-8 right-8 text-ghost hover:text-white transition-colors">
          <X size={20} />
        </button>

        <header className="text-center mb-12">
           <div className={`w-20 h-20 mx-auto mb-6 rounded-3xl flex items-center justify-center transition-all duration-700 ${step === 3 ? 'bg-neon-green/20 text-neon-green shadow-[0_0_30px_rgba(183,178,169,0.3)]' : 'bg-neon-purple/10 text-neon-purple border border-neon-purple/20'}`}>
              {step === 1 && <User size={32} />}
              {step === 2 && <Shield size={32} />}
              {step === 3 && <Fingerprint size={32} className="animate-pulse" />}
           </div>
           <h2 className="text-3xl font-display font-bold text-white uppercase tracking-tight">
             {step === 1 ? 'Identity Uplink' : step === 2 ? 'Security Protocol' : 'Node Finalization'}
           </h2>
           <p className="text-ghost text-[10px] mt-2 uppercase tracking-[0.4em] font-mono">Sequence_Step // 0{step}</p>
        </header>

        <div className="min-h-[280px]">
          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right-4">
              <div className="space-y-2">
                <label className="text-[9px] font-mono text-ghost uppercase tracking-widest ml-1">Architect_Name</label>
                <input placeholder="Ari Eshghi" className="w-full bg-void-200 border border-white/5 rounded-xl px-5 py-4 text-white focus:border-neon-purple outline-none font-mono" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-mono text-ghost uppercase tracking-widest ml-1">Email_Registry</label>
                <input type="email" placeholder="ari@konkred.xyz" className="w-full bg-void-200 border border-white/5 rounded-xl px-5 py-4 text-white focus:border-neon-purple outline-none font-mono" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4">
               <div className="space-y-2">
                <label className="text-[9px] font-mono text-ghost uppercase tracking-widest ml-1">Secure_Access_Key</label>
                <input type="password" placeholder="••••••••••••" className="w-full bg-void-200 border border-white/5 rounded-xl px-5 py-4 text-white focus:border-neon-purple outline-none font-mono" />
              </div>
              <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                 <p className="text-xs text-ghost leading-relaxed font-light italic">Keys must exceed 12 characters and undergo secondary entropy validation by the KONKRED platform.</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in zoom-in-95 text-center">
              <p className="text-ghost-light text-sm leading-relaxed max-w-xs mx-auto">Allocating virtual node US-EAST-1/NODE_42. Synchronizing intellectual property enclaves.</p>
              <div className="flex justify-center gap-2">
                {[1,2,3,4,5].map(i => <div key={i} className="w-8 h-1 bg-neon-green rounded-full animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={step === 3 ? onSuccess : handleNext} 
          disabled={isLoading}
          className={`w-full py-6 mt-10 rounded-2xl font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 text-xs transition-all ${step === 3 ? 'bg-neon-green text-black hover:shadow-[0_0_30px_rgba(183,178,169,0.4)]' : 'bg-white text-black hover:bg-neon-purple shadow-xl'}`}
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : step === 3 ? 'ACTIVATE NODE' : 'ADVANCE_SEQUENCE'}
          {!isLoading && <ChevronRight size={16} />}
        </button>
      </div>
    </div>
  );
};

export default SignupModal;
