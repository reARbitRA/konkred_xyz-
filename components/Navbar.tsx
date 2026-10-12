import React, { useState, useEffect } from 'react';
import { KonkredLogo } from './brand/KonkredLogo.tsx';
import { motion } from 'motion/react';
import { Search, LogOut, Shield } from 'lucide-react';
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
        <div className="max-w-7xl mx-auto pl-6 md:pl-8 pr-16 md:pr-20 flex items-center justify-between">
          
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

        </div>
      </motion.nav>
    </>
  );
};


export default Navbar;
