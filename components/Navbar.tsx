import React, { useState, useEffect } from 'react';
import { KonkredLogo } from './brand/KonkredLogo.tsx';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Menu, X, Search, User as UserIcon, 
  LogOut, Terminal, Cpu, Hammer, Home, ChevronRight, Shield, ShieldCheck, Package 
} from 'lucide-react';
import { PageView, User } from '../types.ts';
import { getPathForPage } from '../utils/routes.ts';

interface NavbarProps {
  onNavigate: (page: PageView) => void;
  currentPage: PageView;
  user: User | null;
  onLogout: () => Promise<void>;
  onOpenCmd?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ 
  onNavigate, 
  currentPage, 
  user, 
  onLogout,
  onOpenCmd 
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const publicNavItems = [
    { label: 'Catalogue', page: 'catalogue' as PageView },
    { label: 'Pricing', page: 'pricing' as PageView },
    { label: 'Audit', page: 'forge_audit' as PageView },
    { label: 'fullKONK_>', page: 'fullkonk' as PageView },
    { label: 'Advisory', page: 'advisory' as PageView },
    { label: 'Intel', page: 'intel' as PageView },
    { label: 'Academy', page: 'academy' as PageView },
  ];

  const getPageTitle = (page: PageView) => {
    switch (page) {
      case 'landing': return 'BASE SYSTEM';
      case 'catalogue': return 'PRODUCT CATALOGUE';
      case 'suite_detail': return 'SUITE';
      case 'workflow_detail': return 'WORKFLOW TOOL';
      case 'kit_detail': return 'WORKFLOW KIT';
      case 'pricing': return 'PRICING';
      case 'validation': return 'VALIDATION';
      case 'sprint': return 'VALIDATION SPRINT';
      case 'enterprise': return 'ENTERPRISE';
      case 'partners': return 'PARTNERS';
      case 'forge_audit': return 'AUDITOR';
      case 'fullkonk': return 'fullKONK_>';
      case 'redaeye': return 'REDAEYE';
      case 'account': return 'ACCOUNT';
      case 'not_found': return '404';
      default: return 'CONSOLE';
    }
  };

  const handleNav = (page: PageView) => {
    onNavigate(page);
    setIsOpen(false);
  };

