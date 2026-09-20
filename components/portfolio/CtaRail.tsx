/**
 * CTA rail — price + acquisition, nothing else.
 * Checkout/CRM are not configured: buttons open the test-mode inquiry form.
 * Detailed offer ranges live on /pricing, not here.
 */
import React, { useState } from 'react';
import type { PortfolioEntry } from '../../content/catalogue/types.ts';
import { ProductInquiryModal, type InquiryIntent } from '../catalog/ProductInquiryModal.tsx';
import { track } from '../../utils/analytics.ts';
import { ShoppingBag, FlaskConical, Rocket } from 'lucide-react';

const money = (usd: number | null) => (usd == null ? null : `$${usd.toLocaleString('en-US')}`);

export const CtaRail: React.FC<{ entry: PortfolioEntry }> = ({ entry }) => {
  const [intent, setIntent] = useState<InquiryIntent | null>(null);
  const p = entry.pricing;

  const open = (i: InquiryIntent, event: Parameters<typeof track>[0]) => {
    track(event, entry.id);
    if (i === 'workflow_kit') track('checkout_start', entry.id);
    setIntent(i);
  };

  const headline =
    entry.type === 'WORKFLOW'
      ? p.kitFromUsd != null ? { label: 'Workflow Kit', price: money(p.kitFromUsd) } : { label: 'Workflow Kit', price: 'on request' }
      : p.sprintFromUsd != null ? { label: 'Validation Sprint', price: `from ${money(p.sprintFromUsd)}` } : { label: 'Suite engagement', price: 'scoped' };

  const controlled = entry.status === 'INTERNAL_CONTROLLED_PILOT' || entry.status === 'CONDITIONAL_VALIDATION';

  return (
    <aside aria-label="Pricing" className="space-y-3">
      <div className="bg-[#171514] border-2 border-black rounded-2xl p-5 space-y-4 sticky top-24 shadow-[4px_4px_0px_0px_#0a0908]">
        <div>
          <p className="font-mono uppercase tracking-widest text-[9px] text-zinc-500">{headline.label}</p>
          <p className="font-mono font-black text-2xl text-amber-400 mt-0.5">{headline.price}</p>
        </div>

        <div className="space-y-2">
          {entry.type === 'WORKFLOW' && (
            <button
              onClick={() => open('workflow_kit', 'kit_cta_click')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 font-mono font-black text-[11px] uppercase tracking-widest border-2 rounded-xl cursor-pointer brutal-press bg-amber-500 text-black border-black hover:bg-black hover:text-amber-400"
            >
              <ShoppingBag size={14} /> Get the Kit
            </button>
          )}
          <button
            onClick={() => open('validation_sprint', 'sprint_request')}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 font-mono font-black text-[11px] uppercase tracking-widest border-2 rounded-xl transition-all cursor-pointer ${entry.type === 'WORKFLOW' ? 'border-zinc-700 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400' : 'bg-cyan-500 text-black border-black hover:bg-black hover:text-cyan-400'}`}
          >
            <FlaskConical size={14} /> Validation Sprint
          </button>
          <button
            onClick={() => open('enterprise_pilot', controlled ? 'controlled_pilot_request' : 'enterprise_request')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 font-mono font-black text-[11px] uppercase tracking-widest border-2 rounded-xl cursor-pointer brutal-press bg-purple-500 text-black border-black hover:bg-black hover:text-purple-400"
          >
            <Rocket size={14} /> {controlled ? 'Controlled Pilot' : 'Enterprise Pilot'}
          </button>
        </div>

        <p className="text-[9px] font-mono text-zinc-600 leading-relaxed">
          Test mode — the form records your request, nothing is charged.
        </p>
      </div>
      {intent && (
        <ProductInquiryModal intent={intent} productName={entry.title} onClose={() => setIntent(null)} />
      )}
    </aside>
  );
};
