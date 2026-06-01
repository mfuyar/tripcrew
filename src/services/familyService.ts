import { supabase } from '../lib/supabaseClient';
import { Family, FamilyMember, ServiceResult } from '../types';

export const familyService = {
  async createFamily(
    tripId: string,
    userId: string,
    input: Pick<Family, 'name' | 'adults_count' | 'children_count' | 'notes' | 'color'>
  ): Promise<ServiceResult<Family>> {
    const { data, error } = await supabase
      .from('families')
      .insert({ ...input, trip_id: tripId, created_by: userId })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    // Link creator as family admin in trip_members
    await supabase
      .from('trip_members')
      .update({ family_id: data.id })
      .eq('trip_id', tripId)
      .eq('user_id', userId);
    // Add creator as family member
    await supabase.from('family_members').insert({
      family_id: data.id,
      trip_id: tripId,
      user_id: userId,
      is_admin: true,
    });
    return { data: data as Family, error: null };
  },

  async getFamilies(tripId: string): Promise<ServiceResult<Family[]>> {
    const { data, error } = await supabase
      .from('families')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at');
    if (error) return { data: null, error: error.message };
    return { data: data as Family[], error: null };
  },

  async updateFamily(
    familyId: string,
    updates: Partial<Pick<Family, 'name' | 'adults_count' | 'children_count' | 'notes' | 'color'>>
  ): Promise<ServiceResult<Family>> {
    const { data, error } = await supabase
      .from('families')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', familyId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Family, error: null };
  },

  async deleteFamily(familyId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase.from('families').delete().eq('id', familyId);
    return { data: null, error: error?.message ?? null };
  },

  async addFamilyMember(
    familyId: string,
    tripId: string,
    userId: string,
    isAdmin = false
  ): Promise<ServiceResult<FamilyMember>> {
    const { data, error } = await supabase
      .from('family_members')
      .insert({ family_id: familyId, trip_id: tripId, user_id: userId, is_admin: isAdmin, push_talk_enabled: false })
      .select('*, profile:profiles(*)')
      .single();
    if (error) return { data: null, error: error.message };
    // Update trip_members to associate this user with the family
    await supabase
      .from('trip_members')
      .update({ family_id: familyId })
      .eq('trip_id', tripId)
      .eq('user_id', userId);
    return { data: data as FamilyMember, error: null };
  },

  async updateFamilyMemberPushTalk(
    memberId: string,
    enabled: boolean
  ): Promise<ServiceResult<FamilyMember>> {
    const { data, error } = await supabase
      .from('family_members')
      .update({ push_talk_enabled: enabled })
      .eq('id', memberId)
      .select('*, profile:profiles(*)')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as FamilyMember, error: null };
  },

  async getFamilyMembers(familyId: string): Promise<ServiceResult<FamilyMember[]>> {
    const { data, error } = await supabase
      .from('family_members')
      .select('*, profile:profiles(*)')
      .eq('family_id', familyId);
    if (error) return { data: null, error: error.message };
    return { data: data as FamilyMember[], error: null };
  },

  async removeFamilyMember(
    familyId: string,
    userId: string
  ): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('family_id', familyId)
      .eq('user_id', userId);
    return { data: null, error: error?.message ?? null };
  },
};
