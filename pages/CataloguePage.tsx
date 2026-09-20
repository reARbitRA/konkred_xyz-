/**
 * The Workflow Floor (/catalogue) — E-style infinite zoomable catalogue.
 * All 36 products as stations; signal wires pulse suite → tool; stations
 * expand in place with typed specs. Pan (drag), zoom (wheel/pinch/buttons),
 * search flies the camera to a station. LIST view kept as an accessible
 * alternative (and for small screens).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PageView } from '../types.ts';
import { ENTRIES, SUITES, WORKFLOWS, getChildren } from '../content/catalogue/portfolio.ts';
import type { PortfolioEntry } from '../content/catalogue/types.ts';
import { Typewriter } from '../components/brand/Typewriter.tsx';
import { track } from '../utils/analytics.ts';
import { Search, Layers, Wrench, X } from 'lucide-react';

interface Props {
  onNavigate: (page: PageView, slug?: string) => void;
}

/* ── deterministic floor layout ── */
const COLS = 5, DX = 760, DY = 820, OX = 140, OY = 120;
interface Placed { e: PortfolioEntry; x: number; y: number }
const layout = (() => {
  const placed: Placed[] = [];
  const suitePos = new Map<string, { x: number; y: number }>();
  SUITES.forEach((s, i) => {
    const x = OX + (i % COLS) * DX, y = OY + Math.floor(i / COLS) * DY;
    suitePos.set(s.id, { x, y });
    placed.push({ e: s, x, y });
  });
  WORKFLOWS.forEach((w) => {
    const p = suitePos.get(w.parentId as string);
    if (!p) return;
    const siblings = getChildren(w.parentId as string);
    const idx = siblings.findIndex((sib) => sib.slug === w.slug);
    placed.push({ e: w, x: p.x + idx * 265, y: p.y + 345 });
  });
  return placed;
})();
const WORLD_W = OX + COLS * DX + 300;
const WORLD_H = OY + Math.ceil(SUITES.length / COLS) * DY + 600;
/* district labels per category cluster */
const districts = (() => {
  const out: { name: string; x: number; y: number }[] = [];
  let last = '';
  SUITES.forEach((s, i) => {
    if (s.category !== last) {
      last = s.category;
      out.push({ name: s.category, x: OX + (i % COLS) * DX - 30, y: OY + Math.floor(i / COLS) * DY - 92 });
    }
  });
  return out;
})();

const badge = (e: PortfolioEntry) => e.validationStatus === 'PASS' ? 'PREFLIGHT PASS' : e.validationStatus === 'CONDITIONAL' ? 'CONDITIONAL' : 'NOT RUN';

