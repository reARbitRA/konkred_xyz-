/**
 * THE SWITCHYARD (/catalogue) — OBSIDIAN SIGNAL control-room scene.
 *
 * Not a list. A freight-yard command console: a cinematic yard header,
 * a sticky QRY> query console, a district rail that tracks your scroll
 * position, 36 manufactured bay-panel stations (slug barcodes, design-
 * score meters, validation lamps, suite→tool wiring), and a live
 * INSPECTOR dock that reads out whatever station you hover or focus —
 * typewriter telemetry, like a yard operator's terminal.
 *
 * Intelligence: scored instant search ("/" focuses, Esc clears,
 * ↵ opens the top match), match highlighting, trigram similarity
 * suggestions when nothing matches, scroll-tracked district index.
 *
 * Zero-bug posture: no pan/zoom, no pointer capture, semantic buttons
 * only, CSS-grid responsive, reduced-motion respected.
 *
 * Preserved contracts (e2e + design-law suite): h1 "36 workflow
 * products", searchbox named "Search catalogue", buttons "All 36 /
 * Suites N / Workflows N / list", catalogue-count text "X of 36
 * entries", station-{slug} and catalogue-card-{slug} test ids.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PageView } from '../types.ts';
import { ENTRIES, SUITES, WORKFLOWS, getChildren } from '../content/catalogue/portfolio.ts';
import type { PortfolioEntry } from '../content/catalogue/types.ts';
import { track } from '../utils/analytics.ts';

interface Props {
  onNavigate: (page: PageView, slug?: string) => void;
}

const MONO = { fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace" } as const;
const DISPLAY = { fontFamily: "'Archivo Black','Archivo',sans-serif" } as const;
const PROSE = { fontFamily: "'Special Elite','Courier New',serif" } as const;

const badge = (e: PortfolioEntry) =>
  e.validationStatus === 'PASS' ? 'PREFLIGHT PASS' : e.validationStatus === 'CONDITIONAL' ? 'CONDITIONAL' : 'NOT RUN';

const priceLine = (e: PortfolioEntry) =>
  e.pricing.kitFromUsd != null ? `FROM $${e.pricing.kitFromUsd.toLocaleString()}`
  : e.pricing.sprintFromUsd != null ? `SPRINT $${e.pricing.sprintFromUsd.toLocaleString()}+`
  : 'ON REQUEST';

/* ── search intelligence ─────────────────────────────────────────── */

/** Relevance score: title > category > job-to-be-done > modules. */
const scoreEntry = (e: PortfolioEntry, q: string): number => {
  if (!q) return 1;
  const title = e.title.toLowerCase();
  const job = (e.jobToBeDone ?? '').toLowerCase();
  const cat = e.category.toLowerCase();
  if (title.startsWith(q)) return 1000;
  if (title.includes(q)) return 800;
  let s = 0;
  for (const tok of q.split(/\s+/).filter(Boolean)) {
    if (title.includes(tok)) s += 120;
    else if (cat.includes(tok)) s += 40;
    else if (job.includes(tok)) s += 30;
    else if (e.modules.some((m) => m.toLowerCase().includes(tok))) s += 15;
  }
  return s;
};

/** Trigram similarity — powers "closest stations" when nothing matches. */
const trigrams = (s: string): Set<string> => {
  const x = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const g = new Set<string>();
  for (let i = 0; i <= x.length - 3; i++) g.add(x.slice(i, i + 3));
  return g;
};
const similarity = (a: string, b: string): number => {
  const ga = trigrams(a), gb = trigrams(b);
  let n = 0;
  for (const t of ga) if (gb.has(t)) n++;
  return n;
};

/** Highlight the first query match inside a text node. */
const Highlight: React.FC<{ text: string; q: string }> = ({ text, q }) => {
  const query = q.trim().toLowerCase();
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent underline decoration-2" style={{ color: 'var(--k-red)', textDecorationColor: 'var(--k-red)' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
};

/* ── scene instruments ───────────────────────────────────────────── */

