import React from 'react';
import { PageView } from '../types.ts';
import { ArrowLeft } from 'lucide-react';

interface AuditPageProps {
  onNavigate: (page: PageView, slug?: string) => void;
}

/**
 * Audit-only page. This is the real, single-purpose destination of the
 * AUDITOR product. It intentionally exposes NO other Forge tabs (Prompt
 * Refiner, Agent Architect, Market Intel, Kernel Shell, Doc Generator were
 * removed as mock features).
 */
const AuditPage: React.FC<AuditPageProps> = ({ onNavigate }) => {
  const AuditTool = React.lazy(() => import('../components/audit/AuditTool.tsx'));

  return (
    <div className="min-h-screen bg-[#0a0908] text-white selection:bg-cyan-500 selection:text-black font-sans pb-24 pt-6">
      {/* Top Banner Navigation */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-2 pb-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={() => onNavigate('landing')}
          className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest text-cyan-400 hover:text-white transition-colors group cursor-pointer"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span>RETURN_TO_BASE (LANDING)</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[11px] font-mono font-bold uppercase tracking-widest flex items-center gap-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            NEURAL AUDIT // AUDIT-ONLY
          </span>
          <button
            onClick={() => onNavigate('catalogue')}
            className="px-4 py-2 bg-cyan-500 text-black border border-cyan-400 font-mono text-xs font-black uppercase tracking-wider rounded-xl hover:opacity-90 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>PRODUCT CATALOGUE</span>
          </button>
        </div>
      </div>

      {/* Header Section */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-10 pb-6">
        <div className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400 uppercase tracking-widest mb-3">
          <span>ENTERPRISE PROMPT VALUATION // NEURAL AUDIT</span>
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black font-mono tracking-tight text-white uppercase mb-4">
          AUDITOR
        </h1>
        <p className="text-base sm:text-lg text-zinc-300 font-sans max-w-3xl leading-relaxed">
          Paste a prompt, protocol architecture, system instruction or logic map and run a
          structured neural audit (logical integrity, safety/compliance, execution efficiency).
          Audit results are scored by the model and are decision-support only.
        </p>
      </div>

      {/* Audit Workspace */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 space-y-8">
        <React.Suspense
          fallback={
            <div className="py-32 flex flex-col items-center justify-center space-y-4">
              <span className="text-xs font-mono uppercase tracking-widest text-ghost">
                Loading Audit Engine...
              </span>
            </div>
          }
        >
          <AuditTool />
        </React.Suspense>
      </div>
    </div>
  );
};

export default AuditPage;
