import { supabase } from '../lib/supabaseClient';
import { EmergencyInfo, ServiceResult } from '../types';

export const emergencyService = {
  async addInfo(
    tripId: string,
    userId: string,
    input: Pick<EmergencyInfo, 'type' | 'title' | 'content' | 'is_shared' | 'family_id'>
  ): Promise<ServiceResult<EmergencyInfo>> {
    const { data, error } = await supabase
      .from('emergency_info')
      .insert({ ...input, trip_id: tripId, added_by: userId })
      .select('*, family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as EmergencyInfo, error: null };
  },

  async getInfo(tripId: string): Promise<ServiceResult<EmergencyInfo[]>> {
    const { data, error } = await supabase
      .from('emergency_info')
      .select('*, family:families(*)')
      .eq('trip_id', tripId)
      .order('type')
      .order('title');
    if (error) return { data: null, error: error.message };
    return { data: data as EmergencyInfo[], error: null };
  },

  async updateInfo(
    infoId: string,
    updates: Partial<Pick<EmergencyInfo, 'type' | 'title' | 'content' | 'is_shared'>>
  ): Promise<ServiceResult<EmergencyInfo>> {
    const { data, error } = await supabase
      .from('emergency_info')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', infoId)
      .select('*, family:families(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as EmergencyInfo, error: null };
  },

  async deleteInfo(infoId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase.from('emergency_info').delete().eq('id', infoId);
    return { data: null, error: error?.message ?? null };
  },
};
