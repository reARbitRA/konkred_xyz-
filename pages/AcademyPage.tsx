
import React, { useState } from 'react';
import { BookOpen, Play, CheckCircle, Clock, Zap, Award, ChevronRight, Star, Lock, Shield, ArrowLeft, X, Layout, FileText, Check, Activity } from 'lucide-react';
import Badge from '../components/common/Badge.tsx';
import { PageView } from '../types.ts';

const courses = [
  { 
    id: 'C1', 
    title: 'Asset Logic Engineering', 
    progress: 65, 
    duration: '12h', 
    lessons: 24, 
    level: 'Advanced', 
    color: 'purple',
    desc: 'Master the formal verification methods for prompt architectures and autonomous agent logic.',
    modules: [
        { title: 'Deterministic Logic Gates', completed: true, duration: '45m' },
        { title: 'Schema Validation Protocols', completed: true, duration: '60m' },
        { title: 'Adversarial Testing', completed: false, duration: '90m', current: true },
        { title: 'Final Certification', completed: false, duration: '120m' },
    ]
  },
  { 
    id: 'C2', 
    title: 'DCF Models for SaaS', 
    progress: 10, 
    duration: '8h', 
    lessons: 15, 
    level: 'Enterprise', 
    color: 'cyan',
    desc: 'Financial modeling for AI assets. Learn to value structural capital in a decentralized market.',
    modules: [
        { title: 'Revenue Recognition', completed: true, duration: '30m' },
        { title: 'Churn Analysis', completed: false, duration: '45m', current: true },
        { title: 'Terminal Value Config', completed: false, duration: '60m' },
    ]
  },
  { 
    id: 'C3', 
    title: 'Zero-Hallucination Prompting', 
    progress: 100, 
    duration: '4h', 
    lessons: 8, 
    level: 'Core', 
    color: 'green',
    desc: 'Foundational techniques for creating deterministic, compliance-ready system prompts.',
    modules: [
        { title: 'Context Window Management', completed: true, duration: '20m' },
        { title: 'Safety Guardrails', completed: true, duration: '40m' },
        { title: 'Output Formatting', completed: true, duration: '30m' },
    ]
  },
];

