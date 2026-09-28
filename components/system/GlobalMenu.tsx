/**
 * GlobalMenu — the universal system menu.
 *
 * One fixed three-line trigger, top-right, on EVERY page and every
 * viewport — fullscreen consoles (landing, catalogue, fullKONK, REDAEYE)
 * and shell pages alike. Opens a full-height industrial index drawer:
 * the single navigation source of truth for the whole platform.
 *
 * Escape closes, backdrop closes, body scroll locks while open, focus
 * returns to the trigger. No framer dependency — hard CSS motion only.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { PageView, User } from '../../types.ts';
import { getPathForPage } from '../../utils/routes.ts';

interface Props {
  onNavigate: (page: PageView) => void;
  currentPage: PageView;
  user: User | null;
  onLogout: () => Promise<void> | void;
}

const MONO = { fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace" } as const;
const DISPLAY = { fontFamily: "'Archivo Black','Archivo',sans-serif" } as const;

type Item = { label: string; page: PageView; note?: string };

const SECTIONS: Array<{ name: string; items: Item[] }> = [
  {
    name: 'PLATFORM',
    items: [
      { label: 'Home', page: 'landing', note: 'BASE' },
      { label: 'Catalogue', page: 'catalogue', note: '36' },
      { label: 'Validation', page: 'validation' },
      { label: 'Pricing', page: 'pricing' },
      { label: 'Sprint', page: 'sprint' },
      { label: 'Enterprise', page: 'enterprise' },
      { label: 'Partners', page: 'partners' },
    ],
  },
  {
    name: 'CONSOLES',
    items: [
      { label: 'fullKONK_>', page: 'fullkonk', note: 'LIVE' },
      { label: 'AUDITOR', page: 'forge_audit' },
      { label: 'REDAEYE', page: 'redaeye' },
    ],
  },
  {
    name: 'INTEL',
    items: [
      { label: 'Intel', page: 'intel' },
      { label: 'Academy', page: 'academy' },
      { label: 'Advisory', page: 'advisory' },
      { label: 'Resources', page: 'resources' },
      { label: 'Contact', page: 'contact' },
    ],
  },
];

const GlobalMenu: React.FC<Props> = ({ onNavigate, currentPage, user, onLogout }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  /* Escape closes; body scroll locks while the drawer is open */
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const go = (page: PageView) => {
    setOpen(false);
    onNavigate(page);
  };

  let row = 0;

  return (
    <>
      {/* three thin lines — always present, top right */}
      <button
        ref={triggerRef}
        type="button"
        className="k-menu-trigger"
        aria-label="Open system menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="k-menu-backdrop" onClick={close} aria-hidden="true" />
          <aside className="k-menu-drawer" role="dialog" aria-modal="true" aria-label="System menu">
            {/* header */}
            <div className="k-hazard k-hazard-thin shrink-0" aria-hidden="true" />
            <div className="flex items-center justify-between px-5 py-4 border-b-2 shrink-0" style={{ borderColor: 'var(--k-line)' }}>
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-7 h-7 grid place-items-center font-black text-sm shrink-0" style={{ background: 'var(--k-amber)', color: 'var(--k-on-acc)' }} aria-hidden="true">K</span>
                <span className="flex flex-col min-w-0">
                  <b className="tracking-[0.22em] text-[11px] uppercase truncate" style={{ ...DISPLAY, color: 'var(--k-ink)' }}>KONKRED</b>
                  <span className="text-[7px] font-bold tracking-[0.3em] uppercase" style={{ ...MONO, color: 'var(--k-mut)' }}>SYSTEM INDEX</span>
                </span>
              </span>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Close system menu"
                className="w-8 h-8 grid place-items-center border-2 cursor-pointer text-xs font-black transition-colors duration-150 hover:border-[var(--k-red)] hover:text-[var(--k-red)]"
                style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}
              >
                ✕
              </button>
            </div>

            {/* route index */}
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="System menu">
              {SECTIONS.map((sec) => (
                <div key={sec.name} className="mb-5">
                  <p className="px-2 mb-1.5 text-[7px] font-bold tracking-[0.34em] uppercase" style={{ ...MONO, color: 'var(--k-mut)' }}>
                    {sec.name}
                  </p>
                  <div className="flex flex-col">
                    {sec.items.map((it) => {
                      row += 1;
                      const active = currentPage === it.page;
                      return (
                        <a
                          key={it.page}
                          href={getPathForPage(it.page)}
                          onClick={(ev) => {
                            if (!ev.ctrlKey && !ev.metaKey && !ev.shiftKey) { ev.preventDefault(); go(it.page); }
                          }}
                          aria-current={active ? 'page' : undefined}
                          className="group flex items-center gap-3 px-2 py-2 border-l-2 transition-colors duration-100 no-underline"
                          style={{ borderColor: active ? 'var(--k-red)' : 'transparent', background: active ? 'rgba(214,0,25,.07)' : 'transparent' }}
                        >
                          <span className="text-[8px] font-bold tracking-[0.14em] w-5 shrink-0" style={{ ...MONO, color: active ? 'var(--k-red)' : 'var(--k-mut)' }} aria-hidden="true">
                            {String(row).padStart(2, '0')}
                          </span>
                          <span
                            className="text-[11px] font-black uppercase tracking-[0.12em] flex-1 transition-colors duration-100 group-hover:text-[var(--k-red)]"
                            style={{ ...MONO, color: active ? 'var(--k-red)' : 'var(--k-ink)' }}
                          >
                            {it.label}
                          </span>
                          {it.note && (
                            <span className="text-[7px] font-bold tracking-[0.24em] border px-1.5 py-0.5 shrink-0" style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}>
                              {it.note}
                            </span>
                          )}
                          <span className="text-[9px] shrink-0 transition-transform duration-100 group-hover:translate-x-0.5" style={{ color: active ? 'var(--k-red)' : 'var(--k-mut)' }} aria-hidden="true">▸</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* access block */}
            <div className="px-5 py-4 border-t-2 shrink-0" style={{ borderColor: 'var(--k-line)' }}>
              {user ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => go('account')}
                    className="w-full flex items-center justify-between border-2 px-3 py-2.5 cursor-pointer transition-colors duration-150 hover:border-[var(--k-red)]"
                    style={{ borderColor: 'var(--k-line)' }}
                  >
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] truncate" style={{ ...MONO, color: 'var(--k-ink)' }}>{user.name}</span>
                    <span className="text-[7px] font-bold tracking-[0.24em] uppercase shrink-0" style={{ ...MONO, color: 'var(--k-amber)' }}>{user.tier} · ACCOUNT ▸</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => { await onLogout(); setOpen(false); }}
                    className="w-full text-[9px] font-black uppercase tracking-[0.2em] border-2 px-3 py-2.5 cursor-pointer transition-colors duration-150 hover:border-[var(--k-red)] hover:text-[var(--k-red)]"
                    style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-mut)' }}
                  >
                    SIGN OUT
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => go('enter')}
                    className="text-[9px] font-black uppercase tracking-[0.16em] border-2 px-3 py-2.5 cursor-pointer transition-colors duration-150 hover:border-[var(--k-red)] hover:text-[var(--k-red)]"
                    style={{ ...MONO, borderColor: 'var(--k-line)', color: 'var(--k-ink)' }}
                  >
                    SIGN IN
                  </button>
                  <button
                    type="button"
                    onClick={() => go('join_network')}
                    className="text-[9px] font-black uppercase tracking-[0.16em] border-2 px-3 py-2.5 cursor-pointer transition-all duration-150 hover:bg-[var(--k-amber)] hover:text-[var(--k-on-acc)] hover:border-[var(--k-red)]"
                    style={{ ...MONO, borderColor: 'var(--k-ink)', color: 'var(--k-ink)' }}
                  >
                    JOIN ▸
                  </button>
                </div>
              )}
              <p className="mt-3 text-[7px] font-bold tracking-[0.3em] uppercase text-center" style={{ ...MONO, color: 'var(--k-mut)' }}>
                KONKRED // OBSIDIAN SIGNAL
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
};

export default GlobalMenu;
