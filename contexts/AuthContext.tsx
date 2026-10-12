import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, AuthState } from '../types';
import { auth, db } from '../services/firebase.ts';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile,
  type User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from './ToastContext.tsx';


interface AuthContextValue extends AuthState {
  login: (email: string, key: string) => Promise<void>;
  signup: (email: string, key: string, name: string, acceptedCopyrightTerms: boolean) => Promise<string | null>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const mapFirebaseUserToAppUser = (firebaseUser: FirebaseUser, dbData?: any): User => {
  return {
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    name: dbData?.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Architect',
    role: dbData?.role || 'buyer',
    verified: firebaseUser.emailVerified,
    tier: dbData?.tier || dbData?.plan || 'free',
    balance: dbData?.balance || { fiat: 1000, crypto: 0.1 },
    stats: dbData?.stats || {
        totalPurchases: 0,
        totalSales: 0,
        totalEarnings: 0,
        rating: 5.0,
        reviewCount: 0,
    },
    payoutThreshold: dbData?.payoutThreshold || 500,
    kycStatus: dbData?.kycStatus || 'unverified',
    acceptedCopyrightTerms: dbData?.acceptedCopyrightTerms || false,
    canGenerateBlogs: dbData?.canGenerateBlogs || false,
    createdAt: dbData?.createdAt || new Date(),
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const handleOauthMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.token) {
        setIsLoading(true);
        try {
          const result = await signInWithCustomToken(auth, event.data.token);
          const firebaseUser = result.user;
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          setUser(mapFirebaseUserToAppUser(firebaseUser, userDoc.exists() ? userDoc.data() : undefined));
          showToast(`Neural Link Elevated: GitHub Connection Secure`, 'success');
        } catch (error: any) {
          console.error("Custom token authentication failed:", error);
          showToast(error.message || 'Custom credential parsing failed.', 'error');
        } finally {
          setIsLoading(false);
        }
      }
    };

    window.addEventListener('message', handleOauthMessage);

