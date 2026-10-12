
import React from 'react';
import { BookOpen, Code, Terminal, FileText, Search, ArrowUpRight, Zap, Shield, Cpu, ExternalLink, ArrowLeft } from 'lucide-react';
import Badge from '../components/common/Badge.tsx';
import { PageView } from '../types.ts';

const docCategories = [
    { id: 'start', name: 'Getting Started', items: ['Platform Overview', 'Account Setup', 'Server-Side AI', 'Product Catalogue'] },
    { id: 'api', name: 'API Reference', items: ['Authentication', 'AI Generate Proxy', 'fullKONK_> API', 'Demo Run API'] },
    { id: 'product', name: 'Product Specs', items: ['Manifest Schema', 'Input/Output Schemas', 'Validation Status', 'Fixture Policy'] },
];

const docs = [
  { id: 1, title: 'KONKRED AI Proxy API v2', category: 'API', date: 'AUG 2026', status: 'CURRENT', desc: 'Server-side multi-provider AI proxy: authentication, request/response contracts, and error semantics. Credentials never leave the server.' },
  { id: 2, title: 'AUDITOR Neural Audit Guide', category: 'AUDIT', date: 'AUG 2026', status: 'CURRENT', desc: 'How the neural audit engine scores logical integrity, safety/compliance and execution efficiency, and how to interpret results as decision support.' },
  { id: 3, title: 'fullKONK_> Product Builder API', category: 'SDK', date: 'AUG 2026', status: 'CURRENT', desc: 'Streaming generate endpoint, provider failover, session persistence and GitHub export for the fullKONK_> pipeline.' },
  { id: 4, title: 'Product Manifest & Schemas', category: 'SPEC', date: 'AUG 2026', status: 'CURRENT', desc: 'The canonical 15-product manifest: prompt versions, input/output JSON schemas, statuses, fixtures and limitation statements.' },
];

const DocumentationPage: React.FC<{ onNavigate: (page: PageView) => void }> = ({ onNavigate }) => {
  return (
    <div className="p-8 min-h-screen bg-void pt-28 font-sans">
      <div className="max-w-7xl mx-auto space-y-16 animate-in fade-in duration-1000">
        <button 
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 text-ghost hover:text-white transition-colors mb-8 text-[10px] uppercase tracking-widest font-mono group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> 
          RETURN_TO_BASE
        </button>

        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 pb-12 border-b border-white/5">
          <div>
            <h1 className="text-6xl font-display font-bold text-white mb-6">Documentation <span className="text-neon-cyan">Hub</span></h1>
            <p className="text-ghost-light text-xl font-light leading-relaxed max-w-2xl">Integrate, audit, and deploy. Full technical specifications for the KONKRED ecosystem, API architecture, and logic verification protocols.</p>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ghost" size={18} />
            <input 
              placeholder="Query technical archives..." 
              className="w-full bg-void-200 border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-sm text-white focus:outline-none focus:border-neon-cyan transition-all" 
            />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
          {/* Left Sidebar: Navigation */}
          <aside className="space-y-10 lg:sticky lg:top-32 h-fit">
            {docCategories.map(cat => (
                <div key={cat.id} className="bg-black/20 border border-white/5 rounded-3xl p-8">
                    <h3 className="text-[10px] font-mono font-bold text-white uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                        <Cpu size={14} className="text-neon-cyan" /> {cat.name}
                    </h3>
                    <div className="space-y-4">
                        {cat.items.map(item => (
                            <button key={item} className="w-full text-left text-sm text-ghost-light hover:text-neon-cyan transition-all flex items-center gap-3 group">
                                <span className="w-1 h-1 bg-white/10 group-hover:bg-neon-cyan rounded-full transition-all" />
                                {item}
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            <div className="bg-neon-cyan/5 border border-neon-cyan/20 rounded-3xl p-8 group">
              <h3 className="text-sm font-bold text-white mb-2">Architect Support</h3>
              <p className="text-xs text-ghost-light leading-relaxed mb-8 font-light">Need direct technical assistance? Open a priority uplink with our engineering node.</p>
              <button className="w-full bg-neon-cyan text-black font-black py-4 rounded-xl text-[10px] tracking-widest uppercase hover:shadow-[0_0_20px_rgba(214,0,25,0.4)] transition-all">ESTABLISH UPLINK</button>
            </div>
          </aside>

          {/* Main Docs List */}
          <div className="lg:col-span-3 space-y-10">
            {docs.map((doc) => (
              <article key={doc.id} className="concrete-card rounded-3xl p-10 hover:border-white/20 transition-all group cursor-pointer bg-black/40">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex gap-6 items-center">
                    <Badge variant="cyan">{doc.category}</Badge>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-ghost uppercase tracking-widest">
                        <span className="text-white font-bold">{doc.status}</span>
                        <span>•</span>
                        <span>Last Updated: {doc.date}</span>
                    </div>
                  </div>
                  <FileText size={20} className="text-ghost group-hover:text-neon-cyan transition-colors" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4 group-hover:text-neon-cyan transition-colors duration-300">{doc.title}</h2>
                <p className="text-ghost-light leading-relaxed mb-8 font-light text-lg">{doc.desc}</p>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs font-mono text-neon-cyan font-black uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-all duration-300">
                        ACCESS SPECIFICATION <ArrowUpRight size={16} />
                    </div>
                    <div className="flex gap-6">
                        <button className="text-ghost hover:text-white transition-colors flex items-center gap-2 text-[10px] font-mono uppercase">
                            <Zap size={14} /> Playload SDK
                        </button>
                        <button className="text-ghost hover:text-white transition-colors flex items-center gap-2 text-[10px] font-mono uppercase">
                            <Shield size={14} /> Audit Log
                        </button>
                    </div>
                </div>
              </article>
            ))}

            <div className="mt-20 p-12 concrete-card rounded-[3rem] border border-white/10 bg-gradient-to-br from-void to-black flex flex-col md:flex-row items-center justify-between gap-12">
                <div className="space-y-4">
                    <h2 className="text-3xl font-display font-bold text-white">Advanced Documentation</h2>
                    <p className="text-ghost-light text-lg font-light leading-relaxed">Access the full GitBook repository for in-depth protocol analysis and kernel integration guides.</p>
                </div>
                <button className="btn-secondary py-5 px-10 text-xs font-black tracking-widest uppercase flex items-center gap-3 whitespace-nowrap">
                    Launch GitBook <ExternalLink size={16} />
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentationPage;
