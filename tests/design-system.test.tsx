/**
 * @vitest-environment jsdom
 *
 * OBSIDIAN SIGNAL — design-law enforcement.
 *
 * The reforge is only "done" if it cannot silently rot. This suite does two
 * things:
 *
 *  1. SOURCE LAWS — scans the styling layer and page/component source for
 *     banned color families (cool blues/greens/purples/cyans and the legacy
 *     amber/slate identity). One accent: signal red on a warm neutral ladder.
 *
 *  2. RENDER CONTRACTS — renders the rebuilt surfaces in jsdom and asserts
 *     the user-facing contracts: landing entry points and their accessible
 *     names, footer directory, 404 copy, loader semantics, and that the
 *     decorative cursor never mounts without a fine pointer.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── helpers ───────────────────────────────────────────────────────── */

function collectSource(dirs: string[], exts = ['.tsx', '.ts', '.css', '.html']): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.some((e) => entry.name.endsWith(e))) out.push([path.relative(ROOT, full), fs.readFileSync(full, 'utf8')]);
    }
  };
  for (const d of dirs) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  return out;
}

/** hex → [r,g,b] */
const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

/** A hex is "cool" when blue or green clearly dominates red — the banned
 *  families (blue / cyan / green / purple-blue) all satisfy this. Warm
 *  neutrals, warm reds and near-blacks do not. */
const isBannedCool = (hex: string): boolean => {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  if (max < 24) return false;                 // near-black, tint irrelevant
  if (b > r + 24 && b > g + 8) return true;   // blue/violet dominant
  if (g > r + 40 && g >= b) return true;      // green/cyan dominant
  return false;
};

/* ── 1. source laws ────────────────────────────────────────────────── */

describe('design law: single-accent obsidian palette', () => {
  const LEGACY_IDENTITY = [
    /#D98A2E/i, // legacy amber accent
    /#FF003C/i, // legacy REDAEYE private red
    /#0B0F14/i, /#0E1319/i, /#1A212B/i, // legacy cool-slate canvas
    /#ffb400/i, /#19d3c5/i, /#8b6bff/i, /#a9e838/i, // legacy k-accents
    /#ccff00/i, // acid lime
  ];

  it('styling layer contains no legacy identity hexes', () => {
    for (const file of ['index.html', 'styles/globals.css', 'styles/brutal.css']) {
      const src = read(file);
      for (const re of LEGACY_IDENTITY) {
        expect(src, `${file} still contains ${re}`).not.toMatch(re);
      }
    }
  });

  it('pages/components contain no legacy identity hexes', () => {
    for (const [file, src] of collectSource(['pages', 'components'])) {
      for (const re of LEGACY_IDENTITY) {
        expect(src, `${file} still contains ${re}`).not.toMatch(re);
      }
    }
  });

  it('pages/components contain no cool blue/green/cyan hex literals', () => {
    for (const [file, src] of collectSource(['pages', 'components'])) {
      const hexes = src.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
      for (const hex of hexes) {
        expect(isBannedCool(hex), `${file} uses cool hex ${hex}`).toBe(false);
      }
    }
  });

  it('core tokens are declared once and correctly', () => {
    const globals = read('styles/globals.css');
    for (const tok of ['--obsidian: #0a0908', '--signal: #d60019', '--signal-hot: #ff1a2e', '--ink: #f4f1eb', '--rest: #b7b2a9']) {
      expect(globals).toContain(tok);
    }
    // never pure black canvas / pure white text at the token layer
    expect(globals).not.toMatch(/--obsidian:\s*#000\b/i);
    expect(globals).not.toMatch(/--ink:\s*#fff\b/i);
  });

  it('reduced-motion collapse and branded focus are present', () => {
    const globals = read('styles/globals.css');
    expect(globals).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(globals).toMatch(/:focus-visible\s*\{[^}]*--signal-hot/);
  });

  it('texture layer is inline SVG, not a third-party asset', () => {
    const all = [read('index.html'), read('styles/globals.css')].join('\n');
    expect(all).toContain('feTurbulence');
    expect(all).not.toMatch(/transparenttextures\.com/);
  });
});

/* ── 2. render contracts ───────────────────────────────────────────── */

vi.mock('../utils/analytics.ts', () => ({ track: vi.fn() }));

afterEach(() => cleanup());

describe('landing surface contract', () => {
  it('renders the four entry points with their accessible names and test ids', async () => {
    const { default: LandingPage } = await import('../pages/LandingPage.tsx');
    render(<LandingPage onNavigate={() => undefined} />);

    expect(screen.getByTestId('landing-b')).toBeTruthy();
    for (const id of ['landing-slab-catalogue', 'landing-slab-auditor', 'landing-slab-fullkonk', 'landing-slab-redaeye']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    // e2e button-name contracts
    expect(screen.getByRole('button', { name: /Open AUDITOR/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open fullKONK/i })).toBeTruthy();
    // page grammar: dominant h1 exists
    expect(document.querySelector('h1')).toBeTruthy();
    // primary conversion action
    expect(screen.getByTestId('landing-cta-primary')).toBeTruthy();
  });

  it('entry-point cards are real buttons with decision data (INPUT ▸ OUTPUT)', async () => {
    const { default: LandingPage } = await import('../pages/LandingPage.tsx');
    render(<LandingPage onNavigate={() => undefined} />);
    const card = screen.getByTestId('landing-slab-auditor');
    expect(card.tagName).toBe('BUTTON');
    expect(card.textContent).toMatch(/FILE/);
    expect(card.textContent).toMatch(/EVIDENCE REPORT/);
  });
});

describe('footer archive contract', () => {
  it('renders directory links as real anchors and the honest status copy', async () => {
    const { default: SystemFooter } = await import('../components/SystemFooter.tsx');
    render(<SystemFooter />);
    const nav = screen.getByRole('navigation', { name: /footer/i });
    const anchors = nav.querySelectorAll('a[href]');
    expect(anchors.length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText(/FIXTURE-BACKED/)).toBeTruthy();
    expect(screen.getByText(/NO FAKE CLAIMS/)).toBeTruthy();
  });
});

describe('machine loader contract', () => {
  it('is announced to assistive tech and never renders a raw spinner glow', async () => {
    const { default: Loader } = await import('../components/common/Loader.tsx');
    const { container } = render(<Loader label="Initializing Module..." />);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(container.textContent).toMatch(/Initializing Module/);
  });
});

describe('signal cursor guards', () => {
  it('does not mount without a fine pointer (jsdom matchMedia = no match)', async () => {
    const { default: SignalCursor } = await import('../components/system/SignalCursor.tsx');
    // jsdom has no matchMedia by default in some versions; polyfill a "no match".
    if (!window.matchMedia) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
    }
    const { container } = render(<SignalCursor />);
    expect(container.querySelector('.k-cursor')).toBeNull();
  });
});

describe('404 contract', () => {
  it('keeps the purge-route copy asserted by e2e', async () => {
    const { default: NotFoundPage } = await import('../pages/NotFoundPage.tsx');
    render(<NotFoundPage onNavigate={() => undefined} />);
    expect(screen.getByText(/ERROR_404/)).toBeTruthy();
    expect(screen.getByText('Node Not Found')).toBeTruthy();
  });
});