/** Deterministic barcode strip derived from the station slug. */
const Barcode: React.FC<{ seed: string }> = ({ seed }) => (
  <span aria-hidden="true" className="flex items-end gap-[2px] h-3 overflow-hidden shrink-0">
    {seed.replace(/[^a-z0-9]/g, '').slice(0, 14).split('').map((c, i) => (
      <span
        key={i}
        className="inline-block"
        style={{ width: (c.charCodeAt(0) % 3) + 1, height: i % 4 === 0 ? '100%' : '66%', background: 'var(--k-mut)', opacity: 0.65 }}
      />
    ))}
  </span>
);

/** 10-segment design-score meter — real staticDesignScore only. */
const Meter: React.FC<{ score: number }> = ({ score }) => (
  <span className="flex items-center gap-1.5" title={`${score}/100 static design score`}>
    <span className="flex gap-[2px]" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="w-[3px] h-2.5 inline-block" style={{ background: i < Math.round(score / 10) ? 'var(--k-amber)' : 'var(--k-line)' }} />
      ))}
    </span>
    <span className="text-[8px] font-bold tracking-[0.14em]" style={{ ...MONO, color: 'var(--k-mut)' }}>{score}</span>
  </span>
);

/** Local yard clock — real time, control-room dressing. */
const useClock = () => {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setT(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return t.toTimeString().slice(0, 8);
};

/** Typewriter readout for the inspector dock (reduced-motion aware). */
const useTypewriter = (line: string) => {
  const [txt, setTxt] = useState(line);
  useEffect(() => {
    const animate =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate) { setTxt(line); return; }
    setTxt('');
    let i = 0;
    const id = window.setInterval(() => {
      i += 3;
      setTxt(line.slice(0, i));
      if (i >= line.length) window.clearInterval(id);
    }, 12);
    return () => window.clearInterval(id);
  }, [line]);
  return txt;
};

/* ── bay panel (grid view station) ───────────────────────────────── */

