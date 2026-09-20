/**
 * Shared primitives for the 36 portfolio pattern components.
 * Every pattern renders real manifest/fixture data in a structurally unique
 * layout — these are only the atomic building blocks.
 */
import React from 'react';
import type { PortfolioEntry } from '../../../content/catalogue/types.ts';

export interface PatternProps {
  entry: PortfolioEntry;
}

/** Pattern wrapper: unique test id per entry + honest preview label. */
export const Frame: React.FC<{ slug: string; kind: 'suite' | 'workflow'; children: React.ReactNode }> = ({ slug, kind, children }) => (
  <section
    data-testid={`pattern-${slug}`}
    aria-label="interaction pattern"
    className="border-2 border-black bg-[#171514] rounded-2xl overflow-hidden shadow-[4px_4px_0px_0px_#0a0908]"
  >
    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-[#171514] px-4 py-2.5">
      <span className="font-mono font-black uppercase tracking-widest text-[10px] text-white">
        {kind === 'suite' ? 'Suite preview' : 'Workspace'}
      </span>
      <span className="font-mono uppercase tracking-widest text-[8px] text-zinc-500 border border-zinc-700 rounded px-2 py-0.5">
        {kind === 'suite' ? 'illustrative' : 'sample data'}
      </span>
    </div>
    <div className="p-4 md:p-5">{children}</div>
  </section>
);

export const Cap: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <p className={`font-mono uppercase tracking-widest text-[9px] text-zinc-500 font-bold ${className}`}>{children}</p>
);

export const Pane: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`border border-zinc-800 rounded-xl bg-[#0a0908] overflow-hidden ${className}`}>
    <div className="px-3 py-2 border-b border-zinc-800 bg-white/[0.02]">
      <Cap>{title}</Cap>
    </div>
    <div className="p-3">{children}</div>
  </div>
);

export const Chip: React.FC<{ children: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'info' | 'mut' }> = ({ children, tone = 'mut' }) => {
  const tones: Record<string, string> = {
    ok: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    warn: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    bad: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
    info: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
    mut: 'text-zinc-400 border-zinc-700 bg-white/[0.03]',
  };
  return <span className={`inline-flex items-center gap-1 border rounded font-mono font-bold uppercase tracking-wider text-[8px] px-1.5 py-0.5 ${tones[tone]}`}>{children}</span>;
};

export const Li: React.FC<{ children: React.ReactNode; active?: boolean; onClick?: () => void }> = ({ children, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-2.5 py-2 rounded-lg text-[11px] leading-snug transition-colors cursor-pointer ${active ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40' : 'text-zinc-400 hover:bg-white/[0.04] border border-transparent'}`}
  >
    {children}
  </button>
);

/** deterministic pseudo-metric for illustrative previews (clearly labelled as such) */
export const rows = (n: number) => Array.from({ length: n }, (_, i) => i);
