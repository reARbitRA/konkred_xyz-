import React from 'react';
import { AppData } from '../types';

interface HeroProps {
  data: AppData['hero'];
}

const Hero: React.FC<HeroProps> = ({ data }) => {
  return (
    <section className="relative pt-32 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
      {/* Decorative Grid Background (Local to Hero) */}
      <div className="absolute inset-0 z-0 opacity-[0.15] grid-bg pointer-events-none" />

      {/* Status Indicator */}
      <div className="relative z-10 mb-8 inline-flex items-center gap-2 px-3 py-1 rounded-none border border-signal-line bg-signal-wash">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-signal-hot opacity-75"></span>
          <span className="relative inline-flex rounded-none h-2 w-2 bg-signal"></span>
        </span>
        <span className="text-[10px] font-mono tracking-widest text-signal-hot">{data.status}</span>
      </div>

      {/* Headlines */}
      <h1 className="relative z-10 text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
        {data.headline}
      </h1>
      <p className="relative z-10 text-zinc-400 max-w-2xl text-lg font-light leading-relaxed">
        {data.subheadline}
      </p>

      {/* Decorative lines */}
      <div className="relative z-10 mt-16 w-full max-w-xs flex items-center justify-between text-zinc-800">
        <div className="h-px w-12 bg-current"></div>
        <div className="h-2 w-2 border border-current rotate-45"></div>
        <div className="h-px w-12 bg-current"></div>
      </div>
    </section>
  );
};

export default Hero;