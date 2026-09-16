import React from 'react';
import { ArrowDown, ArrowUpRight, Box, Eye, FileCheck2, Newspaper, Wrench } from 'lucide-react';
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
      <nav className="landing-nav" aria-label="Primary navigation"><button type="button" className="konk-item" onClick={() => onNavigate('catalogue')}>FLOOR</button><button type="button" className="konk-item" onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })}>PRODUCTS</button><button type="button" className="konk-item" onClick={() => onNavigate('validation')}>RECORD</button></nav>
      <div className="system-readout"><span><i className="live-dot" />SYS: ONLINE</span><span className="desktop-only">FLOOR: 36/36</span><LiveClock /></div>
    </header>
  </>
);

const productCards = [
  { n: '01', product: 'fullkonk_>', console: 'ASSEMBLY BENCH', text: 'Turn a controlled brief into a runnable system shape.', icon: Wrench },
  { n: '02', product: 'AUDITOR', console: 'X-RAY PLATE', text: 'Inspect the evidence and surface reviewable findings.', icon: Eye },
  { n: '03', product: 'REDAEYE', console: 'ATTACK BENCH', text: 'Probe an approved surface inside a controlled range.', icon: Box },
  { n: '04', product: 'konknews', console: 'PRESS DESK', text: 'Move an owner-reviewed draft through a visible press lane.', icon: Newspaper },
  { n: '05', product: 'ARTIFACTORY', console: 'PRINTING PRESS', text: 'Forge a document package with a traceable source trail.', icon: FileCheck2 },
];

