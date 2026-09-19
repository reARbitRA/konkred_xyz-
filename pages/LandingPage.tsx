import React from 'react';
import { ArrowDown, ArrowUpRight, Box, Eye, Wrench } from 'lucide-react';
import type { PageView } from '../types.ts';
import { Beam, Flood, Frame, GhostNum, KeyCap, LiveClock, Panel, SectionHead } from '../components/chalk/ChalkUI.tsx';

interface Props { onNavigate: (page: PageView, slug?: string) => void; }

const Ticker: React.FC<{ text: string; reverse?: boolean }> = ({ text, reverse }) => <div className="ticker-wrap" aria-hidden="true"><div className={`ticker-track ${reverse ? 'ticker-reverse' : ''}`}>{[0, 1].map(copy => <span key={copy}>{text} <b>◆</b> {text} <b>◆</b> {text} <b>◆</b></span>)}</div></div>;

const LandingHeader: React.FC<Props> = ({ onNavigate }) => (
  <>
    <div className="hazard" aria-hidden="true" />
    <header className="landing-header">
      <button type="button" className="wordmark konk-item" onClick={() => onNavigate('landing')}><span>◆</span> KONKRED</button>
      <p className="machine-label header-product">CONTROLLED ENTERPRISE WORKFLOW PRODUCTS</p>
      <nav className="landing-nav" aria-label="Primary navigation"><button type="button" className="konk-item" onClick={() => onNavigate('catalogue')}>PORTFOLIO</button><button type="button" className="konk-item" onClick={() => document.getElementById('flagships')?.scrollIntoView({ behavior: 'smooth' })}>FLAGSHIPS</button><button type="button" className="konk-item" onClick={() => onNavigate('validation')}>RECORD</button></nav>
      <div className="system-readout"><span><i className="live-dot" />SYS: ONLINE</span><span className="desktop-only">PORTFOLIO: 36/36</span><LiveClock /></div>
    </header>
  </>
);

const productCards: { n: string; product: string; console: string; text: string; icon: typeof Wrench; page: PageView }[] = [
  { n: '01', product: 'fullKONK', console: 'SYSTEM ASSEMBLY', text: 'Turn a controlled brief into a runnable system shape.', icon: Wrench, page: 'fullkonk' },
  { n: '02', product: 'AUDITOR', console: 'EVIDENCE REVIEW', text: 'Inspect evidence and surface reviewable findings.', icon: Eye, page: 'forge_audit' },
  { n: '03', product: 'REDAEYE', console: 'APPROVED PROBE', text: 'Probe an approved surface inside a controlled range.', icon: Box, page: 'redaeye' },
];

