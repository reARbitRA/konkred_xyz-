/**
 * KONKRED animated brutalist logo.
 * A pixel-block K that stamps in block by block, a letter-by-letter wordmark
 * and a blinking terminal cursor (the fullKONK_> motif).
 * Pure CSS animation (styles/brutal.css) — no JS per frame.
 */
import React from 'react';

/** 5×5 pixel matrix of the K mark */
const K_BLOCKS: Array<[number, number]> = [
  // vertical stem
  [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
  // upper arm
  [2, 0], [3, 0], [3, 1],
  // center joint
  [2, 2],
  // lower arm
  [3, 3], [3, 4], [2, 4],
];

interface KonkredLogoProps {
  size?: number;
  showWordmark?: boolean;
  animate?: boolean;
  className?: string;
}

const WORD = 'KONKRED';

export const KonkredLogo: React.FC<KonkredLogoProps> = ({
  size = 28,
  showWordmark = true,
  animate = true,
  className = '',
}) => {
  const unit = 100 / 5;
  const wordClass = animate ? 'brutal-word' : 'inline-flex';

  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`} aria-label="KONKRED">
      {/* K mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-hidden="true"
        className={animate ? 'brutal-stamp' : undefined}
        style={{ filter: 'drop-shadow(3px 3px 0 rgba(0,0,0,.65))' }}
      >
        <rect x="0" y="0" width="100" height="100" fill="var(--konk-black)" stroke="var(--konk-red)" strokeWidth="7" />
        {K_BLOCKS.map(([cx, cy], i) => (
          <rect
            key={`${cx}-${cy}`}
            x={cx * unit + 9}
            y={cy * unit + 9}
            width={unit - 18}
            height={unit - 18}
            fill={cx === 0 ? 'var(--konk-red)' : 'var(--ink)'}
            style={animate ? { animation: `k-block-in 0.35s ${0.08 + i * 0.045}s cubic-bezier(0.2,0.9,0.2,1) both` } : undefined}
          />
        ))}
      </svg>

      {/* wordmark */}
      {showWordmark && (
        <span className={`${wordClass} font-mono font-black tracking-[0.22em] text-[var(--ink)] uppercase leading-none`} style={{ fontSize: size * 0.42 }}>
          {WORD.split('').map((ch, i) => (
            <span key={i} style={animate ? { animationDelay: `${0.15 + i * 0.055}s` } : undefined}>
              {ch}
            </span>
          ))}
          <span
            className={`brutal-cursor text-[var(--konk-red)] ${animate ? '' : 'opacity-100'}`}
            style={{ animationDelay: '0.6s', marginLeft: '0.1em' }}
            aria-hidden="true"
          >
            _
          </span>
        </span>
      )}
    </span>
  );
};

export default KonkredLogo;