    // ── Never hang the whole site on Firebase ────────────────────────────────
    // `onAuthStateChanged` only resolves when Firebase can reach its backend.
    // If the network is blocked, the domain is not whitelisted, or the project
    // is misconfigured, the callback NEVER fires — `isLoading` stays true and
    // App.tsx renders <AuthLoadingScreen /> forever. That is the infinite
    // "INITIALIZING_CORE / UPLINK: SECURE" screen seen in production.
    //
    // A watchdog resolves the boot as "signed out" so the public site always
    // becomes usable. Signing in still works normally afterwards: if the real
    // auth callback arrives later it simply supersedes this state.
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      setIsLoading(false);
    };
    const authWatchdog = window.setTimeout(() => {
      if (settled) return;
      console.warn('[auth] Firebase did not respond within 8s; continuing as signed out.');
      setUser(null);
      settle();
    }, 8000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.emailVerified) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          let userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists()) {
            const initialProfile = {
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Architect',
              email: firebaseUser.email || '',
              role: 'buyer',
              tier: 'free',
              balance: { fiat: 1000, crypto: 0.1 },
              stats: {
                  totalPurchases: 0,
                  totalSales: 0,
                  totalEarnings: 0,
                  rating: 5.0,
                  reviewCount: 0,
              },
              payoutThreshold: 500,
              kycStatus: 'unverified',
              createdAt: serverTimestamp(),
            };
            await setDoc(userDocRef, initialProfile);
            userDoc = await getDoc(userDocRef);
          }
          
          setUser(mapFirebaseUserToAppUser(firebaseUser, userDoc.data()));
        } catch (error: any) {
          console.warn("Firestore profile sync notice (using local profile session fallback):", error?.message || error);
          // Standard clinical fallback mapping to ensure user access with initial values
          setUser(mapFirebaseUserToAppUser(firebaseUser));
        }
      } else {
        setUser(null);
      }
      settle();
    },
    // Error callback: without this an auth backend failure rejects silently and
    // the boot never completes.
    (error) => {
      console.warn('[auth] Firebase auth listener failed; continuing as signed out.', error?.message || error);
      setUser(null);
      settle();
    });

    return () => {
      window.clearTimeout(authWatchdog);
      window.removeEventListener('message', handleOauthMessage);
      unsubscribe();
    };
  }, [showToast]);

  const login = useCallback(async (email: string, key: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, key);
      if (!userCredential.user.emailVerified) {
        await sendEmailVerification(userCredential.user);
        await signOut(auth);
        throw { code: 'auth/email-not-verified', email: userCredential.user.email };
      }
      
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      const userDoc = await getDoc(userDocRef);
      const appUser = mapFirebaseUserToAppUser(userCredential.user, userDoc.exists() ? userDoc.data() : undefined);
      showToast(`Welcome back, ${appUser.name}`, 'success');
    } catch (error: any) {
      if (error.code === 'auth/email-not-verified') throw error;
      if (error.code === 'auth/unauthorized-domain') {
        throw new Error(`Domain ${window.location.hostname} not whitelisted in Firebase Console.`);
      }
      throw new Error(error.message || 'Authentication failed.');
    }
  }, [showToast]);

  const signup = useCallback(async (email: string, key: string, name: string, acceptedCopyrightTerms: boolean): Promise<string | null> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, key);
      await updateProfile(userCredential.user, { displayName: name });
      
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      await setDoc(userDocRef, {
          displayName: name,
          email: email,
          role: 'buyer',
          tier: 'free',
          balance: { fiat: 1000, crypto: 0.1 },
          stats: {
              totalPurchases: 0,
              totalSales: 0,
              totalEarnings: 0,
              rating: 5.0,
              reviewCount: 0,
          },
          payoutThreshold: 500,
          kycStatus: 'unverified',
          acceptedCopyrightTerms,
          canGenerateBlogs: false, // Default to false, needs manual elevation by admin
          createdAt: serverTimestamp(),
      });

      await sendEmailVerification(userCredential.user);
      await signOut(auth);
      return userCredential.user.email;
    } catch (error: any) {
      if (error.code === 'auth/unauthorized-domain') {
        throw new Error('Registration node error: Domain not whitelisted.');
      }
      throw new Error(error.message || 'Signup sequence failed.');
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
            displayName: user.displayName || user.email?.split('@')[0] || 'Architect',
            email: user.email,
            plan: 'free',
            createdAt: serverTimestamp(),
        });
      }
      showToast(`Uplink established: ${user.displayName}`, 'success');
    } catch (error: any) {
      console.error("Google Auth Error:", error);
      let msg = 'Neural handshake failed.';
      if (error.code === 'auth/unauthorized-domain') {
        msg = `SYSTEM_ERROR: Domain ${window.location.hostname} is not whitelisted for Google Auth.`;
        showToast(msg, 'error', 10000);
      } else if (error.code === 'auth/popup-closed-by-user') {
        msg = 'Handshake cancelled by architect.';
        showToast(msg, 'info');
      } else {
        showToast(msg, 'error');
      }
      throw new Error(msg);
    }
  }, [showToast]);

  const signInWithGithub = useCallback(async () => {
    try {
      const response = await fetch(`/api/auth/github/url?redirectUri=${encodeURIComponent(window.location.origin + '/auth/callback')}`);
      if (!response.ok) {
        const errTxt = await response.text();
        throw new Error(errTxt || 'Failed to initiate GitHub authentication sequence.');
      }
      const { url } = await response.json();
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const popup = window.open(
        url,
        'github_oauth_popup',
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
      );
      if (!popup) {
        showToast('Please enable popups to establish GitHub Handshake Uplink.', 'error');
      }
    } catch (error: any) {
      console.error('GitHub Auth initiation failed:', error);
      showToast(error.message || 'GitHub Handshake failed.', 'error');
      throw error;
    }
  }, [showToast]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    showToast('Session Terminated', 'info');
  }, [showToast]);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    if (!user) return;
    setUser(prev => (prev ? { ...prev, ...updates } : null));
    
    try {
      const userDocRef = doc(db, 'users', user.id);
      
      // Map app balance back to DB structure if updating balance
      const dbUpdates: any = { ...updates };
      if (updates.balance) {
        dbUpdates.balance = updates.balance;
      }
      if (updates.stats) {
        dbUpdates.stats = updates.stats;
      }
      
      await setDoc(userDocRef, dbUpdates, { merge: true });
    } catch (error) {
      console.error("Critical: User profile synchronization failed:", error);
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, signup, logout, updateUser, signInWithGoogle, signInWithGithub }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};