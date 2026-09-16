import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Search, SlidersHorizontal, X } from 'lucide-react';
import type { PageView } from '../types.ts';
import { Beam, Flood, GhostNum, KeyCap, LiveClock, Panel, SectionHead } from '../components/chalk/ChalkUI.tsx';
import { BENCHES, benchesFor, ZONES, type Bench, type ZoneKey } from './chalkData.ts';
import { BenchConsole } from './ChalkConsoles.tsx';

interface Props { onNavigate: (page: PageView, slug?: string) => void; }

type Filter = 'ALL' | ZoneKey;

const FloorHeader: React.FC<{ onNavigate: Props['onNavigate'] }> = ({ onNavigate }) => (
  <>
    <div className="hazard" aria-hidden="true" />
    <header className="floor-header">
      <button type="button" className="wordmark konk-item" onClick={() => onNavigate('landing')} aria-label="Konkred home"><span>◆</span> KONKRED</button>
      <p className="machine-label header-product">CONTROLLED WORKFLOW PRODUCTS</p>
      <nav aria-label="Primary" className="floor-nav">
        <button type="button" className="konk-item" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>FLOOR</button>
        <button type="button" className="konk-item" onClick={() => document.getElementById('signal-products')?.scrollIntoView({ behavior: 'smooth' })}>PRODUCTS</button>
        <button type="button" className="konk-item" onClick={() => onNavigate('validation')}>RECORD</button>
      </nav>
      <div className="system-readout"><span><i className="live-dot" />SYS: ONLINE</span><span>FLOOR: 36/36</span><LiveClock /></div>
    </header>
  </>
);

const Ticker: React.FC<{ text: string; reverse?: boolean }> = ({ text, reverse }) => (
  <div className="ticker-wrap" aria-hidden="true"><div className={`ticker-track ${reverse ? 'ticker-reverse' : ''}`}>{[0, 1].map(copy => <span key={copy}>{text} <b>◆</b> {text} <b>◆</b> {text} <b>◆</b></span>)}</div></div>
);

const HowItWorks = () => (
  <Panel label="HOW THE FLOOR WORKS" className="how-panel" right={<KeyCap>36 BENCHES</KeyCap>}>
    <ol className="how-steps">
      <li><b>01</b><span>pick a card</span><small>match the intake and output</small></li>
      <li><b>02</b><span>feed the intake</span><small>state the working material</small></li>
      <li><b>03</b><span>take the output</span><small>review the stamped result</small></li>
    </ol>
  </Panel>
);

const FilterButton: React.FC<{ label: string; count: number; active: boolean; onClick: () => void }> = ({ label, count, active, onClick }) => (
  <button type="button" onClick={onClick} className={`filter-button ${active ? 'filter-active' : 'konk-item'}`} aria-pressed={active}>{label} <b>{count}</b></button>
);

const BenchCard: React.FC<{ bench: Bench; onRun: (bench: Bench) => void }> = ({ bench, onRun }) => (
  <article className="bench-card group box-brutal">
    <Beam /><Flood />
    <GhostNum n={String(bench.number).padStart(2, '0')} className="bench-ghost" />
    <div className="bench-card-content">
      <div className="bench-top"><span className="machine-label">{bench.id}</span><span className="bench-dots" aria-hidden="true">············</span><span className="machine-label"><i className="live-dot" /> LIVE</span></div>
      <h3 className="bench-title konk-item">{bench.source.title}</h3>
      <p className="tw-copy bench-desc">{bench.source.jobToBeDone ?? bench.zone.descriptor}</p>
      <div className="io-row"><span>IN: <b>{bench.intake}</b></span><i>→</i><span>OUT: <b>{bench.output}</b></span></div>
      <div className="bench-bottom"><span className="machine-label">{bench.duration}</span><KeyCap>{bench.difficulty}</KeyCap><button type="button" onClick={() => onRun(bench)} className="card-run konk-item" aria-label={`Run ${bench.source.title}`}>RUN <ArrowUpRight size={14} /></button></div>
    </div>
  </article>
);

