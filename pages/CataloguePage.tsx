/**
 * The Command Grid (/catalogue) — OBSIDIAN SIGNAL catalogue console.
 *
 * All 36 products as stations in one responsive grid: scored instant
 * search ("/" to focus), live type filters, category districts, inline
 * suite → tool links and an evidence-dense list view. No pan/zoom
 * canvas, no pointer capture — plain CSS grid, real buttons, works on
 * every viewport.
 *
 * Preserved contracts (e2e): h1 "36 workflow products", searchbox named
 * "Search catalogue", buttons "All 36 / Suites N / Workflows N / list",
 * catalogue-count text "X of 36 entries", station-{slug} and
 * catalogue-card-{slug} test ids.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PageView } from '../types.ts';
import { ENTRIES, SUITES, WORKFLOWS, getChildren } from '../content/catalogue/portfolio.ts';
import type { PortfolioEntry } from '../content/catalogue/types.ts';
import { track } from '../utils/analytics.ts';
import { Search, X, Layers, Wrench } from 'lucide-react';

interface Props {
  onNavigate: (page: PageView, slug?: string) => void;
}

const MONO = { fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace" } as const;
const DISPLAY = { fontFamily: "'Archivo Black','Archivo',sans-serif" } as const;
const PROSE = { fontFamily: "'Special Elite','Courier New',serif" } as const;

const badge = (e: PortfolioEntry) =>
  e.validationStatus === 'PASS' ? 'PREFLIGHT PASS' : e.validationStatus === 'CONDITIONAL' ? 'CONDITIONAL' : 'NOT RUN';

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

/* ── station card (grid view) ────────────────────────────────────── */

const StationCard: React.FC<{
  e: PortfolioEntry;
  q: string;
  onOpen: (e: PortfolioEntry) => void;
  onOpenSlug: (slug: string, type: 'SUITE' | 'WORKFLOW') => void;
}> = ({ e, q, onOpen, onOpenSlug }) => {
  const kids = e.type === 'SUITE' ? getChildren(e.id) : [];
  const price =
    e.pricing.kitFromUsd != null ? `FROM $${e.pricing.kitFromUsd.toLocaleString()}`
    : e.pricing.sprintFromUsd != null ? `SPRINT $${e.pricing.sprintFromUsd.toLocaleString()}+`
    : 'ON REQUEST';

  return (
    <article
      data-testid={`station-${e.slug}`}
      className="k-panel-plate k-scanhost flex flex-col text-left"
      style={{ color: 'var(--k-ink)' }}
    >
      {/* ID / STATUS strip */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5" style={{ borderColor: 'var(--k-line)' }}>
        <span className="flex items-center gap-2 text-[8px] font-bold tracking-[0.22em] uppercase min-w-0" style={{ ...MONO, color: 'var(--k-mut)' }}>
          {e.type === 'SUITE'
            ? <Layers size={10} className="shrink-0" aria-hidden="true" />
            : <Wrench size={10} className="shrink-0" aria-hidden="true" />}
          <span className="truncate">{e.type === 'SUITE' ? `SUITE · ${kids.length} TOOLS` : 'TOOL'}</span>
        </span>
        <span
          className="text-[8px] font-bold tracking-[0.18em] uppercase border px-1.5 py-0.5 shrink-0"
          style={{ ...MONO, borderColor: e.validationStatus === 'PASS' ? 'var(--k-red)' : 'var(--k-line)', color: e.validationStatus === 'PASS' ? 'var(--k-red)' : 'var(--k-mut)' }}
        >
          {badge(e)}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 p-4 flex-1">
        <p className="text-[8px] font-bold tracking-[0.28em] uppercase" style={{ ...MONO, color: 'var(--k-mut)' }}>{e.category}</p>
        <h3 className="uppercase leading-tight text-[15px] tracking-tight" style={DISPLAY}>
          <Highlight text={e.title} q={q} />
        </h3>
        {e.jobToBeDone && (
          <p className="text-[12px] leading-relaxed line-clamp-2" style={{ ...PROSE, color: 'var(--k-mut)' }}>
            <Highlight text={e.jobToBeDone} q={q} />
          </p>
        )}

        {/* suite → tool wiring, inline and tappable */}
        {kids.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {kids.map((k) => (
              <button
                key={k.slug}
                onClick={() => onOpenSlug(k.slug, 'WORKFLOW')}
                className="text-[8px] font-bold tracking-[0.12em] uppercase border px-2 py-1 cursor-pointer transition-colors duration-150 hover:border-[var(--k-red)] hover:text-[var(--k-red)] focus-visible:border-[var(--k-red)] focus-visible:text-[var(--k-red)]"
                style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}
                title={`Open tool: ${k.title}`}
              >
                ▸ {k.title}
              </button>
            ))}
          </div>
        )}

        {/* telemetry + action */}
        <div className="mt-auto pt-3 flex items-center justify-between gap-2 border-t" style={{ borderColor: 'var(--k-line)' }}>
          <span className="flex flex-col gap-0.5 text-[8px] font-bold tracking-[0.14em] uppercase min-w-0" style={{ ...MONO, color: 'var(--k-mut)' }}>
            <span style={{ color: 'var(--k-amber)' }}>{price}</span>
            {e.staticDesignScore != null && <span>{e.staticDesignScore}/100 DESIGN</span>}
          </span>
          <button
            onClick={() => onOpen(e)}
            className="shrink-0 text-[9px] font-black tracking-[0.18em] uppercase border-2 px-3 py-2 cursor-pointer transition-all duration-150 hover:bg-[var(--k-amber)] hover:text-[var(--k-on-acc)] hover:border-[var(--k-red)] focus-visible:bg-[var(--k-amber)] focus-visible:text-[var(--k-on-acc)]"
            style={{ ...MONO, borderColor: 'var(--k-ink)', color: 'var(--k-ink)' }}
          >
            {e.type === 'SUITE' ? 'OPEN SUITE ▸' : 'OPEN TOOL ▸'}
          </button>
        </div>
      </div>
    </article>
  );
};

