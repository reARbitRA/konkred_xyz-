import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Radar, ShieldCheck } from 'lucide-react';
import { KeyCap, Panel, Shell } from '../components/chalk/ChalkUI.tsx';
import type { Bench } from './chalkData.ts';

export type RunPhase = 'idle' | 'running' | 'complete';

/** The one run contract used by every bench console. */
export function useRun(stepCount = 4) {
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (phase !== 'running') return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= stepCount - 1) {
          window.clearInterval(timer);
          setPhase('complete');
          return stepCount;
        }
        return current + 1;
      });
    }, 540);
    return () => window.clearInterval(timer);
  }, [phase, stepCount]);

  const run = () => {
    if (phase === 'running') return;
    setStep(0);
    setPhase('running');
  };
  return { phase, step, run, reset: () => { setPhase('idle'); setStep(0); } };
}

const railSteps = ['INTAKE', 'SHAPE', 'VERIFY', 'STAMP'];
const StepRail: React.FC<{ phase: RunPhase; step: number }> = ({ phase, step }) => (
  <ol className="step-rail" aria-label="Workflow execution progress">
    {railSteps.map((label, index) => {
      const state = phase === 'complete' || index < step ? 'ok' : phase === 'running' && index === step ? 'run' : 'wait';
      const mark = state === 'ok' ? '[ok]' : state === 'run' ? '[>>]' : '[..]';
      return <li key={label} className={`rail-${state}`}><span>{mark}</span>{label}</li>;
    })}
  </ol>
);

const RunButton: React.FC<{ phase: RunPhase; onRun: () => void }> = ({ phase, onRun }) => (
  <button type="button" className="run-button" onClick={onRun} disabled={phase === 'running'}>
    {phase === 'running' ? 'RUNNING ▸' : phase === 'complete' ? 'RUN AGAIN ▸' : 'RUN ▸'}
  </button>
);

const Metrics: React.FC<{ phase: RunPhase; bench: Bench }> = ({ phase, bench }) => (
  <div className="metric-strip" aria-live="polite">
    <span><b>{phase === 'complete' ? '04' : String(Math.min(4, bench.number % 4 + 1)).padStart(2, '0')}</b> steps</span>
    <span><b>{phase === 'complete' ? '01' : '00'}</b> output</span>
    <span><b>{phase === 'complete' ? 'SEALED' : 'HOLD'}</b> trail</span>
  </div>
);

const RunCore: React.FC<{ bench: Bench; phase: RunPhase; step: number; onRun: () => void }> = ({ bench, phase, step, onRun }) => (
  <Panel label="CONTROL INTAKE" right={<KeyCap>{bench.id}</KeyCap>} className="console-core">
    <label className="machine-label intake-label" htmlFor="bench-intake">CONTROLLED INPUT</label>
    <textarea id="bench-intake" className="bench-input" defaultValue={bench.source.inputSummary[0] ?? `Provide ${bench.intake}.`} rows={3} />
    <StepRail phase={phase} step={step} />
    <div className="core-output-line"><span>OUT</span><b>{bench.output}</b></div>
    <RunButton phase={phase} onRun={onRun} />
  </Panel>
);

const ConsoleLayout: React.FC<React.PropsWithChildren<{ bench: Bench; onExit: () => void; phase: RunPhase; step: number; onRun: () => void }>> = ({ bench, onExit, phase, step, onRun, children }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onExit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <Shell tag={`${bench.zone.roman} / ${bench.zone.key} / ${bench.id}`} title={bench.zone.console} sub={bench.source.title} onExit={onExit}>
      <div className="console-grid">
        <aside className="console-aside">
          <RunCore bench={bench} phase={phase} step={step} onRun={onRun} />
          <Metrics bench={bench} phase={phase} />
        </aside>
        <section className="console-workspace">{children}</section>
      </div>
    </Shell>
  );
};

