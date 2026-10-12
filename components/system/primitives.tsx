/**
 * OBSIDIAN SIGNAL — hardware-language primitives.
 *
 * Reusable industrial UI atoms shared by the shell, landing surface and
 * footer archive. Every primitive obeys the global interaction law:
 * ash-grey at rest, signal-red ignition on hover/focus. Red is reserved
 * for live / armed / selected / committed states.
 */
import React from 'react';

/* ── MachineLabel — mono, wide-tracked, ALL CAPS system label ── */
export const MachineLabel: React.FC<{
  children: React.ReactNode;
  className?: string;
  live?: boolean;
}> = ({ children, className = '', live = false }) => (
  <span
    className={`font-mono uppercase text-[10px] font-bold tracking-[0.28em] ${
      live ? 'text-signal-hot' : 'text-void-600'
    } ${className}`}
  >
    {children}
  </span>
);

/* ── SectionHead — numbered section header with rail ── */
export const SectionHead: React.FC<{
  index: string;
  label: string;
  title: string;
  className?: string;
}> = ({ index, label, title, className = '' }) => (
  <header className={`relative z-10 ${className}`}>
    <div className="flex items-center gap-3 mb-3">
      <span className="font-mono text-[10px] font-bold tracking-[0.3em] text-signal">{index}</span>
      <span className="h-px flex-1 bg-void-300" aria-hidden="true" />
      <MachineLabel>{label}</MachineLabel>
    </div>
    <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-clinical-light leading-[0.95]">
      {title}
    </h2>
  </header>
);

/* ── GhostNumber — giant outlined numeral, pure atmosphere ── */
export const GhostNumber: React.FC<{
  value: string;
  className?: string;
}> = ({ value, className = '' }) => (
  <span aria-hidden="true" className={`ghost-num select-none ${className}`}>
    {value}
  </span>
);

/* ── Keycap — small mechanical key label ── */
export const Keycap: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <kbd className={`k-keycap ${className}`}>{children}</kbd>;

/* ── Stamp — rotated rubber stamp; red = committed/verified marks only ── */
export const Stamp: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <span className={`k-stamp-box ${className}`}>{children}</span>;

/* ── StatusDot — grey at rest, red pulse only when live ── */
export const StatusDot: React.FC<{ live?: boolean; className?: string; label?: string }> = ({
  live = false,
  className = '',
  label,
}) => (
  <span className={`inline-flex items-center gap-2 ${className}`}>
    <span className={`k-dot ${live ? 'k-dot-live' : ''}`} aria-hidden="true" />
    {label && (
      <span className={`font-mono text-[9px] font-bold uppercase tracking-[0.24em] ${live ? 'text-signal-hot' : 'text-void-600'}`}>
        {label}
      </span>
    )}
  </span>
);

/* ── SignalButton — machine control. Ash at rest, solid red when hot ── */
export const SignalButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'ghost';
    arrow?: boolean;
  }
> = ({ variant = 'primary', arrow = false, className = '', children, ...rest }) => (
  <button
    {...rest}
    className={`${variant === 'primary' ? 'k-btn k-btn-acc' : 'k-btn k-btn-ghost'} ${className}`}
  >
    {children}
    {arrow && <span aria-hidden="true">▸</span>}
  </button>
);

/* ── DataRow — boxed metadata line for evidence panels ── */
export const DataRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}> = ({ label, value, className = '' }) => (
  <div
    className={`flex items-center justify-between gap-3 border border-void-300 bg-void-200 px-2.5 py-1.5 ${className}`}
  >
    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-void-600 flex items-center gap-1.5">
      {label}
    </span>
    <span className="font-mono text-[10px] font-bold text-clinical">{value}</span>
  </div>
);

/* ── HazardTape — structural boundary device. Use sparingly. ── */
export const HazardTape: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`k-hazard k-hazard-thin w-full ${className}`} aria-hidden="true" />
);

