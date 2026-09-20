/**
 * Platform pages: /pricing, /sprint, /enterprise, /partners, /validation, /kits/:slug
 * Content comes from the portfolio manifest and the published packaging
 * reference (offer ladder, sprint scope, enterprise capabilities, OEM partner
 * categories). Ranges are labelled planning ranges; nothing is charged here —
 * checkout is test-mode.
 */
import React, { useEffect } from 'react';
import type { PageView } from '../types.ts';
import { ENTRIES, WORKFLOWS, SUITES, getEntryBySlug } from '../content/catalogue/portfolio.ts';
import { StatusChip, ValidationBadge, DesignScore } from '../components/portfolio/Evidence.tsx';
import { ProductInquiryModal, type InquiryIntent } from '../components/catalog/ProductInquiryModal.tsx';
import { track } from '../utils/analytics.ts';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

interface PageProps {
  onNavigate: (page: PageView, slug?: string) => void;
}

const Shell: React.FC<{ eyebrow: string; title: string; lead: string; back?: () => void; children: React.ReactNode }> = ({ eyebrow, title, lead, back, children }) => (
  <div className="min-h-screen pb-24 pt-6" style={{ background: 'var(--k-bg)', color: 'var(--k-ink)' }}>
    <div className="max-w-6xl mx-auto px-5 sm:px-10">
      {back && (
        <button onClick={back} className="inline-flex items-center gap-2 k-mono text-[11px] font-bold uppercase tracking-[0.2em] cursor-pointer mb-8" style={{ color: 'var(--k-amber)' }}>
          <ArrowLeft size={16} /> BACK
        </button>
      )}
      <div className="pb-8 border-b-4 space-y-4 brutal-rise" style={{ borderColor: 'var(--k-edge)' }}>
        <span className="k-badge">{eyebrow}</span>
        <h1 className="k-title text-4xl sm:text-6xl max-w-3xl">{title}</h1>
        <p className="text-[14px] leading-relaxed max-w-2xl" style={{ color: 'var(--k-mut)' }}>{lead}</p>
      </div>
      <div className="pt-9">{children}</div>
    </div>
  </div>
);

const InquiryButton: React.FC<{ intent: InquiryIntent; label: string; event: Parameters<typeof track>[0]; product?: string }> = ({ intent, label, event, product }) => {
  const [open, setOpen] = useStateSafe(false);
  return (
    <>
      <button
        onClick={() => { track(event, product); if (event === 'kit_cta_click') track('checkout_start', product); setOpen(true); }}
        className="k-btn k-btn-acc"
      >
        {label}
      </button>
      {open && <ProductInquiryModal intent={intent} productName={product ?? 'KONKRED platform'} onClose={() => setOpen(false)} />}
    </>
  );
};
// tiny wrapper so InquiryButton stays a single component
function useStateSafe(initial: boolean) {
  const [v, s] = React.useState(initial);
  return [v, s] as const;
}

