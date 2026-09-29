/**
 * SignalCursor — trailing targeting reticle.
 *
 * A decorative machine-targeting ornament that trails the pointer and
 * ignites over interactive elements. Hard constraints:
 *  - only mounts on fine-pointer devices (never touch)
 *  - disabled under prefers-reduced-motion
 *  - never hides or replaces the native cursor
 *  - pointer-events: none, aria-hidden — purely decorative
 *  - single rAF loop, transform-only updates (no layout thrash)
 */
import React, { useEffect, useRef, useState } from 'react';

const INTERACTIVE = 'a, button, [role="button"], input, select, textarea, label, summary, [tabindex]:not([tabindex="-1"])';

export const SignalCursor: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const fine = window.matchMedia('(pointer: fine)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setEnabled(fine.matches && !motion.matches);
    update();
    fine.addEventListener?.('change', update);
    motion.addEventListener?.('change', update);
    return () => {
      fine.removeEventListener?.('change', update);
      motion.removeEventListener?.('change', update);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    let x = -100, y = -100;      // target
    let cx = -100, cy = -100;    // current (trailing)
    let hot = false;
    let visible = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      if (!visible) { visible = true; el.style.opacity = '1'; }
      const t = e.target as Element | null;
      const nowHot = !!t?.closest?.(INTERACTIVE);
      if (nowHot !== hot) {
        hot = nowHot;
        el.dataset.hot = hot ? 'true' : 'false';
      }
    };
    const onLeave = () => { visible = false; el.style.opacity = '0'; };
    const onDown = () => { el.dataset.down = 'true'; };
    const onUp = () => { el.dataset.down = 'false'; };

    const loop = () => {
      cx += (x - cx) * 0.28;
      cy += (y - cy) * 0.28;
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(loop);

    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div ref={ref} aria-hidden="true" className="k-cursor" data-hot="false" data-down="false">
      <span className="k-cursor-bracket k-cursor-tl" />
      <span className="k-cursor-bracket k-cursor-tr" />
      <span className="k-cursor-bracket k-cursor-bl" />
      <span className="k-cursor-bracket k-cursor-br" />
      <span className="k-cursor-dot" />
    </div>
  );
};

export default SignalCursor;
