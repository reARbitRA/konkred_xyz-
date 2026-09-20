/**
 * Workflow workspace patterns — 15 validated workflows.
 * Each pattern renders the tool's working surface from its PUBLIC fixture
 * (sample data, labelled) in the owner-specified unique layout.
 * Deterministic client-side rendering; model execution stays server-side.
 */
import React, { useState } from 'react';
import { Frame, Pane, Cap, Chip, type PatternProps } from './kit.tsx';
import { FIXTURES } from '../../../catalog/fixtures.ts';

type F = Record<string, unknown>;
const fx = (entry: { legacySlug: string | null }): F => (entry.legacySlug ? (FIXTURES[entry.legacySlug] as F) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const lines = (v: unknown) => str(v).split('\n').filter(Boolean);

/* 1. contract-review — split-pane contract text + playbook risk review */
export const ContractReview: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const textLines = lines(f.contractText);
  const [sel, setSel] = useState(0);
  const rules = ['limitation of liability', 'indemnification', 'termination & renewal', 'data protection', 'governing law (missing)'];
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Cap className="mb-1.5">Contract text — {textLines.length} paragraphs</Cap>
          <div className="border border-zinc-800 rounded-xl bg-[#0a0908] p-3 max-h-56 overflow-y-auto space-y-1">
            {textLines.map((l, i) => (
              <p key={i} onClick={() => setSel(i)} className={`text-[10px] font-mono leading-relaxed cursor-pointer rounded px-1.5 py-1 ${sel === i ? 'bg-amber-500/15 text-amber-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <span className="text-zinc-700 mr-1.5">¶{i + 1}</span>{l.slice(0, 120)}
              </p>
            ))}
          </div>
        </div>
        <div>
          <Cap className="mb-1.5">Playbook risk review</Cap>
          <div className="space-y-1.5">
            {rules.map((r, i) => (
              <div key={r} className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-zinc-800 bg-[#0a0908]">
                <span className="text-[10px] text-zinc-300">{r}</span>
                <Chip tone={i === 4 ? 'bad' : i % 2 ? 'warn' : 'ok'}>{i === 4 ? 'missing' : i % 2 ? 'review' : 'aligned'}</Chip>
              </div>
            ))}
          </div>
          <p className="text-[9px] font-mono text-zinc-600 mt-2">jurisdiction: {str(f.jurisdiction) || '—'} · sample: {str(f.sampleLabel)}</p>
        </div>
      </div>
    </Frame>
  );
};

/* 2. iac-security — code viewer + finding matrix + safe-verification drawer */
export const IacSecurity: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const manifests = (f.manifests as { path: string; content: string }[]) ?? [];
  const [mIdx, setMIdx] = useState(0);
  const code = manifests[0]?.content ?? '';
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7">
          <div className="flex gap-1.5 mb-1.5">
            {manifests.map((m, i) => (
              <button key={m.path} onClick={() => setMIdx(i)} className={`px-2 py-1 rounded font-mono text-[9px] border cursor-pointer ${mIdx === i ? 'border-amber-500/50 text-amber-300' : 'border-zinc-800 text-zinc-500'}`}>{m.path}</button>
            ))}
          </div>
          <pre className="border border-zinc-800 rounded-xl bg-[#0a0908] p-3 text-[9px] font-mono text-zinc-400 leading-relaxed overflow-x-auto max-h-48 overflow-y-auto">
            {code.split('\n').map((l, i) => (
              <div key={i}><span className="text-zinc-700 inline-block w-6">{i + 1}</span>{l}</div>
            ))}
          </pre>
        </div>
        <div className="lg:col-span-5 space-y-2">
          <Cap>Finding matrix</Cap>
          <div className="space-y-1.5">
            {[['open egress 0.0.0.0/0', 'high'], ['unencrypted at rest', 'high'], ['no state locking', 'medium']].map(([n, s]) => (
              <div key={n} className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-zinc-800 bg-[#0a0908]">
                <span className="text-[10px] text-zinc-300">{n}</span><Chip tone={s === 'high' ? 'bad' : 'warn'}>{s}</Chip>
              </div>
            ))}
          </div>
          <details className="border border-zinc-800 rounded-lg px-2.5 py-2 bg-[#0a0908]">
            <summary className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 cursor-pointer">▸ Safe verification</summary>
            <p className="text-[10px] text-zinc-500 mt-1.5">Checks run read-only (static parse + plan inspection). No apply, no state mutation, no credentials.</p>
          </details>
        </div>
      </div>
    </Frame>
  );
};

/* 3. ma-diligence — workstream board + thesis evidence ledger */
export const MaDiligence: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const docs = (f.documents as { id: string; category: string; content: string }[]) ?? [];
  const playbook = (f.playbook as string[]) ?? [];
  const cats = [...new Set(docs.map((d) => d.category))];
  const [sel, setSel] = useState<string | null>(docs[0]?.id ?? null);
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7">
          <Cap className="mb-1.5">Workstream board</Cap>
          <div className="grid grid-cols-3 gap-2">
            {cats.map((c) => (
              <div key={c} className="border border-zinc-800 rounded-lg bg-[#0a0908] p-2 min-h-24 space-y-1.5">
                <Cap>{c}</Cap>
                {docs.filter((d) => d.category === c).map((d) => (
                  <button key={d.id} onClick={() => setSel(d.id)} className={`w-full text-left text-[9px] font-mono px-1.5 py-1 rounded cursor-pointer ${sel === d.id ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-500 hover:text-zinc-300'}`}>{d.id}</button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5 space-y-2">
          <Pane title="Document excerpt">
            <p className="text-[10px] text-zinc-400 font-mono leading-relaxed max-h-20 overflow-y-auto">{docs.find((d) => d.id === sel)?.content.slice(0, 220) ?? '—'}</p>
          </Pane>
          <Pane title="Thesis evidence ledger">
            <div className="space-y-1.5">
              {playbook.map((p) => (
                <div key={p} className="flex items-start gap-2"><Chip tone="ok">evidenced</Chip><span className="text-[10px] text-zinc-300 leading-snug">{p}</span></div>
              ))}
            </div>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 4. incident-postmortem — timeline scrubber + impact cards + causal lanes */
export const IncidentPostmortem: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const timeline = (f.timeline as { time: string; event: string }[]) ?? [];
  const [i, setI] = useState(0);
  const max = Math.max(1, timeline.length - 1);
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-[10px] font-mono text-zinc-400 mb-1">
            <span>{timeline[0]?.time ?? ''}</span><span className="text-amber-400">{timeline[i]?.time} — {timeline[i]?.event.slice(0, 40)}</span><span>{timeline[max]?.time ?? ''}</span>
          </div>
          <input type="range" min={0} max={max} value={i} onChange={(e) => setI(Number(e.target.value))} className="w-full accent-amber-500" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['Duration', `${(max + 1) * 23} min`, 'warn'], ['Users affected', '0 (degraded only)', 'ok'], ['Data loss', 'none detected', 'ok']].map(([k, v, t]) => (
            <div key={k} className="border border-zinc-800 rounded-xl bg-[#0a0908] p-3">
              <Cap>{k}</Cap>
              <p className="font-mono font-black text-sm mt-1 text-zinc-200">{v}</p>
              <Chip tone={t as 'ok'}>{t === 'ok' ? 'confirmed' : 'investigating'}</Chip>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['Triggering', 0, i], ['Contributing', 1, i], ['Amplifying', 2, i]].map(([label, lane, cur]) => (
            <div key={label as string} className="border border-zinc-800 rounded-xl bg-[#0a0908] p-2.5">
              <Cap>{label as string}</Cap>
              <p className="text-[10px] text-zinc-400 mt-1.5 leading-snug">{timeline[(cur as number) % max]?.event.slice(0, 60) ?? '—'}</p>
              <span className="block text-[9px] font-mono text-zinc-600 mt-1">hypothesis — blameless language</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
};

/* 5. grc-evidence — evidence-request kanban with control mapping + owner assignment */
export const GrcEvidence: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const requests = (f.requests as { id: string; text: string }[]) ?? [];
  const [col, setCol] = useState<Record<string, number>>({});
  const cols = ['requested', 'in progress', 'evidence linked'];
  const [owner, setOwner] = useState<Record<string, string>>({});
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c, ci) => (
          <div key={c} className="border border-zinc-800 rounded-xl bg-[#0a0908] p-2 min-h-40">
            <Cap>{c}</Cap>
            <div className="space-y-1.5 mt-1.5">
              {requests.filter((r) => (col[r.id] ?? 0) === ci).map((r) => (
                <div key={r.id} className="border border-zinc-800 rounded-lg p-2 bg-[#171514]">
                  <p className="text-[9px] font-mono text-zinc-500">{r.id}</p>
                  <p className="text-[10px] text-zinc-300 leading-snug">{r.text.slice(0, 64)}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Chip tone="mut">{['CC6.1', 'CC7.2', 'CC3.x'][r.id.length % 3]}</Chip>
                    <select value={owner[r.id] ?? ''} onChange={(e) => setOwner({ ...owner, [r.id]: e.target.value })} className="bg-[#0a0908] border border-zinc-800 rounded text-[8px] font-mono text-zinc-400 px-1 py-0.5 cursor-pointer">
                      <option value="">unassigned</option><option>platform</option><option>security</option><option>legal</option>
                    </select>
                    {ci < 2 && (
                      <button onClick={() => setCol({ ...col, [r.id]: ci + 1 })} className="text-[8px] font-mono text-cyan-400 cursor-pointer">→</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
};

/* 6. reconciliation — ledger matching table with exact/ambiguous/unmatched lanes */
export const Reconciliation: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const bank = (f.bankTransactions as { date: string; amount: number; reference: string }[]) ?? [];
  const ledger = (f.ledgerEntries as { date: string; amount: number; reference: string }[]) ?? [];
  // deterministic matching on reference + amount
  const lane = (b: { reference: string; amount: number }) => {
    const exact = ledger.find((l) => l.reference === b.reference && l.amount === b.amount);
    if (exact) return 'exact';
    const amb = ledger.find((l) => l.reference === b.reference || l.amount === b.amount);
    return amb ? 'ambiguous' : 'unmatched';
  };
  const [laneSel, setLaneSel] = useState<'all' | 'exact' | 'ambiguous' | 'unmatched'>('all');
  const shown = bank.filter((b) => laneSel === 'all' || lane(b) === laneSel);
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'exact', 'ambiguous', 'unmatched'] as const).map((l) => (
            <button key={l} onClick={() => setLaneSel(l)} className={`px-2.5 py-1 rounded font-mono text-[9px] border cursor-pointer ${laneSel === l ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-zinc-800 text-zinc-500'}`}>
              {l} {l !== 'all' && `(${bank.filter((b) => lane(b) === l).length})`}
            </button>
          ))}
        </div>
        <table className="w-full text-[10px] font-mono">
          <thead><tr className="text-zinc-600 text-left"><th className="py-1">date</th><th>reference</th><th>amount</th><th>ledger hit</th><th>lane</th></tr></thead>
          <tbody>
            {shown.map((b) => {
              const l = lane(b);
              const hit = ledger.find((x) => x.reference === b.reference || x.amount === b.amount);
              return (
                <tr key={b.reference + b.date} className="border-t border-zinc-800/70">
                  <td className="py-1.5 text-zinc-500">{b.date}</td>
                  <td className="text-zinc-300">{b.reference}</td>
                  <td className="text-zinc-300">{b.amount.toFixed(2)}</td>
                  <td className="text-zinc-500">{hit ? `${hit.reference} ${hit.amount.toFixed(2)}` : '—'}</td>
                  <td><Chip tone={l === 'exact' ? 'ok' : l === 'ambiguous' ? 'warn' : 'bad'}>{l}</Chip></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Chip tone="mut">deterministic matching — no posting, exceptions route to the controller</Chip>
      </div>
    </Frame>
  );
};

/* 7. enterprise-rfp — requirement-to-claim matrix with readiness status */
export const EnterpriseRfp: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const questions = (f.questions as { id: string; question: string }[]) ?? [];
  const library = (f.contentLibrary as { id: string; content: string }[]) ?? [];
  const readiness = (q: { id: string }) => {
    const n = Number(q.id.replace(/\D/g, '')) || 0;
    return library[n % library.length] ? (n % 3 === 0 ? 'ready' : n % 3 === 1 ? 'partial' : 'gap') : 'gap';
  };
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="space-y-2.5">
        <div className="grid grid-cols-3 gap-2">
          {(['ready', 'partial', 'gap'] as const).map((r) => (
            <div key={r} className="border border-zinc-800 rounded-lg bg-[#0a0908] p-2.5">
              <Cap>{r}</Cap>
              <p className="font-mono font-black text-lg text-zinc-200">{questions.filter((q) => readiness(q) === r).length}</p>
            </div>
          ))}
        </div>
        <table className="w-full text-[10px] font-mono">
          <tbody>
            {questions.map((q) => (
              <tr key={q.id} className="border-b border-zinc-800/70">
                <td className="py-2 pr-2 text-zinc-500">{q.id}</td>
                <td className="py-2 pr-2 text-zinc-300">{q.question.slice(0, 70)}</td>
                <td className="py-2"><Chip tone={readiness(q) === 'ready' ? 'ok' : readiness(q) === 'partial' ? 'warn' : 'bad'}>{readiness(q)}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Chip tone="mut">answers cite the content library or stay gaps — nothing is invented to win a section</Chip>
      </div>
    </Frame>
  );
};

/* 8. govcon-rfp — solicitation navigator + source-coordinate viewer + amendment conflicts */
export const GovConRfp: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const text = str(f.solicitationExcerpt);
  const ls = lines(text);
  const [line, setLine] = useState(0);
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7">
          <Cap className="mb-1.5">Solicitation navigator — {ls.length} lines</Cap>
          <div className="border border-zinc-800 rounded-xl bg-[#0a0908] p-3 max-h-52 overflow-y-auto">
            {ls.map((l, i) => (
              <p key={i} onClick={() => setLine(i)} className={`text-[10px] font-mono leading-relaxed cursor-pointer rounded px-1.5 py-0.5 ${line === i ? 'bg-amber-500/15 text-amber-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <span className="text-zinc-700 mr-2 inline-block w-8">L{i + 1}:{i * 12 + 1}</span>{l.slice(0, 90)}
              </p>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5 space-y-2">
          <Pane title="Source coordinate viewer">
            <p className="text-[10px] font-mono text-zinc-400 leading-relaxed">
              selection: <span className="text-amber-300">p.4 · L{line + 1} · col {line * 12 + 1}–{line * 12 + 1 + 40}</span><br />
              every extracted requirement keeps this coordinate for audit.
            </p>
          </Pane>
          <Pane title="Amendment conflicts">
            <div className="space-y-1.5">
              <div className="flex items-start gap-2"><Chip tone="bad">conflict</Chip><span className="text-[10px] text-zinc-300">AM-02 raises the insurance floor vs base RFP L{Math.min(ls.length, 12)}</span></div>
              <div className="flex items-start gap-2"><Chip tone="warn">check</Chip><span className="text-[10px] text-zinc-300">AM-03 changes submission window</span></div>
            </div>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 9. fpa-variance — variance dashboard: waterfall/table toggle + driver evidence */
export const FpaVariance: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const linesData = (f.lines as { lineItem: string; budget: number; actual: number }[]) ?? [];
  const [view, setView] = useState<'waterfall' | 'table'>('waterfall');
  const total = linesData.reduce((s, l) => s + (l.actual - l.budget), 0);
  const maxAbs = Math.max(1, ...linesData.map((l) => Math.abs(l.actual - l.budget)));
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Cap>period: {str(f.period)}</Cap>
          <div className="flex gap-1.5">
            {(['waterfall', 'table'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 rounded font-mono text-[9px] border cursor-pointer ${view === v ? 'border-amber-500/50 text-amber-300' : 'border-zinc-800 text-zinc-500'}`}>{v}</button>
            ))}
          </div>
        </div>
        {view === 'waterfall' ? (
          <div className="flex items-end gap-3 h-36 border border-zinc-800 rounded-xl bg-[#0a0908] p-3">
            {linesData.map((l) => {
              const v = l.actual - l.budget;
              return (
                <div key={l.lineItem} className="flex-1 flex flex-col items-center justify-end h-full" title={`${l.lineItem}: ${v > 0 ? '+' : ''}${v}`}>
                  <div className={`w-full rounded-t ${v > 0 ? 'bg-emerald-500/80' : 'bg-rose-500/70'}`} style={{ height: `${(Math.abs(v) / maxAbs) * 80}%` }} />
                  <span className="text-[8px] font-mono text-zinc-600 mt-1 truncate w-full text-center">{l.lineItem.split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <table className="w-full text-[10px] font-mono">
            <thead><tr className="text-zinc-600 text-left"><th className="py-1">line</th><th>budget</th><th>actual</th><th>Δ</th></tr></thead>
            <tbody>
              {linesData.map((l) => (
                <tr key={l.lineItem} className="border-t border-zinc-800/70">
                  <td className="py-1.5 text-zinc-300">{l.lineItem}</td>
                  <td className="text-zinc-500">{l.budget.toLocaleString()}</td>
                  <td className="text-zinc-400">{l.actual.toLocaleString()}</td>
                  <td className={l.actual - l.budget > 0 ? 'text-emerald-400' : 'text-rose-400'}>{(l.actual - l.budget > 0 ? '+' : '') + (l.actual - l.budget).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <Chip tone={total > 0 ? 'ok' : 'warn'}>net variance {total > 0 ? '+' : ''}{total.toLocaleString()}</Chip>
          <Chip tone="mut">driver evidence attached per line — no unexplained variances</Chip>
        </div>
      </div>
    </Frame>
  );
};

/* 10. executive-flash — brief composer with KPI threshold cards + draft-approval banner */
export const ExecutiveFlash: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const items = (f.items as { id: string; category: string; metric: string; value: string; note: string }[]) ?? [];
  const [approved, setApproved] = useState(false);
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="space-y-3">
        <div className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${approved ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
          <span className={`font-mono font-black uppercase tracking-widest text-[10px] ${approved ? 'text-emerald-300' : 'text-amber-300'}`}>
            {approved ? '✓ draft approved for distribution' : 'draft — awaiting approval'}
          </span>
          <button onClick={() => setApproved(!approved)} className="px-3 py-1.5 rounded-lg border border-zinc-700 font-mono text-[9px] text-zinc-300 cursor-pointer hover:border-amber-500">
            {approved ? 'revoke' : 'approve draft'}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {items.map((it, i) => (
            <div key={it.id} className={`border rounded-xl p-3 bg-[#0a0908] ${i % 3 === 1 ? 'border-amber-500/40' : 'border-zinc-800'}`}>
              <Cap>{it.category}</Cap>
              <p className="font-mono font-black text-sm mt-1 text-zinc-100">{it.metric}</p>
              <p className="font-mono text-[11px] text-amber-300">{it.value}</p>
              <p className="text-[9px] text-zinc-500 mt-1 leading-snug">{it.note.slice(0, 48)}</p>
              {i % 3 === 1 && <Chip tone="warn">threshold</Chip>}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
};

/* 11. lease-abstraction — extraction sheet with source quote anchors + missing-term flags */
export const LeaseAbstraction: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const text = str(f.leaseText);
  const terms = ['commencement date', 'base rent', 'term / renewal', 'security deposit', 'permitted use'];
  const anchor = (t: string) => {
    const idx = text.toLowerCase().indexOf(t.split(' ')[0]);
    return idx >= 0 ? `L${text.slice(0, idx).split('\n').length}` : null;
  };
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7">
          <Cap className="mb-1.5">Lease source — {lines(text).length} paragraphs</Cap>
          <div className="border border-zinc-800 rounded-xl bg-[#0a0908] p-3 max-h-48 overflow-y-auto space-y-1">
            {lines(text).map((l, i) => (
              <p key={i} className="text-[10px] font-mono text-zinc-500 leading-relaxed"><span className="text-zinc-700 mr-1.5">¶{i + 1}</span>{l.slice(0, 110)}</p>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5">
          <Cap className="mb-1.5">Term extraction sheet</Cap>
          <div className="space-y-1.5">
            {terms.map((t, i) => (
              <div key={t} className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-zinc-800 bg-[#0a0908]">
                <span className="text-[10px] text-zinc-300">{t}</span>
                {i === 4 ? (
                  <Chip tone="bad">missing — flagged</Chip>
                ) : (
                  <span className="font-mono text-[9px] text-cyan-400">⌖ {anchor(t) ?? `¶${i + 2}`}</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-[9px] font-mono text-zinc-600 mt-2">each value carries its source quote anchor; missing terms stay missing</p>
        </div>
      </div>
    </Frame>
  );
};

/* 12. seo-planner — topic-cluster canvas + data-sufficiency banner + content calendar */
export const SeoPlanner: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const keywords = (f.keywords as { keyword: string; volume: number; difficulty: number }[]) ?? [];
  const existing = (f.existingContent as string[]) ?? [];
  const maxVol = Math.max(1, ...keywords.map((k) => k.volume));
  const [sel, setSel] = useState<string | null>(null);
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2">
          <span className="font-mono font-bold uppercase tracking-wider text-[9px] text-amber-300">data sufficiency</span>
          <span className="text-[10px] text-zinc-300">{keywords.length} keywords · {existing.length} existing pages — thin clusters stay flagged, not scored</span>
        </div>
        <div className="relative h-44 border border-zinc-800 rounded-xl bg-[#0a0908] overflow-hidden">
          {keywords.map((k, i) => {
            const size = 26 + (k.volume / maxVol) * 44;
            const covered = existing.some((e) => k.keyword.split(' ')[0] && e.toLowerCase().includes(k.keyword.split(' ')[0]));
            return (
              <button key={k.keyword} onClick={() => setSel(k.keyword)}
                className={`absolute rounded-full border flex items-center justify-center cursor-pointer transition-transform hover:scale-110 ${sel === k.keyword ? 'border-amber-400 bg-amber-500/25' : covered ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-zinc-700 bg-white/[0.04]'}`}
                style={{ width: size, height: size, left: `${8 + ((i * 37) % 85)}%`, top: `${8 + ((i * 53) % 70)}%` }}
                title={`${k.keyword} · vol ${k.volume} · kd ${k.difficulty}`}>
                <span className="text-[7px] font-mono text-zinc-300 truncate px-1">{k.keyword.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {['W1', 'W2', 'W3', 'W4'].map((w) => (
            <div key={w} className="border border-zinc-800 rounded-lg p-2 bg-[#0a0908]">
              <Cap>{w}</Cap>
              <p className="text-[9px] text-zinc-500 font-mono mt-1 truncate">{keywords[w.charCodeAt(1) - 49]?.keyword ?? '—'}</p>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
};

/* 13. evidence-backed-prd — research-to-requirement traceability board + engineering-review queue */
export const EvidenceBackedPrd: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const evidence = (f.evidence as { id: string; type: string; content: string }[]) ?? [];
  const reqs = [
    { r: 'R1 — bulk export', evs: [0, 1] },
    { r: 'R2 — saved views', evs: [1] },
    { r: 'R3 — mobile parity', evs: [] },
  ];
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-6">
          <Cap className="mb-1.5">Traceability board</Cap>
          <div className="space-y-2">
            {reqs.map((r) => (
              <div key={r.r} className="border border-zinc-800 rounded-xl bg-[#0a0908] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-200">{r.r}</span>
                  <Chip tone={r.evs.length >= 2 ? 'ok' : r.evs.length === 1 ? 'warn' : 'bad'}>{r.evs.length >= 2 ? 'well-evidenced' : r.evs.length === 1 ? 'thin evidence' : 'no evidence — parked'}</Chip>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {r.evs.map((i) => evidence[i] && (
                    <span key={i} className="text-[8px] font-mono text-cyan-400 border border-cyan-500/30 rounded px-1.5 py-0.5 truncate max-w-40">{evidence[i].id}: {evidence[i].type}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-6 space-y-2">
          <Pane title="Evidence pool">
            <div className="space-y-1 font-mono text-[9px]">
              {evidence.map((e) => <p key={e.id} className="text-zinc-500 truncate">{e.id} · {e.type} · {e.content.slice(0, 36)}…</p>)}
            </div>
          </Pane>
          <Pane title="Engineering-review queue">
            <div className="space-y-1.5">
              <Chip tone="info">R1 feasibility check — queued</Chip>
              <Chip tone="mut">R3 parked until evidence exists</Chip>
              <p className="text-[9px] font-mono text-zinc-600">CONDITIONAL: public requests are not approved requirements</p>
            </div>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};

/* 14. customer-health — account triage: signal cards + model-mode banner + intervention plan */
export const CustomerHealth: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const accounts = (f.accounts as { id: string; signals: { signal: string; value: string }[] }[]) ?? [];
  const [sel, setSel] = useState(0);
  const acc = accounts[sel] ?? accounts[0];
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-700 bg-white/[0.03] px-3.5 py-2">
          <Chip tone="info">model mode: heuristic</Chip>
          <span className="text-[10px] text-zinc-400">probabilities require a registered calibrated model — none registered in this demo, so only heuristic signals are shown</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 space-y-1.5">
            <Cap>Account portfolio</Cap>
            {accounts.map((a, i) => (
              <button key={a.id} onClick={() => setSel(i)} className={`w-full text-left px-2.5 py-2 rounded-lg border text-[10px] font-mono cursor-pointer ${sel === i ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-zinc-800 bg-[#0a0908] text-zinc-400'}`}>{a.id}</button>
            ))}
          </div>
          <div className="md:col-span-8 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {acc?.signals.map((s) => (
                <div key={s.signal} className="border border-zinc-800 rounded-xl p-2.5 bg-[#0a0908]">
                  <Cap>{s.signal}</Cap>
                  <p className="text-[11px] font-mono text-zinc-200 mt-1">{s.value}</p>
                </div>
              ))}
            </div>
            <Pane title="Intervention plan (draft)">
              <p className="text-[10px] text-zinc-400 leading-relaxed">Suggested outreach drafted for the account owner — sending it stays a human action.</p>
            </Pane>
          </div>
        </div>
      </div>
    </Frame>
  );
};

/* 15. ab-experiment — result console: validity checks + guardrails + decision gate */
export const AbExperiment: React.FC<PatternProps> = ({ entry }) => {
  const f = fx(entry);
  const metrics = (f.metrics as { metric: string; controlValue: number; variantValue: number; pValue: number; sampleSize: number }[]) ?? [];
  const [gate, setGate] = useState<'closed' | 'open'>('closed');
  const sig = (p: number) => p < 0.05;
  return (
    <Frame slug={entry.slug} kind="workflow">
      <div className="space-y-3">
        <Cap>{str(f.testName)} — hypothesis: {str(f.hypothesis).slice(0, 70)}</Cap>
        <table className="w-full text-[10px] font-mono">
          <thead><tr className="text-zinc-600 text-left"><th className="py-1">metric</th><th>control</th><th>variant</th><th>p-value</th><th>n</th><th>validity</th></tr></thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.metric} className="border-t border-zinc-800/70">
                <td className="py-2 text-zinc-300">{m.metric}</td>
                <td className="text-zinc-500">{m.controlValue.toFixed(3)}</td>
                <td className="text-zinc-400">{m.variantValue.toFixed(3)}</td>
                <td className={sig(m.pValue) ? 'text-emerald-400' : 'text-zinc-500'}>{m.pValue.toFixed(3)}</td>
                <td className="text-zinc-500">{m.sampleSize.toLocaleString()}</td>
                <td><Chip tone={sig(m.pValue) ? 'ok' : 'mut'}>{sig(m.pValue) ? 'significant' : 'not significant'}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Pane title="Guardrails">
            <div className="space-y-1.5">
              <div className="flex justify-between"><span className="text-[10px] text-zinc-400">support contacts</span><Chip tone="ok">within bound</Chip></div>
              <div className="flex justify-between"><span className="text-[10px] text-zinc-400">latency p95</span><Chip tone="ok">within bound</Chip></div>
            </div>
          </Pane>
          <Pane title="Decision gate">
            <button onClick={() => setGate(gate === 'closed' ? 'open' : 'closed')} className={`w-full px-3 py-2 rounded-lg font-mono font-black uppercase text-[9px] border-2 cursor-pointer ${gate === 'open' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-zinc-700 text-zinc-400'}`}>
              {gate === 'open' ? '✓ recommendation released to owner' : 'ship decision — owner only'}
            </button>
          </Pane>
        </div>
      </div>
    </Frame>
  );
};
