import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabaseClient';
import { Profile } from '../types';
import { demoProfile, DEMO_USER_ID } from '../lib/mockData';
import { offlineService } from '../services/offlineService';
import { AUTH_REDIRECT_URL } from '../constants/auth';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isPasswordRecovery: boolean;
  finishPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Fake User object for demo mode
const DEMO_FAKE_USER = {
  id: DEMO_USER_ID,
  email: 'demo@tripcrew.app',
  app_metadata: {},
  user_metadata: { full_name: 'Alex Demo' },
  aud: 'authenticated',
  created_at: '2024-06-01T10:00:00Z',
} as unknown as User;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  function getUrlParams(url: string): URLSearchParams {
    const parsed = new URL(url);
    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
    return new URLSearchParams(hash || parsed.search);
  }

  async function handleAuthUrl(url: string) {
    try {
      const params = getUrlParams(url);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error && type === 'recovery') setIsPasswordRecovery(true);
      }
    } catch (_e) {}
  }

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthUrl(url);
    });
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      handleAuthUrl(url);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (isDemoMode) return; // don't override demo mode
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => {
      linkingSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (!error && data) setProfile(data as Profile);
    } catch (_e) {} finally {
      setLoading(false);
    }
  }

  async function refreshProfile() {
    if (isDemoMode) return;
    if (user) await fetchProfile(user.id);
  }

  // ── Demo mode ──────────────────────────────────────────────────────────────

  function signInDemo() {
    setUser(DEMO_FAKE_USER);
    setProfile(demoProfile);
    setIsDemoMode(true);
    setLoading(false);
  }

  // ── Email / password ───────────────────────────────────────────────────────

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    // Ensure profile row exists — back-fills users created outside the app
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: data.user.email ?? email,
        full_name: data.user.user_metadata?.full_name ?? email.split('@')[0],
      });
    }
    return { error: null };
  }

  async function signUp(email: string, password: string, fullName: string): Promise<{ error: string | null }> {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: AUTH_REDIRECT_URL },
    });
    if (error) return { error: error.message };
    if (data.user) {
      await supabase.from('profiles').upsert({ id: data.user.id, email, full_name: fullName });
    }
    return { error: null };
  }

  async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: AUTH_REDIRECT_URL,
    });
    return { error: error?.message ?? null };
  }

  async function updatePassword(password: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    setIsPasswordRecovery(false);
    return { error: null };
  }

  function finishPasswordRecovery() {
    setIsPasswordRecovery(false);
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────

  async function signInWithGoogle(): Promise<{ error: string | null }> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: AUTH_REDIRECT_URL,
          skipBrowserRedirect: true,
        },
      });
      if (error) return { error: error.message };
      if (!data.url) return { error: 'Could not get OAuth URL' };

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        AUTH_REDIRECT_URL
      );

      if (result.type === 'success' && result.url) {
        await handleAuthUrl(result.url);
      }
      return { error: null };
    } catch (e: any) {
      return { error: e?.message ?? 'Google sign-in failed' };
    }
  }

  // ── Sign out ───────────────────────────────────────────────────────────────

  async function signOut(): Promise<void> {
    if (isDemoMode) {
      setUser(null);
      setProfile(null);
      setIsDemoMode(false);
      await offlineService.clearAllCache();
      return;
    }
    await supabase.auth.signOut();
    await offlineService.clearAllCache();
  }

  return (
    <AuthContext.Provider value={{
      user, profile, session, loading, isDemoMode,
      signIn, signUp, requestPasswordReset, updatePassword, signInWithGoogle,
      signInDemo, signOut, refreshProfile, isPasswordRecovery, finishPasswordRecovery,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
