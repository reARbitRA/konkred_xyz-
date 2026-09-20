/**
 * Suite interface previews 12–21.
 * Distinct interactive layouts driven by manifest data; illustrative and
 * labelled as such.
 */
import React, { useState } from 'react';
import { Frame, Pane, Cap, Chip, Li, type PatternProps } from './kit.tsx';

/* 12. healthcare-operations-compliance — control map + evidence period filter + data-minimization panel + owner queue */
export const HealthcareOperationsCompliance: React.FC<PatternProps> = ({ entry }) => {
  const [period, setPeriod] = useState('2026-H1');
  const [sel, setSel] = useState<string | null>(null);
  const controls = entry.modules.slice(0, 6);
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-3">
          <Cap className="mb-1.5">Evidence period</Cap>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full bg-[#0a0908] border-2 border-black rounded-lg p-2 font-mono text-[10px] text-emerald-300 cursor-pointer">
            {['2026-H1', '2025-H2', '2025-H1'].map((p) => <option key={p}>{p}</option>)}
          </select>
          <Cap className="mt-4 mb-1.5">Owner queue</Cap>
          <div className="space-y-1.5">
            {[['privacy officer', 2], ['security lead', 1], ['compliance mgr', 4]].map(([o, n]) => (
              <div key={o as string} className="flex justify-between px-2.5 py-2 rounded-lg border border-zinc-800 bg-[#0a0908]">
                <span className="text-[10px] text-zinc-400">{o}</span><Chip tone="info">{n} open</Chip>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-6">
          <Cap className="mb-1.5">Control map — {period}</Cap>
          <div className="grid grid-cols-2 gap-2">
            {controls.map((c, i) => (
              <button key={i} onClick={() => setSel(c)} className={`text-left border rounded-lg p-2.5 bg-[#0a0908] cursor-pointer transition-colors ${sel === c ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-zinc-800'}`}>
                <Chip tone={i % 3 === 1 ? 'warn' : 'ok'}>{i % 3 === 1 ? 'evidence gap' : 'evidence linked'}</Chip>
                <p className="text-[10px] text-zinc-300 mt-1.5 leading-snug">{c}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="lg:col-span-3">
          <Pane title="Access & data minimization">
            <div className="space-y-2 text-[10px] text-zinc-400 font-mono">
              <p>fields pulled: 6 / 41 available</p>
              <p>PHI filter: on</p>
              <Chip tone="ok">minimum-necessary checked</Chip>
            </div>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 13. fraud-identity-financial-crime — case board: evidence graph + alternative explanations + appeal panel + handoff */
export const FraudIdentityFinancialCrime: React.FC<PatternProps> = ({ entry }) => {
  const [node, setNode] = useState('device');
  const nodes = [
    { id: 'account', x: 50, y: 18 }, { id: 'device', x: 18, y: 55 }, { id: 'payment', x: 82, y: 55 }, { id: 'identity', x: 50, y: 90 },
  ];
  const edges = [['device', 'account'], ['payment', 'account'], ['account', 'identity']];
  const pos = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5">
          <Cap className="mb-1.5">Evidence graph — case FC-1187</Cap>
          <svg viewBox="0 0 100 108" className="w-full h-52 border border-zinc-800 rounded-xl bg-[#0a0908]">
            {edges.map(([a, b]) => (
              <line key={`${a}-${b}`} x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y} stroke="#5c5852" strokeWidth="0.7" />
            ))}
            {nodes.map((n) => (
              <g key={n.id} onClick={() => setNode(n.id)} className="cursor-pointer">
                <circle cx={n.x} cy={n.y} r="6.5" fill={node === n.id ? '#d60019' : '#171514'} stroke={node === n.id ? '#d60019' : '#3d3835'} strokeWidth="0.8" />
                <text x={n.x} y={n.y + 2.4} textAnchor="middle" fontSize="4" fill={node === n.id ? '#0a0908' : '#8a857d'}>{n.id.slice(0, 3).toUpperCase()}</text>
                <text x={n.x} y={n.y + 11} textAnchor="middle" fontSize="3.4" fill="#7a756d">{n.id}</text>
              </g>
            ))}
          </svg>
        </div>
        <div className="lg:col-span-4 space-y-2">
          <Pane title={`Node evidence — ${node}`}>
            <p className="text-[10px] text-zinc-400 leading-relaxed font-mono">linked alerts: 3 · first seen: 2026-07-30 · reviewer notes attached</p>
          </Pane>
          <Pane title="Alternative explanations">
            <ul className="space-y-1.5 text-[10px] text-zinc-400">
              <li>· shared corporate VPN</li><li>· household device reuse</li><li>· legitimate high-velocity merchant</li>
            </ul>
          </Pane>
        </div>
        <div className="lg:col-span-3 space-y-2">
          <Pane title="Appeal / fairness">
            <Chip tone="info">appeal path: open</Chip>
            <p className="text-[10px] text-zinc-500 mt-1.5">Customer outcome decided by a human reviewer, never by the model.</p>
          </Pane>
          <Pane title="Investigator handoff">
            <p className="text-[10px] text-zinc-400">case pack: evidence + alternatives + policy refs</p>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 14. security-access-data-integrity — findings console: code viewer + severity filters + control mapping + verification drawer */
export const SecurityAccessDataIntegrity: React.FC<PatternProps> = ({ entry }) => {
  const [sev, setSev] = useState<'all' | 'high' | 'medium'>('all');
  const [open, setOpen] = useState(false);
  const findings = [
    { id: 'F-01', sev: 'high', where: 'main.tf:14', note: 'public egress rule' },
    { id: 'F-02', sev: 'medium', where: 'iam_policy.json:8', note: 'wildcard action' },
    { id: 'F-03', sev: 'high', where: 'plan output', note: 'unencrypted store' },
    { id: 'F-04', sev: 'medium', where: 'main.tf:41', note: 'hardcoded port range' },
  ];
  const shown = findings.filter((f) => sev === 'all' || f.sev === sev);
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-6">
          <Cap className="mb-1.5">Code / plan viewer</Cap>
          <pre className="border border-zinc-800 rounded-xl bg-[#0a0908] p-3 text-[9px] font-mono leading-relaxed text-zinc-400 overflow-x-auto">
{`resource "aws_security_group" "app" {
  ingress {
    from_port   = 0        # ← F-01
    to_port     = 65535
    cidr_blocks = ["0.0.0.0/0"]
  }
}`}
          </pre>
        </div>
        <div className="lg:col-span-6">
          <div className="flex gap-1.5 mb-2">
            {(['all', 'high', 'medium'] as const).map((s) => (
              <button key={s} onClick={() => setSev(s)} className={`px-2.5 py-1 rounded font-mono text-[9px] border cursor-pointer ${sev === s ? 'border-rose-500/50 text-rose-300 bg-rose-500/10' : 'border-zinc-800 text-zinc-500'}`}>{s}</button>
            ))}
          </div>
          <table className="w-full text-[10px] font-mono">
            <tbody>
              {shown.map((f) => (
                <tr key={f.id} className="border-b border-zinc-800/70">
                  <td className="py-1.5 pr-2"><Chip tone={f.sev === 'high' ? 'bad' : 'warn'}>{f.sev}</Chip></td>
                  <td className="py-1.5 pr-2 text-zinc-300">{f.where}</td>
                  <td className="py-1.5 text-zinc-500">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex gap-1.5 items-center">
            <Chip tone="mut">mapped: CIS 4.1, SOC6.3</Chip>
            <button onClick={() => setOpen(!open)} className="font-mono text-[9px] text-cyan-400 underline decoration-cyan-500/40 cursor-pointer">{open ? 'hide' : 'read-only verification'}</button>
          </div>
          {open && (
            <p className="mt-1.5 text-[10px] text-zinc-500 font-mono border border-zinc-800 rounded-lg p-2 bg-[#0a0908]">
              verification runs in a read-only sandbox: no state files, credentials or live systems are touched.
            </p>
          )}
        </div>
      </div>
    </Frame>
  );
};

/* 15. legal-contract-transaction — review studio: synchronized source viewer + clause highlights + playbook comparison + escalation rail */
export const LegalContractTransaction: React.FC<PatternProps> = ({ entry }) => {
  const [clause, setClause] = useState(1);
  const clauses = [
    { n: 1, label: 'limitation of liability', quote: '…aggregate liability shall not exceed fees paid…' },
    { n: 2, label: 'indemnification', quote: '…indemnify and hold harmless against third-party claims…' },
    { n: 3, label: 'termination', quote: '…either party may terminate for convenience with 90 days notice…' },
  ];
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7">
          <Cap className="mb-1.5">Source document (synchronized)</Cap>
          <div className="border border-zinc-800 rounded-xl bg-[#0a0908] p-4 space-y-3 max-h-60 overflow-y-auto">
            {clauses.map((c) => (
              <p key={c.n} onClick={() => setClause(c.n)} className={`text-[11px] font-mono leading-relaxed cursor-pointer rounded p-2 transition-colors ${clause === c.n ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40' : 'text-zinc-500 border border-transparent hover:text-zinc-300'}`}>
                §{c.n}. {c.quote}
              </p>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5 space-y-2">
          <Pane title={`Playbook comparison — §${clause} ${clauses[clause - 1].label}`}>
            <div className="space-y-1.5 text-[10px] font-mono">
              <div className="flex justify-between"><span className="text-zinc-500">playbook</span><span className="text-zinc-300">cap = 12mo fees</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">document</span><span className="text-zinc-300">cap = fees paid</span></div>
              <Chip tone="warn">deviation flagged</Chip>
            </div>
          </Pane>
          <Pane title="Counsel escalation rail">
            <div className="space-y-1.5 text-[10px] text-zinc-400 font-mono">
              <p>· §1 cap below playbook floor → counsel</p>
              <p>· §3 90-day convenience → business sign-off</p>
            </div>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 16. legal-regulatory-privacy-ai — authority map: jurisdiction timeline + obligation graph + fact gaps + counsel queue */
export const LegalRegulatoryPrivacyAi: React.FC<PatternProps> = ({ entry }) => {
  const [jur, setJur] = useState('EU');
  const obligations = ['lawful basis register', 'DPIA trigger', 'AI risk classification', 'transparency notice', 'retention schedule'];
  const [sel, setSel] = useState<string | null>(null);
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {['EU', 'US-CA', 'US-CO', 'BR', 'UK'].map((j) => (
            <button key={j} onClick={() => setJur(j)} className={`px-2.5 py-1 rounded font-mono text-[10px] border cursor-pointer ${jur === j ? 'border-cyan-500/50 text-cyan-300 bg-cyan-500/10' : 'border-zinc-800 text-zinc-500'}`}>{j}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-7">
            <Cap className="mb-1.5">Obligation graph — {jur}</Cap>
            <div className="flex flex-wrap gap-2">
              {obligations.map((o, i) => (
                <button key={o} onClick={() => setSel(o)} className={`px-3 py-2 rounded-xl border text-[10px] font-mono cursor-pointer ${sel === o ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200' : i % 2 ? 'border-zinc-800 text-zinc-400 bg-[#0a0908]' : 'border-zinc-700 text-zinc-300 bg-[#171514]'}`}>
                  {o}
                  {i % 2 === 0 && <span className="block text-[8px] text-zinc-600 mt-0.5">effective 2026-01</span>}
                  {i % 2 === 1 && <span className="block text-[8px] text-amber-500/70 mt-0.5">org-fact gap</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="lg:col-span-5 space-y-2">
            <Pane title="Organization-fact gaps">
              <div className="space-y-1.5 text-[10px] text-zinc-400 font-mono">
                <p>· processing purposes: partial</p><p>· international transfers: unrecorded</p>
              </div>
            </Pane>
            <Pane title="Counsel queue">
              <Chip tone="info">2 obligations awaiting counsel confirmation</Chip>
            </Pane>
          </div>
        </div>
      </div>
    </Frame>
  );
};

/* 17. hr-hiring-privacy-onboarding — process-governance board: criteria + consent/retention + fairness + decision record */
export const HrHiringPrivacyOnboarding: React.FC<PatternProps> = ({ entry }) => {
  const [checked, setChecked] = useState<boolean[]>([true, false, false]);
  const criteria = ['job-related: coding exercise', 'job-related: system design', 'structured interview notes'];
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Pane title="Job-related criteria">
          <div className="space-y-2">
            {criteria.map((c, i) => (
              <label key={c} className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={checked[i]} onChange={() => setChecked((x) => x.map((v, j) => (j === i ? !v : v)))} className="mt-0.5 accent-amber-500" />
                <span className="text-[10px] text-zinc-300 leading-snug">{c}</span>
              </label>
            ))}
          </div>
        </Pane>
        <Pane title="Consent & retention">
          <div className="space-y-1.5">
            {[['candidate notice', 'ok'], ['retention clock', 'ok'], ['withdrawal path', 'warn']].map(([k, s]) => (
              <div key={k} className="flex justify-between"><span className="text-[10px] text-zinc-400">{k}</span><Chip tone={s === 'ok' ? 'ok' : 'warn'}>{s === 'ok' ? 'recorded' : 'define'}</Chip></div>
            ))}
          </div>
        </Pane>
        <Pane title="Fairness review">
          <p className="text-[10px] text-zinc-400 leading-relaxed">Screens for job-relatedness; flags proxies and unsupported inferences for human review.</p>
        </Pane>
        <Pane title="Human decision record">
          <div className="space-y-1.5 font-mono text-[10px] text-zinc-400">
            <p>decision: hiring manager</p><p>tool role: evidence summary</p>
            <Chip tone="mut">no auto-reject</Chip>
          </div>
        </Pane>
      </div>
    </Frame>
  );
};

/* 18. communications-control — message approval studio: fact ledger + draft canvas + channel preview + distribution gate */
export const CommunicationsControl: React.FC<PatternProps> = ({ entry }) => {
  const [draft, setDraft] = useState('Service degradation on the EU region began 09:12 UTC. Mitigation is in progress; next update at 10:00 UTC.');
  const [channel, setChannel] = useState<'email' | 'sms' | 'status page'>('email');
  const [sent, setSent] = useState(false);
  const facts = ['09:12 UTC incident detected', 'root cause: under investigation', 'next update: 10:00 UTC'];
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-3">
          <Cap className="mb-1.5">Fact ledger</Cap>
          <div className="space-y-1.5">
            {facts.map((f) => (
              <div key={f} className="px-2.5 py-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 text-[10px] text-zinc-300 font-mono">✓ {f}</div>
            ))}
            <Chip tone="warn">1 claim lacks a ledger entry</Chip>
          </div>
        </div>
        <div className="lg:col-span-5">
          <Cap className="mb-1.5">Draft canvas</Cap>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} className="w-full bg-[#0a0908] border-2 border-black rounded-xl p-3 text-[11px] font-mono text-zinc-200 resize-none focus:outline-none focus:border-amber-500" />
          <p className="text-[9px] font-mono text-zinc-600 mt-1">unverifiable statements stay highlighted until a fact is attached</p>
        </div>
        <div className="lg:col-span-4 space-y-2">
          <Pane title="Channel / accessibility preview">
            <div className="flex gap-1.5 mb-2">
              {(['email', 'sms', 'status page'] as const).map((c) => (
                <button key={c} onClick={() => setChannel(c)} className={`px-2 py-1 rounded font-mono text-[9px] border cursor-pointer ${channel === c ? 'border-cyan-500/50 text-cyan-300' : 'border-zinc-800 text-zinc-500'}`}>{c}</button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-400 font-mono leading-relaxed">{channel === 'sms' ? `${draft.length} chars · ${Math.ceil(draft.length / 160)} segment(s)` : channel === 'email' ? 'plain-text alternative attached · screen-reader checked' : 'status-page template · incident badge'}</p>
          </Pane>
          <Pane title="Distribution gate">
            <button onClick={() => setSent(!sent)} className={`w-full px-3 py-2 rounded-lg font-mono font-black uppercase text-[9px] border-2 cursor-pointer ${sent ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-zinc-700 text-zinc-400'}`}>
              {sent ? '✓ approved — queued for send (human)' : 'request comms-owner approval'}
            </button>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 19. marketing-sales-evidence — claims/RFP/research workbench: claims registry + requirement matrix + canvas + consent gate */
export const MarketingSalesEvidence: React.FC<PatternProps> = ({ entry }) => {
  const [tab, setTab] = useState<'claims' | 'matrix'>('claims');
  const claims = [
    { c: '"fastest onboarding in category"', s: 'unsupported' },
    { c: '"SOC 2 Type II report available"', s: 'evidenced' },
    { c: '"used by 40+ teams"', s: 'needs source' },
  ];
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {(['claims', 'matrix'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg font-mono text-[10px] border cursor-pointer ${tab === t ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-zinc-800 text-zinc-500'}`}>{t === 'claims' ? 'claims registry' : 'requirement matrix'}</button>
          ))}
        </div>
        {tab === 'claims' ? (
          <table className="w-full text-[10px] font-mono">
            <tbody>
              {claims.map((c) => (
                <tr key={c.c} className="border-b border-zinc-800/70">
                  <td className="py-2 pr-3 text-zinc-300">{c.c}</td>
                  <td className="py-2"><Chip tone={c.s === 'evidenced' ? 'ok' : c.s === 'unsupported' ? 'bad' : 'warn'}>{c.s}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {['security questionnaire', 'RFP section 4', 'diligence call'].map((r) => (
              <div key={r} className="border border-zinc-800 rounded-lg p-2.5 bg-[#0a0908]">
                <Cap>{r}</Cap>
                <div className="mt-2 space-y-1">{rows3().map((i) => (
                  <div key={i} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-zinc-700" /><span className="h-1 flex-1 rounded bg-zinc-800" /></div>
                ))}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="mut">content canvas: evidence-first drafts only</Chip>
          <Chip tone="info">consent gate: outreach requires recorded consent</Chip>
        </div>
      </div>
    </Frame>
  );
};
const rows3 = () => [0, 1, 2, 3];

/* 20. operations-procurement — planning cockpit: solicitation explorer + supplier scorecard + dependency map + scenario board */
export const OperationsProcurement: React.FC<PatternProps> = ({ entry }) => {
  const [open, setOpen] = useState(0);
  const solicitations = ['RFP — cloud migration services', 'RFQ — packaging materials', ' Tender — logistics 3PL'];
  const suppliers = [
    { n: 'Alpha Fabrication', otd: 94, qual: 88 }, { n: 'Beta Logistics', otd: 81, qual: 92 }, { n: 'Gamma Supply', otd: 97, qual: 76 },
  ];
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-4">
          <Cap className="mb-1.5">Solicitation explorer</Cap>
          <div className="space-y-1.5">
            {solicitations.map((s, i) => (
              <button key={s} onClick={() => setOpen(i)} className={`w-full text-left px-2.5 py-2 rounded-lg border text-[10px] cursor-pointer ${open === i ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-zinc-800 bg-[#0a0908] text-zinc-400'}`}>
                {s}
                <span className="block text-[8px] text-zinc-600 mt-0.5">{open === i ? 'closes 2026-09-12 · 14 requirements' : 'closes 2026-09-30'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="lg:col-span-4">
          <Cap className="mb-1.5">Supplier scorecard</Cap>
          <div className="space-y-2.5">
            {suppliers.map((s) => (
              <div key={s.n}>
                <div className="flex justify-between text-[10px]"><span className="text-zinc-300">{s.n}</span><span className="font-mono text-zinc-500">OTD {s.otd}% · Q {s.qual}%</span></div>
                <div className="h-1.5 rounded bg-zinc-800 overflow-hidden mt-1"><div className="h-full bg-cyan-500" style={{ width: `${(s.otd + s.qual) / 2}%` }} /></div>
              </div>
            ))}
          </div>
          <Chip tone="mut" >no supplier award without procurement owner</Chip>
        </div>
        <div className="lg:col-span-4 space-y-2">
          <Pane title="Dependency map">
            <p className="text-[10px] text-zinc-400 font-mono leading-relaxed">cloud migration → packaging redesign → logistics award (critical path: 2 dependencies)</p>
          </Pane>
          <Pane title="Scenario board">
            <div className="space-y-1.5">
              {[['single-source', 'risk: concentration'], ['dual-source', 'risk: complexity']].map(([s, r]) => (
                <div key={s} className="flex justify-between text-[10px]"><span className="text-zinc-300">{s}</span><span className="text-zinc-500 font-mono">{r}</span></div>
              ))}
            </div>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 21. mixed-quick-win-workflows — controlled module selector: module authority + action boundary + validator status + owner approval */
export const MixedQuickWinWorkflows: React.FC<PatternProps> = ({ entry }) => {
  const [mod, setMod] = useState(entry.modules[0] ?? '');
  return (
    <Frame slug={entry.slug} kind="suite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5 space-y-1.5">
          <Cap className="mb-1">Module selector — one module at a time</Cap>
          {entry.modules.slice(0, 5).map((m) => (
            <Li key={m} active={mod === m} onClick={() => setMod(m)}>{m}</Li>
          ))}
        </div>
        <div className="lg:col-span-4 space-y-2">
          <Pane title="Module authority">
            <p className="text-[10px] text-zinc-400 leading-relaxed">{mod ? `Selected module runs against its own explicit source authority and versioned policy only.` : 'Select a module to see its authority.'}</p>
            <Chip tone="info">scope locked per module</Chip>
          </Pane>
          <Pane title="Shared action boundary">
            <p className="text-[10px] text-zinc-400 leading-relaxed">All modules share one rule: outputs are drafts. No module sends, posts, deploys, signs or moves funds.</p>
          </Pane>
        </div>
        <div className="lg:col-span-3 space-y-2">
          <Pane title="Validator status">
            <div className="space-y-1.5">
              <div className="flex justify-between"><span className="text-[10px] text-zinc-400">schema</span><Chip tone="ok">PASS</Chip></div>
              <div className="flex justify-between"><span className="text-[10px] text-zinc-400">provenance</span><Chip tone="ok">PASS</Chip></div>
              <div className="flex justify-between"><span className="text-[10px] text-zinc-400">safety</span><Chip tone="ok">PASS</Chip></div>
            </div>
          </Pane>
          <Pane title="Owner approval">
            <Chip tone="mut">awaiting named owner</Chip>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};