/* ── Panel — chamfered dark plate with rivet marks ── */
export const Panel: React.FC<{
  children: React.ReactNode;
  className?: string;
  chamfer?: boolean;
  as?: 'div' | 'section' | 'article';
}> = ({ children, className = '', chamfer = false, as: Tag = 'div' }) => (
  <Tag className={`k-panel-plate k-rivet relative ${chamfer ? 'k-chamfer-sm' : ''} ${className}`}>
    {children}
  </Tag>
);

/* ── SystemTicker — moving operational message band.
   variant 'signal' = red band w/ display type (forward);
   variant 'meta'   = carbon band w/ mono metadata (reverse). ── */
export const SystemTicker: React.FC<{
  items: string[];
  variant?: 'signal' | 'meta';
  reverse?: boolean;
  className?: string;
}> = ({ items, variant = 'signal', reverse = variant === 'meta', className = '' }) => (
  <div
    aria-hidden="true"
    className={`overflow-hidden whitespace-nowrap ${className}`}
    style={
      variant === 'signal'
        ? { background: 'var(--k-amber)', borderBottom: '2px solid var(--k-edge)' }
        : { background: 'var(--k-floor)', borderBottom: '2px solid var(--k-line)' }
    }
  >
    <div className={reverse ? 'brutal-marquee-rev py-1' : 'brutal-marquee py-1.5'}>
      {[0, 1].map((k) => (
        <span
          key={k}
          className={
            variant === 'signal'
              ? 'flex shrink-0 font-black uppercase tracking-[0.25em] text-[11px] py-1'
              : 'flex shrink-0 font-bold uppercase tracking-[0.3em] text-[8px] py-0.5'
          }
          style={
            variant === 'signal'
              ? { color: 'var(--k-on-acc)', fontFamily: "'Archivo Black','Archivo',sans-serif" }
              : { color: 'var(--k-mut)', fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace" }
          }
        >
          {items.map((w, i) => <span key={i} className="mx-4">{w}</span>)}
        </span>
      ))}
    </div>
  </div>
);

/* ── Frame — technical container with registration brackets + label ── */
export const Frame: React.FC<{
  children: React.ReactNode;
  label?: string;
  className?: string;
}> = ({ children, label, className = '' }) => (
  <div className={`relative border border-void-300 ${className}`}>
    {/* corner registration brackets */}
    <span aria-hidden="true" className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-void-500" />
    <span aria-hidden="true" className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-void-500" />
    <span aria-hidden="true" className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-void-500" />
    <span aria-hidden="true" className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-void-500" />
    {label && (
      <span className="absolute -top-2 left-4 px-2 bg-void font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-void-600">
        {label}
      </span>
    )}
    {children}
  </div>
);

/* ── Rail — alignment-tick divider (horizontal structure line) ── */
export const Rail: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden="true" className={`relative h-2 ${className}`}>
    <span className="absolute inset-x-0 top-1/2 h-px bg-void-300" />
    <span
      className="absolute inset-0"
      style={{
        backgroundImage: 'repeating-linear-gradient(90deg, var(--edge) 0 1px, transparent 1px 24px)',
      }}
    />
  </div>
);

/* ── CommandCard — operational module card.
   Grammar: ID/STATUS → TITLE → description → INPUT ▸ OUTPUT → ACTION.
   Uses --k-* vars so it works in obsidian and evidence-paper themes. ── */