const LandingPage: React.FC<Props> = ({ onNavigate }) => (
  <div className="landing-root chalk-smudge">
    <LandingHeader onNavigate={onNavigate} />
    <Ticker text="CONTROLLED INPUTS · REVIEWED OUTPUTS · HUMAN-SUPERVISED · TRACEABLE HANDOFFS" />
    <Ticker reverse text="21 CANONICAL SUITES · 15 VALIDATED WORKFLOWS · 03 FLAGSHIP SURFACES · DISTINCT ROUTES" />

    <main>
      <section className="landing-hero scanlines">
        <GhostNum n="36" className="hero-ghost" />
        <div className="landing-hero-copy">
          <p className="machine-label hero-label"><i className="signal-diamond" /> KONKRED / ENTERPRISE WORKFLOW PORTFOLIO</p>
          <h1 className="landing-headline">MAKE<br /><span className="hollow">WORK</span><br />PROVE<span className="red-glow">.</span></h1>
          <p className="tw-copy landing-prose">A governed catalogue of 21 canonical ARB suites and 15 validated workflows. The portfolio has its own routes and product detail; it sits alongside, not inside, KONKRED’s flagship surfaces.</p>
          <div className="landing-hero-actions"><button type="button" className="hero-action konk-item" onClick={() => onNavigate('catalogue')}>BROWSE 36 ENTRIES <ArrowUpRight size={17} /></button><button type="button" className="hero-text-link konk-item" onClick={() => document.getElementById('method')?.scrollIntoView({ behavior: 'smooth' })}>SEE THE METHOD <ArrowDown size={15} /></button></div>
        </div>
        <Frame className="hero-specimen chalk-soft" innerClass="hero-specimen-inner">
          <div className="machine-label specimen-label">PORTFOLIO TELEMETRY / READY</div>
          <div className="specimen-number">36</div>
          <div className="specimen-rule" /><div className="specimen-stats"><span>21 SUITES</span><span>15 WORKFLOWS</span><span>03 FLAGSHIPS</span></div>
          <div className="specimen-bars" aria-hidden="true">{[28, 53, 37, 68, 47, 78, 58, 33, 72, 48, 88, 61].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
          <p className="tw-copy">Each catalogue entry retains a dedicated route, a clear scope, and an explicit human review boundary.</p>
        </Frame>
      </section>

      <section className="landing-telemetry" aria-label="Konkred portfolio scale"><div><b>21</b><span>CANONICAL SUITES</span></div><div><b>15</b><span>VALIDATED WORKFLOWS</span></div><div><b>03</b><span>FLAGSHIP SURFACES</span></div><div><b>01</b><span>REQUIRED OWNER</span></div></section>

      <section id="flagships" className="product-section content-width">
        <SectionHead index="01" kicker="SEPARATE FLAGSHIP SURFACES" title={<>THREE <span className="hollow">FLAGSHIPS</span>.<br />NOT THE CATALOGUE.</>} hint="These focused KONKRED surfaces have their own jobs and routes. They do not classify, contain, or replace the 36 portfolio entries." />
        <div className="landing-products">{productCards.map(({ n, product, console, text, icon: Icon, page }) => <article key={product} className="landing-product group box-brutal"><Beam /><Flood /><div className="product-card-head"><span className="machine-label">{n} / {product}</span><Icon className="konk-item" size={25} strokeWidth={1.7} /></div><h3 className="konk-item">{console}</h3><p className="tw-copy">{text}</p><button type="button" className="product-open konk-item" onClick={() => onNavigate(page)}>OPEN SURFACE <ArrowUpRight size={13} /></button></article>)}</div>
      </section>

      <section id="method" className="method-section content-width">
        <SectionHead index="02" kicker="THE FLOOR CONTRACT" title={<>NOT MAGIC.<br /><span className="hollow">MATERIAL</span> CONTROL.</>} hint="The work stays legible from first handoff to final review." />
        <div className="method-grid">
          <Panel label="01 / INTAKE" right={<KeyCap>DEFINE</KeyCap>}><div className="method-card"><span className="method-index">01</span><h3>Feed the bench</h3><p className="tw-copy">State the source material and the constraint. A bench starts with enough context to make its boundary clear.</p><div className="method-code">IN: [CONTROLLED MATERIAL]</div></div></Panel>
          <Panel label="02 / RAIL" right={<KeyCap>OBSERVE</KeyCap>}><div className="method-card"><span className="method-index">02</span><h3>Watch the rail</h3><p className="tw-copy">The machine shows its operating stages rather than hiding a jump from prompt to claim.</p><div className="method-code">[..] → [&gt;&gt;] → [ok]</div></div></Panel>
          <Panel label="03 / OUTPUT" right={<KeyCap>OWN</KeyCap>}><div className="method-card"><span className="method-index">03</span><h3>Take the stamp</h3><p className="tw-copy">A stamped result is a reviewable draft, finding, or package. A person remains responsible for action.</p><div className="method-code">OUT: [REVIEWED RESULT]</div></div></Panel>
        </div>
      </section>

      <section className="landing-band blueprint scanlines"><div className="content-width band-inner"><p className="machine-label">PORTFOLIO INDEX / 36-01</p><h2 className="display-title">FIND A SUITE.<br />OPEN A <span className="hollow-red">WORKFLOW</span>.</h2><p className="tw-copy">Explore twenty-one merged canonical suites and fifteen validated workflow products. Every card leads to its own dedicated route — never a generic console.</p><button type="button" className="hero-action konk-item" onClick={() => onNavigate('catalogue')}>OPEN THE PORTFOLIO <ArrowUpRight size={17} /></button></div></section>

      <section className="truth-section content-width"><div className="truth-copy"><p className="machine-label"><i className="signal-diamond" /> SYSTEM BOUNDARY</p><h2 className="display-title">THE MACHINE<br />STOPS <span className="hollow">HERE</span>.</h2><p className="tw-copy">Konkred workflows help structure, test, and prepare work. They do not send, sign, approve, publish, hire, fire, trade, or decide in place of their owners.</p></div><div className="truth-list">{['evidence is named', 'assumptions stay marked', 'outputs are reviewable', 'actions remain human-owned'].map((item, index) => <div key={item}><b>0{index + 1}</b><span>{item}</span><i>→</i></div>)}</div></section>
    </main>
    <footer className="chalk-footer"><div className="footer-marquee hollow" aria-hidden="true">KONKRED · KONKRED · KONKRED ·</div><div className="content-width footer-row"><span className="machine-label">KONKRED.XYZ / CONTROLLED ENTERPRISE WORKFLOW PRODUCTS</span><div><button type="button" className="konk-item" onClick={() => onNavigate('catalogue')}>PORTFOLIO INDEX</button><button type="button" className="konk-item" onClick={() => onNavigate('validation')}>VALIDATION RECORD</button><button type="button" className="konk-item" onClick={() => onNavigate('contact')}>CONTACT</button></div></div></footer>
  </div>
);

export default LandingPage;