const AssemblyBench: React.FC<{ bench: Bench; onExit: () => void }> = ({ bench, onExit }) => {
  const { phase, step, run } = useRun();
  const [tab, setTab] = useState<'PLAN' | 'FILES' | 'PREVIEW'>('PLAN');
  const files = ['src/', '  App.tsx', '  intake.ts', '  styles.css', 'README.md'];
  return <ConsoleLayout bench={bench} onExit={onExit} phase={phase} step={step} onRun={run}>
    <Panel label="FORGE SURFACE" right={<span className="machine-label">{bench.zone.product}</span>} className="assembly-panel">
      <div className="tab-row" role="tablist" aria-label="Assembly views">
        {(['PLAN', 'FILES', 'PREVIEW'] as const).map(item => <button key={item} type="button" className={`tab-button ${tab === item ? 'is-active' : ''}`} onClick={() => setTab(item)} role="tab" aria-selected={tab === item}>{item}</button>)}
      </div>
      {tab === 'PLAN' && <div className="plan-stack">
        {['map constraints', 'lay components', 'check the handoff'].map((line, index) => <div className={`plan-card ${phase !== 'idle' && index <= step ? 'plan-live' : ''}`} key={line}><b>0{index + 1}</b><span>{line}</span><i>READY</i></div>)}
      </div>}
      {tab === 'FILES' && <div className="file-tree" aria-live="polite">{files.map((file, index) => <p key={file} className={phase !== 'idle' && index <= step + 1 ? 'file-made' : ''}><span>{phase !== 'idle' && index <= step + 1 ? '[ok]' : '[..]'}</span>{file}</p>)}</div>}
      {tab === 'PREVIEW' && <div className="browser-preview">
        <div className="browser-chrome"><span /><span /><span /><b>localhost / controlled-preview</b><em className={phase === 'complete' ? 'red-glow' : ''}>● REC · {phase === 'complete' ? 'LIVE' : 'WAIT'}</em></div>
        <div className="browser-canvas"><strong>{phase === 'complete' ? 'BUILD LANDED' : 'AWAITING FORGE'}</strong><small>human review remains in the loop</small></div>
      </div>}
    </Panel>
  </ConsoleLayout>;
};

const AuditBench: React.FC<{ bench: Bench; onExit: () => void }> = ({ bench, onExit }) => {
  const { phase, step, run } = useRun();
  const findings = ['source trace absent', 'approval owner missing', 'boundary wording needs review'];
  return <ConsoleLayout bench={bench} onExit={onExit} phase={phase} step={step} onRun={run}>
    <Panel label="X-RAY FINDING PLATE" right={<Radar size={15} />} className="audit-panel">
      <div className={`xray-plate ${phase === 'running' ? 'radar-on' : ''}`}>
        <span className="radar-sweep" />
        {phase === 'complete' ? <div className="audit-verdict"><strong>27</strong><span>HAZARD SCORE / 100</span><b className="stamp stamp-pass">PASS</b></div> : <div className="xray-wait">{phase === 'running' ? 'SCANNING PLATE' : 'LOAD · THEN RUN'}</div>}
      </div>
      <div className="finding-list" aria-live="polite">
        {findings.map((finding, index) => <div key={finding} className={phase === 'complete' || index < step ? 'finding-live' : ''}><span>{index === 0 ? 'medium' : 'info'}</span><b>{finding}</b><i style={{ width: `${72 - index * 18}%` }} /></div>)}
      </div>
    </Panel>
  </ConsoleLayout>;
};

const AttackBench: React.FC<{ bench: Bench; onExit: () => void }> = ({ bench, onExit }) => {
  const { phase, step, run } = useRun();
  const activeCells = phase === 'complete' ? 12 : phase === 'running' ? 2 + step * 3 : 0;
  return <ConsoleLayout bench={bench} onExit={onExit} phase={phase} step={step} onRun={run}>
    <Panel label="CONTROLLED PROBE RANGE" right={<ShieldCheck size={15} />} className="attack-panel">
      <div className="target-chips"><span>TARGET / {bench.source.category}</span><span>MODE / SAFE</span><span>RULES / HELD</span></div>
      <div className="heat-grid" aria-label="40-cell controlled probe matrix">{Array.from({ length: 40 }, (_, cell) => <i key={cell} className={cell < activeCells && cell % 3 !== 1 ? 'heat-cell' : ''} />)}</div>
      <div className="probe-stream" aria-live="polite">{Array.from({ length: Math.max(1, step + (phase === 'complete' ? 2 : 0)) }, (_, index) => <p key={index}><span>probe {String(index + 1).padStart(2, '0')} · payload</span><b className={index % 2 === 0 && phase !== 'idle' ? 'red-glow' : ''}>{index % 2 === 0 && phase !== 'idle' ? 'BREACH' : 'blocked'}</b></p>)}</div>
      {phase === 'complete' && <b className="stamp attack-grade">GRADE C</b>}
    </Panel>
  </ConsoleLayout>;
};

const PublishBench: React.FC<{ bench: Bench; onExit: () => void }> = ({ bench, onExit }) => {
  const { phase, step, run } = useRun();
  return <ConsoleLayout bench={bench} onExit={onExit} phase={phase} step={step} onRun={run}>
    <Panel label="PRESS DESK / REVIEWED ONLY" right={<KeyCap>WIRE 01</KeyCap>} className="press-panel">
      <div className="press-grid">
        <article className="paper-sheet"><i className="staple" /><span className="punches">○<br />○<br />○</span><p className="paper-meta">KONKNEWS / DRAFT</p><h3>{bench.source.title}</h3><hr /><p>One checked message, prepared for a human editorial owner. No publishing action occurs here.</p></article>
        <div className="stamp-road">{['EDIT', 'SOURCE', 'OWNER', 'WIRE'].map((station, index) => <div key={station} className={phase === 'complete' || index < step ? 'road-pass' : ''}><i /><span>{station}</span>{(phase === 'complete' || index < step) && <b className="stamp">PASS</b>}</div>)}</div>
      </div>
      <div className="wire-feed"><span>WIRE-OUT //</span>{phase === 'complete' ? <b className="red-glow"> CLEARED FOR HUMAN SEND</b> : <b> awaiting controlled run</b>}{phase === 'complete' && <em className="stamp cleared-stamp">CLEARED</em>}</div>
    </Panel>
  </ConsoleLayout>;
};

