/**
 * FooterArchive — OBSIDIAN SIGNAL system boundary.
 * Giant outlined wordmark, directory rails, product-family evidence rows
 * and a build stamp. Closed off by hazard tape: the edge of the system.
 */
import React from 'react';
import { ShieldCheck, FileText, Package, BookOpen, Mail } from 'lucide-react';
import { KonkredLogo } from './brand/KonkredLogo.tsx';
import { getPathForPage } from '../utils/routes.ts';
import { SITE } from '../src/config/site.ts';

const SystemFooter: React.FC = () => {
  const links = [
    { label: 'Catalogue', page: 'catalogue' as const },
    { label: 'Pricing', page: 'pricing' as const },
    { label: 'Validation', page: 'validation' as const },
    { label: 'Neural Audit', page: 'forge_audit' as const },
    { label: 'fullKONK_>', page: 'fullkonk' as const },
    { label: 'REDAEYE', page: 'redaeye' as const },
    { label: 'Strategic Advisory', page: 'advisory' as const },
    { label: 'Intel & Academy', page: 'intel' as const },
    { label: 'Documentation', page: 'documentation' as const },
    { label: 'Contact', page: 'contact' as const },
  ];

  return (
    <footer className="w-full text-[10px] font-mono mt-auto select-none relative overflow-hidden bg-void border-t-2 border-void-300">
      {/* hazard boundary cap */}
      <div className="k-hazard k-hazard-thin" aria-hidden="true" />

      {/* giant outlined wordmark — pure atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-[22vw] leading-none opacity-40"
        style={{ color: 'transparent', WebkitTextStroke: '1px var(--ghost)' }}
      >
        KONKRED
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-8 py-12 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10 pb-10 border-b border-void-300">

          {/* Column 1: Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <KonkredLogo size={26} animate={false} />
            </div>
            <p className="text-[9px] text-void-600 leading-relaxed uppercase tracking-wider">
              AI workflow marketplace and product platform. Data-driven product catalogue,
              neural audit, red-team diagnostics and product builds.
            </p>
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center gap-2 text-void-600">
                <ShieldCheck size={10} className="shrink-0" />
                <span className="uppercase text-[8px] tracking-wider">Model calls run server-side; keys never shipped to the browser.</span>
              </div>
            </div>
          </div>

          {/* Column 2: Platform Directory */}
          <div className="space-y-3 text-left">
            <h5 className="text-clinical-light font-bold tracking-[0.28em] text-[9px] uppercase pb-1 border-b border-void-300 inline-block">
              PLATFORM_DIRECTORY
            </h5>
            <nav className="flex flex-col gap-2 pt-1 uppercase" aria-label="Footer">
              {links.map(link => (
                <a
                  key={link.label}
                  href={getPathForPage(link.page)}
                  className="text-void-500 hover:text-signal-hot focus-visible:text-signal-hot transition-colors flex items-center gap-1.5 tracking-wider"
                >
                  <span aria-hidden="true" className="text-void-300">▸</span>
                  <span>{link.label.toUpperCase()}</span>
                </a>
              ))}
            </nav>
          </div>

          {/* Column 3: Product families — evidence rows */}
          <div className="space-y-3">
            <h5 className="text-clinical-light font-bold tracking-[0.28em] text-[9px] uppercase pb-1 border-b border-void-300 inline-block">
              PRODUCT_FAMILIES
            </h5>
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between text-void-600 bg-void-200 p-1.5 rounded-none border border-void-300">
                <span className="flex items-center gap-1.5 font-bold text-[8px] uppercase tracking-wider">
                  <Package size={9} className="text-signal" /> Workflow Products
                </span>
                <span className="text-clinical-light font-bold">15</span>
              </div>
              <div className="flex items-center justify-between text-void-600 bg-void-200 p-1.5 rounded-none border border-void-300">
                <span className="flex items-center gap-1.5 font-bold text-[8px] uppercase tracking-wider">
                  <FileText size={9} className="text-signal" /> Statuses
                </span>
                <span className="text-clinical-light font-bold">4</span>
              </div>
              <div className="flex items-center justify-between text-void-600 bg-void-200 p-1.5 rounded-none border border-void-300">
                <span className="flex items-center gap-1.5 font-bold text-[8px] uppercase tracking-wider">
                  <BookOpen size={9} className="text-signal" /> Demos
                </span>
                <span className="text-signal-hot font-black tracking-wider">FIXTURE-BACKED</span>
              </div>
            </div>
          </div>

          {/* Column 4: Honest status */}
          <div className="space-y-3">
            <h5 className="text-clinical-light font-bold tracking-[0.28em] text-[9px] uppercase pb-1 border-b border-void-300 inline-block">
              PRODUCT_STATUS
            </h5>
            <p className="text-[9px] text-void-600 leading-relaxed uppercase tracking-wider">
              Catalogue statuses are PUBLIC_DEMO, STANDARD_KIT, SUPERVISED_PILOT and
              ENTERPRISE_INTEGRATION. No product claims production maturity, certification
              or autonomous capability it does not have.
            </p>
            <span className="k-stamp-box mt-2 inline-block">NO FAKE CLAIMS</span>
          </div>

        </div>

        {/* Lower Sub-Footer: system status / build stamp */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 text-center md:text-left">
          <div className="space-y-1">
            <div className="text-clinical-light uppercase font-bold text-[9px] tracking-[0.22em]">
              © 2026 KONKRED.XYZ
            </div>
            <p className="text-[8px] text-void-550 max-w-xl leading-normal uppercase tracking-wider">
              AI outputs are decision-support only and require human review where indicated.
              Public demos use synthetic sample data and are never production decisions.
            </p>
          </div>
          <a
            href="mailto:ari@konkred.xyz"
            className="flex items-center gap-3 bg-void-100 border-2 border-void-300 hover:border-signal py-1.5 px-3 rounded-none text-void-500 uppercase text-[8px] tracking-[0.18em] hover:text-signal-hot transition-colors"
          >
            <Mail size={10} className="text-signal shrink-0" />
            <span>{SITE.domain} // {SITE.footer.version}</span>
          </a>
        </div>
      </div>
    </footer>
  );
};

export default SystemFooter;