const Station: React.FC<{
  p: Placed; onOpen: (slug: string, type: 'SUITE' | 'WORKFLOW') => void; open: boolean; onClose: () => void;
}> = ({ p, onOpen, open, onClose }) => {
  const e = p.e;
  const kids = e.type === 'SUITE' ? getChildren(e.id).length : 0;
  return (
    <div
      data-testid={`station-${e.slug}`}
      className={`k-station${e.type === 'SUITE' ? ' hub' : ''}${open ? ' open' : ''}`}
      style={{ left: p.x, top: p.y }}
      onClick={(ev) => { ev.stopPropagation(); if (!open) onOpen(e.slug, e.type); }}
    >
      <span className="block border-b-2 px-3 py-2 flex items-center justify-between gap-3" style={{ borderColor: 'var(--k-line)' }}>
        <b className="text-[10.5px] tracking-[0.1em]" style={{ color: e.type === 'SUITE' ? 'var(--k-violet)' : 'var(--k-ink)' }}>{e.title}</b>
        <span className="text-[8px] tracking-[0.2em] shrink-0" style={{ color: 'var(--k-mut)' }}>{e.type === 'SUITE' ? `SUITE·${kids}T` : 'TOOL'}</span>
      </span>
      {!open && (
        <span className="block px-3 py-2 text-[9px] tracking-[0.14em]" style={{ color: 'var(--k-amber)' }}>
          {e.pricing.kitFromUsd != null ? `FROM $${e.pricing.kitFromUsd.toLocaleString()}` : e.pricing.sprintFromUsd != null ? `SPRINT $${e.pricing.sprintFromUsd.toLocaleString()}+` : 'CLICK TO OPEN'}
        </span>
      )}
      {open && (
        <div className="p-4 space-y-3">
          <button onClick={(ev) => { ev.stopPropagation(); onClose(); }} className="absolute top-2 right-2 text-[9px] px-2 py-1 border cursor-pointer tracking-[0.2em]" style={{ borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>CLOSE ✕</button>
          <Typewriter text={e.jobToBeDone ?? ''} speed={12} className="text-[11px] leading-relaxed block min-h-[3.6em]" />
          <div className="flex flex-wrap gap-1.5">
            {[badge(e), `${e.staticDesignScore}/100 DESIGN`, e.status.replace(/_/g, ' ')].map((m) => (
              <span key={m} className="text-[8px] tracking-[0.18em] border px-2 py-1" style={{ borderColor: 'var(--k-line)', color: 'var(--k-ph, #d60019)' }}>{m}</span>
            ))}
          </div>
          <button
            onClick={(ev) => { ev.stopPropagation(); onOpen(e.slug, e.type); }}
            className="text-[10px] font-bold tracking-[0.2em] px-4 py-2.5 border-2 cursor-pointer"
            style={{ background: 'var(--k-amber)', color: 'var(--k-bg)', borderColor: 'var(--k-ink)' }}
          >
            {e.type === 'SUITE' ? 'VIEW SUITE ▸' : 'WATCH CHANNEL ▸'}
          </button>
        </div>
      )}
    </div>
  );
};

const CataloguePage: React.FC<Props> = ({ onNavigate }) => {
  useEffect(() => { track('catalogue_view'); }, []);
  const [view, setView] = useState<'floor' | 'list'>('floor');
  const [layer, setLayer] = useState<'all' | 'SUITE' | 'WORKFLOW'>('all');
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [zoomPct, setZoomPct] = useState(100);

  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cam = useRef({ x: 0, y: 0, z: 1 });
  const raf = useRef(0);

  const apply = () => {
    if (worldRef.current) worldRef.current.style.transform = `translate(${cam.current.x}px,${cam.current.y}px) scale(${cam.current.z})`;
  };
  const clampZ = (z: number) => Math.min(2.4, Math.max(0.3, z));
  const zoomAt = (sx: number, sy: number, f: number) => {
    const nz = clampZ(cam.current.z * f);
    cam.current.x = sx - (sx - cam.current.x) * nz / cam.current.z;
    cam.current.y = sy - (sy - cam.current.y) * nz / cam.current.z;
    cam.current.z = nz;
    apply(); setZoomPct(Math.round(nz * 100));
  };
  const fit = () => {
    const el = stageRef.current; if (!el) return;
    const z = Math.min(el.clientWidth / WORLD_W, el.clientHeight / WORLD_H) * 1.08;
    cam.current = { x: 24, y: 24, z };
    apply(); setZoomPct(Math.round(z * 100));
  };
  const flyTo = (p: Placed, openIt: boolean) => {
    const el = stageRef.current; if (!el) return;
    const z = 1.35;
    const tx = el.clientWidth / 2 - (p.x + 110) * z;
    const ty = el.clientHeight / 2 - (p.y + 90) * z;
    const from = { ...cam.current };
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 550);
      const e2 = 1 - Math.pow(1 - k, 3);
      cam.current.x = from.x + (tx - from.x) * e2;
      cam.current.y = from.y + (ty - from.y) * e2;
      cam.current.z = from.z + (z - from.z) * e2;
      apply();
      if (k < 1) raf.current = requestAnimationFrame(step);
      else { setZoomPct(Math.round(z * 100)); if (openIt) setOpenSlug(p.e.slug); }
    };
    raf.current = requestAnimationFrame(step);
  };

  /* camera pointer handling: drag pan, wheel zoom, pinch */
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const pinchD = useRef(0);
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    fit();
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.k-station, .k-hud, button, input')) return;
      stage.setPointerCapture(e.pointerId);
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved.current = false; last.current = { x: e.clientX, y: e.clientY };
      stage.classList.add('dragging');
    };
    const move = (e: PointerEvent) => {
      if (!ptrs.current.has(e.pointerId)) return;
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.current.size === 2) {
        const [a, b] = [...ptrs.current.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD.current) {
          const r = stage.getBoundingClientRect();
          zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchD.current);
        }
        pinchD.current = d;
        return;
      }
      if (last.current) {
        const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved.current = true;
        cam.current.x += dx; cam.current.y += dy;
        last.current = { x: e.clientX, y: e.clientY };
        apply();
      }
    };
    const up = (e: PointerEvent) => {
      ptrs.current.delete(e.pointerId);
      if (ptrs.current.size < 2) pinchD.current = 0;
      if (!ptrs.current.size) { stage.classList.remove('dragging'); last.current = null; }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0013));
    };
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', wheel, { passive: false });
    return () => {
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
      stage.removeEventListener('wheel', wheel);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  const visible = useMemo(() => layout.filter((p) => layer === 'all' || p.e.type === layer), [layer]);
  const openEntry = openSlug ? ENTRIES.find((e) => e.slug === openSlug) : undefined;
  const openPlaced = openEntry ? layout.find((p) => p.e.slug === openSlug) : undefined;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return layout.filter((p) => p.e.title.toLowerCase().includes(q) || (p.e.jobToBeDone ?? '').toLowerCase().includes(q)).slice(0, 6);
  }, [query]);

  const go = (slug: string, type: 'SUITE' | 'WORKFLOW') => onNavigate(type === 'SUITE' ? 'suite_detail' : 'workflow_detail', slug);

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--k-bg)', color: 'var(--k-ink)' }} data-testid="catalogue-floor">
      {/* HUD */}
      <div className="k-hud relative z-40 flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-b-4" style={{ background: 'var(--k-panel)', borderColor: 'var(--k-ink)' }}>
        <button onClick={() => onNavigate('landing')} className="w-8 h-8 grid place-items-center font-black rotate-[-4deg] cursor-pointer shrink-0" style={{ background: 'var(--k-amber)', color: 'var(--k-bg)' }}>K</button>
        <h1 className="text-sm sm:text-base font-black uppercase tracking-tight mr-2" style={{ fontFamily: "'Archivo Black',ui-monospace,monospace" }}>36 workflow products</h1>
        <div className="relative flex-1 min-w-40">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the floor — fly to a station…"
            aria-label="Search catalogue"
            className="w-full px-3 py-2 text-[11px] font-mono border-2 outline-none cursor-text"
            style={{ background: 'var(--k-bg)', borderColor: 'var(--k-line)', color: 'var(--k-ink)' }}
          />
          {matches.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 border-2 z-50" style={{ background: 'var(--k-panel)', borderColor: 'var(--k-ink)' }}>
              {matches.map((m) => (
                <button key={m.e.slug} onClick={() => { setQuery(''); flyTo(m, true); }} className="w-full text-left px-3 py-2 text-[11px] hover:underline cursor-pointer flex items-center gap-2">
                  {m.e.type === 'SUITE' ? <Layers size={11} style={{ color: 'var(--k-violet)' }} /> : <Wrench size={11} style={{ color: 'var(--k-cyan)' }} />} {m.e.title}
                </button>
              ))}
            </div>
          )}
        </div>
        {(['all', 'SUITE', 'WORKFLOW'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setLayer(t)}
            className={`px-3 py-2 font-black text-[9px] uppercase tracking-widest border-2 cursor-pointer ${layer === t ? '' : 'hover:border-[var(--k-amber)]'}`}
            style={layer === t ? { background: 'var(--k-amber)', color: 'var(--k-bg)', borderColor: 'var(--k-ink)' } : { borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}
          >
            {t === 'all' ? `All ${ENTRIES.length}` : t === 'SUITE' ? `Suites ${SUITES.length}` : `Workflows ${WORKFLOWS.length}`}
          </button>
        ))}
        <div className="flex border-2" style={{ borderColor: 'var(--k-line)' }}>
          {(['floor', 'list'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className="px-3 py-2 font-black text-[9px] uppercase tracking-widest cursor-pointer"
              style={view === v ? { background: 'var(--k-ink)', color: 'var(--k-bg)' } : { color: 'var(--k-mut)' }}>{v}</button>
          ))}
        </div>
        <span className="hidden sm:inline text-[9px] tracking-[0.2em] w-20 text-right" style={{ color: 'var(--k-mut)' }}>{zoomPct}% · ZOOM</span>
        <button onClick={fit} className="px-3 py-2 border-2 font-black text-[9px] tracking-[0.2em] cursor-pointer" style={{ borderColor: 'var(--k-line)' }}>FIT</button>
      </div>

      {view === 'floor' ? (
        <>
          <div ref={stageRef} className="k-floor-stage flex-1" data-testid="catalogue-count">
            <span className="sr-only">{visible.length} of {ENTRIES.length} entries</span>
            <div ref={worldRef} className="k-world" style={{ width: WORLD_W, height: WORLD_H }}>
              <div className="k-grid-big" style={{ width: WORLD_W, height: WORLD_H }} />
              {/* district labels */}
              {districts.map((d) => (
                <div key={d.name} className="k-district" style={{ left: d.x, top: d.y, fontSize: 46 }}>{d.name}
                  <span className="block text-[9px] tracking-[0.4em]" style={{ WebkitTextStroke: '0px', color: 'var(--k-mut)', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 400 }}>DISTRICT</span>
                </div>
              ))}
              {/* wires */}
              <svg width={WORLD_W} height={WORLD_H} className="absolute inset-0 pointer-events-none overflow-visible">
                {visible.filter((p) => p.e.type === 'WORKFLOW').map((p) => {
                  const parent = layout.find((q) => q.e.id === p.e.parentId);
                  if (!parent) return null;
                  const x1 = parent.x + 106, y1 = parent.y + 92, x2 = p.x + 106, y2 = p.y;
                  const mx = (x1 + x2) / 2;
                  return <path key={p.e.slug} d={`M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke="var(--k-amber)" strokeWidth={2.5} opacity={0.5} strokeDasharray="10 14" style={{ animation: 'k-wire 1.2s linear infinite' }} />;
                })}
              </svg>
              {/* stations */}
              {visible.map((p) => (
                <Station key={p.e.slug} p={p} open={openSlug === p.e.slug} onClose={() => setOpenSlug(null)} onOpen={(slug, type) => {
                  if (openPlaced && openSlug === slug) go(slug, type); else setOpenSlug(slug);
                }} />
              ))}
            </div>
            {/* hint */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-3 text-[9px] tracking-[0.25em] px-4 py-2 border-2 pointer-events-none" style={{ background: 'var(--k-panel)', borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>
              DRAG TO PAN · WHEEL / PINCH TO ZOOM · CLICK A STATION TO OPEN IT IN PLACE
            </div>
            {openEntry && openPlaced && (
              <button
                onClick={() => go(openEntry.slug, openEntry.type)}
                className="absolute right-4 bottom-3 px-5 py-3 font-black text-[10px] tracking-[0.2em] border-4 cursor-pointer"
                style={{ background: 'var(--k-amber)', color: 'var(--k-bg)', borderColor: 'var(--k-ink)', boxShadow: '6px 6px 0 var(--k-slab-shadow)' }}
              >
                {openEntry.type === 'SUITE' ? 'OPEN SUITE PAGE ▸' : `WATCH ${openEntry.title.toUpperCase()} ON AIR ▸`}
              </button>
            )}
          </div>
        </>
      ) : (
        /* LIST view — accessible alternative, same data */
        <div className="flex-1 overflow-y-auto px-5 sm:px-10 py-8" style={{ background: 'var(--k-bg)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 brutal-stagger">
            {visible.map((p) => (
              <button
                key={p.e.slug}
                data-testid={`catalogue-card-${p.e.slug}`}
                onClick={() => go(p.e.slug, p.e.type)}
                className="k-slab brutal-press text-left p-5 flex flex-col gap-3"
                style={{ ['--slab-c' as string]: p.e.type === 'SUITE' ? 'var(--k-violet)' : 'var(--k-cyan)', transform: 'rotate(0deg)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold tracking-[0.25em] border px-1.5 py-0.5" style={{ borderColor: 'var(--k-ink)' }}>{p.e.type === 'SUITE' ? 'SUITE' : 'TOOL'}</span>
                  <span className="text-[9px] font-mono" style={{ color: 'var(--k-mut)' }}>{badge(p.e)}</span>
                </div>
                <div>
                  <p className="text-[9px] tracking-[0.2em] mb-1" style={{ color: 'var(--k-mut)' }}>{p.e.category}</p>
                  <h3 className="font-black text-sm uppercase leading-snug" style={{ fontFamily: "'Archivo Black',ui-monospace,monospace" }}>{p.e.title}</h3>
                  <p className="text-[11px] leading-snug mt-1.5 opacity-75 line-clamp-2">{p.e.jobToBeDone}</p>
                </div>
                <div className="flex items-center justify-between mt-auto pt-2 text-[9px] font-mono">
                  <span style={{ color: 'var(--k-amber)' }}>{p.e.pricing.kitFromUsd != null ? `from $${p.e.pricing.kitFromUsd.toLocaleString()}` : 'suite'}</span>
                  <span style={{ color: 'var(--k-mut)' }}>{p.e.type === 'SUITE' ? `${p.e.modules.length} modules` : 'tool'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CataloguePage;
