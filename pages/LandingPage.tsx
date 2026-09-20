import React, { useEffect } from 'react';
import type { PageView } from '../types.ts';
import { ENTRIES, SUITES, WORKFLOWS } from '../content/catalogue/portfolio.ts';
import { ArrowRight, ShieldCheck, Wrench, Radio, Building2, Terminal } from 'lucide-react';
import { track } from '../utils/analytics.ts';
import { Frame, KeyCap } from '../components/brand/ChalkChrome.tsx';

interface Props { onNavigate: (page: PageView, slug?: string) => void; }

const SignalLink: React.FC<{ children: React.ReactNode; onClick: () => void; primary?: boolean; className?: string }> = ({ children, onClick, primary, className = '' }) => (
  <button onClick={onClick} className={`k-btn ${primary ? 'k-btn-acc' : 'k-btn-ghost'} ${className}`}>
    {children} <ArrowRight size={14} strokeWidth={2.1} />
  </button>
);

const BenchCard: React.FC<{
  index: string; label: string; title: string; desc: string; input: string; output: string;
  icon: React.ElementType; action: string; onClick: () => void;
}> = ({ index, label, title, desc, input, output, icon: Icon, action, onClick }) => (
  <article className="group spec-shell chalk-soft box-brutal p-6 sm:p-7 min-h-[318px] flex flex-col overflow-hidden">
    <span className="beam" /> <span className="flood" />
    <span className="absolute -right-2 -bottom-8 font-black-display text-[128px] leading-none hollow opacity-50 pointer-events-none" aria-hidden="true">{index}</span>
    <div className="relative z-10 flex items-start justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[.32em] text-[var(--meta)]">{label}</p>
        <h3 className="font-black-display text-2xl mt-2 text-[var(--ink)]">{title}</h3>
      </div>
      <Icon size={25} className="konk-item shrink-0" strokeWidth={1.7} />
    </div>
    <p className="relative z-10 font-tw text-[14px] leading-relaxed text-[var(--dim)] mt-4 max-w-md">{desc}</p>
    <div className="relative z-10 mt-auto pt-6 space-y-2 font-mono text-[9px] uppercase tracking-[.16em]">
      <p className="text-[var(--meta)]">IN&nbsp;&nbsp;<span className="text-[var(--interactive-rest)]">[{input}]</span></p>
      <p className="text-[var(--meta)]">OUT <span className="text-[var(--interactive-rest)]">[{output}]</span></p>
    </div>
    <button onClick={onClick} className="relative z-10 konk-item mt-5 self-end inline-flex items-center gap-2 font-mono text-[10px] font-bold tracking-[.22em] uppercase">
      {action} <ArrowRight size={13} />
    </button>
  </article>
);

