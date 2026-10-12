
import React from 'react';
import { Layers, Lightbulb, Book, Download, ExternalLink, Search, ArrowUpRight, FileJson, FileCode, ShieldCheck, ArrowLeft } from 'lucide-react';
import Badge from '../components/common/Badge.tsx';
import { PageView } from '../types.ts';

const resourceCategories = [
  { id: 'templates', name: 'Logic Templates', icon: Layers, desc: 'Documented structures for prompts, agents, and complex state-machine workflows.', color: 'blue' },
  { id: 'guides', name: 'Architect Guides', icon: Book, desc: 'Detailed methodologies for AI asset creation, valuation, and security auditing.', color: 'purple' },
  { id: 'tools', name: 'Utility Modules', icon: Lightbulb, desc: 'Recommended software, kernels, and SDKs for high-fidelity AI development.', color: 'cyan' },
];

const ResourcesPage: React.FC<{ onNavigate: (page: PageView) => void }> = ({ onNavigate }) => {
  return (
    <div className="p-8 min-h-screen bg-void pt-28 font-sans">
      <div className="max-w-7xl mx-auto space-y-20 animate-in fade-in duration-1000">
        <button 
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 text-ghost hover:text-white transition-colors mb-8 text-[10px] uppercase tracking-widest font-mono group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> 
          RETURN_TO_BASE
        </button>

        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 pb-12 border-b border-white/5">
          <div className="max-w-3xl">
            <h1 className="text-6xl font-display font-bold text-white mb-6">Resource <span className="text-neon-blue">Archives</span></h1>
            <p className="text-ghost-light text-xl font-light leading-relaxed">Access a curated repository of structural capital assets. Deployed templates, methodological guides, and operational kernels for high-stakes AI.</p>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ghost" size={18} />
            <input 
              placeholder="Search resource archives..." 
              className="w-full bg-void-200 border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-sm text-white focus:outline-none focus:border-neon-blue transition-all" 
            />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
           {resourceCategories.map((cat) => {
             const Icon = cat.icon;
             return (
               <div key={cat.id} className="concrete-card rounded-3xl p-10 text-center hover:border-white/20 transition-all duration-500 bg-black/20 group">
                  <div className={`w-16 h-16 bg-neon-${cat.color}/10 rounded-2xl flex items-center justify-center text-neon-${cat.color} mx-auto mb-8 border border-neon-${cat.color}/20 group-hover:scale-110 transition-transform duration-500`}>
                    <Icon size={32} />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">{cat.name}</h3>
                  <p className="text-sm text-ghost-light leading-relaxed font-light">{cat.desc}</p>
               </div>
             );
           })}
        </div>

        <section className="space-y-12">
          <div className="flex justify-between items-end border-b border-white/5 pb-8">
            <div>
                <h2 className="text-3xl font-display font-bold text-white mb-2">Technical Payloads</h2>
                <p className="text-ghost-light text-sm uppercase tracking-widest">Documented resources — review before use</p>
            </div>
            <button className="text-[10px] font-mono text-neon-cyan uppercase tracking-[0.2em] font-black flex items-center gap-3 hover:gap-5 transition-all mb-2">
              BROWSE ALL ARCHIVES <ArrowUpRight size={16} />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              { id: 1, title: 'AI Agent Architecture Schema', type: 'JSON Protocol', size: '1.2 MB', icon: FileJson, color: 'blue' },
              { id: 2, title: 'Prompt Engineering Executive Guide', type: 'PDF Handbook', size: '4.8 MB', icon: Book, color: 'purple' },
              { id: 3, title: 'DCF Valuation Template for SaaS', type: 'XLSX Logic', size: '250 KB', icon: Layers, color: 'cyan' },
              { id: 4, title: 'System Prompt Security Baseline', type: 'MD Specification', icon: ShieldCheck, size: '42 KB', color: 'green' },
            ].map((item) => (
              <div key={item.id} className="concrete-card rounded-3xl p-8 flex items-center justify-between hover:border-white/20 transition-all duration-300 bg-black/40 group">
                <div className="flex items-center gap-6">
                  <div className={`w-14 h-14 bg-neon-${item.color}/10 rounded-2xl flex items-center justify-center text-neon-${item.color} border border-neon-${item.color}/10 group-hover:scale-110 transition-transform`}>
                    <item.icon size={28} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1 group-hover:text-neon-cyan transition-colors">{item.title}</h3>
                    <div className="flex gap-4 text-[10px] text-ghost font-mono uppercase tracking-widest">
                        <span>{item.type}</span>
                        <span>•</span>
                        <span>{item.size}</span>
                    </div>
                  </div>
                </div>
                <button className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-ghost hover:text-white hover:bg-white/10 transition-all">
                  <Download size={18} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-void-300/30 concrete-card rounded-[3rem] p-16 text-center border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_center,rgba(201,196,187,0.05)_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            <h2 className="text-4xl font-display font-bold text-white mb-6 relative z-10">Logic Contribution</h2>
            <p className="text-ghost-light text-xl max-w-3xl mx-auto mb-10 font-light leading-relaxed relative z-10">
                Architects are encouraged to submit high-fidelity templates and guides. Contributions are reviewed before publication.
            </p>
            <button className="btn-primary py-5 px-12 text-sm font-black tracking-[0.3em] uppercase flex items-center gap-4 mx-auto relative z-10">
                Submit Payload <ArrowUpRight size={18} />
            </button>
        </section>

      </div>
    </div>
  );
};

export default ResourcesPage;
