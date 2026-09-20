import React, { useEffect, useRef } from 'react';

/** Global visual hardware for Chalk & Signal. Kept independent from routes so
 * every loaded module gets the same foreground grain and cursor behavior. */
export const ChalkChrome: React.FC = () => {
  const glow = useRef<HTMLDivElement>(null);
  const reticle = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(hover: none), (prefers-reduced-motion: reduce)').matches) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let rx = x;
    let ry = y;
    let frame = 0;

    const move = (event: PointerEvent) => { x = event.clientX; y = event.clientY; };
    const paint = () => {
      rx += (x - rx) * .16;
      ry += (y - ry) * .16;
      if (glow.current) glow.current.style.transform = `translate(${x - 150}px, ${y - 150}px)`;
      if (reticle.current) reticle.current.style.transform = `translate(${rx - 23}px, ${ry - 23}px)`;
      frame = requestAnimationFrame(paint);
    };
    window.addEventListener('pointermove', move, { passive: true });
    frame = requestAnimationFrame(paint);
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(frame); };
  }, []);

  return (
    <>
      <div className="chalk-texture" aria-hidden="true" />
      <div ref={glow} className="konk-cursor-glow" aria-hidden="true" />
      <div ref={reticle} className="konk-reticle" aria-hidden="true">
        <svg viewBox="0 0 46 46" fill="none">
          <circle cx="23" cy="23" r="17" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity=".9" />
          <path d="M23 1v8M23 37v8M1 23h8M37 23h8" stroke="currentColor" strokeWidth="1.4" />
          <path d="M15 23h16M23 15v16" stroke="currentColor" strokeWidth=".7" opacity=".8" />
          <circle cx="23" cy="23" r="2.4" fill="currentColor" />
        </svg>
      </div>
    </>
  );
};

export const Rivets: React.FC = () => (
  <>
    <i className="rivet rivet-tl" aria-hidden="true" />
    <i className="rivet rivet-tr" aria-hidden="true" />
    <i className="rivet rivet-bl" aria-hidden="true" />
    <i className="rivet rivet-br" aria-hidden="true" />
  </>
);

export const Frame: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`spec-shell chalk-soft ${className}`}><Rivets />{children}</section>
);

export const KeyCap: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`keycap ${className}`}>{children}</span>
);
