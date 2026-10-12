
import React, { useState } from 'react';
import { Shield, Zap, Loader2, AlertTriangle, CheckCircle, Info, Terminal, Copy, Brain } from 'lucide-react';
import { aiService } from '../../services/ai.ts';
import Badge from '../common/Badge.tsx';
import Button from '../common/Button.tsx';
import { useToast } from '../../contexts/ToastContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { AuditResult } from '../../types.ts';

const SAMPLE_PROMPT = `Act as a senior legal analyst assistant. 
Task: Evaluate the provided NDA for high-risk clauses.
Constraints: 
1. Only output valid JSON.
2. Focus on indemnification and non-compete duration.
3. If unsure, flag as 'MANUAL_REVIEW_REQUIRED'.
Safety: Refuse to provide binding legal advice.`;

const AuditTool: React.FC = () => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const { showToast } = useToast();
  const { user } = useAuth();

  const handleAudit = async () => {
    if (!user) {
      showToast("Authentication required to access logic forge.", "error");
      return;
    }
    
    if (input.trim().length < 50) {
      showToast("Input length insufficient for meaningful logical analysis (min 50 chars).", "warning");
      return;
    }
    
    setIsLoading(true);
    setAuditResult(null);
    try {
      const result = await aiService.runAudit(input, user.id);
      setAuditResult(result);
      showToast("Audit sequence finalized. HUD score generated.", "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Neural uplink failure.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!auditResult) return;
    navigator.clipboard.writeText(JSON.stringify(auditResult, null, 2));
    showToast("Report packet copied to clipboard.", "info");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
      {/* Entry Module */}
      <div className="lg:col-span-7 space-y-6">
        <div className="concrete-card rounded-3xl overflow-hidden bg-black/40 border-white/5 flex flex-col h-full min-h-[600px]">
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-neon-cyan/10 text-neon-cyan">
                <Terminal size={14} />
              </div>
              <span className="text-[10px] font-mono font-bold text-white uppercase tracking-widest">Logic_Entry_Node</span>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setInput(SAMPLE_PROMPT)}
                className="text-[9px] font-mono text-ghost hover:text-white transition-colors"
              >
                [ LOAD_SAMPLE ]
              </button>
              <Badge variant="cyan">AES_256</Badge>
            </div>
          </div>
          
          <div className="flex-1 relative">
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste protocol architecture, system instructions, or logic maps here for autonomous verification..."
              className="w-full h-full bg-transparent p-12 text-sm font-mono text-ghost-light focus:outline-none resize-none leading-relaxed placeholder:text-ghost/30"
            />
            <div className="absolute bottom-6 right-6 text-[10px] font-mono text-ghost/50 uppercase">
              Length: {input.length} / 10,000
            </div>
          </div>

          <div className="p-8 border-t border-white/5 bg-void-300/30">
            <Button 
              onClick={handleAudit}
              isLoading={isLoading}
              disabled={!input.trim()}
              variant="primary"
              className="w-full py-6 text-sm"
              leftIcon={<Zap size={18} />}
            >
              Initialize Audit Sequence
            </Button>
          </div>
        </div>
      </div>

      {/* Results HUD */}
      <div className="lg:col-span-5">
        {auditResult ? (
          <div className="concrete-card rounded-3xl p-10 animate-in zoom-in-95 bg-black/60 border-neon-cyan/20 shadow-[0_0_50px_rgba(214,0,25,0.05)] h-full">
            <header className="flex justify-between items-start mb-10 pb-6 border-b border-white/5">
                <div>
                    <h3 className="text-xl font-display font-bold text-white mb-1 uppercase">Audit Findings</h3>
                    <p className="text-[9px] font-mono text-ghost uppercase tracking-widest">System_v4.2 // Logic_Verification</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleCopy} className="p-2 bg-white/5 rounded-lg text-ghost hover:text-white" title="Copy Report">
                        <Copy size={14} />
                    </button>
                </div>
            </header>

            <div className="text-center mb-12 relative">
              <div className="absolute inset-0 bg-neon-cyan/10 blur-3xl rounded-full" />
              <div className="relative">
                <div className="text-8xl font-black text-white font-display mb-2 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                    {auditResult.overallScore}
                </div>
                <Badge variant={auditResult.overallScore > 80 ? 'green' : auditResult.overallScore > 60 ? 'gold' : 'red'}>
                    FINAL_VERDICT_NODE
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 mb-12">
              {[
                { id: 'logic', label: 'Logical Integrity', val: auditResult.logic, icon: Brain, color: 'blue' },
                { id: 'safety', label: 'Guardrail Stability', val: auditResult.safety, icon: Shield, color: 'green' },
                { id: 'efficiency', label: 'Execution Velocity', val: auditResult.efficiency, icon: Zap, color: 'cyan' },
              ].map(stat => (
                <div key={stat.id} className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-ghost uppercase tracking-widest">
                      <stat.icon size={12} className={`text-neon-${stat.color}`} />
                      {stat.label}
                    </div>
                    <span className="text-sm font-black text-white">{stat.val}%</span>
                  </div>
                  <div className="h-1 bg-void-400 rounded-full overflow-hidden">
                    <div className={`h-full bg-neon-${stat.color} transition-all duration-1000 ease-out`} style={{ width: `${stat.val}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-8">
              <div className="p-6 bg-neon-cyan/5 border border-neon-cyan/10 rounded-2xl text-xs text-ghost-light leading-relaxed font-light italic relative">
                  <span className="absolute -top-2 -left-2 text-neon-cyan bg-void p-1 rounded-md"><Info size={12}/></span>
                  "{auditResult.summary}"
              </div>

              {auditResult.vulnerabilities?.length > 0 && (
                <div className="animate-in slide-in-from-bottom-2">
                  <h4 className="text-[10px] font-mono text-neon-red font-bold uppercase mb-4 flex items-center gap-2 tracking-[0.2em]">
                      <AlertTriangle size={14} /> Critical Technical Risks
                  </h4>
                  <ul className="space-y-3">
                      {auditResult.vulnerabilities.map((v, i) => (
                          <li key={i} className="text-xs text-ghost-light flex items-start gap-3 bg-neon-red/5 p-3 rounded-xl border border-neon-red/10">
                              <span className="text-neon-red font-bold">!</span> {v}
                          </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full concrete-card border-dashed border-white/10 rounded-[2.5rem] flex flex-col items-center justify-center p-16 text-center group bg-black/10">
             <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8 border border-white/5 group-hover:border-neon-cyan/30 transition-all duration-700">
                <Shield size={48} className="text-ghost opacity-20 group-hover:opacity-40 transition-opacity" />
             </div>
             <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-ghost">Awaiting_Packet_Uplink</p>
             <p className="text-xs text-ghost/40 mt-4 max-w-[200px] leading-relaxed">System ready for logical deconstruction. Paste architecture into logic entry node.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditTool;
