import React, { useEffect, useRef, useState } from 'react';

export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export const Rivet: React.FC<{ className?: string }> = ({ className }) => <i aria-hidden="true" className={cn('rivet', className)} />;

export const Frame: React.FC<React.PropsWithChildren<{ className?: string; innerClass?: string }>> = ({ children, className, innerClass }) => (
  <section className={cn('spec-shell', className)}>
    <Rivet className="rivet-tl" />
    <Rivet className="rivet-tr" />
    <Rivet className="rivet-bl" />
    <Rivet className="rivet-br" />
    <div className={cn('spec-body', innerClass)}>{children}</div>
  </section>
);

export const KeyCap: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
  <span className={cn('keycap', className)}>{children}</span>
);

export const Beam: React.FC = () => <span aria-hidden="true" className="beam" />;
export const Flood: React.FC = () => <span aria-hidden="true" className="flood" />;

export const GhostNum: React.FC<{ n: string; className?: string }> = ({ n, className }) => (
  <span aria-hidden="true" className={cn('ghost-num', className)}>{n}</span>
);

export const SectionHead: React.FC<{
  index: string;
  kicker: string;
  title: React.ReactNode;
  hint?: string;
  className?: string;
}> = ({ index, kicker, title, hint, className }) => (
  <header className={cn('section-head', className)}>
    <GhostNum n={index} />
    <div className="section-head-copy">
      <p className="machine-label"><span className="signal-diamond" />{kicker}</p>
      <h2 className="display-title">{title}</h2>
      {hint && <p className="tw-copy section-hint">{hint}</p>}
    </div>
  </header>
);

export const Panel: React.FC<React.PropsWithChildren<{
  label: string;
  right?: React.ReactNode;
  className?: string;
  bodyClass?: string;
}>> = ({ label, right, children, className, bodyClass }) => (
  <Frame className={cn('chalk-soft panel', className)} innerClass="panel-frame-body">
    <header className="panel-head">
      <span className="machine-label panel-label"><i className="signal-diamond" />{label}</span>
      <span className="panel-tools">
        {right}
        <i /><i /><i className="live-dot" />
      </span>
    </header>
    <div className={cn('panel-body', bodyClass)}>{children}</div>
  </Frame>
);

export const Shell: React.FC<React.PropsWithChildren<{
  tag: string;
  title: string;
  sub: string;
  icon?: React.ReactNode;
  onExit: () => void;
}>> = ({ tag, title, sub, icon, onExit, children }) => (
  <div className="module-shell chalk-smudge">
    <div className="hazard" aria-hidden="true" />
    <header className="module-head">
      <button type="button" onClick={onExit} className="shell-exit konk-item" aria-label="Return to workflow floor">← FLOOR</button>
      <div className="module-title-wrap">
        <p className="machine-label">{tag}</p>
        <h1 className="display-title">{icon}{title}</h1>
        <p className="tw-copy">{sub}</p>
      </div>
      <KeyCap>ESC / EXIT</KeyCap>
    </header>
    <main className="module-content">{children}</main>
  </div>
);

/** The custom hardware cursor. CSS restores native cursor on touch and reduced motion. */
export const Cursors: React.FC = () => {
  const reticle = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const point = useRef({ x: -100, y: -100, rx: -100, ry: -100 });

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const touch = window.matchMedia('(hover: none)');
    if (reduced.matches || touch.matches) return;

    const onMove = (event: PointerEvent) => {
      point.current.x = event.clientX;
      point.current.y = event.clientY;
    };
    let frame = 0;
    const loop = () => {
      const p = point.current;
      p.rx += (p.x - p.rx) * 0.16;
      p.ry += (p.y - p.ry) * 0.16;
      if (reticle.current) reticle.current.style.transform = `translate3d(${p.rx - 23}px, ${p.ry - 23}px, 0)`;
      if (glow.current) glow.current.style.transform = `translate3d(${p.x - 150}px, ${p.y - 150}px, 0)`;
      frame = requestAnimationFrame(loop);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    frame = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="cursor-system" aria-hidden="true">
      <div ref={glow} className="cursor-glow" />
      <div ref={reticle} className="cursor-reticle">
        <svg viewBox="0 0 46 46" fill="none">
          <circle cx="23" cy="23" r="17" stroke="currentColor" strokeWidth="1" strokeDasharray="4 5" />
          <path d="M23 1v8M23 37v8M1 23h8M37 23h8" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="23" cy="23" r="2.4" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
};

export const LiveClock: React.FC = () => {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span>{time.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' })} UTC</span>;
};