const LandingPage: React.FC<Props> = ({ onNavigate }) => (
  <div className="landing-root chalk-smudge">
    <LandingHeader onNavigate={onNavigate} />
    <Ticker text="CONTROLLED INPUTS · REVIEWED OUTPUTS · HUMAN-SUPERVISED · TRACEABLE HANDOFFS" />
    <Ticker reverse text="FULLKONK_> · AUDITOR · REDAEYE · KONKNEWS · ARTIFACTORY · FLOOR OPS" />

    <main>
      <section className="landing-hero scanlines">
        <GhostNum n="36" className="hero-ghost" />
        <div className="landing-hero-copy">
          <p className="machine-label hero-label"><i className="signal-diamond" /> FACTORY FLOOR / CONTROLLED CATALOGUE</p>
          <h1 className="landing-headline">MAKE<br /><span className="hollow">WORK</span><br />PROVE<span className="red-glow">.</span></h1>
          <p className="tw-copy landing-prose">Enterprise AI workflows with a visible intake, a mechanical rail, and a stamped output. No autonomous employees. No invented certainty.</p>
          <div className="landing-hero-actions"><button type="button" className="hero-action konk-item" onClick={() => onNavigate('catalogue')}>WALK THE FLOOR <ArrowUpRight size={17} /></button><button type="button" className="hero-text-link konk-item" onClick={() => document.getElementById('method')?.scrollIntoView({ behavior: 'smooth' })}>SEE THE METHOD <ArrowDown size={15} /></button></div>
        </div>
        <Frame className="hero-specimen chalk-soft" innerClass="hero-specimen-inner">
          <div className="machine-label specimen-label">FLOOR TELEMETRY / LIVE</div>
          <div className="specimen-number">36</div>
          <div className="specimen-rule" /><div className="specimen-stats"><span>06 ZONES</span><span>05 PRODUCTS</span><span>01 OWNER</span></div>
          <div className="specimen-bars" aria-hidden="true">{[28, 53, 37, 68, 47, 78, 58, 33, 72, 48, 88, 61].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
          <p className="tw-copy">Every output arrives with an explicit handoff for the human who owns the decision.</p>
        </Frame>
      </section>

      <section className="landing-telemetry" aria-label="Konkred platform scale"><div><b>05</b><span>FLAGSHIP PRODUCTS</span></div><div><b>36</b><span>CONTROLLED WORKFLOWS</span></div><div><b>06</b><span>FACTORY ZONES</span></div><div><b>01</b><span>REQUIRED OWNER</span></div></section>

      <section id="products" className="product-section content-width">
        <SectionHead index="01" kicker="SIGNAL HARDWARE" title={<>FIVE <span className="hollow">PRODUCTS</span>.<br />ONE CONTROLLED FLOOR.</>} hint="Different machines. The same contract: clear material in, observable steps through, a human-owned output out." />
        <div className="landing-products">{productCards.map(({ n, product, console, text, icon: Icon }) => <article key={product} className="landing-product group box-brutal"><Beam /><Flood /><div className="product-card-head"><span className="machine-label">{n} / {product}</span><Icon className="konk-item" size={25} strokeWidth={1.7} /></div><h3 className="konk-item">{console}</h3><p className="tw-copy">{text}</p><button type="button" className="product-open konk-item" onClick={() => onNavigate('catalogue')}>OPEN FLOOR <ArrowUpRight size={13} /></button></article>)}</div>
      </section>

      <section id="method" className="method-section content-width">
        <SectionHead index="02" kicker="THE FLOOR CONTRACT" title={<>NOT MAGIC.<br /><span className="hollow">MATERIAL</span> CONTROL.</>} hint="The work stays legible from first handoff to final review." />
        <div className="method-grid">
          <Panel label="01 / INTAKE" right={<KeyCap>DEFINE</KeyCap>}><div className="method-card"><span className="method-index">01</span><h3>Feed the bench</h3><p className="tw-copy">State the source material and the constraint. A bench starts with enough context to make its boundary clear.</p><div className="method-code">IN: [CONTROLLED MATERIAL]</div></div></Panel>
          <Panel label="02 / RAIL" right={<KeyCap>OBSERVE</KeyCap>}><div className="method-card"><span className="method-index">02</span><h3>Watch the rail</h3><p className="tw-copy">The machine shows its operating stages rather than hiding a jump from prompt to claim.</p><div className="method-code">[..] → [&gt;&gt;] → [ok]</div></div></Panel>
          <Panel label="03 / OUTPUT" right={<KeyCap>OWN</KeyCap>}><div className="method-card"><span className="method-index">03</span><h3>Take the stamp</h3><p className="tw-copy">A stamped result is a reviewable draft, finding, or package. A person remains responsible for action.</p><div className="method-code">OUT: [REVIEWED RESULT]</div></div></Panel>
        </div>
      </section>

      <section className="landing-band blueprint scanlines"><div className="content-width band-inner"><p className="machine-label">WORK ORDER / 36-01</p><h2 className="display-title">PICK A BENCH.<br />FEED THE <span className="hollow-red">SIGNAL</span>.</h2><p className="tw-copy">The workflow floor groups all 36 benches by their operating zone and gives every one of them a single, consistent run contract.</p><button type="button" className="hero-action konk-item" onClick={() => onNavigate('catalogue')}>OPEN THE WORKFLOW FLOOR <ArrowUpRight size={17} /></button></div></section>

      <section className="truth-section content-width"><div className="truth-copy"><p className="machine-label"><i className="signal-diamond" /> SYSTEM BOUNDARY</p><h2 className="display-title">THE MACHINE<br />STOPS <span className="hollow">HERE</span>.</h2><p className="tw-copy">Konkred workflows help structure, test, and prepare work. They do not send, sign, approve, publish, hire, fire, trade, or decide in place of their owners.</p></div><div className="truth-list">{['evidence is named', 'assumptions stay marked', 'outputs are reviewable', 'actions remain human-owned'].map((item, index) => <div key={item}><b>0{index + 1}</b><span>{item}</span><i>→</i></div>)}</div></section>
    </main>
    <footer className="chalk-footer"><div className="footer-marquee hollow" aria-hidden="true">KONKRED · KONKRED · KONKRED ·</div><div className="content-width footer-row"><span className="machine-label">KONKRED.XYZ / CONTROLLED ENTERPRISE WORKFLOW PRODUCTS</span><div><button type="button" className="konk-item" onClick={() => onNavigate('catalogue')}>WORKFLOW FLOOR</button><button type="button" className="konk-item" onClick={() => onNavigate('validation')}>VALIDATION RECORD</button><button type="button" className="konk-item" onClick={() => onNavigate('contact')}>CONTACT</button></div></div></footer>
  </div>
);

export default LandingPage;
