
import React from 'react';
import { Briefcase, MapPin, DollarSign, Users, Award, Zap, Code, ArrowUpRight, Globe, Shield, Star, ArrowLeft } from 'lucide-react';
import Badge from '../components/common/Badge.tsx';
import { PageView } from '../types.ts';

const jobOpenings = [
  { id: 1, title: 'Senior AI Architect', location: 'Remote (Global)', salary: '$180k - $250k', dept: 'Engineering', status: 'NEW', type: 'Full-time' },
  { id: 2, title: 'Protocol Security Engineer', location: 'London / Remote', salary: '$150k - $200k', dept: 'Security', status: 'HOT', type: 'Contract' },
  { id: 3, title: 'Lead AI Product Manager', location: 'NYC / Remote', salary: '$170k - $220k', dept: 'Product', status: 'NEW', type: 'Full-time' },
  { id: 4, title: 'Rust Backend Architect', location: 'San Francisco / Remote', salary: '$190k - $240k', dept: 'Core', status: 'HOT', type: 'Full-time' },
];

const CareerPage: React.FC<{ onNavigate: (page: PageView) => void }> = ({ onNavigate }) => {
  return (
    <div className="p-8 min-h-screen bg-void pt-28 font-sans">
      <div className="max-w-7xl mx-auto space-y-20 animate-in fade-in duration-1000">
        <button 
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 text-ghost hover:text-white transition-colors mb-8 text-[10px] uppercase tracking-widest font-mono group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> 
          RETURN_TO_BASE
        </button>

        <header className="text-center max-w-3xl mx-auto space-y-6 pb-12 border-b border-white/5">
          <Badge variant="purple" className="tracking-[0.4em]">Node Expansion Protocol</Badge>
          <h1 className="text-6xl md:text-7xl font-display font-bold text-white leading-tight">Build the Future of <span className="text-neon-purple">Structural Capital</span></h1>
          <p className="text-ghost-light text-xl font-light leading-relaxed">We are seeking elite architects, engineers, and strategists to build the operating system for AI commerce. Join a distributed node of global talent.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
           {[
             { title: 'Global Impact', icon: Globe, desc: 'Shape the next generation of AI ecosystems worldwide with a distributed-first culture.' },
             { title: 'Frontier Tech', icon: Zap, desc: 'Work with high-fidelity LLMs, autonomous agents, and deterministic protocols.' },
             { title: 'Premium Equity', icon: Star, desc: 'Industry-leading compensation, equity packages, and performance-based tokens.' },
           ].map((item, i) => (
             <div key={i} className="concrete-card rounded-3xl p-10 text-center hover:border-white/20 transition-all duration-500 bg-black/20">
                <div className="w-16 h-16 bg-neon-purple/10 rounded-2xl flex items-center justify-center text-neon-purple mx-auto mb-6 border border-neon-purple/20">
                    <item.icon size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-4">{item.title}</h3>
                <p className="text-sm text-ghost-light leading-relaxed font-light">{item.desc}</p>
             </div>
           ))}
        </div>

        <section className="concrete-card rounded-3xl overflow-hidden bg-black/40 border-white/5 shadow-2xl">
          <div className="p-10 border-b border-white/10 flex justify-between items-end bg-white/[0.02]">
            <div>
                <h2 className="text-3xl font-display font-bold text-white mb-2">Active Openings</h2>
                <p className="text-ghost-light text-sm font-light uppercase tracking-widest">Select a role to view technical requirements</p>
            </div>
            <button className="text-[10px] font-mono text-ghost hover:text-white transition-colors uppercase tracking-[0.2em] mb-2">
                Filter: All Departments
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-sm">
              <thead className="bg-void-300 text-ghost uppercase tracking-[0.3em] text-[10px]">
                <tr>
                  <th className="px-10 py-5 font-black">Position / designation</th>
                  <th className="px-10 py-5 font-black">department</th>
                  <th className="px-10 py-5 font-black">location</th>
                  <th className="px-10 py-5 text-right font-black">status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {jobOpenings.map((job) => (
                  <tr key={job.id} className="hover:bg-white/[0.03] transition-all cursor-pointer group">
                    <td className="px-10 py-8">
                       <h3 className="text-lg font-bold text-white group-hover:text-neon-purple transition-colors duration-300">{job.title}</h3>
                       <div className="flex gap-4 mt-2">
                            <span className="text-[10px] text-ghost font-mono uppercase tracking-widest">{job.type}</span>
                            <span className="text-[10px] text-ghost font-mono uppercase tracking-widest">•</span>
                            <span className="text-[10px] text-neon-purple font-mono uppercase tracking-widest">{job.salary}</span>
                       </div>
                    </td>
                    <td className="px-10 py-8 text-ghost-light font-light uppercase tracking-widest text-xs">{job.dept}</td>
                    <td className="px-10 py-8 text-ghost-light font-light flex items-center gap-2">
                        <MapPin size={14} className="text-ghost" /> {job.location}
                    </td>
                    <td className="px-10 py-8 text-right">
                       <Badge variant={job.status === 'NEW' ? 'cyan' : 'purple'}>{job.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-neon-purple/5 concrete-card rounded-[3rem] p-16 text-center border-neon-purple/20 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,rgba(143,0,16,0.1)_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            <h2 className="text-4xl font-display font-bold text-white mb-6 relative z-10">Network Manifesto</h2>
            <p className="text-ghost-light text-xl max-w-3xl mx-auto mb-12 font-light leading-relaxed relative z-10">
                At KONKRED, we foster a culture of relentless rigor, high agency, and radical transparency. We are not just building software; we are building the infrastructure of future intelligence.
            </p>
            <div className="flex flex-wrap justify-center gap-6 relative z-10">
                <button className="btn-primary py-5 px-12 text-sm font-black tracking-[0.3em] uppercase flex items-center gap-4 group">
                    View Team Charter <ArrowUpRight size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </button>
            </div>
        </section>

      </div>
    </div>
  );
};

export default CareerPage;