const Floor: React.FC<Props> = ({ onNavigate }) => {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [activeBench, setActiveBench] = useState<Bench | null>(null);
  const hitCount = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return BENCHES.length;
    return BENCHES.filter(bench => [bench.source.title, bench.source.jobToBeDone, bench.zone.key, bench.zone.product, bench.intake, bench.output].join(' ').toLowerCase().includes(normalized)).length;
  }, [query]);
  const shown = (bench: Bench) => {
    const normalized = query.trim().toLowerCase();
    const inFilter = filter === 'ALL' || bench.zone.key === filter;
    const inSearch = !normalized || [bench.source.title, bench.source.jobToBeDone, bench.zone.key, bench.zone.product, bench.intake, bench.output].join(' ').toLowerCase().includes(normalized);
    return inFilter && inSearch;
  };

  if (activeBench) return <BenchConsole bench={activeBench} onExit={() => setActiveBench(null)} />;

  return (
    <div className="floor-root chalk-smudge">
      <FloorHeader onNavigate={onNavigate} />
      <Ticker text="CONTROLLED INPUTS · REVIEWED OUTPUTS · HUMAN-SUPERVISED · TRACEABLE HANDOFFS" />
      <Ticker reverse text="FULLKONK_> · AUDITOR · REDAEYE · KONKNEWS · ARTIFACTORY · FLOOR OPS" />

      <main>
        <section className="floor-hero scanlines">
          <GhostNum n="36" className="hero-ghost" />
          <div className="hero-copy">
            <p className="machine-label hero-label"><i className="signal-diamond" /> FACTORY FLOOR / REV 01</p>
            <h1 className="hero-title">WORK<br /><span className="hollow">WITH</span> PROOF<span className="red-glow">.</span></h1>
            <p className="tw-copy hero-prose">A controlled catalogue of enterprise AI workflow products. Pick a bench, feed a clear intake, and take a stamped output into human review.</p>
            <div className="hero-actions"><button type="button" className="hero-action konk-item" onClick={() => document.getElementById('workflow-floor')?.scrollIntoView({ behavior: 'smooth' })}>WALK THE FLOOR <ArrowUpRight size={16} /></button><KeyCap>NO AUTONOMOUS ACTIONS</KeyCap></div>
          </div>
          <div className="hero-machine" aria-hidden="true"><div className="machine-ring"><span>CONTROLLED</span><b>36</b><span>BENCHES</span></div><div className="machine-bars">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ height: `${24 + ((i * 13) % 56)}%` }} />)}</div></div>
        </section>

        <section className="telemetry-band" aria-label="Catalogue telemetry"><div><b>05</b><span>FLAGSHIP PRODUCTS</span></div><div><b>36</b><span>CONTROLLED BENCHES</span></div><div><b>06</b><span>WORK ZONES</span></div><div><b>01</b><span>HUMAN OWNER</span></div></section>

        <section id="signal-products" className="signal-products content-width">
          <SectionHead index="01" kicker="SIGNAL HARDWARE" title={<>FIVE PRODUCTS.<br /><span className="hollow">ONE</span> FLOOR.</>} hint="Each product lends a different physical console to the work beneath it." />
          <div className="product-grid">
            {ZONES.slice(0, 5).map((zone, index) => <button key={zone.key} type="button" className="product-card group box-brutal" onClick={() => { setFilter(zone.key); document.getElementById('workflow-floor')?.scrollIntoView({ behavior: 'smooth' }); }}><Beam /><span className="machine-label">0{index + 1} / {zone.product}</span><h3 className="konk-item">{zone.console}</h3><p className="tw-copy">{zone.descriptor}</p><span className="product-open konk-item">OPEN ZONE <ArrowUpRight size={13} /></span></button>)}
          </div>
        </section>

        <section className="floor-guide content-width"><HowItWorks /></section>

        <section id="workflow-floor" className="workflow-floor">
          <div className="content-width">
            <SectionHead index="02" kicker="36 CONTROLLED WORKFLOWS" title={<>THE <span className="hollow">WORKFLOW</span> FLOOR.</>} hint="Every bench has one intake, one rail and one stamped output." />
          </div>
          <div className="floor-toolbar">
            <div className="content-width toolbar-content">
              <div className="toolbar-label"><SlidersHorizontal size={14} /><span>ZONE FILTER</span></div>
              <div className="filters" role="group" aria-label="Filter workflow zones"><FilterButton label="ALL" count={BENCHES.length} active={filter === 'ALL'} onClick={() => setFilter('ALL')} />{ZONES.map(zone => <FilterButton key={zone.key} label={zone.key} count={benchesFor(zone.key).length} active={filter === zone.key} onClick={() => setFilter(zone.key)} />)}</div>
              <label className="floor-search"><Search size={14} /><span className="sr-only">Search workflow benches</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SEARCH BENCHES" /><b>{hitCount} HIT{hitCount === 1 ? '' : 'S'}</b>{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}</label>
            </div>
          </div>
          <div className="content-width zone-stack">
            {ZONES.map(zone => {
              const cards = benchesFor(zone.key).filter(shown);
              if (!cards.length) return null;
              return <section className="zone-section" key={zone.key} aria-labelledby={`zone-${zone.key}`}>
                <header className="zone-head"><span className="zone-roman">{zone.roman}</span><div><p className="machine-label">ZONE {zone.roman} / {zone.product}</p><h2 id={`zone-${zone.key}`} className="display-title">{zone.key}</h2></div><p className="tw-copy">{zone.descriptor}</p><span className="zone-rail" aria-hidden="true"><i /><i /><i /><b /></span></header>
                <div className="bench-grid">{cards.map(bench => <BenchCard key={bench.id} bench={bench} onRun={setActiveBench} />)}</div>
              </section>;
            })}
            {hitCount === 0 && <div className="no-results"><span className="hollow">NO BENCH</span><p className="tw-copy">The floor has no match for that signal. Try a product, zone, or intake type.</p></div>}
          </div>
        </section>

        <section className="full-band blueprint scanlines"><div className="content-width band-inner"><p className="machine-label">CONTROL STANDARD / 01</p><h2 className="display-title">INPUT → RAIL → <span className="hollow-red">STAMP</span></h2><p className="tw-copy">No opaque handoff. Every workflow is designed to show the material it takes, the stages it passes, and the output a person must own.</p></div></section>
      </main>
      <footer className="chalk-footer"><div className="footer-marquee hollow" aria-hidden="true">KONKRED · KONKRED · KONKRED ·</div><div className="content-width footer-row"><span className="machine-label">KONKRED.XYZ / CONTROLLED ENTERPRISE WORKFLOW PRODUCTS</span><div><button type="button" className="konk-item" onClick={() => onNavigate('validation')}>VALIDATION RECORD</button><button type="button" className="konk-item" onClick={() => onNavigate('enterprise')}>ENTERPRISE</button><button type="button" className="konk-item" onClick={() => onNavigate('contact')}>CONTACT</button></div></div></footer>
    </div>
  );
};

export default Floor;
