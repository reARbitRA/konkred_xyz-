import React, { useState } from 'react';
import { Lock, ChevronRight, Github, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';

interface EnterGateProps {
  onEnter: () => void;
  onBack?: () => void;
  onVerificationNeeded: (email: string) => void;
}

const EnterGate: React.FC<EnterGateProps> = ({ onEnter, onBack, onVerificationNeeded }) => {
  const { login, signInWithGoogle, signInWithGithub } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGoogleProcessing, setIsGoogleProcessing] = useState(false);
  const [isGithubProcessing, setIsGithubProcessing] = useState(false);
  const [identity, setIdentity] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsProcessing(true);
    
    try {
      await login(identity, key);
      setTimeout(() => {
        onEnter();
      }, 800);
    } catch (err: any) {
      if (err.code === 'auth/email-not-verified') {
        onVerificationNeeded(err.email);
        return;
      }
      setError(err.message || "Authentication failed");
      setIsProcessing(false);
    }
  };

  const handleGoogleAuthenticate = async () => {
    setError(null);
    setIsGoogleProcessing(true);
    try {
      await signInWithGoogle();
      // On success, AuthContext navigates via user state change.
    } catch (err: any) {
      setError(err.message || "Google sign-in failed.");
      setIsGoogleProcessing(false);
    }
  };

  const handleGithubAuthenticate = async () => {
    setError(null);
    setIsGithubProcessing(true);
    try {
      await signInWithGithub();
    } catch (err: any) {
      setError(err.message || "GitHub sign-in failed.");
    } finally {
      setIsGithubProcessing(false);
    }
  };

  const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );

  const isDomainError = error?.includes("authorized-domain") || error?.includes("whitelisted");

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-void-gradient">
       <div className={`absolute inset-0 z-0 opacity-[0.03] grid-bg pointer-events-none scale-150 animate-[pulse_8s_ease-in-out_infinite] transition-opacity duration-1000 ${isProcessing || isGoogleProcessing ? 'opacity-0' : ''}`} />
       <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/90 z-0 pointer-events-none" />
       
       {onBack && !(isProcessing || isGoogleProcessing) && (
         <button 
           onClick={onBack}
           className="absolute top-8 left-8 z-50 text-ghost hover:text-white flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] transition-all group"
         >
           <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
           ABORT_UPLINK
         </button>
       )}

       <div className="relative z-10 text-center flex flex-col items-center w-full max-w-md px-6">
         
         <div className={`flex flex-col items-center gap-2 animate-slide-up delay-100 opacity-0 fill-mode-forwards transition-opacity duration-500 ${isProcessing || isGoogleProcessing ? 'opacity-0' : ''}`}>
            <div className="w-px h-16 bg-gradient-to-b from-transparent via-zinc-800 to-zinc-500 mb-8"></div>
         </div>
         
         <div className="animate-slide-up delay-200 opacity-0 fill-mode-forwards relative mb-12">
           <h1 className={`text-5xl md:text-7xl font-black tracking-tighter select-none relative z-10 transition-all duration-1000 ease-in-out ${
             isProcessing || isGoogleProcessing
               ? 'text-orange-500 drop-shadow-[0_0_50px_rgba(214,0,25,0.8)] scale-110 blur-[1px]' 
               : 'text-white mix-blend-difference'
           }`}>
             KONKRED
           </h1>
           <div className={`absolute inset-0 blur-3xl z-0 rounded-full transform scale-x-150 transition-colors duration-1000 ${
             isProcessing || isGoogleProcessing ? 'bg-orange-600/20' : 'bg-white/5'
           }`}></div>
         </div>
         
         <div className="w-full">
           {error && (
             <div className={`p-4 rounded-xl text-[10px] font-mono tracking-widest uppercase mb-8 animate-in fade-in flex gap-3 ${isDomainError ? 'bg-neon-red/20 border border-neon-red/50 text-white' : 'bg-neon-red/10 border border-neon-red/20 text-neon-red'}`}>
               <AlertTriangle size={16} className="shrink-0" />
               <div className="text-left">
                  <p className="font-black">[SYSTEM_FAILURE]: {error}</p>
                  {isDomainError && (
                    <p className="mt-2 normal-case font-sans opacity-70">
                      FIX: Add <strong>{window.location.hostname}</strong> to the "Authorized Domains" list in your Firebase Console.
                    </p>
                  )}
               </div>
             </div>
           )}

           <form 
            onSubmit={handleAuthenticate}
            className={`w-full space-y-6 animate-slide-up delay-300 opacity-0 fill-mode-forwards transition-all duration-700 ${isProcessing || isGoogleProcessing ? '!opacity-0 translate-y-10' : ''}`}
           >
             <div className="space-y-4">
               <div className="relative group">
                 <input 
                   type="email" 
                   value={identity}
                   onChange={(e) => setIdentity(e.target.value)}
                   placeholder="IDENTITY"
                   className="w-full bg-transparent border-b border-zinc-800 focus:border-zinc-500 py-2 text-center text-sm font-mono text-white placeholder-zinc-700 outline-none transition-colors uppercase tracking-widest concrete-card"
                   required
                 />
                 <div className="absolute inset-x-0 bottom-0 h-px bg-zinc-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center"></div>
               </div>
               
               <div className="relative group">
                 <input 
                   type="password" 
                   value={key}
                   onChange={(e) => setKey(e.target.value)}
                   placeholder="ACCESS KEY"
                   className="w-full bg-transparent border-b border-zinc-800 focus:border-zinc-500 py-2 text-center text-sm font-mono text-white placeholder-zinc-700 outline-none transition-colors uppercase tracking-widest concrete-card"
                   required
                 />
                 <div className="absolute inset-x-0 bottom-0 h-px bg-zinc-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center"></div>
               </div>
             </div>

             <button 
               type="submit"
               disabled={isProcessing || isGoogleProcessing}
               className="group relative w-full inline-flex items-center justify-center px-10 py-4 overflow-hidden font-mono text-xs font-bold tracking-[0.25em] text-white uppercase transition-all duration-500 bg-transparent border border-zinc-800 hover:border-zinc-500 cursor-pointer mt-8 concrete-card disabled:opacity-50"
             >
               <span className="relative z-10 group-hover:text-white transition-colors duration-200 flex items-center gap-2">
                 {isProcessing ? <Loader2 size={12} className="animate-spin" /> : '[ AUTHENTICATE ]'}
                 {!isProcessing && <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-all -ml-2 group-hover:ml-0" />}
               </span>
             </button>

              <div className="relative flex py-5 items-center">
                  <div className="flex-grow border-t border-zinc-800"></div>
                  <span className="flex-shrink mx-4 text-zinc-600 text-[10px] font-mono uppercase">Or</span>
                  <div className="flex-grow border-t border-zinc-800"></div>
              </div>
              
              <button 
                  type="button"
                  onClick={handleGoogleAuthenticate}
                  disabled={isProcessing || isGoogleProcessing || isGithubProcessing}
                  className="group relative w-full inline-flex items-center justify-center px-10 py-4 overflow-hidden font-mono text-xs font-bold tracking-[0.25em] text-white uppercase transition-all duration-500 bg-transparent border border-zinc-800 hover:border-zinc-500 cursor-pointer concrete-card disabled:opacity-50"
              >
                  <span className="relative z-10 group-hover:text-white transition-colors duration-200 flex items-center gap-3">
                      {isGoogleProcessing ? <Loader2 size={12} className="animate-spin" /> : <GoogleIcon />}
                      Continue with Google
                  </span>
              </button>

              <button 
                  type="button"
                  onClick={handleGithubAuthenticate}
                  disabled={isProcessing || isGoogleProcessing || isGithubProcessing}
                  className="group relative w-full inline-flex items-center justify-center px-10 py-4 overflow-hidden font-mono text-xs font-bold tracking-[0.25em] text-white uppercase transition-all duration-500 bg-transparent border border-zinc-800 hover:border-neon-cyan cursor-pointer concrete-card mt-3 disabled:opacity-50"
              >
                  <span className="relative z-10 group-hover:text-neon-cyan transition-colors duration-200 flex items-center gap-3">
                      {isGithubProcessing ? <Loader2 size={12} className="animate-spin" /> : <Github size={16} />}
                      Continue with GitHub
                  </span>
              </button>
             
             <div className="text-center pt-4">
                <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest cursor-pointer hover:text-zinc-400">Recover Credentials</span>
             </div>
           </form>
         </div>
       </div>

       <div className={`absolute bottom-12 w-full px-12 flex justify-between items-end animate-in delay-500 opacity-0 fill-mode-forwards text-[10px] text-zinc-800 font-mono tracking-widest uppercase transition-opacity duration-500 ${isProcessing || isGoogleProcessing ? 'opacity-0' : ''}`}>
          <div className="flex items-center gap-2">
            <Lock size={10} />
            <span>Encrypted Session</span>
          </div>
          <div>Secure Environment v2.04</div>
       </div>
    </div>
  );
};

export default EnterGate;