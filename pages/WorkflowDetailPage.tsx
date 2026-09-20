/**
 * Workflow television (/tools/:slug) — G-style product broadcast.
 * Static burst on tune-in, CRT frame, channel OSD, typed spec, rotary dial
 * zaps between the 15 workflow channels. The real tool (MicroTool) and its
 * workspace pattern air inside the screen; honesty lines stay below the set.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PageView } from '../types.ts';
import { getEntryBySlug, WORKFLOWS } from '../content/catalogue/portfolio.ts';
import type { PortfolioEntry } from '../content/catalogue/types.ts';
import type { ProductRecord } from '../catalog/types.ts';
import { MicroTool } from '../components/catalog/MicroTool.tsx';
import { Pattern } from '../components/portfolio/patterns/index.tsx';
import { EvidenceLine } from '../components/portfolio/Evidence.tsx';
import { ScopeReviewPanel } from '../components/portfolio/ScopeReviewPanel.tsx';
import { Typewriter } from '../components/brand/Typewriter.tsx';
import { track } from '../utils/analytics.ts';
import { ProductInquiryModal, type InquiryIntent } from '../components/catalog/ProductInquiryModal.tsx';
import { ArrowLeft } from 'lucide-react';

interface Props {
  slug: string;
  onNavigate: (page: PageView, slug?: string) => void;
}

/* CRT static burst */
const Static: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      const w = cv.width = Math.floor(cv.clientWidth / 2), h = cv.height = Math.floor(cv.clientHeight / 2);
      if (w && h) {
        const img = ctx.createImageData(w, h), d = img.data;
        for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        ctx.putImageData(img, 0, 0);
      }
      requestAnimationFrame(draw);
    };
    draw();
    const t = setTimeout(() => { alive = false; onDone(); }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [onDone]);
  return <canvas ref={ref} className="k-noise" style={{ opacity: 1 }} aria-hidden="true" />;
};

