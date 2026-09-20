import React, { useEffect, useState } from 'react';
import { Menu, X, Search, LogOut, User as UserIcon, Package, ShieldCheck, Hammer, Cpu, Terminal } from 'lucide-react';
import { KonkredLogo } from './brand/KonkredLogo.tsx';
import type { PageView, User } from '../types.ts';
import { getPathForPage } from '../utils/routes.ts';

interface NavbarProps {
  onNavigate: (page: PageView) => void;
  currentPage: PageView;
  user: User | null;
  onLogout: () => Promise<void>;
  onOpenCmd?: () => void;
}

const links: { label: string; page: PageView }[] = [
  { label: 'Benches', page: 'catalogue' }, { label: 'Offers', page: 'pricing' },
  { label: 'Audit', page: 'forge_audit' }, { label: 'Build', page: 'fullkonk' },
  { label: 'Advisory', page: 'advisory' }, { label: 'Intel', page: 'intel' },
];

const Navbar: React.FC<NavbarProps> = ({ onNavigate, currentPage, user, onLogout, onOpenCmd }) => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const listener = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', listener, { passive: true });
    return () => window.removeEventListener('scroll', listener);
  }, []);
  const go = (page: PageView) => { onNavigate(page); setOpen(false); };
  const navigateFromAnchor = (event: React.MouseEvent<HTMLAnchorElement>, page: PageView) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault(); go(page);
  };

  return <>
    <header className={`fixed top-0 left-0 right-0 z-50 bg-[rgba(10,9,8,.94)] backdrop-blur-md border-b transition-[box-shadow] duration-150 ${scrolled ? 'shadow-[0_6px_18px_rgba(0,0,0,.32)]' : ''}`} style={{ borderColor: 'var(--line-1)' }}>
      <div className="hazard hazard-thin" />
      <div className="max-w-[1400px] mx-auto h-[68px] px-5 flex items-center gap-4">
        <a href={getPathForPage('landing')} onClick={(event) => navigateFromAnchor(event, 'landing')} className="group flex items-center gap-2.5 shrink-0">
          <span className="group-hover:drop-shadow-[0_0_8px_rgba(255,26,46,.6)]"><KonkredLogo size={28} /></span>
          <span className="hidden sm:flex flex-col"><b className="font-black-display text-base text-[var(--ink)]">KONKRED</b><span className="font-mono text-[8px] uppercase tracking-[.22em] text-[var(--faint)]">workflow floor</span></span>
        </a>
        {onOpenCmd && <button onClick={onOpenCmd} className="hidden lg:flex items-center gap-2 ml-3 px-3 py-2 border bg-[var(--surface-sunken)] border-[var(--line-1)] text-[var(--meta)] hover:border-[var(--konk-red)] hover:text-[var(--konk-red-glow)] font-mono text-[9px] uppercase tracking-[.18em]">
          <Search size={12} /> search benches <span className="keycap !py-1 !px-1.5 ml-1">⌘K</span>
        </button>}
        <nav className="hidden xl:flex items-center gap-1 ml-auto">
          {links.map(({ label, page }) => <a key={page} href={getPathForPage(page)} onClick={(event) => navigateFromAnchor(event, page)} className={`konk-link px-2.5 py-2 font-mono text-[9px] uppercase tracking-[.18em] ${currentPage === page ? 'text-[var(--konk-red-glow)]' : 'text-[var(--interactive-rest)]'}`}>{label}</a>)}
        </nav>
        <div className="ml-auto xl:ml-3 hidden md:flex items-center gap-3">
          {user ? <>
            <button onClick={() => go('account')} className="konk-link text-right"><span className="block font-mono text-[9px] uppercase tracking-[.15em] text-[var(--ink)]">{user.name}</span><span className="block font-mono text-[8px] uppercase tracking-[.18em] text-[var(--meta)]">{user.tier} account</span></button>
            <button onClick={() => void onLogout()} className="konk-item p-2 border border-[var(--line-1)]" aria-label="Sign out"><LogOut size={14} /></button>
          </> : <>
            <a href={getPathForPage('enter')} onClick={(event) => navigateFromAnchor(event, 'enter')} className="konk-link font-mono text-[9px] uppercase tracking-[.18em]">sign in</a>
            <a href={getPathForPage('join_network')} onClick={(event) => navigateFromAnchor(event, 'join_network')} className="k-btn k-btn-acc !min-h-0 !py-2.5 !px-3 !text-[9px]">request access</a>
          </>}
        </div>
        <button onClick={() => setOpen(true)} className="md:hidden ml-auto konk-item border border-[var(--line-1)] p-2.5" aria-label="Open navigation"><Menu size={17} /></button>
      </div>
    </header>

    {open && <div className="fixed inset-0 z-[70] bg-[rgba(10,9,8,.84)] backdrop-blur-sm md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <aside className="ml-auto h-full w-[min(92vw,380px)] bg-[var(--konk-ash)] border-l border-[var(--line-1)] p-5 flex flex-col">
        <div className="flex items-center justify-between pb-5 border-b border-[var(--line-1)]"><div className="flex items-center gap-3"><KonkredLogo size={27}/><span className="font-black-display text-lg">KONKRED</span></div><button onClick={() => setOpen(false)} className="konk-item border border-[var(--line-1)] p-2" aria-label="Close navigation"><X size={16}/></button></div>
        <p className="font-mono text-[9px] uppercase tracking-[.28em] text-[var(--meta)] mt-6 mb-2">// navigation</p>
        <div className="space-y-1">
          {[
            [Package, 'workflow floor', 'catalogue'], [ShieldCheck, 'auditor', 'forge_audit'], [Hammer, 'fullKONK', 'fullkonk'], [Cpu, 'advisory', 'advisory'], [Terminal, 'intel', 'intel'], [UserIcon, user ? 'account' : 'sign in', user ? 'account' : 'enter'],
          ].map(([IconType, label, page]) => {
            const Icon = IconType as React.ElementType;
            return <button key={String(page)} onClick={() => go(page as PageView)} className="group w-full flex items-center justify-between p-3 border border-transparent hover:border-[var(--konk-red)] text-left"><span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[.18em] text-[var(--interactive-rest)] group-hover:text-[var(--konk-red-glow)]"><Icon size={14}/>{label as string}</span><span className="text-[var(--faint)] group-hover:text-[var(--konk-red-glow)]">→</span></button>;
          })}
        </div>
        <div className="mt-auto pt-5 border-t border-[var(--line-1)]">
          {user ? <button onClick={async () => { await onLogout(); setOpen(false); }} className="k-btn w-full"><LogOut size={14}/> sign out</button> : <button onClick={() => go('join_network')} className="k-btn k-btn-acc w-full">request access</button>}
        </div>
      </aside>
    </div>}
  </>;
};
export default Navbar;
