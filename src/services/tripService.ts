import { supabase } from '../lib/supabaseClient';
import { Trip, TripJoinRequest, TripMember, ServiceResult } from '../types';
import { notificationService } from './notificationService';

function friendlyTripJoinError(message: string): string {
  if (
    message.includes('request_trip_join_by_code')
    || message.includes('Could not find the function')
    || message.includes('schema cache')
  ) {
    return 'Trip access requests need a database update. Please run the latest Supabase migration and try again.';
  }
  return message;
}

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

  async requestJoinTrip(
    userId: string,
    inviteCode: string
  ): Promise<ServiceResult<TripJoinRequest>> {
    const { data, error } = await supabase.rpc('request_trip_join_by_code', {
      p_invite_code: inviteCode.toUpperCase(),
      p_user_id: userId,
    });
    if (error) return { data: null, error: friendlyTripJoinError(error.message) };
    const request = data as TripJoinRequest;

    // Notify all organizers and admins of the trip so they know to review the request
    try {
      const [tripResult, profileResult, managersResult] = await Promise.all([
        supabase.from('trips').select('id, name').eq('id', request.trip_id).single(),
        supabase.from('profiles').select('full_name').eq('id', userId).single(),
        supabase.from('trip_members').select('user_id').eq('trip_id', request.trip_id)
          .in('role', ['trip_organizer', 'trip_admin']),
      ]);
      const tripName = (tripResult.data as any)?.name ?? 'your trip';
      const requesterName = (profileResult.data as any)?.full_name ?? 'Someone';
      const managerIds: string[] = (managersResult.data ?? []).map((m: any) => m.user_id);
      if (managerIds.length > 0) {
        const rows = managerIds.map((managerId) => ({
          user_id: managerId,
          trip_id: request.trip_id,
          type: 'other',
          title: '🙋 New Join Request',
          body: `${requesterName} wants to join "${tripName}". Open Trip Settings to review.`,
          data: { trip_id: request.trip_id, request_id: request.id },
          is_read: false,
        }));
        await supabase.from('notifications').insert(rows);
      }
    } catch { /* notification failure should not block the join request */ }

    return { data: request, error: null };
  },

  async joinTrip(userId: string, inviteCode: string): Promise<ServiceResult<TripJoinRequest>> {
    return this.requestJoinTrip(userId, inviteCode);
  },

  // ── Trip lifecycle ────────────────────────────────────────────────────────

  async hasUnsettledBalances(tripId: string): Promise<boolean> {
    // Check if any family has a non-zero balance (expenses not fully settled)
    const { data } = await supabase
      .from('expenses')
      .select('id')
      .eq('trip_id', tripId)
      .limit(1);
    if (!data?.length) return false;
    // Check for unsettled payment records
    const { data: settled } = await supabase
      .from('settlements')
      .select('id, status')
      .eq('trip_id', tripId)
      .neq('status', 'confirmed');
    return (settled?.length ?? 0) > 0;
  },

  async closeTrip(tripId: string): Promise<ServiceResult<Trip>> {
    const { data, error } = await supabase
      .from('trips')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', tripId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Trip, error: null };
  },

  async archiveTrip(tripId: string): Promise<ServiceResult<Trip>> {
    const { data, error } = await supabase
      .from('trips')
      .update({ status: 'archived' })
      .eq('id', tripId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Trip, error: null };
  },

  async reopenTrip(tripId: string): Promise<ServiceResult<Trip>> {
    const { data, error } = await supabase
      .from('trips')
      .update({ status: 'active', closed_at: null })
      .eq('id', tripId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as Trip, error: null };
  },

  async getMyJoinRequests(userId: string): Promise<ServiceResult<TripJoinRequest[]>> {
    const { data, error } = await supabase
      .from('trip_join_requests')
      .select('*, trip:trips(id, name, destination, start_date, end_date)')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved', 'rejected'])
      .order('requested_at', { ascending: false })
      .limit(20);
    if (error) return { data: null, error: error.message };
    return { data: data as TripJoinRequest[], error: null };
  },

  async cancelJoinRequest(requestId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('trip_join_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId);
    return { data: null, error: error?.message ?? null };
  },

  async getPendingJoinRequests(tripId: string): Promise<ServiceResult<TripJoinRequest[]>> {
    const { data, error } = await supabase
      .from('trip_join_requests')
      .select('*, profile:profiles!user_id(*)')
      .eq('trip_id', tripId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });
    if (error) return { data: null, error: error.message };
    return { data: data as TripJoinRequest[], error: null };
  },

  async reviewJoinRequest(
    requestId: string,
    reviewerId: string,
    status: 'approved' | 'rejected'
  ): Promise<ServiceResult<TripJoinRequest>> {
    const { data, error } = await supabase.rpc('review_trip_join_request', {
      p_request_id: requestId,
      p_reviewer_id: reviewerId,
      p_status: status,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as TripJoinRequest, error: null };
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
    const { error: familyError } = await supabase
      .from('family_members')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', userId);
    if (familyError) return { data: null, error: familyError.message };

    const { error } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', userId);
    return { data: null, error: error?.message ?? null };
  },

  // ── Global admin methods ──────────────────────────────────────────────────

  async getAllTrips(): Promise<ServiceResult<Trip[]>> {
    const { data, error } = await supabase
      .from('trips')
      .select('*, trip_members(id), families(id)')
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    const trips = (data ?? []).map((row: any) => ({
      ...row,
      member_count: row.trip_members?.length ?? 0,
      family_count: row.families?.length ?? 0,
    })) as Trip[];
    return { data: trips, error: null };
  },

  async holdTrip(tripId: string, reason: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('trips')
      .update({ is_held: true, held_reason: reason })
      .eq('id', tripId);
    return { data: null, error: error?.message ?? null };
  },

  async unholdTrip(tripId: string): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('trips')
      .update({ is_held: false, held_reason: null })
      .eq('id', tripId);
    return { data: null, error: error?.message ?? null };
  },

  async setMemberRole(
    tripId: string,
    userId: string,
    role: import('../types').TripRole
  ): Promise<ServiceResult<null>> {
    const { error } = await supabase
      .from('trip_members')
      .update({ role })
      .eq('trip_id', tripId)
      .eq('user_id', userId);
    return { data: null, error: error?.message ?? null };
  },
};
