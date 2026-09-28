/**
 * Loader — OBSIDIAN SIGNAL scan reticle.
 * A machine loading state: square registration frame, rotating red
 * scan segment, stepped progress ticks. No soft glow orbs.
 */
import React from 'react';

interface LoaderProps {
  size?: number;
  className?: string;
  label?: string;
}

const Loader: React.FC<LoaderProps> = ({ size = 24, className = '', label }) => {
  const s = size + 12;
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`} role="status" aria-live="polite">
      <span className="relative inline-block" style={{ width: s, height: s }} aria-hidden="true">
        {/* registration frame */}
        <span className="absolute inset-0 border border-void-300" />
        <span className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-void-500" />
        <span className="absolute -top-px -right-px w-2 h-2 border-t-2 border-r-2 border-void-500" />
        <span className="absolute -bottom-px -left-px w-2 h-2 border-b-2 border-l-2 border-void-500" />
        <span className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-void-500" />
        {/* rotating signal segment */}
        <span
          className="absolute inset-[4px] animate-spin"
          style={{
            animationDuration: '0.9s',
            animationTimingFunction: 'steps(8)',
            background:
              'conic-gradient(var(--signal-hot, #ff1a2e) 0 45deg, transparent 45deg 360deg)',
          }}
        />
        {/* well core */}
        <span className="absolute inset-[8px] bg-void-200 border border-void-300" />
        <span className="absolute inset-0 m-auto w-1.5 h-1.5 rotate-45 bg-signal" />
      </span>
      {label ? (
        <span className="text-[10px] font-mono text-void-500 uppercase tracking-[0.28em]">
          {label}
        </span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
};

export default Loader;
