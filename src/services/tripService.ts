import { supabase } from '../lib/supabaseClient';
import { Trip, TripMember, ServiceResult } from '../types';

function generateInviteCode(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) return randomUUID.replace(/-/g, '').slice(0, 8).toUpperCase();

  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0')
    .toUpperCase();
}

export const tripService = {
  async createTrip(
    userId: string,
    input: Omit<Trip, 'id' | 'created_by' | 'invite_code' | 'is_active' | 'created_at' | 'updated_at'>
  ): Promise<ServiceResult<Trip>> {
    // Validate token with server (getUser refreshes expired JWTs, getSession does not)
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !currentUser) {
      return { data: null, error: 'Session expired. Please sign out and sign in again.' };
    }
    if (currentUser.id !== userId) {
      return { data: null, error: 'Cannot create a trip for another user' };
    }

    // Ensure profile exists — prevents FK violation on trips.created_by
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: currentUser.id,
      email: currentUser.email ?? '',
      full_name: currentUser.user_metadata?.full_name ?? currentUser.email?.split('@')[0] ?? '',
    });
    if (profileError) return { data: null, error: profileError.message };

    let data: Trip | null = null;
    let error: { message: string; code?: string } | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const inviteCode = generateInviteCode();
      const result = await supabase
        .from('trips')
        .insert({
          ...input,
          created_by: userId,
          invite_code: inviteCode,
          is_active: true,
        })
        .select()
        .single();

      data = result.data as Trip | null;
      error = result.error;
      if (!error) break;
      if (error.code !== '23505') break;
    }

    if (error) return { data: null, error: error.message };
    if (!data) return { data: null, error: 'Failed to create trip' };

    // Add creator as trip_organizer member
    const { error: memberError } = await supabase.from('trip_members').insert({
      trip_id: data.id,
      user_id: userId,
      role: 'trip_organizer',
    });
    if (memberError) return { data: null, error: memberError.message };
    return { data: data as Trip, error: null };
  },

  async getMyTrips(userId: string): Promise<ServiceResult<Trip[]>> {
    const { data, error } = await supabase
      .from('trip_members')
      .select('trip_id, trips(*, families(id), trip_members(id))')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    const trips = (data ?? [])
      .map((row: Record<string, unknown>) => {
        const trip = row.trips as (Trip & { families?: unknown[]; trip_members?: unknown[] }) | null;
        if (!trip) return null;
        const { families, trip_members, ...rest } = trip;
        return {
          ...rest,
          family_count: families?.length ?? 0,
          member_count: trip_members?.length ?? 0,
        } as Trip;
      })
      .filter(Boolean) as Trip[];
    trips.sort((a, b) => b.start_date.localeCompare(a.start_date));
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
