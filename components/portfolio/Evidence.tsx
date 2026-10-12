/**
 * Portfolio evidence UI atoms.
 * Mandatory honest labels:
 *   - static design score  -> "Static design target — not measured model performance"
 *   - deterministic PASS   -> "Public-data preflight — narrow reference test"
 */
import React from 'react';
import type { PortfolioEntry, PortfolioStatus } from '../../content/catalogue/types.ts';
import { STATUS_LEGEND } from '../../content/catalogue/portfolio.ts';

/* ── status chip ── */
const STATUS_STYLES: Record<PortfolioStatus, string> = {
  PUBLIC_DEMO: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  WORKFLOW_KIT: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  PUBLIC_CATALOGUE_SUPERVISED: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40',
  INTERNAL_CONTROLLED_PILOT: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  ENTERPRISE_INTEGRATION: 'bg-purple-500/15 text-purple-400 border-purple-500/40',
  CONDITIONAL_VALIDATION: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

const STATUS_LABEL: Record<PortfolioStatus, string> = {
  PUBLIC_DEMO: 'Public Demo',
  WORKFLOW_KIT: 'Workflow Kit',
  PUBLIC_CATALOGUE_SUPERVISED: 'Catalogue · Supervised',
  INTERNAL_CONTROLLED_PILOT: 'Controlled Pilot',
  ENTERPRISE_INTEGRATION: 'Enterprise Integration',
  CONDITIONAL_VALIDATION: 'Conditional Validation',
};

export const StatusChip: React.FC<{ status: PortfolioStatus; size?: 'sm' | 'md'; withNote?: boolean }> = ({ status, size = 'md', withNote = false }) => (
  <span
    title={withNote ? STATUS_LEGEND[status] : STATUS_LABEL[status]}
    className={`inline-flex items-center gap-1.5 font-mono font-black uppercase tracking-wider border rounded px-2 py-1 ${size === 'sm' ? 'text-[9px]' : 'text-[10px]'} ${STATUS_STYLES[status]}`}
  >
    <span className="w-1.5 h-1.5 rounded-full bg-current" />
    {STATUS_LABEL[status]}
  </span>
);

/* ── static design score (mandatory label kept in tooltip + /validation) ── */
export const DesignScore: React.FC<{ score: number | null; compact?: boolean }> = ({ score, compact = false }) => {
  if (score == null) return null;
  if (compact) {
    return (
      <span title="Static design target — not measured model performance" className="font-mono text-[9px] text-zinc-500">
        design <span className="text-zinc-300 font-bold">{score}/100</span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col text-[9px] font-mono uppercase tracking-widest">
      <span className="text-zinc-300 font-black">
        Design target <span className="text-amber-400">{score}/100</span>
      </span>
      <span className="text-zinc-600">Static design target — not measured model performance</span>
    </span>
  );
};

/* ── validation badge ── */
export const ValidationBadge: React.FC<{ status: 'PASS' | 'CONDITIONAL' | 'NOT_RUN'; withLabel?: boolean }> = ({ status, withLabel = false }) => {
  const style = status === 'PASS'
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
    : status === 'CONDITIONAL'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/40'
      : 'bg-zinc-500/10 text-zinc-400 border-zinc-600';
  return (
    <span className={`inline-flex ${withLabel ? 'flex-col' : ''} border rounded px-2 py-0.5 font-mono font-black uppercase tracking-wider text-[9px] ${style}`}>
      <span className="flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-current" />
        {status === 'PASS' ? 'PASS' : status === 'CONDITIONAL' ? 'CONDITIONAL' : 'NOT RUN'}
      </span>
      {withLabel && (
        <span className="text-zinc-500 font-bold normal-case tracking-normal text-[8px]">Public-data preflight — narrow reference test</span>
      )}
    </span>
  );
};

/* ── one-line trust footer for product pages ── */
export const EvidenceLine: React.FC<{ entry: PortfolioEntry; onOpenValidation: () => void }> = ({ entry, onOpenValidation }) => (
  <p className="font-mono text-[10px] flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: 'var(--k-mut)' }}>
    {entry.validationStatus === 'PASS' || entry.validationStatus === 'CONDITIONAL' ? (
      <>
        <span style={{ color: 'var(--k-amber)' }}>✓</span>
        <span>Validated on public data — preflight {entry.validationStatus}</span>
        <button onClick={onOpenValidation} className="underline underline-offset-2 cursor-pointer" style={{ color: 'var(--k-amber)' }}>
          validation record
        </button>
      </>
    ) : (
      <span>Validation: not run yet</span>
    )}
  </p>
);

/* ── public validation evidence panel ── */
export const EvidencePanel: React.FC<{ entry: PortfolioEntry }> = ({ entry }) => {
  const v = entry.publicValidation;
  return (
    <section aria-label="Public validation evidence" className="bg-[#171514] border-2 border-black rounded-2xl p-5 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-mono font-black uppercase tracking-widest text-xs text-white">Public validation evidence</h3>
        <div className="flex items-center gap-3">
          <ValidationBadge status={entry.validationStatus} />
          <span className="text-[9px] font-mono text-zinc-600">RUN {v.runDate}</span>
        </div>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <dt className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Test focus</dt>
          <dd className="text-zinc-300 leading-relaxed">{v.testFocus}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Measured evidence</dt>
          <dd className="text-zinc-300 leading-relaxed">{v.measuredEvidence}</dd>
        </div>
      </dl>
      <SourceLedger sources={v.sources} />
      {v.limitations.length > 0 && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">Scope of the evidence</p>
          <ul className="space-y-1">
            {v.limitations.map((l, i) => (
              <li key={i} className="text-[11px] text-zinc-400 leading-relaxed flex gap-2">
                <span className="text-zinc-600 font-mono">—</span>{l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

/* ── source ledger: every public source referenced by the entry ── */
export const SourceLedger: React.FC<{ sources: string[] }> = ({ sources }) => (
  <div aria-label="Public source references">
    <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">Public sources ({sources.length})</p>
    <ol className="space-y-1">
      {sources.map((s, i) => (
        <li key={i} className="text-[11px] truncate">
          <a href={s} target="_blank" rel="noreferrer noopener" className="text-cyan-400/90 hover:text-cyan-300 font-mono underline decoration-cyan-500/30 underline-offset-2">
            [{i + 1}] {s.replace(/^https?:\/\//, '').slice(0, 72)}
          </a>
        </li>
      ))}
    </ol>
  </div>
);