const LandingPage: React.FC<Props> = ({ onNavigate }) => {
  useEffect(() => { track('catalogue_view', 'landing'); }, []);
  const ticker = 'CONTROLLED AI WORKFLOWS · HUMAN APPROVAL · EVIDENCE-LINKED OUTPUTS · KONKRED.XYZ · ';

  return (
    <div className="min-h-screen bg-[var(--konk-black)] text-[var(--body)] overflow-hidden">
      <header className="sticky top-0 z-50 bg-[rgba(10,9,8,.92)] backdrop-blur-md border-b border-[var(--line-1)]">
        <div className="hazard hazard-thin" />
        <div className="max-w-[1400px] mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <button onClick={() => onNavigate('landing')} className="flex items-center gap-3 text-left group shrink-0" aria-label="KONKRED home">
            <span className="w-7 h-7 grid place-items-center border border-[var(--edge)] font-black-display text-sm text-[var(--ink)] group-hover:text-[var(--konk-red-glow)] group-hover:border-[var(--konk-red)]">K</span>
            <span className="font-black-display text-lg tracking-[-.05em] text-[var(--ink)]">KONKRED</span>
          </button>
          <p className="hidden lg:flex font-mono text-[9px] uppercase tracking-[.26em] text-[var(--faint)] items-center gap-2">
            <i className="w-1.5 h-1.5 bg-[var(--konk-red)] inline-block" /> controlled enterprise workflow products
          </p>
          <nav className="flex items-center gap-1 sm:gap-4 font-mono text-[9px] uppercase tracking-[.18em]">
            <button onClick={() => onNavigate('catalogue')} className="konk-link px-2 py-2">benches</button>
            <button onClick={() => onNavigate('pricing')} className="konk-link px-2 py-2">offers</button>
            <button onClick={() => onNavigate('validation')} className="hidden sm:block konk-link px-2 py-2">record</button>
            <button onClick={() => onNavigate('join_network')} className="k-btn k-btn-acc !min-h-0 !py-2 !px-3 !text-[9px]">request access</button>
          </nav>
        </div>
      </header>

      <div className="border-b border-[var(--red-border-dim)] bg-[var(--red-tint-bg)] overflow-hidden whitespace-nowrap" aria-hidden="true">
        <div className="brutal-marquee py-2 font-mono text-[9px] tracking-[.25em] text-[var(--interactive-rest)]">{[0, 1].map((item) => <span key={item} className="pr-10">{ticker.repeat(4)}</span>)}</div>
      </div>
      <div className="border-b border-[var(--line-1)] bg-[var(--surface-sunken)] overflow-hidden whitespace-nowrap" aria-hidden="true">
        <div className="brutal-marquee py-2 font-mono text-[9px] tracking-[.25em] text-[var(--faint)]" style={{ animationDirection: 'reverse', animationDuration: '34s' }}>{[0, 1].map((item) => <span key={item} className="pr-10">WORKFLOW KITS · VALIDATION SPRINTS · MANAGED BENCHES · ENTERPRISE CONTROL PLANE · </span>)}</div>
      </div>

      <main>
        <section className="scanlines relative px-5 py-20 sm:py-28 lg:py-36">
          <div className="blueprint absolute inset-x-0 top-0 h-full opacity-35 pointer-events-none" />
          <div className="max-w-[1400px] mx-auto relative">
            <p className="font-mono text-[10px] uppercase tracking-[.34em] text-[var(--interactive-rest)] flex items-center gap-3"><span className="text-[var(--konk-red)]">◆</span> floor status: awake / 036 products indexed</p>
            <p className="absolute -right-4 sm:right-5 -top-16 font-black-display text-[30vw] leading-none hollow opacity-30 pointer-events-none select-none" aria-hidden="true">01</p>
            <h1 className="font-black-display max-w-6xl mt-8 text-[16vw] sm:text-[11vw] lg:text-[7.6rem] text-[var(--ink)]">
              MAKE THE<br/><span className="hollow-red">WORK</span> HOLD.
            </h1>
            <p className="font-tw text-[15px] leading-relaxed max-w-xl mt-8 text-[var(--dim)]">KONKRED turns high-friction AI work into controlled benches: a clear intake, a visible rail, and a reviewable output. Start with one workflow. Scale only when the evidence is strong.</p>
            <div className="flex flex-wrap gap-3 mt-9">
              <SignalLink primary onClick={() => onNavigate('catalogue')}>walk the workflow floor</SignalLink>
              <SignalLink onClick={() => onNavigate('pricing')}>inspect offer ladder</SignalLink>
            </div>
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 border-y border-[var(--line-1)]">
              {[
                [`${ENTRIES.length}`, 'PRODUCT BENCHES', 'scoped workflow products'],
                [`${SUITES.length}`, 'SUITE ASSEMBLIES', 'grouped operating systems'],
                [`${WORKFLOWS.length}`, 'RUNNABLE TOOLS', 'clear input-to-output paths'],
              ].map(([number, label, note]) => <div key={label} className="py-5 sm:px-6 border-b sm:border-b-0 sm:border-r last:border-0 border-[var(--line-1)]">
                <p className="font-black-display text-4xl text-[var(--ink)]">{number}</p><p className="font-mono text-[9px] uppercase tracking-[.25em] mt-1 text-[var(--interactive-rest)]">{label}</p><p className="font-tw text-xs mt-2 text-[var(--meta)]">{note}</p>
              </div>)}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:py-24 max-w-[1400px] mx-auto">
          <div className="flex flex-wrap justify-between items-end gap-5 mb-8">
            <div><p className="font-mono text-[10px] uppercase tracking-[.32em] text-[var(--interactive-rest)]">// primary benches</p><h2 className="font-black-display text-4xl sm:text-6xl mt-3 text-[var(--ink)]">THREE WAYS<br/>TO START.</h2></div>
            <p className="font-tw text-sm max-w-sm text-[var(--meta)]">Each bench has one job. Inputs are named before you run it; outputs are made to be reviewed.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BenchCard index="01" label="build" title="fullKONK" desc="Shape a product brief into an architected build with observable handoffs and a review step." input="product brief" output="reviewable build" icon={Wrench} action="open build bench" onClick={() => onNavigate('fullkonk')} />
            <BenchCard index="02" label="audit" title="AUDITOR" desc="Examine a system prompt, protocol, or logic map for weaknesses and decision-support evidence." input="prompt or protocol" output="structured audit" icon={ShieldCheck} action="run audit" onClick={() => onNavigate('forge_audit')} />
            <BenchCard index="03" label="adversary" title="REDAEYE" desc="Explore adversarial testing material and diagnostic patterns before they become production risk." input="attack surface" output="diagnostic record" icon={Radio} action="enter adversary bench" onClick={() => onNavigate('redaeye')} />
          </div>
        </section>

        <section className="relative bg-[var(--surface-sunken)] border-y border-[var(--line-1)] px-5 py-20 sm:py-24">
          <div className="hazard absolute left-0 right-0 top-0" />
          <div className="max-w-[1400px] mx-auto grid lg:grid-cols-[.85fr_1.15fr] gap-10">
            <div><p className="font-mono text-[10px] uppercase tracking-[.32em] text-[var(--interactive-rest)]">// monetization that respects the work</p><h2 className="font-black-display text-4xl sm:text-6xl mt-4 text-[var(--ink)]">BUY THE<br/>RIGHT DEPTH.</h2><p className="font-tw text-[14px] leading-relaxed mt-6 text-[var(--dim)]">The ladder is structured around one useful outcome at a time—not a vague platform promise. Start self-serve, prove it in a sprint, then operationalize it with governance.</p><SignalLink onClick={() => onNavigate('pricing')} className="mt-7">view planning ranges</SignalLink></div>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ['01', 'WORKFLOW KIT', '$97–$297', 'Versioned prompt, schemas, fixture, validator, and approval instructions.'],
                ['02', 'VALIDATION SPRINT', '$1.5K–$10K', 'One workflow, one sample, one approver, one fixed deliverable pack.'],
                ['03', 'MANAGED BENCH', '$1.5K–$15K / MO', 'Operating support, review queue, governance, and output evidence.'],
                ['04', 'ENTERPRISE SETUP', 'SCOPED', 'Identity, policy packs, audit logs, tenant controls, and integrations.'],
              ].map(([num, name, price, detail]) => <Frame key={name} className="p-5 min-h-[188px] group box-brutal"><span className="font-black-display hollow text-5xl">{num}</span><p className="font-mono text-[10px] uppercase tracking-[.25em] text-[var(--interactive-rest)] mt-3">{name}</p><p className="font-black-display text-xl text-[var(--ink)] mt-2">{price}</p><p className="font-tw text-xs leading-relaxed text-[var(--meta)] mt-3">{detail}</p></Frame>)}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:py-28 max-w-[1400px] mx-auto">
          <Frame className="p-7 sm:p-12 overflow-hidden group">
            <div className="absolute inset-y-0 right-0 w-1/2 blueprint opacity-40" /><span className="beam" />
            <div className="relative max-w-3xl"><p className="font-mono text-[10px] uppercase tracking-[.32em] text-[var(--interactive-rest)]">// next action</p><h2 className="font-black-display text-4xl sm:text-6xl mt-4 text-[var(--ink)]">PUT ONE<br/>WORKFLOW ON<br/><span className="hollow-red">THE BENCH.</span></h2><p className="font-tw text-[14px] leading-relaxed mt-6 text-[var(--dim)]">Search the floor by the job your team needs done. Every product page names the input, output, limits, and route to a human conversation.</p><div className="flex flex-wrap gap-3 mt-8"><SignalLink primary onClick={() => onNavigate('catalogue')}>open the floor</SignalLink><SignalLink onClick={() => onNavigate('enterprise')}>talk enterprise controls</SignalLink></div></div>
          </Frame>
        </section>
      </main>

      <footer className="border-t border-[var(--line-1)] px-5 py-8">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-5"><div><p className="font-black-display text-2xl hollow">KONKRED</p><p className="font-mono text-[9px] uppercase tracking-[.25em] text-[var(--faint)] mt-2">controlled enterprise workflow products</p></div><div className="flex flex-wrap items-center gap-3"><KeyCap>human review</KeyCap><KeyCap>evidence linked</KeyCap><button onClick={() => onNavigate('contact')} className="konk-link font-mono text-[10px] uppercase tracking-[.2em]">contact →</button></div></div>
      </footer>
    </div>
  );
};
export default LandingPage;