const BayPanel: React.FC<{
  e: PortfolioEntry;
  q: string;
  idx: number;
  onOpen: (e: PortfolioEntry) => void;
  onOpenSlug: (slug: string, type: 'SUITE' | 'WORKFLOW') => void;
  onInspect: (e: PortfolioEntry) => void;
}> = ({ e, q, idx, onOpen, onOpenSlug, onInspect }) => {
  const kids = e.type === 'SUITE' ? getChildren(e.id) : [];
  return (
    <article
      data-testid={`station-${e.slug}`}
      className="k-bay k-scanhost k-rivet flex flex-col"
      style={{ color: 'var(--k-ink)', animationDelay: `${Math.min(idx, 8) * 50}ms` }}
      onMouseEnter={() => onInspect(e)}
      onFocusCapture={() => onInspect(e)}
    >
      {/* bay header — type tag · unit no. · validation lamp */}
      <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2" style={{ borderColor: 'var(--k-line)' }}>
        <span className="flex items-center gap-2 text-[8px] font-bold tracking-[0.2em] uppercase min-w-0" style={{ ...MONO, color: 'var(--k-mut)' }}>
          <span aria-hidden="true" style={{ color: 'var(--k-amber)' }}>{e.type === 'SUITE' ? '▣' : '▸'}</span>
          <span className="truncate">{e.type === 'SUITE' ? `SUITE · ${kids.length} TOOLS` : 'TOOL'}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span
            className="text-[8px] font-bold tracking-[0.16em] uppercase border px-1.5 py-0.5"
            style={{ ...MONO, borderColor: e.validationStatus === 'PASS' ? 'var(--k-red)' : 'var(--k-line)', color: e.validationStatus === 'PASS' ? 'var(--k-red)' : 'var(--k-mut)' }}
          >
            {badge(e)}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-2.5 p-4 flex-1 relative">
        {/* ghost unit number */}
        <span aria-hidden="true" className="absolute right-2 top-1 font-black leading-none select-none pointer-events-none text-[3.4rem]" style={{ ...DISPLAY, color: 'transparent', WebkitTextStroke: '1px var(--k-line)', opacity: 0.55 }}>
          {String(idx + 1).padStart(2, '0')}
        </span>

        <p className="text-[8px] font-bold tracking-[0.28em] uppercase relative" style={{ ...MONO, color: 'var(--k-mut)' }}>{e.category}</p>
        <h3 className="uppercase leading-[1.05] text-[17px] tracking-tight pr-10 relative" style={DISPLAY}>
          <Highlight text={e.title} q={q} />
        </h3>
        {e.jobToBeDone && (
          <p className="text-[12px] leading-relaxed line-clamp-2 relative" style={{ ...PROSE, color: 'var(--k-mut)' }}>
            <Highlight text={e.jobToBeDone} q={q} />
          </p>
        )}

        {/* suite → tool wiring, inline and tappable */}
        {kids.length > 0 && (
          <div className="flex flex-col items-start gap-1 pt-1 relative">
            {kids.map((k, ki) => (
              <button
                key={k.slug}
                onClick={() => onOpenSlug(k.slug, 'WORKFLOW')}
                className="text-[8px] font-bold tracking-[0.12em] uppercase text-left cursor-pointer transition-colors duration-150 hover:text-[var(--k-red)] focus-visible:text-[var(--k-red)]"
                style={{ ...MONO, color: 'var(--k-mut)' }}
                title={`Open tool: ${k.title}`}
              >
                <span aria-hidden="true" style={{ color: 'var(--k-line)' }}>{ki === kids.length - 1 ? '└─' : '├─'}</span> {k.title} <span aria-hidden="true">▸</span>
              </button>
            ))}
          </div>
        )}

        {/* telemetry strip — barcode · price · design score */}
        <div className="mt-auto pt-3 flex items-center justify-between gap-3 border-t relative" style={{ borderColor: 'var(--k-line)' }}>
          <span className="flex items-center gap-3 min-w-0">
            <Barcode seed={e.slug} />
            <span className="text-[8px] font-bold tracking-[0.14em] uppercase truncate" style={{ ...MONO, color: 'var(--k-amber)' }}>{priceLine(e)}</span>
          </span>
          {e.staticDesignScore != null && <Meter score={e.staticDesignScore} />}
        </div>
      </div>

      {/* full-width arm/open action */}
      <button onClick={() => onOpen(e)} className="k-bay-open">
        {e.type === 'SUITE' ? 'OPEN SUITE' : 'OPEN TOOL'} <span aria-hidden="true">▸</span>
      </button>
    </article>
  );
};

/* ── inspector dock ──────────────────────────────────────────────── */

const InspectorDock: React.FC<{ e: PortfolioEntry | null; onOpen: (e: PortfolioEntry) => void }> = ({ e, onOpen }) => {
  const line = e
    ? `${e.title.toUpperCase()} — ${e.category} · ${e.type === 'SUITE' ? 'SUITE' : 'TOOL'} · ${badge(e)} · ${e.modules.length} MODULES${e.staticDesignScore != null ? ` · DESIGN ${e.staticDesignScore}/100` : ''} · ${priceLine(e)}`
    : 'AWAITING SIGNAL — HOVER OR FOCUS ANY STATION';
  const typed = useTypewriter(line);
  return (
    <aside className="k-dock hidden lg:flex items-stretch" aria-label="Station inspector">
      <span className="flex items-center gap-2.5 px-5 border-r-2 shrink-0" style={{ borderColor: 'var(--k-line)' }}>
        <span className={`w-2 h-2 shrink-0 ${e ? 'k-dot-live' : ''}`} style={{ background: e ? 'var(--k-red)' : 'var(--k-mut)' }} aria-hidden="true" />
        <span className="text-[9px] font-black tracking-[0.3em] uppercase" style={{ ...MONO, color: e ? 'var(--k-red)' : 'var(--k-mut)' }}>INSPECTOR</span>
      </span>
      <p className="flex-1 flex items-center px-5 py-3.5 text-[10px] font-bold tracking-[0.14em] uppercase truncate min-w-0" style={{ ...MONO, color: e ? 'var(--k-ink)' : 'var(--k-mut)' }} aria-live="polite">
        <span className="truncate">{typed}</span>
        <span className="brutal-cursor ml-1 shrink-0" style={{ color: 'var(--k-red)' }} aria-hidden="true">▮</span>
      </p>
      {e && (
        <button
          onClick={() => onOpen(e)}
          className="px-6 shrink-0 text-[9px] font-black tracking-[0.22em] uppercase border-l-2 cursor-pointer transition-colors duration-150 hover:bg-[var(--k-amber)] hover:text-[var(--k-on-acc)]"
          style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-ink)' }}
        >
          OPEN <span aria-hidden="true">▸</span>
        </button>
      )}
    </aside>
  );
};

