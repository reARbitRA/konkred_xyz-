import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { PageView } from '../types.ts';
import { 
  Shield, 
  Terminal, 
  Zap, 
  Cpu, 
  Database, 
  Search, 
  ArrowLeft, 
  CheckCircle2, 
  ExternalLink,
  Code2,
  Layers,
  Sparkles,
  ChevronRight,
  Plus
} from 'lucide-react';

interface RedaeyeSandboxProps {
  onNavigate: (page: PageView) => void;
}

export const RedaeyeSandbox: React.FC<RedaeyeSandboxProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'sandbox' | 'access'>('catalog');
  const [bumpEnabled, setBumpEnabled] = useState(false);

  const stats = [
    { label: 'Techniques', value: '367', detail: '18 core · 346 deep', trend: '+12' },
    { label: 'Efficacy', value: '1.08k', detail: 'frontier records', trend: '99.4%' },
    { label: 'Detection', value: '3.82k', detail: 'lexical · structural', trend: 'ACTIVE' },
    { label: 'Master', value: '30', detail: 'base · edge case', trend: 'DOSSIER' }
  ];

  const families = [
    { name: 'Reasoning & Logic', count: 53, color: 'bg-[#d60019]', width: '100%' },
    { name: 'Context & Retrieval', count: 45, color: 'bg-white', width: '85%' },
    { name: 'Multi-Modal', count: 38, color: 'bg-white', width: '72%' },
    { name: 'Architecture & Internals', count: 22, color: 'bg-white', width: '42%' },
    { name: 'Agents & Tool Use', count: 24, color: 'bg-white', width: '45%' },
    { name: 'Prompt & Persona', count: 18, color: 'bg-white', width: '34%' },
    { name: 'Safety & Alignment', count: 16, color: 'bg-white', width: '30%' },
    { name: 'Encoding & Obfuscation', count: 13, color: 'bg-white', width: '25%' }
  ];

  const masterDossiers = [
    {
      id: 'RAE0184AT',
      category: 'AGENTS & TOOL USE',
      title: 'Agentic Environment Shadowing',
      description: 'Privilege escalation in Plan-Act-Observe agent loops via poisoned <|system_update|> tokens injected into tool outputs.'
    },
    {
      id: 'RAE0179RT',
      category: 'REASONING & THOUGHT',
      title: 'Neuro-Semantic Resonance',
      description: 'Activation-steering class attack implanting persistent behavioral vectors into inference context without weight modification.'
    },
    {
      id: 'RAE0185RC',
      category: 'RETRIEVAL & CONTEXT',
      title: 'KV-Cache Eviction Purge',
      description: 'Exploits KV-cache eviction behavior to erase system-prompt alignment from context without triggering refusal classifiers.'
    }
  ];

  const [tvOn, setTvOn] = useState(false);
  const noiseRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = noiseRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      if (cv.style.opacity !== '0') {
        const w = cv.width = Math.max(1, Math.floor(cv.clientWidth / 2)), h = cv.height = Math.max(1, Math.floor(cv.clientHeight / 2));
        const img = ctx.createImageData(w, h), d = img.data;
        for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 | 0; d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255; }
        ctx.putImageData(img, 0, 0);
      }
      requestAnimationFrame(draw);
    };
    draw();
    const t = setTimeout(() => { alive = true; if (cv) cv.style.opacity = '0'; setTvOn(true); }, 450);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0908] px-2 sm:px-6 py-5">
    <div className="k-tv p-2 sm:p-5">
    <canvas ref={noiseRef} className="k-noise" style={{ opacity: tvOn ? 0 : 1 }} aria-hidden="true" />
    <div className="k-osd px-2 py-1.5 border-b-2" style={{ borderColor: 'rgba(255,255,255,.08)' }}>CH 36 · REDAEYE TELEVISION · 367 TECHNIQUES ON AIR</div>
    <div className="k-screen !rounded-none !border-0 mt-1">
    <div className="relative z-10 min-h-screen bg-[#0a0908] text-[#eae7e1] font-sans selection:bg-[#d60019] selection:text-white">
      {/* Grid Background Overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-20" 
           style={{ backgroundImage: 'linear-gradient(rgba(255,0,60,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,0,60,.1) 1px,transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Navigation */}
      <header className="border-b border-[#2a2624] bg-[#0a0908]/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[#d60019] text-2xl">◆</span>
            <div className="leading-tight">
              <div className="font-mono font-bold text-base tracking-[.25em] text-white uppercase">
                RED<span className="text-[#d60019]">AEYE</span>
              </div>
              <div className="font-mono text-[9px] text-[#8a857d] tracking-[.2em] uppercase">on KONKRED · SANDBOX ACTIVE</div>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 font-mono text-[11px] tracking-[.2em] uppercase text-[#8a857d]">
            <button 
              onClick={() => setActiveTab('catalog')}
              className={`hover:text-white transition-colors ${activeTab === 'catalog' ? 'text-white' : ''}`}
            >
              Catalog
            </button>
            <button 
              onClick={() => setActiveTab('sandbox')}
              className={`hover:text-white transition-colors ${activeTab === 'sandbox' ? 'text-[#d60019]' : ''}`}
            >
              Sandbox
            </button>
            <button 
              onClick={() => setActiveTab('access')}
              className={`hover:text-white transition-colors ${activeTab === 'access' ? 'text-[#d60019]' : ''}`}
            >
              Access
            </button>
            <button onClick={() => onNavigate('landing')} className="hover:text-white transition-colors">Return_to_Base</button>
          </nav>

          <div className="flex items-center gap-3">
            <button className="hidden sm:flex items-center gap-2 px-4 py-2 bg-transparent border border-[#3d383502e] text-[#b7b2a9] font-mono text-[10px] font-bold uppercase tracking-widest hover:border-[#8a857d] transition-all">
              Docs
            </button>
            <button 
              onClick={() => setActiveTab('access')}
              className="px-5 py-2.5 bg-[var(--surface-sunken)] text-[var(--interactive-rest)] border border-[#2a2624] font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-[#d60019] hover:text-[var(--konk-black)] hover:border-[#d60019] transition-all"
            >
              Request access
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {activeTab === 'catalog' ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-7xl mx-auto px-6 py-16"
          >
            {/* Hero */}
            <div className="mb-20">
              <div className="flex items-center gap-3 mb-8">
                <span className="w-2 h-2 rounded-full bg-[#d60019] shadow-[0_0_10px_#d60019] animate-pulse" />
                <span className="font-mono text-[10px] tracking-[.3em] uppercase text-[#d60019]">
                  v1.0 · SYSTEM_LIVE · 367 TECHNIQUES DOCUMENTED
                </span>
              </div>
              <h1 className="font-mono font-black text-5xl md:text-7xl lg:text-8xl text-white leading-[0.95] tracking-tight max-w-5xl uppercase">
                367 WAYS TO<br/>
                <span className="text-[#d60019]">BREAK A FRONTIER MODEL.</span>
              </h1>
              <p className="mt-8 text-[#8a857d] text-lg md:text-xl max-w-2xl leading-relaxed">
                The most complete public knowledge base of adversarial techniques against LLMs, multimodal models, and AI agents. 
                <span className="text-white block mt-2">Mechanism. Mitigation. Detection. Efficacy.</span>
              </p>
              
              <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-0 border border-[#2a2624] bg-[#171514]/40">
                {stats.map((s, idx) => (
                  <div key={idx} className={`p-6 group hover:bg-[#d60019]/5 transition-all relative overflow-hidden ${idx !== stats.length - 1 ? 'border-r border-[#2a2624]' : ''} ${idx >= 2 ? 'md:border-t-0' : ''}`}>
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                      <div className="font-mono text-[8px] text-[#d60019] tracking-tighter">{s.trend}</div>
                    </div>
                    <div className="font-mono text-[9px] tracking-[.25em] uppercase text-[#5c5852] mb-3 group-hover:text-[#d60019] transition-colors">{s.label}</div>
                    <div className="font-mono font-bold text-4xl text-white tracking-tight group-hover:translate-x-1 transition-transform">{s.value}</div>
                    <div className="mt-2 text-[#5c5852] text-[9px] font-mono uppercase group-hover:text-[#7a756d]">{s.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Masters */}
            <section className="mb-24">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-[#d60019] shadow-[0_0_10px_#d60019]" />
                  <span className="font-mono text-[10px] tracking-[.3em] uppercase text-[#d60019]">◆ 3 MASTER-TIER DOSSIERS ◆</span>
                </div>
                <div className="font-mono text-[9px] text-[#5c5852] uppercase tracking-widest hidden sm:block">ENCRYPTED_TRANSMISSION_ID: 8472-X</div>
              </div>
              <div className="grid md:grid-cols-3 gap-0 border border-[#2a2624]">
                {masterDossiers.map((d, idx) => (
                  <div key={idx} className={`bg-[#171514] p-8 hover:bg-[#d60019]/5 transition-all group relative ${idx !== masterDossiers.length - 1 ? 'md:border-r border-[#2a2624]' : ''} ${idx !== 0 ? 'border-t md:border-t-0 border-[#2a2624]' : ''}`}>
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-transparent group-hover:bg-[#d60019] transition-colors" />
                    <div className="font-mono text-[10px] tracking-[.2em] text-[#d60019] mb-4 flex items-center justify-between">
                      <span>{d.id}</span>
                      <Shield size={12} className="opacity-20 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="font-mono text-[9px] text-[#5c5852] uppercase tracking-widest mb-2">{d.category}</div>
                    <h3 className="text-white font-mono font-bold text-xl mb-4 leading-tight group-hover:text-[#d60019] transition-colors">{d.title}</h3>
                    <p className="text-[#8a857d] text-sm leading-relaxed mb-8">{d.description}</p>
                    <button className="flex items-center gap-2 text-[10px] font-mono text-[#d60019] uppercase tracking-widest font-bold border border-[#d60019]/20 px-4 py-2 hover:bg-[#d60019] hover:text-black transition-all">
                      Open Dossier <ChevronRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Families */}
            <section>
              <div className="flex items-center gap-3 mb-8 before:content-[''] before:w-2 before:h-2 before:bg-[#d60019] before:shadow-[0_0_10px_#d60019]">
                <span className="font-mono text-[10px] tracking-[.3em] uppercase text-[#8a857d]">01 · ATTACK FAMILIES</span>
              </div>
              <h2 className="font-mono font-black text-3xl md:text-4xl text-white mb-12 uppercase">Sixteen attack families. One catalog. Zero fluff.</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-0 border border-[#2a2624]">
                {families.map((f, idx) => (
                  <div key={idx} className={`p-6 bg-[#171514] hover:bg-[#d60019]/5 transition-all group relative border-[#2a2624] ${idx % 4 !== 3 ? 'lg:border-r' : ''} ${idx % 2 !== 1 ? 'sm:border-r' : ''} ${idx >= 4 ? 'lg:border-t' : ''} ${idx >= 2 ? 'sm:border-t lg:border-t-0' : ''} border-t sm:border-t-0`}>
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between mb-4">
                        <span className="font-mono text-[9px] text-[#5c5852] group-hover:text-[#d60019] transition-colors tracking-widest font-bold">FAM_{idx.toString().padStart(2, '0')}</span>
                        <Zap size={12} className="text-[#3d3835] group-hover:text-[#d60019] transition-colors" />
                      </div>
                      <h4 className="font-mono font-black text-xs text-white uppercase mb-6 group-hover:text-[#d60019] transition-colors leading-relaxed min-h-[2.5em]">{f.name}</h4>
                      <div className="mt-auto">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-[9px] text-[#5c5852] uppercase">Depth</span>
                          <span className="font-mono text-[9px] text-white">{f.count}</span>
                        </div>
                        <div className="h-1 bg-[#2a2624] overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            whileInView={{ width: f.width }}
                            className={`h-full ${idx === 0 ? 'bg-[#d60019]' : 'bg-[#5c5852] group-hover:bg-[#d60019]/50'} transition-colors`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </motion.div>
        ) : activeTab === 'sandbox' ? (
          /* Sandbox Section */
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-7xl mx-auto px-6 py-16"
          >
            <div className="flex items-center gap-3 mb-6 before:content-[''] before:w-2 before:h-2 before:bg-[#d60019] before:shadow-[0_0_10px_#d60019]">
              <span className="font-mono text-[10px] tracking-[.3em] uppercase text-[#8a857d]">02 · SANDBOX_ENVIRONMENT</span>
            </div>
            
            <header className="mb-12">
              <h2 className="font-mono font-black text-4xl text-white mb-4 uppercase tracking-tight">Logic & Visual Sandbox</h2>
              <p className="text-[#8a857d] max-w-2xl">
                Isolated environment for displaying and testing generated components. Validate adversarial prompts, visual assets, and system protocols before full-scale deployment.
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Sidebar: Component List */}
              <div className="lg:col-span-3 space-y-4">
                <div className="p-4 border border-[#2a2624] bg-[#171514]">
                  <h3 className="font-mono text-[10px] text-[#8a857d] uppercase tracking-widest mb-4">Components</h3>
                  <div className="space-y-2">
                    {['Auth_Module', 'Neural_Dashboard', 'Adversarial_Terminal', 'Logic_Forge_V2'].map((item) => (
                      <button key={item} className="w-full flex items-center justify-between p-3 border border-transparent hover:border-[#2a2624] hover:bg-[#0a0908] text-xs font-mono text-[#5c5852] hover:text-white transition-all group">
                        <span>{item}</span>
                        <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                    <button className="w-full flex items-center gap-2 p-3 border border-dashed border-[#2a2624] text-xs font-mono text-[#5c5852] hover:text-[#d60019] hover:border-[#d60019] transition-all justify-center">
                      <Plus size={14} /> New Component
                    </button>
                  </div>
                </div>

                <div className="p-4 border border-[#2a2624] bg-[#171514]">
                  <h3 className="font-mono text-[10px] text-[#8a857d] uppercase tracking-widest mb-4">System_Stats</h3>
                  <div className="space-y-3 font-mono text-[9px] uppercase">
                    <div className="flex justify-between">
                      <span className="text-[#5c5852]">Memory:</span>
                      <span className="text-white">128MB / 1GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5c5852]">Latency:</span>
                      <span className="text-[#d60019]">12ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5c5852]">Status:</span>
                      <span className="text-[#d60019]">NOMINAL</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content: Display Area */}
              <div className="lg:col-span-9">
                <div className="relative border border-[#2a2624] bg-[#0a0908] min-h-[600px] flex flex-col">
                  {/* Window Bar */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2624] bg-[#171514]">
                    <div className="flex items-center gap-4">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#2a2624]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#2a2624]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#2a2624]" />
                      </div>
                      <span className="font-mono text-[9px] text-[#5c5852] tracking-widest uppercase">sandbox_display_v1.0.exe</span>
                    </div>
                    <div className="flex items-center gap-4 text-[#5c5852] font-mono text-[9px]">
                      <span>60 FPS</span>
                      <Layers size={12} />
                    </div>
                  </div>

                  {/* Component Placeholder Area */}
                  <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 border border-[#2a2624] bg-[#171514] flex items-center justify-center text-[#2a2624] mb-6">
                      <Sparkles size={40} />
                    </div>
                    <h3 className="font-mono text-xl text-white mb-2 uppercase">Awaiting Synthesis</h3>
                    <p className="text-[#5c5852] text-sm max-w-md font-mono">
                      This screen is a visual sandbox only. Use fullKONK_&gt; to generate a component, then review it in a controlled workspace before deployment.
                    </p>
                    
                    <div className="mt-10 grid grid-cols-2 gap-4 w-full max-w-lg">
                      <div className="p-4 border border-[#2a2624] bg-[#171514] text-left group hover:border-[#d60019] transition-colors cursor-pointer">
                        <div className="text-[#d60019] mb-2"><Terminal size={16} /></div>
                        <div className="font-mono text-[10px] text-white uppercase mb-1">Terminal_Core</div>
                        <div className="text-[#5c5852] text-[9px]">Interactive command node</div>
                      </div>
                      <div className="p-4 border border-[#2a2624] bg-[#171514] text-left group hover:border-[#d60019] transition-colors cursor-pointer">
                        <div className="text-[#d60019] mb-2"><Shield size={16} /></div>
                        <div className="font-mono text-[10px] text-white uppercase mb-1">Vault_Secure</div>
                        <div className="text-[#5c5852] text-[9px]">Encrypted data visualizer</div>
                      </div>
                    </div>
                  </div>

                  {/* Status Footer */}
                  <div className="px-4 py-2 border-t border-[#2a2624] bg-[#171514] flex items-center justify-between font-mono text-[9px] uppercase text-[#5c5852]">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#d60019]" /> CPU: 4%</span>
                      <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#e8a46c]" /> NET: 2.1kb/s</span>
                    </div>
                    <span>KONKRED_SYSTEM_KERNEL_ACTIVE</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          /* Access routing — no checkout is exposed from REDAEYE. */
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto px-6 py-20"
          >
            <div className="border border-[#2a2624] bg-[#171514] p-8 sm:p-12 relative overflow-hidden">
              <div className="absolute inset-0 blueprint opacity-30 pointer-events-none" />
              <div className="relative">
                <p className="font-mono text-[10px] uppercase tracking-[.3em] text-[#d60019]">03 · controlled access</p>
                <h2 className="font-black-display text-4xl sm:text-5xl text-white mt-4">PUT REDAEYE<br/>ON REVIEW.</h2>
                <p className="font-tw text-[15px] leading-relaxed text-[#8a857d] mt-6 max-w-xl">REDAEYE is evaluated through a scoped engagement. Explain the model boundary, test objective, data sensitivity and required approval path. No payment or access is granted from this page.</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button onClick={() => onNavigate('contact')} className="k-btn k-btn-acc">request a scope review</button>
                  <button onClick={() => onNavigate('enterprise')} className="k-btn">enterprise controls</button>
                </div>
                <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#5c5852] mt-6">[ok] human review required · [..] commercial terms scoped separately</p>
              </div>
            </div>
          </motion.section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#2a2624] py-12 mt-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-[#d60019] text-xl">◆</span>
            <div className="font-mono text-[10px] tracking-[.2em] uppercase text-[#8a857d]">
              REDAEYE ARSENAL · © 2026 · KONKRED.XYZ
            </div>
          </div>
          <div className="flex items-center gap-8 font-mono text-[10px] tracking-[.2em] uppercase text-[#5c5852]">
            <a href="#" className="hover:text-white transition-colors">Privacy_Protocol</a>
            <a href="#" className="hover:text-white transition-colors">Term_Logic</a>
            <a href="#" className="hover:text-white transition-colors">Telegram</a>
          </div>
        </div>
      </footer>
    </div>
    </div>
    </div>
    </div>
  );
};

export default RedaeyeSandbox;