const DocumentBench: React.FC<{ bench: Bench; onExit: () => void }> = ({ bench, onExit }) => {
  const { phase, step, run } = useRun();
  const [exported, setExported] = useState(false);
  const progress = phase === 'complete' ? 100 : phase === 'running' ? (step + 1) * 25 : 3;
  return <ConsoleLayout bench={bench} onExit={onExit} phase={phase} step={step} onRun={run}>
    <Panel label="PRINTING PRESS" right={<FileText size={15} />} className="document-panel">
      <div className="press-gauge"><span>PRESS / {Math.round(progress)}%</span><i><b style={{ width: `${progress}%` }} /></i></div>
      <div className="blueprint fig-plate"><p className="machine-label">FIG 05 · CONTROLLED DOCUMENT ROUTE</p><div><span>NOTES</span><b>→</b><span>CHECK</span><b>→</b><span>FORGE</span><b>→</b><span>PACK</span></div></div>
      <div className="forged-docs">{['brief.pdf', 'review-log.txt', 'source-index.csv'].map((doc, index) => <article key={doc} className={phase === 'complete' || index < step ? 'doc-ready' : ''}><i className="staple" /><b>{doc}</b><small>{phase === 'complete' || index < step ? 'FORGED / CHECKED' : 'QUEUED'}</small></article>)}</div>
      <button type="button" className="export-button konk-item" onClick={() => setExported(true)} disabled={phase !== 'complete'}><Download size={13} /> {exported ? 'EXPORT STAGED' : 'EXPORT PACK'}</button>
    </Panel>
  </ConsoleLayout>;
};

const OrchestrateBench: React.FC<{ bench: Bench; onExit: () => void }> = ({ bench, onExit }) => {
  const { phase, step, run } = useRun();
  const nodes = ['IN', 'MAP', 'CHECK', 'HANDOFF', 'OUT'];
  const points = nodes.map((_, index) => ({ x: 46 + index * 112, y: index % 2 === 0 ? 52 : 128 }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
  return <ConsoleLayout bench={bench} onExit={onExit} phase={phase} step={step} onRun={run}>
    <Panel label="PIPELINE BOARD" right={<KeyCap>TRAIL 06</KeyCap>} className="pipeline-panel">
      <svg className="pipeline-svg" viewBox="0 0 540 180" role="img" aria-label="Controlled pipeline node chain">
        <path d={path} className={phase === 'running' ? 'pipe-line flow-line' : 'pipe-line'} />
        {points.map((point, index) => <g key={nodes[index]} className={phase !== 'idle' && index <= step ? 'node-live' : ''}><rect x={point.x - 25} y={point.y - 18} width="50" height="36" /><text x={point.x} y={point.y + 4}>{nodes[index]}</text></g>)}
      </svg>
      <div className="hop-rail">{nodes.map((node, index) => <span key={node} className={phase !== 'idle' && index <= step ? 'hop-live' : ''}>[{index < step || phase === 'complete' ? 'ok' : index === step && phase === 'running' ? '>>' : '..'}] {node}</span>)}</div>
      <div className="trail-tally"><span>PACKETS / {phase === 'complete' ? '05' : `0${step}`}</span><b className={phase === 'complete' ? 'red-glow' : ''}>trail: {phase === 'complete' ? 'sealed' : 'open'}</b></div>
    </Panel>
  </ConsoleLayout>;
};

export const BenchConsole: React.FC<{ bench: Bench; onExit: () => void }> = ({ bench, onExit }) => {
  const byZone = useMemo(() => ({
    BUILD: <AssemblyBench bench={bench} onExit={onExit} />,
    AUDIT: <AuditBench bench={bench} onExit={onExit} />,
    ADVERSARY: <AttackBench bench={bench} onExit={onExit} />,
    PUBLISH: <PublishBench bench={bench} onExit={onExit} />,
    DOCUMENT: <DocumentBench bench={bench} onExit={onExit} />,
    ORCHESTRATE: <OrchestrateBench bench={bench} onExit={onExit} />,
  }), [bench, onExit]);
  return byZone[bench.zone.key];
};