/* ── page ────────────────────────────────────────────────────────── */

const CataloguePage: React.FC<Props> = ({ onNavigate }) => {
  useEffect(() => { track('catalogue_view'); }, []);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [layer, setLayer] = useState<'all' | 'SUITE' | 'WORKFLOW'>('all');
  const [query, setQuery] = useState('');
  const [inspected, setInspected] = useState<PortfolioEntry | null>(null);
  const [activeDistrict, setActiveDistrict] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const clock = useClock();

  /* "/" focuses search, Escape clears it — no other global key traps */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (ev.key === '/' && !typing) { ev.preventDefault(); searchRef.current?.focus(); }
      if (ev.key === 'Escape' && target === searchRef.current) setQuery('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const pool = ENTRIES.filter((e) => layer === 'all' || e.type === layer);
    if (!q) return pool;
    return pool
      .map((e) => ({ e, s: scoreEntry(e, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title))
      .map((x) => x.e);
  }, [layer, q]);

  /* category districts (search collapses to a single ranked section) */
  const sections = useMemo(() => {
    if (q) return [{ name: 'SIGNAL MATCHES — RANKED BY RELEVANCE', items: filtered }];
    const map = new Map<string, PortfolioEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.category) ?? [];
      list.push(e);
      map.set(e.category, list);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  }, [filtered, q]);

  /* closest stations when nothing matches */
  const suggestions = useMemo(() => {
    if (!q || filtered.length > 0) return [];
    return ENTRIES
      .map((e) => ({ e, s: similarity(e.title + ' ' + e.category, q) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.e);
  }, [q, filtered]);

  /* scroll-tracked district index (guarded for non-browser environments) */
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) setActiveDistrict(Number((en.target as HTMLElement).dataset.district ?? 0));
        }
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    sectionRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [sections.length, view]);

  const go = (slug: string, type: 'SUITE' | 'WORKFLOW') =>
    onNavigate(type === 'SUITE' ? 'suite_detail' : 'workflow_detail', slug);
  const open = (e: PortfolioEntry) => go(e.slug, e.type);

  const jumpTo = (i: number) => sectionRefs.current[i]?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-clip" style={{ background: 'var(--k-bg)', color: 'var(--k-ink)' }} data-testid="catalogue-floor">
      {/* yard floor — fixed blueprint grid behind everything */}
      <div className="k-sy-bg" aria-hidden="true" />
      <div className="k-hazard k-hazard-thin relative z-10" aria-hidden="true" />

      {/* ── yard header — cinematic, non-sticky ── */}
      <section className="relative z-10 pl-4 sm:pl-8 pr-16 sm:pr-20 pt-4 pb-8 sm:pb-10 border-b-2" style={{ borderColor: 'var(--k-line)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => onNavigate('landing')}
            aria-label="Back to home"
            className="w-8 h-8 grid place-items-center font-black cursor-pointer shrink-0 transition-transform duration-150 hover:scale-110"
            style={{ background: 'var(--k-amber)', color: 'var(--k-on-acc)' }}
          >
            K
          </button>
          <span className="text-[9px] font-bold tracking-[0.3em] uppercase" style={{ ...MONO, color: 'var(--k-mut)' }}>
            KONKRED // THE SWITCHYARD
          </span>
          <span className="hidden sm:flex items-center gap-4 ml-auto text-[9px] font-bold tracking-[0.24em] uppercase" style={{ ...MONO, color: 'var(--k-mut)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 k-dot-live" style={{ background: 'var(--k-red)' }} aria-hidden="true" />
              <span style={{ color: 'var(--k-red)' }}>YARD LIVE</span>
            </span>
            <span>LOCAL {clock}</span>
          </span>
        </div>

        <div className="relative mt-5 sm:mt-7">
          <span aria-hidden="true" className="absolute right-[-1rem] top-[-2.5rem] font-black leading-none select-none pointer-events-none text-[9rem] sm:text-[15rem] hidden sm:block" style={{ ...DISPLAY, color: 'transparent', WebkitTextStroke: '1.5px var(--k-line)', opacity: 0.5 }}>
            36
          </span>
          <h1 className="relative font-black uppercase leading-[0.9] tracking-[-0.02em] text-[11vw] sm:text-6xl lg:text-7xl" style={DISPLAY}>
            36 workflow <span className="block">products</span>
          </h1>
          <p className="relative mt-4 max-w-lg text-[13px] leading-relaxed" style={{ ...PROSE, color: 'var(--k-mut)' }}>
            Every station on this yard is a manufactured workflow product — {SUITES.length} suites wired to {WORKFLOWS.length} ready-to-run
            tools. Evidence-linked, human-supervised, no fake claims.
          </p>
        </div>
      </section>

      {/* ── QRY console — sticky command deck ── */}
      <header className="sticky top-0 z-40 border-b-2" style={{ background: 'var(--k-panel)', borderColor: 'var(--k-line)' }}>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 pl-4 sm:pl-6 pr-16 sm:pr-20 py-2.5">
          {/* query line */}
          <div className="relative flex-1 min-w-[9rem] basis-full sm:basis-auto order-last sm:order-none flex items-center border-2" style={{ borderColor: 'var(--k-line)', background: 'var(--k-bg)' }}>
            <span className="pl-3 pr-1 text-[10px] font-black tracking-[0.1em] shrink-0 select-none" style={{ ...MONO, color: 'var(--k-red)' }} aria-hidden="true">
              QRY&gt;
            </span>
            {!query && <span className="brutal-cursor absolute left-11 text-[10px] pointer-events-none" style={{ color: 'var(--k-mut)' }} aria-hidden="true">▮</span>}
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' && filtered[0]) open(filtered[0]); }}
              placeholder=""
              aria-label="Search catalogue"
              className="w-full py-2 pr-14 text-[11px] outline-none bg-transparent"
              style={{ ...MONO, color: 'var(--k-ink)' }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {query && (
                <button onClick={() => setQuery('')} aria-label="Clear search" className="cursor-pointer px-1 text-[11px] font-black transition-colors hover:text-[var(--k-red)]" style={{ ...MONO, color: 'var(--k-mut)' }}>
                  ✕
                </button>
              )}
              <kbd className="k-keycap hidden sm:inline-flex" aria-hidden="true">/</kbd>
            </span>
          </div>

          {/* type filters — switch bank */}
          {(['all', 'SUITE', 'WORKFLOW'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setLayer(t)}
              aria-pressed={layer === t}
              className="px-3 py-2 font-black text-[9px] uppercase tracking-widest border-2 cursor-pointer transition-colors duration-150"
              style={layer === t
                ? { ...MONO, background: 'var(--k-amber)', color: 'var(--k-on-acc)', borderColor: 'var(--k-edge)' }
                : { ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}
            >
              {t === 'all' ? `All ${ENTRIES.length}` : t === 'SUITE' ? `Suites ${SUITES.length}` : `Workflows ${WORKFLOWS.length}`}
            </button>
          ))}

          {/* view toggle */}
          <div className="flex border-2" style={{ borderColor: 'var(--k-line)' }}>
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className="px-3 py-2 font-black text-[9px] uppercase tracking-widest cursor-pointer transition-colors duration-150"
                style={view === v ? { ...MONO, background: 'var(--k-ink)', color: 'var(--k-bg)' } : { ...MONO, color: 'var(--k-mut)' }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* telemetry strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-4 sm:pl-6 pr-16 sm:pr-20 py-1.5 border-t text-[9px] font-bold tracking-[0.22em] uppercase" style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>
          <span data-testid="catalogue-count">{filtered.length} of {ENTRIES.length} entries</span>
          <span aria-hidden="true" style={{ color: 'var(--k-red)' }}>◆</span>
          <span>{SUITES.length} SUITES · {WORKFLOWS.length} TOOLS</span>
          {q && <span style={{ color: 'var(--k-red)' }}>QUERY: “{query.trim().toUpperCase()}”</span>}
          {q && filtered.length > 0 && <span className="hidden sm:inline">↵ OPENS TOP MATCH</span>}
        </div>

        {/* district rail — tracks your position on the yard */}
        {!q && view === 'grid' && sections.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pl-4 sm:pl-6 pr-16 sm:pr-20 py-1.5 border-t" style={{ borderColor: 'var(--k-line)' }}>
            {sections.map((sec, i) => (
              <button
                key={sec.name}
                onClick={() => jumpTo(i)}
                aria-current={activeDistrict === i}
                className="flex items-center gap-1.5 shrink-0 px-2 py-1 text-[8px] font-bold tracking-[0.16em] uppercase border cursor-pointer transition-colors duration-150 hover:border-[var(--k-red)] hover:text-[var(--k-red)]"
                style={activeDistrict === i
                  ? { ...MONO, borderColor: 'var(--k-red)', color: 'var(--k-red)' }
                  : { ...MONO, borderColor: 'transparent', color: 'var(--k-mut)' }}
              >
                <span aria-hidden="true">D{String(i + 1).padStart(2, '0')}</span>
                <span className="max-w-[9rem] truncate">{sec.name}</span>
                <span aria-hidden="true" style={{ color: 'var(--k-mut)' }}>{sec.items.length}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── the yard ── */}
      <main className="relative z-10 flex-1 px-4 sm:px-6 lg:px-10 py-8 space-y-14 pb-12 lg:pb-24">
        {filtered.length === 0 ? (
          /* intelligent empty state */
          <div className="max-w-xl mx-auto text-center border border-dashed p-10 sm:p-14" style={{ borderColor: 'var(--k-line)' }}>
            <p aria-hidden="true" className="font-black uppercase leading-none text-5xl sm:text-6xl mb-4 select-none" style={{ ...DISPLAY, color: 'transparent', WebkitTextStroke: '1.5px var(--k-line)' }}>
              NO SIGNAL
            </p>
            <p className="text-[10px] font-bold tracking-[0.3em] uppercase mb-3" style={{ ...MONO, color: 'var(--k-red)' }}>NO STATION MATCHES “{query.trim().toUpperCase()}”</p>
            <p className="text-[13px] leading-relaxed mb-6" style={{ ...PROSE, color: 'var(--k-mut)' }}>
              Nothing on the yard answers that query. Closest stations by signal similarity:
            </p>
            <div className="flex flex-col gap-2 items-stretch">
              {suggestions.map((e) => (
                <button
                  key={e.slug}
                  onClick={() => { setQuery(''); open(e); }}
                  className="flex items-center justify-between gap-3 border-2 px-4 py-3 cursor-pointer text-left transition-colors duration-150 hover:border-[var(--k-red)] group"
                  style={{ borderColor: 'var(--k-line)' }}
                >
                  <span className="text-[11px] font-black uppercase tracking-tight transition-colors group-hover:text-[var(--k-red)]" style={DISPLAY}>{e.title}</span>
                  <span className="text-[8px] font-bold tracking-[0.2em] uppercase shrink-0" style={{ ...MONO, color: 'var(--k-mut)' }}>{e.type === 'SUITE' ? 'SUITE' : 'TOOL'} ▸</span>
                </button>
              ))}
            </div>
            <button onClick={() => setQuery('')} className="mt-6 k-btn k-btn-ghost text-[10px]">CLEAR QUERY</button>
          </div>
        ) : view === 'grid' ? (
          /* GRID — category districts */
          sections.map((sec, i) => (
            <section
              key={sec.name}
              ref={(el) => { sectionRefs.current[i] = el; }}
              data-district={i}
              className="relative"
              style={{ scrollMarginTop: '10.5rem' }}
            >
              {/* monumental district header */}
              <div className="relative flex items-end gap-3 sm:gap-4 mb-6 border-b-2 pb-2.5" style={{ borderColor: 'var(--k-line)' }}>
                <span aria-hidden="true" className="absolute right-0 -top-9 sm:-top-14 font-black leading-none select-none pointer-events-none text-[4.5rem] sm:text-[7rem]" style={{ ...DISPLAY, color: 'transparent', WebkitTextStroke: '1px var(--k-line)', opacity: 0.45 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[10px] font-black tracking-[0.2em] pb-1 shrink-0" style={{ ...MONO, color: 'var(--k-red)' }} aria-hidden="true">
                  D{String(i + 1).padStart(2, '0')}
                </span>
                <h2 className="relative uppercase leading-none text-xl sm:text-3xl tracking-tight min-w-0" style={DISPLAY}>{sec.name}</h2>
                <span className="ml-auto text-[9px] font-bold tracking-[0.2em] uppercase pb-1 shrink-0" style={{ ...MONO, color: 'var(--k-mut)' }}>
                  {sec.items.length} STATION{sec.items.length === 1 ? '' : 'S'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
                {sec.items.map((e, k) => (
                  <BayPanel key={e.slug} e={e} q={q} idx={k} onOpen={open} onOpenSlug={go} onInspect={setInspected} />
                ))}
              </div>
            </section>
          ))
        ) : (
          /* LIST — cargo manifest rows */
          <div className="max-w-5xl mx-auto flex flex-col gap-2">
            {filtered.map((e, i) => (
              <article
                key={e.slug}
                data-testid={`catalogue-card-${e.slug}`}
                className="k-panel-plate flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3"
                onMouseEnter={() => setInspected(e)}
                onFocusCapture={() => setInspected(e)}
              >
                <span className="text-[8px] font-bold tracking-[0.14em] sm:w-12 shrink-0" style={{ ...MONO, color: 'var(--k-mut)' }} aria-hidden="true">
                  MN-{String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex items-center gap-2 sm:w-16 shrink-0 text-[8px] font-bold tracking-[0.2em] uppercase" style={{ ...MONO, color: 'var(--k-mut)' }}>
                  <span aria-hidden="true" style={{ color: 'var(--k-amber)' }}>{e.type === 'SUITE' ? '▣' : '▸'}</span>
                  {e.type === 'SUITE' ? 'SUITE' : 'TOOL'}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-black uppercase tracking-tight leading-tight" style={DISPLAY}>
                    <Highlight text={e.title} q={q} />
                  </h3>
                  <p className="text-[9px] font-bold tracking-[0.18em] uppercase mt-0.5" style={{ ...MONO, color: 'var(--k-mut)' }}>
                    {e.category} · {badge(e)}{e.staticDesignScore != null ? ` · ${e.staticDesignScore}/100` : ''}
                  </p>
                </div>
                <Barcode seed={e.slug} />
                <span className="text-[9px] font-bold tracking-[0.14em] uppercase shrink-0" style={{ ...MONO, color: 'var(--k-amber)' }}>
                  {priceLine(e).toLowerCase()}
                </span>
                <button
                  onClick={() => open(e)}
                  className="shrink-0 text-[9px] font-black tracking-[0.18em] uppercase border-2 px-3 py-2 cursor-pointer transition-all duration-150 hover:bg-[var(--k-amber)] hover:text-[var(--k-on-acc)] hover:border-[var(--k-red)]"
                  style={{ ...MONO, borderColor: 'var(--k-ink)', color: 'var(--k-ink)' }}
                >
                  OPEN ▸
                </button>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* live inspector — desktop control-room readout */}
      <InspectorDock e={inspected} onOpen={open} />

      {/* system boundary */}
      <footer className="relative z-10 px-4 sm:px-6 py-4 border-t flex flex-wrap items-center justify-between gap-2 text-[9px] font-bold tracking-[0.22em] uppercase lg:mb-12" style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>
        <span>KONKRED SWITCHYARD — EVIDENCE-LINKED, HUMAN-SUPERVISED</span>
        <button onClick={() => onNavigate('validation')} className="cursor-pointer transition-colors hover:text-[var(--k-red)]">VALIDATION RECORD ▸</button>
      </footer>
    </div>
  );
};

export default CataloguePage;