/* ── page ────────────────────────────────────────────────────────── */

const CataloguePage: React.FC<Props> = ({ onNavigate }) => {
  useEffect(() => { track('catalogue_view'); }, []);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [layer, setLayer] = useState<'all' | 'SUITE' | 'WORKFLOW'>('all');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

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
    if (q) return [{ name: 'SEARCH RESULTS — RANKED BY RELEVANCE', items: filtered }];
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

  const go = (slug: string, type: 'SUITE' | 'WORKFLOW') =>
    onNavigate(type === 'SUITE' ? 'suite_detail' : 'workflow_detail', slug);
  const open = (e: PortfolioEntry) => go(e.slug, e.type);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--k-bg)', color: 'var(--k-ink)' }} data-testid="catalogue-floor">
      <div className="k-hazard k-hazard-thin" aria-hidden="true" />

      {/* ── command header ── */}
      <header className="sticky top-0 z-40 border-b-2" style={{ background: 'var(--k-panel)', borderColor: 'var(--k-line)' }}>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3">
          <button
            onClick={() => onNavigate('landing')}
            aria-label="Back to home"
            className="w-8 h-8 grid place-items-center font-black cursor-pointer shrink-0 transition-transform duration-150 hover:scale-110"
            style={{ background: 'var(--k-amber)', color: 'var(--k-on-acc)' }}
          >
            K
          </button>
          <h1 className="text-sm sm:text-base font-black uppercase tracking-tight mr-1" style={DISPLAY}>
            36 workflow products
          </h1>

          {/* search well */}
          <div className="relative flex-1 min-w-[9rem] basis-full sm:basis-auto order-last sm:order-none">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--k-mut)' }} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="SEARCH THE GRID_"
              aria-label="Search catalogue"
              className="w-full pl-8 pr-16 py-2 text-[11px] border-2 outline-none"
              style={{ ...MONO, background: 'var(--k-bg)', borderColor: 'var(--k-line)', color: 'var(--k-ink)' }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {query && (
                <button onClick={() => setQuery('')} aria-label="Clear search" className="cursor-pointer p-0.5 transition-colors hover:text-[var(--k-red)]" style={{ color: 'var(--k-mut)' }}>
                  <X size={11} />
                </button>
              )}
              <kbd className="k-keycap hidden sm:inline-flex" aria-hidden="true">/</kbd>
            </span>
          </div>

          {/* type filters */}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-6 py-1.5 border-t text-[9px] font-bold tracking-[0.22em] uppercase" style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>
          <span data-testid="catalogue-count">{filtered.length} of {ENTRIES.length} entries</span>
          <span aria-hidden="true" style={{ color: 'var(--k-red)' }}>◆</span>
          <span>{SUITES.length} SUITES · {WORKFLOWS.length} TOOLS</span>
          {q && <span style={{ color: 'var(--k-red)' }}>QUERY: “{query.trim().toUpperCase()}”</span>}
        </div>
      </header>

      {/* ── body ── */}
      <main className="flex-1 px-4 sm:px-6 lg:px-10 py-8 space-y-12">
        {filtered.length === 0 ? (
          /* intelligent empty state */
          <div className="max-w-xl mx-auto text-center border border-dashed p-10 sm:p-14" style={{ borderColor: 'var(--k-line)' }}>
            <p className="text-[10px] font-bold tracking-[0.3em] uppercase mb-3" style={{ ...MONO, color: 'var(--k-red)' }}>NO STATION MATCHES “{query.trim().toUpperCase()}”</p>
            <p className="text-[13px] leading-relaxed mb-6" style={{ ...PROSE, color: 'var(--k-mut)' }}>
              Nothing on the grid answers that query. Closest stations by signal similarity:
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
            <section key={sec.name} className="relative">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[10px] font-bold tracking-[0.3em]" style={{ ...MONO, color: 'var(--k-red)' }}>{String(i + 1).padStart(2, '0')}</span>
                <h2 className="text-[10px] font-bold tracking-[0.3em] uppercase" style={{ ...MONO, color: 'var(--k-mut)' }}>{sec.name}</h2>
                <span className="h-px flex-1" style={{ background: 'var(--k-line)' }} aria-hidden="true" />
                <span className="text-[9px] font-bold tracking-[0.2em]" style={{ ...MONO, color: 'var(--k-mut)' }}>{sec.items.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 brutal-stagger">
                {sec.items.map((e) => (
                  <StationCard key={e.slug} e={e} q={q} onOpen={open} onOpenSlug={go} />
                ))}
              </div>
            </section>
          ))
        ) : (
          /* LIST — dense evidence rows */
          <div className="max-w-5xl mx-auto flex flex-col gap-2">
            {filtered.map((e) => (
              <article
                key={e.slug}
                data-testid={`catalogue-card-${e.slug}`}
                className="k-panel-plate flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3"
              >
                <span className="flex items-center gap-2 sm:w-24 shrink-0 text-[8px] font-bold tracking-[0.2em] uppercase" style={{ ...MONO, color: 'var(--k-mut)' }}>
                  {e.type === 'SUITE' ? <Layers size={10} aria-hidden="true" /> : <Wrench size={10} aria-hidden="true" />}
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
                <span className="text-[9px] font-bold tracking-[0.14em] uppercase shrink-0" style={{ ...MONO, color: 'var(--k-amber)' }}>
                  {e.pricing.kitFromUsd != null ? `from $${e.pricing.kitFromUsd.toLocaleString()}` : e.pricing.sprintFromUsd != null ? `sprint $${e.pricing.sprintFromUsd.toLocaleString()}+` : 'on request'}
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

      {/* system boundary */}
      <footer className="px-4 sm:px-6 py-4 border-t flex flex-wrap items-center justify-between gap-2 text-[9px] font-bold tracking-[0.22em] uppercase" style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>
        <span>KONKRED COMMAND GRID — EVIDENCE-LINKED, HUMAN-SUPERVISED</span>
        <button onClick={() => onNavigate('validation')} className="cursor-pointer transition-colors hover:text-[var(--k-red)]">VALIDATION RECORD ▸</button>
      </footer>
    </div>
  );
};

export default CataloguePage;