/* ── /pricing ── */
export const PricingPage: React.FC<PageProps> = ({ onNavigate }) => {
  useEffect(() => { track('catalogue_view', 'pricing'); }, []);
  const ladder = [
    { name: 'Workflow Kit', range: '$97 – $297', note: 'one workflow: prompt, schemas, setup guide, public fixture, validator, approval instructions' },
    { name: 'Validation Sprint', range: '$1,500 – $10,000', note: 'fixed-scope: one workflow, one sample, one approver, one deliverable pack' },
    { name: 'Fixed-price Pilot', range: '$6,000 – $25,000', note: 'controlled pilot with named owner and acceptance measures' },
    { name: 'Managed workflow', range: '$1,500 – $15,000 / month', note: 'KONKRED-operated delivery with review and governance' },
    { name: 'Team / All-Catalog Workspace', range: '$599 – $4,000 / month', note: 'shared run history, policies, queues, evidence and exports' },
    { name: 'Enterprise setup', range: '$20,000 – $75,000 + recurring', note: 'SSO/RBAC, private tenant, connectors, audit logs, security review' },
  ];
  const fkTiers = [
    { name: 'FREE', price: '$0', accent: 'var(--k-cyan)', features: ['3 fullKONK generations / day', 'Free-tier models (Groq, Cerebras)', 'Output carries “Built with fullKONK_>”', 'Community support'] },
    { name: 'PRO', price: '$29/mo', accent: 'var(--k-amber)', features: ['Unlimited generations', 'All providers + smart routing', 'Watermark-free output', 'GitHub integration', 'Project history'], hot: true },
    { name: 'AGENCY', price: '$99/mo', accent: 'var(--k-violet)', features: ['Everything in Pro', 'White-label export', 'API access', '3 workspaces'] },
  ];

  return (
    <Shell eyebrow="Pricing" title="Offer ladder" lead="Planning ranges from the published packaging reference. Price includes model/tool usage, review time, support and governance. Exact quotes come from a scoping call — nothing is charged on this site.">

      {/* fullKONK_> subscription tiers — planned (owner strategy doc تجدیدنظر.md) */}
      <section aria-label="fullKONK subscription tiers" className="mb-12 space-y-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="k-title text-2xl sm:text-3xl">fullKONK_&gt; TIERS</h2>
          <span className="k-mono text-[9px] tracking-[0.25em] border-2 px-2 py-1" style={{ borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>
            PLANNED — FROM THE STRATEGY DOC · NOT LIVE YET · TEST-MODE FORMS ONLY
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 brutal-stagger">
          {fkTiers.map((tier) => (
            <div key={tier.name} className="k-slab p-6 flex flex-col gap-4" style={{ ['--slab-c' as string]: tier.accent, transform: 'rotate(0deg)' }}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="k-title text-xl">{tier.name}</h3>
                <span className="k-title text-2xl" style={{ color: tier.accent }}>{tier.price}</span>
              </div>
              <ul className="space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="text-[12px] flex items-start gap-2.5" style={{ color: 'var(--k-mut)' }}>
                    <CheckCircle2 size={13} className="shrink-0 mt-0.5" style={{ color: tier.accent }} />{f}
                  </li>
                ))}
              </ul>
              <InquiryButton
                intent={tier.hot ? 'all_catalog_workspace' : 'enterprise_pilot'}
                label={tier.name === 'FREE' ? 'JOIN WAITLIST' : `GET ${tier.name}`}
                event="checkout_start"
                product={`fullKONK ${tier.name} tier`}
              />
            </div>
          ))}
        </div>
        <p className="k-mono text-[9px] leading-relaxed" style={{ color: 'var(--k-mut)' }}>
          TIERS ARE A PUBLISHED PLAN, NOT A LIVE BILLING SYSTEM — PAYMENT IS NOT CONFIGURED. UNTIL THEN FULLKONK RUNS ON PROVIDER KEYS AND EVERY FORM JUST RECORDS YOUR REQUEST.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ladder.map((l) => (
          <div key={l.name} className="k-slab p-5 space-y-2" style={{ ['--slab-c' as string]: 'var(--k-amber)', transform: 'rotate(0deg)' }}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h3 className="k-title text-[15px]">{l.name}</h3>
              <span className="k-mono font-black text-[14px]" style={{ color: 'var(--k-amber)' }}>{l.range}</span>
            </div>
            <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--k-mut)' }}>{l.note}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 space-y-3">
        <h3 className="font-mono font-black uppercase tracking-widest text-xs">Workflow kit prices (catalogue)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {WORKFLOWS.filter((w) => w.pricing.kitFromUsd != null).map((w) => (
            <button key={w.slug} onClick={() => onNavigate('kit_detail', w.slug)} className="flex items-center justify-between gap-2 border-2 px-3.5 py-2.5 cursor-pointer hover:underline" style={{ borderColor: 'var(--k-line)', background: 'var(--k-panel)' }}>
              <span className="text-[11px] truncate">{w.title}</span>
              <span className="k-mono font-black text-[11px] shrink-0" style={{ color: 'var(--k-amber)' }}>${w.pricing.kitFromUsd?.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-10"><InquiryButton intent="all_catalog_workspace" label="Request a scoping call" event="enterprise_request" /></div>
    </Shell>
  );
};

/* ── /sprint ── */
export const SprintPage: React.FC<PageProps> = ({ onNavigate }) => {
  useEffect(() => { track('sprint_request', 'sprint-page'); }, []);
  const deliverables = [
    'Current-state workflow map', 'Data/privacy assessment', 'Configured workflow', 'Validation report',
    'Exception log', 'Human review checklist', 'Measured baseline and time-cost range', 'Pilot recommendation',
  ];
  return (
    <Shell eyebrow="Engagement" title="Validation Sprint" lead="Fixed scope: one workflow, one sample, one approver, one acceptance definition — and one fixed deliverable pack.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-2.5">
          <h3 className="k-title text-lg">You receive</h3>
          {deliverables.map((d) => (
            <p key={d} className="text-[12px] flex items-start gap-2.5"><CheckCircle2 size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--k-amber)' }} />{d}</p>
          ))}
        </div>
        <div className="space-y-3">
          <div className="border-2 border-black bg-[#171514] rounded-2xl p-5 space-y-2">
            <p className="font-mono font-black uppercase tracking-widest text-[10px] text-zinc-500">Sprint entry prices (from the catalogue)</p>
            <div className="space-y-1.5">
              {[...SUITES.filter((s) => s.pricing.sprintFromUsd).map((s) => [s.title, s.pricing.sprintFromUsd] as const),
                ...WORKFLOWS.filter((w) => w.pricing.sprintFromUsd).map((w) => [w.title, w.pricing.sprintFromUsd] as const)].slice(0, 12).map(([t, p]) => (
                <div key={t} className="flex justify-between text-[11px] gap-3"><span className="truncate" style={{ color: 'var(--k-mut)' }}>{t}</span><span className="k-mono shrink-0 ml-2 font-bold" style={{ color: 'var(--k-amber)' }}>${p?.toLocaleString()}</span></div>
              ))}
            </div>
          </div>
          <InquiryButton intent="validation_sprint" label="Book a Validation Sprint" event="sprint_request" />
        </div>
      </div>
    </Shell>
  );
};

/* ── /enterprise ── */
export const EnterprisePage: React.FC<PageProps> = () => {
  useEffect(() => { track('enterprise_request', 'enterprise-page'); }, []);
  const caps = ['SSO/RBAC', 'Private tenant or deployment', 'Customer policy packs', 'Retention and deletion', 'Connectors', 'Audit logs', 'Security review', 'Support/SLA', 'Training', 'Usage metering'];
  return (
    <Shell eyebrow="For organizations" title="Enterprise integration" lead="The governance layer around the workflows: identity, isolation, policy packs, retention and review queues. High-impact products ship as controlled pilots only.">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {caps.map((c) => <div key={c} className="border-2 px-3.5 py-3 k-mono text-[11px]" style={{ borderColor: 'var(--k-line)', background: 'var(--k-panel)' }}>{c}</div>)}
      </div>
      <div className="mt-8 border border-zinc-800 rounded-2xl p-5 bg-[#171514] space-y-2">
        <h3 className="k-title text-lg">Controlled-pilot catalogue</h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed">These products run only with a named human approver and a controlled environment:</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {ENTRIES.filter((e) => e.status === 'INTERNAL_CONTROLLED_PILOT' || e.status === 'CONDITIONAL_VALIDATION').map((e) => (
            <span key={e.slug} className="text-[10px] k-mono border-2 px-2 py-1" style={{ borderColor: 'var(--k-line)' }}>{e.title}</span>
          ))}
        </div>
      </div>
      <div className="mt-8"><InquiryButton intent="enterprise_pilot" label="Request Enterprise Pilot" event="enterprise_request" /></div>
    </Shell>
  );
};

