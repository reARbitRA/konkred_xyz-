import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { User, AuthState } from '../types';
import { getSupabase, db } from '../services/supabase';
import { doc, getDoc, setDoc } from '../services/documents';
import { useToast } from './ToastContext';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, acceptedCopyrightTerms: boolean) => Promise<string | null>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
function mapUser(user: SupabaseUser, profile: Record<string, any> = {}): User {
  return {
    id: user.id, email: user.email || '',
    name: profile.displayName || user.user_metadata?.name || user.email?.split('@')[0] || 'Architect',
    role: profile.role || 'buyer', tier: profile.tier || 'free', verified: !!user.email_confirmed_at,
    balance: profile.balance || { fiat: 0, crypto: 0 },
    stats: profile.stats || { totalPurchases: 0, totalSales: 0, totalEarnings: 0, rating: 0, reviewCount: 0 },
    payoutThreshold: profile.payoutThreshold || 500, kycStatus: profile.kycStatus || 'unverified',
    acceptedCopyrightTerms: profile.acceptedCopyrightTerms === true,
    canGenerateBlogs: profile.canGenerateBlogs === true, createdAt: new Date(user.created_at),
  };
}
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();
  useEffect(() => {
    let active = true;
    let revision = 0;
    const sync = async (identity: SupabaseUser | null) => {
      const version = ++revision;
      if (!identity) { if (active) { setUser(null); setIsLoading(false); } return; }
      // Render the authenticated session immediately; profile IO cannot block boot.
      if (active) { setUser(mapUser(identity)); setIsLoading(false); }
      try {
        const profile = await getDoc(doc(db, 'users', identity.id));
        if (active && revision === version) setUser(mapUser(identity, profile.data()));
      } catch { /* Auth remains usable during a database outage. */ }
    };
    const watchdog = window.setTimeout(() => { if (active) setIsLoading(false); }, 8000);
    let unsubscribe = () => {};
    try {
      const client = getSupabase();
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Never await database/auth operations inside the SDK's auth callback lock.
        void sync(session?.user || null);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      const initialRevision = revision;
      void client.auth.getSession().then(({ data, error }) => {
        if (active && revision === initialRevision) void sync(error ? null : data.session?.user || null);
      }).catch(() => { if (active && revision === initialRevision) void sync(null); });
    } catch { setIsLoading(false); }
    return () => { active = false; revision++; window.clearTimeout(watchdog); unsubscribe(); };
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
    showToast('Welcome back', 'success');
  }, [showToast]);
  const signup = useCallback(async (email: string, password: string, name: string, acceptedCopyrightTerms: boolean) => {
    if (!acceptedCopyrightTerms) throw new Error('Please accept the terms before signing up.');
    const { data, error } = await getSupabase().auth.signUp({ email, password, options: {
      data: { name, acceptedCopyrightTerms }, emailRedirectTo: window.location.origin,
    } });
    if (error) throw error;
    return data.session ? null : email;
  }, []);
  const oauth = useCallback(async (provider: 'google' | 'github') => {
    const { error } = await getSupabase().auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (error) throw error;
  }, []);
  const signInWithGoogle = useCallback(() => oauth('google'), [oauth]);
  const signInWithGithub = useCallback(() => oauth('github'), [oauth]);
  const logout = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
    setUser(null);
    showToast('Session Terminated', 'info');
  }, [showToast]);
  const updateUser = useCallback(async (updates: Partial<User>) => {
    if (!user) return;
    // Privileged profile fields are server-managed and never client-writable.
    const safe = { ...(updates.name !== undefined ? { displayName: updates.name } : {}),
      ...(updates.acceptedCopyrightTerms !== undefined ? { acceptedCopyrightTerms: updates.acceptedCopyrightTerms } : {}) };
    try {
      await setDoc(doc(db, 'users', user.id), safe, { merge: true });
      setUser(prev => prev ? { ...prev, ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.acceptedCopyrightTerms !== undefined ? { acceptedCopyrightTerms: updates.acceptedCopyrightTerms } : {}) } : null);
    } catch { showToast('Profile could not be saved.', 'error'); }
  }, [user, showToast]);
  return <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, signup, logout, updateUser, signInWithGoogle, signInWithGithub }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
