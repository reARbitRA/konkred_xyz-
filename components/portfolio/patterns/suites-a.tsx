/**
 * Suite interface previews 1–11.
 * Each suite renders its owner-specified experience pattern as a distinct,
 * interactive layout driven by the manifest's own data (modules, use cases,
 * validators, control requirements). Illustrative — labelled as such.
 */
import React, { useState } from 'react';
import { Frame, Pane, Cap, Chip, Li, rows, type PatternProps } from './kit.tsx';

/* 1. customer-support-control — command center: ticket queue + policy comparison + SLA clock + health panel */
export const CustomerSupportControl: React.FC<PatternProps> = ({ entry }) => {
  const [sel, setSel] = useState(0);
  const ticket = (m: string, i: number) => ({ id: `TCK-${(1042 + i * 7).toString()}`, subject: m, sla: (i % 3) * 4 + 2 });
  const tickets = entry.modules.slice(0, 6).map(ticket);
  const current = tickets[sel] ?? tickets[0];
  const [tick, setTick] = useState(0);
  React.useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const remain = Math.max(0, current.sla * 60 - (tick % (current.sla * 60)));
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-4 space-y-1.5">
          <Cap className="mb-1">Ticket queue · {tickets.length} open</Cap>
          {tickets.map((t, i) => (
            <Li key={t.id} active={i === sel} onClick={() => setSel(i)}>
              <span className="font-mono text-zinc-500 mr-1.5">{t.id}</span>{t.subject}
            </Li>
          ))}
        </div>
        <div className="lg:col-span-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Pane title="Policy A (v2.1)">
              <p className="text-[10px] text-zinc-400 leading-relaxed">Refund window: 30 days · escalation: tier-2 after 8h</p>
            </Pane>
            <Pane title="Policy B (v3.0)">
              <p className="text-[10px] text-zinc-300 leading-relaxed">Refund window: 45 days · escalation: tier-2 after 4h</p>
              <Chip tone="warn" >conflicts: 1</Chip>
            </Pane>
          </div>
          <Pane title={`Draft response — ${current.subject}`}>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Policy-grounded draft queued for approval. Sources: policy bundle v3.0, entitlement record.
            </p>
            <div className="flex gap-1.5 mt-2"><Chip tone="ok">cited</Chip><Chip tone="info">awaiting owner</Chip></div>
          </Pane>
        </div>
        <div className="lg:col-span-3 space-y-3">
          <Pane title="SLA clock">
            <p className="font-mono font-black text-2xl text-amber-400 tabular-nums">
              {String(Math.floor(remain / 60)).padStart(2, '0')}:{String(remain % 60).padStart(2, '0')}
            </p>
            <Cap>to escalation (tier 2)</Cap>
          </Pane>
          <Pane title="Account health">
            <div className="space-y-2">
              {[['Entitlements', 'ok', 'active'], ['Usage trend', 'warn', 'declining'], ['Churn risk', 'mut', 'calibrated model required']].map(([k, tone, v]) => (
                <div key={k} className="flex items-center justify-between"><span className="text-[10px] text-zinc-400">{k}</span><Chip tone={tone as 'ok'}>{v}</Chip></div>
              ))}
            </div>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 2. finance-close-reporting — close-control center: period checklist + exceptions table + balance status + approval drawer */
export const FinanceCloseReporting: React.FC<PatternProps> = ({ entry }) => {
  const [done, setDone] = useState<boolean[]>([true, true, false, false]);
  const [drawer, setDrawer] = useState(false);
  const steps = entry.modules.slice(0, 4);
  const exc = [
    { id: 'REC-018', desc: 'Bank 2100 vs ledger Δ 412.50', state: 'ambiguous' },
    { id: 'REC-021', desc: 'PSP payout missing cutoff ref', state: 'unmatched' },
    { id: 'REC-025', desc: 'FX reval rate version', state: 'review' },
  ];
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-4">
          <Cap className="mb-1.5">Period checklist · FY-Q3</Cap>
          <div className="space-y-1.5">
            {steps.map((s, i) => (
              <label key={i} className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg border border-zinc-800 bg-[#0a0908] cursor-pointer">
                <input type="checkbox" checked={done[i]} onChange={() => setDone((d) => d.map((x, j) => (j === i ? !x : x)))} className="mt-0.5 accent-amber-500" />
                <span className={`text-[11px] leading-snug ${done[i] ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>{s}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done.filter(Boolean).length / done.length) * 100}%` }} />
          </div>
          <Cap className="mt-1">close progress {done.filter(Boolean).length}/{done.length}</Cap>
        </div>
        <div className="lg:col-span-5">
          <Cap className="mb-1.5">Reconciliation exceptions</Cap>
          <table className="w-full text-[10px] font-mono">
            <tbody>
              {exc.map((e) => (
                <tr key={e.id} className="border-b border-zinc-800/70">
                  <td className="py-2 pr-2 text-zinc-500">{e.id}</td>
                  <td className="py-2 pr-2 text-zinc-300">{e.desc}</td>
                  <td className="py-2"><Chip tone={e.state === 'review' ? 'info' : e.state === 'ambiguous' ? 'warn' : 'bad'}>{e.state}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-2">
            <Chip tone="ok">Trial balance: balanced</Chip><Chip tone="mut">sub-ledgers: 12/12 tied</Chip>
          </div>
        </div>
        <div className="lg:col-span-3">
          <button onClick={() => setDrawer(!drawer)} className="w-full px-3 py-2.5 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-300 font-mono font-black uppercase tracking-widest text-[9px] cursor-pointer">
            {drawer ? 'Close drawer' : 'Controller approval'}
          </button>
          {drawer && (
            <div className="mt-2 border border-purple-500/30 rounded-xl p-3 space-y-2 bg-purple-500/5">
              <Cap>Pending sign-offs</Cap>
              {exc.slice(0, 2).map((e) => <p key={e.id} className="text-[10px] text-zinc-400 font-mono">{e.id} → controller</p>)}
              <Chip tone="mut">read-only until signed</Chip>
            </div>
          )}
        </div>
      </div>
    </Frame>
  );
};

/* 3. finance-planning-treasury — scenario lab: assumptions sliders + liquidity cards + scenario compare */
export const FinancePlanningTreasury: React.FC<PatternProps> = ({ entry }) => {
  const [growth, setGrowth] = useState(8);
  const [dso, setDso] = useState(45);
  const cash = Math.round(4.1 + growth * 0.18 - (dso - 30) * 0.05);
  const runway = Math.round(11 + growth * 0.3 - (dso - 30) * 0.12);
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5 space-y-4">
          <Cap>Assumptions</Cap>
          {[['Revenue growth %/q', growth, setGrowth, 0, 20], ['DSO days', dso, setDso, 15, 90]].map(([label, val, set, min, max]) => (
            <div key={label as string}>
              <div className="flex justify-between mb-1"><span className="text-[10px] text-zinc-400">{label as string}</span><span className="font-mono text-[10px] text-amber-400">{val as number}</span></div>
              <input type="range" min={min as number} max={max as number} value={val as number} onChange={(e) => (set as (n: number) => void)(Number(e.target.value))} className="w-full accent-amber-500" />
            </div>
          ))}
          <p className="text-[9px] font-mono text-zinc-600">Sensitivity inputs recalculate the scenario cards — deterministic arithmetic only.</p>
        </div>
        <div className="lg:col-span-4 grid grid-cols-2 gap-2">
          <Pane title="Cash position"><p className="font-mono font-black text-xl text-emerald-400">${cash.toFixed(1)}M</p><Cap>as of period end</Cap></Pane>
          <Pane title="Runway"><p className="font-mono font-black text-xl text-cyan-400">{runway} mo</p><Cap>at current burn</Cap></Pane>
          <Pane title="Liquidity floor"><p className="font-mono font-black text-xl text-amber-400">${(cash * 0.6).toFixed(1)}M</p><Cap>committed facilities</Cap></Pane>
          <Pane title="Scenario delta"><p className="font-mono font-black text-xl text-zinc-300">±{(growth * 0.2).toFixed(1)}%</p><Cap>vs base case</Cap></Pane>
        </div>
        <div className="lg:col-span-3">
          <Cap className="mb-1.5">Scenario comparison</Cap>
          <div className="space-y-2">
            {[['Base', '—'], ['Plan A (this)', `${cash.toFixed(1)}M`], ['Stress ΔDSO+20', `${(cash - 1.0).toFixed(1)}M`]].map(([n, v], i) => (
              <div key={n} className={`flex items-center justify-between px-2.5 py-2 rounded-lg border ${i === 1 ? 'border-amber-500/40 bg-amber-500/10' : 'border-zinc-800 bg-[#0a0908]'}`}>
                <span className="text-[10px] text-zinc-300">{n}</span><span className="font-mono text-[10px] text-zinc-400">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
};

/* 4. finance-ap-ar-operations — exception workbench: doc viewer + three-way match matrix + owner queue + adjustment drawer */
export const FinanceApArOperations: React.FC<PatternProps> = ({ entry }) => {
  const [doc, setDoc] = useState('INV-2214');
  const match = [
    { level: 'PO-8812', po: 'ok', gr: 'ok', inv: 'ok' },
    { level: 'PO-8813', po: 'ok', gr: 'missing', inv: 'ok' },
    { level: 'PO-8815', po: 'ok', gr: 'ok', inv: 'Δ 118.00' },
  ];
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-4">
          <Cap className="mb-1.5">Invoice / receipt viewer</Cap>
          <div className="flex gap-1.5 mb-2">
            {['INV-2214', 'RCT-0993', 'PO-8815'].map((d) => (
              <button key={d} onClick={() => setDoc(d)} className={`px-2 py-1 rounded font-mono text-[9px] border cursor-pointer ${doc === d ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-zinc-800 text-zinc-500'}`}>{d}</button>
            ))}
          </div>
          <Pane title={`Document ${doc}`}>
            <pre className="text-[9px] font-mono text-zinc-400 leading-relaxed">{doc.startsWith('INV') ? 'INVOICE\nvendor: Meridian Supply\ntotal: 4,118.00\ncurrency: USD\nterms: net30' : doc.startsWith('RCT') ? 'RECEIPT\nreceived: 2026-08-14\ndock: B-12\ncondition: verified' : 'PURCHASE ORDER\nlines: 14\ncommitted: 12,900.00\napproved: K.Diaz'}</pre>
          </Pane>
        </div>
        <div className="lg:col-span-5">
          <Cap className="mb-1.5">Three-way match matrix</Cap>
          <table className="w-full text-[10px] font-mono">
            <thead><tr className="text-zinc-600">{['', 'PO', 'GR', 'Invoice'].map((h) => <th key={h} className="text-left py-1.5">{h}</th>)}</tr></thead>
            <tbody>
              {match.map((m) => (
                <tr key={m.level} className="border-t border-zinc-800/70">
                  <td className="py-2 text-zinc-500">{m.level}</td>
                  <td className="py-2"><Chip tone="ok">{m.po}</Chip></td>
                  <td className="py-2"><Chip tone={m.gr === 'ok' ? 'ok' : 'bad'}>{m.gr}</Chip></td>
                  <td className="py-2"><Chip tone={m.inv === 'ok' ? 'ok' : 'warn'}>{m.inv}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="lg:col-span-3 space-y-2">
          <Cap>Owner / SLA queue</Cap>
          {[['INV-2214', 'AP · 6h'], ['PO-8813', 'receiving · 1d'], ['PO-8815', 'controller · 4h']].map(([id, owner]) => (
            <div key={id} className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-zinc-800 bg-[#0a0908]">
              <span className="text-[10px] font-mono text-zinc-300">{id}</span><Chip tone="info">{owner}</Chip>
            </div>
          ))}
          <details className="border border-zinc-800 rounded-lg px-2.5 py-2 bg-[#0a0908]">
            <summary className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 cursor-pointer">▸ Unposted adjustments (2)</summary>
            <p className="text-[10px] text-zinc-500 mt-1.5 font-mono">AC-3310 Δ 118.00 — pending controller</p>
          </details>
        </div>
      </div>
    </Frame>
  );
};

/* 5. finance-risk-crime-credit — model-governance console: metadata health + calibration/drift cards + alert evidence + fairness review */
export const FinanceRiskCrimeCredit: React.FC<PatternProps> = ({ entry }) => {
  const [sel, setSel] = useState(0);
  const models = ['credit-scorecard-v4', 'aml-alert-rank-v2', 'fraud-velocity-v1'];
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-3 space-y-1.5">
          <Cap className="mb-1">Registered models</Cap>
          {models.map((m, i) => <Li key={m} active={i === sel} onClick={() => setSel(i)}>{m}</Li>)}
          <Chip tone="mut">no probability without calibration evidence</Chip>
        </div>
        <div className="lg:col-span-5 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Pane title="Metadata health"><div className="space-y-1.5">{['training window: logged', 'feature contract: v4.2', 'population: drift watch'].map((x, i) => <p key={x} className="text-[10px] text-zinc-400 flex justify-between"><span>{x}</span><Chip tone={i === 2 ? 'warn' : 'ok'}>{i === 2 ? 'watch' : 'ok'}</Chip></p>)}</div></Pane>
            <Pane title="Calibration / drift"><div className="space-y-2">{rows(3).map((i) => (
              <div key={i}><div className="h-1.5 rounded bg-zinc-800 overflow-hidden"><div className={`h-full ${i === 1 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${72 + i * 8}%` }} /></div><Cap className="mt-0.5">{['calibration AUC', 'PSI drift', 'hit-rate band'][i]}</Cap></div>
            ))}</div></Pane>
          </div>
          <Pane title="Alert evidence — selected model">
            <p className="text-[10px] text-zinc-400 leading-relaxed">Every ranked alert carries its feature inputs, threshold rule and reviewer disposition. Model output alone never blocks, closes or moves money.</p>
          </Pane>
        </div>
        <div className="lg:col-span-4">
          <Pane title="Fairness / appeal review">
            <div className="space-y-2">
              <p className="text-[10px] text-zinc-400 leading-relaxed">Appeals route to a human reviewer with the full evidence chain and alternative explanations attached.</p>
              <div className="flex gap-1.5"><Chip tone="info">appeal window: 30d</Chip><Chip tone="ok">reviewer assigned</Chip></div>
            </div>
          </Pane>
          <p className="text-[9px] font-mono text-zinc-600 mt-2">{entry.humanApprover}</p>
        </div>
      </div>
    </Frame>
  );
};

/* 6. finance-tax-revenue-compliance — technical-accounting workpaper: authority timeline + rule-to-evidence map + open questions */
export const FinanceTaxRevenueCompliance: React.FC<PatternProps> = ({ entry }) => {
  const [rule, setRule] = useState(0);
  const rules = entry.modules.slice(0, 4);
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <Cap className="mb-2">Authority timeline</Cap>
          <div className="flex items-center min-w-[520px]">
            {['ASC 606 (2014)', 'effective 2018', 'policy memo v3', 'current position'].map((a, i) => (
              <React.Fragment key={a}>
                <div className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-[9px] font-mono ${i === 3 ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-zinc-800 bg-[#0a0908] text-zinc-400'}`}>{a}</div>
                {i < 3 && <div className="flex-1 h-px bg-zinc-700 mx-1" />}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Cap className="mb-1.5">Rules</Cap>
            <div className="space-y-1.5">
              {rules.map((r, i) => <Li key={i} active={i === rule} onClick={() => setRule(i)}>{r}</Li>)}
            </div>
          </div>
          <Pane title="Rule-to-evidence map">
            <div className="space-y-2">
              {[['Contract terms', 'ok'], ['Stand-alone selling price', 'ok'], ['Allocation memo', 'missing']].map(([e, s]) => (
                <div key={e} className="flex items-center justify-between"><span className="text-[10px] text-zinc-400 font-mono">{e}</span><Chip tone={s === 'ok' ? 'ok' : 'bad'}>{s}</Chip></div>
              ))}
            </div>
          </Pane>
        </div>
        <Pane title="Unresolved policy questions">
          <p className="text-[10px] text-zinc-400">Unresolved questions stay open and visible — the workpaper never silently picks a treatment.</p>
        </Pane>
      </div>
    </Frame>
  );
};

/* 7. investment-ma-analytics — data-room cockpit: workstream tabs + thesis board + calc register + missing docs */
export const InvestmentMaAnalytics: React.FC<PatternProps> = ({ entry }) => {
  const [tab, setTab] = useState('Financial');
  const tabs = ['Financial', 'Legal', 'Tax', 'Commercial', 'Tech'];
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 pb-2">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg font-mono text-[10px] border cursor-pointer ${tab === t ? 'border-cyan-500/50 text-cyan-300 bg-cyan-500/10' : 'border-zinc-800 text-zinc-500'}`}>{t}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-7">
            <Cap className="mb-1.5">Thesis evidence board — {tab}</Cap>
            <div className="grid grid-cols-2 gap-2">
              {entry.useCases.slice(0, 4).map((u, i) => (
                <div key={i} className="border border-zinc-800 rounded-lg p-2.5 bg-[#0a0908] text-[10px] text-zinc-300 leading-snug">
                  <Chip tone={i % 2 ? 'ok' : 'info'}>{i % 2 ? 'supported' : 'partial'}</Chip>
                  <p className="mt-1.5">{u}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-5 space-y-3">
            <Pane title="Calculation register">
              <div className="space-y-1.5 font-mono text-[10px]">
                {[['runway_recalc.py', 'verified'], ['ev_bridge.xlsx', 'verified'], ['cohort_v2.ipynb', 'stale']].map(([f, s]) => (
                  <div key={f} className="flex justify-between"><span className="text-zinc-400">{f}</span><Chip tone={s === 'verified' ? 'ok' : 'warn'}>{s}</Chip></div>
                ))}
              </div>
            </Pane>
            <Pane title="Missing-document queue">
              <div className="space-y-1.5 font-mono text-[10px] text-zinc-400">
                <p>· schedule of leases (post-sig)</p><p>· IP assignments — 2 entities</p>
                <Chip tone="warn">blocks: legal workstream sign-off</Chip>
              </div>
            </Pane>
          </div>
        </div>
      </div>
    </Frame>
  );
};

/* 8. pricing-monetization-science — pricing lab: experiment setup + sliders + guardrail chart + approval gate */
export const PricingMonetizationScience: React.FC<PatternProps> = ({ entry }) => {
  const [price, setPrice] = useState(79);
  const [gate, setGate] = useState(false);
  const lift = (((price - 59) / 59) * 100).toFixed(0);
  const withinGuardrail = price <= 99;
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-4 space-y-3">
          <Pane title="Experiment setup">
            <div className="space-y-1.5 font-mono text-[10px] text-zinc-400">
              <p>unit: subscription tier</p><p>audience: 50/50 split</p><p>primary metric: net revenue</p>
            </div>
          </Pane>
          <div>
            <div className="flex justify-between mb-1"><span className="text-[10px] text-zinc-400">Test price</span><span className="font-mono text-[10px] text-amber-400">${price}</span></div>
            <input type="range" min={49} max={129} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-full accent-amber-500" />
          </div>
        </div>
        <div className="lg:col-span-5">
          <Cap className="mb-1.5">Guardrail chart</Cap>
          <div className="relative h-36 border border-zinc-800 rounded-xl bg-[#0a0908] p-3">
            <div className="absolute inset-x-3 top-1/2 border-t border-dashed border-rose-500/50" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[8px] text-rose-400/80 -mt-3">guardrail: churn +2%</span>
            <div className="flex items-end gap-2 h-full">
              {[42, 58, 71, 66, 80, 74].map((h, i) => (
                <div key={i} className={`flex-1 rounded-t ${i === 4 ? 'bg-amber-500' : 'bg-zinc-700'}`} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <Chip tone="ok">rev lift ≈ +{lift}%</Chip>
            <Chip tone={withinGuardrail ? 'ok' : 'bad'}>{withinGuardrail ? 'within guardrails' : 'guardrail breach'}</Chip>
          </div>
        </div>
        <div className="lg:col-span-3">
          <Pane title="Approval gate">
            <p className="text-[10px] text-zinc-400 leading-relaxed">Price changes require the pricing owner and Finance before any launch.</p>
            <button onClick={() => setGate(!gate)} className={`mt-2.5 w-full px-3 py-2 rounded-lg font-mono font-black uppercase text-[9px] border-2 cursor-pointer ${gate ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-zinc-700 text-zinc-500'}`}>
              {gate ? '✓ approved (illustrative)' : 'request approval'}
            </button>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 9. healthcare-revenue-cycle — de-identified RCM review board: claim evidence + payer comparison + qualified-review gate */
export const HealthcareRevenueCycle: React.FC<PatternProps> = ({ entry }) => {
  const [sel, setSel] = useState(0);
  const claims = entry.modules.slice(0, 4);
  const [gate, setGate] = useState(false);
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5 space-y-1.5">
          <Cap className="mb-1">De-identified claim queue</Cap>
          {claims.map((c, i) => (
            <Li key={i} active={i === sel} onClick={() => setSel(i)}>
              <span className="font-mono text-zinc-500 mr-1.5">CLM-{2200 + i * 13}</span>{c}
            </Li>
          ))}
          <Chip tone="mut">PHI stripped at intake</Chip>
        </div>
        <div className="lg:col-span-4 space-y-2">
          <Pane title="Payer policy comparison">
            <div className="space-y-1.5 text-[10px] font-mono">
              {[['Payer A', 'wound care: covered w/ auth'], ['Payer B', 'wound care: medical-necessity doc'], ['Medicare LCD', 'ref: L34567']].map(([p, r]) => (
                <div key={p} className="flex justify-between gap-2"><span className="text-zinc-500 shrink-0">{p}</span><span className="text-zinc-300 text-right">{r}</span></div>
              ))}
            </div>
          </Pane>
          <Pane title="Document evidence">
            <p className="text-[10px] text-zinc-400 font-mono">claim form · auth letter · encounter note — all linked by stable ID</p>
          </Pane>
        </div>
        <div className="lg:col-span-3">
          <Pane title="Qualified-review gate">
            <p className="text-[10px] text-zinc-400 leading-relaxed">Coding and coverage determinations require a qualified reviewer.</p>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={gate} onChange={() => setGate(!gate)} className="accent-emerald-500" />
              <span className="text-[10px] text-zinc-300">reviewer attestation recorded</span>
            </label>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 10. clinical-patient-decision-support — clinician evidence desk: question header + source comparison + uncertainty + sign-off */
export const ClinicalPatientDecisionSupport: React.FC<PatternProps> = ({ entry }) => {
  const [signed, setSigned] = useState(false);
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="space-y-3">
        <div className="border border-cyan-500/30 bg-cyan-500/5 rounded-xl px-4 py-3">
          <Cap>clinical question</Cap>
          <p className="text-sm text-zinc-200 mt-1">For the referenced population, what does the supplied evidence set support — and what remains uncertain?</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Pane title="Source A — guideline">
            <p className="text-[10px] text-zinc-400 leading-relaxed">Recommends intervention class X for the defined cohort; strength: moderate.</p>
          </Pane>
          <Pane title="Source B — cohort study">
            <p className="text-[10px] text-zinc-400 leading-relaxed">Reports outcome distribution with wide confidence intervals for sub-population.</p>
          </Pane>
          <Pane title="Uncertainty panel">
            <div className="space-y-1.5">
              <Chip tone="warn">conflicting strength</Chip>
              <p className="text-[10px] text-zinc-400 leading-relaxed">Divergence is displayed, never averaged away.</p>
            </div>
          </Pane>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border border-zinc-800 rounded-xl px-4 py-3 bg-[#0a0908]">
          <p className="text-[10px] text-zinc-500">Clinical decisions rest with the licensed clinician — this desk only organizes evidence.</p>
          <button onClick={() => setSigned(!signed)} className={`px-4 py-2 rounded-lg font-mono font-black uppercase text-[9px] border-2 cursor-pointer ${signed ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-zinc-700 text-zinc-400'}`}>
            {signed ? '✓ clinician sign-off recorded' : 'clinician sign-off'}
          </button>
        </div>
      </div>
    </Frame>
  );
};

/* 11. clinical-trials-life-sciences — trial ops timeline + protocol/registry tabs + DQ alerts + TMF gaps + stat review */
export const ClinicalTrialsLifeSciences: React.FC<PatternProps> = ({ entry }) => {
  const [tab, setTab] = useState<'protocol' | 'registry'>('protocol');
  const phases = ['Screening', 'Enrollment', 'Treatment', 'Follow-up', 'Analysis'];
  const [active, setActive] = useState(2);
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {(['protocol', 'registry'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg font-mono text-[10px] border cursor-pointer ${tab === t ? 'border-cyan-500/50 text-cyan-300 bg-cyan-500/10' : 'border-zinc-800 text-zinc-500'}`}>{t} view</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {phases.map((p, i) => (
            <React.Fragment key={p}>
              <button onClick={() => setActive(i)} className={`px-2.5 py-1.5 rounded-lg text-[9px] font-mono border cursor-pointer ${i === active ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-zinc-800 text-zinc-500'}`}>{p}</button>
              {i < phases.length - 1 && <div className="flex-1 h-px bg-zinc-700" />}
            </React.Fragment>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Pane title="Data-quality alerts">
            <div className="space-y-1.5 font-mono text-[10px] text-zinc-400">
              <p>· 3 sites: missing AE follow-up</p><p>· lab units: 2 mismatches</p>
            </div>
          </Pane>
          <Pane title="TMF gaps">
            <div className="space-y-1.5 font-mono text-[10px] text-zinc-400">
              <p>· IRB renewal — site 12</p><p>· delegation log v4</p>
            </div>
          </Pane>
          <Pane title="Statistical-review queue">
            <div className="space-y-1.5">
              <Chip tone="info">SAP amendment — biostat</Chip>
              <Chip tone="mut">unblinding request — gated</Chip>
            </div>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};