/* ── /partners ── */
export const PartnersPage: React.FC<PageProps> = () => {
  const sectors = ['GRC consultancies', 'Accounting firms', 'Legal-ops providers', 'Proposal/RFP teams', 'Healthcare RCM vendors', 'Procurement advisors', 'Cloud consultancies', 'Atlassian partners'];
  return (
    <Shell eyebrow="Channel" title="Partners & OEM" lead="KONKRED workflows embed into existing advisory and platform relationships.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {sectors.map((s) => <div key={s} className="border-2 px-3.5 py-4 k-mono text-[11px] text-center" style={{ borderColor: 'var(--k-line)', background: 'var(--k-panel)' }}>{s}</div>)}
      </div>
      <div className="mt-8 border border-zinc-800 rounded-2xl p-5 bg-[#171514]">
        <h3 className="k-title text-lg mb-2">What partners get</h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed">Workflow kits at partner terms, joint validation sprints, and supervised pilots inside your delivery envelope. Partner contracts and margins are agreed directly — nothing automatic on this page.</p>
      </div>
      <div className="mt-8"><InquiryButton intent="enterprise_pilot" label="Start a partner conversation" event="enterprise_request" product="KONKRED Partners" /></div>
    </Shell>
  );
};

/* ── /validation ── */
export const ValidationPage: React.FC<PageProps> = ({ onNavigate }) => {
  useEffect(() => { track('validation_view'); }, []);
  const pass = ENTRIES.filter((e) => e.validationStatus === 'PASS').length;
  const cond = ENTRIES.filter((e) => e.validationStatus === 'CONDITIONAL').length;
  return (
    <Shell eyebrow="Evidence" title="Validation record" lead="Every entry carries a public-data preflight — a narrow reference test on public documents or datasets. PASS is not model accuracy and not certification.">
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[['preflight PASS', pass], ['CONDITIONAL', cond], ['total entries', ENTRIES.length]].map(([k, v]) => (
          <div key={k as string} className="k-slab p-4" style={{ ['--slab-c' as string]: 'var(--k-amber)', transform: 'rotate(0deg)' }}>
            <p className="k-title text-3xl" style={{ color: 'var(--k-amber)' }}>{v as number}</p>
            <p className="k-mono uppercase tracking-[0.25em] text-[9px] mt-1" style={{ color: 'var(--k-mut)' }}>{k as string}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {ENTRIES.map((e) => (
          <button key={e.slug} onClick={() => onNavigate(e.type === 'SUITE' ? 'suite_detail' : 'workflow_detail', e.slug)}
            className="w-full text-left border-2 px-4 py-3 cursor-pointer flex flex-wrap items-center gap-3 hover:underline"
            style={{ borderColor: 'var(--k-line)', background: 'var(--k-panel)' }}>
            <span className={`k-mono text-[8px] uppercase tracking-widest font-black border-2 px-1.5 py-0.5`} style={{ color: e.type === 'SUITE' ? 'var(--k-amber)' : 'var(--k-cyan)', borderColor: 'var(--k-line)' }}>{e.type}</span>
            <span className="text-[12px] flex-1 min-w-40">{e.title}</span>
            <DesignScore score={e.staticDesignScore} compact />
            <ValidationBadge status={e.validationStatus} />
            <span className="k-mono text-[9px]" style={{ color: 'var(--k-mut)' }}>{e.publicValidation.sources.length} source{e.publicValidation.sources.length === 1 ? '' : 's'} · {e.publicValidation.runDate}</span>
          </button>
        ))}
      </div>
      <p className="mt-6 text-[10px] font-mono text-zinc-600 leading-relaxed">
        Static design target — not measured model performance. Public-data preflight — narrow reference test.
        Next validation level (target-model evaluation on versioned fixtures) has not been run for any entry.
      </p>
    </Shell>
  );
};

/* ── /kits/:slug ── */
export const KitDetailPage: React.FC<PageProps & { slug: string }> = ({ onNavigate, slug }) => {
  const entry = getEntryBySlug(slug);
  if (!entry || entry.type !== 'WORKFLOW') {
    return (
      <Shell eyebrow="Kit" title="Kit not found" lead={`No workflow kit exists for "${slug}".`} back={() => onNavigate('catalogue')}>
        <InquiryButton intent="workflow_kit" label="Back to catalogue" event="kit_cta_click" />
      </Shell>
    );
  }
  const includes = ['Prompt (versioned)', 'Input/output schemas', 'Setup guide', 'Public fixture', 'Validator/checklist', 'Failure modes', 'Human approval instructions', 'Version and licence terms'];
  return (
    <Shell eyebrow={`Workflow kit · ${entry.category}`} title={entry.title} lead="A packaged kit your team runs inside your own environment: everything needed for one controlled workflow, nothing that executes external actions." back={() => onNavigate('workflow_detail', entry.slug)}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-2.5">
          <h3 className="font-mono font-black uppercase tracking-widest text-xs">Kit includes</h3>
          {includes.map((i) => <p key={i} className="text-[12px] flex items-start gap-2.5"><CheckCircle2 size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--k-amber)' }} />{i}</p>)}
          <div className="pt-3"><StatusChip status={entry.status} /></div>
        </div>
        <div className="space-y-4">
          <div className="k-slab p-5 space-y-2" style={{ ['--slab-c' as string]: 'var(--k-amber)', transform: 'rotate(0.6deg)' }}>
            <p className="k-mono uppercase tracking-[0.3em] text-[9px] font-bold" style={{ color: 'var(--k-mut)' }}>KIT PRICE</p>
            <p className="k-title text-3xl" style={{ color: 'var(--k-amber)' }}>
              {entry.pricing.kitFromUsd != null ? `$${entry.pricing.kitFromUsd.toLocaleString()}` : 'ON REQUEST'}
            </p>
            {entry.pricing.note && <p className="text-[9px] k-mono" style={{ color: 'var(--k-mut)' }}>{entry.pricing.note}</p>}
            <p className="text-[10px] k-mono pt-1" style={{ color: 'var(--k-mut)' }}>Test mode — the form records your order; payment is arranged manually, nothing is charged now.</p>
          </div>
          <InquiryButton intent="workflow_kit" label={`Order the ${entry.title} kit`} event="kit_cta_click" product={entry.title} />
        </div>
      </div>
    </Shell>
  );
};