const WorkflowDetailPage: React.FC<Props> = ({ slug, onNavigate }) => {
  const entry: PortfolioEntry | undefined = getEntryBySlug(slug);
  const chNo = useMemo(() => {
    const i = WORKFLOWS.findIndex((w) => w.slug === slug);
    return i >= 0 ? i + 1 : 0;
  }, [slug]);
  useEffect(() => { if (entry) track('workflow_view', entry.id); }, [entry?.id]);

  const [tuning, setTuning] = useState(true);
  const [intent, setIntent] = useState<InquiryIntent | null>(null);

  /* dial state */
  const dialRef = useRef<HTMLDivElement>(null);
  const dialA = useRef(0);
  const dragging = useRef(false);

  const shim: ProductRecord | null = useMemo(() => {
    if (!entry?.demo) return null;
    return {
      id: entry.id, slug: entry.slug, name: entry.title, category: entry.category,
      status: 'PUBLIC_DEMO', risk: 'low', humanApprovalRequired: entry.humanApprovalRequired,
      shortDescription: entry.jobToBeDone ?? '', description: entry.definition ?? '', buyer: entry.buyer ?? '',
      prompt: entry.demo.prompt, inputSchema: entry.demo.inputSchema, outputSchema: entry.demo.outputSchema,
      fixture: entry.demo.fixturePath ? { path: entry.demo.fixturePath, label: entry.demo.fixtureLabel ?? '', source: entry.demo.fixtureSource ?? '' } : null,
      demoStatus: { available: entry.demo.available, fixturePath: entry.demo.fixturePath, note: '' },
      validationReport: { status: 'available', path: entry.validationReport, note: '' },
      pricing: (entry.demo.legacyPricing as unknown as ProductRecord['pricing']) ?? { kitUsd: null, validationSprintUsd: null, enterprisePilot: null, currency: 'USD', proposed: true },
      limitations: entry.demo.legacyLimitations,
    };
  }, [entry?.id]);

  if (!entry || entry.type !== 'WORKFLOW' || !shim) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6 py-24" style={{ background: 'var(--konk-black)', color: 'var(--body)' }}>
        <div className="text-center space-y-4">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--meta)]">NO SIGNAL — {slug}</p>
          <button onClick={() => onNavigate('catalogue')} className="k-btn k-btn-acc">Back to the Floor</button>
        </div>
      </div>
    );
  }

  const zap = (dir: 1 | -1) => {
    const next = WORKFLOWS[(WORKFLOWS.findIndex((w) => w.slug === slug) + dir + WORKFLOWS.length) % WORKFLOWS.length];
    setTuning(true);
    onNavigate('workflow_detail', next.slug);
  };

  /* rotary dial */
  const dialMove = (e: React.PointerEvent) => {
    if (!dragging.current || !dialRef.current) return;
    const r = dialRef.current.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI + 90;
    const delta = ((a - dialA.current) % 360 + 540) % 360 - 180;
    if (Math.abs(delta) > 16) {
      dialA.current = a;
      zap(delta > 0 ? 1 : -1);
    }
  };

  const price = entry.pricing.kitFromUsd;

  return (
    <div className="min-h-screen px-3 sm:px-8 py-6 pb-28" style={{ background: 'var(--konk-black)', color: 'var(--body)' }} data-testid="workflow-tv">
      <div className="max-w-6xl mx-auto">
        {/* top bar */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => onNavigate('catalogue')} className="konk-link inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest cursor-pointer">
            <ArrowLeft size={16} /> THE FLOOR
          </button>
          <span className="k-osd">KONKRED PRODUCT TELEVISION · {entry.id}</span>
        </div>

        {/* THE SET */}
        <div className="k-tv p-3 sm:p-6 flex flex-col lg:flex-row gap-4 sm:gap-6">
          {/* screen */}
          <div className="k-screen flex-1 min-w-0">
            {tuning && <Static onDone={() => setTuning(false)} />}
            <div className="relative z-10 p-4 sm:p-7 space-y-6 max-h-[78vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              <div className="k-osd">CH {String(chNo).padStart(2, '0')}/{WORKFLOWS.length} · SIGNAL LOCKED · {entry.status.replace(/_/g, ' ')}</div>
              <h1 className="font-black-display text-2xl sm:text-4xl text-[var(--ink)]">{entry.title}</h1>
              <Typewriter as="p" text={entry.jobToBeDone ?? ''} speed={13} className="font-tw text-[13px] leading-relaxed max-w-2xl text-[var(--dim)]" />
              {/* tonight's programming: the real tool */}
              <MicroTool product={shim} fixtureKey={entry.legacySlug ?? undefined} />
              <Pattern entry={entry} />
              {/* oscilloscope corner */}
              <svg viewBox="0 0 200 60" className="w-40 h-12 opacity-50 pointer-events-none absolute right-4 bottom-3 hidden sm:block" aria-hidden="true">
                <polyline points="0,30 20,30 28,6 36,54 44,30 80,30 88,14 96,46 104,30 150,30 158,10 166,50 174,30 200,30" fill="none" stroke="var(--konk-red)" strokeWidth="2" />
              </svg>
            </div>
          </div>

          {/* side console */}
          <aside className="lg:w-44 shrink-0 flex lg:flex-col items-center justify-between gap-4 py-2">
            <div className="hidden lg:block font-black-display tracking-[0.22em] text-[13px] text-[var(--interactive-rest)]" style={{ writingMode: 'vertical-rl' }}>KONKRED <span className="text-[var(--konk-red)]">TV</span></div>
            <div className="text-center">
              <p className="font-mono text-[8px] tracking-[0.3em] text-[var(--meta)] mb-1">CHANNEL</p>
              <p className="font-black-display text-4xl text-[var(--interactive-rest)] tabular-nums">{String(chNo).padStart(2, '0')}</p>
            </div>
            {/* dial */}
            <div
              ref={dialRef}
              className="k-dial w-16 h-16"
              role="slider" aria-label="Zap channels" aria-valuenow={chNo} aria-valuemin={1} aria-valuemax={WORKFLOWS.length}
              onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
              onPointerMove={dialMove}
              onPointerUp={() => { dragging.current = false; }}
              title="Drag to zap channels"
            >
              <div className="absolute left-1/2 top-[6%] w-1.5 h-[26%] bg-[var(--interactive-rest)]" style={{ transformOrigin: '50% 190%', transform: `translateX(-50%) rotate(${-120 + (chNo - 1) * (240 / (WORKFLOWS.length - 1))}deg)` }} />
            </div>
            <div className="flex lg:flex-col gap-1.5">
              <button onClick={() => zap(-1)} className="w-9 h-8 bg-zinc-900 border-2 border-black text-zinc-400 font-mono text-xs cursor-pointer hover:text-white" aria-label="Previous channel">◀</button>
              <button onClick={() => zap(1)} className="w-9 h-8 bg-zinc-900 border-2 border-black text-zinc-400 font-mono text-xs cursor-pointer hover:text-white" aria-label="Next channel">▶</button>
            </div>
            {/* CTAs on the console */}
            <div className="lg:w-full space-y-2">
              <p className="font-black-display text-lg text-[var(--interactive-rest)] text-center">{price != null ? `$${price.toLocaleString()}` : 'ON REQ'}</p>
              <button onClick={() => { track('kit_cta_click', entry.id); track('checkout_start', entry.id); setIntent('workflow_kit'); }} className="k-btn k-btn-acc w-full !min-h-0 !px-3 !py-2.5 !text-[9px]">GET KIT</button>
              <button onClick={() => { track('sprint_request', entry.id); setIntent('validation_sprint'); }} className="k-btn w-full !min-h-0 !px-3 !py-2.5 !text-[9px]">SPRINT</button>
              <button onClick={() => { track('enterprise_request', entry.id); setIntent('enterprise_pilot'); }} className="k-btn w-full !min-h-0 !px-3 !py-2.5 !text-[9px]">PILOT</button>
            </div>
            <div className="k-led" aria-hidden="true" />
          </aside>
        </div>

        {/* below the set — honesty lines */}
        <div className="mt-6 space-y-3 max-w-3xl">
          <EvidenceLine entry={entry} onOpenValidation={() => onNavigate('validation')} />
          <ScopeReviewPanel entry={entry} />
        </div>
      </div>

      {intent && <ProductInquiryModal intent={intent} productName={entry.title} onClose={() => setIntent(null)} />}
    </div>
  );
};

export default WorkflowDetailPage;