const CC_DISPLAY = { fontFamily: "'Archivo Black','Archivo',sans-serif" } as const;
const CC_MONO = { fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace" } as const;
const CC_PROSE = { fontFamily: "'Special Elite','Courier New',serif" } as const;

export const CommandCard: React.FC<{
  onClick: () => void;
  n: string;
  title: string;
  desc: string;
  cta: string;
  io: [string, string];
  live?: boolean;
  wide?: boolean;
  delay?: number;
  testId?: string;
  btnText?: string;
}> = ({ onClick, n, title, desc, cta, io, live, wide, delay = 0, testId, btnText }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className={`k-slab k-scanhost k-rivet brutal-rise text-left p-6 sm:p-7 flex flex-col gap-4 cursor-pointer group ${wide ? 'sm:col-span-2' : ''}`}
    style={{ ['--slab-c' as string]: 'var(--k-red)', animationDelay: `${delay}s` }}
  >
    {/* ID / STATUS strip */}
    <span className="flex items-center justify-between gap-3 w-full">
      <span className="flex items-center gap-3">
        <span className="font-black text-4xl sm:text-5xl leading-none" style={{ ...CC_DISPLAY, WebkitTextStroke: '1.5px var(--k-mut)', color: 'transparent' }}>{n}</span>
        <span className="text-[9px] font-bold tracking-[0.26em] uppercase border px-2.5 py-1" style={{ ...CC_MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>{cta}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0" aria-hidden="true">
        <span className={`w-2 h-2 ${live ? 'k-dot-live' : ''}`} style={{ background: live ? 'var(--k-red)' : 'var(--k-line)' }} />
        <span className="text-[8px] font-bold tracking-[0.3em]" style={{ ...CC_MONO, color: live ? 'var(--k-red)' : 'var(--k-mut)' }}>{live ? 'LIVE' : 'READY'}</span>
      </span>
    </span>

    <span className="uppercase leading-[1.02] text-xl sm:text-2xl tracking-tight transition-colors duration-200 group-hover:text-[var(--k-red)] block" style={CC_DISPLAY}>{title}</span>
    <span className="text-[13px] leading-relaxed block" style={{ ...CC_PROSE, color: 'var(--k-mut)' }}>{desc}</span>

    {/* INPUT → OUTPUT */}
    <span className="flex items-center gap-2 text-[9px] font-bold tracking-[0.14em] uppercase border-t pt-3" style={{ ...CC_MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>
      <span>{io[0]}</span>
      <span aria-hidden="true" style={{ color: 'var(--k-red)' }}>▸</span>
      <span>{io[1]}</span>
    </span>

    <span className="font-bold text-xs tracking-[0.2em] flex items-center gap-2 transition-colors duration-200 group-hover:text-[var(--k-red)]" style={CC_MONO}>
      {btnText ?? 'ENTER'} <span aria-hidden="true" className="group-hover:translate-x-1 transition-transform inline-block">→</span>
    </span>
  </button>
);

/* ── InputWell — recessed technical form field with label + error ── */
export const InputWell: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    id: string;
    error?: string;
    hint?: string;
  }
> = ({ label, id, error, hint, className = '', ...rest }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-void-500">
      {label}
    </label>
    <input
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      className={`k-well w-full px-3 py-2.5 text-sm font-mono text-clinical-light placeholder:text-void-600 ${
        error ? 'border-signal' : ''
      } ${className}`}
      {...rest}
    />
    {error ? (
      <p id={`${id}-error`} className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-signal-hot flex items-center gap-1.5">
        <span aria-hidden="true">▲</span> {error}
      </p>
    ) : hint ? (
      <p id={`${id}-hint`} className="font-mono text-[9px] uppercase tracking-[0.14em] text-void-600">{hint}</p>
    ) : null}
  </div>
);

/* ── EmptyState — honest nothing-here surface with a next step ── */
export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, action, className = '' }) => (
  <div className={`p-10 sm:p-16 border border-dashed border-void-400 text-center bg-void-100 ${className}`}>
    {icon && (
      <div className="w-14 h-14 bg-void-300 flex items-center justify-center mx-auto mb-4 text-ghost" aria-hidden="true">
        {icon}
      </div>
    )}
    <h3 className="text-lg font-display text-clinical-light mb-2">{title}</h3>
    {description && (
      <p className="text-ghost font-prose text-sm max-w-xs mx-auto">{description}</p>
    )}
    {action && <div className="mt-6 flex justify-center">{action}</div>}
  </div>
);
