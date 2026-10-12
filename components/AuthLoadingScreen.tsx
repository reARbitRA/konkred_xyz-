import React, { useEffect, useState } from 'react';
import { Lock, Cpu, Globe, Zap } from 'lucide-react';

interface AuthLoadingScreenProps {
  message?: string | null;
}

const AuthLoadingScreen: React.FC<AuthLoadingScreenProps> = ({ message }) => {
  const [dynamicMessage, setDynamicMessage] = useState<string>(message || "INITIALIZING SECURE CHANNEL...");
  const [hex, setHex] = useState("0x000000");

  useEffect(() => {
    // Cycle through a few messages if a fixed message isn't provided
    const defaultMessages = [
      "INITIALIZING SECURE CHANNEL...",
      "AUTHENTICATING NODE ACCESS...",
      "DECRYPTING CREDENTIALS...",
      "VERIFYING IDENTITY PROTOCOL...",
      "ESTABLISHING BIOMETRIC LOCK...",
      "SYNCING ENCLAVE KEY..."
    ];
    let messageIndex = 0;

    const messageInterval = setInterval(() => {
      if (!message) { // Only cycle if no specific message is passed
        setDynamicMessage(defaultMessages[messageIndex]);
        messageIndex = (messageIndex + 1) % defaultMessages.length;
      }
      const arr = new Uint8Array(3);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
      setHex(`0x${Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`);
    }, 800); // Faster cycle for auth loading

    return () => clearInterval(messageInterval);
  }, [message]);

  return (
    <div className="min-h-screen w-full bg-void flex flex-col items-center justify-center overflow-hidden animate-in fade-in duration-500">
      {/* HUD Layers (minimal for auth loading) */}
      <div className="absolute inset-0 scanline opacity-10"></div>
      
      {/* Central Content */}
      <div className="relative z-20 flex flex-col items-center text-center">
        {/* Branding - Text Logo Animation */}
        <div className="mb-8 space-y-2">
          <h1 className="text-4xl font-display font-black tracking-[0.4em] text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400 animate-pulse drop-shadow-[0_0_20px_rgba(255,255,255,0.2)] ml-[0.4em]">KONKRED</h1>
          <div className="h-px w-12 bg-neon-cyan mx-auto opacity-50"></div>
        </div>

        {/* Status Message */}
        <div className="w-64 space-y-4">
          <div className="flex justify-center items-center font-mono text-[10px] uppercase tracking-[0.2em] text-ghost">
            <Zap size={14} className="text-neon-cyan animate-pulse mr-2" />
            <span className="text-white animate-pulse">{dynamicMessage}</span>
          </div>
          
          <div className="relative h-1 w-full bg-void-300 rounded-full overflow-hidden concrete-card">
            <div 
              className="h-full bg-neon-cyan transition-all duration-300 ease-out shadow-[0_0_15px_rgba(214,0,25,0.8)] relative overflow-hidden w-full animate-pulse" // Full width pulse
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent bg-[length:200%_100%] animate-shimmer" />
            </div>
          </div>

          <p className="text-[8px] font-mono text-zinc-600 tracking-widest uppercase mt-4">
            SECURE_BOOT_SEQUENCE // <span className="text-neon-green">ACTIVE</span>
          </p>
        </div>
      </div>

      {/* Footer Meta */}
      <div className="absolute bottom-10 w-full px-12 flex justify-between items-center opacity-30 animate-fade-in delay-500 fill-mode-forwards">
        <div className="flex items-center gap-3 font-mono text-[8px] tracking-[0.3em] text-ghost">
          <Cpu size={12} />
          <span>VIRTUAL_MACHINE_ENCLAVE_v4.2</span>
        </div>
        <div className="h-px bg-white/10 flex-grow mx-8"></div>
        <div className="flex items-center gap-3 font-mono text-[8px] tracking-[0.3em] text-ghost">
          <span>SESSION_HASH: {hex.substring(0, 7)}...</span>
          <Lock size={12} />
        </div>
      </div>
    </div>
  );
};

export default AuthLoadingScreen;