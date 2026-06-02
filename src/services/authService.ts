import { supabase } from '../lib/supabaseClient';
import { Profile, ServiceResult } from '../types';
import { offlineService } from './offlineService';

export const authService = {
  async signUp(
    email: string,
    password: string,
    fullName: string
  ): Promise<ServiceResult<Profile>> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { data: null, error: error.message };

    if (data.user) {
      const profileData = {
        id: data.user.id,
        email,
        full_name: fullName,
      };
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profileData);
      if (profileError) return { data: null, error: profileError.message };
      return { data: profileData as Profile, error: null };
    }
    return { data: null, error: 'Failed to create user' };
  },

  async signIn(
    email: string,
    password: string
  ): Promise<ServiceResult<Profile>> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { data: null, error: error.message };
    if (data.user) {
      return authService.getProfile(data.user.id);
    }
    return { data: null, error: 'Sign in failed' };
  },

  async signOut(): Promise<ServiceResult<null>> {
    const { error } = await supabase.auth.signOut();
    if (error) return { data: null, error: error.message };

    await offlineService.clearAllCache();
    return { data: null, error: null };
  },

  async getProfile(userId: string): Promise<ServiceResult<Profile>> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Profile, error: null };
  },

  async updateProfile(
    userId: string,
    updates: Partial<Pick<Profile, 'full_name' | 'avatar_url' | 'phone'>>
  ): Promise<ServiceResult<Profile>> {
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Profile, error: null };
  },
};
