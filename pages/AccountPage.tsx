
import React, { useState } from 'react';
import { User, PageView } from '../types.ts';
import { User as UserIcon, Shield, Bell, CreditCard, ArrowLeft, Settings as SettingsIcon, Brain } from 'lucide-react';
import Profile from '../components/account/Profile.tsx';
import Settings from '../components/account/Settings.tsx';
import Billing from '../components/account/Billing.tsx';
import Notifications from '../components/account/Notifications.tsx';
import AIConfig from '../components/account/AIConfig.tsx';

interface AccountPageProps {
  user: User | null;
  onNavigate: (page: PageView) => void;
}

const AccountPage: React.FC<AccountPageProps> = ({ user, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'settings' | 'billing' | 'notifications' | 'ai'>('profile');

  if (!user) return null;

  return (
    <div className="min-h-screen bg-void pt-28 pb-20 px-6 animate-in fade-in duration-500">
      <div className="max-w-6xl mx-auto">
        <button 
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-3 text-ghost hover:text-white transition-colors text-[10px] uppercase tracking-widest font-mono group mb-12"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> 
          RETURN_TO_BASE
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
           {/* Sidebar Nav */}
           <aside className="space-y-2">
              {[
                { id: 'profile', label: 'Identity', icon: UserIcon },
                { id: 'ai', label: 'AI Uplink', icon: Brain },
                { id: 'settings', label: 'Configuration', icon: SettingsIcon },
                { id: 'billing', label: 'Liquidity', icon: CreditCard },
                { id: 'notifications', label: 'System Logs', icon: Bell },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-4 px-6 py-4 rounded-xl transition-all border ${
                    activeTab === item.id 
                      ? 'bg-neon-cyan/10 border-neon-cyan/20 text-neon-cyan shadow-[0_0_20px_rgba(214,0,25,0.05)]' 
                      : 'border-transparent text-ghost hover:text-white hover:bg-white/5'
                  }`}
                >
                   <item.icon size={18} />
                   <span className="text-xs font-mono font-bold uppercase tracking-widest">{item.label}</span>
                </button>
              ))}
           </aside>

           {/* Main Content Area */}
           <main className="lg:col-span-3">
              {activeTab === 'profile' && <Profile />}
              {activeTab === 'ai' && <AIConfig />}
              {activeTab === 'settings' && <Settings />}
              {activeTab === 'billing' && <Billing />}
              {activeTab === 'notifications' && <Notifications />}
           </main>
        </div>
      </div>
    </div>
  );
};

export default AccountPage;
