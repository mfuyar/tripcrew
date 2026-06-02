import { supabase } from '../lib/supabaseClient';
import { Trip, TripMember, ServiceResult } from '../types';

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const tripService = {
  async createTrip(
    userId: string,
    input: Omit<Trip, 'id' | 'created_by' | 'invite_code' | 'is_active' | 'created_at' | 'updated_at'>
  ): Promise<ServiceResult<Trip>> {
    // Reload session from storage — required on web where localStorage is async
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: 'Session expired. Please sign out and sign in again.' };

    // Ensure profile exists before insert (trips.created_by FK → profiles.id)
    await supabase.from('profiles').upsert({
      id: session.user.id,
      email: session.user.email ?? '',
      full_name: session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? '',
    });

    const inviteCode = generateInviteCode();
    const { data, error } = await supabase
      .from('trips')
      .insert({
        ...input,
        created_by: userId,
        invite_code: inviteCode,
        is_active: true,
      })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    // Add creator as trip_organizer member
    await supabase.from('trip_members').insert({
      trip_id: data.id,
      user_id: userId,
      role: 'trip_organizer',
    });
    return { data: data as Trip, error: null };
  },

  async getMyTrips(userId: string): Promise<ServiceResult<Trip[]>> {
    const { data, error } = await supabase
      .from('trip_members')
      .select('trip_id, trips(*)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    const trips = (data ?? []).map((row: Record<string, unknown>) => row.trips).filter(Boolean) as Trip[];
    return { data: trips, error: null };
  },

  async getTripById(tripId: string): Promise<ServiceResult<Trip>> {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Trip, error: null };
  },

  async updateTrip(
    tripId: string,
    updates: Partial<Omit<Trip, 'id' | 'created_by' | 'created_at'>>
  ): Promise<ServiceResult<Trip>> {
    const { data, error } = await supabase
      .from('trips')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', tripId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Trip, error: null };
  },

  async deleteTrip(tripId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase.from('trips').delete().eq('id', tripId);
    return { data: null, error: error?.message ?? null };
  },

  async joinTrip(
    userId: string,
    inviteCode: string
  ): Promise<ServiceResult<Trip>> {
    // Find trip by invite code
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase())
      .single();
    if (tripError || !trip) return { data: null, error: 'Invalid invite code' };
    // Check if already a member
    const { data: existing } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', trip.id)
      .eq('user_id', userId)
      .single();
    if (existing) return { data: trip as Trip, error: null }; // already joined
    // Add as member
    const { error: memberError } = await supabase.from('trip_members').insert({
      trip_id: trip.id,
      user_id: userId,
      role: 'member',
    });
    if (memberError) return { data: null, error: memberError.message };
    return { data: trip as Trip, error: null };
  },

  async getTripMembers(tripId: string): Promise<ServiceResult<TripMember[]>> {
    const { data, error } = await supabase
      .from('trip_members')
      .select('*, profile:profiles(*), family:families(*)')
      .eq('trip_id', tripId);
    if (error) return { data: null, error: error.message };
    return { data: data as TripMember[], error: null };
  },

  async removeMember(
    tripId: string,
    userId: string
  ): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', userId);
    return { data: null, error: error?.message ?? null };
  },
};
