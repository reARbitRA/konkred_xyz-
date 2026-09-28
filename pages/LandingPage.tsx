/**
 * KONKRED home — OBSIDIAN SIGNAL entry surface.
 *
 * A high-security machine floor: hazard-capped signal header, dual system
 * ticker, ghost-numeral hero with typewriter proposition, four command
 * modules (the real product doors), a blueprint command band and a system
 * boundary strip. Dark chalk-black by default; light = evidence-paper mode.
 * Red is reserved for live / armed / selected states.
 */
import React, { useEffect, useState } from 'react';
import type { PageView } from '../types.ts';
import { ENTRIES } from '../content/catalogue/portfolio.ts';
import { Typewriter } from '../components/brand/Typewriter.tsx';
import { track } from '../utils/analytics.ts';
import { ArrowRight } from 'lucide-react';

interface Props {
  onNavigate: (page: PageView, slug?: string) => void;
}

const useTheme = () => {
  const [light, setLight] = useState(() => {
    try { return localStorage.getItem('konkred-theme') === 'light'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', light);
    try { localStorage.setItem('konkred-theme', light ? 'light' : 'dark'); } catch { /* ignore */ }
  }, [light]);
  return { light, toggle: () => setLight((v) => !v) };
};

const DISPLAY = { fontFamily: "'Archivo Black','Archivo',sans-serif" } as const;
const MONO = { fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace" } as const;
const PROSE = { fontFamily: "'Special Elite','Courier New',serif" } as const;

/* ── command module: ID/STATUS → TITLE → description → IO → ACTION ── */
const Module: React.FC<{
  onClick: () => void; n: string; title: string; desc: string; cta: string;
  io: [string, string]; live?: boolean; wide?: boolean; delay: number;
  testId?: string; btnText?: string;
}> = ({ onClick, n, title, desc, cta, io, live, wide, delay, testId, btnText }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className={`k-slab k-scanhost k-rivet brutal-rise text-left p-6 sm:p-7 flex flex-col gap-4 cursor-pointer group ${wide ? 'sm:col-span-2' : ''}`}
    style={{ ['--slab-c' as string]: 'var(--k-red)', animationDelay: `${delay}s` }}
  >
    {/* ID / STATUS strip */}
    <span className="flex items-center justify-between gap-3 w-full">
      <span className="flex items-center gap-3">
        <span className="font-black text-4xl sm:text-5xl leading-none" style={{ ...DISPLAY, WebkitTextStroke: '1.5px var(--k-mut)', color: 'transparent' }}>{n}</span>
        <span className="text-[9px] font-bold tracking-[0.26em] uppercase border px-2.5 py-1" style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>{cta}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0" aria-hidden="true">
        <span className={`w-2 h-2 ${live ? 'k-dot-live' : ''}`} style={{ background: live ? 'var(--k-red)' : 'var(--k-line)' }} />
        <span className="text-[8px] font-bold tracking-[0.3em]" style={{ ...MONO, color: live ? 'var(--k-red)' : 'var(--k-mut)' }}>{live ? 'LIVE' : 'READY'}</span>
      </span>
    </span>

    <h3 className="uppercase leading-[1.02] text-xl sm:text-2xl tracking-tight transition-colors duration-200 group-hover:text-[var(--k-red)]" style={DISPLAY}>{title}</h3>
    <p className="text-[13px] leading-relaxed" style={{ ...PROSE, color: 'var(--k-mut)' }}>{desc}</p>

    {/* INPUT → OUTPUT */}
    <span className="flex items-center gap-2 text-[9px] font-bold tracking-[0.14em] uppercase border-t pt-3" style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>
      <span>{io[0]}</span>
      <span aria-hidden="true" style={{ color: 'var(--k-red)' }}>▸</span>
      <span>{io[1]}</span>
    </span>

    <span className="font-bold text-xs tracking-[0.2em] flex items-center gap-2 transition-colors duration-200 group-hover:text-[var(--k-red)]" style={MONO}>
      {btnText ?? 'ENTER'} <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
    </span>
  </button>
);

const LandingPage: React.FC<Props> = ({ onNavigate }) => {
  const { light, toggle } = useTheme();
  useEffect(() => { track('catalogue_view', 'landing'); }, []);

  const tickerFwd = ['36 CONTROLLED WORKFLOWS', '◆', '21 SUITES', '◆', '15 READY-TO-RUN TOOLS', '◆', 'EVIDENCE-LINKED', '◆', 'ZERO FAKE CLAIMS', '◆', 'HUMAN-SUPERVISED', '◆'];
  const tickerRev = ['MODEL CALLS RUN SERVER-SIDE', '///', 'KEYS NEVER SHIPPED TO THE BROWSER', '///', 'EVERY CLAIM SOURCED', '///', 'EVERY OUTPUT HUMAN-REVIEWED', '///', 'PUBLIC DEMOS USE SYNTHETIC DATA', '///'];

  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ background: 'var(--k-bg)', color: 'var(--k-ink)' }} data-testid="landing-b">

      {/* ── SIGNAL HEADER ── */}
      <div className="k-hazard k-hazard-thin" aria-hidden="true" />
      <header className="sticky top-0 z-40" style={{ background: 'var(--k-panel)', borderBottom: '2px solid var(--k-line)' }}>
        {/* system metadata strip */}
        <div className="hidden md:flex items-center justify-between px-5 sm:px-10 py-1.5 text-[8px] font-bold tracking-[0.3em] uppercase" style={{ ...MONO, borderBottom: '1px solid var(--k-line)', color: 'var(--k-mut)' }}>
          <span>SYS // KONKRED.XYZ — CONTROLLED WORKFLOW CATALOGUE</span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 k-dot-live" style={{ background: 'var(--k-red)' }} aria-hidden="true" />
            <span style={{ color: 'var(--k-red)' }}>UPLINK ACTIVE</span>
          </span>
        </div>
        {/* primary navigation */}
        <div className="flex items-center justify-between px-5 sm:px-10 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 grid place-items-center font-black text-lg transition-transform duration-200 hover:scale-110" style={{ background: 'var(--k-amber)', color: 'var(--k-on-acc)' }} aria-hidden="true">K</div>
            <b className="tracking-[0.25em] text-sm uppercase" style={DISPLAY}>KONKRED</b>
          </div>
          <nav className="flex items-center gap-1 sm:gap-2 text-[10px] font-bold tracking-[0.2em]" style={MONO} aria-label="Primary">
            {([['CATALOGUE', 'catalogue'], ['VALIDATION', 'validation'], ['PRICING', 'pricing']] as Array<[string, PageView]>).map(([label, page]) => (
              <button key={page} onClick={() => onNavigate(page)} className="hidden sm:inline-block px-3 py-2 cursor-pointer transition-colors duration-150 hover:text-[var(--k-red)] focus-visible:text-[var(--k-red)]" style={{ color: 'var(--k-mut)' }}>{label}</button>
            ))}
            <button onClick={() => onNavigate('catalogue')} className="px-4 py-2 border-2 cursor-pointer font-black transition-all duration-150 hover:bg-[var(--k-amber)] hover:text-[var(--k-on-acc)] hover:border-[var(--k-red)]" style={{ borderColor: 'var(--k-ink)' }}>
              ENTER ▸
            </button>
            <button onClick={toggle} className="px-3 py-2 border-2 cursor-pointer transition-colors duration-150 hover:border-[var(--k-red)] hover:text-[var(--k-red)]" style={{ borderColor: 'var(--k-line)', color: 'var(--k-mut)' }} aria-label="Toggle light or dark theme">
              {light ? '☀ PAPER' : '◐ OBSIDIAN'}
            </button>
          </nav>
        </div>
      </header>

      {/* ── DUAL SYSTEM TICKER ── */}
      <div aria-hidden="true">
        <div className="overflow-hidden whitespace-nowrap" style={{ background: 'var(--k-amber)', borderBottom: '2px solid var(--k-edge)' }}>
          <div className="brutal-marquee py-1.5">
            {[0, 1].map((k) => (
              <span key={k} className="flex shrink-0 font-black uppercase tracking-[0.25em] text-[11px] py-1" style={{ color: 'var(--k-on-acc)', ...DISPLAY }}>
                {tickerFwd.map((w, i) => <span key={i} className="mx-4">{w}</span>)}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-hidden whitespace-nowrap" style={{ background: 'var(--k-floor)', borderBottom: '2px solid var(--k-line)' }}>
          <div className="brutal-marquee-rev py-1">
            {[0, 1].map((k) => (
              <span key={k} className="flex shrink-0 font-bold uppercase tracking-[0.3em] text-[8px] py-0.5" style={{ color: 'var(--k-mut)', ...MONO }}>
                {tickerRev.map((w, i) => <span key={i} className="mx-4">{w}</span>)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── HERO ── */}
      <section className="relative px-5 sm:px-10 pt-12 sm:pt-20 pb-10 max-w-6xl mx-auto overflow-hidden">
        <span aria-hidden="true" className="ghost-num right-[-2rem] top-[-1rem] text-[38vw] sm:text-[22rem] hidden sm:block" style={{ WebkitTextStroke: '1px var(--k-line)' }}>36</span>

        <span className="k-badge inline-block rotate-[-1.5deg] mb-8 relative z-10" style={MONO}>
          EVIDENCE-LINKED WORKFLOW PRODUCTS
        </span>
        <div className="relative z-10">
          <Typewriter
            as="h1"
            text="WORK THAT PROVES ITSELF."
            speed={38}
            className="font-black uppercase leading-[0.92] tracking-[-0.02em] text-[13vw] sm:text-7xl lg:text-8xl min-h-[2.2em]"
          />
        </div>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed relative z-10" style={{ ...PROSE, color: 'var(--k-mut)' }}>
          36 enterprise workflow products — 21 suites, 15 ready-to-run tools. Every claim sourced,
          every output human-reviewed. No fake numbers, no autonomous employees.
        </p>

        <div className="flex flex-wrap items-center gap-4 mt-8 relative z-10">
          <button onClick={() => onNavigate('catalogue')} className="k-btn k-btn-acc" data-testid="landing-cta-primary">
            WALK THE FLOOR <span aria-hidden="true">▸</span>
          </button>
          <button onClick={() => onNavigate('validation')} className="k-btn k-btn-ghost">
            VALIDATION RECORD
          </button>
        </div>

        {/* machine telemetry — real counts only */}
        <div className="flex flex-wrap gap-8 sm:gap-12 mt-12 relative z-10">
          {([['36', 'PRODUCTS'], ['21', 'SUITES'], ['15', 'TOOLS']] as Array<[string, string]>).map(([n, l]) => (
            <div key={l} className="flex items-start gap-2">
              <span className="w-2 h-2 rotate-45 mt-2 shrink-0" style={{ background: 'var(--k-amber)' }} aria-hidden="true" />
              <div>
                <b className="font-black text-4xl sm:text-5xl block" style={DISPLAY}>{n}</b>
                <span className="text-[10px] font-bold tracking-[0.3em]" style={{ ...MONO, color: 'var(--k-mut)' }}>{l}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION 01 — THE FOUR DOORS ── */}
      <section className="px-5 sm:px-10 pb-20 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8" aria-hidden="true">
          <span className="text-[10px] font-bold tracking-[0.3em]" style={{ ...MONO, color: 'var(--k-red)' }}>01</span>
          <span className="h-px flex-1" style={{ background: 'var(--k-line)' }} />
          <span className="text-[10px] font-bold tracking-[0.3em] uppercase" style={{ ...MONO, color: 'var(--k-mut)' }}>SYSTEM ENTRY POINTS</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
          <Module
            testId="landing-slab-catalogue"
            onClick={() => onNavigate('catalogue')}
            n="01" delay={0.05} wide
            cta="36 WORKFLOWS · ZOOMABLE FLOOR"
            title="The Workflow Floor"
            desc="Every suite and tool as a station on an infinite floor — wires pulse suite → tool. Pan, zoom, open a station, run the tool."
            io={['CATALOGUE', 'RUNNING TOOL']}
            btnText="WALK THE FLOOR"
          />
          <Module
            testId="landing-slab-auditor"
            onClick={() => onNavigate('forge_audit')}
            n="02" delay={0.12}
            cta="AUDITOR"
            title="Neural Audit"
            desc="Read any file like a machine: vulnerabilities, exposed keys, deceptive patterns — with evidence."
            io={['FILE', 'EVIDENCE REPORT']}
            btnText="Open AUDITOR"
          />
          <Module
            testId="landing-slab-fullkonk"
            onClick={() => onNavigate('fullkonk')}
            n="03" delay={0.19}
            cta="fullKONK_&gt;"
            title="Autonomous Build Pipeline"
            desc="Describe the system. Watch it get architected, built, verified and reviewed — end to end."
            io={['SPEC', 'REVIEWED BUILD']}
            btnText="Open fullKONK_&gt;"
          />
          <Module
            testId="landing-slab-redaeye"
            onClick={() => onNavigate('redaeye')}
            n="04" delay={0.26} wide live
            cta="REDAEYE · ON AIR"
            title="REDAEYE Television"
            desc="367 techniques, 18 core detection families — broadcast on the KONKRED channel, old-TV style."
            io={['367 TECHNIQUES', '18 FAMILIES']}
            btnText="TUNE IN"
          />
        </div>
      </section>

      {/* ── FULL-BLEED COMMAND BAND ── */}
      <section className="relative k-blueprint" style={{ background: 'var(--k-floor)', borderTop: '2px solid var(--k-line)', borderBottom: '2px solid var(--k-line)' }}>
        <div className="px-5 sm:px-10 py-14 sm:py-20 max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
          <div>
            <span className="text-[10px] font-bold tracking-[0.3em] uppercase block mb-3" style={{ ...MONO, color: 'var(--k-red)' }}>02 // COMMAND</span>
            <h2 className="uppercase leading-[0.95] text-3xl sm:text-5xl max-w-2xl" style={DISPLAY}>
              Open a station.<br />
              <span className="hollow" style={{ WebkitTextStroke: '1.5px var(--k-mut)', color: 'transparent' }}>Run the tool.</span>
            </h2>
            <p className="mt-4 max-w-md text-[13px] leading-relaxed" style={{ ...PROSE, color: 'var(--k-mut)' }}>
              The catalogue is the product. Every station carries its status, its inputs,
              its outputs and its evidence — nothing more, nothing less.
            </p>
          </div>
          <button onClick={() => onNavigate('catalogue')} className="k-btn k-btn-acc shrink-0 text-sm px-8 py-4">
            OPEN CATALOGUE <span aria-hidden="true">▸</span>
          </button>
        </div>
      </section>

      {/* ── SYSTEM BOUNDARY / FOOTER STRIP ── */}
      <footer className="px-5 sm:px-10 py-8 flex flex-wrap items-center justify-between gap-4 text-[10px] font-bold tracking-[0.25em]" style={{ ...MONO, color: 'var(--k-mut)' }}>
        <span>KONKRED.XYZ — {ENTRIES.length} CONTROLLED WORKFLOW PRODUCTS</span>
        <div className="flex gap-5">
          <button onClick={() => onNavigate('validation')} className="cursor-pointer transition-colors duration-150 hover:text-[var(--k-red)] focus-visible:text-[var(--k-red)]">VALIDATION RECORD</button>
          <button onClick={() => onNavigate('partners')} className="cursor-pointer transition-colors duration-150 hover:text-[var(--k-red)] focus-visible:text-[var(--k-red)]">PARTNERS</button>
          <button onClick={() => onNavigate('enterprise')} className="cursor-pointer transition-colors duration-150 hover:text-[var(--k-red)] focus-visible:text-[var(--k-red)]">ENTERPRISE</button>
        </div>
      </footer>
      <div className="k-hazard k-hazard-thin" aria-hidden="true" />
    </div>
  );
};

export default LandingPage;
