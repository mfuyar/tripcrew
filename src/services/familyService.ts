import { supabase } from '../lib/supabaseClient';
import { Family, FamilyMember, ServiceResult } from '../types';

function isMissingInviteFunction(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.message?.includes('add_family_member_by_email') === true ||
    error.message?.includes('schema cache') === true
  );
}

function isMissingSwitchFunction(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.message?.includes('switch_family_membership') === true ||
    error.message?.includes('schema cache') === true
  );
}

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

    await familyService.addFamilyMember(data.id, tripId, userId, true);
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
    if (error) return { data: null, error: error.message };
    await supabase
      .from('trip_members')
      .update({ family_id: null })
      .eq('family_id', familyId);
    return { data: null, error: null };
  },

  async addFamilyMember(
    familyId: string,
    tripId: string,
    userId: string,
    isAdmin = false
  ): Promise<ServiceResult<FamilyMember>> {
    const { data: switched, error: switchError } = await supabase.rpc('switch_family_membership', {
      family_uuid: familyId,
      trip_uuid: tripId,
      member_uuid: userId,
      make_admin: isAdmin,
    });

    if (!switchError) return { data: switched as FamilyMember, error: null };
    if (!isMissingSwitchFunction(switchError)) {
      return { data: null, error: switchError.message };
    }

    await supabase
      .from('family_members')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', userId);

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

  async addFamilyMemberByEmail(
    familyId: string,
    tripId: string,
    email: string,
    isAdmin = false
  ): Promise<ServiceResult<FamilyMember>> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return { data: null, error: 'Email is required' };

    const { data, error } = await supabase.rpc('add_family_member_by_email', {
      family_uuid: familyId,
      trip_uuid: tripId,
      member_email: normalizedEmail,
      make_admin: isAdmin,
    });

    if (error) {
      if (isMissingInviteFunction(error)) {
        return { data: null, error: 'Invite email prepared. Apply the Supabase migration to auto-add existing users by email.' };
      }
      return { data: null, error: error.message };
    }

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
    if (error) return { data: null, error: error.message };
    await supabase
      .from('trip_members')
      .update({ family_id: null })
      .eq('family_id', familyId)
      .eq('user_id', userId);
    return { data: null, error: null };
  },
};
