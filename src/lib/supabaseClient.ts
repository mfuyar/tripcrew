import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder_anon_key';

// On web, use the browser's native localStorage (synchronous, reliable).
// On native, use AsyncStorage (the only option).
const authStorage = Platform.OS === 'web' ? undefined : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// supabase-js's autoRefreshToken timer only runs while JS is executing, so it
// doesn't fire while the app is backgrounded. Without this, the access token
// can be expired by the time the app is foregrounded again, and the first
// request goes out unauthenticated (falls back to the anon key) until the
// next refresh — causing spurious RLS failures right after resuming the app.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
