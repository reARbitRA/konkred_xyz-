import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Search, SlidersHorizontal, X } from 'lucide-react';
import type { PageView } from '../types.ts';
import { Beam, Flood, GhostNum, KeyCap, LiveClock, Panel, SectionHead } from '../components/chalk/ChalkUI.tsx';
import { CATALOGUE_ENTRIES, SUITE_ENTRIES, WORKFLOW_ENTRIES, type CatalogueEntry, type CatalogueType } from './chalkData.ts';

interface Props { onNavigate: (page: PageView, slug?: string) => void; }

const FloorHeader: React.FC<{ onNavigate: Props['onNavigate'] }> = ({ onNavigate }) => (
  <>
    <div className="hazard" aria-hidden="true" />
    <header className="floor-header">
      <button type="button" className="wordmark konk-item" onClick={() => onNavigate('landing')} aria-label="Konkred home"><span>◆</span> KONKRED</button>
      <p className="machine-label header-product">ENTERPRISE WORKFLOW PORTFOLIO</p>
      <nav aria-label="Primary" className="floor-nav">
        <button type="button" className="konk-item" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>CATALOGUE</button>
        <button type="button" className="konk-item" onClick={() => document.getElementById('catalogue-index')?.scrollIntoView({ behavior: 'smooth' })}>ENTRIES</button>
        <button type="button" className="konk-item" onClick={() => onNavigate('validation')}>RECORD</button>
      </nav>
      <div className="system-readout"><span><i className="live-dot" />CATALOGUE: READY</span><span>21 + 15</span><LiveClock /></div>
    </header>
  </>
);

const Ticker: React.FC<{ text: string; reverse?: boolean }> = ({ text, reverse }) => (
  <div className="ticker-wrap" aria-hidden="true"><div className={`ticker-track ${reverse ? 'ticker-reverse' : ''}`}>{[0, 1].map(copy => <span key={copy}>{text} <b>◆</b> {text} <b>◆</b> {text} <b>◆</b></span>)}</div></div>
);

const HowItWorks = () => (
  <Panel label="HOW THE PORTFOLIO FITS TOGETHER" className="how-panel" right={<KeyCap>21 + 15</KeyCap>}>
    <ol className="how-steps">
      <li><b>01</b><span>start with a suite</span><small>Each suite consolidates a related family of enterprise prompts.</small></li>
      <li><b>02</b><span>choose a workflow</span><small>Fifteen narrower products are clear entry points into their parent suite.</small></li>
      <li><b>03</b><span>review the scope</span><small>Every product page keeps its own inputs, evidence, boundaries and route.</small></li>
    </ol>
  </Panel>
);

const FilterButton: React.FC<{ label: string; count: number; active: boolean; onClick: () => void }> = ({ label, count, active, onClick }) => (
  <button type="button" onClick={onClick} className={`filter-button ${active ? 'filter-active' : 'konk-item'}`} aria-pressed={active}>{label} <b>{count}</b></button>
);

const statusLabel = (entry: CatalogueEntry) => entry.source.status.replaceAll('_', ' ');

const CatalogueCard: React.FC<{ entry: CatalogueEntry; onOpen: (entry: CatalogueEntry) => void }> = ({ entry, onOpen }) => {
  const isSuite = entry.source.type === 'SUITE';
  const title = isSuite ? 'VIEW SUITE' : 'OPEN WORKFLOW';
  return <article className="catalog-card group box-brutal">
    <Beam /><Flood />
    <GhostNum n={String(entry.number).padStart(2, '0')} className="bench-ghost" />
    <div className="bench-card-content">
      <div className="bench-top"><span className="machine-label">{String(entry.number).padStart(2, '0')} / {entry.source.type}</span><span className="bench-dots" aria-hidden="true">············</span><span className="machine-label"><i className="live-dot" /> {entry.source.validationStatus.replace('_', ' ')}</span></div>
      <h3 className="bench-title konk-item">{entry.source.title}</h3>
      <p className="tw-copy bench-desc">{entry.source.jobToBeDone ?? entry.source.definition ?? 'A controlled, evidence-grounded enterprise workflow.'}</p>
      <div className="catalogue-io" aria-label={`Input and output summary for ${entry.source.title}`}>
        <p><b>IN</b><span>{entry.input}</span></p>
        <p><b>OUT</b><span>{entry.output}</span></p>
      </div>
      <div className="catalogue-meta">
        <span>{entry.source.category}</span>
        <span>{entry.parent ? `PARENT: ${entry.parent.title}` : 'ROOT / CANONICAL'}</span>
        <span>{statusLabel(entry)}</span>
      </div>
      <p className="catalogue-route">ROUTE / {entry.source.route}</p>
      <div className="bench-bottom"><KeyCap>{isSuite ? 'CANONICAL SUITE' : 'VALIDATED WORKFLOW'}</KeyCap><button type="button" onClick={() => onOpen(entry)} className="card-run konk-item" aria-label={`${title}: ${entry.source.title}`}>{title} <ArrowUpRight size={14} /></button></div>
    </div>
  </article>;
};

