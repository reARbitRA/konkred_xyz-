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
