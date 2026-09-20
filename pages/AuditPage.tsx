import React from 'react';
import { ArrowLeft, ScanSearch } from 'lucide-react';
import type { PageView } from '../types.ts';
import { Frame, KeyCap } from '../components/brand/ChalkChrome.tsx';

interface AuditPageProps { onNavigate: (page: PageView, slug?: string) => void; }

/** The real, single-purpose destination of the AUDITOR product. */
const AuditPage: React.FC<AuditPageProps> = ({ onNavigate }) => {
  const AuditTool = React.lazy(() => import('../components/audit/AuditTool.tsx'));
  return (
    <div className="min-h-screen bg-[var(--konk-black)] text-[var(--body)] pb-24 pt-6">
      <div className="max-w-[1400px] mx-auto px-5 sm:px-8">
        <div className="hazard hazard-thin -mt-6 mb-6" />
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[var(--line-1)]">
          <button onClick={() => onNavigate('landing')} className="konk-link inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em]"><ArrowLeft size={15}/> return to base</button>
          <div className="flex items-center gap-3"><KeyCap>audit-only</KeyCap><button onClick={() => onNavigate('catalogue')} className="k-btn !min-h-0 !py-2.5 !px-3">browse benches</button></div>
        </div>
        <header className="py-11 sm:py-14 relative">
          <p className="font-mono text-[10px] uppercase tracking-[.32em] text-[var(--interactive-rest)] flex items-center gap-3"><ScanSearch size={15} className="text-[var(--konk-red)]"/> II / audit bench</p>
          <h1 className="font-black-display text-5xl sm:text-7xl mt-4 text-[var(--ink)]">AUDITOR<span className="text-[var(--konk-red)]">.</span></h1>
          <p className="font-tw text-[15px] leading-relaxed text-[var(--dim)] max-w-3xl mt-5">Paste a prompt, protocol architecture, system instruction, or logic map. The bench returns structured decision-support evidence for logical integrity, safety, compliance, and execution efficiency.</p>
          <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[var(--meta)] mt-5">outputs are decision support — review them before you act.</p>
        </header>
        <Frame className="p-1 sm:p-2"><React.Suspense fallback={<div className="py-28 text-center font-mono text-[10px] uppercase tracking-[.25em] text-[var(--meta)]">[&gt;&gt;] loading audit engine</div>}><AuditTool /></React.Suspense></Frame>
      </div>
    </div>
  );
};
export default AuditPage;
