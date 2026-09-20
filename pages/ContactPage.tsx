import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Send, CheckCircle2, ShieldCheck, Mail, MessageSquare, ClipboardCheck } from 'lucide-react';
import { PageView } from '../types.ts';

import { databaseService } from '../services/database.ts';

interface ContactPageProps {
  onNavigate: (page: PageView) => void;
}

const ContactPage: React.FC<ContactPageProps> = ({ onNavigate }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    scope: 'Prompt Audit',
    budget: '$5,000 - $15,000',
    message: '',
  });

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim() || !formData.message.trim()) return;
    setIsSubmitting(true);
    try {
      await databaseService.submitContactMessage({
        name: formData.name.trim() || 'Anonymous',
        email: formData.email.trim(),
        subject: `[${formData.scope}] Inquiry (${formData.budget})`,
        message: formData.message.trim()
      });
      setIsSubmitted(true);
    } catch (err) {
      console.error("Contact submission error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-void text-text-primary pb-24 px-6 md:px-12">

      <div className="max-w-6xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 text-text-secondary hover:text-white transition-all text-xs font-mono uppercase tracking-widest mb-12 group"
          id="btn-back-to-home"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          SYS_RETURN_HOME
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start" id="contact-grid-container">
          {/* Header & Payment Badge info Left Column */}
          <div className="lg:col-span-5 space-y-8" id="left-info-column">
            <div className="space-y-4">
              <span className="text-[10px] font-mono tracking-[0.3em] text-accent-cyan uppercase bg-accent-cyan/10 px-3 py-1.5 rounded-full border border-accent-cyan/20">
                Liaison Protocol
              </span>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white font-display">
                Initiate Executive Engagement
              </h1>
              <p className="text-text-secondary leading-relaxed">
                Connect directly with the engineering leads of KONKRED to provision custom solutions, perform technical reviews, or configure enterprise prompt networks.
              </p>
            </div>

            {/* Direct Channels */}
            <div className="space-y-4 bg-surface-1/40 border border-white/5 p-6 rounded-2xl">
              <h3 className="text-xs font-mono tracking-widest text-text-secondary uppercase">
                Direct Channels
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail size={16} className="text-accent-cyan" />
                  <span className="text-sm font-mono text-white">ari@konkred.xyz</span>
                </div>
                <div className="flex items-center gap-3">
                  <MessageSquare size={16} className="text-accent-cyan" />
                  <span className="text-sm text-text-secondary">Direct Signal via Sandbox Hub</span>
                </div>
              </div>
            </div>

            {/* Honest commercial routing: no payment is taken on this site. */}
            <div className="space-y-5 bg-surface-1 border border-white/5 rounded-3xl p-8" id="engagement-routing-section">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent-cyan/10 text-accent-cyan rounded-lg"><ClipboardCheck size={20} /></div>
                <h3 className="text-base font-bold text-white font-display">Engagement routing</h3>
              </div>
              <p className="text-sm text-text-secondary">Use this form to scope a workflow kit, validation sprint, managed bench, or enterprise pilot. Payment is not collected on this site; commercial terms are confirmed after a human review.</p>
              <div className="grid grid-cols-3 gap-3 pt-1">
                {['scope', 'review', 'proposal'].map((step, index) => <div key={step} className="bg-surface-2/60 border border-white/5 p-3 text-center"><span className="block text-xs font-mono font-bold text-white">0{index + 1}</span><span className="text-[9px] text-text-secondary block font-mono mt-1 uppercase">{step}</span></div>)}
              </div>
              <div className="flex items-center gap-2 text-xs text-text-secondary pt-1"><ShieldCheck size={14} className="text-accent-cyan" /><span>No payment authorization is requested by this form.</span></div>
            </div>
          </div>

          {/* Form Right Column */}
          <div className="lg:col-span-7" id="right-form-column">
            <div className="bg-surface-1 border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-accent-cyan to-transparent opacity-60"></div>

              {isSubmitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-12 space-y-6"
                  id="submit-success-state"
                >
                  <div className="w-16 h-16 bg-accent-emerald/10 text-accent-emerald rounded-full flex items-center justify-center mx-auto mb-4 border border-accent-emerald/20">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-2xl font-bold text-white font-display">Inquiry received</h3>
                  <p className="text-text-secondary max-w-md mx-auto">
                    Your request was recorded for the KONKRED team. A human will review it before discussing scope, timing, or commercial terms.
                  </p>
                  <button
                    onClick={() => setIsSubmitted(false)}
                    className="px-6 py-2.5 bg-surface-2 text-white text-xs font-mono uppercase tracking-widest rounded-lg border border-white/10 hover:bg-surface-1 transition-all"
                  >
                    Transmit Another Request
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6" id="liaison-payload-form">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-text-secondary uppercase tracking-wider">Ident/Name</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="John Connor"
                        className="w-full bg-surface-2 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan/10 transition-all font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-text-secondary uppercase tracking-wider">Interface Link / Email</label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="ari@konkred.xyz"
                        className="w-full bg-surface-2 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan/10 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-text-secondary uppercase tracking-wider">Company / Entity</label>
                      <input
                        type="text"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        placeholder="Cyberdyne Systems"
                        className="w-full bg-surface-2 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan/10 transition-all font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-text-secondary uppercase tracking-wider">Target Scope</label>
                      <select
                        value={formData.scope}
                        onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                        className="w-full bg-surface-2 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-cyan transition-all font-mono appearance-none"
                      >
                        <option value="Prompt Audit">Prompt Audit (Konkred Audit)</option>
                        <option value="Arbitra 4 Core">Arbitra 4 Integration</option>
                        <option value="Custom Agent Setup">Bespoke AI workflows</option>
                        <option value="Enterprise Advisory">Full-Stack Advisory</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-mono text-text-secondary uppercase tracking-wider">Estimated Allocation (Budget)</label>
                    <div className="grid grid-cols-3 gap-3">
                      {['$5,000 - $15,000', '$15,000 - $50,000', '$50,000+'].map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setFormData({ ...formData, budget: tier })}
                          className={`py-3 text-xs font-mono rounded-xl border transition-all ${
                            formData.budget === tier
                              ? 'bg-accent-cyan/10 border-accent-cyan text-accent-cyan'
                              : 'bg-surface-2 border-white/10 text-text-secondary hover:border-white/20'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-mono text-text-secondary uppercase tracking-wider">Project Telemetry / Description</label>
                    <textarea
                      required
                      rows={4}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Outline your prompt architecture bottlenecks, multi-agent orchestration plans, or executive requirements..."
                      className="w-full bg-surface-2 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan/10 transition-all font-sans"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-white hover:bg-neutral-200 text-black py-4 rounded-xl text-xs font-mono tracking-widest uppercase transition-all flex items-center justify-center gap-2 font-bold"
                  >
                    {isSubmitting ? (
                      <span className="animate-pulse">STABILIZING UPLINK...</span>
                    ) : (
                      <>
                        TRANSMIT CORE PAYLOAD <Send size={14} />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
