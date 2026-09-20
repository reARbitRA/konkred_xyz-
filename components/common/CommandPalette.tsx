
import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight, LayoutDashboard, ShoppingBag, Shield, LogOut, Settings, CreditCard, Home, FileText, PlusCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: any) => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, logout } = useAuth();

  const allCommands = [
    { id: 'fullkonk', label: 'fullKONK_> AI Compiler', icon: Shield, group: 'Navigation', action: () => onNavigate('fullkonk'), requiresAuth: false },
    { id: 'redaeye', label: 'REDAEYE Adversarial Red Teaming', icon: Shield, group: 'Navigation', action: () => onNavigate('redaeye'), requiresAuth: false },
    { id: 'catalogue', label: 'Product Catalogue', icon: ShoppingBag, group: 'Navigation', action: () => onNavigate('catalogue'), requiresAuth: false },
  { id: 'pricing', label: 'Pricing', icon: ShoppingBag, group: 'Navigation', action: () => onNavigate('pricing'), requiresAuth: false },
  { id: 'validation', label: 'Validation Record', icon: ShoppingBag, group: 'Navigation', action: () => onNavigate('validation'), requiresAuth: false },
    { id: 'audit', label: 'AUDITOR — Neural Audit', icon: Shield, group: 'Navigation', action: () => onNavigate('forge_audit'), requiresAuth: false },
    { id: 'docs', label: 'Documentation', icon: FileText, group: 'Resources', action: () => onNavigate('documentation'), requiresAuth: false },
    { id: 'home', label: 'Return to Base', icon: Home, group: 'Navigation', action: () => onNavigate('landing'), requiresAuth: false },
    { id: 'intel', label: 'Intel Blog', icon: FileText, group: 'Resources', action: () => onNavigate('intel'), requiresAuth: false },
    
    { id: 'settings', label: 'Account & Settings', icon: Settings, group: 'General', action: () => onNavigate('account'), requiresAuth: true },
    { id: 'logout', label: 'Terminate Session', icon: LogOut, group: 'System', action: async () => { await logout(); onNavigate('landing'); }, requiresAuth: true },
  ];

  const commands = allCommands.filter(cmd => !cmd.requiresAuth || (cmd.requiresAuth && !!user));

  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(query.toLowerCase()) || 
    cmd.group.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (filteredCommands.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + (filteredCommands.length || 1)) % (filteredCommands.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) {
          await cmd.action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh] px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-[#0a0908] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 concrete-card">
        <div className="p-4 border-b border-white/10 flex items-center gap-4">
          <Search className="text-ghost" size={20} />
          <input 
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Type a command or search..." 
            className="flex-1 bg-transparent text-lg text-white placeholder-ghost/50 outline-none font-sans"
          />
          <div className="px-2 py-1 rounded bg-white/10 text-[10px] font-mono text-ghost font-bold border border-white/5">ESC</div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-ghost text-sm font-mono">No matching protocols found.</div>
          ) : (
            filteredCommands.map((cmd, i) => (
              <div 
                key={cmd.id}
                onClick={async () => { await cmd.action(); onClose(); }}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`px-4 py-3 mx-2 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                  i === selectedIndex ? 'bg-neon-cyan/10 text-white' : 'text-ghost-light hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${i === selectedIndex ? 'text-neon-cyan' : 'text-ghost'}`}>
                    <cmd.icon size={18} />
                  </div>
                  <span className="text-sm font-medium">{cmd.label}</span>
                </div>
                {i === selectedIndex && <ArrowRight size={14} className="text-neon-cyan animate-in slide-in-from-left-2" />}
              </div>
            ))
          )}
        </div>

        <div className="p-3 bg-white/[0.02] border-t border-white/5 flex justify-between items-center text-[10px] text-ghost font-mono uppercase tracking-widest">
           <span>Konkred OS v4.2</span>
           <div className="flex gap-4">
              <span>Navigate <b className="text-white">↑↓</b></span>
              <span>Select <b className="text-white">↵</b></span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