  return (
    <>
      {/* Hazard boundary cap */}
      <div className="fixed top-0 left-0 right-0 h-1.5 k-hazard z-50 pointer-events-none" aria-hidden="true" />

      {/* Primary Sticky Header */}
      <motion.nav
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-150 w-full select-none ${
          isScrolled 
            ? 'py-3 bg-void-100 border-b-4 border-black shadow-brutalist' 
            : 'py-4 bg-void-100 border-b-4 border-black'
        }`}
        style={{ background: 'var(--k-bg)' }}
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-8 flex items-center justify-between">
          
          {/* Logo & Platform ID */}
          <a 
            href={getPathForPage('landing')}
            className="flex items-center gap-3 cursor-pointer group pr-4 shrink-0" 
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                e.preventDefault();
                handleNav('landing');
              }
            }}
          >
            <div className="transition-transform duration-150 group-hover:scale-105">
              <KonkredLogo size={30} />
            </div>
            <div className="flex flex-col text-left">
              <p className="text-[8px] text-void-600 font-mono tracking-wider uppercase">AI WORKFLOW PLATFORM</p>
            </div>
          </a>

          {/* Active Module Indicator (Only shown on mobile/tablet) */}
          {user && (
            <div className="lg:hidden flex items-center gap-1.5 bg-black border-2 border-black py-0.5 px-2.5 rounded-none">
              <span className="w-1.5 h-1.5 bg-signal rounded-none animate-pulse" />
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-white">
                {getPageTitle(currentPage)}
              </span>
            </div>
          )}

          {/* Search Trigger (Desktop) — recessed command well */}
          {!user && onOpenCmd && (
            <button
              type="button"
              onClick={onOpenCmd}
              className="hidden lg:flex items-center gap-2.5 k-well hover:border-signal border-2 border-void-300 rounded-none px-3 py-1.5 select-none cursor-pointer transition-all duration-150 w-44 xl:w-52 text-left ml-4"
              aria-label="Open command palette"
            >
              <Search size={11} className="text-void-550 shrink-0" />
              <span className="text-[9px] font-mono text-void-500 tracking-wider truncate">SEARCH CORE_</span>
              <kbd className="k-keycap ml-auto shrink-0">⌘K</kbd>
            </button>
          )}

          {/* Public Menu Links (Desktop) */}
          <div className="hidden md:flex items-center gap-4 lg:gap-6 ml-auto px-4">
            {/* REDAEYE Direct Nav Entry */}
            <a
              href={getPathForPage('redaeye')}
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                  e.preventDefault();
                  handleNav('redaeye');
                }
              }}
              className={`relative flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest font-black border-2 transition-all duration-200 group/redaeye ${
                currentPage === 'redaeye'
                  ? 'bg-signal text-white border-signal-hot shadow-[4px_4px_0_#060505]'
                  : 'bg-black text-signal-hot border-signal-deep hover:bg-signal hover:text-white hover:border-signal-hot hover:shadow-[4px_4px_0_#060505,0_0_16px_rgba(214,0,25,0.35)]'
              }`}
            >
              <Shield size={12} className="shrink-0 animate-pulse text-signal-hot group-hover/redaeye:text-white" />
              <span>REDAEYE</span>
            </a>

            {publicNavItems.map((item) => {
              const isActive = currentPage === item.page;
              return (
                <a
                  key={item.label}
                  href={getPathForPage(item.page)}
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                      e.preventDefault();
                      handleNav(item.page);
                    }
                  }}
                  className="relative text-[10px] font-mono uppercase tracking-widest py-1.5 font-black transition-all duration-150 group/link signal-item"
                >
                  <span className={isActive ? 'text-signal-hot font-black underline underline-offset-4 decoration-2' : 'text-void-500 group-hover/link:text-signal-hot group-focus-visible/link:text-signal-hot transition-colors duration-150'}>
                    {item.label}
                  </span>
                </a>
              );
            })}
          </div>

          {/* Action CTAs (Desktop / Tablet) */}
          <div className="hidden md:flex items-center gap-4 ml-4 shrink-0">
            {!user ? (
              <>
                <a
                  href={getPathForPage('enter')}
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                      e.preventDefault();
                      handleNav('enter');
                    }
                  }}
                  className="text-[10px] font-mono uppercase tracking-widest font-black text-void-500 hover:text-signal-hot py-2 px-3 transition-colors"
                >
                  Sign In
                </a>
                <a
                  href={getPathForPage('join_network')}
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                      e.preventDefault();
                      handleNav('join_network');
                    }
                  }}
                  className="relative overflow-hidden px-4 py-2.5 bg-void-100 text-clinical-light text-[10px] font-mono tracking-widest font-black rounded-none border-2 border-void-400 shadow-brutalist hover:bg-signal hover:border-signal-hot hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[6px_6px_0_#060505,0_0_16px_rgba(214,0,25,0.35)] transition-all"
                >
                  JOIN_WAITLIST_ ▸
                </a>
              </>
            ) : (
              /* Compact account badge */
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 bg-black border-2 border-black py-1 px-3 rounded-none">
                  <div className="flex flex-col text-right">
                    <span className="text-[9px] font-black text-white uppercase tracking-wider">{user.name}</span>
                    <span className="text-[9px] font-mono text-signal font-bold uppercase">{user.tier} TIER</span>
                  </div>
                  <button
                    type="button"
                    className="w-7 h-7 rounded-none bg-void-400 p-[1px] cursor-pointer hover:bg-signal transition-colors"
                    onClick={() => handleNav('account')}
                    aria-label="Open account"
                  >
                    <div className="w-full h-full bg-void-100 rounded-none flex items-center justify-center font-bold text-white text-[9px] border border-black">
                      {user.name.substring(0, 2).toUpperCase()}
                    </div>
                  </button>
                </div>
                <button 
                  onClick={onLogout}
                  className="p-2 text-void-600 hover:text-red-500 hover:bg-black border border-transparent hover:border-black rounded-none transition-all"
                  title="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Responsive Hamburger Toggle */}
          <button 
            className="md:hidden p-2 border-2 border-black bg-black text-zinc-400 hover:text-white rounded-none transition-all focus:outline-none" 
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle Menu"
          >
            {isOpen ? <X size={15} /> : <Menu size={15} />}
          </button>

        </div>
      </motion.nav>

      {/* Slide Navigation Drawer Menu (Mobile/Tablet viewports) */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop Layer */}
            <motion.div 
              className="fixed inset-0 bg-black/90 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            {/* Sliding Drawer Body Container */}
            <motion.div 
              className="fixed top-0 right-0 h-full w-full max-w-sm bg-void-100 border-l-2 border-void-300 z-50 flex flex-col shadow-2xl p-6 overflow-y-auto"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            >
              {/* Drawer Content */}
              <div className="flex items-center justify-between pb-6 border-b border-zinc-900 mt-2">
                <div className="flex items-center gap-3">
                  <KonkredLogo size={26} />
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 border border-zinc-855 rounded-lg bg-zinc-900 hover:bg-zinc-850 transition-all text-zinc-400 hover:text-white"
                  aria-label="Close Menu"
                >
                  <X size={14} />
                </button>
              </div>

              {/* User Info inside Mobile Drawer */}
              {user && (
                <div className="p-4 bg-void-200 border border-void-300 rounded-none my-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-none bg-void-400 p-[1px]">
                      <div className="w-full h-full bg-void-200 rounded-none flex items-center justify-center font-bold text-white text-[10px]">
                        {user.name.substring(0, 2).toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-xs truncate w-40">{user.name}</h4>
                      <p className="text-[8px] text-zinc-500 font-mono uppercase tracking-widest mt-0.5">{user.tier.toUpperCase()} ACCOUNT</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Primary Mobile Menu items */}
              <div className="flex-1 py-4 space-y-1">
                <div className="space-y-1.5 label text-left">
                  <span className="text-[8px] font-mono uppercase text-zinc-550 tracking-[0.25em] block pl-3 mb-2 font-bold">PLATFORM</span>
                  <DrawerLink icon={Home} label="Home" onClick={() => handleNav('landing')} active={currentPage === 'landing'} />
                  <DrawerLink icon={Package} label="Product Catalogue" onClick={() => handleNav('catalogue')} active={currentPage === 'catalogue' || currentPage === 'suite_detail' || currentPage === 'workflow_detail' || currentPage === 'kit_detail'} />
                  <DrawerLink icon={ShieldCheck} label="AUDITOR (Neural Audit)" onClick={() => handleNav('forge_audit')} active={currentPage === 'forge_audit'} />
                  <DrawerLink icon={Hammer} label="fullKONK_> Compiler" onClick={() => handleNav('fullkonk')} active={currentPage === 'fullkonk'} />
                  <DrawerLink icon={Shield} label="REDAEYE" onClick={() => handleNav('redaeye')} active={currentPage === 'redaeye'} />
                  <DrawerLink icon={Cpu} label="Advisory" onClick={() => handleNav('advisory')} active={currentPage === 'advisory'} />
                  <DrawerLink icon={Terminal} label="Intel & Academy" onClick={() => handleNav('intel')} active={currentPage === 'intel' || currentPage === 'academy'} />
                  <DrawerLink icon={UserIcon} label="Account" onClick={() => handleNav(user ? 'account' : 'enter')} active={currentPage === 'account'} />
                </div>
              </div>

              {/* Bottom Drawer Actions */}
              <div className="pt-6 border-t border-zinc-900 space-y-3">
                {!user ? (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => { handleNav('enter'); }}
                      className="py-2.5 border-2 border-void-300 hover:border-signal bg-void-200 rounded-none text-[10px] font-mono font-bold uppercase tracking-widest text-clinical hover:text-signal-hot transition-all"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => { handleNav('join_network'); }}
                      className="py-2.5 bg-void-200 border-2 border-void-400 text-clinical-light font-black rounded-none text-[10px] font-mono uppercase tracking-widest hover:bg-signal hover:border-signal-hot transition-all"
                    >
                      Join Waitlist ▸
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={async () => { await onLogout(); setIsOpen(false); }}
                    className="w-full py-2.5 bg-signal-wash hover:bg-signal border-2 border-signal-line hover:border-signal-hot text-signal-hot hover:text-white font-bold text-[10px] font-mono uppercase tracking-widest rounded-none transition-all flex items-center justify-center gap-2 group"
                  >
                    <LogOut size={12} className="group-hover:-translate-x-0.5 transition-transform" />
                    SIGN OUT
                  </button>
                )}
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

interface DrawerLinkProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  active: boolean;
}

const DrawerLink: React.FC<DrawerLinkProps> = ({ icon: Icon, label, onClick, active }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between p-2.5 rounded-none transition-all font-mono group text-left ${
      active 
        ? 'bg-signal-wash text-signal-hot border border-signal-line' 
        : 'text-zinc-400 hover:text-signal-hot hover:bg-void-200 border border-transparent hover:border-void-300'
    }`}
  >
    <div className="flex items-center gap-2.5">
      <Icon size={12} className={active ? 'text-signal-hot animate-pulse' : 'text-zinc-550 group-hover:text-signal-hot transition-colors'} />
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </div>
    <ChevronRight size={10} className={`transition-transform ${active ? 'translate-x-0.5 text-signal-hot' : 'group-hover:translate-x-1 group-hover:text-signal-hot text-zinc-500'}`} />
  </button>
);

export default Navbar;