const CatalogueSection: React.FC<{ title: string; kicker: string; copy: string; items: CatalogueEntry[]; onOpen: (entry: CatalogueEntry) => void }> = ({ title, kicker, copy, items, onOpen }) => (
  <section className="portfolio-section" aria-labelledby={`catalogue-${title}`}>
    <header className="portfolio-section-head"><p className="machine-label">{kicker} / {items.length} ENTRIES</p><h2 id={`catalogue-${title}`} className="display-title">{title}</h2><p className="tw-copy">{copy}</p></header>
    <div className="bench-grid">{items.map(entry => <CatalogueCard key={entry.source.id} entry={entry} onOpen={onOpen} />)}</div>
  </section>
);

const Floor: React.FC<Props> = ({ onNavigate }) => {
  const [filter, setFilter] = useState<CatalogueType>('ALL');
  const [query, setQuery] = useState('');
  const matchingEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return CATALOGUE_ENTRIES.filter(entry => {
      const matchesType = filter === 'ALL' || entry.source.type === filter;
      const haystack = [entry.source.title, entry.source.id, entry.source.category, entry.source.jobToBeDone, entry.parent?.title, entry.source.status].filter(Boolean).join(' ').toLowerCase();
      return matchesType && (!normalized || haystack.includes(normalized));
    });
  }, [filter, query]);

  const openEntry = (entry: CatalogueEntry) => onNavigate(entry.source.type === 'SUITE' ? 'suite_detail' : 'workflow_detail', entry.source.slug);
  const suiteMatches = matchingEntries.filter(entry => entry.source.type === 'SUITE');
  const workflowMatches = matchingEntries.filter(entry => entry.source.type === 'WORKFLOW');

  return (
    <div className="floor-root chalk-smudge">
      <FloorHeader onNavigate={onNavigate} />
      <Ticker text="CANONICAL SUITES · VALIDATED WORKFLOWS · SOURCE-LINKED · HUMAN-REVIEWED" />
      <Ticker reverse text="21 ARB SUITES · 15 ENTRY WORKFLOWS · ONE PORTFOLIO · SEPARATE PRODUCT ROUTES" />

      <main>
        <section className="floor-hero scanlines">
          <GhostNum n="36" className="hero-ghost" />
          <div className="hero-copy">
            <p className="machine-label hero-label"><i className="signal-diamond" /> PORTFOLIO INDEX / REV 01</p>
            <h1 className="hero-title">36<br /><span className="hollow">WORKFLOW</span> ENTRIES<span className="red-glow">.</span></h1>
            <p className="tw-copy hero-prose">Twenty-one canonical ARB suites consolidate related enterprise prompt families. Fifteen validated workflows remain distinct, narrower entry products — each connected to, but never confused with, its parent suite.</p>
            <div className="hero-actions"><button type="button" className="hero-action konk-item" onClick={() => document.getElementById('catalogue-index')?.scrollIntoView({ behavior: 'smooth' })}>EXPLORE THE CATALOGUE <ArrowUpRight size={16} /></button><KeyCap>21 SUITES + 15 WORKFLOWS</KeyCap></div>
          </div>
          <div className="hero-machine" aria-hidden="true"><div className="machine-ring"><span>PORTFOLIO</span><b>36</b><span>ENTRIES</span></div><div className="machine-bars">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ height: `${24 + ((i * 13) % 56)}%` }} />)}</div></div>
        </section>

        <section className="telemetry-band" aria-label="Portfolio totals"><div><b>21</b><span>CANONICAL SUITES</span></div><div><b>15</b><span>VALIDATED WORKFLOWS</span></div><div><b>36</b><span>UNIQUE ROUTES</span></div><div><b>01</b><span>CONNECTED PORTFOLIO</span></div></section>

        <section className="portfolio-explainer content-width">
          <SectionHead index="01" kicker="PORTFOLIO ARCHITECTURE" title={<>SUITES <span className="hollow">AND</span><br />WORKFLOWS.</>} hint="The catalogue is not a collection of fullKONK, AUDITOR, or REDAEYE modes. It is the independent KONKRED enterprise workflow portfolio." />
          <div className="relationship-grid"><div className="relationship-card"><span className="machine-label">21 / CANONICAL ARB SUITES</span><h3>Consolidated prompt families</h3><p className="tw-copy">A suite is a broad product formed by merging related ARB records into one governed operating workflow with its own scope and product route.</p></div><div className="relationship-arrow" aria-hidden="true">↔</div><div className="relationship-card"><span className="machine-label">15 / VALIDATED WORKFLOWS</span><h3>Narrower entry products</h3><p className="tw-copy">A workflow is a repeatable, validated task with its own page and commercial path. It links back to a suite without becoming a feature inside another tool.</p></div></div>
        </section>

        <section className="floor-guide content-width"><HowItWorks /></section>

        <section id="catalogue-index" className="workflow-floor">
          <div className="content-width"><SectionHead index="02" kicker="FULL CATALOGUE" title={<>FIND THE RIGHT<br /><span className="hollow">ENTRY</span> POINT.</>} hint="Filter the complete portfolio by product type, then open the dedicated suite or workflow experience." /></div>
          <div className="floor-toolbar"><div className="content-width toolbar-content"><div className="toolbar-label"><SlidersHorizontal size={14} /><span>TYPE FILTER</span></div><div className="filters" role="group" aria-label="Filter portfolio entries"><FilterButton label="ALL" count={CATALOGUE_ENTRIES.length} active={filter === 'ALL'} onClick={() => setFilter('ALL')} /><FilterButton label="SUITES" count={SUITE_ENTRIES.length} active={filter === 'SUITE'} onClick={() => setFilter('SUITE')} /><FilterButton label="WORKFLOWS" count={WORKFLOW_ENTRIES.length} active={filter === 'WORKFLOW'} onClick={() => setFilter('WORKFLOW')} /></div><label className="floor-search"><Search size={14} /><span className="sr-only">Search the portfolio</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SEARCH ENTRIES" /><b>{matchingEntries.length} HIT{matchingEntries.length === 1 ? '' : 'S'}</b>{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}</label></div></div>
          <div className="content-width catalogue-stack">
            {suiteMatches.length > 0 && <CatalogueSection title="CANONICAL SUITES" kicker="ARB PROMPT MERGES" copy="Twenty-one broad products created by consolidating related ARB enterprise prompt families. Each remains a distinct suite with its own detailed interaction model." items={suiteMatches} onOpen={openEntry} />}
            {workflowMatches.length > 0 && <CatalogueSection title="VALIDATED WORKFLOWS" kicker="NARROWER ENTRY PRODUCTS" copy="Fifteen separately discoverable workflow products. Each retains its own validation, route and UI while mapping to the relevant parent suite." items={workflowMatches} onOpen={openEntry} />}
            {matchingEntries.length === 0 && <div className="no-results"><span className="hollow">NO ENTRY</span><p className="tw-copy">No suite or workflow matches that search. Try a domain, canonical ID, or workflow name.</p></div>}
          </div>
        </section>

        <section className="full-band blueprint scanlines"><div className="content-width band-inner"><p className="machine-label">PORTFOLIO RULE / 36-01</p><h2 className="display-title">MERGED <span className="hollow-red">PROMPTS</span>.<br />DISTINCT PRODUCTS.</h2><p className="tw-copy">A canonical suite may consolidate many related prompt families. A validated workflow may serve as the focused path into that suite. Their identities, routes and interfaces remain separate.</p></div></section>
      </main>
      <footer className="chalk-footer"><div className="footer-marquee hollow" aria-hidden="true">KONKRED · KONKRED · KONKRED ·</div><div className="content-width footer-row"><span className="machine-label">KONKRED.XYZ / ENTERPRISE WORKFLOW PORTFOLIO</span><div><button type="button" className="konk-item" onClick={() => onNavigate('validation')}>VALIDATION RECORD</button><button type="button" className="konk-item" onClick={() => onNavigate('enterprise')}>ENTERPRISE</button><button type="button" className="konk-item" onClick={() => onNavigate('contact')}>CONTACT</button></div></div></footer>
    </div>
  );
};

export default Floor;