const AcademyPage: React.FC<{ onNavigate: (page: PageView) => void }> = ({ onNavigate }) => {
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  
  const activeCourse = courses.find(c => c.id === activeCourseId);

  return (
    <div className="p-8 min-h-screen bg-void pt-28 font-sans">
      <div className="max-w-7xl mx-auto space-y-16 animate-in fade-in duration-1000">
        <button 
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 text-ghost hover:text-white transition-colors mb-8 text-[10px] uppercase tracking-widest font-mono group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> 
          RETURN_TO_BASE
        </button>

        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 pb-12 border-b border-white/5">
          <div className="max-w-2xl">
            <h1 className="text-6xl font-display font-bold text-white mb-6">KONKRED <span className="text-neon-purple">Academy</span></h1>
            <p className="text-ghost-light text-xl font-light leading-relaxed">The premier educational protocol for structural capital architects. Deconstruct frameworks, master methodologies, and certify your assets.</p>
          </div>
          <div className="flex gap-8 p-6 concrete-card rounded-2xl bg-black/40">
            <div className="text-right">
              <div className="text-[10px] text-ghost font-mono uppercase tracking-[0.2em] mb-1">Architect Tier</div>
              <div className="text-2xl font-black text-neon-purple font-mono">Lvl 4 / Senior</div>
            </div>
            <div className="w-14 h-14 rounded-full border-2 border-neon-purple/30 flex items-center justify-center bg-neon-purple/5 shadow-[0_0_20px_rgba(143,0,16,0.2)]">
              <Award className="text-neon-purple" size={28} />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {courses.map((course) => (
            <div key={course.id} className="concrete-card rounded-3xl overflow-hidden group hover:border-neon-cyan/30 transition-all duration-500 bg-black/20 flex flex-col cursor-default">
                <div className="relative p-10 flex-grow">
                    <div className="flex justify-between items-start mb-8">
                        <div className={`w-14 h-14 rounded-2xl bg-neon-${course.color}/10 flex items-center justify-center text-neon-${course.color} border border-neon-${course.color}/20`}>
                            <BookOpen size={28} />
                        </div>
                        <Badge variant={course.level === 'Enterprise' ? 'cyan' : course.level === 'Advanced' ? 'purple' : 'green'}>
                            {course.level}
                        </Badge>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-neon-cyan transition-colors duration-300 leading-tight">{course.title}</h3>
                    <p className="text-sm text-ghost-light leading-relaxed font-light mb-8">{course.desc}</p>
                    <div className="flex items-center gap-6 text-[10px] font-mono text-ghost tracking-widest uppercase">
                        <span className="flex items-center gap-2"><Clock size={12} className="text-ghost" /> {course.duration}</span>
                        <span className="flex items-center gap-2"><Zap size={12} className="text-ghost" /> {course.lessons} Units</span>
                    </div>
                </div>
                <div className="p-10 bg-white/[0.03] border-t border-white/5 flex items-center justify-between">
                    <div className="flex-1">
                        <div className="flex justify-between text-[10px] font-mono text-ghost uppercase mb-3 tracking-widest">
                            <span>Syllabus Progress</span>
                            <span className="text-white font-bold">{course.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-void-400 rounded-full overflow-hidden">
                            <div className="h-full bg-neon-cyan transition-all duration-1000 ease-in-out" style={{ width: `${course.progress}%` }} />
                        </div>
                    </div>
                    <button 
                      onClick={() => setActiveCourseId(course.id)}
                      className="ml-6 w-12 h-12 bg-neon-cyan text-black rounded-full flex items-center justify-center hover:shadow-[0_0_20px_rgba(255,149,0,0.4)] transition-all hover:scale-110"
                    >
                        {course.progress === 100 ? <CheckCircle size={20} /> : <Play size={20} className="ml-1" />}
                    </button>
                </div>
            </div>
          ))}
        </div>

        <section className="mt-20 py-20 bg-void-300/30 rounded-3xl border border-white/5 p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-neon-purple/5 to-transparent pointer-events-none" />
            <div className="flex flex-col lg:flex-row items-center justify-between gap-12 relative z-10">
                <div className="max-w-xl">
                    <Badge variant="purple" className="mb-6">KONKRED Academy</Badge>
                    <h2 className="text-4xl font-display font-bold text-white mb-6">Become a <span className="text-neon-purple">KONKRED Architect</span></h2>
                    <p className="text-ghost-light text-lg font-light leading-relaxed mb-8">Work through the KONKRED technical curriculum to unlock advanced platform access and exclusive fullKONK_exclusive fullKONK_&gt; modulesgt; modules.</p>
                    <button className="btn-primary py-4 px-10 text-xs font-black tracking-widest uppercase flex items-center gap-3">
                        Start Coursework <ChevronRight size={16} />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-6 w-full lg:w-auto">
                    {[
                        { label: 'Courses', value: '6', icon: Shield },
                        { label: 'Modules', value: '24', icon: Award },
                        { label: 'Hands-On Labs', value: '8', icon: Star },
                        { label: 'Completion Badges', value: '12', icon: Lock },
                    ].map((stat, i) => (
                        <div key={i} className="concrete-card p-8 rounded-2xl flex flex-col items-center text-center">
                            <stat.icon className="text-neon-purple mb-4" size={24} />
                            <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                            <div className="text-[10px] font-mono text-ghost uppercase tracking-widest">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
      </div>

      {/* Course Player Overlay */}
      {activeCourse && (
        <div className="fixed inset-0 z-[100] bg-void animate-in slide-in-from-bottom duration-500 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="h-20 border-b border-white/5 bg-black/80 backdrop-blur-xl flex justify-between items-center px-8 shrink-0">
                <div className="flex items-center gap-6">
                    <button 
                        onClick={() => setActiveCourseId(null)}
                        className="p-2 hover:bg-white/5 rounded-full text-ghost hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-white uppercase tracking-tight">{activeCourse.title}</h2>
                        <div className="flex items-center gap-3 text-[10px] font-mono text-ghost uppercase tracking-widest">
                            <span className={`text-neon-${activeCourse.color}`}>• Live Session</span>
                            <span>Unit 3 of {activeCourse.lessons}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button className="px-6 py-3 border border-white/10 rounded-xl text-[10px] font-bold text-white uppercase tracking-widest hover:bg-white/5 transition-all">
                        Resources
                    </button>
                    <button className="px-6 py-3 bg-neon-cyan text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:shadow-neon-cyan transition-all">
                        Take Quiz
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 bg-black p-8 flex items-center justify-center relative group">
                    {/* Video Player Placeholder */}
                    <div className="w-full max-w-5xl aspect-video bg-void-200 rounded-2xl border border-white/5 relative overflow-hidden shadow-2xl flex items-center justify-center">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                        <div className="w-24 h-24 bg-white/5 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/10 cursor-pointer hover:scale-110 transition-transform group/play">
                            <Play size={32} className="ml-2 text-white fill-white group-hover/play:text-neon-cyan group-hover/play:fill-neon-cyan transition-colors" />
                        </div>
                        <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/80 to-transparent">
                            <div className="h-1 w-full bg-white/20 rounded-full mb-4 overflow-hidden cursor-pointer group/seek">
                                <div className="h-full bg-neon-cyan w-1/3 relative">
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/seek:opacity-100 shadow-lg" />
                                </div>
                            </div>
                            <div className="flex justify-between items-center text-xs font-mono font-bold text-white">
                                <span>14:20 / 45:00</span>
                                <div className="flex gap-4">
                                    <span>HD</span>
                                    <span>CC</span>
                                    <span>1.0x</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar Syllabus */}
                <div className="w-96 bg-void-100 border-l border-white/5 flex flex-col shrink-0">
                    <div className="p-6 border-b border-white/5">
                        <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-1">Course Syllabus</h3>
                        <p className="text-[10px] text-ghost font-mono">Knowledge Uplink v4.2</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {activeCourse.modules?.map((mod, i) => (
                            <div 
                                key={i} 
                                className={`p-4 rounded-xl border transition-all cursor-pointer group ${
                                    mod.current 
                                        ? 'bg-neon-cyan/5 border-neon-cyan/20' 
                                        : 'bg-black/20 border-transparent hover:bg-white/5'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${mod.current ? 'text-neon-cyan' : 'text-ghost'}`}>
                                        Module 0{i+1}
                                    </span>
                                    {mod.completed && <Check size={14} className="text-neon-green" />}
                                    {mod.current && <Activity size={14} className="text-neon-cyan animate-pulse" />}
                                    {!mod.completed && !mod.current && <Lock size={12} className="text-ghost opacity-50" />}
                                </div>
                                <h4 className={`text-sm font-bold mb-1 ${mod.current ? 'text-white' : 'text-ghost-light group-hover:text-white'}`}>
                                    {mod.title}
                                </h4>
                                <div className="flex items-center gap-2 text-[10px] text-ghost">
                                    <Clock size={10} /> {mod.duration}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-6 border-t border-white/5 bg-void-200">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                                <Award size={18} className="text-white" />
                            </div>
                            <div>
                                <p className="text-[10px] text-ghost uppercase tracking-widest">Course Completion</p>
                                <p className="text-sm font-bold text-white">Certificate Available</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AcademyPage;
